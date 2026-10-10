// 8-bit SFX synthesised at runtime with WebAudio — zero bytes of samples, original by construction.
// Off until App applies the player's sound setting (settings.sound, on by default); browsers block audio until a user
// gesture anyway.

export type SfxName =
  | 'rattle'
  | 'land'
  | 'hit'
  | 'super'
  | 'faint'
  | 'levelup'
  | 'catch'
  | 'gold'
  | 'button'
  | 'error'
  | 'heal'

let enabled = false
let ctx: AudioContext | null = null

export function setSfxEnabled(on: boolean) {
  enabled = on
}

function audio(): AudioContext | null {
  if (!enabled || typeof window === 'undefined') return null
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctx ??= new AC()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

type Note = { f: number; t: number; d: number; type?: OscillatorType; v?: number; slide?: number }

function play(notes: Note[]) {
  const ac = audio()
  if (!ac) return
  const now = ac.currentTime
  const master = ac.createGain()
  master.gain.value = 0.18
  master.connect(ac.destination)
  for (const n of notes) {
    const o = ac.createOscillator()
    const g = ac.createGain()
    o.type = n.type ?? 'square'
    o.frequency.setValueAtTime(n.f, now + n.t)
    if (n.slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, n.slide), now + n.t + n.d)
    g.gain.setValueAtTime(n.v ?? 0.6, now + n.t)
    g.gain.exponentialRampToValueAtTime(0.001, now + n.t + n.d)
    o.connect(g)
    g.connect(master)
    o.start(now + n.t)
    o.stop(now + n.t + n.d + 0.02)
  }
}

function noise(duration: number, v = 0.5, t = 0) {
  const ac = audio()
  if (!ac) return
  const len = Math.floor(ac.sampleRate * duration)
  const buf = ac.createBuffer(1, len, ac.sampleRate)
  const d = buf.getChannelData(0)
  let last = 0
  for (let i = 0; i < len; i++) {
    if (i % 6 === 0) last = Math.random() * 2 - 1 // crushed noise
    d[i] = last * (1 - i / len)
  }
  const src = ac.createBufferSource()
  const g = ac.createGain()
  g.gain.value = v * 0.18
  src.buffer = buf
  src.connect(g)
  g.connect(ac.destination)
  src.start(ac.currentTime + t)
}

const SOUNDS: Record<SfxName, () => void> = {
  rattle: () => {
    for (let i = 0; i < 5; i++) noise(0.03, 0.4, i * 0.05)
  },
  land: () => play([{ f: 180, t: 0, d: 0.06, type: 'triangle', v: 0.8, slide: 90 }]),
  hit: () => {
    noise(0.12, 0.8)
    play([{ f: 220, t: 0, d: 0.1, slide: 60 }])
  },
  super: () => {
    noise(0.18, 1)
    play([
      { f: 330, t: 0, d: 0.08, slide: 110 },
      { f: 660, t: 0.07, d: 0.12, slide: 180 },
    ])
  },
  faint: () => play([{ f: 440, t: 0, d: 0.6, type: 'square', slide: 60 }]),
  levelup: () =>
    play([
      { f: 523, t: 0, d: 0.1 },
      { f: 659, t: 0.1, d: 0.1 },
      { f: 784, t: 0.2, d: 0.1 },
      { f: 1047, t: 0.3, d: 0.25 },
    ]),
  catch: () =>
    play([
      { f: 784, t: 0, d: 0.08 },
      { f: 988, t: 0.09, d: 0.08 },
      { f: 1175, t: 0.18, d: 0.08 },
      { f: 1568, t: 0.3, d: 0.3, type: 'triangle' },
    ]),
  gold: () =>
    play([
      { f: 988, t: 0, d: 0.06 },
      { f: 1319, t: 0.06, d: 0.18 },
    ]),
  button: () => play([{ f: 880, t: 0, d: 0.03, v: 0.3 }]),
  error: () =>
    play([
      { f: 196, t: 0, d: 0.1 },
      { f: 147, t: 0.11, d: 0.16 },
    ]),
  heal: () =>
    play([
      { f: 523, t: 0, d: 0.12, type: 'triangle' },
      { f: 659, t: 0.12, d: 0.12, type: 'triangle' },
      { f: 784, t: 0.24, d: 0.12, type: 'triangle' },
      { f: 1047, t: 0.36, d: 0.3, type: 'triangle' },
    ]),
}

