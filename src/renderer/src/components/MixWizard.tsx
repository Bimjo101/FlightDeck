import { useState } from 'react'
import { RadioDiagram, ControlPicker } from './SwitchPicker'

// ─── Types ────────────────────────────────────────────────────────────────────

export type AirframeType = 'conventional' | 'flyingWing' | 'vTail' | 'glider' | 'twinMotor' | 'efJet'

export interface ElevonConfig    { weight: number }
export interface VTailConfig     { eleWeight: number; rudWeight: number }
export interface DiffThrustConfig {
  weight: number
  motorCount: number
  rightCh: number
  propDir: 'counter' | 'same'
}

export interface MixWizardResult {
  airframeType:       AirframeType
  elevon?:            ElevonConfig
  vTail?:             VTailConfig
  diffThrust?:        DiffThrustConfig
  diffAileron?:       number
  throttleCutSwitch?: string
  throttleCutMode?:   'always' | 'idleGate'
  flapEleComps?:      number[]
  thrRudMix?:         number
  revThrustSwitch?:   string
  flapSlow?: { deploySeconds: number }
  soundAnnouncements?: { rateAnnouncements: boolean }
  flightTimer?: {
    mode: 'up' | 'down'
    duration: number     // minutes
    trigger: 'throttle' | 'always' | 'switch'
    switchId?: string
    minuteBeeps: boolean
  }
  landingGear?: {
    switchId: string
    channel: number
  }
}

interface Props {
  onComplete: (result: MixWizardResult) => void
  onSkip: () => void
  rateSwitch?: string
}

type MixStep =
  | 'airframe'
  | 'soundStudio'
  | 'flightTimer'
  | 'convDiffAil'
  | 'convThrottleCut'
  | 'convFlapEle'
  | 'convThrRud'
  | 'convRevThrust'
  | 'elevon'
  | 'vtail'
  | 'diffThrust'
  | 'landingGear'
  | 'summary'

// ─── Airframe cards ───────────────────────────────────────────────────────────

const AIRFRAMES: { type: AirframeType; icon: string; label: string; desc: string }[] = [
  { type: 'conventional', icon: '✈️', label: 'Conventional',  desc: 'Trainers, sport planes, warbirds, aerobatics' },
  { type: 'flyingWing',   icon: '🔼', label: 'Flying Wing',   desc: 'Wing-only — no separate tail at all' },
  { type: 'vTail',        icon: '🔻', label: 'V-Tail',        desc: 'V-shaped tail handles both elevator and rudder' },
  { type: 'glider',       icon: '🦅', label: 'Glider',        desc: 'Sailplanes and motor gliders' },
  { type: 'twinMotor',    icon: '🔧', label: 'Twin Motor',    desc: 'Two motors side by side' },
  { type: 'efJet',        icon: '🚀', label: 'EDF Jet',       desc: 'Electric ducted fan jets' },
]

// ─── Shared components ────────────────────────────────────────────────────────

function Banner({
  step, label, sub,
}: {
  step: string; label: string; sub: string
}): JSX.Element {
  return (
    <div className="shrink-0 bg-[#060e1a] border-b border-[#1a3050] px-5 py-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-amber-400 text-xs font-bold uppercase tracking-widest">Mix Wizard</span>
        <span className="text-[#1e3a5a] text-xs">·</span>
        <span className="text-[#475569] text-xs">{step}</span>
      </div>
      <p className="text-[#f1f5f9] text-xl font-bold leading-snug">{label}</p>
      <p className="text-[#64748b] text-sm mt-1 leading-relaxed">{sub}</p>
    </div>
  )
}

function NavRow({
  onBack,
  onNext,
  onSkip,
  nextLabel = 'Next →',
  nextDisabled = false,
}: {
  onBack?: () => void
  onNext: () => void
  onSkip?: () => void
  nextLabel?: string
  nextDisabled?: boolean
}): JSX.Element {
  return (
    <div className="flex items-center gap-3 pt-4">
      {onBack && (
        <button
          onClick={onBack}
          className="px-5 py-3 rounded-2xl border border-[#334155] text-[#94a3b8] hover:text-[#f1f5f9] hover:border-[#475569] text-base font-semibold transition-all"
        >
          ← Back
        </button>
      )}
      <button
        onClick={onNext}
        disabled={nextDisabled}
        className="flex-1 py-4 bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-40 disabled:cursor-not-allowed text-white text-base font-bold rounded-2xl transition-colors shadow-lg shadow-blue-900/30"
      >
        {nextLabel}
      </button>
      {onSkip && (
        <button
          onClick={onSkip}
          className="px-5 py-3 rounded-2xl border border-[#334155] text-[#475569] hover:text-[#94a3b8] text-sm font-semibold transition-all"
        >
          Skip
        </button>
      )}
    </div>
  )
}

function Warn({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex gap-3 bg-amber-950/40 border border-amber-800/50 rounded-2xl px-4 py-3 text-base text-amber-200 leading-relaxed">
      <span className="text-amber-400 text-xl shrink-0 mt-0.5">⚠️</span>
      <span>{children}</span>
    </div>
  )
}

function Danger({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex gap-3 bg-red-950/40 border border-red-800/50 rounded-2xl px-4 py-3 text-base text-red-200 leading-relaxed">
      <span className="text-red-400 text-xl shrink-0 mt-0.5">🛑</span>
      <span>{children}</span>
    </div>
  )
}

