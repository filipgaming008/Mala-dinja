import requests
from osm2geojson import json2geojson
import overpass
api = overpass.API(endpoint="https://overpass.kumi.systems/api/interpreter")
# 1. Define the query cleanly
query = """[out:json][timeout:25];
relation["name"="San Francisco"]["boundary"="administrative"]["admin_level"="8"];
out geom;"""

url = "https://overpass-api.de/api/interpreter"
headers = {
    'User-Agent': 'MyGeocodingScript/1.0 (contact@example.com)'
}

try:
    response = requests.get(url, params={'data': query}, headers=headers)

    # This will raise an HTTPError if the reach failed (4xx or 5xx)
    response.raise_for_status()

    data = response.json()

    # 3. Convert OSM JSON to GeoJSON
    geojson_data = json2geojson(data)

    if geojson_data['features']:
        city_polygon = geojson_data['features'][0]['geometry']
        print(city_polygon)
    else:
        print("No features found for that query.")

except requests.exceptions.HTTPError as http_err:
    print(f"HTTP error occurred: {http_err}")
except requests.exceptions.JSONDecodeError:
    print("Failed to parse JSON. Response was:")
    print(response.text)
except Exception as err:
    print(f"An error occurred: {err}")

MapQuery = overpass.MapQuery(city_polygon['coordinates'][0][0])
response = api.get(MapQuery)
print(response.text)