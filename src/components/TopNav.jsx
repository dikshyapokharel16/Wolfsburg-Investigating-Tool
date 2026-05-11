import { useState } from 'react'
import { useMapStore } from '../store/mapStore'
import { useMovement } from '../hooks/useMovement'
import { connectStrava } from '../hooks/useStravaAuth'

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
      { color: '#1e40af', label: 'Dedicated pathways' },
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
        color: '#1e3a8a',
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
        color: '#8b5cf6',
        tags: ['highway=bus_stop', 'amenity=bus_stop'],
      },
    ],
  },
  busStopCatchment: {
    title: 'Transit Coverage Density',
    groups: [
      {
        label: 'Method',
        color: '#8b5cf6',
        tags: ['heatmap kernel per stop', 'radius ≈ 400m catchment', 'density sums where stops cluster'],
      },
      {
        label: 'Scale',
        color: '#8b5cf6',
        tags: ['light purple = sparse coverage', 'dark purple = dense overlap'],
      },
    ],
  },
  stravaHeatmapRun: {
    title: 'Running Heatmap',
    groups: [
      {
        label: 'Data source',
        color: '#f97316',
        tags: ['Strava Global Heatmap', 'activity_type=run', 'raster tiles'],
      },
      {
        label: 'Rendering',
        color: '#f97316',
        tags: ['aggregated all-time GPS tracks', 'tile zoom 0–15', 'requires Strava login'],
      },
    ],
  },
  stravaHeatmapRide: {
    title: 'Cycling Heatmap',
    groups: [
      {
        label: 'Data source',
        color: '#f97316',
        tags: ['Strava Global Heatmap', 'activity_type=ride', 'raster tiles'],
      },
      {
        label: 'Rendering',
        color: '#f97316',
        tags: ['aggregated all-time GPS tracks', 'tile zoom 0–15', 'requires Strava login'],
      },
    ],
  },
  spaceFrequency: {
    title: 'Pedestrian Frequency',
    groups: [
      {
        label: 'Method',
        color: '#3b82f6',
        tags: ['Betweenness Centrality', 'Space Syntax approach', 'Rhino 8 + Grasshopper'],
      },
      {
        label: 'Network',
        color: '#3b82f6',
        tags: ['11 668 segments', 'max. 150m segment length', 'pedestrian paths + shared streets', 'full city of Wolfsburg'],
      },
      {
        label: 'Origins & Destinations',
        color: '#3b82f6',
        tags: ['1 824 internal ODs from building footprints', '~55% external ODs at city entries', '40m² per origin · factor 0.6 · avg. 2 storeys', 'key attractors: Hbf · ZOB · VW factory gates'],
      },
      {
        label: 'Movement Model',
        color: '#3b82f6',
        tags: ['angular influence 1.0 · metric 0.4', 'decay function · 700m radius · max 1 200m', 'density weighting'],
      },
      {
        label: 'Scoring',
        color: '#3b82f6',
        tags: ['percentile rank 0–100', 'blended with Strava running when logged in'],
      },
    ],
  },
  cyclingSpaceFrequency: {
    title: 'Cycling Frequency',
    groups: [
      {
        label: 'Method',
        color: '#3b82f6',
        tags: ['Betweenness Centrality', 'Movement Frequency Simulation', 'Space Syntax approach', 'Rhino 8 + Grasshopper'],
      },
      {
        label: 'Network',
        color: '#3b82f6',
        tags: ['pedestrian network as proxy', 'max. 200m segment length', 'field & forest paths excluded', 'full city of Wolfsburg'],
      },
      {
        label: 'Origins & Destinations',
        color: '#3b82f6',
        tags: ['67 875 internal ODs from building footprints', '~45% external ODs at city entries', '40m² per origin · factor 0.6 · avg. 2.5 storeys', '1 968 total trips per day'],
      },
      {
        label: 'Movement Model',
        color: '#3b82f6',
        tags: ['metric influence 0.8 · angular 0.4', 'decay function · 2 500m radius · max 4 000m'],
      },
      {
        label: 'Note',
        color: '#3b82f6',
        tags: ['No dedicated bicycle mode available — pedestrian parameters adapted to approximate cycling behaviour, prioritising metric distance over angular turns'],
      },
      {
        label: 'Scoring',
        color: '#3b82f6',
        tags: ['percentile rank 0–100', 'blended with Strava cycling when logged in'],
      },
    ],
  },
  combinedHeatmap: {
    title: 'Combined Movement Heatmap',
    groups: [
      {
        label: 'Method',
        color: '#f97316',
        tags: ['segment midpoints from both simulations', 'weighted by percentile score', 'kernel density heatmap'],
      },
      {
        label: 'Sources',
        color: '#f97316',
        tags: ['pedestrian frequency (Space Syntax)', 'cycling frequency (Space Syntax)'],
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

  const {
    activeLayers, toggleLayer,
    pedestrianData, cyclingData, cycleParkingData, busStopsData,
    isLoadingPedestrian, isLoadingCycling, isLoadingCycleParking, isLoadingBusStops,
    stravaToken, stravaError,
    spaceFrequencyData, isLoadingSpaceFrequency,
    cyclingSpaceFrequencyData, isLoadingCyclingSpaceFrequency,
  } = useMapStore()
  const { fetchPedestrian, fetchCycling, fetchCycleParking, fetchBusStops, fetchSpaceFrequency, fetchCyclingSpaceFrequency } = useMovement()

  const activeNetworks = ['pedestrianNetwork', 'cyclingNetwork', 'cycleParking', 'busStops', 'busStopCatchment', 'stravaHeatmapRun', 'stravaHeatmapRide', 'spaceFrequency', 'cyclingSpaceFrequency', 'combinedHeatmap'].filter(id => activeLayers[id])

  function handleMovementToggle(id) {
    const wasOff = !activeLayers[id]
    toggleLayer(id)
    if (wasOff) {
      if (id === 'pedestrianNetwork' && !pedestrianData)     fetchPedestrian()
      if (id === 'cyclingNetwork'    && !cyclingData)        fetchCycling()
      if (id === 'cycleParking'      && !cycleParkingData)   fetchCycleParking()
      if (id === 'busStops'          && !busStopsData)       fetchBusStops()
      if (id === 'busStopCatchment'  && !busStopsData)       fetchBusStops()
      if (id === 'spaceFrequency'         && !spaceFrequencyData)        fetchSpaceFrequency()
      if (id === 'cyclingSpaceFrequency'  && !cyclingSpaceFrequencyData) fetchCyclingSpaceFrequency()
      if (id === 'combinedHeatmap') {
        if (!spaceFrequencyData)       fetchSpaceFrequency()
        if (!cyclingSpaceFrequencyData) fetchCyclingSpaceFrequency()
      }
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
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: activeLayers.busStops ? '#8b5cf6' : '#374151' }} />
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
                {activeLayers.busStops && (
                  <div className="mt-1 pt-2 border-t border-white/5">
                    <button
                      onClick={() => handleMovementToggle('busStopCatchment')}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all ${
                        activeLayers.busStopCatchment ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5 hover:text-white/70'
                      }`}
                    >
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: activeLayers.busStopCatchment ? '#8b5cf6' : '#374151' }} />
                      <span className="flex-1 text-xs font-medium">Coverage Density</span>
                      <div className={`w-7 h-3.5 rounded-full flex-shrink-0 transition-colors relative ${activeLayers.busStopCatchment ? 'bg-[#818cf8]' : 'bg-white/10'}`}>
                        <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow transition-all ${activeLayers.busStopCatchment ? 'left-[14px]' : 'left-0.5'}`} />
                      </div>
                    </button>
                    {activeLayers.busStopCatchment && (
                      <div className="mt-1.5 mb-1 px-3">
                        <div className="h-1 rounded-full" style={{ background: 'linear-gradient(to right, #e9d5ff, #c4b5fd, #8b5cf6, #6d28d9, #2e1065)' }} />
                        <div className="flex justify-between mt-1">
                          <span className="text-[8px] text-white/30">Low</span>
                          <span className="text-[8px] text-white/30">High</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Frequency ── */}
              <div className="mt-4 pt-4 border-t border-white/8">
                <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">Frequency</p>

                {!stravaToken ? (
                  <div className="px-1">
                    <p className="text-[11px] text-white/40 leading-relaxed mb-3">
                      Connect Strava to blend the frequency models with live GPS data.
                    </p>
                    <button
                      onClick={connectStrava}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all bg-[#fc4c02]/15 text-[#fc4c02] hover:bg-[#fc4c02]/25"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
                      </svg>
                      Connect Strava
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                      {/* Divider */}
                      <div className="pt-1 pb-0.5">
                        <p className="text-[9px] font-semibold text-white/20 uppercase tracking-widest px-1">Heatmap</p>
                      </div>

                      {/* Running Heatmap */}
                      <div>
                        <button
                          onClick={() => toggleLayer('stravaHeatmapRun')}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                            activeLayers.stravaHeatmapRun ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5 hover:text-white/70'
                          }`}
                        >
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: activeLayers.stravaHeatmapRun ? '#fc4c02' : '#374151' }} />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium leading-none">Running Heatmap</div>
                            <div className="text-[10px] text-white/30 mt-1">Strava global tile overlay</div>
                          </div>
                          <div className={`w-7 h-3.5 rounded-full flex-shrink-0 transition-colors relative ${activeLayers.stravaHeatmapRun ? 'bg-[#818cf8]' : 'bg-white/10'}`}>
                            <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow transition-all ${activeLayers.stravaHeatmapRun ? 'left-[14px]' : 'left-0.5'}`} />
                          </div>
                        </button>
                      </div>

                      {/* Cycling Heatmap */}
                      <div>
                        <button
                          onClick={() => toggleLayer('stravaHeatmapRide')}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                            activeLayers.stravaHeatmapRide ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5 hover:text-white/70'
                          }`}
                        >
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: activeLayers.stravaHeatmapRide ? '#fc4c02' : '#374151' }} />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium leading-none">Cycling Heatmap</div>
                            <div className="text-[10px] text-white/30 mt-1">Strava global tile overlay</div>
                          </div>
                          <div className={`w-7 h-3.5 rounded-full flex-shrink-0 transition-colors relative ${activeLayers.stravaHeatmapRide ? 'bg-[#818cf8]' : 'bg-white/10'}`}>
                            <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow transition-all ${activeLayers.stravaHeatmapRide ? 'left-[14px]' : 'left-0.5'}`} />
                          </div>
                        </button>
                      </div>
                    </div>
                )}

                {/* Space Syntax — always visible */}
                <div className="pt-1 pb-0.5 mt-1">
                  <p className="text-[9px] font-semibold text-white/20 uppercase tracking-widest px-1">Space Syntax</p>
                </div>
                {stravaToken && stravaError === 'rate_limited' && (
                  <p className="text-[10px] text-amber-400/80 leading-relaxed mb-2 px-1">
                    Strava rate limit reached — wait 15 min and toggle again.
                  </p>
                )}
                <div>
                  <button
                    onClick={() => handleMovementToggle('spaceFrequency')}
                    disabled={isLoadingSpaceFrequency}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                      activeLayers.spaceFrequency ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5 hover:text-white/70'
                    }`}
                  >
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: activeLayers.spaceFrequency ? '#3b82f6' : '#374151' }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium leading-none">Pedestrian Frequency</div>
                      <div className="text-[10px] text-white/30 mt-1">Space syntax · Strava running</div>
                    </div>
                    {isLoadingSpaceFrequency ? (
                      <svg className="animate-spin w-3 h-3 text-white/40 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                    ) : (
                      <div className={`w-7 h-3.5 rounded-full flex-shrink-0 transition-colors relative ${activeLayers.spaceFrequency ? 'bg-[#818cf8]' : 'bg-white/10'}`}>
                        <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow transition-all ${activeLayers.spaceFrequency ? 'left-[14px]' : 'left-0.5'}`} />
                      </div>
                    )}
                  </button>
                  {activeLayers.spaceFrequency && (
                    <div className="mt-1.5 mb-1 px-3">
                      <div className="h-1 rounded-full" style={{ background: 'linear-gradient(to right, #3b82f6, #0d9488, #16a34a, #f59e0b, #ea580c, #dc2626, #7f1d1d)' }} />
                      <div className="flex justify-between mt-1">
                        <span className="text-[8px] text-white/30">Low</span>
                        <span className="text-[8px] text-white/30">High</span>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <button
                    onClick={() => handleMovementToggle('cyclingSpaceFrequency')}
                    disabled={isLoadingCyclingSpaceFrequency}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                      activeLayers.cyclingSpaceFrequency ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5 hover:text-white/70'
                    }`}
                  >
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: activeLayers.cyclingSpaceFrequency ? '#3b82f6' : '#374151' }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium leading-none">Cycling Frequency</div>
                      <div className="text-[10px] text-white/30 mt-1">Space syntax · Strava cycling</div>
                    </div>
                    {isLoadingCyclingSpaceFrequency ? (
                      <svg className="animate-spin w-3 h-3 text-white/40 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                    ) : (
                      <div className={`w-7 h-3.5 rounded-full flex-shrink-0 transition-colors relative ${activeLayers.cyclingSpaceFrequency ? 'bg-[#818cf8]' : 'bg-white/10'}`}>
                        <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow transition-all ${activeLayers.cyclingSpaceFrequency ? 'left-[14px]' : 'left-0.5'}`} />
                      </div>
                    )}
                  </button>
                  {activeLayers.cyclingSpaceFrequency && (
                    <div className="mt-1.5 mb-1 px-3">
                      <div className="h-1 rounded-full" style={{ background: 'linear-gradient(to right, #3b82f6, #0d9488, #16a34a, #f59e0b, #ea580c, #dc2626, #7f1d1d)' }} />
                      <div className="flex justify-between mt-1">
                        <span className="text-[8px] text-white/30">Low</span>
                        <span className="text-[8px] text-white/30">High</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Combined heatmap — divider */}
                <div className="pt-3 mt-1 border-t border-white/5">
                  <button
                    onClick={() => handleMovementToggle('combinedHeatmap')}
                    disabled={isLoadingSpaceFrequency || isLoadingCyclingSpaceFrequency}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                      activeLayers.combinedHeatmap ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5 hover:text-white/70'
                    }`}
                  >
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: activeLayers.combinedHeatmap ? '#f97316' : '#374151' }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium leading-none">Combined Movement</div>
                      <div className="text-[10px] text-white/30 mt-1">Pedestrian + cycling heatmap</div>
                    </div>
                    {(isLoadingSpaceFrequency || isLoadingCyclingSpaceFrequency) ? (
                      <svg className="animate-spin w-3 h-3 text-white/40 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                    ) : (
                      <div className={`w-7 h-3.5 rounded-full flex-shrink-0 transition-colors relative ${activeLayers.combinedHeatmap ? 'bg-[#818cf8]' : 'bg-white/10'}`}>
                        <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow transition-all ${activeLayers.combinedHeatmap ? 'left-[14px]' : 'left-0.5'}`} />
                      </div>
                    )}
                  </button>
                  {activeLayers.combinedHeatmap && (
                    <div className="mt-1.5 mb-1 px-3">
                      <div className="h-1 rounded-full" style={{ background: 'linear-gradient(to right, #fff0e8, #ffb899, #ff7744, #ee3311, #aa1100)' }} />
                      <div className="flex justify-between mt-1">
                        <span className="text-[8px] text-white/30">Low</span>
                        <span className="text-[8px] text-white/30">High</span>
                      </div>
                    </div>
                  )}
                </div>

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
