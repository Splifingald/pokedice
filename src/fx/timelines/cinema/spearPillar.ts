// Spear Pillar's raid entrances (docs/53): the ruins on Mt. Coronet's summit, above the clouds. A floor of worn tiles,
// broken columns round it, a dais in the middle; Dialga and Palkia share the place, each bending it its own way.
//
// Dialga (time): the night sky over the ruins, snow falling. A bell tolls and time starts racing: the stars wheel, the
// sun crosses the sky and sets, the columns' shadows sweep the floor, the clouds stream past. A great clock of blue
// light draws itself behind the dais, gears turning, its hands spinning. A column's capital breaks off and falls, and
// time stops, frame by frame: the picture stutters slower and slower, each frame a tick, the colour draining out of it,
// until everything hangs still and grey, the snow and the falling stone held in the air, the hands at twelve. In the
// silence Dialga takes shape on the dais, frozen like the rest; cracks run out across the still world from its heart,
// and the reveal shatters it: the colour floods back from Dialga outward and time goes on.
//
// Palkia (space): the ruins under a violet sky full of far galaxies. Space starts to bend: a pink grid shows through
// the world and sags into a well, the columns bow. The world folds in half like a page and springs open again. Then it
// tears: a jagged rift splits the picture top to bottom and the two halves slide apart over the void behind (a pink
// nebula, stars streaming), crescent slashes cutting through them. Palkia comes through the rift; the reveal slams the
// halves shut behind it.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  bolt,
  canvas,
  ease,
  ellipse,
  ellipseLine,
  glow,
  lerp,
  line,
  Particles,
  pattern,
  polyline,
  rect,
  rng,
  shade,
  softEllipse,
  span,
  wash,
  bayer,
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
  dissolve,
  drawShards,
  inOrder,
  makeShard,
  stepShards,
  tri,
  type Cinema,
  type CinemaParams,
  type Shard,
} from './kit'

// ---------------------------------------------------------------- the ruins they share
// (Exported: the race of time and space, timeRace.ts, stands in the same place.)

export interface Pal {
  /** Lit, middle, shade, ink. */
  stone: readonly [string, string, string, string]
  tiles: readonly [string, string, string]
  cloud: readonly [string, string]
  peaks: string
}

export interface Column {
  x: number
  base: number
  hgt: number
  hw: number
  /** Broken off: how jagged its top is (0: whole, with its capital). */
  broken: number
}

export interface Lay {
  w: number
  h: number
  cx: number
  m: number
  hz: number
  feet: number
  /** Its middle. */
  my: number
  many: number
  sz: { w: number; h: number }
  mon: string
  cols: Column[]
  front: Column[]
  dais: { y: number; rx: number; ry: number }
}

function layout(p: CinemaParams): Lay {
  const w = p.w ?? 240
  const h = p.h ?? 160
  const cx = Math.round(w / 2)
  const m = Math.min(w, h)
  const hz = Math.round(h * 0.5)
  const feet = Math.round(h * 0.62)
  const sz = spriteSize(p.mon)
  const hw = Math.max(3, Math.round(m * 0.028))
  const fw = Math.max(5, Math.round(m * 0.055))
  const fb = Math.round(hz + (h - hz) * 0.78)
  return {
    w,
    h,
    cx,
    m,
    hz,
    feet,
    my: Math.round(feet - sz.h * 0.5),
    many: p.short ? 0.4 : 1,
    sz,
    mon: p.mon,
    cols: [
      { x: cx - w * 0.38, base: hz + 3, hgt: h * 0.24, hw, broken: 0 },
      { x: cx - w * 0.19, base: hz + 2, hgt: h * 0.16, hw, broken: 5 },
      { x: cx + w * 0.19, base: hz + 2, hgt: h * 0.27, hw, broken: 0 },
      { x: cx + w * 0.38, base: hz + 3, hgt: h * 0.13, hw, broken: 4 },
    ].map((c) => ({ ...c, x: Math.round(c.x), hgt: Math.round(c.hgt) })),
    front: [
      { x: Math.round(cx - w * 0.45), base: fb, hgt: Math.round(h * 0.5), hw: fw, broken: 7 },
      { x: Math.round(cx + w * 0.45), base: fb, hgt: Math.round(h * 0.58), hw: fw, broken: 0 },
    ],
    dais: {
      y: feet + 3,
      rx: Math.round(Math.min(w * 0.34, 74)),
      ry: Math.round(Math.min(w * 0.34, 74) * 0.2),
    },
  }
}

const quiet = (f: () => void) => () => void (!skippingNow() && f())

/** A column: a fluted shaft lit from the left, its base, its capital or a broken top. */
export function column(g: G, c: Column, P: Pal, r: Rng) {
  const { x, base, hgt, hw, broken } = c
  const top = base - hgt
  rect(g, x - hw, top, hw * 2, hgt, P.stone[1])
  rect(g, x - hw, top, Math.max(1, Math.round(hw * 0.5)), hgt, P.stone[0])
  rect(g, x + hw - Math.max(1, Math.round(hw * 0.6)), top, Math.max(1, Math.round(hw * 0.6)), hgt, P.stone[2])
  for (let fx = x - hw + 2; fx < x + hw - 1; fx += 3) rect(g, fx, top + 3, 1, hgt - 6, P.stone[2])
  rect(g, x - hw - 2, base - 3, hw * 2 + 4, 3, P.stone[1])
  rect(g, x - hw - 2, base - 3, hw * 2 + 4, 1, P.stone[0])
  rect(g, x - hw - 2, base, hw * 2 + 4, 1, P.stone[3])
  if (!broken) {
    rect(g, x - hw - 2, top - 3, hw * 2 + 4, 3, P.stone[1])
    rect(g, x - hw - 2, top - 3, hw * 2 + 4, 1, P.stone[0])
    rect(g, x - hw - 1, top, hw * 2 + 2, 1, P.stone[3])
  } else {
    // Broken off: a jagged bite out of its top.
    const ph = r() * 6
    for (let fx = x - hw; fx < x + hw; fx++) {
      const d = Math.round(Math.abs(Math.sin(fx * 0.9 + ph)) * broken)
      g.clearRect(fx, top - 1, 1, d + 1)
      rect(g, fx, top + d, 1, 1, P.stone[0])
    }
  }
}

