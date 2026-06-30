import { useState, useEffect } from 'react'
import { Section } from '../App'

interface SidebarProps {
  activeSection: Section
  onSectionChange: (section: Section) => void
}

interface NavItem {
  id: Section
  label: string
  icon: string
}

const navItems: NavItem[] = [
  { id: 'library', label: 'All Models', icon: '📋' },
  { id: 'active', label: 'Active', icon: '🟢' },
  { id: 'archived', label: 'Archived', icon: '📦' },
  { id: 'settings', label: 'Settings', icon: '⚙️' }
]

const radioItems: NavItem[] = [
  { id: 'radio', label: 'Radio Studio', icon: '📡' }
]

const isBrowser = typeof window !== 'undefined' && !(window as any).electron

function Sidebar({ activeSection, onSectionChange }: SidebarProps): JSX.Element {
  const [sdConnected, setSdConnected] = useState(false)
  const [sdDrive, setSdDrive] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)

  useEffect(() => {
    let cancelled = false

    const poll = async (): Promise<void> => {
      try {
        const result = await window.api.sdcard.detect()
        if (!cancelled) {
          setSdConnected(result.connected)
          setSdDrive(result.drivePath)
        }
      } catch {
        // SD card API unavailable — stay disconnected
      }
    }

    poll()
    const id = setInterval(poll, 3000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  const handleConnect = async (): Promise<void> => {
    if (connecting) return
    setConnecting(true)
    try {
      const ok = await (window.api.sdcard as any).connect()
      if (ok) {
        const result = await window.api.sdcard.detect()
        setSdConnected(result.connected)
        setSdDrive(result.drivePath)
        onSectionChange('radio')
      }
    } catch {
      // user cancelled picker
    } finally {
      setConnecting(false)
    }
  }

  return (
    <aside
      className="flex flex-col shrink-0 h-full border-r border-[#30363d] bg-[#0d1117]"
      style={{ width: 220 }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-[#30363d]">
        <div
          className="flex items-center justify-center w-9 h-9 rounded-lg text-white text-lg font-bold shrink-0"
          style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' }}
        >
          ✈
        </div>
        <div>
          <div className="text-[#e6edf3] font-bold text-[15px] leading-tight tracking-tight">
            FlightDeck
          </div>
          <div className="text-[#8b949e] text-[10px] uppercase tracking-widest">RC Manager</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="text-[#8b949e] text-[10px] font-semibold uppercase tracking-widest px-3 pb-2">
          Library
        </div>
        {navItems.map((item) => {
          const isActive = activeSection === item.id
          return (
            <button
              key={item.id}
              onClick={() => onSectionChange(item.id)}
              className={[
                'w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all duration-150 text-left',
                isActive
                  ? 'bg-[#21262d] text-[#e6edf3] border-l-2 border-[#2563eb]'
                  : 'text-[#8b949e] hover:bg-[#21262d] hover:text-[#e6edf3] border-l-2 border-transparent'
              ].join(' ')}
            >
              <span className="text-base leading-none">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          )
        })}

        <div className="text-[#8b949e] text-[10px] font-semibold uppercase tracking-widest px-3 pt-4 pb-2">
          Radio
        </div>
        {radioItems.map((item) => {
          const isActive = activeSection === item.id
          return (
            <button
              key={item.id}
              onClick={() => onSectionChange(item.id)}
              className={[
                'w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all duration-150 text-left',
                isActive
                  ? 'bg-[#21262d] text-[#e6edf3] border-l-2 border-[#2563eb]'
                  : 'text-[#8b949e] hover:bg-[#21262d] hover:text-[#e6edf3] border-l-2 border-transparent'
              ].join(' ')}
            >
              <span className="text-base leading-none">{item.icon}</span>
              <span>{item.label}</span>
              {sdConnected && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#3fb950] shrink-0"
                  style={{ boxShadow: '0 0 5px #3fb950' }} />
              )}
            </button>
          )
        })}
      </nav>

      {/* SD Card Status */}
      <div className="px-4 py-3 border-t border-[#30363d]">
        {sdConnected ? (
          <div className="flex items-center gap-2.5">
            <span
              className="w-2 h-2 rounded-full shrink-0 bg-[#3fb950]"
              style={{ boxShadow: '0 0 6px #3fb950' }}
            />
            <div className="min-w-0">
              <div className="text-[#3fb950] text-[11px] font-semibold leading-tight">Radio Connected</div>
              <div className="text-[#8b949e] text-[10px] leading-tight truncate">{sdDrive ?? 'SD Card'}</div>
            </div>
          </div>
        ) : isBrowser ? (
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-[12px] font-semibold text-white transition-all duration-150 disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' }}
          >
            <span className="text-base leading-none">📡</span>
            {connecting ? 'Connecting…' : 'Connect Radio'}
          </button>
        ) : (
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full shrink-0 bg-[#484f58]" />
            <div className="text-[#484f58] text-[11px] font-medium">No Radio</div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-[#30363d]">
        <div className="text-[#8b949e] text-[11px]">v0.1.0</div>
      </div>
    </aside>
  )
}

export default Sidebar
