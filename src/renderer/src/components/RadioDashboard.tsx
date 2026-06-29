import { useState, useEffect, useCallback } from 'react'
import CurveEditor, { CurveData, MiniCurve, defaultCurve } from './CurveEditor'
import Tip from './Tip'
import { RCModel } from './ModelCard'

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

type Tab = 'channels' | 'rates' | 'flaps' | 'mixes' | 'voice' | 'sdfiles'

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
      className={`bg-[#0d1117] border border-[#30363d] rounded-lg px-2 py-1.5 text-[#e6edf3] text-sm
        focus:outline-none focus:border-[#2563eb] transition-colors ${className ?? ''}`}
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
        className="flex-1 h-1.5 rounded-full accent-[#2563eb]"
        style={{ minWidth: 60 }}
      />
      <input
        type="number"
        min={-100}
        max={100}
        value={value}
        onChange={(e) => onChange(Math.max(-100, Math.min(100, Number(e.target.value))))}
        className="w-14 bg-[#0d1117] border border-[#30363d] rounded px-1.5 py-1
          text-[#e6edf3] text-xs text-center focus:outline-none focus:border-[#2563eb]"
      />
      <span className="text-[#8b949e] text-xs w-3">%</span>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface RadioDashboardProps {
  modelName?: string
}

function RadioDashboard({ modelName: modelNameProp }: RadioDashboardProps): JSX.Element {
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
  const [surfaceRates, setSurfaceRates] = useState<SurfaceRates[]>(DEFAULT_SURFACE_RATES)
  const [flapConfig, setFlapConfig] = useState<FlapConfig>(DEFAULT_FLAP_CONFIG)
  const [writing, setWriting] = useState(false)
  const [writeResult, setWriteResult] = useState<{ ok: boolean; msg: string; mode?: string } | null>(null)
  const [expandedCurve, setExpandedCurve] = useState<{ srId: string; pos: 'high' | 'mid' | 'low' } | null>(null)

  // Sync model name from prop when navigating between models
  useEffect(() => {
    if (modelNameProp) setModelName(modelNameProp)
  }, [modelNameProp])

  // Load model list for sidebar picker (only needed when not embedded in a model)
  useEffect(() => {
    if (!modelNameProp) {
      window.api.models.getAll().then((models) => {
        setAllModels(models)
        if (models.length > 0 && !modelName) setModelName(models[0].name)
      }).catch(() => {})
    }
  }, [modelNameProp])

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
    if (!sdDrive) { setSdInfo(null); setSelectedYamlFile(''); return }
    window.api.edgetx.scanSdCard(sdDrive)
      .then((info) => {
        setSdInfo(info)
        if (info.yamlModelFiles.length > 0 && !selectedYamlFile) {
          setSelectedYamlFile(info.yamlModelFiles[0])
        }
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
      <div className="border-b border-[#30363d] shrink-0">
        {/* Status row */}
        <div className="flex items-center gap-4 px-6 py-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-3 h-3 rounded-full shrink-0 ${sdDrive ? 'bg-[#3fb950]' : 'bg-[#484f58]'}`}
              style={sdDrive ? { boxShadow: '0 0 8px #3fb950' } : undefined}
            />
            <div>
              {sdDrive ? (
                <span className="text-[#3fb950] font-semibold text-sm">TX16S Connected — {sdDrive}</span>
              ) : (
                <span className="text-[#484f58] text-sm">No Radio — plug in TX16S and select USB Storage</span>
              )}
              {sdInfo && (
                <span className="ml-3 text-[#8b949e] text-xs">
                  {sdInfo.soundFiles.length} sounds · {sdInfo.scriptFiles.length} scripts
                </span>
              )}
            </div>
          </div>

          {/* Mode badge */}
          {sdDrive && (
            <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
              hasYaml
                ? 'bg-[#3fb950]/15 text-[#3fb950] border border-[#3fb950]/30'
                : 'bg-[#f59e0b]/15 text-[#f59e0b] border border-[#f59e0b]/30'
            }`}>
              {hasYaml ? '⚡ Direct Edit' : '🔧 Script Mode'}
            </span>
          )}
        </div>

        {/* Model selector row — shown when YAML files are available */}
        {sdDrive && hasYaml && (
          <div className="flex items-center gap-3 px-6 pb-3">
            <span className="text-[#8b949e] text-xs shrink-0">Model file:</span>
            <select
              value={selectedYamlFile}
              onChange={(e) => setSelectedYamlFile(e.target.value)}
              className="bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-1.5 text-[#e6edf3] text-sm
                focus:outline-none focus:border-[#2563eb] transition-colors flex-1 max-w-xs"
            >
              {sdInfo!.yamlModelFiles.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
            <button
              onClick={loadFromRadio}
              disabled={!selectedYamlFile || loadingModel}
              className="px-3 py-1.5 rounded-lg border border-[#30363d] hover:border-[#2563eb]
                text-[#8b949e] hover:text-[#2563eb] text-xs font-medium transition-all
                disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loadingModel ? '⏳ Loading...' : '⬇ Load from Radio'}
            </button>
            <span className="text-[#8b949e] text-[10px]">or type your model name:</span>
            <input
              type="text"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              className="bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-1.5 text-[#e6edf3] text-sm
                w-36 focus:outline-none focus:border-[#2563eb] transition-colors"
              placeholder="Model name"
            />
          </div>
        )}

        {/* Model name only when no YAML */}
        {sdDrive && !hasYaml && (
          <div className="flex items-center gap-3 px-6 pb-3">
            <span className="text-[#8b949e] text-xs">Model name (used in script):</span>
            <input
              type="text"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              className="bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-1.5 text-[#e6edf3] text-sm
                w-52 focus:outline-none focus:border-[#2563eb] transition-colors"
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
          ? 'bg-[#0d2818] border-[#3fb950]/40 text-[#3fb950]'
          : 'bg-[#2d0f0f] border-[#ef4444]/40 text-[#ef4444]'
      }`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <span>{writeResult.ok ? '✓ ' : '✗ '}{writeResult.msg}</span>
            {writeResult.ok && writeResult.mode === 'yaml' && (
              <div className="mt-1 text-[10px] text-[#3fb950]/70">
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

  const tabs: { id: Tab; label: string; badge?: string }[] = [
    { id: 'channels', label: 'Channels' },
    { id: 'rates', label: 'Rates & Expo' },
    { id: 'flaps', label: 'Flap / Wing', badge: flapConfig.enabled ? String(flapConfig.stages) : undefined },
    { id: 'mixes', label: 'Advanced Mixes' },
    { id: 'voice', label: 'Voice & Switches' },
    { id: 'sdfiles', label: 'SD Card Files' },
  ]

  const renderTabs = (): JSX.Element => (
    <div className="flex gap-1 px-6 pt-4 border-b border-[#30363d] shrink-0">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => setActiveTab(t.id)}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-t-lg transition-all -mb-px border-b-2 ${
            activeTab === t.id
              ? 'text-[#2563eb] border-[#2563eb] bg-[#161b22]'
              : 'text-[#8b949e] border-transparent hover:text-[#e6edf3]'
          }`}
        >
          {t.label}
          {t.badge && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[#3fb950]/20 text-[#3fb950]">
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
        <span className="text-[#8b949e] text-[10px] uppercase tracking-wider text-center">CH</span>
        <span className="text-[#8b949e] text-[10px] uppercase tracking-wider">Function</span>
        <span className="flex items-center gap-1 text-[#8b949e] text-[10px] uppercase tracking-wider">
          Source <Tip text="Which stick, switch, or pot drives this channel. Ail/Ele/Thr/Rud = the four main sticks. SA–SF = physical switches. S1/S2/LS/RS = pots and sliders." />
        </span>
        <span className="flex items-center gap-1 text-[#8b949e] text-[10px] uppercase tracking-wider">
          Weight <Tip text="Output scale — 100% = full servo travel. Negative values reverse the direction. Reduce below 100% to limit throw on that channel only." />
        </span>
        <span className="flex items-center gap-1 justify-center text-[#8b949e] text-[10px] uppercase tracking-wider">
          Expo <Tip text="Exponential curve on this channel's output. 0 = linear. Higher values soften response near center. For full curve editing use the Rates & Expo tab." side="top" />
        </span>
        <span className="flex items-center gap-1 justify-center text-[#8b949e] text-[10px] uppercase tracking-wider">
          Offset <Tip text="Shifts the center point. +20% means the servo sits 20% toward full deflection at neutral stick. Used for trim that is too large for the radio's trim tab." side="top" />
        </span>
        <span className="flex items-center gap-1 justify-center text-[#8b949e] text-[10px] uppercase tracking-wider">
          Rev <Tip text="Reverse — flips the output direction. Use when the servo moves the wrong way. Equivalent to reversing the servo in EdgeTX." side="top" />
        </span>
      </div>

      {channels.map((ch) => {
        const isNone = !ch.source || ch.source === '---'
        const chColor = ch.ch === 5 ? '#3b82f6' : ch.ch === 3 ? '#ef4444' : '#8b949e'
        return (
          <div
            key={ch.ch}
            className={`grid items-center gap-3 px-6 py-2.5 transition-colors ${
              isNone ? 'opacity-40' : 'hover:bg-[#21262d]/50'
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
              className="bg-transparent border-b border-transparent hover:border-[#30363d] focus:border-[#2563eb]
                text-[#e6edf3] text-sm font-medium px-1 py-0.5 focus:outline-none transition-colors"
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
              className="w-full bg-[#0d1117] border border-[#30363d] rounded px-1.5 py-1
                text-[#e6edf3] text-xs text-center focus:outline-none focus:border-[#2563eb]"
              title="Expo %"
            />

            {/* Offset */}
            <input
              type="number"
              min={-100}
              max={100}
              value={ch.offset}
              onChange={(e) => updateChannel(ch.ch, { offset: Math.max(-100, Math.min(100, Number(e.target.value))) })}
              className="w-full bg-[#0d1117] border border-[#30363d] rounded px-1.5 py-1
                text-[#e6edf3] text-xs text-center focus:outline-none focus:border-[#2563eb]"
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
                    : 'bg-[#21262d] text-[#484f58] hover:text-[#8b949e]'
                }`}
              >
                R
              </button>
            </div>
          </div>
        )
      })}

      <div className="px-6 pt-3 pb-2">
        <p className="text-[#8b949e] text-[11px]">
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
      high: '#3fb950',
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
        <div className="divide-y divide-[#161b22]">
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
                <span className="flex items-center gap-1 text-[#8b949e] uppercase tracking-wider font-semibold">
                  Rate <Tip text="Scales total servo throw for this surface at this switch position. 100% = maximum deflection set in your sub-trim. 50% = half that. Use Low rates when learning a new plane." side="top" />
                </span>
                <span className="font-mono font-bold text-[#e6edf3]">{line.rate}%</span>
              </div>
              <div className="relative h-3 rounded-full bg-[#21262d] overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-all"
                  style={{ width: `${line.rate}%`, background: accentColor, opacity: 0.8 }}
                />
                <input
                  type="range" min={0} max={100} value={line.rate}
                  onChange={(e) => updateRateLine(srId, pos, { rate: Number(e.target.value) })}
                  className="absolute inset-0 w-full opacity-0 cursor-pointer"
                  style={{ height: '100%' }}
                />
              </div>
            </div>

            {/* Rate number input */}
            <div className="flex items-center gap-1 shrink-0">
              <input
                type="number" min={0} max={100} value={line.rate}
                onChange={(e) => updateRateLine(srId, pos, { rate: Math.max(0, Math.min(100, Number(e.target.value))) })}
                className="w-12 bg-[#0d1117] border border-[#30363d] rounded-lg px-1.5 py-1
                  text-[#e6edf3] text-xs text-center focus:outline-none focus:border-[#2563eb] font-mono"
              />
              <span className="text-[#484f58] text-[10px]">%</span>
            </div>

            {/* Expo section */}
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center justify-between text-[10px]">
                <span className="flex items-center gap-1 text-[#8b949e] uppercase tracking-wider font-semibold">
                  Expo <Tip text="Shapes stick feel near center. Positive = softer center (more forgiving). Negative = sharper center (more direct). Click the mini curve preview to open the full curve editor and build S-curves." side="top" />
                </span>
                <span className="font-mono font-bold" style={{ color: '#a855f7' }}>{expoLabel}</span>
              </div>
              {line.curve.type === 'expo' ? (
                <div className="relative h-3 rounded-full bg-[#21262d] overflow-hidden">
                  {/* Expo slider — center-origin fill */}
                  <div
                    className="absolute inset-y-0 rounded-full transition-all"
                    style={{
                      left: line.curve.expo >= 0 ? '50%' : `${(100 + line.curve.expo) / 2}%`,
                      width: `${Math.abs(line.curve.expo) / 2}%`,
                      background: '#a855f7',
                      opacity: 0.8,
                    }}
                  />
                  <input
                    type="range" min={-100} max={100} value={line.curve.expo}
                    onChange={(e) => updateRateLine(srId, pos, { expo: Number(e.target.value) })}
                    className="absolute inset-0 w-full opacity-0 cursor-pointer"
                    style={{ height: '100%' }}
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
                    className="w-12 bg-[#0d1117] border border-[#30363d] rounded-lg px-1.5 py-1
                      text-[#e6edf3] text-xs text-center focus:outline-none font-mono"
                    style={{ borderColor: '#a855f730' }}
                  />
                  <span className="text-[#484f58] text-[10px]">%</span>
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
                    ? 'border-[#2563eb] bg-[#2563eb]/20 text-[#2563eb]'
                    : 'border-[#30363d] text-[#484f58] hover:text-[#e6edf3] hover:border-[#8b949e]'
                  }`}
              >
                {isExpanded ? '▲' : '▼'}
              </button>
            </div>
          </div>

          {/* Inline curve editor — expands below the row */}
          {isExpanded && (
            <div className="px-4 py-4 bg-[#0d1117]">
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
        <p className="text-[#8b949e] text-xs">
          Set rate and expo per surface per switch position. Click the mini curve preview or the ▼ button
          to open the full curve editor — drag points to make S-curves, or use the expo slider with presets.
        </p>

        {surfaceRates.map((sr) => {
          const swColor = SWITCH_COLORS[sr.switchId] ?? '#8b949e'
          return (
            <div key={sr.id} className="rounded-xl border border-[#30363d] overflow-hidden">
              {/* Surface header */}
              <div className="flex items-center justify-between gap-4 px-4 py-2.5 bg-[#161b22] border-b border-[#30363d]">
                <div className="flex items-center gap-3">
                  <span className="text-[#e6edf3] font-semibold text-sm">{sr.label}</span>
                  <span className="text-[#8b949e] text-xs font-mono">{sr.inputSource}</span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 text-[#8b949e] text-xs">
                    Switch: <Tip text="Which physical switch changes between High/Mid/Low rates for this surface. SA is the standard — one switch controls all three surfaces at once if they all share SA." side="top" />
                  </span>
                  <select
                    value={sr.switchId}
                    onChange={(e) => updateSurfaceRate(sr.id, { switchId: e.target.value })}
                    className="bg-[#0d1117] border rounded px-2 py-1 text-xs font-semibold focus:outline-none"
                    style={{ borderColor: `${swColor}60`, color: swColor }}
                  >
                    {SWITCHES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>

                  <label className="flex items-center gap-1.5 text-xs text-[#8b949e] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sr.threePos}
                      onChange={(e) => {
                        updateSurfaceRate(sr.id, { threePos: e.target.checked })
                        if (!e.target.checked && expandedCurve?.srId === sr.id && expandedCurve.pos === 'mid') {
                          setExpandedCurve(null)
                        }
                      }}
                      className="accent-[#2563eb]"
                    />
                    3-position
                    <Tip text="Check if you're using a 3-position switch (SA, SB, SC, SD on the TX16S are all 3-pos). Gives you High/Mid/Low rates. Uncheck for a 2-position switch — you get High and Low only." side="top" />
                  </label>

                  <button
                    onClick={() => {
                      setSurfaceRates((prev) => prev.filter((s) => s.id !== sr.id))
                      if (expandedCurve?.srId === sr.id) setExpandedCurve(null)
                    }}
                    className="text-[#484f58] hover:text-[#ef4444] transition-colors text-base leading-none"
                    title="Remove this surface"
                  >×</button>
                </div>
              </div>

              {/* Rate rows */}
              <div className="divide-y divide-[#21262d]">
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
                  border-[#30363d] hover:border-[#2563eb] text-[#8b949e] hover:text-[#2563eb]
                  text-xs transition-all"
              >
                + {preset.label}
              </button>
            ))}
        </div>

        <div className="rounded-xl bg-[#0d1117] border border-[#30363d] p-4 text-[11px] text-[#8b949e] space-y-1">
          <div className="text-[#e6edf3] font-semibold text-xs mb-1">Tips</div>
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
      <div className="rounded-xl overflow-hidden border border-[#30363d] bg-[#0d1117] p-4">
        <div className="text-[10px] text-[#8b949e] uppercase tracking-wider mb-3 font-semibold">
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
            <div className="text-[9px] text-[#8b949e] mb-1">Elevator comp (nose-down trim)</div>
            <div className="flex h-4 rounded overflow-hidden">
              {fc.stageList.map((s, i) => (
                <div
                  key={s.id}
                  className="flex-1 flex items-center justify-center text-[8px] font-mono"
                  style={{
                    background: s.elevComp === 0 ? '#1c2128' : `${s.elevComp < 0 ? '#ef4444' : '#3fb950'}30`,
                    borderRight: i < fc.stageList.length - 1 ? '1px solid #1c2128' : 'none',
                    color: s.elevComp < 0 ? '#ef4444' : '#3fb950',
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
            <div className="text-[9px] text-[#8b949e] mb-1">
              {fc.flaperronMode
                ? <><span className="text-[#3fb950]">Flaperron droop (ailerons + roll)</span></>
                : <><span className="text-[#3fb950]">+ flapperons (droop↓)</span>&nbsp;/&nbsp;<span className="text-[#a855f7]">− crow (rise↑)</span></>
              }
            </div>
            <div className="flex h-4 rounded overflow-hidden">
              {fc.stageList.map((s, i) => {
                const isCrow = s.ailCamber < 0
                const barColor = isCrow ? '#a855f7' : '#3fb950'
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
        <span className="flex items-center gap-1 text-[10px] text-[#8b949e] w-20 shrink-0">
          {label}{tip && <Tip text={tip} side="right" width={240} />}
        </span>
        <div className="relative flex-1 h-2.5 rounded-full bg-[#21262d]">
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
          <input
            type="range" min={min} max={max} value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
          />
        </div>
        <input
          type="number" min={min} max={max} value={value}
          onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value))))}
          className="w-14 bg-[#0d1117] border border-[#30363d] rounded-lg px-1.5 py-1
            text-[#e6edf3] text-xs text-center focus:outline-none font-mono shrink-0"
          style={{ borderColor: `${color}40` }}
        />
        <span className="text-[#484f58] text-[10px] shrink-0 w-3">%</span>
      </div>
    )

    return (
      <div className="py-4 px-6 space-y-5">
        {/* Enable toggle + heading */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[#e6edf3] font-semibold text-sm">Flap & Wing Mix Setup</h3>
            <p className="text-[#8b949e] text-xs mt-0.5">
              Works on any plane — with or without flaps. No flap servo? Use Flaperron Mode to droop ailerons on a switch.
            </p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <div
              onClick={() => set({ enabled: !fc.enabled })}
              className={`relative w-12 h-6 rounded-full transition-colors cursor-pointer ${
                fc.enabled ? 'bg-[#3fb950]' : 'bg-[#21262d]'
              }`}
            >
              <div
                className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                  fc.enabled ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </div>
            <span className={`text-sm font-medium ${fc.enabled ? 'text-[#3fb950]' : 'text-[#484f58]'}`}>
              {fc.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </label>
        </div>

        {/* Flaperron mode banner */}
        <div
          onClick={() => set({ flaperronMode: !fc.flaperronMode, useAilCamber: true })}
          className={`flex items-center gap-4 rounded-xl border px-4 py-3 cursor-pointer transition-all ${
            fc.flaperronMode
              ? 'border-[#3fb950]/50 bg-[#3fb950]/8'
              : 'border-[#30363d] bg-[#161b22] hover:border-[#3fb950]/30'
          }`}
        >
          <div
            className={`relative w-10 h-5 rounded-full shrink-0 transition-colors ${
              fc.flaperronMode ? 'bg-[#3fb950]' : 'bg-[#21262d]'
            }`}
          >
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
              fc.flaperronMode ? 'translate-x-5' : 'translate-x-0.5'
            }`} />
          </div>
          <div className="min-w-0">
            <div className={`flex items-center gap-1.5 text-sm font-semibold ${fc.flaperronMode ? 'text-[#3fb950]' : 'text-[#8b949e]'}`}>
              Flaperron Mode — No Separate Flap Channel
              <Tip text="When enabled, there is no dedicated flap servo. Instead, both ailerons droop down by the amount you set per stage. Your roll stick input still works normally on top of the droop offset — so you can bank the plane while the ailerons are partially drooped. Used on planes like the Gee Bee, Extra, FMS Ranger, and any warbird with no flap surface." side="top" width={260} />
            </div>
            <div className="text-[11px] text-[#8b949e] mt-0.5">
              {fc.flaperronMode
                ? 'Ailerons droop on switch — roll still works on top. Perfect for Gee Bee, Extras, and any plane with no flap servo.'
                : 'Enable if your plane has no separate flap surfaces — uses ailerons for both roll and flap droop.'}
            </div>
          </div>
        </div>

        {/* Config row */}
        <div className="grid grid-cols-2 gap-4">
          {/* Left — input setup */}
          <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-4 space-y-3">
            <div className="text-[#8b949e] text-[10px] font-semibold uppercase tracking-wider">Input Config</div>

            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-[#8b949e] text-xs w-24 shrink-0">
                Control source <Tip text="What physical input moves through the flap stages. RS/LS = right/left slider — smooth sweep through all stages. SF/SC = a switch that snaps to positions." side="right" />
              </span>
              <select
                value={fc.source}
                onChange={(e) => set({ source: e.target.value })}
                className="flex-1 bg-[#0d1117] border border-[#30363d] rounded-lg px-2 py-1.5 text-[#e6edf3] text-sm
                  focus:outline-none focus:border-[#2563eb]"
              >
                {SOURCES_FLAT.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-[#8b949e] text-xs w-24 shrink-0">
                Stages <Tip text="How many discrete flap positions. 2 = up/down. 3 = up/half/full. 5+ = scale-style with detents. Switch sources work best with 2–3 stages; sliders can handle all 6." side="right" />
              </span>
              <div className="flex gap-1.5">
                {[2,3,4,5,6].map((n) => (
                  <button
                    key={n}
                    onClick={() => changeStageCount(n)}
                    className={`w-8 h-8 rounded-lg text-sm font-bold transition-all ${
                      fc.stages === n
                        ? 'bg-[#2563eb] text-white shadow-lg shadow-blue-900/30'
                        : 'bg-[#21262d] text-[#8b949e] hover:text-[#e6edf3] border border-[#30363d]'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-[10px] text-[#8b949e] mt-1 space-y-0.5">
              <div>SF / SC = switch snap to position — good for 2–3 stages</div>
              <div>RS / LS = smooth slider — good for 4–6 stages</div>
            </div>
          </div>

          {/* Right — channel mapping + options */}
          <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-4 space-y-3">
            <div className="text-[#8b949e] text-[10px] font-semibold uppercase tracking-wider">Channel Mapping</div>

            {/* Flap output — hidden in flaperron mode */}
            {!fc.flaperronMode && (
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-[#8b949e] text-xs w-24 shrink-0">
                  Flap output <Tip text="The channel your physical flap servos are plugged into on the receiver. Typically CH5 or CH6 on a 6-channel setup." side="right" />
                </span>
                <select
                  value={fc.flapCh}
                  onChange={(e) => set({ flapCh: Number(e.target.value) })}
                  className="flex-1 bg-[#0d1117] border rounded-lg px-2 py-1.5 text-sm focus:outline-none"
                  style={{ borderColor: '#3b82f650', color: '#3b82f6' }}
                >
                  {CHANNELS.map((n) => <option key={n} value={n}>CH{n}</option>)}
                </select>
              </div>
            )}

            {/* Aileron channel — always shown */}
            <div className="flex items-center gap-3">
              <span className="text-[#8b949e] text-xs w-24 shrink-0">
                {fc.flaperronMode ? 'Aileron (flap+roll)' : 'Aileron'}
              </span>
              <select
                value={fc.ailCh}
                onChange={(e) => set({ ailCh: Number(e.target.value) })}
                className="flex-1 bg-[#0d1117] border rounded-lg px-2 py-1.5 text-sm focus:outline-none"
                style={{ borderColor: '#3fb95050', color: '#3fb950' }}
              >
                {CHANNELS.map((n) => <option key={n} value={n}>CH{n}</option>)}
              </select>
              {fc.flaperronMode && (
                <span className="text-[10px] text-[#3fb950]/70 shrink-0">roll + droop</span>
              )}
            </div>

            {/* Elevator toggle row */}
            <div
              onClick={() => set({ useElevComp: !fc.useElevComp })}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer transition-all border ${
                fc.useElevComp
                  ? 'border-[#ef4444]/40 bg-[#ef4444]/8'
                  : 'border-[#30363d] hover:border-[#ef4444]/20'
              }`}
            >
              <div className={`relative w-9 h-5 rounded-full shrink-0 transition-colors ${
                fc.useElevComp ? 'bg-[#ef4444]' : 'bg-[#21262d]'
              }`}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                  fc.useElevComp ? 'translate-x-4' : 'translate-x-0.5'
                }`} />
              </div>
              <div className="min-w-0 flex-1">
                <div className={`flex items-center gap-1 text-xs font-medium ${fc.useElevComp ? 'text-[#ef4444]' : 'text-[#484f58]'}`}>
                  Elevator compensation
                  <Tip text="When flaps deploy, the wing produces more lift aft and the nose tends to pitch up. This mix automatically adds a small nose-down elevator input to keep the plane flying straight. Set per stage — usually −5% to −20% depending on flap size." side="top" />
                </div>
                <div className="text-[10px] text-[#8b949e]">
                  {fc.useElevComp ? 'Nose-down trim applied per stage' : 'Off — elevator untouched'}
                </div>
              </div>
              {fc.useElevComp && (
                <select
                  value={fc.elevCh}
                  onChange={(e) => { e.stopPropagation(); set({ elevCh: Number(e.target.value) }) }}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-[#0d1117] border rounded-lg px-2 py-1 text-xs focus:outline-none shrink-0"
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
                    : 'border-[#30363d] hover:border-[#a855f7]/20'
                }`}
              >
                <div className={`relative w-9 h-5 rounded-full shrink-0 transition-colors ${
                  fc.useAilCamber ? 'bg-[#a855f7]' : 'bg-[#21262d]'
                }`}>
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                    fc.useAilCamber ? 'translate-x-4' : 'translate-x-0.5'
                  }`} />
                </div>
                <div className="min-w-0">
                  <div className={`flex items-center gap-1 text-xs font-medium ${fc.useAilCamber ? 'text-[#a855f7]' : 'text-[#484f58]'}`}>
                    Aileron mix
                    <Tip text="Mixes the flap position into the aileron channel. Positive % = flapperons (ailerons droop down with flaps, adding camber and lift). Negative % = crow (ailerons rise, killing lift for steep landings). You keep full roll control either way." side="top" />
                  </div>
                  <div className="text-[10px] text-[#8b949e]">
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
          <span className="text-[10px] text-[#8b949e] self-center">Quick presets:</span>
          {/* No-flap planes first */}
          <div className="w-full text-[10px] text-[#484f58] uppercase tracking-wider font-semibold pt-1">
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
              className="px-3 py-1.5 rounded-lg border border-[#30363d] hover:border-[#3fb950]
                text-[#8b949e] hover:text-[#3fb950] text-xs transition-all"
            >
              {label}
            </button>
          ))}

          {/* Planes with actual flap surfaces */}
          <div className="w-full text-[10px] text-[#484f58] uppercase tracking-wider font-semibold pt-2">
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
              className="px-3 py-1.5 rounded-lg border border-[#30363d] hover:border-[#2563eb]
                text-[#8b949e] hover:text-[#2563eb] text-xs transition-all"
            >
              {label}
            </button>
          ))}
        </div>

        {/* Per-stage editor */}
        <div className="space-y-3">
          <div className="text-[#e6edf3] text-sm font-semibold">Stage Details</div>
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
                    className="bg-transparent border-b border-transparent hover:border-[#30363d]
                      focus:border-current text-[#e6edf3] font-semibold text-sm px-1 focus:outline-none w-24"
                    style={{ borderColor: `${color}40` }}
                  />
                  <span className="text-[10px] ml-auto" style={{ color }}>
                    Stage {s.id} of {fc.stages}
                  </span>
                </div>

                {/* Sliders */}
                <div className="px-4 py-3 space-y-2.5 bg-[#0d1117]">
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
                      color={s.ailCamber < 0 ? '#a855f7' : '#3fb950'}
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
          <div className="rounded-xl bg-[#0d1117] border border-[#3fb950]/30 p-3 text-[11px] space-y-1">
            <div className="text-[#3fb950] font-semibold text-xs mb-1.5">Flapperons (+ positive aileron)</div>
            <div className="text-[#8b949e]">Both ailerons droop <span className="text-[#e6edf3]">down</span> together as flaps extend — adds camber across the full wingspan. Roll authority is maintained (differential still works while drooped).</div>
            <div className="text-[#8b949e] mt-1">Best for: trainers, warbirds, scale aircraft wanting smooth lift increase without separate flap servos.</div>
          </div>
          <div className="rounded-xl bg-[#0d1117] border border-[#a855f7]/30 p-3 text-[11px] space-y-1">
            <div className="text-[#a855f7] font-semibold text-xs mb-1.5">Crow / Butterfly (− negative aileron)</div>
            <div className="text-[#8b949e]">Flaps go <span className="text-[#e6edf3]">down</span>, ailerons go <span className="text-[#e6edf3]">up</span> — the opposite of flapperons. Destroys lift, creates massive drag. Think air brakes.</div>
            <div className="text-[#8b949e] mt-1">Best for: gliders, DLGs, and sailplanes needing steep spot landings without gaining speed on final.</div>
          </div>
        </div>

        <div className="rounded-xl bg-[#0d1117] border border-[#30363d] p-4 text-[11px] text-[#8b949e] space-y-1.5">
          <div className="text-[#e6edf3] font-semibold text-xs mb-1">How it works in EdgeTX</div>
          <div><span className="text-[#e6edf3]">Slider source (RS/LS):</span> A staircase custom curve snaps the input to your defined stage positions — one smooth lever, multiple distinct outputs.</div>
          <div><span className="text-[#e6edf3]">Elevator comp:</span> Additive mix on the elevator channel. Negative = nose-down trim, counteracts pitch-up moment when flaps deploy.</div>
          <div><span className="text-[#e6edf3]">Aileron mix:</span> Positive values = flapperons (ailerons droop with flaps). Negative values = crow (ailerons rise as flaps drop). You can mix both within a preset — e.g. small positive droop on Stage 2, large negative crow on Stage 4.</div>
          <div><span className="text-[#e6edf3]">Glider reflex:</span> Negative aileron on Stage 1 = trailing edge rises — reduces drag and camber for high-speed passes. Positive on Stage 4 = full thermal camber.</div>
        </div>
      </div>
    )
  }

  // ── Advanced Mixes tab ──
  const renderMixes = (): JSX.Element => (
    <div className="py-4 space-y-4">
      {/* Preset tiles */}
      <div className="px-6">
        <p className="text-[#8b949e] text-xs mb-3">
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
              className="text-left p-3 rounded-xl border border-[#30363d] hover:border-[#2563eb] hover:bg-[#21262d] transition-all group"
            >
              <div className="text-[#e6edf3] text-xs font-semibold group-hover:text-[#2563eb] transition-colors">{preset.label}</div>
              <div className="text-[#8b949e] text-[10px] mt-0.5">{preset.desc}</div>
              <div className="text-[#2563eb] text-[10px] mt-1 font-mono">CH{preset.outputCh} {preset.weight > 0 ? '+' : ''}{preset.weight}% of {preset.source}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Current mixes */}
      {advMixes.length > 0 && (
        <div className="px-6">
          <div className="text-[#8b949e] text-[10px] font-semibold uppercase tracking-wider mb-2">Active Advanced Mixes</div>
          <div className="space-y-2">
            {advMixes.map((mix) => (
              <div key={mix.id} className="flex items-center gap-3 p-3 rounded-xl bg-[#161b22] border border-[#30363d]">
                <div className="w-16 text-center">
                  <div className="flex items-center justify-center gap-1 text-[#2563eb] text-[10px] font-semibold uppercase">
                    Out CH <Tip text="The channel this mix outputs to. It adds to (or replaces) whatever the primary source is already sending to that channel." side="top" />
                  </div>
                  <select
                    value={mix.outputCh}
                    onChange={(e) => updateAdvMix(mix.id, { outputCh: Number(e.target.value) })}
                    className="mt-1 bg-[#0d1117] border border-[#30363d] rounded px-1.5 py-1 text-[#e6edf3] text-xs w-full focus:outline-none"
                  >
                    {[1,2,3,4,5,6,7,8].map((n) => <option key={n} value={n}>CH{n}</option>)}
                  </select>
                </div>

                <input
                  type="text"
                  value={mix.label}
                  onChange={(e) => updateAdvMix(mix.id, { label: e.target.value })}
                  className="bg-transparent border-b border-[#30363d] focus:border-[#2563eb] text-[#e6edf3]
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
                    className="bg-[#0d1117] border border-[#30363d] rounded-lg px-2 py-1.5 text-[#e6edf3] text-xs
                      focus:outline-none focus:border-[#2563eb] w-24"
                  >
                    <option value="Add">Add</option>
                    <option value="Multiply">Multiply</option>
                    <option value="Replace">Replace</option>
                  </select>
                  <Tip text="Add: this mix's output is added on top of the channel's existing value. Multiply: scales the existing value by this mix (useful for differential). Replace: ignores the primary source and uses only this mix." side="top" />
                </div>

                <button
                  onClick={() => removeAdvMix(mix.id)}
                  className="text-[#484f58] hover:text-[#ef4444] transition-colors text-lg leading-none px-1"
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
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-[#30363d]
            hover:border-[#2563eb] text-[#8b949e] hover:text-[#2563eb] text-sm transition-all"
        >
          + Add Custom Mix
        </button>
      </div>
    </div>
  )

  // ── Voice & Switches tab ──
  const renderVoice = (): JSX.Element => {
    const sounds = sdInfo?.soundFiles ?? []
    return (
      <div className="py-4 px-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-[#8b949e] text-xs max-w-lg">
            Assign a voice callout to each switch position. The radio plays the .wav file from the SOUNDS/ folder
            whenever you flip that switch. Good for announcing flight modes, safe on/off, and gear up/down.
          </p>
          {sounds.length === 0 && sdDrive && (
            <span className="text-[#f59e0b] text-[11px] bg-[#f59e0b]/10 border border-[#f59e0b]/30 rounded-lg px-2 py-1 shrink-0">
              No .wav files found on SD card
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          {switchVoice.map((sv) => {
            const color = SWITCH_COLORS[sv.switchId] ?? '#8b949e'
            return (
              <div key={sv.switchId} className="rounded-xl border border-[#30363d] overflow-hidden">
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
                  <span className="text-[#e6edf3] text-sm font-semibold">Switch {sv.switchId}</span>
                </div>

                {/* Position rows */}
                <div className="divide-y divide-[#21262d]">
                  {(['up', 'mid', 'down'] as const).map((pos) => {
                    const posLabel = pos === 'up' ? '↑ Up' : pos === 'mid' ? '↔ Mid' : '↓ Down'
                    return (
                      <div key={pos} className="flex items-center gap-3 px-4 py-2">
                        <span className="flex items-center gap-1 text-[#8b949e] text-xs w-12 shrink-0">
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
                        {sounds.length > 0 ? (
                          <select
                            value={sv.positions[pos]}
                            onChange={(e) => updateSwitchVoice(sv.switchId, pos, e.target.value)}
                            className="flex-1 bg-[#0d1117] border border-[#30363d] rounded-lg px-2 py-1.5
                              text-[#e6edf3] text-xs focus:outline-none focus:border-[#2563eb] transition-colors"
                          >
                            <option value="">— No callout —</option>
                            {sounds.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={sv.positions[pos]}
                            onChange={(e) => updateSwitchVoice(sv.switchId, pos, e.target.value)}
                            placeholder="sound filename (no .wav)"
                            className="flex-1 bg-[#0d1117] border border-[#30363d] rounded-lg px-2 py-1.5
                              text-[#e6edf3] text-xs placeholder-[#484f58] focus:outline-none focus:border-[#2563eb]"
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

        <div className="rounded-xl bg-[#0d1117] border border-[#30363d] p-4 text-[11px] text-[#8b949e] space-y-1">
          <div className="text-[#e6edf3] font-semibold text-xs mb-2">How voice callouts work</div>
          <div>1. Sound files (.wav) must be in SOUNDS/en/ on your radio SD card.</div>
          <div>2. The radio announces the assigned file name when the switch reaches that position.</div>
          <div>3. EdgeTX ships with many default sounds — check SOUNDS/en/ on your SD card for the list.</div>
          <div>4. Common useful ones: <span className="text-[#e6edf3] font-mono">flap</span>, <span className="text-[#e6edf3] font-mono">gear_dn</span>, <span className="text-[#e6edf3] font-mono">lowbat</span>, <span className="text-[#e6edf3] font-mono">safe</span></div>
        </div>
      </div>
    )
  }

  // ── SD Card Files tab ──
  const renderSdFiles = (): JSX.Element => {
    if (!sdDrive) {
      return (
        <div className="flex items-center justify-center h-48">
          <p className="text-[#484f58] text-sm">Plug in TX16S in USB Storage mode to browse files</p>
        </div>
      )
    }
    if (!sdInfo) {
      return (
        <div className="flex items-center justify-center h-48">
          <p className="text-[#8b949e] text-sm">Scanning SD card...</p>
        </div>
      )
    }

    const sections = [
      {
        title: 'Model Files (YAML)', icon: '📄',
        files: sdInfo.yamlModelFiles,
        empty: sdInfo.hasModels ? 'No YAML model files — models are stored in internal flash' : 'No MODELS/ directory found',
        note: sdInfo.hasYamlModels
          ? 'YAML models found — FlightDeck can read these in a future update'
          : 'Models in internal flash: changes go through the Lua script approach',
      },
      {
        title: 'Voice / Sound Files (SOUNDS/)', icon: '🔊',
        files: sdInfo.soundFiles,
        empty: 'No .wav files found in SOUNDS/ or SOUNDS/en/',
        note: 'These are the files you can assign in Voice & Switches',
      },
      {
        title: 'Lua Scripts (SCRIPTS/TOOLS/)', icon: '📜',
        files: sdInfo.scriptFiles,
        empty: 'No scripts in SCRIPTS/TOOLS/',
        note: 'FDCONFIG.lua appears here after you push to radio',
      },
      {
        title: 'FlightDeck Data (MODELS/DSMDATA/)', icon: '💾',
        files: sdInfo.dsmdataFiles,
        empty: 'No FlightDeck data files yet',
        note: 'AS3X gain profiles saved by FlightDeck',
      },
    ]

    return (
      <div className="py-4 px-6 space-y-5">
        {sections.map((sec) => (
          <div key={sec.title}>
            <div className="flex items-center gap-2 mb-2">
              <span>{sec.icon}</span>
              <span className="text-[#e6edf3] text-sm font-semibold">{sec.title}</span>
              {sec.files.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded bg-[#21262d] text-[#8b949e] text-[10px]">
                  {sec.files.length}
                </span>
              )}
            </div>
            {sec.files.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 mb-1">
                {sec.files.map((f) => (
                  <span key={f} className="px-2 py-1 rounded-lg bg-[#161b22] border border-[#30363d] text-[#e6edf3] text-[11px] font-mono">
                    {f}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[#484f58] text-xs italic mb-1">{sec.empty}</p>
            )}
            <p className="text-[#8b949e] text-[10px]">{sec.note}</p>
          </div>
        ))}

        {sdScanError && (
          <div className="text-[#ef4444] text-xs bg-[#2d0f0f] border border-[#ef4444]/30 rounded-lg px-3 py-2">
            Scan error: {sdScanError}
          </div>
        )}
      </div>
    )
  }

  // ── Root render ──
  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#0d1117]">
      {/* Page title — always shows which model is active */}
      <div className="px-6 pt-4 pb-0 shrink-0 flex items-center gap-3 border-b border-[#30363d] pb-4">
        <div className="w-9 h-9 rounded-lg bg-[#2563eb20] border border-[#2563eb40] flex items-center justify-center text-base shrink-0">
          📻
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[#8b949e]">Radio Studio</div>
          {modelNameProp ? (
            /* Embedded inside a model — name is locked */
            <div className="text-[#e6edf3] font-bold text-base leading-tight">{modelNameProp}</div>
          ) : (
            /* Sidebar — show model picker */
            allModels.length > 0 ? (
              <select
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                className="bg-transparent text-[#e6edf3] font-bold text-base leading-tight border-none outline-none cursor-pointer mt-0.5 pr-2"
              >
                {allModels.map((m) => (
                  <option key={m.id} value={m.name} className="bg-[#161b22] text-[#e6edf3]">
                    {m.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="text-[#e6edf3] font-bold text-base leading-tight">Radio Studio</div>
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
        {activeTab === 'sdfiles' && renderSdFiles()}
      </div>

      {/* Bottom push-to-radio bar (always visible) */}
      <div className="shrink-0 px-6 py-3 border-t border-[#30363d] bg-[#161b22] flex items-center justify-between gap-4">
        <div className="text-[#8b949e] text-xs">
          {channels.filter((c) => c.source && c.source !== '---').length} channels ·{' '}
          {surfaceRates.length} rate surfaces ·{' '}
          {flapConfig.enabled ? `${flapConfig.stages} flap stages · ` : ''}
          {advMixes.length} mixes ·{' '}
          {switchVoice.flatMap((sv) => [sv.positions.up, sv.positions.mid, sv.positions.down]).filter(Boolean).length} voice
        </div>
        <button
          onClick={pushToRadio}
          disabled={!sdDrive || writing}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            sdDrive && !writing
              ? 'bg-[#2563eb] hover:bg-[#1d4ed8] text-white shadow-lg shadow-blue-900/30'
              : 'bg-[#21262d] text-[#484f58] cursor-not-allowed'
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
