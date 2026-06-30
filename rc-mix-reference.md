# RC Fixed-Wing Mix Reference for EdgeTX Wizard

**Purpose:** Research-based reference for building an EdgeTX setup wizard. Wrong configs crash planes — values flagged with [COMMUNITY] are pilot consensus, [OFFICIAL] are from manufacturer documentation.

**Last updated:** 2026-06-29

---

## PART 1 — EdgeTX Architecture

### How EdgeTX Processes Control Data

Three-stage pipeline (each stage passes values as percentages, −100% to +100%):

```
Physical sticks/switches
    ↓
[INPUTS] — applies rate scaling and expo curves; use for aileron/elevator/rudder
    ↓
[MIXES] — combines sources into channels; each line is one source→channel interaction
    ↓
[OUTPUTS] — clips to ±100%, applies subtrim/min/max, converts to PWM (988–2012 µs)
```

Core formula for each mixer line:
```
mixer_output = (source_value × weight) + offset
```

Processing order within a channel's mixer stack:
1. Function/curve/expo applied to source
2. Weight multiplication
3. Offset addition
4. Trim inclusion
5. Diff applied last

### Mixes — Field Reference

| Field | What it does |
|---|---|
| Name | Up to 6 chars, cosmetic only |
| Source | Input, stick, pot, slider, switch, or another channel |
| Weight | % of source value passed through; negative = inverted direction; can reference a GVAR or knob |
| Offset | Fixed shift added after weight; use to start a mix from one end of travel |
| Curve | Optional expo or custom curve shaping the response |
| Switch | Conditional activation; if absent, mix is always active |
| Multiplex (mltpx) | ADD / MULTIPLY / REPLACE — see below |
| Flight Modes | Restrict mix to specific flight mode(s) |
| Trim | Whether to include transmitter trim offsets |
| Delay Up/Down | Seconds before value change takes effect |
| Slow Up/Down | Seconds for output to travel full range (0–25s) |
| Warning | Beep on activation (OFF, pattern 1–3) |

### Multiplex Modes — Critical for Complex Mixes

**ADD** (default): Each line's output is added to the channel total. Order-insensitive. Use for nearly everything.

**MULTIPLY**: Multiplies the result of all lines ABOVE it in the stack. Order-sensitive — place after the lines you want to scale. Used for volume controls (e.g., snap flap depth knob multiplying the snap flap mix). Formula: `(line1 + line2) × line3_value`.

**REPLACE**: Completely overrides all previous lines on this channel. Used in throttle cut / motor arm where you want a switch to force the channel to a fixed value regardless of stick position.

### Channels — Conventions

Standard AETR channel order:
- CH1: Aileron
- CH2: Elevator
- CH3: Throttle
- CH4: Rudder
- CH5–8: Flaps, gear, spoilers, etc.
- CH9–16+: Programming helper channels (not transmitted on some protocols)

PWM reference: −100% = 988 µs, 0% = 1500 µs, +100% = 2012 µs

---

## PART 2 — Surface Mixes

### 2.1 Elevon (Flying Wing / Delta)

**What it is:** Two elevon surfaces each receive both aileron and elevator inputs. There is no separate horizontal tail.

**Airframes:** Flying wings (Zephyr, Bixler, SonicModell AR Wing), delta planforms, most FPV fixed-wing racers.

**Channel assignment:**
- CH1: Left elevon servo (aileron port on receiver)
- CH2: Right elevon servo (elevator port on receiver)
- CH3: Throttle

**Mixer setup:**
```
CH1:
  Line 1: Source=[I]Ail  Weight=+50%  mltpx=ADD   (aileron component — up on left)
  Line 2: Source=[I]Ele  Weight=+50%  mltpx=ADD   (elevator component — same direction)

CH2:
  Line 1: Source=[I]Ail  Weight=-50%  mltpx=ADD   (aileron component — DOWN on right = opposing)
  Line 2: Source=[I]Ele  Weight=+50%  mltpx=ADD   (elevator component — same direction)
```

Sign corrections: If surfaces move wrong direction, flip weight sign on that specific line. Never correct by reversing the entire channel output if you can avoid it — you may flip elevator and aileron together.

**Better practice using inputs as rate centers:**
```
[I]Ail = Ail_stick × 90%  Expo=25%
[I]Ele = Ele_stick × 30%  Expo=35%

CH1 = [I]Ail (weight +100%) ADD [I]Ele (weight +100%)
CH2 = [I]Ail (weight -100%) ADD [I]Ele (weight +100%)
```

This puts rate/expo in one place. The elevon weights stay at ±100 and you adjust the input weights.

**Overmixing warning:** With both sticks at full simultaneously, CH values can exceed 100% and will clip. Reducing input weights to 50% each prevents this but reduces maximum throw. Many pilots prefer 100/100 and accept the clipping — surfaces hit mechanical limits anyway.

**Preset values:**
| Skill | Elevon rate (% of full travel) | Expo |
|---|---|---|
| Beginner | 40–50% | 30–40% |
| Intermediate | 60–70% | 20–30% |
| Expert | 80–100% | 15–25% |

**CG for flying wings:** [COMMUNITY] Start at 25–30% MAC measured from leading edge at root. Flying wing CG is extremely sensitive — even 5mm too far aft can make the wing unrecoverable. Use online flying wing CG calculators (fwcg.3dzone.dk) rather than standard % rules.

**Common crashes:**
1. Reversed elevator: Wing pitches the wrong direction on takeoff. Always verify elevator response on ground.
2. CG too far aft: Wing pitches up aggressively, stalls, flat spins with no recovery.
3. Too much elevator authority at launch: Over-rotate on throw, wing stalls immediately. Reduce elevator rate to 20–30% for maiden.
4. No expo on aileron: Flying wings are roll-sensitive. Start with 35% expo.

**Switch recommendations:** No special switch needed for basic setup. Add a flight mode switch for camber/reflex presets (see section 2.7).

**Interaction with other mixes:** If adding camber to a flying wing (section 2.7), the camber offset is added to both channels equally. If adding elevon differential (section 2.9), apply diff to each channel's aileron line separately.

---

### 2.2 V-Tail / Ruddervator

**What it is:** Two tail surfaces each receive both elevator and rudder inputs. Surfaces cross-couple at ±45° to the horizontal.

**Airframes:** V-tail gliders (many ASW/Discus variants), some scale models (Beechcraft Bonanza).

**Channel assignment:**
- CH2: Left ruddervator (elevator port)
- CH4: Right ruddervator (rudder port) — or use CH5/CH6 for Y-tail variants

**WARNING:** Some receivers with built-in V-tail mixing (many Spektrum, some FrSky) expect unmixed signals on CH1/CH2. Do NOT mix on the transmitter AND at the receiver. Use one or the other.

