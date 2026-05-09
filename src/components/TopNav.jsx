import { useState } from 'react'
import { useMapStore } from '../store/mapStore'
import CLOSURES_DATA from '../data/closures.json'

const FREQ_TIERS = [
  { label: 'V.High',  color: '#dc2626' },
  { label: 'High',    color: '#f97316' },
  { label: 'Medium',  color: '#fbbf24' },
  { label: 'Low',     color: '#fde68a' },
  { label: 'Lowest',  color: '#fef9c3' },
]

const BUTTONS = [
  { id: 'movement',  label: 'Movement'  },
  { id: 'functions', label: 'Places'    },
  { id: 'social',    label: 'Social'    },
]

const LAYER_COLORS = {
  frequencyAnalysis:   '#ef4444',   // anchor: red (amber → red ramp)
  googleActivity:      '#6366f1',   // anchor: indigo (blue → indigo ramp)
  dwellInfrastructure: '#059669',   // anchor: emerald (mint → teal ramp)
}

const LAYER_INFO = {
  frequencyAnalysis: {
    title: 'Neighbourhood Hotspots',
    rows: [
      { label: 'Source', value: 'OpenStreetMap via Overpass API' },
      { label: 'Features', value: 'Parks, plazas, playgrounds, gardens, pedestrian areas, marketplaces' },
      { label: 'Scoring', value: 'Base score by typology (14–40) + area score (√ha × 4) + commercial spillover within 250 m + transit proximity to bus stops' },
      { label: 'Scale', value: '0–100 · top 15 spaces per district selected' },
    ],
  },
  googleActivity: {
    title: 'Venue Popularity',
    rows: [
      { label: 'Source', value: 'Google Places API — Nearby Search' },
      { label: 'Coverage', value: '103 venues across 5 overlapping search areas covering Wolfsburg' },
      { label: 'Weighting', value: 'log(review count + 1) — logarithmic scale normalises the wide spread between popular and lesser-known venues' },
      { label: 'Represents', value: 'How well-known a place is, not a direct count of visits' },
    ],
  },
  dwellInfrastructure: {
    title: 'Dwell Infrastructure',
    rows: [
      { label: 'Source', value: 'OpenStreetMap via Overpass API' },
      { label: 'Features', value: '1,258 elements — benches (1,093), outdoor seating (58), picnic tables (49), public toilets (44), shelters (14)' },
      { label: 'Weights', value: 'Outdoor seating 5 · Shelters 3 · Toilets 3 · Picnic tables 2 · Benches 1' },
      { label: 'Methodology', value: "Based on Jan Gehl’s comfort criteria — infrastructure that enables and invites people to stay" },
    ],
  },
}

