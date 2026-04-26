import os
import json
import shutil
from datetime import datetime, timedelta

import folium
import matplotlib.pyplot as plt
import numpy as np
import streamlit as st
from folium.plugins import Draw

try:
    import rasterio
    from rasterio.transform import from_bounds

    RASTERIO_AVAILABLE = True
except ImportError:
    RASTERIO_AVAILABLE = False

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
from streamlit_folium import st_folium

# ==========================================
# CONFIGURATION & CONSTANTS
# ==========================================
st.set_page_config(page_title="MAGO Fusion Lab v17", layout="wide", page_icon="🛰️")

CACHE_DIR = "mago_fusion_cache"
os.makedirs(CACHE_DIR, exist_ok=True)

RAW_BAND_NAMES = ["B01", "B02", "B03", "B04", "B05", "B08", "B11", "VV", "VH", "SRC_FLAG"]
RAW_BAND_COUNT = len(RAW_BAND_NAMES)

# Sentinel Hub Configuration (CDSE)
config = SHConfig()
config.sh_client_id = "sh-1314cb54-dac7-46ca-869c-8c37fd193c7d"
config.sh_client_secret = "PjQ6GZXqZVHDLBKhdmI7jIMT7INDoVMo"
config.sh_base_url = "https://sh.dataspace.copernicus.eu"
config.sh_token_url = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"

# Water quality indicators (well-defined spectral indices / proxies)
MAGO_INDICES = {
    "NDCI (Chlorophyll-a)": {
        "min": -0.005,
        "max": 0.05,
        "cmap": "RdYlGn_r",
        "unit": "index",
        "description": "Chlorophyll-a proxy (Mishra & Mishra, 2012).",
    },
    "NDTI (Normalized Difference Turbidity Index)": {
        "min": -0.05,
        "max": 0.25,
        "cmap": "YlOrBr",
        "unit": "index",
        "description": "Turbidity proxy from red-green contrast.",
    },
    "Dogliotti Turbidity (FNU proxy)": {
        "min": 0.0,
        "max": 150.0,
        "cmap": "inferno",
        "unit": "FNU-proxy",
        "description": "Dogliotti et al. style single/dual-band turbidity model.",
    },
    "TSS (Suspended Solids)": {
        "min": 0.075,
        "max": 0.185,
        "cmap": "YlOrBr",
        "unit": "mg/L-proxy",
        "description": "Suspended particulate matter proxy from blue-green ratio.",
    },
    "FAI (Floating Algae Index proxy)": {
        "min": -0.02,
        "max": 0.05,
        "cmap": "RdYlGn",
        "unit": "index",
        "description": "Floating algae/scum bloom tendency proxy.",
    },
    "Organic Matter Proxy (Green/Red ratio)": {
        "min": 0.6,
        "max": 1.6,
        "cmap": "PuBuGn",
        "unit": "ratio",
        "description": "Colored dissolved/organic matter tendency proxy.",
    },
}


# ==========================================
# DATA COLLECTIONS
# ==========================================
@st.cache_resource
def get_collections():
    """Defines and returns S2, L8 and S1 collections tailored for CDSE."""
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


# ==========================================
# STATE MANAGEMENT
# ==========================================
def init_state():
    defaults = {
        "bbox": None,
        "aoi_geojson": None,
        "aoi_all_polygons": [],
        "aoi_selected_ids": [],
        "review_cache_file": None,
        "map_center": [40.42, 17.22],
        "map_zoom": 11,
        "thresholds": {},
        "cloud_max_pct": 20.0,
    }
    for key, val in defaults.items():
        if key not in st.session_state:
            st.session_state[key] = val


def init_threshold_state(selected_idx: str):
    if selected_idx not in st.session_state.thresholds:
        st.session_state.thresholds[selected_idx] = {
            "min": MAGO_INDICES[selected_idx]["min"],
            "max": MAGO_INDICES[selected_idx]["max"],
        }


def get_threshold_keys(selected_idx: str):
    return f"min_{selected_idx}", f"max_{selected_idx}"


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


def _normalize_polygon_ring(ring):
    if not ring or len(ring) < 3:
        return None
    norm = [[float(pt[0]), float(pt[1])] for pt in ring]
    if norm[0] != norm[-1]:
        norm.append(norm[0])
    if len(norm) < 4:
        return None
    return norm


