import { useMapStore } from '../store/mapStore'

export default function NeighbourhoodsButton() {
  const { activeLayers, toggleLayer } = useMapStore()
  const active = activeLayers.districts

  return (
    <button
      onClick={() => toggleLayer('districts')}
      className={`absolute top-3 right-3 z-20 flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold shadow-lg transition-all duration-200 border ${
        active
          ? 'bg-[#16213e] text-white border-[#818cf8]'
          : 'bg-[#16213e] text-white/50 border-white/10 hover:text-white hover:border-white/30'
      }`}
    >
      {/* Boundary icon */}
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="1" y="1" width="14" height="14" rx="2" />
        <line x1="8" y1="1" x2="8" y2="15" />
        <line x1="1" y1="8" x2="15" y2="8" />
      </svg>
      Neighbourhoods
    </button>
  )
}
