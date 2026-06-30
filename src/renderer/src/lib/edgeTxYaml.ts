// Generates EdgeTX YAML model files compatible with EdgeTX 2.12.x
// Format verified against real TX16S SD card models (MODELS/model1.yml, model30.yml)

export interface SurfaceRateSet {
  rate: number   // 0-100%
  expo: number   // 0-100%
}

export interface RatesInput {
  id: string
  high: SurfaceRateSet
  mid: SurfaceRateSet
  low: SurfaceRateSet
}

// Kept for UI backward-compat; generator ignores these now
export interface FlapStageInput {
  travel: number
  elevComp: number
}

// Airframe-specific mix configs (from MixWizard)
export interface ElevonMixConfig {
  type: 'elevon'
  weight: number  // 50-100%
}

export interface VTailMixConfig {
  type: 'vtail'
  eleWeight: number
  rudWeight: number
}

export interface DiffThrustMixConfig {
  type: 'diffThrust'
  weight: number    // % of Rud mixed into motor channels
  rightCh: number   // 1-indexed right motor channel
}

export type AirframeMixConfig = ElevonMixConfig | VTailMixConfig | DiffThrustMixConfig

export interface EdgeTxGenConfig {
  modelName: string

  rates: RatesInput[]

  aileronReversed: boolean
  elevatorReversed: boolean
  throttleReversed: boolean
  rudderReversed: boolean

  // Switch assignments (TX16S defaults)
  rateSwitch: string     // 'SA' — 3-pos, low/mid/high rates
  safeSwitch: string     // 'SB' — 3-pos, SAFE/AS3X/Normal
  flapSwitch: string     // 'SE' — 3-pos, flap stages
  gearSwitch: string     // 'LS' — slider

  // Legacy switch fields — kept for UI but not used in generator
  safePosOn:  0|1|2
  safePosOff: 0|1|2
  safePosAsx: 0|1|2
  reverseSwitch: string
  reversePosOn: 0|1

  // Channel assignments (1-indexed)
  aileronCh:  number   // 1
  elevatorCh: number   // 2
  throttleCh: number   // 3
  rudderCh:   number   // 4
  safeCh:     number   // 5
  flapCh:     number   // 6
  gearCh:     number   // 7

  // Legacy flap fields — kept for UI
  flapEnabled: boolean
  flapStages: FlapStageInput[]
  flapElevComp: number

  // Mix wizard results (optional)
  airframeMix?: AirframeMixConfig
  throttleCutSwitch?: string
  throttleCutMode?: 'always' | 'idleGate'
  flapEleComps?: number[] // up-elevator comp per flap stage [0, stage1%, stage2%, ...]
  thrRudMix?:   number   // % right-rudder at full throttle (Thr source)
  revThrustSwitch?: string  // switch ID for reverse thrust (e.g. 'SF')
  flapSlow?: { deploySeconds: number }  // 0 / absent = instant
}

export const DEFAULT_EXPORT_CONFIG: Omit<EdgeTxGenConfig, 'modelName'> = {
  rates: [
    { id: 'ail', high: { rate: 100, expo: 0  }, mid: { rate: 75, expo: 20 }, low: { rate: 50, expo: 35 } },
    { id: 'ele', high: { rate: 100, expo: 0  }, mid: { rate: 75, expo: 25 }, low: { rate: 60, expo: 40 } },
    { id: 'rud', high: { rate: 100, expo: 0  }, mid: { rate: 80, expo: 15 }, low: { rate: 65, expo: 25 } },
  ],
  aileronReversed:  false,
  elevatorReversed: false,
  throttleReversed: false,
  rudderReversed:   false,
  rateSwitch:    'SA',
  safeSwitch:    'SB',
  flapSwitch:    'SE',
  gearSwitch:    'LS',
  safePosOn:     2,
  safePosOff:    1,
  safePosAsx:    0,
  reverseSwitch: 'SF',
  reversePosOn:  1,
  aileronCh:  1,
  elevatorCh: 2,
  throttleCh: 3,
  rudderCh:   4,
  safeCh:     5,
  flapCh:     6,
  gearCh:     7,
  flapEnabled:  true,
  flapStages:   [{ travel: 0, elevComp: 0 }, { travel: 50, elevComp: 6 }, { travel: 100, elevComp: 11 }],
  flapElevComp: 11,
}

