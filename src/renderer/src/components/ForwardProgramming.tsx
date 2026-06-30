import { useState, useEffect } from 'react'
import { RCModel } from './ModelCard'

interface ForwardProgrammingProps {
  model: RCModel
  onSave: (updates: Partial<RCModel>) => Promise<void>
}

type GainKey = 'roll_gain' | 'pitch_gain' | 'yaw_gain'
type ChannelKey = 'ch1_function' | 'ch2_function' | 'ch3_function' | 'ch4_function' | 'ch5_function' | 'ch6_function'

const CHANNEL_FUNCTIONS = ['Aileron', 'Elevator', 'Throttle', 'Rudder', 'SAFE Select', 'Gain Knob', 'Flaps', 'Gear', 'None']

const GAIN_CONFIG: { key: GainKey; label: string }[] = [
  { key: 'roll_gain',  label: 'Roll' },
  { key: 'pitch_gain', label: 'Pitch' },
  { key: 'yaw_gain',   label: 'Yaw' }
]

const CHANNEL_CONFIG: { key: ChannelKey; label: string }[] = [
  { key: 'ch1_function', label: 'CH 1' },
  { key: 'ch2_function', label: 'CH 2' },
  { key: 'ch3_function', label: 'CH 3' },
  { key: 'ch4_function', label: 'CH 4' },
  { key: 'ch5_function', label: 'CH 5' },
  { key: 'ch6_function', label: 'CH 6' }
]

function gainColor(val: number): string {
  if (val <= 40) return '#22c55e'
  if (val <= 70) return '#d29922'
  return '#f85149'
}

function gainBg(val: number): string {
  if (val <= 40) return '#22c55e20'
  if (val <= 70) return '#d2992220'
  return '#f8514920'
}

interface FormData {
  roll_gain: number
  pitch_gain: number
  yaw_gain: number
  safe_enabled: number
  ch1_function: string
  ch2_function: string
  ch3_function: string
  ch4_function: string
  ch5_function: string
  ch6_function: string
  frame_rate: string
}

