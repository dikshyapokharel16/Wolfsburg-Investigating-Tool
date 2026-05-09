import { useState } from 'react'
import { useMapStore } from '../store/mapStore'
import { useMovement } from '../hooks/useMovement'

const BUTTONS = [
  { id: 'movement',  label: 'Movement'  },
  { id: 'functions', label: 'Functions' },
  { id: 'social',    label: 'Social'    },
]

const MOVEMENT_SUBLAYERS = [
  {
    id: 'pedestrianNetwork',
    label: 'Pedestrian Network',
    color: '#93b5c6',
    legend: [
      { color: '#1e3040', label: 'Dedicated pathways' },
      { color: '#8aa5b5', label: 'Shared streets' },
    ],
  },
  {
    id: 'cyclingNetwork',
    label: 'Cycling Network',
    color: '#4e7fa5',
    legend: [
      { color: '#1a6aaa', label: 'Dedicated pathways' },
      { color: '#8aa5b5', label: 'Shared streets' },
    ],
  },
]

const INFO_SECTIONS = {
  pedestrianNetwork: {
    title: 'Pedestrian Network',
    groups: [
      {
        label: 'Dedicated pathways',
        color: '#1e3040',
        tags: ['highway=footway', 'highway=path', 'highway=pedestrian', 'highway=steps', 'foot=designated'],
      },
      {
        label: 'Shared streets',
        color: '#8aa5b5',
        tags: ['highway=residential', 'highway=living_street', 'highway=service', 'highway=track', 'foot=yes', 'foot=permissive', 'sidewalk=yes/left/right/both'],
      },
    ],
  },
  cyclingNetwork: {
    title: 'Cycling Network',
    groups: [
      {
        label: 'Dedicated pathways',
        color: '#1a6aaa',
        tags: ['highway=cycleway', 'bicycle=designated', 'cycleway=lane/track', 'cycleway:left/right/both=lane/track'],
      },
      {
        label: 'Shared streets',
        color: '#8aa5b5',
        tags: ['highway=residential', 'highway=living_street', 'highway=service', 'highway=tertiary', 'highway=secondary', 'bicycle=yes', 'bicycle=permissive'],
      },
    ],
  },
  cycleParking: {
    title: 'Cycle Parking',
    groups: [
      {
        label: 'Parking stations',
        color: '#2d9da8',
        tags: ['amenity=bicycle_parking'],
      },
    ],
  },
  busStops: {
    title: 'Bus Stops',
    groups: [
      {
        label: 'Stops',
        color: '#d4924a',
        tags: ['highway=bus_stop', 'amenity=bus_stop'],
      },
    ],
  },
}

function Tag({ label }) {
  return (
    <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-mono bg-white/8 text-white/50 border border-white/10">
      {label}
    </span>
  )
}

