// Enamorus's raid entrance (docs/53): Hisui in spring. A green hillside under a soft evening sky, Mt. Coronet far off,
// cherry trees in bloom either side, petals drifting. The wind rises: the trees shake, the grass bends flat, the petals
// stream sideways and the clouds race and blush pink. Then the Springtide Storm: dark pink clouds gather overhead with
// pink lightning inside them, and the petals are torn up into a whirling funnel, hearts flashing among them. The funnel
// draws itself into a giant heart of petals that beats, once, twice, three times, faster; it bursts in a pink storm,
// and Enamorus rides down out of it on its cloud.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  bayer,
  bolt,
  cached,
  canvas,
  ease,
  ellipse,
  ellipseLine,
  glow,
  lerp,
  line,
  polyline,
  rect,
  rng,
  shade,
  span,
  type Canvas,
  type G,
} from '../../pixel'
import { drawSprite } from '../../sprites'
import { burstRing, dGradient, dissolve, tri } from './kit'
import { fogBand, heartC, raidCinema, scroll, type Raid } from './gen8kit'

const REVEAL = 4.6
const T_WIND = 1.0
const T_STORM = 1.95
const T_HEART = 2.95
const BEATS = [3.3, 3.62, 3.86] as const
const T_BURST = 4.08
const T_RIDE = 4.12
const N = 220

const AURA = ['#ffffff', '#ffd0e8', '#f070b0', '#7a1a5a'] as const
const PINK = ['#fff0f8', '#ffc0dc', '#f590c0', '#d8609a', '#9a2a6a'] as const

type X = {
  back: Canvas
  trees: [Canvas, Canvas]
  clouds: Canvas
  storm: Canvas
  petals: { a: number; r: number; h: number; s: number; c: number }[]
  bolts: [number, number][][]
  horizon: number
  /** The heart's centre and size. */
  hc: [number, number]
  hs: number
}

/** A cherry tree in bloom, drawn once: a crooked trunk, a canopy of pink clumps lit from the top. */
function cherry(w: number, h: number, side: number, r: ReturnType<typeof rng>): Canvas {
  const cv = canvas(w, h)
  const g = cv.g
  const base = Math.round(h * 0.82)
  const x = side < 0 ? Math.round(w * 0.06) : Math.round(w * 0.94)
  const ht = Math.round(h * 0.5)
  line(g, x, base, x - side * 6, base - ht * 0.5, '#3a2020', 5)
  line(g, x - side * 6, base - ht * 0.5, x - side * 2, base - ht, '#3a2020', 4)
  line(g, x - side * 5, base - ht * 0.6, x - side * 26, base - ht * 0.85, '#3a2020', 3)
  line(g, x - side * 4, base - ht * 0.75, x + side * 10, base - ht * 0.95, '#3a2020', 2)
  // The canopy spreads from the edge towards the middle, never across it.
  const reach = Math.min(40, w * 0.2)
  for (let i = 0; i < 26; i++) {
    const cx = x - side * r.range(-14, reach)
    const cy = base - ht * r.range(0.72, 1.05)
    const cr = r.range(7, Math.min(14, w * 0.09))
    ellipse(g, cx, cy + 2, cr, cr * 0.7, PINK[4])
    ellipse(g, cx, cy, cr - 1, cr * 0.65, PINK[3])
    ellipse(g, cx - 2, cy - 2, cr * 0.6, cr * 0.4, PINK[2])
    for (let k = 0; k < 4; k++) rect(g, cx + r.range(-cr, cr) * 0.6, cy - r.range(0, cr * 0.5), 1, 1, PINK[0])
  }
  return cv
}

/** Point i of N on the heart's outline, centred on its box (unit size: about ±0.85 tall, ±0.95 wide). */
function heartPt(i: number): [number, number] {
  const th = (i / N) * Math.PI * 2
  const x = 16 * Math.sin(th) ** 3
  const y = -(13 * Math.cos(th) - 5 * Math.cos(2 * th) - 2 * Math.cos(3 * th) - Math.cos(4 * th))
  return [x / 17, y / 17 - 0.16]
}

/** The heart filled, the same outline as the petals', cached by size (in steps of 2). */
const heartFill = (size: number) => {
  const S = Math.max(4, size - (size % 2))
  return cached(`enam-heart|${S}`, () => {
    const pts = Array.from(
      { length: 64 },
      (_, i) => heartPt((i / 64) * N).map((v) => v * S) as [number, number],
    )
    const d = Math.ceil(S * 2.1)
    return shade(d, d, (x, y) => {
      const px = x - d / 2
      const py = y - d / 2
      let inside = false
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i]!
        const [xj, yj] = pts[j]!
        if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
      }
      if (!inside) return null
      // Lit towards its top left, deep at its point.
      const k = (py / S + 0.2) * 1.4 - (px / S) * 0.3 + bayer(x, y) * 0.5
      return k < 0 ? PINK[1] : k < 0.6 ? PINK[2] : PINK[3]
    })
  })
}

