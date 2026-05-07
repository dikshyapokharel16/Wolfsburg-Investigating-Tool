// Merges Reislingen's two-part MultiPolygon into one Polygon.
// The two parts share exactly ONE junction point (where ring1 starts/ends
// and ring2 also passes through). The merged ring detours through ring2 at
// that point, creating a valid self-touching polygon.

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, '../src/data/districtBoundaries.json')

const data = JSON.parse(fs.readFileSync(OUT, 'utf8'))
const geom = data['Reislingen']?.features?.[0]?.geometry

if (!geom?.coordinates || geom.type !== 'MultiPolygon' || geom.coordinates.length < 2) {
  console.error('Reislingen is not a valid MultiPolygon — run the full pipeline first')
  process.exit(1)
}

// Sort: larger ring first (main area), smaller second (SW piece)
const rings = geom.coordinates.map(p => p[0]).sort((a, b) => b.length - a.length)
const [ring1, ring2] = rings

// Remove closing coord from both (last == first)
const r1 = ring1.slice(0, -1)  // 203 unique points
const r2 = ring2.slice(0, -1)  //  39 unique points

console.log(`Main ring: ${r1.length} pts,  SW ring: ${r2.length} pts`)

// Find the junction point: coordinate that appears in both rings
const r1Set = new Map(r1.map(([x, y], i) => [`${x},${y}`, i]))
const junctions = []
r2.forEach(([x, y], i) => {
  const key = `${x},${y}`
  if (r1Set.has(key)) junctions.push({ r1: r1Set.get(key), r2: i })
})

const unique = [...new Map(junctions.map(j => [`${j.r1}`, j])).values()]
console.log(`Distinct junction points: ${unique.length}`)
unique.forEach(j => console.log(`  ring1[${j.r1}] = ring2[${j.r2}] @ ${r1[j.r1]}`))

if (unique.length !== 1) {
  console.error(`Expected 1 distinct junction, got ${unique.length}`)
  process.exit(1)
}

const { r1: j1idx, r2: j2idx } = unique[0]

// Rotate r1 so the junction is at index 0 (simplifies splicing)
const r1rot = [...r1.slice(j1idx), ...r1.slice(0, j1idx)]

// Walk r2 starting just after j2idx, all the way around, back to j2idx.
// Try both directions and pick the one whose midpoint is south of the junction
// (i.e., it traverses the actual SW ring area, not back into r1's space).
const jLat = r2[j2idx][1]

const n = r2.length

// Walk all of r2 except the junction in forward direction
const fwdSeg = []
for (let step = 1; step < n; step++) fwdSeg.push(r2[(j2idx + step) % n])

// Walk all of r2 except the junction in backward direction
const bwdSeg = []
for (let step = 1; step < n; step++) bwdSeg.push(r2[((j2idx - step) % n + n) % n])

// Use the segment whose average latitude is further south (ring2's territory)
function avgLat(seg) { return seg.reduce((s, c) => s + c[1], 0) / seg.length }
const r2seg = avgLat(fwdSeg) <= avgLat(bwdSeg) ? fwdSeg : bwdSeg

console.log(`Ring2 segment: ${r2seg.length} pts, avg lat ${avgLat(r2seg).toFixed(5)} (junction lat ${jLat.toFixed(5)})`)

// Merged ring: junction → r2 around SW area → back to junction → r1 around main area → close
const junctionPt = r1rot[0]
const merged = [
  junctionPt,
  ...r2seg,
  junctionPt,       // return to junction (pinch point)
  ...r1rot.slice(1),
  junctionPt,       // close ring
]

console.log(`Merged ring: ${merged.length} pts (expected ~${r1.length + r2.length + 3})`)

data['Reislingen'].features[0].geometry = {
  type: 'Polygon',
  coordinates: [merged],
}

fs.writeFileSync(OUT, JSON.stringify(data, null, 2))
console.log('Written.')