/** The ruins' floor: worn tiles in perspective, the ones in the middle lighter (the dais's light). */
export function floor(L: Pick<Lay, 'w' | 'h' | 'hz' | 'cx'>, P: Pal): Canvas {
  const { w, h, hz, cx } = L
  const H = h - hz
  return shade(w, H, (x, y) => {
    const d = (y + 1) / H
    const z = 1 / (d + 0.12)
    const wx = (((x - cx) * z) / (w * 0.5)) * 2.4 + 100.5
    const wz = z * 2.2
    const dwx = (z / (w * 0.5)) * 2.4
    const dwz = (2.2 / H / (d + 0.12) ** 2) * 1.2
    const fx = wx - Math.floor(wx)
    const fz = wz - Math.floor(wz)
    // Far off the joints would crowd into stripes: there the tiles just run together.
    const far = dwz > 0.22
    if (!far && fz < dwz) return P.tiles[2]
    if (fx < dwx && dwz < 0.5) return P.tiles[2]
    if (!far && fz < dwz * 2.5) return P.stone[0]
    const hsh = (Math.floor(wx) * 7 + Math.floor(wz) * 13) % 5
    const lit = 1 - Math.abs(x - cx) / (w * 0.6) - d * 0.3
    return hsh === 0 || bayer(x, y) < lit * 0.35 ? P.tiles[0] : P.tiles[1]
  })
}

/** The dais: a round stone step, a ring cut into it. */
export function dais(g: G, L: Pick<Lay, 'cx' | 'dais'>, P: Pal) {
  const { cx, dais: D } = L
  ellipse(g, cx, D.y + 2, D.rx + 2, D.ry + 1, P.stone[3])
  ellipse(g, cx, D.y, D.rx, D.ry, P.stone[1])
  ellipse(g, cx, D.y - 1, D.rx - 2, D.ry - 1, P.stone[0])
  ellipse(g, cx, D.y, D.rx - 3, D.ry - 1, P.stone[1])
  ellipseLine(g, cx, D.y, Math.round(D.rx * 0.7), Math.round(D.ry * 0.7), P.stone[2])
}

/** The sea of clouds at the horizon, Coronet's far peaks standing out of it; twice the screen wide (it drifts). */
export function cloudSea(L: Pick<Lay, 'w' | 'm'>, P: Pal, r: Rng): Canvas {
  const { w, m } = L
  const hh = Math.max(12, Math.round(m * 0.12))
  const cv = canvas(w * 2, hh + 20)
  const g = cv.g
  for (let i = 0; i < 3; i++) {
    const x = r.range(0, w)
    const ph = Math.round(r.range(10, 20))
    for (const o of [0, w]) {
      tri(g, x + o - ph, hh + 20, x + o + ph * 1.2, hh + 20, x + o, 20 + hh * 0.2 - ph * 0.6, P.peaks)
      tri(
        g,
        x + o - ph * 0.25,
        20 + hh * 0.2 - ph * 0.6 + 4,
        x + o + ph * 0.25,
        20 + hh * 0.2 - ph * 0.6 + 4,
        x + o,
        20 + hh * 0.2 - ph * 0.6,
        '#dfe6f0',
      )
    }
  }
  for (let i = 0; i < Math.round(w / 6); i++) {
    const x = r.range(0, w)
    const y = 20 + hh * r.range(0.35, 0.9)
    const rx = Math.round(r.range(8, 20))
    for (const o of [-w, 0, w, 2 * w]) {
      ellipse(g, x + o, y + 1, rx, Math.round(rx * 0.3), P.cloud[0])
      ellipse(g, x + o - 1, y - 1, Math.round(rx * 0.7), Math.round(rx * 0.22), P.cloud[1])
    }
  }
  rect(g, 0, hh + 14, w * 2, 6, P.cloud[0])
  return cv
}

/** Snow (or motes) that a scene's own clock moves: freeze the clock and they hang in the air. */
function flakes(n: number, seed: number) {
  const r = rng(seed)
  return Array.from({ length: n }, () => ({
    x: r(),
    y: r(),
    vx: r.range(-0.04, -0.01),
    vy: r.range(0.08, 0.16),
    big: r() < 0.2,
  }))
}

// ---------------------------------------------------------------- Dialga

const D_FAST = 0.55
const D_CLOCK = 1.05
const D_BREAK = 2.25
const D_SLOW = 2.55
/** The stutter: each a frame, further and further apart, then the stop. */
const D_TICKS = [2.55, 2.67, 2.8, 2.95, 3.11, 3.28, 3.46, 3.65] as const
/** The scene's own clock at each: less and less of it per frame. */
const D_TICKS_S = [2.55, 2.64, 2.72, 2.79, 2.84, 2.88, 2.9, 2.91] as const
const D_STOP = D_TICKS[D_TICKS.length - 1]!
const D_FORM = 3.85
const D_CRACK = 4.3
const D_REVEAL = 4.9
export const D_AURA = ['#ffffff', '#c8e0ff', '#5a8ae0', '#1f3a7a'] as const
export const CLOCK = ['#ffffff', '#c8e0ff', '#8ab0e8', '#4a7ac8', '#24448a'] as const
export const D_PAL: Pal = {
  stone: ['#8a96b0', '#5a647e', '#3a4258', '#1a1e2c'],
  tiles: ['#4a5470', '#3e4862', '#262c3e'],
  cloud: ['#3a4668', '#6a7aa0'],
  peaks: '#262e48',
}
/** The day going round: night, dawn, day, dusk. */
const SKIES = [
  ['#04071a', '#0a1230', '#162348', '#283a66'],
  ['#1e1a4a', '#5a3a72', '#c86a7a', '#ffb880'],
  ['#2a58a0', '#3e74bc', '#5e96d4', '#9cc4e8'],
  ['#14163c', '#4a2a5c', '#b44e48', '#f0a058'],
] as const

/** The scene's own clock: real time until the stutter, then held frame by frame, stopped, and going on after. */
function dialgaClock(t: number) {
  if (t < D_SLOW) return t
  if (t >= D_REVEAL) return D_TICKS_S[D_TICKS_S.length - 1]! + (t - D_REVEAL)
  let k = 0
  for (let i = 0; i < D_TICKS.length; i++) if (t >= D_TICKS[i]!) k = i
  return D_TICKS_S[k]!
}
/** Where the day has got to (0 night, 1 dawn, 2 day, 3 dusk, 4 night again), by the scene's clock. */
const dayAt = (T: number) => 4 * ease.ioS(span(T, D_FAST, D_TICKS_S[D_TICKS_S.length - 1]!))

type DS = {
  r: Rng
  fx: Particles
  shards: Shard[]
  skies: Canvas[]
  sea: Canvas
  fl: Canvas
  ruins: Canvas
  front: Canvas
  buf: Canvas
  cold: Canvas
  rays: Canvas
  snow: ReturnType<typeof flakes>
  stars: { a: number; d: number }[]
  cracks: [number, number][][]
  shakes: [number, number, number][]
}