function MixTable({ rows }: { rows: { dest: string; src: string; weight: string }[] }): JSX.Element {
  return (
    <div className="rounded-2xl border border-[#1a3050] overflow-hidden">
      <div className="bg-[#060e1a] px-4 py-2 text-[#475569] text-xs font-bold uppercase tracking-widest">
        Mix lines generated
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#1a3050]">
            <th className="text-left px-4 py-2 text-[#475569] font-semibold">Channel</th>
            <th className="text-left px-4 py-2 text-[#475569] font-semibold">Source</th>
            <th className="text-right px-4 py-2 text-[#475569] font-semibold">Weight</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-[#0a1628]' : 'bg-[#060e1a]'}>
              <td className="px-4 py-2.5 text-amber-300 font-mono">{r.dest}</td>
              <td className="px-4 py-2.5 text-[#94a3b8] font-mono">{r.src}</td>
              <td className="px-4 py-2.5 text-[#f1f5f9] font-mono text-right">{r.weight}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Step: Sound Studio ───────────────────────────────────────────────────────

function StepSoundStudio({
  rateAnnouncements, onToggleRate, onNext, onBack, onSkip,
}: {
  rateAnnouncements: boolean
  onToggleRate: (v: boolean) => void
  onNext: () => void
  onBack: () => void
  onSkip: () => void
}): JSX.Element {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Banner
        step="Step 2 · Optional"
        label="Sound Studio"
        sub="Your radio can speak callouts when switches flip. Totally optional."
      />
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        <div className="bg-[#0f172a] border border-[#334155] rounded-2xl p-5 space-y-2">
          <p className="text-[#f1f5f9] text-base font-bold">How it works</p>
          <p className="text-[#94a3b8] text-sm leading-relaxed">
            The TX16S has a speaker. It can say things like{' '}
            <span className="text-amber-300 font-semibold">"Low Rates"</span>,{' '}
            <span className="text-amber-300 font-semibold">"Mid Rates"</span>,{' '}
            <span className="text-amber-300 font-semibold">"High Rates"</span>{' '}
            when you flip your rate switch — so you always know which mode you're in without looking at the screen.
          </p>
          <p className="text-[#64748b] text-xs mt-1">
            Requires <span className="font-mono text-amber-400">low.wav</span>,{' '}
            <span className="font-mono text-amber-400">mid.wav</span>,{' '}
            <span className="font-mono text-amber-400">high.wav</span> in{' '}
            <span className="font-mono text-amber-400">SOUNDS/en/</span> on your radio's SD card.
            These files usually come pre-installed on EdgeTX SD card packs.
          </p>
        </div>

        <button
          onClick={() => onToggleRate(!rateAnnouncements)}
          className={`w-full flex items-center gap-4 p-5 rounded-2xl border-2 text-left transition-all ${
            rateAnnouncements
              ? 'bg-amber-900/30 border-amber-400 shadow-lg shadow-amber-900/30'
              : 'bg-[#0f172a] border-[#334155] hover:border-[#475569] hover:bg-[#1e293b]'
          }`}
        >
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0 ${
            rateAnnouncements ? 'bg-amber-900/60' : 'bg-[#0a1628]'
          }`}>
            🔊
          </div>
          <div className="flex-1">
            <p className={`text-base font-bold ${rateAnnouncements ? 'text-amber-200' : 'text-[#f1f5f9]'}`}>
              Rate mode announcements
            </p>
            <p className={`text-sm mt-0.5 ${rateAnnouncements ? 'text-amber-300/80' : 'text-[#64748b]'}`}>
              Speaks "Low", "Mid", or "High" each time you flip the rate switch (SA).
            </p>
          </div>
          <div className={`w-6 h-6 rounded-full border-2 shrink-0 flex items-center justify-center ${
            rateAnnouncements ? 'border-amber-400 bg-amber-400' : 'border-[#475569]'
          }`}>
            {rateAnnouncements && <span className="text-black text-xs font-black">✓</span>}
          </div>
        </button>

        <div className="bg-[#0a1628] border border-[#1a3050] rounded-2xl p-4">
          <p className="text-[#475569] text-sm leading-relaxed">
            <span className="text-[#64748b] font-bold">Motor armed/safe callouts</span> are added automatically
            if you configure a Throttle Cut switch later in this wizard.
          </p>
        </div>

        <NavRow onBack={onBack} onNext={onNext} onSkip={onSkip} />
      </div>
    </div>
  )
}

// ─── Step: Flight Timer ────────────────────────────────────────────────────────

interface FlightTimerCfg {
  enabled: boolean
  mode: 'up' | 'down'
  duration: number
  trigger: 'throttle' | 'always' | 'switch'
  switchId: string | null
  minuteBeeps: boolean
}

function StepFlightTimer({
  config, onChange, onNext, onBack, onSkip, usedBy = {},
}: {
  config: FlightTimerCfg
  onChange: (c: FlightTimerCfg) => void
  onNext: () => void
  onBack: () => void
  onSkip: () => void
  usedBy?: Record<string, string>
}): JSX.Element {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Banner
        step="Step 3 · Optional"
        label="Flight Timer"
        sub="Tracks how long you've been in the air. Built into the radio display."
      />
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

        <div className="grid grid-cols-2 gap-3">
          {([
            { mode: 'up' as const, icon: '⏱', label: 'Count Up', desc: 'Starts at 0:00 and counts up.' },
            { mode: 'down' as const, icon: '⏳', label: 'Count Down', desc: 'Counts down from your limit.' },
          ]).map(({ mode, icon, label, desc }) => (
            <button
              key={mode}
              onClick={() => onChange({ ...config, enabled: true, mode })}
              className={`p-4 rounded-2xl border-2 text-left transition-all ${
                config.enabled && config.mode === mode
                  ? 'bg-amber-900/30 border-amber-400 shadow-lg shadow-amber-900/30'
                  : 'bg-[#0f172a] border-[#334155] hover:border-[#475569] hover:bg-[#1e293b]'
              }`}
            >
              <span className="text-2xl block mb-1">{icon}</span>
              <p className={`text-sm font-bold ${config.enabled && config.mode === mode ? 'text-amber-200' : 'text-[#f1f5f9]'}`}>{label}</p>
              <p className={`text-xs mt-0.5 leading-snug ${config.enabled && config.mode === mode ? 'text-amber-300/70' : 'text-[#64748b]'}`}>{desc}</p>
            </button>
          ))}
        </div>

        {config.enabled && config.mode === 'down' && (
          <div className="bg-[#0f172a] border border-[#334155] rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[#f1f5f9] text-base font-bold">Timer limit</p>
              <span className="text-amber-300 text-xl font-black">{config.duration} min</span>
            </div>
            <input
              type="range" min={3} max={30} step={1}
              value={config.duration}
              onChange={(e) => onChange({ ...config, duration: Number(e.target.value) })}
              className="w-full accent-amber-400"
              style={{ minHeight: 36 }}
            />
            <p className="text-[#64748b] text-xs">
              Radio will beep at each minute and count down the last 30 seconds.
            </p>
          </div>
        )}

        {config.enabled && (
          <div className="bg-[#0f172a] border border-[#334155] rounded-2xl p-5 space-y-3">
            <p className="text-[#f1f5f9] text-base font-bold">When does it run?</p>
            <div className="grid grid-cols-3 gap-3">
              {([
                { val: 'throttle' as const, label: 'Throttle trigger', desc: 'Starts when you add throttle. Pauses at idle.' },
                { val: 'switch' as const, label: 'Switch trigger', desc: 'Starts/stops with a switch you flip yourself.' },
                { val: 'always' as const, label: 'Always running', desc: 'Counts the moment the radio powers on.' },
              ]).map(({ val, label, desc }) => (
                <button
                  key={val}
                  onClick={() => onChange({ ...config, trigger: val })}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    config.trigger === val
                      ? 'bg-amber-900/30 border-amber-400'
                      : 'bg-[#0a1628] border-[#1a3050] hover:border-[#334155]'
                  }`}
                >
                  <p className={`text-sm font-bold ${config.trigger === val ? 'text-amber-200' : 'text-[#f1f5f9]'}`}>{label}</p>
                  <p className={`text-xs mt-0.5 ${config.trigger === val ? 'text-amber-300/70' : 'text-[#64748b]'}`}>{desc}</p>
                </button>
              ))}
            </div>

            {config.trigger === 'switch' && (
              <div className="space-y-3 pt-1">
                <p className="text-[#94a3b8] text-sm">
                  Use the buttons below or tap the switch on the diagram.
                  {config.switchId && <span className="text-amber-300 font-bold ml-2">{config.switchId} selected ✓</span>}
                </p>
                <ControlPicker
                  selected={config.switchId ?? ''}
                  onSelect={(id) => onChange({ ...config, switchId: id })}
                  usedBy={usedBy}
                />
                <RadioDiagram
                  selected={config.switchId ?? ''}
                  onSelect={(id) => onChange({ ...config, switchId: id })}
                  usedBy={usedBy}
                />
                {!config.switchId && (
                  <p className="text-red-400 text-xs font-bold">← pick a switch to continue</p>
                )}
              </div>
            )}
          </div>
        )}

        {config.enabled && (
          <button
            onClick={() => onChange({ ...config, minuteBeeps: !config.minuteBeeps })}
            className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all ${
              config.minuteBeeps
                ? 'bg-amber-900/30 border-amber-400'
                : 'bg-[#0f172a] border-[#334155] hover:border-[#475569]'
            }`}
          >
            <span className="text-2xl">🔔</span>
            <div className="flex-1">
              <p className={`text-sm font-bold ${config.minuteBeeps ? 'text-amber-200' : 'text-[#f1f5f9]'}`}>Minute beeps</p>
              <p className={`text-xs mt-0.5 ${config.minuteBeeps ? 'text-amber-300/70' : 'text-[#64748b]'}`}>
                Radio beeps at each minute mark during your flight.
              </p>
            </div>
            <div className={`w-6 h-6 rounded-full border-2 shrink-0 flex items-center justify-center ${
              config.minuteBeeps ? 'border-amber-400 bg-amber-400' : 'border-[#475569]'
            }`}>
              {config.minuteBeeps && <span className="text-black text-xs font-black">✓</span>}
            </div>
          </button>
        )}

        <NavRow
          onBack={onBack}
          onNext={onNext}
          onSkip={onSkip}
          nextDisabled={config.enabled && config.trigger === 'switch' && !config.switchId}
        />
      </div>
    </div>
  )
}

// ─── Step: Airframe select ────────────────────────────────────────────────────

function StepAirframe({
  selected, onSelect, onNext, onSkip,
}: {
  selected: AirframeType | null
  onSelect: (t: AirframeType) => void
  onNext: () => void
  onSkip: () => void
}): JSX.Element {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Banner
        step="Step 1"
        label="What kind of plane is this?"
        sub="Pick the one that matches your plane. This decides what gets set up next."
      />
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        <div className="grid grid-cols-2 gap-3">
          {AIRFRAMES.map(({ type, icon, label, desc }) => {
            const active = selected === type
            return (
              <button
                key={type}
                onClick={() => onSelect(type)}
                className={`flex flex-col items-start p-4 rounded-2xl border-2 text-left transition-all ${
                  active
                    ? 'bg-amber-900/30 border-amber-400 shadow-lg shadow-amber-900/30'
                    : 'bg-[#0f172a] border-[#334155] hover:border-[#475569] hover:bg-[#1e293b]'
                }`}
              >
                <span className="text-3xl mb-2">{icon}</span>
                <span className={`text-base font-bold leading-tight ${active ? 'text-amber-200' : 'text-[#f1f5f9]'}`}>{label}</span>
                <span className={`text-sm mt-1 leading-snug ${active ? 'text-amber-300/80' : 'text-[#64748b]'}`}>{desc}</span>
              </button>
            )
          })}
        </div>
        <NavRow
          onNext={onNext}
          onSkip={onSkip}
          nextDisabled={!selected}
          nextLabel={selected ? `Set up ${AIRFRAMES.find((a) => a.type === selected)?.label} →` : 'Pick a type first'}
        />
      </div>
    </div>
  )
}

// ─── Step: Conventional — Differential Aileron ───────────────────────────────

function DiffAilVisual({ diff }: { diff: number }): JSX.Element {
  // UP goes 100%, DOWN goes (100 - diff)%
  const downPct = 100 - diff
  const upH  = 80
  const downH = Math.round((downPct / 100) * upH)

  return (
    <div className="bg-[#060e1a] border border-[#1a3050] rounded-2xl px-5 py-5">
      <p className="text-[#475569] text-sm font-bold uppercase tracking-wider text-center mb-4">
        Rolling Right — what each aileron does
      </p>
      <div className="flex items-end justify-around gap-4">
        {/* Left aileron — goes UP */}
        <div className="flex flex-col items-center gap-2">
          <div
            className="w-20 bg-amber-500 rounded-t-xl transition-all duration-300 flex items-start justify-center pt-2"
            style={{ height: upH }}
          >
            <span className="text-white text-sm font-black">↑ UP</span>
          </div>
          <span className="text-amber-300 text-lg font-black">100%</span>
          <span className="text-[#64748b] text-sm text-center leading-tight">Left wing<br/>goes up</span>
        </div>

        {/* Plane body center */}
        <div className="flex flex-col items-center gap-1 pb-8">
          <div className="w-3 h-24 bg-[#1a3050] rounded-full" />
          <span className="text-[#334155] text-xs">wing</span>
        </div>

        {/* Right aileron — goes DOWN (smaller) */}
        <div className="flex flex-col items-center gap-2">
          <div
            className="w-20 bg-[#3b82f6] rounded-t-xl transition-all duration-300 flex items-start justify-center pt-2 opacity-70"
            style={{ height: downH }}
          >
            <span className="text-white text-sm font-black">↓ DOWN</span>
          </div>
          <span className="text-[#60a5fa] text-lg font-black">{downPct}%</span>
          <span className="text-[#64748b] text-sm text-center leading-tight">Right wing<br/>goes down</span>
        </div>
      </div>
      <p className="text-center text-[#475569] text-sm mt-4 leading-relaxed">
        {diff === 0
          ? 'Both move the same amount — no differential'
          : `Up aileron travels ${diff}% farther than the down aileron`}
      </p>
    </div>
  )
}

function AileronChannelGate({ onAnswer }: { onAnswer: (twoChannels: boolean) => void }): JSX.Element {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-5"
      style={{ background: 'rgba(0,0,0,0.85)' }}
    >
      <div className="bg-[#0f172a] border-2 border-red-500 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-5">
        <p className="text-red-400 text-2xl font-black uppercase text-center leading-tight tracking-wide">
          Before you continue
        </p>
        <p className="text-[#f1f5f9] text-lg font-bold text-center leading-snug">
          Are your left and right ailerons each wired to their own servo channel?
        </p>
        <p className="text-[#94a3b8] text-sm leading-relaxed text-center">
          Differential only works if each aileron has its own output channel. If both ailerons share a
          single Y-cable on one channel, the radio physically cannot give one side more travel than the
          other — this mix will do nothing, or if half-configured, leave one wing with more up-than-down
          (or down-than-up) travel than the other.
        </p>
        <div className="flex flex-col gap-3 pt-2">
          <button
            onClick={() => onAnswer(true)}
            className="py-4 bg-emerald-600 hover:bg-emerald-500 text-white text-base font-bold rounded-2xl transition-colors"
          >
            Yes — 2 separate aileron channels
          </button>
          <button
            onClick={() => onAnswer(false)}
            className="py-4 bg-[#1e293b] hover:bg-[#28384f] border border-[#334155] text-[#f1f5f9] text-base font-bold rounded-2xl transition-colors"
          >
            No — single channel / Y-cable
          </button>
        </div>
      </div>
    </div>
  )
}

function StepConvDiffAil({
  diff, onChange, onNext, onBack, onSkip,
}: {
  diff: number
  onChange: (v: number) => void
  onNext: () => void
  onBack: () => void
  onSkip: () => void
}): JSX.Element {
  const [hasTwoChannels, setHasTwoChannels] = useState<boolean | null>(null)

  const handleAnswer = (twoChannels: boolean): void => {
    setHasTwoChannels(twoChannels)
    if (!twoChannels) onChange(0)
  }

  if (hasTwoChannels === null) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <Banner
          step="Step 4 of 8"
          label="Differential Aileron"
          sub="This makes your plane turn cleaner. You won't even notice it — it just works."
        />
        <div className="flex-1 overflow-y-auto px-5 py-5" />
        <AileronChannelGate onAnswer={handleAnswer} />
      </div>
    )
  }

  if (hasTwoChannels === false) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <Banner
          step="Step 4 of 8"
          label="Differential Aileron"
          sub="Not available for your setup — here's why."
        />
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          <Danger>
            Your ailerons share a single channel (Y-cable), so the radio cannot give one aileron more
            travel than the other. Differential aileron is mechanically impossible without separate
            servos on separate channels — skipping this mix.
          </Danger>
          <button
            onClick={() => setHasTwoChannels(null)}
            className="text-amber-300 text-sm font-semibold underline self-start"
          >
            Actually, I do have 2 separate aileron channels →
          </button>
          <NavRow onBack={onBack} onNext={onNext} onSkip={onSkip} nextLabel="Next — Throttle Cut →" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Banner
        step="Step 4 of 8"
        label="Differential Aileron"
        sub="This makes your plane turn cleaner. You won't even notice it — it just works."
      />
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

        {/* Big-letters channel requirement warning */}
        <div className="bg-red-950/60 border-2 border-red-500 rounded-2xl p-5 space-y-2">
          <p className="text-red-300 text-2xl font-black uppercase tracking-wide leading-tight text-center">
            Requires 2 separate aileron channels
          </p>
          <p className="text-red-200 text-base font-bold text-center">
            On a Y-cable / single aileron channel, this mix will not work.
          </p>
        </div>
        <button
          onClick={() => setHasTwoChannels(null)}
          className="text-amber-300 text-sm font-semibold underline"
        >
          Change my answer
        </button>

        {/* Plain English explanation */}
        <div className="bg-[#0f172a] border border-[#334155] rounded-2xl p-5 space-y-3">
          <p className="text-[#f1f5f9] text-lg font-bold">Why does this matter?</p>
          <p className="text-[#94a3b8] text-base leading-relaxed">
            When you roll right, the <span className="text-amber-300 font-bold">left aileron goes UP</span> and
            the <span className="text-[#60a5fa] font-bold">right aileron goes DOWN.</span>
          </p>
          <p className="text-[#94a3b8] text-base leading-relaxed">
            The problem: the down-going aileron creates more drag than the up-going one.
            That extra drag pulls the nose the <span className="text-red-400 font-bold">wrong way</span> — left when you're trying to go right.
          </p>
          <p className="text-[#94a3b8] text-base leading-relaxed">
            The fix: make the <span className="text-amber-300 font-bold">up aileron travel farther</span> than
            the down aileron. Now the drag is equal on both sides, and the plane tracks straight through a roll.
          </p>
        </div>

        {/* Live visual */}
        <DiffAilVisual diff={diff} />

        {/* Slider */}
        <div className="bg-[#0f172a] border border-[#334155] rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[#f1f5f9] text-lg font-bold">How much differential?</span>
            <span className="text-amber-300 text-2xl font-black">{diff}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={50}
            step={1}
            value={diff}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full accent-amber-500"
            style={{ height: 6 }}
          />
          <div className="flex justify-between text-sm text-[#475569]">
            <span>0% — no differential</span>
            <span>50% — max</span>
          </div>
          <div className="grid grid-cols-3 gap-2 pt-1">
            {[
              { label: 'Beginner', pct: 25, desc: 'Good starting point' },
              { label: 'Sport',    pct: 20, desc: 'Less correction' },
              { label: 'Aerobatic', pct: 0, desc: 'Off — need full down travel for snap rolls' },
            ].map(({ label, pct, desc }) => (
              <button
                key={label}
                onClick={() => onChange(pct)}
                className={`flex flex-col items-center p-3 rounded-xl border-2 transition-all ${
                  diff === pct
                    ? 'bg-amber-900/40 border-amber-400'
                    : 'bg-[#0f172a] border-[#334155] hover:border-[#475569]'
                }`}
              >
                <span className={`text-sm font-bold ${diff === pct ? 'text-amber-200' : 'text-[#f1f5f9]'}`}>{label}</span>
                <span className={`text-xs mt-0.5 ${diff === pct ? 'text-amber-300' : 'text-[#64748b]'}`}>{pct}%</span>
                <span className={`text-xs mt-0.5 text-center leading-tight ${diff === pct ? 'text-amber-300/70' : 'text-[#475569]'}`}>{desc}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-[#0a1628] border border-[#1a3050] rounded-2xl p-4 space-y-2">
          <p className="text-[#f1f5f9] text-sm font-bold mb-1">Where to set this on your radio:</p>
          <p className="text-[#94a3b8] text-sm leading-relaxed">
            This gets set in your radio under <span className="text-amber-300 font-bold">Outputs</span> — on
            <span className="text-amber-300 font-bold"> BOTH</span> aileron channels (e.g. CH1 and CH2), not just one.
            Look for the <span className="text-amber-300 font-bold">Diff</span> setting on each and enter
            <span className="text-amber-300 font-bold"> {diff}%</span>. We'll show you both exact values on the summary screen.
          </p>
          <p className="text-red-300 text-sm font-bold leading-relaxed">
            Set Diff on only one channel and the two ailerons won't match — one wing ends up with more
            up-than-down (or down-than-up) travel than the other.
          </p>
        </div>

        <NavRow
          onBack={onBack}
          onNext={onNext}
          onSkip={onSkip}
          nextLabel="Next — Throttle Cut →"
        />
      </div>
    </div>
  )
}

// ─── Step: Conventional — Throttle Cut ───────────────────────────────────────

function StepConvThrottleCut({
  selected, onSelect, mode, onModeSelect, onNext, onBack, onSkip, usedBy = {},
}: {
  selected: string | null
  onSelect: (id: string) => void
  mode: 'always' | 'idleGate' | null
  onModeSelect: (m: 'always' | 'idleGate') => void
  onNext: () => void
  onBack: () => void
  onSkip: () => void
  usedBy?: Record<string, string>
}): JSX.Element {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Banner
        step="Step 5 of 8"
        label="Throttle Cut Switch"
        sub="A dedicated kill switch that cuts the motor. Essential safety feature."
      />
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

        {/* Safety callout */}
        <div className="flex gap-3 bg-red-950/40 border border-red-800/50 rounded-2xl px-4 py-3">
          <span className="text-red-400 text-xl shrink-0 mt-0.5">⚡</span>
          <p className="text-red-200 text-sm leading-relaxed">
            One flip kills the motor.{' '}
            <span className="text-red-300 font-bold">Use it before you pick the plane up</span>{' '}
            and every time you're done flying. A spinning prop cuts to the bone in under a second.
          </p>
        </div>

        {/* In-flight behavior — choose FIRST */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <p className="text-[#f1f5f9] text-lg font-bold">In-flight behavior</p>
            {!mode && <span className="text-red-400 text-xs font-bold">← pick one</span>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {([
              {
                val: 'always' as const,
                label: 'Cut anytime',
                icon: '⚡',
                desc: 'Flip it and the motor dies immediately, even in the air at full throttle.',
              },
              {
                val: 'idleGate' as const,
                label: 'Idle gate',
                icon: '🛡',
                desc: 'Only works when throttle stick is at idle. Accidental flip in-flight does nothing.',
              },
            ]).map(({ val, label, icon, desc }) => (
              <button
                key={val}
                type="button"
                style={{ touchAction: 'manipulation' }}
                onClick={() => onModeSelect(val)}
                className={`relative flex flex-col items-start p-4 rounded-2xl border-2 text-left transition-all active:scale-95 cursor-pointer ${
                  mode === val
                    ? 'bg-amber-900/30 border-amber-400 shadow-lg shadow-amber-900/30'
                    : 'bg-[#0f172a] border-[#475569] hover:border-[#64748b] hover:bg-[#1e293b]'
                }`}
              >
                {mode === val && (
                  <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-amber-400 flex items-center justify-center text-black text-xs font-black">✓</span>
                )}
                <span className="text-2xl mb-2">{icon}</span>
                <span className={`text-sm font-bold leading-tight ${mode === val ? 'text-amber-200' : 'text-[#f1f5f9]'}`}>{label}</span>
                <span className={`text-xs mt-1 leading-snug ${mode === val ? 'text-amber-300/80' : 'text-[#94a3b8]'}`}>{desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Switch picker — ControlPicker above, RadioDiagram below */}
        <div className="space-y-3">
          <div>
            <p className="text-[#f1f5f9] text-lg font-bold">Pick your kill switch</p>
            <p className="text-[#64748b] text-sm mt-1">
              Use the buttons below or tap the switch on the diagram.
              {selected && <span className="text-amber-300 font-bold ml-2">{selected} selected ✓</span>}
            </p>
          </div>
          <ControlPicker selected={selected ?? ''} onSelect={onSelect} usedBy={usedBy} />
          <RadioDiagram selected={selected ?? ''} onSelect={onSelect} usedBy={usedBy} />
        </div>

        {selected && (
          <div className="bg-[#0a1628] border border-[#1a3050] rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-green-400 text-base">✓</span>
              <p className="text-green-300 text-sm font-bold">Written into your model file automatically.</p>
            </div>
            {mode === 'always' ? (
              <p className="text-[#94a3b8] text-sm font-mono">{selected}↑ → Override CH3 = −100</p>
            ) : (
              <>
                <p className="text-[#94a3b8] text-sm font-mono">Logical Switch: Thr &lt; −90 AND {selected}↑</p>
                <p className="text-[#94a3b8] text-sm font-mono">L01 → Override CH3 = −100</p>
              </>
            )}
            <p className="text-[#475569] text-xs leading-relaxed">No manual radio setup needed.</p>
          </div>
        )}

        <NavRow
          onBack={onBack}
          onNext={onNext}
          onSkip={onSkip}
          nextLabel="Next →"
          nextDisabled={!selected || !mode}
        />
      </div>
    </div>
  )
}

// ─── Step: Elevon (Flying Wing) ───────────────────────────────────────────────

function StepElevon({
  config, onChange, onNext, onBack, onSkip,
}: {
  config: ElevonConfig
  onChange: (c: ElevonConfig) => void
  onNext: () => void
  onBack: () => void
  onSkip: () => void
}): JSX.Element {
  const w = config.weight
  const rows = [
    { dest: 'CH1 (left elevon)',  src: 'Ail', weight: `+${w}%` },
    { dest: 'CH1 (left elevon)',  src: 'Ele', weight: `+${w}%` },
    { dest: 'CH2 (right elevon)', src: 'Ail', weight: `-${w}%` },
    { dest: 'CH2 (right elevon)', src: 'Ele', weight: `+${w}%` },
  ]
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Banner step="Step 4" label="Flying Wing — Elevon Mix" sub="Each surface controls both roll AND pitch at the same time." />
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        <div className="bg-[#0f172a] border border-[#334155] rounded-2xl p-5 space-y-3">
          <p className="text-[#f1f5f9] text-lg font-bold">How it works</p>
          <p className="text-[#94a3b8] text-base leading-relaxed">
            Your plane has no separate tail. Both wing surfaces do everything — roll and pitch.
          </p>
          <p className="text-[#94a3b8] text-base leading-relaxed">
            When you pull back on the stick: <span className="text-amber-300 font-bold">both surfaces rise together.</span><br />
            When you roll right: <span className="text-amber-300 font-bold">left surface rises, right drops.</span>
          </p>
        </div>
        <Danger>
          Flying wing CG is very sensitive. Start at 25–30% of the wing chord from the leading edge.
          Too far back and the wing will pitch up uncontrollably and crash. Always maiden slightly nose-heavy.
        </Danger>
        <div className="bg-[#0f172a] border border-[#334155] rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[#f1f5f9] text-lg font-bold">Surface weight</span>
            <span className="text-amber-300 text-2xl font-black">{w}%</span>
          </div>
          <input type="range" min={30} max={100} step={1} value={w} onChange={(e) => onChange({ weight: Number(e.target.value) })} className="w-full accent-amber-500" />
          <p className="text-[#64748b] text-sm">50% is the safe starting point. It prevents clipping when you use both sticks at once.</p>
        </div>
        <MixTable rows={rows} />
        <div className="bg-[#0a1628] border border-[#1a3050] rounded-2xl p-4 space-y-2">
          <p className="text-[#f1f5f9] text-sm font-bold">Check these on the ground before flying:</p>
          {[
            'Pull elevator stick back → BOTH surfaces rise',
            'Push elevator stick forward → BOTH surfaces drop',
            'Roll right → LEFT rises, RIGHT drops',
            'Roll left → RIGHT rises, LEFT drops',
          ].map((item) => (
            <p key={item} className="text-[#94a3b8] text-sm flex gap-2 leading-relaxed">
              <span className="text-amber-400 shrink-0">→</span><span>{item}</span>
            </p>
          ))}
        </div>
        <NavRow onBack={onBack} onNext={onNext} onSkip={onSkip} nextLabel="Apply elevon mix →" />
      </div>
    </div>
  )
}

// ─── Step: V-tail ─────────────────────────────────────────────────────────────

function StepVTail({
  config, onChange, onNext, onBack, onSkip,
}: {
  config: VTailConfig
  onChange: (c: VTailConfig) => void
  onNext: () => void
  onBack: () => void
  onSkip: () => void
}): JSX.Element {
  const { eleWeight, rudWeight } = config
  const rows = [
    { dest: 'CH2 (left ruddervator)',  src: 'Ele', weight: `+${eleWeight}%` },
    { dest: 'CH2 (left ruddervator)',  src: 'Rud', weight: `+${rudWeight}%` },
    { dest: 'CH4 (right ruddervator)', src: 'Ele', weight: `+${eleWeight}%` },
    { dest: 'CH4 (right ruddervator)', src: 'Rud', weight: `-${rudWeight}%` },
  ]
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Banner step="Step 4" label="V-Tail / Ruddervator Mix" sub="Two surfaces handle both elevator and rudder combined." />
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        <div className="bg-[#0f172a] border border-[#334155] rounded-2xl p-5 space-y-3">
          <p className="text-[#f1f5f9] text-lg font-bold">How it works</p>
          <p className="text-[#94a3b8] text-base leading-relaxed">Both V-tail surfaces move <span className="text-amber-300 font-bold">together</span> for elevator. They move <span className="text-amber-300 font-bold">in opposite directions</span> for rudder.</p>
        </div>
        <Danger>Only mix on the TRANSMITTER or the RECEIVER — never both. If your receiver has built-in V-tail mixing, skip this step.</Danger>
        <div className="bg-[#0f172a] border border-[#334155] rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[#f1f5f9] text-base font-bold">Elevator weight</span>
            <span className="text-amber-300 text-xl font-black">{eleWeight}%</span>
          </div>
          <input type="range" min={30} max={80} step={1} value={eleWeight} onChange={(e) => onChange({ ...config, eleWeight: Number(e.target.value) })} className="w-full accent-amber-500" />
          <div className="flex items-center justify-between">
            <span className="text-[#f1f5f9] text-base font-bold">Rudder weight</span>
            <span className="text-amber-300 text-xl font-black">{rudWeight}%</span>
          </div>
          <input type="range" min={30} max={80} step={1} value={rudWeight} onChange={(e) => onChange({ ...config, rudWeight: Number(e.target.value) })} className="w-full accent-amber-500" />
        </div>
        <MixTable rows={rows} />
        <NavRow onBack={onBack} onNext={onNext} onSkip={onSkip} nextLabel="Apply V-tail mix →" />
      </div>
    </div>
  )
}

// ─── Step: Differential Thrust ────────────────────────────────────────────────

const DIFF_CHECKLIST = [
  'Power on with propellers REMOVED',
  'Left rudder: LEFT motor speeds up, RIGHT motor slows',
  'Right rudder: RIGHT motor speeds up, LEFT motor slows',
  'Both motors respond equally to throttle input',
  'Reinstall props only AFTER all 4 checks pass',
]

function StepDiffThrust({
  config, onChange, onNext, onBack, onSkip,
}: {
  config: DiffThrustConfig
  onChange: (c: DiffThrustConfig) => void
  onNext: () => void
  onBack: () => void
  onSkip: () => void
}): JSX.Element {
  const [checked, setChecked] = useState<boolean[]>(DIFF_CHECKLIST.map(() => false))
  const allChecked = checked.every(Boolean)
  const toggle = (i: number): void => setChecked((prev) => prev.map((v, idx) => idx === i ? !v : v))
  const { weight, motorCount, rightCh, propDir } = config
  const downPct = 100 - weight
  const rows = [
    { dest: 'CH3 (left motor)',           src: 'Rud', weight: `+${weight}%  ADD` },
    { dest: `CH${rightCh} (right motor)`, src: 'Thr', weight: '+100%  ADD' },
    { dest: `CH${rightCh} (right motor)`, src: 'Rud', weight: `-${weight}%  ADD` },
  ]
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Banner step="Step 4" label="Differential Thrust" sub="Speed up one motor, slow the other — turns without a rudder." />
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        <Danger>Wrong signs = uncontrollable swerve on takeoff. The ground test at the bottom is MANDATORY.</Danger>
        <div className="bg-[#0f172a] border border-[#334155] rounded-2xl p-5 space-y-5">
          <div>
            <p className="text-[#f1f5f9] text-base font-bold mb-3">Motor count</p>
            <div className="flex gap-2">
              {[2, 4, 6, 8].map((n) => (
                <button key={n} onClick={() => onChange({ ...config, motorCount: n })}
                  className={`flex-1 py-3 rounded-xl border-2 text-base font-bold transition-all ${motorCount === n ? 'bg-amber-900/40 border-amber-400 text-amber-200' : 'bg-[#0f172a] border-[#334155] text-[#94a3b8] hover:border-[#475569]'}`}>
                  {n}
                </button>
              ))}
            </div>
            {motorCount > 2 && <p className="text-[#64748b] text-sm mt-2">4+ motors: use Y-splitters. Group left-side motors → CH3, right-side motors → CH{rightCh}.</p>}
          </div>
          <div>
            <p className="text-[#f1f5f9] text-base font-bold mb-3">Right motor channel</p>
            <div className="flex gap-2">
              {[5, 6, 7, 8].map((ch) => (
                <button key={ch} onClick={() => onChange({ ...config, rightCh: ch })}
                  className={`flex-1 py-3 rounded-xl border-2 text-base font-bold transition-all ${rightCh === ch ? 'bg-amber-900/40 border-amber-400 text-amber-200' : 'bg-[#0f172a] border-[#334155] text-[#94a3b8] hover:border-[#475569]'}`}>
                  CH{ch}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[#f1f5f9] text-base font-bold mb-3">Prop direction</p>
            <div className="flex gap-2">
              {([
                { val: 'counter', label: 'Counter-rotating', hint: 'Preferred — torque cancels' },
                { val: 'same', label: 'Same direction', hint: 'Needs rudder trim after first flight' },
              ] as const).map(({ val, label, hint }) => (
                <button key={val} onClick={() => onChange({ ...config, propDir: val })}
                  className={`flex-1 flex flex-col items-start p-3 rounded-xl border-2 text-left transition-all ${propDir === val ? 'bg-amber-900/40 border-amber-400' : 'bg-[#0f172a] border-[#334155] hover:border-[#475569]'}`}>
                  <span className={`text-sm font-bold ${propDir === val ? 'text-amber-200' : 'text-[#f1f5f9]'}`}>{label}</span>
                  <span className={`text-xs mt-0.5 ${propDir === val ? 'text-amber-300/80' : 'text-[#64748b]'}`}>{hint}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[#f1f5f9] text-base font-bold">Differential %</span>
              <span className="text-amber-300 text-xl font-black">{weight}%</span>
            </div>
            <input type="range" min={10} max={60} step={1} value={weight} onChange={(e) => onChange({ ...config, weight: Number(e.target.value) })} className="w-full accent-amber-500" />
            <div className="flex justify-between text-sm text-[#475569] mt-1">
              <span>10% — subtle</span>
              <span>60% — aggressive</span>
            </div>
            {weight > 40 && <Warn>{weight}% is high. Above 40% can cause snap rolls on trainer-style aircraft.</Warn>}
          </div>
        </div>
        <MixTable rows={rows} />
        <div className="bg-red-950/30 border border-red-800/50 rounded-2xl p-5 space-y-3">
          <p className="text-red-200 text-base font-bold">Mandatory Ground Test</p>
          <p className="text-red-300/70 text-sm">Check all five before you fly. Do this every time you change the setting.</p>
          <div className="space-y-3">
            {DIFF_CHECKLIST.map((item, i) => (
              <label key={i} className="flex items-start gap-3 cursor-pointer group">
                <div onClick={() => toggle(i)}
                  className={`mt-0.5 w-6 h-6 shrink-0 rounded-lg border-2 flex items-center justify-center transition-all ${checked[i] ? 'bg-green-600 border-green-500' : 'border-[#475569] group-hover:border-[#64748b]'}`}>
                  {checked[i] && <span className="text-white text-xs font-black">✓</span>}
                </div>
                <span className={`text-base ${checked[i] ? 'text-[#475569] line-through' : 'text-[#cbd5e1]'}`}>{item}</span>
              </label>
            ))}
          </div>
        </div>
        <NavRow onBack={onBack} onNext={onNext} onSkip={onSkip}
          nextLabel={allChecked ? 'Apply differential thrust →' : `Complete checklist (${checked.filter(Boolean).length}/${DIFF_CHECKLIST.length})`}
          nextDisabled={!allChecked} />
      </div>
    </div>
  )
}

// ─── Step: Conventional — Flap-to-Elevator Compensation (optional) ───────────

const FLAP_STAGE_LABELS: Record<number, string[]> = {
  2: ['Up', 'Down'],
  3: ['Up', 'Half', 'Full'],
  4: ['Up', 'T/O', 'Land', 'Full'],
  5: ['Up', 'T/O', 'Cruise', 'Land', 'Full'],
}

const FLAP_ELE_PRESETS = [
  { label: 'Light',  hint: 'Slow trainer',   values: [0, 4,  8,  11, 13] },
  { label: 'Sport',  hint: 'Sport / warbird', values: [0, 6,  11, 15, 18] },
  { label: 'Heavy',  hint: 'Large flaps',     values: [0, 8,  14, 19, 22] },
]

function buildDefaultFlapComps(n: number): number[] {
  const defaults: Record<number, number[]> = {
    2: [0, 10],
    3: [0, 6, 11],
    4: [0, 5, 9, 13],
    5: [0, 4, 7, 11, 14],
  }
  return defaults[n] ?? Array(n).fill(0).map((_, i) => Math.round(i * 10 / (n - 1)))
}

function StepConvFlapEle({
  initialComps, onApply, onBack, onSkip,
}: {
  initialComps: number[] | null
  onApply: (comps: number[], deploySeconds: number) => void
  onBack: () => void
  onSkip: () => void
}): JSX.Element {
  const initN = (initialComps && initialComps.length >= 2) ? initialComps.length : 3
  const [stages, setStages] = useState(initN)
  const [comps, setComps] = useState<number[]>(initialComps ?? buildDefaultFlapComps(3))
  const [slowEnabled, setSlowEnabled] = useState(true)
  const [deploySeconds, setDeploySeconds] = useState(3)

  const changeStages = (n: number): void => {
    setStages(n)
    setComps(buildDefaultFlapComps(n))
  }

  const setComp = (i: number, v: number): void =>
    setComps((prev) => prev.map((c, idx) => idx === i ? v : c))

  const labels = FLAP_STAGE_LABELS[stages] ?? FLAP_STAGE_LABELS[3]

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Banner
        step="Step 6 of 8 · Optional"
        label="Flap-to-Elevator Comp"
        sub="Sets up-elevator compensation for each flap stage. Skip if you have no flaps."
      />
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

        <div className="bg-[#0f172a] border border-[#334155] rounded-2xl p-5 space-y-3">
          <p className="text-[#f1f5f9] text-lg font-bold">What this does</p>
          <p className="text-[#94a3b8] text-base leading-relaxed">
            Flaps pitch the nose <span className="text-red-400 font-bold">down</span>.
            Each stage gets its own fixed <span className="text-amber-300 font-bold">up-elevator offset</span> —
            so half-flap gets less compensation than full-flap. Set each one independently.
          </p>
        </div>

        {/* Stage count */}
        <div className="bg-[#0f172a] border border-[#334155] rounded-2xl p-5 space-y-3">
          <p className="text-[#f1f5f9] text-base font-bold">How many flap stages?</p>
          <div className="flex gap-2">
            {[2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => changeStages(n)}
                className={`flex-1 py-3 rounded-xl border-2 text-base font-bold transition-all ${
                  stages === n
                    ? 'bg-amber-900/40 border-amber-400 text-amber-200'
                    : 'bg-[#0f172a] border-[#334155] text-[#94a3b8] hover:border-[#475569]'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="text-[#475569] text-xs">{(FLAP_STAGE_LABELS[stages] ?? FLAP_STAGE_LABELS[3]).join(' → ')}</p>
        </div>

        {/* Presets */}
        <div className="grid grid-cols-3 gap-2">
          {FLAP_ELE_PRESETS.map(({ label, hint, values }) => (
            <button key={label}
              onClick={() => setComps(values.slice(0, stages))}
              className="flex flex-col items-center p-3 rounded-xl border-2 border-[#334155] hover:border-amber-400/60 bg-[#0f172a] transition-all"
            >
              <span className="text-sm font-bold text-[#f1f5f9]">{label}</span>
              <span className="text-xs text-[#64748b] mt-0.5">{hint}</span>
            </button>
          ))}
        </div>

        {/* Per-stage sliders */}
        <div className="bg-[#0f172a] border border-[#334155] rounded-2xl p-5 space-y-5">
          {Array.from({ length: stages }, (_, i) => {
            const label = labels[i] ?? `Stage ${i + 1}`
            const isUp = i === 0
            const val = comps[i] ?? 0
            return (
              <div key={i} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className={`text-sm font-bold ${isUp ? 'text-[#475569]' : 'text-[#f1f5f9]'}`}>
                      Stage {i + 1} — {label}
                    </span>
                    {isUp && <span className="text-[#334155] text-xs ml-2">always 0</span>}
                  </div>
                  <span className={`text-xl font-black ${isUp ? 'text-[#334155]' : 'text-amber-300'}`}>
                    {val}%
                  </span>
                </div>
                {!isUp && (
                  <input
                    type="range" min={0} max={25} step={1}
                    value={val}
                    onChange={(e) => setComp(i, Number(e.target.value))}
                    className="w-full accent-amber-500" style={{ height: 6 }}
                  />
                )}
                {isUp && <div className="h-1 bg-[#1a3050] rounded-full" />}
              </div>
            )
          })}
        </div>

        {/* Deployment speed */}
        <div className="bg-[#0f172a] border border-[#334155] rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[#f1f5f9] text-base font-bold">Flap Deployment Speed</p>
              <p className="text-[#64748b] text-sm mt-0.5">Slow deploy prevents pitch upsets. Both flap and elevator compensation ramp together.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {([
              { val: false, label: 'Instant', icon: '⚡', desc: 'Snap to position — no ramp' },
              { val: true,  label: 'Slow deploy', icon: '🪂', desc: 'Ramp over 1–5 seconds' },
            ] as const).map(({ val, label, icon, desc }) => (
              <button key={String(val)} type="button" style={{ touchAction: 'manipulation' }}
                onClick={() => setSlowEnabled(val)}
                className={`flex flex-col items-start p-4 rounded-2xl border-2 text-left transition-all active:scale-95 ${
                  slowEnabled === val
                    ? 'bg-amber-900/30 border-amber-400'
                    : 'bg-[#0a1628] border-[#475569] hover:border-[#64748b]'
                }`}>
                {slowEnabled === val && <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-amber-400 flex items-center justify-center text-black text-xs font-black">✓</span>}
                <span className="text-2xl mb-1">{icon}</span>
                <span className={`text-sm font-bold ${slowEnabled === val ? 'text-amber-200' : 'text-[#f1f5f9]'}`}>{label}</span>
                <span className={`text-xs mt-0.5 leading-snug ${slowEnabled === val ? 'text-amber-300/80' : 'text-[#64748b]'}`}>{desc}</span>
              </button>
            ))}
          </div>
          {slowEnabled && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[#f1f5f9] text-sm font-bold">Deploy & retract time</span>
                <span className="text-amber-300 text-xl font-black">{deploySeconds}s</span>
              </div>
              <input type="range" min={1} max={5} step={1} value={deploySeconds}
                onChange={(e) => setDeploySeconds(Number(e.target.value))}
                className="w-full accent-amber-500" style={{ height: 6 }} />
              <div className="flex justify-between text-xs text-[#475569]">
                <span>1s — quick</span><span>3s — standard</span><span>5s — very slow</span>
              </div>
              <p className="text-[#475569] text-xs leading-relaxed pt-1">
                Applied to both the flap channel and elevator compensation — they ramp together so the nose stays level throughout deployment.
              </p>
            </div>
          )}
        </div>

        {/* Preview */}
        <div className="bg-[#0a1628] border border-[#1a3050] rounded-2xl p-4 space-y-1.5">
          <p className="text-amber-300 text-xs font-bold uppercase tracking-wider mb-2">Mix lines generated</p>
          {comps.map((comp, i) => i > 0 && comp > 0 && (
            <p key={i} className="text-[#94a3b8] text-sm font-mono">
              {labels[i] ?? `Stage ${i + 1}`} (SE{i}): ELE += {comp}% up
            </p>
          ))}
          {comps.slice(1).every(v => v === 0) && (
            <p className="text-[#475569] text-sm">Set at least one stage above 0% to generate a mix.</p>
          )}
          <p className="text-[#334155] text-xs mt-2 leading-relaxed">
            Test on the ground: cycle through each flap stage and check that the nose stays level.
          </p>
        </div>

        <NavRow
          onBack={onBack}
          onNext={() => onApply(comps, slowEnabled ? deploySeconds : 0)}
          onSkip={onSkip}
          nextLabel="Apply →"
        />
      </div>
    </div>
  )
}

// ─── Step: Conventional — Throttle-to-Rudder / P-Factor (optional) ────────────

function StepConvThrRud({
  initialPct, onApply, onBack, onSkip,
}: {
  initialPct: number
  onApply: (v: number) => void
  onBack: () => void
  onSkip: () => void
}): JSX.Element {
  const [pct, setPct] = useState(initialPct)
  const presets = [
    { label: 'Electric', p: 5,  desc: 'Small motors' },
    { label: 'Gas/Glow', p: 10, desc: 'Noticeable pull' },
    { label: 'High pwr', p: 15, desc: 'Big engine' },
  ]
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Banner
        step="Step 7 of 8 · Optional"
        label="Throttle-to-Rudder Mix"
        sub="Auto-corrects prop torque on climb-out. Skip for electrics with little torque effect."
      />
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

        <div className="bg-[#0f172a] border border-[#334155] rounded-2xl p-5 space-y-3">
          <p className="text-[#f1f5f9] text-lg font-bold">What this does</p>
          <p className="text-[#94a3b8] text-base leading-relaxed">
            A spinning prop creates torque that pulls the nose <span className="text-red-400 font-bold">left</span> at high power (standard right-rotating prop).
            This mix feeds in automatic <span className="text-amber-300 font-bold">right rudder</span> proportional to throttle position.
          </p>
          <p className="text-[#94a3b8] text-base leading-relaxed">
            Result: straighter climb-outs without your thumb holding rudder the whole way up.
          </p>
        </div>

        <div className="bg-[#0f172a] border border-[#334155] rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[#f1f5f9] text-lg font-bold">Rudder at full throttle</span>
            <span className="text-amber-300 text-2xl font-black">{pct}%</span>
          </div>
          <input
            type="range" min={0} max={20} step={1} value={pct}
            onChange={(e) => setPct(Number(e.target.value))}
            className="w-full accent-amber-500" style={{ height: 6 }}
          />
          <div className="flex justify-between text-sm text-[#475569]">
            <span>0% — none</span>
            <span>20% — max</span>
          </div>
          <div className="grid grid-cols-3 gap-2 pt-1">
            {presets.map(({ label, p, desc }) => (
              <button key={label} onClick={() => setPct(p)}
                className={`flex flex-col items-center p-3 rounded-xl border-2 transition-all ${
                  pct === p ? 'bg-amber-900/40 border-amber-400' : 'bg-[#0f172a] border-[#334155] hover:border-[#475569]'
                }`}>
                <span className={`text-sm font-bold ${pct === p ? 'text-amber-200' : 'text-[#f1f5f9]'}`}>{label}</span>
                <span className={`text-xs mt-0.5 ${pct === p ? 'text-amber-300' : 'text-[#64748b]'}`}>{p}%</span>
                <span className={`text-xs mt-0.5 text-center leading-tight ${pct === p ? 'text-amber-300/70' : 'text-[#475569]'}`}>{desc}</span>
              </button>
            ))}
          </div>
        </div>

        <Warn>
          For a <span className="font-bold">left-rotating prop</span>, the plane will yaw right at high throttle instead. Set this to 0 and add left rudder manually, or note it during the maiden flight.
        </Warn>

        <div className="bg-[#0a1628] border border-[#1a3050] rounded-2xl p-4 space-y-1">
          <p className="text-amber-300 text-xs font-bold uppercase tracking-wider mb-2">Mix line generated</p>
          <p className="text-[#94a3b8] text-sm font-mono">RUD += Throttle × {pct}%</p>
          <p className="text-[#475569] text-xs mt-2 leading-relaxed">
            Start small and maiden first. Add more if the plane still pulls left on climb-out.
          </p>
        </div>

        <NavRow
          onBack={onBack}
          onNext={() => onApply(pct)}
          onSkip={onSkip}
          nextLabel="Apply →"
        />
      </div>
    </div>
  )
}

// ─── Step: Conventional — Reverse Thrust (optional) ──────────────────────────

function StepConvRevThrust({
  selected, onSelect, onApply, onBack, onSkip, usedBy = {},
}: {
  selected: string | null
  onSelect: (id: string) => void
  onApply: (sw: string) => void
  onBack: () => void
  onSkip: () => void
  usedBy?: Record<string, string>
}): JSX.Element {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Banner
        step="Step 8 of 8 · Optional"
        label="Reverse Thrust"
        sub="Ground braking and back-taxiing. Requires your ESC to be programmed for bi-directional operation first."
      />
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

        <div className="bg-[#0f172a] border border-[#334155] rounded-2xl p-5 space-y-3">
          <p className="text-[#f1f5f9] text-lg font-bold">How it works</p>
          <p className="text-[#94a3b8] text-base leading-relaxed">
            Reverse runs on <span className="text-amber-300 font-bold">Channel 3</span> — no extra channel needed.
            The switch you pick activates it. A <span className="text-amber-300 font-bold">throttle-at-idle safety gate</span> is
            generated automatically — the switch does nothing unless the throttle stick is already at the bottom.
            This prevents accidental reverse engagement in the air.
          </p>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div className="bg-[#0a1628] border border-[#1a3050] rounded-xl p-3 text-center">
              <p className="text-sm text-[#475569] font-semibold mb-1">Switch ON + idle</p>
              <p className="text-red-400 text-base font-black">REVERSE</p>
              <p className="text-[#475569] text-xs mt-1">Motor brakes / backs up</p>
            </div>
            <div className="bg-[#0a1628] border border-[#1a3050] rounded-xl p-3 text-center">
              <p className="text-sm text-[#475569] font-semibold mb-1">Switch ON + throttle up</p>
              <p className="text-green-400 text-base font-black">BLOCKED</p>
              <p className="text-[#475569] text-xs mt-1">Safety gate prevents it</p>
            </div>
          </div>
        </div>

        <Warn>
          <span>
            <span className="font-bold">ESC must be programmed for bi-directional mode first.</span>{' '}
            For E-Flite Smart ESCs: use a Spektrum NX/iX transmitter (one-time setup) or the{' '}
            <span className="font-bold">SPM6750 programmer (~$35)</span>.
            For Castle Creations: Castle Link USB. For Hobbywing: programming card.
            Once set in the ESC, this config makes it work from any transmitter.
          </span>
        </Warn>

        <div className="space-y-3">
          <div>
            <p className="text-[#f1f5f9] text-lg font-bold">Pick your reverse switch</p>
            <p className="text-[#64748b] text-sm mt-1">
              A 2-position switch you won't accidentally hit during normal flight.
              {selected && <span className="text-amber-300 font-bold ml-2">{selected} selected ✓</span>}
            </p>
          </div>
          <ControlPicker selected={selected ?? ''} onSelect={onSelect} usedBy={usedBy} />
          <RadioDiagram selected={selected ?? ''} onSelect={onSelect} usedBy={usedBy} />
        </div>

        {selected && (
          <div className="bg-[#0a1628] border border-[#1a3050] rounded-2xl p-4 space-y-2">
            <p className="text-[#f1f5f9] text-sm font-bold">What gets generated:</p>
            <p className="text-[#94a3b8] text-sm font-mono">
              Logical Switch L01: Thr &lt; −90 AND {selected} = pos 1
            </p>
            <p className="text-[#94a3b8] text-sm font-mono">
              Special Function: L01 → Override CH3 = −100
            </p>
            <p className="text-[#475569] text-xs mt-1 leading-relaxed">
              The idle gate (Thr &lt; −90) means the switch only works when the throttle stick is already at the bottom stop.
            </p>
          </div>
        )}

        <NavRow
          onBack={onBack}
          onNext={() => selected && onApply(selected)}
          onSkip={onSkip}
          nextLabel="Apply →"
          nextDisabled={!selected}
        />
      </div>
    </div>
  )
}

