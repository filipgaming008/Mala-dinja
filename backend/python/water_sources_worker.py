import argparse
import math
import json
import sys
from urllib import parse, request
from urllib.error import URLError, HTTPError
from datetime import datetime, timezone


def log_debug(message: str) -> None:
    print(message, file=sys.stderr)


def parse_bbox(value: str):
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError as error:
        raise ValueError(f"Invalid bbox JSON: {error}") from error

    if not isinstance(parsed, dict):
        raise ValueError("bbox must be a JSON object")

    required_keys = ["south", "west", "north", "east"]
    missing = [key for key in required_keys if key not in parsed]
    if missing:
        raise ValueError(f"bbox missing keys: {', '.join(missing)}")

    for key in required_keys:
        if not isinstance(parsed[key], (int, float)):
            raise ValueError(f"bbox key '{key}' must be numeric")

    if parsed["south"] >= parsed["north"]:
        raise ValueError("bbox south must be smaller than north")

    if parsed["west"] >= parsed["east"]:
        raise ValueError("bbox west must be smaller than east")

    return {
        "south": float(parsed["south"]),
        "west": float(parsed["west"]),
        "north": float(parsed["north"]),
        "east": float(parsed["east"]),
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Water sources worker")
    parser.add_argument("--water-body-name", required=True)
    parser.add_argument("--radius-km", required=True, type=float)
    parser.add_argument("--country-code", required=False)
    parser.add_argument("--bbox", required=False)
    parser.add_argument("--water-body-type", required=False, default="UNKNOWN")
    return parser


def derive_center(args, bbox):
    if bbox:
        return (
            (bbox["south"] + bbox["north"]) / 2,
            (bbox["west"] + bbox["east"]) / 2,
        )

    if (args.country_code or "").upper() == "MK":
        return (41.89, 22.48)

    return (45.0, 19.8)


def haversine_meters(lat1, lon1, lat2, lon2):
    radius = 6371000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * (math.sin(delta_lambda / 2) ** 2)
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return radius * c


def safe_float(value):
    try:
        return float(value)
    except Exception:
        return None


def infer_source_type(tags):
    industrial = (tags.get("industrial") or "").lower()
    landuse = (tags.get("landuse") or "").lower()
    man_made = (tags.get("man_made") or "").lower()
    building = (tags.get("building") or "").lower()

    if any(token in industrial for token in ["wastewater", "sewage", "wwtp"]) or any(
        token in man_made for token in ["wastewater", "sewage"]
    ):
        return "WASTEWATER"

    if industrial or building == "industrial":
        return "FACTORY"

    if landuse in ["farm", "farmland", "orchard", "vineyard", "greenhouse_horticulture"]:
        return "FARM"

    if landuse == "construction":
        return "CONSTRUCTION"

    return "UNKNOWN"


def infer_risk_level(source_type, distance_meters):
    if source_type in ["WASTEWATER", "FACTORY"]:
        return "HIGH" if distance_meters <= 1500 else "MEDIUM"

    if source_type == "CONSTRUCTION":
        return "MEDIUM" if distance_meters <= 1200 else "LOW"

    if source_type == "FARM":
        return "MEDIUM" if distance_meters <= 1800 else "LOW"

    return "LOW"


def infer_pollutants(source_type):
    if source_type == "FACTORY":
        return ["organic load", "surfactants", "process chemicals"]
    if source_type == "FARM":
        return ["nitrates", "phosphates", "sediment runoff"]
    if source_type == "CONSTRUCTION":
        return ["sediment runoff"]
    if source_type == "WASTEWATER":
        return ["nutrient load", "organic load", "microbial indicators"]
    return []


def infer_signature(source_type):
    if source_type == "FACTORY":
        return "localized reflectance anomaly near industrial footprint"
    if source_type == "FARM":
        return "seasonal vegetation and runoff correlation"
    if source_type == "CONSTRUCTION":
        return "surface disturbance pattern"
    if source_type == "WASTEWATER":
        return "localized turbidity and chlorophyll correlation"
    return "weak source signature"


def overpass_query_from_bbox(bbox):
    south = bbox["south"]
    west = bbox["west"]
    north = bbox["north"]
    east = bbox["east"]

    return f"""[out:json][timeout:25];
(
  nwr["industrial"]({south},{west},{north},{east});
  nwr["landuse"~"industrial|farmland|farm|construction"]({south},{west},{north},{east});
  nwr["man_made"~"wastewater_plant|sewage"]({south},{west},{north},{east});
  nwr["building"="industrial"]({south},{west},{north},{east});
);
out center tags;"""


def fetch_overpass(bbox):
    query = overpass_query_from_bbox(bbox)
    payload = parse.urlencode({"data": query}).encode("utf-8")
    req = request.Request(
        "https://overpass-api.de/api/interpreter",
        data=payload,
        headers={"Content-Type": "application/x-www-form-urlencoded", "User-Agent": "cassini-backend-worker/1.0"},
        method="POST",
    )
    with request.urlopen(req, timeout=45) as resp:
        body = resp.read().decode("utf-8")
        return json.loads(body)


def element_coordinates(element):
    if "lat" in element and "lon" in element:
        return (safe_float(element.get("lat")), safe_float(element.get("lon")))

    center = element.get("center") or {}
    return (safe_float(center.get("lat")), safe_float(center.get("lon")))


def normalize_osm_elements(elements, center_lat, center_lon, radius_meters):
    normalized = []
    seen = set()

    for element in elements:
        tags = element.get("tags") or {}
        lat, lon = element_coordinates(element)
        if lat is None or lon is None:
            continue

        distance = haversine_meters(center_lat, center_lon, lat, lon)
        if distance > radius_meters * 1.2:
            continue

        source_type = infer_source_type(tags)
        if source_type == "UNKNOWN":
            continue

        osm_id = str(element.get("id")) if element.get("id") is not None else None
        osm_type = element.get("type")
        if not osm_id or not osm_type:
            continue

        key = f"{osm_type}:{osm_id}"
        if key in seen:
            continue
        seen.add(key)

        name = tags.get("name") or f"{source_type.title()} source {osm_id}"

        normalized.append(
            {
                "osmId": osm_id,
                "osmType": osm_type,
                "name": name,
                "sourceType": source_type,
                "riskLevel": infer_risk_level(source_type, distance),
                "latitude": round(lat, 6),
                "longitude": round(lon, 6),
                "distanceMeters": int(round(distance)),
                "pollutants": infer_pollutants(source_type),
                "satelliteSignature": infer_signature(source_type),
                "osmTags": tags,
                "rawData": {"workerMode": "overpass_live"},
            }
        )

    normalized.sort(key=lambda item: item["distanceMeters"])
    return normalized[:30]


def build_mock_sources(args, bbox):
    center_lat, center_lon = derive_center(args, bbox)
    radius_m = int(args.radius_km * 1000)

    return [
        {
            "osmId": "demo-factory-1",
            "osmType": "way",
            "name": "Demo Textile Facility",
            "sourceType": "FACTORY",
            "riskLevel": "HIGH",
            "latitude": round(center_lat + 0.01, 6),
            "longitude": round(center_lon - 0.01, 6),
            "distanceMeters": min(850, max(radius_m - 100, 350)),
            "pollutants": ["dyes", "surfactants", "organic load"],
            "satelliteSignature": "localized reflectance anomaly near industrial area",
            "osmTags": {
                "building": "industrial",
                "industrial": "textile",
            },
            "rawData": {
                "workerMode": "mock_sources",
            },
        },
        {
            "osmId": "demo-farm-1",
            "osmType": "way",
            "name": "Demo Farm Area",
            "sourceType": "FARM",
            "riskLevel": "MEDIUM",
            "latitude": round(center_lat + 0.02, 6),
            "longitude": round(center_lon + 0.02, 6),
            "distanceMeters": min(1400, max(radius_m - 250, 600)),
            "pollutants": ["nitrates", "phosphates", "sediment runoff"],
            "satelliteSignature": "seasonal vegetation and runoff correlation",
            "osmTags": {
                "landuse": "farmland",
            },
            "rawData": {
                "workerMode": "mock_sources",
            },
        },
        {
            "osmId": "demo-construction-1",
            "osmType": "node",
            "name": "Demo Construction Site",
            "sourceType": "CONSTRUCTION",
            "riskLevel": "MEDIUM",
            "latitude": round(center_lat - 0.015, 6),
            "longitude": round(center_lon - 0.02, 6),
            "distanceMeters": min(920, max(radius_m - 180, 450)),
            "pollutants": ["sediment runoff"],
            "satelliteSignature": "surface disturbance pattern",
            "osmTags": {
                "landuse": "construction",
            },
            "rawData": {
                "workerMode": "mock_sources",
            },
        },
    ]


def build_detected_indicators(potential_sources):
    if not potential_sources:
        return {
            "turbidityScore": 18,
            "chlorophyllScore": 22,
            "suspendedMatterScore": 16,
            "temperatureAnomaly": 0.4,
        }

    nearby = [s for s in potential_sources if s.get("distanceMeters", 999999) <= 1500]
    high_risk = [s for s in potential_sources if s.get("riskLevel") in ["HIGH", "VERY_HIGH"]]

    turbidity = min(90, 25 + len(nearby) * 12 + len(high_risk) * 6)
    chlorophyll = min(85, 20 + len(nearby) * 8 + len(high_risk) * 5)
    suspended = min(88, 22 + len(nearby) * 11 + len(high_risk) * 4)
    temperature = min(2.4, 0.5 + len(nearby) * 0.18 + len(high_risk) * 0.12)

    return {
        "turbidityScore": int(turbidity),
        "chlorophyllScore": int(chlorophyll),
        "suspendedMatterScore": int(suspended),
        "temperatureAnomaly": round(temperature, 2),
    }


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.radius_km < 0.5 or args.radius_km > 5:
        raise ValueError("radius-km must be between 0.5 and 5")

    bbox = parse_bbox(args.bbox) if args.bbox else None

    if args.country_code:
        log_debug(f"Country filter enabled: {args.country_code}")

    center_lat, center_lon = derive_center(args, bbox)
    radius_m = int(args.radius_km * 1000)

    potential_sources = []
    provider = "worker-mock"

    if bbox:
        try:
            overpass_payload = fetch_overpass(bbox)
            elements = overpass_payload.get("elements") or []
            potential_sources = normalize_osm_elements(elements, center_lat, center_lon, radius_m)
            provider = "overpass_live"
            log_debug(f"Overpass live elements: {len(elements)}, normalized sources: {len(potential_sources)}")
        except (TimeoutError, HTTPError, URLError, json.JSONDecodeError, ValueError) as error:
            log_debug(f"Overpass live fetch failed, fallback to mock sources: {error}")

    if not potential_sources:
        potential_sources = build_mock_sources(args, bbox)
        provider = "worker-mock"
        log_debug(f"Generated fallback mock potential sources: {len(potential_sources)}")

    detected_indicators = build_detected_indicators(potential_sources)

    output = {
        "waterBody": {
            "name": args.water_body_name,
            "type": args.water_body_type,
            "bbox": bbox,
        },
        "potentialSources": potential_sources,
        "detectedIndicators": detected_indicators,
        "metadata": {
            "provider": provider,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "radiusKm": args.radius_km,
        },
    }

    json.dump(output, sys.stdout, ensure_ascii=True)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        log_debug(f"worker_error: {error}")
        raise