export const dialgaCinema: Cinema = {
  reveal: D_REVEAL,
  dur: D_REVEAL + AFTER_REVEAL,
  make(p: CinemaParams): Timeline<DS> {
    const L = layout(p)
    const { w, h, cx, hz, feet, my, m, many, sz } = L
    const CR = Math.round(Math.min(w * 0.46, h * 0.3))
    const pole = { x: cx, y: -Math.round(h * 0.15) }
    /** The stone that breaks off the right front column. */
    const cap = L.front[1]!
    const stoneAt = (T: number) => {
      const e = Math.max(0, T - D_BREAK)
      return {
        x: cap.x - e * 18,
        y: cap.base - cap.hgt - 2 + 160 * e * e,
        a: e * 3,
      }
    }
    return {
      id: 'cinema-dialga',
      dur: D_REVEAL + AFTER_REVEAL,
      setup() {
        const r = rng(483)
        const ruins = canvas(w, h)
        const rg = ruins.g
        rg.drawImage(floor(L, D_PAL), 0, hz)
        rect(rg, 0, hz, w, 1, D_PAL.stone[0])
        for (const c of L.cols) column(rg, c, D_PAL, r)
        dais(rg, L, D_PAL)
        const front = canvas(w, h)
        for (const c of L.front) column(front.g, c.broken ? c : { ...c, broken: 0 }, D_PAL, r)
        // Its capital has broken off (it is the stone that falls): the column ends in a clean break.
        front.g.clearRect(cap.x - cap.hw - 2, cap.base - cap.hgt - 4, cap.hw * 2 + 4, 4)
        rect(front.g, cap.x - cap.hw, cap.base - cap.hgt, cap.hw * 2, 1, D_PAL.stone[0])
        // The cracks that will run out from its heart across the frozen world.
        const cracks: [number, number][][] = []
        for (let k = 0; k < 9; k++) {
          const a = (k / 9) * Math.PI * 2 + r.range(-0.2, 0.2)
          const R = Math.hypot(w, h) * 0.7
          cracks.push(bolt(r, cx, my, cx + Math.cos(a) * R, my + Math.sin(a) * R, 0.18, 5))
        }
        return {
          r,
          fx: new Particles(),
          shards: [],
          skies: SKIES.map((s) => dGradient(w, hz, s)),
          sea: cloudSea(L, D_PAL, r),
          fl: canvas(w, h),
          ruins,
          front,
          buf: canvas(w, h),
          cold: canvas(w, h),
          rays: canvas(w, h),
          snow: flakes(Math.round((w * h) / 260), 4831),
          stars: Array.from({ length: 46 }, () => ({
            a: r() * Math.PI * 2,
            d: r.range(h * 0.2, Math.hypot(w, h)),
          })),
          cracks,
          shakes: p.short ? [] : [[D_REVEAL, 0.7, 4]],
        }
      },
      step(s, t, dt) {
        const r = s.r
        s.fx.update(dt)
        stepShards(s.shards, dt, { g: 120, drag: 0.6 })
        // The reveal shatters the frozen world: its pieces blown out from it.
        if (within(t, D_REVEAL, D_REVEAL + dt)) {
          for (let i = 0; i < 90 * many; i++) {
            const a = r() * Math.PI * 2
            const d = r.range(8, Math.max(w, h) * 0.6)
            const sh = makeShard(
              r,
              cx + Math.cos(a) * d,
              my + Math.sin(a) * d * 0.8,
              220,
              '#a8c0e0',
              '#ffffff',
              0.2,
            )
            sh.vx = Math.cos(a) * r.range(80, 260)
            sh.vy = Math.sin(a) * r.range(80, 260)
            sh.r = r.range(2, 6)
            s.shards.push(sh)
          }
          for (let k = 0; k < 50 * many; k++) {
            const a = r() * Math.PI * 2
            const v = r.range(60, 180)
            s.fx.add({
              x: cx,
              y: my,
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v * 0.7,
              drag: 2.5,
              life: r.range(0.6, 1.1),
              size: r.int(1, 2),
              shape: 'star',
              colors: [...D_AURA],
            })
          }
        }
        // The stone lands once time goes on.
        const st = stoneAt(dialgaClock(t))
        if (
          st.y > cap.base - 4 &&
          !s.fx.list.some((q) => q.shape === 'smoke') &&
          t > D_REVEAL &&
          t < D_REVEAL + 1
        )
          for (let i = 0; i < 14 * many; i++)
            s.fx.add({
              x: st.x + r.range(-6, 6),
              y: cap.base - 2,
              vx: r.range(-30, 30),
              vy: -r.range(5, 25),
              drag: 2,
              life: 0.8,
              size: r.int(2, 4),
              shape: 'smoke',
              colors: ['#8a96b0', '#5a647e'],
            })
      },
      draw(g, s, t) {
        const sh = screenShake(t, s.shakes)
        const T = dialgaClock(t)
        const day = dayAt(T)
        const b = s.buf.g
        // The sky round the day: each stretch dissolving into the next.
        const i0 = Math.floor(day) % 4
        b.drawImage(s.skies[i0]!, 0, 0)
        dissolve(b, s.skies[(i0 + 1) % 4]!, ease.ioS(day - Math.floor(day)))
        const night = Math.max(0, Math.cos((day * Math.PI) / 2)) ** 0.5
        // Stars wheeling round the pole, their trails longer the faster time runs.
        const turn = day * Math.PI * 0.6
        const trail = Math.min(0.5, Math.abs(dayAt(T + 0.05) - day) * 3)
        if (night > 0.2)
          for (const st of s.stars)
            for (let k = 0; k <= 4; k++) {
              const a = st.a + turn - (trail * k) / 4
              const x = Math.round(pole.x + Math.cos(a) * st.d)
              const y = Math.round(pole.y + Math.sin(a) * st.d)
              if (y < hz - 4 && y >= 0) rect(b, x, y, 1, 1, k ? '#5a6a9a' : '#ffffff')
            }
        // The sun across the sky by day, the moon by night.
        const arc = (q: number, R: number, col: readonly [string, string]) => {
          const a = Math.PI * q
          const x = Math.round(cx - Math.cos(a) * w * 0.44)
          const y = Math.round(hz - Math.sin(a) * h * 0.36)
          b.drawImage(glow(R * 3, col[0], 1.4, 0.5), x - R * 3, y - R * 3)
          ellipse(b, x, y, R, R, col[1])
        }
        const sq = (day - 0.7) / 2.6
        if (sq > 0 && sq < 1) arc(sq, Math.round(m * 0.06), ['#ffd080', '#fff3c8'])
        const mq = day < 1 ? 0.62 + day * 0.4 : (day - 3.3) / 1.4
        if (mq > 0 && mq < 1) arc(mq, Math.round(m * 0.04), ['#c8d8ff', '#f0f4ff'])
        // The clouds streaming past while time races.
        const off = Math.round(((T * 20 + day * w * 0.8) % w) + w) % w
        b.drawImage(s.sea, -off, hz - s.sea.height + 2)
        b.drawImage(s.ruins, 0, 0)
        // The columns' shadows swinging round as the sun (then the moon) crosses.
        const sunX =
          sq > 0 && sq < 1 ? -Math.cos(Math.PI * sq) : mq > 0 && mq < 1 ? -Math.cos(Math.PI * mq) : 0
        const shd = pattern(b, '#0a0e1a', sq > 0 && sq < 1 ? 9 : 5)
        for (const c of [...L.cols, ...L.front]) {
          const len = c.hgt * (0.4 + 0.6 * (1 - Math.abs(sunX))) * 0.7
          const dx = -sunX * len * 1.6
          const dy = len * 0.18
          const th = c.hw * 0.9
          tri(b, c.x - c.hw, c.base, c.x + c.hw, c.base, c.x + c.hw + dx, c.base + dy + th, shd)
          tri(b, c.x - c.hw, c.base, c.x - c.hw + dx, c.base + dy, c.x + c.hw + dx, c.base + dy + th, shd)
        }
        // The clock of light, its gears turning, its hands racing round with the day; stopped at twelve.
        const cq = span(t, D_CLOCK, D_CLOCK + 0.8) * (t < D_REVEAL ? 1 : 0)
        if (cq > 0) clock(b, cx, my - 4, CR, cq, day, t < D_STOP)
        // Dialga taking shape on the dais in the stillness, frozen like the rest.
        if (t > D_FORM && t < D_REVEAL) {
          const q = ease.outQ(span(t, D_FORM, D_FORM + 0.45))
          const top = Math.round(feet - (sz.h + 2) * q)
          b.save()
          b.beginPath()
          b.rect(0, top, w, h - top)
          b.clip()
          drawSprite(b, L.mon, cx, feet, {
            sil: '#b8cce8',
            outline: Math.floor(t * 10) % 2 ? '#ffffff' : CLOCK[2],
          })
          b.restore()
          if (q < 1) rect(b, cx - sz.w * 0.55, top, sz.w * 1.1, 1, '#ffffff')
          for (const at of [D_CRACK, D_CRACK + 0.28]) {
            const k = 1 - span(t, at, at + 0.25)
            if (k < 1 && k > 0) {
              const gr = Math.round(m * 0.12)
              b.drawImage(glow(gr, '#ffffff', 1.6, k), cx - gr, my - gr)
            }
          }
        }
        if (t >= D_REVEAL) {
          const k =
            span(t, D_REVEAL, D_REVEAL + 0.4) * lerp(0.55, 0.22, span(t, D_REVEAL + 0.4, D_REVEAL + 1.4))
          drawRays(s.rays, { x: cx, y: my }, t, D_AURA[2], k)
          b.drawImage(s.rays, 0, 0)
          const bob = Math.round(Math.sin((t - D_REVEAL) * 2) * 1)
          drawSprite(b, L.mon, cx, feet + bob, {
            flash: Math.max(0, 1 - span(t, D_REVEAL + 0.05, D_REVEAL + 0.45)),
            outline: Math.floor(t * 8) % 2 ? D_AURA[1] : D_AURA[2],
          })
        }
        b.drawImage(s.front, 0, 0)
        // The falling stone (held in the air while time is stopped) and the snow.
        const st = stoneAt(T)
        if (T > D_BREAK - 0.05 && st.y < cap.base - 3) {
          // The capital: a wide block, a lit top, an inked edge, tumbling.
          const hw = cap.hw + 3
          const hh = Math.max(3, Math.round(cap.hw * 0.6))
          const c = Math.cos(st.a)
          const sn = Math.sin(st.a)
          const pt = (u: number, v: number) => [st.x + u * c - v * sn, st.y + u * sn + v * c] as const
          const quad = (u0: number, v0: number, u1: number, v1: number, col: string) => {
            const A = pt(u0, v0)
            const B = pt(u1, v0)
            const C = pt(u1, v1)
            const D = pt(u0, v1)
            tri(b, A[0], A[1], B[0], B[1], C[0], C[1], col)
            tri(b, A[0], A[1], C[0], C[1], D[0], D[1], col)
          }
          quad(-hw - 1, -hh - 1, hw + 1, hh + 1, D_PAL.stone[3])
          quad(-hw, -hh, hw, hh, D_PAL.stone[1])
          quad(-hw, -hh, hw, -hh + 1, D_PAL.stone[0])
          quad(-hw + 2, hh - 1, hw - 2, hh, D_PAL.stone[2])
        }
        for (const f of s.snow) {
          const x = ((((f.x + f.vx * T) % 1) + 1) % 1) * (w + 20) - 10
          const y = ((((f.y + f.vy * T) % 1) + 1) % 1) * (h + 10) - 5
          rect(b, Math.round(x), Math.round(y), f.big ? 2 : 1, f.big ? 2 : 1, f.big ? '#ffffff' : '#c8d4ec')
        }
        // Night's dark over the ground, lighter by day.
        const dark = 0.35 * night
        if (dark > 0) {
          b.globalAlpha = Math.round(dark * 8) / 8
          b.fillStyle = '#04071a'
          b.fillRect(0, hz, w, h - hz)
          b.globalAlpha = 1
        }
        // The colour draining out frame by frame, through a dither; the frozen picture is blue-grey.
        const drain = span(T, D_TICKS_S[2]!, D_TICKS_S[D_TICKS_S.length - 1]!)
        const c = s.cold.g
        c.drawImage(s.buf, 0, 0)
        c.globalCompositeOperation = 'color'
        c.fillStyle = '#7890b0'
        c.fillRect(0, 0, w, h)
        c.globalCompositeOperation = 'source-over'
        g.fillStyle = '#04071a'
        g.fillRect(0, 0, w, h)
        g.save()
        g.translate(sh.x, sh.y)
        if (t < D_REVEAL) {
          g.drawImage(s.buf, 0, 0)
          dissolve(g, s.cold, drain)
          // The cracks running out from it over the still world.
          const kq = span(t, D_CRACK, D_REVEAL)
          if (kq > 0)
            for (const pts of s.cracks) {
              const n = Math.max(2, Math.round(pts.length * ease.outQ(kq)))
              polyline(g, pts.slice(0, n), '#ffffff')
              polyline(
                g,
                pts.slice(0, n).map(([x, y]) => [x + 1, y + 1] as [number, number]),
                CLOCK[3],
              )
            }
        } else {
          // The colour flooding back from it.
          const q = span(t, D_REVEAL, D_REVEAL + 0.7)
          const R = lerp(4, Math.hypot(w, h) * 0.9, 1 - (1 - q) ** 3)
          g.drawImage(q < 1 ? s.cold : s.buf, 0, 0)
          if (q < 1) circle(g, s.buf, cx, my, R)
          burstRing(g, cx, my, q, Math.hypot(w, h) * 0.9, 3, D_AURA[1])
          for (const [d, col] of [
            [0.08, D_AURA[0]],
            [0.2, D_AURA[2]],
          ] as const)
            burstRing(g, cx, my, span(t, D_REVEAL + d, D_REVEAL + d + 0.6), Math.max(w, h) * 0.75, 3, col)
        }
        drawShards(g, s.shards, CLOCK[4])
        s.fx.draw(g)
        g.restore()
        if (within(t, D_REVEAL, D_REVEAL + 0.35))
          screenFlash(g, '#ffffff', 0.9 * (1 - span(t, D_REVEAL, D_REVEAL + 0.35)))
        if (t < 0.5) wash(g, '#000000', 1 - span(t, 0, 0.5), 8)
      },
      cues: () =>
        inOrder([
          [0.05, quiet(() => hiss(1.4, { freq: 900, type: 'lowpass', vol: 0.03 }))],
          [
            D_FAST,
            quiet(
              () => (
                tone(98, 2.2, { type: 'sine', vol: 0.08 }),
                tone(196, 1.6, { type: 'triangle', vol: 0.03 })
              ),
            ),
          ],
          // The clock ticking faster and faster while time races.
          ...[0.75, 0.98, 1.18, 1.35, 1.5, 1.63, 1.75, 1.86, 1.96, 2.05, 2.14, 2.23, 2.32, 2.41, 2.49].map(
            (at, i) =>
              [at, quiet(() => tone(i % 2 ? 1500 : 2000, 0.03, { type: 'square', vol: 0.02 }))] as const,
          ),
          [
            D_CLOCK,
            quiet(() =>
              [262, 330, 392].forEach((f, i) => tone(f, 1.6, { type: 'sine', vol: 0.03, at: i * 0.06 })),
            ),
          ],
          [
            D_BREAK,
            quiet(() => (hiss(0.3, { freq: 600, vol: 0.08 }), tone(120, 0.2, { type: 'square', vol: 0.04 }))),
          ],
          // Each frozen frame a tick, lower and further apart.
          ...D_TICKS.map(
            (at, i) =>
              [
                at,
                quiet(() => tone(1200 - i * 110, 0.08 + i * 0.02, { type: 'square', vol: 0.03 })),
              ] as const,
          ),
          [D_STOP + 0.02, quiet(() => tone(131, 2.2, { type: 'sine', vol: 0.06 }))],
          [D_FORM, quiet(() => tone(2637, 0.9, { type: 'sine', vol: 0.015 }))],
          [D_CRACK, quiet(() => fxSound('legend.heart'))],
          [D_CRACK + 0.28, quiet(() => (fxSound('legend.heart'), hiss(0.5, { freq: 5000, vol: 0.03 })))],
          [
            D_REVEAL,
            (hud) => (quiet(() => (fxSound('legend.roar'), fxSound('legend.shatter')))(), hud.beat?.('roar')),
          ],
        ] satisfies Cue<DS>[]),
    }
  },
}

