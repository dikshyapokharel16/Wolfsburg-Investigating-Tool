"""
build_activity_heatmap.py
Fetches venue data from Foursquare Places + Google Places for Wolfsburg,
aggregates review/visit density onto a 250m grid, and produces a
Folium multi-layer heatmap HTML for comparison with the existing
OSM-derived frequency scores.

Run from the project root:
  pip install folium
  python scripts/build_activity_heatmap.py
"""

import json
import math
import os
import time
import urllib.request
import urllib.parse
from collections import defaultdict

import folium
from folium.plugins import HeatMap

# ── Config ─────────────────────────────────────────────────────────────────────
FOURSQUARE_KEY      = "JWESM55MPZYO41LQDUKEEFPDME0LOIN2YLVQ5VH0F01EOJQN"
GOOGLE_KEY          = "AIzaSyCdiOGnlZxp5tH9wJ7YQOv6w2DT4A4b7rE"
GOOGLE_MAX_REQUESTS = 15        # hard cap — ~$0.032 each → max ~$0.48
GOOGLE_COST_PER_REQ = 0.032

BBOX = {
    'sw_lat': 52.28, 'sw_lon': 10.75,
    'ne_lat': 52.47, 'ne_lon': 10.98,
}
WOLFSBURG_CENTER = (52.423, 10.787)
GRID_CELL_M = 250

ROOT               = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_DIR         = os.path.join(ROOT, 'outputs')
OUTPUT_HTML        = os.path.join(OUTPUT_DIR, 'wolfsburg_activity_heatmap.html')
PUBLIC_SPACES_FILE = os.path.join(ROOT, 'src', 'data', 'publicSpaces.json')
GOOGLE_CACHE_FILE  = os.path.join(OUTPUT_DIR, 'google_places_cache.json')
FSQ_CACHE_FILE     = os.path.join(OUTPUT_DIR, 'foursquare_cache.json')

os.makedirs(OUTPUT_DIR, exist_ok=True)

# ── Grid helpers ───────────────────────────────────────────────────────────────

def metres_per_deg_lat():
    return 111_000.0

def metres_per_deg_lon(lat):
    return 111_000.0 * math.cos(math.radians(lat))

def build_grid(bbox, cell_m):
    """Returns grid metadata dict."""
    mlat = metres_per_deg_lat()
    mlon = metres_per_deg_lon((bbox['sw_lat'] + bbox['ne_lat']) / 2)
    dlat = cell_m / mlat
    dlon = cell_m / mlon
    rows = math.ceil((bbox['ne_lat'] - bbox['sw_lat']) / dlat)
    cols = math.ceil((bbox['ne_lon'] - bbox['sw_lon']) / dlon)
    return {'bbox': bbox, 'dlat': dlat, 'dlon': dlon, 'rows': rows, 'cols': cols}

def cell_index(lat, lon, grid):
    row = int((lat - grid['bbox']['sw_lat']) / grid['dlat'])
    col = int((lon - grid['bbox']['sw_lon']) / grid['dlon'])
    row = max(0, min(row, grid['rows'] - 1))
    col = max(0, min(col, grid['cols'] - 1))
    return (row, col)

def cell_centre(row, col, grid):
    lat = grid['bbox']['sw_lat'] + (row + 0.5) * grid['dlat']
    lon = grid['bbox']['sw_lon'] + (col + 0.5) * grid['dlon']
    return lat, lon

def in_bbox(lat, lon, bbox):
    return bbox['sw_lat'] <= lat <= bbox['ne_lat'] and bbox['sw_lon'] <= lon <= bbox['ne_lon']

# ── HTTP helper ────────────────────────────────────────────────────────────────

def get_json(url, headers=None, retries=2):
    req = urllib.request.Request(url, headers=headers or {})
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.loads(r.read().decode())
        except Exception as e:
            if attempt < retries:
                time.sleep(3)
            else:
                raise RuntimeError(f"Request failed: {e}\n  URL: {url[:120]}")

