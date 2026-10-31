// The Swords of Justice's raid entrances (docs/53), one family, three places, three cuts of the Sacred Sword.
//
// Cobalion, Mistralton Cave's Guidance Chamber: a stone dais under a shaft of light, iron veins in the walls. The steel
// sings: vein after vein lights up and runs to the dais; the dark comes down, a glint, and its horn draws a blade of
// steel light. One stroke cuts the whole picture in two: the halves slide apart along the cut, light pouring out of the
// gap behind its silhouette, then slam shut on the reveal.
//
// Terrakion, Victory Road at dusk: a canyon pass blocked by a great boulder. Hoofbeats come closer, each one a quake, the
// boulder cracking with amber light; an amber blade sweeps through it, its top slides off and crashes down, and
// Terrakion charges through what is left, the rubble flying at the camera.
//
// Virizion, Pinwheel Forest: giant trunks, green light, leaves falling. A gust whips the leaves into a whirl and the
// grass parts in a line as something unseen runs through it; then the leaves stop in the air. Six green cuts flash
// across the screen in a breath, every leaf they cross falls in two halves, and Virizion lands where the cuts meet.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  bayer,
  bolt,
  canvas,
  ease,
  ellipse,
  glow,
  lerp,
  line,
  Particles,
  pattern,
  polyline,
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
import {
  AFTER_REVEAL,
  burstRing,
  dGradient,
  drawShards,
  inOrder,
  makeShard,
  pulse,
  stepShards,
  tri,
  type Cinema,
  type CinemaParams,
  type Shard,
} from './kit'

type Pt = [number, number]

const pats = new WeakMap<G, Map<string, CanvasPattern | string>>()
/** pattern(), kept per canvas: a light drawn row by row would otherwise make hundreds of patterns a frame. */
function pat(g: G, c: string, lv: number) {
  let m = pats.get(g)
  if (!m) pats.set(g, (m = new Map()))
  const k = `${c}|${Math.round(lv)}`
  let p = m.get(k)
  if (!p) m.set(k, (p = pattern(g, c, lv)))
  return p
}
type Aura = readonly [string, string, string, string]

/** Where things stand on any screen: centred, the legend's feet in the middle band, sizes from the short side. */
function frame(p: CinemaParams) {
  const w = p.w ?? 240
  const h = p.h ?? 160
  return {
    w,
    h,
    cx: Math.round(w / 2),
    m: Math.min(w, h),
    feet: Math.round(h * 0.63),
    ground: Math.round(h * 0.66),
    sz: spriteSize(p.mon),
    many: p.short ? 0.4 : 1,
    quiet: (f: () => void) => () => void (!skippingNow() && f()),
  }
}

/**
 * The Sacred Sword: a blade of light from its hilt (x0, y0) along angle `a`, `len` long, drawn out to `q`. A halo of
 * dithered light, the blade, its white edge, a star at the tip.
 */
function blade(g: G, x0: number, y0: number, a: number, len: number, q: number, A: Aura, t: number) {
  if (q <= 0) return
  const L = len * q
  const x1 = x0 + Math.cos(a) * L
  const y1 = y0 + Math.sin(a) * L
  // The halo hums: its width breathes a pixel.
  const hw = 3 + (Math.floor(t * 20) % 2)
  for (let k = 0; k <= L; k += 3) {
    const x = x0 + Math.cos(a) * k
    const y = y0 + Math.sin(a) * k
    g.drawImage(glow(hw + 2, A[2], 1.4, 0.55), Math.round(x - hw - 2), Math.round(y - hw - 2))
  }
  line(g, x0, y0, x1, y1, A[2], 3)
  line(g, x0, y0, x1, y1, A[1], 2)
  line(g, x0, y0, x1, y1, A[0])
  const s = 3 + (Math.floor(t * 16) % 2) * 2
  rect(g, x1 - s, y1, s * 2 + 1, 1, A[0])
  rect(g, x1, y1 - s, 1, s * 2 + 1, A[0])
}

/** A cut across the screen through (x, y) at angle a: a white core and coloured lips, thinning out as k goes to 0. */
function cut(g: G, x: number, y: number, a: number, k: number, A: Aura, reach: number) {
  if (k <= 0) return
  const dx = Math.cos(a) * reach
  const dy = Math.sin(a) * reach
  const wd = Math.max(1, Math.round(5 * k))
  if (wd >= 3) line(g, x - dx, y - dy, x + dx, y + dy, A[2], wd + 2)
  line(g, x - dx, y - dy, x + dx, y + dy, A[1], wd)
  line(g, x - dx, y - dy, x + dx, y + dy, A[0], Math.max(1, wd - 2))
}

/** 1 at `at`, fading to 0 over `d`; 0 before it. */
const fade = (t: number, at: number, d: number) => (t < at ? 0 : 1 - span(t, at, at + d))

/** The arc a blade sweeps through, a smear of thin spokes fading behind its edge. */
function smear(g: G, x: number, y: number, a0: number, a1: number, len: number, q: number, A: Aura) {
  if (q <= 0 || q >= 1) return
  const a = lerp(a0, a1, ease.outQ(q))
  // A wedge of dithered light behind the edge, thinning towards where the blade has been.
  const n = 8
  const step = (a1 - a0) * 0.05
  for (let i = n - 1; i >= 0; i--) {
    const ai = a - step * i
    const aj = ai - step
    const P = pattern(g, i < 2 ? A[0] : i < 5 ? A[1] : A[2], 14 - i * 1.6)
    tri(
      g,
      x + Math.cos(ai) * len * 0.25,
      y + Math.sin(ai) * len * 0.25,
      x + Math.cos(ai) * len,
      y + Math.sin(ai) * len,
      x + Math.cos(aj) * len,
      y + Math.sin(aj) * len,
      P,
    )
  }
  line(g, x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, A[0], 2)
}

/** Sparks off a struck blade, in its colours. */
function sparks(fx: Particles, r: Rng, x: number, y: number, n: number, v: number, A: Aura) {
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2
    const sp = r.range(v * 0.3, v)
    fx.add({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      ay: 120,
      drag: 1.5,
      life: r.range(0.3, 0.8),
      size: 1,
      shape: r() < 0.3 ? 'plus' : 'px',
      colors: [A[0], A[1], A[2]],
    })
  }
}

/** The reveal's end, shared by the three: rays and rings in its colours, motes, the legend standing in full. */
function revealFx(
  g: G,
  rays: Canvas,
  mon: string,
  x: number,
  feet: number,
  t: number,
  R: number,
  A: Aura,
  big: number,
) {
  const k = span(t, R, R + 0.5) * lerp(0.7, 0.3, span(t, R + 0.4, R + 1.4))
  drawRays(rays, { x, y: feet - 30 }, t, A[3], k)
  g.drawImage(rays, 0, 0)
  const bob = Math.round(Math.sin((t - R) * 2.2) * 1)
  drawSprite(g, mon, x, feet + bob, {
    flash: Math.max(0, 1 - span(t, R + 0.05, R + 0.45)),
    outline: t < R + 1.6 ? (Math.floor(t * 8) % 2 ? A[1] : A[2]) : undefined,
  })
  ;[A[0], A[1], A[2]].forEach((c, i) =>
    burstRing(g, x, feet - 30, span(t, R + i * 0.12, R + i * 0.12 + 0.6), big, 3, c),
  )
}

/** The burst of motes on the reveal. */
function revealBurst(fx: Particles, r: Rng, x: number, y: number, n: number, A: Aura) {
  for (let k = 0; k < n; k++) {
    const a = r() * Math.PI * 2
    const v = r.range(50, 170)
    fx.add({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      drag: 2.5,
      life: r.range(0.5, 1),
      size: r.int(1, 2),
      shape: r() < 0.5 ? 'star' : 'sq',
      colors: [...A],
    })
  }
}

// ================================================================================================= Cobalion

const C_AURA: Aura = ['#ffffff', '#c8ecff', '#5ab0e8', '#1f4a7a']
const C_VEINS = [1.0, 1.3, 1.55, 1.8, 2.0, 2.2] as const
const C_DARK = 2.5
const C_GLINT = 2.8
const C_DRAW = 3.0
const C_SWING = 3.62
const C_CUT = 3.74
const C_SHUT = 4.38
const C_REVEAL = 4.6

type CS = {
  r: Rng
  fx: Particles
  dust: Particles
  bg: Canvas
  sc: Canvas
  rays: Canvas
  veins: Pt[][]
  shakes: [number, number, number][]
}