/** A picture shown only inside a circle, row by row. */
function circle(g: G, src: Canvas, x: number, y: number, R: number) {
  const y0 = Math.max(0, Math.floor(y - R))
  const y1 = Math.min(src.height, Math.ceil(y + R))
  for (let yy = y0; yy < y1; yy++) {
    const dy = yy + 0.5 - y
    const half = Math.sqrt(Math.max(0, R * R - dy * dy))
    const x0 = Math.max(0, Math.round(x - half))
    const x1 = Math.min(src.width, Math.round(x + half))
    if (x1 > x0) g.drawImage(src, x0, yy, x1 - x0, 1, x0, yy, x1 - x0, 1)
  }
}

/** A cog of light: a rim, a hub, teeth, turning. */
export function cog(g: G, x: number, y: number, R: number, a: number, col: string) {
  ellipseLine(g, x, y, R, R, col)
  ellipseLine(g, x, y, Math.max(2, Math.round(R * 0.45)), Math.max(2, Math.round(R * 0.45)), col)
  const n = Math.max(6, Math.round(R * 0.8))
  for (let k = 0; k < n; k++) {
    const q = a + (k / n) * Math.PI * 2
    rect(g, Math.round(x + Math.cos(q) * (R + 1)) - 1, Math.round(y + Math.sin(q) * (R + 1)) - 1, 2, 2, col)
  }
  for (let k = 0; k < 3; k++) {
    const q = a + (k / 3) * Math.PI * 2
    line(
      g,
      x + Math.cos(q) * R * 0.45,
      y + Math.sin(q) * R * 0.45,
      x + Math.cos(q) * R,
      y + Math.sin(q) * R,
      col,
    )
  }
}

