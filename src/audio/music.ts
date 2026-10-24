// Battle music (docs/38 §5): an original 8-bit loop under the fights, synthesised on the effects' AudioContext
// (sfx.ts `audio`), so no audio file is ever fetched and the Sound switch silences it with everything else. Written
// for this game (A minor, 150 BPM, 16 bars), not a copy of any Pokémon tune.
//
// Low on CPU: a slow timer (every 100 ms) books the next 300 ms of notes on the AudioContext's own clock, which keeps
// perfect time between wake-ups; nothing runs per frame. A hidden tab pauses it (and books nothing), the result card
// or leaving the fight fades it out.
import { audio } from './sfx'

// ---------------------------------------------------------------------------------------------------------------------
// The tune: pure data, and the pure functions that read it (tests/music.test.ts).

/** Sixteenths per bar. */
export const BAR = 16

/** A note name ("G#4") as its MIDI number: A4 = 69. */
export function midi(name: string): number {
  const m = /^([A-G])(#?)(-?\d)$/.exec(name)
  if (!m) throw new Error(`Not a note: ${name}`)
  const semi = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1] as 'C']
  return 12 * (Number(m[3]) + 1) + semi + (m[2] ? 1 : 0)
}

export const hz = (n: number) => 440 * 2 ** ((n - 69) / 12)

type Chord = 'Am' | 'F' | 'G' | 'E' | 'Dm'

/** Each chord's root (the bass) and the tones the arpeggio runs up. */
const CHORDS: Record<Chord, { root: string; tones: [string, string, string, string] }> = {
  Am: { root: 'A2', tones: ['A4', 'C5', 'E5', 'A5'] },
  F: { root: 'F2', tones: ['F4', 'A4', 'C5', 'F5'] },
  G: { root: 'G2', tones: ['G4', 'B4', 'D5', 'G5'] },
  E: { root: 'E2', tones: ['E4', 'G#4', 'B4', 'E5'] },
  Dm: { root: 'D2', tones: ['D4', 'F4', 'A4', 'D5'] },
}

/**
 * The song, a bar a row: its chord, the lead's notes ("name:sixteenths", "-" a rest; each bar adds up to 16) and the
 * drums (k kick, s snare, h hat, - nothing; one character a sixteenth). Two eight-bar halves, the second climbing
 * higher, ending on E to fall back into the first.
 */
export const SONG: { bpm: number; bars: { chord: Chord; lead: string; drums: string }[] } = {
  bpm: 150,
  bars: [
    { chord: 'Am', lead: 'A4:2 C5:2 E5:4 D5:2 C5:2 E5:4', drums: 'k-h-s-h-k-khs-h-' },
    { chord: 'Am', lead: 'A5:6 G5:2 E5:4 C5:4', drums: 'k-h-s-h-k-khs-h-' },
    { chord: 'F', lead: 'F5:2 E5:2 C5:2 A4:2 C5:4 F5:4', drums: 'k-h-s-h-k-khs-h-' },
    { chord: 'G', lead: 'G5:6 F5:2 D5:4 B4:4', drums: 'k-h-s-h-k-khs-hs' },
    { chord: 'Am', lead: 'A4:2 C5:2 E5:4 D5:2 C5:2 A5:4', drums: 'k-h-s-h-k-khs-h-' },
    { chord: 'Am', lead: 'C6:4 B5:2 A5:2 G5:4 E5:4', drums: 'k-h-s-h-k-khs-h-' },
    { chord: 'F', lead: 'F5:4 A5:4 G5:4 F5:4', drums: 'k-h-s-h-k-khs-h-' },
    { chord: 'E', lead: 'E5:6 D5:2 B4:2 G#4:2 B4:4', drums: 'k-h-s-h-k-hsssss' },
    { chord: 'Dm', lead: 'D5:3 F5:3 A5:2 G5:2 F5:2 E5:4', drums: 'k-h-s-hkk-h-s-h-' },
    { chord: 'Dm', lead: 'D5:4 A4:4 D5:2 E5:2 F5:4', drums: 'k-h-s-hkk-h-s-h-' },
    { chord: 'Am', lead: 'E5:3 A5:3 C6:2 B5:4 A5:4', drums: 'k-h-s-hkk-h-s-h-' },
    { chord: 'Am', lead: 'E5:8 C5:2 D5:2 E5:4', drums: 'k-h-s-hkk-h-s-hs' },
    { chord: 'F', lead: 'F5:3 A5:3 C6:2 A5:4 F5:4', drums: 'k-h-s-hkk-h-s-h-' },
    { chord: 'G', lead: 'G5:3 B5:3 D6:2 B5:4 G5:4', drums: 'k-h-s-hkk-h-s-h-' },
    { chord: 'E', lead: 'G#4:4 B4:4 E5:8', drums: 'k-h-s-hkk-h-s-h-' },
    { chord: 'E', lead: 'B4:4 G#4:4 E4:4 G#4:2 B4:2', drums: 'k-h-s-k-s-k-ssss' },
  ],
}

