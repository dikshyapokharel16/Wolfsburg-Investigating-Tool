import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import { union } from '@turf/union'
import { area as turfArea } from '@turf/area'
import { useMapStore } from '../store/mapStore'
import districtBoundaries from '../data/districtBoundaries.json'
import { DISTRICT_COLORS, DISTRICT_GROUPS, DISTRICT_TO_GROUP, STANDALONE_POPULATIONS } from '../data/districtConfig.js'
import PUBLIC_SPACES_GEOJSON from '../data/publicSpaces.json'
import GOOGLE_PLACES_GEOJSON from '../data/googlePlaces.json'
import DWELL_GEOJSON   from '../data/dwellInfrastructure.json'
import CLOSURES_DATA   from '../data/closures.json'

const POPULATION_LOOKUP = {
  ...Object.fromEntries(
    Object.entries(DISTRICT_GROUPS).map(([name, { population2020, population2023 }]) => [
      name, { population2020, population2023 },
    ])
  ),
  ...Object.fromEntries(
    Object.entries(STANDALONE_POPULATIONS).map(([name, vals]) => [name, vals])
  ),
}

// Stats used for choropleth normalisation (density computed later from GeoJSON area)
const STAT_LOOKUP = {
  ...Object.fromEntries(
    Object.entries(DISTRICT_GROUPS).map(([name, { population2023, avgAge, rentPerSqm }]) => [
      name, { population2023, avgAge, rentPerSqm },
    ])
  ),
  ...Object.fromEntries(
    Object.entries(STANDALONE_POPULATIONS).map(([name, { population2023, avgAge, rentPerSqm }]) => [
      name, { population2023, avgAge, rentPerSqm },
    ])
  ),
}

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

  // Compute area (km²) per district from the merged features
  const AREA_KM2 = {}
  for (const f of mainFeatures) {
    const name = f.properties?.name
    if (!name) continue
    const sqMeters = turfArea(f)
    AREA_KM2[name] = (AREA_KM2[name] || 0) + sqMeters / 1_000_000
  }

  // Compute density and normalise all choropleth params 0→1
  for (const [name, area] of Object.entries(AREA_KM2)) {
    if (STAT_LOOKUP[name]) STAT_LOOKUP[name].density = STAT_LOOKUP[name].population2023 / area
  }

  const makeNorm = (values) => {
    const valid = values.filter(v => v != null && !isNaN(v))
    const min = Math.min(...valid), max = Math.max(...valid)
    return (v) => v == null ? 0 : max === min ? 0.5 : (v - min) / (max - min)
  }
  const normDensity = makeNorm(Object.values(STAT_LOOKUP).map(s => s.density))
  const normAge     = makeNorm(Object.values(STAT_LOOKUP).map(s => s.avgAge))
  const normRent    = makeNorm(Object.values(STAT_LOOKUP).map(s => s.rentPerSqm))

  for (const f of mainFeatures) {
    const s = STAT_LOOKUP[f.properties?.name]
    if (s) {
      f.properties.densityNorm = normDensity(s.density)
      f.properties.avgAgeNorm  = normAge(s.avgAge)
      f.properties.rentNorm    = normRent(s.rentPerSqm)
    }
  }

  return {
    DISTRICT_GEOJSON:        { type: 'FeatureCollection', features: mainFeatures },
    DISTRICT_LABELS_GEOJSON: { type: 'FeatureCollection', features: labelFeatures },
    DISTRICT_SUBS_GEOJSON:   { type: 'FeatureCollection', features: subFeatures },
    AREA_KM2,
  }
})()

const CHOROPLETH_CONFIG = [
  { id: 'choropleth-density', param: 'density',    key: 'densityNorm', color: '#818cf8' },
  { id: 'choropleth-avgAge',  param: 'avgAge',     key: 'avgAgeNorm',  color: '#f59e0b' },
  { id: 'choropleth-rent',    param: 'rentPerSqm', key: 'rentNorm',    color: '#14b8a6' },
]