**Mixer setup (transmitter-side mixing, for receivers without built-in V-tail support):**
```
CH2 (left ruddervator):
  Line 1: Source=[I]Ele  Weight=+50%  mltpx=ADD
  Line 2: Source=[I]Rud  Weight=+50%  mltpx=ADD

CH4 (right ruddervator):
  Line 1: Source=[I]Ele  Weight=+50%  mltpx=ADD
  Line 2: Source=[I]Rud  Weight=-50%  mltpx=ADD
```

Sign convention: Elevator lines same sign; rudder lines opposite sign. If directions are wrong, flip the rudder sign or elevator sign — not both.

**Weight tuning:** 50/50 is the starting point. If the tail has a shallow V-angle (less than 110° included angle), elevator authority is reduced and you may need higher elevator weight (60/40 split, 60% elevator / 40% rudder).

**Preset values:**
| Skill | Ruddervator rate | Expo |
|---|---|---|
| Beginner | 50% | 25% |
| Intermediate | 65–70% | 20% |
| Expert | 80–90% | 15% |

**Common crashes:**
1. Mixing at both TX and RX: Double-mixing makes controls erratic. Verify which device handles the mix.
2. Wrong rudder sign: Rudder inputs cause opposite-direction yaw. Test ground.

---

### 2.3 Flaperon

**What it is:** Each aileron servo handles both aileron deflection AND collective flap deflection. Ailerons droop symmetrically when flap is requested while still able to roll differentially.

**Airframes:** Any aircraft with dedicated aileron servos and no separate flap servos (E-flite Timber, sport planes with single-aileron-servo-per-side).

**Channel assignment (2-aileron-servo aircraft):**
- CH1: Right aileron
- CH5 (or CH6): Left aileron (separate servo)
- Flap input: A switch or slider on a helper channel

**Mixer setup:**
```
Helper CH10 (flap command):
  Line 1: Source=SF_switch  Weight=+100%  Slow↓=1.5s  Slow↑=1.5s

CH1 (right aileron):
  Line 1: Source=[I]Ail  Weight=+100%  mltpx=ADD   (aileron function)
  Line 2: Source=CH10    Weight=-50%   mltpx=ADD   (flaperon droop, negative = trailing edge down)

CH5 (left aileron):
  Line 1: Source=[I]Ail  Weight=-100%  mltpx=ADD   (aileron function — inverted)
  Line 2: Source=CH10    Weight=-50%   mltpx=ADD   (flaperon droop — same direction)
```

Flap weight on each servo: 30–70% depending on servo geometry and desired droop travel.

**Elevator compensation:** When flaplerons deploy, the aircraft typically pitches up. Mix a negative elevator offset to compensate:
```
CH2 (elevator):
  Add line: Source=CH10  Weight=-10% to -20%  mltpx=ADD
```
Start at −10% and adjust in flight. See also section 2.10.

**Preset values:**
| Setting | Flaperon droop (takeoff) | Flaperon droop (landing) |
|---|---|---|
| Light aircraft | 20–25% of travel | 40–60% of travel |
| Sport plane | 15–20% | 35–50% |

**Common crashes:**
1. Flap added to both ailerons in same direction but wrong polarity: Creates roll instead of drooping both down.
2. Missing elevator compensation: Aircraft balloons on flap deployment, stalls if close to ground.

---

### 2.4 Tailerons / Ailevator

**What it is:** Two separate elevator halves (left and right) that also act as ailerons when deflected differentially. Common on fighters and high-performance scale aircraft.

**Airframes:** Some scale jets (F-16, F-18 delta variants with all-moving tailerons), large scale aircraft.

**Channel assignment:**
- CH2: Left taileron (elevator port)
- CH6: Right taileron (separate servo)

**Mixer setup:**
```
CH2 (left taileron):
  Line 1: Source=[I]Ele  Weight=+100%  mltpx=ADD   (elevator function — both move together)
  Line 2: Source=[I]Ail  Weight=+30%   mltpx=ADD   (aileron function — left goes one way)

CH6 (right taileron):
  Line 1: Source=[I]Ele  Weight=+100%  mltpx=ADD   (elevator function)
  Line 2: Source=[I]Ail  Weight=-30%   mltpx=ADD   (aileron function — right goes opposite)
```

Aileron weight (30%) is conservative — too much aileron authority from tailerons can fight the main wing ailerons if also present. On pure taileron aircraft (no separate ailerons) increase to 50–70%.

**Common crashes:**
1. Taileron aileron mix too high combined with wing ailerons: Roll controls fight each other.

---

### 2.5 Crow / Butterfly

**What it is:** Landing brake for gliders. Full span flaps drop while ailerons rise (acting as spoilers). Combined with down-elevator compensation.

**Airframes:** Gliders and sailplanes of all sizes. Also used on some large sport planes for high-drag landing approaches.

**Operator:** Typically the left (throttle) stick on mode 2, or a slider (S1/LS), or a 3-position switch.

**Mixer setup (4-servo wing — 2 ailerons, 2 flaps):**
```
Helper CH10 (crow command, driven by slider or throttle stick):
  Source=S1 (or Thr)  Weight=100%

CH1 (right aileron):
  Crow line: Source=CH10  Weight=-30% (negative = UP when crow deploys)  mltpx=ADD

CH5 (left aileron):
  Crow line: Source=CH10  Weight=+30% (same physical direction = UP)  mltpx=ADD

CH6 (right flap):
  Crow line: Source=CH10  Weight=+80%  mltpx=ADD  (down)

CH7 (left flap):
  Crow line: Source=CH10  Weight=+80%  mltpx=ADD  (down)

CH2 (elevator):
  Compensation: Source=CH10  Weight=-15%  mltpx=ADD  (nose DOWN to prevent balloon)
```

**Physical targets:**
- Ailerons up: 5–10mm at full crow [OFFICIAL via community RC-Soar templates]
- Flaps down: Maximum possible travel, ideally 60–90°
- Elevator down: 5–15% of elevator range (tune in flight at both half and full crow)

**Aileron differential suppression during crow:** With F3X aircraft, crow reduces roll response. Advanced setups reduce diff to zero as crow deploys:
```
Diff GVAR = GV1
As crow deploys, use a mix from CH10 to reduce GV1 toward zero
```

**Common crashes:**
1. No elevator compensation: Aircraft balloons suddenly when crow activated near ground. Always dial in at least -10% elevator compensation as a starting point.
2. Ailerons going down instead of up: Adds lift rather than spoiling it. Check signs.
3. Activating crow too fast: Use Slow parameter of 1–2 seconds on CH10 to smooth deployment.

**Switch recommendations:** [COMMUNITY] Throttle stick (left stick, mode 2) is traditional for gliders — pushing throttle down deploys crow for landing, neutral is retracted for soaring. A slider or 3-pos switch works equally well for powered gliders where you need throttle separately.

---

### 2.6 Snap Flap

**What it is:** Elevator input automatically adds camber (flap/aileron deflection) to the wing. Tight turns generate more lift. Competition glider technique.

