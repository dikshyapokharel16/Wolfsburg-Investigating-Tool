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

export function useMapLayers(map) {
  const { activeLayers, amenityData, pedestrianData, cyclingData, cycleParkingData, busStopsData, spaceFrequencyData, cyclingSpaceFrequencyData } = useMapStore()
  const psPopup      = useRef(null)
  const cpPopup      = useRef(null)
  const bsPopup      = useRef(null)

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
      } else {
        map.setLayoutProperty(LYR, 'visibility', 'visible')
      }
    } else {
      if (map.getLayer(LYR)) map.setLayoutProperty(LYR, 'visibility', 'none')
      if (psPopup.current) psPopup.current.remove()
    }
  }, [map, activeLayers.publicSpaces])
}
