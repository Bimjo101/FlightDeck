import React, { useState, useEffect, useCallback, useRef } from 'react'
import CurveEditor, { CurveData, MiniCurve, defaultCurve } from './CurveEditor'
import Tip from './Tip'
import { RCModel } from './ModelCard'
import SoundsTab from './SoundsTab'
import { listAppSounds, AppSound } from '../lib/soundsDb'
import { generateEdgeTxYaml, modelFileName, DEFAULT_EXPORT_CONFIG, EdgeTxGenConfig } from '../lib/edgeTxYaml'
import RatesWizard, { RatesWizardResult } from './RatesWizard'
import MixWizard, { MixWizardResult } from './MixWizard'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ChannelConfig {
  ch: number
  label: string
  source: string
  weight: number
  offset: number
  reversed: boolean
  expo: number
  name: string
}

interface AdvancedMix {
  id: string
  label: string
  outputCh: number
  source: string
  weight: number
  mltpx: 'Add' | 'Multiply' | 'Replace'
}

interface SwitchVoice {
  switchId: string
  positions: { up: string; mid: string; down: string }
}

interface RateLine {
  rate: number
  expo: number    // mirrors curve.expo for backward compat
  curve: CurveData
}

interface SurfaceRates {
  id: string
  label: string
  inputSource: string
  inputIdx: number
  switchId: string
  high: RateLine
  mid: RateLine
  low: RateLine
  threePos: boolean
}

interface FlapStage {
  id: number
  label: string
  flapPct: number    // 0–100, flap deflection %
  elevComp: number   // -100 to 100, elevator pitch-trim compensation
  ailCamber: number  // 0–100, aileron droop (crow brake / camber)
  speedBrake: number // 0–100, optional spoiler/speed brake
}

interface FlapConfig {
  enabled: boolean
  flaperronMode: boolean  // true = no separate flap channel; droop goes directly to aileron CH
  stages: number          // 2–6
  source: string          // RS, LS, SC, SF, etc.
  flapCh: number          // 1–8 (ignored in flaperron mode)
  elevCh: number          // 1–8
  ailCh: number           // 1–8
  useElevComp: boolean
  useAilCamber: boolean
  stageList: FlapStage[]
}

interface SdInfo {
  hasModels: boolean
  hasYamlModels: boolean
  yamlModelFiles: string[]
  soundFiles: string[]
  scriptFiles: string[]
  dsmdataFiles: string[]
}

interface TimerConfig {
  mode: 'elapsed' | 'throttle'
  maxMinutes: number
  warningPct: number
}

interface FlightLogEntry {
  date: string
  elapsed: number
  motorElapsed: number
}

interface SavedRadioConfig {
  channels: ChannelConfig[]
  advMixes: AdvancedMix[]
  switchVoice: SwitchVoice[]
  surfaceRates: SurfaceRates[]
  flapConfig: FlapConfig
  timerConfig: TimerConfig
}

interface HistoryEntry {
  ts: number
  label: string
  config: SavedRadioConfig
}