/** The clock of light: gears behind, two rims, the hours, the hands from where the day is. */
function clock(g: G, x: number, y: number, R: number, q: number, day: number, live: boolean) {
  const gr = (R + 10) & ~3
  g.drawImage(glow(gr, CLOCK[3], 2, 0.3), x - gr, y - gr)
  const spin = day * Math.PI * 1.5
  if (q > 0.3)
    for (const [a, k, dir] of [
      [-2.4, 0.3, 1],
      [-0.7, 0.24, -1],
      [0.9, 0.2, 1],
    ] as const)
      cog(
        g,
        Math.round(x + Math.cos(a) * R * 0.92),
        Math.round(y + Math.sin(a) * R * 0.92),
        Math.round(R * k),
        ((spin * dir) / k) * 0.2,
        CLOCK[3],
      )
  const top = -Math.PI / 2
  const a1 = span(q, 0, 0.45) * Math.PI * 2
  ellipseLine(g, x, y, R, R, CLOCK[1], top, top + a1)
  ellipseLine(g, x, y, R - 2, R - 2, CLOCK[3], top, top + a1)
  ellipseLine(g, x, y, Math.round(R * 0.82), Math.round(R * 0.82), CLOCK[2], top - a1, top)
  const hq = span(q, 0.3, 0.8)
  for (let k = 0; k < 60; k++) {
    if (k / 60 > hq) break
    const a = top + (k / 60) * Math.PI * 2
    const big = k % 5 === 0
    const r0 = R * (big ? 0.84 : 0.9)
    const r1 = R * 0.95
    if (big)
      line(
        g,
        x + Math.cos(a) * r0,
        y + Math.sin(a) * r0,
        x + Math.cos(a) * r1,
        y + Math.sin(a) * r1,
        k % 15 ? CLOCK[1] : CLOCK[0],
        k % 15 ? 1 : 2,
      )
    else rect(g, Math.round(x + Math.cos(a) * r1), Math.round(y + Math.sin(a) * r1), 1, 1, CLOCK[2])
  }
  if (q > 0.6) {
    const ma = top + day * Math.PI * 2 * 3
    const ha = top + day * Math.PI
    line(g, x, y, x + Math.cos(ha) * R * 0.5, y + Math.sin(ha) * R * 0.5, CLOCK[1], 3)
    line(g, x, y, x + Math.cos(ma) * R * 0.76, y + Math.sin(ma) * R * 0.76, live ? CLOCK[0] : CLOCK[1], 2)
    rect(g, x - 2, y - 2, 5, 5, CLOCK[0])
  }
}