/** Mistralton Cave's deep chamber: rock strata, stalactites, the alcove behind the dais, the dais itself. */
function guidanceChamber(w: number, h: number, cx: number, ground: number, feet: number, r: Rng): Canvas {
  const cv = canvas(w, h)
  const g = cv.g
  g.drawImage(dGradient(w, ground, ['#06080e', '#0b111c', '#111a28', '#172334']), 0, 0)
  // Strata: jagged bands across the wall, each lit along its top.
  for (let y = 8; y < ground; y += r.int(9, 15)) {
    let py = y
    for (let x = 0; x < w; x += 4) {
      const ny = y + Math.round(Math.sin(x / 17 + y) * 2 + r.range(-1, 1))
      line(g, x, py, x + 4, ny, '#05070c')
      line(g, x, py - 1, x + 4, ny - 1, '#1d2a3c')
      py = ny
    }
  }
  // Broken facets, catching a little light.
  for (let i = 0; i < Math.round((w * ground) / 700); i++) {
    const x = r.range(0, w)
    const y = r.range(0, ground)
    const s = r.range(4, 10)
    tri(g, x, y, x + s, y - s * 0.6, x + s * 1.3, y + 1, r() < 0.5 ? '#142030' : '#0a1018')
    line(g, x, y, x + s, y - s * 0.6, '#24344a')
  }
  // The alcove behind the dais: a darker arch in the wall.
  const ar = Math.round(Math.min(w * 0.36, 70))
  const ah = Math.round(Math.min(h * 0.34, 96))
  for (let dy = 0; dy < ah; dy++) {
    const k = dy / ah
    const hw = Math.round(ar * Math.sqrt(Math.max(0, 1 - (1 - k) ** 2)))
    rect(g, cx - hw, ground - ah + dy, hw * 2, 1, dy % 7 === 0 ? '#070a10' : '#05070b')
    rect(g, cx - hw - 1, ground - ah + dy, 1, 1, '#2a3a50')
  }
  // Stalactites, long in the middle where the roof is high.
  for (let x = -4; x < w + 4; x += r.int(5, 11)) {
    const e = Math.abs(x - cx) / (w / 2)
    const len = Math.round(r.range(6, 18) * (0.6 + e) + (r() < 0.15 ? 14 : 0))
    const wd = r.int(2, 4)
    tri(g, x - wd, 0, x + wd, 0, x + r.range(-1, 1), len, '#0a0f17')
    line(g, x - wd + 1, 0, x, len - 1, '#22324a')
  }
  // The side walls, closer and darker, framing the chamber.
  for (let y = 0; y < h; y++) {
    const k = Math.abs(y - h * 0.45) / (h * 0.55)
    const wl = Math.round(w * 0.06 + k * k * w * 0.14 + Math.sin(y / 9) * 2 + Math.sin(y / 3.7) * 1)
    const wr = Math.round(w * 0.06 + k * k * w * 0.13 + Math.sin(y / 8 + 2) * 2 + Math.sin(y / 4.1) * 1)
    rect(g, 0, y, wl, 1, '#04060a')
    rect(g, wl, y, 1, 1, '#1e2c40')
    rect(g, w - wr, y, wr, 1, '#04060a')
    rect(g, w - wr - 1, y, 1, 1, '#16223a')
  }
  // The floor: uneven rock, pebbles, darker to the front.
  g.drawImage(dGradient(w, h - ground, ['#1c2636', '#121a26', '#0a0e16', '#05070b']), 0, ground)
  rect(g, 0, ground, w, 1, '#2a3a50')
  for (let i = 0; i < Math.round(w / 3); i++) {
    const x = r.range(0, w)
    const y = r.range(ground + 3, h)
    rect(g, x, y, r.int(1, 3), 1, r() < 0.5 ? '#26344a' : '#05070b')
  }
  // Stalagmites at the floor's edges.
  for (const side of [-1, 1])
    for (let i = 0; i < 3; i++) {
      const x = Math.round(cx + side * (w * 0.32 + i * w * 0.07))
      const ht = r.int(10, 24)
      tri(g, x - 5, ground + 6 + i * 4, x + 5, ground + 6 + i * 4, x, ground + 6 + i * 4 - ht, '#0c121c')
      line(g, x - 4, ground + 5 + i * 4, x, ground + 6 + i * 4 - ht, '#26364c')
    }
  // The dais: a round stone platform, two steps, worn smooth.
  const dr = Math.round(Math.min(w * 0.36, 64))
  ellipse(g, cx, feet + 6, dr + 6, 9, '#0c121c')
  ellipse(g, cx, feet + 4, dr + 4, 8, '#1e2a3a')
  ellipse(g, cx, feet + 1, dr, 7, '#2c3a4e')
  ellipse(g, cx, feet, dr - 2, 6, '#3a4a60')
  for (let a = 0; a < Math.PI * 2; a += 0.35) {
    const x = cx + Math.cos(a) * (dr - 6)
    const y = feet + Math.sin(a) * 4
    rect(g, x, y, 2, 1, '#4a5c74')
  }
  return cv
}

/** Iron veins from the walls to the dais: they light up one after another when the steel sings. */
function veinSet(r: Rng, w: number, h: number, cx: number, feet: number): Pt[][] {
  return C_VEINS.map((_, i) => {
    const side = i % 2 ? 1 : -1
    const y0 = h * (0.12 + ((i * 0.37) % 1) * 0.5)
    const pts = bolt(r, side < 0 ? 0 : w, y0, cx + side * Math.min(w * 0.3, 56), feet + 2, 0.22, 4)
    return pts
  })
}

/** The picture drawn row by row in two halves either side of a cut, each slid away from it: the world split open. */
function split(
  g: G,
  src: Canvas,
  w: number,
  h: number,
  cutX: (y: number) => number,
  offL: Pt,
  offR: Pt,
  gap: (g: G, y: number, xl: number, xr: number) => void,
) {
  for (let y = 0; y < h; y++) {
    const xl = Math.round(cutX(y - offL[1]) + offL[0])
    const xr = Math.round(cutX(y - offR[1]) + offR[0])
    if (xr > xl) gap(g, y, xl, xr)
    row(g, src, w, h, y - offL[1], 0, xl, offL[0], y)
    row(g, src, w, h, y - offR[1], xr, w, offR[0], y)
  }
}

/** One row of `src` (row sy) onto dest row dy over dest x0..x1, shifted by dx, clamped to both pictures. */
function row(
  g: G,
  src: Canvas,
  w: number,
  h: number,
  sy: number,
  x0: number,
  x1: number,
  dx: number,
  dy: number,
) {
  if (sy < 0 || sy >= h) return
  const a = Math.max(0, x0, dx)
  const b = Math.min(w, x1, w + dx)
  if (b <= a) return
  g.drawImage(src, a - dx, sy, b - a, 1, a, dy, b - a, 1)
}

