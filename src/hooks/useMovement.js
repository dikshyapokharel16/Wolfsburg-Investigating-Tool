import { useMapStore } from '../store/mapStore'

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'

// IDW rubber-sheet warp for space-syntax georeferencing
const LON_M = 111195 * Math.cos(52.42 * Math.PI / 180)
const LAT_M = 111195

function _idwWarp(lon, lat, cps) {
  let wdLon = 0, wdLat = 0, wSum = 0
  for (const cp of cps) {
    const dx = (lon - cp.lon) * LON_M
    const dy = (lat - cp.lat) * LAT_M
    const d2 = dx * dx + dy * dy
    if (d2 < 1e-6) return [lon + cp.dLon, lat + cp.dLat]
    const w = 1 / d2
    wdLon += w * cp.dLon
    wdLat += w * cp.dLat
    wSum += w
  }
  return [lon + wdLon / wSum, lat + wdLat / wSum]
}

// 15 control points — all expressed in raw CSV space (lon/lat = raw position, dLon/dLat = correction to OSM)
const SS_CP = [
  { lon: 10.718192, lat: 52.420179, dLon: -0.001316, dLat:  0.000612 },
  { lon: 10.760479, lat: 52.393659, dLon: -0.002459, dLat:  0.000000 },
  { lon: 10.756219, lat: 52.361614, dLon: -0.003702, dLat:  0.000064 },
  { lon: 10.846759, lat: 52.448913, dLon: -0.000387, dLat: -0.001279 },
  { lon: 10.771862, lat: 52.475320, dLon:  0.000817, dLat: -0.000187 },
  { lon: 10.686443, lat: 52.416983, dLon: -0.001345, dLat:  0.001090 },
  { lon: 10.851634, lat: 52.394043, dLon: -0.002702, dLat: -0.001399 },
  { lon: 10.791835, lat: 52.428512, dLon: -0.001174, dLat: -0.000411 },
  { lon: 10.834009, lat: 52.331694, dLon: -0.005238, dLat: -0.001147 },
  { lon: 10.699051, lat: 52.397960, dLon: -0.002105, dLat:  0.000887 },
  { lon: 10.858592, lat: 52.347429, dLon: -0.004671, dLat: -0.001505 },
  { lon: 10.866609, lat: 52.417930, dLon: -0.001733, dLat: -0.001613 },
  { lon: 10.817217, lat: 52.445728, dLon: -0.000455, dLat: -0.000858 },
  { lon: 10.747378, lat: 52.456878, dLon:  0.000114, dLat:  0.000128 },
  { lon: 10.851021, lat: 52.462532, dLon:  0.000169, dLat: -0.001366 },
]

function ssWarp(lon, lat) { return _idwWarp(lon, lat, SS_CP) }

function isPedestrianDedicated(tags) {
  return ['footway', 'path', 'pedestrian', 'steps'].includes(tags.highway) ||
         tags.foot === 'designated'
}

function isCyclingDedicated(tags) {
  return tags.highway === 'cycleway' ||
         tags.bicycle === 'designated' ||
         ['lane', 'track', 'opposite_lane', 'opposite_track', 'shared_lane'].includes(tags.cycleway)
}

function waysToGeoJSON(elements, classifyFn) {
  return {
    type: 'FeatureCollection',
    features: elements
      .filter(el => el.type === 'way' && el.geometry?.length >= 2)
      .map(el => ({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: el.geometry.map(pt => [pt.lon, pt.lat]),
        },
        properties: { id: el.id, ...el.tags, dedicated: classifyFn(el.tags) ? 1 : 0 },
      })),
  }
}