// ─────────────────────────────────────────────────────────────────────────────
// Low-level builders — match real TX16S YAML format exactly
// ─────────────────────────────────────────────────────────────────────────────

// One mixData entry.  destCh is 0-indexed.  srcRaw is the final string ("I0", "MAX", "SB", etc.)
function mixLine(
  destCh: number,
  srcRaw: string,
  weight: number,
  swtch    = 'NONE',
  name     = '',
  mltpx: 'ADD' | 'MUL' | 'REPL' = 'ADD',
  speedUp  = 0,
  speedDown = 0,
  carryTrim = 0
): string {
  return [
    ` -`,
    `   destCh: ${destCh}`,
    `   srcRaw: "${srcRaw}"`,
    `   carryTrim: ${carryTrim}`,
    `   mixWarn: 0`,
    `   mltpx: ${mltpx}`,
    `   delayPrec: 0`,
    `   speedPrec: 0`,
    `   flightModes: 000000000`,
    `   weight: ${weight}`,
    `   offset: 0`,
    `   swtch: "${swtch}"`,
    `   delayUp: 0`,
    `   delayDown: 0`,
    `   speedUp: ${speedUp}`,
    `   speedDown: ${speedDown}`,
    `   name: "${name.slice(0, 8)}"`,
  ].join('\n')
}

// One expoData entry.  chn is 0-indexed.
// expo is stored as curve type 1 (expo), value N%.
// flightModes: 9-char string; '0' = active in that FM, '1' = inactive.
function expoLine(
  srcRaw: string,      // "Ail", "Ele", "Thr", "Rud"
  weight: number,      // rate % (may be negative for reversed)
  expo: number,        // expo %
  chn: number,         // 0-indexed channel
  flightModes: string, // e.g. "001111111"
  name = ''
): string {
  return [
    ` -`,
    `   mode: 3`,
    `   scale: 0`,
    `   trimSource: 0`,
    `   srcRaw: "${srcRaw}"`,
    `   weight: ${weight}`,
    `   offset: 0`,
    `   swtch: "NONE"`,
    `   curve: `,
    `      type: 1`,
    `      value: ${expo}`,
    `   chn: ${chn}`,
    `   flightModes: ${flightModes}`,
    `   name: "${name}"`,
  ].join('\n')
}

// ─────────────────────────────────────────────────────────────────────────────