export const cobalionCinema: Cinema = {
  reveal: C_REVEAL,
  dur: C_REVEAL + AFTER_REVEAL,
  make(p: CinemaParams): Timeline<CS> {
    const F = frame(p)
    const { w, h, cx, m, feet, ground, sz, many, quiet } = F
    const R = C_REVEAL
    // Its horn: front sprites face left, the horn high on the head.
    const horn: Pt = [cx - sz.w * 0.2, feet - sz.h * 0.88]
    const bladeA = -2.7
    const bladeLen = Math.round(m * 0.55)
    // The cut: steep across the screen, through the middle band, top right to bottom left.
    const ck = -Math.min(0.6, (0.5 * w) / h)
    // It runs through the horn: the stroke ends along it and the cut carries on across the screen.
    const cy0 = Math.round(horn[1])
    const cutX = (y: number) => horn[0] + (y - cy0) * ck
    const cutA = Math.atan2(1, ck)
    const swingTo = cutA - Math.PI
    const u: Pt = [Math.cos(cutA), Math.sin(cutA)]
    const n: Pt = [u[1], -u[0]]
    return {
      id: 'cinema-cobalion',
      dur: R + AFTER_REVEAL,
      setup() {
        const r = rng(638)
        return {
          r,
          fx: new Particles(),
          dust: new Particles(),
          bg: guidanceChamber(w, h, cx, ground, feet, r),
          sc: canvas(w, h),
          rays: canvas(w, h),
          veins: veinSet(r, w, h, cx, feet),
          shakes: p.short
            ? []
            : [
                [2.05, 0.4, 1],
                [C_CUT, 0.5, 4],
                [C_SHUT, 0.35, 5],
                [R, 0.6, 3],
              ],
        }
      },
      step(s, t, dt) {
        const r = s.r
        s.fx.update(dt)
        s.dust.update(dt)
        // Dust motes turning in the shaft of light.
        if (t < C_DARK && r() < 0.35 * many)
          s.dust.add({
            x: cx + r.range(-m * 0.15, m * 0.15),
            y: r.range(10, feet),
            vx: r.range(-3, 3),
            vy: r.range(2, 6),
            life: 2,
            size: 1,
            shape: 'px',
            colors: ['#8aa8c8', '#c8e0ff', '#8aa8c8'],
          })
        // Each vein's light, where it reaches the dais: a little spray of steel sparks.
        C_VEINS.forEach((v, i) => {
          if (within(t, v + 0.35, v + 0.35 + dt)) {
            const end = s.veins[i]!.at(-1)!
            sparks(s.fx, r, end[0], end[1], Math.round(10 * many) + 2, 50, C_AURA)
          }
        })
        // The roof shivers: grit falling.
        if (t > 2.0 && t < C_DARK + 0.3 && r() < 0.5 * many)
          s.fx.add({
            x: r.range(w * 0.1, w * 0.9),
            y: r.range(0, 10),
            vy: r.range(10, 40),
            ay: 200,
            life: 1.2,
            size: 1,
            shape: 'px',
            colors: ['#3a4a60', '#26344a'],
          })
        // Out of the gap: light spilling as sparks while the world stands open.
        if (t > C_CUT && t < C_SHUT && r() < 0.9 * many)
          for (let i = 0; i < 2; i++) {
            const y = r.range(h * 0.15, h * 0.85)
            const x = cutX(y)
            const sd = r() < 0.5 ? -1 : 1
            s.fx.add({
              x,
              y,
              vx: n[0] * sd * r.range(20, 70),
              vy: n[1] * sd * r.range(20, 70),
              drag: 2,
              life: r.range(0.3, 0.6),
              size: 1,
              shape: 'px',
              colors: [C_AURA[0], C_AURA[1], C_AURA[2]],
            })
          }
        if (within(t, C_SHUT, C_SHUT + dt))
          for (let i = 0; i < 24 * many; i++) {
            const y = r.range(0, h)
            sparks(s.fx, r, cutX(y), y, 1, 90, C_AURA)
          }
        if (within(t, R, R + dt)) revealBurst(s.fx, r, cx, feet - 30, 50 * many, C_AURA)
        if (t > R && r() < 0.3 * many)
          s.fx.add({
            x: cx + r.range(-sz.w * 0.6, sz.w * 0.6),
            y: feet - r.range(0, sz.h),
            vy: -r.range(6, 16),
            life: 1,
            size: 1,
            shape: r() < 0.5 ? 'plus' : 'px',
            colors: [C_AURA[0], C_AURA[1], C_AURA[2]],
          })
      },
      draw(g, s, t) {
        const sh = screenShake(t, s.shakes)
        const sc = s.sc.g
        // The chamber, drawn whole each frame onto its own canvas, so the cut can split it.
        sc.drawImage(s.bg, 0, 0)
        // The veins: dull metal, then the light running along each to the dais and staying, then all of them flaring
        // as the steel answers.
        s.veins.forEach((pts, i) => {
          const q = span(t, C_VEINS[i]!, C_VEINS[i]! + 0.35)
          polyline(sc, pts, '#2a3a4e')
          if (q <= 0) return
          const nn = Math.max(2, Math.round(pts.length * q))
          const hot = q < 1 || within(t, C_DARK, C_DARK + 0.3) || (t > C_SWING && t < C_SHUT)
          polyline(sc, pts.slice(0, nn), hot ? C_AURA[1] : C_AURA[2])
          if (q < 1) {
            const [x, y] = pts[nn - 1]!
            sc.drawImage(glow(5, C_AURA[1], 1.2, 0.8), Math.round(x - 5), Math.round(y - 5))
          }
        })
        // The shaft of light from a crack in the roof onto the dais.
        const lightK = 1 - span(t, C_DARK - 0.2, C_DARK + 0.2) + span(t, R, R + 0.3)
        if (lightK > 0) {
          const top = 3
          const bot = feet
          // Three widths, thicker light at its heart: a beam with a body, not a cone of dots.
          for (let y = top; y < bot; y += 1) {
            const k = (y - top) / (bot - top)
            const hw = Math.round(lerp(3, m * 0.22, k))
            for (const [f, lv, c] of [
              [1, 2, '#6a88a8'],
              [0.66, 4, '#9ab8d8'],
              [0.33, 6, '#c8e0ff'],
            ] as const) {
              const ww = Math.max(1, Math.round(hw * f))
              sc.fillStyle = pat(sc, c, Math.round(lightK * (lv - k * (lv / 3))))
              sc.fillRect(cx - ww, y, ww * 2, 1)
            }
          }
          ellipse(sc, cx, feet, Math.round(m * 0.22), 4, pattern(sc, '#c8e0ff', Math.round(lightK * 7)))
        }
        s.dust.draw(sc)
        // The dark comes down; the dais's rim keeps the veins' glow.
        // While the world stands open, the cut's light shows it: the halves must be seen to slide.
        const opened = t > C_CUT && t < C_SHUT ? 0.45 : 1
        const dark = span(t, C_DARK - 0.2, C_DARK + 0.3) * (1 - span(t, R, R + 0.5)) * opened
        if (dark > 0) wash(sc, '#020306', dark * 0.72, 8)
        if (t > C_DARK) {
          const gr = Math.round(Math.min(w * 0.36, 64))
          sc.drawImage(glow(gr, C_AURA[3], 1.6, 0.5), cx - gr, feet - gr)
        }
        // The world splits along the cut; the rest of the frame goes on top, whole.
        g.fillStyle = '#020306'
        g.fillRect(0, 0, w, h)
        g.save()
        g.translate(sh.x, sh.y)
        if (t >= C_CUT && t < C_SHUT + 0.06) {
          const open =
            ease.outExpo(span(t, C_CUT, C_CUT + 0.25)) * (1 - ease.inQ(span(t, C_SHUT - 0.12, C_SHUT)))
          const d = Math.round(open * m * 0.1)
          const gp = Math.round(open * 6)
          const offL: Pt = [Math.round(-u[0] * d - n[0] * gp), Math.round(-u[1] * d - n[1] * gp)]
          const offR: Pt = [Math.round(u[0] * d + n[0] * gp), Math.round(u[1] * d + n[1] * gp)]
          // Behind the picture, the light the cut let in: blue at its lips, white at its heart.
          split(g, s.sc, w, h, cutX, offL, offR, (gg, y, xl, xr) => {
            rect(gg, xl, y, xr - xl, 1, C_AURA[2])
            rect(gg, xl + 2, y, xr - xl - 4, 1, C_AURA[1])
            const mid = Math.round((xl + xr) / 2)
            rect(gg, mid - 1, y, 3, 1, C_AURA[0])
          })
        } else g.drawImage(s.sc, 0, 0)
        // In the dark: the glint of its horn, then the blade drawn from it, then the stroke.
        if (t >= C_GLINT && t < R) {
          drawSprite(g, p.mon, cx, feet, {
            sil: '#04060a',
            outline:
              t > C_CUT
                ? Math.floor(t * 20) % 2
                  ? C_AURA[0]
                  : C_AURA[1]
                : t > C_DRAW
                  ? C_AURA[3]
                  : '#0e1828',
          })
          const gq = span(t, C_GLINT, C_GLINT + 0.3)
          if (t < C_DRAW + 0.1) {
            const st = Math.round(lerp(1, 6, pulse(gq, 0, 1)))
            rect(g, horn[0] - st, horn[1], st * 2 + 1, 1, '#ffffff')
            rect(g, horn[0], horn[1] - st, 1, st * 2 + 1, '#ffffff')
          }
          if (t < C_SWING)
            blade(g, horn[0], horn[1], bladeA, bladeLen, ease.outC(span(t, C_DRAW, C_DRAW + 0.45)), C_AURA, t)
          smear(g, horn[0], horn[1], bladeA, swingTo, bladeLen, span(t, C_SWING, C_CUT + 0.08), C_AURA)
          if (t >= C_CUT - 0.02 && t < C_CUT + 0.1)
            blade(g, horn[0], horn[1], swingTo, bladeLen, 1, C_AURA, t)
        }
        // The cut itself: a white line across everything, flaring again as the halves slam shut.
        cut(g, cutX(cy0), cy0, cutA, fade(t, C_CUT, 0.16), C_AURA, Math.max(w, h))
        cut(g, cutX(cy0), cy0, cutA, fade(t, C_SHUT, 0.22), C_AURA, Math.max(w, h))
        if (t >= R) revealFx(g, s.rays, p.mon, cx, feet, t, R, C_AURA, Math.max(w, h) * 0.7)
        s.fx.draw(g)
        g.restore()
        if (within(t, C_CUT, C_CUT + 0.2)) screenFlash(g, '#e8f6ff', 0.55 * (1 - span(t, C_CUT, C_CUT + 0.2)))
        if (within(t, R, R + 0.35)) screenFlash(g, '#ffffff', 0.85 * (1 - span(t, R, R + 0.35)))
        if (t < 0.4) wash(g, '#000000', 1 - span(t, 0, 0.4), 8)
      },
      cues: () =>
        inOrder([
          [0.1, quiet(() => tone(62, 2.6, { type: 'sine', vol: 0.05 }))],
          ...[0.45, 0.85].map(
            (d) => [d, quiet(() => tone(1760, 0.12, { type: 'triangle', vol: 0.02 }))] as const,
          ),
          ...C_VEINS.map(
            (v, i) =>
              [
                v,
                quiet(() => {
                  tone(2093 + i * 147, 0.9, { type: 'triangle', vol: 0.018 })
                  tone(1046 + i * 74, 0.5, { type: 'sine', vol: 0.02 })
                }),
              ] as const,
          ),
          [2.05, quiet(() => hiss(0.6, { freq: 220, type: 'lowpass', vol: 0.08 }))],
          [C_DARK, quiet(() => tone(98, 1.2, { type: 'sawtooth', vol: 0.02, slide: -30 }))],
          [C_GLINT, quiet(() => tone(3136, 0.35, { type: 'triangle', vol: 0.03 }))],
          [
            C_DRAW,
            quiet(() => {
              tone(330, 0.6, { type: 'sawtooth', vol: 0.025, slide: 990 })
              hiss(0.5, { freq: 2000, slide: 3000, vol: 0.03 })
            }),
          ],
          [C_SWING, quiet(() => hiss(0.22, { freq: 3500, slide: -2600, vol: 0.1 }))],
          [
            C_CUT,
            quiet(() => {
              tone(1568, 0.9, { type: 'square', vol: 0.025 })
              tone(2349, 0.7, { type: 'triangle', vol: 0.03 })
              hiss(0.4, { freq: 6000, slide: -4000, vol: 0.06 })
            }),
          ],
          [
            C_SHUT,
            quiet(() => (hiss(0.4, { freq: 200, type: 'lowpass', vol: 0.12 }), tone(70, 0.4, { vol: 0.05 }))),
          ],
          [4.1, quiet(() => fxSound('legend.heart'))],
          [R, (hud) => (quiet(() => fxSound('legend.roar'))(), hud.beat?.('roar'))],
        ] satisfies Cue<CS>[]),
    }
  },
}

