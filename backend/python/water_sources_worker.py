import argparse
import json
import sys
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


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.radius_km < 0.5 or args.radius_km > 5:
        raise ValueError("radius-km must be between 0.5 and 5")

    bbox = parse_bbox(args.bbox) if args.bbox else None

    if args.country_code:
        log_debug(f"Country filter enabled: {args.country_code}")

    output = {
        "waterBody": {
            "name": args.water_body_name,
            "type": args.water_body_type,
            "bbox": bbox,
        },
        "potentialSources": [],
        "metadata": {
            "provider": "overpass",
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
