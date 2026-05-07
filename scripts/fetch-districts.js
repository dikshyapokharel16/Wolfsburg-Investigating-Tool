#!/usr/bin/env node
// Run: node scripts/fetch-districts.js
// Fetches Wolfsburg Stadtteil boundaries from OSM Overpass API using
// "out geom" mode — geometry is embedded directly in each way member,
// so no separate node-lookup step is needed (more reliable ring assembly).

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_PATH = path.resolve(__dirname, '../src/data/districtBoundaries.json')

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

// Some OSM names differ from our district config names
const NAME_ALIASES = {
  'Kästorf':         ['Kästorf', 'Kästorf (Wolfsburg)'],
  'Neuhaus':         ['Neuhaus', 'Neuhaus (Wolfsburg)'],
  'Alt-Wolfsburg':   ['Alt-Wolfsburg', 'Alt Wolfsburg'],
  'Steimker Berg':   ['Steimker Berg', 'Steimkerberg'],
  'Steimker Gärten': ['Steimker Gärten', 'Steimkergärten'],
}

const QUERY = `
[out:json][timeout:120];
area["name"="Wolfsburg"]["boundary"="administrative"]["admin_level"="6"]->.wolfsburg;
(
  rel(area.wolfsburg)["boundary"="administrative"]["admin_level"~"^(8|9|10)$"];
);
out geom;
`

async function fetchOverpass(query) {
  const body = new URLSearchParams({ data: query })
  let lastErr
  for (const url of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        body,
        headers: {
          'User-Agent': 'wolfsburg-analysis-map/1.0 (academic project)',
          'Accept': '*/*',
        },
      })
      if (!res.ok) {
        const text = await res.text()
        lastErr = new Error(`${url} HTTP ${res.status}: ${text.slice(0, 200)}`)
        console.log(`  ✗ ${url} → ${res.status}`)
        continue
      }
      console.log(`  ✓ ${url}`)
      return res.json()
    } catch (e) {
      lastErr = e
      console.log(`  ✗ ${url} → ${e.message}`)
    }
  }
  throw lastErr
}

/**
 * Convert an Overpass relation (with embedded geometry from `out geom`)
 * into a GeoJSON FeatureCollection. Geometry is read directly from
 * member.geometry — no separate node index needed.
 */
function relationToGeoJSON(rel) {
  const outerWays = []
  const innerWays = []

  for (const member of (rel.members || [])) {
    if (member.type !== 'way' || !member.geometry) continue
    const coords = member.geometry.map(p => [p.lon, p.lat])
    if (coords.length < 2) continue
    if (member.role === 'inner') innerWays.push(coords)
    else outerWays.push(coords)
  }

  if (outerWays.length === 0) return null

  let outerRings = mergeRings(stitchWays(outerWays))
  const innerRings = mergeRings(stitchWays(innerWays))

  if (outerRings.length === 0) return null

  // Drop tiny artifact rings (closed single-way slivers shared between
  // neighbouring relations as outer/inner pairs). Keep only rings >= 20 pts,
  // but never drop a ring if it's the only one.
  if (outerRings.length > 1) {
    const significant = outerRings.filter(r => r.length >= 20)
    if (significant.length > 0) outerRings = significant
  }
  const cleanInner = innerRings.filter(r => r.length >= 20)

  let geometry
  if (outerRings.length === 1) {
    geometry = { type: 'Polygon', coordinates: [outerRings[0], ...cleanInner] }
  } else {
    // Multiple outer rings = MultiPolygon (disconnected parts)
    geometry = { type: 'MultiPolygon', coordinates: outerRings.map(r => [r]) }
  }

  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry,
      properties: { name: rel.tags?.name || '', adminLevel: Number(rel.tags?.admin_level) },
    }],
  }
}

function stitchWays(wayCoordArrays) {
  if (wayCoordArrays.length === 0) return []
  const remaining = wayCoordArrays.map(coords => ({ coords: [...coords], used: false }))
  const rings = []

  while (true) {
    const start = remaining.find(w => !w.used)
    if (!start) break
    start.used = true
    let ring = [...start.coords]

    let changed = true
    while (changed) {
      changed = false
      const tail = ring[ring.length - 1]
      for (const w of remaining) {
        if (w.used) continue
        const head = w.coords[0]
        const last = w.coords[w.coords.length - 1]
        if (head[0] === tail[0] && head[1] === tail[1]) {
          ring = ring.concat(w.coords.slice(1))
          w.used = true; changed = true; break
        }
        if (last[0] === tail[0] && last[1] === tail[1]) {
          ring = ring.concat([...w.coords].reverse().slice(1))
          w.used = true; changed = true; break
        }
      }
    }

    if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
      ring.push(ring[0])
    }
    if (ring.length >= 4) rings.push(ring)
  }
  return rings
}

/**
 * Second-pass ring merger. After stitchWays, some relations leave multiple
 * partial rings because OSM is missing a boundary segment. This detects rings
 * that share a vertex (head↔head, head↔tail, tail↔head, tail↔tail) and merges
 * them — bridging the gap with a straight line, which is the best we can do
 * without the missing way.
 */