// ================================================================================================= Terrakion

const T_AURA: Aura = ['#ffffff', '#ffe4a8', '#e8962e', '#7a3c12']
const T_STOMPS = [0.95, 1.5, 1.95, 2.3, 2.58, 2.8, 2.98] as const
const T_GLOW = 3.1
const T_SLICE = 3.5
const T_DROP = 3.95
const T_BURST = 4.2
const T_REVEAL = 4.7

type TS = {
  r: Rng
  fx: Particles
  dust: Particles
  shards: Shard[]
  /** Big chunks flying at the camera: they grow as they come. */
  near: Shard[]
  bg: Canvas
  rock: Canvas
  rays: Canvas
  cracks: Pt[][]
  shakes: [number, number, number][]
}

/** Victory Road at dusk: a red sky, far ridges, the canyon's walls in layers, the path climbing to the pass. */
function canyon(w: number, h: number, cx: number, ground: number, r: Rng): Canvas {
  const cv = canvas(w, h)
  const g = cv.g
  g.drawImage(dGradient(w, ground, ['#2a1028', '#5a1e2a', '#a8402a', '#e08a3a']), 0, 0)
  // The sun low behind the pass.
  g.drawImage(
    glow(Math.round(w * 0.3), '#ffb04a', 1.4, 0.5),
    cx - Math.round(w * 0.3),
    ground - 40 - Math.round(w * 0.3),
  )
  ellipse(g, cx, ground - 30, 12, 12, '#ffd890')
  // Far ridges, two layers.
  for (const [base, amp, c, f] of [
    [ground - 34, 14, '#5a2830', 23],
    [ground - 18, 10, '#3a1a24', 15],
  ] as const)
    for (let x = 0; x < w; x++) {
      const y = Math.round(base - Math.abs(Math.sin(x / f + base)) * amp - Math.sin(x / 7) * 2)
      rect(g, x, y, 1, ground - y, c)
    }
  // The canyon's walls, two pairs: hazy far cliffs narrowing to the pass, then the near ones framing the screen. Each
  // edge steps out in ledges (a random walk, lit along each ledge's top), red rock in strata.
  for (const [far, wd, pal] of [
    [true, 0.34, ['#4a1e1c', '#5a2620', '#421a18', '#a8503a', '#7a3426']],
    [false, 0.2, ['#2e120e', '#3a1814', '#26100c', '#e08a4a', '#8a3a22']],
  ] as const)
    for (const side of [-1, 1]) {
      let e = w * wd
      let next = 0
      let prev = e
      const top = far ? Math.round(ground * 0.35) : 0
      for (let y = top; y < (far ? ground : h); y++) {
        if (y >= next) {
          // A ledge: the edge jumps out or in, then runs on with a slight slope.
          next = y + r.int(6, 18)
          e = Math.max(w * wd * 0.55, Math.min(w * wd * 1.35, e + r.range(-7, 7)))
        }
        const ee = Math.round(e + Math.sin(y / 2.3) * 0.8 + (far ? 0 : (y / h) * w * 0.04))
        const x0 = side < 0 ? 0 : w - ee
        const layer = Math.floor((y + (side < 0 ? 0 : 5)) / 9) % 3
        rect(g, x0, y, ee, 1, pal[layer]!)
        // The inner face, catching the sunset; a ledge's top, lit right across.
        rect(g, side < 0 ? ee - 3 : w - ee, y, 3, 1, pal[4])
        rect(g, side < 0 ? ee - 1 : w - ee, y, 1, 1, pal[3])
        if (Math.round(ee) > Math.round(prev) + 1)
          rect(g, side < 0 ? Math.round(prev) - 2 : w - ee, y, ee - prev + 2, 1, pal[3])
        prev = ee
      }
    }
  // The path: packed earth climbing to the pass, lighter in the middle where it's worn.
  g.drawImage(dGradient(w, h - ground, ['#6a3a22', '#4a2818', '#2a160e', '#160a06']), 0, ground)
  rect(g, 0, ground, w, 1, '#a85a30')
  for (let y = ground + 2; y < h; y += 2) {
    const k = (y - ground) / (h - ground)
    const hw = Math.round(lerp(m2(w) * 0.2, w * 0.45, k))
    rect(g, cx - hw, y, hw * 2, 1, pattern(g, '#8a4a2a', 4))
  }
  for (let i = 0; i < Math.round(w / 2); i++) {
    const x = r.range(0, w)
    const y = r.range(ground + 2, h)
    const s = r.int(1, 3)
    rect(g, x, y, s, 1, r() < 0.5 ? '#a86a40' : '#1a0c06')
  }
  return cv
}
const m2 = (w: number) => Math.min(w, 200)

/** The boulder's half-width at row y: round on top, flattened where it sits. */
function rockHW(rw: number, rh: number, y: number) {
  const k = (y - rh * 0.55) / (rh * 0.55)
  return Math.round((rw / 2) * Math.sqrt(Math.max(0, 1 - k * k * (k < 0 ? 1 : 0.4))))
}

/**
 * The boulder that blocks the pass, shaded as a lump of rock: lit at its rim by the sunset behind it, its face to us in
 * shadow, broken into facets (each a plane tipped a little its own way), in dithered steps.
 */
function boulder(rw: number, rh: number, r: Rng): Canvas {
  const cx = rw / 2
  const pal = ['#1e0e08', '#2e1810', '#3e2216', '#56301e', '#7a4628', '#b8683a', '#f0a050']
  // Facets: Voronoi cells round random seeds, each with its own tilt.
  const seeds = Array.from({ length: 22 }, () => ({
    x: r.range(0, rw),
    y: r.range(0, rh),
    tx: r.range(-0.35, 0.35),
    ty: r.range(-0.35, 0.35),
  }))
  return shade(rw, rh, (x, y) => {
    const hw = rockHW(rw, rh, y)
    const dx = x + 0.5 - cx
    if (Math.abs(dx) >= hw) return null
    let best = 0
    let bd = Infinity
    let second = Infinity
    seeds.forEach((sd, i) => {
      const d = (x - sd.x) ** 2 + (y - sd.y) ** 2
      if (d < bd) {
        second = bd
        bd = d
        best = i
      } else if (d < second) second = d
    })
    const sd = seeds[best]!
    // The surface's slope here: round from the middle out, then the facet's own tilt.
    const nx = dx / Math.max(1, hw) + sd.tx
    const ny = (y - rh * 0.55) / (rh * 0.6) + sd.ty
    // The sunset is behind and above: the rim and the top catch it, the face stays dark.
    const rim = Math.max(0, Math.hypot(dx / Math.max(1, hw), 0) - 0.75) * 3 + Math.max(0, -ny - 0.45) * 1.6
    let v = 2.2 - nx * 0.6 - ny * 0.8 + rim * 2.2
    // The edges between facets: a dark seam.
    if (Math.sqrt(second) - Math.sqrt(bd) < 1.1) v -= 1.2
    const lv = Math.max(0, Math.min(pal.length - 1, Math.floor(v + bayer(x, y) - 0.5)))
    return pal[lv]!
  })
}

