import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, '../src/data/districtBoundaries.json')

const original = (await import(
  'file:///D:/000%202nd%20Sem/Wolfsburg%20Urban%20Vision/Wolfsburg%20Analysis%20Map/dist/assets/districts-CbmVyBCh.js'
)).d

const current = JSON.parse(fs.readFileSync(OUT, 'utf8'))

for (const name of ['Neuhaus', 'Hehlingen']) {
  current[name] = original[name]
  console.log(`Restored ${name} from original (${original[name].features[0].geometry.coordinates[0].length} pts)`)
}

fs.writeFileSync(OUT, JSON.stringify(current, null, 2))
console.log('Done.')