export type Voice = 'lead' | 'arp' | 'bass' | 'kick' | 'snare' | 'hat'

/** One thing to play: on which sixteenth of the loop, which voice, which pitch (none for a drum), how many sixteenths. */
export interface MusicEvent {
  step: number
  voice: Voice
  note?: number
  len: number
}

const DRUM: Record<string, Voice> = { k: 'kick', s: 'snare', h: 'hat' }

/** The song as its events, by sixteenth: `byStep[i]` is what starts on step `i` of the loop. */
export function compileSong(song = SONG): { steps: number; byStep: MusicEvent[][] } {
  const steps = song.bars.length * BAR
  const byStep: MusicEvent[][] = Array.from({ length: steps }, () => [])
  const add = (e: MusicEvent) => byStep[e.step]!.push(e)
  song.bars.forEach((bar, b) => {
    const at = b * BAR
    let s = 0
    for (const tok of bar.lead.split(' ')) {
      const [name, len] = tok.split(':')
      const n = Number(len)
      if (name !== '-') add({ step: at + s, voice: 'lead', note: midi(name!), len: n })
      s += n
    }
    if (s !== BAR) throw new Error(`Bar ${b + 1}'s lead lasts ${s} sixteenths`)
    const { root, tones } = CHORDS[bar.chord]
    for (let i = 0; i < BAR; i++) {
      // The arpeggio runs up the chord every sixteenth; the bass pumps eighths, root and octave.
      add({ step: at + i, voice: 'arp', note: midi(tones[i % 4]!), len: 1 })
      if (i % 2 === 0) add({ step: at + i, voice: 'bass', note: midi(root) + (i % 4 ? 12 : 0), len: 2 })
      const d = DRUM[bar.drums[i] ?? '-']
      if (d) add({ step: at + i, voice: d, len: 1 })
    }
  })
  return { steps, byStep }
}

/** How long a sixteenth lasts, in seconds. */
export const stepSeconds = (bpm: number) => 60 / bpm / 4

/** Where the booking stands: the next sixteenth to book and when it plays, on the AudioContext's clock. */
export interface Cursor {
  step: number
  time: number
}

/**
 * The sixteenths to book now, from `cursor` until `until` (now + the look-ahead), wrapping round the loop, and the
 * cursor after them. A cursor left behind `now` (the page was busy and the timer late) jumps to `now` rather than
 * cramming the missed notes in at once.
 */
export function due(
  cursor: Cursor,
  now: number,
  until: number,
  step: number,
  loop: number,
): { steps: Cursor[]; next: Cursor } {
  let { step: i, time } = cursor
  if (time < now) time = now + 0.02
  const steps: Cursor[] = []
  while (time < until) {
    steps.push({ step: i, time })
    i = (i + 1) % loop
    time += step
  }
  return { steps, next: { step: i, time } }
}

/** The sixteenth sounding at `now`, for a cursor booked ahead of it: where a pause picks up again. */
export function stepAt(cursor: Cursor, now: number, step: number, loop: number): number {
  // A hair under, so a step starting right now (bar the float's last digit) counts as playing.
  const ahead = Math.max(0, Math.ceil((cursor.time - now) / step - 1e-6))
  return (((cursor.step - ahead) % loop) + loop) % loop
}

/** Settings' three volumes (`settings.musicVolume`), and the one an unset setting means. */
export const MUSIC_VOLUMES = { low: 0.35, mid: 0.65, high: 1 } as const
export type MusicVolumeStep = keyof typeof MUSIC_VOLUMES
export const MUSIC_VOLUME: number = MUSIC_VOLUMES.mid

/** The step a stored volume shows as: the nearest one. */
export function volumeStep(v: number | undefined): MusicVolumeStep {
  const x = v ?? MUSIC_VOLUME
  let best: MusicVolumeStep = 'mid'
  for (const k of Object.keys(MUSIC_VOLUMES) as MusicVolumeStep[])
    if (Math.abs(MUSIC_VOLUMES[k] - x) < Math.abs(MUSIC_VOLUMES[best] - x)) best = k
  return best
}

