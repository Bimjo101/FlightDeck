import { useState, useRef, useCallback, useEffect } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export type CurveType = 'expo' | 'custom'

export interface CurveData {
  type: CurveType
  expo: number        // -100 to 100; used when type='expo'
  points: number[]    // 9 Y-values at X=[-100,-75,-50,-25,0,25,50,75,100]; used when type='custom'
}

export const defaultCurve = (expo = 0): CurveData => ({
  type: 'expo',
  expo,
  points: [-100, -75, -50, -25, 0, 25, 50, 75, 100],
})

// ─── Math ─────────────────────────────────────────────────────────────────────

export const POINT_X = [-100, -75, -50, -25, 0, 25, 50, 75, 100]

// OpenTX/EdgeTX expo formula — positive = soft center, negative = sharp center
export function applyExpo(x: number, expo: number): number {
  const v = x * x * x
  const e = Math.abs(expo) / 100
  return expo >= 0 ? x * (1 - e) + v * e : x * (1 + e) - v * e
}

// Linear interpolation between custom points
export function applyCustom(x: number, points: number[]): number {
  const xi = (x + 100) / 25  // 0..8 float index
  const lo = Math.max(0, Math.min(7, Math.floor(xi)))
  const hi = lo + 1
  const t = xi - lo
  return points[lo] + t * (points[hi] - points[lo])
}

// ─── Mini Curve Thumbnail ─────────────────────────────────────────────────────