function mergeRings(rings) {
  if (rings.length <= 1) return rings

  const eq = (a, b) => a[0] === b[0] && a[1] === b[1]

  // Strip the force-close duplicate so we work with open chains
  const open = rings.map(r => eq(r[0], r[r.length - 1]) ? r.slice(0, -1) : [...r])

  const used = new Set()
  const result = []

  for (let i = 0; i < open.length; i++) {
    if (used.has(i)) continue
    used.add(i)
    let chain = [...open[i]]

    let progress = true
    while (progress) {
      progress = false
      if (chain.length > 3 && eq(chain[0], chain[chain.length - 1])) break

      const head = chain[0]
      const tail = chain[chain.length - 1]

      for (let j = 0; j < open.length; j++) {
        if (used.has(j)) continue
        const rj = open[j]
        const rjH = rj[0], rjT = rj[rj.length - 1]

        if (eq(tail, rjH)) {
          chain = [...chain, ...rj.slice(1)]
          used.add(j); progress = true; break
        }
        if (eq(tail, rjT)) {
          chain = [...chain, ...[...rj].reverse().slice(1)]
          used.add(j); progress = true; break
        }
        if (eq(head, rjT)) {
          // rj ends where our chain starts — prepend rj
          chain = [...rj, ...chain.slice(1)]
          used.add(j); progress = true; break
        }
        if (eq(head, rjH)) {
          // rj starts where our chain starts — prepend rj reversed
          chain = [...[...rj].reverse(), ...chain.slice(1)]
          used.add(j); progress = true; break
        }
      }
    }

    if (!eq(chain[0], chain[chain.length - 1])) chain.push(chain[0])
    if (chain.length >= 4) result.push(chain)
  }

  return result
}

function normalizeName(name) {
  return name.toLowerCase().replace(/\s+/g, ' ').trim()
}

function matchDistrict(osmName, configNames) {
  const norm = normalizeName(osmName)
  const stripped = normalizeName(osmName.replace(/\s*\(wolfsburg\)/i, ''))

  for (const districtName of configNames) {
    const aliases = NAME_ALIASES[districtName] ?? [districtName]
    if (aliases.some(a => normalizeName(a) === norm)) return districtName
    if (aliases.some(a => normalizeName(a) === stripped)) return districtName
  }
  return null
}

async function main() {
  console.log('Querying Overpass for Wolfsburg district boundaries (out geom)…')
  const json = await fetchOverpass(QUERY)
  const relations = json.elements.filter(e => e.type === 'relation')
  console.log(`Got ${relations.length} relations from Overpass\n`)

  // Load canonical district names from districtConfig.js
  const CONFIG_PATH = path.resolve(__dirname, '../src/data/districtConfig.js')
  const configSrc = fs.readFileSync(CONFIG_PATH, 'utf8')
  const configNames = [...configSrc.matchAll(/name:\s*'([^']+)'/g)].map(m => m[1])

  // Sort so level-10 relations overwrite level-9 with the same name
  relations.sort((a, b) => Number(a.tags?.admin_level ?? 0) - Number(b.tags?.admin_level ?? 0))

  const result = {}
  const matched = new Set()
  const unmatched = []

  for (const rel of relations) {
    const osmName = rel.tags?.name || ''
    const districtName = matchDistrict(osmName, configNames)

    if (!districtName) {
      unmatched.push(`${osmName} (level=${rel.tags?.admin_level})`)
      continue
    }
    if (matched.has(districtName)) {
      console.log(`  Duplicate match for "${districtName}", skipping "${osmName}"`)
      continue
    }

    const geoJSON = relationToGeoJSON(rel)
    if (!geoJSON) {
      console.warn(`  Could not build geometry for "${districtName}"`)
      continue
    }

    result[districtName] = geoJSON
    matched.add(districtName)
    const geom = geoJSON.features[0].geometry
    const ringPts = geom.type === 'MultiPolygon'
      ? geom.coordinates.map(p => p[0].length).join('+')
      : geom.coordinates[0].length
    console.log(`  ✓ ${districtName} (${ringPts} pts, level ${rel.tags?.admin_level})`)
  }

  const missing = configNames.filter(n => !matched.has(n))
  if (missing.length) {
    console.log(`\n${missing.length} districts not found in OSM:`)
    missing.forEach(n => console.log('  ?', n))
  }
  if (unmatched.length) {
    console.log(`\n${unmatched.length} unmatched OSM relations (Stadtbezirke groups etc.):`)
    unmatched.slice(0, 20).forEach(n => console.log('  –', n))
  }

  if (matched.size === 0) {
    console.error('\nNo districts built — not overwriting the file.')
    process.exit(1)
  }

  // Merge: keep existing data for missing districts (fallback polygons)
  let existing = {}
  try { existing = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8')) } catch (_) {}

  const merged = { ...existing, ...result }

  fs.writeFileSync(OUT_PATH, JSON.stringify(merged, null, 2))
  console.log(`\nWritten → ${OUT_PATH}`)
  console.log(`  Fresh from OSM: ${matched.size} | Kept from existing: ${missing.filter(n => existing[n]).length}`)
  console.log('Restart the dev server to see the updated boundaries.')
}

main().catch(err => {
  console.error('\nFatal:', err.message)
  process.exit(1)
})
