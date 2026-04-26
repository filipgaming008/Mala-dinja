from __future__ import annotations

import io
import json
import os
import traceback
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Literal

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from fastapi import FastAPI, HTTPException, Query
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response, StreamingResponse
from pydantic import BaseModel, Field, ValidationError, model_validator
from sentinelhub import (
    BBox,
    CRS,
    DataCollection,
    Geometry,
    MimeType,
    SHConfig,
    SentinelHubRequest,
    bbox_to_dimensions,
)

try:
    import rasterio
    from rasterio.transform import from_bounds

    RASTERIO_AVAILABLE = True
except ImportError:
    RASTERIO_AVAILABLE = False


BASE_DIR = Path(__file__).resolve().parent
CACHE_DIR = BASE_DIR / "mago_fusion_cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

RAW_BAND_NAMES = ["B01", "B02", "B03", "B04", "B05", "B08", "B11", "VV", "VH", "SRC_FLAG"]
RAW_BAND_COUNT = len(RAW_BAND_NAMES)

SCAN_MODE_VALUES = {"Daily", "Weekly", "Monthly", "Yearly"}
SCAN_METHOD_VALUES = {"Average daily scenes", "Per-period composite"}
ALLOWED_RESOLUTIONS = {10, 20, 30, 60, 100}


config = SHConfig()
config.sh_client_id = "sh-1314cb54-dac7-46ca-869c-8c37fd193c7d"
config.sh_client_secret = "PjQ6GZXqZVHDLBKhdmI7jIMT7INDoVMo"
config.sh_base_url = "https://sh.dataspace.copernicus.eu"
config.sh_token_url = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"


MAGO_INDICES: dict[str, dict[str, Any]] = {
    "NDCI (Chlorophyll-a)": {
        "min": -0.005,
        "max": 0.05,
        "cmap": "RdYlGn_r",
        "unit": "index",
    },
    "NDTI (Normalized Difference Turbidity Index)": {
        "min": -0.05,
        "max": 0.25,
        "cmap": "YlOrBr",
        "unit": "index",
    },
    "Dogliotti Turbidity (FNU proxy)": {
        "min": 0.0,
        "max": 150.0,
        "cmap": "inferno",
        "unit": "FNU-proxy",
    },
    "TSS (Suspended Solids)": {
        "min": 0.075,
        "max": 0.185,
        "cmap": "YlOrBr",
        "unit": "mg/L-proxy",
    },
    "FAI (Floating Algae Index proxy)": {
        "min": -0.02,
        "max": 0.05,
        "cmap": "RdYlGn",
        "unit": "index",
    },
    "Organic Matter Proxy (Green/Red ratio)": {
        "min": 0.6,
        "max": 1.6,
        "cmap": "PuBuGn",
        "unit": "ratio",
    },
}


class AOIBox(BaseModel):
    min_lon: float = Field(ge=-180, le=180)
    min_lat: float = Field(ge=-90, le=90)
    max_lon: float = Field(ge=-180, le=180)
    max_lat: float = Field(ge=-90, le=90)

    @model_validator(mode="after")
    def validate_bounds(self):
        if self.min_lon >= self.max_lon:
            raise ValueError("min_lon must be lower than max_lon")
        if self.min_lat >= self.max_lat:
            raise ValueError("min_lat must be lower than max_lat")
        return self


class AOIGeometryModel(BaseModel):
    type: Literal["Polygon", "MultiPolygon"]
    coordinates: list


class ExtractRequest(BaseModel):
    box: AOIBox | None = None
    geometry: AOIGeometryModel | None = None
    start_date: date
    end_date: date
    scan_mode: Literal["Daily", "Weekly", "Monthly", "Yearly"] = "Daily"
    scan_method: Literal["Average daily scenes", "Per-period composite"] = "Per-period composite"
    resolution_m: int = Field(default=30)
    cloud_max_pct: float = Field(default=20.0, ge=0, le=100)
    force_refresh: bool = False

    @model_validator(mode="after")
    def validate_request(self):
        if (self.box is None and self.geometry is None) or (self.box is not None and self.geometry is not None):
            raise ValueError("Provide exactly one AOI definition: box or geometry")
        if self.start_date > self.end_date:
            raise ValueError("start_date must be <= end_date")
        if self.resolution_m not in ALLOWED_RESOLUTIONS:
            raise ValueError(f"resolution_m must be one of {sorted(ALLOWED_RESOLUTIONS)}")
        return self


class StatsRequest(BaseModel):
    indicator: str = "NDCI (Chlorophyll-a)"
    files: list[str] | None = None

    @model_validator(mode="after")
    def validate_indicator(self):
        if self.indicator not in MAGO_INDICES:
            raise ValueError(f"Unsupported indicator: {self.indicator}")
        return self


