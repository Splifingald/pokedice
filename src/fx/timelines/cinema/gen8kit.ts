// Gen 8's raid cinematics (docs/53) share one frame, as the bosses share boss.ts: the dark they come out of, the
// shake, and the reveal (its flash, the rays, the legend lit and outlined, the rings and the burst in its colours, the
// one HUD beat). Each scene draws its own place and build-up around it; the helpers below are what several of them
// draw (rolling fog, hexagons, a heart, pines, a pixel sword) so a scene's file holds only its own story.
import { fxSound } from '@/audio/sfx'
import {
  bayer,
  canvas,
  cached,
  glow,
  lerp,
  line,
  Particles,
  rect,
  rng,
  shade,
  span,
  wash,
  type Canvas,
  type G,
  type Rng,
} from '../../pixel'
import { drawSprite, spriteSize } from '../../sprites'
import { screenFlash, screenShake, skippingNow, within, type Cue, type Timeline } from '../../timeline'
import { drawRays } from '../legend'
import { AFTER_REVEAL, burstRing, dissolve, inOrder, tri, type Cinema, type CinemaParams } from './kit'

/** What every scene knows about its screen and its legend. */
export interface Raid {
  w: number
  h: number
  cx: number
  /** The smaller side: what must fit a phone's width and a desktop's height. */
  m: number
  /** The legend's feet once it is revealed. */
  feet: number
  mon: string
  sz: { w: number; h: number }
  /** 1, or fewer particles on the short motion level. */
  many: number
  short: boolean
  r: Rng
  fx: Particles
  rays: Canvas
}

export interface RaidScene<X> {
  id: string
  reveal: number
  seed: number
  /** Its light to dark colours: the outline, the rays, the rings, the burst. */
  aura: readonly [string, string, string, string]
  /** The reveal's white-out colour. */
  flash?: string
  /** Its feet, as a share of the height (the raid intro's words sit above and below it). */
  feet?: number
  /** How far its outline and rays stay lit after the reveal (0 none, 1 Mewtwo's). */
  rays?: number
  /** The bob of its hover, in pixels (0: it stands). */
  bob?: number
  /** [t0, dur, amp]: none on the short motion level (and a calm OS drops them anyway). */
  shakes?: readonly (readonly [number, number, number])[]
  /** [t0, dur, colour, alpha]: full-screen flashes besides the reveal's, at least 0.34 s apart. */
  flashes?: readonly (readonly [number, number, string, number])[]
  setup(c: Raid): X
  step?(s: Raid & X, t: number, dt: number): void
  /** Its place, and what happens in it, behind the legend. */
  back(g: G, s: Raid & X, t: number): void
  /** The legend before its reveal (a silhouette, a streak…). */
  before?(g: G, s: Raid & X, t: number): void
  /** Over the legend and the particles (foreground, weather), still inside the shake. */
  front?(g: G, s: Raid & X, t: number): void
  sounds: readonly (readonly [number, () => void])[]
}

export function raidCinema<X>(spec: RaidScene<X>): Cinema {
  const R = spec.reveal
  const A = spec.aura
  const DUR = R + AFTER_REVEAL
  return {
    reveal: R,
    dur: DUR,
    make(p: CinemaParams): Timeline<Raid & X> {
      const w = p.w ?? 240
      const h = p.h ?? 160
      const quiet = (f: () => void) => () => void (!skippingNow() && f())
      return {
        id: spec.id,
        dur: DUR,
        setup() {
          const r = rng(spec.seed)
          const c: Raid = {
            w,
            h,
            cx: Math.round(w / 2),
            m: Math.min(w, h),
            feet: Math.round(h * (spec.feet ?? 0.62)),
            mon: p.mon,
            sz: spriteSize(p.mon),
            many: p.short ? 0.4 : 1,
            short: !!p.short,
            r,
            fx: new Particles(),
            rays: canvas(w, h),
          }
          return Object.assign(c, spec.setup(c))
        },
        step(s, t, dt) {
          s.fx.update(dt)
          spec.step?.(s, t, dt)
          if (within(t, R, R + dt)) {
            const r = s.r
            for (let k = 0; k < 50 * s.many; k++) {
              const a = r() * Math.PI * 2
              const v = r.range(50, 170)
              s.fx.add({
                x: s.cx,
                y: s.feet - s.sz.h / 2,
                vx: Math.cos(a) * v,
                vy: Math.sin(a) * v * 0.8,
                drag: 2.5,
                life: r.range(0.5, 1),
                size: r.int(1, 2),
                shape: r() < 0.5 ? 'star' : 'sq',
                colors: [...A],
              })
            }
          }
        },
        draw(g, s, t) {
          const sh = screenShake(t, p.short ? [] : (spec.shakes ?? []))
          g.fillStyle = '#000000'
          g.fillRect(0, 0, w, h)
          g.save()
          g.translate(sh.x, sh.y)
          spec.back(g, s, t)
          if (t < R) spec.before?.(g, s, t)
          else revealed(g, s, t, R, A, spec.rays ?? 0.6, spec.bob ?? 1.5)
          s.fx.draw(g)
          spec.front?.(g, s, t)
          g.restore()
          for (const [at, d, c, a] of spec.flashes ?? [])
            if (within(t, at, at + d)) screenFlash(g, c, a * (1 - span(t, at, at + d)))
          if (within(t, R, R + 0.35))
            screenFlash(g, spec.flash ?? '#ffffff', 0.9 * (1 - span(t, R, R + 0.35)))
          if (t < 0.5) wash(g, '#000000', 1 - span(t, 0, 0.5), 8)
        },
        cues: () =>
          inOrder([
            ...spec.sounds.map(([at, f]) => [at, quiet(f)] as const),
            [R, (hud) => (quiet(() => fxSound('legend.roar'))(), hud.beat?.('roar'))],
          ] satisfies Cue<Raid & X>[]),
      }
    },
  }
}