export const terrakionCinema: Cinema = {
  reveal: T_REVEAL,
  dur: T_REVEAL + AFTER_REVEAL,
  make(p: CinemaParams): Timeline<TS> {
    const F = frame(p)
    const { w, h, cx, m, feet, ground, many, quiet } = F
    const R = T_REVEAL
    const rw = Math.round(Math.max(70, Math.min(m * 0.86, 130)))
    const rh = Math.round(rw * 0.82)
    const rx = cx - Math.round(rw / 2)
    const ry = feet + 4 - rh
    // The slice: a shallow slant across the boulder, low on the left, high on the right.
    const sliceY = (x: number) => ry + rh * 0.48 + (x - cx) * -0.22
    return {
      id: 'cinema-terrakion',
      dur: R + AFTER_REVEAL,
      setup() {
        const r = rng(639)
        const cracks = [0, 1, 2, 3, 4, 5].map((i) => {
          const a = -Math.PI / 2 + (i - 2.5) * 0.5 + r.range(-0.2, 0.2)
          const x0 = rw / 2 + r.range(-6, 6)
          const y0 = rh * 0.6
          return bolt(r, x0, y0, x0 + Math.cos(a) * rw * 0.45, y0 + Math.sin(a) * rh * 0.5, 0.3, 3)
        })
        return {
          r,
          fx: new Particles(),
          dust: new Particles(),
          shards: [],
          near: [],
          bg: canyon(w, h, cx, ground, r),
          rock: boulder(rw, rh, r),
          rays: canvas(w, h),
          cracks,
          shakes: p.short
            ? []
            : [
                ...T_STOMPS.map((s, i) => [s, 0.25, 1 + Math.floor(i / 2)] as [number, number, number]),
                [T_DROP, 0.5, 5],
                [T_BURST, 0.7, 6],
                [R, 0.5, 3],
              ],
        }
      },
      step(s, t, dt) {
        const r = s.r
        s.fx.update(dt)
        s.dust.update(dt)
        stepShards(s.shards, dt, { floor: h + 30 })
        stepShards(s.near, dt, { g: 120 })
        for (const c of s.near) c.r += dt * m * 0.22
        // The canyon's wind: dust blowing across.
        if (r() < 0.4 * many)
          s.dust.add({
            x: -4,
            y: r.range(ground - 30, h),
            vx: r.range(30, 60),
            vy: r.range(-4, 4),
            life: 6,
            size: 1,
            shape: 'px',
            colors: ['#c87a4a', '#8a4a2a'],
          })
        // Each hoofbeat: pebbles hop, dust falls from the walls.
        T_STOMPS.forEach((st, i) => {
          if (!within(t, st, st + dt)) return
          for (let k = 0; k < (8 + i * 2) * many; k++)
            s.fx.add({
              x: r.range(0, w),
              y: r.range(ground + 2, h),
              vy: -r.range(20, 50 + i * 8),
              ay: 300,
              life: 0.5,
              size: 1,
              shape: 'px',
              colors: ['#a86a40', '#6a3a22'],
            })
          for (let k = 0; k < 6 * many; k++)
            s.fx.add({
              x: r() < 0.5 ? r.range(0, w * 0.2) : r.range(w * 0.8, w),
              y: r.range(0, ground * 0.6),
              vy: r.range(10, 30),
              ay: 160,
              life: 1.2,
              size: r.int(1, 2),
              shape: 'smoke',
              colors: ['#8a5a3a', '#6a4028'],
            })
        })
        // The top half crashes down beside the path: a cloud of dust.
        if (within(t, T_DROP, T_DROP + dt))
          for (let k = 0; k < 30 * many; k++)
            s.dust.add({
              x: cx - r.range(rw * 0.2, rw * 0.9),
              y: feet + r.range(-4, 4),
              vx: r.range(-40, 60),
              vy: -r.range(5, 30),
              drag: 2,
              life: r.range(0.8, 1.6),
              size: r.int(2, 5),
              shape: 'smoke',
              colors: ['#c89a6a', '#a87a50', '#7a5438'],
            })
        // It charges through what's left: rubble flying at the camera, dust everywhere.
        if (within(t, T_BURST, T_BURST + dt)) {
          for (let k = 0; k < 40 * many + 12; k++) {
            const sh = makeShard(
              r,
              r.range(rx + 6, rx + rw - 6),
              r.range(sliceY(cx), feet),
              r.range(120, 260),
              r() < 0.5 ? '#6a3e26' : '#4a2a1c',
              '#e0884a',
              0.5,
            )
            sh.r = r.range(2, 7)
            sh.vx += (sh.x - cx) * 3
            s.shards.push(sh)
          }
          for (let k = 0; k < (p.short ? 3 : 7); k++) {
            const a = (k / 7) * Math.PI * 2 + r.range(-0.3, 0.3)
            const c = makeShard(
              r,
              cx + Math.cos(a) * 8,
              feet - rh * 0.3 + Math.sin(a) * 6,
              1,
              '#4a2a1c',
              '#e0884a',
            )
            c.vx = Math.cos(a) * r.range(60, 110)
            c.vy = Math.sin(a) * r.range(40, 80) - 30
            c.r = r.range(3, 6)
            c.va = r.range(-4, 4)
            c.life = 1.4
            s.near.push(c)
          }
          for (let k = 0; k < 50 * many; k++) {
            const a = -Math.PI / 2 + r.range(-1.6, 1.6)
            const v = r.range(30, 120)
            s.dust.add({
              x: cx + r.range(-rw * 0.4, rw * 0.4),
              y: feet - r.range(0, rh * 0.5),
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v * 0.5,
              drag: 2.2,
              life: r.range(0.9, 1.8),
              size: r.int(3, 7),
              shape: 'smoke',
              colors: ['#d8aa7a', '#b88a5a', '#8a6040'],
            })
          }
        }
        if (within(t, R, R + dt)) revealBurst(s.fx, r, cx, feet - 30, 50 * many, T_AURA)
        // Its hooves skid it to a stop: dust streaming back.
        if (t > R - 0.3 && t < R + 0.6 && r() < 0.8 * many)
          s.dust.add({
            x: cx + r.range(-F.sz.w * 0.4, F.sz.w * 0.4),
            y: feet,
            vx: r.range(-50, 50),
            vy: -r.range(5, 25),
            drag: 2,
            life: 0.9,
            size: r.int(2, 4),
            shape: 'smoke',
            colors: ['#c89a6a', '#8a6040'],
          })
      },
      draw(g, s, t) {
        const sh = screenShake(t, s.shakes)
        g.fillStyle = '#160a06'
        g.fillRect(0, 0, w, h)
        g.save()
        g.translate(sh.x, sh.y)
        g.drawImage(s.bg, 0, 0)
        // The dusk dims as the cracks start to glow.
        const dim = span(t, T_GLOW - 0.6, T_GLOW + 0.2) * (1 - span(t, R, R + 0.6))
        if (dim > 0) wash(g, '#140608', dim * 0.45, 8)
        const glowK = span(t, T_GLOW, T_SLICE)
        if (t < T_BURST) {
          // Light leaks round the boulder's edge from whatever stands behind it.
          if (glowK > 0) {
            const gr = Math.round(rw * 0.62)
            g.drawImage(glow(gr, T_AURA[2], 2.2, 0.8 * glowK), cx - gr, ry + Math.round(rh * 0.55) - gr)
          }
          // Whole, or sliced: its lower part stays, its top slides off along the cut and falls.
          if (t < T_SLICE) g.drawImage(s.rock, rx, ry)
          else {
            const q = span(t, T_SLICE + 0.08, T_DROP)
            const slide = ease.inQ(q)
            // Downhill along the cut (it rises to the right), then over the edge and down.
            const tx = Math.round(-slide * rw * 0.6)
            const ty = Math.round(slide * rw * 0.13 + ease.inC(q) * rh * 0.6)
            for (let x = 0; x < rw; x++) {
              const cy = Math.round(sliceY(rx + x) - ry)
              g.drawImage(s.rock, x, cy, 1, rh - cy, rx + x, ry + cy, 1, rh - cy)
              if (t < T_DROP) g.drawImage(s.rock, x, 0, 1, cy, rx + x + tx, ry + ty, 1, cy)
            }
            // The cut face, molten amber, cooling.
            const hot = 1 - span(t, T_SLICE, T_BURST)
            for (let x = 0; x < rw; x += 1) {
              const y = Math.round(sliceY(rx + x))
              if (Math.abs(x - rw / 2) < rockHW(rw, rh, y - ry))
                rect(g, rx + x, y, 1, hot > 0.4 ? 2 : 1, hot > 0.5 ? T_AURA[1] : T_AURA[2])
            }
          }
          // The cracks, spreading with each hoofbeat and glowing from within.
          s.cracks.forEach((pts, i) => {
            const at = T_STOMPS[Math.min(T_STOMPS.length - 1, i + 1)]!
            const q = span(t, at, at + 0.15)
            if (q <= 0) return
            const nn = Math.max(2, Math.round(pts.length * q))
            const seg = pts.slice(0, nn).map(([x, y]) => [x + rx, y + ry] as Pt)
            // Only the part under the slice stays once it's cut.
            const keep = t < T_SLICE ? seg : seg.filter(([x, y]) => y > sliceY(x))
            if (keep.length < 2) return
            polyline(g, keep, glowK > 0.3 ? T_AURA[2] : '#140804', glowK > 0.6 ? 3 : 1)
            if (glowK > 0) polyline(g, keep, glowK > 0.6 ? T_AURA[1] : T_AURA[2])
          })
        }
        // A glint behind the boulder's top, and the blade sweeping through it.
        if (within(t, T_GLOW + 0.1, T_SLICE + 0.05)) {
          const gq = span(t, T_GLOW + 0.1, T_GLOW + 0.4)
          const st = Math.round(lerp(1, 6, pulse(gq, 0, 1)))
          rect(g, cx - rw * 0.55 - st, sliceY(cx - rw * 0.55), st * 2 + 1, 1, '#ffffff')
          rect(g, cx - rw * 0.55, sliceY(cx - rw * 0.55) - st, 1, st * 2 + 1, '#ffffff')
        }
        if (within(t, T_SLICE - 0.12, T_SLICE + 0.3)) {
          const q = span(t, T_SLICE - 0.12, T_SLICE)
          const x0 = cx - rw * 0.75
          const x1 = lerp(x0, cx + rw * 0.75, ease.outC(q))
          const k = 1 - span(t, T_SLICE, T_SLICE + 0.3)
          const wd = Math.max(1, Math.round(5 * k))
          line(g, x0, sliceY(x0), x1, sliceY(x1), T_AURA[2], wd + 2)
          line(g, x0, sliceY(x0), x1, sliceY(x1), T_AURA[1], wd)
          line(g, x0, sliceY(x0), x1, sliceY(x1), T_AURA[0], Math.max(1, wd - 2))
          if (q < 1) {
            const st = 5
            rect(g, x1 - st, sliceY(x1), st * 2 + 1, 1, '#ffffff')
            rect(g, x1, sliceY(x1) - st, 1, st * 2 + 1, '#ffffff')
          }
        }
        s.dust.draw(g)
        // The charge: its silhouette coming out of the dust, then itself.
        if (t >= T_BURST && t < R) {
          const q = ease.outQ(span(t, T_BURST, R))
          const sc = lerp(0.55, 1, q)
          drawSprite(g, p.mon, cx, Math.round(lerp(feet - 14, feet, q)), {
            sx: sc,
            sy: sc,
            sil: '#1a0a06',
            outline: Math.floor(t * 16) % 2 ? T_AURA[1] : T_AURA[2],
          })
        }
        if (t >= R) revealFx(g, s.rays, p.mon, cx, feet, t, R, T_AURA, Math.max(w, h) * 0.7)
        drawShards(g, s.shards, '#1a0a06')
        drawShards(g, s.near, '#140804')
        s.fx.draw(g)
        g.restore()
        if (within(t, T_SLICE, T_SLICE + 0.18))
          screenFlash(g, '#fff0d0', 0.45 * (1 - span(t, T_SLICE, T_SLICE + 0.18)))
        if (within(t, T_BURST, T_BURST + 0.2))
          screenFlash(g, '#ffe8c0', 0.35 * (1 - span(t, T_BURST, T_BURST + 0.2)))
        if (within(t, R, R + 0.35)) screenFlash(g, '#ffffff', 0.85 * (1 - span(t, R, R + 0.35)))
        if (t < 0.4) wash(g, '#000000', 1 - span(t, 0, 0.4), 8)
      },
      cues: () =>
        inOrder([
          [0.1, quiet(() => hiss(4, { freq: 500, q: 3, vol: 0.02, slide: 200 }))],
          ...T_STOMPS.map(
            (st, i) =>
              [
                st,
                quiet(() => {
                  tone(55 + i * 3, 0.35, { type: 'sine', vol: 0.12 + i * 0.02, slide: -20 })
                  hiss(0.25, { freq: 180, type: 'lowpass', vol: 0.08 + i * 0.015 })
                }),
              ] as const,
          ),
          [T_GLOW, quiet(() => tone(196, 0.8, { type: 'sawtooth', vol: 0.025, slide: 200 }))],
          [T_GLOW + 0.1, quiet(() => tone(2637, 0.3, { type: 'triangle', vol: 0.025 }))],
          [
            T_SLICE - 0.1,
            quiet(() => {
              hiss(0.3, { freq: 3000, slide: -2200, vol: 0.1 })
              tone(1175, 0.7, { type: 'square', vol: 0.025 })
            }),
          ],
          [
            T_DROP,
            quiet(() => (hiss(0.6, { freq: 160, type: 'lowpass', vol: 0.16 }), tone(48, 0.5, { vol: 0.08 }))),
          ],
          [4.05, quiet(() => fxSound('legend.heart'))],
          [
            T_BURST,
            quiet(() => {
              hiss(0.9, { freq: 260, type: 'lowpass', vol: 0.2 })
              tone(60, 0.7, { type: 'sawtooth', vol: 0.06, slide: -25 })
            }),
          ],
          [R, (hud) => (quiet(() => fxSound('legend.roar'))(), hud.beat?.('roar'))],
        ] satisfies Cue<TS>[]),
    }
  },
}