// ---------------------------------------------------------------------------------------------------------------------
// The player.

/** How often the timer wakes, and how far ahead it books: the look-ahead covers a late wake-up or two. */
const TICK_MS = 100
const LOOKAHEAD = 0.3
/** The whole mix at full volume: under the effects, which play at about this level one note at a time. */
const LEVEL = 0.5
const VOICE_VOL: Record<Voice, number> = {
  lead: 0.07,
  arp: 0.022,
  bass: 0.13,
  kick: 0.16,
  snare: 0.07,
  hat: 0.025,
}

let song: ReturnType<typeof compileSong> | null = null
let ctx: AudioContext | null = null
let out: GainNode | null = null
let cursor: Cursor = { step: 0, time: 0 }
let timer: ReturnType<typeof setInterval> | null = null
let volume = MUSIC_VOLUME
/** Wanted on (between start and stop): a hidden tab pauses it without ending it. */
let wanted = false
let fadeTimer: ReturnType<typeof setTimeout> | null = null
let pulse: PeriodicWave | null = null
let noise: AudioBuffer | null = null

/** The 25 % pulse of the old consoles' lead channels: thinner and brighter than a square. */
function pulseWave(a: AudioContext): PeriodicWave {
  if (pulse) return pulse
  const n = 32
  const real = new Float32Array(n)
  const imag = new Float32Array(n)
  for (let k = 1; k < n; k++) {
    real[k] = Math.sin(2 * Math.PI * k * 0.25) / (Math.PI * k)
    imag[k] = (1 - Math.cos(2 * Math.PI * k * 0.25)) / (Math.PI * k)
  }
  pulse = a.createPeriodicWave(real, imag)
  return pulse
}

/** One second of crushed noise, made once, for every drum hit. */
function noiseBuffer(a: AudioContext): AudioBuffer {
  if (noise) return noise
  const buf = a.createBuffer(1, a.sampleRate, a.sampleRate)
  const d = buf.getChannelData(0)
  let last = 0
  for (let i = 0; i < d.length; i++) {
    if (i % 4 === 0) last = Math.random() * 2 - 1
    d[i] = last
  }
  noise = buf
  return buf
}

function playNote(a: AudioContext, dest: AudioNode, e: MusicEvent, t: number, sixteenth: number) {
  const g = a.createGain()
  const v = VOICE_VOL[e.voice]
  g.connect(dest)
  if (e.note != null) {
    const o = a.createOscillator()
    if (e.voice === 'lead') o.setPeriodicWave(pulseWave(a))
    else o.type = e.voice === 'bass' ? 'triangle' : 'square'
    o.frequency.setValueAtTime(hz(e.note), t)
    // Detached notes, as the chip played them: each one stops a little short of the next.
    const d = e.len * sixteenth * (e.voice === 'arp' ? 0.6 : 0.85)
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(v, t + 0.004)
    g.gain.setValueAtTime(v, t + d * 0.7)
    g.gain.linearRampToValueAtTime(0, t + d)
    o.connect(g)
    o.start(t)
    o.stop(t + d + 0.01)
    return
  }
  if (e.voice === 'kick') {
    // A falling triangle: the chip's kick.
    const o = a.createOscillator()
    o.type = 'triangle'
    o.frequency.setValueAtTime(160, t)
    o.frequency.exponentialRampToValueAtTime(45, t + 0.09)
    g.gain.setValueAtTime(v, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1)
    o.connect(g)
    o.start(t)
    o.stop(t + 0.11)
    return
  }
  const s = a.createBufferSource()
  s.buffer = noiseBuffer(a)
  const f = a.createBiquadFilter()
  const snare = e.voice === 'snare'
  f.type = snare ? 'bandpass' : 'highpass'
  f.frequency.value = snare ? 1800 : 7000
  const d = snare ? 0.09 : 0.03
  g.gain.setValueAtTime(v, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + d)
  s.connect(f).connect(g)
  // A different stretch of the noise each hit, so no two sound quite alike.
  s.start(t, Math.random() * 0.8, d + 0.01)
}

function tick() {
  if (!ctx || !out || !song) return
  if (ctx.state !== 'running') return
  const sixteenth = stepSeconds(SONG.bpm)
  const now = ctx.currentTime
  const { steps, next } = due(cursor, now, now + LOOKAHEAD, sixteenth, song.steps)
  for (const c of steps) for (const e of song.byStep[c.step]!) playNote(ctx, out, e, c.time, sixteenth)
  cursor = next
}

