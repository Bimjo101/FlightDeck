import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import path from 'path'
import yaml from 'js-yaml'

export interface SdCardInfo {
  hasModels: boolean
  hasYamlModels: boolean
  yamlModelFiles: string[]
  soundFiles: string[]
  scriptFiles: string[]
  dsmdataFiles: string[]
}

export interface ChannelConfig {
  ch: number         // 1-indexed
  label: string
  source: string     // 'Ail', 'Ele', 'Thr', 'Rud', 'SB', 'SC', etc.
  weight: number     // -100 to 100
  offset: number
  reversed: boolean
  expo: number       // 0-100 percent expo
  name: string       // short mixer name shown on radio
}

export interface AdvancedMix {
  id: string
  label: string
  outputCh: number   // 1-indexed output channel
  source: string
  weight: number
  switch?: string    // switch condition (blank = always)
  mltpx: 'Add' | 'Multiply' | 'Replace'
}

export interface SwitchVoice {
  switchId: string   // 'SA' | 'SB' | 'SC' | 'SD' | 'SE' | 'SF'
  positions: {
    up: string    // sound filename without .wav
    mid: string
    down: string
  }
}

export interface RateLine {
  rate: number    // 0-100 percent
  expo: number    // 0-100 percent
}

export interface SurfaceRates {
  id: string
  label: string       // 'Aileron', 'Elevator', 'Rudder'
  inputSource: string // 'Ail', 'Ele', 'Rud'
  inputIdx: number    // 0-indexed EdgeTX input number
  switchId: string    // 'SA' | 'SB' | 'SC' | 'SD' | 'SE' | 'SF'
  high: RateLine
  mid: RateLine
  low: RateLine
  threePos: boolean   // true = 3-position switch (High/Mid/Low), false = 2-position (High/Low)
}

export interface RadioConfig {
  modelName: string
  channels: ChannelConfig[]
  advancedMixes: AdvancedMix[]
  switchVoice: SwitchVoice[]
  surfaceRates?: SurfaceRates[]
}

export function scanSdCard(sdDrive: string): SdCardInfo {
  const base = sdDrive + '\\'
  const result: SdCardInfo = {
    hasModels: false,
    hasYamlModels: false,
    yamlModelFiles: [],
    soundFiles: [],
    scriptFiles: [],
    dsmdataFiles: []
  }

  // Check MODELS/
  const modelsDir = path.join(base, 'MODELS')
  if (existsSync(modelsDir)) {
    result.hasModels = true
    try {
      const files = readdirSync(modelsDir)
      const ymls = files.filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
      result.yamlModelFiles = ymls
      result.hasYamlModels = ymls.length > 0
    } catch { /* read error */ }
  }

  // Check MODELS/DSMDATA/
  const dsmdataDir = path.join(base, 'MODELS', 'DSMDATA')
  if (existsSync(dsmdataDir)) {
    try {
      result.dsmdataFiles = readdirSync(dsmdataDir).filter((f) => f.endsWith('.json'))
    } catch { /* read error */ }
  }

  // Check SOUNDS/en/ then SOUNDS/
  const soundsDirs = [
    path.join(base, 'SOUNDS', 'en'),
    path.join(base, 'SOUNDS', 'EN'),
    path.join(base, 'SOUNDS'),
  ]
  for (const dir of soundsDirs) {
    if (existsSync(dir)) {
      try {
        const wavs = readdirSync(dir)
          .filter((f) => f.toLowerCase().endsWith('.wav'))
          .map((f) => f.replace(/\.wav$/i, ''))
        result.soundFiles = wavs
        break
      } catch { /* read error */ }
    }
  }

  // Check SCRIPTS/TOOLS/
  const scriptsDir = path.join(base, 'SCRIPTS', 'TOOLS')
  if (existsSync(scriptsDir)) {
    try {
      result.scriptFiles = readdirSync(scriptsDir).filter((f) => f.endsWith('.lua'))
    } catch { /* read error */ }
  }

  return result
}