export const enamorusCinema = raidCinema<X>({
  id: 'cinema-enamorus',
  reveal: REVEAL,
  seed: 905,
  aura: AURA,
  flash: '#fff0f8',
  feet: 0.6,
  rays: 0.6,
  bob: 2,
  shakes: [...BEATS.map((b, i) => [b, 0.18, 1 + i] as const), [T_BURST, 0.5, 3], [REVEAL, 0.4, 2]],
  flashes: [[T_BURST, 0.22, '#ffe0f0', 0.6]],
  setup(s) {
    const r = s.r
    const horizon = Math.round(s.h * 0.5)
    const cv = canvas(s.w, s.h)
    const g = cv.g
    g.drawImage(dGradient(s.w, horizon, ['#4a6aa8', '#7a8ac0', '#c8a0c8', '#f8c0c8', '#ffe0d0']), 0, 0)
    // Mt. Coronet, far and pale, its snow, the hills before it.
    const mx = Math.round(s.w * 0.62)
    const mh = Math.round(s.h * 0.26)
    tri(g, mx - mh * 1.6, horizon, mx + mh * 1.6, horizon, mx, horizon - mh, '#8a90b8')
    tri(g, mx, horizon, mx + mh * 1.6, horizon, mx, horizon - mh, '#7a80a8')
    tri(
      g,
      mx - mh * 0.3,
      horizon - mh * 0.75,
      mx + mh * 0.32,
      horizon - mh * 0.72,
      mx,
      horizon - mh,
      '#f0f0fa',
    )
    for (const [k, c] of [
      [0, '#6aa05a'],
      [1, '#5a9050'],
    ] as const)
      for (let x = 0; x < s.w; x++) {
        const y = Math.round(horizon - 4 + k * 8 - Math.sin(x / (30 + k * 20) + k * 2) * 6)
        rect(g, x, y, 1, s.h - y, c)
      }
    g.drawImage(
      dGradient(s.w, s.h - horizon - 10, ['#5a9a4a', '#4a8a3c', '#3a7030', '#2a5a24']),
      0,
      horizon + 10,
    )
    for (let i = 0; i < 40; i++)
      rect(g, r.range(0, s.w), r.range(horizon + 14, s.h), 1, 1, r() < 0.5 ? '#ffd0e8' : '#fff6a0')
    const hs = Math.round(Math.min(s.w * 0.34, s.h * 0.19))
    return {
      back: cv,
      trees: [cherry(s.w, s.h, -1, r), cherry(s.w, s.h, 1, r)],
      clouds: fogBand(s.w, Math.round(s.h * 0.3), 905, '#ffe8f0', '#f0c0d8', 0.55, 60),
      storm: fogBand(s.w, Math.round(s.h * 0.34), 906, '#9a3a7a', '#6a1a52', 0.75, 50),
      petals: Array.from({ length: N }, () => ({
        a: r() * Math.PI * 2,
        r: r.range(0.2, 1),
        h: r(),
        s: r.range(0.8, 1.4),
        c: r.int(0, 2),
      })),
      bolts: Array.from({ length: 3 }, (_, i) =>
        bolt(
          r,
          s.w * (0.2 + i * 0.3),
          s.h * 0.04,
          s.w * (0.25 + i * 0.28) + r.range(-10, 10),
          s.h * 0.22,
          0.4,
          4,
        ),
      ),
      horizon,
      hc: [s.cx, s.feet - Math.round(Math.max(30, s.sz.h * 0.55))],
      hs,
    }
  },
  step(s, t) {
    const r = s.r
    // Petals: drifting at first, then streaming on the wind, then everywhere after the burst.
    const wind = span(t, T_WIND, T_WIND + 0.6)
    const rate = t < T_STORM ? 0.4 + wind * 1.4 : t > T_BURST ? 0.8 : 0.2
    if (r() < rate * s.many)
      s.fx.add({
        x: wind > 0.3 && t < T_STORM ? -4 : r.range(0, s.w),
        y: wind > 0.3 && t < T_STORM ? r.range(0, s.h * 0.8) : -3,
        vx: lerp(r.range(4, 12), r.range(90, 150), t < T_STORM ? wind : 0.1),
        vy: r.range(10, 24),
        life: 4,
        size: 2,
        shape: 'leaf',
        spin: r.range(-6, 6),
        colors: [PINK[2]],
        light: PINK[0],
        dark: PINK[3],
      })
    if (t >= T_BURST && t - 1 / 60 < T_BURST)
      for (let i = 0; i < 70 * s.many; i++) {
        const a = r() * Math.PI * 2
        const v = r.range(60, 200)
        s.fx.add({
          x: s.hc[0],
          y: s.hc[1],
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          drag: 1.8,
          life: r.range(0.8, 1.6),
          size: 2,
          shape: r() < 0.25 ? 'heart' : 'leaf',
          spin: r.range(-8, 8),
          colors: [PINK[2], PINK[1]],
          light: PINK[0],
          dark: PINK[3],
        })
      }
    if (t > REVEAL && r() < 0.15 * s.many)
      s.fx.add({
        x: s.cx + r.range(-s.sz.w * 0.6, s.sz.w * 0.6),
        y: s.feet - r.range(0, s.sz.h),
        vy: -r.range(10, 20),
        life: 1.2,
        size: 1,
        shape: 'heart',
        colors: [PINK[1], PINK[2]],
      })
  },
  back(g, s, t) {
    g.drawImage(s.back, 0, 0)
    // Clouds: drifting, then racing on the wind; the storm's dark ones gathering over them.
    const wind = span(t, T_WIND, T_WIND + 0.6)
    const off = t * 6 + Math.max(0, t - T_WIND) ** 1.5 * 40
    scroll(g, s.clouds, off, -Math.round(s.h * 0.02))
    const st = span(t, T_STORM - 0.3, T_STORM + 0.4) * (1 - span(t, T_BURST, REVEAL + 0.6))
    if (st > 0) scroll(g, s.storm, -off * 0.8, -Math.round(s.h * 0.04), st)
    // Pink lightning inside the storm clouds.
    if (st > 0.5 && t < T_HEART + 0.4) {
      const f = Math.floor(t * 12)
      if (f % 4 === 0) {
        const b = s.bolts[f % s.bolts.length]!
        polyline(g, b, PINK[1], 2)
        polyline(g, b, '#ffffff')
      }
    }
    // The cherry trees, shaking in the wind.
    for (const [i, tr] of s.trees.entries()) {
      const shake = Math.round(Math.sin(t * (20 + i * 3)) * 2 * wind * (1 - span(t, T_BURST, REVEAL + 1)))
      g.drawImage(tr, shake, 0)
    }
    drawGrass(g, s, t, wind)
    // The cloud it rides, once it is here.
    if (t > T_RIDE)
      cloud(
        g,
        s.cx,
        s.feet + 2,
        Math.round(Math.max(20, s.sz.w * 0.45)) * ease.outBack(span(t, T_RIDE, T_RIDE + 0.3)),
        t,
      )
    drawPetalStorm(g, s, t)
  },
  before(g, s, t) {
    if (t < T_RIDE) return
    const q = ease.outC(span(t, T_RIDE, REVEAL - 0.05))
    drawSprite(g, s.mon, s.cx, Math.round(lerp(s.hc[1], s.feet, q)), {
      sil: '#5a0a3a',
      outline: Math.floor(t * 14) % 2 ? AURA[1] : AURA[2],
      sx: lerp(0.6, 1, q),
      sy: lerp(0.6, 1, q),
    })
  },
  sounds: [
    [0.05, () => hiss(1.6, { freq: 2400, type: 'highpass', vol: 0.02 })],
    [0.3, () => tone(784, 0.5, { type: 'triangle', vol: 0.02 })],
    [0.6, () => tone(988, 0.5, { type: 'triangle', vol: 0.02 })],
    [T_WIND, () => hiss(1.4, { freq: 600, slide: 1400, vol: 0.06 })],
    [
      T_STORM,
      () => (
        hiss(1.6, { freq: 900, slide: 600, vol: 0.07 }),
        tone(392, 1.2, { type: 'sine', vol: 0.03, slide: 196 })
      ),
    ],
    [T_STORM + 0.35, () => fxSound('thunder.strike')],
    [T_HEART, () => fxSound('psychic.focus')],
    ...BEATS.map(
      (b, i) =>
        [
          b,
          () => (fxSound('legend.heart'), tone(1047 + i * 131, 0.15, { type: 'triangle', vol: 0.03 })),
        ] as const,
    ),
    [T_BURST, () => (fxSound('evolve.burst'), hiss(0.6, { freq: 3000, slide: -2000, vol: 0.06 }))],
  ],
})