**Airframes:** Gliders and sailplanes, especially F3J/F3F competition class.

**Implementation:**

Simple snap flap (elevator to flaps):
```
CH6 (right flap):
  Base line: Source=[I]Ele  Weight=20%  mltpx=ADD

CH7 (left flap):
  Base line: Source=[I]Ele  Weight=20%  mltpx=ADD
```

With adjustable volume (using GVAR or knob):
```
CH10 (snapflap volume, driven by a knob or GVAR):
  Source=S1  Weight=100%   (0–100% range)

CH6 (right flap):
  Line 1: Source=[I]Ele  Weight=25%  mltpx=ADD
  Line 2: Source=CH10    Weight=25%  mltpx=MULTIPLY  (scales the above)
```

Also applies to ailerons for full-span snap flap:
```
CH1 (aileron):
  Snapflap: Source=[I]Ele  Weight=15%  mltpx=ADD
```
[SOURCE: rc-soar.com templates, confirmed community practice]

**Flight mode specific:** Apply snap flap only in Thermal and Cruise modes, not Speed/Reflex.

**Preset values:** [COMMUNITY]
| Setting | Snapflap weight |
|---|---|
| Starting point | 15–25% |
| Thermalling | 20–30% |
| Speed flight | 0% (off) |

---

### 2.7 Camber / Reflex

**What it is:** All wing surfaces deflect together to change airfoil camber. Positive camber (droop) = more lift, slower speed, thermalling. Negative camber/reflex = less drag, faster cruise, penetration.

**Airframes:** Gliders, sailplanes, flying wings, competition aircraft.

**Typical flight mode presets:** [SOURCE: rc-soar.com]
| Flight Mode | Camber setting |
|---|---|
| Launch | 0% (neutral) |
| Thermal | +2 to +4mm droop on flaps |
| Cruise | 0% |
| Speed | −1 to −2mm (reflex) |
| Zoom/Landing | +3 to +6mm or crow |

**Mixer setup (using helper channel):**
```
CH10 (camber master, driven by slider or flight mode GVAR):
  Source=S1 or GVAR  Weight=100%

CH6 (right flap):
  Camber line: Source=CH10  Weight=40%  mltpx=ADD

CH7 (left flap):
  Camber line: Source=CH10  Weight=40%  mltpx=ADD

CH1 (right aileron) — for full span:
  Camber line: Source=CH10  Weight=20%  mltpx=ADD

CH5 (left aileron):
  Camber line: Source=CH10  Weight=20%  mltpx=ADD
```

Ailerons typically get less camber authority than flaps (20% vs 40%) because too much aileron droop increases adverse yaw.

**Flying wing camber (elevons):**
```
CH1 (left elevon):
  Camber: Source=CH10  Weight=+30%  mltpx=ADD

CH2 (right elevon):
  Camber: Source=CH10  Weight=+30%  mltpx=ADD
```
Both surfaces deflect equally and in the same direction (trailing edge down for positive camber).

---

### 2.8 Spoileron

**What it is:** Ailerons rise (spoil lift) on the descending wing side for roll control. The up-going aileron deflects more than a normal aileron would. Used instead of or alongside regular ailerons for drag-roll control.

**Airframes:** Some gliders and sailplanes, especially those where ailerons-only roll causes adverse yaw. Also warbirds with limited aileron differential.

**Mixer setup:**
Spoileron is implemented as a form of extreme differential aileron — the down-going aileron barely moves while the up-going aileron deflects significantly:
```
CH1 (right aileron):
  Source=[I]Ail  Weight=+100%  Diff=80%

CH5 (left aileron):
  Source=[I]Ail  Weight=-100%  Diff=80%
```

With 80% diff, the down-going aileron only moves 20% of its full range while the up-going aileron moves 100%.

For true spoileron (aileron only goes UP, never down):
```
CH1 (right aileron):
  Source=[I]Ail  Weight=+100%
  In Outputs, set Min=0 (prevents channel from going negative, so only up deflection)
```
[CAUTION: This requires careful output calibration]

---

### 2.9 Differential Aileron

**What it is:** Up aileron travels farther than down aileron to reduce adverse yaw caused by drag from the down-going aileron.

**Airframes:** Nearly all tractor propeller aircraft with wing ailerons. Especially important on high-wing trainers and aircraft with long wingspans.

**Correct implementation:** [SOURCE: rc-soar.com — "A better Diff for OpenTx/EdgeTX"]

Apply diff at the MIXER level (on each aileron channel separately), NOT at the input level. Applying at the input level causes reversed differential when trim is active.

```
CH1 (right aileron):
  Source=[I]Ail  Weight=+100%  Diff=GV1  NoTrim
  Source=TrmA    Weight=+25%              (re-adds trim without diff distortion)

CH5 (left aileron):
  Source=[I]Ail  Weight=-100%  Diff=GV1  NoTrim
  Source=TrmA    Weight=-25%
```

Using GVAR (GV1) for diff allows in-flight adjustment via a knob or trim button. Set the GVAR range to 0–70%.

**Typical diff values:** [COMMUNITY]
| Aircraft type | Aileron diff |
|---|---|
| Trainer | 20–30% |
| Sport | 15–25% |
| Glider | 30–50% |
| Aerobatic | 0–10% (need down aileron for snaps/rolls) |

**Crash risk:** Too much diff causes coordination problems in turns (slip/skid). Too little causes adverse yaw and requires heavy rudder input in turns. Start at 25% and adjust.

---

### 2.10 Flaperon with Elevator Compensation

**What it is:** Automatic pitch trim change as flaps (or flaperons) deploy, to counteract the pitch-up moment from increased camber.

**Airframes:** Any aircraft with flaps or flaperons where CG and tail volume cause pitch change on flap deployment.

**Mixer setup:**
```
CH2 (elevator):
  Flap comp: Source=CH_flap  Weight=-15%  mltpx=ADD
  (negative because flap deployment causes pitch-up, so we add nose-down elevator)
```

For stepped flap positions (3-pos switch), use different compensation per position:
```
CH2 (elevator):
  Line 1: Source=[I]Ele  Weight=+100%   Switch=always    mltpx=ADD
  Line 2: Source=MAX      Weight=-8%    Switch=SF_mid    mltpx=ADD  (takeoff flap)
  Line 3: Source=MAX      Weight=-18%   Switch=SF_down   mltpx=ADD  (landing flap)
```

**Starting values:** −10% to −20% of elevator travel per stage of flap. Tune in flight: add flaps, observe pitch response, adjust weight.

[CAUTION] If compensation is too strong and aircraft pitches down on flap deployment, it can induce a steep dive near ground. Start conservatively at −10% and increase.

---

### 2.11 Four-Flap Glider (Inner Flaps + Outer Flaps / Full House)

**What it is:** Full competition glider setup with separate inner flaps (flaps proper) and outer flaps (ailerons) plus crow braking, camber presets, and snap flap, all coordinated.