export function generateEdgeTxYaml(cfg: EdgeTxGenConfig): string {
  const {
    modelName,
    rates,
    aileronReversed, elevatorReversed, rudderReversed, throttleReversed,
    rateSwitch, safeSwitch, flapSwitch, gearSwitch,
    aileronCh, elevatorCh, throttleCh, rudderCh, safeCh, flapCh, gearCh,
    airframeMix,
    throttleCutSwitch,
    throttleCutMode,
    flapEleComps,
    thrRudMix,
    revThrustSwitch,
    flapSlow,
  } = cfg

  const ail = rates.find(r => r.id === 'ail') ?? rates[0]
  const ele = rates.find(r => r.id === 'ele') ?? rates[1]
  const rud = rates.find(r => r.id === 'rud') ?? rates[2]

  // 0-indexed channel numbers
  const ail0 = aileronCh  - 1   // 0
  const ele0 = elevatorCh - 1   // 1
  const thr0 = throttleCh - 1   // 2
  const rud0 = rudderCh   - 1   // 3
  const saf0 = safeCh     - 1   // 4
  const flp0 = flapCh     - 1   // 5
  const gar0 = gearCh     - 1   // 6

  const ailDir = aileronReversed  ? -1 : 1
  const eleDir = elevatorReversed ? -1 : 1
  const rudDir = rudderReversed   ? -1 : 1

  const isElevon    = airframeMix?.type === 'elevon'
  const isVTail     = airframeMix?.type === 'vtail'
  const isDiffThrust = airframeMix?.type === 'diffThrust'

  // Flight-mode / rate patterns:
  // FM1 = rateSwitch pos 0 (Low), FM2 = pos 1 (Mid), FM3 = pos 2 (High)
  // '0' = active in this FM, '1' = inactive.
  const FM_LOW  = '001111111'  // active in FM0 (base) + FM1 (Low)
  const FM_MID  = '110111111'  // active in FM2 only
  const FM_HIGH = '111000000'  // active in FM3+ (High and beyond)
  const FM_ALL  = '000000000'  // active in all FMs (throttle)

  const L: string[] = []

  // ── File header ─────────────────────────────────────────────────────────────
  L.push(`semver: 2.12.2`)
  L.push(`header: `)
  L.push(`   name: "${modelName.slice(0, 15).replace(/"/g, '')}"`)
  L.push(`   bitmap: ""`)
  L.push(`   labels: ""`)

  // ── Timers (3 slots) ─────────────────────────────────────────────────────────
  L.push(`timers: `)
  for (let i = 0; i < 3; i++) {
    L.push(`   ${i}:`)
    L.push(`      start: 0`)
    L.push(`      swtch: "NONE"`)
    L.push(`      value: 0`)
    L.push(`      mode: OFF`)
    L.push(`      countdownBeep: 2`)
    L.push(`      minuteBeep: 0`)
    L.push(`      persistent: 0`)
    L.push(`      countdownStart: -1`)
    L.push(`      showElapsed: 0`)
    L.push(`      extraHaptic: 0`)
    L.push(`      name: ""`)
  }

  // ── Flat top-level model settings ────────────────────────────────────────────
  L.push(`telemetryProtocol: 0`)
  L.push(`thrTrim: 0`)
  L.push(`noGlobalFunctions: 0`)
  L.push(`displayTrims: 0`)
  L.push(`ignoreSensorIds: 0`)
  L.push(`trimInc: 0`)
  L.push(`disableThrottleWarning: 0`)
  L.push(`displayChecklist: 0`)
  L.push(`extendedLimits: 1`)
  L.push(`extendedTrims: 0`)
  L.push(`throttleReversed: ${throttleReversed ? 1 : 0}`)
  L.push(`enableCustomThrottleWarning: 0`)
  L.push(`disableTelemetryWarning: 0`)
  L.push(`showInstanceIds: 0`)
  L.push(`checklistInteractive: 0`)
  L.push(`customThrottleWarningPosition: 0`)
  L.push(`beepANACenter: 0`)

  // ── mixData ──────────────────────────────────────────────────────────────────
  L.push(`mixData: `)

  if (isElevon && airframeMix?.type === 'elevon') {
    const w = airframeMix.weight
    // Left elevon (CH1): Ail + Ele
    L.push(mixLine(ail0, 'I0',  w * ailDir, 'NONE', 'EvnL-A'))
    L.push(mixLine(ail0, 'I1',  w * eleDir, 'NONE', 'EvnL-E'))
    // Right elevon (CH2): -Ail + Ele
    L.push(mixLine(ele0, 'I0', -w * ailDir, 'NONE', 'EvnR-A'))
    L.push(mixLine(ele0, 'I1',  w * eleDir, 'NONE', 'EvnR-E'))
  } else if (isVTail && airframeMix?.type === 'vtail') {
    const { eleWeight, rudWeight } = airframeMix
    // Left tail (elevatorCh): Ele + Rud
    L.push(mixLine(ele0, 'I1', eleWeight * eleDir,  'NONE', 'VtL-E'))
    L.push(mixLine(ele0, 'I3', rudWeight,            'NONE', 'VtL-R'))
    // Right tail (rudderCh): Ele - Rud
    L.push(mixLine(rud0, 'I1', eleWeight * eleDir,  'NONE', 'VtR-E'))
    L.push(mixLine(rud0, 'I3', -rudWeight,           'NONE', 'VtR-R'))
    // Ailerons are separate on a V-tail plane
    L.push(mixLine(ail0, 'I0', 100 * ailDir, 'NONE', 'AIL'))
  } else {
    // Conventional / twin-motor: standard surface channels
    L.push(mixLine(ail0, 'I0', 100 * ailDir, 'NONE', 'AIL'))
    L.push(mixLine(ele0, 'I1', 100 * eleDir, 'NONE', 'ELE'))
    L.push(mixLine(rud0, 'I3', 100 * rudDir, 'NONE', 'RUD'))
  }

  // Throttle always on throttleCh
  L.push(mixLine(thr0, 'I2', 100, 'NONE', 'THR'))

  // SAFE / receiver mode: direct SB switch → safeCh
  L.push(mixLine(saf0, safeSwitch, 100, 'NONE', 'SAFE'))

  // Flaps: direct flapSwitch → flapCh (with optional slow deploy)
  const flapSpd = flapSlow?.deploySeconds ?? 0
  L.push(mixLine(flp0, flapSwitch, 100, 'NONE', 'FLAP', 'ADD', flapSpd, flapSpd))

  // Gear: slider/switch → gearCh
  L.push(mixLine(gar0, gearSwitch, 100, 'NONE', 'GEAR'))

  // Flap-to-elevator compensation — ramps at the same speed as flap deploy
  if (flapEleComps && flapEleComps.length > 1) {
    flapEleComps.forEach((comp, i) => {
      if (i === 0 || !comp) return
      L.push(mixLine(ele0, 'MAX', comp * eleDir, `${flapSwitch}${i}`, `FlapE${i + 1}`, 'ADD', flapSpd, flapSpd))
    })
  }

  // Throttle-to-rudder (P-factor correction for right-rotating prop)
  if (thrRudMix) {
    L.push(mixLine(rud0, 'I2', thrRudMix, 'NONE', 'ThrRud'))
  }

  // Differential thrust — add rudder to motor channels
  if (isDiffThrust && airframeMix?.type === 'diffThrust') {
    const { weight, rightCh } = airframeMix
    const rCh0 = rightCh - 1
    // Left motor (throttleCh) already has THR; add +Rud
    L.push(mixLine(thr0, 'I3',  weight, 'NONE', 'DftL-R', 'ADD', 0, 0, 0))
    // Right motor: Thr + (-Rud)
    L.push(mixLine(rCh0, 'I2', 100,     'NONE', 'DftR-T'))
    L.push(mixLine(rCh0, 'I3', -weight, 'NONE', 'DftR-R', 'ADD', 0, 0, 0))
  }

  // ── limitData ────────────────────────────────────────────────────────────────
  // Build channel name list (0-indexed), sized to cover all used channels
  const maxCh = isDiffThrust && airframeMix?.type === 'diffThrust'
    ? Math.max(7, airframeMix.rightCh - 1)
    : 7
  const chNames: string[] = Array(maxCh + 1).fill('CH')
  chNames[ail0] = isElevon ? 'L-ELVN' : 'AIL'
  chNames[ele0] = isElevon ? 'R-ELVN' : (isVTail ? 'L-TAIL' : 'ELE')
  chNames[thr0] = isDiffThrust ? 'L-MOT' : 'THR'
  chNames[rud0] = isVTail ? 'R-TAIL' : 'RUD'
  chNames[saf0] = 'SAFE'
  chNames[flp0] = 'FLAP'
  chNames[gar0] = 'GEAR'
  if (isDiffThrust && airframeMix?.type === 'diffThrust') {
    chNames[airframeMix.rightCh - 1] = 'R-MOT'
  }

  L.push(`limitData: `)
  chNames.forEach((name, i) => {
    L.push(`   ${i}:`)
    L.push(`      min: 0`)
    L.push(`      max: 0`)
    L.push(`      ppmCenter: 0`)
    L.push(`      offset: 0`)
    L.push(`      symetrical: 0`)
    L.push(`      revert: 0`)
    L.push(`      curve: 0`)
    L.push(`      name: "${name}"`)
  })

  // ── expoData (rate + expo per surface per flight mode) ──────────────────────
  L.push(`expoData: `)

  // Aileron / left elevon (chn 0)
  L.push(expoLine('Ail', ail.low.rate  * ailDir, ail.low.expo,  0, FM_LOW))
  L.push(expoLine('Ail', ail.mid.rate  * ailDir, ail.mid.expo,  0, FM_MID))
  L.push(expoLine('Ail', ail.high.rate * ailDir, ail.high.expo, 0, FM_HIGH))

  // Elevator / left tail (chn 1)
  L.push(expoLine('Ele', ele.low.rate  * eleDir, ele.low.expo,  1, FM_LOW))
  L.push(expoLine('Ele', ele.mid.rate  * eleDir, ele.mid.expo,  1, FM_MID))
  L.push(expoLine('Ele', ele.high.rate * eleDir, ele.high.expo, 1, FM_HIGH))

  // Throttle (chn 2) — no rate switching, no expo
  L.push(expoLine('Thr', 100, 0, 2, FM_ALL))

  // Rudder (chn 3)
  L.push(expoLine('Rud', rud.low.rate  * rudDir, rud.low.expo,  3, FM_LOW))
  L.push(expoLine('Rud', rud.mid.rate  * rudDir, rud.mid.expo,  3, FM_MID))
  L.push(expoLine('Rud', rud.high.rate * rudDir, rud.high.expo, 3, FM_HIGH))

  // ── flightModeData (9 slots: FM0=base, FM1-3=Low/Mid/High, FM4-8=unused) ───
  L.push(`flightModeData: `)
  const fmDefs = [
    { name: '',     swtch: 'NONE' },
    { name: 'Low',  swtch: `${rateSwitch}0` },
    { name: 'Mid',  swtch: `${rateSwitch}1` },
    { name: 'High', swtch: `${rateSwitch}2` },
    { name: '', swtch: 'NONE' },
    { name: '', swtch: 'NONE' },
    { name: '', swtch: 'NONE' },
    { name: '', swtch: 'NONE' },
    { name: '', swtch: 'NONE' },
  ]
  fmDefs.forEach((fm, i) => {
    L.push(`   ${i}:`)
    L.push(`      name: "${fm.name}"`)
    L.push(`      swtch: "${fm.swtch}"`)
    L.push(`      fadeIn: 0`)
    L.push(`      fadeOut: 0`)
  })

  // ── Logical switches — idle-gate throttle cut and/or reverse thrust ──────────
  const needsTcLs  = !!(throttleCutSwitch && throttleCutMode === 'idleGate')
  const needsRevLs = !!revThrustSwitch
  let tcLsIdx  = -1   // 0-based index of the throttle-cut logical switch
  let revLsIdx = -1   // 0-based index of the reverse-thrust logical switch

  if (needsTcLs || needsRevLs) {
    L.push(`logicalSw: `)
    let lsIdx = 0
    const lsEntry = (idx: number, andsw: string): void => {
      L.push(`   ${idx}:`)
      L.push(`      func: FUNC_VNEG`)
      L.push(`      def: "Thr,-90"`)
      L.push(`      andsw: "${andsw}"`)
      L.push(`      lsPersist: 0`)
      L.push(`      lsState: 0`)
      L.push(`      delay: 0`)
      L.push(`      duration: 0`)
    }
    if (needsTcLs) {
      tcLsIdx = lsIdx
      lsEntry(lsIdx, `${throttleCutSwitch}0`)
      lsIdx++
    }
    if (needsRevLs) {
      revLsIdx = lsIdx
      lsEntry(lsIdx, `${revThrustSwitch}1`)
    }
  }

  // Helper: 0-based index → "L01", "L02", ...
  const lsName = (idx: number): string => `L${String(idx + 1).padStart(2, '0')}`

  // ── Misc model settings ───────────────────────────────────────────────────────
  L.push(`thrTraceSrc: Thr`)

  L.push(`switchWarning: `)
  for (const sw of ['SA', 'SB', 'SC', 'SD', 'SE', 'SF', 'SG', 'SH']) {
    L.push(`   ${sw}:`)
    L.push(`      pos: up`)
  }

  L.push(`rssiSource: none`)
  L.push(`rfAlarms: `)
  L.push(`   warning: 45`)
  L.push(`   critical: 42`)
  L.push(`thrTrimSw: 0`)
  L.push(`potsWarnMode: WARN_OFF`)
  L.push(`jitterFilter: GLOBAL`)

  // ── moduleData (default multimodule) ─────────────────────────────────────────
  L.push(`moduleData: `)
  L.push(`   0:`)
  L.push(`      type: TYPE_MULTIMODULE`)
  L.push(`      subType: 14,0`)
  L.push(`      channelsStart: 0`)
  L.push(`      channelsCount: 12`)
  L.push(`      failsafeMode: NOT_SET`)
  L.push(`      mod: `)
  L.push(`         multi: `)
  L.push(`            disableTelemetry: 0`)
  L.push(`            disableMapping: 0`)
  L.push(`            autoBindMode: 0`)
  L.push(`            lowPowerMode: 0`)
  L.push(`            receiverTelemetryOff: 0`)
  L.push(`            receiverHigherChannels: 0`)
  L.push(`            optionValue: 0`)

  // ── inputNames ───────────────────────────────────────────────────────────────
  L.push(`inputNames: `)
  const inputNames = [
    isElevon ? 'EvnA' : 'Ail',
    isElevon ? 'EvnE' : (isVTail ? 'Tail' : 'Ele'),
    'Thr',
    isVTail ? 'RudR' : 'Rud',
  ]
  inputNames.forEach((val, i) => {
    L.push(`   ${i}:`)
    L.push(`      val: "${val}"`)
  })
  L.push(`potsWarnEnabled: 0`)

  // ── customFn: throttle cut + reverse thrust ───────────────────────────────────
  // OVERRIDE_CHANNEL: def = "channelIndex(0-based),value,enable"
  if (throttleCutSwitch || revThrustSwitch) {
    L.push(`customFn: `)
    let fnIdx = 0

    if (throttleCutSwitch) {
      // idle-gate mode uses the logical switch; 'always' mode uses the raw switch directly
      const tcSwtch = tcLsIdx >= 0 ? lsName(tcLsIdx) : `${throttleCutSwitch}0`
      L.push(`   ${fnIdx}:`)
      L.push(`      swtch: "${tcSwtch}"`)
      L.push(`      func: OVERRIDE_CHANNEL`)
      L.push(`      def: "${thr0},-100,1"`)
      fnIdx++
      // For twin motor, also cut the right motor channel
      if (isDiffThrust && airframeMix?.type === 'diffThrust') {
        L.push(`   ${fnIdx}:`)
        L.push(`      swtch: "${tcSwtch}"`)
        L.push(`      func: OVERRIDE_CHANNEL`)
        L.push(`      def: "${airframeMix.rightCh - 1},-100,1"`)
        fnIdx++
      }
    }

    // Reverse thrust: logical switch = idle gate AND reverse switch
    if (revThrustSwitch && revLsIdx >= 0) {
      L.push(`   ${fnIdx}:`)
      L.push(`      swtch: "${lsName(revLsIdx)}"`)
      L.push(`      func: OVERRIDE_CHANNEL`)
      L.push(`      def: "${thr0},-100,1"`)
    }
  }

  return L.join('\n')
}

// Pad slot number: 1 → 'model01.yml', 15 → 'model15.yml'
export function modelFileName(slot: number): string {
  return `model${String(slot).padStart(2, '0')}.yml`
}