// ---------------------------------------------------------------- Palkia

const P_BEND = 1.0
const P_FOLD = 2.2
const P_OPEN = 2.75
const P_TEAR = 3.3
const P_SPLIT = 3.45
/** Spacial Rend: crescents cutting through the torn halves. */
const P_RENDS = [3.72, 4.02, 4.3] as const
const P_COME = 3.85
const P_REVEAL = 4.8
export const P_AURA = ['#ffffff', '#ffd0f0', '#d06ab0', '#6a1f5a'] as const
export const PINK = ['#ffffff', '#ffd0f0', '#ff8ad0', '#d04aa8', '#7a1a6a'] as const
export const P_PAL: Pal = {
  stone: ['#b09ac0', '#706088', '#463a5e', '#1e1830'],
  tiles: ['#524466', '#463a5a', '#2c2440'],
  cloud: ['#4a3a6a', '#7e6aa4'],
  peaks: '#2e2448',
}

type PS = {
  r: Rng
  fx: Particles
  sky: Canvas
  sea: Canvas
  ruins: Canvas
  front: Canvas
  space: Canvas
  buf: Canvas
  tmp: Canvas
  warp: Canvas
  rays: Canvas
  /** The rift's line down the screen, a column per row. */
  rift: number[]
  shakes: [number, number, number][]
}

