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
import VACANT_GEOJSON  from '../data/vacantPlaces.json'

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


function raiseTopLayers(map) {
  for (const lyr of ['strava-heatmap-run-layer', 'strava-heatmap-ride-layer']) {
    if (map.getLayer(lyr) && map.getLayoutProperty(lyr, 'visibility') !== 'none') {
      map.moveLayer(lyr)
    }
  }
  for (const lyr of ['space-frequency-lines', 'cycling-space-frequency-lines']) {
    if (map.getLayer(lyr) && map.getLayoutProperty(lyr, 'visibility') !== 'none') {
      map.moveLayer(lyr)
    }
  }
}

const CHOROPLETH_CONFIG = [
  { id: 'choropleth-density', param: 'density',    key: 'densityNorm', color: '#818cf8' },
  { id: 'choropleth-avgAge',  param: 'avgAge',     key: 'avgAgeNorm',  color: '#f59e0b' },
  { id: 'choropleth-rent',    param: 'rentPerSqm', key: 'rentNorm',    color: '#14b8a6' },
]

const AERIAL_MASK_GEOJSON = (() => {
  try {
    const allFeatures = []
    for (const fc of Object.values(districtBoundaries)) {
      if (!fc?.features) continue
      for (const f of fc.features) {
        allFeatures.push({ type: 'Feature', geometry: f.geometry, properties: {} })
      }
    }
    if (!allFeatures.length) return null

    let merged = allFeatures[0]
    for (let i = 1; i < allFeatures.length; i++) {
      const r = union({ type: 'FeatureCollection', features: [merged, allFeatures[i]] })
      if (r) merged = r
    }

    const cityGeom = merged.geometry
    const worldRing = [[-180,-90],[180,-90],[180,90],[-180,90],[-180,-90]]
    const holeRings = cityGeom.type === 'Polygon'
      ? [cityGeom.coordinates[0]]
      : cityGeom.coordinates.map(p => p[0])

    return {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [worldRing, ...holeRings] }, properties: {} }],
    }
  } catch { return null }
})()

function registerIcon(map, id, drawFn, size = 24) {
  if (map.hasImage(id)) return
  const canvas = document.createElement('canvas')
  canvas.width = size; canvas.height = size
  const ctx = canvas.getContext('2d')
  drawFn(ctx, size)
  const img = ctx.getImageData(0, 0, size, size)
  map.addImage(id, { width: size, height: size, data: img.data })
}

function registerXIcon(map, id, color) {
  registerIcon(map, id, (ctx, s) => {
    const p = 5
    ctx.strokeStyle = color
    ctx.lineWidth = 3.5
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(p, p);     ctx.lineTo(s - p, s - p)
    ctx.moveTo(s - p, p); ctx.lineTo(p, s - p)
    ctx.stroke()
  }, 22)
}

function registerDiamondIcon(map, id, fillColor) {
  registerIcon(map, id, (ctx, s) => {
    const m = s / 2
    ctx.beginPath()
    ctx.moveTo(m, 2); ctx.lineTo(s - 2, m)
    ctx.lineTo(m, s - 2); ctx.lineTo(2, m)
    ctx.closePath()
    ctx.fillStyle = fillColor
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = 2
    ctx.stroke()
  }, 22)
}