// ─── Step: Landing Gear ────────────────────────────────────────────────────────

function StepLandingGear({
  selected, onSelect, channel, onChannelChange, onNext, onBack, onSkip, usedBy = {},
}: {
  selected: string | null
  onSelect: (id: string) => void
  channel: number
  onChannelChange: (ch: number) => void
  onNext: () => void
  onBack: () => void
  onSkip: () => void
  usedBy?: Record<string, string>
}): JSX.Element {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Banner
        step="Final Step · Optional"
        label="Landing Gear"
        sub="A 2-position switch that retracts or deploys your gear. Direct channel routing — no logical mix needed."
      />
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

        <div className="bg-[#0f172a] border border-[#334155] rounded-2xl p-5 space-y-3">
          <p className="text-[#f1f5f9] text-base font-bold mb-1">Gear channel</p>
          <div className="flex gap-2">
            {[5, 6, 7, 8].map((ch) => (
              <button
                key={ch}
                onClick={() => onChannelChange(ch)}
                className={`flex-1 py-3 rounded-xl border-2 text-base font-bold transition-all ${
                  channel === ch
                    ? 'bg-amber-900/40 border-amber-400 text-amber-200'
                    : 'bg-[#0a1628] border-[#1a3050] text-[#94a3b8] hover:border-[#334155]'
                }`}
              >
                CH{ch}
              </button>
            ))}
          </div>
          <p className="text-[#64748b] text-xs">CH7 is the common default if your radio's left it free.</p>
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-[#f1f5f9] text-lg font-bold">Pick your gear switch</p>
            <p className="text-[#64748b] text-sm mt-1">
              A 2-position switch you'd notice instantly if flipped by accident.
              {selected && <span className="text-amber-300 font-bold ml-2">{selected} selected ✓</span>}
            </p>
          </div>
          <ControlPicker selected={selected ?? ''} onSelect={onSelect} usedBy={usedBy} />
          <RadioDiagram selected={selected ?? ''} onSelect={onSelect} usedBy={usedBy} />
        </div>

        {selected && (
          <div className="bg-[#0a1628] border border-[#1a3050] rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-green-400 text-base">✓</span>
              <p className="text-green-300 text-sm font-bold">Written into your model file automatically.</p>
            </div>
            <p className="text-[#94a3b8] text-sm font-mono">{selected} → direct routing to CH{channel}</p>
            <p className="text-[#475569] text-xs leading-relaxed">
              No logical switch needed — the gear servo/retract unit follows the switch position 1:1.
            </p>
          </div>
        )}

        <NavRow
          onBack={onBack}
          onNext={onNext}
          onSkip={onSkip}
          nextLabel="Next →"
          nextDisabled={!selected}
        />
      </div>
    </div>
  )
}