// Build a comprehensive EdgeTX Lua configuration script
export function buildConfigScript(config: RadioConfig): string {
  const { modelName, channels, advancedMixes, switchVoice } = config

  const lines: string[] = []
  lines.push(`-- FlightDeck Configuration Studio`)
  lines.push(`-- Generated for: ${modelName}`)
  lines.push(`-- Run from TOOLS menu with this model loaded`)
  lines.push(`-- This script configures all channels, mixes, and voice callouts`)
  lines.push(``)
  lines.push(`local DONE = false`)
  lines.push(`local ERRORS = {}`)
  lines.push(`local PAGE = "config"  -- "config" | "done"`)
  lines.push(``)

  // Resolve all switch/source field IDs dynamically
  const allSources = new Set<string>()
  channels.forEach((c) => allSources.add(c.source.toLowerCase()))
  advancedMixes.forEach((m) => allSources.add(m.source.toLowerCase()))
  const switchIds = ['sa', 'sb', 'sc', 'sd', 'se', 'sf', 'ls', 'rs', 's1', 's2']
  const stickIds = ['ail', 'ele', 'thr', 'rud']
  const allNeeded = [...switchIds, ...stickIds, 'max']

  lines.push(`-- Resolve input source IDs`)
  lines.push(`local SRC = {}`)
  for (const src of allNeeded) {
    lines.push(`SRC["${src}"] = getFieldInfo("${src}") and getFieldInfo("${src}").id or 0`)
  }
  lines.push(``)

  lines.push(`local function getSrc(name)`)
  lines.push(`  local key = string.lower(name)`)
  lines.push(`  if SRC[key] then return SRC[key] end`)
  lines.push(`  local info = getFieldInfo(key)`)
  lines.push(`  return info and info.id or 0`)
  lines.push(`end`)
  lines.push(``)

  lines.push(`local function applyConfig()`)
  lines.push(`  local ok = true`)
  lines.push(``)

  // Channel mixes (primary channels)
  lines.push(`  -- === PRIMARY CHANNEL MIXES ===`)
  for (const ch of channels) {
    if (!ch.source || ch.source === '' || ch.source === '---') continue
    const idx = ch.ch - 1  // 0-indexed
    const w = ch.reversed ? -Math.abs(ch.weight) : Math.abs(ch.weight)
    lines.push(``)
    lines.push(`  -- CH${ch.ch}: ${ch.label} ← ${ch.source}`)
    lines.push(`  while model.getMixesCount(${idx}) > 0 do model.deleteMix(${idx}, 0) end`)
    lines.push(`  if not model.insertMix(${idx}, 0, {`)
    lines.push(`    srcRaw=getSrc("${ch.source}"), weight=${w}, offset=${ch.offset},`)
    lines.push(`    switch=0, speedUp=0, speedDown=0, delayUp=0, delayDown=0,`)
    lines.push(`    mode=0, curveType=0, curveValue=0, noExpo=false, name="${ch.name || ch.label.substring(0, 6)}"`)
    lines.push(`  }) then`)
    lines.push(`    table.insert(ERRORS, "CH${ch.ch} mix insert failed")`)
    lines.push(`    ok = false`)
    lines.push(`  end`)
  }

  // Advanced mixes (additive/multiplicative)
  if (advancedMixes.length > 0) {
    lines.push(``)
    lines.push(`  -- === ADVANCED MIXES ===`)
    for (const mix of advancedMixes) {
      const idx = mix.outputCh - 1
      const mltpxCode = mix.mltpx === 'Replace' ? 0 : mix.mltpx === 'Multiply' ? 1 : 2  // Replace=0 Multiply=1 Add=2
      lines.push(``)
      lines.push(`  -- ${mix.label}: CH${mix.outputCh} += ${mix.weight}% of ${mix.source}`)
      lines.push(`  local cnt${mix.id} = model.getMixesCount(${idx})`)
      lines.push(`  model.insertMix(${idx}, cnt${mix.id}, {`)
      lines.push(`    srcRaw=getSrc("${mix.source}"), weight=${mix.weight}, offset=0,`)
      lines.push(`    switch=0, mltpx=${mltpxCode}, speedUp=0, speedDown=0, delayUp=0, delayDown=0,`)
      lines.push(`    mode=0, curveType=0, curveValue=0, noExpo=false, name="${mix.label.substring(0, 6)}"`)
      lines.push(`  })`)
    }
  }

  // Voice/switch special functions
  const voiceAssignments: { sfIdx: number; switchName: string; position: string; sound: string }[] = []
  let sfIdx = 0
  for (const sv of switchVoice) {
    const sw = sv.switchId.toLowerCase()
    if (sv.positions.up) voiceAssignments.push({ sfIdx: sfIdx++, switchName: sw, position: 'up', sound: sv.positions.up })
    if (sv.positions.mid) voiceAssignments.push({ sfIdx: sfIdx++, switchName: sw, position: 'mid', sound: sv.positions.mid })
    if (sv.positions.down) voiceAssignments.push({ sfIdx: sfIdx++, switchName: sw, position: 'down', sound: sv.positions.down })
  }

  if (voiceAssignments.length > 0) {
    lines.push(``)
    lines.push(`  -- === VOICE / SWITCH CALLOUTS ===`)
    lines.push(`  -- Function 10 = PLAY_TRACK in EdgeTX`)
    lines.push(`  -- Switch encoding: positive = up/activated, negative = down/reversed`)
    for (const va of voiceAssignments) {
      const posComment = va.position === 'up' ? 'switch UP' : va.position === 'mid' ? 'switch MID' : 'switch DOWN'
      lines.push(``)
      lines.push(`  -- SF${va.sfIdx}: ${va.switchName.toUpperCase()} ${posComment} → "${va.sound}"`)
      lines.push(`  local sw${va.sfIdx}Info = getFieldInfo("${va.switchName}")`)
      lines.push(`  if sw${va.sfIdx}Info then`)
      lines.push(`    model.setCustomFunction(${va.sfIdx}, {`)
      lines.push(`      switch=sw${va.sfIdx}Info.id, func=10, param="${va.sound}",`)
      lines.push(`      active=0, enabled=1`)
      lines.push(`    })`)
      lines.push(`  end`)
    }
  }

  lines.push(``)
  // Rates / expo (input lines)
  const surfaceRates = config.surfaceRates ?? []
  if (surfaceRates.length > 0) {
    lines.push(``)
    lines.push(`  -- === RATES & EXPO (Input lines) ===`)
    lines.push(`  -- Each surface input is replaced with switch-triggered rate lines`)
    for (const sr of surfaceRates) {
      const sw = sr.switchId.toLowerCase()
      const src = sr.inputSource.toLowerCase()
      const idx = sr.inputIdx
      lines.push(``)
      lines.push(`  -- ${sr.label} rates on switch ${sr.switchId}`)
      lines.push(`  local ${src}Info = getFieldInfo("${src}")`)
      lines.push(`  local ${sw}For${src} = getFieldInfo("${sw}")`)
      lines.push(`  if ${src}Info and ${sw}For${src} then`)
      lines.push(`    while model.getInputsCount(${idx}) > 0 do model.deleteInput(${idx}, 0) end`)
      // High rate — switch UP (position 0)
      lines.push(`    model.insertInput(${idx}, 0, {`)
      lines.push(`      name="High", source=${src}Info.id, weight=${sr.high.rate}, offset=0,`)
      lines.push(`      switch=${sw}For${src}.id, carryTrim=1,`)
      lines.push(`      curve={ type=0, value=${sr.high.expo} }`)
      lines.push(`    })`)
      if (sr.threePos) {
        // Mid rate — switch MID (position 1) — use id+1 for 3-pos switch mid
        lines.push(`    model.insertInput(${idx}, 1, {`)
        lines.push(`      name="Mid", source=${src}Info.id, weight=${sr.mid.rate}, offset=0,`)
        lines.push(`      switch=${sw}For${src}.id + 1, carryTrim=1,`)
        lines.push(`      curve={ type=0, value=${sr.mid.expo} }`)
        lines.push(`    })`)
        // Low rate — switch DOWN (position 2)
        lines.push(`    model.insertInput(${idx}, 2, {`)
        lines.push(`      name="Low", source=${src}Info.id, weight=${sr.low.rate}, offset=0,`)
        lines.push(`      switch=${sw}For${src}.id + 2, carryTrim=1,`)
        lines.push(`      curve={ type=0, value=${sr.low.expo} }`)
        lines.push(`    })`)
      } else {
        // 2-pos switch: Low rate — switch DOWN (position 1)
        lines.push(`    model.insertInput(${idx}, 1, {`)
        lines.push(`      name="Low", source=${src}Info.id, weight=${sr.low.rate}, offset=0,`)
        lines.push(`      switch=${sw}For${src}.id + 1, carryTrim=1,`)
        lines.push(`      curve={ type=0, value=${sr.low.expo} }`)
        lines.push(`    })`)
      }
      lines.push(`  end`)
    }
  }

  lines.push(``)
  lines.push(`  return ok`)
  lines.push(`end`)
  lines.push(``)

  // Display function
  lines.push(`local function run(event, touchState)`)
  lines.push(`  if not DONE then`)
  lines.push(`    local ok = applyConfig()`)
  lines.push(`    DONE = true`)
  lines.push(`    PAGE = ok and "done" or "error"`)
  lines.push(`  end`)
  lines.push(``)
  lines.push(`  lcd.clear()`)
  lines.push(`  lcd.drawText(10, 5, "FlightDeck Studio", BOLD)`)
  lines.push(`  lcd.drawText(10, 28, "Model: ${modelName}", SMLSIZE)`)
  lines.push(``)
  lines.push(`  if PAGE == "done" then`)
  lines.push(`    lcd.drawText(10, 55, "CONFIGURED OK!", BOLD)`)
  lines.push(`    lcd.drawText(10, 80, "${channels.filter((c) => c.source && c.source !== '---').length} channels", SMLSIZE)`)
  lines.push(`    lcd.drawText(10, 96, "${advancedMixes.length} advanced mixes", SMLSIZE)`)
  lines.push(`    lcd.drawText(10, 112, "${voiceAssignments.length} voice callouts", SMLSIZE)`)
  lines.push(`    lcd.drawText(10, 140, "Verify: MIXER menu", SMLSIZE)`)
  lines.push(`    lcd.drawText(10, 156, "Verify: SPECIAL FUNC menu", SMLSIZE)`)
  lines.push(`  else`)
  lines.push(`    lcd.drawText(10, 55, "ERRORS:", BOLD)`)
  lines.push(`    for i, err in ipairs(ERRORS) do`)
  lines.push(`      lcd.drawText(10, 55 + i*16, err, SMLSIZE)`)
  lines.push(`    end`)
  lines.push(`  end`)
  lines.push(``)
  lines.push(`  lcd.drawText(10, 248, "Press RTN to exit", SMLSIZE)`)
  lines.push(`  if event == EVT_VIRTUAL_EXIT or event == EVT_VIRTUAL_ENTER then`)
  lines.push(`    return 1`)
  lines.push(`  end`)
  lines.push(`  return 0`)
  lines.push(`end`)
  lines.push(``)
  lines.push(`return { run=run }`)

  return lines.join('\n')
}

