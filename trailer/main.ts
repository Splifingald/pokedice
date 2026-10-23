// The Pokédice trailer (docs/36-TRAILER-SCENARIO.md), drawn one frame at a time on request: scripts/trailer.ts opens
// this page, calls `trailer.render(n)` for every frame and records the canvas, then asks for the sound.
// Dev only: Vite serves it at /trailer/index.html; the game's build never includes it.
import { renderAudio, setNow, sound } from './lib/audio'
import { clock, FPS, TOTAL_FRAMES } from './lib/clock'
import { animateAll } from './lib/sprites'
import { title } from './acts/title'
import { journey } from './acts/journey'
import { montage } from './acts/montage'
import { features } from './acts/features'
import { choice } from './acts/choice'
import { endCard } from './acts/end'

export interface Act {
  range: readonly [number, number]
  load(): Promise<unknown>
  render(g: CanvasRenderingContext2D, t: number): void
}

const ACTS: Act[] = [title, journey, montage, features, choice, endCard]

const cv = document.getElementById('out') as HTMLCanvasElement
const g = cv.getContext('2d')!

async function load() {
  await Promise.all([document.fonts.load('64px "Jersey 25"'), document.fonts.load('64px "Jersey 15"')])
  await Promise.all(ACTS.map((a) => a.load()))
  return true
}

let last = -2
function render(n: number) {
  const t = n / FPS
  // In order, the previous frame is the one before; a jump (stills) acts as if it were.
  clock.prev = n === last + 1 ? clock.t : t - 1 / FPS
  clock.t = t
  last = n
  setNow(t)
  animateAll(t)
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.imageSmoothingEnabled = false
  g.globalAlpha = 1
  g.fillStyle = '#000'
  g.fillRect(0, 0, cv.width, cv.height)
  for (const a of ACTS) if (t >= a.range[0] && t < a.range[1]) a.render(g, t)
}

declare global {
  interface Window {
    trailer: {
      ready: Promise<boolean>
      frames: number
      render(n: number): void
      record(on: boolean): void
      audio(): Promise<string>
    }
  }
}

window.trailer = {
  ready: load(),
  frames: TOTAL_FRAMES,
  render,
  record: (on) => void (sound.on = on),
  audio: renderAudio,
}

// Opened by hand: play it in real time (no sound), to look at.
if (new URLSearchParams(location.search).has('play')) {
  void window.trailer.ready.then(() => {
    const t0 = performance.now()
    const tick = () => {
      const n = Math.floor(((performance.now() - t0) / 1000) * FPS) % TOTAL_FRAMES
      render(n)
      requestAnimationFrame(tick)
    }
    tick()
  })
}