app = FastAPI(
    title="MAGO Extraction API",
    version="1.0.0",
    description=(
        "API for requesting fused data extraction, downloading cached outputs, and collecting statistics "
        "for box or multipolygon AOIs."
    ),
)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "error": "ValidationError",
            "message": "Request validation failed",
            "details": exc.errors(),
        },
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(_, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": "HttpError",
            "message": exc.detail,
        },
    )


@app.exception_handler(Exception)
async def generic_exception_handler(_, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={
            "error": "InternalServerError",
            "message": "Unexpected error while processing request",
            "details": str(exc),
            "trace_id": str(uuid.uuid4()),
        },
    )


def npz_value_to_str(value):
    try:
        if hasattr(value, "item"):
            value = value.item()
    except Exception:
        pass
    return str(value)


def _normalize_polygon_ring(ring):
    if not ring or len(ring) < 3:
        return None
    normalized = []
    for pt in ring:
        if not isinstance(pt, (list, tuple)) or len(pt) < 2:
            raise ValueError("Invalid polygon coordinate point")
        lon = float(pt[0])
        lat = float(pt[1])
        if lon < -180 or lon > 180 or lat < -90 or lat > 90:
            raise ValueError("Coordinates out of WGS84 bounds")
        normalized.append([lon, lat])
    if normalized[0] != normalized[-1]:
        normalized.append(normalized[0])
    if len(normalized) < 4:
        return None
    return normalized


def validate_and_parse_geometry(geometry: AOIGeometryModel):
    polygons = []
    if geometry.type == "Polygon":
        if not geometry.coordinates:
            raise ValueError("Polygon coordinates must not be empty")
        ring = _normalize_polygon_ring(geometry.coordinates[0])
        if not ring:
            raise ValueError("Polygon ring must include at least 3 distinct points")
        polygons.append(ring)
    else:
        if not geometry.coordinates:
            raise ValueError("MultiPolygon coordinates must not be empty")
        for poly in geometry.coordinates:
            if not poly:
                continue
            ring = _normalize_polygon_ring(poly[0])
            if ring:
                polygons.append(ring)

    if not polygons:
        raise ValueError("No valid polygon rings were provided")

    all_lons = [pt[0] for poly in polygons for pt in poly]
    all_lats = [pt[1] for poly in polygons for pt in poly]
    bbox = [min(all_lons), min(all_lats), max(all_lons), max(all_lats)]

    if len(polygons) == 1:
        geojson = {"type": "Polygon", "coordinates": [polygons[0]]}
    else:
        geojson = {"type": "MultiPolygon", "coordinates": [[poly] for poly in polygons]}
    return bbox, geojson


def build_aoi(extract_request: ExtractRequest):
    if extract_request.box is not None:
        box = extract_request.box
        bbox = [box.min_lon, box.min_lat, box.max_lon, box.max_lat]
        return bbox, None

    try:
        return validate_and_parse_geometry(extract_request.geometry)
    except (ValueError, ValidationError) as exc:
        raise HTTPException(status_code=422, detail=f"Invalid geometry: {exc}") from exc


def get_season_name(date_value: datetime) -> str:
    if date_value.month in (12, 1, 2):
        return "Winter"
    if date_value.month in (3, 4, 5):
        return "Spring"
    if date_value.month in (6, 7, 8):
        return "Summer"
    return "Autumn"


def get_scan_period_key(date_value: datetime, scan_mode: str) -> str:
    if scan_mode == "Daily":
        return date_value.strftime("%Y-%m-%d")
    if scan_mode == "Weekly":
        start_of_week = date_value - timedelta(days=date_value.weekday())
        end_of_week = start_of_week + timedelta(days=6)
        return f"week_{start_of_week.strftime('%Y-%m-%d')}_to_{end_of_week.strftime('%Y-%m-%d')}"
    if scan_mode == "Monthly":
        return date_value.strftime("%Y-%m")
    return date_value.strftime("%Y")