/** The legend shown: rays turning behind it, a glow, lit white and fading in, outlined in its colours, the rings. */
export function revealed(
  g: G,
  s: Raid,
  t: number,
  R: number,
  A: readonly string[],
  rays: number,
  bob: number,
) {
  const cy = s.feet - Math.round(s.sz.h / 2)
  if (rays > 0) {
    const k = span(t, R, R + 0.4) * lerp(rays, rays * 0.4, span(t, R + 0.4, R + 1.4))
    drawRays(s.rays, { x: s.cx, y: cy }, t, A[3]!, k)
    g.drawImage(s.rays, 0, 0)
  }
  const gr = Math.round(Math.max(24, s.sz.w * 0.7))
  g.drawImage(glow(gr, A[3]!, 1.4, 0.4), s.cx - gr, cy - gr)
  const y = s.feet + Math.round(Math.sin((t - R) * 2) * bob)
  drawSprite(g, s.mon, s.cx, y, {
    flash: Math.max(0, 1 - span(t, R + 0.05, R + 0.45)),
    outline: Math.floor(t * 8) % 2 ? A[1] : A[2],
  })
  for (const [d, c] of [
    [0, A[0]!],
    [0.1, A[1]!],
    [0.22, A[2]!],
  ] as const)
    burstRing(g, s.cx, cy, span(t, R + d, R + d + 0.6), Math.max(s.w, s.h) * 0.75, 3, c)
}

// ---------------------------------------------------------------------------------------------------------------- noise

/** Smooth value noise, wrapping every `period` cells across x so a fog band can scroll forever. */
export function noise(seed: number, period = 1 << 20) {
  const hash = (x: number, y: number) => {
    const xi = ((x % period) + period) % period
    let k = Math.imul(xi, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)
    k = Math.imul(k ^ (k >>> 13), 1274126177)
    return ((k ^ (k >>> 16)) >>> 0) / 4294967296
  }
  return (x: number, y: number) => {
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const fx = x - x0
    const fy = y - y0
    const sx = fx * fx * (3 - 2 * fx)
    const sy = fy * fy * (3 - 2 * fy)
    const a = lerp(hash(x0, y0), hash(x0 + 1, y0), sx)
    const b = lerp(hash(x0, y0 + 1), hash(x0 + 1, y0 + 1), sx)
    return lerp(a, b, sy)
  }
}

/**
 * A band of fog, mist or cloud: noise thresholded through the ordered dither, its thick heart in one colour and its
 * wisps in another, thinning to nothing at its top and bottom. It wraps across x (draw it twice to scroll).
 */
export function fogBand(
  w: number,
  h: number,
  seed: number,
  core: string,
  edge: string,
  cover = 0.55,
  cell = 18,
  /** Its thickness across x (0..1): a bank of fog with a ragged leading edge. */
  side?: (x: number) => number,
): Canvas {
  // Blobs `cell` wide and under half as tall: fog lies in layers, it doesn't billow like smoke.
  const cells = Math.max(2, Math.round(w / cell))
  const n1 = noise(seed, cells)
  const n2 = noise(seed + 7, cells * 3)
  const sc = cells / w
  const vy = cell * 0.42
  return shade(w, h, (x, y) => {
    const v = n1(x * sc, y / vy) * 0.72 + n2(x * sc * 3, (y / vy) * 3) * 0.28
    const fall = Math.min(1, (y / h) * 3, ((h - y) / h) * 3) * (side ? side(x) : 1)
    const d = ((v - (1 - cover)) / cover) * fall
    if (d > 0.55 + bayer(x, y) * 0.35) return core
    if (d > bayer(x + 1, y + 2) * 0.55) return edge
    return null
  })
}

