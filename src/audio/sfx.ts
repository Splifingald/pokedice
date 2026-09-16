// 8-bit SFX synthesised at runtime with WebAudio — zero bytes of samples, original by construction.
// Muted by default; browsers block audio until a user gesture anyway.

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
