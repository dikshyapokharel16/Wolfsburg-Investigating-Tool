import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import { union } from '@turf/union'
import { useMapStore } from '../store/mapStore'
import districtBoundaries from '../data/districtBoundaries.json'
import { DISTRICT_COLORS, DISTRICT_GROUPS, DISTRICT_TO_GROUP } from '../data/districtConfig.js'
import PUBLIC_SPACES_GEOJSON from '../data/publicSpaces.json'

// Returns the bounding-box centre of any Polygon or MultiPolygon geometry
function bboxCenter(geometry) {
  const rings = geometry.type === 'Polygon'
    ? geometry.coordinates
    : geometry.coordinates.flat(1)
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (x < minX) minX = x; if (x > maxX) maxX = x
      if (y < minY) minY = y; if (y > maxY) maxY = y
    }
  }
  return [(minX + maxX) / 2, (minY + maxY) / 2]
}

// Build main GeoJSON (standalone districts + merged group polygons),
// a label-points GeoJSON (one point per district/group — guarantees one label each),
// and a sub-borders GeoJSON (individual polygons for grouped districts, lines only)
const { DISTRICT_GEOJSON, DISTRICT_LABELS_GEOJSON, DISTRICT_SUBS_GEOJSON } = (() => {
  const mainFeatures  = []
  const labelFeatures = []
  const subFeatures   = []

  const groupRawFeatures = Object.fromEntries(Object.keys(DISTRICT_GROUPS).map(g => [g, []]))

  for (const [name, fc] of Object.entries(districtBoundaries)) {
    if (!fc?.features) continue
    const groupName = DISTRICT_TO_GROUP[name]

    if (groupName) {
      for (const f of fc.features) {
        groupRawFeatures[groupName].push({ type: 'Feature', geometry: f.geometry, properties: { name } })
      }
      for (const f of fc.features) {
        subFeatures.push({ type: 'Feature', geometry: f.geometry, properties: { name } })
      }
    } else {
      const color = DISTRICT_COLORS[name] ?? '#6b7280'
      for (const f of fc.features) {
        mainFeatures.push({ type: 'Feature', geometry: f.geometry, properties: { name, color } })
      }
      // One label point at bbox centre of first feature
      const center = bboxCenter(fc.features[0].geometry)
      labelFeatures.push({ type: 'Feature', geometry: { type: 'Point', coordinates: center }, properties: { name } })
    }
  }

  for (const [groupName, { color, members, labelPerPart }] of Object.entries(DISTRICT_GROUPS)) {
    const features = groupRawFeatures[groupName]
    if (!features.length) continue
    try {
      const merged = union({ type: 'FeatureCollection', features })
      if (merged) {
        if (merged.geometry.type === 'Polygon') {
          merged.geometry.coordinates = [merged.geometry.coordinates[0]]
        } else if (merged.geometry.type === 'MultiPolygon') {
          merged.geometry.coordinates = merged.geometry.coordinates.map(p => [p[0]])
        }
        merged.properties = { name: groupName, color, isGroup: true }
        mainFeatures.push(merged)

        if (labelPerPart) {
          // One label per member polygon
          for (const f of features) {
            const center = bboxCenter(f.geometry)
            labelFeatures.push({ type: 'Feature', geometry: { type: 'Point', coordinates: center }, properties: { name: groupName } })
          }
        } else {
          const center = bboxCenter(merged.geometry)
          labelFeatures.push({ type: 'Feature', geometry: { type: 'Point', coordinates: center }, properties: { name: groupName } })
        }
      }
    } catch (e) {
      for (const f of features) {
        mainFeatures.push({ ...f, properties: { name: groupName, color, isGroup: true } })
      }
      const center = bboxCenter(features[0].geometry)
      labelFeatures.push({ type: 'Feature', geometry: { type: 'Point', coordinates: center }, properties: { name: groupName } })
    }
  }

  return {
    DISTRICT_GEOJSON:        { type: 'FeatureCollection', features: mainFeatures },
    DISTRICT_LABELS_GEOJSON: { type: 'FeatureCollection', features: labelFeatures },
    DISTRICT_SUBS_GEOJSON:   { type: 'FeatureCollection', features: subFeatures },
  }
})()

export function useMapLayers(map) {
  const { activeLayers, amenityData } = useMapStore()
  const psPopup = useRef(null)

  // ── District boundaries ──────────────────────────────────────────────────
  useEffect(() => {
    if (!map) return

    const SRC        = 'districts'
    const FILL       = 'districts-fill'
    const LINE       = 'districts-line'
    const LABEL_SRC  = 'district-labels'
    const LABEL      = 'districts-label'
    const SUB_SRC    = 'district-subs'
    const SUB_LINE   = 'district-subs-line'
    const SUB_LABEL  = 'district-subs-label'

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

        // Sub-district dashed borders drawn BEFORE the main solid line so the
        // outer group boundary's solid line renders on top and hides the dash there
        map.addSource(SUB_SRC, { type: 'geojson', data: DISTRICT_SUBS_GEOJSON })
        map.addLayer({
          id: SUB_LINE,
          type: 'line',
          source: SUB_SRC,
          paint: {
            'line-color': '#475569',
            'line-width': 1.5,
            'line-opacity': 0.7,
            'line-dasharray': [4, 3],
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

        // Sub-district names — only for groups with showSubLabels: true
        map.addLayer({
          id: SUB_LABEL,
          type: 'symbol',
          source: SUB_SRC,
          filter: ['==', ['get', 'showSubLabel'], true],
          layout: {
            'text-field': ['get', 'name'],
            'text-size': ['interpolate', ['linear'], ['zoom'], 10, 7, 12, 9, 14, 12, 16, 14],
            'text-font': ['Open Sans Regular'],
            'text-letter-spacing': 0.03,
            'text-max-width': 6,
          },
          paint: {
            'text-color': '#94a3b8',
            'text-halo-color': 'rgba(255,255,255,0.85)',
            'text-halo-width': 1,
          },
        })

        map.addSource(LABEL_SRC, { type: 'geojson', data: DISTRICT_LABELS_GEOJSON })
        map.addLayer({
          id: LABEL,
          type: 'symbol',
          source: LABEL_SRC,
          layout: {
            'text-field': ['upcase', ['get', 'name']],
            'text-size': ['interpolate', ['linear'], ['zoom'], 10, 9, 12, 12, 14, 16, 16, 20],
            'text-font': ['Open Sans Bold'],
            'text-letter-spacing': 0.06,
            'text-max-width': 8,
          },
          paint: {
            'text-color': '#1e293b',
            'text-halo-color': 'rgba(255,255,255,0.92)',
            'text-halo-width': 1.5,
          },
        })
      } else {
        map.setLayoutProperty(FILL,      'visibility', 'visible')
        map.setLayoutProperty(LINE,      'visibility', 'visible')
        map.setLayoutProperty(SUB_LINE,  'visibility', 'visible')
        map.setLayoutProperty(SUB_LABEL, 'visibility', 'visible')
        map.setLayoutProperty(LABEL,     'visibility', 'visible')
      }
    } else {
      if (map.getLayer(FILL))      map.setLayoutProperty(FILL,      'visibility', 'none')
      if (map.getLayer(LINE))      map.setLayoutProperty(LINE,      'visibility', 'none')
      if (map.getLayer(SUB_LINE))  map.setLayoutProperty(SUB_LINE,  'visibility', 'none')
      if (map.getLayer(SUB_LABEL)) map.setLayoutProperty(SUB_LABEL, 'visibility', 'none')
      if (map.getLayer(LABEL))     map.setLayoutProperty(LABEL,     'visibility', 'none')
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
