import { useState } from 'react'
import { RadioDiagram, ControlPicker } from './SwitchPicker'

// ─── Types ────────────────────────────────────────────────────────────────────

interface RateSet {
  high: number
  mid: number
  low: number
}

interface WizardRates {
  ail: RateSet
  ele: RateSet
  rud: RateSet
}

export interface RatesWizardResult {
  rates: WizardRates
  switchId: string
  reversed: boolean
}

interface Props {
  onComplete: (result: RatesWizardResult) => void
  onSkip: () => void
}

// ─── Safe conservative defaults ───────────────────────────────────────────────

const SAFE_DEFAULTS: WizardRates = {
  ail: { high: 75, mid: 55, low: 35 },
  ele: { high: 70, mid: 50, low: 35 },
  rud: { high: 65, mid: 50, low: 35 },
}

const SURFACES: { key: keyof WizardRates; label: string; desc: string }[] = [
  { key: 'ail', label: 'AILERON', desc: 'Controls roll — tipping left and right' },
  { key: 'ele', label: 'ELEVATOR', desc: 'Controls pitch — nose up and down' },
  { key: 'rud', label: 'RUDDER', desc: 'Controls yaw — nose swings left and right' },
]

// ─── Switch position diagram ──────────────────────────────────────────────────

function SwitchDiagram({ switchId }: { switchId: string }): JSX.Element {
  return (
    <svg viewBox="0 0 160 220" className="w-28 sm:w-28 mx-auto sm:mx-0 shrink-0">
      {/* Label top */}
      <text x="80" y="16" textAnchor="middle" fill="#f1f5f9" fontSize="13" fontWeight="bold">{switchId}</text>

      {/* Rail */}
      <line x1="80" y1="30" x2="80" y2="195" stroke="#334155" strokeWidth="4" strokeLinecap="round" />

      {/* HIGH position */}
      <rect x="52" y="28" width="56" height="22" rx="5" fill="#22c55e" />
      <text x="80" y="43" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">HIGH</text>
      <text x="96" y="43" fill="#86efac" fontSize="9">  ←  toward you</text>

      {/* Connector line high→mid */}
      <line x1="80" y1="50" x2="80" y2="88" stroke="#334155" strokeWidth="2" strokeDasharray="3,3" />

      {/* MID position */}
      <rect x="52" y="88" width="56" height="22" rx="5" fill="#f59e0b" />
      <text x="80" y="103" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">MID</text>
      <text x="96" y="103" fill="#fcd34d" fontSize="9">  ←  middle</text>

      {/* Connector line mid→low */}
      <line x1="80" y1="110" x2="80" y2="148" stroke="#334155" strokeWidth="2" strokeDasharray="3,3" />

      {/* LOW position */}
      <rect x="52" y="148" width="56" height="22" rx="5" fill="#64748b" />
      <text x="80" y="163" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">LOW</text>
      <text x="96" y="163" fill="#94a3b8" fontSize="9">  ←  away from you</text>

      {/* Arrow down */}
      <text x="80" y="200" textAnchor="middle" fill="#475569" fontSize="9">↓ away from you</text>
    </svg>
  )
}

// ─── Rate slider row ──────────────────────────────────────────────────────────

