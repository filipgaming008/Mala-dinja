"""
pollution_map.py
----------------
Drop this alongside your existing script. It takes river_industrial_data.json
(the output of openstreettest.py) and:

  1. Classifies every site → risk level + pollutant list + satellite signature
  2. Writes an enriched JSON  → river_industrial_data_enriched.json
  3. Renders an interactive Folium map → pollution_map.html

You can also import `enrich_site` into openstreettest.py and call it
right inside the loop before appending to all_results.
"""

import json
import re
import folium
from folium.plugins import MarkerCluster
from pathlib import Path

# ──────────────────────────────────────────────────────────────────────────────
# 1.  CLASSIFICATION ENGINE
# ──────────────────────────────────────────────────────────────────────────────

# Each rule is (regex_pattern, industry_label, risk, pollutants, satellite_signature)
# Patterns are matched against the lowercased site name AND osm type/specifics.
# First match wins, so put more-specific rules first.

# ──────────────────────────────────────────────────────────────────────────────
# MANUAL OVERRIDES
# Use this dict to correct any misclassification without touching the regexes.
# Key = exact site name (as it appears in the JSON, case-sensitive).
# Value = partial or full dict to merge into the site after rule matching.
# You only need to specify the fields you want to override.
# ──────────────────────────────────────────────────────────────────────────────
OVERRIDES = {
    # ── Verified via web research ──────────────────────────────────────────────
    #
    # Vincini / Vincinni — brand of Makprogres DOO, Vinica.
    # Macedonia's largest confectionery exporter (biscuits, wafers, snacks).
    # Source: mk.wikipedia.org/wiki/Макпрогрес, vincinni.com
    "Vincini": {
        "industry_label": "Food Production — Confectionery (Makprogres / Vincinni)",
        "risk": "medium",
        "pollutants": [
            "High organic BOD/COD (sugar, starch, fat)",
            "Cleaning-in-place agents (NaOH, HNO₃)",
            "Packaging waste leachate",
            "Elevated nutrients (N, P) from wash water",
        ],
        "satellite_signature": (
            "Organic load causes downstream turbidity and algal growth (green surface mats "
            "in summer). Detectable as chlorophyll-a increase in Sentinel-2 B5 band near "
            "drainage outfall. No distinctive colour plume; BOD-driven oxygen depletion "
            "is best confirmed by in-situ monitoring."
        ),
    },

    # Телекабел — cable TV / internet / telecom operator headquartered in Štip.
    # The OSM node in Kočani is a local service branch office, NOT a manufacturing plant.
    # Source: mk.wikipedia.org/wiki/Телекабел, telekabel.com.mk
    "Телекабел": {
        "industry_label": "Telecommunications Operator (Telekabel — service branch)",
        "risk": "low",
        "pollutants": [
            "Minor: waste electrical equipment (WEEE)",
            "Small volumes of cleaning solvents",
        ],
        "satellite_signature": (
            "Negligible river impact. A service/retail branch has no industrial discharge. "
            "No satellite-observable pollution signal expected."
        ),
    },

    # Albatros — garment factory, shirts & blouses, Štip.
    # Produces 800,000+ shirts/year for 20+ EU countries.
    # Source: albatros.mk, export.investnorthmacedonia.gov.mk
    "Albatros": {
        "industry_label": "Garment Manufacturing — Shirts & Blouses (CMT)",
        "risk": "high",
        "pollutants": [
            "Synthetic dyes (reactive, disperse)",
            "Cr, Cd, Pb from dye fixatives",
            "High BOD/COD from wash water",
            "Surfactants and detergents",
            "Alkaline pH effluent (10–11)",
            "NaCl (salt used in dyeing)",
        ],
        "satellite_signature": (
            "Coloured plumes (blue, grey, brown tones) visible in high-res RGB imagery "
            "during active dyeing runs. Downstream foam in river eddies. "
            "Reduced NDVI in riparian vegetation 100–300 m from outfall."
        ),
    },

    # Larstrade — textile & garment (coats, jeans, jackets), Kočani / Zrnovci.
    # Also operates Lars Sushara (food drying) as a sister company.
    # Source: larstrade.mk
    "Larstrade": {
        "industry_label": "Garment Manufacturing — Outerwear & Denim (Lars Trade)",
        "risk": "high",
        "pollutants": [
            "Indigo and synthetic dyes (denim washing generates high load)",
            "Cr, Mn from denim stone-washing",
            "High BOD/COD",
            "Surfactants",
            "Pumice dust (from stonewashing)",
            "Alkaline pH effluent",
        ],
        "satellite_signature": (
            "Denim washing produces a distinctive blue-grey turbidity plume detectable "
            "in Sentinel-2 RGB. Stonewash sediment visible as suspended solids downstream. "
            "Foam accumulation in slow reaches near outfall."
        ),
    },

    # Quehenberger — Austrian 3PL logistics operator, textile/fashion transport specialist.
    # Kočani node is a warehousing/distribution facility (no manufacturing).
    # Source: quehenberger.com/en/Quehenberger-3A-Market-Leader-in-North-Macedonia
    "Quehenberger": {
        "industry_label": "Logistics & Warehousing (Quehenberger — distribution hub)",
        "risk": "low",
        "pollutants": [
            "Fuel/oil runoff from truck yard",
            "Tyre rubber particles",
            "Minor packaging waste",
        ],
        "satellite_signature": (
            "Oil sheen on drainage channels detectable after heavy rain in high-res imagery "
            "(Planet, Maxar). Hard-surface runoff from loading yard may carry suspended solids "
            "to nearest ditch. No chemical spectral signature in multispectral bands."
        ),
    },

    # Цинкарна — zinc processing facility near Probištip / Zletovo corridor.
    # Closely associated with the МХК Злетово Pb-Zn complex; area confirmed
    # as one of N. Macedonia's worst heavy-metal pollution hotspots.
    # Source: pubmed 19944530, ejatlas.org Veles smelter, USGS Minerals Yearbook 2019
    "Цинкарнa": {
        "industry_label": "Zinc / Lead Processing (МХК Злетово complex area)",
        "risk": "very-high",
        "pollutants": [
            "Cd (cadmium) — highly toxic, bioaccumulative",
            "Pb (lead)",
            "Zn (zinc)",
            "As (arsenic)",
            "Hg (mercury)",
            "H₂SO₄ / sulphates from ore processing",
            "Slag and tailings leachate",
            "AMD (acid mine drainage)",
        ],
        "satellite_signature": (
            "Orange-brown iron hydroxide precipitate stains riverbed and banks — visible "
            "in Sentinel-2 B4/B3/B2 RGB. Grey-white turbidity plumes in B2 (blue) band. "
            "Barren/bleached soil strips along drainage channels. Tailings ponds visible as "
            "grey polygons with sharp edges on Google Earth. Cadmium/lead anomalies "
            "detectable via SWIR band ratios in hyperspectral data."
        ),
    },

    # Гаматроникс — appears twice (sq 5 near Delčevo, sq 12 near Probištip).
    # No verified manufacturing profile found; likely a small electronics
    # assembly/repair shop rather than a heavy manufacturer.
    # Treat conservatively as light electronics assembly.
    "Гаматроникс": {
        "industry_label": "Electronics Assembly / Repair (unverified profile)",
        "risk": "low",
        "pollutants": [
            "Flux residues and solvents (IPA, acetone)",
            "Pb-free solder particulates",
            "Minor WEEE waste",
        ],
        "satellite_signature": (
            "No satellite-observable pollution signal. Any discharge is small-scale; "
            "in-situ sampling of nearest drainage channel recommended if confirmation needed."
        ),
    },
}