def extract_polygons_from_drawings(drawings):
    polygons = []
    for feat in drawings or []:
        geom = feat.get("geometry", {}) if isinstance(feat, dict) else {}
        gtype = geom.get("type")
        coords = geom.get("coordinates", [])

        if gtype == "Polygon" and coords:
            ring = _normalize_polygon_ring(coords[0])
            if ring:
                polygons.append(ring)
        elif gtype == "MultiPolygon" and coords:
            for poly in coords:
                if not poly:
                    continue
                ring = _normalize_polygon_ring(poly[0])
                if ring:
                    polygons.append(ring)
    return polygons


def build_aoi_from_polygons(polygons):
    if not polygons:
        return None, None

    all_lons = [pt[0] for poly in polygons for pt in poly]
    all_lats = [pt[1] for poly in polygons for pt in poly]
    bbox = [min(all_lons), min(all_lats), max(all_lons), max(all_lats)]

    if len(polygons) == 1:
        geojson = {"type": "Polygon", "coordinates": [polygons[0]]}
    else:
        geojson = {"type": "MultiPolygon", "coordinates": [[poly] for poly in polygons]}
    return bbox, geojson


def bbox_intersects(a, b):
    if not a or not b:
        return False
    return not (
        a[2] < b[0]
        or a[0] > b[2]
        or a[3] < b[1]
        or a[1] > b[3]
    )


def build_aoi_from_drawings(drawings):
    return build_aoi_from_polygons(extract_polygons_from_drawings(drawings))


def sync_active_aoi_selection():
    polygons = st.session_state.get("aoi_all_polygons", [])
    if not polygons:
        st.session_state.aoi_selected_ids = []
        st.session_state.bbox = None
        st.session_state.aoi_geojson = None
        return

    options = [f"AOI {i + 1}" for i in range(len(polygons))]
    selected = [a for a in st.session_state.get("aoi_selected_ids", []) if a in options]
    if not selected:
        selected = options

    selected_idx = [int(label.split(" ")[-1]) - 1 for label in selected]
    selected_polygons = [polygons[i] for i in selected_idx if 0 <= i < len(polygons)]
    bbox, geojson = build_aoi_from_polygons(selected_polygons)

    st.session_state.aoi_selected_ids = selected
    st.session_state.bbox = bbox
    st.session_state.aoi_geojson = geojson


def npz_value_to_str(value):
    try:
        if hasattr(value, "item"):
            value = value.item()
    except Exception:
        pass
    return str(value)


def compute_indicator_from_raw(raw_stack: np.ndarray, selected_idx: str) -> np.ndarray:
    # Backward compatibility: older cache entries may only store 7 optical bands.
    if raw_stack.ndim != 3 or raw_stack.shape[2] < 7:
        return np.zeros(raw_stack.shape[:2], dtype=np.float32)

    def band(idx: int, fallback: np.ndarray) -> np.ndarray:
        return raw_stack[:, :, idx] if raw_stack.shape[2] > idx else fallback

    b01 = raw_stack[:, :, 0]
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

    with np.errstate(divide="ignore", invalid="ignore"):
        if selected_idx == "NDCI (Chlorophyll-a)":
            val_opt = (b05 - b04) / (b05 + b04)
            val_s1 = -nd_s1
            val = np.where(src_flag > 0.5, val_s1, val_opt)
        elif selected_idx == "NDTI (Normalized Difference Turbidity Index)":
            val_opt = (b04 - b03) / (b04 + b03)
            val_s1 = nd_s1
            val = np.where(src_flag > 0.5, val_s1, val_opt)
        elif selected_idx == "Dogliotti Turbidity (FNU proxy)":
            val_opt = np.where(
                b04 < 0.05,
                228.1 * b04 / (1 - (b04 / 0.1686)),
                3078.9 * b08 / (1 - (b08 / 0.2112)),
            )
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

    val = np.nan_to_num(val, nan=0.0, posinf=0.0, neginf=0.0)
    return val.astype(np.float32)


def save_cached_output(
    base_file: str,
    raw_stack: np.ndarray,
    mask: np.ndarray,
    bbox: list,
    metadata: dict,
    aoi_geojson: dict | None = None,
):
    npz_path = os.path.join(CACHE_DIR, base_file)
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

    if not RASTERIO_AVAILABLE:
        return npz_path, None

    tif_path = npz_path.replace(".npz", ".tif")
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