export function sfx(name: SfxName) {
  if (!enabled) return
  try {
    SOUNDS[name]()
  } catch {
    /* audio is best-effort */
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// The animation cues (src/fx timelines): each one a named sound built from two primitives, a tone and a filtered
// noise burst, scheduled `at` seconds ahead. Same switch as every other sound (`settings.sound`).

interface ToneOpts {
  type?: OscillatorType
  vol?: number
  at?: number
  slide?: number
  attack?: number
}
interface NoiseOpts {
  vol?: number
  at?: number
  freq?: number
  q?: number
  slide?: number
  type?: BiquadFilterType
}

export function tone(freq: number, dur: number, { type = 'square', vol = 0.06, at = 0, slide = 0, attack = 0.005 }: ToneOpts = {}) {
  const a = audio()
  if (!a) return
  const t0 = a.currentTime + at
  const o = a.createOscillator()
  const v = a.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t0)
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur)
  v.gain.setValueAtTime(0, t0)
  v.gain.linearRampToValueAtTime(vol, t0 + attack)
  v.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  o.connect(v).connect(a.destination)
  o.start(t0)
  o.stop(t0 + dur + 0.02)
}

export function hiss(dur: number, { vol = 0.08, at = 0, freq = 1200, q = 0.8, slide = 0, type = 'bandpass' }: NoiseOpts = {}) {
  const a = audio()
  if (!a) return
  const t0 = a.currentTime + at
  const n = Math.ceil(a.sampleRate * dur)
  const buf = a.createBuffer(1, n, a.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
  const s = a.createBufferSource()
  s.buffer = buf
  const f = a.createBiquadFilter()
  f.type = type
  f.frequency.setValueAtTime(freq, t0)
  if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur)
  f.Q.value = q
  const v = a.createGain()
  v.gain.setValueAtTime(vol, t0)
  v.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  s.connect(f).connect(v).connect(a.destination)
  s.start(t0)
}

/** The Pokémon Center's six-beat jingle, and the evolution and hatching fanfares. */
const CENTER_MELODY = [523, 659, 784, 659, 880, 1047]
const EVOLVE_FANFARE = [523, 659, 784, 1047, 784, 1047]
const HATCH_FANFARE = [784, 988, 1175, 1568]