function RateSlider({
  label,
  color,
  value,
  onChange,
  warning,
}: {
  label: string
  color: string
  value: number
  onChange: (v: number) => void
  warning?: boolean
}): JSX.Element {
  return (
    <div className="flex items-center gap-3">
      <span className={`text-xs font-bold w-10 shrink-0 ${color}`}>{label}</span>
      <div className="flex-1 relative">
        <input
          type="range"
          min={10}
          max={100}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full accent-[#3b82f6]"
          style={{ minHeight: 36 }}
        />
      </div>
      <span className={`text-sm font-bold w-10 text-right shrink-0 ${warning ? 'text-amber-400' : 'text-[#f1f5f9]'}`}>
        {value}%
      </span>
    </div>
  )
}

// ─── Screen A — Select switch ─────────────────────────────────────────────────

function ScreenSwitch({
  selected,
  onSelect,
  reversed,
  onReverse,
  onContinue,
  onSkip,
}: {
  selected: string
  onSelect: (sw: string) => void
  reversed: boolean
  onReverse: (v: boolean) => void
  onContinue: () => void
  onSkip: () => void
}): JSX.Element {
  return (
    <div className="flex flex-col gap-4 sm:gap-6 p-4 sm:p-6 max-w-lg mx-auto w-full">
      <div>
        <p className="text-[#94a3b8] text-xs font-bold uppercase tracking-widest mb-1">Step 1 of 3 — Rates Setup</p>
        <h1 className="text-[#f1f5f9] text-lg sm:text-xl font-bold leading-snug">
          First, pick the switch you will use to change rates.
        </h1>
      </div>

      <p className="text-[#94a3b8] text-sm">
        Pick the control you want to use for switching between rates. Tap it below.
      </p>

      <ControlPicker selected={selected} onSelect={onSelect} />

      {/* Reverse toggle */}
      <div className="flex flex-wrap items-center justify-center gap-3 py-1">
        <span className={`text-xs ${!reversed ? 'text-[#f1f5f9] font-semibold' : 'text-[#475569]'}`}>
          Normal
        </span>
        <button
          onClick={() => onReverse(!reversed)}
          aria-label="Reverse switch direction"
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
            reversed ? 'bg-amber-500' : 'bg-[#334155]'
          }`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            reversed ? 'translate-x-6' : 'translate-x-1'
          }`} />
        </button>
        <span className={`text-xs ${reversed ? 'text-amber-300 font-semibold' : 'text-[#475569]'}`}>
          Reversed
        </span>
        {reversed && (
          <span className="text-[10px] text-amber-400 border border-amber-900 bg-amber-950/50 px-2 py-0.5 rounded-full">
            away from you = HIGH
          </span>
        )}
      </div>

      <div>
        <p className="text-[#475569] text-xs text-center mb-1">Reference — yellow = your selection</p>
        <RadioDiagram selected={selected} onSelect={onSelect} />
      </div>

      <div className="bg-[#0f172a] border border-[#334155] rounded-xl px-4 py-3 flex items-start gap-3">
        <span className="text-amber-400 text-lg shrink-0">★</span>
        <p className="text-[#94a3b8] text-sm">
          <span className="text-[#f1f5f9] font-semibold">Recommendation: use SA.</span>{' '}
          It is the industry standard for rate switching. Most online tutorials, YouTube videos,
          and other pilots use SA. If you ever ask for help, people will assume SA.
        </p>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onContinue}
          disabled={!selected}
          className={`flex-1 py-3 font-bold rounded-xl text-sm transition-colors ${
            selected
              ? 'bg-[#2563eb] hover:bg-[#1d4ed8] text-white'
              : 'bg-[#1e293b] text-[#475569] cursor-not-allowed'
          }`}
        >
          {selected ? `Using ${selected} — Show me how it works` : '← Pick a switch above'}
        </button>
        <button
          onClick={onSkip}
          className="px-4 py-3 text-[#475569] hover:text-[#94a3b8] text-sm transition-colors"
        >
          Skip rates
        </button>
      </div>
    </div>
  )
}

// ─── Screen B — Explain positions + verification ──────────────────────────────