export function MiniCurve({
  curve,
  color = '#3b82f6',
  width = 52,
  height = 40,
}: {
  curve: CurveData
  color?: string
  width?: number
  height?: number
}): JSX.Element {
  const P = 4
  const tx = (x: number): number => P + ((x + 100) / 200) * (width - 2 * P)
  const ty = (y: number): number => P + ((100 - y) / 200) * (height - 2 * P)
  const pts: string[] = []
  for (let i = 0; i <= 60; i++) {
    const x = (i / 60) * 200 - 100
    const y = curve.type === 'expo'
      ? applyExpo(x / 100, curve.expo) * 100
      : applyCustom(x, curve.points)
    pts.push(`${tx(x).toFixed(1)},${ty(y).toFixed(1)}`)
  }
  const d = 'M ' + pts.join(' L ')
  return (
    <svg width={width} height={height}
      className="rounded-lg border border-[#334155] bg-[#0f172a] shrink-0 cursor-pointer">
      <line x1={P} y1={height / 2} x2={width - P} y2={height / 2}
        stroke="#1c2128" strokeWidth={0.75} />
      <line x1={width / 2} y1={P} x2={width / 2} y2={height - P}
        stroke="#1c2128" strokeWidth={0.75} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.75}
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ─── SVG Coordinate helpers ───────────────────────────────────────────────────

const SZ = 240  // canvas pixel size
const PAD = 18  // padding

function ix(v: number): number { return PAD + ((v + 100) / 200) * (SZ - 2 * PAD) }
function iy(v: number): number { return PAD + ((100 - v) / 200) * (SZ - 2 * PAD) }
function fromSvgY(svgY: number): number {
  return Math.max(-100, Math.min(100, 100 - ((svgY - PAD) / (SZ - 2 * PAD)) * 200))
}

// ─── Presets ──────────────────────────────────────────────────────────────────

const PRESETS: { label: string; curve: CurveData }[] = [
  { label: 'Linear',
    curve: { type: 'expo', expo: 0, points: [-100,-75,-50,-25,0,25,50,75,100] } },
  { label: 'Soft Center',
    curve: { type: 'expo', expo: 35, points: [-100,-75,-50,-25,0,25,50,75,100] } },
  { label: 'S-Curve',
    curve: { type: 'custom', expo: 0,
      points: [-100, -82, -55, -18, 0, 18, 55, 82, 100] } },
  { label: 'Inverse S',
    curve: { type: 'custom', expo: 0,
      points: [-100, -68, -45, -28, 0, 28, 45, 68, 100] } },
  { label: 'Sport',
    curve: { type: 'expo', expo: -20, points: [-100,-75,-50,-25,0,25,50,75,100] } },
  { label: 'Beginner',
    curve: { type: 'expo', expo: 55, points: [-100,-75,-50,-25,0,25,50,75,100] } },
]

// ─── Component ────────────────────────────────────────────────────────────────

interface CurveEditorProps {
  curve: CurveData
  onChange: (curve: CurveData) => void
  accentColor?: string
}

export default function CurveEditor({ curve, onChange, accentColor = '#3b82f6' }: CurveEditorProps): JSX.Element {
  const svgRef = useRef<SVGSVGElement>(null)
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null)
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  // Build curve polyline path
  const curvePath = (): string => {
    const pts: string[] = []
    for (let i = 0; i <= 200; i++) {
      const x = i - 100
      const y = curve.type === 'expo'
        ? applyExpo(x / 100, curve.expo) * 100
        : applyCustom(x, curve.points)
      pts.push(`${ix(x).toFixed(1)},${iy(y).toFixed(1)}`)
    }
    return 'M ' + pts.join(' L ')
  }

  const getSvgY = useCallback((e: MouseEvent | React.MouseEvent): number => {
    const rect = svgRef.current!.getBoundingClientRect()
    const scaleY = SZ / rect.height
    return (e.clientY - rect.top) * scaleY
  }, [])

  const onPointMouseDown = (e: React.MouseEvent, idx: number): void => {
    if (curve.type !== 'custom') return
    e.preventDefault()
    setDraggingIdx(idx)
  }

  useEffect(() => {
    if (draggingIdx === null) return
    const onMove = (e: MouseEvent): void => {
      const svgY = getSvgY(e)
      const newY = Math.round(fromSvgY(svgY))
      const pts = [...curve.points]
      // Clamp to neighbors to prevent crossing
      const minY = draggingIdx === 0 ? -100 : pts[draggingIdx - 1] - 1
      const maxY = draggingIdx === 8 ? 100 : pts[draggingIdx + 1] + 1
      pts[draggingIdx] = Math.max(minY, Math.min(maxY, newY))
      onChange({ ...curve, points: pts })
    }
    const onUp = (): void => setDraggingIdx(null)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [draggingIdx, curve, onChange, getSvgY])

  const switchToCustom = (): void => {
    // Sample current expo curve into 9 points
    const pts = POINT_X.map((x) => Math.round(applyExpo(x / 100, curve.expo) * 100))
    onChange({ ...curve, type: 'custom', points: pts })
  }

  const switchToExpo = (): void => {
    onChange({ ...curve, type: 'expo' })
  }

  const gridLines = [-100, -50, 0, 50, 100]

  return (
    <div className="space-y-3">
      {/* Mode toggle + presets */}
      <div className="flex items-center flex-wrap gap-2">
        <div className="flex rounded-lg overflow-hidden border border-[#334155]">
          <button
            onClick={switchToExpo}
            className={`px-3 py-1 text-xs font-medium transition-colors ${
              curve.type === 'expo' ? 'bg-[#243044] text-[#f1f5f9]' : 'text-[#94a3b8] hover:text-[#f1f5f9]'
            }`}
          >Expo</button>
          <button
            onClick={switchToCustom}
            className={`px-3 py-1 text-xs font-medium border-l border-[#334155] transition-colors ${
              curve.type === 'custom' ? 'bg-[#243044] text-[#f1f5f9]' : 'text-[#94a3b8] hover:text-[#f1f5f9]'
            }`}
          >Custom</button>
        </div>

        <div className="flex flex-wrap gap-1">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => onChange(p.curve)}
              className="px-2 py-1 text-[10px] rounded-md border border-[#334155] hover:border-[#3b82f6]
                text-[#94a3b8] hover:text-[#3b82f6] transition-all"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-4 items-start">
        {/* SVG Curve Canvas */}
        <div className="shrink-0" style={{ width: SZ, height: SZ }}>
          <svg
            ref={svgRef}
            width={SZ}
            height={SZ}
            className="rounded-xl border border-[#334155] bg-[#0f172a]"
            style={{ cursor: curve.type === 'custom' ? 'crosshair' : 'default', userSelect: 'none' }}
          >
            {/* Grid lines */}
            {gridLines.map((v) => (
              <g key={v}>
                <line x1={ix(v)} y1={PAD} x2={ix(v)} y2={SZ - PAD}
                  stroke={v === 0 ? '#334155' : '#1c2128'} strokeWidth={v === 0 ? 1.5 : 1} />
                <line x1={PAD} y1={iy(v)} x2={SZ - PAD} y2={iy(v)}
                  stroke={v === 0 ? '#334155' : '#1c2128'} strokeWidth={v === 0 ? 1.5 : 1} />
              </g>
            ))}

            {/* Grid labels */}
            {[-100, -50, 50, 100].map((v) => (
              <g key={`lbl-${v}`}>
                <text x={ix(v)} y={iy(0) + 12} textAnchor="middle"
                  fontSize="8" fill="#475569">{v > 0 ? `+${v}` : v}</text>
                <text x={PAD - 4} y={iy(v) + 3} textAnchor="end"
                  fontSize="8" fill="#475569">{v > 0 ? `+${v}` : v}</text>
              </g>
            ))}

            {/* Diagonal reference line */}
            <line x1={ix(-100)} y1={iy(-100)} x2={ix(100)} y2={iy(100)}
              stroke="#1c2128" strokeWidth={1} strokeDasharray="4,4" />

            {/* Curve */}
            <path
              d={curvePath()}
              fill="none"
              stroke={accentColor}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Glow under curve */}
            <path
              d={curvePath()}
              fill="none"
              stroke={accentColor}
              strokeWidth={6}
              strokeOpacity={0.12}
              strokeLinecap="round"
            />

            {/* Custom control points */}
            {curve.type === 'custom' && POINT_X.map((xv, idx) => {
              const yv = curve.points[idx]
              const hovered = hoveredIdx === idx
              const dragging = draggingIdx === idx
              return (
                <g key={idx}
                  onMouseDown={(e) => onPointMouseDown(e, idx)}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  style={{ cursor: 'ns-resize' }}
                >
                  {/* Hit area */}
                  <circle cx={ix(xv)} cy={iy(yv)} r={12} fill="transparent" />
                  {/* Visual point */}
                  <circle
                    cx={ix(xv)} cy={iy(yv)}
                    r={dragging ? 7 : hovered ? 6 : 4}
                    fill={dragging || hovered ? accentColor : '#1e293b'}
                    stroke={accentColor}
                    strokeWidth={2}
                  />
                  {/* Value label on hover/drag */}
                  {(hovered || dragging) && (
                    <text
                      x={ix(xv) + (xv > 50 ? -10 : 10)}
                      y={iy(yv) - 8}
                      textAnchor={xv > 50 ? 'end' : 'start'}
                      fontSize="9"
                      fill={accentColor}
                      fontWeight="bold"
                    >
                      {yv > 0 ? '+' : ''}{yv}
                    </text>
                  )}
                </g>
              )
            })}

            {/* Center crosshair dot */}
            <circle cx={ix(0)} cy={iy(0)} r={2.5} fill="#334155" />
          </svg>
        </div>

        {/* Expo slider (only in expo mode) */}
        {curve.type === 'expo' && (
          <div className="flex-1 space-y-3 pt-1">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[#94a3b8] text-xs font-semibold uppercase tracking-wider">Expo</span>
                <span className="font-mono text-sm font-bold" style={{ color: accentColor }}>
                  {curve.expo > 0 ? '+' : ''}{curve.expo}%
                </span>
              </div>
              <input
                type="range"
                min={-100}
                max={100}
                value={curve.expo}
                onChange={(e) => onChange({ ...curve, expo: Number(e.target.value) })}
                className="w-full accent-[#3b82f6]"
                style={{ accentColor }}
              />
              <div className="flex justify-between text-[10px] text-[#475569] mt-1">
                <span>−100 Sharp</span>
                <span>0 Linear</span>
                <span>+100 Soft</span>
              </div>
            </div>

            <div className="rounded-lg bg-[#0f172a] border border-[#334155] p-3 space-y-1 text-[10px] text-[#94a3b8]">
              <div className="text-[#f1f5f9] font-semibold text-[11px] mb-1">What expo does</div>
              {curve.expo === 0 && <div>Linear — every stick millimeter = same output.</div>}
              {curve.expo > 0 && curve.expo <= 30 && <div>Slight softening around center — good for sport.</div>}
              {curve.expo > 30 && curve.expo <= 55 && <div>Moderate soft center — comfortable for all-around flying.</div>}
              {curve.expo > 55 && <div>Heavy soft center — very forgiving for beginners or slow flight.</div>}
              {curve.expo < 0 && curve.expo >= -30 && <div>Slight sharpening — more direct response at center.</div>}
              {curve.expo < -30 && <div>Very direct center feel — good for 3D or precision sport.</div>}
              <div className="mt-1.5 pt-1.5 border-t border-[#243044]">
                Switch to <span className="text-[#f1f5f9]">Custom</span> to drag individual points
                or load an S-curve preset.
              </div>
            </div>
          </div>
        )}

        {/* Custom mode instructions */}
        {curve.type === 'custom' && (
          <div className="flex-1 space-y-3 pt-1">
            <div className="rounded-lg bg-[#0f172a] border border-[#334155] p-3 space-y-1 text-[10px] text-[#94a3b8]">
              <div className="text-[#f1f5f9] font-semibold text-[11px] mb-1">Custom curve — drag points</div>
              <div>Drag the 9 control points up or down to shape the curve.</div>
              <div>Center point (0,0) is locked to origin.</div>
              <div>An S-curve gives soft center AND soft extremes — good for scale flying.</div>
              <div>Inverse S gives soft mid-range, sharper center — sport use.</div>
            </div>

            {/* Point table */}
            <div className="rounded-lg border border-[#334155] overflow-hidden">
              <div className="grid text-[10px] text-[#94a3b8] px-3 py-1.5 border-b border-[#334155]"
                style={{ gridTemplateColumns: 'repeat(9, 1fr)' }}>
                {POINT_X.map((x) => <span key={x} className="text-center font-mono">{x}</span>)}
              </div>
              <div className="grid px-3 py-1.5" style={{ gridTemplateColumns: 'repeat(9, 1fr)' }}>
                {curve.points.map((y, i) => (
                  <input
                    key={i}
                    type="number"
                    min={-100}
                    max={100}
                    value={y}
                    onChange={(e) => {
                      const pts = [...curve.points]
                      pts[i] = Math.max(-100, Math.min(100, Number(e.target.value)))
                      onChange({ ...curve, points: pts })
                    }}
                    className="w-full bg-transparent text-center text-[10px] text-[#f1f5f9]
                      border-0 focus:outline-none font-mono"
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