# ── Foursquare ─────────────────────────────────────────────────────────────────

def fetch_foursquare(bbox, api_key):
    """
    Returns list of dicts: {name, lat, lon, categories}.
    Uses bbox search, up to 50 results per call.
    Makes multiple calls split by category group to maximise coverage.
    """
    base = 'https://api.foursquare.com/v3/places/search'
    headers = {
        'Authorization': api_key,
        'Accept': 'application/json',
    }

    # Category IDs — Foursquare v3 taxonomy (top-level groups)
    category_groups = {
        'Food & Drink':   '13000',
        'Arts & Culture': '10000',
        'Retail':         '17000',
        'Outdoors':       '16000',
        'Community':      '12000',
    }

    venues = {}
    for group_name, cat_id in category_groups.items():
        params = urllib.parse.urlencode({
            'ne':         f"{bbox['ne_lat']},{bbox['ne_lon']}",
            'sw':         f"{bbox['sw_lat']},{bbox['sw_lon']}",
            'categories': cat_id,
            'limit':      50,
            'fields':     'fsq_id,name,geocodes,categories',
        })
        url = f"{base}?{params}"
        print(f"  Foursquare [{group_name}]…", end=' ', flush=True)
        try:
            data = get_json(url, headers=headers)
            results = data.get('results', [])
            for v in results:
                geo = v.get('geocodes', {}).get('main', {})
                lat, lon = geo.get('latitude'), geo.get('longitude')
                if lat is None or lon is None:
                    continue
                if not in_bbox(lat, lon, bbox):
                    continue
                fsq_id = v.get('fsq_id', '')
                if fsq_id not in venues:
                    cats = [c.get('name', '') for c in v.get('categories', [])]
                    venues[fsq_id] = {
                        'name': v.get('name', ''),
                        'lat': lat,
                        'lon': lon,
                        'categories': cats,
                        'group': group_name,
                    }
            print(f"{len(results)} results")
        except Exception as e:
            print(f"FAILED ({e})")
        time.sleep(1)

    return list(venues.values())

# ── Google Places ──────────────────────────────────────────────────────────────

def fetch_google_places(bbox, api_key, max_requests):
    """
    Returns list of dicts: {name, lat, lon, rating, review_count}.
    Uses Nearby Search from multiple centre points to cover the bbox.
    Hard-capped at max_requests API calls.
    """
    base = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json'

    # 5 search centres covering Wolfsburg
    centres = [
        (52.423, 10.787),   # city centre
        (52.443, 10.748),   # north-west (Fallersleben area)
        (52.400, 10.820),   # south-east
        (52.460, 10.800),   # north
        (52.395, 10.760),   # south-west
    ]
    radius = 4000  # metres — overlapping circles cover the bbox

    places   = {}
    req_count = 0
    cost_so_far = 0.0

    for centre_lat, centre_lon in centres:
        if req_count >= max_requests:
            print(f"  Google: hit {max_requests}-request cap, stopping.")
            break

        params = urllib.parse.urlencode({
            'location': f"{centre_lat},{centre_lon}",
            'radius':   radius,
            'key':      api_key,
        })
        url = f"{base}?{params}"
        page = 0

        while url and req_count < max_requests:
            req_count  += 1
            cost_so_far = req_count * GOOGLE_COST_PER_REQ
            print(f"  Google request {req_count}/{max_requests} "
                  f"(est. cost so far: ${cost_so_far:.2f})…", end=' ', flush=True)
            try:
                data = get_json(url)
            except Exception as e:
                print(f"FAILED ({e})")
                break

            results = data.get('results', [])
            print(f"{len(results)} results")

            for p in results:
                place_id = p.get('place_id', '')
                loc = p.get('geometry', {}).get('location', {})
                lat, lon = loc.get('lat'), loc.get('lng')
                if lat is None or not in_bbox(lat, lon, bbox):
                    continue
                if place_id not in places:
                    places[place_id] = {
                        'name':         p.get('name', ''),
                        'lat':          lat,
                        'lon':          lon,
                        'rating':       p.get('rating', 0),
                        'review_count': p.get('user_ratings_total', 0),
                        'types':        p.get('types', []),
                    }

            token = data.get('next_page_token')
            if token and page < 2:
                page += 1
                url = f"{base}?pagetoken={token}&key={api_key}"
                time.sleep(2)  # Google requires a short delay before next_page_token is valid
            else:
                url = None

        time.sleep(1)

    print(f"  Google total: {len(places)} unique places, "
          f"{req_count} requests, est. cost ${req_count * GOOGLE_COST_PER_REQ:.2f}")
    return list(places.values())