export function useMapLayers(map) {
  const { activeLayers, amenityData, setSelectedDistrict, choroplethLayers, closureYear } = useMapStore()
  const googlePopup   = useRef(null)
  const dwellPopup    = useRef(null)
  const closurePopup  = useRef(null)
  const psPopup       = useRef(null)
  const freqPopup     = useRef(null)

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

  // ── Choropleth overlays (one fill layer per param, stackable) ────────────
  useEffect(() => {
    if (!map || !map.getSource('districts')) return

    for (const { id, param, key, color } of CHOROPLETH_CONFIG) {
      const visible = activeLayers.districts && choroplethLayers[param]
      if (!map.getLayer(id)) {
        // Insert below the border lines so outlines stay on top
        const beforeId = map.getLayer('district-subs-line') ? 'district-subs-line' : undefined
        map.addLayer({
          id,
          type: 'fill',
          source: 'districts',
          paint: {
            'fill-color': color,
            'fill-opacity': [
              'interpolate', ['linear'], ['get', key],
              0, 0.0,
              1, 0.55,
            ],
          },
          layout: { visibility: visible ? 'visible' : 'none' },
        }, beforeId)
      } else {
        map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none')
      }
    }
  }, [map, choroplethLayers, activeLayers.districts])

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
        map.on('click', (e) => {
          if (!map.queryRenderedFeatures(e.point, { layers: [LYR] }).length && psPopup.current?.isOpen())
            psPopup.current.remove()
        })
      } else {
        map.setLayoutProperty(LYR, 'visibility', 'visible')
      }
    } else {
      if (map.getLayer(LYR)) map.setLayoutProperty(LYR, 'visibility', 'none')
      if (psPopup.current) psPopup.current.remove()
    }
  }, [map, activeLayers.publicSpaces])

  // ── Neighbourhood Hotspots (frequency analysis) ───────────────────────────
  useEffect(() => {
    if (!map) return

    const SRC = 'public-spaces-freq'
    const LYR = 'freq-circles'

    if (activeLayers.frequencyAnalysis) {
      if (!map.getSource(SRC)) {
        map.addSource(SRC, { type: 'geojson', data: PUBLIC_SPACES_GEOJSON })

        map.addLayer({
          id: LYR,
          type: 'circle',
          source: SRC,
          paint: {
            'circle-radius': [
              'interpolate', ['linear'], ['zoom'],
              10, ['max', 4, ['*', 0.8, ['sqrt', ['get', 'areaHa']]]],
              14, ['max', 6, ['*', 3.5, ['sqrt', ['get', 'areaHa']]]],
            ],
            'circle-color': [
              'interpolate', ['linear'], ['get', 'frequencyScore'],
              0,  '#fef9c3',
              25, '#fbbf24',
              50, '#f97316',
              75, '#dc2626',
            ],
            'circle-opacity': 0.85,
            'circle-stroke-width': 2,
            'circle-stroke-color': 'rgba(255,255,255,0.9)',
          },
        })

        const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: false, maxWidth: '260px' })
        freqPopup.current = popup

        map.on('click', LYR, (e) => {
          const p = e.features[0].properties
          const tierColors = { 'very-high': '#ef4444', high: '#f97316', medium: '#f59e0b', low: '#22c55e', 'very-low': '#3b82f6' }
          const tierColor  = tierColors[p.frequencyTier] ?? '#6b7280'
          const tierLabel  = (p.frequencyTier ?? '').replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase())
          popup
            .setLngLat(e.lngLat)
            .setHTML(
              `<div style="font-family:system-ui,sans-serif;padding:2px 0">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
                  <div style="width:8px;height:8px;border-radius:50%;background:${tierColor};flex-shrink:0"></div>
                  <span style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;font-weight:600">${p.typology}</span>
                </div>
                <div style="font-size:14px;font-weight:700;color:#111827;margin-bottom:4px;line-height:1.3">${p.name}</div>
                <div style="font-size:11px;color:#6b7280;margin-bottom:6px">${p.district ?? ''}</div>
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                  <span style="font-size:11px;font-weight:700;color:${tierColor}">${tierLabel}</span>
                  <span style="font-size:11px;color:#9ca3af">${p.frequencyScore}/100</span>
                </div>
                <div style="font-size:10px;color:#9ca3af;border-top:1px solid #f3f4f6;padding-top:5px">Source: OpenStreetMap</div>
              </div>`
            )
            .addTo(map)
        })

        map.on('mouseenter', LYR, () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', LYR, () => { map.getCanvas().style.cursor = '' })
        map.on('click', (e) => {
          if (!map.queryRenderedFeatures(e.point, { layers: [LYR] }).length && freqPopup.current?.isOpen())
            freqPopup.current.remove()
        })
      } else {
        map.setLayoutProperty(LYR, 'visibility', 'visible')
      }
    } else {
      if (map.getLayer(LYR)) map.setLayoutProperty(LYR, 'visibility', 'none')
      if (freqPopup.current) freqPopup.current.remove()
    }
  }, [map, activeLayers.frequencyAnalysis])

  // ── Google Activity Heatmap ───────────────────────────────────────────────
  useEffect(() => {
    if (!map) return

    const SRC  = 'google-activity'
    const HEAT = 'google-activity-heat'
    const DOT  = 'google-activity-dots'

    if (activeLayers.googleActivity) {
      if (!map.getSource(SRC)) {
        map.addSource(SRC, { type: 'geojson', data: GOOGLE_PLACES_GEOJSON })

        map.addLayer({
          id: HEAT,
          type: 'heatmap',
          source: SRC,
          paint: {
            'heatmap-weight': ['interpolate', ['linear'], ['get', 'weight'], 0, 0, 8, 1],
            'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 15, 1.5],
            'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 20, 15, 50],
            'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0.85, 15, 0.4],
            'heatmap-color': [
              'interpolate', ['linear'], ['heatmap-density'],
              0,    'rgba(191,219,254,0)',
              0.2,  '#bfdbfe',
              0.5,  '#818cf8',
              0.8,  '#4338ca',
              1.0,  '#312e81',
            ],
          },
        })

        map.addLayer({
          id: DOT,
          type: 'circle',
          source: SRC,
          minzoom: 13,
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 3, 16, 7],
            'circle-color': '#6366f1',
            'circle-opacity': 0.85,
            'circle-stroke-width': 1.5,
            'circle-stroke-color': 'rgba(255,255,255,0.9)',
          },
        })

        const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: false, maxWidth: '240px' })
        googlePopup.current = popup

        map.on('click', DOT, (e) => {
          const p = e.features[0].properties
          popup
            .setLngLat(e.lngLat)
            .setHTML(
              `<div style="font-family:system-ui,sans-serif;padding:2px 0">
                <div style="font-size:14px;font-weight:700;color:#111827;margin-bottom:4px">${p.name}</div>
                <div style="font-size:11px;color:#6b7280;margin-bottom:5px">${p.types || ''}</div>
                <div style="display:flex;align-items:center;gap:8px">
                  <span style="font-size:13px;font-weight:700;color:#f97316">★ ${p.rating || '—'}</span>
                  <span style="font-size:11px;color:#9ca3af">${(p.reviewCount || 0).toLocaleString()} reviews</span>
                </div>
              </div>`
            )
            .addTo(map)
        })

        map.on('mouseenter', DOT, () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', DOT, () => { map.getCanvas().style.cursor = '' })
        map.on('click', (e) => {
          if (!map.queryRenderedFeatures(e.point, { layers: [DOT] }).length && googlePopup.current?.isOpen())
            googlePopup.current.remove()
        })
      } else {
        map.setLayoutProperty(HEAT, 'visibility', 'visible')
        map.setLayoutProperty(DOT,  'visibility', 'visible')
      }
    } else {
      if (map.getLayer(HEAT)) map.setLayoutProperty(HEAT, 'visibility', 'none')
      if (map.getLayer(DOT))  map.setLayoutProperty(DOT,  'visibility', 'none')
      if (googlePopup.current) googlePopup.current.remove()
    }
  }, [map, activeLayers.googleActivity])

  // ── Dwell Infrastructure ──────────────────────────────────────────────────
  useEffect(() => {
    if (!map) return

    const SRC  = 'dwell-infra'
    const HEAT = 'dwell-heat'
    const DOT  = 'dwell-dots'

    if (activeLayers.dwellInfrastructure) {
      if (!map.getSource(SRC)) {
        map.addSource(SRC, { type: 'geojson', data: DWELL_GEOJSON })

        map.addLayer({
          id: HEAT,
          type: 'heatmap',
          source: SRC,
          maxzoom: 15,
          paint: {
            'heatmap-weight': ['interpolate', ['linear'], ['get', 'weight'], 1, 0.2, 5, 1],
            'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 0.4, 15, 1.2],
            'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 12, 15, 30],
            'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0.8, 15, 0],
            'heatmap-color': [
              'interpolate', ['linear'], ['heatmap-density'],
              0,   'rgba(167,243,208,0)',
              0.2, '#a7f3d0',
              0.5, '#10b981',
              0.8, '#065f46',
              1.0, '#022c22',
            ],
          },
        })

        map.addLayer({
          id: DOT,
          type: 'circle',
          source: SRC,
          minzoom: 13,
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'],
              13, ['case', ['==', ['get', 'type'], 'outdoor_seating'], 5, 3],
              16, ['case', ['==', ['get', 'type'], 'outdoor_seating'], 9, 6],
            ],
            'circle-color': [
              'match', ['get', 'type'],
              'outdoor_seating', '#065f46',
              'shelter',         '#059669',
              'toilets',         '#059669',
              'picnic_table',    '#6ee7b7',
              '#a7f3d0',
            ],
            'circle-opacity': 0.9,
            'circle-stroke-width': 1,
            'circle-stroke-color': 'rgba(255,255,255,0.8)',
          },
        })

        const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: false, maxWidth: '220px' })
        dwellPopup.current = popup

        map.on('click', DOT, (e) => {
          const p = e.features[0].properties
          const stars = '●'.repeat(p.weight) + '○'.repeat(5 - p.weight)
          const dotColor = { outdoor_seating:'#065f46', shelter:'#059669', toilets:'#059669', picnic_table:'#6ee7b7' }[p.type] ?? '#a7f3d0'
          popup
            .setLngLat(e.lngLat)
            .setHTML(
              `<div style="font-family:system-ui,sans-serif;padding:2px 0">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
                  <div style="width:8px;height:8px;border-radius:50%;background:${dotColor};flex-shrink:0"></div>
                  <span style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;font-weight:600">${p.label}</span>
                </div>
                ${p.name ? `<div style="font-size:13px;font-weight:600;color:#111827;margin-bottom:4px">${p.name}</div>` : ''}
                <div style="font-size:11px;color:#f59e0b;letter-spacing:0.05em">${stars}</div>
                <div style="font-size:10px;color:#9ca3af;margin-top:3px">Dwell weight: ${p.weight}/5</div>
              </div>`
            )
            .addTo(map)
        })

        map.on('mouseenter', DOT, () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', DOT, () => { map.getCanvas().style.cursor = '' })
        map.on('click', (e) => {
          if (!map.queryRenderedFeatures(e.point, { layers: [DOT] }).length && dwellPopup.current?.isOpen())
            dwellPopup.current.remove()
        })
      } else {
        map.setLayoutProperty(HEAT, 'visibility', 'visible')
        map.setLayoutProperty(DOT,  'visibility', 'visible')
      }
    } else {
      if (map.getLayer(HEAT)) map.setLayoutProperty(HEAT, 'visibility', 'none')
      if (map.getLayer(DOT))  map.setLayoutProperty(DOT,  'visibility', 'none')
      if (dwellPopup.current) dwellPopup.current.remove()
    }
  }, [map, activeLayers.dwellInfrastructure])

  // ── Shop & Café Closures ──────────────────────────────────────────────────
  useEffect(() => {
    if (!map) return

    const SRC = 'closures'
    const LYR = 'closures-dots'

    if (activeLayers.closures) {
      if (!map.getSource(SRC)) {
        map.addSource(SRC, { type: 'geojson', data: CLOSURES_DATA.closures })

        map.addLayer({
          id: LYR,
          type: 'circle',
          source: SRC,
          filter: ['<=', ['get', 'year'], closureYear],
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 4, 15, 9],
            'circle-color': [
              'match', ['get', 'year'],
              2019, '#94a3b8',
              2020, '#64748b',
              2021, '#ef4444',
              2022, '#f97316',
              2023, '#eab308',
              2024, '#22c55e',
              '#94a3b8',
            ],
            'circle-opacity': 0.9,
            'circle-stroke-width': 1.5,
            'circle-stroke-color': 'rgba(255,255,255,0.85)',
          },
        })

        const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: false, maxWidth: '240px' })
        closurePopup.current = popup

        map.on('click', LYR, (e) => {
          const p = e.features[0].properties
          popup
            .setLngLat(e.lngLat)
            .setHTML(
              `<div style="font-family:system-ui,sans-serif;padding:2px 0">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
                  <div style="width:8px;height:8px;border-radius:50%;background:#475569;flex-shrink:0"></div>
                  <span style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;font-weight:600">Closed · ${p.venueType}</span>
                </div>
                <div style="font-size:14px;font-weight:700;color:#111827;margin-bottom:4px">${p.name || 'Unnamed venue'}</div>
                <div style="font-size:11px;color:#6b7280;margin-bottom:3px">Closed: ${p.year ?? 'unknown'}</div>
                <div style="font-size:10px;color:#9ca3af">Source: OpenStreetMap history</div>
              </div>`
            )
            .addTo(map)
        })

        map.on('mouseenter', LYR, () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', LYR, () => { map.getCanvas().style.cursor = '' })
        map.on('click', (e) => {
          if (!map.queryRenderedFeatures(e.point, { layers: [LYR] }).length && closurePopup.current?.isOpen())
            closurePopup.current.remove()
        })
      } else {
        map.setLayoutProperty(LYR, 'visibility', 'visible')
      }
    } else {
      if (map.getLayer(LYR)) map.setLayoutProperty(LYR, 'visibility', 'none')
      if (closurePopup.current) closurePopup.current.remove()
    }
  }, [map, activeLayers.closures])

  // Update closure filter when slider year changes
  useEffect(() => {
    if (!map || !map.getLayer('closures-dots')) return
    map.setFilter('closures-dots', ['<=', ['get', 'year'], closureYear])
  }, [map, closureYear])
}
