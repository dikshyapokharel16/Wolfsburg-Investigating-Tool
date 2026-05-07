import { useMapStore } from '../store/mapStore'

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'

// OSM tags mapped to our categories
const CATEGORY_QUERIES = {
  all: `
    node["amenity"](area.wolfsburg);
    way["amenity"](area.wolfsburg);
    node["leisure"](area.wolfsburg);
    node["shop"](area.wolfsburg);
  `,
  education: `node["amenity"~"school|university|college|kindergarten|library"](area.wolfsburg);`,
  healthcare: `node["amenity"~"hospital|clinic|pharmacy|doctors|dentist"](area.wolfsburg);`,
  leisure: `node["leisure"~"park|playground|sports_centre|swimming_pool|fitness_centre"](area.wolfsburg);`,
  shopping: `node["shop"](area.wolfsburg);`,
  food: `node["amenity"~"restaurant|cafe|bar|fast_food|pub"](area.wolfsburg);`,
  transport: `node["amenity"~"bus_station|parking|bicycle_parking"](area.wolfsburg); node["public_transport"](area.wolfsburg);`,
}

const CATEGORY_COLORS = {
  education: '#3B82F6',
  healthcare: '#EF4444',
  leisure: '#22C55E',
  shopping: '#F59E0B',
  food: '#EC4899',
  transport: '#8B5CF6',
  default: '#6B7280',
}

export function amenityColor(feature) {
  const props = feature.properties
  if (props.amenity?.match(/school|university|college|kindergarten|library/)) return CATEGORY_COLORS.education
  if (props.amenity?.match(/hospital|clinic|pharmacy|doctors|dentist/)) return CATEGORY_COLORS.healthcare
  if (props.leisure) return CATEGORY_COLORS.leisure
  if (props.shop) return CATEGORY_COLORS.shopping
  if (props.amenity?.match(/restaurant|cafe|bar|fast_food|pub/)) return CATEGORY_COLORS.food
  if (props.amenity?.match(/bus_station|parking|bicycle_parking/) || props.public_transport) return CATEGORY_COLORS.transport
  return CATEGORY_COLORS.default
}

export function useAmenities() {
  const { selectedCategory, setAmenityData, setLoadingAmenities } = useMapStore()

  async function fetchAmenities() {
    setLoadingAmenities(true)
    try {
      const innerQuery = CATEGORY_QUERIES[selectedCategory] || CATEGORY_QUERIES.all
      const query = `
        [out:json][timeout:60];
        area["name"="Wolfsburg"]["boundary"="administrative"]->.wolfsburg;
        (
          ${innerQuery}
        );
        out body;
        >;
        out skel qt;
      `
      const res = await fetch(OVERPASS_URL, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      const json = await res.json()

      const features = json.elements
        .filter((el) => el.type === 'node' && el.lat && el.lon)
        .map((el) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [el.lon, el.lat] },
          properties: { ...el.tags, id: el.id },
        }))

      setAmenityData({
        type: 'FeatureCollection',
        features,
      })
    } catch (err) {
      console.error('Overpass fetch error:', err)
    } finally {
      setLoadingAmenities(false)
    }
  }

  return { fetchAmenities }
}