interface NamedSnapshot {
  id: string          // uuid-lite: Date.now().toString(36)
  name: string        // user-chosen label
  ts: number
  config: SavedRadioConfig
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SOURCES = [
  { group: 'Sticks', items: ['Ail', 'Ele', 'Thr', 'Rud'] },
  { group: 'Switches', items: ['SA', 'SB', 'SC', 'SD', 'SE', 'SF'] },
  { group: 'Pots / Sliders', items: ['S1', 'S2', 'LS', 'RS'] },
  { group: 'Constants', items: ['MAX', '-MAX', 'HALF'] },
  { group: 'Channels', items: ['CH1', 'CH2', 'CH3', 'CH4', 'CH5', 'CH6', 'CH7', 'CH8'] },
]
const ALL_SOURCES = ['---', ...SOURCES.flatMap((g) => g.items)]

const DEFAULT_CHANNELS: ChannelConfig[] = [
  { ch: 1, label: 'Aileron', source: 'Ail', weight: 100, offset: 0, reversed: false, expo: 0, name: 'AIL' },
  { ch: 2, label: 'Elevator', source: 'Ele', weight: 100, offset: 0, reversed: false, expo: 0, name: 'ELE' },
  { ch: 3, label: 'Throttle', source: 'Thr', weight: 100, offset: 0, reversed: false, expo: 0, name: 'THR' },
  { ch: 4, label: 'Rudder', source: 'Rud', weight: 100, offset: 0, reversed: false, expo: 0, name: 'RUD' },
  { ch: 5, label: 'SAFE Select', source: 'SB', weight: 100, offset: 0, reversed: false, expo: 0, name: 'SAFE' },
  { ch: 6, label: 'Flap / Gear', source: 'SC', weight: 100, offset: 0, reversed: false, expo: 0, name: 'FLAP' },
  { ch: 7, label: 'Aux 1', source: '---', weight: 100, offset: 0, reversed: false, expo: 0, name: 'AUX1' },
  { ch: 8, label: 'Aux 2', source: '---', weight: 100, offset: 0, reversed: false, expo: 0, name: 'AUX2' },
]

const DEFAULT_ADV_MIXES: AdvancedMix[] = []

const DEFAULT_SWITCH_VOICE: SwitchVoice[] = [
  { switchId: 'SA', positions: { up: '', mid: '', down: '' } },
  { switchId: 'SB', positions: { up: '', mid: '', down: '' } },
  { switchId: 'SC', positions: { up: '', mid: '', down: '' } },
  { switchId: 'SD', positions: { up: '', mid: '', down: '' } },
  { switchId: 'SE', positions: { up: '', mid: '', down: '' } },
  { switchId: 'SF', positions: { up: '', mid: '', down: '' } },
]

const SWITCH_COLORS: Record<string, string> = {
  SA: '#f59e0b', SB: '#3b82f6', SC: '#10b981',
  SD: '#a855f7', SE: '#ef4444', SF: '#06b6d4',
}

const DEFAULT_SURFACE_RATES: SurfaceRates[] = [
  { id: 'ail', label: 'Aileron', inputSource: 'Ail', inputIdx: 0, switchId: 'SA', threePos: true,
    high: { rate: 100, expo: 0,  curve: defaultCurve(0)  },
    mid:  { rate: 75,  expo: 20, curve: defaultCurve(20) },
    low:  { rate: 50,  expo: 35, curve: defaultCurve(35) } },
  { id: 'ele', label: 'Elevator', inputSource: 'Ele', inputIdx: 1, switchId: 'SA', threePos: true,
    high: { rate: 100, expo: 0,  curve: defaultCurve(0)  },
    mid:  { rate: 75,  expo: 25, curve: defaultCurve(25) },
    low:  { rate: 60,  expo: 40, curve: defaultCurve(40) } },
  { id: 'rud', label: 'Rudder', inputSource: 'Rud', inputIdx: 3, switchId: 'SA', threePos: true,
    high: { rate: 100, expo: 0,  curve: defaultCurve(0)  },
    mid:  { rate: 80,  expo: 15, curve: defaultCurve(15) },
    low:  { rate: 65,  expo: 25, curve: defaultCurve(25) } },
]

const SURFACE_PRESETS = [
  { label: 'Aileron', inputSource: 'Ail', inputIdx: 0 },
  { label: 'Elevator', inputSource: 'Ele', inputIdx: 1 },
  { label: 'Rudder', inputSource: 'Rud', inputIdx: 3 },
  { label: 'Flap', inputSource: 'SC', inputIdx: 5 },
]

const buildStages = (n: number): FlapStage[] => {
  const labels5 = ['Up', 'T/O', 'Cruise', 'Land', 'Full']
  const labels4 = ['Up', 'T/O', 'Land', 'Full']
  const labels3 = ['Up', 'Half', 'Full']
  const labels2 = ['Up', 'Down']
  const labels6 = ['Up', '20°', '40°', '60°', '80°', 'Full']
  const labelMap: Record<number, string[]> = { 2: labels2, 3: labels3, 4: labels4, 5: labels5, 6: labels6 }
  const lbls = labelMap[n] ?? labels5
  return Array.from({ length: n }, (_, i) => {
    const pct = Math.round((i / (n - 1)) * 100)
    return {
      id: i + 1,
      label: lbls[i] ?? `Stage ${i + 1}`,
      flapPct: pct,
      elevComp: i === 0 ? 0 : -Math.round(pct * 0.20),
      ailCamber: i === 0 ? 0 : Math.round(pct * 0.14),
      speedBrake: 0,
    }
  })
}

const DEFAULT_FLAP_CONFIG: FlapConfig = {
  enabled: false,
  flaperronMode: false,
  stages: 5,
  source: 'RS',
  flapCh: 6,
  elevCh: 2,
  ailCh: 1,
  useElevComp: true,
  useAilCamber: false,
  stageList: buildStages(5),
}

type Tab = 'channels' | 'rates' | 'flaps' | 'mixes' | 'voice' | 'sounds' | 'timer' | 'sdfiles' | 'export' | 'help' | 'wizard'

const DEFAULT_TIMER_CONFIG: TimerConfig = {
  mode: 'elapsed',
  maxMinutes: 10,
  warningPct: 80,
}

// ─── Model type presets ───────────────────────────────────────────────────────

interface ModelPreset {
  label: string
  icon: string
  channels: Partial<ChannelConfig>[]
  rates: { id: string; high: number; mid: number; low: number; expo: { high: number; mid: number; low: number } }[]
  flap: Partial<FlapConfig>
  timer: Partial<TimerConfig>
}

const MODEL_PRESETS: ModelPreset[] = [
  {
    label: 'Trainer',
    icon: '🛩',
    channels: [
      { ch: 1, source: 'Ail', weight: 60, expo: 30 },
      { ch: 2, source: 'Ele', weight: 70, expo: 30 },
      { ch: 3, source: 'Thr', weight: 100, expo: 0 },
      { ch: 4, source: 'Rud', weight: 75, expo: 20 },
      { ch: 5, source: 'SB', weight: 100 },
    ],
    rates: [
      { id: 'ail', high: 60, mid: 40, low: 25, expo: { high: 30, mid: 40, low: 50 } },
      { id: 'ele', high: 70, mid: 50, low: 35, expo: { high: 30, mid: 40, low: 50 } },
      { id: 'rud', high: 75, mid: 55, low: 40, expo: { high: 20, mid: 30, low: 40 } },
    ],
    flap: { enabled: false },
    timer: { maxMinutes: 8, warningPct: 75 },
  },
  {
    label: 'Sport',
    icon: '✈️',
    channels: [
      { ch: 1, source: 'Ail', weight: 80, expo: 20 },
      { ch: 2, source: 'Ele', weight: 85, expo: 20 },
      { ch: 3, source: 'Thr', weight: 100, expo: 0 },
      { ch: 4, source: 'Rud', weight: 85, expo: 15 },
      { ch: 5, source: 'SB', weight: 100 },
      { ch: 6, source: 'SC', weight: 100 },
    ],
    rates: [
      { id: 'ail', high: 80, mid: 60, low: 40, expo: { high: 20, mid: 30, low: 40 } },
      { id: 'ele', high: 85, mid: 65, low: 45, expo: { high: 20, mid: 30, low: 40 } },
      { id: 'rud', high: 85, mid: 65, low: 50, expo: { high: 15, mid: 25, low: 35 } },
    ],
    flap: { enabled: true, stages: 3, flaperronMode: false },
    timer: { maxMinutes: 10, warningPct: 80 },
  },
  {
    label: 'Aerobatic',
    icon: '🚀',
    channels: [
      { ch: 1, source: 'Ail', weight: 100, expo: 10 },
      { ch: 2, source: 'Ele', weight: 100, expo: 10 },
      { ch: 3, source: 'Thr', weight: 100, expo: 0 },
      { ch: 4, source: 'Rud', weight: 100, expo: 5 },
      { ch: 5, source: 'SB', weight: 100 },
    ],
    rates: [
      { id: 'ail', high: 100, mid: 75, low: 50, expo: { high: 10, mid: 20, low: 30 } },
      { id: 'ele', high: 100, mid: 75, low: 55, expo: { high: 10, mid: 20, low: 30 } },
      { id: 'rud', high: 100, mid: 80, low: 60, expo: { high: 5, mid: 15, low: 25 } },
    ],
    flap: { enabled: false },
    timer: { maxMinutes: 7, warningPct: 80 },
  },
  {
    label: 'Glider',
    icon: '🪂',
    channels: [
      { ch: 1, source: 'Ail', weight: 90, expo: 25 },
      { ch: 2, source: 'Ele', weight: 80, expo: 30 },
      { ch: 3, source: 'Thr', weight: 100, expo: 0 },
      { ch: 4, source: 'Rud', weight: 70, expo: 20 },
      { ch: 6, source: 'RS', weight: 100 },
    ],
    rates: [
      { id: 'ail', high: 90, mid: 65, low: 40, expo: { high: 25, mid: 35, low: 45 } },
      { id: 'ele', high: 80, mid: 60, low: 40, expo: { high: 30, mid: 40, low: 50 } },
      { id: 'rud', high: 70, mid: 55, low: 40, expo: { high: 20, mid: 30, low: 40 } },
    ],
    flap: { enabled: true, stages: 4, flaperronMode: true },
    timer: { maxMinutes: 20, mode: 'throttle', warningPct: 85 },
  },
]

// ─── Sub-components ───────────────────────────────────────────────────────────

function SourceSelect({
  value,
  onChange,
  className,
}: {
  value: string
  onChange: (v: string) => void
  className?: string
}): JSX.Element {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`bg-[#0f172a] border border-[#334155] rounded-lg px-2 py-1.5 text-[#f1f5f9] text-sm
        focus:outline-none focus:border-[#3b82f6] transition-colors ${className ?? ''}`}
    >
      <option value="---">— None —</option>
      {SOURCES.map((grp) => (
        <optgroup key={grp.group} label={grp.group}>
          {grp.items.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

function WeightSlider({
  value,
  onChange,
}: {
  value: number
  onChange: (v: number) => void
}): JSX.Element {
  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <input
        type="range"
        min={-100}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-[#3b82f6]"
        style={{ minWidth: 60 }}
      />
      <input
        type="number"
        min={-100}
        max={100}
        value={value}
        onChange={(e) => onChange(Math.max(-100, Math.min(100, Number(e.target.value))))}
        className="w-14 bg-[#0f172a] border border-[#334155] rounded px-1.5 py-1
          text-[#f1f5f9] text-xs text-center focus:outline-none focus:border-[#3b82f6]"
      />
      <span className="text-[#94a3b8] text-xs w-3">%</span>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface RadioDashboardProps {
  modelName?: string
  modelId?: string
}

function RadioDashboard({ modelName: modelNameProp, modelId: modelIdProp }: RadioDashboardProps): JSX.Element {
  const [sdDrive, setSdDrive] = useState<string | null>(null)
  const [sdInfo, setSdInfo] = useState<SdInfo | null>(null)
  const [sdScanError, setSdScanError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('channels')
  const [modelName, setModelName] = useState(modelNameProp ?? '')
  const [allModels, setAllModels] = useState<RCModel[]>([])
  const [selectedYamlFile, setSelectedYamlFile] = useState<string>('')
  const [loadingModel, setLoadingModel] = useState(false)
  const [channels, setChannels] = useState<ChannelConfig[]>(DEFAULT_CHANNELS)
  const [advMixes, setAdvMixes] = useState<AdvancedMix[]>(DEFAULT_ADV_MIXES)
  const [switchVoice, setSwitchVoice] = useState<SwitchVoice[]>(DEFAULT_SWITCH_VOICE)
  const [appSounds, setAppSounds] = useState<AppSound[]>([])
  const [surfaceRates, setSurfaceRates] = useState<SurfaceRates[]>(DEFAULT_SURFACE_RATES)
  const [flapConfig, setFlapConfig] = useState<FlapConfig>(DEFAULT_FLAP_CONFIG)
  const [yamlModelNames, setYamlModelNames] = useState<Record<string, string>>({})
  const [yamlNamesLoaded, setYamlNamesLoaded] = useState<Set<string>>(new Set())
  const [writing, setWriting] = useState(false)
  const [writeResult, setWriteResult] = useState<{ ok: boolean; msg: string; mode?: string } | null>(null)
  const [expandedCurve, setExpandedCurve] = useState<{ srId: string; pos: 'high' | 'mid' | 'low' } | null>(null)
  const [importing, setImporting] = useState<string | null>(null)
  const [existingModelNames, setExistingModelNames] = useState<Set<string>>(new Set())

  // Persistence
  const [effectiveModelId, setEffectiveModelId] = useState<string | undefined>(modelIdProp)
  const lastSavedRef = useRef<SavedRadioConfig | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  // Wizard / onboarding
  const [wizardMode, setWizardMode] = useState(false)
  const [wizardPhase, setWizardPhase] = useState<'welcome' | 'ratesQuestion' | 'ratesSetup' | 'mixSetup' | 'recap'>('welcome')

  // Rollback history
  const [configHistory, setConfigHistory] = useState<HistoryEntry[]>([])
  const [showHistory, setShowHistory] = useState(false)

  // Named snapshots
  const [namedSnapshots, setNamedSnapshots] = useState<NamedSnapshot[]>([])
  const [showSnapshotInput, setShowSnapshotInput] = useState(false)
  const [snapshotInputName, setSnapshotInputName] = useState('')

  // Timer
  const [timerConfig, setTimerConfig] = useState<TimerConfig>(DEFAULT_TIMER_CONFIG)
  const [timerRunning, setTimerRunning] = useState(false)
  const [timerElapsed, setTimerElapsed] = useState(0)
  const [motorOn, setMotorOn] = useState(false)
  const [motorElapsed, setMotorElapsed] = useState(0)
  const [flightLog, setFlightLog] = useState<FlightLogEntry[]>([])
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Presets
  const [showPresets, setShowPresets] = useState(false)

  // Export tab state
  const [exportSlot, setExportSlot] = useState(1)
  const [exporting, setExporting] = useState(false)
  const [exportResult, setExportResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [exportCfg, setExportCfg] = useState<Omit<EdgeTxGenConfig, 'modelName'>>(DEFAULT_EXPORT_CONFIG)
  const [mixWizardResult, setMixWizardResult] = useState<MixWizardResult | null>(null)

  // Sync model name from prop when navigating between models
  useEffect(() => {
    if (modelNameProp) setModelName(modelNameProp)
  }, [modelNameProp])

  const reloadAppSounds = (): void => {
    listAppSounds().then(setAppSounds).catch(() => {})
  }
  useEffect(() => { reloadAppSounds() }, [])

  // Load model list for sidebar picker (only needed when not embedded in a model)
  useEffect(() => {
    if (!modelNameProp) {
      window.api.models.getAll().then((models) => {
        setAllModels(models)
        if (models.length > 0 && !modelName) setModelName(models[0].name)
        // Resolve modelId for standalone radio studio (no modelId prop)
        if (!modelIdProp && models.length > 0) {
          const name = modelNameProp ?? models[0].name
          const found = models.find((m) => m.name === name)
          if (found) setEffectiveModelId(found.id)
        }
      }).catch(() => {})
    }
  }, [modelNameProp])

  // Resolve effectiveModelId when model name changes in standalone picker
  useEffect(() => {
    if (!modelIdProp && modelName && allModels.length > 0) {
      const found = allModels.find((m) => m.name === modelName)
      if (found) setEffectiveModelId(found.id)
    }
  }, [modelName, allModels, modelIdProp])

  // Track which plane names are already in the library so we can block duplicate imports
  useEffect(() => {
    window.api.models.getAll().then((models) => {
      setExistingModelNames(new Set(models.map((m) => m.name.toLowerCase())))
    }).catch(() => {})
  }, [])

  // Sync effectiveModelId when prop changes
  useEffect(() => {
    if (modelIdProp) setEffectiveModelId(modelIdProp)
  }, [modelIdProp])

  // Load saved config when model changes
  useEffect(() => {
    if (!effectiveModelId) return
    // Show wizard for any model that hasn't completed setup
    const wizardDone = localStorage.getItem(`fd_wizard_${effectiveModelId}`)
    if (!wizardDone) {
      setWizardMode(true)
      setWizardPhase('welcome')
    } else {
      setWizardMode(false)
    }
    const raw = localStorage.getItem(`fd_radio_${effectiveModelId}`)
    if (!raw) return
    try {
      const saved = JSON.parse(raw) as Partial<SavedRadioConfig>
      if (saved.channels) setChannels(saved.channels)
      if (saved.advMixes) setAdvMixes(saved.advMixes)
      if (saved.switchVoice) setSwitchVoice(saved.switchVoice)
      if (saved.surfaceRates) setSurfaceRates(saved.surfaceRates)
      if (saved.flapConfig) setFlapConfig(saved.flapConfig)
      if (saved.timerConfig) setTimerConfig(saved.timerConfig)
      lastSavedRef.current = saved as SavedRadioConfig
    } catch { /* stale */ }
    // Load history
    const histRaw = localStorage.getItem(`fd_radio_hist_${effectiveModelId}`)
    if (histRaw) {
      try { setConfigHistory(JSON.parse(histRaw)) } catch { /* ignore */ }
    }
    // Load named snapshots
    const snapRaw = localStorage.getItem(`fd_snaps_${effectiveModelId}`)
    if (snapRaw) {
      try { setNamedSnapshots(JSON.parse(snapRaw)) } catch { /* ignore */ }
    }
  }, [effectiveModelId])

  // Auto-save with debounce + push history snapshot
  useEffect(() => {
    if (!effectiveModelId) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      const current: SavedRadioConfig = { channels, advMixes, switchVoice, surfaceRates, flapConfig, timerConfig }
      if (lastSavedRef.current) {
        const entry: HistoryEntry = {
          ts: Date.now(),
          label: `Saved at ${new Date().toLocaleTimeString()}`,
          config: lastSavedRef.current,
        }
        setConfigHistory((prev) => {
          const next = [entry, ...prev].slice(0, 10)
          localStorage.setItem(`fd_radio_hist_${effectiveModelId}`, JSON.stringify(next))
          return next
        })
      }
      lastSavedRef.current = current
      localStorage.setItem(`fd_radio_${effectiveModelId}`, JSON.stringify(current))
      setSavedAt(new Date())
    }, 700)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [effectiveModelId, channels, advMixes, switchVoice, surfaceRates, flapConfig, timerConfig])

  // Poll for SD card
  useEffect(() => {
    let cancelled = false
    const check = async (): Promise<void> => {
      try {
        const res = await window.api.sdcard.detect()
        if (cancelled) return
        setSdDrive(res.connected && res.drivePath ? res.drivePath : null)
      } catch { /* not connected */ }
    }
    check()
    const id = setInterval(check, 3000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  // Scan SD card when drive changes
  useEffect(() => {
    if (!sdDrive) { setSdInfo(null); setSelectedYamlFile(''); setYamlModelNames({}); setYamlNamesLoaded(new Set()); return }
    window.api.edgetx.scanSdCard(sdDrive)
      .then((info) => {
        setSdInfo(info)
        if (info.yamlModelFiles.length > 0 && !selectedYamlFile) {
          setSelectedYamlFile(info.yamlModelFiles[0])
        }
        // Auto-switch to SD Files tab so models are immediately visible
        if (info.yamlModelFiles.length > 0) setActiveTab('sdfiles')
        // Filter to real model files only (skip labels.yml, .bak. files)
        const modelFiles = info.yamlModelFiles.filter((f) => {
          const base = f.split('/').pop()?.toLowerCase() ?? ''
          return base !== 'labels.yml' && !base.includes('.bak.')
        })
        setSdInfo({ ...info, yamlModelFiles: modelFiles })

        // Read header.name from each YAML file so we show plane names, not slot filenames
        modelFiles.forEach(async (filename) => {
          try {
            const res = await window.api.edgetx.loadModelConfig(sdDrive!, filename)
            if (res.success && res.modelName) {
              setYamlModelNames((prev) => ({ ...prev, [filename]: res.modelName! }))
            }
          } catch { /* ignore */ }
          // Mark attempt done regardless — unblocks the Import button even for empty files
          setYamlNamesLoaded((prev) => new Set([...prev, filename]))
        })
      })
      .catch((e) => setSdScanError(String(e)))
  }, [sdDrive])

  const updateChannel = useCallback((ch: number, patch: Partial<ChannelConfig>) => {
    setChannels((prev) => prev.map((c) => c.ch === ch ? { ...c, ...patch } : c))
  }, [])

  const updateSwitchVoice = useCallback((switchId: string, pos: 'up' | 'mid' | 'down', sound: string) => {
    setSwitchVoice((prev) => prev.map((sv) =>
      sv.switchId === switchId
        ? { ...sv, positions: { ...sv.positions, [pos]: sound } }
        : sv
    ))
  }, [])

  const addAdvMix = (): void => {
    const id = `mix_${Date.now()}`
    setAdvMixes((prev) => [...prev, {
      id, label: 'New Mix', outputCh: 2, source: 'Ail', weight: 30, mltpx: 'Add'
    }])
  }

  const removeAdvMix = (id: string): void => {
    setAdvMixes((prev) => prev.filter((m) => m.id !== id))
  }

  const updateAdvMix = (id: string, patch: Partial<AdvancedMix>): void => {
    setAdvMixes((prev) => prev.map((m) => m.id === id ? { ...m, ...patch } : m))
  }

  // Timer tick
  useEffect(() => {
    if (!timerRunning) {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
      return
    }
    timerIntervalRef.current = setInterval(() => {
      setTimerElapsed((prev) => prev + 1)
      if (timerConfig.mode === 'throttle' && motorOn) {
        setMotorElapsed((prev) => prev + 1)
      }
    }, 1000)
    return () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current) }
  }, [timerRunning, motorOn, timerConfig.mode])

  const logFlight = (): void => {
    if (timerElapsed > 0) {
      setFlightLog((prev) => [{
        date: new Date().toLocaleString(),
        elapsed: timerElapsed,
        motorElapsed: timerConfig.mode === 'throttle' ? motorElapsed : timerElapsed,
      }, ...prev].slice(0, 10))
    }
  }

  const finishWizard = (): void => {
    if (effectiveModelId) localStorage.setItem(`fd_wizard_${effectiveModelId}`, '1')
    setWizardMode(false)
    setActiveTab('channels')
  }

  const applyRatesWizardResult = (result: RatesWizardResult): void => {
    const { rates, switchId } = result
    setSurfaceRates((prev) =>
      prev.map((sr) => {
        const r = rates[sr.id as keyof typeof rates]
        if (!r) return sr
        return {
          ...sr,
          switchId,
          high: { ...sr.high, rate: r.high },
          mid:  { ...sr.mid,  rate: r.mid  },
          low:  { ...sr.low,  rate: r.low  },
        }
      })
    )
    setActiveTab('rates')
  }

  const applyMixWizardResult = (result: MixWizardResult): void => {
    setMixWizardResult(result)
    const newMixes: AdvancedMix[] = []

    if (result.elevon) {
      const w = result.elevon.weight
      newMixes.push({ id: 'elvl_ail', label: 'EvnL-A', outputCh: 1, source: 'Ail', weight: w,  mltpx: 'Add' })
      newMixes.push({ id: 'elvl_ele', label: 'EvnL-E', outputCh: 1, source: 'Ele', weight: w,  mltpx: 'Add' })
      newMixes.push({ id: 'elvr_ail', label: 'EvnR-A', outputCh: 2, source: 'Ail', weight: -w, mltpx: 'Add' })
      newMixes.push({ id: 'elvr_ele', label: 'EvnR-E', outputCh: 2, source: 'Ele', weight: w,  mltpx: 'Add' })
      // Clear CH1/CH2 direct routing — mixes now own these channels
      setChannels((prev) => prev.map((ch) =>
        ch.ch === 1 || ch.ch === 2 ? { ...ch, source: '---', weight: 0 } : ch
      ))
    }

    if (result.vTail) {
      const { eleWeight, rudWeight } = result.vTail
      newMixes.push({ id: 'vtl_ch2_ele', label: 'VtL-E', outputCh: 2, source: 'Ele', weight: eleWeight,   mltpx: 'Add' })
      newMixes.push({ id: 'vtl_ch2_rud', label: 'VtL-R', outputCh: 2, source: 'Rud', weight: rudWeight,   mltpx: 'Add' })
      newMixes.push({ id: 'vtl_ch4_ele', label: 'VtR-E', outputCh: 4, source: 'Ele', weight: eleWeight,   mltpx: 'Add' })
      newMixes.push({ id: 'vtl_ch4_rud', label: 'VtR-R', outputCh: 4, source: 'Rud', weight: -rudWeight,  mltpx: 'Add' })
      setChannels((prev) => prev.map((ch) =>
        ch.ch === 2 || ch.ch === 4 ? { ...ch, source: '---', weight: 0 } : ch
      ))
    }

    if (result.diffThrust) {
      const { weight, rightCh } = result.diffThrust
      newMixes.push({ id: 'dft_ch3_rud', label: 'DftL-R', outputCh: 3,      source: 'Rud', weight: weight,  mltpx: 'Add' })
      newMixes.push({ id: 'dft_chr_thr', label: 'DftR-T', outputCh: rightCh, source: 'Thr', weight: 100,    mltpx: 'Add' })
      newMixes.push({ id: 'dft_chr_rud', label: 'DftR-R', outputCh: rightCh, source: 'Rud', weight: -weight, mltpx: 'Add' })
      setChannels((prev) => prev.map((ch) =>
        ch.ch === rightCh ? { ...ch, source: '---', weight: 0, label: 'Right Motor' } : ch
      ))
    }

    if (newMixes.length > 0) setAdvMixes(newMixes)
    setWizardPhase('recap')
  }

  const saveNamedSnapshot = (name: string): void => {
    if (!effectiveModelId || !name.trim()) return
    const snap: NamedSnapshot = {
      id: Date.now().toString(36),
      name: name.trim(),
      ts: Date.now(),
      config: { channels, advMixes, switchVoice, surfaceRates, flapConfig, timerConfig },
    }
    setNamedSnapshots((prev) => {
      const next = [snap, ...prev]
      localStorage.setItem(`fd_snaps_${effectiveModelId}`, JSON.stringify(next))
      return next
    })
    setSnapshotInputName('')
    setShowSnapshotInput(false)
  }

  const deleteNamedSnapshot = (id: string): void => {
    if (!effectiveModelId) return
    setNamedSnapshots((prev) => {
      const next = prev.filter((s) => s.id !== id)
      localStorage.setItem(`fd_snaps_${effectiveModelId}`, JSON.stringify(next))
      return next
    })
  }

  const restoreNamedSnapshot = (snap: NamedSnapshot): void => {
    const { config } = snap
    if (config.channels) setChannels(config.channels)
    if (config.advMixes) setAdvMixes(config.advMixes)
    if (config.switchVoice) setSwitchVoice(config.switchVoice)
    if (config.surfaceRates) setSurfaceRates(config.surfaceRates)
    if (config.flapConfig) setFlapConfig(config.flapConfig)
    if (config.timerConfig) setTimerConfig(config.timerConfig)
    setShowHistory(false)
  }

  const restoreSnapshot = (entry: HistoryEntry): void => {
    const { config } = entry
    if (config.channels) setChannels(config.channels)
    if (config.advMixes) setAdvMixes(config.advMixes)
    if (config.switchVoice) setSwitchVoice(config.switchVoice)
    if (config.surfaceRates) setSurfaceRates(config.surfaceRates)
    if (config.flapConfig) setFlapConfig(config.flapConfig)
    if (config.timerConfig) setTimerConfig(config.timerConfig)
    setShowHistory(false)
  }

  const applyPreset = (preset: ModelPreset): void => {
    if (!window.confirm(`Apply "${preset.label}" preset? This will overwrite your current channel and rate settings.`)) return
    setChannels((prev) => {
      const next = [...prev]
      preset.channels.forEach((patch) => {
        const idx = next.findIndex((c) => c.ch === patch.ch)
        if (idx >= 0) next[idx] = { ...next[idx], ...patch }
      })
      return next
    })
    setSurfaceRates((prev) =>
      prev.map((sr) => {
        const p = preset.rates.find((r) => r.id === sr.id)
        if (!p) return sr
        return {
          ...sr,
          high: { ...sr.high, rate: p.high, expo: p.expo.high, curve: { ...sr.high.curve, expo: p.expo.high } },
          mid:  { ...sr.mid,  rate: p.mid,  expo: p.expo.mid,  curve: { ...sr.mid.curve,  expo: p.expo.mid  } },
          low:  { ...sr.low,  rate: p.low,  expo: p.expo.low,  curve: { ...sr.low.curve,  expo: p.expo.low  } },
        }
      })
    )
    if (preset.flap) setFlapConfig((prev) => ({ ...prev, ...preset.flap }))
    if (preset.timer) setTimerConfig((prev) => ({ ...prev, ...preset.timer }))
    setShowPresets(false)
  }

  // Load model configuration from YAML file on SD card
  const loadFromRadio = async (): Promise<void> => {
    if (!sdDrive || !selectedYamlFile) return
    setLoadingModel(true)
    setWriteResult(null)
    try {
      const res = await window.api.edgetx.loadModelConfig(sdDrive, selectedYamlFile)
      if (!res.success) {
        setWriteResult({ ok: false, msg: res.error ?? 'Could not load model' })
        return
      }
      if (res.modelName) setModelName(res.modelName)
      if (res.channels && Array.isArray(res.channels)) {
        setChannels(res.channels as ChannelConfig[])
      }
      setWriteResult({ ok: true, msg: `Loaded "${res.modelName}" from ${selectedYamlFile}` })
    } catch (e) {
      setWriteResult({ ok: false, msg: String(e) })
    } finally {
      setLoadingModel(false)
    }
  }

  // Push config to radio — tries YAML direct write first, falls back to Lua script
  const pushToRadio = async (): Promise<void> => {
    if (!sdDrive) return
    setWriting(true)
    setWriteResult(null)
    const config = { modelName, channels, advancedMixes: advMixes, switchVoice, surfaceRates, flapConfig }

    try {
      // If a YAML model file is selected, write directly — no Lua script needed
      if (selectedYamlFile && sdInfo?.hasYamlModels) {
        const res = await window.api.edgetx.saveModelYaml(sdDrive, selectedYamlFile, config)
        if (res.success) {
          setWriteResult({
            ok: true,
            msg: `Saved directly to ${selectedYamlFile}\nChanges load automatically next time you select this model on the radio.\nBackup created alongside the original.`,
            mode: 'yaml'
          })
          return
        }
        // YAML write failed — fall through to Lua script
      }

      // Fallback: write Lua script
      const res = await window.api.edgetx.writeConfigScript(sdDrive, config)
      setWriteResult(res.success
        ? {
            ok: true,
            msg: `Script written → SCRIPTS/TOOLS/FDCONFIG.lua\nRun it from your radio TOOLS menu with "${modelName}" loaded.`,
            mode: 'lua'
          }
        : { ok: false, msg: res.error ?? 'Unknown error' }
      )
    } catch (e) {
      setWriteResult({ ok: false, msg: String(e) })
    } finally {
      setWriting(false)
    }
  }

  // ── Render connection header ──
  const renderHeader = (): JSX.Element => {
    const hasYaml = sdInfo?.hasYamlModels && (sdInfo.yamlModelFiles.length ?? 0) > 0
    return (
      <div className="border-b border-[#334155] shrink-0">
        {/* Status row */}
        <div className="flex items-center gap-4 px-6 py-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-3 h-3 rounded-full shrink-0 ${sdDrive ? 'bg-[#22c55e]' : 'bg-[#475569]'}`}
              style={sdDrive ? { boxShadow: '0 0 8px #22c55e' } : undefined}
            />
            <div>
              {sdDrive ? (
                <span className="text-[#22c55e] font-semibold text-sm">TX16S Connected — {sdDrive}</span>
              ) : (
                <span className="text-[#475569] text-sm">No Radio — plug in TX16S and select USB Storage</span>
              )}
              {sdInfo && (
                <span className="ml-3 text-[#94a3b8] text-xs">
                  {sdInfo.soundFiles.length} sounds · {sdInfo.scriptFiles.length} scripts
                </span>
              )}
            </div>
          </div>

          {/* Mode badge */}
          {sdDrive && (
            <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
              hasYaml
                ? 'bg-[#22c55e]/15 text-[#22c55e] border border-[#22c55e]/30'
                : 'bg-[#f59e0b]/15 text-[#f59e0b] border border-[#f59e0b]/30'
            }`}>
              {hasYaml ? '⚡ Direct Edit' : '🔧 Script Mode'}
            </span>
          )}
        </div>

        {/* Model selector row — shown when YAML files are available */}
        {sdDrive && hasYaml && (
          <div className="flex items-center gap-3 px-6 pb-3">
            <span className="text-[#94a3b8] text-xs shrink-0">Model file:</span>
            <select
              value={selectedYamlFile}
              onChange={(e) => setSelectedYamlFile(e.target.value)}
              className="bg-[#0f172a] border border-[#334155] rounded-lg px-3 py-1.5 text-[#f1f5f9] text-sm
                focus:outline-none focus:border-[#3b82f6] transition-colors flex-1 max-w-xs"
            >
              {sdInfo!.yamlModelFiles.map((f) => (
                <option key={f} value={f}>
                  {yamlModelNames[f] ? `${yamlModelNames[f]} (${f})` : f}
                </option>
              ))}
            </select>
            <button
              onClick={loadFromRadio}
              disabled={!selectedYamlFile || loadingModel}
              className="px-3 py-1.5 rounded-lg border border-[#334155] hover:border-[#3b82f6]
                text-[#94a3b8] hover:text-[#3b82f6] text-xs font-medium transition-all
                disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loadingModel ? '⏳ Loading...' : '⬇ Load from Radio'}
            </button>
            <span className="text-[#94a3b8] text-[10px]">or type your model name:</span>
            <input
              type="text"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              className="bg-[#0f172a] border border-[#334155] rounded-lg px-3 py-1.5 text-[#f1f5f9] text-sm
                w-36 focus:outline-none focus:border-[#3b82f6] transition-colors"
              placeholder="Model name"
            />
          </div>
        )}

        {/* Model name only when no YAML */}
        {sdDrive && !hasYaml && (
          <div className="flex items-center gap-3 px-6 pb-3">
            <span className="text-[#94a3b8] text-xs">Model name (used in script):</span>
            <input
              type="text"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              className="bg-[#0f172a] border border-[#334155] rounded-lg px-3 py-1.5 text-[#f1f5f9] text-sm
                w-52 focus:outline-none focus:border-[#3b82f6] transition-colors"
              placeholder="e.g. Gee Bee"
            />
          </div>
        )}
      </div>
    )
  }

  // ── Render result banner ──
  const renderResultBanner = (): JSX.Element | null => {
    if (!writeResult) return null
    return (
      <div className={`mx-6 mt-3 rounded-xl px-4 py-3 border text-sm whitespace-pre-line ${
        writeResult.ok
          ? 'bg-[#0d2818] border-[#22c55e]/40 text-[#22c55e]'
          : 'bg-[#2d0f0f] border-[#ef4444]/40 text-[#ef4444]'
      }`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <span>{writeResult.ok ? '✓ ' : '✗ '}{writeResult.msg}</span>
            {writeResult.ok && writeResult.mode === 'yaml' && (
              <div className="mt-1 text-[10px] text-[#22c55e]/70">
                Direct YAML write — no Lua script step required.
              </div>
            )}
            {writeResult.ok && writeResult.mode === 'lua' && (
              <div className="mt-1 text-[10px] text-[#f59e0b]">
                Models stored in internal flash — manual script step required.
              </div>
            )}
          </div>
          <button onClick={() => setWriteResult(null)} className="text-current opacity-60 hover:opacity-100 shrink-0">×</button>
        </div>
      </div>
    )
  }

  // ── Render tabs ──
  const updateSurfaceRate = (id: string, patch: Partial<SurfaceRates>): void => {
    setSurfaceRates((prev) => prev.map((sr) => sr.id === id ? { ...sr, ...patch } : sr))
  }

  const updateRateLine = (id: string, pos: 'high' | 'mid' | 'low', patch: Partial<RateLine>): void => {
    setSurfaceRates((prev) => prev.map((sr) => {
      if (sr.id !== id) return sr
      const updated = { ...sr[pos], ...patch }
      // Keep expo field in sync with curve expo when curve changes
      if (patch.curve && updated.curve.type === 'expo') {
        updated.expo = updated.curve.expo
      }
      // Keep curve expo in sync when expo slider changes directly
      if (patch.expo !== undefined && (!patch.curve)) {
        updated.curve = { ...updated.curve, expo: patch.expo }
      }
      return { ...sr, [pos]: updated }
    }))
  }

  // ── Help / Documentation ─────────────────────────────────────────────────────

  const renderHelp = (): JSX.Element => {
    const Section = ({
      color, icon, title, children,
    }: {
      color: string; icon: string; title: string; children: React.ReactNode
    }): JSX.Element => (
      <div className={`rounded-xl border p-5 space-y-3 ${color}`}>
        <div className="flex items-center gap-2">
          <span className="text-2xl">{icon}</span>
          <h2 className="text-[#f1f5f9] text-base font-bold">{title}</h2>
        </div>
        <div className="space-y-2 text-[#cbd5e1] text-sm leading-relaxed">
          {children}
        </div>
      </div>
    )

    const Step = ({ n, children }: { n: number; children: React.ReactNode }): JSX.Element => (
      <div className="flex gap-3">
        <span className="shrink-0 w-6 h-6 rounded-full bg-[#3b82f6]/20 text-[#60a5fa] text-xs font-bold flex items-center justify-center mt-0.5">{n}</span>
        <span>{children}</span>
      </div>
    )

    const Btn = ({ children }: { children: React.ReactNode }): JSX.Element => (
      <span className="inline-block px-2 py-0.5 rounded bg-[#1e293b] border border-[#475569] text-[#e2e8f0] text-xs font-mono">{children}</span>
    )

    const Highlight = ({ children }: { children: React.ReactNode }): JSX.Element => (
      <span className="text-[#93c5fd] font-semibold">{children}</span>
    )

    const Note = ({ children }: { children: React.ReactNode }): JSX.Element => (
      <div className="flex gap-2 bg-[#0f172a]/50 rounded-lg px-3 py-2 text-[#94a3b8] text-xs">
        <span className="shrink-0">💡</span>
        <span>{children}</span>
      </div>
    )

    return (
      <div className="p-6 space-y-5 max-w-2xl">

        {/* What is this */}
        <Section color="border-[#3b82f6]/40 bg-[#3b82f6]/5" icon="✈️" title="What is FlightDeck?">
          <p>
            FlightDeck is a setup tool for RC planes. It helps you plan exactly how your radio controls your airplane —
            which switches do what, how far the surfaces move, what sounds play.
            When you are happy with the setup, you click one button and it writes the whole thing to your radio.
          </p>
          <p>
            You do NOT need to be connected to your radio to plan your settings.
            You can set everything up at your desk, then write it to the radio before you fly.
          </p>
        </Section>

        {/* Quick start */}
        <Section color="border-[#22c55e]/40 bg-[#22c55e]/5" icon="🚀" title="Quick Start — Do These Steps in Order">
          <Step n={1}>
            <span><strong>Add your plane.</strong> Click the <Btn>+</Btn> button on the left sidebar.
            Give it a name (like &quot;P47 Warbird&quot;) and save it.</span>
          </Step>
          <Step n={2}>
            <span><strong>Open Radio Studio.</strong> Click your plane name, then click <Btn>Radio Studio</Btn>.
            This is where all the setup lives.</span>
          </Step>
          <Step n={3}>
            <span><strong>Pick a preset (optional).</strong> Click <Btn>⚡ Presets</Btn> at the bottom to start with a good base
            for your plane type — Trainer, Sport, Warbird, etc.</span>
          </Step>
          <Step n={4}>
            <span><strong>Set up your tabs.</strong> Go through Channels, Rates, and Flaps and adjust the sliders.
            Everything saves automatically as you go.</span>
          </Step>
          <Step n={5}>
            <span><strong>Save a snapshot before you experiment.</strong> Click <Btn>★ Save Snapshot</Btn> and
            name it (like &quot;original settings&quot;). If you make a mistake, you can always go back.</span>
          </Step>
          <Step n={6}>
            <span><strong>Connect your SD card and export.</strong> Plug in your radio or insert its SD card.
            Click the <Btn>Export to Radio</Btn> tab, pick a slot, and click <Btn>Export</Btn>.
            Then load the file on your radio.</span>
          </Step>
        </Section>

        {/* Channels */}
        <Section color="border-[#a855f7]/40 bg-[#a855f7]/5" icon="📡" title="Channels Tab — What Each Channel Controls">
          <p>
            Think of channels like separate wires between your radio and your plane.
            Each channel controls exactly one thing. Most planes need at least 4 channels.
          </p>
          <div className="space-y-1.5">
            {[
              ['Channel 1', 'Aileron', 'Roll left and right — the stick going left/right'],
              ['Channel 2', 'Elevator', 'Nose up and down — the stick going forward/back'],
              ['Channel 3', 'Throttle', 'Motor speed — the stick going up/down on the left'],
              ['Channel 4', 'Rudder', 'Yaw (nose swings left/right) — the rudder pedals or twist'],
              ['Channel 5', 'SAFE / AS3X mode', 'Tells the receiver what stabilization mode to use'],
              ['Channel 6', 'Flaps', 'The movable panels on the back of the wings'],
              ['Channel 7', 'Landing gear', 'Retracts up or deploys down'],
            ].map(([ch, name, desc]) => (
              <div key={ch} className="flex gap-2 text-xs border-b border-[#1e293b] pb-1.5">
                <span className="text-[#a78bfa] font-mono w-20 shrink-0">{ch}</span>
                <span className="text-[#f1f5f9] font-semibold w-28 shrink-0">{name}</span>
                <span className="text-[#94a3b8]">{desc}</span>
              </div>
            ))}
          </div>
          <div className="space-y-1.5 pt-1">
            <p><strong className="text-[#f1f5f9]">Source</strong> — What the channel listens to.
            <Highlight> Ail, Ele, Thr, Rud</Highlight> are the four main sticks.
            <Highlight> SA, SB, SF</Highlight> are switches.
            <Highlight> LS, RS</Highlight> are the left and right sliders.</p>
            <p><strong className="text-[#f1f5f9]">Weight</strong> — How much the channel moves. 100% means full travel.
            50% means it only moves halfway.</p>
            <p><strong className="text-[#f1f5f9]">Reversed</strong> — Check this box if the servo moves the wrong way.
            For example, if pushing the elevator stick up makes the nose go down, check Reversed on Channel 2.</p>
          </div>
          <Note>You do NOT need all 8 channels. Only set up the ones your plane actually uses.</Note>
        </Section>

        {/* Rates */}
        <Section color="border-[#f59e0b]/40 bg-[#f59e0b]/5" icon="🎚️" title="Rates & Expo Tab — How Sensitive the Sticks Are">
          <p>
            <strong className="text-[#f1f5f9]">Rates</strong> control how far your control surfaces move when you push a stick all the way.
            Lower rates make the plane easier to control. Higher rates make it more aggressive.
          </p>
          <div className="space-y-1 text-xs">
            <div className="flex gap-3"><span className="text-[#fbbf24] w-20 font-semibold shrink-0">High rates</span><span>Big movements — used for aerobatics or strong wind</span></div>
            <div className="flex gap-3"><span className="text-[#fbbf24] w-20 font-semibold shrink-0">Mid rates</span><span>Normal flying — a good place to start</span></div>
            <div className="flex gap-3"><span className="text-[#fbbf24] w-20 font-semibold shrink-0">Low rates</span><span>Small movements — great for beginners or landing</span></div>
          </div>
          <p>
            <strong className="text-[#f1f5f9]">Expo</strong> makes the stick feel gentle in the middle, while still having full travel at the edges.
            Think of it like power steering — light touch near center, full control at the extremes.
            Most pilots use 20–40% expo. 0% means no change (linear).
          </p>
          <p>
            <strong className="text-[#f1f5f9]">Switch SA</strong> selects which rate set is active:
          </p>
          <div className="space-y-1 text-xs pl-2">
            <div className="flex gap-2"><span className="text-[#22c55e] w-36 shrink-0">SA toward you (pos 2)</span><span>→ High rates, Full flaps</span></div>
            <div className="flex gap-2"><span className="text-[#f59e0b] w-36 shrink-0">SA in the middle (pos 1)</span><span>→ Mid rates, 50% flaps</span></div>
            <div className="flex gap-2"><span className="text-[#94a3b8] w-36 shrink-0">SA away from you (pos 0)</span><span>→ Low rates, No flaps</span></div>
          </div>
          <Note>Set low rates first. Fly on those, then slowly increase until it feels right for you.</Note>
        </Section>

        {/* Flaps */}
        <Section color="border-[#06b6d4]/40 bg-[#06b6d4]/5" icon="🛬" title="Flap / Wing Tab — Setting Up Flaps">
          <p>
            Flaps are panels on the back of the wings that fold down. They slow the plane and help it land
            at a lower speed. Some planes also use them to tighten turns or as crow brakes.
          </p>
          <Step n={1}><span>Turn on <Highlight>Flap Enabled</Highlight> at the top of the tab.</span></Step>
          <Step n={2}><span>Choose how many stages you need. <strong>3 stages</strong> = up, half, full — good for most warbirds.</span></Step>
          <Step n={3}><span>Set <Highlight>Flap Channel</Highlight> to the channel your flap servo is on (usually channel 6).</span></Step>
          <Step n={4}><span>
            Set <Highlight>Elevator Compensation</Highlight>. When flaps go down, the nose naturally pitches up.
            This setting automatically adds a tiny bit of down trim to cancel that out.
            Start at 10–15% and adjust at the field.
          </span></Step>
          <Note>
            Your flap switch is SA — the same switch that controls your rates.
            When you flip SA to full flaps, you automatically also switch to high rates.
            That is intentional — high rates give you better control on final approach.
          </Note>
        </Section>

        {/* Switches summary */}
        <Section color="border-[#3b82f6]/40 bg-[#3b82f6]/5" icon="🔲" title="Your Switch Setup — What Each Switch Does">
          <p>
            These are the switch assignments that get exported to your radio.
            They are already set up for E-Flite warbirds with AS3X + SAFE receivers.
          </p>
          <div className="space-y-3">
            {[
              {
                sw: 'SB', color: '#3b82f6', label: 'SAFE / AS3X Mode (left 3-pos)',
                rows: [['Pos 0 — away from you', 'AS3X stabilization only (no self-leveling)'],
                       ['Pos 1 — middle', 'Stabilization OFF'],
                       ['Pos 2 — toward you', 'SAFE mode ON (self-leveling, panic recovery)']],
              },
              {
                sw: 'SA', color: '#f59e0b', label: 'Rates + Flaps (right 3-pos)',
                rows: [['Pos 0 — away from you', 'Low rates + No flaps (takeoff or cruise)'],
                       ['Pos 1 — middle', 'Mid rates + 50% flaps (pattern flying)'],
                       ['Pos 2 — toward you', 'High rates + Full flaps (landing approach)']],
              },
              {
                sw: 'LS', color: '#64748b', label: 'Landing Gear (left slider)',
                rows: [['Push forward (down)', 'Gear deploys — wheels come out'],
                       ['Pull back (up)', 'Gear retracts — wheels fold in']],
              },
              {
                sw: 'SF', color: '#06b6d4', label: 'Reverse Thrust (right front 2-pos)',
                rows: [['SF down (pos 0)', 'Normal throttle — stick controls speed forward'],
                       ['SF up (pos 1)', 'Reverse thrust — stick now controls reverse motor speed']],
              },
            ].map(({ sw, color, label, rows }) => (
              <div key={sw}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-7 h-7 rounded text-xs font-bold flex items-center justify-center text-white shrink-0" style={{ background: color }}>{sw}</span>
                  <span className="text-[#f1f5f9] text-xs font-semibold">{label}</span>
                </div>
                <div className="pl-9 space-y-0.5">
                  {rows.map(([pos, action]) => (
                    <div key={pos} className="flex gap-2 text-xs">
                      <span className="text-[#64748b] w-44 shrink-0">{pos}</span>
                      <span className="text-[#cbd5e1]">→ {action}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Sound Studio */}
        <Section color="border-[#a855f7]/40 bg-[#a855f7]/5" icon="🎙️" title="Sound Studio Tab — Recording Sounds for Your Radio">
          <p>
            You can record your own sounds and send them to your radio. When you flip a switch, the radio
            can announce what it just did — like saying &quot;safe mode on&quot; when you flip SB.
          </p>
          <Step n={1}><span>Click the microphone button and allow microphone access when your browser asks.</span></Step>
          <Step n={2}><span>Click <Btn>Record</Btn> and say your word or phrase. Keep it short — under 2 seconds.</span></Step>
          <Step n={3}><span>Click <Btn>Stop</Btn>. Click <Btn>Play</Btn> to hear it back.</span></Step>
          <Step n={4}><span>Give the sound a name — <strong>8 letters or less, no spaces</strong>.
          For example: <Highlight>safe</Highlight>, <Highlight>gear</Highlight>, <Highlight>flaps</Highlight>.</span></Step>
          <Step n={5}><span>Click <Btn>Save to App Library</Btn>. The sound is now saved in your browser and will appear in the Voice & Switches dropdowns.</span></Step>
          <Step n={6}><span>Connect your SD card and click <Btn>Save to Radio SD</Btn> to put the file on your radio.</span></Step>
          <Note>Sound files go in the SOUNDS/en/ folder on your SD card. EdgeTX looks there automatically.</Note>
        </Section>

        {/* Voice & Switches */}
        <Section color="border-[#10b981]/40 bg-[#10b981]/5" icon="🔊" title="Voice & Switches Tab — Announcing Switch Positions">
          <p>
            Once you have sounds saved, you can tell the radio to announce them when you flip a switch.
          </p>
          <Step n={1}><span>Go to the <Btn>Voice & Switches</Btn> tab.</span></Step>
          <Step n={2}><span>Find the switch you want to add a voice to (SA, SB, SF, etc.).</span></Step>
          <Step n={3}><span>For each position (up, mid, down), use the dropdown to pick a sound from your library.</span></Step>
          <Step n={4}><span>These settings get saved when you click <Btn>Export to Radio</Btn>.</span></Step>
          <Note>You need to record or upload sounds first in the Sound Studio tab before they appear in the dropdown.</Note>
        </Section>

        {/* Export */}
        <Section color="border-[#22c55e]/40 bg-[#22c55e]/5" icon="📤" title="Export to Radio Tab — Sending Everything to Your Radio">
          <p>
            This is the most important button in the app. It takes everything you have set up and writes it
            as a model file that your TX16S radio can read.
          </p>
          <Step n={1}><span>Plug your radio into your computer with a USB cable, then put it in USB storage mode. OR remove the SD card and plug it into a card reader.</span></Step>
          <Step n={2}><span>Go to the <Btn>SD Card Files</Btn> tab and click <Btn>Connect SD Card</Btn>. Choose the SD card folder.</span></Step>
          <Step n={3}><span>Come back to <Btn>Export to Radio</Btn>.</span></Step>
          <Step n={4}><span>
            Check the <Highlight>Flap → Elevator Compensation</Highlight> slider. For most E-Flite warbirds, 11% is correct.
            This automatically adds a tiny bit of up elevator when your flaps go down.
          </span></Step>
          <Step n={5}><span>Pick a <Highlight>Model Slot</Highlight> — this is where the file goes on your radio.
          model01 through model99 follow the standard naming pattern — the radio itself has no limit beyond SD card space.
          Check the SD Card Files tab to see which slots are already taken.</span></Step>
          <Step n={6}><span>Click <Btn>Export</Btn>. The file gets written to the MODELS/ folder on your SD card.</span></Step>
          <Step n={7}><span>
            <strong>On your TX16S radio:</strong> Press and hold the MDL button → scroll to the model slot you chose →
            press the roller and choose Restore from SD. Your radio will load all the settings.
          </span></Step>
          <Step n={8}><span>
            Go into the MIXER screen on your radio to verify channels look correct before you fly.
          </span></Step>
          <Note>
            If you do not have an SD card handy, click Export anyway — it will download the .yml file to your computer.
            You can then copy it to the MODELS/ folder manually.
          </Note>
        </Section>

        {/* Snapshots */}
        <Section color="border-[#f59e0b]/40 bg-[#f59e0b]/5" icon="★" title="Snapshots — Saving and Restoring Your Settings">
          <p>
            A snapshot saves a copy of all your settings at this exact moment.
            If you experiment and something goes wrong, you click Restore and everything goes back to exactly how it was.
          </p>
          <Step n={1}><span>Before you change anything important, click <Btn>★ Save Snapshot</Btn> at the bottom of the screen.</span></Step>
          <Step n={2}><span>Type a name that will help you remember what this is — like <Highlight>P47 before flap tune</Highlight>.</span></Step>
          <Step n={3}><span>Click <Btn>Save</Btn>. The snapshot is stored in your browser and never expires.</span></Step>
          <Step n={4}><span>If you want to go back, click <Btn>↩ History</Btn> at the bottom. Your named snapshots appear at the top in green.</span></Step>
          <Step n={5}><span>Click <Btn>Restore</Btn> next to the snapshot you want. All settings go back instantly.</span></Step>
          <Note>
            Auto-saves happen automatically every time you change a setting — you can see the last 10 auto-saves
            in the History panel under &quot;Auto-saved changes&quot;. Named snapshots are permanent and do not get deleted automatically.
          </Note>
        </Section>

        {/* SD Card Files */}
        <Section color="border-[#64748b]/40 bg-[#64748b]/5" icon="💾" title="SD Card Files Tab — Reading Your Radio's Current Files">
          <p>
            This tab shows you what is already on your radio's SD card.
          </p>
          <Step n={1}><span>Plug in your radio or insert the SD card.</span></Step>
          <Step n={2}><span>Click <Btn>Connect SD Card</Btn> and select the SD card folder. Your browser will ask for permission — click Allow.</span></Step>
          <Step n={3}><span>FlightDeck will show you a list of all model files (.yml), sound files (.wav), and scripts that are on the card.</span></Step>
          <Step n={4}><span>Click any model file name to see what plane it is for. You can load its settings into Radio Studio.</span></Step>
          <Note>
            The SD card connection only works on Chrome or Edge desktop browsers. It does not work on iPhone, iPad, Firefox, or Safari.
            Use a computer to connect your SD card.
          </Note>
        </Section>

        {/* Flight Timer */}
        <Section color="border-[#ef4444]/40 bg-[#ef4444]/5" icon="⏱️" title="Flight Timer Tab — Tracking Battery Usage">
          <p>
            The flight timer helps you track how long you have been flying so you know when to land before the battery dies.
          </p>
          <Step n={1}><span>Go to the <Btn>Flight Timer</Btn> tab.</span></Step>
          <Step n={2}><span>Set <Highlight>Max Minutes</Highlight> to how long your battery lasts. For most 3S and 4S planes, 8–12 minutes is safe.</span></Step>
          <Step n={3}><span>Click <Btn>Start Timer</Btn> when you take off. Click it again to stop when you land.</span></Step>
          <Step n={4}><span>The timer turns yellow when you hit the warning percent (default 80%), and red at 100%.</span></Step>
          <Step n={5}><span>Click <Btn>Log Flight</Btn> to record this flight in your flight log.</span></Step>
          <Note>The timer is on your phone or computer, not on the radio itself. Keep it open while you fly.</Note>
        </Section>

        {/* Common questions */}
        <Section color="border-[#334155] bg-[#1e293b]" icon="❓" title="Common Questions">
          <div className="space-y-3">
            {[
              ['Do I have to be online to use FlightDeck?',
               'No. Once the page is loaded, everything works offline. Your settings are saved in your browser, not on a server.'],
              ['Will Export overwrite my existing radio settings?',
               'Yes — it writes to whichever model slot you pick. If something is already in that slot, it will be replaced. Always pick an empty slot, or save a snapshot of your current radio setup first by loading the existing file in SD Card Files.'],
              ['My SD card is not showing up. What do I do?',
               'Make sure you are using Chrome or Edge on a desktop computer. Safari, Firefox, and mobile browsers cannot access SD cards. Also make sure you selected the right folder — it should be the root of the SD card, not a subfolder inside it.'],
              ['The Export file is downloaded instead of written to the SD card. Why?',
               'This happens when no SD card is connected, or the browser blocked access. Connect your SD card first using the SD Card Files tab, then come back to Export.'],
              ['I do not know what rates to use. Where do I start?',
               'Click the Presets button at the bottom and choose a preset that matches your plane. Those are reasonable starting values. Then fly and adjust from there.'],
              ['What receivers work with the Export feature?',
               'The switch assignments and channel layout are set up for Spektrum AR631, AR636, AR637, and similar AS3X + SAFE receivers found in E-Flite BNF planes. If you have a different receiver, you may need to adjust the channel assignments.'],
            ].map(([q, a]) => (
              <div key={String(q)} className="space-y-1">
                <p className="text-[#f1f5f9] text-sm font-semibold">{q}</p>
                <p className="text-[#94a3b8] text-sm pl-0">{a}</p>
              </div>
            ))}
          </div>
        </Section>

      </div>
    )
  }

  // ── Export to Radio ──────────────────────────────────────────────────────────

  const downloadYaml = (content: string, filename: string): void => {
    const blob = new Blob([content], { type: 'text/yaml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExport = async (): Promise<void> => {
    setExporting(true)
    setExportResult(null)
    try {
      const rates = surfaceRates.map((sr) => ({
        id: sr.id,
        high: { rate: sr.high.rate, expo: sr.high.expo },
        mid:  { rate: sr.mid.rate,  expo: sr.mid.expo  },
        low:  { rate: sr.low.rate,  expo: sr.low.expo  },
      }))

      const cfg: EdgeTxGenConfig = {
        ...exportCfg,
        modelName: modelName || 'Warbird',
        rates,
        aileronReversed:  channels.find((c) => c.ch === exportCfg.aileronCh)?.reversed  ?? false,
        elevatorReversed: channels.find((c) => c.ch === exportCfg.elevatorCh)?.reversed ?? false,
        throttleReversed: channels.find((c) => c.ch === exportCfg.throttleCh)?.reversed ?? false,
        rudderReversed:   channels.find((c) => c.ch === exportCfg.rudderCh)?.reversed   ?? false,
        flapEnabled: flapConfig.enabled,
        flapStages: flapConfig.stageList.map((s) => ({ travel: s.flapPct, elevComp: s.elevComp })),
        airframeMix: mixWizardResult
          ? mixWizardResult.elevon
            ? { type: 'elevon' as const, weight: mixWizardResult.elevon.weight }
            : mixWizardResult.vTail
            ? { type: 'vtail' as const, eleWeight: mixWizardResult.vTail.eleWeight, rudWeight: mixWizardResult.vTail.rudWeight }
            : mixWizardResult.diffThrust
            ? { type: 'diffThrust' as const, weight: mixWizardResult.diffThrust.weight, rightCh: mixWizardResult.diffThrust.rightCh }
            : undefined
          : undefined,
        throttleCutSwitch: mixWizardResult?.throttleCutSwitch,
        throttleCutMode:   mixWizardResult?.throttleCutMode,
        flapEleComps:      mixWizardResult?.flapEleComps,
        thrRudMix:         mixWizardResult?.thrRudMix,
        revThrustSwitch:   mixWizardResult?.revThrustSwitch,
        flapSlow:          mixWizardResult?.flapSlow,
      }

      const yaml = generateEdgeTxYaml(cfg)
      const fname = modelFileName(exportSlot)

      const sdApi = (window.api as any).edgetx
      if (sdApi?.writeModelYaml) {
        const result = await sdApi.writeModelYaml(fname, yaml)
        if (result.success) {
          setExportResult({ ok: true, msg: `Written to MODELS/${fname} — import it in EdgeTX: Model → SD Card → ${fname}` })
        } else {
          downloadYaml(yaml, fname)
          setExportResult({ ok: true, msg: `SD write failed (${result.error}). File downloaded — copy it to your radio's MODELS/ folder.` })
        }
      } else {
        downloadYaml(yaml, fname)
        setExportResult({ ok: true, msg: `Downloaded ${fname} — copy it to MODELS/ on your radio's SD card, then import in EdgeTX.` })
      }
    } catch (err) {
      setExportResult({ ok: false, msg: err instanceof Error ? err.message : String(err) })
    } finally {
      setExporting(false)
    }
  }

  const renderExport = (): JSX.Element => {

    return (
      <div className="p-6 space-y-6 max-w-2xl">
        <div>
          <h2 className="text-[#f1f5f9] text-lg font-semibold">Export EdgeTX Model File</h2>
          <p className="text-[#94a3b8] text-sm mt-1">
            Reads all your Radio Studio slider values and generates a complete <code className="text-[#93c5fd]">.yml</code> model
            file. Connect your radio&apos;s SD card (SD Card Files tab), then click Export to write it directly to
            <code className="text-[#93c5fd]"> MODELS/</code>. Or download and copy it manually.
          </p>
        </div>

        {/* Switch assignments */}
        <div className="bg-[#1e293b] rounded-xl border border-[#334155] p-4 space-y-5">
          <h3 className="text-[#f1f5f9] text-sm font-semibold">Switch Assignments</h3>

          {/* SB — SAFE */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded text-[10px] font-bold flex items-center justify-center text-white" style={{ background: '#3b82f6' }}>SB</span>
              <span className="text-[#f1f5f9] text-sm font-medium">SAFE / AS3X mode</span>
            </div>
            <div className="grid grid-cols-3 gap-2 pl-8 text-xs text-[#94a3b8]">
              <div>Pos 0 (away)</div><div>Pos 1 (mid)</div><div>Pos 2 (toward)</div>
              <div className={exportCfg.safePosAsx === 0 ? 'text-[#60a5fa] font-bold' : ''}>AS3X only</div>
              <div className={exportCfg.safePosOff === 1 ? 'text-[#94a3b8]' : ''}>Off</div>
              <div className={exportCfg.safePosOn === 2 ? 'text-[#22c55e] font-bold' : ''}>SAFE on</div>
            </div>
          </div>

          {/* SA — Rates + Flaps */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded text-[10px] font-bold flex items-center justify-center text-white" style={{ background: '#f59e0b' }}>SA</span>
              <span className="text-[#f1f5f9] text-sm font-medium">Rates + Flaps (same switch)</span>
            </div>
            <div className="grid grid-cols-3 gap-2 pl-8 text-xs text-[#94a3b8]">
              <div>Pos 0 — Low rates / 0% flap</div>
              <div>Pos 1 — Mid rates / 50% flap</div>
              <div>Pos 2 — High rates / 100% flap</div>
            </div>
            <p className="pl-8 text-[#64748b] text-xs">Rates come from your Rates & Expo tab values.</p>
          </div>

          {/* LS — Gear */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded text-[10px] font-bold flex items-center justify-center text-white bg-[#64748b]">LS</span>
              <span className="text-[#f1f5f9] text-sm font-medium">Gear (left slider)</span>
            </div>
            <p className="pl-8 text-[#94a3b8] text-xs">Push forward = gear down, pull back = gear up. Channel 7.</p>
          </div>

          {/* SF — Reverse thrust */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded text-[10px] font-bold flex items-center justify-center text-white" style={{ background: '#06b6d4' }}>SF</span>
              <span className="text-[#f1f5f9] text-sm font-medium">Reverse thrust</span>
            </div>
            <div className="pl-8 text-xs text-[#94a3b8]">
              <div className="flex gap-4">
                <span>SF down (pos 0) = normal throttle</span>
                <span className="text-[#f87171]">SF up (pos 1) = reversed throttle</span>
              </div>
              <p className="mt-1 text-[#64748b]">Reverses the throttle channel — no extra channel needed.</p>
            </div>
          </div>

          {/* Flap elev comp override */}
          <div className="space-y-1.5">
            <label className="text-[#94a3b8] text-xs font-medium uppercase tracking-wide">
              Flap → Elevator Compensation (up)
            </label>
            <div className="flex items-center gap-3 pl-0">
              <input
                type="range" min={0} max={30} step={1}
                value={exportCfg.flapElevComp}
                onChange={(e) => setExportCfg((p) => ({ ...p, flapElevComp: Number(e.target.value) }))}
                className="flex-1 accent-[#3b82f6]"
              />
              <span className="w-12 text-center bg-[#0f172a] border border-[#334155] rounded px-1.5 py-0.5 text-[#f1f5f9] text-xs">
                {exportCfg.flapElevComp}%
              </span>
            </div>
            <p className="text-[#64748b] text-xs">Up elevator added when flaps deploy fully. 11% is standard for E-Flite warbirds.</p>
          </div>
        </div>

        {/* Channel summary */}
        <div className="bg-[#1e293b] rounded-xl border border-[#334155] p-4">
          <h3 className="text-[#f1f5f9] text-sm font-semibold mb-3">Channel Map</h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
            {[
              ['Ch 1', 'Aileron (multi-rate via SA)'],
              ['Ch 2', 'Elevator (multi-rate via SA)'],
              ['Ch 3', 'Throttle + Reverse (SF)'],
              ['Ch 4', 'Rudder (multi-rate via SA)'],
              ['Ch 5', 'SAFE / AS3X (SB switch)'],
              ['Ch 6', 'Flaps (SA switch)'],
              ['Ch 7', 'Gear (LS slider)'],
              ['Ch 8', 'AUX2 (unused)'],
            ].map(([ch, desc]) => (
              <div key={ch} className="flex gap-2 py-0.5 border-b border-[#243044]">
                <span className="text-[#3b82f6] font-mono w-10 shrink-0">{ch}</span>
                <span className="text-[#cbd5e1]">{desc}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Model slot + export button */}
        <div className="bg-[#1e293b] rounded-xl border border-[#334155] p-4 space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="text-[#94a3b8] text-xs font-medium uppercase tracking-wide block mb-1.5">
                Model Slot
              </label>
              <select
                value={exportSlot}
                onChange={(e) => setExportSlot(Number(e.target.value))}
                className="w-full bg-[#0f172a] border border-[#334155] rounded-lg px-3 py-2 text-[#f1f5f9] text-sm focus:outline-none focus:border-[#3b82f6]"
              >
                {Array.from({ length: 99 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{modelFileName(n)}</option>
                ))}
              </select>
              <p className="text-[#64748b] text-xs mt-1">Pick a free slot (check SD Card Files tab first)</p>
            </div>

            <div className="shrink-0 pt-6">
              <button
                onClick={handleExport}
                disabled={exporting}
                className={`px-6 py-3 rounded-xl font-semibold text-sm transition-all ${
                  exporting
                    ? 'bg-[#22c55e]/30 text-[#22c55e]/50 cursor-not-allowed'
                    : 'bg-[#22c55e] hover:bg-[#16a34a] text-white shadow-lg shadow-[#22c55e]/20 active:scale-95'
                }`}
              >
                {exporting ? 'Writing...' : 'Export'}
              </button>
            </div>
          </div>

          {exportResult && (
            <div className={`rounded-lg px-4 py-3 text-sm ${
              exportResult.ok ? 'bg-[#22c55e]/10 text-[#86efac] border border-[#22c55e]/30' : 'bg-red-500/10 text-red-300 border border-red-500/30'
            }`}>
              {exportResult.msg}
            </div>
          )}
        </div>

        {/* Import instructions */}
        <div className="bg-[#1e293b] rounded-xl border border-[#334155] p-4">
          <h3 className="text-[#f1f5f9] text-sm font-semibold mb-2">How to import on the TX16S</h3>
          <ol className="text-[#94a3b8] text-xs space-y-1.5 list-decimal list-inside">
            <li>Connect your radio&apos;s SD card to your computer (USB or card reader)</li>
            <li>Click the SD Card Files tab above and select your SD card</li>
            <li>Come back here and click Export — file goes directly to MODELS/</li>
            <li>On the radio: hold Model button → long-press the model slot → Restore</li>
            <li>Or: MDL menu → SD card → select the file → Restore</li>
            <li>Verify channels in the MIXER screen before binding</li>
          </ol>
        </div>
      </div>
    )
  }

  const tabs: { id: Tab; label: string; badge?: string }[] = [
    { id: 'channels', label: 'Channels' },
    { id: 'rates', label: 'Rates & Expo' },
    { id: 'flaps', label: 'Flap / Wing', badge: flapConfig.enabled ? String(flapConfig.stages) : undefined },
    { id: 'mixes', label: 'Advanced Mixes' },
    { id: 'voice', label: 'Voice & Switches' },
    { id: 'sounds', label: 'Sound Studio' },
    { id: 'timer', label: 'Flight Timer', badge: timerRunning ? (timerElapsed > 0 ? `${String(Math.floor(timerElapsed / 60)).padStart(2, '0')}:${String(timerElapsed % 60).padStart(2, '0')}` : '▶') : undefined },
    { id: 'wizard', label: '⚡ Rate Setup' },
    { id: 'sdfiles', label: 'SD Card Files' },
    { id: 'export', label: 'Export to Radio' },
    { id: 'help', label: '? How to Use' },
  ]

  const renderTabs = (): JSX.Element => (
    <div className="flex gap-1 px-6 pt-4 border-b border-[#334155] shrink-0">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => setActiveTab(t.id)}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-t-lg transition-all -mb-px border-b-2 ${
            activeTab === t.id
              ? 'text-[#3b82f6] border-[#3b82f6] bg-[#1e293b]'
              : 'text-[#94a3b8] border-transparent hover:text-[#f1f5f9]'
          }`}
        >
          {t.label}
          {t.badge && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[#22c55e]/20 text-[#22c55e]">
              {t.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  )

  // ── Channels tab ──
  const renderChannels = (): JSX.Element => (
    <div className="space-y-1 py-3">
      {/* Column headers */}
      <div className="grid items-center gap-3 px-6 pb-1"
        style={{ gridTemplateColumns: '2.5rem 8rem 9rem 1fr 3.5rem 3.5rem 3rem' }}>
        <span className="text-[#94a3b8] text-[10px] uppercase tracking-wider text-center">CH</span>
        <span className="text-[#94a3b8] text-[10px] uppercase tracking-wider">Function</span>
        <span className="flex items-center gap-1 text-[#94a3b8] text-[10px] uppercase tracking-wider">
          Source <Tip text="Which stick, switch, or pot drives this channel. Ail/Ele/Thr/Rud = the four main sticks. SA–SF = physical switches. S1/S2/LS/RS = pots and sliders." />
        </span>
        <span className="flex items-center gap-1 text-[#94a3b8] text-[10px] uppercase tracking-wider">
          Weight <Tip text="Output scale — 100% = full servo travel. Negative values reverse the direction. Reduce below 100% to limit throw on that channel only." />
        </span>
        <span className="flex items-center gap-1 justify-center text-[#94a3b8] text-[10px] uppercase tracking-wider">
          Expo <Tip text="Exponential curve on this channel's output. 0 = linear. Higher values soften response near center. For full curve editing use the Rates & Expo tab." side="top" />
        </span>
        <span className="flex items-center gap-1 justify-center text-[#94a3b8] text-[10px] uppercase tracking-wider">
          Offset <Tip text="Shifts the center point. +20% means the servo sits 20% toward full deflection at neutral stick. Used for trim that is too large for the radio's trim tab." side="top" />
        </span>
        <span className="flex items-center gap-1 justify-center text-[#94a3b8] text-[10px] uppercase tracking-wider">
          Rev <Tip text="Reverse — flips the output direction. Use when the servo moves the wrong way. Equivalent to reversing the servo in EdgeTX." side="top" />
        </span>
      </div>

      {channels.map((ch) => {
        const isNone = !ch.source || ch.source === '---'
        const chColor = ch.ch === 5 ? '#3b82f6' : ch.ch === 3 ? '#ef4444' : '#94a3b8'
        return (
          <div
            key={ch.ch}
            className={`grid items-center gap-3 px-6 py-2.5 transition-colors ${
              isNone ? 'opacity-40' : 'hover:bg-[#243044]/50'
            }`}
            style={{ gridTemplateColumns: '2.5rem 8rem 9rem 1fr 3.5rem 3.5rem 3rem' }}
          >
            {/* CH number badge */}
            <div
              className="flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold shrink-0"
              style={{ background: `${chColor}22`, color: chColor, border: `1px solid ${chColor}44` }}
            >
              {ch.ch}
            </div>

            {/* Channel label editable */}
            <input
              type="text"
              value={ch.label}
              onChange={(e) => updateChannel(ch.ch, { label: e.target.value })}
              className="bg-transparent border-b border-transparent hover:border-[#334155] focus:border-[#3b82f6]
                text-[#f1f5f9] text-sm font-medium px-1 py-0.5 focus:outline-none transition-colors"
            />

            {/* Source selector */}
            <SourceSelect
              value={ch.source}
              onChange={(v) => updateChannel(ch.ch, { source: v })}
            />

            {/* Weight slider */}
            <WeightSlider
              value={ch.weight}
              onChange={(v) => updateChannel(ch.ch, { weight: v })}
            />

            {/* Expo */}
            <input
              type="number"
              min={0}
              max={100}
              value={ch.expo}
              onChange={(e) => updateChannel(ch.ch, { expo: Math.max(0, Math.min(100, Number(e.target.value))) })}
              className="w-full bg-[#0f172a] border border-[#334155] rounded px-1.5 py-1
                text-[#f1f5f9] text-xs text-center focus:outline-none focus:border-[#3b82f6]"
              title="Expo %"
            />

            {/* Offset */}
            <input
              type="number"
              min={-100}
              max={100}
              value={ch.offset}
              onChange={(e) => updateChannel(ch.ch, { offset: Math.max(-100, Math.min(100, Number(e.target.value))) })}
              className="w-full bg-[#0f172a] border border-[#334155] rounded px-1.5 py-1
                text-[#f1f5f9] text-xs text-center focus:outline-none focus:border-[#3b82f6]"
              title="Offset %"
            />

            {/* Reverse toggle */}
            <div className="flex justify-center">
              <button
                onClick={() => updateChannel(ch.ch, { reversed: !ch.reversed })}
                title="Reverse channel direction"
                className={`w-8 h-6 rounded text-xs font-bold transition-all ${
                  ch.reversed
                    ? 'bg-[#ef4444] text-white'
                    : 'bg-[#243044] text-[#475569] hover:text-[#94a3b8]'
                }`}
              >
                R
              </button>
            </div>
          </div>
        )
      })}

      <div className="px-6 pt-3 pb-2">
        <p className="text-[#94a3b8] text-[11px]">
          Weight: positive = normal direction. Expo: 0 = linear, 100 = maximum curve (less sensitive near center).
          Reverse (R): flips the channel output direction. Changes take effect when you push to radio.
        </p>
      </div>
    </div>
  )

  // ── Rates & Expo tab ──
  const renderRates = (): JSX.Element => {
    const SWITCHES = ['SA', 'SB', 'SC', 'SD', 'SE', 'SF']

    const ROW_COLORS: Record<string, string> = {
      high: '#22c55e',
      mid: '#f59e0b',
      low: '#ef4444',
    }

    const RateRow = ({
      srId, pos, line, accentColor,
    }: {
      srId: string
      pos: 'high' | 'mid' | 'low'
      line: RateLine
      accentColor: string
    }): JSX.Element => {
      const isExpanded =
        expandedCurve?.srId === srId && expandedCurve?.pos === pos
      const toggle = (): void => {
        setExpandedCurve(isExpanded ? null : { srId, pos })
      }
      const expoLabel = line.curve.type === 'custom'
        ? 'Custom'
        : `${line.curve.expo > 0 ? '+' : ''}${line.curve.expo}%`

      return (
        <div className="divide-y divide-[#1e293b]">
          {/* Main row */}
          <div className="flex items-center gap-3 py-3 px-4">
            {/* Position badge */}
            <span
              className="text-[11px] font-bold w-10 text-center py-0.5 rounded-md shrink-0 uppercase"
              style={{ background: `${accentColor}20`, color: accentColor }}
            >
              {pos}
            </span>

            {/* Rate section */}
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center justify-between text-[10px]">
                <span className="flex items-center gap-1 text-[#94a3b8] uppercase tracking-wider font-semibold">
                  Rate <Tip text="Scales total servo throw for this surface at this switch position. 100% = maximum deflection set in your sub-trim. 50% = half that. Use Low rates when learning a new plane." side="top" />
                </span>
                <span className="font-mono font-bold text-[#f1f5f9]">{line.rate}%</span>
              </div>
              <div className="relative" style={{ height: 44 }}>
                <div className="pointer-events-none absolute inset-x-0 rounded-full overflow-hidden bg-[#243044]" style={{ height: 10, top: 17 }}>
                  <div
                    className="absolute inset-y-0 left-0 rounded-full transition-all"
                    style={{ width: `${line.rate}%`, background: accentColor, opacity: 0.8 }}
                  />
                </div>
                <input
                  type="range" min={0} max={100} value={line.rate}
                  onChange={(e) => updateRateLine(srId, pos, { rate: Number(e.target.value) })}
                  className="absolute inset-0 w-full opacity-0 cursor-pointer"
                  style={{ height: '100%', margin: 0 }}
                />
              </div>
            </div>

            {/* Rate number input */}
            <div className="flex items-center gap-1 shrink-0">
              <input
                type="number" min={0} max={100} value={line.rate}
                onChange={(e) => updateRateLine(srId, pos, { rate: Math.max(0, Math.min(100, Number(e.target.value))) })}
                className="w-12 bg-[#0f172a] border border-[#334155] rounded-lg px-1.5 py-1
                  text-[#f1f5f9] text-xs text-center focus:outline-none focus:border-[#3b82f6] font-mono"
              />
              <span className="text-[#475569] text-[10px]">%</span>
            </div>

            {/* Expo section */}
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center justify-between text-[10px]">
                <span className="flex items-center gap-1 text-[#94a3b8] uppercase tracking-wider font-semibold">
                  Expo <Tip text="Shapes stick feel near center. Positive = softer center (more forgiving). Negative = sharper center (more direct). Click the mini curve preview to open the full curve editor and build S-curves." side="top" />
                </span>
                <span className="font-mono font-bold" style={{ color: '#a855f7' }}>{expoLabel}</span>
              </div>
              {line.curve.type === 'expo' ? (
                <div className="relative" style={{ height: 44 }}>
                  <div className="pointer-events-none absolute inset-x-0 rounded-full overflow-hidden bg-[#243044]" style={{ height: 10, top: 17 }}>
                    <div
                      className="absolute inset-y-0 rounded-full transition-all"
                      style={{
                        left: line.curve.expo >= 0 ? '50%' : `${(100 + line.curve.expo) / 2}%`,
                        width: `${Math.abs(line.curve.expo) / 2}%`,
                        background: '#a855f7',
                        opacity: 0.8,
                      }}
                    />
                  </div>
                  <input
                    type="range" min={-100} max={100} value={line.curve.expo}
                    onChange={(e) => updateRateLine(srId, pos, { expo: Number(e.target.value) })}
                    className="absolute inset-0 w-full opacity-0 cursor-pointer"
                    style={{ height: '100%', margin: 0 }}
                  />
                </div>
              ) : (
                <div className="h-3 flex items-center">
                  <span className="text-[10px] text-[#a855f7]/70 italic">custom pts</span>
                </div>
              )}
            </div>

            {/* Expo number input (only in expo mode) */}
            <div className="flex items-center gap-1 shrink-0">
              {line.curve.type === 'expo' ? (
                <>
                  <input
                    type="number" min={-100} max={100} value={line.curve.expo}
                    onChange={(e) => updateRateLine(srId, pos, { expo: Math.max(-100, Math.min(100, Number(e.target.value))) })}
                    className="w-12 bg-[#0f172a] border border-[#334155] rounded-lg px-1.5 py-1
                      text-[#f1f5f9] text-xs text-center focus:outline-none font-mono"
                    style={{ borderColor: '#a855f730' }}
                  />
                  <span className="text-[#475569] text-[10px]">%</span>
                </>
              ) : (
                <div className="w-12" />
              )}
            </div>

            {/* Mini curve preview + expand button */}
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={toggle} title="Open curve editor">
                <MiniCurve curve={line.curve} color={accentColor} width={52} height={38} />
              </button>
              <button
                onClick={toggle}
                title={isExpanded ? 'Close curve editor' : 'Open curve editor'}
                className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs transition-all
                  border ${isExpanded
                    ? 'border-[#3b82f6] bg-[#3b82f6]/20 text-[#3b82f6]'
                    : 'border-[#334155] text-[#475569] hover:text-[#f1f5f9] hover:border-[#94a3b8]'
                  }`}
              >
                {isExpanded ? '▲' : '▼'}
              </button>
            </div>
          </div>

          {/* Inline curve editor — expands below the row */}
          {isExpanded && (
            <div className="px-4 py-4 bg-[#0f172a]">
              <CurveEditor
                curve={line.curve}
                accentColor={accentColor}
                onChange={(c) => updateRateLine(srId, pos, { curve: c, expo: c.type === 'expo' ? c.expo : line.expo })}
              />
            </div>
          )}
        </div>
      )
    }

    return (
      <div className="py-4 px-6 space-y-5">
        <p className="text-[#94a3b8] text-xs">
          Set rate and expo per surface per switch position. Click the mini curve preview or the ▼ button
          to open the full curve editor — drag points to make S-curves, or use the expo slider with presets.
        </p>

        {surfaceRates.map((sr) => {
          const swColor = SWITCH_COLORS[sr.switchId] ?? '#94a3b8'
          return (
            <div key={sr.id} className="rounded-xl border border-[#334155] overflow-hidden">
              {/* Surface header */}
              <div className="flex items-center justify-between gap-4 px-4 py-2.5 bg-[#1e293b] border-b border-[#334155]">
                <div className="flex items-center gap-3">
                  <span className="text-[#f1f5f9] font-semibold text-sm">{sr.label}</span>
                  <span className="text-[#94a3b8] text-xs font-mono">{sr.inputSource}</span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 text-[#94a3b8] text-xs">
                    Switch: <Tip text="Which physical switch changes between High/Mid/Low rates for this surface. SA is the standard — one switch controls all three surfaces at once if they all share SA." side="top" />
                  </span>
                  <select
                    value={sr.switchId}
                    onChange={(e) => updateSurfaceRate(sr.id, { switchId: e.target.value })}
                    className="bg-[#0f172a] border rounded px-2 py-1 text-xs font-semibold focus:outline-none"
                    style={{ borderColor: `${swColor}60`, color: swColor }}
                  >
                    {SWITCHES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>

                  <label className="flex items-center gap-1.5 text-xs text-[#94a3b8] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sr.threePos}
                      onChange={(e) => {
                        updateSurfaceRate(sr.id, { threePos: e.target.checked })
                        if (!e.target.checked && expandedCurve?.srId === sr.id && expandedCurve.pos === 'mid') {
                          setExpandedCurve(null)
                        }
                      }}
                      className="accent-[#3b82f6]"
                    />
                    3-position
                    <Tip text="Check if you're using a 3-position switch (SA, SB, SC, SD on the TX16S are all 3-pos). Gives you High/Mid/Low rates. Uncheck for a 2-position switch — you get High and Low only." side="top" />
                  </label>

                  <button
                    onClick={() => {
                      setSurfaceRates((prev) => prev.filter((s) => s.id !== sr.id))
                      if (expandedCurve?.srId === sr.id) setExpandedCurve(null)
                    }}
                    className="text-[#475569] hover:text-[#ef4444] transition-colors text-base leading-none"
                    title="Remove this surface"
                  >×</button>
                </div>
              </div>

              {/* Rate rows */}
              <div className="divide-y divide-[#243044]">
                <RateRow srId={sr.id} pos="high" line={sr.high} accentColor={ROW_COLORS.high} />
                {sr.threePos && (
                  <RateRow srId={sr.id} pos="mid" line={sr.mid} accentColor={ROW_COLORS.mid} />
                )}
                <RateRow srId={sr.id} pos="low" line={sr.low} accentColor={ROW_COLORS.low} />
              </div>
            </div>
          )
        })}

        {/* Add surface button */}
        <div className="flex flex-wrap gap-2">
          {SURFACE_PRESETS.filter((p) => !surfaceRates.find((sr) => sr.inputSource === p.inputSource))
            .map((preset) => (
              <button
                key={preset.label}
                onClick={() => {
                  const id = preset.inputSource.toLowerCase()
                  setSurfaceRates((prev) => [...prev, {
                    id, label: preset.label, inputSource: preset.inputSource,
                    inputIdx: preset.inputIdx, switchId: 'SA', threePos: true,
                    high: { rate: 100, expo: 0,  curve: defaultCurve(0)  },
                    mid:  { rate: 75,  expo: 20, curve: defaultCurve(20) },
                    low:  { rate: 55,  expo: 35, curve: defaultCurve(35) },
                  }])
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed
                  border-[#334155] hover:border-[#3b82f6] text-[#94a3b8] hover:text-[#3b82f6]
                  text-xs transition-all"
              >
                + {preset.label}
              </button>
            ))}
        </div>

        <div className="rounded-xl bg-[#0f172a] border border-[#334155] p-4 text-[11px] text-[#94a3b8] space-y-1">
          <div className="text-[#f1f5f9] font-semibold text-xs mb-1">Tips</div>
          <div>Rate = throw scale. 100% = full servo travel, 50% = half deflection.</div>
          <div>Expo 0% = linear. Positive expo = softer center, good for smooth flying. Negative = sharper center for 3D.</div>
          <div>S-Curve preset: soft at center AND soft at extremes — like a sine wave. Best for scale ships.</div>
          <div>Custom mode: drag the 9 dots to sculpt any shape. Switch to Custom to draw your own S.</div>
        </div>
      </div>
    )
  }

  // ── Flap Setup tab ──
  const renderFlaps = (): JSX.Element => {
    const fc = flapConfig
    const set = (patch: Partial<FlapConfig>): void => setFlapConfig((prev) => ({ ...prev, ...patch }))

    const updateStage = (id: number, patch: Partial<FlapStage>): void =>
      set({ stageList: fc.stageList.map((s) => s.id === id ? { ...s, ...patch } : s) })

    const changeStageCount = (n: number): void => {
      set({ stages: n, stageList: buildStages(n) })
    }

    // Flap stage color — blue (up) → orange (down)
    const stageColor = (pct: number): string => {
      const r = Math.round(59 + (234 - 59) * (pct / 100))
      const g = Math.round(130 + (88 - 130) * (pct / 100))
      const b = Math.round(246 + (12 - 246) * (pct / 100))
      return `rgb(${r},${g},${b})`
    }

    const CHANNELS = [1,2,3,4,5,6,7,8]
    const SOURCES_FLAT = ['RS', 'LS', 'S1', 'S2', 'SC', 'SD', 'SE', 'SF', 'SB', 'SA']

    // Visual stage diagram
    const StageDiagram = (): JSX.Element => (
      <div className="rounded-xl overflow-hidden border border-[#334155] bg-[#0f172a] p-4">
        <div className="text-[10px] text-[#94a3b8] uppercase tracking-wider mb-3 font-semibold">
          Flap Position Preview
        </div>
        {/* Horizontal flap bar */}
        <div className="relative h-10 flex rounded-lg overflow-hidden">
          {fc.stageList.map((s, i) => {
            const color = stageColor(s.flapPct)
            return (
              <div
                key={s.id}
                className="flex-1 flex items-center justify-center relative"
                style={{ background: `${color}30`, borderRight: i < fc.stageList.length - 1 ? '1px solid #1c2128' : 'none' }}
              >
                <div
                  className="absolute bottom-0 left-0 right-0 transition-all"
                  style={{ height: `${s.flapPct}%`, background: color, opacity: 0.6 }}
                />
                <div className="relative z-10 text-center">
                  <div className="text-[10px] font-bold text-white drop-shadow" style={{ color }}>
                    {s.label}
                  </div>
                  <div className="text-[9px] text-white/60 font-mono">{s.flapPct}%</div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Elevator comp bar */}
        {fc.useElevComp && (
          <div className="mt-2">
            <div className="text-[9px] text-[#94a3b8] mb-1">Elevator comp (nose-down trim)</div>
            <div className="flex h-4 rounded overflow-hidden">
              {fc.stageList.map((s, i) => (
                <div
                  key={s.id}
                  className="flex-1 flex items-center justify-center text-[8px] font-mono"
                  style={{
                    background: s.elevComp === 0 ? '#1c2128' : `${s.elevComp < 0 ? '#ef4444' : '#22c55e'}30`,
                    borderRight: i < fc.stageList.length - 1 ? '1px solid #1c2128' : 'none',
                    color: s.elevComp < 0 ? '#ef4444' : '#22c55e',
                  }}
                >
                  {s.elevComp === 0 ? '—' : `${s.elevComp > 0 ? '+' : ''}${s.elevComp}%`}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Aileron mix bar */}
        {(fc.useAilCamber || fc.flaperronMode) && (
          <div className="mt-2">
            <div className="text-[9px] text-[#94a3b8] mb-1">
              {fc.flaperronMode
                ? <><span className="text-[#22c55e]">Flaperron droop (ailerons + roll)</span></>
                : <><span className="text-[#22c55e]">+ flapperons (droop↓)</span>&nbsp;/&nbsp;<span className="text-[#a855f7]">− crow (rise↑)</span></>
              }
            </div>
            <div className="flex h-4 rounded overflow-hidden">
              {fc.stageList.map((s, i) => {
                const isCrow = s.ailCamber < 0
                const barColor = isCrow ? '#a855f7' : '#22c55e'
                return (
                  <div
                    key={s.id}
                    className="flex-1 flex items-center justify-center text-[8px] font-mono"
                    style={{
                      background: s.ailCamber === 0 ? '#1c2128' : `${barColor}30`,
                      borderRight: i < fc.stageList.length - 1 ? '1px solid #1c2128' : 'none',
                      color: barColor,
                    }}
                  >
                    {s.ailCamber === 0 ? '—' : `${s.ailCamber > 0 ? '+' : ''}${s.ailCamber}%`}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )

    // Inline slider row
    const SliderRow = ({
      label, tip, value, min, max, color, onChange,
    }: {
      label: string; tip?: string; value: number; min: number; max: number
      color: string; onChange: (v: number) => void
    }): JSX.Element => (
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1 text-[10px] text-[#94a3b8] w-20 shrink-0">
          {label}{tip && <Tip text={tip} side="right" width={240} />}
        </span>
        <div className="relative flex-1" style={{ height: 44 }}>
          <div className="pointer-events-none absolute inset-x-0 rounded-full overflow-hidden bg-[#243044]" style={{ height: 10, top: 17 }}>
            <div
              className="absolute inset-y-0 rounded-full"
              style={{
                left: min < 0 ? `${(0 - min) / (max - min) * 100}%` : 0,
                width: min < 0
                  ? `${Math.abs(value) / (max - min) * 100}%`
                  : `${(value - min) / (max - min) * 100}%`,
                [min < 0 && value < 0 ? 'right' : 'left']: min < 0
                  ? value >= 0
                    ? `${(0 - min) / (max - min) * 100}%`
                    : `${(value - min) / (max - min) * 100}%`
                  : 0,
                background: color,
                opacity: 0.8,
              }}
            />
          </div>
          <input
            type="range" min={min} max={max} value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="absolute inset-0 w-full opacity-0 cursor-pointer"
            style={{ height: '100%', margin: 0 }}
          />
        </div>
        <input
          type="number" min={min} max={max} value={value}
          onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value))))}
          className="w-14 bg-[#0f172a] border border-[#334155] rounded-lg px-1.5 py-1
            text-[#f1f5f9] text-xs text-center focus:outline-none font-mono shrink-0"
          style={{ borderColor: `${color}40` }}
        />
        <span className="text-[#475569] text-[10px] shrink-0 w-3">%</span>
      </div>
    )

    return (
      <div className="py-4 px-6 space-y-5">
        {/* Enable toggle + heading */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[#f1f5f9] font-semibold text-sm">Flap & Wing Mix Setup</h3>
            <p className="text-[#94a3b8] text-xs mt-0.5">
              Works on any plane — with or without flaps. No flap servo? Use Flaperron Mode to droop ailerons on a switch.
            </p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <div
              onClick={() => set({ enabled: !fc.enabled })}
              className={`relative w-12 h-6 rounded-full transition-colors cursor-pointer ${
                fc.enabled ? 'bg-[#22c55e]' : 'bg-[#243044]'
              }`}
            >
              <div
                className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                  fc.enabled ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </div>
            <span className={`text-sm font-medium ${fc.enabled ? 'text-[#22c55e]' : 'text-[#475569]'}`}>
              {fc.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </label>
        </div>

        {/* Flaperron mode banner */}
        <div
          onClick={() => set({ flaperronMode: !fc.flaperronMode, useAilCamber: true })}
          className={`flex items-center gap-4 rounded-xl border px-4 py-3 cursor-pointer transition-all ${
            fc.flaperronMode
              ? 'border-[#22c55e]/50 bg-[#22c55e]/8'
              : 'border-[#334155] bg-[#1e293b] hover:border-[#22c55e]/30'
          }`}
        >
          <div
            className={`relative w-10 h-5 rounded-full shrink-0 transition-colors ${
              fc.flaperronMode ? 'bg-[#22c55e]' : 'bg-[#243044]'
            }`}
          >
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
              fc.flaperronMode ? 'translate-x-5' : 'translate-x-0.5'
            }`} />
          </div>
          <div className="min-w-0">
            <div className={`flex items-center gap-1.5 text-sm font-semibold ${fc.flaperronMode ? 'text-[#22c55e]' : 'text-[#94a3b8]'}`}>
              Flaperron Mode — No Separate Flap Channel
              <Tip text="When enabled, there is no dedicated flap servo. Instead, both ailerons droop down by the amount you set per stage. Your roll stick input still works normally on top of the droop offset — so you can bank the plane while the ailerons are partially drooped. Used on planes like the Gee Bee, Extra, FMS Ranger, and any warbird with no flap surface." side="top" width={260} />
            </div>
            <div className="text-[11px] text-[#94a3b8] mt-0.5">
              {fc.flaperronMode
                ? 'Ailerons droop on switch — roll still works on top. Perfect for Gee Bee, Extras, and any plane with no flap servo.'
                : 'Enable if your plane has no separate flap surfaces — uses ailerons for both roll and flap droop.'}
            </div>
          </div>
        </div>

        {/* Config row */}
        <div className="grid grid-cols-2 gap-4">
          {/* Left — input setup */}
          <div className="rounded-xl border border-[#334155] bg-[#1e293b] p-4 space-y-3">
            <div className="text-[#94a3b8] text-[10px] font-semibold uppercase tracking-wider">Input Config</div>

            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-[#94a3b8] text-xs w-24 shrink-0">
                Control source <Tip text="What physical input moves through the flap stages. RS/LS = right/left slider — smooth sweep through all stages. SF/SC = a switch that snaps to positions." side="right" />
              </span>
              <select
                value={fc.source}
                onChange={(e) => set({ source: e.target.value })}
                className="flex-1 bg-[#0f172a] border border-[#334155] rounded-lg px-2 py-1.5 text-[#f1f5f9] text-sm
                  focus:outline-none focus:border-[#3b82f6]"
              >
                {SOURCES_FLAT.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-[#94a3b8] text-xs w-24 shrink-0">
                Stages <Tip text="How many discrete flap positions. 2 = up/down. 3 = up/half/full. 5+ = scale-style with detents. Switch sources work best with 2–3 stages; sliders can handle all 6." side="right" />
              </span>
              <div className="flex gap-1.5">
                {[2,3,4,5,6].map((n) => (
                  <button
                    key={n}
                    onClick={() => changeStageCount(n)}
                    className={`w-8 h-8 rounded-lg text-sm font-bold transition-all ${
                      fc.stages === n
                        ? 'bg-[#3b82f6] text-white shadow-lg shadow-blue-900/30'
                        : 'bg-[#243044] text-[#94a3b8] hover:text-[#f1f5f9] border border-[#334155]'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-[10px] text-[#94a3b8] mt-1 space-y-0.5">
              <div>SF / SC = switch snap to position — good for 2–3 stages</div>
              <div>RS / LS = smooth slider — good for 4–6 stages</div>
            </div>
          </div>

          {/* Right — channel mapping + options */}
          <div className="rounded-xl border border-[#334155] bg-[#1e293b] p-4 space-y-3">
            <div className="text-[#94a3b8] text-[10px] font-semibold uppercase tracking-wider">Channel Mapping</div>

            {/* Flap output — hidden in flaperron mode */}
            {!fc.flaperronMode && (
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-[#94a3b8] text-xs w-24 shrink-0">
                  Flap output <Tip text="The channel your physical flap servos are plugged into on the receiver. Typically CH5 or CH6 on a 6-channel setup." side="right" />
                </span>
                <select
                  value={fc.flapCh}
                  onChange={(e) => set({ flapCh: Number(e.target.value) })}
                  className="flex-1 bg-[#0f172a] border rounded-lg px-2 py-1.5 text-sm focus:outline-none"
                  style={{ borderColor: '#3b82f650', color: '#3b82f6' }}
                >
                  {CHANNELS.map((n) => <option key={n} value={n}>CH{n}</option>)}
                </select>
              </div>
            )}

            {/* Aileron channel — always shown */}
            <div className="flex items-center gap-3">
              <span className="text-[#94a3b8] text-xs w-24 shrink-0">
                {fc.flaperronMode ? 'Aileron (flap+roll)' : 'Aileron'}
              </span>
              <select
                value={fc.ailCh}
                onChange={(e) => set({ ailCh: Number(e.target.value) })}
                className="flex-1 bg-[#0f172a] border rounded-lg px-2 py-1.5 text-sm focus:outline-none"
                style={{ borderColor: '#22c55e50', color: '#22c55e' }}
              >
                {CHANNELS.map((n) => <option key={n} value={n}>CH{n}</option>)}
              </select>
              {fc.flaperronMode && (
                <span className="text-[10px] text-[#22c55e]/70 shrink-0">roll + droop</span>
              )}
            </div>

            {/* Elevator toggle row */}
            <div
              onClick={() => set({ useElevComp: !fc.useElevComp })}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer transition-all border ${
                fc.useElevComp
                  ? 'border-[#ef4444]/40 bg-[#ef4444]/8'
                  : 'border-[#334155] hover:border-[#ef4444]/20'
              }`}
            >
              <div className={`relative w-9 h-5 rounded-full shrink-0 transition-colors ${
                fc.useElevComp ? 'bg-[#ef4444]' : 'bg-[#243044]'
              }`}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                  fc.useElevComp ? 'translate-x-4' : 'translate-x-0.5'
                }`} />
              </div>
              <div className="min-w-0 flex-1">
                <div className={`flex items-center gap-1 text-xs font-medium ${fc.useElevComp ? 'text-[#ef4444]' : 'text-[#475569]'}`}>
                  Elevator compensation
                  <Tip text="When flaps deploy, the wing produces more lift aft and the nose tends to pitch up. This mix automatically adds a small nose-down elevator input to keep the plane flying straight. Set per stage — usually −5% to −20% depending on flap size." side="top" />
                </div>
                <div className="text-[10px] text-[#94a3b8]">
                  {fc.useElevComp ? 'Nose-down trim applied per stage' : 'Off — elevator untouched'}
                </div>
              </div>
              {fc.useElevComp && (
                <select
                  value={fc.elevCh}
                  onChange={(e) => { e.stopPropagation(); set({ elevCh: Number(e.target.value) }) }}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-[#0f172a] border rounded-lg px-2 py-1 text-xs focus:outline-none shrink-0"
                  style={{ borderColor: '#ef444440', color: '#ef4444' }}
                >
                  {CHANNELS.map((n) => <option key={n} value={n}>CH{n}</option>)}
                </select>
              )}
            </div>

            {/* Aileron mix toggle (non-flaperron mode only) */}
            {!fc.flaperronMode && (
              <div
                onClick={() => set({ useAilCamber: !fc.useAilCamber })}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer transition-all border ${
                  fc.useAilCamber
                    ? 'border-[#a855f7]/40 bg-[#a855f7]/8'
                    : 'border-[#334155] hover:border-[#a855f7]/20'
                }`}
              >
                <div className={`relative w-9 h-5 rounded-full shrink-0 transition-colors ${
                  fc.useAilCamber ? 'bg-[#a855f7]' : 'bg-[#243044]'
                }`}>
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                    fc.useAilCamber ? 'translate-x-4' : 'translate-x-0.5'
                  }`} />
                </div>
                <div className="min-w-0">
                  <div className={`flex items-center gap-1 text-xs font-medium ${fc.useAilCamber ? 'text-[#a855f7]' : 'text-[#475569]'}`}>
                    Aileron mix
                    <Tip text="Mixes the flap position into the aileron channel. Positive % = flapperons (ailerons droop down with flaps, adding camber and lift). Negative % = crow (ailerons rise, killing lift for steep landings). You keep full roll control either way." side="top" />
                  </div>
                  <div className="text-[10px] text-[#94a3b8]">
                    {fc.useAilCamber ? 'Flapperons (+droop) or crow (−rise) per stage' : 'Off — ailerons untouched'}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Visual stage diagram */}
        <StageDiagram />

        {/* Quick presets */}
        <div className="flex flex-wrap gap-2">
          <span className="text-[10px] text-[#94a3b8] self-center">Quick presets:</span>
          {/* No-flap planes first */}
          <div className="w-full text-[10px] text-[#475569] uppercase tracking-wider font-semibold pt-1">
            No flap servo — flaperron droop on switch
          </div>
          {[
            { label: '🏁 Gee Bee R2',
              patch: { flaperronMode: true, useAilCamber: true, useElevComp: false,
                stages: 2, source: 'SF', stageList: [
                  { id:1, label:'Up',    flapPct:0,  elevComp:0, ailCamber:0,  speedBrake:0 },
                  { id:2, label:'Droop', flapPct:30, elevComp:0, ailCamber:30, speedBrake:0 },
                ]}},
            { label: '🛩 FMS Ranger 1220',
              patch: { flaperronMode: true, useAilCamber: true, useElevComp: true,
                stages: 2, source: 'SF', stageList: [
                  { id:1, label:'Up',    flapPct:0,  elevComp:0,  ailCamber:0,  speedBrake:0 },
                  { id:2, label:'Droop', flapPct:25, elevComp:-5, ailCamber:25, speedBrake:0 },
                ]}},
            { label: '✈ No-Flap Sport',
              patch: { flaperronMode: true, useAilCamber: true, useElevComp: false,
                stages: 3, source: 'SC', stageList: [
                  { id:1, label:'Up',    flapPct:0,  elevComp:0,  ailCamber:0,  speedBrake:0 },
                  { id:2, label:'Light', flapPct:0,  elevComp:0,  ailCamber:20, speedBrake:0 },
                  { id:3, label:'Droop', flapPct:0,  elevComp:0,  ailCamber:40, speedBrake:0 },
                ]}},
            { label: '🦋 Extra / 3D',
              patch: { flaperronMode: true, useAilCamber: true, useElevComp: false,
                stages: 2, source: 'SF', stageList: [
                  { id:1, label:'Up',   flapPct:0,  elevComp:0, ailCamber:0,  speedBrake:0 },
                  { id:2, label:'Down', flapPct:0,  elevComp:0, ailCamber:50, speedBrake:0 },
                ]}},
          ].map(({ label, patch }) => (
            <button
              key={label}
              onClick={() => set(patch as Partial<FlapConfig>)}
              className="px-3 py-1.5 rounded-lg border border-[#334155] hover:border-[#22c55e]
                text-[#94a3b8] hover:text-[#22c55e] text-xs transition-all"
            >
              {label}
            </button>
          ))}

          {/* Planes with actual flap surfaces */}
          <div className="w-full text-[10px] text-[#475569] uppercase tracking-wider font-semibold pt-2">
            Separate flap surfaces
          </div>
          {[
            { label: '✈ Sport (2-stage)',
              patch: { flaperronMode: false, stages: 2, source: 'SF', stageList: [
                { id:1, label:'Up',   flapPct:0,   elevComp:0,   ailCamber:0,  speedBrake:0 },
                { id:2, label:'Down', flapPct:100, elevComp:-20, ailCamber:0,  speedBrake:0 },
              ]}},
            { label: '✈ Trainer flapperons (3-stage)',
              patch: { flaperronMode: false, stages: 3, source: 'SC', useAilCamber: true, stageList: [
                { id:1, label:'Up',   flapPct:0,   elevComp:0,   ailCamber:0,  speedBrake:0 },
                { id:2, label:'Half', flapPct:50,  elevComp:-10, ailCamber:12, speedBrake:0 },
                { id:3, label:'Full', flapPct:100, elevComp:-20, ailCamber:20, speedBrake:0 },
              ]}},
            { label: '✈ Scale (5-stage)',
              patch: { flaperronMode: false, stages: 5, source: 'RS', useAilCamber: false,
                stageList: buildStages(5) }},
            { label: '🦅 Crow / Butterfly',
              patch: { flaperronMode: false, stages: 4, source: 'RS', useAilCamber: true, stageList: [
                { id:1, label:'Up',    flapPct:0,   elevComp:0,   ailCamber:0,   speedBrake:0 },
                { id:2, label:'Crow',  flapPct:30,  elevComp:-5,  ailCamber:-25, speedBrake:0 },
                { id:3, label:'Brake', flapPct:65,  elevComp:-10, ailCamber:-50, speedBrake:0 },
                { id:4, label:'Full',  flapPct:100, elevComp:-15, ailCamber:-75, speedBrake:0 },
              ]}},
            { label: '🛩 Glider / DLG',
              patch: { flaperronMode: false, stages: 4, source: 'RS',
                useElevComp: true, useAilCamber: true, stageList: [
                { id:1, label:'Speed', flapPct:0,   elevComp:5,   ailCamber:-12, speedBrake:0 },
                { id:2, label:'Cruise',flapPct:20,  elevComp:0,   ailCamber:0,   speedBrake:0 },
                { id:3, label:'Therm', flapPct:50,  elevComp:-5,  ailCamber:12,  speedBrake:0 },
                { id:4, label:'Land',  flapPct:100, elevComp:-18, ailCamber:25,  speedBrake:0 },
              ]}},
          ].map(({ label, patch }) => (
            <button
              key={label}
              onClick={() => set(patch as Partial<FlapConfig>)}
              className="px-3 py-1.5 rounded-lg border border-[#334155] hover:border-[#3b82f6]
                text-[#94a3b8] hover:text-[#3b82f6] text-xs transition-all"
            >
              {label}
            </button>
          ))}
        </div>

        {/* Per-stage editor */}
        <div className="space-y-3">
          <div className="text-[#f1f5f9] text-sm font-semibold">Stage Details</div>
          {fc.stageList.map((s) => {
            const color = stageColor(s.flapPct)
            return (
              <div
                key={s.id}
                className="rounded-xl border overflow-hidden"
                style={{ borderColor: `${color}40` }}
              >
                {/* Stage header */}
                <div
                  className="flex items-center gap-3 px-4 py-2.5"
                  style={{ background: `${color}12`, borderBottom: `1px solid ${color}30` }}
                >
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold"
                    style={{ background: `${color}25`, color }}
                  >
                    {s.id}
                  </div>
                  <input
                    type="text"
                    value={s.label}
                    onChange={(e) => updateStage(s.id, { label: e.target.value })}
                    className="bg-transparent border-b border-transparent hover:border-[#334155]
                      focus:border-current text-[#f1f5f9] font-semibold text-sm px-1 focus:outline-none w-24"
                    style={{ borderColor: `${color}40` }}
                  />
                  <span className="text-[10px] ml-auto" style={{ color }}>
                    Stage {s.id} of {fc.stages}
                  </span>
                </div>

                {/* Sliders */}
                <div className="px-4 py-3 space-y-2.5 bg-[#0f172a]">
                  <SliderRow
                    label="Flap %"
                    tip="How far the flap servo travels at this stage. 0 = fully retracted, 100 = fully deployed. Most trainers land at 75–100%. Scale planes often use 50–60% to avoid a pitch-up on short runways."
                    value={s.flapPct} min={0} max={100} color={color}
                    onChange={(v) => updateStage(s.id, { flapPct: v })}
                  />
                  {fc.useElevComp && (
                    <SliderRow
                      label="Elev comp"
                      tip="Elevator correction applied automatically at this flap stage. Negative = nose-down (most common — counters pitch-up when flaps add lift). Start at −5% per stage and adjust on the field."
                      value={s.elevComp} min={-100} max={100} color="#ef4444"
                      onChange={(v) => updateStage(s.id, { elevComp: v })}
                    />
                  )}
                  {(fc.useAilCamber || fc.flaperronMode) && (
                    <SliderRow
                      label={fc.flaperronMode ? 'Droop %' : s.ailCamber < 0 ? 'Ail crow ↑' : 'Ail flap ↓'}
                      tip={fc.flaperronMode
                        ? 'How far the ailerons droop at this stage. Your roll stick input rides on top of this offset — you still bank normally while drooped. Start around 20–30% and test on the field.'
                        : s.ailCamber >= 0
                          ? 'Flaperron — ailerons droop down this much when flaps reach this stage. Adds camber and lift across the full wingspan. Roll control still works differentially on top of the droop.'
                          : 'Crow/butterfly — ailerons rise this much as flaps deploy. Kills lift, adds drag. Used for steep spot landings on gliders. Roll control still works.'}
                      value={s.ailCamber} min={fc.flaperronMode ? 0 : -100} max={100}
                      color={s.ailCamber < 0 ? '#a855f7' : '#22c55e'}
                      onChange={(v) => updateStage(s.id, { ailCamber: v })}
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Terminology card */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-[#0f172a] border border-[#22c55e]/30 p-3 text-[11px] space-y-1">
            <div className="text-[#22c55e] font-semibold text-xs mb-1.5">Flapperons (+ positive aileron)</div>
            <div className="text-[#94a3b8]">Both ailerons droop <span className="text-[#f1f5f9]">down</span> together as flaps extend — adds camber across the full wingspan. Roll authority is maintained (differential still works while drooped).</div>
            <div className="text-[#94a3b8] mt-1">Best for: trainers, warbirds, scale aircraft wanting smooth lift increase without separate flap servos.</div>
          </div>
          <div className="rounded-xl bg-[#0f172a] border border-[#a855f7]/30 p-3 text-[11px] space-y-1">
            <div className="text-[#a855f7] font-semibold text-xs mb-1.5">Crow / Butterfly (− negative aileron)</div>
            <div className="text-[#94a3b8]">Flaps go <span className="text-[#f1f5f9]">down</span>, ailerons go <span className="text-[#f1f5f9]">up</span> — the opposite of flapperons. Destroys lift, creates massive drag. Think air brakes.</div>
            <div className="text-[#94a3b8] mt-1">Best for: gliders, DLGs, and sailplanes needing steep spot landings without gaining speed on final.</div>
          </div>
        </div>

        <div className="rounded-xl bg-[#0f172a] border border-[#334155] p-4 text-[11px] text-[#94a3b8] space-y-1.5">
          <div className="text-[#f1f5f9] font-semibold text-xs mb-1">How it works in EdgeTX</div>
          <div><span className="text-[#f1f5f9]">Slider source (RS/LS):</span> A staircase custom curve snaps the input to your defined stage positions — one smooth lever, multiple distinct outputs.</div>
          <div><span className="text-[#f1f5f9]">Elevator comp:</span> Additive mix on the elevator channel. Negative = nose-down trim, counteracts pitch-up moment when flaps deploy.</div>
          <div><span className="text-[#f1f5f9]">Aileron mix:</span> Positive values = flapperons (ailerons droop with flaps). Negative values = crow (ailerons rise as flaps drop). You can mix both within a preset — e.g. small positive droop on Stage 2, large negative crow on Stage 4.</div>
          <div><span className="text-[#f1f5f9]">Glider reflex:</span> Negative aileron on Stage 1 = trailing edge rises — reduces drag and camber for high-speed passes. Positive on Stage 4 = full thermal camber.</div>
        </div>
      </div>
    )
  }

  // ── Advanced Mixes tab ──
  const renderMixes = (): JSX.Element => (
    <div className="py-4 space-y-4">
      {/* Preset tiles */}
      <div className="px-6">
        <p className="text-[#94a3b8] text-xs mb-3">
          Quick-add common mixes. These add to an existing channel (additive) — the primary source stays in Channels.
        </p>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[
            { label: 'Flap → Elevator', outputCh: 2, source: 'CH6', weight: -20, mltpx: 'Add' as const, desc: 'Counters pitch-up when flaps deploy' },
            { label: 'Aileron Diff', outputCh: 1, source: 'Ail', weight: -30, mltpx: 'Multiply' as const, desc: 'Reduces adverse yaw on up-aileron' },
            { label: 'Rudder → Aileron', outputCh: 1, source: 'Rud', weight: 20, mltpx: 'Add' as const, desc: 'Couples rudder input to ailerons' },
            { label: 'Throttle → Elevator', outputCh: 2, source: 'Thr', weight: -10, mltpx: 'Add' as const, desc: 'Counters pitch-up at high power' },
            { label: 'Elevator → Flap', outputCh: 6, source: 'Ele', weight: 15, mltpx: 'Add' as const, desc: 'Camber change with pitch input' },
            { label: 'Aileron → Rudder', outputCh: 4, source: 'Ail', weight: 25, mltpx: 'Add' as const, desc: 'Coordinated turns (snap-roll suppression)' },
          ].map((preset) => (
            <button
              key={preset.label}
              onClick={() => {
                const id = `mix_${Date.now()}`
                setAdvMixes((prev) => [...prev, { id, label: preset.label, outputCh: preset.outputCh, source: preset.source, weight: preset.weight, mltpx: preset.mltpx }])
              }}
              className="text-left p-3 rounded-xl border border-[#334155] hover:border-[#3b82f6] hover:bg-[#243044] transition-all group"
            >
              <div className="text-[#f1f5f9] text-xs font-semibold group-hover:text-[#3b82f6] transition-colors">{preset.label}</div>
              <div className="text-[#94a3b8] text-[10px] mt-0.5">{preset.desc}</div>
              <div className="text-[#3b82f6] text-[10px] mt-1 font-mono">CH{preset.outputCh} {preset.weight > 0 ? '+' : ''}{preset.weight}% of {preset.source}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Current mixes */}
      {advMixes.length > 0 && (
        <div className="px-6">
          <div className="text-[#94a3b8] text-[10px] font-semibold uppercase tracking-wider mb-2">Active Advanced Mixes</div>
          <div className="space-y-2">
            {advMixes.map((mix) => (
              <div key={mix.id} className="flex items-center gap-3 p-3 rounded-xl bg-[#1e293b] border border-[#334155]">
                <div className="w-16 text-center">
                  <div className="flex items-center justify-center gap-1 text-[#3b82f6] text-[10px] font-semibold uppercase">
                    Out CH <Tip text="The channel this mix outputs to. It adds to (or replaces) whatever the primary source is already sending to that channel." side="top" />
                  </div>
                  <select
                    value={mix.outputCh}
                    onChange={(e) => updateAdvMix(mix.id, { outputCh: Number(e.target.value) })}
                    className="mt-1 bg-[#0f172a] border border-[#334155] rounded px-1.5 py-1 text-[#f1f5f9] text-xs w-full focus:outline-none"
                  >
                    {[1,2,3,4,5,6,7,8].map((n) => <option key={n} value={n}>CH{n}</option>)}
                  </select>
                </div>

                <input
                  type="text"
                  value={mix.label}
                  onChange={(e) => updateAdvMix(mix.id, { label: e.target.value })}
                  className="bg-transparent border-b border-[#334155] focus:border-[#3b82f6] text-[#f1f5f9]
                    text-sm font-medium px-1 py-0.5 focus:outline-none w-40 transition-colors"
                  placeholder="Mix label"
                />

                <SourceSelect
                  value={mix.source}
                  onChange={(v) => updateAdvMix(mix.id, { source: v })}
                  className="w-28"
                />

                <WeightSlider
                  value={mix.weight}
                  onChange={(v) => updateAdvMix(mix.id, { weight: v })}
                />

                <div className="flex items-center gap-1">
                  <select
                    value={mix.mltpx}
                    onChange={(e) => updateAdvMix(mix.id, { mltpx: e.target.value as AdvancedMix['mltpx'] })}
                    className="bg-[#0f172a] border border-[#334155] rounded-lg px-2 py-1.5 text-[#f1f5f9] text-xs
                      focus:outline-none focus:border-[#3b82f6] w-24"
                  >
                    <option value="Add">Add</option>
                    <option value="Multiply">Multiply</option>
                    <option value="Replace">Replace</option>
                  </select>
                  <Tip text="Add: this mix's output is added on top of the channel's existing value. Multiply: scales the existing value by this mix (useful for differential). Replace: ignores the primary source and uses only this mix." side="top" />
                </div>

                <button
                  onClick={() => removeAdvMix(mix.id)}
                  className="text-[#475569] hover:text-[#ef4444] transition-colors text-lg leading-none px-1"
                  title="Remove this mix"
                >×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="px-6">
        <button
          onClick={addAdvMix}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-[#334155]
            hover:border-[#3b82f6] text-[#94a3b8] hover:text-[#3b82f6] text-sm transition-all"
        >
          + Add Custom Mix
        </button>
      </div>
    </div>
  )

  // ── Voice & Switches tab ──
  const renderVoice = (): JSX.Element => {
    const sdSounds = sdInfo?.soundFiles ?? []
    // Merge app library names + SD card names; app sounds shown first
    const appSoundNames = appSounds.map((s) => s.name)
    const sdOnlyNames = sdSounds.map((s) => s.replace(/\.wav$/i, '')).filter((n) => !appSoundNames.includes(n))
    const allSoundNames = [...appSoundNames, ...sdOnlyNames]
    return (
      <div className="py-4 px-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-[#94a3b8] text-xs max-w-lg">
            Assign a voice callout to each switch position. The radio plays the .wav file from the SOUNDS/ folder
            whenever you flip that switch. Good for announcing flight modes, safe on/off, and gear up/down.
          </p>
          {allSoundNames.length > 0 && (
            <span className="text-[#22c55e] text-[11px] bg-[#22c55e]/10 border border-[#22c55e]/30 rounded-lg px-2 py-1 shrink-0">
              {appSoundNames.length} app · {sdOnlyNames.length} SD
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          {switchVoice.map((sv) => {
            const color = SWITCH_COLORS[sv.switchId] ?? '#94a3b8'
            return (
              <div key={sv.switchId} className="rounded-xl border border-[#334155] overflow-hidden">
                {/* Switch header */}
                <div
                  className="px-4 py-2.5 flex items-center gap-2"
                  style={{ background: `${color}18`, borderBottom: `1px solid ${color}40` }}
                >
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold"
                    style={{ background: `${color}30`, color }}
                  >
                    {sv.switchId}
                  </div>
                  <span className="text-[#f1f5f9] text-sm font-semibold">Switch {sv.switchId}</span>
                </div>

                {/* Position rows */}
                <div className="divide-y divide-[#243044]">
                  {(['up', 'mid', 'down'] as const).map((pos) => {
                    const posLabel = pos === 'up' ? '↑ Up' : pos === 'mid' ? '↔ Mid' : '↓ Down'
                    return (
                      <div key={pos} className="flex items-center gap-3 px-4 py-2">
                        <span className="flex items-center gap-1 text-[#94a3b8] text-xs w-12 shrink-0">
                          {posLabel}
                          <Tip
                            text={
                              pos === 'up' ? `Switch ${sv.switchId} in the UP (away from you) position. Radio plays the selected .wav file the moment you flip to this position.`
                              : pos === 'mid' ? `Switch ${sv.switchId} in the MIDDLE position (3-position switches only). Fires the callout when passing through or landing on this position.`
                              : `Switch ${sv.switchId} in the DOWN (toward you) position. Great for announcing gear down, full flaps, or arming a flight mode.`
                            }
                            side="right"
                            width={230}
                          />
                        </span>
                        {allSoundNames.length > 0 ? (
                          <select
                            value={sv.positions[pos]}
                            onChange={(e) => updateSwitchVoice(sv.switchId, pos, e.target.value)}
                            className="flex-1 bg-[#0f172a] border border-[#334155] rounded-lg px-2 py-1.5
                              text-[#f1f5f9] text-xs focus:outline-none focus:border-[#3b82f6] transition-colors"
                          >
                            <option value="">— No callout —</option>
                            {appSoundNames.length > 0 && (
                              <optgroup label="App Library">
                                {appSoundNames.map((n) => <option key={n} value={n}>{n}</option>)}
                              </optgroup>
                            )}
                            {sdOnlyNames.length > 0 && (
                              <optgroup label="Radio SD Card">
                                {sdOnlyNames.map((n) => <option key={n} value={n}>{n}</option>)}
                              </optgroup>
                            )}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={sv.positions[pos]}
                            onChange={(e) => updateSwitchVoice(sv.switchId, pos, e.target.value)}
                            placeholder="sound name (no .wav)"
                            className="flex-1 bg-[#0f172a] border border-[#334155] rounded-lg px-2 py-1.5
                              text-[#f1f5f9] text-xs placeholder-[#475569] focus:outline-none focus:border-[#3b82f6]"
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        <div className="rounded-xl bg-[#0f172a] border border-[#334155] p-4 text-[11px] text-[#94a3b8] space-y-1">
          <div className="text-[#f1f5f9] font-semibold text-xs mb-2">How voice callouts work</div>
          <div>1. Sound files (.wav) must be in SOUNDS/en/ on your radio SD card.</div>
          <div>2. The radio announces the assigned file name when the switch reaches that position.</div>
          <div>3. EdgeTX ships with many default sounds — check SOUNDS/en/ on your SD card for the list.</div>
          <div>4. Common useful ones: <span className="text-[#f1f5f9] font-mono">flap</span>, <span className="text-[#f1f5f9] font-mono">gear_dn</span>, <span className="text-[#f1f5f9] font-mono">lowbat</span>, <span className="text-[#f1f5f9] font-mono">safe</span></div>
        </div>
      </div>
    )
  }

  // ── SD Card Files tab ──
  const renderSdFiles = (): JSX.Element => {
    const isBrowserEnv = typeof window !== 'undefined' && !(window as any).electron

    if (!sdDrive) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 h-48">
          {isBrowserEnv ? (
            <>
              <p className="text-[#475569] text-sm">Connect your TX16S in USB Storage mode, then click below</p>
              <button
                onClick={async () => {
                  try {
                    const ok = await (window.api.sdcard as any).connect()
                    if (ok) {
                      const res = await window.api.sdcard.detect()
                      setSdDrive(res.connected && res.drivePath ? res.drivePath : null)
                    }
                  } catch { /* user cancelled */ }
                }}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
                style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}
              >
                📡 Connect Radio SD Card
              </button>
            </>
          ) : (
            <p className="text-[#475569] text-sm">Plug in TX16S in USB Storage mode to browse files</p>
          )}
        </div>
      )
    }
    if (!sdInfo) {
      return (
        <div className="flex items-center justify-center h-48">
          <p className="text-[#94a3b8] text-sm">Scanning SD card...</p>
        </div>
      )
    }

    const importModel = async (filename: string): Promise<void> => {
      setImporting(filename)
      try {
        const res = await window.api.edgetx.loadModelConfig(sdDrive!, filename)
        const slotName = (filename.split('/').pop() ?? filename).replace(/\.(yml|yaml)$/i, '')
        const name = (res.success && res.modelName) ? res.modelName : slotName
        await window.api.models.add({ name, status: 'active', type: 'fixed-wing' })
        setExistingModelNames((prev) => new Set([...prev, name.toLowerCase()]))
        setWriteResult({ ok: true, msg: `"${name}" added — click All Models in the sidebar to see it` })
      } catch (e) {
        setWriteResult({ ok: false, msg: `Import failed: ${String(e)}` })
      } finally {
        setImporting(null)
      }
    }

    return (
      <div className="py-4 px-6 space-y-5">
        {/* Model Files — special section with names + import */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span>📄</span>
            <span className="text-[#f1f5f9] text-sm font-semibold">Models on Radio</span>
            {sdInfo.yamlModelFiles.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded bg-[#243044] text-[#94a3b8] text-[10px]">
                {sdInfo.yamlModelFiles.length}
              </span>
            )}
          </div>
          {sdInfo.yamlModelFiles.length > 0 ? (
            <div className="space-y-2 mb-2">
              {sdInfo.yamlModelFiles.map((f) => {
                const planeName = yamlModelNames[f]
                const nameLoaded = yamlNamesLoaded.has(f)
                const slotName = (f.split('/').pop() ?? f).replace(/\.(yml|yaml)$/i, '')
                const displayName = planeName ?? (nameLoaded ? slotName : null)
                const alreadyAdded = existingModelNames.has((displayName ?? '').toLowerCase())
                return (
                  <div
                    key={f}
                    className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border ${
                      alreadyAdded ? 'bg-[#0d2818] border-[#22c55e]/30' : 'bg-[#1e293b] border-[#334155]'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[#f1f5f9] text-sm font-semibold leading-tight">
                        {displayName ?? (
                          <span className="text-[#475569] italic text-xs">Reading...</span>
                        )}
                      </div>
                      <div className="text-[#94a3b8] text-[10px] font-mono mt-0.5">{f.split('/').pop() ?? f}</div>
                    </div>
                    {alreadyAdded ? (
                      <span className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[#22c55e] border border-[#22c55e]/40 shrink-0">
                        ✓ In Library
                      </span>
                    ) : (
                      <button
                        onClick={() => importModel(f)}
                        disabled={importing === f || !nameLoaded}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-[#3b82f6]/50
                          text-[#3b82f6] hover:bg-[#3b82f6]/10 transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                      >
                        {importing === f ? 'Importing...' : '+ Import'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-[#475569] text-xs italic mb-1">
              {sdInfo.hasModels ? 'Models stored in internal flash — no YAML files found' : 'No MODELS/ directory found'}
            </p>
          )}
          <p className="text-[#94a3b8] text-[10px]">
            {sdInfo.hasYamlModels
              ? 'Click Import to add any plane to your FlightDeck library'
              : 'Models in internal flash use the Lua script approach'}
          </p>
        </div>

        {/* Sound files */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span>🔊</span>
            <span className="text-[#f1f5f9] text-sm font-semibold">Voice / Sound Files (SOUNDS/)</span>
            {sdInfo.soundFiles.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded bg-[#243044] text-[#94a3b8] text-[10px]">
                {sdInfo.soundFiles.length}
              </span>
            )}
          </div>
          {sdInfo.soundFiles.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 mb-1">
              {sdInfo.soundFiles.map((f) => (
                <span key={f} className="px-2 py-1 rounded-lg bg-[#1e293b] border border-[#334155] text-[#f1f5f9] text-[11px] font-mono">
                  {f}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[#475569] text-xs italic mb-1">No .wav files found in SOUNDS/ or SOUNDS/en/</p>
          )}
          <p className="text-[#94a3b8] text-[10px]">These are the files you can assign in Voice & Switches</p>
        </div>

        {/* Lua scripts */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span>📜</span>
            <span className="text-[#f1f5f9] text-sm font-semibold">Lua Scripts (SCRIPTS/TOOLS/)</span>
            {sdInfo.scriptFiles.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded bg-[#243044] text-[#94a3b8] text-[10px]">
                {sdInfo.scriptFiles.length}
              </span>
            )}
          </div>
          {sdInfo.scriptFiles.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 mb-1">
              {sdInfo.scriptFiles.map((f) => (
                <span key={f} className="px-2 py-1 rounded-lg bg-[#1e293b] border border-[#334155] text-[#f1f5f9] text-[11px] font-mono">
                  {f}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[#475569] text-xs italic mb-1">No scripts in SCRIPTS/TOOLS/</p>
          )}
          <p className="text-[#94a3b8] text-[10px]">FDCONFIG.lua appears here after you push to radio</p>
        </div>

        {sdScanError && (
          <div className="text-[#ef4444] text-xs bg-[#2d0f0f] border border-[#ef4444]/30 rounded-lg px-3 py-2">
            Scan error: {sdScanError}
          </div>
        )}
      </div>
    )
  }

  // ── Flight Timer tab ──
  const renderTimer = (): JSX.Element => {
    const maxSec = timerConfig.maxMinutes * 60
    const pct = maxSec > 0 ? Math.min(100, (timerElapsed / maxSec) * 100) : 0
    const isOver = maxSec > 0 && timerElapsed >= maxSec
    const isWarn = !isOver && pct >= timerConfig.warningPct
    const barColor = isOver ? '#ef4444' : isWarn ? '#f59e0b' : '#22c55e'
    const fmt = (s: number): string =>
      `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
    const remaining = Math.max(0, maxSec - timerElapsed)

    return (
      <div className="py-6 px-6 space-y-5 max-w-xl mx-auto">

        {/* Digital display */}
        <div className={`rounded-2xl border p-6 text-center transition-all ${
          isOver ? 'bg-[#2d0f0f] border-[#ef4444]/50' :
          isWarn ? 'bg-[#2d1e0f] border-[#f59e0b]/50' :
          'bg-[#0f172a] border-[#334155]'
        }`}>
          <div className="text-[#94a3b8] text-[11px] font-semibold uppercase tracking-widest mb-1">
            {timerConfig.mode === 'elapsed' ? 'Flight Time' : 'Total Time'}
          </div>
          <div className={`font-mono text-6xl font-bold tracking-tight mb-1 transition-colors ${
            isOver ? 'text-[#ef4444]' : isWarn ? 'text-[#f59e0b]' : 'text-[#f1f5f9]'
          }`}>
            {fmt(timerElapsed)}
          </div>
          {timerConfig.mode === 'throttle' && (
            <div className="text-[#94a3b8] text-xs mb-1">
              Motor time: <span className="text-[#f1f5f9] font-mono font-semibold">{fmt(motorElapsed)}</span>
            </div>
          )}
          {maxSec > 0 && (
            <div className={`text-xs font-semibold ${isOver ? 'text-[#ef4444]' : 'text-[#94a3b8]'}`}>
              {isOver ? '⚠ OVERTIME — Land now' : `${fmt(remaining)} remaining`}
            </div>
          )}
          {maxSec > 0 && (
            <div className="mt-4 h-3 rounded-full bg-[#243044] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-1000"
                style={{ width: `${pct}%`, background: barColor }}
              />
            </div>
          )}
          {/* Motor toggle — shown during throttle mode */}
          {timerConfig.mode === 'throttle' && timerRunning && (
            <div className="mt-4 flex justify-center">
              <button
                onClick={() => setMotorOn((p) => !p)}
                className={`px-6 py-2 rounded-xl font-bold text-sm transition-all ${
                  motorOn ? 'bg-[#ef4444] text-white shadow-lg shadow-red-900/30 animate-pulse' : 'bg-[#243044] text-[#94a3b8] border border-[#334155]'
                }`}
              >
                {motorOn ? '🔴 Throttle ON — tap to cut' : '⬛ Throttle OFF — tap when on power'}
              </button>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4">
          {!timerRunning ? (
            <button
              onClick={() => {
                if (timerConfig.mode === 'throttle') setMotorOn(true)
                setTimerRunning(true)
              }}
              className="flex items-center gap-2 px-8 py-3 rounded-xl font-bold text-sm text-white shadow-lg transition-all hover:scale-105"
              style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}
            >
              ▶ Start
            </button>
          ) : (
            <button
              onClick={() => { setTimerRunning(false); setMotorOn(false) }}
              className="px-8 py-3 rounded-xl font-bold text-sm bg-[#f59e0b] text-black shadow-lg transition-all hover:scale-105"
            >
              ⏸ Pause
            </button>
          )}
          <button
            onClick={() => {
              setTimerRunning(false)
              setMotorOn(false)
              logFlight()
              setTimerElapsed(0)
              setMotorElapsed(0)
            }}
            className="px-6 py-3 rounded-xl font-semibold text-sm border border-[#334155] text-[#94a3b8] hover:text-[#f1f5f9] hover:border-[#475569] transition-all"
          >
            ↺ Reset & Log
          </button>
        </div>

        {/* Timer settings */}
        <div className="rounded-xl bg-[#1e293b] border border-[#334155] p-4 space-y-4">
          <div className="text-[#f1f5f9] text-sm font-semibold">Timer Settings</div>

          {/* Mode */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[#f1f5f9] text-sm">Mode</div>
              <div className="text-[#94a3b8] text-[11px]">
                {timerConfig.mode === 'elapsed' ? 'Counts continuously from Start' : 'Only counts motor-on time — tap the Throttle button during flight'}
              </div>
            </div>
            <div className="flex rounded-lg overflow-hidden border border-[#334155] shrink-0 ml-4">
              {(['elapsed', 'throttle'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setTimerConfig((p) => ({ ...p, mode: m }))}
                  className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                    timerConfig.mode === m ? 'bg-[#3b82f6] text-white' : 'bg-[#0f172a] text-[#94a3b8] hover:text-[#f1f5f9]'
                  }`}
                >
                  {m === 'elapsed' ? 'Flight' : 'Motor'}
                </button>
              ))}
            </div>
          </div>

          {/* Max time */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[#f1f5f9] text-sm">Max Flight Time</div>
              <div className="text-[#94a3b8] text-[11px]">0 = no limit / countdown</div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number" min={0} max={60} value={timerConfig.maxMinutes}
                onChange={(e) => setTimerConfig((p) => ({ ...p, maxMinutes: Math.max(0, Math.min(60, Number(e.target.value))) }))}
                className="w-16 bg-[#0f172a] border border-[#334155] rounded-lg px-2 py-1.5 text-[#f1f5f9] text-sm text-center focus:outline-none focus:border-[#3b82f6]"
              />
              <span className="text-[#94a3b8] text-xs">min</span>
            </div>
          </div>

          {/* Warning % */}
          {timerConfig.maxMinutes > 0 && (
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[#f1f5f9] text-sm">Amber Warning</div>
                <div className="text-[#94a3b8] text-[11px]">Display turns yellow at this % of max time</div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number" min={50} max={95} step={5} value={timerConfig.warningPct}
                  onChange={(e) => setTimerConfig((p) => ({ ...p, warningPct: Math.max(50, Math.min(95, Number(e.target.value))) }))}
                  className="w-16 bg-[#0f172a] border border-[#334155] rounded-lg px-2 py-1.5 text-[#f1f5f9] text-sm text-center focus:outline-none focus:border-[#3b82f6]"
                />
                <span className="text-[#94a3b8] text-xs">%</span>
              </div>
            </div>
          )}
        </div>

        {/* Recent flight log */}
        {flightLog.length > 0 && (
          <div className="rounded-xl bg-[#1e293b] border border-[#334155] p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[#f1f5f9] text-sm font-semibold">Session Flights</div>
              <button onClick={() => setFlightLog([])} className="text-[#94a3b8] hover:text-[#ef4444] text-xs transition-colors">
                Clear
              </button>
            </div>
            <div className="space-y-2">
              {flightLog.map((entry, i) => {
                const isDifferent = entry.motorElapsed !== entry.elapsed
                return (
                  <div key={i} className="flex items-center justify-between text-xs border-b border-[#243044] pb-2 last:border-0 last:pb-0">
                    <span className="text-[#94a3b8]">{entry.date}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-[#f1f5f9] font-mono">{fmt(entry.elapsed)}</span>
                      {isDifferent && (
                        <span className="text-[#f59e0b] font-mono text-[11px]">{fmt(entry.motorElapsed)} motor</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mt-2 pt-2 border-t border-[#243044] flex justify-between text-[10px] text-[#94a3b8]">
              <span>{flightLog.length} flight{flightLog.length !== 1 ? 's' : ''}</span>
              <span>Total: {fmt(flightLog.reduce((a, f) => a + f.elapsed, 0))}</span>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Wizard screens ──────────────────────────────────────────────────────────

  if (wizardMode) {
    // Welcome screen
    if (wizardPhase === 'welcome') return (
      <div className="flex flex-col items-center justify-center h-full bg-[#0f172a] px-6 text-center">
        <div className="text-6xl mb-6">✈️</div>
        <h1 className="text-[#f1f5f9] text-3xl font-bold mb-3">
          Let&apos;s set up {modelName || 'your plane'}.
        </h1>
        <p className="text-[#94a3b8] text-base max-w-md leading-relaxed mb-2">
          We&apos;ll ask you a few simple questions — one at a time.
          Each one covers a single feature. Answer yes or no.
          Skip anything you&apos;re not ready for.
        </p>
        <p className="text-[#64748b] text-sm mb-10">Takes about 3 minutes.</p>
        <button
          onClick={() => setWizardPhase('ratesQuestion')}
          className="px-10 py-4 bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-lg font-bold rounded-2xl transition-colors shadow-xl shadow-blue-900/30 mb-4"
        >
          Get Started →
        </button>
        <button
          onClick={finishWizard}
          className="text-[#475569] hover:text-[#94a3b8] text-sm transition-colors"
        >
          I know what I&apos;m doing — skip to manual setup
        </button>
      </div>
    )

    // Question 1 — Rates
    if (wizardPhase === 'ratesQuestion') return (
      <div className="flex flex-col h-full overflow-y-auto bg-[#0f172a]">
        <div className="flex-1 flex flex-col justify-center px-6 py-10 max-w-xl mx-auto w-full">
          <p className="text-[#64748b] text-xs font-bold uppercase tracking-widest mb-6">Question 1</p>

          <h1 className="text-[#f1f5f9] text-2xl font-bold leading-snug mb-6">
            Do you want to control how sensitive your plane feels in the air?
          </h1>

          <div className="space-y-4 text-[#cbd5e1] text-sm leading-relaxed mb-8">
            <p>
              When you move a stick on your radio, your plane moves its control surfaces —
              the ailerons, elevator, and rudder. How <span className="text-[#f1f5f9] font-semibold">far</span> they
              move is called the rate.
            </p>
            <p>
              If the rate is set too <span className="text-red-400 font-semibold">high</span>, the plane
              reacts violently to small stick movements. One small twitch and it snaps hard. Beginners crash this way.
            </p>
            <p>
              If the rate is set too <span className="text-amber-400 font-semibold">low</span>, you push
              the stick and barely anything happens. That is frustrating and hard to fly too.
            </p>
            <p>
              The trick most pilots use: set up <span className="text-[#f1f5f9] font-semibold">three levels</span> and
              flip a switch to change between them in the air — no landing required.
            </p>

            <div className="bg-[#1e293b] rounded-xl border border-[#334155] p-4 space-y-3 mt-2">
              {[
                { dot: '#64748b', label: 'LOW', sub: 'Small, gentle movements. Use for takeoff, landing, or flying far away.' },
                { dot: '#f59e0b', label: 'MID', sub: 'Normal everyday flying. Responsive but not twitchy.' },
                { dot: '#22c55e', label: 'HIGH', sub: 'Big fast movements. Aerobatics, windy days, or tight passes.' },
              ].map(({ dot, label, sub }) => (
                <div key={label} className="flex gap-3">
                  <span className="w-3 h-3 rounded-full shrink-0 mt-1" style={{ background: dot }} />
                  <div>
                    <span className="text-[#f1f5f9] font-bold text-sm">{label} — </span>
                    <span className="text-[#94a3b8] text-sm">{sub}</span>
                  </div>
                </div>
              ))}
            </div>

            <p>
              Most pilots start every flight on Low, then flip up once they&apos;re comfortable.
              You switch between them with one flip of a switch — no menus, no landing.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={() => setWizardPhase('ratesSetup')}
              className="w-full py-4 bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-base font-bold rounded-2xl transition-colors shadow-lg shadow-blue-900/30"
            >
              Yes — set up Low, Mid, and High rates
            </button>
            <button
              onClick={() => setWizardPhase('mixSetup')}
              className="w-full py-3 bg-[#1e293b] hover:bg-[#243044] text-[#94a3b8] text-sm font-medium rounded-2xl border border-[#334155] transition-colors"
            >
              No — skip rates for now
            </button>
          </div>
        </div>
      </div>
    )

    // Rates setup wizard (switch → explain → sliders)
    if (wizardPhase === 'ratesSetup') return (
      <div className="flex flex-col h-full overflow-y-auto bg-[#0f172a]">
        <RatesWizard
          onComplete={(result) => {
            applyRatesWizardResult(result)
            setWizardPhase('mixSetup')
          }}
          onSkip={() => setWizardPhase('mixSetup')}
        />
      </div>
    )

    // Mix wizard (airframe type → mix-specific steps)
    if (wizardPhase === 'mixSetup') return (
      <div className="flex flex-col h-full overflow-y-auto bg-[#0f172a]">
        <MixWizard
          onComplete={(result) => {
            applyMixWizardResult(result)
          }}
          onSkip={finishWizard}
          rateSwitch={surfaceRates[0]?.switchId}
        />
      </div>
    )

    // Recap + export screen
    if (wizardPhase === 'recap') {
      const r = mixWizardResult
      return (
        <div className="flex flex-col h-full overflow-hidden bg-[#060e1a]">
          <div className="shrink-0 bg-[#060e1a] border-b border-[#1a3050] px-5 py-4">
            <span className="text-green-400 text-xs font-bold uppercase tracking-widest">Setup Complete</span>
            <p className="text-[#f1f5f9] text-xl font-bold mt-1">{modelName || 'Your model'} is ready.</p>
            <p className="text-[#64748b] text-sm mt-0.5">Review your configuration, then export it to your radio.</p>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-3">

            {/* Airframe */}
            {r && (
              <div className="bg-[#0f172a] border border-[#1e3a5a] rounded-2xl px-5 py-4">
                <p className="text-[#64748b] text-xs font-bold uppercase tracking-widest mb-1">Airframe</p>
                <p className="text-[#f1f5f9] text-base font-bold">{r.airframeType.replace(/([A-Z])/g, ' $1').trim()}</p>
              </div>
            )}

            {/* Rates */}
            {surfaceRates.length > 0 && (
              <div className="bg-[#0f172a] border border-[#1e3a5a] rounded-2xl px-5 py-4">
                <p className="text-[#64748b] text-xs font-bold uppercase tracking-widest mb-2">Rates</p>
                <div className="space-y-1">
                  {surfaceRates.map((sr) => (
                    <div key={sr.id} className="flex items-center justify-between">
                      <span className="text-[#94a3b8] text-sm">{sr.label}</span>
                      <span className="text-[#f1f5f9] text-sm font-mono">
                        H:{sr.high.rate}% / M:{sr.mid.rate}% / L:{sr.low.rate}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Throttle cut */}
            {r?.throttleCutSwitch && (
              <div className="bg-[#0f172a] border border-[#1e3a5a] rounded-2xl px-5 py-4">
                <p className="text-[#64748b] text-xs font-bold uppercase tracking-widest mb-1">Throttle Cut</p>
                <p className="text-[#f1f5f9] text-sm font-bold">
                  Switch {r.throttleCutSwitch} — {r.throttleCutMode === 'idleGate' ? 'Idle gate' : 'Cut anytime'}
                </p>
              </div>
            )}

            {/* Reverse thrust */}
            {r?.revThrustSwitch && (
              <div className="bg-[#0f172a] border border-[#1e3a5a] rounded-2xl px-5 py-4">
                <p className="text-[#64748b] text-xs font-bold uppercase tracking-widest mb-1">Reverse Thrust</p>
                <p className="text-[#f1f5f9] text-sm font-bold">Switch {r.revThrustSwitch}</p>
              </div>
            )}

            {/* Sound announcements */}
            {r?.soundAnnouncements?.rateAnnouncements && (
              <div className="bg-[#0f172a] border border-[#1e3a5a] rounded-2xl px-5 py-4">
                <p className="text-[#64748b] text-xs font-bold uppercase tracking-widest mb-1">Sound Studio</p>
                <p className="text-[#f1f5f9] text-sm font-bold">Rate announcements enabled</p>
              </div>
            )}

            {/* Flight timer */}
            {r?.flightTimer && (
              <div className="bg-[#0f172a] border border-[#1e3a5a] rounded-2xl px-5 py-4">
                <p className="text-[#64748b] text-xs font-bold uppercase tracking-widest mb-1">Flight Timer</p>
                <p className="text-[#f1f5f9] text-sm font-bold">
                  Count {r.flightTimer.mode} · {r.flightTimer.duration} min ·{' '}
                  {r.flightTimer.trigger === 'throttle' ? 'Throttle triggered' : 'Always running'}
                  {r.flightTimer.minuteBeeps ? ' · Minute beeps on' : ''}
                </p>
              </div>
            )}

            {/* Export result feedback */}
            {exportResult && (
              <div className={`rounded-2xl px-5 py-4 border ${exportResult.ok ? 'bg-green-950 border-green-700' : 'bg-red-950 border-red-700'}`}>
                <p className={`text-sm font-medium ${exportResult.ok ? 'text-green-300' : 'text-red-300'}`}>
                  {exportResult.ok ? '✓ ' : '✗ '}{exportResult.msg}
                </p>
              </div>
            )}

            {/* Action buttons */}
            <div className="pt-2 space-y-3">
              <button
                onClick={handleExport}
                disabled={exporting}
                className="w-full py-4 bg-[#22c55e] hover:bg-[#16a34a] disabled:opacity-50 text-white text-base font-bold rounded-2xl transition-colors shadow-lg shadow-green-900/30"
              >
                {exporting ? 'Exporting…' : 'Export to Radio ↓'}
              </button>
              <button
                onClick={finishWizard}
                className="w-full py-3 text-[#64748b] hover:text-[#94a3b8] text-sm transition-colors"
              >
                Done — go to manual setup
              </button>
            </div>
          </div>
        </div>
      )
    }
  }

  // ── Root render ──
  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#0f172a]">
      {/* Page title — always shows which model is active */}
      <div className="px-6 pt-4 pb-0 shrink-0 flex items-center gap-3 border-b border-[#334155] pb-4">
        <div className="w-9 h-9 rounded-lg bg-[#3b82f620] border border-[#3b82f640] flex items-center justify-center text-base shrink-0">
          📻
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[#94a3b8]">Radio Studio</div>
          {modelNameProp ? (
            /* Embedded inside a model — name is locked */
            <div className="text-[#f1f5f9] font-bold text-base leading-tight">{modelNameProp}</div>
          ) : (
            /* Sidebar — show model picker */
            allModels.length > 0 ? (
              <select
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                className="bg-transparent text-[#f1f5f9] font-bold text-base leading-tight border-none outline-none cursor-pointer mt-0.5 pr-2"
              >
                {allModels.map((m) => (
                  <option key={m.id} value={m.name} className="bg-[#1e293b] text-[#f1f5f9]">
                    {m.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="text-[#f1f5f9] font-bold text-base leading-tight">Radio Studio</div>
            )
          )}
        </div>
      </div>

      {renderHeader()}
      {renderResultBanner()}
      {renderTabs()}

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'channels' && renderChannels()}
        {activeTab === 'rates' && renderRates()}
        {activeTab === 'flaps' && renderFlaps()}
        {activeTab === 'mixes' && renderMixes()}
        {activeTab === 'voice' && renderVoice()}
        {activeTab === 'sounds' && <SoundsTab sdDrive={sdDrive} onSoundSaved={reloadAppSounds} />}
        {activeTab === 'timer' && renderTimer()}
        {activeTab === 'sdfiles' && renderSdFiles()}
        {activeTab === 'export' && renderExport()}
        {activeTab === 'help' && renderHelp()}
        {activeTab === 'wizard' && (
          <RatesWizard
            onComplete={applyRatesWizardResult}
            onSkip={() => setActiveTab('rates')}
          />
        )}
      </div>

      {/* Snapshot name input (inline above bottom bar) */}
      {showSnapshotInput && (
        <div className="shrink-0 mx-6 mb-0 bg-[#1e293b] border border-[#334155] border-b-0 rounded-t-xl shadow-xl px-4 py-3 flex items-center gap-3">
          <input
            autoFocus
            value={snapshotInputName}
            onChange={(e) => setSnapshotInputName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveNamedSnapshot(snapshotInputName)
              if (e.key === 'Escape') { setShowSnapshotInput(false); setSnapshotInputName('') }
            }}
            placeholder={`Name this snapshot (e.g. "${modelName || 'P47'} Low Wind")`}
            className="flex-1 bg-[#0f172a] border border-[#3b82f6] rounded-lg px-3 py-2 text-[#f1f5f9] text-sm focus:outline-none"
          />
          <button
            onClick={() => saveNamedSnapshot(snapshotInputName)}
            disabled={!snapshotInputName.trim()}
            className="px-4 py-2 bg-[#22c55e] hover:bg-[#16a34a] text-white text-sm font-semibold rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Save
          </button>
          <button
            onClick={() => { setShowSnapshotInput(false); setSnapshotInputName('') }}
            className="text-[#94a3b8] hover:text-[#f1f5f9] text-lg leading-none"
          >
            ×
          </button>
        </div>
      )}

      {/* History panel (floats above bottom bar) */}
      {showHistory && (namedSnapshots.length > 0 || configHistory.length > 0) && (
        <div className="shrink-0 mx-6 mb-0 bg-[#1e293b] border border-[#334155] border-b-0 rounded-t-xl shadow-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-[#334155]">
            <span className="text-[#f1f5f9] text-xs font-semibold">Snapshots & History</span>
            <button onClick={() => setShowHistory(false)} className="text-[#94a3b8] hover:text-[#f1f5f9] text-base leading-none">×</button>
          </div>
          <div className="max-h-56 overflow-y-auto">
            {/* Named snapshots first */}
            {namedSnapshots.length > 0 && (
              <>
                <div className="px-4 py-1 bg-[#0f172a]/40">
                  <span className="text-[#22c55e] text-[10px] font-bold uppercase tracking-wider">Pinned Snapshots</span>
                </div>
                {namedSnapshots.map((snap) => (
                  <div key={snap.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-[#243044] border-b border-[#243044] last:border-0 transition-colors">
                    <div>
                      <div className="text-[#f1f5f9] text-xs font-semibold">{snap.name}</div>
                      <div className="text-[#475569] text-[10px]">{new Date(snap.ts).toLocaleString()}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => restoreNamedSnapshot(snap)}
                        className="text-xs text-[#3b82f6] hover:text-[#60a5fa] font-semibold transition-colors"
                      >
                        Restore
                      </button>
                      <button
                        onClick={() => deleteNamedSnapshot(snap.id)}
                        className="text-xs text-[#475569] hover:text-red-400 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}
            {/* Auto-save history */}
            {configHistory.length > 0 && (
              <>
                <div className="px-4 py-1 bg-[#0f172a]/40">
                  <span className="text-[#64748b] text-[10px] font-bold uppercase tracking-wider">Auto-saved changes (last {configHistory.length})</span>
                </div>
                {configHistory.map((entry, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2 hover:bg-[#243044] border-b border-[#243044] last:border-0 transition-colors">
                    <span className="text-[#94a3b8] text-xs">{entry.label}</span>
                    <button
                      onClick={() => restoreSnapshot(entry)}
                      className="text-xs text-[#3b82f6] hover:text-[#60a5fa] font-semibold transition-colors"
                    >
                      Restore
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {/* Presets panel (floats above bottom bar) */}
      {showPresets && (
        <div className="shrink-0 mx-6 mb-0 bg-[#1e293b] border border-[#334155] border-b-0 rounded-t-xl shadow-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-[#334155]">
            <span className="text-[#f1f5f9] text-xs font-semibold">Quick Setup Presets</span>
            <button onClick={() => setShowPresets(false)} className="text-[#94a3b8] hover:text-[#f1f5f9] text-base leading-none">×</button>
          </div>
          <div className="flex gap-2 p-3">
            {MODEL_PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => applyPreset(preset)}
                className="flex flex-col items-center gap-1 px-4 py-3 rounded-xl border border-[#334155] hover:border-[#3b82f6] hover:bg-[#243044] transition-all"
              >
                <span className="text-2xl">{preset.icon}</span>
                <span className="text-[#f1f5f9] text-xs font-semibold">{preset.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bottom push-to-radio bar (always visible) */}
      <div className="shrink-0 px-6 py-3 border-t border-[#334155] bg-[#1e293b] flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {/* Saved indicator */}
          {effectiveModelId && savedAt && (
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" />
              <span className="text-[#22c55e] text-[11px] font-medium">Saved</span>
            </div>
          )}
          {/* Save Snapshot button */}
          {effectiveModelId && (
            <button
              onClick={() => { setShowSnapshotInput((p) => !p); setShowHistory(false); setShowPresets(false) }}
              className={`text-[11px] font-medium px-2 py-0.5 rounded transition-colors ${
                showSnapshotInput ? 'text-[#22c55e] bg-[#22c55e]/10' : 'text-[#94a3b8] hover:text-[#f1f5f9]'
              }`}
            >
              ★ Save Snapshot
            </button>
          )}
          {/* History button */}
          {effectiveModelId && (namedSnapshots.length > 0 || configHistory.length > 0) && (
            <button
              onClick={() => { setShowHistory((p) => !p); setShowPresets(false); setShowSnapshotInput(false) }}
              className={`text-[11px] font-medium px-2 py-0.5 rounded transition-colors ${
                showHistory ? 'text-[#3b82f6] bg-[#3b82f6]/10' : 'text-[#94a3b8] hover:text-[#f1f5f9]'
              }`}
            >
              ↩ History {namedSnapshots.length > 0 ? `(${namedSnapshots.length} pinned)` : `(${configHistory.length})`}
            </button>
          )}
          {/* Presets */}
          <button
            onClick={() => { setShowPresets((p) => !p); setShowHistory(false) }}
            className={`text-[11px] font-medium px-2 py-0.5 rounded transition-colors ${
              showPresets ? 'text-[#3b82f6] bg-[#3b82f6]/10' : 'text-[#94a3b8] hover:text-[#f1f5f9]'
            }`}
          >
            ⚡ Presets
          </button>
          <div className="text-[#475569] text-xs hidden sm:block">
            {channels.filter((c) => c.source && c.source !== '---').length} ch ·{' '}
            {surfaceRates.length} surfaces ·{' '}
            {advMixes.length} mixes
          </div>
        </div>
        <button
          onClick={() => {
            if (!window.confirm('Write this configuration to your radio SD card? This will overwrite the current model file.')) return
            pushToRadio()
          }}
          disabled={!sdDrive || writing}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            sdDrive && !writing
              ? 'bg-[#3b82f6] hover:bg-[#2563eb] text-white shadow-lg shadow-blue-900/30'
              : 'bg-[#243044] text-[#475569] cursor-not-allowed'
          }`}
        >
          {writing
          ? '⏳ Writing...'
          : sdInfo?.hasYamlModels
            ? '⬆ Save to Radio — Direct'
            : '⬆ Push to Radio — Script'
        }
        </button>
      </div>
    </div>
  )
}

export default RadioDashboard