// ─── YAML Model Direct Read / Write ──────────────────────────────────────────
// EdgeTX 2.8+ stores models as YAML files in MODELS/ on the SD card.
// When that's the case we skip the Lua script entirely and patch the file directly.

export interface YamlMixEntry {
  name?: string
  source?: string
  weight?: number
  offset?: number
  switch?: string
  mltpx?: string
  curve?: { type?: string; value?: number }
  delayDown?: number
  delayUp?: number
  speedDown?: number
  speedUp?: number
  carryTrim?: boolean
}

export interface YamlChannelMixes {
  output: number       // 0-indexed channel number
  name?: string
  mixes?: YamlMixEntry[]
}

export interface YamlSpecialFunction {
  func?: string
  switch?: string
  repeatMode?: string
  enabled?: boolean
  param?: string | number
}

export interface EdgeTXModelYaml {
  semver?: string
  header?: { name?: string; [k: string]: unknown }
  mixes?: YamlChannelMixes[]
  specialFunctions?: YamlSpecialFunction[]
  [k: string]: unknown
}

export function readModelYaml(sdDrive: string, filename: string): { data: EdgeTXModelYaml | null; raw: string; error?: string } {
  const filePath = path.join(sdDrive + '\\', 'MODELS', filename)
  try {
    const raw = readFileSync(filePath, 'utf-8')
    const data = yaml.load(raw) as EdgeTXModelYaml
    return { data, raw }
  } catch (err) {
    return { data: null, raw: '', error: String(err) }
  }
}

