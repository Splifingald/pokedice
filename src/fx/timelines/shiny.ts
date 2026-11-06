// A shiny Pokémon's entrance on the battle stage (docs/38 F10b): as it lands on its platform, the hatching's sparkle —
// two rings of stars a beat apart (moments.ts), each with a dithered ring spreading out — and a few twinkles on it,
// with the shiny chime. It draws only its stars, on a clear canvas over the page's own sprite: nothing else of the
// stage. Bigger stars than the hatching's: they have a busy sky to read on.
import { feelSound } from '@/audio/feel'
import { ease, Particles, ring, rng, span, type Rng } from '../pixel'
import type { Point } from '../scenes'
import { spriteSize } from '../sprites'
import type { Timeline } from '../timeline'

export interface ShinyParams {
  /** The shiny's sprite key (fx/sprites), for its size. */
  key: string
  /** Its feet on the stage. */
  at: Point
  /** When it has landed: its slide in takes this long (the page's own motion). */
  delay?: number
}

interface ShinyState {
  r: Rng
  fx: Particles
  C: Point
  prev: number
}

const STARS = ['#ffffff', '#fff6a8', '#ffe14d']

export function shinyTimeline(p: ShinyParams): Timeline<ShinyState> {
  const T0 = p.delay ?? 0.45
  // The hatching's two rings: small, then wider, a beat apart.
  const RINGS = [
    [T0, 18],
    [T0 + 0.25, 30],
  ] as const
  return {
    id: 'shiny',
    dur: T0 + 1.2,
    setup() {
      const sz = spriteSize(p.key)
      return { r: rng(29), fx: new Particles(), C: { x: p.at.x, y: p.at.y - sz.h / 2 }, prev: -1 }
    },
    step(s, t, dt) {
      const p0 = s.prev
      s.prev = t
      const at = (t0: number) => p0 < t0 && t >= t0
      s.fx.update(dt)
      const r = s.r
      for (const [t0, R] of RINGS)
        if (at(t0))
          for (let k = 0; k < 12; k++) {
            const a = (k / 12) * Math.PI * 2
            s.fx.add({
              x: s.C.x + Math.cos(a) * R * 0.4,
              y: s.C.y + Math.sin(a) * R * 0.4,
              vx: Math.cos(a) * R * 2.2,
              vy: Math.sin(a) * R * 2.2,
              drag: 3,
              life: 0.6,
              size: 3,
              size1: 1,
              shape: 'star',
              colors: STARS,
            })
          }
      // Twinkles on it after the rings, a few at a time (never a flash).
      if (t > T0 + 0.1 && t < T0 + 0.9 && Math.floor(t * 60) % 6 === 0)
        s.fx.add({
          x: s.C.x + r.range(-16, 16),
          y: s.C.y + r.range(-16, 12),
          life: 0.35,
          size: 3,
          size1: 0,
          shape: 'star',
          colors: STARS,
        })
    },
    draw(g, s, t) {
      for (const [t0, R] of RINGS) {
        const q = span(t, t0, t0 + 0.45)
        if (q <= 0 || q >= 1) continue
        const r = Math.round(6 + R * 1.3 * ease.outC(q))
        // Thinning in eighths: dithered out, never a blended fade.
        g.drawImage(
          ring(r, 2, '#fff6a8', Math.ceil((1 - q) * 8) / 8),
          Math.round(s.C.x - r - 1),
          Math.round(s.C.y - r - 1),
        )
      }
      s.fx.draw(g)
    },
    cues: () => [[T0, () => feelSound('shiny.chime')]],
  }
}
