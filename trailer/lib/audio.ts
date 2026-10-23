// The trailer's sound, rendered offline in step with the frames: the game's own sound effects (src/audio/sfx.ts, which
// the timelines call on their cues), Showdown's cries and an original chiptune (music.ts), mixed into one WAV.
//
// sfx.ts builds its context with `new window.AudioContext()` and schedules at `currentTime`: it is handed an
// OfflineAudioContext whose clock reads the trailer's time instead, so each sound lands on the frame that fired it.
import { setSfxEnabled, sfx, type SfxName } from '@/audio/sfx'
import { cryUrl } from '@/audio/cries'
import { scoreMusic } from './music'

export const RATE = 48000
export const SECONDS = 22.5

/** On during the one in-order pass that records the sound; off for stills and previews. */
export const sound = { on: false }

const ctx = new OfflineAudioContext(2, Math.ceil(RATE * SECONDS), RATE)
const bus = (v: number) => {
  const g = ctx.createGain()
  g.gain.value = v
  g.connect(ctx.destination)
  return g
}
const sfxBus = bus(1.6)
const cryBus = bus(0.55)
const musicBus = bus(0.42)

let now = 0
/** The trailer's clock, as sfx.ts will read it. */
export const setNow = (t: number) => void (now = t)

const clocked = new Proxy(ctx, {
  get(target, k) {
    if (k === 'currentTime') return now
    if (k === 'state') return 'running'
    if (k === 'resume') return () => Promise.resolve()
    if (k === 'destination') return sfxBus
    const v = Reflect.get(target, k, target) as unknown
    return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(target) : v
  },
})
;(window as unknown as { AudioContext: unknown }).AudioContext = function () {
  return clocked
}

/** One of the game's sound effects, now. */
export function play(name: SfxName) {
  if (!sound.on) return
  setSfxEnabled(true)
  sfx(name)
  setSfxEnabled(false)
}

/** Any sound made with sfx.ts's helpers (tone, hiss, fxSound), now. */
export function playWith(fn: () => void) {
  if (!sound.on) return
  setSfxEnabled(true)
  fn()
  setSfxEnabled(false)
}

const cries: { dex: number; t: number; v: number; rate: number }[] = []
/** A Pokémon's cry, now. */
export function cry(dex: number, v = 1, rate = 1) {
  if (sound.on) cries.push({ dex, t: now, v, rate })
}

async function scheduleCries() {
  const buffers = new Map<number, AudioBuffer | null>()
  for (const c of cries) {
    if (!buffers.has(c.dex)) {
      const url = cryUrl(c.dex)
      let buf: AudioBuffer | null = null
      if (url) {
        try {
          buf = await ctx.decodeAudioData(await (await fetch(url)).arrayBuffer())
        } catch {
          buf = null
        }
      }
      buffers.set(c.dex, buf)
    }
    const buf = buffers.get(c.dex)
    if (!buf) continue
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = c.rate
    const g = ctx.createGain()
    g.gain.value = c.v
    src.connect(g).connect(cryBus)
    src.start(c.t)
  }
}

/** Mix everything heard during the pass into a 16-bit stereo WAV, peak-normalised, as base64. */
export async function renderAudio(): Promise<string> {
  await scheduleCries()
  scoreMusic(ctx, musicBus)
  const out = await ctx.startRendering()
  const L = out.getChannelData(0)
  const R = out.getChannelData(1)
  let peak = 1e-6
  for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]!), Math.abs(R[i]!))
  const k = 0.89 / peak
  const n = L.length
  const buf = new ArrayBuffer(44 + n * 4)
  const v = new DataView(buf)
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  v.setUint32(4, 36 + n * 4, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 2, true)
  v.setUint32(24, RATE, true)
  v.setUint32(28, RATE * 4, true)
  v.setUint16(32, 4, true)
  v.setUint16(34, 16, true)
  str(36, 'data')
  v.setUint32(40, n * 4, true)
  for (let i = 0; i < n; i++) {
    v.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i]! * k)) * 32767, true)
    v.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i]! * k)) * 32767, true)
  }
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}