// Convert FlightDeck ChannelConfig to EdgeTX YAML mix entry
function toYamlMix(ch: ChannelConfig): YamlMixEntry {
  const w = ch.reversed ? -Math.abs(ch.weight) : Math.abs(ch.weight)
  const entry: YamlMixEntry = {
    name: ch.name || ch.label.substring(0, 6),
    source: ch.source,
    weight: w,
    offset: ch.offset,
    switch: '',
    mltpx: 'Add',
    delayDown: 0,
    delayUp: 0,
    speedDown: 0,
    speedUp: 0,
    carryTrim: true,
  }
  if (ch.expo > 0) {
    entry.curve = { type: 'Expo', value: ch.expo }
  }
  return entry
}

// Encode switch position for EdgeTX YAML special functions
// SA/SB/SC/SD/SE/SF — position 0=up, 1=mid, 2=down (3-pos) or 0=up, 1=down (2-pos)
function encodeSwitch(switchId: string, position: 'up' | 'mid' | 'down'): string {
  const pos = position === 'up' ? 0 : position === 'mid' ? 1 : 2
  return `${switchId}${pos}`
}

export function applyConfigToYaml(modelData: EdgeTXModelYaml, config: RadioConfig): EdgeTXModelYaml {
  // Deep clone via JSON so we don't mutate the original
  const out = JSON.parse(JSON.stringify(modelData)) as EdgeTXModelYaml

  // ── Primary channel mixes ──
  if (!Array.isArray(out.mixes)) out.mixes = []

  for (const ch of config.channels) {
    if (!ch.source || ch.source === '---') continue
    const idx = ch.ch - 1  // 0-indexed

    // Find or create the channel object
    let chanObj = out.mixes.find((m) => m.output === idx)
    if (!chanObj) {
      chanObj = { output: idx, name: '', mixes: [] }
      out.mixes.push(chanObj)
    }
    // Replace the first (primary) mix for this channel
    const primary = toYamlMix(ch)
    if (!Array.isArray(chanObj.mixes)) chanObj.mixes = []
    chanObj.mixes[0] = primary
  }

  // ── Advanced mixes (append to existing primary) ──
  for (const mix of config.advancedMixes) {
    const idx = mix.outputCh - 1
    let chanObj = out.mixes.find((m) => m.output === idx)
    if (!chanObj) {
      chanObj = { output: idx, name: '', mixes: [] }
      out.mixes.push(chanObj)
    }
    if (!Array.isArray(chanObj.mixes)) chanObj.mixes = []
    const advEntry: YamlMixEntry = {
      name: mix.label.substring(0, 6),
      source: mix.source,
      weight: mix.weight,
      offset: 0,
      switch: '',
      mltpx: mix.mltpx,
      delayDown: 0, delayUp: 0, speedDown: 0, speedUp: 0, carryTrim: false,
    }
    chanObj.mixes.push(advEntry)
  }

  // Sort mixes array by output channel number
  out.mixes.sort((a, b) => a.output - b.output)

  // ── Surface rates (inputs section) ──
  if (config.surfaceRates && config.surfaceRates.length > 0) {
    if (!Array.isArray((out as any).inputs)) (out as any).inputs = []
    const inputs: any[] = (out as any).inputs

    for (const sr of config.surfaceRates) {
      const idx = sr.inputIdx
      // Find or create this input entry
      let inputObj = inputs.find((inp: any) => inp.input === idx)
      if (!inputObj) {
        inputObj = { input: idx, name: sr.label, inputs: [] }
        inputs.push(inputObj)
      }
      inputObj.name = sr.label
      const lines: any[] = []

      const makeInputLine = (name: string, sw: string, rate: number, expo: number) => ({
        name,
        source: sr.inputSource,
        weight: rate,
        offset: 0,
        switch: sw,
        curve: expo > 0 ? { type: 'Expo', value: expo } : { type: 'Diff', value: 0 },
        carryTrim: true,
      })

      // EdgeTX switch position encoding: SA0=up, SA1=mid, SA2=down
      lines.push(makeInputLine('High', `${sr.switchId}0`, sr.high.rate, sr.high.expo))
      if (sr.threePos) {
        lines.push(makeInputLine('Mid', `${sr.switchId}1`, sr.mid.rate, sr.mid.expo))
        lines.push(makeInputLine('Low', `${sr.switchId}2`, sr.low.rate, sr.low.expo))
      } else {
        lines.push(makeInputLine('Low', `${sr.switchId}1`, sr.low.rate, sr.low.expo))
      }

      inputObj.inputs = lines
    }

    inputs.sort((a: any, b: any) => a.input - b.input)
  }

  // ── Special functions — voice callouts ──
  if (!Array.isArray(out.specialFunctions)) out.specialFunctions = []

  // Remove existing FlightDeck-managed SF entries (PlayTrack ones we manage)
  // We identify them by func=PlayTrack — preserve any other SF types
  const keepSF = out.specialFunctions.filter((sf) =>
    sf.func !== 'PlayTrack' && sf.func !== 'PlaySound'
  )

  const newVoiceSF: YamlSpecialFunction[] = []
  for (const sv of config.switchVoice) {
    const positions: Array<['up' | 'mid' | 'down', string]> = [
      ['up', sv.positions.up],
      ['mid', sv.positions.mid],
      ['down', sv.positions.down],
    ]
    for (const [pos, sound] of positions) {
      if (!sound) continue
      newVoiceSF.push({
        func: 'PlayTrack',
        switch: encodeSwitch(sv.switchId, pos),
        repeatMode: '!',
        enabled: true,
        param: sound,
      })
    }
  }

  out.specialFunctions = [...keepSF, ...newVoiceSF]

  return out
}

