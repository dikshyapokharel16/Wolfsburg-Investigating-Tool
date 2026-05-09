"""
build_hotspots.py
Queries Overpass API for public spaces in Wolfsburg, scores them using a
composite formula (typology + spillover + transit + area), selects the top 15
per district, and writes a new src/data/publicSpaces.json.

Run from the project root:
  python scripts/build_hotspots.py
"""

import json
import math
import os
import time
from collections import defaultdict
import urllib.request
import urllib.parse

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "src", "data")
DISTRICT_FILE = os.path.join(DATA_DIR, "districtBoundaries.json")
OUTPUT_FILE = os.path.join(DATA_DIR, "publicSpaces.json")

TOP_N = 15  # top spaces per district

# Maps OSM tag combination keys → existing app typology schema
TYPOLOGY_MAP = {
    "attraction":     {"typology": "Civic / Cultural Forecourt", "typologyId": 10, "color": "#8b5cf6", "base": 40},
    "square":         {"typology": "Civic Plaza",                "typologyId": 1,  "color": "#f59e0b", "base": 38},
    "pedestrian":     {"typology": "Civic Plaza",                "typologyId": 1,  "color": "#f59e0b", "base": 38},
    "marketplace":    {"typology": "Urban Plaza / Transit Plaza", "typologyId": 11, "color": "#3b82f6", "base": 35},
    "park_large":     {"typology": "Neighborhood Park",          "typologyId": 2,  "color": "#22c55e", "base": 32},
    "park_small":     {"typology": "Pocket Park",                "typologyId": 3,  "color": "#86efac", "base": 22},
    "garden":         {"typology": "Pocket Park",                "typologyId": 3,  "color": "#86efac", "base": 18},
    "playground":     {"typology": "Playground",                 "typologyId": 6,  "color": "#ec4899", "base": 18},
    "nature_reserve": {"typology": "Linear Park / Greenway",     "typologyId": 4,  "color": "#16a34a", "base": 14},
}

TIER_THRESHOLDS = [
    (70, "very-high", "#ef4444"),
    (50, "high",      "#f97316"),
    (30, "medium",    "#f59e0b"),
    (15, "low",       "#22c55e"),
    (0,  "very-low",  "#3b82f6"),
]


# ── Geometry helpers ─────────────────────────────────────────────────────────

def haversine_m(lat1, lon1, lat2, lon2):
    R = 6371000
    p = math.pi / 180
    a = (math.sin((lat2 - lat1) * p / 2) ** 2 +
         math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2)
    return 2 * R * math.asin(math.sqrt(min(1, a)))


def point_in_ring(lon, lat, ring):
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def point_in_geometry(lon, lat, geometry):
    gtype = geometry["type"]
    if gtype == "Polygon":
        return point_in_ring(lon, lat, geometry["coordinates"][0])
    elif gtype == "MultiPolygon":
        return any(point_in_ring(lon, lat, poly[0]) for poly in geometry["coordinates"])
    return False


# ── Overpass ─────────────────────────────────────────────────────────────────

def overpass_query(query, retries=2):
    data = urllib.parse.urlencode({"data": query}).encode()
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(OVERPASS_URL, data=data,
                                         headers={"User-Agent": "WolfsburgHotspotBuilder/1.0"})
            with urllib.request.urlopen(req, timeout=120) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            if attempt < retries:
                print(f"  Retrying ({attempt + 1}/{retries})…")
                time.sleep(5)
            else:
                raise RuntimeError(f"Overpass query failed: {e}") from e


# ── Scoring helpers ───────────────────────────────────────────────────────────

def area_score(area_ha):
    return min(10, math.sqrt(max(0, area_ha)) * 4)


def transit_score(dist_m):
    if dist_m < 100:  return 20
    if dist_m < 250:  return 15
    if dist_m < 500:  return 10
    if dist_m < 800:  return 5
    return 0


def spillover_score(count):
    return min(30, count * 2.5)


def tier_from_score(score):
    for threshold, tier, _ in TIER_THRESHOLDS:
        if score >= threshold:
            return tier
    return "very-low"


