import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

interface TipProps {
  text: string
  width?: number  // px, default 220
  side?: 'top' | 'bottom' | 'left' | 'right'
}

export default function Tip({ text, width = 220, side = 'top' }: TipProps): JSX.Element {
  const [visible, setVisible] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const ref = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!visible || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    const pad = 8

    let top = 0, left = 0
    if (side === 'top' || side === 'bottom') {
      left = r.left + r.width / 2 - width / 2
      // Clamp horizontally so it never goes off screen
      left = Math.max(pad, Math.min(left, window.innerWidth - width - pad))
      top = side === 'top' ? r.top - 8 : r.bottom + 8
    } else {
      top = r.top + r.height / 2
      left = side === 'left' ? r.left - width - 8 : r.right + 8
    }
    setPos({ top, left })
  }, [visible, side, width])

  return (
    <span className="relative inline-flex items-center">
      <button
        ref={ref}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        type="button"
        className="w-3.5 h-3.5 rounded-full flex items-center justify-center
          bg-[#21262d] border border-[#30363d] text-[#484f58]
          hover:border-[#2563eb] hover:text-[#2563eb]
          transition-colors cursor-help text-[9px] font-bold leading-none shrink-0"
        tabIndex={-1}
        aria-label="Help"
      >
        ?
      </button>

      {visible && createPortal(
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{
            top: side === 'top' ? pos.top - 4 : pos.top,
            left: pos.left,
            transform: side === 'top' ? 'translateY(-100%)' : side === 'bottom' ? 'none' : 'translateY(-50%)',
          }}
        >
          <div
            className="rounded-xl border border-[#30363d] bg-[#161b22] shadow-2xl p-3
              text-[11px] text-[#e6edf3] leading-relaxed"
            style={{ width }}
          >
            {text}
            {/* Arrow */}
            {side === 'top' && (
              <div className="absolute top-full"
                style={{ left: Math.min(Math.max(ref.current!.getBoundingClientRect().left + ref.current!.getBoundingClientRect().width / 2 - pos.left - 5, 8), width - 18) }}>
                <div className="border-4 border-transparent border-t-[#30363d]" />
              </div>
            )}
            {side === 'bottom' && (
              <div className="absolute bottom-full"
                style={{ left: Math.min(Math.max(ref.current!.getBoundingClientRect().left + ref.current!.getBoundingClientRect().width / 2 - pos.left - 5, 8), width - 18) }}>
                <div className="border-4 border-transparent border-b-[#30363d]" />
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </span>
  )
}