function InfoPanel({ id }) {
  const info = LAYER_INFO[id]
  if (!info) return null
  return (
    <div className="mt-2 mx-1 p-3 rounded-lg bg-white/5 border border-white/8">
      <p className="text-[9px] font-semibold text-white/40 uppercase tracking-widest mb-2">{info.title} — Methodology</p>
      <div className="space-y-1.5">
        {info.rows.map(({ label, value }) => (
          <div key={label}>
            <span className="text-[9px] font-semibold text-white/40 uppercase tracking-wide">{label} </span>
            <span className="text-[9px] text-white/60 leading-relaxed">{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function InfoButton({ id, openInfo, setOpenInfo }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); setOpenInfo(prev => prev === id ? null : id) }}
      className={`ml-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 transition-colors ${
        openInfo === id ? 'bg-white/20 text-white' : 'bg-white/8 text-white/30 hover:bg-white/15 hover:text-white/60'
      }`}
      title="Methodology"
    >
      i
    </button>
  )
}

function LayerRow({ layerId, title, subtitle, openInfo, setOpenInfo, isActive, onToggle, children }) {
  const color = LAYER_COLORS[layerId]
  return (
    <div className="mb-4">
      <div className="flex items-center gap-1">
        <button
          onClick={onToggle}
          className="flex-1 flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all"
          style={isActive
            ? { backgroundColor: `${color}1a`, color: 'white' }
            : { color: 'rgba(255,255,255,0.5)' }
          }
        >
          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: isActive ? color : '#374151' }} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium leading-none">{title}</div>
            <div className="text-[10px] text-white/30 mt-1">{subtitle}</div>
          </div>
          <div className={`w-7 h-3.5 rounded-full flex-shrink-0 transition-colors relative ${isActive ? 'bg-[#818cf8]' : 'bg-white/10'}`}>
            <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow transition-all ${isActive ? 'left-[14px]' : 'left-0.5'}`} />
          </div>
        </button>
        <InfoButton id={layerId} openInfo={openInfo} setOpenInfo={setOpenInfo} />
      </div>

      {openInfo === layerId && <InfoPanel id={layerId} />}
      {children}
    </div>
  )
}

export default function TopNav() {
  const [openPanel, setOpenPanel] = useState(null)
  const [openInfo, setOpenInfo]   = useState(null)
  const { activeLayers, toggleLayer, closureYear, setClosureYear } = useMapStore()

  function handleClick(id) {
    setOpenPanel(prev => (prev === id ? null : id))
    setOpenInfo(null)
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
        <div className="absolute top-20 left-4 z-20 w-76 pointer-events-auto
          bg-[#16213e]/90 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl
          animate-fade-in">

          {openPanel === 'movement' && (
            <div className="p-5">
              <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">Movement</p>
              <p className="text-xs text-white/40 leading-relaxed">
                Pedestrian flow &amp; space syntax analysis — coming soon
              </p>
              <div className="mt-4 pt-3 border-t border-white/8">
                <p className="text-[9px] text-white/20 italic">Connect your Grasshopper export to activate</p>
              </div>
            </div>
          )}

          {openPanel === 'functions' && (
            <div className="p-5">
              <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-4">Places</p>

              {/* ── Neighbourhood Hotspots ── */}
              <LayerRow
                layerId="frequencyAnalysis"
                title="Neighbourhood Hotspots"
                subtitle="Activity frequency · OSM-derived"
                openInfo={openInfo}
                setOpenInfo={setOpenInfo}
                isActive={activeLayers.frequencyAnalysis}
                onToggle={() => toggleLayer('frequencyAnalysis')}
              >
                {activeLayers.frequencyAnalysis && openInfo !== 'frequencyAnalysis' && (
                  <div className="mt-2 px-1">
                    <div className="flex items-center justify-between mb-1.5">
                      {FREQ_TIERS.map((t) => (
                        <div key={t.label} className="flex flex-col items-center gap-1">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />
                          <span className="text-[8px] text-white/30 leading-none">{t.label}</span>
                        </div>
                      ))}
                    </div>
                    <div className="h-1 rounded-full" style={{
                      background: 'linear-gradient(to right, #fef9c3, #fbbf24, #f97316, #dc2626)'
                    }} />
                  </div>
                )}
              </LayerRow>

              {/* ── Venue Popularity ── */}
              <LayerRow
                layerId="googleActivity"
                title="Venue Popularity"
                subtitle="Google review density · 103 venues"
                openInfo={openInfo}
                setOpenInfo={setOpenInfo}
                isActive={activeLayers.googleActivity}
                onToggle={() => toggleLayer('googleActivity')}
              >
                {activeLayers.googleActivity && openInfo !== 'googleActivity' && (
                  <div className="mt-2 px-1">
                    <div className="h-1 rounded-full" style={{
                      background: 'linear-gradient(to right, #bfdbfe, #6366f1, #312e81)'
                    }} />
                    <div className="flex justify-between mt-1">
                      <span className="text-[8px] text-white/30">Low</span>
                      <span className="text-[8px] text-white/30">High</span>
                    </div>
                  </div>
                )}
              </LayerRow>

              {/* ── Dwell Infrastructure ── */}
              <LayerRow
                layerId="dwellInfrastructure"
                title="Dwell Infrastructure"
                subtitle="Benches · seating · shelters · toilets"
                openInfo={openInfo}
                setOpenInfo={setOpenInfo}
                isActive={activeLayers.dwellInfrastructure}
                onToggle={() => toggleLayer('dwellInfrastructure')}
              >
                {activeLayers.dwellInfrastructure && openInfo !== 'dwellInfrastructure' && (
                  <div className="mt-2 px-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {[['#065f46','Outdoor Seating'],['#059669','Shelter'],['#059669','Toilet'],['#6ee7b7','Picnic Table'],['#a7f3d0','Bench']].map(([c,l]) => (
                        <div key={l} className="flex items-center gap-1">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c }} />
                          <span className="text-[8px] text-white/30">{l}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </LayerRow>

              {/* ── Shop & Café Closures ── */}
              <div className="pt-4 border-t border-white/8">
                <div className="flex items-center gap-1 mb-3">
                  <button
                    onClick={() => toggleLayer('closures')}
                    className="flex-1 flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all"
                    style={activeLayers.closures
                      ? { backgroundColor: 'rgba(71,85,105,0.25)', color: 'white' }
                      : { color: 'rgba(255,255,255,0.5)' }
                    }
                  >
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: activeLayers.closures ? '#94a3b8' : '#374151' }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium leading-none">Shop &amp; Café Closures</div>
                      <div className="text-[10px] text-white/30 mt-1">OSM history · 694 events · 2019–2024</div>
                    </div>
                    <div className={`w-7 h-3.5 rounded-full flex-shrink-0 transition-colors relative ${activeLayers.closures ? 'bg-[#818cf8]' : 'bg-white/10'}`}>
                      <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow transition-all ${activeLayers.closures ? 'left-[14px]' : 'left-0.5'}`} />
                    </div>
                  </button>
                </div>

                {activeLayers.closures && (() => {
                  const stats    = CLOSURES_DATA.yearStats[String(closureYear)] ?? {}
                  const fd       = stats.foodDelta ?? 0
                  const sd       = stats.shopDelta ?? 0
                  const fmt      = n => (n >= 0 ? `+${n}` : String(n))
                  const deltaCol = n => n < 0 ? '#f87171' : n > 0 ? '#86efac' : '#94a3b8'
                  const allFeatures = CLOSURES_DATA.closures.features
                  const cumulative  = allFeatures.filter(f => f.properties.year <= closureYear).length
                  const yearColors  = { 2019:'#94a3b8', 2020:'#64748b', 2021:'#ef4444', 2022:'#f97316', 2023:'#eab308', 2024:'#22c55e' }
                  return (
                    <div>
                      <div className="flex items-center justify-between mb-2 px-1">
                        <span className="text-[10px] text-white/40">Showing up to</span>
                        <span className="text-xs font-bold text-white">{closureYear}</span>
                      </div>
                      <input
                        type="range" min={2019} max={2024} step={1}
                        value={closureYear}
                        onChange={(e) => setClosureYear(Number(e.target.value))}
                        className="w-full h-1.5 rounded-full accent-white cursor-pointer mb-1"
                      />
                      <div className="flex justify-between mb-3">
                        <span className="text-[9px] text-white/25">2019</span>
                        <span className="text-[9px] text-white/25">2024</span>
                      </div>

                      {/* Year dot legend */}
                      <div className="flex items-center justify-between mb-3 px-1">
                        {[2019,2020,2021,2022,2023,2024].map(y => (
                          <div key={y} className="flex flex-col items-center gap-1">
                            <div className="w-2.5 h-2.5 rounded-full transition-opacity"
                              style={{ backgroundColor: yearColors[y], opacity: y <= closureYear ? 1 : 0.2 }} />
                            <span className="text-[7px] text-white/30">{y}</span>
                          </div>
                        ))}
                      </div>

                      <div className="flex gap-2 mb-2">
                        <div className="flex-1 bg-white/5 rounded-lg px-3 py-2 text-center">
                          <div className="text-[9px] text-white/30 uppercase tracking-wide mb-1">Food &amp; Drink</div>
                          <div className="text-sm font-bold" style={{ color: deltaCol(fd) }}>{fmt(fd)}</div>
                          <div className="text-[9px] text-white/25 mt-0.5">{stats.foodCount} mapped</div>
                        </div>
                        <div className="flex-1 bg-white/5 rounded-lg px-3 py-2 text-center">
                          <div className="text-[9px] text-white/30 uppercase tracking-wide mb-1">Shops</div>
                          <div className="text-sm font-bold" style={{ color: deltaCol(sd) }}>{fmt(sd)}</div>
                          <div className="text-[9px] text-white/25 mt-0.5">{stats.shopCount} mapped</div>
                        </div>
                      </div>
                      <div className="bg-white/5 rounded-lg px-3 py-2 text-center">
                        <div className="text-[9px] text-white/30 uppercase tracking-wide mb-1">Cumulative closures</div>
                        <div className="text-sm font-bold text-white">{cumulative}</div>
                        <div className="text-[9px] text-white/25 mt-0.5">2019 → {closureYear}</div>
                      </div>
                      <p className="text-[9px] text-white/20 mt-2 leading-relaxed px-1">
                        Dots coloured by year · source: OSM history
                      </p>
                    </div>
                  )
                })()}
              </div>
            </div>
          )}

          {openPanel === 'social' && (
            <div className="p-5">
              <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">Social</p>
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
    </>
  )
}