# ── OSM public spaces ──────────────────────────────────────────────────────────

def load_osm_spaces(path):
    """Returns list of {lat, lon, score} from publicSpaces.json."""
    with open(path, encoding='utf-8-sig') as f:
        fc = json.load(f)
    out = []
    for feat in fc.get('features', []):
        lon, lat = feat['geometry']['coordinates']
        score = feat['properties'].get('frequencyScore', 0)
        out.append({'lat': lat, 'lon': lon, 'score': score})
    return out

# ── Aggregation ────────────────────────────────────────────────────────────────

def aggregate_venue_density(venues, grid):
    """Each venue counts as 1. Returns {(row,col): count}."""
    counts = defaultdict(int)
    for v in venues:
        counts[cell_index(v['lat'], v['lon'], grid)] += 1
    return counts

def aggregate_review_density(places, grid):
    """Weight = log(review_count + 1). Returns {(row,col): weight}."""
    weights = defaultdict(float)
    for p in places:
        w = math.log1p(p.get('review_count', 0))
        weights[cell_index(p['lat'], p['lon'], grid)] += w
    return weights

def aggregate_osm_scores(spaces, grid):
    """Weight = frequencyScore. Returns {(row,col): total_score}."""
    scores = defaultdict(float)
    for s in spaces:
        scores[cell_index(s['lat'], s['lon'], grid)] += s['score']
    return scores

def to_heatmap_data(cell_dict, grid, normalise=True):
    """Converts {(row,col): value} → [[lat, lon, intensity], ...]."""
    if not cell_dict:
        return []
    max_val = max(cell_dict.values()) or 1
    data = []
    for (row, col), val in cell_dict.items():
        lat, lon = cell_centre(row, col, grid)
        intensity = (val / max_val) if normalise else val
        data.append([lat, lon, intensity])
    return data

# ── Folium map ─────────────────────────────────────────────────────────────────

def build_map(grid, osm_data, fsq_data, google_data):
    m = folium.Map(
        location=list(WOLFSBURG_CENTER),
        zoom_start=12,
        tiles='CartoDB positron',
    )

    heatmap_opts = dict(
        radius=18,
        blur=15,
        min_opacity=0.3,
        max_zoom=16,
    )

    if osm_data:
        fg_osm = folium.FeatureGroup(name='OSM Frequency Score', show=True)
        HeatMap(osm_data, **heatmap_opts,
                gradient={'0.3': '#3b82f6', '0.6': '#22c55e', '0.8': '#f59e0b', '1.0': '#ef4444'}
                ).add_to(fg_osm)
        fg_osm.add_to(m)

    if fsq_data:
        fg_fsq = folium.FeatureGroup(name='Foursquare Venue Density', show=False)
        HeatMap(fsq_data, **heatmap_opts,
                gradient={'0.3': '#818cf8', '0.6': '#a78bfa', '0.8': '#7c3aed', '1.0': '#4c1d95'}
                ).add_to(fg_fsq)
        fg_fsq.add_to(m)

    if google_data:
        fg_goog = folium.FeatureGroup(name='Google Review Density', show=False)
        HeatMap(google_data, **heatmap_opts,
                gradient={'0.3': '#fbbf24', '0.6': '#f97316', '0.8': '#ef4444', '1.0': '#7f1d1d'}
                ).add_to(fg_goog)
        fg_goog.add_to(m)

    folium.LayerControl(collapsed=False).add_to(m)

    # Legend
    legend_html = """
    <div style="position:fixed;bottom:30px;left:30px;z-index:1000;
                background:white;padding:12px 16px;border-radius:8px;
                box-shadow:0 2px 8px rgba(0,0,0,0.15);font-family:system-ui,sans-serif;
                font-size:12px;line-height:1.8">
      <b style="font-size:13px">Activity Frequency Comparison</b><br>
      <span style="color:#3b82f6">&#9632;</span> OSM Frequency Score<br>
      <span style="color:#7c3aed">&#9632;</span> Foursquare Venue Density<br>
      <span style="color:#f97316">&#9632;</span> Google Review Density<br>
      <hr style="margin:6px 0;border-color:#e5e7eb">
      <span style="color:#9ca3af;font-size:10px">Toggle layers top-right</span>
    </div>"""
    m.get_root().html.add_child(folium.Element(legend_html))

    return m

# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    grid = build_grid(BBOX, GRID_CELL_M)
    print(f"Grid: {grid['rows']} rows × {grid['cols']} cols "
          f"({grid['rows'] * grid['cols']} cells at {GRID_CELL_M}m)")

    # OSM
    print('\nLoading OSM public spaces…')
    osm_spaces = load_osm_spaces(PUBLIC_SPACES_FILE)
    print(f'  {len(osm_spaces)} spaces loaded')

    # Foursquare — use cache if available
    if os.path.exists(FSQ_CACHE_FILE):
        print('\nLoading Foursquare from cache…')
        with open(FSQ_CACHE_FILE, encoding='utf-8') as f:
            fsq_venues = json.load(f)
        print(f'  {len(fsq_venues)} venues (cached)')
    else:
        print('\nFetching Foursquare venues (first run only)…')
        fsq_venues = fetch_foursquare(BBOX, FOURSQUARE_KEY)
        with open(FSQ_CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(fsq_venues, f)
        print(f'  {len(fsq_venues)} venues saved to cache')

    # Google Places — use cache if available
    if os.path.exists(GOOGLE_CACHE_FILE):
        print('\nLoading Google Places from cache…')
        with open(GOOGLE_CACHE_FILE, encoding='utf-8') as f:
            google_places = json.load(f)
        print(f'  {len(google_places)} places (cached, no API calls made)')
    else:
        print(f'\nFetching Google Places (first run only, hard cap: {GOOGLE_MAX_REQUESTS} requests)…')
        google_places = fetch_google_places(BBOX, GOOGLE_KEY, GOOGLE_MAX_REQUESTS)
        with open(GOOGLE_CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(google_places, f)
        print(f'  {len(google_places)} places saved to cache')

    # Aggregate
    print('\nAggregating to grid…')
    osm_grid    = aggregate_osm_scores(osm_spaces, grid)
    fsq_grid    = aggregate_venue_density(fsq_venues, grid)
    google_grid = aggregate_review_density(google_places, grid)

    osm_heat    = to_heatmap_data(osm_grid, grid)
    fsq_heat    = to_heatmap_data(fsq_grid, grid)
    google_heat = to_heatmap_data(google_grid, grid)

    print(f'  OSM:       {len(osm_heat)} cells with data')
    print(f'  Foursquare:{len(fsq_heat)} cells with data')
    print(f'  Google:    {len(google_heat)} cells with data')

    # Build map
    print('\nBuilding Folium map…')
    m = build_map(grid, osm_heat, fsq_heat, google_heat)
    m.save(OUTPUT_HTML)
    print(f'\nSaved → {OUTPUT_HTML}')
    print('Open the HTML file in any browser to explore.')

main()
