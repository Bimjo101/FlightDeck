import { useState, useEffect } from 'react'
import { RCModel } from './ModelCard'
import AddModelModal from './AddModelModal'
import ForwardProgramming from './ForwardProgramming'
import RadioDashboard from './RadioDashboard'

type NewModel = Omit<RCModel, 'id' | 'created_at' | 'updated_at'>

interface ModelDetailProps {
  model: RCModel
  onBack: () => void
  onUpdate: (updated: RCModel) => void
}

type StepStatus = 'done' | 'not-started'

interface LogEntry {
  id: string
  date: string
  duration: string
  battery: string
  notes: string
}

interface LogForm {
  date: string
  duration: string
  battery: string
  notes: string
}

const STEP_DEFS: { title: string; subtitle: string }[] = [
  { title: 'Bind Your Receiver',    subtitle: 'Connect your radio to the plane' },
  { title: 'Set Your Channels',     subtitle: 'Map controls to receiver outputs' },
  { title: 'Stabilization (AS3X)', subtitle: 'Configure gyro gains & SAFE' },
  { title: 'Radio Studio',          subtitle: 'Channels, rates, flap mixes & voice' },
  { title: 'Program Your ESC',     subtitle: 'Configure your speed controller' },
  { title: 'Telemetry Sensors',    subtitle: 'Monitor battery, RPM & more' },
  { title: 'Pre-Flight Checklist', subtitle: 'Safety check before every flight' },
  { title: 'Flight Log',           subtitle: 'Record and review your sessions' },
]

const PREFLIGHT_ITEMS: string[] = [
  'Battery fully charged',
  'Receiver bound and responding',
  'Control surfaces moving correct direction',
  'Aileron — move stick right, right aileron goes UP',
  'Elevator — pull back, elevator goes UP',
  'Rudder — push right, rudder goes RIGHT',
  'Throttle — smooth from 0 to full',
  'CG checked — plane balances at correct point',
  'Props secure, no wobble',
  'Range check done',
]

const SENSORS: { name: string; icon: string }[] = [
  { name: 'Voltage',     icon: '🔋' },
  { name: 'RPM',         icon: '🌀' },
  { name: 'Temperature', icon: '🌡️' },
  { name: 'Current',     icon: '⚡' },
  { name: 'GPS',         icon: '🛰️' },
  { name: 'Airspeed',    icon: '💨' },
]

const DEFAULT_CH_FUNCTIONS = ['Aileron', 'Elevator', 'Throttle', 'Rudder', 'SAFE Select', '']
const STANDARD_CH_FUNCTIONS = ['Aileron', 'Elevator', 'Throttle', 'Rudder', 'SAFE Select', '']

interface BindGuide {
  icon: string
  color: string
  system: string
  steps: string[]
  tips: string[]
}