**Airframes:** F3J, F3F, F5J/F5K competition sailplanes with 5+ servo wings.

**Channel assignment (6-servo example):**
- CH1: Right aileron (outer flap)
- CH2: Elevator
- CH3: Throttle (motor)
- CH4: Rudder
- CH5: Left aileron
- CH6: Right inner flap
- CH7: Left inner flap
- CH8: (unused or spoiler/gear)
- CH9–12: Programming helper channels (camber master, crow master, snapflap volume, diff GV)

**Mix interaction hierarchy:**
1. Aileron roll (CH1, CH5) — differential applied
2. Camber offset (all wing surfaces via helper channel)
3. Snap flap (elevator → all wing surfaces)
4. Crow (inner flaps down + ailerons up + elevator compensation)
5. Aileron differential suppression (reduce diff during crow)

**A simplified but complete setup:**
```
CH9 (camber master, adjusted by slider or GV per flight mode):
  Source=S1  Weight=100%

CH10 (crow master, throttle stick or slider):
  Source=Thr  Weight=100%  Slow↑=1.5s  Slow↓=1.5s

CH1 (right aileron):
  Ail:      [I]Ail   +100%  Diff=GV1  mltpx=ADD
  Camber:   CH9      +20%             mltpx=ADD
  Snapflap: [I]Ele   +15%             mltpx=ADD
  Crow:     CH10     -30%             mltpx=ADD  (ailerons UP during crow)

CH5 (left aileron): mirror of CH1 with [I]Ail weight inverted

CH6 (right inner flap):
  Camber:   CH9      +40%             mltpx=ADD
  Crow:     CH10     +80%             mltpx=ADD  (flaps DOWN during crow)

CH7 (left inner flap): mirror of CH6

CH2 (elevator):
  [I]Ele    +100%                     mltpx=ADD
  Crow comp: CH10   -15%              mltpx=ADD  (nose down when crow deploys)
```

[SOURCE: rc-soar.com templates (E-Soar Plus, F3J, DLG), Newton Airlines glider setup guide, community F3X templates]

---

## PART 3 — Multi-Motor / Multi-Engine

### 3.1 Differential Thrust

**What it is:** On a twin-engine aircraft, rudder input speeds up one motor and slows down the other to supplement or replace yaw authority.

**Airframes:** Twin-motor pusher flying wings, multi-engine scale aircraft without adequate rudder, some bush planes.

**Mixer setup:**
```
CH3 (left motor / motor 1):
  Line 1: Source=Thr    Weight=+100%  mltpx=ADD  (base throttle)
  Line 2: Source=[I]Rud Weight=+25%   mltpx=ADD  (rudder right = left motor speeds up)

CH8 (right motor / motor 2):
  Line 1: Source=Thr    Weight=+100%  mltpx=ADD  (base throttle)
  Line 2: Source=[I]Rud Weight=-25%   mltpx=ADD  (rudder right = right motor slows)
```

Rudder weight (25%) is the differential amount. Start low (15–20%) and increase. Too high causes tip stalls in flight.

**Critical note:** Differential thrust is effective on the ground and at low speeds but loses authority at high speeds where aerodynamic rudder is more effective. Both mixes need to be present — differential thrust is an ADDITION to the rudder channel, not a replacement.

[SOURCE: openrcforums.com differential thrust thread, Flite Test programming guide, CustomRCMods YouTube tutorial]

---

### 3.2 Twin Engine with Rudder (Supplemental)

Same setup as 3.1 but the aircraft also has a conventional rudder on CH4. The differential thrust reduces the rudder authority needed and improves ground handling.

For same-direction propellers (both rotate same way), expect residual torque and P-factor requiring rudder trim. Set a trim offset via GVAR or fixed offset in CH4 to compensate at cruise throttle.

---

### 3.3 Counter-Rotating Twin vs. Same-Direction

**Counter-rotating (CR):** Left engine rotates clockwise (from behind), right engine counter-clockwise. Torque effects cancel. No critical engine. P-factor effects cancel. Preferred for scale twins. [SOURCE: Wikipedia counter-rotating propellers, Flite Test multi-engine article]

**Same-direction (SD):** Both props rotate same way. Combined torque rolls the aircraft toward the downgoing blade side (usually left). P-factor creates yaw at high angle of attack. Require more rudder authority.

**Transmitter implications:**
- CR twin: No additional torque compensation mixing needed.
- SD twin: Add a small fixed rudder offset (5–10% via offset field on rudder channel) and possibly a small roll offset (2–5%) in the aileron channel, set during maiden flight using trims, then baked in as offsets.

---

### 3.4 Throttle Cut (Kill Switch)

**What it is:** A physical switch that forces the throttle channel to minimum (motor off) regardless of stick position. Essential safety feature.

**Simple method (Special Function):**
```
Special Function:
  Switch: SA↓ (or any momentary/2-pos switch)
  Action: Override CH3 = -100
```
This overrides the throttle channel to minimum when switch is activated.

**Robust method (motor arm with logic switch):** [SOURCE: mrd-rc.com throttle cut with safety arming]
```
Curve "Cut": both points = -100%

Logical Switch L01: Thr < -98   (throttle stick is at bottom)
Logical Switch L02: AND(SA=UP, OR(L01, L02))  (armed state: SW up AND stick was at bottom first)

Inputs:
  [I]Thr (armed):   Source=Thr  Switch=L02  Weight=100%
  [I]Thr (cut):     Source=Thr  Curve=Cut   Switch=!L02  Weight=100%

CH3: Source=[I]Thr  +100%
```

**Arm sequence:** throttle stick to bottom → flip arm switch to UP → motor can now respond to throttle. Moving stick to mid or flipping switch off disarms.

**Switch recommendation:** Use a 2-position toggle switch. Do NOT use a spring-return button for throttle cut — accidental release during flight would re-enable motor.

---

### 3.5 Throttle Curve

**What it is:** Non-linear mapping between throttle stick position and motor output. Used to improve control feel at specific throttle ranges.

**Common applications:**
- Jets: Linear is often fine, but some pilots add a slight S-curve to improve idle response and prevent flameout
- Hovering aircraft: Flatten mid-range to make altitude hold easier
- High-performance motors: Reduce bottom-end sensitivity

**Setup in EdgeTX:**
Navigate to Inputs → Thr input → Curve → Custom

**Preset curves by type:**
| Application | Curve shape |
|---|---|
| Trainer (smooth response) | Slight positive expo (raise mid) |
| Jet (crisp idle, powerful top) | Slight negative expo (deepen mid) |
| Large scale (slow spool) | Slow parameter on throttle input |
| 3D plane | Aggressive positive expo (flat middle for hovering) |

[SOURCE: Oscar Liang throttle curve guide, rc-soar.com adjustable throttle expo]

---

## PART 4 — Jet-Specific

### 4.1 Thrust Vectoring

**What it is:** Moveable jet nozzle or vane deflectors that redirect thrust for pitch/yaw control independent of aerodynamic surfaces.

