/**
 * build_closures.mjs
 * Queries the Ohsome API for:
 *   1. Year-by-year counts of cafes/restaurants and shops in Wolfsburg
 *   2. Locations of deleted shop/cafe features (proxy for closures) per year
 *
 * Writes src/data/closures.json
 *
 * Run from project root:
 *   node scripts/build_closures.mjs
 */

import { writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT   = resolve(__dirname, '..')
const OUTPUT = resolve(ROOT, 'src/data/closures.json')

const OHSOME   = 'https://api.ohsome.org/v1'
const BBOX     = '10.75,52.28,10.98,52.47'
const TIME_RANGE = '2018-12-31,2025-01-01'
const TIMESTAMPS = '2019-01-01,2020-01-01,2021-01-01,2022-01-01,2023-01-01,2024-01-01,2025-01-01'

const FOOD_FILTER = 'amenity in (cafe, restaurant, bar, fast_food, pub) and type:node'
const SHOP_FILTER = 'shop=* and type:node'

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function ohsomePost(path, params) {
  const body = new URLSearchParams(params).toString()
  const res  = await fetch(`${OHSOME}${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Ohsome HTTP ${res.status}: ${text.slice(0, 200)}`)
  }
  return res.json()
}

// ── Yearly counts ──────────────────────────────────────────────────────────

async function fetchYearlyCounts(filter, label) {
  process.stdout.write(`  Counts [${label}]… `)
  const data = await ohsomePost('/elements/count', {
    bboxes: BBOX,
    filter,
    time:   TIMESTAMPS,
    format: 'json',
  })
  const result = {}
  for (const { timestamp, value } of data.result) {
    const year = timestamp.slice(0, 4)
    result[year] = Math.round(value)
  }
  console.log(Object.entries(result).map(([y, v]) => `${y}:${v}`).join('  '))
  return result
}

// ── Full history → find features deleted within 2019–2024 ─────────────────

async function fetchDeletionLocations(filter, label) {
  process.stdout.write(`  Full history [${label}]… `)
  try {
    const data = await ohsomePost('/elementsFullHistory/centroid', {
      bboxes:     BBOX,
      filter,
      time:       TIME_RANGE,
      properties: 'tags',
    })

    const features = []
    const seen = new Set()

    for (const f of (data.features ?? [])) {
      const validTo = f.properties?.['@validTo'] ?? ''
      if (!validTo) continue                        // still active → not deleted
      const year = parseInt(validTo.slice(0, 4))
      if (year < 2019 || year > 2024) continue     // outside our window

      const osmId = f.properties?.['@osmId'] ?? ''
      if (seen.has(osmId)) continue                 // keep only first deletion
      seen.add(osmId)

      const tags      = f.properties?.['@tags'] ?? {}
      const name      = tags.name ?? ''
      const venueType = tags.amenity ?? tags.shop ?? 'unknown'

      if (!f.geometry) continue
      features.push({
        type: 'Feature',
        geometry: f.geometry,
        properties: { name, venueType, year },
      })
    }
    console.log(`${features.length} deletions (from ${data.features?.length ?? 0} history entries)`)
    return features
  } catch (e) {
    console.log(`FAILED (${e.message})`)
    return []
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('Querying Ohsome API for Wolfsburg closure data…\n')

  // Yearly counts
  console.log('Fetching yearly counts:')
  const foodCounts = await fetchYearlyCounts(FOOD_FILTER, 'food & drink')
  await sleep(1000)
  const shopCounts = await fetchYearlyCounts(SHOP_FILTER, 'shops')
  await sleep(1500)

  // Deletion locations with timestamps
  console.log('\nFetching deletion events with timestamps:')
  const foodDeletions = await fetchDeletionLocations(FOOD_FILTER, 'food & drink')
  await sleep(1500)
  const shopDeletions = await fetchDeletionLocations(SHOP_FILTER, 'shops')
  const allDeletions  = [...foodDeletions, ...shopDeletions]

  // Build year stats
  const years = [2019, 2020, 2021, 2022, 2023, 2024]
  const yearStats = {}
  for (const year of years) {
    const y     = String(year)
    const yNext = String(year + 1)
    yearStats[y] = {
      foodCount: foodCounts[y]    ?? 0,
      shopCount: shopCounts[y]    ?? 0,
      // Delta = change that happened DURING this year (count at end of year minus start)
      foodDelta: (foodCounts[yNext] ?? foodCounts[y] ?? 0) - (foodCounts[y] ?? 0),
      shopDelta: (shopCounts[yNext] ?? shopCounts[y] ?? 0) - (shopCounts[y] ?? 0),
    }
  }

  const output = {
    yearStats,
    closures: {
      type: 'FeatureCollection',
      features: allDeletions,
    },
  }

  // Summary
  console.log('\nYear stats:')
  console.log('Year  Food  ΔFood  Shops  ΔShops')
  for (const [y, s] of Object.entries(yearStats)) {
    const fd = s.foodDelta >= 0 ? `+${s.foodDelta}` : String(s.foodDelta)
    const sd = s.shopDelta >= 0 ? `+${s.shopDelta}` : String(s.shopDelta)
    console.log(`${y}   ${String(s.foodCount).padEnd(5)} ${fd.padEnd(6)} ${String(s.shopCount).padEnd(6)} ${sd}`)
  }
  const byYear = {}
  for (const f of allDeletions) {
    const y = f.properties.year
    byYear[y] = (byYear[y] ?? 0) + 1
  }
  console.log(`\nDeletions by year: ${Object.entries(byYear).sort().map(([y,c]) => `${y}:${c}`).join('  ')}`)

  writeFileSync(OUTPUT, JSON.stringify(output, null, 2))
  console.log(`\nWritten → ${OUTPUT}`)
}

main().catch(e => { console.error(e); process.exit(1) })