/** The timelines' sounds, by cue. `n` varies a sound inside a series (each Razor Leaf chip a step higher). */
const FX_SOUNDS = {
  'fire.inhale': () => hiss(0.45, { freq: 400, slide: 1200, vol: 0.05 }),
  'fire.stream': () => hiss(1.1, { freq: 900, type: 'lowpass', vol: 0.09 }),
  'fire.hit': () => hiss(0.25, { freq: 300, vol: 0.12 }),
  'water.charge': () => hiss(0.4, { freq: 2400, slide: -1200, vol: 0.04 }),
  'water.jet': () => hiss(1.05, { freq: 1800, q: 0.6, vol: 0.08 }),
  'leaf.chip': (n = 0) => tone(900 + n * 40, 0.05, { type: 'square', vol: 0.025 }),
  'leaf.slash': () => hiss(0.3, { freq: 3000, slide: -2000, vol: 0.08 }),
  'thunder.charge': () => hiss(0.6, { freq: 3000, q: 4, vol: 0.03 }),
  'thunder.strike': () => {
    hiss(0.3, { freq: 2500, slide: -2200, vol: 0.1 })
    tone(70, 0.3, { type: 'sawtooth', vol: 0.05, slide: -30 })
  },
  'psychic.focus': () => {
    tone(220, 1.4, { type: 'sine', vol: 0.05, slide: 220 })
    tone(223, 1.4, { type: 'sine', vol: 0.04, slide: 260 })
  },
  'psychic.slam': () => hiss(0.35, { freq: 500, vol: 0.1 }),
  'catch.throw': () => hiss(0.3, { freq: 1500, slide: 1500, vol: 0.04 }),
  'catch.open': () => tone(500, 0.3, { type: 'square', vol: 0.04, slide: 700 }),
  'catch.close': () => tone(1200, 0.06, { vol: 0.04 }),
  'catch.wobble': () => tone(180, 0.05, { type: 'square', vol: 0.06 }),
  'catch.settle': () => tone(140, 0.04, { type: 'square', vol: 0.05 }),
  'catch.gotcha': () => {
    tone(880, 0.12, { vol: 0.05 })
    tone(1320, 0.3, { vol: 0.05, at: 0.12 })
  },
  'catch.break': () => hiss(0.25, { freq: 900, vol: 0.1 }),
  'legend.pulse': () => tone(55, 0.3, { type: 'sine', vol: 0.12 }),
  'legend.shatter': () => hiss(0.6, { freq: 4000, slide: -3500, vol: 0.05 }),
  'legend.heart': () => tone(48, 0.25, { type: 'sine', vol: 0.14 }),
  'legend.roar': () => {
    tone(180, 0.9, { type: 'sawtooth', vol: 0.07, slide: -120 })
    tone(184, 0.9, { type: 'sawtooth', vol: 0.05, slide: -130 })
    hiss(0.8, { freq: 600, type: 'lowpass', vol: 0.1 })
  },
  'ball.pop': () => tone(700, 0.15, { vol: 0.04, slide: 500 }),
  'center.place': (n = 0) => tone(660 + n * 70, 0.06, { vol: 0.03 }),
  'center.note': (n = 0) => {
    const f = CENTER_MELODY[n % CENTER_MELODY.length]!
    const long = n === CENTER_MELODY.length - 1
    tone(f, long ? 0.6 : 0.2, { type: 'square', vol: 0.05 })
    tone(f / 2, long ? 0.6 : 0.2, { type: 'triangle', vol: 0.05 })
  },
  'evolve.white': () => tone(392, 0.4, { type: 'triangle', vol: 0.05, slide: 200 }),
  'evolve.touch': () => tone(1319, 0.2, { type: 'square', vol: 0.04 }),
  'evolve.swap': (n = 0) => tone(330 + n * 26, 0.06, { type: 'square', vol: 0.03 }),
  'evolve.burst': () => {
    hiss(0.5, { vol: 0.08, freq: 2400 })
    tone(1047, 0.5, { type: 'square', vol: 0.04 })
  },
  'evolve.fanfare': (n = 0) => tone(EVOLVE_FANFARE[n]!, n === 5 ? 0.6 : 0.12, { type: 'square', vol: 0.045 }),
  'hatch.wobble': () => hiss(0.04, { vol: 0.05, freq: 900 }),
  'hatch.crack': () => hiss(0.08, { vol: 0.07, freq: 4200 }),
  'hatch.burst': () => {
    hiss(0.35, { vol: 0.09, freq: 3000 })
    tone(1568, 0.3, { type: 'square', vol: 0.035 })
  },
  'hatch.fanfare': (n = 0) => tone(HATCH_FANFARE[n]!, n === 3 ? 0.5 : 0.12, { type: 'square', vol: 0.045 }),
  // Mega Evolution and Gigantamax are the biggest moments of a fight: layered chords, a sub boom and a rising charge,
  // not single beeps.
  'mega.key': () => {
    tone(1568, 0.25, { type: 'square', vol: 0.05 })
    tone(2093, 0.3, { type: 'triangle', vol: 0.05, at: 0.06 })
  },
  'mega.beam': () => {
    tone(392, 0.7, { type: 'sawtooth', vol: 0.05, slide: 700 })
    tone(523, 0.7, { type: 'triangle', vol: 0.07, slide: 900 })
    hiss(0.6, { freq: 2400, vol: 0.05, slide: 2000 })
  },
  'mega.orb': () => {
    tone(196, 0.8, { type: 'sawtooth', vol: 0.06, slide: 400 })
    tone(392, 0.8, { type: 'triangle', vol: 0.07, slide: 520 })
  },
  'mega.swap': (n = 0) => tone(440 + n * 45, 0.06, { type: 'square', vol: 0.04 }),
  'mega.crack': () => {
    hiss(0.45, { freq: 2200, vol: 0.08 })
    tone(1760, 0.3, { type: 'square', vol: 0.035, slide: 800 })
  },
  'mega.burst': () => {
    hiss(0.9, { vol: 0.16, freq: 1200, slide: -900 })
    tone(55, 0.9, { type: 'sine', vol: 0.22, slide: -20 })
    tone(110, 0.7, { type: 'sawtooth', vol: 0.06, slide: -40 })
    ;[784, 988, 1175].forEach((f) => tone(f, 0.6, { type: 'square', vol: 0.035 }))
  },
  'mega.fanfare': (n = 0) => {
    const f = [659, 784, 1047, 1319][n]!
    const d = n === 3 ? 0.8 : 0.13
    tone(f, d, { type: 'square', vol: 0.055 })
    tone(f * 0.75, d, { type: 'square', vol: 0.03 })
    tone(f / 2, d, { type: 'triangle', vol: 0.06 })
  },
  'gmax.recall': () => tone(880, 0.35, { type: 'triangle', vol: 0.06, slide: -600 }),
  'gmax.grow': () => {
    tone(82, 1.1, { type: 'sawtooth', vol: 0.06, slide: 260 })
    tone(41, 1.1, { type: 'sine', vol: 0.16, slide: 120 })
    hiss(1.0, { freq: 300, vol: 0.06, slide: 900 })
  },
  'gmax.throw': () => hiss(0.4, { freq: 900, vol: 0.08, slide: 1200 }),
  'gmax.open': () => {
    tone(220, 0.9, { type: 'square', vol: 0.05, slide: -100 })
    tone(55, 0.9, { type: 'sine', vol: 0.18 })
  },
  'gmax.step': () => {
    hiss(0.3, { freq: 160, vol: 0.16 })
    tone(45, 0.35, { type: 'sine', vol: 0.25, slide: -15 })
  },
  'gmax.reveal': () => {
    hiss(1.1, { freq: 160, vol: 0.18 })
    tone(49, 1.2, { type: 'sine', vol: 0.25 })
    tone(98, 1.0, { type: 'sawtooth', vol: 0.07 })
    ;[196, 247, 294].forEach((f) => tone(f, 0.9, { type: 'square', vol: 0.03 }))
  },
  'gmax.fanfare': (n = 0) => {
    const f = [392, 494, 587, 784][n]!
    const d = n === 3 ? 0.85 : 0.14
    tone(f, d, { type: 'square', vol: 0.055 })
    tone(f * 0.75, d, { type: 'square', vol: 0.03 })
    tone(f / 4, d, { type: 'sawtooth', vol: 0.05 })
  },
  'gmax.shrink': () => {
    tone(440, 0.6, { type: 'triangle', vol: 0.06, slide: -320 })
    hiss(0.5, { freq: 1200, vol: 0.05, slide: -900 })
  },
  'form.flash': () => tone(1047, 0.25, { type: 'square', vol: 0.04 }),
  'starter.drop': () => tone(1200, 0.5, { type: 'triangle', vol: 0.03, slide: -700 }),
  'starter.land': () => hiss(0.08, { freq: 500, vol: 0.06 }),
  'starter.open': () => tone(880, 0.12, { type: 'square', vol: 0.04 }),
  'starter.fanfare': (n = 0) => tone([523, 659, 784, 1047][n]!, 0.12, { type: 'square', vol: 0.04 }),
  'impact.windup': () => hiss(0.2, { freq: 700, slide: 900, vol: 0.04 }),
  'impact.hit': () => {
    hiss(0.18, { freq: 420, vol: 0.12 })
    tone(150, 0.14, { type: 'square', vol: 0.05, slide: -80 })
  },
} satisfies Record<string, (n?: number) => void>

export type FxSound = keyof typeof FX_SOUNDS

export function fxSound(name: FxSound, n?: number) {
  if (!enabled) return
  try {
    FX_SOUNDS[name](n)
  } catch {
    /* audio is best-effort */
  }
}