// ================================================================================================= Virizion

const V_AURA: Aura = ['#ffffff', '#d0ffd8', '#48d07a', '#155a32']
const V_GUST = 1.15
const V_RUN = 1.6
const V_HOLD = 2.55
const V_CUTS = [3.15, 3.27, 3.39, 3.51, 3.63, 3.75] as const
const V_LAND = 4.05
const V_REVEAL = 4.5
const LEAF = ['#7ad84a', '#4aa83a', '#a8e05a', '#2e7a2e', '#e0d050'] as const

interface Leaf {
  x: number
  y: number
  vx: number
  vy: number
  c: string
  /** Its two halves, once a cut has gone through it. */
  cut?: { a: number; t: number }
  ph: number
  /** Its place in the whirl: angle, radius (the whirl is flattened, a ring lying round the clearing's heart). */
  orb?: { a: number; r: number; x0: number; y0: number; t0: number }
}

type VS = {
  r: Rng
  fx: Particles
  leaves: Leaf[]
  bg: Canvas
  rays: Canvas
  cuts: { x: number; y: number; a: number }[]
  shakes: [number, number, number][]
}

/** A trunk from the top of the screen to its roots: bark ridges, a lit side, moss, roots flaring into the ground. */
function trunk(g: G, r: Rng, x: number, tw: number, foot: number, pal: readonly string[], moss: boolean) {
  const [dark, body, lit, ridge] = pal as [string, string, string, string]
  for (let y = 0; y < foot; y++) {
    // A slight taper and a lean, so no two read as posts.
    const k = y / foot
    const ww = Math.round(tw * (0.85 + 0.15 * k))
    const xx = Math.round(x + Math.sin(y / 37 + x) * 1.5 - (ww - tw) / 2)
    rect(g, xx, y, ww, 1, body)
    rect(g, xx, y, Math.max(1, Math.round(ww * 0.25)), 1, lit)
    rect(g, xx + ww - Math.max(1, Math.round(ww * 0.3)), y, Math.max(1, Math.round(ww * 0.3)), 1, dark)
  }
  // Bark: ridges running down it, broken here and there.
  for (let i = 1; i < tw - 1; i += 3)
    for (let y = r.int(0, 8); y < foot; y += r.int(10, 22)) rect(g, x + i, y, 1, r.int(5, 14), ridge)
  if (moss)
    for (let i = 0; i < 3; i++) {
      // Moss in soft patches on its lit side, dithered at the edges.
      const y = r.range(foot * 0.25, foot * 0.95)
      const mr = Math.max(2, Math.round(tw * 0.22))
      ellipse(g, x + mr, y, mr, mr + 3, pattern(g, '#2e6a2a', 10))
      ellipse(g, x + mr - 1, y - 1, mr - 1, mr + 1, pattern(g, '#4a8a3a', 7))
    }
  // Roots, flaring out into the ground.
  for (const sd of [-1, 1]) {
    const bx = sd < 0 ? x : x + tw
    tri(g, bx - sd * 3, foot - 10, bx + sd * 8, foot + 2, bx - sd * 3, foot + 2, body)
    line(g, bx - sd * 2, foot - 9, bx + sd * 7, foot + 1, sd < 0 ? lit : dark)
  }
}