// Google encoded polyline decoder
function decodePolyline(str) {
  const coords = []
  let index = 0, lat = 0, lng = 0
  while (index < str.length) {
    let shift = 0, result = 0, b
    do {
      b = str.charCodeAt(index++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    lat += (result & 1) ? ~(result >> 1) : (result >> 1)
    shift = 0; result = 0
    do {
      b = str.charCodeAt(index++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    lng += (result & 1) ? ~(result >> 1) : (result >> 1)
    coords.push([lng / 1e5, lat / 1e5])
  }
  return coords
}

// 6-tile grid covering Wolfsburg with slight overlap to avoid gaps at boundaries
const WOLFSBURG_TILES = [
  [52.34, 10.63, 52.44, 10.75],
  [52.34, 10.74, 52.44, 10.86],
  [52.34, 10.85, 52.44, 10.97],
  [52.43, 10.63, 52.53, 10.75],
  [52.43, 10.74, 52.53, 10.86],
  [52.43, 10.85, 52.53, 10.97],
]

async function fetchStravaSegments(activityType, token) {
  // Step 1: explore all tiles to collect segment IDs + basic info
  const seen = new Set()
  const basic = []

  const tileResults = await Promise.allSettled(
    WOLFSBURG_TILES.map(([swLat, swLng, neLat, neLng]) =>
      fetch(
        `https://www.strava.com/api/v3/segments/explore` +
        `?bounds=${swLat},${swLng},${neLat},${neLng}` +
        `&activity_type=${activityType}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
        .then(r => {
          if (r.status === 401) throw new Error('strava_401')
          if (r.status === 429) throw new Error('strava_429')
          return r.json()
        })
        .then(data => {
          for (const s of data.segments ?? []) {
            if (!seen.has(s.id)) {
              seen.add(s.id)
              basic.push(s)
            }
          }
        })
    )
  )

  const errors = tileResults.filter(r => r.status === 'rejected').map(r => r.reason?.message)
  if (errors.includes('strava_401')) throw new Error('strava_401')
  if (errors.includes('strava_429')) throw new Error('strava_429')

  if (!basic.length) return null

  // Step 2: fetch detail for each segment to get effort_count and full polyline
  const detailResults = await Promise.allSettled(
    basic.map(s =>
      fetch(`https://www.strava.com/api/v3/segments/${s.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.json())
    )
  )

  const full = detailResults
    .filter(r => r.status === 'fulfilled' && r.value?.effort_count != null)
    .map(r => r.value)

  if (!full.length) return { type: 'FeatureCollection', features: [] }

  // Step 3: log-normalise effort_count to 0–100 score
  const logScores = full.map(s => Math.log(s.effort_count + 1))
  const maxLog = Math.max(...logScores, 1)

  return {
    type: 'FeatureCollection',
    features: full.map((s, i) => ({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: decodePolyline(s.map.polyline),
      },
      properties: {
        id: s.id,
        name: s.name,
        effortCount: s.effort_count,
        athleteCount: s.athlete_count,
        score: Math.round((logScores[i] / maxLog) * 100),
        distance: Math.round(s.distance),
      },
    })),
  }
}

export function useMovement() {
  const {
    setLoadingPedestrian, setPedestrianData,
    setLoadingCycling, setCyclingData,
    setLoadingCycleParking, setCycleParkingData,
    setLoadingBusStops, setBusStopsData,
    setStravaToken, setStravaError,
    setSpaceFrequencyData, setLoadingSpaceFrequency,
    setCyclingSpaceFrequencyData, setLoadingCyclingSpaceFrequency,
  } = useMapStore()

  async function fetchPedestrian() {
    setLoadingPedestrian(true)
    try {
      const query = `
        [out:json][timeout:120];
        area["name"="Wolfsburg"]["boundary"="administrative"]->.wolfsburg;
        (
          way["highway"~"footway|path|pedestrian|steps|living_street|residential|service|track"](area.wolfsburg);
          way["foot"~"yes|designated|permissive"](area.wolfsburg);
          way["sidewalk"~"yes|left|right|both"](area.wolfsburg);
        );
        out geom;
      `
      const res = await fetch(OVERPASS_URL, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      const json = await res.json()
      setPedestrianData(waysToGeoJSON(json.elements, isPedestrianDedicated))
    } catch (err) {
      console.error('Pedestrian network fetch error:', err)
    } finally {
      setLoadingPedestrian(false)
    }
  }

  async function fetchCycling() {
    setLoadingCycling(true)
    try {
      const query = `
        [out:json][timeout:120];
        area["name"="Wolfsburg"]["boundary"="administrative"]->.wolfsburg;
        (
          way["highway"="cycleway"](area.wolfsburg);
          way["cycleway"~"lane|track|opposite_lane|opposite_track|shared_lane"](area.wolfsburg);
          way["cycleway:left"~"lane|track|shared_lane"](area.wolfsburg);
          way["cycleway:right"~"lane|track|shared_lane"](area.wolfsburg);
          way["cycleway:both"~"lane|track|shared_lane"](area.wolfsburg);
          way["bicycle"~"yes|designated|permissive"](area.wolfsburg);
          way["highway"~"residential|living_street|service|tertiary|secondary"](area.wolfsburg);
        );
        out geom;
      `
      const res = await fetch(OVERPASS_URL, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      const json = await res.json()
      setCyclingData(waysToGeoJSON(json.elements, isCyclingDedicated))
    } catch (err) {
      console.error('Cycling network fetch error:', err)
    } finally {
      setLoadingCycling(false)
    }
  }

  async function fetchCycleParking() {
    setLoadingCycleParking(true)
    try {
      const query = `
        [out:json][timeout:60];
        area["name"="Wolfsburg"]["boundary"="administrative"]->.wolfsburg;
        (
          node["amenity"="bicycle_parking"](area.wolfsburg);
        );
        out body;
      `
      const res = await fetch(OVERPASS_URL, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      const json = await res.json()
      const features = json.elements
        .filter(el => el.type === 'node' && el.lat && el.lon)
        .map(el => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [el.lon, el.lat] },
          properties: { id: el.id, ...el.tags },
        }))
      setCycleParkingData({ type: 'FeatureCollection', features })
    } catch (err) {
      console.error('Cycle parking fetch error:', err)
    } finally {
      setLoadingCycleParking(false)
    }
  }

  async function fetchBusStops() {
    setLoadingBusStops(true)
    try {
      const query = `
        [out:json][timeout:60];
        area["name"="Wolfsburg"]["boundary"="administrative"]->.wolfsburg;
        (
          node["highway"="bus_stop"](area.wolfsburg);
          node["amenity"="bus_stop"](area.wolfsburg);
        );
        out body;
      `
      const res = await fetch(OVERPASS_URL, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      const json = await res.json()
      const seen = new Set()
      const features = json.elements
        .filter(el => el.type === 'node' && el.lat && el.lon && !seen.has(el.id) && seen.add(el.id))
        .map(el => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [el.lon, el.lat] },
          properties: { id: el.id, ...el.tags },
        }))
      setBusStopsData({ type: 'FeatureCollection', features })
    } catch (err) {
      console.error('Bus stops fetch error:', err)
    } finally {
      setLoadingBusStops(false)
    }
  }

  async function fetchSpaceFrequency() {
    setLoadingSpaceFrequency(true)
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}wolfsburg_frequency.csv`)
      const text = await res.text()
      const lines = text.trim().split('\n')
      const rows = lines.slice(1).map(line => {
        const [, lon_start, lat_start, lon_end, lat_end, frequency] = line.split(',')
        return {
          lonStart: parseFloat(lon_start),
          latStart: parseFloat(lat_start),
          lonEnd:   parseFloat(lon_end),
          latEnd:   parseFloat(lat_end),
          freq:     parseFloat(frequency),
        }
      }).filter(r => !isNaN(r.freq))

      // Compute true percentile rank for each segment (0 = lowest, 100 = highest)
      const ranked = rows.map((r, i) => ({ freq: r.freq, i })).sort((a, b) => a.freq - b.freq)
      const n = ranked.length
      const ssPercentile = new Array(n)
      ranked.forEach(({ i }, rank) => { ssPercentile[i] = n > 1 ? Math.round((rank / (n - 1)) * 100) : 100 })

      // Optionally blend with Strava running segments if authenticated
      const { stravaToken } = useMapStore.getState()
      let stravaMids = []
      if (stravaToken) {
        try {
          const stravaData = await fetchStravaSegments('running', stravaToken)
          stravaMids = (stravaData?.features ?? []).map(f => {
            const c = f.geometry.coordinates
            return {
              lon: (c[0][0] + c[c.length - 1][0]) / 2,
              lat: (c[0][1] + c[c.length - 1][1]) / 2,
              score: f.properties.score,
            }
          })
        } catch (err) {
          if (err.message === 'strava_401') { setStravaToken(null); localStorage.removeItem('strava_token') }
          if (err.message === 'strava_429') setStravaError('rate_limited')
        }
      }

      function closestStravaScore(midLon, midLat) {
        let bestD2 = 60 * 60, score = null
        for (const s of stravaMids) {
          const dx = (midLon - s.lon) * LON_M
          const dy = (midLat - s.lat) * LAT_M
          const d2 = dx * dx + dy * dy
          if (d2 < bestD2) { bestD2 = d2; score = s.score }
        }
        return score
      }

      const features = rows.map((r, i) => {
        const start = ssWarp(r.lonStart, r.latStart)
        const end   = ssWarp(r.lonEnd,   r.latEnd)
        const stravaS = stravaMids.length
          ? closestStravaScore((start[0] + end[0]) / 2, (start[1] + end[1]) / 2)
          : null
        return {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [start, end] },
          properties: {
            id: i,
            frequency: r.freq,
            percentile: stravaS !== null ? Math.round((ssPercentile[i] + stravaS) / 2) : ssPercentile[i],
          },
        }
      })

      setSpaceFrequencyData({ type: 'FeatureCollection', features })
    } catch (err) {
      console.error('Space frequency fetch error:', err)
    } finally {
      setLoadingSpaceFrequency(false)
    }
  }

  async function fetchCyclingSpaceFrequency() {
    setLoadingCyclingSpaceFrequency(true)
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}wolfsburg_cycling_frequency.csv`)
      const text = await res.text()
      const lines = text.trim().split('\n')
      const rows = lines.slice(1).map(line => {
        const [, lon_start, lat_start, lon_end, lat_end, frequency] = line.split(',')
        return {
          lonStart: parseFloat(lon_start),
          latStart: parseFloat(lat_start),
          lonEnd:   parseFloat(lon_end),
          latEnd:   parseFloat(lat_end),
          freq:     parseFloat(frequency),
        }
      }).filter(r => !isNaN(r.freq))

      const ranked = rows.map((r, i) => ({ freq: r.freq, i })).sort((a, b) => a.freq - b.freq)
      const n = ranked.length
      const ssPercentile = new Array(n)
      ranked.forEach(({ i }, rank) => { ssPercentile[i] = n > 1 ? Math.round((rank / (n - 1)) * 100) : 100 })

      const { stravaToken } = useMapStore.getState()
      let stravaMids = []
      if (stravaToken) {
        try {
          const stravaData = await fetchStravaSegments('riding', stravaToken)
          stravaMids = (stravaData?.features ?? []).map(f => {
            const c = f.geometry.coordinates
            return {
              lon: (c[0][0] + c[c.length - 1][0]) / 2,
              lat: (c[0][1] + c[c.length - 1][1]) / 2,
              score: f.properties.score,
            }
          })
        } catch (err) {
          if (err.message === 'strava_401') { setStravaToken(null); localStorage.removeItem('strava_token') }
          if (err.message === 'strava_429') setStravaError('rate_limited')
        }
      }

      function closestStravaScore(midLon, midLat) {
        let bestD2 = 60 * 60, score = null
        for (const s of stravaMids) {
          const dx = (midLon - s.lon) * LON_M
          const dy = (midLat - s.lat) * LAT_M
          const d2 = dx * dx + dy * dy
          if (d2 < bestD2) { bestD2 = d2; score = s.score }
        }
        return score
      }

      const features = rows.map((r, i) => {
        const start = ssWarp(r.lonStart, r.latStart)
        const end   = ssWarp(r.lonEnd,   r.latEnd)
        const stravaS = stravaMids.length
          ? closestStravaScore((start[0] + end[0]) / 2, (start[1] + end[1]) / 2)
          : null
        return {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [start, end] },
          properties: {
            id: i,
            frequency: r.freq,
            percentile: stravaS !== null ? Math.round((ssPercentile[i] + stravaS) / 2) : ssPercentile[i],
          },
        }
      })

      setCyclingSpaceFrequencyData({ type: 'FeatureCollection', features })
    } catch (err) {
      console.error('Cycling space frequency fetch error:', err)
    } finally {
      setLoadingCyclingSpaceFrequency(false)
    }
  }

  return { fetchPedestrian, fetchCycling, fetchCycleParking, fetchBusStops, fetchSpaceFrequency, fetchCyclingSpaceFrequency }
}
