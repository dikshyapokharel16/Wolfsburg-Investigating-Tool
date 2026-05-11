import { useMapStore } from '../store/mapStore'
import { useMovement } from '../hooks/useMovement'
import { DISTRICT_GROUPS, STANDALONE_POPULATIONS } from '../data/districtConfig'

const POPULATION_DATA = [
  ...Object.entries(DISTRICT_GROUPS).map(([name, { population2023, color }]) => ({ name, population: population2023, color })),
  ...Object.entries(STANDALONE_POPULATIONS).map(([name, { population2023 }]) => ({ name, population: population2023, color: '#64748b' })),
].sort((a, b) => b.population - a.population)

const MAX_POP = Math.max(...POPULATION_DATA.map(d => d.population))

const LAYERS = [
  {
    id: 'amenities',
    label: 'Amenities',
    dot: '#818cf8',
    description: 'Schools, shops, healthcare, leisure',
  },
  {
    id: 'movement',
    label: 'Movement',
    dot: '#34d399',
    description: 'Pedestrian & cycling networks',
  },
  {
    id: 'publicSpaces',
    label: 'Public Spaces',
    dot: '#22c55e',
    description: '12 typologies · 23 spaces identified',
  },
]

const MOVEMENT_SUBLAYERS = [
  { id: 'pedestrianNetwork', label: 'Pedestrian Network', color: '#93b5c6' },
  { id: 'cyclingNetwork',    label: 'Cycling Network',    color: '#4e7fa5' },
]

const SPACE_TYPOLOGIES = [
  { id: 1,  label: 'Civic Plaza',                  color: '#f59e0b' },
  { id: 2,  label: 'Neighborhood Park',             color: '#22c55e' },
  { id: 3,  label: 'Pocket Park',                   color: '#86efac' },
  { id: 4,  label: 'Linear Park / Greenway',        color: '#16a34a' },
  { id: 5,  label: 'Waterfront Promenade',          color: '#06b6d4' },
  { id: 6,  label: 'Playground',                    color: '#ec4899' },
  { id: 7,  label: 'Community Garden',              color: '#84cc16' },
  { id: 8,  label: 'Streetscape / Green Street',    color: '#f97316' },
  { id: 9,  label: 'Urban Beach / Seasonal',        color: '#eab308' },
  { id: 10, label: 'Civic / Cultural Forecourt',    color: '#8b5cf6' },
  { id: 11, label: 'Urban Plaza / Transit Plaza',   color: '#3b82f6' },
  { id: 12, label: 'Rooftop / Elevated Space',      color: '#e11d48' },
]

const AMENITY_CATEGORIES = [
  { value: 'all', label: 'All', color: '#94a3b8' },
  { value: 'education', label: 'Education', color: '#60a5fa' },
  { value: 'healthcare', label: 'Healthcare', color: '#f87171' },
  { value: 'leisure', label: 'Leisure', color: '#34d399' },
  { value: 'shopping', label: 'Shopping', color: '#fbbf24' },
  { value: 'food', label: 'Food & Drink', color: '#f472b6' },
  { value: 'transport', label: 'Transport', color: '#a78bfa' },
]

