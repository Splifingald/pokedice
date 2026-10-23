// The page a cut of the trailer runs in: one canvas, the acts drawn on request for frame n, and the sound recorded
// along the way. scripts/trailer.ts drives it through `window.trailer`; `?play` plays it in real time instead.
import { renderAudio, setNow, sound } from './audio'
import { clock, FPS } from './clock'
import { animateAll } from './sprites'

export interface Act {
  range: readonly [number, number]
  load(): Promise<unknown>
  render(g: CanvasRenderingContext2D, t: number): void
}

export type Score = (ctx: BaseAudioContext, out: AudioNode) => void

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

export function start(ACTS: Act[], TOTAL_FRAMES: number, score: Score) {
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

  window.trailer = {
    ready: load(),
    frames: TOTAL_FRAMES,
    render,
    record: (on) => void (sound.on = on),
    audio: () => renderAudio(score),
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
}