function getBindGuide(receiver: string, protocol: string): BindGuide {
  const rx    = receiver.toLowerCase()
  const proto = protocol.toLowerCase()

  // ── Spektrum AR / SR series ──────────────────────────────────────────────
  if (/^ar\d|^sr\d/.test(rx) || proto.includes('dsm')) {
    const isAR631Plus = rx.includes('ar631 plus') || rx.includes('ar631plus')
    const isSAFE      = /ar63[1-9]|ar636|ar8360|ar9350|ar10360|ar12360/.test(rx)
    return {
      icon:   '📡',
      color:  '#2563eb',
      system: 'Spektrum DSM',
      steps: [
        'Disconnect your plane\'s battery — power must be off',
        'Turn on your RadioMaster and confirm it\'s on the correct model slot',
        'Find the small BIND button on the side of your receiver',
        'Hold the BIND button down, then plug power into the plane — keep holding',
        'The orange LED flashes rapidly — that means it\'s in bind mode. Let go now',
        'On your RadioMaster: Model Setup → Internal RF → set mode to DSM → tap [Bind]',
        'The receiver LED goes solid orange — you\'re bound!',
        'Unplug the battery, wait 5 seconds, plug back in to confirm auto-reconnect',
      ],
      tips: [
        'If the LED flashes slowly or stays off, unplug and redo from step 3',
        'Internal RF mode must be DSM — not DSM_RX (that\'s trainer-cord mode)',
        ...(isAR631Plus ? ['AR631 Plus has AS3X + SAFE Select — go to Step 3 after this to set your gyro gains'] : []),
        ...(isSAFE && !isAR631Plus ? ['This receiver supports AS3X stabilization — configure it in Step 3'] : []),
      ],
    }
  }

  // ── FrSky ────────────────────────────────────────────────────────────────
  if (/xm\+|r-xsr|x8r|rx4r|r9 /.test(rx) || proto.includes('access') || proto.includes('d16') || proto.includes('d8')) {
    return {
      icon:   '🟠',
      color:  '#ea580c',
      system: 'FrSky',
      steps: [
        'Turn your transmitter OFF',
        'Find the F/S button on your receiver',
        'Hold F/S and plug power into the plane — keep holding until the LED blinks',
        'Now turn your RadioMaster ON',
        'On your RadioMaster: Model Setup → External RF → set to ACCESS or D16 → [Bind]',
        'LED goes solid green — you\'re bound!',
        'Power cycle the plane to confirm it reconnects on its own',
      ],
      tips: [
        'External RF module must be enabled — Internal RF won\'t reach FrSky receivers',
        'D8 is for older FrSky gear — use D16 or ACCESS for anything made after 2018',
      ],
    }
  }

  // ── ELRS ─────────────────────────────────────────────────────────────────
  if (/elrs|rp1|rp2|ep1|ep2|betafpv|happymodel|superd/.test(rx) || proto.includes('elrs')) {
    return {
      icon:   '⚡',
      color:  '#0891b2',
      system: 'ExpressLRS',
      steps: [
        'On your RadioMaster: go to System → Tools → ExpressLRS Lua script and open it',
        'In the Lua script, scroll to [Bind] and press it — radio enters bind mode for 60 seconds',
        'Plug power into your aircraft',
        'Hold the small button on your receiver for about 3 seconds — it blinks rapidly',
        'Both sync up — the Lua script shows "Connected"',
        'No power cycle needed — ELRS reconnects automatically on every boot',
      ],
      tips: [
        'TX and RX must be on the same ELRS firmware version — update both if you have issues',
        'Set your packet rate and power in the Lua script after binding',
        'ELRS retains bind info in the receiver — you only need to do this once',
      ],
    }
  }

  // ── Futaba ───────────────────────────────────────────────────────────────
  if (/r2008|r3008|r6208|r7008/.test(rx) || proto.includes('fasst') || proto.includes('s-fhss')) {
    return {
      icon:   '🔴',
      color:  '#dc2626',
      system: 'Futaba FASST / S-FHSS',
      steps: [
        'Turn your transmitter OFF',
        'Find the ID SET button on the receiver',
        'Hold ID SET and plug in receiver power — LED blinks slowly',
        'Turn your transmitter ON',
        'LED goes solid — you\'re bound!',
        'Power cycle the aircraft',
      ],
      tips: [
        'Futaba receivers lock to the transmitter\'s unique ID — one TX per receiver',
        'If using S-FHSS mode, confirm your TX module is set to S-FHSS not FASST',
      ],
    }
  }

  // ── FlySky ───────────────────────────────────────────────────────────────
  if (/fs-a|fs-x|fs-i/.test(rx) || proto.includes('fhss')) {
    return {
      icon:   '🟣',
      color:  '#7c3aed',
      system: 'FlySky',
      steps: [
        'Plug power into your aircraft — receiver enters bind mode automatically on first power-up',
        'On your transmitter: go to the bind menu',
        'Wait for the receiver LED to go solid — bound!',
        'Power cycle the aircraft',
      ],
      tips: [
        'If the receiver doesn\'t auto-bind, hold its BIND button while powering on',
      ],
    }
  }

  // ── Generic fallback ─────────────────────────────────────────────────────
  return {
    icon:   '📡',
    color:  '#374151',
    system: 'your receiver',
    steps: [
      'Turn your transmitter OFF',
      'Put your receiver into bind mode — usually hold a button while plugging in power (check your receiver\'s manual)',
      'Turn your transmitter ON and go to the bind menu in Model Setup',
      'Wait for the receiver LED to go solid',
      'Power cycle your aircraft to confirm it reconnects automatically',
    ],
    tips: [
      'Tip: set the Receiver Model in Edit (top right) and FlightDeck will show you exact steps next time',
    ],
  }
}

function getBrandAccent(brand?: string): string {
  switch (brand?.toLowerCase()) {
    case 'spektrum':  return '#2563eb'
    case 'futaba':    return '#dc2626'
    case 'frsky':     return '#ea580c'
    case 'graupner':  return '#16a34a'
    case 'flysky':    return '#7c3aed'
    case 'elrs':      return '#0891b2'
    default:          return '#374151'
  }
}