export default function Sidebar({ onFetchAmenities }) {
  const {
    activeLayers, toggleLayer,
    selectedCategory, setSelectedCategory, isLoadingAmenities,
    pedestrianData, cyclingData, isLoadingPedestrian, isLoadingCycling,
  } = useMapStore()
  const { fetchPedestrian, fetchCycling } = useMovement()

  function handleMovementSubToggle(id) {
    const wasOff = !activeLayers[id]
    toggleLayer(id)
    if (wasOff) {
      if (id === 'pedestrianNetwork' && !pedestrianData) fetchPedestrian()
      if (id === 'cyclingNetwork'    && !cyclingData)    fetchCycling()
    }
  }

  return (
    <div className="absolute left-0 top-0 h-full w-60 bg-[#16213e] shadow-2xl z-10 flex flex-col select-none">
      {/* Header */}
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full bg-[#818cf8]" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-[#818cf8]">
            Urban Analysis
          </span>
        </div>
        <h1 className="text-white text-xl font-bold tracking-tight">Wolfsburg</h1>
        <p className="text-xs text-white/40 mt-0.5">Spatial Data Explorer</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-7">
        {/* Layer toggles */}
        <section>
          <h2 className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">
            Layers
          </h2>
          <div className="space-y-1.5">
            {LAYERS.map((layer) => (
              <button
                key={layer.id}
                onClick={() => toggleLayer(layer.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                  activeLayers[layer.id]
                    ? 'bg-white/10 text-white'
                    : 'text-white/50 hover:bg-white/5 hover:text-white/70'
                }`}
              >
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: activeLayers[layer.id] ? layer.dot : '#374151' }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium leading-none">{layer.label}</div>
                  <div className="text-[10px] text-white/30 mt-1 truncate">{layer.description}</div>
                </div>
                {/* Toggle pill */}
                <div
                  className={`w-7 h-3.5 rounded-full flex-shrink-0 transition-colors relative ${
                    activeLayers[layer.id] ? 'bg-[#818cf8]' : 'bg-white/10'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow transition-all ${
                      activeLayers[layer.id] ? 'left-[14px]' : 'left-0.5'
                    }`}
                  />
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Movement sub-layers */}
        {activeLayers.movement && (
          <section>
            <h2 className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">
              Networks
            </h2>
            <div className="space-y-1.5">
              {MOVEMENT_SUBLAYERS.map((sub) => {
                const isLoading = sub.id === 'pedestrianNetwork' ? isLoadingPedestrian : isLoadingCycling
                const isActive  = activeLayers[sub.id]
                return (
                  <button
                    key={sub.id}
                    onClick={() => handleMovementSubToggle(sub.id)}
                    disabled={isLoading}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                      isActive
                        ? 'bg-white/10 text-white'
                        : 'text-white/50 hover:bg-white/5 hover:text-white/70'
                    }`}
                  >
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: isActive ? sub.color : '#374151' }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium leading-none">{sub.label}</div>
                    </div>
                    {isLoading ? (
                      <svg className="animate-spin w-3 h-3 text-white/40 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                    ) : (
                      <div className={`w-7 h-3.5 rounded-full flex-shrink-0 transition-colors relative ${isActive ? 'bg-[#818cf8]' : 'bg-white/10'}`}>
                        <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow transition-all ${isActive ? 'left-[14px]' : 'left-0.5'}`} />
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {/* Public space typology legend */}
        {activeLayers.publicSpaces && (
          <section>
            <h2 className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">
              Space Typologies
            </h2>
            <div className="space-y-1">
              {SPACE_TYPOLOGIES.map((t) => (
                <div key={t.id} className="flex items-center gap-2 px-1 py-0.5">
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: t.color }}
                  />
                  <span className="text-[10px] text-white/50 leading-none">
                    {t.id}. {t.label}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[9px] text-white/20 mt-3 leading-relaxed">
              Click any dot on the map to see details.
            </p>
          </section>
        )}

        {/* Amenity category filter */}
        {activeLayers.amenities && (
          <section>
            <h2 className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">
              Category
            </h2>
            <div className="space-y-1">
              {AMENITY_CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  onClick={() => setSelectedCategory(cat.value)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left transition-all text-xs ${
                    selectedCategory === cat.value
                      ? 'bg-white/10 text-white font-medium'
                      : 'text-white/40 hover:bg-white/5 hover:text-white/60'
                  }`}
                >
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: cat.color }}
                  />
                  {cat.label}
                </button>
              ))}
            </div>

            <button
              onClick={onFetchAmenities}
              disabled={isLoadingAmenities}
              className="mt-4 w-full py-2 rounded-lg text-xs font-semibold tracking-wide transition-all
                bg-[#818cf8] hover:bg-[#6366f1] text-white disabled:bg-white/10 disabled:text-white/30"
            >
              {isLoadingAmenities ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Fetching…
                </span>
              ) : (
                'Load from OpenStreetMap'
              )}
            </button>
          </section>
        )}
        {/* Social — Population per district */}
        <section>
          <h2 className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">
            Social · Population by District
          </h2>
          <p className="text-[9px] text-white/20 mb-3 leading-relaxed">
            Source: Stadt Wolfsburg, 2023
          </p>
          <div className="space-y-2">
            {POPULATION_DATA.map(({ name, population, color }) => (
              <div key={name}>
                <div className="flex justify-between items-baseline mb-0.5">
                  <span className="text-[9px] text-white/50 truncate pr-2 leading-none">{name}</span>
                  <span className="text-[9px] text-white/40 flex-shrink-0 leading-none">
                    {population.toLocaleString()}
                  </span>
                </div>
                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(population / MAX_POP) * 100}%`,
                      backgroundColor: color,
                      opacity: 0.8,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-white/10 flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-[#34d399]" />
        <span className="text-[10px] text-white/30">© OpenStreetMap contributors · CARTO</span>
      </div>
    </div>
  )
}