RULES = [
    # ── Very High ──────────────────────────────────────────────────────────────
    (r"цинкарн|zinc|zink|топилниц|smelter|lead.*zinc|pb.?zn",
     "Zinc / Lead Smelter",
     "very-high",
     ["Cd", "Pb", "Zn", "As", "Hg", "H₂SO₄", "slag leachate"],
     "Orange-brown iron precipitate on riverbed; grey-white turbidity plumes; "
     "bleached/barren soil strips along banks; visible in Sentinel-2 B4/B3/B2 "
     "RGB and SWIR bands. Cadmium/lead enrichment detectable via spectral anomalies."),

    (r"хемиск|chemical|hemisk|kemi",
     "Chemical Industry",
     "very-high",
     ["Solvents", "Acids", "NH₃", "Heavy metals", "COD spike"],
     "Foam accumulation and discoloration downstream. In multispectral imagery: "
     "NIR reflectance drop where organic load suppresses aquatic vegetation."),

    (r"rudin|рудин|mine|rudnik|руд",
     "Mining",
     "very-high",
     ["Cd", "Pb", "Zn", "As", "Sulphates", "Acid drainage"],
     "Orange/yellow AMD staining on riverbed. High turbidity plume "
     "detectable in Sentinel-2 B2 (blue) band. Tailings pond visible as "
     "grey polygons with sharp boundaries on Google Earth."),

    # ── High ───────────────────────────────────────────────────────────────────
    (r"текстил|tekstil|fabric|fashion|style|стил|трико|vima|arteks|"
     r"albatros|larstrade|fermateks|алунико|кондор|novtrend|vitezis|"
     r"mativa|modastar|apiteks|beteks|лукатекс|трендтекс|делпак|далија|витекс|"
     r"trend.*design|cn fashion|elviet|mk ti|милина свитс|nirvana.*текстил",
     "Textile / Garment",
     "high",
     ["Synthetic dyes (azo, reactive)", "Cr", "Cd", "Pb",
      "High BOD/COD", "Surfactants", "Alkaline pH (10–11)", "NaCl"],
     "Coloured water plumes visible in RGB satellite imagery (blue, brown, red "
     "tones depending on dye batch). Downstream foam accumulation in river "
     "eddies. Seasonal signal — stronger discharge during wet-processing runs. "
     "Reduced NDVI in riparian vegetation near outfall."),

    (r"телекабел|cable|кабел",
     "Cable Manufacturing",
     "high",
     ["PVC plasticisers (phthalates)", "Cu", "Pb", "Flame retardants"],
     "Subtle discoloration; plastic particulate matter may appear as surface "
     "sheen. Primarily detected via in-situ monitoring rather than satellite."),

    (r"quehenberger|логистик|logistic|transport",
     "Logistics / Industrial",
     "medium",
     ["Fuel/oil runoff", "Heavy metals from vehicles", "Suspended solids"],
     "Oil sheen on water surface visible in high-res RGB imagery after rain "
     "events. Parking lot runoff channels detectable as dark linear features."),

    # ── Medium ─────────────────────────────────────────────────────────────────
    (r"печатниц|pechatnic|print|европа 92|evropa",
     "Printing House",
     "medium",
     ["Petroleum solvents", "Cr/Pb pigments", "VOCs", "UV resins", "IPA"],
     "Algal blooms from organic load. Surfactant foam near outfall. "
     "No distinctive spectral signature; high-res change detection needed."),

    (r"anthura|anthurium|orchid|flower|цвет|оранжер|greenhouse|стакленик",
     "Floriculture / Greenhouse",
     "medium",
     ["Pesticides", "Fungicides (Cu-based)", "Nitrates", "Phosphates",
      "Growth regulators"],
     "Eutrophication: bright green algal bloom mats on water surface, "
     "detectable in Sentinel-2 Chl-a index (B5–B4)/(B5+B4). "
     "Increased turbidity downstream of drainage channels."),

    (r"агрофил|agrofil|агро|agro|земјоделск|farm|field",
     "Agriculture",
     "medium",
     ["Nitrates", "Phosphates", "Pesticide runoff", "Sediment"],
     "Eutrophic blooms (green/brown surface mats) in Sentinel-2 imagery. "
     "Turbidity spike after rain events — visible as suspended sediment plume "
     "in B2 (blue) band."),

    (r"гаматроникс|gamatroniks|electronic|електрон",
     "Electronics",
     "medium",
     ["Flux chemicals", "Solvents", "Pb (solder)", "Brominated compounds"],
     "No strong satellite-visible signature. Near-field water discoloration "
     "from flux/solder rinse; best detected by in-situ sampling."),

    # ── Low ────────────────────────────────────────────────────────────────────
    (r"млин|mlin|flour|mill|мелниц",
     "Flour Mill",
     "low",
     ["Organic BOD (starch, bran)", "Suspended solids"],
     "Milky/cream turbidity plume immediately downstream of outfall, "
     "dissipates within ~500m. Visible in high-res RGB (Planet, Maxar) "
     "during milling operations."),

    (r"хе |xe |хидро|hydro|електран|power.*station|dam|брана",
     "Hydroelectric",
     "low",
     ["Thermal pollution", "Sediment trapping", "Flow regime disruption"],
     "Sediment delta accumulation behind dam visible in multitemporal "
     "Sentinel-2. Turbidity difference upstream/downstream detectable in "
     "B2/B3 bands. No chemical spectral signature."),

    (r"шумско|forestry|гора|lumber|wood|дрво",
     "Forestry",
     "low",
     ["Organic debris", "Tannins (minor)"],
     "Slight brown tannin coloration in stream during logging operations. "
     "Change detection via NDVI time-series to monitor clear-cutting."),

    (r"филтер станица|filter|water treatment|пречистувач",
     "Water Treatment",
     "low",
     ["Chlorine by-products", "Sludge (if poorly managed)"],
     "Minimal river impact when operating correctly. Chlorination by-products "
     "not detectable via satellite."),
]