def get_period_ranges(start_dt: datetime, end_dt: datetime, scan_mode: str):
    ranges = []

    if scan_mode == "Daily":
        cursor = start_dt
        while cursor <= end_dt:
            key = get_scan_period_key(cursor, scan_mode)
            ranges.append((key, cursor, cursor))
            cursor += timedelta(days=1)
        return ranges

    if scan_mode == "Weekly":
        cursor = start_dt - timedelta(days=start_dt.weekday())
        while cursor <= end_dt:
            week_start = max(cursor, start_dt)
            week_end = min(cursor + timedelta(days=6), end_dt)
            key = get_scan_period_key(week_start, scan_mode)
            ranges.append((key, week_start, week_end))
            cursor += timedelta(days=7)
        return ranges

    if scan_mode == "Monthly":
        cursor = datetime(start_dt.year, start_dt.month, 1)
        while cursor <= end_dt:
            if cursor.month == 12:
                next_month = datetime(cursor.year + 1, 1, 1)
            else:
                next_month = datetime(cursor.year, cursor.month + 1, 1)
            month_start = max(cursor, start_dt)
            month_end = min(next_month - timedelta(days=1), end_dt)
            key = get_scan_period_key(month_start, scan_mode)
            ranges.append((key, month_start, month_end))
            cursor = next_month
        return ranges

    cursor = datetime(start_dt.year, 1, 1)
    while cursor <= end_dt:
        next_year = datetime(cursor.year + 1, 1, 1)
        year_start = max(cursor, start_dt)
        year_end = min(next_year - timedelta(days=1), end_dt)
        key = get_scan_period_key(year_start, scan_mode)
        ranges.append((key, year_start, year_end))
        cursor = next_year
    return ranges


def get_scan_filename(
    scan_mode: str,
    period_key: str,
    scan_method: str,
    resolution_m: int,
    cloud_max_pct: float,
) -> str:
    method_slug = "daily_avg" if scan_method == "Average daily scenes" else "period_comp"
    return (
        f"fused_{scan_mode.lower()}_{method_slug}_r{resolution_m}m_"
        f"c{int(cloud_max_pct)}_{period_key}.npz"
    )


def get_collections():
    try:
        s2_col = DataCollection.SENTINEL2_L2A.define_from(
            "SENTINEL-2-L2A-CDSE",
            api_id="sentinel-2-l2a",
            service_url=config.sh_base_url,
        )
    except ValueError:
        s2_col = DataCollection.from_id("sentinel-2-l2a")

    try:
        l8_col = DataCollection.SENTINEL2_L2A.define_from(
            "LANDSAT-OT-L1-CDSE",
            api_id="landsat-ot-l1",
            service_url=config.sh_base_url,
        )
    except ValueError:
        l8_col = DataCollection.from_id("landsat-ot-l1")

    try:
        s1_col = DataCollection.SENTINEL2_L2A.define_from(
            "SENTINEL-1-GRD-CDSE",
            api_id="sentinel-1-grd",
            service_url=config.sh_base_url,
        )
    except ValueError:
        s1_col = DataCollection.from_id("sentinel-1-grd")

    return s2_col, l8_col, s1_col


