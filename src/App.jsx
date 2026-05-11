import { useState } from 'react'
import Map from './components/Map'
import TopNav from './components/TopNav'
import NeighbourhoodsButton from './components/NeighbourhoodsButton'
import NorthArrow from './components/NorthArrow'
import StoriesPanel from './components/StoriesPanel'
import { useMapLayers } from './hooks/useMapLayers'
import { useStravaCallback } from './hooks/useStravaAuth'

function MapController({ map }) {
  useMapLayers(map)
  return null
}


export default function App() {
  useStravaCallback()
  const [map, setMap] = useState(null)
  const [storiesOpen, setStoriesOpen] = useState(false)

  return (
    <div className="relative w-full h-full">
      <Map onMapReady={setMap} />
      <TopNav />
      <NeighbourhoodsButton />
      {map && <NorthArrow map={map} />}

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