FALLBACK = {
    "industry_label": "General Industrial",
    "risk": "medium",
    "pollutants": ["Unknown industrial effluents", "Suspended solids", "BOD"],
    "satellite": "No specific spectral signature. Monitor for turbidity changes "
                 "and riparian NDVI decline in multitemporal analysis.",
}

RISK_ORDER = {"very-high": 0, "high": 1, "medium": 2, "low": 3}


def enrich_site(site: dict) -> dict:
    """
    Takes one site dict from river_industrial_data.json and returns it
    with added keys: industry_label, risk, pollutants, satellite_signature.

    Safe to call inside openstreettest.py right before appending site_obj.
    """
    osm_tags = site.get("osm_tags", {})

    haystack = " ".join(filter(None, [
        site.get("name", ""),
        site.get("type", ""),
        site.get("specifics", ""),  # already enriched above
        site.get("category",""),
        osm_tags.get("industrial", ""),
        osm_tags.get("product", ""),
        osm_tags.get("craft", ""),
        osm_tags.get("operator", ""),
        osm_tags.get("description", ""),
        osm_tags.get("wikipedia", "").split(":")[-1].replace("_", " "),
    ])).lower()

    for pattern, label, risk, pollutants, satellite in RULES:
        if re.search(pattern, haystack, re.IGNORECASE):
            site["industry_label"] = label
            site["risk"] = risk
            site["pollutants"] = pollutants
            site["satellite_signature"] = satellite
            break
    else:
        # No match → fallback
        site["industry_label"] = FALLBACK["industry_label"]
        site["risk"] = FALLBACK["risk"]
        site["pollutants"] = FALLBACK["pollutants"]
        site["satellite_signature"] = FALLBACK["satellite"]

    # Apply manual overrides last — always wins over regex
    override = OVERRIDES.get(site.get("name", ""))
    if override:
        site.update(override)

    return site