def build_fusion_request(
    aoi: BBox,
    time_range: tuple[str, str],
    size: tuple[int, int],
    max_cloud_pct: float,
    aoi_geometry=None,
) -> SentinelHubRequest:
    s2_col, l8_col, s1_col = get_collections()
    maxcc = max(0.0, min(1.0, max_cloud_pct / 100.0))

    evalscript = """
    //VERSION=3
    function setup() {
        return {
            input: [
                { datasource: "S2", bands: ["B01", "B02", "B03", "B04", "B05", "B08", "B11", "SCL", "dataMask"] },
                { datasource: "L8", bands: ["B01", "B02", "B03", "B04", "B05", "BQA", "dataMask"] },
                { datasource: "S1", bands: ["VV", "VH", "dataMask"] }
            ],
            output: { bands: 13, sampleType: "FLOAT32" }
        };
    }

    function evaluatePixel(samples) {
        let cloudyWater = 0;
        let waterFlag = 0;

        if (samples.S2 && samples.S2.length > 0) {
            let s2d = samples.S2[0];
            if (s2d.dataMask > 0) {
                let ndwi0 = (s2d.B03 - s2d.B11) / (s2d.B03 + s2d.B11);
                if (ndwi0 > 0.0) {
                    waterFlag = 1;
                    if ([3, 8, 9, 10].includes(s2d.SCL)) cloudyWater = 1;
                }
            }
        }

        if (samples.L8 && samples.L8.length > 0) {
            let l8d = samples.L8[0];
            if (l8d.dataMask > 0) {
                let ndwi_l0 = (l8d.B03 - l8d.B01) / (l8d.B03 + l8d.B01);
                if (ndwi_l0 > 0.0) {
                    waterFlag = 1;
                    if (l8d.BQA & (1 << 4)) cloudyWater = 1;
                }
            }
        }

        if (samples.S2 && samples.S2.length > 0) {
            for (let i = 0; i < samples.S2.length; i++) {
                let s2 = samples.S2[i];
                if (s2.dataMask > 0 && ![1, 3, 8, 9, 10, 11].includes(s2.SCL)) {
                    let ndwi = (s2.B03 - s2.B11) / (s2.B03 + s2.B11);
                    if (ndwi > 0.0) {
                        return [s2.B01, s2.B02, s2.B03, s2.B04, s2.B05, s2.B08, s2.B11, 0, 0, 0, 1, waterFlag, cloudyWater];
                    }
                }
            }
        }

        if (samples.L8 && samples.L8.length > 0) {
            for (let i = 0; i < samples.L8.length; i++) {
                let l8 = samples.L8[i];
                if (l8.dataMask > 0 && !(l8.BQA & (1 << 4))) {
                    let ndwi_l = (l8.B03 - l8.B01) / (l8.B03 + l8.B01);
                    if (ndwi_l > 0.0) {
                        return [l8.B01, l8.B02, l8.B03, l8.B04, l8.B05, 0, 0, 0, 0, 0, 1, waterFlag, cloudyWater];
                    }
                }
            }
        }

        if (waterFlag == 1 && cloudyWater == 1 && samples.S1 && samples.S1.length > 0) {
            let r = samples.S1[0];
            if (r.dataMask > 0) {
                let vv = Math.max(r.VV, 0);
                let vh = Math.max(r.VH, 0);
                return [
                    0.02 + 0.30 * vv,
                    0.02 + 0.25 * vv,
                    0.03 + 0.35 * vv,
                    0.03 + 0.45 * vv,
                    0.03 + 0.55 * vh,
                    0.04 + 0.60 * vh,
                    0.03 + 0.50 * vv,
                    vv,
                    vh,
                    1,
                    1,
                    waterFlag,
                    cloudyWater
                ];
            }
        }

        return [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, waterFlag, cloudyWater];
    }
    """

    return SentinelHubRequest(
        evalscript=evalscript,
        input_data=[
            SentinelHubRequest.input_data(
                data_collection=s2_col,
                time_interval=time_range,
                identifier="S2",
                maxcc=maxcc,
            ),
            SentinelHubRequest.input_data(
                data_collection=l8_col,
                time_interval=time_range,
                identifier="L8",
                maxcc=maxcc,
            ),
            SentinelHubRequest.input_data(
                data_collection=s1_col,
                time_interval=time_range,
                identifier="S1",
            ),
        ],
        responses=[SentinelHubRequest.output_response("default", MimeType.TIFF)],
        bbox=aoi,
        geometry=aoi_geometry,
        size=size,
        config=config,
    )


def save_cached_output(
    base_file: str,
    raw_stack: np.ndarray,
    mask: np.ndarray,
    bbox: list[float],
    metadata: dict,
    aoi_geojson: dict | None = None,
):
    npz_path = CACHE_DIR / base_file
    aoi_geojson_json = json.dumps(aoi_geojson) if aoi_geojson else ""
    np.savez_compressed(
        npz_path,
        raw_stack=raw_stack.astype(np.float32),
        mask=mask.astype(np.float32),
        bbox=bbox,
        aoi_geojson_json=aoi_geojson_json,
        pixel_height=int(raw_stack.shape[0]),
        pixel_width=int(raw_stack.shape[1]),
        aoi_polygon_count=len(aoi_geojson.get("coordinates", [])) if aoi_geojson else 0,
        **metadata,
    )

    tif_path = None
    if RASTERIO_AVAILABLE:
        tif_path = Path(str(npz_path).replace(".npz", ".tif"))
        minx, miny, maxx, maxy = [float(v) for v in bbox]
        height, width = raw_stack.shape[:2]
        transform = from_bounds(minx, miny, maxx, maxy, width, height)

        with rasterio.open(
            tif_path,
            "w",
            driver="GTiff",
            width=width,
            height=height,
            count=RAW_BAND_COUNT + 1,
            dtype="float32",
            crs="EPSG:4326",
            transform=transform,
            compress="deflate",
        ) as dst:
            for idx, band_name in enumerate(RAW_BAND_NAMES, start=1):
                dst.write(raw_stack[:, :, idx - 1].astype(np.float32), idx)
                dst.set_band_description(idx, band_name)
            dst.write(mask.astype(np.float32), RAW_BAND_COUNT + 1)
            dst.set_band_description(RAW_BAND_COUNT + 1, "mask")

    return npz_path, tif_path


