import { useState } from 'react'

export const LEFT_CONTROLS = [
  { id: 'SF', desc: 'Left shoulder' },
  { id: 'SG', desc: 'Front-left' },
  { id: 'SA', desc: 'Top-left inner' },
  { id: 'SB', desc: 'Top-left outer' },
  { id: 'LS', desc: 'Left slider' },
]
export const CENTER_CONTROLS = [
  { id: 'S1', desc: 'Left of screen' },
  { id: 'S2', desc: 'Right of screen' },
]
export const RIGHT_CONTROLS = [
  { id: 'SE', desc: 'Right shoulder' },
  { id: 'SH', desc: 'Front-right' },
  { id: 'SD', desc: 'Top-right inner' },
  { id: 'SC', desc: 'Top-right outer' },
  { id: 'RS', desc: 'Right slider' },
]

// ─── ControlBtn ───────────────────────────────────────────────────────────────

export function ControlBtn({
  id, desc, selected, onSelect, usedFor, onConflict,
}: {
  id: string
  desc: string
  selected: string
  onSelect: (id: string) => void
  usedFor?: string
  onConflict?: (id: string, usedFor: string) => void
}): JSX.Element {
  const active = selected === id
  const isUsed = !!usedFor && !active
  return (
    <button
      type="button"
      style={{ touchAction: 'manipulation' }}
      onClick={() => {
        if (isUsed) onConflict?.(id, usedFor!)
        else onSelect(id)
      }}
      className={`flex flex-col items-center w-full px-2 py-2 rounded-xl border-2 transition-all ${
        active
          ? 'bg-amber-900/60 border-amber-400 shadow-lg shadow-amber-900/50'
          : isUsed
            ? 'bg-red-950/40 border-red-800/60 cursor-pointer active:scale-95'
            : 'bg-[#0f172a] border-[#334155] hover:border-[#475569] hover:bg-[#1e293b] cursor-pointer active:scale-95'
      }`}
    >
      <span className={`text-base font-black tracking-tight leading-none ${
        active ? 'text-amber-300' : isUsed ? 'text-red-500' : 'text-[#94a3b8]'
      }`}>{id}</span>
      <span className={`text-[9px] mt-0.5 text-center leading-tight w-full truncate ${
        active ? 'text-amber-200' : isUsed ? 'text-red-400 font-bold' : 'text-[#64748b]'
      }`}>
        {isUsed ? `⚠ ${usedFor}` : desc}
      </span>
    </button>
  )
}

// ─── ConflictBanner ───────────────────────────────────────────────────────────

function ConflictBanner({ id, usedFor, onDismiss }: { id: string; usedFor: string; onDismiss: () => void }): JSX.Element {
  return (
    <div className="flex items-start gap-3 bg-red-950 border-2 border-red-600 rounded-2xl px-4 py-3 shadow-lg shadow-red-950/50">
      <span className="text-red-400 text-xl shrink-0 mt-0.5">⚠</span>
      <div className="flex-1 min-w-0">
        <p className="text-red-200 text-sm font-bold leading-snug">
          {id} is already assigned to <span className="text-white">{usedFor}</span>
        </p>
        <p className="text-red-300/80 text-xs mt-1 leading-snug">
          Pick a different switch — or go back and change your <span className="font-bold text-red-200">{usedFor}</span> assignment first.
        </p>
      </div>
      <button type="button" onClick={onDismiss} className="text-red-500 hover:text-red-200 text-lg leading-none shrink-0 mt-0.5">✕</button>
    </div>
  )
}

// ─── ControlPicker ────────────────────────────────────────────────────────────

export function ControlPicker({
  selected,
  onSelect,
  usedBy = {},
}: {
  selected: string
  onSelect: (id: string) => void
  usedBy?: Record<string, string>
}): JSX.Element {
  const [conflict, setConflict] = useState<{ id: string; usedFor: string } | null>(null)

  const handleSelect = (id: string) => {
    setConflict(null)
    onSelect(id)
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="flex-1 flex flex-col gap-1.5">
          <div className="text-[#64748b] text-[10px] font-bold uppercase tracking-widest text-center pb-0.5">Left</div>
          {LEFT_CONTROLS.map(({ id, desc }) => (
            <ControlBtn key={id} id={id} desc={desc} selected={selected} onSelect={handleSelect}
              usedFor={usedBy[id]} onConflict={(id, u) => setConflict({ id, usedFor: u })} />
          ))}
        </div>
        <div className="w-12 flex flex-col gap-1.5">
          <div className="text-[#64748b] text-[10px] font-bold uppercase tracking-widest text-center pb-0.5">Pots</div>
          {CENTER_CONTROLS.map(({ id, desc }) => (
            <ControlBtn key={id} id={id} desc={desc} selected={selected} onSelect={handleSelect}
              usedFor={usedBy[id]} onConflict={(id, u) => setConflict({ id, usedFor: u })} />
          ))}
        </div>
        <div className="flex-1 flex flex-col gap-1.5">
          <div className="text-[#64748b] text-[10px] font-bold uppercase tracking-widest text-center pb-0.5">Right</div>
          {RIGHT_CONTROLS.map(({ id, desc }) => (
            <ControlBtn key={id} id={id} desc={desc} selected={selected} onSelect={handleSelect}
              usedFor={usedBy[id]} onConflict={(id, u) => setConflict({ id, usedFor: u })} />
          ))}
        </div>
      </div>

      {conflict && (
        <ConflictBanner id={conflict.id} usedFor={conflict.usedFor} onDismiss={() => setConflict(null)} />
      )}
    </div>
  )
}

