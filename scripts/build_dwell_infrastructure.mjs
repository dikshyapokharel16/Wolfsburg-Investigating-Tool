/**
 * build_dwell_infrastructure.mjs
 * Queries Overpass for OSM features that indicate designed dwell spaces —
 * benches, outdoor seating, shelters, toilets, picnic tables.
 * Each feature is weighted by dwell significance and written to
 * src/data/dwellInfrastructure.json.
 *
 * Run from project root:
 *   node scripts/build_dwell_infrastructure.mjs
 */

import { writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const OUTPUT = resolve(ROOT, 'src/data/dwellInfrastructure.json')

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'

// Dwell weight by OSM feature type — higher = stronger signal that people stay
const WEIGHTS = {
  outdoor_seating: 5,   // cafe/restaurant with outdoor seating = commercial dwell anchor
  shelter:         3,   // designed weather protection = people stop here
  toilets:         3,   // toilet provision = area designed for extended presence
  picnic_table:    2,   // designed for sitting and staying
  bench:           1,   // basic seating infrastructure
}

const TYPE_LABELS = {
  outdoor_seating: 'Outdoor Seating',
  shelter:         'Shelter',
  toilets:         'Public Toilet',
  picnic_table:    'Picnic Table',
  bench:           'Bench',
}

const TYPE_COLORS = {
  outdoor_seating: '#f59e0b',
  shelter:         '#06b6d4',
  toilets:         '#8b5cf6',
  picnic_table:    '#22c55e',
  bench:           '#94a3b8',
}

async function overpassQuery(query, retries = 2) {
  const url = `${OVERPASS_URL}?data=${encodeURIComponent(query)}`
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'WolfsburgUrbanVision/1.0 (student project, uni-weimar.de)' },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    } catch (e) {
      if (attempt < retries) {
        console.log(`  Retry ${attempt + 1}…`)
        await new Promise(r => setTimeout(r, 4000))
      } else throw e
    }
  }
}

async function main() {
  console.log('Querying Overpass for dwell infrastructure…')

  const query = `[out:json][timeout:60];
area["name"="Wolfsburg"]["boundary"="administrative"]->.wb;
(
  node(area.wb)[amenity=bench];
  node(area.wb)[amenity=toilets];
  node(area.wb)[amenity=shelter];
  node(area.wb)[leisure=picnic_table];
  node(area.wb)[outdoor_seating=yes];
  way(area.wb)[outdoor_seating=yes];
);
out body; >; out skel qt;`

  const data = await overpassQuery(query)
  console.log(`  ${data.elements.length} raw elements`)

  // Build node coord lookup for way centroids
  const nodeCoords = new Map()
  for (const el of data.elements)
    if (el.type === 'node' && 'lat' in el) nodeCoords.set(el.id, [el.lat, el.lon])

  const features = []
  const seen = new Set()

  for (const el of data.elements) {
    if (seen.has(el.id)) continue
    const tags = el.tags ?? {}

    let lat, lon
    if (el.type === 'node') {
      if (!('lat' in el)) continue
      lat = el.lat; lon = el.lon
    } else if (el.type === 'way') {
      const nodes = (el.nodes ?? []).map(id => nodeCoords.get(id)).filter(Boolean)
      if (!nodes.length) continue
      lat = nodes.reduce((s, c) => s + c[0], 0) / nodes.length
      lon = nodes.reduce((s, c) => s + c[1], 0) / nodes.length
    } else continue

    // Classify
    let type = null
    if (tags.outdoor_seating === 'yes')  type = 'outdoor_seating'
    else if (tags.amenity === 'shelter') type = 'shelter'
    else if (tags.amenity === 'toilets') type = 'toilets'
    else if (tags.leisure === 'picnic_table') type = 'picnic_table'
    else if (tags.amenity === 'bench')   type = 'bench'
    if (!type) continue

    seen.add(el.id)
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [+lon.toFixed(6), +lat.toFixed(6)] },
      properties: {
        type,
        label:  TYPE_LABELS[type],
        color:  TYPE_COLORS[type],
        weight: WEIGHTS[type],
        name:   tags.name ?? tags['addr:street'] ?? '',
      },
    })
  }

  // Summary
  const counts = {}
  for (const f of features) {
    const t = f.properties.type
    counts[t] = (counts[t] ?? 0) + 1
  }
  console.log('\nFeature counts:')
  for (const [type, count] of Object.entries(counts))
    console.log(`  ${TYPE_LABELS[type].padEnd(20)} ${count}`)
  console.log(`  ${'TOTAL'.padEnd(20)} ${features.length}`)

  const geojson = { type: 'FeatureCollection', features }
  writeFileSync(OUTPUT, JSON.stringify(geojson, null, 2))
  console.log(`\nWritten → ${OUTPUT}`)
}

main().catch(e => { console.error(e); process.exit(1) })