// ─── Step: Summary ────────────────────────────────────────────────────────────

function StepSummary({
  airframe, elevon, vTail, diffThrust, diffAileron, throttleCutSwitch, throttleCutMode, flapEleComps, thrRudMix, revThrustSwitch, landingGear, onFinish, onBack,
}: {
  airframe: AirframeType | null
  elevon?: ElevonConfig
  vTail?: VTailConfig
  diffThrust?: DiffThrustConfig
  diffAileron?: number
  throttleCutSwitch?: string
  throttleCutMode?: 'always' | 'idleGate'
  flapEleComps?: number[]
  thrRudMix?: number
  revThrustSwitch?: string
  landingGear?: { switchId: string; channel: number }
  onFinish: () => void
  onBack: () => void
}): JSX.Element {
  const af = AIRFRAMES.find((a) => a.type === airframe)
  const isConventional = airframe === 'conventional' || airframe === 'glider' || airframe === 'efJet'

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 bg-[#060e1a] border-b border-[#1a3050] px-5 py-4">
        <span className="text-amber-400 text-xs font-bold uppercase tracking-widest">Mix Wizard · Done</span>
        <p className="text-[#f1f5f9] text-xl font-bold mt-1">Here's your setup.</p>
        <p className="text-[#64748b] text-sm mt-0.5">Review this, then tap Finish. You can always re-run the wizard.</p>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">

        {af && (
          <div className="flex items-center gap-4 bg-[#0f172a] border border-[#334155] rounded-2xl px-5 py-4">
            <span className="text-4xl">{af.icon}</span>
            <div>
              <p className="text-[#f1f5f9] text-lg font-bold">{af.label}</p>
              <p className="text-[#64748b] text-sm">{af.desc}</p>
            </div>
          </div>
        )}

        {/* Conventional summary */}
        {isConventional && (
          <div className="space-y-3">
            {diffAileron !== undefined && diffAileron > 0 && (
              <div className="bg-[#0a1628] border border-[#1a3050] rounded-2xl p-5">
                <p className="text-amber-300 text-sm font-bold uppercase tracking-wider mb-2">Differential Aileron</p>
                <p className="text-[#f1f5f9] text-lg font-black mb-1">{diffAileron}% differential</p>
                <p className="text-[#94a3b8] text-sm leading-relaxed">
                  Up aileron travels {diffAileron}% farther than down aileron.
                </p>
                <div className="bg-[#060e1a] border border-[#1a3050] rounded-xl p-3 mt-3">
                  <p className="text-amber-300 text-xs font-bold mb-1">Set on your radio — BOTH channels:</p>
                  <p className="text-[#94a3b8] text-sm">
                    Outputs → CH1 → <span className="text-amber-300 font-bold">Diff: {diffAileron}%</span>
                  </p>
                  <p className="text-[#94a3b8] text-sm mt-1">
                    Outputs → CH2 → <span className="text-amber-300 font-bold">Diff: {diffAileron}%</span>
                  </p>
                  <p className="text-red-300 text-xs font-bold mt-2">
                    Requires 2 separate aileron channels. Set Diff on only one and the wings won't match — one
                    aileron will have more up-vs-down travel than the other.
                  </p>
                </div>
              </div>
            )}
            {diffAileron === 0 && (
              <div className="bg-[#0a1628] border border-[#1a3050] rounded-2xl p-5">
                <p className="text-amber-300 text-sm font-bold uppercase tracking-wider mb-1">Differential Aileron</p>
                <p className="text-[#64748b] text-sm">Skipped — no differential set.</p>
              </div>
            )}
            {throttleCutSwitch && (
              <div className="bg-[#0a1628] border border-[#1a3050] rounded-2xl p-5">
                <p className="text-amber-300 text-sm font-bold uppercase tracking-wider mb-2">Throttle Cut</p>
                <p className="text-[#f1f5f9] text-lg font-black mb-1">Switch {throttleCutSwitch}</p>
                <p className="text-[#94a3b8] text-sm leading-relaxed mb-2">
                  {throttleCutMode === 'idleGate'
                    ? 'Idle gate — switch only works when throttle stick is at idle.'
                    : 'Cut anytime — flip the switch and motor stops immediately.'}
                </p>
                <div className="bg-[#060e1a] border border-[#1a3050] rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-green-400 text-sm">✓</span>
                    <p className="text-green-300 text-xs font-bold">Written into your model file automatically.</p>
                  </div>
                  {throttleCutMode === 'idleGate' ? (
                    <>
                      <p className="text-[#94a3b8] text-sm font-mono">L01: Thr &lt; −90 AND {throttleCutSwitch}↑</p>
                      <p className="text-[#94a3b8] text-sm font-mono">L01 → Override CH3 = −100</p>
                    </>
                  ) : (
                    <p className="text-[#94a3b8] text-sm font-mono">{throttleCutSwitch}↑ → Override CH3 = −100</p>
                  )}
                </div>
              </div>
            )}
            {flapEleComps && flapEleComps.some((v, i) => i > 0 && v > 0) ? (
              <div className="bg-[#0a1628] border border-[#1a3050] rounded-2xl p-5">
                <p className="text-amber-300 text-sm font-bold uppercase tracking-wider mb-3">Flap-to-Elevator Comp</p>
                <div className="space-y-1.5">
                  {flapEleComps.map((comp, i) => {
                    if (i === 0 || comp === 0) return null
                    const labels = FLAP_STAGE_LABELS[flapEleComps.length] ?? FLAP_STAGE_LABELS[3]
                    return (
                      <div key={i} className="flex items-center justify-between">
                        <span className="text-[#94a3b8] text-sm">Stage {i + 1} — {labels[i] ?? `SE${i}`}</span>
                        <span className="text-amber-300 text-sm font-mono font-bold">+{comp}% up</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="bg-[#0a1628] border border-[#1a3050] rounded-2xl p-5">
                <p className="text-amber-300 text-sm font-bold uppercase tracking-wider mb-1">Flap-to-Elevator Comp</p>
                <p className="text-[#64748b] text-sm">Skipped.</p>
              </div>
            )}
            {thrRudMix !== undefined ? (
              <div className="bg-[#0a1628] border border-[#1a3050] rounded-2xl p-5">
                <p className="text-amber-300 text-sm font-bold uppercase tracking-wider mb-2">Throttle-to-Rudder Mix</p>
                <p className="text-[#f1f5f9] text-lg font-black mb-1">{thrRudMix}% right rudder at full throttle</p>
                <p className="text-[#94a3b8] text-sm font-mono">RUD += Throttle × {thrRudMix}%</p>
              </div>
            ) : (
              <div className="bg-[#0a1628] border border-[#1a3050] rounded-2xl p-5">
                <p className="text-amber-300 text-sm font-bold uppercase tracking-wider mb-1">Throttle-to-Rudder Mix</p>
                <p className="text-[#64748b] text-sm">Skipped.</p>
              </div>
            )}
            {revThrustSwitch ? (
              <div className="bg-[#0a1628] border border-[#1a3050] rounded-2xl p-5">
                <p className="text-amber-300 text-sm font-bold uppercase tracking-wider mb-2">Reverse Thrust</p>
                <p className="text-[#f1f5f9] text-lg font-black mb-1">Switch {revThrustSwitch}</p>
                <p className="text-[#94a3b8] text-sm leading-relaxed">
                  Idle gate + {revThrustSwitch} pos 1 → CH3 override to −100.
                </p>
                <div className="bg-[#060e1a] border border-[#1a3050] rounded-xl p-3 mt-3">
                  <p className="text-amber-300 text-xs font-bold mb-1">Requires ESC programming:</p>
                  <p className="text-[#94a3b8] text-sm">
                    Set ESC to bi-directional mode via Spektrum NX/iX transmitter or SPM6750 programmer.
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-[#0a1628] border border-[#1a3050] rounded-2xl p-5">
                <p className="text-amber-300 text-sm font-bold uppercase tracking-wider mb-1">Reverse Thrust</p>
                <p className="text-[#64748b] text-sm">Skipped.</p>
              </div>
            )}
          </div>
        )}

        {/* Elevon summary */}
        {elevon && (
          <div className="bg-[#0a1628] border border-[#1a3050] rounded-2xl p-5 space-y-3">
            <p className="text-amber-300 text-sm font-bold uppercase tracking-wider">Elevon Mix Applied</p>
            <MixTable rows={[
              { dest: 'CH1 (left elevon)',  src: 'Ail', weight: `+${elevon.weight}%` },
              { dest: 'CH1 (left elevon)',  src: 'Ele', weight: `+${elevon.weight}%` },
              { dest: 'CH2 (right elevon)', src: 'Ail', weight: `-${elevon.weight}%` },
              { dest: 'CH2 (right elevon)', src: 'Ele', weight: `+${elevon.weight}%` },
            ]} />
            <p className="text-[#64748b] text-sm">CH1 and CH2 direct routing cleared — mixes now own those channels.</p>
          </div>
        )}

        {/* V-tail summary */}
        {vTail && (
          <div className="bg-[#0a1628] border border-[#1a3050] rounded-2xl p-5 space-y-3">
            <p className="text-amber-300 text-sm font-bold uppercase tracking-wider">V-Tail Mix Applied</p>
            <MixTable rows={[
              { dest: 'CH2 (left ruddervator)',  src: 'Ele', weight: `+${vTail.eleWeight}%` },
              { dest: 'CH2 (left ruddervator)',  src: 'Rud', weight: `+${vTail.rudWeight}%` },
              { dest: 'CH4 (right ruddervator)', src: 'Ele', weight: `+${vTail.eleWeight}%` },
              { dest: 'CH4 (right ruddervator)', src: 'Rud', weight: `-${vTail.rudWeight}%` },
            ]} />
            <p className="text-[#64748b] text-sm">CH2 and CH4 direct routing cleared.</p>
          </div>
        )}

        {/* Diff thrust summary */}
        {diffThrust && (
          <div className="bg-[#0a1628] border border-[#1a3050] rounded-2xl p-5 space-y-3">
            <p className="text-amber-300 text-sm font-bold uppercase tracking-wider">Differential Thrust Applied</p>
            <MixTable rows={[
              { dest: 'CH3 (left motor)',                   src: 'Rud', weight: `+${diffThrust.weight}%` },
              { dest: `CH${diffThrust.rightCh} (right motor)`, src: 'Thr', weight: '+100%' },
              { dest: `CH${diffThrust.rightCh} (right motor)`, src: 'Rud', weight: `-${diffThrust.weight}%` },
            ]} />
            <p className="text-[#64748b] text-sm">
              {diffThrust.propDir === 'same' ? 'Same-direction props: add 5–10% rudder trim after first flight.' : 'Counter-rotating: no torque correction needed.'}
            </p>
          </div>
        )}

        {/* Landing gear summary */}
        {landingGear && (
          <div className="bg-[#0a1628] border border-[#1a3050] rounded-2xl p-5 space-y-2">
            <p className="text-amber-300 text-sm font-bold uppercase tracking-wider">Landing Gear</p>
            <p className="text-[#f1f5f9] text-lg font-black">
              {landingGear.switchId} → CH{landingGear.channel}
            </p>
            <p className="text-[#64748b] text-sm">Direct channel routing — no logical switch needed.</p>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button onClick={onBack}
            className="px-5 py-3 rounded-2xl border border-[#334155] text-[#94a3b8] hover:text-[#f1f5f9] text-base font-semibold transition-all">
            ← Back
          </button>
          <button onClick={onFinish}
            className="flex-1 py-4 bg-[#22c55e] hover:bg-[#16a34a] text-white text-base font-bold rounded-2xl transition-colors shadow-lg shadow-green-900/30">
            Continue to Export →
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

export default function MixWizard({ onComplete, onSkip, rateSwitch }: Props): JSX.Element {
  const [step, setStep]               = useState<MixStep>('airframe')
  const [airframe, setAirframe]       = useState<AirframeType | null>(null)
  const [elevon, setElevon]           = useState<ElevonConfig>({ weight: 50 })
  const [vTail, setVTail]             = useState<VTailConfig>({ eleWeight: 50, rudWeight: 50 })
  const [diffThrust, setDiffThrust]   = useState<DiffThrustConfig>({ weight: 25, motorCount: 2, rightCh: 5, propDir: 'counter' })
  const [diffAileron, setDiffAileron] = useState(25)
  const [throttleCutSw,   setThrottleCutSw  ] = useState<string | null>(null)
  const [throttleCutMode, setThrottleCutMode] = useState<'always' | 'idleGate' | null>(null)
  const [flapEleComps, setFlapEleComps]       = useState<number[] | null>(null)
  const [thrRudMix,   setThrRudMix  ]         = useState<number | null>(null)
  const [revThrustSwitch, setRevThrustSwitch] = useState<string | null>(null)
  const [flapDeploySeconds, setFlapDeploySeconds] = useState(0)
  const [rateAnnouncements, setRateAnnouncements] = useState(false)
  const [flightTimerCfg, setFlightTimerCfg] = useState<FlightTimerCfg>({
    enabled: false, mode: 'up', duration: 10, trigger: 'throttle', switchId: null, minuteBeeps: true,
  })
  const [landingGearSw, setLandingGearSw]   = useState<string | null>(null)
  const [landingGearCh, setLandingGearCh]   = useState(7)

  const isConv = (af: AirframeType | null) =>
    af === 'conventional' || af === 'glider' || af === 'efJet'

  // Globally blocked switches (assigned outside this wizard)
  const globalUsedBy: Record<string, string> = {}
  if (rateSwitch) globalUsedBy[rateSwitch] = 'Rates'

  // Per-step usedBy: global + the OTHER functions' switches
  const ftUsedBy: Record<string, string> = { ...globalUsedBy }
  if (throttleCutSw) ftUsedBy[throttleCutSw] = 'Throttle Cut'
  if (revThrustSwitch) ftUsedBy[revThrustSwitch] = 'Reverse Thrust'
  if (landingGearSw) ftUsedBy[landingGearSw] = 'Landing Gear'

  const tcUsedBy: Record<string, string> = { ...globalUsedBy }
  if (revThrustSwitch) tcUsedBy[revThrustSwitch] = 'Reverse Thrust'
  if (flightTimerCfg.switchId) tcUsedBy[flightTimerCfg.switchId] = 'Flight Timer'
  if (landingGearSw) tcUsedBy[landingGearSw] = 'Landing Gear'

  const rtUsedBy: Record<string, string> = { ...globalUsedBy }
  if (throttleCutSw) rtUsedBy[throttleCutSw] = 'Throttle Cut'
  if (flightTimerCfg.switchId) rtUsedBy[flightTimerCfg.switchId] = 'Flight Timer'
  if (landingGearSw) rtUsedBy[landingGearSw] = 'Landing Gear'

  const lgUsedBy: Record<string, string> = { ...globalUsedBy }
  if (throttleCutSw) lgUsedBy[throttleCutSw] = 'Throttle Cut'
  if (revThrustSwitch) lgUsedBy[revThrustSwitch] = 'Reverse Thrust'
  if (flightTimerCfg.switchId) lgUsedBy[flightTimerCfg.switchId] = 'Flight Timer'

  // Deconflict: picking a switch for one function auto-clears it from the others
  const pickThrottleCutSw = (id: string) => {
    setThrottleCutSw(id)
    if (id && revThrustSwitch === id) setRevThrustSwitch(null)
    if (id && flightTimerCfg.switchId === id) setFlightTimerCfg(prev => ({ ...prev, switchId: null }))
    if (id && landingGearSw === id) setLandingGearSw(null)
  }
  const pickRevThrustSwitch = (id: string) => {
    setRevThrustSwitch(id)
    if (id && throttleCutSw === id) setThrottleCutSw(null)
    if (id && flightTimerCfg.switchId === id) setFlightTimerCfg(prev => ({ ...prev, switchId: null }))
    if (id && landingGearSw === id) setLandingGearSw(null)
  }
  const pickLandingGearSw = (id: string) => {
    setLandingGearSw(id)
    if (id && throttleCutSw === id) setThrottleCutSw(null)
    if (id && revThrustSwitch === id) setRevThrustSwitch(null)
    if (id && flightTimerCfg.switchId === id) setFlightTimerCfg(prev => ({ ...prev, switchId: null }))
  }
  const handleFlightTimerChange = (cfg: FlightTimerCfg) => {
    setFlightTimerCfg(cfg)
    if (cfg.switchId) {
      if (throttleCutSw === cfg.switchId) setThrottleCutSw(null)
      if (revThrustSwitch === cfg.switchId) setRevThrustSwitch(null)
      if (landingGearSw === cfg.switchId) setLandingGearSw(null)
    }
  }

  const buildResult = (): MixWizardResult => ({
    airframeType: airframe ?? 'conventional',
    elevon:      airframe === 'flyingWing' ? elevon : undefined,
    vTail:       airframe === 'vTail'      ? vTail  : undefined,
    diffThrust:  airframe === 'twinMotor'  ? diffThrust : undefined,
    diffAileron: isConv(airframe) ? diffAileron : undefined,
    throttleCutSwitch: throttleCutSw ?? undefined,
    throttleCutMode:   (throttleCutSw && throttleCutMode) ? throttleCutMode : undefined,
    flapEleComps: (isConv(airframe) && flapEleComps !== null) ? flapEleComps : undefined,
    thrRudMix:       (isConv(airframe) && thrRudMix       !== null) ? thrRudMix       : undefined,
    revThrustSwitch: (isConv(airframe) && revThrustSwitch)          ? revThrustSwitch : undefined,
    flapSlow: (isConv(airframe) && flapDeploySeconds > 0) ? { deploySeconds: flapDeploySeconds } : undefined,
    soundAnnouncements: { rateAnnouncements },
    flightTimer: flightTimerCfg.enabled ? {
      mode:         flightTimerCfg.mode,
      duration:     flightTimerCfg.duration,
      trigger:      flightTimerCfg.trigger,
      switchId:     (flightTimerCfg.trigger === 'switch' && flightTimerCfg.switchId) ? flightTimerCfg.switchId : undefined,
      minuteBeeps:  flightTimerCfg.minuteBeeps,
    } : undefined,
    landingGear: landingGearSw ? { switchId: landingGearSw, channel: landingGearCh } : undefined,
  })

  const afterAirframe = (): void => {
    if (!airframe) return
    setStep('soundStudio')
  }

  const afterSoundStudio = (): void => setStep('flightTimer')

  const afterFlightTimer = (): void => {
    if (!airframe) return
    if (isConv(airframe))           setStep('convDiffAil')
    else if (airframe === 'flyingWing') setStep('elevon')
    else if (airframe === 'vTail')      setStep('vtail')
    else if (airframe === 'twinMotor')  setStep('diffThrust')
    else setStep('landingGear')
  }

  const backFromStep = (): void => {
    if (step === 'soundStudio') {
      setStep('airframe')
    } else if (step === 'flightTimer') {
      setStep('soundStudio')
    } else if (step === 'convDiffAil' || step === 'elevon' || step === 'vtail' || step === 'diffThrust') {
      setStep('flightTimer')
    } else if (step === 'convThrottleCut') {
      setStep('convDiffAil')
    } else if (step === 'convFlapEle') {
      setStep('convThrottleCut')
    } else if (step === 'convThrRud') {
      setStep('convFlapEle')
    } else if (step === 'convRevThrust') {
      setStep('convThrRud')
    } else if (step === 'summary') {
      setStep('landingGear')
    } else if (step === 'landingGear') {
      if (isConv(airframe))               setStep('convRevThrust')
      else if (airframe === 'flyingWing') setStep('elevon')
      else if (airframe === 'vTail')      setStep('vtail')
      else if (airframe === 'twinMotor')  setStep('diffThrust')
      else setStep('flightTimer')
    }
  }

  if (step === 'airframe') return (
    <StepAirframe selected={airframe} onSelect={setAirframe} onNext={afterAirframe} onSkip={onSkip} />
  )

  if (step === 'soundStudio') return (
    <StepSoundStudio
      rateAnnouncements={rateAnnouncements}
      onToggleRate={setRateAnnouncements}
      onNext={afterSoundStudio}
      onBack={() => setStep('airframe')}
      onSkip={afterSoundStudio}
    />
  )

  if (step === 'flightTimer') return (
    <StepFlightTimer
      config={flightTimerCfg}
      onChange={handleFlightTimerChange}
      onNext={afterFlightTimer}
      onBack={() => setStep('soundStudio')}
      onSkip={() => { setFlightTimerCfg(prev => ({ ...prev, enabled: false })); afterFlightTimer() }}
      usedBy={ftUsedBy}
    />
  )

  if (step === 'convDiffAil') return (
    <StepConvDiffAil
      diff={diffAileron}
      onChange={setDiffAileron}
      onNext={() => setStep('convThrottleCut')}
      onBack={() => setStep('flightTimer')}
      onSkip={() => setStep('convThrottleCut')}
    />
  )

  if (step === 'convThrottleCut') return (
    <StepConvThrottleCut
      selected={throttleCutSw}
      onSelect={pickThrottleCutSw}
      mode={throttleCutMode}
      onModeSelect={setThrottleCutMode}
      onNext={() => setStep('convFlapEle')}
      onBack={() => setStep('convDiffAil')}
      onSkip={() => { setThrottleCutSw(null); setStep('convFlapEle') }}
      usedBy={tcUsedBy}
    />
  )

  if (step === 'convFlapEle') return (
    <StepConvFlapEle
      initialComps={flapEleComps}
      onApply={(comps, secs) => { setFlapEleComps(comps); setFlapDeploySeconds(secs); setStep('convThrRud') }}
      onBack={() => setStep('convThrottleCut')}
      onSkip={() => { setFlapEleComps(null); setFlapDeploySeconds(0); setStep('convThrRud') }}
    />
  )

  if (step === 'convThrRud') return (
    <StepConvThrRud
      initialPct={thrRudMix ?? 5}
      onApply={(v) => { setThrRudMix(v); setStep('convRevThrust') }}
      onBack={() => setStep('convFlapEle')}
      onSkip={() => { setThrRudMix(null); setStep('convRevThrust') }}
    />
  )

  if (step === 'convRevThrust') return (
    <StepConvRevThrust
      selected={revThrustSwitch}
      onSelect={pickRevThrustSwitch}
      onApply={(sw) => { pickRevThrustSwitch(sw); setStep('landingGear') }}
      onBack={() => setStep('convThrRud')}
      onSkip={() => { setRevThrustSwitch(null); setStep('landingGear') }}
      usedBy={rtUsedBy}
    />
  )

  if (step === 'elevon') return (
    <StepElevon config={elevon} onChange={setElevon}
      onNext={() => setStep('landingGear')} onBack={() => setStep('flightTimer')} onSkip={() => setStep('landingGear')} />
  )

  if (step === 'vtail') return (
    <StepVTail config={vTail} onChange={setVTail}
      onNext={() => setStep('landingGear')} onBack={() => setStep('flightTimer')} onSkip={() => setStep('landingGear')} />
  )

  if (step === 'diffThrust') return (
    <StepDiffThrust config={diffThrust} onChange={setDiffThrust}
      onNext={() => setStep('landingGear')} onBack={() => setStep('flightTimer')} onSkip={() => setStep('landingGear')} />
  )

  if (step === 'landingGear') return (
    <StepLandingGear
      selected={landingGearSw}
      onSelect={pickLandingGearSw}
      channel={landingGearCh}
      onChannelChange={setLandingGearCh}
      onNext={() => setStep('summary')}
      onBack={() => {
        if (isConv(airframe))               setStep('convRevThrust')
        else if (airframe === 'flyingWing') setStep('elevon')
        else if (airframe === 'vTail')      setStep('vtail')
        else if (airframe === 'twinMotor')  setStep('diffThrust')
        else setStep('flightTimer')
      }}
      onSkip={() => { setLandingGearSw(null); setStep('summary') }}
      usedBy={lgUsedBy}
    />
  )

  return (
    <StepSummary
      airframe={airframe}
      elevon={airframe === 'flyingWing' ? elevon : undefined}
      vTail={airframe === 'vTail' ? vTail : undefined}
      diffThrust={airframe === 'twinMotor' ? diffThrust : undefined}
      diffAileron={isConv(airframe) ? diffAileron : undefined}
      throttleCutSwitch={throttleCutSw ?? undefined}
      throttleCutMode={throttleCutSw ? throttleCutMode : undefined}
      flapEleComps={flapEleComps ?? undefined}
      thrRudMix={thrRudMix ?? undefined}
      revThrustSwitch={revThrustSwitch ?? undefined}
      landingGear={landingGearSw ? { switchId: landingGearSw, channel: landingGearCh } : undefined}
      onFinish={() => onComplete(buildResult())}
      onBack={backFromStep}
    />
  )
}