// ─── RadioDiagram ─────────────────────────────────────────────────────────────

export function RadioDiagram({
  selected,
  onSelect,
  usedBy = {},
}: {
  selected: string
  onSelect: (id: string) => void
  usedBy?: Record<string, string>
}): JSX.Element {
  const [conflict, setConflict] = useState<{ id: string; usedFor: string } | null>(null)

  const sel = (id: string) => selected === id

  type ColScheme = { fill: string; stroke: string; text: string; knob: string; hi: string }
  const c = (id: string): ColScheme => {
    if (sel(id))    return { fill: '#78350f', stroke: '#fbbf24', text: '#fbbf24', knob: '#b45309', hi: '#fef08a' }
    if (usedBy[id]) return { fill: '#3b0000', stroke: '#7f1d1d', text: '#ef4444', knob: '#2d0000', hi: '#7f1d1d' }
    return           { fill: '#0c1c30', stroke: '#1e3a5a', text: '#3a5878', knob: '#0d1e32', hi: '#1e3a5a' }
  }

  const handleClick = (id: string) => {
    if (usedBy[id] && !sel(id)) {
      setConflict({ id, usedFor: usedBy[id] })
    } else {
      setConflict(null)
      onSelect(id)
    }
  }

  const sw3 = [
    { id: 'SA', cx: 68,  cy: 86 },
    { id: 'SB', cx: 113, cy: 86 },
    { id: 'SC', cx: 387, cy: 86 },
    { id: 'SD', cx: 432, cy: 86 },
    { id: 'SG', cx: 90,  cy: 232 },
    { id: 'SH', cx: 410, cy: 232 },
  ]
  const sw2 = [
    { id: 'SF', cx: 68,  cy: 38 },
    { id: 'SE', cx: 432, cy: 38 },
  ]
  const sliders = [
    { id: 'LS', cx: 29,  y1: 22, y2: 165 },
    { id: 'RS', cx: 471, y1: 22, y2: 165 },
  ]
  const pots = [
    { id: 'S1', cx: 159, cy: 86 },
    { id: 'S2', cx: 341, cy: 86 },
  ]
  const gimbals = [
    { cx: 158, cy: 338 },
    { cx: 342, cy: 338 },
  ]

  return (
    <div className="space-y-2">
      <svg
        viewBox="0 0 500 410"
        className="w-full max-w-lg mx-auto select-none touch-manipulation mt-2"
        aria-label="TX16S front-view — tap a switch to select it"
      >
        <defs>
          <linearGradient id="rg-body" x1="0" y1="0" x2="0.15" y2="1">
            <stop offset="0%" stopColor="#19304c" />
            <stop offset="100%" stopColor="#07111e" />
          </linearGradient>
          <linearGradient id="rg-panel" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1c3350" />
            <stop offset="100%" stopColor="#0f2038" />
          </linearGradient>
          <radialGradient id="rg-gimbal" cx="38%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#1c2e40" />
            <stop offset="100%" stopColor="#060c14" />
          </radialGradient>
          <radialGradient id="rg-stick" cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#3a5060" />
            <stop offset="100%" stopColor="#121e28" />
          </radialGradient>
        </defs>

        {/* Body */}
        <rect x="10" y="12" width="486" height="396" rx="28" fill="#000" opacity="0.5" />
        <rect x="6" y="8" width="488" height="396" rx="28"
          fill="url(#rg-body)" stroke="#1e3258" strokeWidth="1.5" />
        <rect x="8" y="10" width="484" height="3" rx="1.5" fill="#ffffff20" />
        <rect x="8" y="12" width="2" height="386" rx="1" fill="#ffffff10" />

        {/* Antenna mounts */}
        <rect x="20" y="2" width="28" height="13" rx="5" fill="#0e1a2c" stroke="#182840" strokeWidth="1" />
        <rect x="452" y="2" width="28" height="13" rx="5" fill="#0e1a2c" stroke="#182840" strokeWidth="1" />
        <rect x="25" y="1" width="18" height="7" rx="2" fill="#07101c" />
        <rect x="457" y="1" width="18" height="7" rx="2" fill="#07101c" />

        {/* Top switch panel */}
        <rect x="14" y="14" width="472" height="166" rx="16"
          fill="url(#rg-panel)" stroke="#1a3050" strokeWidth="1" />
        <rect x="16" y="16" width="468" height="2" rx="1" fill="#ffffff15" />

        {/* Screen */}
        <rect x="184" y="20" width="132" height="152" rx="9"
          fill="#030a12" stroke="#1a3252" strokeWidth="1.5" />
        <rect x="186" y="22" width="128" height="148" rx="8" fill="#060d1c" />
        <text x="250" y="104" textAnchor="middle" fill="#1a4285" fontSize="14" fontWeight="bold" letterSpacing="1">EdgeTX</text>
        <text x="250" y="122" textAnchor="middle" fill="#0e2a55" fontSize="10">TX16S</text>
        <circle cx="308" cy="28" r="4" fill="#14532d" />
        <circle cx="308" cy="28" r="2.5" fill="#22c55e" opacity="0.8" />

        {/* 3-position switches */}
        {sw3.map(({ id, cx, cy }) => {
          const col = c(id)
          const blocked = !!usedBy[id] && !sel(id)
          return (
            <g key={id} onClick={() => handleClick(id)}
              style={{ cursor: 'pointer', filter: sel(id) ? 'drop-shadow(0 0 8px #fbbf24)' : blocked ? 'drop-shadow(0 0 4px #ef4444)' : 'none' }}>
              <rect x={cx - 28} y={cy - 32} width={56} height={78} rx={10} fill="transparent" />
              <rect x={cx - 19} y={cy + 8} width={38} height={24} rx={8}
                fill={col.fill} stroke={col.stroke} strokeWidth={sel(id) ? 2.5 : 1.5} />
              {[cy + 13, cy + 20, cy + 27].map((ty, i) => (
                <rect key={i} x={cx + 17} y={ty} width={11} height={2} rx={1} fill={col.hi} />
              ))}
              <rect x={cx - 3} y={cy - 14} width={6} height={22} rx={3} fill={col.knob} />
              <circle cx={cx} cy={cy - 14} r={14}
                fill={col.knob} stroke={col.stroke} strokeWidth={sel(id) ? 2.5 : 1.5} />
              <ellipse cx={cx - 5} cy={cy - 19} rx={6} ry={4.5} fill={col.hi} opacity={0.5} />
              <text x={cx} y={cy + 46} textAnchor="middle"
                fill={col.text} fontSize={12} fontWeight="bold">{id}</text>
            </g>
          )
        })}

        {/* 2-position switches */}
        {sw2.map(({ id, cx, cy }) => {
          const col = c(id)
          const blocked = !!usedBy[id] && !sel(id)
          return (
            <g key={id} onClick={() => handleClick(id)}
              style={{ cursor: 'pointer', filter: sel(id) ? 'drop-shadow(0 0 8px #fbbf24)' : blocked ? 'drop-shadow(0 0 4px #ef4444)' : 'none' }}>
              <rect x={cx - 22} y={cy - 30} width={44} height={58} rx={8} fill="transparent" />
              <circle cx={cx} cy={cy - 14} r={9}
                fill={col.knob} stroke={col.stroke} strokeWidth={sel(id) ? 2.5 : 1.5} />
              <ellipse cx={cx - 3} cy={cy - 18} rx={4} ry={3} fill={col.hi} opacity={0.45} />
              <rect x={cx - 2} y={cy - 5} width={4} height={9} rx={2} fill={col.knob} />
              <rect x={cx - 13} y={cy + 3} width={26} height={16} rx={5}
                fill={col.fill} stroke={col.stroke} strokeWidth={sel(id) ? 2.5 : 1.5} />
              {[cy + 7, cy + 14].map((ty) => (
                <rect key={ty} x={cx + 10} y={ty} width={7} height={2} rx={1} fill={col.hi} />
              ))}
              <text x={cx} y={cy + 14} textAnchor="middle"
                fill={col.text} fontSize={8} fontWeight="bold">{id}</text>
            </g>
          )
        })}

        {/* Sliders */}
        {sliders.map(({ id, cx, y1, y2 }) => {
          const col = c(id)
          const midY = (y1 + y2) / 2
          const h = y2 - y1
          const blocked = !!usedBy[id] && !sel(id)
          return (
            <g key={id} onClick={() => handleClick(id)}
              style={{ cursor: 'pointer', filter: sel(id) ? 'drop-shadow(0 0 8px #fbbf24)' : blocked ? 'drop-shadow(0 0 4px #ef4444)' : 'none' }}>
              <rect x={cx - 22} y={y1 - 10} width={44} height={h + 36} rx={10} fill="transparent" />
              <rect x={cx - 14} y={y1} width={28} height={h} rx={12}
                fill={col.fill} stroke={col.stroke} strokeWidth={sel(id) ? 2.5 : 1.5} />
              <rect x={cx - 4} y={y1 + 16} width={8} height={h - 32} rx={4} fill="#020810" />
              <rect x={cx - 18} y={midY - 15} width={36} height={30} rx={9}
                fill={sel(id) ? '#78350f' : (usedBy[id] ? '#3b0000' : '#102030')}
                stroke={col.stroke} strokeWidth={sel(id) ? 2.5 : 1.5} />
              {[-6, 0, 6].map((dy) => (
                <line key={dy} x1={cx - 11} y1={midY + dy} x2={cx + 11} y2={midY + dy}
                  stroke={col.hi} strokeWidth={1.5} />
              ))}
              <text x={cx} y={y1 + 14} textAnchor="middle" fill={col.text} fontSize={8} fontWeight="bold">HI</text>
              <text x={cx} y={y2 - 6} textAnchor="middle" fill={col.text} fontSize={8} fontWeight="bold">LO</text>
              <text x={cx} y={y2 + 18} textAnchor="middle"
                fill={col.text} fontSize={12} fontWeight="bold">{id}</text>
            </g>
          )
        })}

        {/* Pots */}
        {pots.map(({ id, cx, cy }) => {
          const col = c(id)
          const angle = -Math.PI / 5
          const blocked = !!usedBy[id] && !sel(id)
          return (
            <g key={id} onClick={() => handleClick(id)}
              style={{ cursor: 'pointer', filter: sel(id) ? 'drop-shadow(0 0 8px #fbbf24)' : blocked ? 'drop-shadow(0 0 4px #ef4444)' : 'none' }}>
              <circle cx={cx} cy={cy} r={42} fill="transparent" />
              <circle cx={cx} cy={cy} r={29}
                fill={col.fill} stroke={col.stroke} strokeWidth={sel(id) ? 2.5 : 1.5} />
              {Array.from({ length: 9 }, (_, i) => {
                const a = (-130 + i * 32.5) * Math.PI / 180
                return (
                  <line key={i}
                    x1={cx + 23 * Math.cos(a)} y1={cy + 23 * Math.sin(a)}
                    x2={cx + 29 * Math.cos(a)} y2={cy + 29 * Math.sin(a)}
                    stroke={col.hi} strokeWidth={1.5} />
                )
              })}
              <circle cx={cx} cy={cy} r={20}
                fill={sel(id) ? '#78350f' : (usedBy[id] ? '#3b0000' : '#0d1c2e')}
                stroke={col.stroke} strokeWidth={sel(id) ? 2 : 1.5} />
              <ellipse cx={cx - 6} cy={cy - 6} rx={7} ry={5} fill={col.hi} opacity={0.5} />
              <line x1={cx} y1={cy}
                x2={cx + 15 * Math.cos(angle)} y2={cy + 15 * Math.sin(angle)}
                stroke={sel(id) ? '#fbbf24' : '#1e3a5a'} strokeWidth={2.5} strokeLinecap="round" />
              <text x={cx} y={cy + 46} textAnchor="middle"
                fill={col.text} fontSize={12} fontWeight="bold">{id}</text>
              <text x={cx} y={cy + 59} textAnchor="middle"
                fill={col.text} fontSize={8}>pot</text>
            </g>
          )
        })}

        {/* Gimbals (visual only) */}
        {gimbals.map(({ cx, cy }) => (
          <g key={cx}>
            <circle cx={cx + 2} cy={cy + 3} r={54} fill="#000" opacity={0.55} />
            <circle cx={cx} cy={cy} r={54} fill="#04080e" stroke="#0c1820" strokeWidth={2} />
            <circle cx={cx} cy={cy} r={48} fill="url(#rg-gimbal)" />
            <circle cx={cx} cy={cy} r={36} fill="none" stroke="#080e1c" strokeWidth={1} />
            <circle cx={cx} cy={cy} r={24} fill="none" stroke="#080e1c" strokeWidth={1} />
            <line x1={cx} y1={cy - 44} x2={cx} y2={cy + 44} stroke="#050b14" strokeWidth={1.5} />
            <line x1={cx - 44} y1={cy} x2={cx + 44} y2={cy} stroke="#050b14" strokeWidth={1.5} />
            <circle cx={cx} cy={cy} r={16} fill="url(#rg-stick)" stroke="#2e4050" strokeWidth={1.5} />
            <ellipse cx={cx - 5} cy={cy - 5} rx={5} ry={3.5} fill="#4a6070" opacity={0.4} />
          </g>
        ))}
      </svg>

      {conflict && (
        <ConflictBanner id={conflict.id} usedFor={conflict.usedFor} onDismiss={() => setConflict(null)} />
      )}
    </div>
  )
}