def save_period_buffer(period_file: str, buffer: dict, bbox: list[float], aoi_geojson: dict | None = None):
    count = buffer["count"]
    with np.errstate(divide="ignore", invalid="ignore"):
        avg_stack = np.divide(buffer["raw_sum"], count[:, :, None], where=count[:, :, None] > 0)
    avg_stack[count == 0] = 0
    mask = (count > 0).astype(np.float32)

    metadata = {
        "scan_start": buffer["scan_start"].strftime("%Y-%m-%d"),
        "scan_end": buffer["scan_end"].strftime("%Y-%m-%d"),
        "scan_mode": buffer["scan_mode"],
        "scan_method": buffer["scan_method"],
        "resolution_m": buffer["resolution_m"],
        "cloud_max_pct": buffer["cloud_max_pct"],
        "s2_cloudy_water_pct": round(
            100.0 * buffer["s2_cloudy_water_sum"] / buffer["s2_water_sum"] if buffer["s2_water_sum"] > 0 else 0.0,
            2,
        ),
        "s1_fill_pct": round(
            100.0 * buffer["s1_fill_sum"] / buffer["count_sum"] if buffer["count_sum"] > 0 else 0.0,
            2,
        ),
    }
    return save_cached_output(period_file, avg_stack, mask, bbox, metadata, aoi_geojson=aoi_geojson)


def compute_indicator_from_raw(raw_stack: np.ndarray, selected_idx: str) -> np.ndarray:
    if raw_stack.ndim != 3 or raw_stack.shape[2] < 7:
        return np.zeros(raw_stack.shape[:2], dtype=np.float32)

    def band(idx: int, fallback: np.ndarray) -> np.ndarray:
        return raw_stack[:, :, idx] if raw_stack.shape[2] > idx else fallback

    b02 = raw_stack[:, :, 1]
    b03 = raw_stack[:, :, 2]
    b04 = raw_stack[:, :, 3]
    b05 = raw_stack[:, :, 4]
    b08 = raw_stack[:, :, 5]
    b11 = raw_stack[:, :, 6]
    vv = band(7, np.zeros_like(b03))
    vh = band(8, np.zeros_like(b03))
    src_flag = band(9, np.zeros_like(b03))

    with np.errstate(divide="ignore", invalid="ignore"):
        nd_s1 = (vv - vh) / (vv + vh + 1e-6)

        if selected_idx == "NDCI (Chlorophyll-a)":
            val_opt = (b05 - b04) / (b05 + b04)
            val_s1 = -nd_s1
            val = np.where(src_flag > 0.5, val_s1, val_opt)
        elif selected_idx == "NDTI (Normalized Difference Turbidity Index)":
            val_opt = (b04 - b03) / (b04 + b03)
            val_s1 = nd_s1
            val = np.where(src_flag > 0.5, val_s1, val_opt)
        elif selected_idx == "Dogliotti Turbidity (FNU proxy)":
            val_opt = np.where(b04 < 0.05, 228.1 * b04 / (1 - (b04 / 0.1686)), 3078.9 * b08 / (1 - (b08 / 0.2112)))
            val_s1 = np.maximum(0.0, 120.0 * vv + 60.0 * vh)
            val = np.where(src_flag > 0.5, val_s1, val_opt)
        elif selected_idx == "TSS (Suspended Solids)":
            val_opt = 25.08 * (b03 / b02) + 16.336
            val_s1 = np.maximum(0.0, 80.0 * vv + 20.0 * vh)
            val = np.where(src_flag > 0.5, val_s1, val_opt)
        elif selected_idx == "FAI (Floating Algae Index proxy)":
            val_opt = b08 - (b04 + (b11 - b04) * ((0.833 - 0.665) / (1.61 - 0.665)))
            val_s1 = vh - vv
            val = np.where(src_flag > 0.5, val_s1, val_opt)
        elif selected_idx == "Organic Matter Proxy (Green/Red ratio)":
            val_opt = b03 / b04
            val_s1 = (vv + 1e-3) / (vh + 1e-3)
            val = np.where(src_flag > 0.5, val_s1, val_opt)
        else:
            val = np.zeros_like(b03)

    return np.nan_to_num(val, nan=0.0, posinf=0.0, neginf=0.0).astype(np.float32)


def summarize_indicator(values: np.ndarray, mask: np.ndarray):
    valid = values[mask > 0]
    if valid.size == 0:
        return {
            "count": 0,
            "mean": None,
            "median": None,
            "std": None,
            "min": None,
            "max": None,
            "p10": None,
            "p90": None,
        }

    return {
        "count": int(valid.size),
        "mean": float(np.mean(valid)),
        "median": float(np.median(valid)),
        "std": float(np.std(valid)),
        "min": float(np.min(valid)),
        "max": float(np.max(valid)),
        "p10": float(np.percentile(valid, 10)),
        "p90": float(np.percentile(valid, 90)),
    }


