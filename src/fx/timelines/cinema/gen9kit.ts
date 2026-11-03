// Paldea's and Kitakami's raid cinematics (docs/53) share their frame: the scene is each legend's own (a shrine, the
// crater's past or future, a festival), what happens on its reveal is the same for all, as the Kanto and Johto raids
// have it: rays and a glow behind it, a white flash, its outline flickering in its colours, rings and a burst of
// stars, the roar on the HUD's one beat. Shared drawing for those scenes lives here too (chains, ridges, hexagons).
import { fxSound } from '@/audio/sfx'
import {
  canvas,
  ellipseLine,
  glow,
  lerp,
  line,
  Particles,
  rect,
  rng,
  span,
  wash,
  type Canvas,
  type G,
  type Rng,
} from '../../pixel'
import { drawSprite, spriteSize } from '../../sprites'
import { screenFlash, screenShake, skippingNow, within, type Cue, type Timeline } from '../../timeline'
import { drawRays } from '../legend'
import { AFTER_REVEAL, burstRing, inOrder, type Cinema, type CinemaParams } from './kit'

/** A raid scene's measures, from its screen: everything is laid out from these (a phone, a desktop, a tablet). */
export interface Ctx {
  w: number
  h: number
  cx: number
  /** Its feet once revealed, and its middle (the rings' and rays' centre). */
  feet: number
  mid: number
  /** The screen's short side. */
  m: number
  /** 1, or fewer particles at the short motion level. */
  many: number
  short: boolean
  mon: string
  sz: { w: number; h: number }
}

export type Base = { r: Rng; fx: Particles; rays: Canvas; shakes: [number, number, number][] }

export interface RaidScene<X> {
  id: string
  /** When it shows itself (s, 4.0–5.2): the raid intro's words follow it. */
  reveal: number
  seed: number
  /** Its light to dark colours: the outline after the reveal, the rings, the burst. */
  aura: readonly [string, string, string, string]
  flash?: string
  /** Its feet, as a share of the height (0.56–0.66). */
  feet?: number
  /** How far it bobs once revealed (a flyer, a floater); 0 stands still. */
  bob?: number
  /** The rays fanning behind it after the reveal; null for none. */
  rays?: string | null
  setup(c: Ctx, r: Rng): X
  step(c: Ctx, s: Base & X, t: number, dt: number): void
  /** The place behind it, and everything before the reveal that it stands in front of. */
  back(g: G, c: Ctx, s: Base & X, t: number): void
  /** It before the reveal: a silhouette, a shape in the light (nothing is drawn of it otherwise). */
  before(g: G, c: Ctx, s: Base & X, t: number): void
  /** Over it and the particles: the foreground, the weather. */
  front?(g: G, c: Ctx, s: Base & X, t: number): void
  shakes?: (c: Ctx) => [number, number, number][]
  sounds: (c: Ctx) => readonly (readonly [number, () => void])[]
}

