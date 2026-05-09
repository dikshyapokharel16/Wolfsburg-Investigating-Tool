/**
 * build_hotspots.mjs
 * Queries Overpass API for public spaces in Wolfsburg, scores them using a
 * composite formula (typology + spillover + transit + area), selects top 15
 * per district, and writes a new src/data/publicSpaces.json.
 *
 * Run from the project root:
 *   node scripts/build_hotspots.mjs
 */

import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const DISTRICT_FILE = resolve(ROOT, 'src/data/districtBoundaries.json')
const OUTPUT_FILE   = resolve(ROOT, 'src/data/publicSpaces.json')

const OVERPASS_URL = 'https://overpass.kumi.systems/api/interpreter'
const TOP_N = 15

// Maps OSM tag keys → existing app typology schema
const TYPOLOGY_MAP = {
  attraction:     { typology: 'Civic / Cultural Forecourt', typologyId: 10, color: '#8b5cf6', base: 40 },
  square:         { typology: 'Civic Plaza',                typologyId: 1,  color: '#f59e0b', base: 38 },
  pedestrian:     { typology: 'Civic Plaza',                typologyId: 1,  color: '#f59e0b', base: 38 },
  marketplace:    { typology: 'Urban Plaza / Transit Plaza', typologyId: 11, color: '#3b82f6', base: 35 },
  park_large:     { typology: 'Neighborhood Park',          typologyId: 2,  color: '#22c55e', base: 32 },
  park_small:     { typology: 'Pocket Park',                typologyId: 3,  color: '#86efac', base: 22 },
  garden:         { typology: 'Pocket Park',                typologyId: 3,  color: '#86efac', base: 18 },
  playground:     { typology: 'Playground',                 typologyId: 6,  color: '#ec4899', base: 18 },
  nature_reserve: { typology: 'Linear Park / Greenway',     typologyId: 4,  color: '#16a34a', base: 14 },
}

const TIER_THRESHOLDS = [
  [70, 'very-high', '#ef4444'],
  [50, 'high',      '#f97316'],
  [30, 'medium',    '#f59e0b'],
  [15, 'low',       '#22c55e'],
  [0,  'very-low',  '#3b82f6'],
]

// ── Geometry helpers ──────────────────────────────────────────────────────────

function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000, p = Math.PI / 180
  const a = Math.sin((lat2 - lat1) * p / 2) ** 2 +
            Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.sin((lon2 - lon1) * p / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(Math.min(1, a)))
}

function pointInRing(lon, lat, ring) {
  let inside = false
  let j = ring.length - 1
  for (let i = 0; i < ring.length; i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)
      inside = !inside
    j = i
  }
  return inside
}

function pointInGeometry(lon, lat, geometry) {
  if (geometry.type === 'Polygon')
    return pointInRing(lon, lat, geometry.coordinates[0])
  if (geometry.type === 'MultiPolygon')
    return geometry.coordinates.some(poly => pointInRing(lon, lat, poly[0]))
  return false
}

// ── Scoring helpers ───────────────────────────────────────────────────────────

const areaScore    = ha   => Math.min(10, Math.sqrt(Math.max(0, ha)) * 4)
const spilloverScore = n  => Math.min(30, n * 2.5)
const transitScore = d    => d < 100 ? 20 : d < 250 ? 15 : d < 500 ? 10 : d < 800 ? 5 : 0

function tierFromScore(score) {
  for (const [threshold, tier] of TIER_THRESHOLDS)
    if (score >= threshold) return tier
  return 'very-low'
}

function getTypologyKey(tags) {
  if (tags.tourism === 'attraction')                            return 'attraction'
  if (tags.place === 'square')                                  return 'square'
  if (tags.highway === 'pedestrian' && tags.area === 'yes')     return 'pedestrian'
  if (tags.amenity === 'marketplace')                           return 'marketplace'
  if (tags.leisure === 'nature_reserve')                        return 'nature_reserve'
  if (tags.leisure === 'playground')                            return 'playground'
  if (tags.leisure === 'garden')                                return 'garden'
  if (tags.leisure === 'park')                                  return 'park_large'
  return null
}

// ── Overpass ──────────────────────────────────────────────────────────────────