def get_typology_key(tags):
    if tags.get("tourism") == "attraction":
        return "attraction"
    if tags.get("place") == "square":
        return "square"
    if tags.get("highway") == "pedestrian" and tags.get("area") == "yes":
        return "pedestrian"
    if tags.get("amenity") == "marketplace":
        return "marketplace"
    if tags.get("leisure") == "nature_reserve":
        return "nature_reserve"
    if tags.get("leisure") == "playground":
        return "playground"
    if tags.get("leisure") == "garden":
        return "garden"
    if tags.get("leisure") == "park":
        return "park_large"  # refined by area below
    return None


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    # Load district boundaries
    print("Loading district boundaries…")
    for enc in ("utf-8-sig", "utf-8"):
        try:
            with open(DISTRICT_FILE, encoding=enc) as f:
                district_data = json.load(f)
            break
        except UnicodeDecodeError:
            continue

    districts = {}       # name → list of geometry dicts
    district_centroids = {}  # name → (lon, lat)

    for name, fc in district_data.items():
        if not fc.get("features"):
            continue
        geometries = [feat["geometry"] for feat in fc["features"]]
        districts[name] = geometries

        all_lons, all_lats = [], []
        for geom in geometries:
            rings = geom["coordinates"] if geom["type"] == "Polygon" else [p[0] for p in geom["coordinates"]]
            for ring in rings:
                for lon, lat in ring:
                    all_lons.append(lon)
                    all_lats.append(lat)
        district_centroids[name] = (sum(all_lons) / len(all_lons), sum(all_lats) / len(all_lats))

    print(f"  Loaded {len(districts)} districts")

    # Query A — public spaces
    print("\nQuerying Overpass: public spaces…")
    query_a = """[out:json][timeout:90];
area["name"="Wolfsburg"]["boundary"="administrative"]->.wb;
(
  node(area.wb)[leisure~"^(park|playground|garden|nature_reserve)$"];
  way(area.wb)[leisure~"^(park|playground|garden|nature_reserve)$"];
  node(area.wb)[place=square];
  way(area.wb)[place=square];
  way(area.wb)[highway=pedestrian][area=yes];
  node(area.wb)[tourism=attraction];
  way(area.wb)[tourism=attraction];
  node(area.wb)[amenity=marketplace];
  way(area.wb)[amenity=marketplace];
);
out body; >; out skel qt;"""

    data_a = overpass_query(query_a)

    # Build node-coordinate lookup (needed for way centroids)
    node_coords = {}
    for el in data_a["elements"]:
        if el["type"] == "node" and "lat" in el:
            node_coords[el["id"]] = (el["lat"], el["lon"])

    print(f"  Got {len(data_a['elements'])} elements, {len(node_coords)} node coords")

    # Query B — commercial spillover sources
    print("Querying Overpass: commercial amenities…")
    time.sleep(2)
    query_b = """[out:json][timeout:60];
area["name"="Wolfsburg"]["boundary"="administrative"]->.wb;
(
  node(area.wb)[amenity~"^(restaurant|cafe|bar|fast_food|pub|food_court|supermarket)$"];
  node(area.wb)[shop~"^(supermarket|convenience|mall|department_store)$"];
);
out body;"""

    data_b = overpass_query(query_b)
    commercial = [(el["lat"], el["lon"]) for el in data_b["elements"]
                  if el["type"] == "node" and "lat" in el]
    print(f"  Found {len(commercial)} commercial nodes")

    # Query C — bus stops
    print("Querying Overpass: bus stops…")
    time.sleep(2)
    query_c = """[out:json][timeout:30];
area["name"="Wolfsburg"]["boundary"="administrative"]->.wb;
node(area.wb)[highway=bus_stop];
out body;"""

    data_c = overpass_query(query_c)
    bus_stops = [(el["lat"], el["lon"]) for el in data_c["elements"]
                 if el["type"] == "node" and "lat" in el]
    print(f"  Found {len(bus_stops)} bus stops")

    # Parse public spaces from Query A
    print("\nParsing public spaces…")
    spaces = []
    seen_ids = set()

    for el in data_a["elements"]:
        if el["type"] not in ("node", "way"):
            continue
        if el["id"] in seen_ids:
            continue

        tags = el.get("tags", {})
        name = tags.get("name", "").strip()
        if not name:
            continue

        typ_key = get_typology_key(tags)
        if typ_key is None:
            continue

        # Coordinates and rough area
        if el["type"] == "node":
            if "lat" not in el:
                continue
            lat, lon = el["lat"], el["lon"]
            area_ha = 0.1
        else:  # way
            node_list = el.get("nodes", [])
            coords = [node_coords[n] for n in node_list if n in node_coords]
            if not coords:
                continue
            lat = sum(c[0] for c in coords) / len(coords)
            lon = sum(c[1] for c in coords) / len(coords)
            area_ha = len(node_list) * 0.003

        # Override with OSM area tag if present (stored as m²)
        try:
            area_ha = float(tags["area"]) / 10000
        except (KeyError, ValueError, TypeError):
            pass

        # Refine park classification by area
        if typ_key == "park_large" and area_ha < 2:
            typ_key = "park_small"

        seen_ids.add(el["id"])
        spaces.append({
            "id": el["id"],
            "name": name,
            "typ_key": typ_key,
            "lat": lat,
            "lon": lon,
            "area_ha": max(0.05, area_ha),
        })

    print(f"  Parsed {len(spaces)} named public spaces")

    # District assignment
    print("Assigning spaces to districts…")
    for sp in spaces:
        assigned = None
        for dname, geometries in districts.items():
            for geom in geometries:
                if point_in_geometry(sp["lon"], sp["lat"], geom):
                    assigned = dname
                    break
            if assigned:
                break

        if not assigned:
            # Fallback: nearest district centroid
            best = min(district_centroids.items(),
                       key=lambda item: haversine_m(sp["lat"], sp["lon"], item[1][1], item[1][0]))
            assigned = best[0]

        sp["district"] = assigned

    # Composite scoring
    print("Scoring spaces…")
    for sp in spaces:
        base = TYPOLOGY_MAP[sp["typ_key"]]["base"]
        a_sc = area_score(sp["area_ha"])

        sp_count = sum(1 for (clat, clon) in commercial
                       if haversine_m(sp["lat"], sp["lon"], clat, clon) < 250)
        spl_sc = spillover_score(sp_count)

        min_dist = (min(haversine_m(sp["lat"], sp["lon"], blat, blon) for blat, blon in bus_stops)
                    if bus_stops else 9999)
        tr_sc = transit_score(min_dist)

        total = min(100, int(base + a_sc + spl_sc + tr_sc))
        sp["frequencyScore"] = total
        sp["frequencyTier"] = tier_from_score(total)
        sp["spilloverCount"] = sp_count
        sp["transitDistM"] = int(min_dist)

    # Select top N per district
    print(f"Selecting top {TOP_N} per district…")
    by_district = defaultdict(list)
    for sp in spaces:
        by_district[sp["district"]].append(sp)

    selected = []
    for dname, dspaces in sorted(by_district.items()):
        dspaces.sort(key=lambda x: x["frequencyScore"], reverse=True)
        selected.extend(dspaces[:TOP_N])

    print(f"  {len(selected)} spaces across {len(by_district)} districts")

    # Build GeoJSON
    features = []
    for sp in selected:
        typ_info = TYPOLOGY_MAP[sp["typ_key"]]
        area_ha = sp["area_ha"]
        area_str = f"{area_ha:.1f} ha" if area_ha >= 1 else f"{int(area_ha * 10000)} m²"

        desc = f"{typ_info['typology']} in {sp['district']}."
        if sp["spilloverCount"] > 0:
            desc += f" {sp['spilloverCount']} commercial amenities within 250 m."

        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [round(sp["lon"], 6), round(sp["lat"], 6)]},
            "properties": {
                "name": sp["name"],
                "typology": typ_info["typology"],
                "typologyId": typ_info["typologyId"],
                "color": typ_info["color"],
                "areaHa": round(area_ha, 2),
                "area": area_str,
                "description": desc,
                "status": "Exists",
                "district": sp["district"],
                "frequencyScore": sp["frequencyScore"],
                "frequencyTier": sp["frequencyTier"],
            },
        })

    geojson = {"type": "FeatureCollection", "features": features}

    print(f"\nWriting {len(features)} features → {OUTPUT_FILE}")
    with open(OUTPUT_FILE, "w", encoding="utf-8-sig") as f:
        json.dump(geojson, f, ensure_ascii=False, indent=2)

    # Summary
    tier_counts = defaultdict(int)
    for feat in features:
        tier_counts[feat["properties"]["frequencyTier"]] += 1

    print("\nTier distribution:")
    for tier in ["very-high", "high", "medium", "low", "very-low"]:
        print(f"  {tier:10s}: {tier_counts[tier]}")

    top5 = sorted(features, key=lambda x: x["properties"]["frequencyScore"], reverse=True)[:5]
    print("\nTop 5 spaces:")
    for feat in top5:
        p = feat["properties"]
        print(f"  {p['name']:<35} {p['district']:<25} score={p['frequencyScore']} [{p['frequencyTier']}]")

    print("\nDone.")


if __name__ == "__main__":
    main()
