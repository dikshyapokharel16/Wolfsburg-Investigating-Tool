import { useState } from 'react'
import Map from './components/Map'
import TopNav from './components/TopNav'
import NeighbourhoodsButton from './components/NeighbourhoodsButton'
import NorthArrow from './components/NorthArrow'
import StoriesPanel from './components/StoriesPanel'
import { useMapLayers } from './hooks/useMapLayers'
import { useMapStore } from './store/mapStore'
import { DISTRICT_GROUPS, STANDALONE_POPULATIONS } from './data/districtConfig'
import { area as turfArea } from '@turf/area'

const POPULATION_LOOKUP = {
  ...Object.fromEntries(
    Object.entries(DISTRICT_GROUPS).map(([name, { population2020, population2023, avgAge, rentPerSqm }]) => [name, { population2020, population2023, avgAge, rentPerSqm }])
  ),
  ...Object.fromEntries(
    Object.entries(STANDALONE_POPULATIONS).map(([name, vals]) => [name, vals])
  ),
}

function MapController({ map }) {
  useMapLayers(map)
  return null
}

function DistrictPanel() {
  const { selectedDistrict, setSelectedDistrict } = useMapStore()
  if (!selectedDistrict) return null
  const { name, population2020, population2023, density, areaKm2, avgAge, rentPerSqm } = selectedDistrict
  const diff = population2023 - population2020
  const sign = diff >= 0 ? '+' : ''
  const diffColor = diff >= 0 ? '#34d399' : '#f87171'

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 bg-[#16213e] border border-white/10 rounded-2xl shadow-2xl px-6 py-4 min-w-[320px]">
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="text-[10px] text-[#818cf8] uppercase tracking-widest font-semibold">District</div>
          <div className="text-white font-bold text-lg leading-tight">{name}</div>
        </div>
        <button onClick={() => setSelectedDistrict(null)} className="text-white/30 hover:text-white text-lg leading-none">×</button>
      </div>

      <div className="flex gap-6 mb-3">
        <div>
          <div className="text-white font-bold text-xl">{population2020.toLocaleString()}</div>
          <div className="text-white/30 text-[10px]">2020</div>
        </div>
        <div className="flex items-center font-bold text-sm" style={{ color: diffColor }}>{sign}{diff.toLocaleString()}</div>
        <div>
          <div className="text-white font-bold text-xl">{population2023.toLocaleString()}</div>
          <div className="text-white/30 text-[10px]">2023</div>
        </div>
      </div>

      <div className="border-t border-white/10 pt-3 flex gap-8">
        <div>
          <div className="text-[#f59e0b] font-bold text-xl">{density}</div>
          <div className="text-white/30 text-[10px]">residents / km²</div>
        </div>
        <div>
          <div className="text-white/60 font-semibold text-lg">{areaKm2} km²</div>
          <div className="text-white/30 text-[10px]">area</div>
        </div>
        <div>
          <div className="text-[#a78bfa] font-bold text-xl">
            {avgAge != null ? `${avgAge} yrs` : '—'}
          </div>
          <div className="text-white/30 text-[10px]">avg age</div>
        </div>
        <div>
          <div className="text-[#34d399] font-bold text-xl">
            {rentPerSqm != null ? `${rentPerSqm} €/m²` : '—'}
          </div>
          <div className="text-white/30 text-[10px]">avg rent</div>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [map, setMap] = useState(null)
  const [storiesOpen, setStoriesOpen] = useState(false)
  const { activeLayers, toggleLayer, setSelectedDistrict } = useMapStore()

  const handleCanvasClick = (mapInstance, x, y) => {
    const features = mapInstance.queryRenderedFeatures([x, y], { layers: ['districts-fill'] })
    if (!features.length) return
    const name = features[0].properties.name
    const data = POPULATION_LOOKUP[name]
    const feat = features[0]
    const areaKm2 = turfArea(feat) / 1_000_000
    if (data) {
      const density = areaKm2 ? Math.round(data.population2023 / areaKm2).toLocaleString() : '—'
      setSelectedDistrict({ name, ...data, density, areaKm2: areaKm2.toFixed(1) })
    }
  }

  return (
    <div className="relative w-full h-full">
      <Map onMapReady={setMap} onCanvasClick={handleCanvasClick} />
      <TopNav />
      <NeighbourhoodsButton />
      {map && <NorthArrow map={map} />}

      {/* Aerial toggle — circular button below north arrow */}
      <button
        onClick={() => toggleLayer('aerialView')}
        title="Toggle aerial imagery"
        className={`absolute top-[82px] right-3 z-20 w-9 h-9 rounded-full border shadow-lg flex items-center justify-center transition-all duration-200 ${
          activeLayers.aerialView
            ? 'bg-amber-500/30 border-amber-400/60 text-amber-300'
            : 'bg-[#16213e]/95 border-white/10 hover:border-white/30 text-white/60 hover:text-white'
        }`}
      >
        {/* Map / fold icon */}
        <svg width="17" height="17" viewBox="0 0 17 17" fill="none">
          <path d="M2 4.5 L6 3 L11 5.5 L15 4V13.5 L11 15 L6 12.5 L2 14V4.5Z"
            stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" fill="none"/>
          <line x1="6" y1="3" x2="6" y2="12.5" stroke="currentColor" strokeWidth="1.1" opacity="0.7"/>
          <line x1="11" y1="5.5" x2="11" y2="15" stroke="currentColor" strokeWidth="1.1" opacity="0.7"/>
        </svg>
      </button>
      <button
        onClick={() => setStoriesOpen(true)}
        className="absolute bottom-14 right-3 z-30 px-4 py-2 rounded-full text-sm font-semibold shadow-lg bg-[#16213e] text-white border border-[#818cf8]/40 hover:border-[#818cf8] transition-all duration-200"
      >
        Stories
      </button>
      {storiesOpen && <StoriesPanel onClose={() => setStoriesOpen(false)} />}
      <DistrictPanel />
      {map && <MapController map={map} />}
    </div>
  )
}