function ForwardProgramming({ model, onSave }: ForwardProgrammingProps): JSX.Element {
  const [formData, setFormData] = useState<FormData>({
    roll_gain:    model.roll_gain   ?? 0,
    pitch_gain:   model.pitch_gain  ?? 0,
    yaw_gain:     model.yaw_gain    ?? 0,
    safe_enabled: model.safe_enabled ?? 0,
    ch1_function: model.ch1_function ?? 'Aileron',
    ch2_function: model.ch2_function ?? 'Elevator',
    ch3_function: model.ch3_function ?? 'Throttle',
    ch4_function: model.ch4_function ?? 'Rudder',
    ch5_function: model.ch5_function ?? 'SAFE Select',
    ch6_function: model.ch6_function ?? '',
    frame_rate:   model.frame_rate   ?? '22ms'
  })

  const [saving, setSaving] = useState(false)
  const [writingToCard, setWritingToCard] = useState(false)
  const [writingScript, setWritingScript] = useState(false)
  const [toast, setToast] = useState<{ message: string; ok: boolean } | null>(null)
  const [sdDrive, setSdDrive] = useState<string | null>(null)

  // Sync form if model prop changes (e.g. after parent refreshes)
  useEffect(() => {
    setFormData({
      roll_gain:    model.roll_gain   ?? 0,
      pitch_gain:   model.pitch_gain  ?? 0,
      yaw_gain:     model.yaw_gain    ?? 0,
      safe_enabled: model.safe_enabled ?? 0,
      ch1_function: model.ch1_function ?? 'Aileron',
      ch2_function: model.ch2_function ?? 'Elevator',
      ch3_function: model.ch3_function ?? 'Throttle',
      ch4_function: model.ch4_function ?? 'Rudder',
      ch5_function: model.ch5_function ?? 'SAFE Select',
      ch6_function: model.ch6_function ?? '',
      frame_rate:   model.frame_rate   ?? '22ms'
    })
  }, [model.id])

  // Poll for SD card every 3 seconds (same as Sidebar)
  useEffect(() => {
    const check = (): void => {
      window.api.sdcard.detect()
        .then((res) => setSdDrive(res.connected ? res.drivePath : null))
        .catch(() => setSdDrive(null))
    }
    check()
    const interval = setInterval(check, 3000)
    return () => clearInterval(interval)
  }, [])

  const showToast = (message: string, ok: boolean): void => {
    setToast({ message, ok })
    setTimeout(() => setToast(null), 2500)
  }

  const buildConfig = (): object => ({
    model: model.name,
    roll_gain:   formData.roll_gain,
    pitch_gain:  formData.pitch_gain,
    yaw_gain:    formData.yaw_gain,
    safe_enabled: formData.safe_enabled === 1,
    frame_rate:  formData.frame_rate,
    channels: {
      ch1: formData.ch1_function,
      ch2: formData.ch2_function,
      ch3: formData.ch3_function,
      ch4: formData.ch4_function,
      ch5: formData.ch5_function,
      ch6: formData.ch6_function
    }
  })

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    try {
      await onSave(formData)
      // If SD card is connected, auto-write after save
      if (sdDrive) {
        const result = await window.api.sdcard.writeConfig(sdDrive, model.name, buildConfig())
        if (result.success) {
          showToast('Saved + written to radio', true)
        } else {
          showToast('Saved to DB (SD write failed)', false)
        }
      } else {
        showToast('Configuration saved', true)
      }
    } catch {
      showToast('Save failed — please try again', false)
    } finally {
      setSaving(false)
    }
  }

  const handleWriteToRadio = async (): Promise<void> => {
    if (!sdDrive) return
    setWritingToCard(true)
    try {
      const result = await window.api.sdcard.writeConfig(sdDrive, model.name, buildConfig())
      if (result.success) {
        showToast('Written to radio', true)
      } else {
        showToast('Write failed: ' + (result.error ?? 'unknown error'), false)
      }
    } catch {
      showToast('Write failed — check SD card', false)
    } finally {
      setWritingToCard(false)
    }
  }

  const setGain = (key: GainKey, val: number): void => {
    setFormData((prev) => ({ ...prev, [key]: Math.max(0, Math.min(100, val)) }))
  }

  const anyGainHigh = formData.roll_gain > 75 || formData.pitch_gain > 75 || formData.yaw_gain > 75

  const selectClass =
    'bg-[#0f172a] border border-[#334155] rounded-lg px-3 py-2 text-[#f1f5f9] text-sm focus:outline-none focus:border-[#3b82f6] transition-colors'
  const labelClass = 'text-[#94a3b8] text-[12px] font-semibold uppercase tracking-wider'

  return (
    <div className="space-y-6">
      <style>{`
        .fp-slider {
          -webkit-appearance: none;
          appearance: none;
          height: 6px;
          border-radius: 3px;
          outline: none;
          cursor: pointer;
          flex: 1;
        }
        .fp-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
          border: 2px solid #2563eb;
          box-shadow: 0 1px 4px rgba(0,0,0,0.5);
        }
        .fp-slider::-webkit-slider-thumb:hover {
          background: #3b82f6;
        }
      `}</style>

      {/* AS3X Gains */}
      <div className="bg-[#1e293b] rounded-xl border border-[#334155] p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-[#f1f5f9] font-semibold text-[14px]">AS3X Gains</h3>
            <p className="text-[#94a3b8] text-[12px] mt-0.5">Stabilization sensitivity per axis</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={labelClass}>Frame Rate</span>
            <select
              value={formData.frame_rate}
              onChange={(e) => setFormData((prev) => ({ ...prev, frame_rate: e.target.value }))}
              className={selectClass}
            >
              <option value="22ms">22ms (Analog / Mixed)</option>
              <option value="11ms">11ms (Digital Only)</option>
            </select>
          </div>
        </div>

        {formData.frame_rate === '11ms' && (
          <div className="mb-4 flex items-start gap-2.5 bg-[#d2992218] border border-[#d2992240] rounded-lg px-3.5 py-2.5">
            <span className="text-[#d29922] text-sm mt-0.5">⚠</span>
            <p className="text-[#d29922] text-[12px] leading-relaxed">
              <strong>11ms mode requires all-digital servos.</strong> Using analog or mixed servos at 11ms will damage them.
            </p>
          </div>
        )}

        {/* Quick-start suggested values */}
        <div className="mb-4 flex items-center gap-3 p-3 bg-[#0f172a] rounded-lg border border-[#334155]">
          <div className="flex-1">
            <p className="text-[#94a3b8] text-[12px]">
              <span className="text-[#f1f5f9] font-medium">Not sure where to start?</span>
              {' '}Conservative gains for a sport/warbird — adjust after first flight.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setFormData(prev => ({ ...prev, roll_gain: 30, pitch_gain: 28, yaw_gain: 22 }))}
            className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#3b82f620] text-[#60a5fa] border border-[#3b82f640] hover:bg-[#3b82f630] transition-colors whitespace-nowrap"
          >
            Use 30 / 28 / 22
          </button>
        </div>

        <div className="space-y-4">
          {GAIN_CONFIG.map(({ key, label }) => {
            const val = formData[key]
            const color = gainColor(val)
            const bg = gainBg(val)
            const pct = val
            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[#f1f5f9] text-sm font-medium w-12">{label}</span>
                  <div className="flex items-center gap-3 flex-1 ml-4">
                    <div className="relative flex-1" style={{ height: 44 }}>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={val}
                        onChange={(e) => setGain(key, parseInt(e.target.value))}
                        className="fp-slider absolute inset-x-0"
                        style={{
                          top: 11,
                          background: `linear-gradient(to right, ${color} ${pct}%, #243044 ${pct}%)`
                        }}
                      />
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={val}
                      onChange={(e) => setGain(key, parseInt(e.target.value) || 0)}
                      className="w-16 bg-[#0f172a] border border-[#334155] rounded-lg px-2 py-1.5 text-[#f1f5f9] text-sm text-center focus:outline-none focus:border-[#3b82f6] transition-colors"
                    />
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                      style={{ background: bg, color }}
                    >
                      {val <= 40 ? '✓' : val <= 70 ? '~' : '!'}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {anyGainHigh && (
          <div className="mt-4 flex items-start gap-2.5 bg-[#f8514918] border border-[#f8514940] rounded-lg px-3.5 py-2.5">
            <span className="text-[#f85149] text-sm mt-0.5">⚠</span>
            <p className="text-[#f85149] text-[12px] leading-relaxed">
              <strong>High gain detected.</strong> Values above 75 may cause oscillation. Test in a controlled environment with caution.
            </p>
          </div>
        )}
      </div>

      {/* SAFE Select — full guided setup */}
      <div className="bg-[#1e293b] rounded-xl border border-[#334155] p-5 space-y-4">
        <div>
          <h3 className="text-[#f1f5f9] font-semibold text-[14px]">SAFE Select — Switch SB</h3>
          <p className="text-[#94a3b8] text-[12px] mt-0.5">
            Toggle beginner mode on/off from the field using Switch SB
          </p>
        </div>

        {/* What each mode does */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-[#16a34a40] bg-[#16a34a0c] p-3">
            <div className="text-[#22c55e] text-[11px] font-bold uppercase tracking-wider mb-1">SB UP → SAFE ON</div>
            <p className="text-[#c9d1d9] text-[12px] leading-relaxed">
              Plane self-levels when you let go of the sticks. Bank and pitch angles are limited.
              Good for takeoff, landing, or if things go wrong.
            </p>
          </div>
          <div className="rounded-xl border border-[#3b82f640] bg-[#3b82f60c] p-3">
            <div className="text-[#60a5fa] text-[11px] font-bold uppercase tracking-wider mb-1">SB DOWN → SAFE OFF</div>
            <p className="text-[#c9d1d9] text-[12px] leading-relaxed">
              AS3X only — gyro smooths wind and vibration but no angle limits.
              Full pilot control.
            </p>
          </div>
        </div>

        {/* Steps to assign SB in EdgeTX */}
        <div className="bg-[#0f172a] rounded-xl border border-[#334155] p-4">
          <div className="text-[#94a3b8] text-[11px] font-semibold uppercase tracking-wider mb-3">
            On Your RadioMaster — assign SB to CH5
          </div>
          <ol className="space-y-2">
            {[
              'Open your Gee Bee model on the TX16S',
              'Go to MIXES (the channel mixer screen)',
              'Find Channel 5 (CH5 — SAFE Select)',
              'Press Enter on CH5 → change Source to SB',
              'Set Weight to 100 → save',
              'Test: SB up = SAFE ON (LED may change on receiver), SB down = SAFE OFF',
              'If it\'s backwards, change Weight to -100 to flip it',
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="shrink-0 w-5 h-5 rounded-full bg-[#243044] border border-[#334155] flex items-center justify-center text-[10px] font-bold text-[#94a3b8] mt-0.5">
                  {i + 1}
                </span>
                <span className="text-[#c9d1d9] text-[12px] leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* SAFE enabled toggle — records that SAFE is configured on this model */}
        <div className="flex items-center justify-between pt-1">
          <div>
            <p className="text-[#f1f5f9] text-sm font-medium">Mark SAFE as configured</p>
            <p className="text-[#94a3b8] text-[12px] mt-0.5">Records that SB/CH5 SAFE is set up on this model</p>
          </div>
          <button
            type="button"
            onClick={() => setFormData((prev) => ({ ...prev, safe_enabled: prev.safe_enabled === 1 ? 0 : 1 }))}
            className={[
              'relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0 focus:outline-none',
              formData.safe_enabled === 1 ? 'bg-[#16a34a]' : 'bg-[#374151]'
            ].join(' ')}
            role="switch"
            aria-checked={formData.safe_enabled === 1}
          >
            <span
              className={[
                'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200',
                formData.safe_enabled === 1 ? 'translate-x-5' : 'translate-x-0'
              ].join(' ')}
            />
          </button>
        </div>
      </div>

      {/* Reverse Thrust — Switch SF */}
      <div className="bg-[#1e293b] rounded-xl border border-[#334155] p-5 space-y-4">
        <div>
          <h3 className="text-[#f1f5f9] font-semibold text-[14px]">Reverse Thrust — Switch SF</h3>
          <p className="text-[#94a3b8] text-[12px] mt-0.5">
            Motor runs backward when SF is activated — useful for slowing down on the ground
          </p>
        </div>

        <div className="bg-[#d2992218] border border-[#d2992240] rounded-xl px-4 py-3">
          <div className="text-[#d29922] text-[11px] font-bold uppercase tracking-wider mb-1">ESC Requirement</div>
          <p className="text-[#f1f5f9] text-[12px] leading-relaxed">
            Reverse thrust requires a <strong>bidirectional ESC</strong> — the stock E-flite 40A does not support it.
            You need a Castle Creations Talon/Mamba, Hobbywing Platinum with reverse, or similar.
          </p>
        </div>

        <div className="bg-[#0f172a] rounded-xl border border-[#334155] p-4">
          <div className="text-[#94a3b8] text-[11px] font-semibold uppercase tracking-wider mb-3">
            If your ESC supports reverse — set up SF in EdgeTX
          </div>
          <ol className="space-y-2">
            {[
              'Go to MIXES on your TX16S → find CH3 (Throttle)',
              'Long-press CH3 to add a second mix line below it',
              'Set: Source = THR, Weight = -100, Switch = SF↓ (SF in down position)',
              'Now when SF is UP: normal throttle. SF DOWN: stick forward = reverse',
              'Also program your ESC for bidirectional / reverse mode (via ESC\'s program card or USB tool)',
              'Test on the ground — verify forward thrust stops before reverse kicks in',
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="shrink-0 w-5 h-5 rounded-full bg-[#243044] border border-[#334155] flex items-center justify-center text-[10px] font-bold text-[#94a3b8] mt-0.5">
                  {i + 1}
                </span>
                <span className="text-[#c9d1d9] text-[12px] leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Write Setup Script to Radio */}
      <div className="bg-[#1e293b] rounded-xl border border-[#3b82f630] p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
            style={{ background: '#3b82f618', border: '1px solid #3b82f640' }}
          >
            📡
          </div>
          <div>
            <h3 className="text-[#f1f5f9] font-semibold text-[14px]">Write Setup Script to Radio</h3>
            <p className="text-[#94a3b8] text-[12px] mt-0.5">
              Plug in your TX16S, select USB Storage on the radio, then click below.
              FlightDeck writes a script that configures SB for SAFE Select automatically.
            </p>
          </div>
        </div>

        {/* Step list */}
        <div className="bg-[#0f172a] rounded-xl border border-[#334155] p-4 space-y-2">
          {[
            'Plug USB-C into your TX16S (top port)',
            'On the radio: select USB Storage when prompted',
            'Click "Write Script to Radio" below — done in 1 second',
            'Unplug the radio',
            'On the radio: go to TOOLS → run FDSETUP',
            'Script runs, wires up SB, exits — you\'re done forever',
          ].map((step, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span className="shrink-0 w-5 h-5 rounded-full bg-[#3b82f618] border border-[#3b82f640] flex items-center justify-center text-[10px] font-bold text-[#60a5fa] mt-0.5">
                {i + 1}
              </span>
              <span className="text-[#c9d1d9] text-[12px] leading-relaxed">{step}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={async () => {
              if (!sdDrive) return
              setWritingScript(true)
              try {
                const result = await window.api.edgetx.writeSetupScript(sdDrive, model.name)
                if (result.success) {
                  showToast('Script written — run FDSETUP from radio TOOLS', true)
                } else {
                  showToast('Write failed: ' + (result.error ?? 'unknown'), false)
                }
              } catch {
                showToast('Write failed — check radio is in USB Storage mode', false)
              } finally {
                setWritingScript(false)
              }
            }}
            disabled={!sdDrive || writingScript}
            className={[
              'flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors',
              sdDrive
                ? 'bg-[#3b82f6] hover:bg-[#2563eb] text-white'
                : 'bg-[#243044] text-[#475569] border border-[#334155] cursor-not-allowed'
            ].join(' ')}
          >
            {writingScript ? 'Writing...' : sdDrive ? `Write Script to Radio (${sdDrive})` : 'No Radio Detected'}
          </button>
          {!sdDrive && (
            <span className="text-[#475569] text-[12px]">
              Plug in TX16S and select USB Storage
            </span>
          )}
        </div>
      </div>

      {/* Channel Assignment */}
      <div className="bg-[#1e293b] rounded-xl border border-[#334155] p-5">
        <h3 className="text-[#f1f5f9] font-semibold text-[14px] mb-1">Channel Assignment</h3>
        <p className="text-[#94a3b8] text-[12px] mb-4">Map receiver channels to control functions</p>

        <div className="space-y-2.5">
          {CHANNEL_CONFIG.map(({ key, label }) => (
            <div key={key} className="flex items-center gap-4">
              <span className="text-[#94a3b8] text-[12px] font-semibold uppercase tracking-wider w-10 shrink-0">
                {label}
              </span>
              <select
                value={formData[key]}
                onChange={(e) => setFormData((prev) => ({ ...prev, [key]: e.target.value }))}
                className={`${selectClass} flex-1`}
              >
                <option value="">— Unassigned —</option>
                {CHANNEL_FUNCTIONS.map((fn) => (
                  <option key={fn} value={fn}>{fn}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* Save buttons */}
      <div className="flex items-center gap-3 pt-1 pb-6">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-50 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
        >
          {saving ? (
            <span className="opacity-75">Saving...</span>
          ) : (
            <>
              <span>💾</span>
              Save Configuration
            </>
          )}
        </button>

        <button
          onClick={handleWriteToRadio}
          disabled={!sdDrive || writingToCard}
          className={[
            'flex items-center gap-2 text-sm font-medium px-5 py-2.5 rounded-lg transition-colors border',
            sdDrive
              ? 'bg-[#243044] hover:bg-[#334155] text-[#f1f5f9] border-[#334155] hover:border-[#475569]'
              : 'bg-[#1e293b] text-[#475569] border-[#334155] cursor-not-allowed'
          ].join(' ')}
          title={sdDrive ? `Write to ${sdDrive}` : 'No radio connected'}
        >
          {writingToCard ? (
            <span className="opacity-75">Writing...</span>
          ) : (
            <>
              <span>📡</span>
              Write to Radio
            </>
          )}
        </button>

        {!sdDrive && (
          <span className="text-[#475569] text-[12px]">No radio detected</span>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={[
            'fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-2xl border text-sm font-medium transition-all',
            toast.ok
              ? 'bg-[#16a34a] border-[#16a34a80] text-white'
              : 'bg-[#b91c1c] border-[#b91c1c80] text-white'
          ].join(' ')}
        >
          <span>{toast.ok ? '✓' : '✗'}</span>
          {toast.message}
        </div>
      )}
    </div>
  )
}

export default ForwardProgramming
