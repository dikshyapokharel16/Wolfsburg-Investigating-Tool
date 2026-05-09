/**
 * build_activity_heatmap.mjs
 * Fetches Foursquare + Google Places venue data for Wolfsburg,
 * aggregates onto a 250m grid, and writes a Leaflet heatmap HTML.
 *
 * Run from project root:
 *   node scripts/build_activity_heatmap.mjs
 *
 * Data is cached after the first run — no further API calls needed.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// Load keys from .env file (never commit .env to git)
const envPath = resolve(ROOT, '.env')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const [k, ...rest] = line.split('=')
    if (k && rest.length) process.env[k.trim()] ??= rest.join('=').trim()
  }
}

const FOURSQUARE_KEY      = process.env.FOURSQUARE_KEY_MJS ?? ''
const GOOGLE_KEY          = process.env.GOOGLE_KEY ?? ''
const GOOGLE_MAX_REQUESTS = 15

if (!FOURSQUARE_KEY || !GOOGLE_KEY) {
  console.error('Missing FOURSQUARE_KEY_MJS or GOOGLE_KEY in .env — aborting.')
  process.exit(1)
}

const BBOX = { swLat: 52.28, swLon: 10.75, neLat: 52.47, neLon: 10.98 }
const CENTER = [52.423, 10.787]
const GRID_M = 250

const OUTPUT_DIR       = resolve(ROOT, 'outputs')
const OUTPUT_HTML      = resolve(OUTPUT_DIR, 'wolfsburg_activity_heatmap.html')
const GOOGLE_CACHE     = resolve(OUTPUT_DIR, 'google_places_cache.json')
const FSQ_CACHE        = resolve(OUTPUT_DIR, 'foursquare_cache.json')
const PUBLIC_SPACES    = resolve(ROOT, 'src/data/publicSpaces.json')

if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR)

// ── Grid ──────────────────────────────────────────────────────────────────────

function buildGrid(bbox, cellM) {
  const mLat = 111000
  const mLon = 111000 * Math.cos((bbox.swLat + bbox.neLat) / 2 * Math.PI / 180)
  const dLat = cellM / mLat
  const dLon = cellM / mLon
  const rows = Math.ceil((bbox.neLat - bbox.swLat) / dLat)
  const cols = Math.ceil((bbox.neLon - bbox.swLon) / dLon)
  return { bbox, dLat, dLon, rows, cols }
}

function cellIndex(lat, lon, g) {
  const row = Math.max(0, Math.min(g.rows - 1, Math.floor((lat - g.bbox.swLat) / g.dLat)))
  const col = Math.max(0, Math.min(g.cols - 1, Math.floor((lon - g.bbox.swLon) / g.dLon)))
  return `${row}:${col}`
}

function cellCentre(key, g) {
  const [row, col] = key.split(':').map(Number)
  return [
    g.bbox.swLat + (row + 0.5) * g.dLat,
    g.bbox.swLon + (col + 0.5) * g.dLon,
  ]
}

function inBbox(lat, lon, bbox) {
  return lat >= bbox.swLat && lat <= bbox.neLat && lon >= bbox.swLon && lon <= bbox.neLon
}

// ── HTTP ──────────────────────────────────────────────────────────────────────

async function getJSON(url, headers = {}) {
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url.slice(0, 100)}`)
  return res.json()
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

// ── Foursquare ────────────────────────────────────────────────────────────────

async function fetchFoursquare(bbox, key) {
  const base = 'https://api.foursquare.com/v3/places/search'
  const headers = { Authorization: key, Accept: 'application/json' }

  const categoryGroups = {
    'Food & Drink':   '13000',
    'Arts & Culture': '10000',
    'Retail':         '17000',
    'Outdoors':       '16000',
    'Community':      '12000',
  }

  const venues = new Map()
  for (const [group, catId] of Object.entries(categoryGroups)) {
    const params = new URLSearchParams({
      ne: `${bbox.neLat},${bbox.neLon}`,
      sw: `${bbox.swLat},${bbox.swLon}`,
      categories: catId,
      limit: 50,
      fields: 'fsq_id,name,geocodes,categories',
    })
    process.stdout.write(`  Foursquare [${group}]… `)
    try {
      const data = await getJSON(`${base}?${params}`, headers)
      const results = data.results ?? []
      for (const v of results) {
        const geo = v.geocodes?.main ?? {}
        const lat = geo.latitude, lon = geo.longitude
        if (lat == null || !inBbox(lat, lon, bbox)) continue
        if (!venues.has(v.fsq_id)) {
          venues.set(v.fsq_id, {
            name: v.name ?? '',
            lat, lon,
            group,
            categories: (v.categories ?? []).map(c => c.name),
          })
        }
      }
      console.log(`${results.length} results`)
    } catch (e) {
      console.log(`FAILED (${e.message})`)
    }
    await sleep(800)
  }
  return [...venues.values()]
}

// ── Google Places ─────────────────────────────────────────────────────────────

async function fetchGooglePlaces(bbox, key, maxReq) {
  const base = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json'
  const centres = [
    [52.423, 10.787],
    [52.443, 10.748],
    [52.400, 10.820],
    [52.460, 10.800],
    [52.395, 10.760],
  ]

  const places = new Map()
  let reqCount = 0

  for (const [cLat, cLon] of centres) {
    if (reqCount >= maxReq) { console.log(`  Google: hit ${maxReq}-request cap.`); break }

    let url = `${base}?location=${cLat},${cLon}&radius=4000&key=${key}`
    let page = 0

    while (url && reqCount < maxReq) {
      reqCount++
      process.stdout.write(`  Google request ${reqCount}/${maxReq} (est. $${(reqCount * 0.032).toFixed(2)})… `)
      try {
        const data = await getJSON(url)
        const results = data.results ?? []
        console.log(`${results.length} results`)

        for (const p of results) {
          const loc = p.geometry?.location ?? {}
          const lat = loc.lat, lon = loc.lng
          if (lat == null || !inBbox(lat, lon, bbox)) continue
          if (!places.has(p.place_id)) {
            places.set(p.place_id, {
              name:        p.name ?? '',
              lat, lon,
              rating:      p.rating ?? 0,
              reviewCount: p.user_ratings_total ?? 0,
              types:       p.types ?? [],
            })
          }
        }

        const token = data.next_page_token
        if (token && page < 2) {
          page++
          url = `${base}?pagetoken=${token}&key=${key}`
          await sleep(2000)
        } else {
          url = null
        }
      } catch (e) {
        console.log(`FAILED (${e.message})`)
        break
      }
    }
    await sleep(800)
  }

  console.log(`  Google total: ${places.size} places, ${reqCount} requests, est. $${(reqCount * 0.032).toFixed(2)}`)
  return [...places.values()]
}

// ── Aggregation ───────────────────────────────────────────────────────────────

function aggregateVenueDensity(venues, grid) {
  const counts = new Map()
  for (const v of venues) {
    const k = cellIndex(v.lat, v.lon, grid)
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return counts
}

function aggregateReviewDensity(places, grid) {
  const weights = new Map()
  for (const p of places) {
    const k = cellIndex(p.lat, p.lon, grid)
    weights.set(k, (weights.get(k) ?? 0) + Math.log1p(p.reviewCount))
  }
  return weights
}

function aggregateOsmScores(spaces, grid) {
  const scores = new Map()
  for (const s of spaces) {
    const k = cellIndex(s.lat, s.lon, grid)
    scores.set(k, (scores.get(k) ?? 0) + s.score)
  }
  return scores
}

function toHeatArray(cellMap, grid) {
  if (!cellMap.size) return []
  const max = Math.max(...cellMap.values()) || 1
  return [...cellMap.entries()].map(([k, v]) => {
    const [lat, lon] = cellCentre(k, grid)
    return [lat, lon, v / max]
  })
}

// ── HTML output ───────────────────────────────────────────────────────────────

function buildHTML(osmHeat, fsqHeat, googleHeat) {
  const osmJSON    = JSON.stringify(osmHeat)
  const fsqJSON    = JSON.stringify(fsqHeat)
  const googleJSON = JSON.stringify(googleHeat)

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Wolfsburg Activity Frequency Comparison</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/leaflet.heat/dist/leaflet-heat.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { height: 100%; width: 100%; }
    .legend {
      background: white; padding: 12px 16px; border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15); font-family: system-ui, sans-serif;
      font-size: 12px; line-height: 1.9; min-width: 210px;
    }
    .legend b { font-size: 13px; display: block; margin-bottom: 4px; }
    .legend-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; }
    .legend hr { border: none; border-top: 1px solid #e5e7eb; margin: 6px 0; }
    .legend small { color: #9ca3af; font-size: 10px; }
  </style>
</head>
<body>
<div id="map"></div>
<script>
  const map = L.map('map').setView(${JSON.stringify(CENTER)}, 12)

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    subdomains: 'abcd', maxZoom: 19
  }).addTo(map)

  const osmData    = ${osmJSON}
  const fsqData    = ${fsqJSON}
  const googleData = ${googleJSON}

  const heatOpts = { radius: 22, blur: 18, maxZoom: 16, minOpacity: 0.35 }

  const layerOSM = L.heatLayer(osmData, {
    ...heatOpts,
    gradient: { 0.3: '#3b82f6', 0.6: '#22c55e', 0.8: '#f59e0b', 1.0: '#ef4444' }
  })

  const layerFSQ = L.heatLayer(fsqData, {
    ...heatOpts,
    gradient: { 0.3: '#818cf8', 0.6: '#a78bfa', 0.85: '#7c3aed', 1.0: '#4c1d95' }
  })

  const layerGoogle = L.heatLayer(googleData, {
    ...heatOpts,
    gradient: { 0.3: '#fbbf24', 0.6: '#f97316', 0.85: '#ef4444', 1.0: '#7f1d1d' }
  })

  // Start with OSM layer visible
  layerOSM.addTo(map)

  L.control.layers(null, {
    'OSM Frequency Score':      layerOSM,
    'Foursquare Venue Density': layerFSQ,
    'Google Review Density':    layerGoogle,
  }, { collapsed: false, position: 'topright' }).addTo(map)

  // Legend
  const legend = L.control({ position: 'bottomleft' })
  legend.onAdd = () => {
    const div = L.DomUtil.create('div', 'legend')
    div.innerHTML = \`
      <b>Activity Frequency Comparison</b>
      <div><span class="legend-dot" style="background:#22c55e"></span>OSM Frequency Score</div>
      <div><span class="legend-dot" style="background:#7c3aed"></span>Foursquare Venue Density</div>
      <div><span class="legend-dot" style="background:#f97316"></span>Google Review Density</div>
      <hr><small>Toggle layers top-right &nbsp;·&nbsp; Wolfsburg 2024</small>
    \`
    return div
  }
  legend.addTo(map)
</script>
</body>
</html>`
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const grid = buildGrid(BBOX, GRID_M)
  console.log(`Grid: ${grid.rows} rows × ${grid.cols} cols`)

  // OSM
  console.log('\nLoading OSM public spaces…')
  const raw = readFileSync(PUBLIC_SPACES, 'utf-8').replace(/^﻿/, '')
  const fc = JSON.parse(raw)
  const osmSpaces = fc.features.map(f => ({
    lat: f.geometry.coordinates[1],
    lon: f.geometry.coordinates[0],
    score: f.properties.frequencyScore ?? 0,
  }))
  console.log(`  ${osmSpaces.length} spaces`)

  // Foursquare
  let fsqVenues
  if (existsSync(FSQ_CACHE)) {
    console.log('\nLoading Foursquare from cache…')
    fsqVenues = JSON.parse(readFileSync(FSQ_CACHE, 'utf-8'))
    console.log(`  ${fsqVenues.length} venues (cached)`)
  } else {
    console.log('\nFetching Foursquare venues (first run only)…')
    fsqVenues = await fetchFoursquare(BBOX, FOURSQUARE_KEY)
    writeFileSync(FSQ_CACHE, JSON.stringify(fsqVenues, null, 2))
    console.log(`  ${fsqVenues.length} venues saved to cache`)
  }

  // Google Places
  let googlePlaces
  if (existsSync(GOOGLE_CACHE)) {
    console.log('\nLoading Google Places from cache…')
    googlePlaces = JSON.parse(readFileSync(GOOGLE_CACHE, 'utf-8'))
    console.log(`  ${googlePlaces.length} places (cached, no API calls)`)
  } else {
    console.log(`\nFetching Google Places (first run only, cap: ${GOOGLE_MAX_REQUESTS} requests)…`)
    googlePlaces = await fetchGooglePlaces(BBOX, GOOGLE_KEY, GOOGLE_MAX_REQUESTS)
    writeFileSync(GOOGLE_CACHE, JSON.stringify(googlePlaces, null, 2))
    console.log(`  ${googlePlaces.length} places saved to cache`)
  }

  // Aggregate
  console.log('\nAggregating to grid…')
  const osmHeat    = toHeatArray(aggregateOsmScores(osmSpaces, grid), grid)
  const fsqHeat    = toHeatArray(aggregateVenueDensity(fsqVenues, grid), grid)
  const googleHeat = toHeatArray(aggregateReviewDensity(googlePlaces, grid), grid)

  console.log(`  OSM:        ${osmHeat.length} cells`)
  console.log(`  Foursquare: ${fsqHeat.length} cells`)
  console.log(`  Google:     ${googleHeat.length} cells`)

  // Write HTML
  console.log('\nWriting HTML…')
  writeFileSync(OUTPUT_HTML, buildHTML(osmHeat, fsqHeat, googleHeat))
  console.log(`\nDone → ${OUTPUT_HTML}`)
}

main().catch(e => { console.error(e); process.exit(1) })