def save_period_buffer(period_file: str, buffer: dict, bbox: list, aoi_geojson: dict | None = None):
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
            100.0 * buffer["s2_cloudy_water_sum"] / buffer["s2_water_sum"]
            if buffer["s2_water_sum"] > 0
            else 0.0,
            2,
        ),
        "s1_fill_pct": round(
            100.0 * buffer["s1_fill_sum"] / buffer["count_sum"]
            if buffer["count_sum"] > 0
            else 0.0,
            2,
        ),
    }
    save_cached_output(period_file, avg_stack, mask, bbox, metadata, aoi_geojson=aoi_geojson)


def compute_seasonal_summary(files: list[str], selected_idx: str):
    seasonal_values = {}
    for filename in files:
        try:
            raw = np.load(os.path.join(CACHE_DIR, filename), allow_pickle=True)
            mask = raw["mask"]
            if "raw_stack" in raw:
                vals = compute_indicator_from_raw(raw["raw_stack"], selected_idx)
            elif "val" in raw:
                vals = raw["val"]
            else:
                continue

            valid = vals[mask > 0]
            if valid.size == 0:
                continue

            ref_date = (
                datetime.strptime(npz_value_to_str(raw["scan_end"]), "%Y-%m-%d")
                if "scan_end" in raw
                else datetime.now()
            )
            season = get_season_name(ref_date)
            key = (str(ref_date.year), season)
            seasonal_values.setdefault(key, []).append(float(np.mean(valid)))
        except Exception:
            continue

    order = {"Winter": 0, "Spring": 1, "Summer": 2, "Autumn": 3}
    summary = []
    for (year, season), means in seasonal_values.items():
        summary.append(
            {
                "Year": year,
                "Season": season,
                "Mean": round(float(np.mean(means)), 5),
                "Samples": len(means),
            }
        )
    summary.sort(key=lambda row: (row["Year"], order.get(row["Season"], 99)))
    return summary


def get_cache_entries():
    entries = []
    for filename in sorted(os.listdir(CACHE_DIR)):
        if not filename.endswith(".npz") or not filename.startswith("fused_"):
            continue
        npz_path = os.path.join(CACHE_DIR, filename)
        tif_path = npz_path.replace(".npz", ".tif")
        try:
            raw = np.load(npz_path, allow_pickle=True)
            cached_bbox = raw["bbox"].tolist() if "bbox" in raw else None
            current_bbox = st.session_state.bbox
            entry = {
                "file": filename,
                "scan_mode": npz_value_to_str(raw["scan_mode"]) if "scan_mode" in raw else "unknown",
                "scan_method": npz_value_to_str(raw["scan_method"]) if "scan_method" in raw else "unknown",
                "scan_start": npz_value_to_str(raw["scan_start"]) if "scan_start" in raw else "-",
                "scan_end": npz_value_to_str(raw["scan_end"]) if "scan_end" in raw else "-",
                "resolution_m": int(raw["resolution_m"]) if "resolution_m" in raw else -1,
                "cloud_max_pct": int(raw["cloud_max_pct"]) if "cloud_max_pct" in raw else -1,
                "s2_cloudy_water_pct": float(raw["s2_cloudy_water_pct"]) if "s2_cloudy_water_pct" in raw else -1.0,
                "s1_fill_pct": float(raw["s1_fill_pct"]) if "s1_fill_pct" in raw else -1.0,
                "aoi_bbox": cached_bbox,
                "aoi_geojson": json.loads(npz_value_to_str(raw["aoi_geojson_json"])) if "aoi_geojson_json" in raw and npz_value_to_str(raw["aoi_geojson_json"]) else None,
                "pixel_width": int(raw["pixel_width"]) if "pixel_width" in raw else -1,
                "pixel_height": int(raw["pixel_height"]) if "pixel_height" in raw else -1,
                "aoi_polygon_count": int(raw["aoi_polygon_count"]) if "aoi_polygon_count" in raw else 0,
                "has_raw_stack": "raw_stack" in raw,
                "has_tif": os.path.exists(tif_path),
                "size_mb": round(os.path.getsize(npz_path) / (1024 * 1024), 2),
                "overlaps_active_aoi": bbox_intersects(current_bbox, cached_bbox),
            }
            entries.append(entry)
        except Exception:
            continue
    return entries