**RC application:** Rare in off-the-shelf models. Some large-scale EDF builds add pitch and yaw TVC servos.

**Mixer setup (pitch TVC):**
```
CH7 (TVC pitch servo — two servos on Y-lead, or use two channels):
  Source=[I]Ele  Weight=+30%  mltpx=ADD  (elevator supplements TVC pitch)
```

Better — two independent TVC channels:
```
CH7 (TVC servo 1):
  [I]Ele  +30%
CH8 (TVC servo 2):
  [I]Ele  +30%  (same direction for pitch)
  [I]Ail  +20%  (opposite to servo 1 for roll TVC if desired)
```

[CAUTION: TVC on RC aircraft is a custom build — verify servo direction on ground before any flight attempt]

---

### 4.2 Air Brake / Spoiler (Dedicated)

**What it is:** A panel or plates that extend perpendicular to the airstream for drag without lift change. One servo on its own channel.

**Airframes:** Scale warbirds, some jets.

**Mixer setup:**
```
CH8 (air brake servo):
  Source=SB  Weight=+100%  Slow↑=0.5s  Slow↓=0.5s
```

Add elevator compensation if the air brake causes pitching moment:
```
CH2 (elevator):
  Source=CH8  Weight=-10% to +10%  mltpx=ADD
```
Direction depends on where the brake is located (upper fuselage = pitch up, lower = pitch down).

---

### 4.3 Thrust Reverser (E-flite / Avian ESC)

**What it is:** A servo-actuated bucket or clamshell that redirects exhaust thrust forward for rapid deceleration during landing rollout.

**Important restrictions:** [SOURCE: E-flite Habu SS 50mm manual, official Horizon Hobby documentation]
- ONLY activates on ground — never use thrust reverser in flight. Applying reverse thrust while airborne will cause loss of control and crash.
- Requires a Spektrum receiver with Smart Throttle (AR637TA, AR631) AND a Spektrum or Smart transmitter with 7+ channels.
- Configuration is done via the Avian Smart Programmer, not via normal transmitter mixing.
- Assign to a separate channel/switch that is physically separate from normal throttle.

For EdgeTX with Spektrum Smart Throttle protocol:
- Assign throttle to CH3 as normal
- Map a switch to CH7 (or per manual) for reverse enable
- The Avian ESC handles the actual reversal logic when it sees the switch position

[CAUTION: Do NOT attempt thrust reversal via normal throttle mixing on the transmitter — the ESC firmware controls this feature and expects specific Smart protocol signals]

---

### 4.4 Landing Gear Sequencing

**What it is:** A single switch moves gear and doors in a timed sequence: doors open → gear extends → doors close (or doors stay open while gear moves, then close).

**Mixer setup:** [SOURCE: rc-soar.com gear sequencer]

Step 1 — Create timebase channel:
```
CH9 (timebase — hidden channel, not connected to servo):
  Source=SF (retract switch)  Weight=100%  Slow↑=6s  Slow↓=6s
```

Step 2 — Door servo with timing curve:
```
CH10 (door servo):
  Source=CH9  Weight=100%  Curve=CV1
```
CV1 definition (3 points): x=−100 y=−100 (doors closed / gear up state), x=0 y=+100 (doors open — mid-transit), x=+100 y=−100 (doors closed / gear down state)

Step 3 — Gear servo with timing curve:
```
CH11 (gear servo):
  Source=CH9  Weight=100%  Curve=CV2
```
CV2 definition (4 points): x=−100 y=−100 (gear up), x=−50 y=−100 (pause — doors are opening), x=+50 y=+100 (gear down), x=+100 y=+100 (gear down — doors closing)

Lights (if present): Add a mix from CH9 to lights channel using a simple curve that activates at any gear position other than full up.

**Safety rule:** [SOURCE: rc-soar.com] Always put U/C in same state (up or down) before powering off. Set switch to matching state before powering on. Mismatch causes servo jump at power-on.

---

## PART 5 — Advanced / Special

### 5.1 Gyro Gain Channel (AS3X, SAFE, External Gyros)

**What it is:** A channel that controls the gain (sensitivity) of an external stabilization system. Higher gain = more stabilization, but can cause oscillation.

**E-flite AS3X / SAFE receivers:** [SOURCE: Spektrum AS3X+ wiki, community guides]

On most BNF E-flite models (AR631, AR635, AR636, AR637T series), gyro gains are pre-configured by the factory. For custom transmitter setups with these receivers:

- Binding to EdgeTX (RadioMaster TX16S, etc.) works via DSMX/DSM2 protocol.
- AS3X/SAFE stabilization is always active at factory gains — you do NOT need to configure gain on the transmitter for normal use.
- To adjust gains via EdgeTX, you need to access Spektrum Forward Programming via a Lua script (requires a Spektrum-compatible module). The EdgeTX DSM Forward Programming Lua tool (as of OpenTX 2.3.11) supports "other settings" but NOT full gyro/AS3X gain settings through software.
- Workaround: Use a Spektrum radio temporarily to configure AS3X gains, bind, then switch to EdgeTX for flight.

For 3rd-party external gyros (Eagle Tree, iGyro, etc.):
```
CH6 (gyro gain):
  Source=SB (3-pos switch or knob)  Weight=100%
```
Connect gyro gain input to CH6. Switch/knob controls gain 0–100%. Most gyros: low position = high gain (stabilized), high position = low gain (sport/aerobatic).

**Gain starting points:** [COMMUNITY]
| Mode | Gain % |
|---|---|
| Training / SAFE full | 70–100% |
| Assisted | 40–60% |
| Acro / off | 0–10% |

---

### 5.2 Pan/Tilt Camera

**What it is:** Two servos (pan = horizontal, tilt = vertical) for an FPV camera mount. Can be manual (stick/knob controlled) or head-tracker controlled.

**Mixer setup:**
```
CH9 (pan):
  Source=S1 (right slider)  Weight=100%  (or head tracker RX)
  Curve=CV1  (optional: limit travel to mechanical range)

CH10 (tilt):
  Source=S2 (left slider)  Weight=100%
  Curve=CV2
```

For off/neutral position when not actively controlling:
```
When pan/tilt switch is OFF:
  Add: Source=MAX  Weight=0%  mltpx=REPLACE  Switch=!SC  (centers servo)
```

Limit servo travel in Outputs to prevent camera housing collision.

---

### 5.3 Retract Sequencing (Multiple Gear Legs)

**What it is:** Sequencing multiple main and nose gear legs with doors. Nose gear often needs to sequence separately from mains (nose first on extension, mains first on retraction for aerodynamic reasons).

For aircraft with separate nose and main gear channels, create separate timebases (CH9 for mains, CH10 for nose) with offset timing:
- Mains timebase: Slow = 6s
- Nose timebase: Slow = 6s but start delayed by 1–2s (use a logical switch or offset curve)

