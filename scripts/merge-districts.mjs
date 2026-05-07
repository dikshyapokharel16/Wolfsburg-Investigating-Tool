import fs from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const original = (await import(
  'file:///D:/000%202nd%20Sem/Wolfsburg%20Urban%20Vision/Wolfsburg%20Analysis%20Map/dist/assets/districts-CbmVyBCh.js'
)).d

const OUT = path.resolve(__dirname, '../src/data/districtBoundaries.json')
const current = JSON.parse(fs.readFileSync(OUT, 'utf8'))

// OSM-fetched data takes priority; original fills the 19 gaps
const merged = { ...original, ...current }

const fromOSM = Object.keys(current).sort()
const fromOriginal = Object.keys(original).filter(k => !current[k]).sort()

console.log(`OSM boundaries (${fromOSM.length}): ${fromOSM.join(', ')}`)
console.log(`\nRestored from original (${fromOriginal.length}): ${fromOriginal.join(', ')}`)
console.log(`\nTotal: ${Object.keys(merged).length}`)

fs.writeFileSync(OUT, JSON.stringify(merged, null, 2))
console.log('Written.')
