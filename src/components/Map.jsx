import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useMapStore } from '../store/mapStore'

// Wolfsburg city center
const WOLFSBURG_CENTER = [10.7865, 52.4227]
const WOLFSBURG_ZOOM = 12

// CARTO Positron GL — clean grey vector style, no API key needed
const GREY_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'

export default function Map({ onMapReady, onCanvasClick }) {
  const mapContainer = useRef(null)
  const mapRef = useRef(null)
  const { monochromeMode } = useMapStore()

  useEffect(() => {
    if (mapRef.current) return

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: GREY_STYLE,
      center: WOLFSBURG_CENTER,
      zoom: WOLFSBURG_ZOOM,
      attributionControl: false,
    })

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

    map.on('load', () => {
      mapRef.current = map
      if (onMapReady) onMapReady(map)
    })

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [])

  const handleClick = (e) => {
    const map = mapRef.current
    if (!map || !onCanvasClick) return
    const rect = mapContainer.current.getBoundingClientRect()
    onCanvasClick(map, e.clientX - rect.left, e.clientY - rect.top)
  }

  return (
    <div
      ref={mapContainer}
      className="w-full h-full"
      onClick={handleClick}
      style={{ filter: monochromeMode ? 'grayscale(1)' : 'none', transition: 'filter 0.4s ease' }}
    />
  )
}