function startClock() {
  if (timer) return
  tick()
  timer = setInterval(tick, TICK_MS)
}

function stopClock() {
  if (timer) clearInterval(timer)
  timer = null
}

/** A fresh output for the music, faded in: notes already booked on an old one die with it. */
function openOutput(a: AudioContext) {
  const g = a.createGain()
  g.gain.setValueAtTime(0, a.currentTime)
  g.gain.linearRampToValueAtTime(volume * LEVEL, a.currentTime + 0.25)
  g.connect(a.destination)
  return g
}

/** Ramps the output to `level` over `secs`, from wherever it stands now. */
function rampTo(level: number, secs: number) {
  if (!ctx || !out) return
  const t = ctx.currentTime
  out.gain.cancelScheduledValues(t)
  out.gain.setValueAtTime(out.gain.value, t)
  out.gain.linearRampToValueAtTime(level, t + secs)
}

/** Fades the output out, and lets it go once the notes booked on it are over. */
function closeOutput(fade: number) {
  const g = out
  rampTo(0, fade)
  out = null
  if (g) setTimeout(() => g.disconnect(), (fade + LOOKAHEAD) * 1000 + 50)
}

/** A hidden tab pauses the music where it is, and a visible one picks it up from there. */
function onVisibility() {
  if (!wanted || !ctx || !song) return
  if (document.hidden) {
    // Hidden while fading out: it was ending anyway.
    if (fadeTimer) return end()
    if (!out) return
    cursor = { step: stepAt(cursor, ctx.currentTime, stepSeconds(SONG.bpm), song.steps), time: 0 }
    stopClock()
    closeOutput(0.05)
  } else if (!out) {
    out = openOutput(ctx)
    cursor = { step: cursor.step, time: ctx.currentTime + 0.05 }
    startClock()
  }
}

let unlocking = false
/**
 * The browser keeps a page's audio shut until a tap (a fight resumed after a reload starts before one): the music
 * waits on the AudioContext, and the first tap or key opens it.
 */
function unlockOnGesture(a: AudioContext) {
  if (a.state === 'running' || unlocking || typeof window === 'undefined') return
  unlocking = true
  const events = ['pointerdown', 'pointerup', 'touchend', 'keydown'] as const
  const unlock = () => {
    void a.resume().then(() => {
      if (a.state !== 'running' || !unlocking) return
      unlocking = false
      events.forEach((e) => window.removeEventListener(e, unlock, true))
    })
  }
  events.forEach((e) => window.addEventListener(e, unlock, true))
}

/**
 * Plays the battle loop at `vol` (0–1), from its start. Already playing, it carries on, even while fading out (each
 * foe of a Versus fight mounts a new screen: the music doesn't start over). The caller checks the Sound setting
 * (`useBattleMusic`): this plays.
 */
export function startMusic(vol = MUSIC_VOLUME) {
  volume = vol
  if (fadeTimer) {
    // Fading out: back up, and on with the same loop.
    clearTimeout(fadeTimer)
    fadeTimer = null
    rampTo(volume * LEVEL, 0.2)
  }
  if (wanted) return
  const a = audio(true)
  if (!a || typeof document === 'undefined') return
  ctx = a
  song ??= compileSong()
  wanted = true
  unlockOnGesture(a)
  document.addEventListener('visibilitychange', onVisibility)
  cursor = { step: 0, time: a.currentTime + 0.1 }
  // Started in a hidden tab: it waits for the tab to show.
  if (document.hidden) return
  out = openOutput(a)
  startClock()
}

/** Fades the music out over `fade` seconds (the result card, leaving the fight), then stops it. */
export function stopMusic(fade = 0.6) {
  if (!wanted || fadeTimer) return
  if (!out) return end()
  rampTo(0, fade)
  // The loop runs on under the fade: `startMusic` within it takes the very same loop up again.
  fadeTimer = setTimeout(end, fade * 1000)
}

function end() {
  if (fadeTimer) clearTimeout(fadeTimer)
  fadeTimer = null
  wanted = false
  stopClock()
  closeOutput(0.02)
  document.removeEventListener('visibilitychange', onVisibility)
}

/** Settings' music volume, live. */
export function setMusicVolume(vol: number) {
  volume = vol
  if (!fadeTimer) rampTo(volume * LEVEL, 0.15)
}

/** Whether the loop is on (the kitchen sink's play button). */
export const musicPlaying = () => wanted && !fadeTimer