export function useMapLayers(map) {
  const {
    activeLayers, amenityData,
    pedestrianData, cyclingData, cycleParkingData, busStopsData,
    spaceFrequencyData, cyclingSpaceFrequencyData,
    choroplethLayers, closureYear,
  } = useMapStore()
  const psPopup      = useRef(null)
  const cpPopup      = useRef(null)
  const bsPopup      = useRef(null)
  const googlePopup  = useRef(null)
  const dwellPopup   = useRef(null)
  const closurePopup = useRef(null)
  const vacantPopup  = useRef(null)
  const freqPopup    = useRef(null)

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
        const beforeId = map.getLayer('district-subs-line') ? 'district-subs-line' : undefined
        map.addLayer({
          id,
          type: 'fill',
          source: 'districts',
          paint: {
            'fill-color': color,
            'fill-opacity': ['interpolate', ['linear'], ['get', key], 0, 0.0, 1, 0.55],
          },
          layout: { visibility: visible ? 'visible' : 'none' },
        }, beforeId)
      } else {
        map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none')
      }
    }
  }, [map, choroplethLayers, activeLayers.districts])

  // ── Aerial Imagery (Esri World Imagery, masked to Wolfsburg boundary) ─────
  useEffect(() => {
    if (!map) return

    const RASTER_SRC = 'aerial-imagery'
    const RASTER_LYR = 'aerial-raster'
    const MASK_SRC   = 'aerial-mask'
    const MASK_LYR   = 'aerial-mask-fill'

    if (activeLayers.aerialView) {
      if (!map.getSource(RASTER_SRC)) {
        const anchor = map.getStyle().layers.find(l => l.type === 'line' || l.type === 'symbol')?.id

        map.addSource(RASTER_SRC, {
          type: 'raster',
          tiles: ['https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
          tileSize: 256,
          maxzoom: 20,
          attribution: '© Esri, Earthstar Geographics',
        })

        map.addLayer({
          id: RASTER_LYR,
          type: 'raster',
          source: RASTER_SRC,
          paint: { 'raster-opacity': 1, 'raster-fade-duration': 300 },
        }, anchor)

        if (AERIAL_MASK_GEOJSON) {
          map.addSource(MASK_SRC, { type: 'geojson', data: AERIAL_MASK_GEOJSON })
          map.addLayer({
            id: MASK_LYR,
            type: 'fill',
            source: MASK_SRC,
            paint: { 'fill-color': '#f5f4f2', 'fill-opacity': 1 },
          }, anchor)
        }
      } else {
        map.setLayoutProperty(RASTER_LYR, 'visibility', 'visible')
        if (map.getLayer(MASK_LYR)) map.setLayoutProperty(MASK_LYR, 'visibility', 'visible')
      }
    } else {
      if (map.getLayer(RASTER_LYR)) map.setLayoutProperty(RASTER_LYR, 'visibility', 'none')
      if (map.getLayer(MASK_LYR))   map.setLayoutProperty(MASK_LYR,   'visibility', 'none')
    }
  }, [map, activeLayers.aerialView])

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

  // ── Pedestrian Network ────────────────────────────────────────────────────
  useEffect(() => {
    if (!map) return
    const SRC      = 'pedestrian-network'
    const LYR_SHR  = 'pedestrian-shared'
    const LYR_DED  = 'pedestrian-dedicated'

    if (activeLayers.pedestrianNetwork && pedestrianData?.features?.length) {
      if (!map.getSource(SRC)) {
        map.addSource(SRC, { type: 'geojson', data: pedestrianData })

        map.addLayer({
          id: LYR_SHR,
          type: 'line',
          source: SRC,
          filter: ['==', ['get', 'dedicated'], 0],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#8aa5b5',
            'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.8, 16, 2],
            'line-opacity': 0.55,
          },
        })

        map.addLayer({
          id: LYR_DED,
          type: 'line',
          source: SRC,
          filter: ['==', ['get', 'dedicated'], 1],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#1e3a8a',
            'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1.2, 16, 2.8],
            'line-opacity': 0.9,
          },
        })
      } else {
        map.getSource(SRC).setData(pedestrianData)
        map.setLayoutProperty(LYR_SHR, 'visibility', 'visible')
        map.setLayoutProperty(LYR_DED, 'visibility', 'visible')
      }
      raiseTopLayers(map)
    } else {
      if (map.getLayer(LYR_SHR)) map.setLayoutProperty(LYR_SHR, 'visibility', 'none')
      if (map.getLayer(LYR_DED)) map.setLayoutProperty(LYR_DED, 'visibility', 'none')
    }
  }, [map, activeLayers.pedestrianNetwork, pedestrianData])

  // ── Cycling Network ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!map) return
    const SRC      = 'cycling-network'
    const LYR_SHR  = 'cycling-shared'
    const LYR_DED  = 'cycling-dedicated'

    if (activeLayers.cyclingNetwork && cyclingData?.features?.length) {
      if (!map.getSource(SRC)) {
        map.addSource(SRC, { type: 'geojson', data: cyclingData })

        map.addLayer({
          id: LYR_SHR,
          type: 'line',
          source: SRC,
          filter: ['==', ['get', 'dedicated'], 0],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#8aa5b5',
            'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.8, 16, 2],
            'line-opacity': 0.55,
          },
        })

        map.addLayer({
          id: LYR_DED,
          type: 'line',
          source: SRC,
          filter: ['==', ['get', 'dedicated'], 1],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#1a6aaa',
            'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1.2, 16, 2.8],
            'line-opacity': 0.9,
          },
        })
      } else {
        map.getSource(SRC).setData(cyclingData)
        map.setLayoutProperty(LYR_SHR, 'visibility', 'visible')
        map.setLayoutProperty(LYR_DED, 'visibility', 'visible')
      }
      raiseTopLayers(map)
    } else {
      if (map.getLayer(LYR_SHR)) map.setLayoutProperty(LYR_SHR, 'visibility', 'none')
      if (map.getLayer(LYR_DED)) map.setLayoutProperty(LYR_DED, 'visibility', 'none')
    }
  }, [map, activeLayers.cyclingNetwork, cyclingData])

  // ── Cycle Parking ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!map) return
    const SRC = 'cycle-parking'
    const LYR = 'cycle-parking-circles'

    if (activeLayers.cycleParking && cycleParkingData?.features?.length) {
      if (!map.getSource(SRC)) {
        map.addSource(SRC, { type: 'geojson', data: cycleParkingData })
        map.addLayer({
          id: LYR,
          type: 'circle',
          source: SRC,
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 4, 16, 9],
            'circle-color': '#2d9da8',
            'circle-opacity': 0.85,
            'circle-stroke-width': 1.5,
            'circle-stroke-color': 'rgba(255,255,255,0.9)',
          },
        })

        map.on('click', LYR, (e) => {
          const p = e.features[0].properties
          const type     = p.bicycle_parking ? p.bicycle_parking.replace(/_/g, ' ') : '—'
          const capacity = p.capacity ?? '—'
          const covered  = p.covered === 'yes' ? 'Yes' : p.covered === 'no' ? 'No' : '—'
          const access   = p.access ?? 'public'
          if (cpPopup.current) cpPopup.current.remove()
          cpPopup.current = new maplibregl.Popup({ closeButton: true, closeOnClick: true, maxWidth: '220px' })
            .setLngLat(e.lngLat)
            .setHTML(`
              <div style="font-family:system-ui,sans-serif;padding:2px 0">
                <div style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;margin-bottom:8px">Cycle Parking</div>
                <div style="display:grid;grid-template-columns:auto 1fr;gap:5px 12px;font-size:12px">
                  <span style="color:#9ca3af">Type</span>
                  <span style="color:#111827;text-transform:capitalize">${type}</span>
                  <span style="color:#9ca3af">Capacity</span>
                  <span style="color:#111827">${capacity}</span>
                  <span style="color:#9ca3af">Covered</span>
                  <span style="color:#111827">${covered}</span>
                  <span style="color:#9ca3af">Access</span>
                  <span style="color:#111827;text-transform:capitalize">${access}</span>
                </div>
              </div>`)
            .addTo(map)
        })
        map.on('mouseenter', LYR, () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', LYR, () => { map.getCanvas().style.cursor = '' })
      } else {
        map.getSource(SRC).setData(cycleParkingData)
        map.setLayoutProperty(LYR, 'visibility', 'visible')
      }
    } else {
      if (map.getLayer(LYR)) map.setLayoutProperty(LYR, 'visibility', 'none')
    }
  }, [map, activeLayers.cycleParking, cycleParkingData])

  // ── Bus Stops ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!map) return
    const SRC = 'bus-stops'
    const LYR = 'bus-stops-circles'

    if (activeLayers.busStops && busStopsData?.features?.length) {
      if (!map.getSource(SRC)) {
        map.addSource(SRC, { type: 'geojson', data: busStopsData })
        map.addLayer({
          id: LYR,
          type: 'circle',
          source: SRC,
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 2.5, 16, 6],
            'circle-color': '#8b5cf6',
            'circle-opacity': 0.85,
            'circle-stroke-width': 1.5,
            'circle-stroke-color': 'rgba(255,255,255,0.9)',
          },
        })

        map.on('click', LYR, (e) => {
          const p = e.features[0].properties
          const name     = p.name ?? '—'
          const ref      = p.ref ?? '—'
          const operator = p.operator ?? '—'
          const shelter  = p.shelter === 'yes' ? 'Yes' : p.shelter === 'no' ? 'No' : '—'
          const bench    = p.bench === 'yes' ? 'Yes' : p.bench === 'no' ? 'No' : '—'
          if (bsPopup.current) bsPopup.current.remove()
          bsPopup.current = new maplibregl.Popup({ closeButton: true, closeOnClick: true, maxWidth: '220px' })
            .setLngLat(e.lngLat)
            .setHTML(`
              <div style="font-family:system-ui,sans-serif;padding:2px 0">
                <div style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;margin-bottom:8px">Bus Stop</div>
                <div style="display:grid;grid-template-columns:auto 1fr;gap:5px 12px;font-size:12px">
                  <span style="color:#9ca3af">Name</span>
                  <span style="color:#111827">${name}</span>
                  <span style="color:#9ca3af">Lines</span>
                  <span style="color:#111827">${ref}</span>
                  <span style="color:#9ca3af">Operator</span>
                  <span style="color:#111827">${operator}</span>
                  <span style="color:#9ca3af">Shelter</span>
                  <span style="color:#111827">${shelter}</span>
                  <span style="color:#9ca3af">Bench</span>
                  <span style="color:#111827">${bench}</span>
                </div>
              </div>`)
            .addTo(map)
        })
        map.on('mouseenter', LYR, () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', LYR, () => { map.getCanvas().style.cursor = '' })
      } else {
        map.getSource(SRC).setData(busStopsData)
        map.setLayoutProperty(LYR, 'visibility', 'visible')
      }
    } else {
      if (map.getLayer(LYR)) map.setLayoutProperty(LYR, 'visibility', 'none')
    }
  }, [map, activeLayers.busStops, busStopsData])

  // ── Bus Stop Catchment Density (heatmap) ─────────────────────────────────
  useEffect(() => {
    if (!map) return
    const SRC = 'bus-stop-catchment'
    const LYR = 'bus-stop-catchment-heatmap'

    if (activeLayers.busStopCatchment && busStopsData?.features?.length) {
      if (!map.getSource(SRC)) {
        map.addSource(SRC, { type: 'geojson', data: busStopsData })
        map.addLayer({
          id: LYR,
          type: 'heatmap',
          source: SRC,
          paint: {
            // Radius approximates 400m catchment at each zoom level
            'heatmap-radius': [
              'interpolate', ['linear'], ['zoom'],
              10, 15,
              12, 40,
              14, 150,
            ],
            'heatmap-intensity': [
              'interpolate', ['linear'], ['zoom'],
              10, 0.5,
              14, 1,
            ],
            'heatmap-color': [
              'interpolate', ['linear'], ['heatmap-density'],
              0,   'rgba(0,0,0,0)',
              0.2, '#e9d5ff',
              0.4, '#c4b5fd',
              0.6, '#8b5cf6',
              0.8, '#6d28d9',
              1.0, '#2e1065',
            ],
            'heatmap-opacity': 0.85,
          },
        })
      } else {
        map.setLayoutProperty(LYR, 'visibility', 'visible')
      }
    } else {
      if (map.getLayer(LYR)) map.setLayoutProperty(LYR, 'visibility', 'none')
    }
  }, [map, activeLayers.busStopCatchment, busStopsData])

  // ── Strava Running Heatmap (raster tiles) ────────────────────────────────
  useEffect(() => {
    if (!map) return
    const SRC = 'strava-heatmap-run'
    const LYR = 'strava-heatmap-run-layer'

    if (activeLayers.stravaHeatmapRun) {
      if (!map.getSource(SRC)) {
        map.addSource(SRC, {
          type: 'raster',
          tiles: [
            '/strava-heatmap-a/tiles/run/hot/{z}/{x}/{y}@2x.png',
            '/strava-heatmap-b/tiles/run/hot/{z}/{x}/{y}@2x.png',
            '/strava-heatmap-c/tiles/run/hot/{z}/{x}/{y}.png',
          ],
          tileSize: 256,
          minzoom: 0,
          maxzoom: 15,
          attribution: '© Strava',
        })
        map.addLayer({
          id: LYR,
          type: 'raster',
          source: SRC,
          paint: {
            'raster-opacity': 0.5,
            'raster-saturation': 0.2,
            'raster-contrast': 0.15,
            'raster-brightness-max': 0.9,
          },
        })
      } else {
        map.setLayoutProperty(LYR, 'visibility', 'visible')
        map.moveLayer(LYR)
      }
      raiseTopLayers(map)
    } else {
      if (map.getLayer(LYR)) map.setLayoutProperty(LYR, 'visibility', 'none')
    }
  }, [map, activeLayers.stravaHeatmapRun, activeLayers.pedestrianNetwork, activeLayers.cyclingNetwork, activeLayers.cycleParking, activeLayers.busStops, activeLayers.stravaRunning, activeLayers.stravaCycling])

  // ── Strava Cycling Heatmap (raster tiles) ────────────────────────────────
  useEffect(() => {
    if (!map) return
    const SRC = 'strava-heatmap-ride'
    const LYR = 'strava-heatmap-ride-layer'

    if (activeLayers.stravaHeatmapRide) {
      if (!map.getSource(SRC)) {
        map.addSource(SRC, {
          type: 'raster',
          tiles: [
            '/strava-heatmap-a/tiles/ride/hot/{z}/{x}/{y}@2x.png',
            '/strava-heatmap-b/tiles/ride/hot/{z}/{x}/{y}@2x.png',
            '/strava-heatmap-c/tiles/ride/hot/{z}/{x}/{y}.png',
          ],
          tileSize: 256,
          minzoom: 0,
          maxzoom: 15,
          attribution: '© Strava',
        })
        map.addLayer({
          id: LYR,
          type: 'raster',
          source: SRC,
          paint: {
            'raster-opacity': 0.5,
            'raster-saturation': 0.2,
            'raster-contrast': 0.15,
            'raster-brightness-max': 0.9,
          },
        })
      } else {
        map.setLayoutProperty(LYR, 'visibility', 'visible')
        map.moveLayer(LYR)
      }
      raiseTopLayers(map)
    } else {
      if (map.getLayer(LYR)) map.setLayoutProperty(LYR, 'visibility', 'none')
    }
  }, [map, activeLayers.stravaHeatmapRide, activeLayers.pedestrianNetwork, activeLayers.cyclingNetwork, activeLayers.cycleParking, activeLayers.busStops, activeLayers.stravaRunning, activeLayers.stravaCycling])

  // ── Space Syntax Frequency ───────────────────────────────────────────────
  useEffect(() => {
    if (!map) return
    const SRC = 'space-frequency'
    const LYR = 'space-frequency-lines'

    if (activeLayers.spaceFrequency && spaceFrequencyData?.features?.length) {
      if (!map.getSource(SRC)) {
        map.addSource(SRC, { type: 'geojson', data: spaceFrequencyData })
        map.addLayer({
          id: LYR,
          type: 'line',
          source: SRC,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              11, ['interpolate', ['linear'], ['get', 'percentile'], 0, 1, 100, 4],
              16, ['interpolate', ['linear'], ['get', 'percentile'], 0, 2, 100, 8],
            ],
            'line-color': ['step', ['get', 'percentile'],
              '#3b82f6',       // < 50  → blue
              50, '#0d9488',   // 50–64 → teal
              65, '#16a34a',   // 65–79 → green
              80, '#f59e0b',   // 80–89 → orange-yellow
              90, '#ea580c',   // 90–96 → orange-red
              97, '#dc2626',   // 97–98 → red
              99, '#7f1d1d',   // ≥ 99  → dark red
            ],
            'line-opacity': 0.7,
          },
        })
        map.moveLayer(LYR)
      } else {
        map.getSource(SRC).setData(spaceFrequencyData)
        map.setLayoutProperty(LYR, 'visibility', 'visible')
        map.moveLayer(LYR)
      }
    } else {
      if (map.getLayer(LYR)) map.setLayoutProperty(LYR, 'visibility', 'none')
    }
  }, [map, activeLayers.spaceFrequency, spaceFrequencyData])

  // ── Cycling Space Syntax Frequency ───────────────────────────────────────
  useEffect(() => {
    if (!map) return
    const SRC = 'cycling-space-frequency'
    const LYR = 'cycling-space-frequency-lines'

    if (activeLayers.cyclingSpaceFrequency && cyclingSpaceFrequencyData?.features?.length) {
      if (!map.getSource(SRC)) {
        map.addSource(SRC, { type: 'geojson', data: cyclingSpaceFrequencyData })
        map.addLayer({
          id: LYR,
          type: 'line',
          source: SRC,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              11, ['interpolate', ['linear'], ['get', 'percentile'], 0, 1, 100, 4],
              16, ['interpolate', ['linear'], ['get', 'percentile'], 0, 2, 100, 8],
            ],
            'line-color': ['step', ['get', 'percentile'],
              '#3b82f6',
              50, '#0d9488',
              65, '#16a34a',
              80, '#f59e0b',
              90, '#ea580c',
              97, '#dc2626',
              99, '#7f1d1d',
            ],
            'line-opacity': 0.7,
          },
        })
        map.moveLayer(LYR)
      } else {
        map.getSource(SRC).setData(cyclingSpaceFrequencyData)
        map.setLayoutProperty(LYR, 'visibility', 'visible')
        map.moveLayer(LYR)
      }
    } else {
      if (map.getLayer(LYR)) map.setLayoutProperty(LYR, 'visibility', 'none')
    }
  }, [map, activeLayers.cyclingSpaceFrequency, cyclingSpaceFrequencyData])

  // ── Combined Movement Heatmap ─────────────────────────────────────────────
  useEffect(() => {
    if (!map) return
    const SRC = 'combined-heatmap'
    const LYR = 'combined-heatmap-layer'

    if (activeLayers.combinedHeatmap && (spaceFrequencyData || cyclingSpaceFrequencyData)) {
      // Build cycling midpoint lookup for spatial matching
      const THRESH2 = 0.000002 // ~100m in degree-space at 52°N
      const cycMids = []
      const cycUsed = new Set()
      if (cyclingSpaceFrequencyData) {
        for (const f of cyclingSpaceFrequencyData.features) {
          const c = f.geometry.coordinates
          cycMids.push({
            lon: (c[0][0] + c[c.length - 1][0]) / 2,
            lat: (c[0][1] + c[c.length - 1][1]) / 2,
            weight: f.properties.percentile / 100,
          })
        }
      }

      const points = []

      // Pedestrian points — match to nearest cycling counterpart and average
      if (spaceFrequencyData) {
        for (const f of spaceFrequencyData.features) {
          const c = f.geometry.coordinates
          const mLon = (c[0][0] + c[c.length - 1][0]) / 2
          const mLat = (c[0][1] + c[c.length - 1][1]) / 2
          const pedW = f.properties.percentile / 100

          let bestD2 = THRESH2, bestIdx = -1
          for (let i = 0; i < cycMids.length; i++) {
            if (cycUsed.has(i)) continue
            const dx = mLon - cycMids[i].lon
            const dy = mLat - cycMids[i].lat
            const d2 = dx * dx + dy * dy
            if (d2 < bestD2) { bestD2 = d2; bestIdx = i }
          }

          const weight = bestIdx >= 0
            ? (pedW + cycMids[bestIdx].weight) / 2
            : pedW
          if (bestIdx >= 0) cycUsed.add(bestIdx)

          points.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [mLon, mLat] },
            properties: { weight },
          })
        }
      }

      // Unmatched cycling points — add as-is
      for (let i = 0; i < cycMids.length; i++) {
        if (cycUsed.has(i)) continue
        points.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [cycMids[i].lon, cycMids[i].lat] },
          properties: { weight: cycMids[i].weight },
        })
      }
      const data = { type: 'FeatureCollection', features: points }

      if (!map.getSource(SRC)) {
        map.addSource(SRC, { type: 'geojson', data })
        map.addLayer({
          id: LYR,
          type: 'heatmap',
          source: SRC,
          paint: {
            'heatmap-weight': ['get', 'weight'],
            'heatmap-radius': [
              'interpolate', ['linear'], ['zoom'],
              10, 7,
              12, 12,
              14, 17,
              16, 25,
            ],
            'heatmap-intensity': [
              'interpolate', ['linear'], ['zoom'],
              10, 0.5,
              12, 1.0,
              14, 1.5,
              16, 2.5,
            ],
            'heatmap-color': [
              'interpolate', ['linear'], ['heatmap-density'],
              0,   'rgba(255,255,255,0)',
              0.1, '#fff0e8',
              0.3, '#ffb899',
              0.5, '#ff7744',
              0.7, '#ee3311',
              1.0, '#aa1100',
            ],
            'heatmap-opacity': 0.85,
          },
        })
      } else {
        map.getSource(SRC).setData(data)
        map.setLayoutProperty(LYR, 'visibility', 'visible')
      }
    } else {
      if (map.getLayer(LYR)) map.setLayoutProperty(LYR, 'visibility', 'none')
    }
  }, [map, activeLayers.combinedHeatmap, spaceFrequencyData, cyclingSpaceFrequencyData])

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

    const SRC  = 'public-spaces-freq'
    const HEAT = 'freq-heat'
    const DOT  = 'freq-dots'

    if (activeLayers.frequencyAnalysis) {
      if (!map.getSource(SRC)) {
        map.addSource(SRC, { type: 'geojson', data: PUBLIC_SPACES_GEOJSON })

        map.addLayer({
          id: HEAT,
          type: 'heatmap',
          source: SRC,
          paint: {
            'heatmap-weight': ['interpolate', ['linear'], ['get', 'frequencyScore'], 0, 0, 100, 1],
            'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 0.8, 15, 2],
            'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 25, 15, 45],
            'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0.85, 14, 0.4],
            'heatmap-color': [
              'interpolate', ['linear'], ['heatmap-density'],
              0,    'rgba(254,249,195,0)',
              0.25, '#fef9c3',
              0.5,  '#fbbf24',
              0.75, '#f97316',
              1.0,  '#dc2626',
            ],
          },
        })

        map.addLayer({
          id: DOT,
          type: 'circle',
          source: SRC,
          minzoom: 13,
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 5, 16, 10],
            'circle-color': [
              'interpolate', ['linear'], ['get', 'frequencyScore'],
              0, '#fef9c3', 25, '#fbbf24', 50, '#f97316', 75, '#dc2626',
            ],
            'circle-opacity': 0.9,
            'circle-stroke-width': 2,
            'circle-stroke-color': 'rgba(255,255,255,0.9)',
          },
        })

        const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: false, maxWidth: '260px' })
        freqPopup.current = popup

        map.on('click', DOT, (e) => {
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

        map.on('mouseenter', DOT, () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', DOT, () => { map.getCanvas().style.cursor = '' })
        map.on('click', (e) => {
          if (!map.queryRenderedFeatures(e.point, { layers: [DOT] }).length && freqPopup.current?.isOpen())
            freqPopup.current.remove()
        })
      } else {
        map.setLayoutProperty(HEAT, 'visibility', 'visible')
        map.setLayoutProperty(DOT,  'visibility', 'visible')
      }
    } else {
      if (map.getLayer(HEAT)) map.setLayoutProperty(HEAT, 'visibility', 'none')
      if (map.getLayer(DOT))  map.setLayoutProperty(DOT,  'visibility', 'none')
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

        registerXIcon(map, 'x-closure', '#64748b')

        map.addLayer({
          id: LYR,
          type: 'symbol',
          source: SRC,
          filter: ['<=', ['get', 'year'], closureYear],
          layout: {
            'icon-image': 'x-closure',
            'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 15, 1.3],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
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

  // ── Vacant Places (OSM shop=vacant / disused:shop) ────────────────────────
  useEffect(() => {
    if (!map) return

    const SRC = 'vacant-places'
    const LYR = 'vacant-dots'

    if (activeLayers.vacantPlaces) {
      if (!map.getSource(SRC)) {
        map.addSource(SRC, { type: 'geojson', data: VACANT_GEOJSON })

        registerDiamondIcon(map, 'diamond-vacant', '#f97316')

        map.addLayer({
          id: LYR,
          type: 'symbol',
          source: SRC,
          layout: {
            'icon-image': 'diamond-vacant',
            'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.7, 15, 1.4],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          },
        })

        const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: false, maxWidth: '240px' })
        vacantPopup.current = popup

        map.on('click', LYR, (e) => {
          const p = e.features[0].properties
          const former = p.formerType ? `Former: ${p.formerType}` : 'Former use: unknown'
          const checked = p.checkDate ? `Verified: ${p.checkDate}` : ''
          popup
            .setLngLat(e.lngLat)
            .setHTML(
              `<div style="font-family:system-ui,sans-serif;padding:2px 0">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
                  <div style="width:8px;height:8px;border-radius:50%;background:#f97316;flex-shrink:0"></div>
                  <span style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;font-weight:600">Vacant Storefront</span>
                </div>
                ${p.name ? `<div style="font-size:14px;font-weight:700;color:#111827;margin-bottom:4px">${p.name}</div>` : ''}
                ${p.address ? `<div style="font-size:11px;color:#6b7280;margin-bottom:3px">${p.address}</div>` : ''}
                <div style="font-size:11px;color:#9ca3af;margin-bottom:3px">${former}</div>
                ${checked ? `<div style="font-size:10px;color:#9ca3af">${checked}</div>` : ''}
                <div style="font-size:10px;color:#9ca3af;border-top:1px solid #f3f4f6;margin-top:5px;padding-top:4px">Source: OpenStreetMap</div>
              </div>`
            )
            .addTo(map)
        })

        map.on('mouseenter', LYR, () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', LYR, () => { map.getCanvas().style.cursor = '' })
        map.on('click', (e) => {
          if (!map.queryRenderedFeatures(e.point, { layers: [LYR] }).length && vacantPopup.current?.isOpen())
            vacantPopup.current.remove()
        })
      } else {
        map.setLayoutProperty(LYR, 'visibility', 'visible')
      }
    } else {
      if (map.getLayer(LYR)) map.setLayoutProperty(LYR, 'visibility', 'none')
      if (vacantPopup.current) vacantPopup.current.remove()
    }
  }, [map, activeLayers.vacantPlaces])
}