export const palkiaCinema: Cinema = {
  reveal: P_REVEAL,
  dur: P_REVEAL + AFTER_REVEAL,
  make(p: CinemaParams): Timeline<PS> {
    const L = layout(p)
    const { w, h, cx, hz, feet, my, m, many, sz } = L
    const gap = Math.round(Math.max(w * 0.22, sz.w * 0.45))
    /** How hard space is bent: growing, released by the fold, springing back harder, then torn. */
    const bend = (t: number) =>
      t < P_FOLD
        ? ease.ioS(span(t, P_BEND, P_FOLD))
        : t < P_OPEN
          ? 1 - span(t, P_FOLD, P_FOLD + 0.2)
          : t < P_REVEAL
            ? span(t, P_OPEN, P_OPEN + 0.3) *
              (1.2 + Math.sin((t - P_OPEN) * 14) * 0.3 * (1 - span(t, P_OPEN, P_TEAR)))
            : 0
    /** The fold: 0 flat, 1 the right half laid over the left; it springs back open past flat and settles. */
    const fold = (t: number) => {
      if (t < P_FOLD || t > P_OPEN + 0.5) return 0
      if (t < P_FOLD + 0.4) return ease.ioS(span(t, P_FOLD, P_FOLD + 0.4))
      if (t < P_OPEN) return 1
      const e = t - P_OPEN
      return Math.max(0, 1 - ease.outC(span(e, 0, 0.3))) - Math.sin(e * 18) * 0.12 * (1 - span(e, 0, 0.5))
    }
    const split = (t: number) =>
      t < P_SPLIT
        ? 0
        : t < P_REVEAL - 0.15
          ? ease.outC(span(t, P_SPLIT, P_SPLIT + 0.6))
          : 1 - ease.inQ(span(t, P_REVEAL - 0.15, P_REVEAL))
    return {
      id: 'cinema-palkia',
      dur: P_REVEAL + AFTER_REVEAL,
      setup() {
        const r = rng(484)
        const sky = dGradient(w, hz, ['#08041a', '#1a0a34', '#3a1650', '#6a2a6a'])
        // Far galaxies: tilted swirls of pink and blue, stars between.
        for (let i = 0; i < Math.max(3, Math.round(w / 70)); i++) {
          const x = r.range(10, w - 10)
          const y = r.range(6, hz * 0.6)
          const rx = Math.round(r.range(5, 11))
          const c = r() < 0.5 ? '#ff8ad0' : '#8ab0ff'
          softEllipse(sky.g, x, y, rx, Math.max(2, Math.round(rx * 0.35)), c, 0.6, 1.5)
          rect(sky.g, x - 1, y, 3, 1, '#ffffff')
        }
        for (let i = 0; i < 70; i++)
          rect(sky.g, r.range(0, w), r.range(0, hz - 6), 1, 1, r() < 0.25 ? '#ffffff' : '#a88ad0')
        const ruins = canvas(w, h)
        const rg = ruins.g
        rg.drawImage(floor(L, P_PAL), 0, hz)
        rect(rg, 0, hz, w, 1, P_PAL.stone[0])
        for (const c of L.cols) column(rg, c, P_PAL, r)
        dais(rg, L, P_PAL)
        const front = canvas(w, h)
        for (const c of L.front) column(front.g, c, P_PAL, r)
        // The void behind space: a nebula round a white heart, stars thick.
        const space = dGradient(w, h, ['#0a0418', '#1c0830', '#14062a', '#06020e'])
        const sg = space.g
        for (let i = 0; i < 9; i++)
          softEllipse(
            sg,
            cx + r.range(-w * 0.4, w * 0.4),
            my + r.range(-h * 0.35, h * 0.35),
            Math.round(r.range(14, 40)),
            Math.round(r.range(8, 24)),
            r() < 0.5 ? '#7a1a6a' : '#3a1a7a',
            0.7,
            1.4,
          )
        softEllipse(sg, cx, my, Math.round(m * 0.35), Math.round(m * 0.3), '#d04aa8', 0.55, 1.6)
        softEllipse(sg, cx, my, Math.round(m * 0.16), Math.round(m * 0.14), '#ffd0f0', 0.7, 1.6)
        for (let i = 0; i < (w * h) / 90; i++)
          rect(
            sg,
            r.range(0, w),
            r.range(0, h),
            1,
            1,
            r() < 0.3 ? '#ffffff' : r() < 0.5 ? '#ff8ad0' : '#8a7ad0',
          )
        // The rift: jagged, top to bottom through the middle.
        const pts = bolt(r, cx, -4, cx, h + 4, 0.22, 6)
        const rift: number[] = []
        for (let y = 0; y < h; y++) {
          let x = cx
          for (let i = 1; i < pts.length; i++) {
            const [x0, y0] = pts[i - 1]!
            const [x1, y1] = pts[i]!
            if ((y >= y0 && y <= y1) || (y >= y1 && y <= y0)) {
              x = y1 === y0 ? x0 : lerp(x0, x1, (y - y0) / (y1 - y0))
              break
            }
          }
          rift.push(Math.round(Math.max(4, Math.min(w - 4, x))))
        }
        return {
          r,
          fx: new Particles(),
          sky,
          sea: cloudSea(L, P_PAL, r),
          ruins,
          front,
          space,
          buf: canvas(w, h),
          tmp: canvas(w, h),
          warp: canvas(w, h),
          rays: canvas(w, h),
          rift,
          shakes: p.short
            ? []
            : [
                [P_TEAR, 0.4, 3],
                ...P_RENDS.map((at) => [at, 0.25, 2] as [number, number, number]),
                [P_REVEAL, 0.7, 5],
              ],
        }
      },
      step(s, t, dt) {
        const r = s.r
        s.fx.update(dt)
        // Stars streaming out of the void while the rift is open.
        if (split(t) > 0.2 && t < P_REVEAL)
          for (let i = 0; i < 3 * many; i++) {
            const a = r() * Math.PI * 2
            const v = r.range(40, 140)
            s.fx.add({
              x: cx + Math.cos(a) * m * 0.2,
              y: my + Math.sin(a) * m * 0.2,
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v,
              ax: Math.cos(a) * 200,
              ay: Math.sin(a) * 200,
              life: 0.9,
              size: 1,
              shape: 'streak',
              trail: 0.05,
              colors: ['#ffffff', '#ffd0f0', '#ff8ad0'],
            })
          }
        // The tear's first crack spits sparks along it.
        if (within(t, P_TEAR, P_TEAR + dt))
          for (let i = 0; i < 60 * many; i++) {
            const y = r.range(0, h)
            s.fx.add({
              x: s.rift[Math.floor(y)]!,
              y,
              vx: r.range(-90, 90),
              vy: r.range(-30, 30),
              drag: 3,
              life: r.range(0.3, 0.7),
              size: 1,
              shape: 'px',
              colors: [...PINK],
            })
          }
        if (within(t, P_REVEAL, P_REVEAL + dt))
          for (let k = 0; k < 60 * many; k++) {
            const a = r() * Math.PI * 2
            const v = r.range(60, 200)
            s.fx.add({
              x: cx,
              y: my,
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v * 0.7,
              drag: 2.5,
              life: r.range(0.6, 1.1),
              size: r.int(1, 2),
              shape: 'star',
              colors: [...P_AURA],
            })
          }
      },
      draw(g, s, t) {
        const sh = screenShake(t, s.shakes)
        const k = bend(t)
        // The world, flat, into its buffer; a pink grid of space showing through it as it bends.
        const b = s.buf.g
        b.drawImage(s.sky, 0, 0)
        const off = Math.round((t * 6) % w)
        b.drawImage(s.sea, -off, hz - s.sea.height + 2)
        b.drawImage(s.ruins, 0, 0)
        b.drawImage(s.front, 0, 0)
        const gk = Math.min(1, k) * (t < P_REVEAL ? 1 : 0)
        if (gk > 0) {
          const cell = Math.max(12, Math.round(m * 0.13))
          b.fillStyle = pattern(b, PINK[3], 2 + gk * 7)
          for (let x = ((cx % cell) + cell) % cell; x < w; x += cell) b.fillRect(x, 0, 1, h)
          for (let y = ((my % cell) + cell) % cell; y < h; y += cell) b.fillRect(0, y, w, 1)
        }
        // Bent: rows pinched toward the middle, columns sagging into a well.
        const W2 = s.warp.g
        if (k > 0) {
          const tg = s.tmp.g
          tg.clearRect(0, 0, w, h)
          for (let y = 0; y < h; y++) {
            const bump = Math.exp(-(((y - my) / (h * 0.28)) ** 2))
            const sx = 1 - 0.22 * k * bump + 0.03 * k * Math.sin(t * 7 + y * 0.08)
            const ww = Math.round(w * sx)
            tg.drawImage(s.buf, 0, y, w, 1, Math.round(cx - ww / 2), y, ww, 1)
          }
          W2.fillStyle = '#0a0418'
          W2.fillRect(0, 0, w, h)
          for (let x = 0; x < w; x++) {
            const dy = Math.round(k * m * 0.09 * Math.exp(-(((x - cx) / (w * 0.32)) ** 2)))
            W2.drawImage(s.tmp, x, 0, 1, h, x, dy, 1, h)
          }
        } else W2.drawImage(s.buf, 0, 0)
        g.fillStyle = '#0a0418'
        g.fillRect(0, 0, w, h)
        g.save()
        g.translate(sh.x, sh.y)
        const q = fold(t)
        const d = Math.round(split(t) * gap)
        if (t >= P_TEAR && t < P_REVEAL) {
          // Torn: the void, it coming through, the two halves pulled apart, their torn edges lit.
          g.drawImage(s.space, 0, 0)
          // A white heart in the void, so the shape coming through it shows dark against it.
          const glowR = Math.round(m * (0.26 + 0.04 * Math.sin(t * 9))) & ~1
          if (d > 2) {
            g.drawImage(glow(glowR, PINK[2], 1.2, 0.8), cx - glowR, my - glowR)
            const cr = Math.round(glowR * 0.55) & ~1
            g.drawImage(glow(cr, PINK[1], 1, 0.9), cx - cr, my - cr)
          }
          if (t > P_COME && t < P_REVEAL - 0.3) comeThrough(g, L, t)
          for (let y = 0; y < h; y++) {
            const x = s.rift[y]!
            g.drawImage(s.warp, 0, y, x, 1, -d, y, x, 1)
            g.drawImage(s.warp, x, y, w - x, 1, x + d, y, w - x, 1)
            const c = (y + Math.floor(t * 30)) % 4 ? PINK[1] : PINK[0]
            rect(g, x - d - 1, y, 2, 1, c)
            rect(g, x + d - 1, y, 2, 1, c)
            if (d > 3 && (y + Math.floor(t * 20)) % 3 === 0) {
              rect(g, x - d - 3, y, 1, 1, PINK[3])
              rect(g, x + d + 2, y, 1, 1, PINK[3])
            }
          }
          P_RENDS.forEach((at, i) => rend(g, L, t, at, i))
          if (t >= P_REVEAL - 0.3) comeThrough(g, L, t)
        } else if (q !== 0) {
          // Folding like a page: the right half turning over onto the left, the void behind it.
          g.drawImage(s.space, 0, 0)
          g.drawImage(s.warp, 0, 0, cx, h, 0, 0, cx, h)
          const c = Math.cos(Math.PI * q)
          const pw = Math.round((w - cx) * Math.abs(c))
          if (pw > 0) {
            if (c >= 0) g.drawImage(s.warp, cx, 0, w - cx, h, cx, 0, pw, h)
            else {
              g.save()
              g.translate(cx, 0)
              g.scale(-1, 1)
              g.drawImage(s.warp, cx, 0, w - cx, h, 0, 0, pw, h)
              g.restore()
            }
            // The turning page darkens edge-on, and its fold glows.
            g.fillStyle = pattern(g, '#0a0418', Math.abs(Math.sin(Math.PI * q)) * 10)
            g.fillRect(c >= 0 ? cx : cx - pw, 0, pw, h)
            rect(g, c >= 0 ? cx + pw - 1 : cx - pw, 0, 1, h, PINK[2])
          }
          rect(g, cx - 1, 0, 2, h, PINK[1])
        } else {
          g.drawImage(s.warp, 0, 0)
          if (t >= P_REVEAL) {
            // The seam it came through, closing, still glowing a moment.
            const sk = 1 - span(t, P_REVEAL, P_REVEAL + 1)
            if (sk > 0) {
              g.fillStyle = pattern(g, PINK[1], sk * 16)
              for (let y = 0; y < h; y++) g.fillRect(s.rift[y]! - 1, y, 2, 1)
            }
            const kr =
              span(t, P_REVEAL, P_REVEAL + 0.4) * lerp(0.55, 0.22, span(t, P_REVEAL + 0.4, P_REVEAL + 1.4))
            drawRays(s.rays, { x: cx, y: my }, t, P_AURA[2], kr)
            g.drawImage(s.rays, 0, 0)
            const bob = Math.round(Math.sin((t - P_REVEAL) * 2) * 1)
            drawSprite(g, L.mon, cx, feet + bob, {
              flash: Math.max(0, 1 - span(t, P_REVEAL + 0.05, P_REVEAL + 0.45)),
              outline: Math.floor(t * 8) % 2 ? P_AURA[1] : P_AURA[2],
            })
          }
        }
        if (t >= P_TEAR && t < P_SPLIT) {
          // The first crack, before it opens: a white seam.
          const kq = span(t, P_TEAR, P_TEAR + 0.12)
          for (let y = 0; y < Math.round(h * kq); y++)
            rect(g, s.rift[y]! - 1, y, 2, 1, (y >> 1) % 2 ? PINK[0] : PINK[1])
        }
        for (const [dd, c] of [
          [0, P_AURA[0]],
          [0.1, P_AURA[1]],
          [0.22, P_AURA[2]],
        ] as const)
          burstRing(g, cx, my, span(t, P_REVEAL + dd, P_REVEAL + dd + 0.6), Math.max(w, h) * 0.75, 3, c)
        s.fx.draw(g)
        g.restore()
        if (within(t, P_TEAR, P_TEAR + 0.15))
          screenFlash(g, '#ffd0f0', 0.5 * (1 - span(t, P_TEAR, P_TEAR + 0.15)))
        if (within(t, P_REVEAL, P_REVEAL + 0.35))
          screenFlash(g, '#ffffff', 0.9 * (1 - span(t, P_REVEAL, P_REVEAL + 0.35)))
        if (t < 0.5) wash(g, '#000000', 1 - span(t, 0, 0.5), 8)
      },
      cues: () =>
        inOrder([
          [0.05, quiet(() => hiss(1.4, { freq: 900, type: 'lowpass', vol: 0.03 }))],
          [0.4, quiet(() => tone(1319, 1.2, { type: 'sine', vol: 0.015 }))],
          [
            P_BEND,
            quiet(
              () => (
                tone(110, 1.3, { type: 'sine', vol: 0.06, slide: -40 }),
                hiss(1.2, { freq: 200, slide: 600, vol: 0.04 })
              ),
            ),
          ],
          [P_FOLD, quiet(() => hiss(0.45, { freq: 2000, slide: -1700, vol: 0.06 }))],
          [P_FOLD + 0.4, quiet(() => tone(82, 0.4, { type: 'square', vol: 0.04 }))],
          [
            P_OPEN,
            quiet(
              () => (
                hiss(0.35, { freq: 400, slide: 2400, vol: 0.06 }),
                tone(196, 0.5, { type: 'sine', vol: 0.04, slide: 300 })
              ),
            ),
          ],
          [P_TEAR, quiet(() => (fxSound('legend.shatter'), hiss(0.5, { freq: 6000, vol: 0.05 })))],
          [
            P_SPLIT,
            quiet(
              () => (
                hiss(1.2, { freq: 300, type: 'lowpass', vol: 0.12 }),
                tone(55, 1.3, { type: 'sine', vol: 0.1 })
              ),
            ),
          ],
          ...P_RENDS.map((at) => [at, quiet(() => fxSound('leaf.slash'))] as const),
          [P_COME, quiet(() => fxSound('legend.heart'))],
          [P_COME + 0.4, quiet(() => fxSound('legend.heart'))],
          [P_REVEAL - 0.15, quiet(() => hiss(0.15, { freq: 800, slide: -500, vol: 0.08 }))],
          [P_REVEAL, (hud) => (quiet(() => fxSound('legend.roar'))(), hud.beat?.('roar'))],
        ] satisfies Cue<PS>[]),
    }
  },
}