[COMPLEXITY NOTE: Full multi-leg sequencing is advanced — use a dedicated sequencer module (like AeroSequencer) for aircraft with 4+ door servos to reduce programming complexity]

---

### 5.4 Twin Rudder

**What it is:** Two separate rudder servos (one per vertical fin on twin-boom or twin-fin aircraft) driven together.

**Mixer setup:**
```
CH4 (right rudder servo):
  Source=[I]Rud  Weight=+100%

CH8 (left rudder servo):
  Source=[I]Rud  Weight=+100%  (same direction — both turn the same way)
```

One servo may need to be reversed in OUTPUTS if linkages are mirrored.

Fine-tuning: If one rudder surface is slightly larger than the other (asymmetry), adjust individual weights (e.g., 100% / 95%) in Outputs, not Inputs, so rate adjustments still affect both proportionally.

---

### 5.5 Dual Elevator

**What it is:** Two elevator servos (left and right horizontal stab) driven together. Common on large scale and giant scale aircraft where a single servo lacks the torque to move a large surface.

**Mixer setup:**
```
CH2 (right elevator servo):
  Source=[I]Ele  Weight=+100%

CH6 (left elevator servo):
  Source=[I]Ele  Weight=+100%  (same direction — both move trailing edge up/down together)
```

One servo typically needs to be reversed in OUTPUTS.