export default function TopNav() {
  const [openPanel, setOpenPanel]   = useState(null)
  const [infoOpen, setInfoOpen]     = useState(false)
  const [closureYear, setClosureYear] = useState(2022)

  const { activeLayers, toggleLayer, pedestrianData, cyclingData, cycleParkingData, busStopsData, isLoadingPedestrian, isLoadingCycling, isLoadingCycleParking, isLoadingBusStops } = useMapStore()
  const { fetchPedestrian, fetchCycling, fetchCycleParking, fetchBusStops } = useMovement()

  const activeNetworks = ['pedestrianNetwork', 'cyclingNetwork', 'cycleParking', 'busStops'].filter(id => activeLayers[id])

  function handleMovementToggle(id) {
    const wasOff = !activeLayers[id]
    toggleLayer(id)
    if (wasOff) {
      if (id === 'pedestrianNetwork' && !pedestrianData)   fetchPedestrian()
      if (id === 'cyclingNetwork'    && !cyclingData)      fetchCycling()
      if (id === 'cycleParking'      && !cycleParkingData) fetchCycleParking()
      if (id === 'busStops'          && !busStopsData)     fetchBusStops()
    }
  }

  function handleClick(id) {
    setOpenPanel(prev => (prev === id ? null : id))
    if (id !== 'movement') setInfoOpen(false)
  }

  return (
    <>
      {/* ── Top centre button bar ── */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
        <div className="flex items-center gap-2 bg-[#16213e]/90 backdrop-blur-md px-3 py-2 rounded-2xl shadow-2xl border border-white/10">
          {BUTTONS.map((btn) => (
            <button
              key={btn.id}
              onClick={() => handleClick(btn.id)}
              className={`px-8 py-2 rounded-xl text-sm font-semibold tracking-widest uppercase transition-all duration-200 ${
                openPanel === btn.id
                  ? 'bg-white/15 text-white'
                  : 'text-white/50 hover:text-white hover:bg-white/8'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Left floating panel ── */}
      {openPanel && (
        <div className="absolute top-20 left-4 z-20 w-72 pointer-events-auto
          bg-[#16213e]/90 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl
          animate-fade-in">

          {openPanel === 'movement' && (
            <div className="p-5">
              {/* Panel header with ⓘ button */}
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest">
                  Movement
                </p>
                <button
                  onClick={() => setInfoOpen(o => !o)}
                  className={`w-5 h-5 rounded-full border flex items-center justify-center text-[10px] transition-colors ${
                    infoOpen
                      ? 'border-white/40 text-white/70 bg-white/10'
                      : 'border-white/20 text-white/30 hover:border-white/40 hover:text-white/60'
                  }`}
                >
                  i
                </button>
              </div>

              <div className="space-y-1.5">
                {MOVEMENT_SUBLAYERS.map((sub) => {
                  const isLoading = sub.id === 'pedestrianNetwork' ? isLoadingPedestrian : isLoadingCycling
                  const isActive  = activeLayers[sub.id]
                  return (
                    <div key={sub.id}>
                      <button
                        onClick={() => handleMovementToggle(sub.id)}
                        disabled={isLoading}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                          isActive ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5 hover:text-white/70'
                        }`}
                      >
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: isActive ? sub.color : '#374151' }} />
                        <span className="flex-1 text-sm font-medium">{sub.label}</span>
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
                      {isActive && (
                        <div className="mt-1 mb-2 ml-3 space-y-1">
                          {sub.legend.map(item => (
                            <div key={item.label} className="flex items-center gap-2 px-3">
                              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                              <span className="text-[10px] text-white/40">{item.label}</span>
                            </div>
                          ))}
                          {sub.id === 'cyclingNetwork' && (
                            <div className="mt-2 pt-2 border-t border-white/5">
                              <button
                                onClick={() => handleMovementToggle('cycleParking')}
                                disabled={isLoadingCycleParking}
                                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all ${
                                  activeLayers.cycleParking ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5 hover:text-white/70'
                                }`}
                              >
                                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: activeLayers.cycleParking ? '#2d9da8' : '#374151' }} />
                                <span className="flex-1 text-xs font-medium">Cycle Parking</span>
                                {isLoadingCycleParking ? (
                                  <svg className="animate-spin w-3 h-3 text-white/40 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                  </svg>
                                ) : (
                                  <div className={`w-7 h-3.5 rounded-full flex-shrink-0 transition-colors relative ${activeLayers.cycleParking ? 'bg-[#818cf8]' : 'bg-white/10'}`}>
                                    <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow transition-all ${activeLayers.cycleParking ? 'left-[14px]' : 'left-0.5'}`} />
                                  </div>
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Bus Stops — separate toggle below networks */}
              <div className="mt-2 pt-2 border-t border-white/5">
                <button
                  onClick={() => handleMovementToggle('busStops')}
                  disabled={isLoadingBusStops}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                    activeLayers.busStops ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5 hover:text-white/70'
                  }`}
                >
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: activeLayers.busStops ? '#d4924a' : '#374151' }} />
                  <span className="flex-1 text-sm font-medium">Bus Stops</span>
                  {isLoadingBusStops ? (
                    <svg className="animate-spin w-3 h-3 text-white/40 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                  ) : (
                    <div className={`w-7 h-3.5 rounded-full flex-shrink-0 transition-colors relative ${activeLayers.busStops ? 'bg-[#818cf8]' : 'bg-white/10'}`}>
                      <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow transition-all ${activeLayers.busStops ? 'left-[14px]' : 'left-0.5'}`} />
                    </div>
                  )}
                </button>
              </div>
            </div>
          )}

          {openPanel === 'functions' && (
            <div className="p-5">
              <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-4">
                Functions
              </p>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-white/70">Shop &amp; Café Closures</span>
                  <span className="text-xs font-bold text-white">{closureYear}</span>
                </div>
                <input
                  type="range" min={2019} max={2024} step={1} value={closureYear}
                  onChange={(e) => setClosureYear(Number(e.target.value))}
                  className="w-full h-1.5 rounded-full accent-white cursor-pointer"
                />
                <div className="flex justify-between mt-1">
                  <span className="text-[9px] text-white/25">2019</span>
                  <span className="text-[9px] text-white/25">2024</span>
                </div>
                <p className="text-[9px] text-white/25 mt-2 leading-relaxed">
                  Drag to explore closures over time · data coming soon
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-white/8">
                <p className="text-[9px] text-white/20 italic">More function layers coming soon</p>
              </div>
            </div>
          )}

          {openPanel === 'social' && (
            <div className="p-5">
              <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">
                Social
              </p>
              <p className="text-xs text-white/40 leading-relaxed">
                Public spaces, social infrastructure &amp; community data — coming soon
              </p>
              <div className="mt-4 pt-3 border-t border-white/8">
                <p className="text-[9px] text-white/20 italic">Connect your data source to activate</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Right info panel ── */}
      {infoOpen && openPanel === 'movement' && (
        <div className="absolute top-40 bottom-24 right-3 w-80 z-20 pointer-events-auto
          bg-[#16213e]/95 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl
          animate-fade-in flex flex-col">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-white/10 flex-shrink-0">
            <div>
              <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-0.5">Data Sources</p>
              <p className="text-xs text-white/40">OpenStreetMap via Overpass API</p>
            </div>
            <button
              onClick={() => setInfoOpen(false)}
              className="w-7 h-7 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white/50 hover:text-white transition-colors text-lg leading-none"
            >×</button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            {activeNetworks.length === 0 ? (
              <p className="text-xs text-white/30 leading-relaxed mt-4">
                Toggle a network on to see its data sources.
              </p>
            ) : (
              activeNetworks.map(id => {
                const section = INFO_SECTIONS[id]
                return (
                  <div key={id}>
                    <p className="text-xs font-semibold text-white/70 mb-3">{section.title}</p>
                    <div className="space-y-4">
                      {section.groups.map(group => (
                        <div key={group.label}>
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: group.color }} />
                            <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">{group.label}</p>
                          </div>
                          <div className="flex flex-wrap gap-1 pl-4">
                            {group.tags.map(tag => <Tag key={tag} label={tag} />)}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 border-t border-white/5" />
                  </div>
                )
              })
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-white/10 flex-shrink-0">
            <p className="text-[9px] text-white/20 leading-relaxed">
              © OpenStreetMap contributors — data is as complete as local mappers have surveyed.
            </p>
          </div>
        </div>
      )}
    </>
  )
}