/** A raid cinematic from its scene: the reveal, its HUD beat and the motion levels are handled here. */
export function raidScene<X>(spec: RaidScene<X>): Cinema {
  const R = spec.reveal
  const A = spec.aura
  const dur = R + AFTER_REVEAL
  return {
    reveal: R,
    dur,
    make(p: CinemaParams): Timeline<Base & X> {
      const w = p.w ?? 240
      const h = p.h ?? 160
      const sz = spriteSize(p.mon)
      const feet = Math.round(h * (spec.feet ?? 0.62))
      const c: Ctx = {
        w,
        h,
        cx: Math.round(w / 2),
        feet,
        mid: Math.round(feet - Math.min(sz.h, 80) / 2),
        m: Math.min(w, h),
        many: p.short ? 0.4 : 1,
        short: !!p.short,
        mon: p.mon,
        sz,
      }
      const quiet = (f: () => void) => () => void (!skippingNow() && f())
      return {
        id: spec.id,
        dur,
        setup() {
          const r = rng(spec.seed)
          const base: Base = {
            r,
            fx: new Particles(),
            rays: canvas(w, h),
            shakes: p.short ? [] : [...(spec.shakes?.(c) ?? []), [R, 0.6, 3]],
          }
          return Object.assign(base, spec.setup(c, r))
        },
        step(s, t, dt) {
          s.fx.update(dt)
          spec.step(c, s, t, dt)
          if (t >= R && t - dt < R)
            for (let k = 0; k < 56 * c.many; k++) {
              const a = s.r() * Math.PI * 2
              const v = s.r.range(50, 180)
              s.fx.add({
                x: c.cx,
                y: c.mid,
                vx: Math.cos(a) * v,
                vy: Math.sin(a) * v,
                drag: 2.5,
                life: s.r.range(0.5, 1),
                size: s.r.int(1, 2),
                shape: s.r() < 0.55 ? 'star' : 'sq',
                colors: [...A],
              })
            }
        },
        draw(g, s, t) {
          const sh = screenShake(t, s.shakes)
          g.fillStyle = '#000000'
          g.fillRect(0, 0, w, h)
          g.save()
          g.translate(sh.x, sh.y)
          spec.back(g, c, s, t)
          if (t < R) spec.before(g, c, s, t)
          else {
            if (spec.rays !== null) {
              const k = span(t, R, R + 0.5) * lerp(0.7, 0.3, span(t, R + 0.4, R + 1.4))
              drawRays(s.rays, { x: c.cx, y: c.mid }, t, spec.rays ?? A[2], k)
              g.drawImage(s.rays, 0, 0)
            }
            const ar = Math.round(c.m * 0.3)
            g.drawImage(glow(ar, A[3], 1.4, 0.45), c.cx - ar, c.mid - ar)
            const bob = spec.bob ? Math.round(Math.sin((t - R) * 2.2) * spec.bob) : 0
            drawSprite(g, p.mon, c.cx, feet + bob, {
              flash: Math.max(0, 1 - span(t, R + 0.05, R + 0.45)),
              outline: Math.floor(t * 8) % 2 ? A[1] : A[2],
            })
          }
          for (const [d, col] of [
            [0, A[0]],
            [0.12, A[1]],
            [0.24, A[2]],
          ] as const)
            burstRing(g, c.cx, c.mid, span(t, R + d, R + d + 0.6), Math.max(w, h) * 0.7, 3, col)
          s.fx.draw(g)
          spec.front?.(g, c, s, t)
          g.restore()
          if (within(t, R, R + 0.35))
            screenFlash(g, spec.flash ?? '#ffffff', 0.9 * (1 - span(t, R, R + 0.35)))
          if (t < 0.4) wash(g, '#000000', 1 - span(t, 0, 0.4), 8)
        },
        cues: () =>
          inOrder([
            ...spec.sounds(c).map(([at, f]) => [at, quiet(f)] as const),
            [R, (hud) => (quiet(() => fxSound('legend.roar'))(), hud.beat?.('roar'))],
          ] satisfies Cue<Base & X>[]),
      }
    },
  }
}

/** A level in quarters: glows are cached by their density, so a fading one keeps to a handful of them. */
export const q4 = (v: number) => Math.round(v * 4) / 4

/** Stars on a canvas, a few bright, the rest dim. */
export function stars(g: G, r: Rng, w: number, h: number, n: number, bright = '#ffffff', dim = '#6a6a9a') {
  for (let i = 0; i < n; i++) rect(g, r.range(0, w), r.range(0, h), 1, 1, r() < 0.2 ? bright : dim)
}

/** A ridge of hills or mountains filled to the bottom: two waves and a jag, from the seed. Returns its top per x. */
export function ridge(
  g: G,
  w: number,
  base: number,
  amp: number,
  color: string,
  seed: number,
  bottom: number,
  jag = 0.3,
): number[] {
  const r = rng(seed)
  const tops: number[] = []
  const f1 = r.range(18, 34)
  const f2 = r.range(6, 12)
  const p1 = r() * 9
  const p2 = r() * 9
  for (let x = 0; x < w; x++) {
    const y = Math.round(
      base -
        amp * (0.6 + 0.4 * Math.sin(x / f1 + p1)) -
        amp * jag * Math.abs(Math.sin(x / f2 + p2)) -
        amp * 0.08 * ((x * 7) % 3),
    )
    rect(g, x, y, 1, bottom - y, color)
    tops.push(y)
  }
  return tops
}