def load_cache_entries():
    entries = []
    for filename in sorted(os.listdir(CACHE_DIR)):
        if not filename.endswith(".npz") or not filename.startswith("fused_"):
            continue
        path = CACHE_DIR / filename
        try:
            raw = np.load(path, allow_pickle=True)
            entries.append(
                {
                    "file": filename,
                    "scan_mode": npz_value_to_str(raw["scan_mode"]) if "scan_mode" in raw else "unknown",
                    "scan_method": npz_value_to_str(raw["scan_method"]) if "scan_method" in raw else "unknown",
                    "scan_start": npz_value_to_str(raw["scan_start"]) if "scan_start" in raw else "-",
                    "scan_end": npz_value_to_str(raw["scan_end"]) if "scan_end" in raw else "-",
                    "resolution_m": int(raw["resolution_m"]) if "resolution_m" in raw else -1,
                    "cloud_max_pct": int(raw["cloud_max_pct"]) if "cloud_max_pct" in raw else -1,
                    "s2_cloudy_water_pct": float(raw["s2_cloudy_water_pct"]) if "s2_cloudy_water_pct" in raw else -1.0,
                    "s1_fill_pct": float(raw["s1_fill_pct"]) if "s1_fill_pct" in raw else -1.0,
                    "bbox": raw["bbox"].tolist() if "bbox" in raw else None,
                    "pixel_width": int(raw["pixel_width"]) if "pixel_width" in raw else -1,
                    "pixel_height": int(raw["pixel_height"]) if "pixel_height" in raw else -1,
                    "aoi_polygon_count": int(raw["aoi_polygon_count"]) if "aoi_polygon_count" in raw else 0,
                    "size_mb": round(os.path.getsize(path) / (1024 * 1024), 2),
                    "has_tif": Path(str(path).replace(".npz", ".tif")).exists(),
                    "has_raw_stack": "raw_stack" in raw,
                }
            )
        except Exception:
            continue
    return entries


def compute_seasonal_summary(files: list[str], selected_idx: str):
    seasonal_values = {}
    for filename in files:
        path = CACHE_DIR / filename
        if not path.exists():
            continue

        try:
            raw = np.load(path, allow_pickle=True)
            if "raw_stack" not in raw or "mask" not in raw:
                continue
            vals = compute_indicator_from_raw(raw["raw_stack"], selected_idx)
            valid = vals[raw["mask"] > 0]
            if valid.size == 0:
                continue

            ref_date = datetime.strptime(npz_value_to_str(raw["scan_end"]), "%Y-%m-%d") if "scan_end" in raw else datetime.now()
            season = get_season_name(ref_date)
            key = (str(ref_date.year), season)
            seasonal_values.setdefault(key, []).append(float(np.mean(valid)))
        except Exception:
            continue

    order = {"Winter": 0, "Spring": 1, "Summer": 2, "Autumn": 3}
    rows = []
    for (year, season), means in seasonal_values.items():
        rows.append(
            {
                "year": year,
                "season": season,
                "mean": round(float(np.mean(means)), 6),
                "samples": len(means),
            }
        )
    rows.sort(key=lambda row: (row["year"], order.get(row["season"], 99)))
    return rows