/** The grass: blades swaying, then bent flat by the wind. */
function drawGrass(g: G, s: Raid & X, t: number, wind: number) {
  const calm = span(t, T_BURST, REVEAL + 1)
  for (let i = 0; i < Math.round(s.w / 3); i++) {
    const x = i * 3 + ((i * 7) % 3)
    const y = s.h - 2 - ((i * 13) % Math.round(s.h * 0.12))
    const ht = 5 + ((i * 5) % 6)
    const bend =
      Math.sin(t * 3 + i * 0.7) * 1.5 + wind * (1 - calm) * (ht - 1) * (0.8 + 0.2 * Math.sin(t * 12 + i))
    line(g, x, y, x + bend, y - ht + Math.abs(bend) * 0.4, i % 3 ? '#3a7a30' : '#5aa04a')
  }
}

/** A puff of pink cloud: clumps, lit on top. */
function cloud(g: G, x: number, y: number, r: number, t: number) {
  if (r < 2) return
  for (let k = -2; k <= 2; k++) {
    const cx = x + k * r * 0.45
    const cr = r * (0.55 - Math.abs(k) * 0.08) + Math.sin(t * 3 + k) * 1
    ellipse(g, cx, y + 2, cr, cr * 0.5, PINK[3])
    ellipse(g, cx, y, cr - 1, cr * 0.45, PINK[1])
    ellipse(g, cx - 1, y - 1, cr * 0.5, cr * 0.25, PINK[0])
  }
}

