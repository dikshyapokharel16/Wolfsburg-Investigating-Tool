import { useMapStore } from '../store/mapStore'

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'

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

export function useMovement() {
  const { setLoadingPedestrian, setPedestrianData, setLoadingCycling, setCyclingData, setLoadingCycleParking, setCycleParkingData, setLoadingBusStops, setBusStopsData } = useMapStore()

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

  return { fetchPedestrian, fetchCycling, fetchCycleParking, fetchBusStops }
}