def run_extraction(req: ExtractRequest):
    bbox, aoi_geojson = build_aoi(req)
    aoi_bbox = BBox(bbox=bbox, crs=CRS.WGS84)
    aoi_geometry = Geometry(aoi_geojson, CRS.WGS84) if aoi_geojson else None
    size = bbox_to_dimensions(aoi_bbox, req.resolution_m)

    start_dt = datetime.combine(req.start_date, datetime.min.time())
    end_dt = datetime.combine(req.end_date, datetime.min.time())
    period_ranges = get_period_ranges(start_dt, end_dt, req.scan_mode)

    cache_hits = 0
    produced = []
    failed = []
    skipped_cloudy = 0

    for period_key, period_start, period_end in period_ranges:
        period_file = get_scan_filename(
            req.scan_mode,
            period_key,
            req.scan_method,
            req.resolution_m,
            req.cloud_max_pct,
        )
        full_path = CACHE_DIR / period_file
        if full_path.exists() and not req.force_refresh:
            cache_hits += 1
            produced.append(period_file)
            continue

        if req.scan_method == "Average daily scenes":
            buffer = None
            cursor = period_start
            while cursor <= period_end:
                d_str = cursor.strftime("%Y-%m-%d")
                try:
                    req_obj = build_fusion_request(
                        aoi_bbox,
                        (d_str, d_str),
                        size,
                        req.cloud_max_pct,
                        aoi_geometry,
                    )
                    res_data = req_obj.get_data()[0]
                    raw_stack = res_data[:, :, :RAW_BAND_COUNT]
                    mask = res_data[:, :, RAW_BAND_COUNT]
                    s2_water = float(np.sum(res_data[:, :, RAW_BAND_COUNT + 1]))
                    s2_cloudy_water = float(np.sum(res_data[:, :, RAW_BAND_COUNT + 2]))
                    s1_fill = float(np.sum(raw_stack[:, :, 9] > 0.5))
                    cloudy_pct = (100.0 * s2_cloudy_water / s2_water) if s2_water > 0 else 0.0
                    if cloudy_pct > req.cloud_max_pct:
                        skipped_cloudy += 1
                        cursor += timedelta(days=1)
                        continue

                    if buffer is None:
                        buffer = {
                            "raw_sum": np.zeros_like(raw_stack, dtype=np.float32),
                            "count": np.zeros_like(mask, dtype=np.float32),
                            "scan_start": period_start,
                            "scan_end": period_end,
                            "scan_mode": req.scan_mode,
                            "scan_method": req.scan_method,
                            "resolution_m": req.resolution_m,
                            "cloud_max_pct": int(req.cloud_max_pct),
                            "s2_water_sum": 0.0,
                            "s2_cloudy_water_sum": 0.0,
                            "s1_fill_sum": 0.0,
                            "count_sum": 0.0,
                        }
                    buffer["raw_sum"] += np.where(mask[:, :, None] > 0, raw_stack, 0)
                    buffer["count"] += (mask > 0).astype(np.float32)
                    buffer["s2_water_sum"] += s2_water
                    buffer["s2_cloudy_water_sum"] += s2_cloudy_water
                    buffer["s1_fill_sum"] += s1_fill
                    buffer["count_sum"] += float(np.sum(mask > 0))
                except Exception as exc:
                    failed.append({"period": period_key, "date": d_str, "error": str(exc)})
                cursor += timedelta(days=1)

            if buffer is not None:
                save_period_buffer(period_file, buffer, bbox, aoi_geojson=aoi_geojson)
                produced.append(period_file)
            continue

        try:
            req_obj = build_fusion_request(
                aoi_bbox,
                (period_start.strftime("%Y-%m-%d"), period_end.strftime("%Y-%m-%d")),
                size,
                req.cloud_max_pct,
                aoi_geometry,
            )
            res_data = req_obj.get_data()[0]
            raw_stack = res_data[:, :, :RAW_BAND_COUNT]
            mask = res_data[:, :, RAW_BAND_COUNT]
            s2_water = float(np.sum(res_data[:, :, RAW_BAND_COUNT + 1]))
            s2_cloudy_water = float(np.sum(res_data[:, :, RAW_BAND_COUNT + 2]))
            s1_fill = float(np.sum(raw_stack[:, :, 9] > 0.5))
            cloudy_pct = (100.0 * s2_cloudy_water / s2_water) if s2_water > 0 else 0.0
            if cloudy_pct > req.cloud_max_pct:
                skipped_cloudy += 1
                continue

            if np.max(mask) > 0:
                metadata = {
                    "scan_start": period_start.strftime("%Y-%m-%d"),
                    "scan_end": period_end.strftime("%Y-%m-%d"),
                    "scan_mode": req.scan_mode,
                    "scan_method": req.scan_method,
                    "resolution_m": req.resolution_m,
                    "cloud_max_pct": int(req.cloud_max_pct),
                    "s2_cloudy_water_pct": round(cloudy_pct, 2),
                    "s1_fill_pct": round(100.0 * s1_fill / float(np.sum(mask > 0)), 2) if float(np.sum(mask > 0)) > 0 else 0.0,
                }
                save_cached_output(period_file, raw_stack, mask, bbox, metadata, aoi_geojson=aoi_geojson)
                produced.append(period_file)
        except Exception as exc:
            failed.append(
                {
                    "period": period_key,
                    "range": [period_start.strftime("%Y-%m-%d"), period_end.strftime("%Y-%m-%d")],
                    "error": str(exc),
                    "trace": traceback.format_exc(limit=2),
                }
            )

    return {
        "bbox": bbox,
        "periods_total": len(period_ranges),
        "cache_hits": cache_hits,
        "produced_files": produced,
        "skipped_cloudy": skipped_cloudy,
        "failures": failed,
    }


def stats_for_file(filename: str, indicator: str):
    path = CACHE_DIR / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Cache file not found: {filename}")

    raw = np.load(path, allow_pickle=True)
    if "raw_stack" not in raw or "mask" not in raw:
        raise HTTPException(status_code=400, detail=f"File {filename} does not contain raw_stack/mask")

    values = compute_indicator_from_raw(raw["raw_stack"], indicator)
    summary = summarize_indicator(values, raw["mask"])
    summary["indicator"] = indicator
    summary["file"] = filename
    return summary