function ScreenExplain({
  switchId,
  reversed,
  onBack,
  onContinue,
}: {
  switchId: string
  reversed: boolean
  onBack: () => void
  onContinue: () => void
}): JSX.Element {
  const high = reversed ? 'away from you' : 'toward you'
  const low  = reversed ? 'toward you'    : 'away from you'
  return (
    <div className="flex flex-col gap-4 sm:gap-6 p-4 sm:p-6 max-w-lg mx-auto w-full">
      <div>
        <button onClick={onBack} className="text-[#475569] hover:text-[#94a3b8] text-xs mb-3 flex items-center gap-1">
          ← Back
        </button>
        <p className="text-[#94a3b8] text-xs font-bold uppercase tracking-widest mb-1">Step 2 of 3 — Rates Setup</p>
        <h1 className="text-[#f1f5f9] text-lg sm:text-xl font-bold leading-snug">
          Here is exactly what switch {switchId} will do.
        </h1>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 items-start">
        <SwitchDiagram switchId={switchId} />

        <div className="flex-1 space-y-4 text-sm">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#22c55e] shrink-0" />
              <span className="text-[#f1f5f9] font-bold">HIGH — {high}</span>
            </div>
            <p className="text-[#94a3b8] pl-5">
              Big, fast movements. Use for aerobatics, windy conditions, or when you need the plane to respond quickly.
              Most pilots rarely fly on high rates — it is there when you need it.
            </p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#f59e0b] shrink-0" />
              <span className="text-[#f1f5f9] font-bold">MID — middle click</span>
            </div>
            <p className="text-[#94a3b8] pl-5">
              Normal everyday flying. Responsive but not twitchy.
              Most of your flying will happen here once you are comfortable.
            </p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#64748b] shrink-0" />
              <span className="text-[#f1f5f9] font-bold">LOW — {low}</span>
            </div>
            <p className="text-[#94a3b8] pl-5">
              Small, gentle movements. Start every flight here until you
              know how your plane handles. Great for landing and flying far away.
            </p>
          </div>
        </div>
      </div>

      {/* Verification steps */}
      <div className="bg-[#1e293b] rounded-xl border border-[#334155] p-4 space-y-3">
        <h2 className="text-[#f1f5f9] text-sm font-bold">
          How to verify it worked after you bind your plane
        </h2>
        <p className="text-[#94a3b8] text-xs">
          After loading these settings onto your radio and binding your plane, hold the plane in your
          hands (keep it pointed away from you) and do this test:
        </p>
        <div className="space-y-2">
          {[
            ['1', '#64748b', 'LOW',  `Flip ${switchId} all the way ${low.toUpperCase()}. Move the aileron stick to the right as far as it goes. Watch the aileron on the wing. It should move only a small amount.`],
            ['2', '#f59e0b', 'MID',  `Flip ${switchId} to the MIDDLE click. Move the stick to the right again. The aileron should now move noticeably more than before.`],
            ['3', '#22c55e', 'HIGH', `Flip ${switchId} ${high.toUpperCase()}. Move the stick to the right again. The aileron should now move the most of all three.`],
          ].map(([n, color, label, text]) => (
            <div key={n} className="flex gap-3">
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 mt-0.5" style={{ background: color }}>
                {n}
              </span>
              <p className="text-[#cbd5e1] text-xs">
                <span className="font-bold text-[#f1f5f9]">{label}: </span>{text}
              </p>
            </div>
          ))}
        </div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-xs text-red-300">
          If all three positions move the aileron the same amount, the rates did not load correctly.
          Go back to the Export tab and write the file to your radio again.
        </div>
      </div>

      <button
        onClick={onContinue}
        className="w-full py-3 bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-bold rounded-xl text-sm transition-colors"
      >
        Got it — Set my rate values now
      </button>
    </div>
  )
}

// ─── Screen C — Rate sliders ──────────────────────────────────────────────────

