import { useState } from 'react'
import Map from './components/Map'
import TopNav from './components/TopNav'
import NeighbourhoodsButton from './components/NeighbourhoodsButton'
import NorthArrow from './components/NorthArrow'
import StoriesPanel from './components/StoriesPanel'
import { useMapLayers } from './hooks/useMapLayers'
import { useMapStore } from './store/mapStore'

function MapController({ map }) {
  useMapLayers(map)
  return null
}

export default function App() {
  const [map, setMap] = useState(null)
  const [storiesOpen, setStoriesOpen] = useState(false)
  const { activeLayers, toggleLayer } = useMapStore()

  return (
    <div className="relative w-full h-full">
      <Map onMapReady={setMap} />
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
      {map && <MapController map={map} />}
    </div>
  )
}
