import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import { useMapStore } from '../store/mapStore'
import districtBoundaries from '../data/districtBoundaries.json'
import { DISTRICT_COLORS } from '../data/districtConfig.js'
import PUBLIC_SPACES_GEOJSON from '../data/publicSpaces.json'

// Build one combined GeoJSON once — each feature carries name + color as properties
const DISTRICT_GEOJSON = (() => {
  const features = []
  for (const [name, fc] of Object.entries(districtBoundaries)) {
    if (!fc?.features) continue
    const color = DISTRICT_COLORS[name] ?? '#6b7280'
    for (const f of fc.features) {
      features.push({
        type: 'Feature',
        geometry: f.geometry,
        properties: { name, color },
      })
    }
  }
  return { type: 'FeatureCollection', features }
})()

export function useMapLayers(map) {
  const { activeLayers, amenityData } = useMapStore()
  const psPopup = useRef(null)

  // ── District boundaries ──────────────────────────────────────────────────
  useEffect(() => {
    if (!map) return

    const SRC   = 'districts'
    const FILL  = 'districts-fill'
    const LINE  = 'districts-line'
    const LABEL = 'districts-label'

    if (activeLayers.districts) {
      if (!map.getSource(SRC)) {
        map.addSource(SRC, { type: 'geojson', data: DISTRICT_GEOJSON })

        map.addLayer({
          id: FILL,
          type: 'fill',
          source: SRC,
          paint: {
            'fill-color': '#818cf8',
            'fill-opacity': 0.08,
          },
        })

        map.addLayer({
          id: LINE,
          type: 'line',
          source: SRC,
          paint: {
            'line-color': '#16213e',
            'line-width': 1.5,
            'line-opacity': 0.9,
          },
        })

        map.addLayer({
          id: LABEL,
          type: 'symbol',
          source: SRC,
          layout: {
            'text-field': ['get', 'name'],
            'text-size': 10,
            'text-font': ['Open Sans Bold'],
            'text-letter-spacing': 0.04,
            'text-max-width': 8,
          },
          paint: {
            'text-color': '#1e293b',
            'text-halo-color': 'rgba(255,255,255,0.92)',
            'text-halo-width': 1.5,
          },
        })
      } else {
        map.setLayoutProperty(FILL,  'visibility', 'visible')
        map.setLayoutProperty(LINE,  'visibility', 'visible')
        map.setLayoutProperty(LABEL, 'visibility', 'visible')
      }
    } else {
      if (map.getLayer(FILL))  map.setLayoutProperty(FILL,  'visibility', 'none')
      if (map.getLayer(LINE))  map.setLayoutProperty(LINE,  'visibility', 'none')
      if (map.getLayer(LABEL)) map.setLayoutProperty(LABEL, 'visibility', 'none')
    }
  }, [map, activeLayers.districts])

  // ── Amenities ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!map) return

    const SRC = 'amenities'
    const LYR = 'amenities-circles'

    if (activeLayers.amenities && amenityData?.features?.length) {
      if (!map.getSource(SRC)) {
        map.addSource(SRC, { type: 'geojson', data: amenityData })
        map.addLayer({
          id: LYR,
          type: 'circle',
          source: SRC,
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 3, 15, 8],
            'circle-color': [
              'case',
              ['match', ['get', 'amenity'],
                ['school', 'university', 'college', 'kindergarten', 'library'], true, false],
              '#60a5fa',
              ['has', 'leisure'], '#34d399',
              ['has', 'shop'], '#fbbf24',
              ['match', ['get', 'amenity'],
                ['restaurant', 'cafe', 'bar', 'fast_food', 'pub'], true, false],
              '#f472b6',
              ['match', ['get', 'amenity'],
                ['hospital', 'clinic', 'pharmacy', 'doctors', 'dentist'], true, false],
              '#f87171',
              ['match', ['get', 'amenity'],
                ['bus_station', 'parking', 'bicycle_parking'], true, false],
              '#a78bfa',
              '#94a3b8',
            ],
            'circle-opacity': 0.85,
            'circle-stroke-width': 1.5,
            'circle-stroke-color': 'rgba(255,255,255,0.9)',
          },
        })
      } else {
        map.getSource(SRC).setData(amenityData)
        map.setLayoutProperty(LYR, 'visibility', 'visible')
      }
    } else {
      if (map.getLayer(LYR)) map.setLayoutProperty(LYR, 'visibility', 'none')
    }
  }, [map, activeLayers.amenities, amenityData])

  // ── Public Spaces ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!map) return

    const SRC = 'public-spaces'
    const LYR = 'public-spaces-circles'

    if (activeLayers.publicSpaces) {
      if (!map.getSource(SRC)) {
        map.addSource(SRC, { type: 'geojson', data: PUBLIC_SPACES_GEOJSON })

        // Radius = sqrt(areaHa) * k, interpolated across zoom levels
        map.addLayer({
          id: LYR,
          type: 'circle',
          source: SRC,
          paint: {
            'circle-radius': [
              'interpolate', ['linear'], ['zoom'],
              10, ['max', 3, ['*', 0.8, ['sqrt', ['get', 'areaHa']]]],
              14, ['max', 5, ['*', 3.5, ['sqrt', ['get', 'areaHa']]]],
            ],
            'circle-color': ['get', 'color'],
            'circle-opacity': 0.75,
            'circle-stroke-width': 1.5,
            'circle-stroke-color': 'rgba(255,255,255,0.9)',
          },
        })

        const popup = new maplibregl.Popup({
          closeButton: true,
          closeOnClick: false,
          maxWidth: '240px',
        })
        psPopup.current = popup

        map.on('click', LYR, (e) => {
          const p = e.features[0].properties
          popup
            .setLngLat(e.lngLat)
            .setHTML(
              `<div style="font-family:system-ui,sans-serif;padding:2px 0">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
                  <div style="width:8px;height:8px;border-radius:50%;background:${p.color};flex-shrink:0"></div>
                  <span style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;font-weight:600">${p.typology}</span>
                </div>
                <div style="font-size:14px;font-weight:700;color:#111827;margin-bottom:5px;line-height:1.3">${p.name}</div>
                <div style="font-size:11px;color:#374151;margin-bottom:6px;line-height:1.5">${p.description}</div>
                <div style="font-size:10px;color:#9ca3af">${p.area} · ${p.status}</div>
              </div>`
            )
            .addTo(map)
        })

        map.on('mouseenter', LYR, () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', LYR, () => { map.getCanvas().style.cursor = '' })
      } else {
        map.setLayoutProperty(LYR, 'visibility', 'visible')
      }
    } else {
      if (map.getLayer(LYR)) map.setLayoutProperty(LYR, 'visibility', 'none')
      if (psPopup.current) psPopup.current.remove()
    }
  }, [map, activeLayers.publicSpaces])
}