# ==========================================
# CORE REQUEST LOGIC
# ==========================================
def build_fusion_request(
    aoi: BBox,
    time_range: tuple,
    size: tuple,
    max_cloud_pct: float,
    aoi_geometry=None,
) -> SentinelHubRequest:
    s2_col, l8_col, s1_col = get_collections()
    maxcc = max(0.0, min(1.0, max_cloud_pct / 100.0))

    evalscript = f"""
    //VERSION=3
    function setup() {{
        return {{
            input: [
                {{ datasource: "S2", bands: ["B01", "B02", "B03", "B04", "B05", "B08", "B11", "SCL", "dataMask"] }},
                {{ datasource: "L8", bands: ["B01", "B02", "B03", "B04", "B05", "BQA", "dataMask"] }},
                {{ datasource: "S1", bands: ["VV", "VH", "dataMask"] }}
            ],
            output: {{ bands: 13, sampleType: "FLOAT32" }}
        }};
    }}

    function evaluatePixel(samples) {{
        let cloudyWater = 0;
        let waterFlag = 0;

        if (samples.S2 && samples.S2.length > 0) {{
            let s2d = samples.S2[0];
            if (s2d.dataMask > 0) {{
                let ndwi0 = (s2d.B03 - s2d.B11) / (s2d.B03 + s2d.B11);
                if (ndwi0 > 0.0) {{
                    waterFlag = 1;
                    if ([3, 8, 9, 10].includes(s2d.SCL)) cloudyWater = 1;
                }}
            }}
        }}

        if (samples.L8 && samples.L8.length > 0) {{
            let l8d = samples.L8[0];
            if (l8d.dataMask > 0) {{
                let ndwi_l0 = (l8d.B03 - l8d.B01) / (l8d.B03 + l8d.B01);
                if (ndwi_l0 > 0.0) {{
                    waterFlag = 1;
                    if (l8d.BQA & (1 << 4)) cloudyWater = 1;
                }}
            }}
        }}

        if (samples.S2 && samples.S2.length > 0) {{
            for (let i = 0; i < samples.S2.length; i++) {{
                let s2 = samples.S2[i];
                if (s2.dataMask > 0 && ![1, 3, 8, 9, 10, 11].includes(s2.SCL)) {{
                    let ndwi = (s2.B03 - s2.B11) / (s2.B03 + s2.B11);
                    if (ndwi > 0.0) {{
                        return [s2.B01, s2.B02, s2.B03, s2.B04, s2.B05, s2.B08, s2.B11, 0, 0, 0, 1, waterFlag, cloudyWater];
                    }}
                }}
            }}
        }}

        if (samples.L8 && samples.L8.length > 0) {{
            for (let i = 0; i < samples.L8.length; i++) {{
                let l8 = samples.L8[i];
                if (l8.dataMask > 0 && !(l8.BQA & (1 << 4))) {{
                    let ndwi_l = (l8.B03 - l8.B01) / (l8.B03 + l8.B01);
                    if (ndwi_l > 0.0) {{
                        return [l8.B01, l8.B02, l8.B03, l8.B04, l8.B05, 0, 0, 0, 0, 0, 1, waterFlag, cloudyWater];
                    }}
                }}
            }}
        }}

        // If optical is cloudy over water, fill with S1-derived pseudo signal.
        if (waterFlag == 1 && cloudyWater == 1 && samples.S1 && samples.S1.length > 0) {{
            let r = samples.S1[0];
            if (r.dataMask > 0) {{
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
            }}
        }}

        return [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, waterFlag, cloudyWater];
    }}
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


# ==========================================
# UI COMPONENTS
# ==========================================
def render_sidebar():
    st.sidebar.title("🛰️ Fusion Lab v17")

    st.sidebar.subheader("1) Product")
    selected_idx = st.sidebar.selectbox("Indicator", list(MAGO_INDICES.keys()))
    st.sidebar.caption(MAGO_INDICES[selected_idx]["description"])

    st.sidebar.markdown("---")
    st.sidebar.subheader("1.5) AOI Filter")
    polygon_count = len(st.session_state.aoi_all_polygons)
    if polygon_count > 1:
        options = [f"AOI {i + 1}" for i in range(polygon_count)]
        current_selection = [v for v in st.session_state.aoi_selected_ids if v in options]
        if not current_selection:
            current_selection = options
        st.session_state.aoi_selected_ids = st.sidebar.multiselect(
            "Active AOIs",
            options=options,
            default=current_selection,
            help="Select which drawn AOIs are included in processing and map overlay.",
        )
        sync_active_aoi_selection()
        st.sidebar.caption(
            f"Using {len(st.session_state.aoi_selected_ids)} of {polygon_count} AOIs."
        )
    elif polygon_count == 1:
        st.session_state.aoi_selected_ids = ["AOI 1"]
        sync_active_aoi_selection()
        st.sidebar.caption("Single AOI active.")
    else:
        st.sidebar.caption("No AOIs drawn yet.")

    st.sidebar.markdown("---")
    st.sidebar.subheader("2) Visualization")
    init_threshold_state(selected_idx)
    m_key, x_key = get_threshold_keys(selected_idx)
    if m_key not in st.session_state:
        st.session_state[m_key] = st.session_state.thresholds[selected_idx]["min"]
        st.session_state[x_key] = st.session_state.thresholds[selected_idx]["max"]

    st.session_state[m_key] = st.sidebar.number_input(
        "Minimum value",
        value=float(st.session_state[m_key]),
        step=0.001,
        format="%.3f",
        key=f"{m_key}_input",
    )
    st.session_state[x_key] = st.sidebar.number_input(
        "Maximum value",
        value=float(st.session_state[x_key]),
        step=0.001,
        format="%.3f",
        key=f"{x_key}_input",
    )
    st.session_state.thresholds[selected_idx]["min"] = float(st.session_state[m_key])
    st.session_state.thresholds[selected_idx]["max"] = float(st.session_state[x_key])

    if st.session_state[m_key] >= st.session_state[x_key]:
        st.sidebar.warning("Minimum must be lower than maximum.")

    st.sidebar.markdown("---")
    st.sidebar.subheader("3) Acquisition Quality")
    st.session_state.cloud_max_pct = st.sidebar.slider(
        "Max S2 cloudy-water coverage (%)",
        min_value=0,
        max_value=100,
        value=int(st.session_state.cloud_max_pct),
        step=1,
        help="If Sentinel-2 cloudy-water percentage exceeds this threshold, the sample is discarded.",
    )

    st.sidebar.markdown("---")
    st.sidebar.subheader("4) Temporal Scan")
    res_m = st.sidebar.select_slider("Resolution (m)", options=[10, 20, 30, 60, 100], value=30)
    scan_mode = st.sidebar.selectbox("Scan frequency", ["Daily", "Weekly", "Monthly", "Yearly"], index=0)
    scan_method = st.sidebar.selectbox(
        "Aggregation method",
        ["Average daily scenes", "Per-period composite"],
        index=0,
        help=(
            "Average daily scenes: builds each period from daily requests. "
            "Per-period composite: one request per period (better for monthly/yearly throughput)."
        ),
    )
    start_d = st.sidebar.date_input("Scan Start", datetime.now() - timedelta(days=14))
    end_d = st.sidebar.date_input("Scan End", datetime.now())

    if st.sidebar.button(f"🚀 Run {scan_mode} Scan", type="primary"):
        if not st.session_state.bbox:
            st.sidebar.warning("Draw an AOI first.")
            return selected_idx, res_m, m_key, x_key

        aoi = BBox(bbox=st.session_state.bbox, crs=CRS.WGS84)
        aoi_geometry = (
            Geometry(st.session_state.aoi_geojson, CRS.WGS84)
            if st.session_state.aoi_geojson
            else None
        )
        start_dt = datetime.combine(start_d, datetime.min.time())
        end_dt = datetime.combine(end_d, datetime.min.time())
        period_ranges = get_period_ranges(start_dt, end_dt, scan_mode)

        cache_hits = 0
        with st.status("Fusing Imagery...") as status:
            for period_key, period_start, period_end in period_ranges:
                period_file = get_scan_filename(
                    scan_mode,
                    period_key,
                    scan_method,
                    res_m,
                    st.session_state.cloud_max_pct,
                )
                full_path = os.path.join(CACHE_DIR, period_file)
                status.update(label=f"Scanning {scan_mode.lower()} period: {period_key}")

                if os.path.exists(full_path):
                    cache_hits += 1
                    continue

                if scan_method == "Average daily scenes":
                    buffer = None
                    cursor = period_start
                    while cursor <= period_end:
                        d_str = cursor.strftime("%Y-%m-%d")
                        try:
                            req = build_fusion_request(
                                aoi,
                                (d_str, d_str),
                                bbox_to_dimensions(aoi, res_m),
                                st.session_state.cloud_max_pct,
                                aoi_geometry,
                            )
                            res_data = req.get_data()[0]
                            raw_stack = res_data[:, :, :RAW_BAND_COUNT]
                            mask = res_data[:, :, RAW_BAND_COUNT]
                            s2_water = float(np.sum(res_data[:, :, RAW_BAND_COUNT + 1]))
                            s2_cloudy_water = float(np.sum(res_data[:, :, RAW_BAND_COUNT + 2]))
                            s1_fill = float(np.sum(raw_stack[:, :, 9] > 0.5))
                            cloudy_pct = (100.0 * s2_cloudy_water / s2_water) if s2_water > 0 else 0.0
                            if cloudy_pct > st.session_state.cloud_max_pct:
                                cursor += timedelta(days=1)
                                continue
                            if buffer is None:
                                buffer = {
                                    "raw_sum": np.zeros_like(raw_stack, dtype=np.float32),
                                    "count": np.zeros_like(mask, dtype=np.float32),
                                    "scan_start": period_start,
                                    "scan_end": period_end,
                                    "scan_mode": scan_mode,
                                    "scan_method": scan_method,
                                    "resolution_m": res_m,
                                    "cloud_max_pct": int(st.session_state.cloud_max_pct),
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
                        except Exception:
                            pass
                        cursor += timedelta(days=1)

                    if buffer is not None:
                        save_period_buffer(
                            period_file,
                            buffer,
                            st.session_state.bbox,
                            st.session_state.aoi_geojson,
                        )
                    continue

                try:
                    req = build_fusion_request(
                        aoi,
                        (period_start.strftime("%Y-%m-%d"), period_end.strftime("%Y-%m-%d")),
                        bbox_to_dimensions(aoi, res_m),
                        st.session_state.cloud_max_pct,
                        aoi_geometry,
                    )
                    res_data = req.get_data()[0]
                    raw_stack = res_data[:, :, :RAW_BAND_COUNT]
                    mask = res_data[:, :, RAW_BAND_COUNT]
                    s2_water = float(np.sum(res_data[:, :, RAW_BAND_COUNT + 1]))
                    s2_cloudy_water = float(np.sum(res_data[:, :, RAW_BAND_COUNT + 2]))
                    s1_fill = float(np.sum(raw_stack[:, :, 9] > 0.5))
                    cloudy_pct = (100.0 * s2_cloudy_water / s2_water) if s2_water > 0 else 0.0
                    if cloudy_pct > st.session_state.cloud_max_pct:
                        continue
                    if np.max(mask) > 0:
                        metadata = {
                            "scan_start": period_start.strftime("%Y-%m-%d"),
                            "scan_end": period_end.strftime("%Y-%m-%d"),
                            "scan_mode": scan_mode,
                            "scan_method": scan_method,
                            "resolution_m": res_m,
                            "cloud_max_pct": int(st.session_state.cloud_max_pct),
                            "s2_cloudy_water_pct": round(cloudy_pct, 2),
                            "s1_fill_pct": round(100.0 * s1_fill / float(np.sum(mask > 0)), 2) if float(np.sum(mask > 0)) > 0 else 0.0,
                        }
                        save_cached_output(
                            period_file,
                            raw_stack,
                            mask,
                            st.session_state.bbox,
                            metadata,
                            aoi_geojson=st.session_state.aoi_geojson,
                        )
                except Exception:
                    pass

            status.update(label=f"Scan Complete! Reused {cache_hits} cached period(s).", state="complete")
        st.rerun()

    st.sidebar.markdown("---")
    st.sidebar.subheader("5) Cache Browser")
    cache_entries = get_cache_entries()
    if not cache_entries:
        st.sidebar.info("No cached products yet.")
        return selected_idx, res_m, m_key, x_key

    cache_modes = sorted({e["scan_mode"] for e in cache_entries})
    cache_methods = sorted({e["scan_method"] for e in cache_entries})
    mode_filter = st.sidebar.selectbox("Mode filter", ["All"] + cache_modes, key="cache_mode_filter")
    method_filter = st.sidebar.selectbox("Method filter", ["All"] + cache_methods, key="cache_method_filter")
    only_current_settings = st.sidebar.checkbox(
        "Only current settings",
        value=False,
        help="Filter cache entries to the currently selected resolution/cloud settings.",
    )
    raw_only = st.sidebar.checkbox("Raw-stack only", value=True)
    tif_only = st.sidebar.checkbox("GeoTIFF only", value=False)

    filtered_entries = []
    for entry in cache_entries:
        if mode_filter != "All" and entry["scan_mode"] != mode_filter:
            continue
        if method_filter != "All" and entry["scan_method"] != method_filter:
            continue
        if raw_only and not entry["has_raw_stack"]:
            continue
        if tif_only and not entry["has_tif"]:
            continue
        if only_current_settings:
            if entry["resolution_m"] != int(res_m):
                continue
            if entry["cloud_max_pct"] != int(st.session_state.cloud_max_pct):
                continue
        filtered_entries.append(entry)

    st.sidebar.caption(f"Cache entries: {len(filtered_entries)} / {len(cache_entries)}")
    if filtered_entries:
        overlap_entries = [e for e in filtered_entries if e["overlaps_active_aoi"]]
        st.sidebar.caption(f"AOI overlaps: {len(overlap_entries)}")
        if overlap_entries:
            review_options = [
                f"{e['file']} | {e['scan_start']} -> {e['scan_end']} | {e['pixel_width']}x{e['pixel_height']}"
                for e in overlap_entries
            ]
            selected_review_label = st.sidebar.selectbox(
                "Review overlapping cache",
                options=["None"] + review_options,
                index=0,
                help="Pick a cached raster whose bbox intersects the active AOI to reopen it on the map.",
            )
            if selected_review_label == "None":
                if st.session_state.review_cache_file is not None:
                    st.session_state.review_cache_file = None
            else:
                selected_entry = overlap_entries[review_options.index(selected_review_label)]
                if st.session_state.review_cache_file != selected_entry["file"]:
                    st.session_state.review_cache_file = selected_entry["file"]

        st.sidebar.dataframe(
            [
                {
                    "File": e["file"],
                    "Mode": e["scan_mode"],
                    "Method": e["scan_method"],
                    "Start": e["scan_start"],
                    "End": e["scan_end"],
                    "Res(m)": e["resolution_m"],
                    "Cloud%": e["cloud_max_pct"],
                    "S2 cloudy%": e["s2_cloudy_water_pct"],
                    "S1 fill%": e["s1_fill_pct"],
                    "px": f"{e['pixel_width']}x{e['pixel_height']}",
                    "AOIs": e["aoi_polygon_count"],
                    "Overlap": e["overlaps_active_aoi"],
                    "TIF": e["has_tif"],
                    "MB": e["size_mb"],
                }
                for e in filtered_entries
            ],
            hide_index=True,
        )
    else:
        st.sidebar.info("No cache entries match current filters.")

    return selected_idx, res_m, m_key, x_key


def render_map(selected_idx, m_key, x_key):
    st.header("Water Quality Fusion Map")

    m = folium.Map(location=st.session_state.map_center, zoom_start=st.session_state.map_zoom)

    if st.session_state.review_cache_file:
        review_path = os.path.join(CACHE_DIR, st.session_state.review_cache_file)
        if os.path.exists(review_path):
            review_raw = np.load(review_path, allow_pickle=True)
            review_bbox = review_raw["bbox"] if "bbox" in review_raw else None
            if review_bbox is not None:
                folium.Rectangle(
                    bounds=[[review_bbox[1], review_bbox[0]], [review_bbox[3], review_bbox[2]]],
                    color="#2d9cdb",
                    weight=3,
                    fill=True,
                    fill_opacity=0.08,
                    tooltip=f"Cached review: {st.session_state.review_cache_file}",
                ).add_to(m)

    if st.session_state.aoi_geojson:
        folium.GeoJson(
            st.session_state.aoi_geojson,
            name="AOI",
            style_function=lambda _: {
                "color": "#ff4b4b",
                "weight": 3,
                "fillColor": "#ff4b4b",
                "fillOpacity": 0.15,
            },
            tooltip="Active Processing Area",
        ).add_to(m)
    elif st.session_state.bbox:
        b = st.session_state.bbox
        folium.Rectangle(
            bounds=[[b[1], b[0]], [b[3], b[2]]],
            color="#ff4b4b",
            weight=3,
            fill=True,
            fill_opacity=0.15,
            tooltip="Active Processing Area",
        ).add_to(m)

    files = sorted([f for f in os.listdir(CACHE_DIR) if f.endswith(".npz") and f.startswith("fused_")])
    active_file = st.session_state.review_cache_file if st.session_state.review_cache_file in files else None

    if files:
        if active_file:
            sel_f = active_file
            st.caption(f"Reviewing cached AOI: {sel_f.replace('fused_', '').replace('.npz', '')}")
        else:
            sel_f = st.select_slider(
                "📅 Historical Timeline",
                options=files,
                format_func=lambda x: x.replace("fused_", "").replace(".npz", ""),
            )
        raw = np.load(os.path.join(CACHE_DIR, sel_f), allow_pickle=True)
        rb = raw["bbox"]

        if "raw_stack" in raw:
            indicator_vals = compute_indicator_from_raw(raw["raw_stack"], selected_idx)
        else:
            indicator_vals = raw["val"]
        mask = raw["mask"]

        norm = plt.Normalize(st.session_state[m_key], st.session_state[x_key])
        cmap = plt.get_cmap(MAGO_INDICES[selected_idx]["cmap"])
        color_img = cmap(norm(indicator_vals))
        color_img[mask == 0, 3] = 0.0

        folium.raster_layers.ImageOverlay(
            image=color_img,
            bounds=[[rb[1], rb[0]], [rb[3], rb[2]]],
            opacity=0.85,
        ).add_to(m)

        if "scan_mode" in raw and "scan_method" in raw and "scan_start" in raw and "scan_end" in raw:
            st.caption(
                "Mode: "
                f"{npz_value_to_str(raw['scan_mode'])} | "
                f"Method: {npz_value_to_str(raw['scan_method'])} | "
                f"Range: {npz_value_to_str(raw['scan_start'])} to {npz_value_to_str(raw['scan_end'])}"
            )

        season_summary = compute_seasonal_summary(files, selected_idx)
        if season_summary:
            st.subheader("Seasonal Pollution / Water Quality Estimate")
            st.caption("Rough seasonal mean values from cached outputs for the selected indicator.")
            st.dataframe(season_summary)

    Draw(
        export=False,
        position="topleft",
        draw_options={
            "polyline": False,
            "circle": False,
            "marker": False,
            "circlemarker": False,
            "polygon": True,
            "rectangle": True,
        },
    ).add_to(m)

    out = st_folium(
        m,
        width=1100,
        height=600,
        key="fusion_map",
        returned_objects=["last_active_drawing", "all_drawings", "center", "zoom"],
    )

    if out:
        if out.get("center"):
            st.session_state.map_center = [out["center"]["lat"], out["center"]["lng"]]
        if out.get("zoom") is not None:
            st.session_state.map_zoom = out["zoom"]

    if out is not None:
        drawings = None
        if isinstance(out.get("all_drawings"), list):
            drawings = out.get("all_drawings")
        elif out.get("last_active_drawing") is not None:
            drawings = [out.get("last_active_drawing")]

        if drawings is not None:
            new_polygons = extract_polygons_from_drawings(drawings)
            polygons_changed = st.session_state.aoi_all_polygons != new_polygons

            if polygons_changed:
                st.session_state.aoi_all_polygons = new_polygons
                if new_polygons:
                    st.session_state.aoi_selected_ids = [f"AOI {i + 1}" for i in range(len(new_polygons))]
                else:
                    st.session_state.aoi_selected_ids = []
                    st.session_state.review_cache_file = None

            sync_active_aoi_selection()


def render_footer():
    st.markdown("---")
    col1, col2 = st.columns([1, 5])
    with col1:
        if st.button("🗑️ Reset Everything"):
            shutil.rmtree(CACHE_DIR, ignore_errors=True)
            os.makedirs(CACHE_DIR, exist_ok=True)
            st.session_state.bbox = None
            st.session_state.aoi_geojson = None
            st.session_state.aoi_all_polygons = []
            st.session_state.aoi_selected_ids = []
            st.session_state.review_cache_file = None
            st.rerun()
    with col2:
        if not st.session_state.bbox:
            st.info("ℹ️ Draw one or more polygons/rectangles on the map to define the Area of Interest (AOI).")
        if not RASTERIO_AVAILABLE:
            st.warning("GeoTIFF export disabled: install rasterio to enable .tif sidecar caching.")


def main():
    init_state()
    selected_idx, _, m_key, x_key = render_sidebar()
    render_map(selected_idx, m_key, x_key)
    render_footer()


if __name__ == "__main__":
    main()