/** The petals of the Springtide Storm: whirled into a funnel, drawn into a beating heart, burst apart. */
function drawPetalStorm(g: G, s: Raid & X, t: number) {
  if (t < T_STORM || t > T_BURST + 0.5) return
  const [hx, hy] = s.hc
  const torn = span(t, T_STORM, T_STORM + 0.5)
  const gather = ease.ioS(span(t, T_HEART, T_HEART + 0.4))
  const burst = span(t, T_BURST, T_BURST + 0.5)
  const beat = BEATS.reduce((k, b) => k + Math.max(0, 1 - Math.abs(t - b - 0.04) / 0.1) * 0.22, 0)
  const size = s.hs * (1 + beat) * (1 + ease.outC(burst) * 1.5)
  if (gather > 0 && burst < 1) {
    const gr = Math.round(s.hs * (0.9 + beat))
    g.drawImage(glow(gr, PINK[2], 1.3, 0.5 * gather * (1 - burst)), hx - gr, hy - gr)
    // The heart's own fill, glowing through it as it gathers, flaring on each beat.
    const fill = Math.min(1, gather * 0.45 + beat * 3) * (1 - burst)
    if (fill > 0.05) {
      const hcv = heartFill(Math.round(size))
      dissolve(g, hcv, fill, Math.round(hx - hcv.width / 2), Math.round(hy - hcv.height / 2))
    }
  }
  // The wind's own lines, whirling round the funnel.
  if (gather < 1)
    for (let k = 0; k < 6; k++) {
      const lift = (k / 6 + t * 0.5) % 1
      const rr = Math.round(s.hs * (0.3 + lift * 1.1) * torn * (1 - gather))
      const y = Math.round(s.feet - lift * (s.feet - s.h * 0.12))
      const a0 = t * 7 + k * 1.3
      if (rr > 3)
        ellipseLine(g, hx, y, rr, Math.max(1, Math.round(rr * 0.25)), k % 2 ? PINK[0] : PINK[1], a0, a0 + 1.6)
    }
  s.petals.forEach((p, i) => {
    // In the funnel: whirling round the middle, wider at the top, rising.
    const a = p.a + t * 5 * p.s
    const lift = (p.h + t * 0.4) % 1
    const fr = s.hs * (0.2 + lift * 1.2) * (0.5 + p.r * 0.5) * torn
    const fx = hx + Math.cos(a) * fr
    const fy = s.feet - lift * (s.feet - s.h * 0.12) + Math.sin(a) * fr * 0.25
    const [ux, uy] = heartPt(i)
    const tx = hx + ux * size
    const ty = hy + uy * size
    const x = lerp(fx, tx, gather)
    const y = lerp(fy, ty, gather)
    const k = burst > 0 ? 1 - burst : 1
    if (k <= 0) return
    const c = p.c === 0 ? PINK[1] : p.c === 1 ? PINK[2] : PINK[0]
    // A petal turning: wide, then edge on.
    const flat = Math.floor(t * 8 + i) % 3
    rect(g, x - 1, y, flat ? 3 : 1, 2, c)
    rect(g, x - 1, y + 1, flat ? 2 : 1, 1, PINK[3])
    if (flat) rect(g, x - 1, y, 1, 1, PINK[0])
    // A heart flashing among them now and then.
    if (i % 17 === 0 && gather < 0.5 && Math.floor(t * 6 + i) % 3 === 0) {
      const hcv = heartC(3, PINK[2], PINK[0])
      g.drawImage(hcv, Math.round(x - hcv.width / 2), Math.round(y - hcv.height / 2))
    }
  })
  burstRing(g, hx, hy, burst, Math.max(s.w, s.h) * 0.7, 3, PINK[1])
  for (const b of BEATS) burstRing(g, hx, hy, span(t, b, b + 0.35), s.hs * 2, 2, PINK[2])
}