/** Pinwheel Forest: far trunks in green haze, giant near ones, the canopy, light shafts, the clearing's grass. */
function forest(w: number, h: number, cx: number, ground: number, r: Rng): Canvas {
  const cv = canvas(w, h)
  const g = cv.g
  g.drawImage(dGradient(w, ground, ['#0c2a1a', '#164228', '#245c34', '#357040']), 0, 0)
  // Haze: the farthest trunks, pale and thin.
  for (let i = 0; i < Math.round(w / 12); i++) {
    const x = r.range(-6, w + 6)
    rect(g, x, 0, r.int(2, 4), ground, '#2e6a3e')
  }
  // Mid trunks, then a nearer row, each darker.
  for (let i = 0; i < Math.round(w / 22); i++)
    trunk(g, r, r.range(-8, w), r.int(6, 10), ground - 4, ['#123620', '#1c4a2a', '#2e6a38', '#143c22'], false)
  for (let i = 0; i < Math.max(2, Math.round(w / 50)); i++) {
    const x = cx + (i % 2 ? 1 : -1) * r.range(w * 0.22, w * 0.42) - 7
    trunk(g, r, x, r.int(11, 16), ground + 2, ['#08180e', '#10281a', '#24502c', '#0a2012'], true)
  }
  // The canopy: masses of leaves at the top, dark, lit at their lower edge.
  for (let x = -10; x < w + 10; x += r.int(8, 14)) {
    const y = r.int(4, Math.round(h * 0.1))
    const rr = r.int(9, 16)
    ellipse(g, x, y, rr, Math.round(rr * 0.7), '#0a2214')
    ellipse(g, x, y + 3, rr - 2, Math.round(rr * 0.5), '#123a20')
    for (let k = 0; k < 4; k++) rect(g, x + r.range(-rr, rr), y + r.range(2, rr * 0.6), 2, 1, '#2a6a30')
  }
  rect(g, 0, 0, w, 5, '#06140c')
  // The ground: moss and grass, the clearing lit in the middle, tufts, little flowers, stones.
  g.drawImage(dGradient(w, h - ground, ['#3e8034', '#2c5e28', '#1c3e1c', '#0c200e']), 0, ground)
  rect(g, 0, ground, w, 1, '#6ab04a')
  for (let y = ground + 2; y < h; y += 3) {
    const k = (y - ground) / (h - ground)
    const hw = Math.round(lerp(w * 0.22, w * 0.55, k))
    rect(g, cx - hw, y, hw * 2, 1, pattern(g, '#5aa83a', 5))
  }
  for (let i = 0; i < Math.round(w / 3); i++) {
    const x = r.range(0, w)
    const y = r.range(ground + 2, h)
    const k = (y - ground) / (h - ground)
    const ht = Math.round(2 + k * 4)
    line(g, x, y, x - 1, y - ht, '#1e4a1e')
    line(g, x + 1, y, x + 2, y - ht, '#5aa83a')
    if (r() < 0.08) rect(g, x, y - ht - 1, 2, 2, r() < 0.5 ? '#ff9ab8' : '#ffe070')
  }
  // Ferns at the clearing's edges.
  for (const side of [-1, 1])
    for (let i = 0; i < 4; i++) {
      const x = cx + side * (w * 0.3 + i * 9 + r.range(0, 6))
      const y = ground + 6 + i * 5
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI / 2 + (k - 2) * 0.45
        line(g, x, y, x + Math.cos(a) * 12, y + Math.sin(a) * 10, k % 2 ? '#2a6a2a' : '#3a8a32')
      }
    }
  // The giant trunks in front, framing it: ridged bark, moss, lit on their inner side.
  const tw = Math.round(Math.max(16, w * 0.11))
  trunk(g, r, -Math.round(tw * 0.35), tw, h + 4, ['#06120a', '#0c2014', '#1e4026', '#081a0e'], false)
  trunk(g, r, w - Math.round(tw * 0.65), tw, h + 4, ['#06120a', '#0c2014', '#1e4026', '#081a0e'], false)
  return cv
}

/** A leaf, 5 × 3, in one of four turns: its body, a lit edge, a dark rib. */
function drawLeaf(g: G, x: number, y: number, f: number, c: string) {
  const m = [
    ['.ab..', 'abbbc', '..bc.'],
    ['..a', '.ab', 'abb', 'bbc', 'bc.'],
    ['..ba.', 'cbbba', '.cb..'],
    ['a..', 'ba.', 'bba', 'cbb', '.cb'],
  ][f]!
  for (let r = 0; r < m.length; r++)
    for (let q = 0; q < m[r]!.length; q++) {
      const k = m[r]![q]
      if (k === '.') continue
      rect(g, x - 2 + q, y - 1 + r, 1, 1, k === 'a' ? '#e0ffa8' : k === 'b' ? c : '#1e5a22')
    }
}