/** A band drawn scrolled by `off` pixels, wrapping; `k` below 1 thins it through the dither (a fog coming or going). */
export function scroll(g: G, band: Canvas, off: number, y: number, k = 1) {
  const w = band.width
  const x = Math.round(((off % w) + w) % w)
  dissolve(g, band, k, x - w, Math.round(y))
  dissolve(g, band, k, x, Math.round(y))
}

// ---------------------------------------------------------------------------------------------------------- shapes

/** A hexagon's outline (flat top), `r` its corner radius: shields, lattices. */
export function hexLine(g: G, cx: number, cy: number, r: number, c: string) {
  const pts = hexPts(cx, cy, r)
  for (let i = 0; i < 6; i++) {
    const [ax, ay] = pts[i]!
    const [bx, by] = pts[(i + 1) % 6]!
    line(g, ax, ay, bx, by, c)
  }
}

/** A filled hexagon, pixel by pixel (four triangles). */
export function hexFill(g: G, cx: number, cy: number, r: number, c: string | CanvasPattern) {
  const p = hexPts(cx, cy, r)
  tri(g, p[0]![0], p[0]![1], p[1]![0], p[1]![1], p[2]![0], p[2]![1], c)
  tri(g, p[0]![0], p[0]![1], p[2]![0], p[2]![1], p[3]![0], p[3]![1], c)
  tri(g, p[0]![0], p[0]![1], p[3]![0], p[3]![1], p[4]![0], p[4]![1], c)
  tri(g, p[0]![0], p[0]![1], p[4]![0], p[4]![1], p[5]![0], p[5]![1], c)
}

const hexPts = (cx: number, cy: number, r: number): [number, number][] =>
  Array.from({ length: 6 }, (_, i) => [
    cx + Math.cos((i * Math.PI) / 3) * r,
    cy + Math.sin((i * Math.PI) / 3) * r,
  ])

/** Is (x, y) inside a heart of size `s` centred at the origin (its notch up, its point down)? */
export const inHeart = (x: number, y: number, s: number) => {
  const u = x / s
  const v = -y / s + 0.15
  const q = u * u + v * v - 0.6
  return q * q * q - u * u * v * v * v <= 0
}

/** A heart, filled, cached by size and colour. */
export const heartC = (s: number, c: string, rim?: string) =>
  cached(`gen8-heart|${s}|${c}|${rim}`, () =>
    shade(Math.ceil(s * 2.4) + 2, Math.ceil(s * 2.2) + 2, (x, y) => {
      const ox = x - (Math.ceil(s * 2.4) + 2) / 2
      const oy = y - (Math.ceil(s * 2.2) + 2) / 2
      if (!inHeart(ox, oy, s)) return null
      if (
        rim &&
        (!inHeart(ox + 1.2, oy, s) ||
          !inHeart(ox - 1.2, oy, s) ||
          !inHeart(ox, oy + 1.2, s) ||
          !inHeart(ox, oy - 1.2, s))
      )
        return rim
      return c
    }),
  )

/** A range of snowy peaks along `base`, drawn once. */
export function peaks(g: G, w: number, base: number, ht: number, r: Rng, rock: string, snow: string) {
  let x = -20
  while (x < w + 20) {
    const pw = r.range(ht * 0.8, ht * 1.6)
    const ph = r.range(ht * 0.55, ht)
    const px = x + pw / 2
    tri(g, x, base, x + pw, base, px, base - ph, rock)
    tri(g, px - ph * 0.22, base - ph * 0.72, px + ph * 0.25, base - ph * 0.68, px, base - ph, snow)
    x += pw * r.range(0.45, 0.75)
  }
}

/** A snowy pine: a stack of triangles, dark, with snow on the boughs' upper edges. */
export function pine(g: G, x: number, base: number, ht: number, dark: string, mid: string, snow?: string) {
  const tiers = 4
  rect(g, x - 1, base - Math.round(ht * 0.18), 3, Math.round(ht * 0.18), '#1a120c')
  for (let i = 0; i < tiers; i++) {
    const top = base - ht + Math.round((i * ht * 0.8) / tiers)
    const bot = top + Math.round(ht * 0.38)
    const half = Math.round(ht * (0.16 + i * 0.07))
    tri(g, x - half, bot, x + half, bot, x, top, dark)
    tri(g, x - half, bot, x, bot, x, top, mid)
    if (snow) {
      for (let k = -half + 1; k < half; k += 2)
        if ((k + i) % 3) rect(g, x + k, bot - 1 - Math.round((1 - Math.abs(k) / half) * 2), 1, 1, snow)
    }
  }
}