# ──────────────────────────────────────────────────────────────────────────────
# 2.  MAP RENDERER
# ──────────────────────────────────────────────────────────────────────────────

RISK_COLOR = {
    "very-high": "#e85d4a",
    "high":      "#e8903a",
    "medium":    "#d4b84a",
    "low":       "#4ac46e",
}

RISK_LABEL = {
    "very-high": "Very High",
    "high":      "High",
    "medium":    "Medium",
    "low":       "Low",
}

RISK_RADIUS = {
    "very-high": 14,
    "high":      10,
    "medium":    8,
    "low":       6,
}


def build_popup(site: dict) -> str:
    color = RISK_COLOR[site["risk"]]
    pollutants_html = "".join(f"<li>{p}</li>" for p in site["pollutants"])
    area_str = (f"{site['area_m2']:,.0f} m²" if site.get("area_m2", 0) > 0
                else "unknown")

    return f"""
    <div style="font-family:monospace;font-size:12px;max-width:340px;color:#1a1a2e">
      <div style="font-family:serif;font-size:16px;font-weight:bold;
                  border-bottom:2px solid {color};padding-bottom:4px;
                  margin-bottom:8px">{site['name']}</div>
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="color:#666;padding:2px 6px 2px 0">Industry</td>
            <td><b>{site['industry_label']}</b></td></tr>
        <tr><td style="color:#666;padding:2px 6px 2px 0">Risk</td>
            <td><b style="color:{color}">{RISK_LABEL[site['risk']]}</b></td></tr>
        <tr><td style="color:#666;padding:2px 6px 2px 0">OSM type</td>
            <td>{site.get('type','—')}</td></tr>
        <tr><td style="color:#666;padding:2px 6px 2px 0">Area</td>
            <td>{area_str}</td></tr>
        <tr><td style="color:#666;padding:2px 6px 2px 0">OSM ID</td>
            <td>{site.get('osm_id','—')}</td></tr>
      </table>

      <div style="margin-top:8px;padding:6px 8px;background:#f5f0e8;
                  border-radius:3px">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;
                    color:#888;margin-bottom:4px">Key Pollutants</div>
        <ul style="margin:0;padding-left:16px;color:#333">{pollutants_html}</ul>
      </div>

      <div style="margin-top:6px;padding:6px 8px;background:#e8f4fd;
                  border-radius:3px;border-left:3px solid #3a8fc4">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;
                    color:#3a8fc4;margin-bottom:4px">🛰 Satellite-Observable</div>
        <div style="color:#333;font-size:11px;line-height:1.5">
          {site['satellite_signature']}
        </div>
      </div>
    </div>
    """