[NOTE: Dual elevator is different from tailerons — elevator servos should never differentially deflect. If you need both differential (aileron effect) AND elevator, that's a taileron/ailevator (section 2.4)]

---

## PART 6 — Manufacturer Data

### 6.1 E-flite / Horizon Hobby

#### E-flite Apprentice STS 1.5m
[SOURCE: Official Horizon Hobby manual EFL3700-Manual-EN]

| Surface | Low Rate | High Rate |
|---|---|---|
| Aileron | 18mm | 23mm |
| Elevator | 18mm | 23mm |
| Rudder | 28mm | 35mm |

- CG: Per manual with recommended LiPo installed (battery position determines CG — forward battery = nose heavy)
- SAFE modes: Beginner (limited bank), Intermediate (angle limits), Experienced (no limits)
- AS3X always active; DO NOT reduce rates below 50% if using AS3X — gyro expects full servo travel authority
- Expo: Manual says "adjust after first flights." Community consensus: start 25% all surfaces.

#### E-flite Valiant 1.3m
[SOURCE: Official Horizon Hobby manual — Valiant 1.3m BNF Basic]

| Surface | Low Rate | High Rate |
|---|---|---|
| Elevator | 17mm | 28mm |
| Aileron | 14mm | 18mm |
| Flaps (takeoff) | — | 20mm |
| Flaps (landing) | — | 25mm |

- CG: 65mm ± 3mm from leading edge of wing at fuselage root, with EFLB22003S30 LiPo all the way forward
- First flights: Low rate recommended
- AS3X + SAFE Select: Do not lower rates below 50%

#### E-flite Carbon-Z Cub SS 2.1m
[SOURCE: Official Horizon Hobby manual EFL124500]

| Surface | Low Rate | High Rate |
|---|---|---|
| Aileron | 35mm | 50mm |
| Flap | 30mm | 45mm |

- CG: 105–120mm from leading edge of wing root, with SPMX40006S50 LiPo in middle battery bay
- Servo reversing: Gear channel reversed, all others normal
- Battery: 6S 4000mAh recommended

#### E-flite Timber X 1.2m
[SOURCE: Official manual EFL3850-75, community flight reports]

- Wing design: Double-beveled hinge lines, ailerons and flaps can travel both directions (3D capable)
- Flaps: Travel in both directions — positive droop for landing, negative for reflex
- CG: Per manual (PDF not extractable) — community reports ~85–95mm from leading edge at root
- AS3X + SAFE Select: Standard Horizon BNF setup

#### E-flite Habu STS 70mm EDF Jet
[SOURCE: Official Horizon Hobby manual EFL01500, Habu SS 50mm manual]

- Thrust reversal: ONLY available on ground. Requires Smart throttle receiver (AR637TA or AR631) and Spektrum Smart transmitter with 7+ channels. NOT programmable via standard EdgeTX mixing — configured via Avian Smart Programmer or Forward Programming.
- Air brake: Dedicated servo channel, typically CH6 or CH7. Check specific model manual.
- SAFE technology: Provides envelope protection. Can be disabled via switch for experienced pilot mode.

#### E-flite Habu SS 50mm EDF Jet
[SOURCE: Horizon Hobby manual EFL02350]

- Thrust reversal: Enabled via Avian ESC programming, assigned to a transmitter channel
- Use a dedicated toggle switch (not a momentary), NEVER use in flight

---

### 6.2 FMS Hobby

#### FMS Fox 3000mm Aerobatic Glider
[SOURCE: FMS official manual, community review data]

- CG: 95mm from leading edge of wing [OFFICIAL]
- Servos: 23G high-torque
- Expo: 30% on all surfaces [COMMUNITY — model aviation review]
- Notable: Large flaps with significant authority. Camber/reflex setup recommended.

#### FMS Viper V2 70mm EDF Jet
[SOURCE: FMS official manual, Horizon Hobby listing]

- CG: 110–120mm from leading edge of main wing with battery installed [OFFICIAL]
- First flights: Low rate only
- Battery position: Adjust to hit CG — slide forward or back in bay

#### FMS Ranger (1220mm)
[SOURCE: FMS manual, manuals.plus]

- CG: 50–60mm from leading edge of main wing with battery [OFFICIAL]
- First flights: Low rate
- Standard trainer layout — aileron/elevator/throttle/rudder + optional flaps

---

### 6.3 HobbyZone

#### HobbyZone AeroScout S 1.1m
[SOURCE: Official Horizon Hobby manual HBZ380001]

- Dual rates: High (100% servo travel), Low (70% servo travel). Switch J selects.
- AS3X always active — CG is forgiving due to gyro correction
- Beginner mode: Reduced rudder authority in air automatically
- Battery: Included battery determines CG — follow manual placement

---

### 6.4 Freewing (Motion RC)

[SOURCE: Hobby Squawk forum community consensus — no official throw tables publicly available]

**Critical finding:** Freewing factory-recommended throws are 2–3x higher than what most pilots actually fly. Reduce rates significantly after maiden.

**Community consensus expo by surface:**
| Surface | Expo range |
|---|---|
| Aileron | 40–60% |
| Elevator | 20–50% |
| Rudder | 70–90% (for ground handling) |

**Rate reduction approach:** [COMMUNITY]
- Set high rate = factory recommendation for extreme maneuvering reference
- Set low rate = 60–70% of factory recommendation for normal flying
- Set a 3rd rate (if radio supports) = 40–50% of factory for beginner/comfort

---

## PART 7 — CG Reference

### 7.1 Standard CG Ranges by Airframe Category

CG expressed as % of Mean Aerodynamic Chord (MAC) from leading edge:

| Airframe Category | CG Range % MAC | Typical Starting Point |
|---|---|---|
| Trainer (high-wing, beginner) | 28–35% | 30–33% |
| Park flyer / foamy | 25–33% | 30% |
| Sport / scale | 25–30% | 27–28% |
| Aerobatic / sport aerobatic | 20–27% | 25% |
| 3D / extreme aerobatic | 15–25% (near neutral) | 20–22% |
| Warbird | 25–33% | 28–30% |
| Glider / sailplane | 30–40% | 33–35% |
| Flying wing / delta | 15–25% | 20–22% (use specific flying wing calculator) |
| EDF jet (conventional fuselage) | 25–30% | 28–30% |
| Giant scale (100cc+) | 25–33% | 28–30% |

[SOURCES: Flite Test CG article, rc-airplane-world.com, community consensus from multiple sources. Flying wing values from fwcg.3dzone.dk methodology. These are starting ranges — always verify with manufacturer spec if available.]

### 7.2 Effects of CG Position

**Nose heavy (forward of range):**
- Plane pitches down naturally, requires constant up elevator to fly level
- Elevator becomes heavy and sluggish — high elevator rates needed
- Stall behavior: Cleanly recovers, drops nose
- Safe for beginners — predictable if sluggish
- Extreme nose-heavy: Insufficient elevator authority to flare for landing

**Correct CG:**
- Plane flies level with minimal trim
- Elevator feels balanced
- Stall recovery is straightforward

**Tail heavy (aft of range):**
- Plane pitches up, requires constant down elevator to fly level
- Elevator becomes twitchy, sensitive — small inputs cause large response
- Stall behavior: Snap/tip stall, may spin, can be unrecoverable
- [CRITICAL SAFETY] Tail heavy is dangerous. A plane that pitches up on launch and cannot be corrected will climb until it stalls and often spins in.

**Rule:** It is ALWAYS safer to be slightly nose heavy than slightly tail heavy. Never maiden a plane at or behind the aft CG limit.

### 7.3 Field Testing for CG

**Static balance test:**
Balance the plane on your fingertips under each wing at the CG mark. A correctly balanced plane is level to slightly nose-down (5–10°). If the tail drops, add nose weight or move battery forward.

**Dynamic dive test (preferred for accuracy):** [COMMUNITY consensus]
1. Trim plane to fly level at cruise speed
2. Apply 50% throttle, nose level
3. Reduce throttle to idle suddenly — observe what the nose does
4. If nose rises: tail heavy — move CG forward
5. If nose drops: slightly nose heavy — acceptable
6. If nose drops steeply: very nose heavy — move CG aft or add tail weight

**Glider-specific test:** Put glider into a steep dive (45°). Release elevator. If it tucks (steepens the dive): too far forward. If it pulls out: correct to slightly forward. If it steepens AND pitches up: neutral point (move CG forward from here).

### 7.4 Battery Placement for CG

Battery is typically the heaviest movable item. General rules:
- Trainers: Battery near wing leading edge or just forward of it
- Flying wings: Battery at or forward of elevon servo line
- Jets: Battery as far forward as possible in nose area (jets have large tail moment arms)
- Tail-heavy models: Move battery forward, add foam spacers to hold position
- Nose-heavy models: Move battery aft, or use lighter nose battery

Never rely on velcro alone for battery retention on aerobatic or inverted-capable aircraft — use a strap or retention loop.

---

## PART 8 — Battery Reference by Airframe

[SOURCE: HobbyKing battery guide 2026, Unmanned Tech RC plane battery guide, community consensus]

| Airframe Category | Cell count | Capacity | C-rating |
|---|---|---|---|
| Micro / nano (< 400mm) | 1S–2S | 200–600mAh | 25–35C |
| Park flyer trainer (400–900mm) | 2S–3S | 800–2200mAh | 25–35C |
| Trainer 1–1.5m | 3S | 2200–3000mAh | 25–35C |
| Sport / scale 1–1.5m | 3S–4S | 2200–3000mAh | 30–45C |
| Aerobatic / 3D (1–1.8m) | 3S–4S | 2200–4000mAh | 40–60C |
| Glider / sailplane (motor) | 3S–4S | 2200–3000mAh | 25–35C |
| Warbird 1–1.5m | 4S | 2200–3000mAh | 35–50C |
| Small EDF jet 50–70mm | 4S–6S | 1500–2200mAh | 50–80C |
| Mid EDF jet 70–80mm | 6S | 3000–4000mAh | 60–80C |
| Large EDF jet 90mm+ | 6S | 4000–6700mAh | 70–120C |
| Giant scale gas-electric | 6S–12S | varies | 35–60C |

**Rule of thumb:** Battery weight should be 15–25% of total aircraft flying weight. Outside this range, CG and performance suffer.

**C-rating:** Minimum C-rating = peak current draw / battery capacity. Most sport aircraft never need more than 50C in practice. "100C" claims on budget packs are often inflated — treat anything over 50C skeptically and test with an ammeter.

---

## PART 9 — General Rate / Expo Presets

### Standard Starting Presets (Community Consensus)

These are starting points for maiden flights — ALWAYS verify aircraft-specific manual first:

| Skill Level | Control Rate (% of max travel) | Expo |
|---|---|---|
| Beginner | 50–60% | 30–40% |
| Intermediate | 65–75% | 20–30% |
| Sport / expert | 80–90% | 15–25% |
| 3D high rate | 100% | 60–80% |
| 3D low rate | 50–60% | 30–40% |

**Per-surface expo recommendations:**
| Surface | Beginner | Intermediate | Expert |
|---|---|---|---|
| Aileron | 30–40% | 20–30% | 15–20% |
| Elevator | 30–40% | 20–30% | 15–20% |
| Rudder | 20–30% | 15–20% | 10–15% |
| Rudder (ground handling) | 40–70% | 30–50% | 20–40% |

**Freewing EDF jets — adjusted community consensus:**
- Aileron expo: 40–60%
- Elevator expo: 20–50%
- Rudder expo: 70–90% (primarily for ground steering sensitivity)

### AS3X Models (E-flite BNF)
Do not set rates below 50% — the AS3X gyro expects full servo travel authority. Instead, limit throws by adjusting servo arm geometry physically, or use the AS3X/SAFE programming via forward programming to set mode-specific limits.

---

## PART 10 — Crash Risk Summary by Mix Type

| Mix | Primary crash cause | Prevention |
|---|---|---|
| Elevon | Wrong elevator sign on maiden, or CG too far aft | Verify control directions on ground; start with conservative CG |
| V-tail | Double-mixing (TX + RX both mixing) | Confirm which device handles the mix |
| Flaperon | No elevator compensation on flap deployment | Always add at least -10% ele compensation |
| Crow / butterfly | No elevator compensation causing balloon | Dial in crow-to-ele mix before first landing attempt |
| Flying wing CG | Too far aft = unrecoverable pitch-up stall | Use dedicated flying wing CG calculator; maiden nose-heavy |
| Differential aileron | Applied at input level causing reversed diff with trim | Apply at MIXER level on each aileron channel separately |
| Throttle cut | Kill switch same as arm switch | Use dedicated 2-position toggle; verify sequence: stick down → arm |
| Thrust reverser | Activating in flight | Physical switch guard; limit channel only activates below 5 knots / motor at idle |
| Gear sequencing | Switch/servo mismatch at power-on | Always park gear in same state before power-off |
| Snap flap | Too much flap deflection at high speed | Apply only in Thermal mode flight mode; limit weight to 25% max |
| Tailerons | Fighting main wing ailerons | Keep taileron aileron weight low (30%) when separate ailerons present |

---

## APPENDIX A — EdgeTX YAML Mix Structure (Reference Only)

EdgeTX stores models in `.yml` files on the SD card under `/MODELS/`. The YAML format has been the default since EdgeTX 2.6.

Note: EdgeTX does not officially publish a full YAML schema. The following field names are derived from community analysis of actual model files and the EdgeTX source code (`yaml_datastructs.cpp`):

```yaml
# Conceptual structure (field names may vary by EdgeTX version)
mixes:
  - ch: 0          # Channel index (0-based: 0=CH1)
    name: "Ail"    # Up to 6 characters
    src: 4         # Source index (sticks, inputs, channels use numeric IDs)
    weight: 100    # -500 to +500
    offset: 0      # -500 to +500
    curve:
      type: 0      # 0=none, 1=expo, 2=func, 3=custom
      value: 25    # expo %
    sw: 0          # Switch index
    mltpx: 0       # 0=ADD, 1=MULTIPLY, 2=REPLACE
    phases: 0      # Bitmask of active flight modes
    trimEnabled: true
    delayUp: 0
    delayDown: 0
    speedUp: 0
    speedDown: 0
    warning: 0
```

[UNCERTAINTY FLAG: The above is a conceptual representation. Actual YAML field names in EdgeTX firmware may differ. Always validate generated YAML against a known-good model file by loading in EdgeTX Companion before flashing to radio.]

**Recommended approach for the wizard:** Generate models using EdgeTX Companion (the companion application), which has official YAML read/write support. Export a baseline model, then surgically modify the YAML fields for each mix type.

---

## APPENDIX B — Sources Summary

Primary technical sources:
- [OpenTX 2.2 Manual — Basic Elevon](https://doc.open-tx.org/manual-for-opentx-2-2/model-setup-examples/basic-elevon)
- [rc-soar.com — Mixer fundamentals](https://rc-soar.com/edgetx/basics/mixers/index.php)
- [rc-soar.com — Aileron differential (corrected method)](https://rc-soar.com/edgetx/setups/diff/diff_bug.php)
- [rc-soar.com — Gear sequencer](https://rc-soar.com/edgetx/setups/sequencer/)
- [rc-soar.com — E-Soar Plus F5J template](https://rc-soar.com/edgetx/setups/esoarplus/index.php)
- [rc-soar.com — Snapflap blog](https://rc-soar.blogspot.com/2017/09/optimising-for-f3f-snapflap-tuning.html)
- [EdgeTX User Manual — Mixes](https://manual.edgetx.org/color-radios/model-settings/inputs-mixes-and-outputs/mixes)
- [Oscar Liang — Inputs/Mixes/Outputs](https://oscarliang.com/inputs-mixes-outputs/)
- [Oscar Liang — Taranis mixer for wings](https://oscarliang.com/taranis-mixer-for-wings/)
- [Mr.D-RC — Throttle cut with arming](https://www.mrd-rc.com/tutorials-tools-and-testing/opentx-tutorials/throttle-cut-with-safety-arming/)
- [openrcforums — Differential thrust](https://openrcforums.com/forum/viewtopic.php?t=119)
- [openrcforums — Butterfly/crow mixing](https://openrcforums.com/forum/viewtopic.php?t=886)
- [Newton Airlines — Full house glider OpenTX](http://newtonairlines.blogspot.com/2020/01/full-house-glider-opentx.html)
- [RC glider wing setups](https://www.rc-airplane-world.com/rc-glider-wing-setups.html)
- [Vector Thrust setup](https://openrcforums.com/forum/viewtopic.php?t=860)

Manufacturer sources:
- [E-flite Apprentice STS manual (EFL3700)](https://www.horizonhobby.com/on/demandware.static/-/Sites-horizon-master/default/Manuals/EFL3700-Manual-EN.pdf)
- [E-flite Timber X manual (EFL3850)](https://www.horizonhobby.com/on/demandware.static/Sites-horizon-us-Site/Sites-horizon-master/default/Manuals/EFL3850-75-Manual-EN.pdf)
- [E-flite Carbon-Z Cub SS manual (EFL124500)](https://www.horizonhobby.com/on/demandware.static/-/Sites-horizon-master/default/dw9bfe9ca9/Manuals/EFL124500-manual-EN.pdf)
- [E-flite Habu STS manual (EFL01500)](https://www.horizonhobby.com/on/demandware.static/-/Sites-horizon-master/default/dw1ff64496/Manuals/EFL01500-manual-en.pdf)
- [E-flite Habu SS 50mm manual (EFL02350)](https://www.horizonhobby.com/on/demandware.static/-/Sites-horizon-master/default/dw0a870a54/Manuals/EFL02350-EFL02375-Manual-EN.pdf)
- [FMS Fox review — fmshobby.com](https://www.fmshobby.com/blogs/rc-airplanes/fms-3000mm-fox-review)
- [FMS Viper 90mm EDF manual](https://www.horizonhobby.com/on/demandware.static/-/Sites-horizon-master/default/Manuals/Smart%20Viper%2090mm%20EDF%20Manual_EN.pdf)
- [HobbyZone AeroScout S2 manual (HBZ380001)](https://www.horizonhobby.com/on/demandware.static/-/Sites-horizon-master/default/Manuals/HBZ380001_MANUAL_EN.pdf)
- [Spektrum AS3X+ Wiki](https://wiki.spektrumrc.com/spektrum/as3x-setup-guide)
- [Freewing rates community thread — Hobby Squawk](https://www.hobbysquawk.com/forum/rc-airplanes/miscellaneous-rc-radio-control-topics/78395-typical-freewing-edf-aileron-rate-recommendations)
- [Model Airplane News — dual rates/expo](https://www.modelairplanenews.com/radio-fundamentals-fly-better-dual-rates-expo-mixing/)
- [HobbyKing LiPo guide 2026](https://hobbyking.com/blog/best-battery-for-rc-plane)
- [rc-airplane-world.com balancing](https://www.rc-airplane-world.com/balancing-rc-airplanes.html)
- [absolutehobbyz.com tail-heavy symptoms](https://www.absolutehobbyz.com/how-treat-rc-plane-tail-heavy-symptoms.html)