/**
 * A sword standing point down, pixel by pixel: `rust` 1 is the Rusted Sword, 0 its blade bright. `len` from the
 * pommel to the point.
 */
export function sword(g: G, x: number, top: number, len: number, rust: number, edge = '#e8f4ff') {
  const blade = Math.round(len * 0.72)
  const grip = len - blade
  const bw = Math.max(2, Math.round(len * 0.07))
  const by = top + grip
  const bright = ['#ffffff', edge, '#8ab0d8', '#3a5a88']
  const rusty = ['#e0904a', '#b0602a', '#7a3a1a', '#4a200e']
  for (let y = 0; y < blade; y++) {
    const q = y / blade
    const half = q > 0.86 ? Math.max(0, Math.round((bw * (1 - q)) / 0.14)) : bw
    for (let dx = -half; dx <= half; dx++) {
      const side = dx < 0 ? 1 : dx > 0 ? 2 : 0
      const rusted = bayer(x + dx, by + y) < rust * (0.7 + 0.3 * Math.sin(y * 0.7 + dx))
      const pal = rusted ? rusty : bright
      rect(g, x + dx, by + y, 1, 1, dx === -half ? pal[1]! : dx === half ? pal[3]! : pal[side ? side : 0]!)
    }
  }
  // The guard: a wide bar with a gem; the grip; the pommel.
  const gw = Math.max(5, Math.round(len * 0.22))
  rect(g, x - gw, by - 2, gw * 2 + 1, 3, rust > 0.5 ? '#6a3a1a' : '#c8a040')
  rect(g, x - gw, by - 2, gw * 2 + 1, 1, rust > 0.5 ? '#9a5a2a' : '#ffe08a')
  rect(g, x - 1, by - 2, 3, 3, rust > 0.5 ? '#4a200e' : '#ff4a6a')
  rect(g, x - 1, top + 2, 3, grip - 4, rust > 0.5 ? '#3a1a0a' : '#3a2a6a')
  rect(g, x - 2, top, 5, 3, rust > 0.5 ? '#6a3a1a' : '#c8a040')
}

/** A round shield face on: rim, boss and cross; `rust` 1 is the Rusted Shield. */
export function shield(g: G, x: number, y: number, r: number, rust: number) {
  const rim = rust > 0.5 ? '#7a3a1a' : '#c8a040'
  const face = rust > 0.5 ? '#9a4a22' : '#c83a3a'
  const lit = rust > 0.5 ? '#c0703a' : '#ff8a7a'
  const dark = rust > 0.5 ? '#4a200e' : '#6a1a1a'
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      const d = Math.hypot(dx, dy * 1.05) / r
      if (d > 1) continue
      const rusted = rust > 0 && bayer(x + dx, y + dy) < rust * 0.8 && d < 0.85
      let c = d > 0.82 ? rim : dx + dy < -r * 0.3 ? lit : dx + dy > r * 0.5 ? dark : face
      if (rusted) c = (dx + dy) % 3 ? '#b0602a' : '#7a3a1a'
      rect(g, x + dx, y + dy, 1, 1, c)
    }
  // The gold cross and boss of the hero's shield.
  const cr = rust > 0.5 ? '#6a3a1a' : '#ffd23a'
  rect(g, x - Math.round(r * 0.75), y - 1, Math.round(r * 1.5) + 1, 2, cr)
  rect(g, x - 1, y - Math.round(r * 0.75), 2, Math.round(r * 1.5) + 1, cr)
  rect(g, x - 2, y - 2, 4, 4, rust > 0.5 ? '#4a200e' : '#fff3a0')
}

/** Speed lines converging on a point: a dithered fan of thin wedges (a kick, a punch, a charge). */
export function speedLines(
  g: G,
  w: number,
  h: number,
  x: number,
  y: number,
  k: number,
  c: string | CanvasPattern,
  seed = 1,
) {
  if (k <= 0) return
  const r = rng(seed)
  const n = 26
  const R = Math.hypot(w, h)
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.2
    const inner = R * lerp(0.42, 0.22, k) * r.range(0.8, 1.3)
    const spread = 0.012 + r() * 0.018
    tri(
      g,
      x + Math.cos(a) * inner,
      y + Math.sin(a) * inner,
      x + Math.cos(a - spread) * R,
      y + Math.sin(a - spread) * R,
      x + Math.cos(a + spread) * R,
      y + Math.sin(a + spread) * R,
      c,
    )
  }
}