def render_map(enriched_data: list, output_path: str = "pollution_map.html"):
    m = folium.Map(
        location=[41.87, 22.55],
        zoom_start=9,
        tiles="CartoDB dark_matter",
    )

    # ── Risk layer groups (so user can toggle by risk) ──
    layer_groups = {
        risk: folium.FeatureGroup(name=f"⬤ {RISK_LABEL[risk]} Risk", show=True)
        for risk in RISK_COLOR
    }

    # ── Draw schematic Bregalnica line ──
    river_coords = [
        (41.963, 22.782), (41.945, 22.790), (41.956, 22.789),
        (41.971, 22.578), (41.892, 22.487), (41.886, 22.500),
        (41.855, 22.436), (41.914, 22.419), (41.904, 22.385),
        (41.898, 22.382), (41.770, 22.178), (41.757, 22.168),
        (41.754, 22.176), (41.745, 22.187), (41.757, 22.217),
    ]
    folium.PolyLine(
        river_coords,
        color="#3a8fc4", weight=2.5, opacity=0.5,
        dash_array="6 4",
        tooltip="Bregalnica River (schematic)",
    ).add_to(m)

    # ── Plot each site ──
    seen = set()
    stats = {"very-high": 0, "high": 0, "medium": 0, "low": 0}

    for square in enriched_data:
        for site in square.get("sites", []):
            key = (site["lat"], site["lon"])
            if key in seen:
                continue
            seen.add(key)

            risk = site["risk"]
            stats[risk] += 1
            color = RISK_COLOR[risk]
            radius = RISK_RADIUS[risk]

            folium.CircleMarker(
                location=[site["lat"], site["lon"]],
                radius=radius,
                color=color,
                fill=True,
                fill_color=color,
                fill_opacity=0.85,
                weight=1.5,
                popup=folium.Popup(build_popup(site), max_width=360),
                tooltip=f"{site['name']} — {RISK_LABEL[risk]} Risk",
            ).add_to(layer_groups[risk])

    for lg in layer_groups.values():
        lg.add_to(m)

    # ── Legend ──
    legend_html = """
    <div style="position:fixed;bottom:30px;left:30px;z-index:9999;
                background:#13161e;border:1px solid #1e2330;border-radius:6px;
                padding:14px 18px;font-family:monospace;color:#e8dcc8;
                box-shadow:0 4px 20px rgba(0,0,0,0.5)">
      <div style="font-family:serif;font-size:14px;margin-bottom:10px;
                  border-bottom:1px solid #1e2330;padding-bottom:6px">
        Pollution Risk — Bregalnica Basin
      </div>
      <div style="font-size:11px;color:#5a6075;margin-bottom:8px;
                  text-transform:uppercase;letter-spacing:.1em">River Impact</div>
    """
    for risk, label in RISK_LABEL.items():
        c = RISK_COLOR[risk]
        n = stats[risk]
        legend_html += f"""
      <div style="display:flex;align-items:center;gap:8px;margin:5px 0">
        <div style="width:12px;height:12px;border-radius:50%;
                    background:{c};flex-shrink:0"></div>
        <span style="color:#c0c8d8">{label}</span>
        <span style="color:#5a6075;margin-left:auto;padding-left:12px">{n} sites</span>
      </div>"""

    legend_html += """
      <div style="margin-top:10px;padding-top:8px;border-top:1px solid #1e2330;
                  font-size:10px;color:#5a6075">
        Click markers for pollutants + satellite signature
      </div>
    </div>"""

    m.get_root().html.add_child(folium.Element(legend_html))
    folium.LayerControl(collapsed=False).add_to(m)

    m.save(output_path)
    print(f"\nMap saved → {output_path}")
    print(f"Sites mapped: {sum(stats.values())} unique")
    for risk, n in stats.items():
        print(f"  {RISK_LABEL[risk]:10s}: {n}")


# ──────────────────────────────────────────────────────────────────────────────
# 3.  MAIN — load JSON, enrich, save, render
# ──────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    input_path = Path("river_industrial_data.json")
    if not input_path.exists():
        print(f"ERROR: {input_path} not found. Run openstreettest.py first.")
        raise SystemExit(1)

    with open(input_path, encoding="utf-8") as f:
        data = json.load(f)

    # Enrich every site in-place
    for square in data:
        square["sites"] = [enrich_site(s) for s in square.get("sites", [])]

    # Save enriched JSON
    enriched_path = "river_industrial_data_enriched.json"
    with open(enriched_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4, ensure_ascii=False)
    print(f"Enriched JSON saved → {enriched_path}")

    render_map(data, "pollution_map.html")