export function saveModelYaml(sdDrive: string, filename: string, modelData: EdgeTXModelYaml): { success: boolean; error?: string } {
  const filePath = path.join(sdDrive + '\\', 'MODELS', filename)
  try {
    // Back up original first
    const backupPath = filePath.replace(/\.ya?ml$/i, `.bak.${Date.now()}.yml`)
    const original = readFileSync(filePath, 'utf-8')
    writeFileSync(backupPath, original, 'utf-8')

    const out = yaml.dump(modelData, { lineWidth: -1, indent: 2, quotingType: "'", forceQuotes: false })
    writeFileSync(filePath, out, 'utf-8')
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

// Parse a YAML model back into FlightDeck ChannelConfig[]
export function extractChannelsFromYaml(modelData: EdgeTXModelYaml): ChannelConfig[] {
  const DEFAULT_LABELS = ['Aileron', 'Elevator', 'Throttle', 'Rudder', 'SAFE Select', 'Flap / Gear', 'Aux 1', 'Aux 2']
  const DEFAULT_NAMES = ['AIL', 'ELE', 'THR', 'RUD', 'SAFE', 'FLAP', 'AUX1', 'AUX2']

  return Array.from({ length: 8 }, (_, i) => {
    const chanObj = modelData.mixes?.find((m) => m.output === i)
    const primary = chanObj?.mixes?.[0]

    const source = primary?.source ?? '---'
    const rawWeight = primary?.weight ?? 100
    const reversed = rawWeight < 0
    const weight = Math.abs(rawWeight)
    const expo = primary?.curve?.type === 'Expo' ? (primary.curve.value ?? 0) : 0

    return {
      ch: i + 1,
      label: chanObj?.name?.trim() || DEFAULT_LABELS[i] || `Ch ${i + 1}`,
      source: source || '---',
      weight,
      offset: primary?.offset ?? 0,
      reversed,
      expo,
      name: primary?.name?.trim() || DEFAULT_NAMES[i] || `CH${i + 1}`,
    }
  })
}

export function writeConfigScript(sdDrive: string, config: RadioConfig): { success: boolean; path?: string; error?: string } {
  try {
    const scriptDir = path.join(sdDrive + '\\', 'SCRIPTS', 'TOOLS')
    if (!existsSync(scriptDir)) mkdirSync(scriptDir, { recursive: true })
    const filePath = path.join(scriptDir, 'FDCONFIG.lua')
    const script = buildConfigScript(config)
    writeFileSync(filePath, script, 'utf-8')
    return { success: true, path: filePath }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}