export const virizionCinema: Cinema = {
  reveal: V_REVEAL,
  dur: V_REVEAL + AFTER_REVEAL,
  make(p: CinemaParams): Timeline<VS> {
    const F = frame(p)
    const { w, h, cx, m, feet, ground, sz, many, quiet } = F
    const R = V_REVEAL
    // The whirl's heart, and where the cuts cross: over the clearing, at its chest height.
    const hx = cx
    const hy = Math.round(feet - Math.max(30, sz.h * 0.55))
    const wind = (t: number) => (t < V_GUST ? 0 : t < V_HOLD ? span(t, V_GUST, V_GUST + 0.5) : 0)
    return {
      id: 'cinema-virizion',
      dur: R + AFTER_REVEAL,
      setup() {
        const r = rng(640)
        const leaves: Leaf[] = Array.from({ length: Math.round(60 * many) + 12 }, () => ({
          x: r.range(0, w),
          y: r.range(-h * 0.2, h * 0.8),
          vx: r.range(-6, 6),
          vy: r.range(8, 16),
          c: r.pick(LEAF),
          ph: r() * 6,
        }))
        const cuts = V_CUTS.map((_, i) => ({
          x: hx + r.range(-6, 6),
          y: hy + r.range(-6, 6),
          a: (i * Math.PI) / V_CUTS.length + 0.3 + r.range(-0.1, 0.1),
        }))
        // An order that crosses the star, not one that turns round it.
        const order = [0, 3, 1, 4, 2, 5].map((i) => cuts[i]!)
        return {
          r,
          fx: new Particles(),
          leaves,
          bg: forest(w, h, cx, ground, r),
          rays: canvas(w, h),
          cuts: order,
          shakes: p.short
            ? []
            : [
                [V_CUTS[5], 0.3, 2],
                [R, 0.5, 3],
              ],
        }
      },
      step(s, t, dt) {
        const r = s.r
        s.fx.update(dt)
        const k = wind(t)
        const held = t >= V_HOLD && t < V_CUTS[0] + 0.02
        for (const l of s.leaves) {
          if (l.cut) {
            // Halves: falling, spinning apart.
            l.vy += 60 * dt
            l.x += l.vx * dt
            l.y += l.vy * dt
            continue
          }
          if (held) {
            // Hanging in the air, barely turning.
            l.ph += dt * 0.5
            continue
          }
          if (t >= V_CUTS[0]) {
            l.y += 4 * dt
            continue
          }
          if (k <= 0) {
            // Falling, drifting.
            l.x += (l.vx + Math.sin(t * 2 + l.ph) * 6) * dt
            l.y += l.vy * dt
            l.ph += dt * 2
            if (l.y > h + 4) {
              l.y = -4
              l.x = r.range(0, w)
            }
            continue
          }
          // The gust: each leaf swept from where it was onto a ring round the clearing's heart, turning faster.
          l.orb ??= {
            a: Math.atan2((l.y - hy) * 1.8, l.x - hx),
            r: r.range(m * 0.14, m * 0.44),
            x0: l.x,
            y0: l.y,
            t0: t,
          }
          const o = l.orb
          o.a += (dt * (2 + k * 4) * (m * 0.3)) / o.r
          const ox = hx + Math.cos(o.a) * o.r
          const oy = hy + Math.sin(o.a) * o.r * 0.55
          const q = ease.ioQ(span(t, o.t0, o.t0 + 0.7))
          l.x = lerp(o.x0, ox, q)
          l.y = lerp(o.y0, oy, q)
          l.ph += dt * (2 + k * 10)
        }
        // Each cut: every leaf it crosses falls in two.
        V_CUTS.forEach((ct, i) => {
          if (!within(t, ct, ct + dt)) return
          const c = s.cuts[i]!
          const nx = -Math.sin(c.a)
          const ny = Math.cos(c.a)
          for (const l of s.leaves) {
            if (l.cut) continue
            const dd = (l.x - c.x) * nx + (l.y - c.y) * ny
            if (Math.abs(dd) > 7 + i) continue
            l.cut = { a: c.a, t: ct }
            l.vx = nx * r.range(10, 30) * Math.sign(dd || 1)
            l.vy = r.range(-10, 10)
          }
          for (let k2 = 0; k2 < 8 * many; k2++) {
            const q = r.range(-1, 1)
            s.fx.add({
              x: c.x + Math.cos(c.a) * q * m * 0.5,
              y: c.y + Math.sin(c.a) * q * m * 0.5,
              vx: nx * r.range(-40, 40),
              vy: ny * r.range(-40, 40),
              drag: 3,
              life: 0.5,
              size: 1,
              shape: 'px',
              colors: [V_AURA[0], V_AURA[1], V_AURA[2]],
            })
          }
        })
        // The grass parting in a line: blades thrown up where it passes.
        if (t > V_RUN && t < V_RUN + 0.55) {
          const q = span(t, V_RUN, V_RUN + 0.55)
          const x = lerp(-10, w + 10, q)
          const y = lerp(ground + (h - ground) * 0.7, ground + 4, q)
          for (let i = 0; i < 3 * many + 1; i++)
            s.fx.add({
              x: x + r.range(-3, 3),
              y,
              vx: r.range(-30, 10),
              vy: -r.range(30, 70),
              ay: 200,
              life: 0.6,
              size: 1,
              shape: 'px',
              colors: ['#a8e05a', '#5aa83a'],
            })
        }
        if (within(t, R, R + dt)) {
          revealBurst(s.fx, r, cx, feet - 30, 40 * many, V_AURA)
          // Petals and leaves thrown out in a whirl.
          for (let i = 0; i < 40 * many; i++) {
            const a = r() * Math.PI * 2
            const v = r.range(40, 120)
            s.fx.add({
              x: cx,
              y: feet - 20,
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v * 0.6,
              drag: 1.8,
              ay: 30,
              life: r.range(1, 1.8),
              size: 2,
              shape: 'leaf',
              spin: r.range(-6, 6),
              colors: [r() < 0.35 ? '#ff7a9a' : r.pick(LEAF)],
              light: '#ffffff',
            })
          }
        }
        if (t > R && r() < 0.25 * many)
          s.fx.add({
            x: r.range(0, w),
            y: -4,
            vx: r.range(-8, 8),
            vy: r.range(14, 24),
            life: 8,
            size: 2,
            shape: 'leaf',
            spin: r.range(-2, 2),
            colors: [r.pick(LEAF)],
          })
      },
      draw(g, s, t) {
        const sh = screenShake(t, s.shakes)
        g.fillStyle = '#06140c'
        g.fillRect(0, 0, w, h)
        g.save()
        g.translate(sh.x, sh.y)
        g.drawImage(s.bg, 0, 0)
        // Light shafts slanting through the canopy, swaying.
        const lk = 1 - span(t, V_HOLD - 0.1, V_HOLD + 0.3) * 0.8 + span(t, R, R + 0.5) * 0.8
        for (let i = 0; i < 3; i++) {
          const x0 = Math.round(w * (0.25 + i * 0.25) + Math.sin(t * 0.6 + i) * 3)
          for (let y = 6; y < ground; y += 1) {
            const x = x0 + Math.round((y - 6) * 0.35)
            g.fillStyle = pat(g, '#c8f0a0', Math.round(3 * lk * (1 - y / ground) + 1))
            g.fillRect(x, y, 6 + Math.round(y * 0.06), 1)
          }
        }
        // The hold: the green dims, a stillness.
        const dim = span(t, V_HOLD - 0.1, V_HOLD + 0.3) * (1 - span(t, R, R + 0.4))
        if (dim > 0) wash(g, '#020a06', dim * 0.55, 8)
        // The parting grass: a furrow running across the clearing.
        if (t > V_RUN && t < V_RUN + 1.2) {
          const q = span(t, V_RUN, V_RUN + 0.55)
          const fade = 1 - span(t, V_RUN + 0.55, V_RUN + 1.2)
          const x1 = lerp(-10, w + 10, q)
          const ya = ground + (h - ground) * 0.7
          const yb = ground + 4
          for (let x = -10; x < x1; x += 2) {
            const y = Math.round(lerp(ya, yb, (x + 10) / (w + 20)))
            if (fade > 0.5 || (x >> 1) % 2) rect(g, x, y, 2, 1, '#1a3a1a')
            rect(g, x, y - 1, 1, 1, '#a8e05a')
          }
          rect(g, x1 - 1, lerp(ya, yb, (x1 + 10) / (w + 20)) - 2, 3, 3, q < 1 ? '#e8ffd0' : '#a8e05a')
        }
        // The leaves: whole, held, or two halves falling apart.
        for (const l of s.leaves) {
          const x = Math.round(l.x)
          const y = Math.round(l.y)
          if (l.cut) {
            const age = t - l.cut.t
            const sp = Math.round(Math.min(5, age * 16))
            const ox = Math.round(-Math.sin(l.cut.a) * sp)
            const oy = Math.round(Math.cos(l.cut.a) * sp)
            // Each half a leaf's worth of pixels, its cut edge pale.
            rect(g, x - ox - 1, y - oy, 3, 2, l.c)
            rect(g, x - ox, y - oy, 1, 1, '#e8ffc8')
            rect(g, x + ox, y + oy - 1, 3, 2, l.c)
            rect(g, x + ox + 1, y + oy, 1, 1, '#e8ffc8')
            if (age < 0.15) rect(g, x - 1, y - 1, 3, 3, '#ffffff')
            continue
          }
          drawLeaf(g, x, y, Math.floor(l.ph) % 4, l.c)
        }
        // The cuts: each a line across the screen, gone in a quarter second; together they leave a star.
        V_CUTS.forEach((ct, i) => {
          const c = s.cuts[i]!
          const k = 1 - span(t, ct, ct + 0.28)
          if (t >= ct) cut(g, c.x, c.y, c.a, k, V_AURA, Math.max(w, h))
          // A green streak at the cut's head, there and gone: the only sight of it.
          if (within(t, ct - 0.05, ct)) {
            const q = span(t, ct - 0.05, ct)
            const x = c.x + Math.cos(c.a) * lerp(-m * 0.6, m * 0.6, q)
            const y = c.y + Math.sin(c.a) * lerp(-m * 0.6, m * 0.6, q)
            rect(g, x - 2, y - 2, 5, 5, V_AURA[1])
          }
        })
        // The star of cuts lingering where they crossed.
        const star = span(t, V_CUTS[5], V_CUTS[5] + 0.1) * (1 - span(t, R + 0.1, R + 0.4))
        if (star > 0) {
          const gr = Math.round(m * 0.2)
          g.drawImage(glow(gr, V_AURA[2], 1.3, 0.6 * star), hx - gr, hy - gr)
          for (const c of s.cuts) {
            const L = m * 0.22 * star
            line(
              g,
              hx - Math.cos(c.a) * L,
              hy - Math.sin(c.a) * L,
              hx + Math.cos(c.a) * L,
              hy + Math.sin(c.a) * L,
              V_AURA[1],
            )
          }
        }
        // It lands from above, where the cuts meet: a silhouette leaping down.
        if (t >= V_LAND && t < R) {
          const q = ease.inQ(span(t, V_LAND, R))
          drawSprite(g, p.mon, cx, Math.round(lerp(-10, feet, q)), {
            sil: '#04140a',
            outline: Math.floor(t * 20) % 2 ? V_AURA[0] : V_AURA[1],
            sy: lerp(1.15, 1, q),
            sx: lerp(0.9, 1, q),
          })
        }
        if (t >= R) revealFx(g, s.rays, p.mon, cx, feet, t, R, V_AURA, Math.max(w, h) * 0.7)
        s.fx.draw(g)
        g.restore()
        // The cuts' flashes: only the first and the last, far enough apart.
        if (within(t, V_CUTS[0], V_CUTS[0] + 0.12)) screenFlash(g, '#e8ffe8', 0.3)
        if (within(t, R, R + 0.35)) screenFlash(g, '#ffffff', 0.85 * (1 - span(t, R, R + 0.35)))
        if (t < 0.4) wash(g, '#000000', 1 - span(t, 0, 0.4), 8)
      },
      cues: () =>
        inOrder([
          [0.1, quiet(() => hiss(1.2, { freq: 800, q: 2, vol: 0.02 }))],
          ...[0.4, 0.75].map(
            (d, i) => [d, quiet(() => tone(2093 + i * 349, 0.12, { type: 'triangle', vol: 0.018 }))] as const,
          ),
          [V_GUST, quiet(() => hiss(1.4, { freq: 600, slide: 1600, vol: 0.07, q: 1.5 }))],
          [V_RUN, quiet(() => hiss(0.55, { freq: 1800, slide: 1200, vol: 0.05 }))],
          [V_HOLD, quiet(() => tone(1319, 1.4, { type: 'sine', vol: 0.03 }))],
          ...V_CUTS.map(
            (c, i) =>
              [
                c,
                quiet(() => {
                  hiss(0.12, { freq: 5000 - i * 300, slide: -2500, vol: 0.07 })
                  tone(2637 - i * 100, 0.2, { type: 'triangle', vol: 0.02 })
                }),
              ] as const,
          ),
          [V_LAND, quiet(() => fxSound('legend.heart'))],
          [R, (hud) => (quiet(() => fxSound('legend.roar'))(), hud.beat?.('roar'))],
        ] satisfies Cue<VS>[]),
    }
  },
}