async function overpassQuery(query, retries = 2) {
  const url = `${OVERPASS_URL}?data=${encodeURIComponent(query)}`
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'WolfsburgUrbanVisionMapScript/1.0 (student project, uni-weimar.de)',
        },
      })
      if (!resp.ok) {
        const body = await resp.text().catch(() => '')
        throw new Error(`HTTP ${resp.status}: ${body.slice(0, 200)}`)
      }
      return await resp.json()
    } catch (e) {
      if (attempt < retries) {
        console.log(`  Retrying (${attempt + 1}/${retries})…`)
        await new Promise(r => setTimeout(r, 5000))
      } else {
        throw new Error(`Overpass failed: ${e.message}`)
      }
    }
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Load district boundaries (handle optional BOM)
  console.log('Loading district boundaries…')
  const raw = readFileSync(DISTRICT_FILE, 'utf-8').replace(/^﻿/, '')
  const districtData = JSON.parse(raw)

  const districts = {}          // name → [geometry, ...]
  const districtCentroids = {}  // name → [lon, lat]

  for (const [name, fc] of Object.entries(districtData)) {
    if (!fc?.features?.length) continue
    districts[name] = fc.features.map(f => f.geometry)

    const allLons = [], allLats = []
    for (const geom of districts[name]) {
      const rings = geom.type === 'Polygon' ? geom.coordinates : geom.coordinates.map(p => p[0])
      for (const ring of rings)
        for (const [lon, lat] of ring) { allLons.push(lon); allLats.push(lat) }
    }
    districtCentroids[name] = [
      allLons.reduce((a, b) => a + b) / allLons.length,
      allLats.reduce((a, b) => a + b) / allLats.length,
    ]
  }
  console.log(`  Loaded ${Object.keys(districts).length} districts`)

  // Query A — public spaces
  console.log('\nQuerying Overpass: public spaces…')
  const queryA = `[out:json][timeout:90];
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
out body; >; out skel qt;`

  const dataA = await overpassQuery(queryA)

  // Build node-coord lookup for way centroid computation
  const nodeCoords = new Map()
  for (const el of dataA.elements)
    if (el.type === 'node' && 'lat' in el) nodeCoords.set(el.id, [el.lat, el.lon])
  console.log(`  Got ${dataA.elements.length} elements, ${nodeCoords.size} node coords`)

  // Query B — commercial spillover
  console.log('Querying Overpass: commercial amenities…')
  await sleep(2000)
  const queryB = `[out:json][timeout:60];
area["name"="Wolfsburg"]["boundary"="administrative"]->.wb;
(
  node(area.wb)[amenity~"^(restaurant|cafe|bar|fast_food|pub|food_court|supermarket)$"];
  node(area.wb)[shop~"^(supermarket|convenience|mall|department_store)$"];
);
out body;`

  const dataB = await overpassQuery(queryB)
  const commercial = dataB.elements
    .filter(el => el.type === 'node' && 'lat' in el)
    .map(el => [el.lat, el.lon])
  console.log(`  Found ${commercial.length} commercial nodes`)

  // Query C — bus stops
  console.log('Querying Overpass: bus stops…')
  await sleep(2000)
  const queryC = `[out:json][timeout:30];
area["name"="Wolfsburg"]["boundary"="administrative"]->.wb;
node(area.wb)[highway=bus_stop];
out body;`

  const dataC = await overpassQuery(queryC)
  const busStops = dataC.elements
    .filter(el => el.type === 'node' && 'lat' in el)
    .map(el => [el.lat, el.lon])
  console.log(`  Found ${busStops.length} bus stops`)

  // Parse public spaces
  console.log('\nParsing public spaces…')
  const spaces = []
  const seenIds = new Set()

  for (const el of dataA.elements) {
    if (el.type !== 'node' && el.type !== 'way') continue
    if (seenIds.has(el.id)) continue

    const tags = el.tags ?? {}
    const name = (tags.name ?? '').trim()
    if (!name) continue

    let typKey = getTypologyKey(tags)
    if (!typKey) continue

    let lat, lon, areaHa

    if (el.type === 'node') {
      if (!('lat' in el)) continue
      lat = el.lat; lon = el.lon; areaHa = 0.1
    } else {
      const nodes = (el.nodes ?? []).map(id => nodeCoords.get(id)).filter(Boolean)
      if (!nodes.length) continue
      lat = nodes.reduce((s, c) => s + c[0], 0) / nodes.length
      lon = nodes.reduce((s, c) => s + c[1], 0) / nodes.length
      areaHa = el.nodes.length * 0.003
    }

    // Override with OSM area tag if present (m²)
    if (tags.area && !isNaN(parseFloat(tags.area)))
      areaHa = parseFloat(tags.area) / 10000

    if (typKey === 'park_large' && areaHa < 2) typKey = 'park_small'

    seenIds.add(el.id)
    spaces.push({ id: el.id, name, typKey, lat, lon, areaHa: Math.max(0.05, areaHa) })
  }
  console.log(`  Parsed ${spaces.length} named public spaces`)

  // District assignment
  console.log('Assigning spaces to districts…')
  for (const sp of spaces) {
    let assigned = null
    outer: for (const [dname, geometries] of Object.entries(districts)) {
      for (const geom of geometries) {
        if (pointInGeometry(sp.lon, sp.lat, geom)) { assigned = dname; break outer }
      }
    }
    if (!assigned) {
      // Fallback: nearest centroid
      let bestDist = Infinity
      for (const [dname, [clon, clat]] of Object.entries(districtCentroids)) {
        const d = haversineM(sp.lat, sp.lon, clat, clon)
        if (d < bestDist) { bestDist = d; assigned = dname }
      }
    }
    sp.district = assigned
  }

  // Composite scoring
  console.log('Scoring spaces…')
  for (const sp of spaces) {
    const base = TYPOLOGY_MAP[sp.typKey].base
    const aSc  = areaScore(sp.areaHa)
    const spCount = commercial.filter(([clat, clon]) => haversineM(sp.lat, sp.lon, clat, clon) < 250).length
    const splSc = spilloverScore(spCount)
    const minDist = busStops.length
      ? Math.min(...busStops.map(([blat, blon]) => haversineM(sp.lat, sp.lon, blat, blon)))
      : 9999
    const trSc = transitScore(minDist)

    sp.frequencyScore = Math.min(100, Math.floor(base + aSc + splSc + trSc))
    sp.frequencyTier  = tierFromScore(sp.frequencyScore)
    sp.spilloverCount = spCount
    sp.transitDistM   = Math.round(minDist)
  }

  // Top N per district
  console.log(`Selecting top ${TOP_N} per district…`)
  const byDistrict = new Map()
  for (const sp of spaces) {
    if (!byDistrict.has(sp.district)) byDistrict.set(sp.district, [])
    byDistrict.get(sp.district).push(sp)
  }

  const selected = []
  for (const [, dspaces] of [...byDistrict.entries()].sort()) {
    dspaces.sort((a, b) => b.frequencyScore - a.frequencyScore)
    selected.push(...dspaces.slice(0, TOP_N))
  }
  console.log(`  ${selected.length} spaces across ${byDistrict.size} districts`)

  // Build GeoJSON
  const features = selected.map(sp => {
    const typ = TYPOLOGY_MAP[sp.typKey]
    const areaStr = sp.areaHa >= 1 ? `${sp.areaHa.toFixed(1)} ha` : `${Math.round(sp.areaHa * 10000)} m²`
    let desc = `${typ.typology} in ${sp.district}.`
    if (sp.spilloverCount > 0) desc += ` ${sp.spilloverCount} commercial amenities within 250 m.`
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [+sp.lon.toFixed(6), +sp.lat.toFixed(6)] },
      properties: {
        name: sp.name,
        typology: typ.typology,
        typologyId: typ.typologyId,
        color: typ.color,
        areaHa: +sp.areaHa.toFixed(2),
        area: areaStr,
        description: desc,
        status: 'Exists',
        district: sp.district,
        frequencyScore: sp.frequencyScore,
        frequencyTier: sp.frequencyTier,
      },
    }
  })

  const geojson = { type: 'FeatureCollection', features }

  console.log(`\nWriting ${features.length} features → ${OUTPUT_FILE}`)
  writeFileSync(OUTPUT_FILE, '﻿' + JSON.stringify(geojson, null, 2), 'utf-8')

  // Summary
  const tierCounts = {}
  for (const f of features) {
    const t = f.properties.frequencyTier
    tierCounts[t] = (tierCounts[t] ?? 0) + 1
  }
  console.log('\nTier distribution:')
  for (const [t, , ] of TIER_THRESHOLDS) {
    const label = TIER_THRESHOLDS.find(x => x[0] === t)?.[1] ?? '?'
    console.log(`  ${label.padEnd(10)}: ${tierCounts[label] ?? 0}`)
  }

  const top5 = [...features].sort((a, b) => b.properties.frequencyScore - a.properties.frequencyScore).slice(0, 5)
  console.log('\nTop 5 spaces:')
  for (const f of top5) {
    const p = f.properties
    console.log(`  ${p.name.padEnd(35)} ${p.district.padEnd(25)} score=${p.frequencyScore} [${p.frequencyTier}]`)
  }

  console.log('\nDone.')
}

main().catch(err => { console.error(err); process.exit(1) })
