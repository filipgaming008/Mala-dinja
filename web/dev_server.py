from __future__ import annotations

import io
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np


ROOT_DIR = Path(__file__).resolve().parent
CACHE_DIR = ROOT_DIR.parent / "models" / "mago_fusion_cache"


INDICATORS = {
    "NDCI (Chlorophyll-a)": {"min": -0.005, "max": 0.05, "cmap": "RdYlGn_r"},
    "NDTI (Normalized Difference Turbidity Index)": {"min": -0.05, "max": 0.25, "cmap": "YlOrBr"},
    "Dogliotti Turbidity (FNU proxy)": {"min": 0.0, "max": 150.0, "cmap": "inferno"},
    "TSS (Suspended Solids)": {"min": 0.075, "max": 0.185, "cmap": "YlOrBr"},
    "FAI (Floating Algae Index proxy)": {"min": -0.02, "max": 0.05, "cmap": "RdYlGn"},
    "Organic Matter Proxy (Green/Red ratio)": {"min": 0.6, "max": 1.6, "cmap": "PuBuGn"},
}


def npz_value_to_str(value):
    try:
        if hasattr(value, "item"):
            value = value.item()
    except Exception:
        pass
    return str(value)


def load_json_field(raw, key):
    if key not in raw:
        return None
    value = npz_value_to_str(raw[key])
    if not value:
        return None
    try:
        return json.loads(value)
    except Exception:
        return None


def load_cache_entries():
    entries = []
    if not CACHE_DIR.exists():
        return entries

    for filename in sorted(os.listdir(CACHE_DIR)):
        if not filename.endswith(".npz") or not filename.startswith("fused_"):
            continue

        path = CACHE_DIR / filename
        try:
            raw = np.load(path, allow_pickle=True)
            bbox = raw["bbox"].tolist() if "bbox" in raw else None
            aoi_geojson = load_json_field(raw, "aoi_geojson_json")
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
                    "bbox": bbox,
                    "aoi_geojson": aoi_geojson,
                    "pixel_width": int(raw["pixel_width"]) if "pixel_width" in raw else -1,
                    "pixel_height": int(raw["pixel_height"]) if "pixel_height" in raw else -1,
                    "aoi_polygon_count": int(raw["aoi_polygon_count"]) if "aoi_polygon_count" in raw else 0,
                    "has_raw_stack": "raw_stack" in raw,
                    "size_mb": round(os.path.getsize(path) / (1024 * 1024), 2),
                }
            )
        except Exception:
            continue

    return entries


def compute_indicator_from_raw(raw_stack: np.ndarray, selected_idx: str) -> np.ndarray:
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


def render_preview_png(entry_file: str, indicator: str, min_v: float, max_v: float) -> bytes:
    path = CACHE_DIR / entry_file
    if not path.exists():
        raise FileNotFoundError(entry_file)

    raw = np.load(path, allow_pickle=True)
    if "raw_stack" not in raw:
        raise ValueError("This cache entry does not have a raw stack.")

    raw_stack = raw["raw_stack"].astype(np.float32)
    mask = raw["mask"].astype(np.float32)
    values = compute_indicator_from_raw(raw_stack, indicator)

    norm = plt.Normalize(min_v, max_v)
    cmap = plt.get_cmap(INDICATORS.get(indicator, {}).get("cmap", "viridis"))
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


class DevRequestHandler(BaseHTTPRequestHandler):
    def _send_json(self, payload, status=200):
        body = json.dumps(payload, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_bytes(self, payload: bytes, content_type: str, status=200):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _serve_file(self, filename: str, content_type: str):
        path = ROOT_DIR / filename
        if not path.exists():
            return self._send_json({"error": "not found"}, status=404)
        return self._send_bytes(path.read_bytes(), content_type)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        if path in ("/", "/index.html"):
            return self._serve_file("placeholder.html", "text/html; charset=utf-8")
        if path == "/styles.css":
            return self._serve_file("styles.css", "text/css; charset=utf-8")
        if path == "/app.js":
            return self._serve_file("app.js", "application/javascript; charset=utf-8")

        if path == "/api/health":
            return self._send_json({"ok": True, "cache_dir": str(CACHE_DIR)})

        if path == "/api/cache":
            return self._send_json({"entries": load_cache_entries()})

        if path.startswith("/api/cache/") and path.endswith("/preview"):
            cache_file = unquote(path[len("/api/cache/") : -len("/preview")]).lstrip("/")
            indicator = query.get("indicator", ["NDCI (Chlorophyll-a)"])[0]
            indicator = indicator if indicator in INDICATORS else "NDCI (Chlorophyll-a)"
            min_v = float(query.get("min", [INDICATORS[indicator]["min"]])[0])
            max_v = float(query.get("max", [INDICATORS[indicator]["max"]])[0])

            try:
                data = render_preview_png(cache_file, indicator, min_v, max_v)
                return self._send_bytes(data, "image/png")
            except FileNotFoundError:
                return self._send_json({"error": "cache file not found"}, status=404)
            except Exception as exc:
                return self._send_json({"error": str(exc)}, status=400)

        return self._send_json({"error": "not found"}, status=404)


def main():
    server = ThreadingHTTPServer(("127.0.0.1", 8010), DevRequestHandler)
    print("Dev frontend server running on http://127.0.0.1:8010")
    server.serve_forever()


if __name__ == "__main__":
    main()