/** Palkia coming through the rift: small and far in the void, nearer and nearer, a pink edge round its dark shape. */
function comeThrough(g: G, L: Lay, t: number) {
  const q = ease.inQ(span(t, P_COME, P_REVEAL))
  const k = lerp(0.4, 1, q)
  const y = Math.round(lerp(L.my + L.sz.h * 0.2, L.feet, q))
  drawSprite(g, L.mon, L.cx, y, {
    sx: k,
    sy: k,
    sil: '#2a0c2a',
    outline: Math.floor(t * 12) % 3 ? PINK[2] : PINK[0],
  })
}

/** A crescent of Spacial Rend slashing across the screen: drawn along its arc in a blink, then breaking up. */
function rend(g: G, L: Lay, t: number, at: number, i: number) {
  const e = t - at
  if (e < 0 || e > 0.35) return
  const { w, h, cx, my } = L
  const grow = span(e, 0, 0.07)
  const fade = 1 - span(e, 0.1, 0.35)
  // Each from its own side, at its own slant.
  const a0 = [-0.5, 2.6, 1.2][i]!
  const R = Math.max(w, h) * 0.55
  const ox = cx - Math.cos(a0 + 0.6) * R * 0.75
  const oy = my - Math.sin(a0 + 0.6) * R * 0.75
  const span0 = 1.2
  const n = 60
  for (let k = 0; k <= n * grow; k++) {
    const u = k / n
    const a = a0 + u * span0
    const th = Math.round(Math.sin(u * Math.PI) * Math.max(3, w * 0.02))
    const x = ox + Math.cos(a) * R
    const y = oy + Math.sin(a) * R
    if (fade < 1 && ((k * 7 + Math.floor(e * 60)) % 16) / 16 > fade) continue
    rect(g, x - th, y - th, th * 2 + 1, th * 2 + 1, PINK[3])
    rect(
      g,
      x - th + 1,
      y - th + 1,
      Math.max(1, th * 2 - 1),
      Math.max(1, th * 2 - 1),
      th > 2 ? PINK[1] : PINK[2],
    )
    if (th > 1) rect(g, x - 1, y - 1, 2, 2, PINK[0])
  }
}
