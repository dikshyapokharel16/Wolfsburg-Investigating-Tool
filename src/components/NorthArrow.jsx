import { useEffect, useState } from 'react'

export default function NorthArrow({ map }) {
  const [bearing, setBearing] = useState(0)

  useEffect(() => {
    if (!map) return
    const update = () => setBearing(map.getBearing())
    map.on('rotate', update)
    return () => map.off('rotate', update)
  }, [map])

  return (
    <button
      onClick={() => map?.easeTo({ bearing: 0, duration: 300 })}
      title="Reset to north"
      className="absolute top-[54px] right-3 z-20 w-9 h-9 rounded-full bg-[#16213e]/95 border border-white/10 hover:border-white/30 shadow-lg flex items-center justify-center transition-colors"
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 22 22"
        style={{
          transform: `rotate(${-bearing}deg)`,
          transition: 'transform 0.1s linear',
        }}
      >
        {/* North — red */}
        <path d="M11 2 L13 11 L11 10 L9 11 Z" fill="#ef4444" />
        {/* South — muted */}
        <path d="M11 20 L13 11 L11 12 L9 11 Z" fill="#475569" />
        <circle cx="11" cy="11" r="1.5" fill="white" opacity="0.75" />
      </svg>
    </button>
  )
}