/**
 * A chain along a path: oval links seen face on, between them links seen edge on, lit on top, on a dark backing so it
 * reads over anything. `phase` slides the links along it (a chain dragged, pulled taut); `big` for a heavy chain.
 */
export function chain(
  g: G,
  pts: readonly [number, number][],
  dark: string,
  lit: string,
  phase = 0,
  big = false,
) {
  const gap = big ? 4 : 3
  for (let i = 1; i < pts.length; i++)
    line(g, pts[i - 1]![0], pts[i - 1]![1], pts[i]![0], pts[i]![1], '#08040c', big ? 3 : 1)
  let carry = ((phase % (gap * 2)) + gap * 2) % (gap * 2)
  let k = 0
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]!
    const [x1, y1] = pts[i]!
    const len = Math.hypot(x1 - x0, y1 - y0)
    if (len < 0.01) continue
    const ux = (x1 - x0) / len
    const uy = (y1 - y0) / len
    let d = carry
    for (; d < len; d += gap, k++) {
      const x = Math.round(x0 + ux * d)
      const y = Math.round(y0 + uy * d)
      if (k % 2 === 0) {
        // Face on: a ring, dark inside.
        const r = big ? 2 : 1
        rect(g, x - r, y - r, r * 2 + 1, r * 2 + 1, dark)
        rect(g, x - r, y - r, r * 2, 1, lit)
        rect(g, x - r, y - r, 1, r * 2, lit)
        rect(g, x, y, 1, 1, '#08040c')
      } else {
        // Edge on: a bar along the chain.
        line(g, x - ux * 1.5, y - uy * 1.5, x + ux * 1.5, y + uy * 1.5, lit, big ? 2 : 1)
      }
    }
    carry = d - len
  }
}

/** A hexagon's outline, pointy side up (tera crystals, a rift's frame). */
export function hexagon(g: G, cx: number, cy: number, r: number, color: string, squash = 1) {
  const pts: [number, number][] = []
  for (let i = 0; i <= 6; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 3
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * squash])
  }
  for (let i = 1; i < pts.length; i++) line(g, pts[i - 1]![0], pts[i - 1]![1], pts[i]![0], pts[i]![1], color)
}

/** A full moon with its seas, and its halo. */
export function moon(g: G, x: number, y: number, r: number, lit: string, sea: string, halo: string) {
  g.drawImage(glow(r * 3, halo, 1.4, 0.45), x - r * 3, y - r * 3)
  for (let dy = -r; dy <= r; dy++) {
    const hw = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy)))
    rect(g, x - hw, y + dy, hw * 2 + 1, 1, lit)
  }
  rect(g, x - Math.round(r * 0.4), y - Math.round(r * 0.3), Math.max(1, Math.round(r * 0.4)), 2, sea)
  rect(g, x + Math.round(r * 0.15), y + Math.round(r * 0.2), Math.max(1, Math.round(r * 0.3)), 2, sea)
  ellipseLine(g, x, y, r, r, halo)
}

/** A ring of light on the ground in perspective (a footfall, a shockwave): k 0→1 grows and fades. */
export function groundRing(g: G, x: number, y: number, k: number, maxR: number, color: string) {
  if (k <= 0 || k >= 1) return
  const rx = Math.round(lerp(4, maxR, 1 - (1 - k) ** 2))
  if (Math.floor(k * 10) % 3 === 2 && k > 0.6) return
  ellipseLine(g, x, y, rx, Math.max(1, Math.round(rx * 0.22)), color)
  if (k < 0.5) ellipseLine(g, x, y, rx - 2, Math.max(1, Math.round(rx * 0.22) - 1), color)
}