def render_preview_png(filename: str, indicator: str, min_v: float, max_v: float) -> bytes:
    path = CACHE_DIR / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Cache file not found: {filename}")

    raw = np.load(path, allow_pickle=True)
    if "raw_stack" not in raw or "mask" not in raw:
        raise HTTPException(status_code=400, detail=f"File {filename} does not contain raw_stack/mask")

    values = compute_indicator_from_raw(raw["raw_stack"], indicator)
    mask = raw["mask"]

    norm = plt.Normalize(min_v, max_v)
    cmap = plt.get_cmap(MAGO_INDICES[indicator]["cmap"])
    rgba = cmap(norm(values))
    rgba[mask == 0, 3] = 0.0

    fig = plt.figure(figsize=(6, 6), dpi=150)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.imshow(rgba)
    ax.axis("off")

    buffer = io.BytesIO()
    fig.savefig(buffer, format="png", transparent=True, bbox_inches="tight", pad_inches=0)
    plt.close(fig)
    return buffer.getvalue()


@app.get("/health")
def health():
    return {
        "ok": True,
        "service": "MAGO Extraction API",
        "cache_dir": str(CACHE_DIR),
        "rasterio_available": RASTERIO_AVAILABLE,
    }


@app.get("/api/v1/indicators")
def indicators():
    return {"indicators": MAGO_INDICES}


@app.get("/api/v1/cache")
def list_cache():
    return {"entries": load_cache_entries()}


@app.post("/api/v1/extract")
def extract_data(payload: ExtractRequest):
    result = run_extraction(payload)
    seasonal = compute_seasonal_summary(result["produced_files"], "NDCI (Chlorophyll-a)")
    return {
        "request": payload.model_dump(),
        "result": result,
        "seasonal_summary_ndci": seasonal,
        "download": {
            "files": [
                {
                    "file": f,
                    "npz_url": f"/api/v1/cache/{f}/download?format=npz",
                    "tif_url": f"/api/v1/cache/{f}/download?format=tif",
                    "stats_url": f"/api/v1/cache/{f}/stats?indicator=NDCI%20(Chlorophyll-a)",
                }
                for f in result["produced_files"]
            ]
        },
    }


@app.get("/api/v1/cache/{filename}/stats")
def file_stats(filename: str, indicator: str = Query(default="NDCI (Chlorophyll-a)")):
    if indicator not in MAGO_INDICES:
        raise HTTPException(status_code=422, detail=f"Unsupported indicator: {indicator}")
    return stats_for_file(filename, indicator)


@app.get("/api/v1/cache/{filename}/preview")
def file_preview(
    filename: str,
    indicator: str = Query(default="NDCI (Chlorophyll-a)"),
    min_v: float | None = Query(default=None),
    max_v: float | None = Query(default=None),
):
    if indicator not in MAGO_INDICES:
        raise HTTPException(status_code=422, detail=f"Unsupported indicator: {indicator}")

    min_use = MAGO_INDICES[indicator]["min"] if min_v is None else min_v
    max_use = MAGO_INDICES[indicator]["max"] if max_v is None else max_v
    if min_use >= max_use:
        raise HTTPException(status_code=422, detail="min_v must be lower than max_v")

    png = render_preview_png(filename, indicator, min_use, max_use)
    return Response(content=png, media_type="image/png")


@app.get("/api/v1/cache/{filename}/download")
def download_cache_file(filename: str, format: Literal["npz", "tif"] = "npz"):
    npz_path = CACHE_DIR / filename
    if not npz_path.exists():
        raise HTTPException(status_code=404, detail=f"Cache file not found: {filename}")

    if format == "npz":
        target = npz_path
        media_type = "application/octet-stream"
    else:
        if not filename.endswith(".npz"):
            raise HTTPException(status_code=400, detail="For GeoTIFF download, filename must be an .npz cache id")
        target = Path(str(npz_path).replace(".npz", ".tif"))
        if not target.exists():
            raise HTTPException(status_code=404, detail="GeoTIFF sidecar not found for this cache entry")
        media_type = "image/tiff"

    return StreamingResponse(
        iter([target.read_bytes()]),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{target.name}"'},
    )


@app.post("/api/v1/statistics")
def statistics(payload: StatsRequest):
    files = payload.files
    if not files:
        files = [entry["file"] for entry in load_cache_entries()]

    results = []
    for filename in files:
        try:
            results.append(stats_for_file(filename, payload.indicator))
        except HTTPException:
            continue

    seasonal = compute_seasonal_summary([row["file"] for row in results], payload.indicator)
    return {
        "indicator": payload.indicator,
        "rows": results,
        "seasonal": seasonal,
        "count": len(results),
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="127.0.0.1", port=8001, reload=False)