function ScreenSliders({
  switchId,
  rates,
  onRate,
  onBack,
  onComplete,
}: {
  switchId: string
  rates: WizardRates
  onRate: (surface: keyof WizardRates, level: keyof RateSet, value: number) => void
  onBack: () => void
  onComplete: () => void
}): JSX.Element {
  const highWarning = (v: number): boolean => v > 80

  return (
    <div className="flex flex-col gap-4 sm:gap-5 p-4 sm:p-6 max-w-lg mx-auto w-full">
      <div>
        <button onClick={onBack} className="text-[#475569] hover:text-[#94a3b8] text-xs mb-3 flex items-center gap-1">
          ← Back
        </button>
        <p className="text-[#94a3b8] text-xs font-bold uppercase tracking-widest mb-1">Step 3 of 3 — Rates Setup</p>
        <h1 className="text-[#f1f5f9] text-lg sm:text-xl font-bold leading-snug">
          Set how far each surface moves.
        </h1>
      </div>

      <div className="bg-[#1e293b] rounded-xl border border-[#334155] px-4 py-3 space-y-1">
        <p className="text-[#cbd5e1] text-sm">
          These are <span className="text-[#22c55e] font-semibold">safe starting values</span>.
          They are set conservatively on purpose — it is much easier to increase them
          after your first flight than to crash because they were too high.
        </p>
        <p className="text-[#64748b] text-xs">
          Switch {switchId}: away = Low · middle = Mid · toward you = High
        </p>
      </div>

      {SURFACES.map(({ key, label, desc }) => (
        <div key={key} className="bg-[#1e293b] rounded-xl border border-[#334155] p-4 space-y-3">
          <div>
            <h2 className="text-[#f1f5f9] text-sm font-bold">{label}</h2>
            <p className="text-[#64748b] text-xs">{desc}</p>
          </div>

          <RateSlider
            label="HIGH"
            color="text-[#22c55e]"
            value={rates[key].high}
            warning={highWarning(rates[key].high)}
            onChange={(v) => onRate(key, 'high', v)}
          />
          <RateSlider
            label="MID"
            color="text-[#f59e0b]"
            value={rates[key].mid}
            onChange={(v) => onRate(key, 'mid', v)}
          />
          <RateSlider
            label="LOW"
            color="text-[#94a3b8]"
            value={rates[key].low}
            onChange={(v) => onRate(key, 'low', v)}
          />

          {rates[key].high <= rates[key].mid && (
            <p className="text-amber-400 text-xs">⚠ High should be greater than Mid</p>
          )}
          {rates[key].mid <= rates[key].low && (
            <p className="text-amber-400 text-xs">⚠ Mid should be greater than Low</p>
          )}
          {highWarning(rates[key].high) && (
            <p className="text-amber-400 text-xs">
              ⚠ {rates[key].high}% is aggressive. Only go this high if you are an experienced pilot.
            </p>
          )}
        </div>
      ))}

      <div className="bg-[#0f172a] border border-[#334155] rounded-xl px-4 py-3">
        <p className="text-[#64748b] text-xs">
          <span className="text-[#94a3b8] font-semibold">Not sure what values to use?</span>{' '}
          Leave these as-is. Fly on Low rates first. If the plane feels sluggish, come back
          and bump Mid and High up by 10% at a time. There is no wrong answer — it is personal preference.
        </p>
      </div>

      <button
        onClick={onComplete}
        className="w-full py-3.5 bg-[#22c55e] hover:bg-[#16a34a] text-white font-bold rounded-xl text-sm transition-colors shadow-lg shadow-green-900/30"
      >
        Rates are set — Done
      </button>
    </div>
  )
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

type Step = 'switch' | 'explain' | 'sliders'

export default function RatesWizard({ onComplete, onSkip }: Props): JSX.Element {
  const [step, setStep]         = useState<Step>('switch')
  const [sw, setSw]             = useState('')
  const [reversed, setReversed] = useState(false)
  const [rates, setRates]       = useState<WizardRates>(SAFE_DEFAULTS)

  const setRate = (surface: keyof WizardRates, level: keyof RateSet, value: number): void => {
    setRates((prev) => ({ ...prev, [surface]: { ...prev[surface], [level]: value } }))
  }

  const stepNum = step === 'switch' ? 1 : step === 'explain' ? 2 : 3

  const banner = (
    <div className="shrink-0 bg-[#060e1a] border-b border-[#1a3050] px-4 py-3">
      <div className="flex items-center gap-2 mb-0.5">
        <span className="text-amber-400 text-[10px] font-bold uppercase tracking-widest">Rates Wizard</span>
        <span className="text-[#1e3a5a] text-[10px]">·</span>
        <span className="text-[#475569] text-[10px]">Step {stepNum} of 3</span>
      </div>
      <p className="text-[#f1f5f9] text-base font-bold leading-snug">
        You're deciding how much your plane reacts to the sticks — and which switch changes it.
      </p>
      <p className="text-[#64748b] text-xs mt-0.5">
        Low rates = gentle. High rates = aggressive. You'll flip the switch mid-flight.
      </p>
    </div>
  )

  if (step === 'switch') {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {banner}
        <div className="flex-1 overflow-y-auto">
          <ScreenSwitch
            selected={sw}
            onSelect={setSw}
            reversed={reversed}
            onReverse={setReversed}
            onContinue={() => setStep('explain')}
            onSkip={onSkip}
          />
        </div>
      </div>
    )
  }

  if (step === 'explain') {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {banner}
        <div className="flex-1 overflow-y-auto">
          <ScreenExplain
            switchId={sw}
            reversed={reversed}
            onBack={() => setStep('switch')}
            onContinue={() => setStep('sliders')}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {banner}
      <div className="flex-1 overflow-y-auto">
        <ScreenSliders
          switchId={sw}
          rates={rates}
          onRate={setRate}
          onBack={() => setStep('explain')}
          onComplete={() => onComplete({ rates, switchId: sw, reversed })}
        />
      </div>
    </div>
  )
}
