import { useState } from 'react'
import Map from './components/Map'
import Sidebar from './components/Sidebar'
import NeighbourhoodsButton from './components/NeighbourhoodsButton'
import NorthArrow from './components/NorthArrow'
import StoriesPanel from './components/StoriesPanel'
import { useMapLayers } from './hooks/useMapLayers'
import { useAmenities } from './hooks/useAmenities'

function MapController({ map }) {
  useMapLayers(map)
  return null
}

export default function App() {
  const [map, setMap] = useState(null)
  const [storiesOpen, setStoriesOpen] = useState(false)
  const { fetchAmenities } = useAmenities()

  return (
    <div className="relative w-full h-full">
      <Sidebar onFetchAmenities={fetchAmenities} />
      <div className="absolute left-60 top-0 right-0 bottom-0">
        <Map onMapReady={setMap} />
        <NeighbourhoodsButton />
        {map && <NorthArrow map={map} />}
        <button
          onClick={() => setStoriesOpen(true)}
          className="absolute bottom-14 right-3 z-30 px-4 py-2 rounded-full text-sm font-semibold shadow-lg bg-[#16213e] text-white border border-[#818cf8]/40 hover:border-[#818cf8] transition-all duration-200"
        >
          Stories
        </button>
        {storiesOpen && <StoriesPanel onClose={() => setStoriesOpen(false)} />}
      </div>
      {map && <MapController map={map} />}
    </div>
  )
}