function getTypeIcon(type?: string): string {
  switch (type?.toLowerCase()) {
    case 'airplane':   return '✈️'
    case 'helicopter': return '🚁'
    case 'glider':     return '🛩️'
    case 'multirotor': return '🚀'
    case 'boat':       return '⛵'
    case 'car':        return '🏎️'
    default:           return '✈️'
  }
}

function ModelDetail({ model, onBack, onUpdate }: ModelDetailProps): JSX.Element {
  const [localModel, setLocalModel]           = useState<RCModel>(model)
  const [photoSrc, setPhotoSrc]               = useState<string | null>(null)
  const [showEdit, setShowEdit]               = useState(false)
  const [activeStep, setActiveStep]           = useState(() => {
    // Clear wizard key so the wizard always runs fresh when a model is opened
    localStorage.removeItem(`fd_wizard_${model.id}`)
    return 3  // open on Radio Studio by default
  })
  const [stepStatuses, setStepStatuses]       = useState<StepStatus[]>(Array(8).fill('not-started'))
  const [showLogModal, setShowLogModal]       = useState(false)
  const [flightLogs, setFlightLogs]           = useState<LogEntry[]>([])
  const [logForm, setLogForm]                 = useState<LogForm>({
    date:     new Date().toISOString().split('T')[0],
    duration: '',
    battery:  '',
    notes:    '',
  })
  const [preflightChecks, setPreflightChecks] = useState<boolean[]>(
    Array(PREFLIGHT_ITEMS.length).fill(false)
  )
  const [showChannelEdit, setShowChannelEdit] = useState(false)

  const accent   = getBrandAccent(localModel.brand)
  const icon     = getTypeIcon(localModel.type)
  const isActive = !localModel.status || localModel.status === 'active'

  useEffect(() => { setLocalModel(model) }, [model.id])

  useEffect(() => {
    if (localModel.photo_path) {
      window.api.photo.getDataUrl(localModel.photo_path).then(setPhotoSrc)
    } else {
      setPhotoSrc(null)
    }
  }, [localModel.photo_path])

  const handleEditSave = async (updated: NewModel): Promise<void> => {
    const result = await window.api.models.update({ ...updated, id: localModel.id })
    if (result) {
      setLocalModel(result)
      onUpdate(result)
    }
  }

  const handleFPSave = async (updates: Partial<RCModel>): Promise<void> => {
    const result = await window.api.models.update({ ...updates, id: localModel.id })
    if (result) {
      setLocalModel(result)
      onUpdate(result)
    }
  }

  const markDone = (index: number): void => {
    setStepStatuses(prev => {
      const next = [...prev]
      next[index] = 'done'
      return next
    })
    if (index < 7) setActiveStep(index + 1)
  }

  const channelFunctions: string[] = [
    localModel.ch1_function ?? DEFAULT_CH_FUNCTIONS[0],
    localModel.ch2_function ?? DEFAULT_CH_FUNCTIONS[1],
    localModel.ch3_function ?? DEFAULT_CH_FUNCTIONS[2],
    localModel.ch4_function ?? DEFAULT_CH_FUNCTIONS[3],
    localModel.ch5_function ?? DEFAULT_CH_FUNCTIONS[4],
    localModel.ch6_function ?? DEFAULT_CH_FUNCTIONS[5],
  ]

  // ─── Step 1: Bind Receiver ────────────────────────────────────────────────
  const renderStep1 = (): JSX.Element => {
    const guide = getBindGuide(localModel.receiver ?? '', localModel.protocol ?? '')
    return (
      <div className="space-y-4">
        <div className="bg-[#161b22] rounded-2xl border border-[#30363d] p-6">

          {/* Header with receiver identity */}
          <div className="flex items-center gap-4 mb-6">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0"
              style={{ background: `${guide.color}18`, border: `1px solid ${guide.color}40` }}
            >
              {guide.icon}
            </div>
            <div>
              <h2 className="text-[#e6edf3] text-xl font-bold">Bind Your Receiver</h2>
              <p className="text-[#8b949e] text-sm mt-0.5">
                {localModel.receiver ? (
                  <>
                    <span className="text-[#e6edf3] font-medium">{localModel.receiver}</span>
                    {' — '}
                    <span style={{ color: guide.color }}>{guide.system}</span>
                    {localModel.sub_type ? <span className="text-[#8b949e]"> · {localModel.protocol} {localModel.sub_type}</span> : ''}
                  </>
                ) : (
                  <span className="italic text-[#484f58]">No receiver set — tap Edit to add one first</span>
                )}
              </p>
            </div>
          </div>

          {/* Steps */}
          <ol className="space-y-3 mb-5">
            {guide.steps.map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span
                  className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold mt-0.5"
                  style={{ background: `${guide.color}18`, border: `1px solid ${guide.color}40`, color: guide.color }}
                >
                  {i + 1}
                </span>
                <span className="text-[#e6edf3] text-sm leading-relaxed pt-1">{step}</span>
              </li>
            ))}
          </ol>

          {/* Tips */}
          {guide.tips.length > 0 && (
            <div
              className="rounded-xl px-4 py-3 mb-5"
              style={{ background: `${guide.color}10`, border: `1px solid ${guide.color}25` }}
            >
              <div
                className="text-[11px] font-semibold uppercase tracking-wider mb-2"
                style={{ color: guide.color }}
              >
                Tips
              </div>
              <ul className="space-y-1.5">
                {guide.tips.map((tip, i) => (
                  <li key={i} className="text-sm text-[#c9d1d9] leading-relaxed flex gap-2">
                    <span style={{ color: guide.color }} className="shrink-0 mt-0.5">·</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between">
            {!localModel.receiver && (
              <button
                onClick={() => setShowEdit(true)}
                className="text-sm font-medium px-4 py-2 rounded-lg border border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] hover:border-[#484f58] transition-colors"
              >
                + Set receiver first
              </button>
            )}
            <div className="flex-1" />
            <button
              onClick={() => markDone(0)}
              className="bg-[#3fb950] hover:bg-[#2ea043] text-white rounded-lg px-5 py-2 font-medium text-sm transition-colors"
            >
              Receiver is Bound ✓
            </button>
          </div>

        </div>
      </div>
    )
  }

  // ─── Step 2: Set Channels ─────────────────────────────────────────────────
  const renderStep2 = (): JSX.Element => (
    <div className="space-y-4">
      <div className="bg-[#161b22] rounded-2xl border border-[#30363d] p-6">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="text-5xl mb-3">🎮</div>
          <h2 className="text-[#e6edf3] text-xl font-bold">Tell the Radio What Each Channel Controls</h2>
          <p className="text-[#8b949e] text-sm mt-1">Each channel controls one thing on your plane</p>
        </div>

        <p className="text-[#8b949e] text-sm mb-4">
          Each channel on your receiver controls one thing on your plane. Here's what yours is set to:
        </p>

        <div className="rounded-xl border border-[#30363d] overflow-hidden mb-5">
          {channelFunctions.map((fn, i) => {
            const isStandard = fn === STANDARD_CH_FUNCTIONS[i]
            return (
              <div
                key={i}
                className={['flex items-center gap-4 px-4 py-3', i < 5 ? 'border-b border-[#30363d]' : ''].join(' ')}
              >
                <span className="text-[#8b949e] text-[12px] font-semibold font-mono w-10 shrink-0">
                  CH{i + 1}
                </span>
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: isStandard ? '#3fb950' : '#d29922' }}
                />
                {fn ? (
                  <span className="text-[#e6edf3] text-sm">{fn}</span>
                ) : (
                  <span className="text-[#484f58] text-sm italic">Unassigned</span>
                )}
              </div>
            )
          })}
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowChannelEdit(v => !v)}
            className="text-sm font-medium px-4 py-2 rounded-lg bg-[#21262d] hover:bg-[#30363d] text-[#e6edf3] border border-[#30363d] transition-colors"
          >
            {showChannelEdit ? 'Hide Editor' : 'Edit Channels'}
          </button>
          <button
            onClick={() => markDone(1)}
            className="bg-[#3fb950] hover:bg-[#2ea043] text-white rounded-lg px-5 py-2 font-medium text-sm transition-colors"
          >
            Looks Good! Mark as Done
          </button>
        </div>
      </div>

      {showChannelEdit && (
        <div className="bg-[#161b22] rounded-2xl border border-[#30363d] p-6">
          <ForwardProgramming model={localModel} onSave={handleFPSave} />
        </div>
      )}
    </div>
  )

  // ─── Step 3: Stabilization ────────────────────────────────────────────────
  const renderStep3 = (): JSX.Element => (
    <div className="space-y-4">
      <div className="bg-[#161b22] rounded-2xl border border-[#30363d] p-6">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="text-5xl mb-3">✈️</div>
          <h2 className="text-[#e6edf3] text-xl font-bold">Set Up Your Gyro Stabilization</h2>
          <p className="text-[#8b949e] text-sm mt-1">AS3X smooths out wind and turbulence automatically</p>
        </div>

        <p className="text-[#8b949e] text-sm mb-4">
          AS3X helps your plane fly smoothly by correcting for wind and bumps. Set these three values:
        </p>

        <div className="bg-[#2d2208] border border-[#d2992240] rounded-xl px-4 py-3 text-sm text-[#d29922]">
          <strong>Start LOW</strong> — set Roll, Pitch, and Yaw to 30 first. You can always increase after your first flight.
        </div>
      </div>

      <div className="bg-[#161b22] rounded-2xl border border-[#30363d] p-6">
        <ForwardProgramming model={localModel} onSave={handleFPSave} />
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => markDone(2)}
          className="bg-[#3fb950] hover:bg-[#2ea043] text-white rounded-lg px-5 py-2 font-medium text-sm transition-colors"
        >
          Mark as Done
        </button>
      </div>
    </div>
  )

  // ─── Step 4: Radio Studio — rendered full-screen directly in layout, not here
  const renderStep4 = (): JSX.Element => <div />

  // ─── Step 5: ESC ──────────────────────────────────────────────────────────
  const renderStep5 = (): JSX.Element => (
    <div className="bg-[#161b22] rounded-2xl border border-[#30363d] p-6">
      <div className="flex flex-col items-center text-center mb-6">
        <div className="text-5xl mb-3">⚡</div>
        <h2 className="text-[#e6edf3] text-xl font-bold">Set Up Your Speed Controller</h2>
        <p className="text-[#8b949e] text-sm mt-1">Your ESC controls how your motor behaves</p>
      </div>

      <p className="text-[#8b949e] text-sm mb-5">
        Your ESC controls how your motor behaves. Basic settings are usually fine out of the box.
      </p>

      <div className="relative mb-4">
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <span className="text-[#8b949e] text-sm font-medium bg-[#161b22] border border-[#30363d] px-4 py-2 rounded-lg">
            Coming Soon
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3 opacity-30 pointer-events-none select-none">
          {['Timing', 'Braking', 'Reverse Thrust'].map(name => (
            <div key={name} className="bg-[#0d1117] border border-[#30363d] rounded-xl p-4">
              <div className="text-[#8b949e] text-[11px] font-semibold uppercase tracking-wider mb-2">{name}</div>
              <div className="text-[#484f58] text-lg font-mono font-bold">--</div>
            </div>
          ))}
        </div>
      </div>

      <p className="text-[#484f58] text-xs text-center mb-6">Castle Creations USB programming coming soon</p>

      <div className="flex items-center justify-between">
        <button
          onClick={() => markDone(4)}
          className="text-[#8b949e] hover:text-[#e6edf3] text-sm transition-colors"
        >
          Skip for Now
        </button>
        <button
          onClick={() => markDone(4)}
          className="bg-[#3fb950] hover:bg-[#2ea043] text-white rounded-lg px-5 py-2 font-medium text-sm transition-colors"
        >
          Mark as Done
        </button>
      </div>
    </div>
  )

  // ─── Step 6: Telemetry ────────────────────────────────────────────────────
  const renderStep6 = (): JSX.Element => (
    <div className="bg-[#161b22] rounded-2xl border border-[#30363d] p-6">
      <div className="flex flex-col items-center text-center mb-6">
        <div className="text-5xl mb-3">📊</div>
        <h2 className="text-[#e6edf3] text-xl font-bold">Add Sensors to Monitor Your Plane</h2>
        <p className="text-[#8b949e] text-sm mt-1">See battery, motor, and flight data in real time</p>
      </div>

      <p className="text-[#8b949e] text-sm mb-5">
        Telemetry lets you see battery voltage, motor RPM, and temperature from your radio while flying.
      </p>

      <div className="grid grid-cols-2 gap-3 mb-4">
        {SENSORS.map(({ name, icon: sIcon }) => (
          <div key={name} className="bg-[#0d1117] border border-[#30363d] rounded-xl px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base">{sIcon}</span>
              <span className="text-[#e6edf3] text-sm font-medium">{name}</span>
            </div>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#21262d] text-[#484f58] border border-[#30363d]">
              Not installed
            </span>
          </div>
        ))}
      </div>

      <p className="text-[#484f58] text-xs text-center mb-5">
        Live telemetry available when Spektrum BT module is connected
      </p>

      <div className="flex items-center justify-between">
        <button
          onClick={() => markDone(5)}
          className="text-[#8b949e] hover:text-[#e6edf3] text-sm transition-colors"
        >
          Skip for Now
        </button>
        <button
          onClick={() => markDone(5)}
          className="bg-[#3fb950] hover:bg-[#2ea043] text-white rounded-lg px-5 py-2 font-medium text-sm transition-colors"
        >
          Mark as Done
        </button>
      </div>
    </div>
  )

  // ─── Step 7: Pre-Flight Checklist ─────────────────────────────────────────
  const renderStep7 = (): JSX.Element => {
    const checkedCount = preflightChecks.filter(Boolean).length
    const allChecked   = checkedCount === PREFLIGHT_ITEMS.length
    return (
      <div className="bg-[#161b22] rounded-2xl border border-[#30363d] p-6">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="text-5xl mb-3">✅</div>
          <h2 className="text-[#e6edf3] text-xl font-bold">Before You Fly — Check These</h2>
          <p className="text-[#8b949e] text-sm mt-1">Safety first, every time</p>
        </div>

        <div className="space-y-2 mb-6">
          {PREFLIGHT_ITEMS.map((item, i) => (
            <label
              key={i}
              className={[
                'flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-colors',
                preflightChecks[i]
                  ? 'bg-[#3fb95010] border border-[#3fb95030]'
                  : 'bg-[#0d1117] border border-[#30363d] hover:border-[#484f58]'
              ].join(' ')}
            >
              <input
                type="checkbox"
                checked={preflightChecks[i]}
                onChange={() =>
                  setPreflightChecks(prev => {
                    const next = [...prev]
                    next[i] = !next[i]
                    return next
                  })
                }
                className="shrink-0 w-4 h-4 accent-[#3fb950] cursor-pointer"
              />
              <span
                className={[
                  'text-sm leading-relaxed',
                  preflightChecks[i] ? 'text-[#3fb950] line-through opacity-70' : 'text-[#e6edf3]'
                ].join(' ')}
              >
                {item}
              </span>
            </label>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[#8b949e] text-xs">
            {checkedCount} / {PREFLIGHT_ITEMS.length} checked
          </span>
          <button
            onClick={() => markDone(6)}
            disabled={!allChecked}
            className={[
              'rounded-lg px-5 py-2 font-medium text-sm transition-colors',
              allChecked
                ? 'bg-[#3fb950] hover:bg-[#2ea043] text-white'
                : 'bg-[#21262d] text-[#484f58] cursor-not-allowed border border-[#30363d]'
            ].join(' ')}
          >
            {allChecked ? '🛫 Ready to Fly!' : 'Check all items first'}
          </button>
        </div>
      </div>
    )
  }

  // ─── Step 8: Flight Log ───────────────────────────────────────────────────
  const renderStep8 = (): JSX.Element => (
    <div className="bg-[#161b22] rounded-2xl border border-[#30363d] p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="text-4xl mb-2">📋</div>
          <h2 className="text-[#e6edf3] text-xl font-bold">Log Your Flights</h2>
          <p className="text-[#8b949e] text-sm mt-1">Track every session</p>
        </div>
        <button
          onClick={() => setShowLogModal(true)}
          className="flex items-center gap-2 bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors shrink-0"
        >
          + Log a Flight
        </button>
      </div>

      {flightLogs.length === 0 ? (
        <div className="flex flex-col items-center py-14 text-center">
          <div className="text-5xl mb-4 opacity-20">🛫</div>
          <p className="text-[#8b949e] text-sm font-medium mb-1">No flights logged yet — go fly!</p>
          <p className="text-[#484f58] text-[12px]">Tap "Log a Flight" to record your first session</p>
        </div>
      ) : (
        <div className="space-y-3">
          {flightLogs.map(entry => (
            <div key={entry.id} className="bg-[#0d1117] border border-[#30363d] rounded-xl px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[#e6edf3] text-sm font-medium">{entry.date}</span>
                {entry.duration && (
                  <span className="text-[#8b949e] text-xs">{entry.duration} min</span>
                )}
              </div>
              {entry.battery && <p className="text-[#8b949e] text-xs mb-0.5">Battery: {entry.battery}</p>}
              {entry.notes && <p className="text-[#484f58] text-xs">{entry.notes}</p>}
            </div>
          ))}
        </div>
      )}

      <p className="text-[#484f58] text-xs text-center mt-6 pt-4 border-t border-[#30363d]">
        Telemetry will be auto-captured here when BT module connected
      </p>
    </div>
  )

  const renderActiveStep = (): JSX.Element => {
    switch (activeStep) {
      case 0:  return renderStep1()
      case 1:  return renderStep2()
      case 2:  return renderStep3()
      case 3:  return renderStep4()
      case 4:  return renderStep5()
      case 5:  return renderStep6()
      case 6:  return renderStep7()
      case 7:  return renderStep8()
      default: return renderStep1()
    }
  }

  // ─── Left column: step list ───────────────────────────────────────────────
  const renderStepList = (): JSX.Element => (
    <div className="space-y-2">
      {STEP_DEFS.map((step, i) => {
        const isDone    = stepStatuses[i] === 'done'
        const isCurrent = i === activeStep

        return (
          <button
            key={i}
            onClick={() => setActiveStep(i)}
            className={[
              'w-full text-left rounded-xl border px-3.5 py-3 transition-all',
              isCurrent && !isDone
                ? 'border-[#2563eb] bg-[#1a2540]'
                : isDone
                  ? 'border-[#30363d] bg-[#161b22]'
                  : 'border-[#30363d] bg-[#161b22] hover:border-[#484f58]',
            ].join(' ')}
            style={isCurrent && !isDone ? { borderLeftWidth: '3px' } : {}}
          >
            <div className="flex items-center gap-3">

              {/* Status icon */}
              {isDone ? (
                <div className="shrink-0 w-6 h-6 rounded-full bg-[#3fb95020] border border-[#3fb95040] flex items-center justify-center">
                  <span className="text-[#3fb950] text-[10px] font-bold">✓</span>
                </div>
              ) : isCurrent ? (
                <div className="shrink-0 w-6 h-6 rounded-full bg-[#2563eb20] border border-[#2563eb40] flex items-center justify-center">
                  <span className="text-[#2563eb] text-[10px] font-bold">→</span>
                </div>
              ) : (
                <div className="shrink-0 w-6 h-6 rounded-full border border-[#30363d] flex items-center justify-center">
                  <span className="text-[#484f58] text-[10px]">○</span>
                </div>
              )}

              {/* Title */}
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-[#8b949e] font-semibold uppercase tracking-wider">
                  Step {i + 1}
                </div>
                <div
                  className={[
                    'text-sm font-medium truncate mt-0.5',
                    isDone ? 'text-[#8b949e]' : isCurrent ? 'text-[#e6edf3]' : 'text-[#c9d1d9]',
                  ].join(' ')}
                >
                  {step.title}
                </div>
              </div>

              {/* Status badge */}
              {isDone && (
                <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#3fb95020] text-[#3fb950] border border-[#3fb95040]">
                  Done
                </span>
              )}
              {isCurrent && !isDone && (
                <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#2563eb20] text-[#60a5fa] border border-[#2563eb40]">
                  Active
                </span>
              )}

            </div>
          </button>
        )
      })}
    </div>
  )

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Fixed Header (kept exactly as-is) ── */}
      <div className="flex items-center gap-4 px-8 py-5 border-b border-[#30363d] shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d] transition-colors shrink-0 text-sm font-medium border border-[#30363d]"
        >
          ← Back
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-[#e6edf3] text-xl font-bold tracking-tight truncate">
              {localModel.name}
            </h1>
            <span
              className={[
                'text-[11px] font-semibold px-2.5 py-0.5 rounded-full shrink-0',
                isActive
                  ? 'bg-[#3fb95020] text-[#3fb950] border border-[#3fb95040]'
                  : 'bg-[#30363d] text-[#8b949e] border border-[#484f58]'
              ].join(' ')}
            >
              {isActive ? 'Active' : 'Archived'}
            </span>
          </div>
          <p className="text-[#8b949e] text-[13px] mt-0.5 truncate">
            {[localModel.brand, localModel.type].filter(Boolean).join(' · ') || 'No brand/type set'}
          </p>
        </div>
        <button
          onClick={() => setShowEdit(true)}
          className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg bg-[#21262d] hover:bg-[#30363d] text-[#e6edf3] border border-[#30363d] hover:border-[#484f58] transition-colors shrink-0"
        >
          ✏ Edit
        </button>
      </div>

      {/* ── Hero photo (kept exactly as-is) ── */}
      {photoSrc ? (
        <div className="w-full h-48 overflow-hidden shrink-0">
          <img src={photoSrc} alt={localModel.name} className="w-full h-full object-cover" />
        </div>
      ) : (
        <div
          className="w-full h-48 flex items-center justify-center shrink-0"
          style={{ background: `${accent}10` }}
        >
          <div
            className="flex items-center justify-center w-24 h-24 rounded-3xl text-5xl"
            style={{ background: `${accent}18`, border: `1px solid ${accent}30` }}
          >
            {icon}
          </div>
        </div>
      )}

      {/* ── Brand color band ── */}
      <div
        className="h-1 w-full shrink-0"
        style={{ background: `linear-gradient(to right, ${accent}, ${accent}40)` }}
      />

      {/* ── Radio Studio — full screen, no sidebar ── */}
      {activeStep === 3 && (
        <div className="flex-1 overflow-hidden flex flex-col">
          <RadioDashboard modelName={localModel.name} modelId={localModel.id} />
        </div>
      )}

      {/* ── All other steps — two-column with checklist sidebar ── */}
      {activeStep !== 3 && (
        <div className="flex flex-1 overflow-hidden">

          {/* Left: setup checklist */}
          <div className="w-72 shrink-0 bg-[#0d1117] border-r border-[#30363d] overflow-y-auto p-4">
            <div className="text-[#8b949e] text-[11px] font-semibold uppercase tracking-wider mb-3 px-1">
              Setup Checklist
            </div>
            {renderStepList()}
          </div>

          {/* Right: active step content */}
          <div className="flex-1 bg-[#0d1117] overflow-y-auto px-8 py-6 pb-10">
            {renderActiveStep()}
          </div>

        </div>
      )}

      {/* ── Log Flight Modal ── */}
      {showLogModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">

            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[#e6edf3] text-lg font-bold">Log Flight</h2>
              <button
                onClick={() => setShowLogModal(false)}
                className="text-[#8b949e] hover:text-[#e6edf3] text-xl leading-none transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[#8b949e] text-[11px] font-semibold uppercase tracking-wider mb-1.5">
                  Date
                </label>
                <input
                  type="date"
                  value={logForm.date}
                  onChange={(e) => setLogForm(p => ({ ...p, date: e.target.value }))}
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-[#e6edf3] text-sm focus:outline-none focus:border-[#2563eb] transition-colors"
                />
              </div>
              <div>
                <label className="block text-[#8b949e] text-[11px] font-semibold uppercase tracking-wider mb-1.5">
                  Duration (minutes)
                </label>
                <input
                  type="number"
                  min={0}
                  value={logForm.duration}
                  onChange={(e) => setLogForm(p => ({ ...p, duration: e.target.value }))}
                  placeholder="e.g. 8"
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-[#e6edf3] text-sm focus:outline-none focus:border-[#2563eb] transition-colors placeholder:text-[#484f58]"
                />
              </div>
              <div>
                <label className="block text-[#8b949e] text-[11px] font-semibold uppercase tracking-wider mb-1.5">
                  Battery Used
                </label>
                <input
                  type="text"
                  value={logForm.battery}
                  onChange={(e) => setLogForm(p => ({ ...p, battery: e.target.value }))}
                  placeholder="e.g. 3S 2200mAh — landed at 3.75V"
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-[#e6edf3] text-sm focus:outline-none focus:border-[#2563eb] transition-colors placeholder:text-[#484f58]"
                />
              </div>
              <div>
                <label className="block text-[#8b949e] text-[11px] font-semibold uppercase tracking-wider mb-1.5">
                  Notes
                </label>
                <textarea
                  value={logForm.notes}
                  onChange={(e) => setLogForm(p => ({ ...p, notes: e.target.value }))}
                  placeholder="How did it fly? Any issues?"
                  rows={3}
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-[#e6edf3] text-sm leading-relaxed resize-none focus:outline-none focus:border-[#2563eb] transition-colors placeholder:text-[#484f58]"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowLogModal(false)}
                className="flex-1 text-sm font-medium px-4 py-2.5 rounded-lg bg-[#21262d] hover:bg-[#30363d] text-[#8b949e] border border-[#30363d] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (logForm.date) {
                    setFlightLogs(prev => [{ id: Date.now().toString(), ...logForm }, ...prev])
                  }
                  setShowLogModal(false)
                  setLogForm({
                    date:     new Date().toISOString().split('T')[0],
                    duration: '',
                    battery:  '',
                    notes:    '',
                  })
                }}
                className="flex-1 text-sm font-medium px-4 py-2.5 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white transition-colors"
              >
                Save Flight
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ── Edit Model Modal ── */}
      {showEdit && (
        <AddModelModal
          onClose={() => setShowEdit(false)}
          onSave={handleEditSave}
          editModel={localModel}
        />
      )}

    </div>
  )
}

export default ModelDetail
