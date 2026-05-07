import { useState } from 'react'

const BUTTONS = [
  { id: 'movement',  label: 'Movement'  },
  { id: 'functions', label: 'Functions' },
  { id: 'social',    label: 'Social'    },
]

export default function TopNav() {
  const [openPanel, setOpenPanel] = useState(null)
  const [closureYear, setClosureYear] = useState(2022)

  function handleClick(id) {
    setOpenPanel(prev => (prev === id ? null : id))
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
              <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">
                Movement
              </p>
              <p className="text-xs text-white/40 leading-relaxed">
                Pedestrian flow &amp; space syntax analysis — coming soon
              </p>
              <div className="mt-4 pt-3 border-t border-white/8">
                <p className="text-[9px] text-white/20 italic">
                  Connect your Grasshopper export to activate
                </p>
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
                  type="range"
                  min={2019}
                  max={2024}
                  step={1}
                  value={closureYear}
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
    </>
  )
}
