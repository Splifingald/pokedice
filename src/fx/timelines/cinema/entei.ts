// Entei's entrance (docs/53), on the battle stage: Ecruteak on a stormy night, the Brass Tower standing over the town's
// roofs, a range of sleeping volcanoes black on the skyline behind the temple wall. Lightning strikes the tower's spire
// and the fire runs down it tier by tier until the whole pagoda blazes against a red sky; it groans, its upper tiers
// snap off and topple, and the rest crashes down into its own fire. Smoke, ashes, a hush; then Ho-Oh crosses the sky
// in a streak of rainbow and its light falls on the ruin. The ashes glow and a beast climbs out of them, reborn, its outline molten. It roars, and the volcanoes
// behind the town erupt one after another, the biggest last; a pillar of Sacred Fire roars up round it, and the reveal
// blows the pillar into the sky and a ring of fire out across the courtyard.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  bayer,
  bolt,
  canvas,
  clamp,
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
  span,
  wash,
  type Canvas,
  type G,
  type Rng,
} from '../../pixel'
import { drawSprite, spriteSize } from '../../sprites'
import { H, screenFlash, screenShake, W, within } from '../../timeline'
import { bossCinema } from './boss'
import {
  burstRing,
  dGradient,
  dissolve,
  drawShards,
  makeShard,
  pulse,
  stepShards,
  tri,
  type Shard,
} from './kit'

const REVEAL = 4.4
/** The tower's foot on the courtyard; the temple wall behind it; the plain at the volcanoes' feet. */
const BASE = 99
const WALL = 86
const HZ = 92
const T_GLINT = 0.36
const T_BOLT = 0.62
const T_FALL = 1.8
const T_CRASH = 2.38
const T_HOOH = 2.42
const HOOH_DUR = 0.8
/** How far along its flight Ho-Oh is over the ashes: its light falls then. */
const PASS = 0.72
const T_BEAM = T_HOOH + HOOH_DUR * PASS
const T_RISE = T_BEAM + 0.1
const T_UP = 3.55
const T_ROAR = 3.58
const T_SACRED = 3.97

const FIRE = ['#fff6c8', '#ffe08a', '#ffbe2e', '#ff8a1e', '#e0501e', '#a8281a', '#5a120c'] as const
const BOW = ['#e0403a', '#ff8a1e', '#ffd23a', '#7ac74c', '#3a9af0', '#8a5ad0'] as const
const BRASS = '#9a7a30'

/** The range behind the town: x, peak, crater and foot half-widths, when it erupts, how hard. The biggest goes last. */
const VOLCANOES = [
  [226, 54, 4, 44, 3.66, 0.6],
  [52, 58, 4, 46, 3.76, 0.65],
  [8, 68, 3, 30, 3.85, 0.5],
  [100, 30, 6, 74, 3.93, 1],
] as const

/** The Brass Tower's tiers, in pixels above its foot: the body b0..b1 (half-width hw), its roof up to r1 (eaves rw). */
const TIERS = [
  { b0: 0, b1: 20, hw: 24, r1: 26, rw: 36 },
  { b0: 26, b1: 41, hw: 19, r1: 46, rw: 30 },
  { b0: 46, b1: 59, hw: 15, r1: 64, rw: 24 },
  { b0: 64, b1: 74, hw: 11, r1: 78, rw: 18 },
] as const
const SPIRE = 92
/** Its canvas, with room above for the spire's flames: the foot on row TB, centred on TC. */
const TW = 84
const TC = 42
const TB = 104
const TH = 107
/** The tower's foot row lands on the courtyard's BASE. */
const OY = BASE - TB
/** When each tier catches: the struck spire first, then down. */
const ignite = (i: number) => T_BOLT + 0.08 + (3 - i) * 0.24
/** A roof's top: the body above it, or the spire's foot. */
const roofTop = (i: number) => (i < 3 ? TIERS[i + 1]!.hw + 1 : 3)

/** A glow's strength in eighths: `glow` caches each strength it is asked for. */
const q8 = (v: number) => Math.round(clamp(v) * 8) / 8

/** How hot the scene burns: the tower's blaze, the hush in its ashes, the rebirth. */
const heatAt = (t: number) =>
  clamp(
    span(t, T_BOLT + 0.05, 1.5) * (1 - 0.55 * span(t, T_CRASH + 0.25, T_BEAM)) +
      0.6 * span(t, T_RISE, T_SACRED),
  )

/** A flicker 0..1 for a column of fire at x: two waves and a jitter that changes a few times a second. */
function flick(x: number, t: number) {
  const f = Math.floor(t * 24)
  const j = ((((x * 7919 + f * 104729) % 13) + 13) % 13) / 13
  return clamp(0.5 + 0.28 * Math.sin(x * 0.7 + t * 11) + 0.18 * Math.sin(x * 1.9 - t * 17) + (j - 0.5) * 0.3)
}

/** A tongue of fire standing on (x, y), h tall: white-gold at its root, red at its tip, dithered between. */
function tongue(g: G, x: number, y: number, h: number, hot = 0) {
  for (let i = 0; i < h; i++) {
    const c = clamp(Math.floor((i / h) * 4.6 + bayer(x, y - i) * 1.3) + hot, 0, 6)
    rect(g, x, y - i, 1, 1, FIRE[c]!)
  }
}

/** A volcano's half-width at row y: a narrow crater, concave flanks flaring out to its foot. */
const flank = (v: (typeof VOLCANOES)[number], y: number) =>
  Math.round(v[2] + (v[3] - v[2]) * clamp((y - v[1]) / (HZ - v[1])) ** 1.5)

type Win = [number, number, number, number, number]
type X = {
  buf: Canvas
  rise: Canvas
  night: Canvas
  red: Canvas
  hot: Canvas
  range: Canvas
  court: Canvas
  town: Canvas
  townLit: Canvas
  tower: Canvas
  tb: Canvas
  windows: Win[]
  heap: Canvas
  heapTop: number[]
  cracks: [number, number][][]
  flows: [number, number][][][]
  summits: Canvas[]
  strike: [number, number][]
  debris: Shard[]
  amb: Particles
  smoke: Particles
  lava: Particles
  feathers: Particles
  shakes: [number, number, number][]
}

/** The sky: its gradient, a few stars, heavy clouds lit from below by whatever burns. */
function sky(stops: readonly string[], cloud: string, lit: string, stars: boolean): Canvas {
  const cv = canvas(W, H)
  const g = cv.g
  g.drawImage(dGradient(W, HZ, stops), 0, 0)
  const r = rng(2441)
  if (stars) for (let i = 0; i < 26; i++) rect(g, r.range(0, W), r.range(18, 44), 1, 1, '#5a5a7a')
  for (let i = 0; i < 24; i++) {
    const x = ((i * 41) % (W + 40)) - 10
    const y = 2 + ((i * 11) % 18)
    const rx = 18 + ((i * 7) % 14)
    const ry = 4 + (i % 3)
    ellipse(g, x, y + 1, rx, ry, lit)
    ellipse(g, x, y, rx, ry, cloud)
  }
  return cv
}

/** The range: four cones, the farther ones hazier, each crater's lip a dull red (they only sleep). */
function range(): Canvas {
  const cv = canvas(W, H)
  const g = cv.g
  for (const v of VOLCANOES) {
    const far = v[5] < 0.9
    for (let y = v[1]; y <= HZ; y++) {
      const hw = flank(v, y)
      rect(g, v[0] - hw, y, hw * 2 + 1, 1, far ? '#1c0a12' : '#12060c')
      rect(g, v[0] - hw, y, 1, 1, far ? '#3a141c' : '#2e1018')
      rect(g, v[0] + hw, y, 1, 1, far ? '#3a141c' : '#2e1018')
    }
    rect(g, v[0] - v[2] + 1, v[1], v[2] * 2 - 1, 1, '#5a1a10')
    rect(g, v[0] - 1, v[1], 3, 1, '#8a2a12')
  }
  return cv
}

/** A volcano's summit glowing once it has blown: its upper flanks in dithered red, brightest at the rim. */
function summit(v: (typeof VOLCANOES)[number]): Canvas {
  const cap = Math.round((HZ - v[1]) * 0.4)
  const hb = flank(v, v[1] + cap)
  const cv = canvas(hb * 2 + 1, cap)
  for (let k = 0; k < cap; k++) {
    const hw = flank(v, v[1] + k)
    const e = k / cap
    for (let dx = -hw + 1; dx < hw; dx++)
      if ((1 - e) * 0.75 > bayer(v[0] + dx, v[1] + k))
        rect(cv.g, hb + dx, k, 1, 1, e < 0.3 ? '#c8401a' : '#6a1a10')
  }
  return cv
}

/** The temple wall across the back, the courtyard's flagstones running to it. */
function court(fx: number): Canvas {
  const cv = canvas(W, H)
  const g = cv.g
  rect(g, 0, WALL - 3, W, 3, '#0e080c')
  for (let x = 0; x < W; x += 3) rect(g, x, WALL - 4, 2, 1, '#1a1016')
  rect(g, 0, WALL, W, HZ - WALL, '#24181e')
  for (let x = 6; x < W; x += 22) rect(g, x, WALL, 2, HZ - WALL, '#160e12')
  g.drawImage(dGradient(W, H - HZ, ['#1e1418', '#160e12', '#0c080a']), 0, HZ)
  for (let k = -12; k <= 12; k++) line(g, fx + k * 10, HZ, fx + k * 46, H, '#120a0c')
  for (let y = HZ + 2, d = 2; y < H; y += d, d += 1.4) rect(g, 0, Math.round(y), W, 1, '#120a0c')
  return cv
}

/** Ecruteak's roofs in the foreground: tiled, hipped, their ridge ends turned up; the fire lights their right edges. */
function town(): { cv: Canvas; lit: Canvas } {
  const cv = canvas(W, H)
  const lit = canvas(W, H)
  const g = cv.g
  const roofs = [
    // ridge y, ridge x0..x1, eave y, eave x0..x1
    [106, 62, 104, 118, 46, 120],
    [118, 2, 54, 132, -12, 70],
  ] as const
  for (const [ry, rx0, rx1, ey, ex0, ex1] of roofs) {
    // The walls under the eaves, a paper window glowing.
    rect(g, ex0 + 6, ey, ex1 - ex0 - 12, H - ey, '#140c10')
    rect(g, ex1 - 26, ey + 6, 10, 7, '#4a2a18')
    rect(lit.g, ex1 - 25, ey + 7, 8, 5, '#a8582a')
    rect(g, ex1 - 22, ey + 6, 1, 7, '#140c10')
    rect(lit.g, ex1 - 22, ey + 6, 1, 7, '#140c10')
    rect(lit.g, ex1 - 26, ey + 9, 10, 1, '#140c10')
    for (let y = ry; y <= ey; y++) {
      const q = (y - ry) / (ey - ry)
      const x0 = Math.round(lerp(rx0, ex0, q))
      const x1 = Math.round(lerp(rx1, ex1, q))
      rect(g, x0, y, x1 - x0 + 1, 1, '#0c0608')
      for (let x = x0 + 1; x < x1; x += 3) rect(g, x, y, 1, 1, '#170d11')
      rect(lit.g, x1, y, 1, 1, '#c8501a')
      if (y % 2) rect(lit.g, x1 - 1, y, 1, 1, '#7a2a12')
    }
    rect(g, rx0 - 2, ry - 1, rx1 - rx0 + 5, 2, '#0c0608')
    rect(g, rx0 - 3, ry - 3, 2, 2, '#0c0608')
    rect(g, rx1 + 2, ry - 3, 2, 2, '#0c0608')
    rect(lit.g, rx0, ry - 1, rx1 - rx0 + 2, 1, '#8a3414')
    rect(lit.g, rx1 + 3, ry - 3, 1, 2, '#c8501a')
    rect(g, ex0 - 2, ey, ex1 - ex0 + 4, 1, '#1e1216')
  }
  return { cv, lit }
}

/** The Brass Tower: four tiers of black lacquer and brass, window slits, upturned eaves, a ringed spire. */
function tower(): { cv: Canvas; windows: Win[] } {
  const cv = canvas(TW, TH)
  const g = cv.g
  const Y = (hb: number) => TB - hb
  const windows: Win[] = []
  rect(g, TC - 30, Y(0) - 1, 61, 4, '#2a2026')
  rect(g, TC - 30, Y(0) - 1, 61, 1, '#3e3238')
  TIERS.forEach((tr, i) => {
    rect(g, TC - tr.hw, Y(tr.b1), tr.hw * 2 + 1, tr.b1 - tr.b0, '#1c0c10')
    for (let x = -tr.hw; x <= tr.hw; x += 6) rect(g, TC + x, Y(tr.b1), 1, tr.b1 - tr.b0, '#2c1418')
    rect(g, TC - tr.hw, Y(tr.b1) + 1, tr.hw * 2 + 1, 1, '#5a4420')
    const n = [4, 3, 2, 1][i]!
    for (let k = 0; k < n; k++) {
      const wx = TC + Math.round((k - (n - 1) / 2) * 10) - 1
      const wy = Y(tr.b1) + 4
      const wh = tr.b1 - tr.b0 - 7
      rect(g, wx, wy, 3, wh, '#070203')
      windows.push([wx, wy, 3, wh, i])
    }
    const top = roofTop(i)
    for (let hb = tr.b1; hb <= tr.r1; hb++) {
      const hw = Math.round(lerp(tr.rw, top, (hb - tr.b1) / (tr.r1 - tr.b1)))
      rect(g, TC - hw, Y(hb), hw * 2 + 1, 1, '#120a0e')
      for (let x = -hw + 1; x < hw; x += 2) if ((hb + x) % 4 === 0) rect(g, TC + x, Y(hb), 1, 1, '#22141a')
    }
    rect(g, TC - tr.rw, Y(tr.b1), tr.rw * 2 + 1, 1, BRASS)
    for (const sd of [-1, 1]) {
      rect(g, TC + sd * (tr.rw + 1), Y(tr.b1) - 2, 1, 3, BRASS)
      rect(g, TC + sd * (tr.rw - 1), Y(tr.b1) + 1, 1, 2, '#c8a850')
    }
  })
  rect(g, TC - 1, Y(SPIRE), 2, SPIRE - 78, '#3a2a1a')
  for (let k = 0; k < 5; k++) rect(g, TC - 3, Y(80 + k * 2), 7, 1, BRASS)
  rect(g, TC - 1, Y(SPIRE) - 1, 2, 2, '#ffd23a')
  return { cv, windows }
}

/** The ruin it falls into: a mound of ash, charred posts and beams sticking out, embers in it. */
function heap(r: Rng): { cv: Canvas; top: number[] } {
  const cv = canvas(124, 26)
  const g = cv.g
  const top: number[] = []
  for (let x = 0; x < 124; x++) {
    const u = (x - 62) / 62
    const y = Math.round(25 - 16 * Math.max(0, 1 - u * u) ** 0.8 - Math.sin(x * 0.9) * 1.2)
    top.push(y)
    rect(g, x, y, 1, 26 - y, '#140a0a')
    rect(g, x, y, 1, 1, '#2e1610')
    for (let yy = y + 2; yy < 26; yy++) {
      const k = r()
      if (k < 0.07) rect(g, x, yy, 1, 1, '#7a1e12')
      else if (k < 0.085) rect(g, x, yy, 1, 1, '#ff8a1e')
    }
  }
  for (let i = 0; i < 9; i++) {
    const x = r.range(16, 108)
    const y = top[Math.round(x)]! + 3
    const a = (r() < 0.5 ? -1 : 1) * r.range(0.35, 1.3)
    const len = r.range(10, 22)
    const x1 = x + Math.sin(a) * len
    const y1 = y - Math.cos(a) * len
    line(g, x, y, x1, y1, '#1e0e0c', 2)
    rect(g, x1, y1, 2, 1, '#6a2410')
  }
  return { cv, top }
}

export const enteiCinema = bossCinema<X>({
  id: 'cinema-entei',
  reveal: REVEAL,
  seed: 244,
  aura: ['#ffffff', '#ffe08a', '#ff8a1e', '#9a2a16'],
  flash: '#fff0c8',
  setup(st, r) {
    const F = st.L.foe
    const t = tower()
    const h = heap(rng(2442))
    const tn = town()
    const flows = VOLCANOES.map((v) =>
      [-0.55, 0.15, 0.6].map((fr) => {
        const pts: [number, number][] = []
        const end = lerp(v[1], HZ, r.range(0.55, 1))
        let wig = 0
        for (let y = v[1] + 1; y <= end; y += 2) {
          wig += r.range(-1, 1)
          pts.push([Math.round(v[0] + fr * v[2] + (flank(v, y) - v[2]) * fr * 0.9 + wig), y])
        }
        return pts
      }),
    )
    return {
      buf: canvas(W, H),
      rise: canvas(W, H),
      night: sky(['#04040a', '#08081a', '#0e0e24', '#16142c', '#1e1a30'], '#0c0c1c', '#16162c', true),
      red: sky(['#0c0408', '#1c0810', '#360c12', '#5e1a12', '#8a3014'], '#1a080e', '#6a2010', false),
      hot: sky(['#200608', '#3e0c0e', '#6a1a10', '#a03a14', '#d86a1e'], '#2a0a0c', '#c8501a', false),
      range: range(),
      court: court(F.x),
      town: tn.cv,
      townLit: tn.lit,
      tower: t.cv,
      tb: canvas(TW, TH),
      windows: t.windows,
      heap: h.cv,
      heapTop: h.top.map((y) => y + BASE + 4 - 26),
      cracks: Array.from({ length: 8 }, (_, i) => {
        const a = Math.PI + (i / 7) * Math.PI + r.range(-0.15, 0.15)
        const len = r.range(26, 56)
        return bolt(r, F.x, BASE - 2, F.x + Math.cos(a) * len, BASE - 2 + Math.sin(a) * len * 0.3, 0.35, 4)
      }),
      flows,
      summits: VOLCANOES.map(summit),
      strike: bolt(r, 104, -4, F.x, OY + TB - SPIRE - 1, 0.3, 5),
      debris: [],
      amb: new Particles(),
      smoke: new Particles(),
      lava: new Particles(),
      feathers: new Particles(),
      shakes: [
        [T_BOLT, 0.25, 2],
        [T_FALL, 0.45, 1],
        [T_CRASH, 0.6, 5],
        [T_ROAR, 0.6, 2],
        ...VOLCANOES.map(([, , , , at, pw]) => [at, 0.3, pw > 0.9 ? 4 : 1] as [number, number, number]),
        [REVEAL, 0.5, 4],
      ],
    }
  },
  step(s, t, dt) {
    const r = s.r
    const F = s.L.foe
    for (const p of [s.amb, s.smoke, s.lava, s.feathers]) p.update(dt)
    stepShards(s.debris, dt, { floor: BASE + 6 })
    const heat = heatAt(t)
    const fire = (x: number, y: number, vx: number, vy: number, life = 0.6, size = 2) =>
      s.fx.add({ x, y, vx, vy, life, size, size1: 0, shape: 'sq', colors: [...FIRE] })
    // Embers rising over everything while it burns; ash falling in the hush.
    if (r() < heat * 0.9)
      s.amb.add({
        x: r.range(0, W),
        y: H + 2,
        vx: r.range(-6, 14),
        vy: -r.range(25, 60),
        life: r.range(2, 3.2),
        size: 1,
        shape: 'sq',
        colors: ['#fff6c8', '#ffbe2e', '#ff8a1e', '#a8281a'],
      })
    if (t > T_CRASH && t < T_UP && r() < 0.5)
      s.amb.add({
        x: r.range(0, W),
        y: -2,
        vx: r.range(4, 12),
        vy: r.range(10, 22),
        life: 4,
        size: 1,
        shape: 'px',
        colors: ['#6a5a5a', '#4a3a3a'],
      })
    // The burning tower's smoke, then the ruin's, a thick column leaning with the wind.
    const burning = t > ignite(3) && t < T_CRASH
    if (burning && r() < 0.55) {
      const i = TIERS.findIndex((_, k) => t > ignite(k))
      const tr = TIERS[Math.max(0, i)]!
      const sink = sinkAt(t)
      s.smoke.add({
        x: F.x + r.range(-tr.rw, tr.rw) * 0.6,
        y: BASE - tr.r1 + sink - 4,
        vx: r.range(8, 18),
        vy: -r.range(18, 30),
        life: 2.2,
        size: 4,
        size1: 9,
        shape: 'smoke',
        colors: ['#1c0a10', '#14070c'],
        light: '#1c0a10',
      })
    }
    if (t > T_CRASH && t < T_HOOH && r() < 0.6)
      s.smoke.add({
        x: F.x + r.range(-26, 26),
        y: BASE - 8,
        vx: r.range(6, 16),
        vy: -r.range(24, 36),
        life: 1.9,
        size: 5,
        size1: 11,
        shape: 'smoke',
        colors: ['#1a0a10', '#12070c'],
        light: '#1a0a10',
      })
    // Sparks shed by the blazing tiers.
    if (burning && r() < 0.6) {
      const tr = TIERS[r.int(0, 3)]!
      if (t > ignite(TIERS.indexOf(tr)))
        fire(F.x + r.range(-tr.rw, tr.rw), BASE - tr.r1, r.range(-10, 10), -r.range(20, 50), 0.5, 1)
    }
    // The bolt's sparks off the spire.
    if (within(t, T_BOLT, T_BOLT + dt))
      for (let i = 0; i < 24; i++)
        s.fx.add({
          x: F.x,
          y: OY + TB - SPIRE,
          vx: r.range(-70, 70),
          vy: r.range(-60, 30),
          ay: 200,
          life: r.range(0.3, 0.6),
          size: 1,
          shape: 'px',
          colors: ['#ffffff', '#c8c8ff', '#ffe08a'],
        })
    // It snaps at the second roof: a burst of sparks at the break.
    if (within(t, T_FALL, T_FALL + dt))
      for (let i = 0; i < 30; i++)
        fire(
          F.x + r.range(-16, 16),
          BASE - TIERS[2].b0,
          r.range(-90, 60),
          -r.range(10, 90),
          r.range(0.4, 0.8),
          r.int(1, 2),
        )
    // It gives way: fire and dust bursting out at its foot as the tiers crash down into it, then the great plume.
    const q = span(t, T_FALL, T_CRASH)
    if (q > 0 && q < 1)
      for (let i = 0; i < 1 + q * 4; i++)
        fire(
          F.x + r.range(-34, 34),
          BASE - r.range(0, 6),
          r.range(-50, 50),
          -r.range(30, 110),
          r.range(0.4, 0.8),
          r.int(2, 3),
        )
    if (within(t, T_CRASH, T_CRASH + dt)) {
      for (let i = 0; i < 90; i++)
        fire(
          F.x + r.range(-40, 40),
          BASE - r.range(0, 10),
          r.range(-90, 90),
          -r.range(40, 220),
          r.range(0.5, 1.1),
          r.int(2, 4),
        )
      for (let i = 0; i < 26; i++)
        s.debris.push(
          makeShard(r, F.x + r.range(-30, 30), BASE - r.range(4, 20), 150, '#2a1410', '#ff8a1e', 0.9),
        )
      for (let i = 0; i < 16; i++)
        s.smoke.add({
          x: F.x + r.range(-40, 40),
          y: BASE - r.range(0, 16),
          vx: r.range(-30, 30),
          vy: -r.range(20, 60),
          drag: 1,
          life: 2,
          size: 6,
          size1: 12,
          shape: 'smoke',
          colors: ['#1e0c12', '#14080c'],
          light: '#1e0c12',
        })
      // A wave of ash rolling out low over the flagstones.
      for (let i = 0; i < 36; i++) {
        const sd = r() < 0.5 ? -1 : 1
        s.fx.add({
          x: F.x + sd * r.range(10, 40),
          y: BASE + r.range(-2, 6),
          vx: sd * r.range(120, 240),
          vy: -r.range(0, 14),
          drag: 1.6,
          life: r.range(0.4, 0.65),
          size: r.int(3, 5),
          size1: 7,
          shape: 'smoke',
          colors: ['#3a2a28', '#2a1c1c'],
          light: '#3a2a28',
        })
      }
    }
    // The ruin still burning, lower and lower.
    const hf = heapFire(t)
    if (hf > 0 && t < T_SACRED && r() < hf)
      fire(
        F.x + r.range(-50, 50),
        BASE - r.range(4, 14),
        r.range(-6, 6),
        -r.range(20, 50),
        r.range(0.3, 0.6),
        r.int(1, 2),
      )
    // Ho-Oh's feathers drifting down, a rainbow of them.
    const u = (t - T_HOOH) / HOOH_DUR
    if (u > 0.1 && u < 0.9 && r() < 0.25) {
      const at = hoohAt(u, F.x)
      const c = r.pick(BOW)
      s.feathers.add({
        x: at.x + r.range(-6, 6),
        y: at.y + r.range(2, 10),
        vx: r.range(-16, 16),
        vy: r.range(28, 48),
        life: r.range(1, 1.5),
        size: 2,
        shape: 'leaf',
        spin: r.range(-4, 4),
        colors: [c],
        light: '#ffffff',
        dark: c,
      })
    }
    // The rebirth: embers and Ho-Oh's colours spiralling into the ashes; ash streaming off it as it climbs out.
    if (t > T_BEAM && t < T_UP)
      for (let i = 0; i < 3; i++) {
        const a = r() * Math.PI * 2
        const d = r.range(60, 110)
        s.fx.add({
          x: F.x + Math.cos(a) * d,
          y: F.y - 24 + Math.sin(a) * d * 0.6,
          vx: -Math.sin(a) * 70,
          vy: Math.cos(a) * 40,
          home: { x: F.x, y: F.y - 20, k: 320 },
          life: 0.9,
          size: r.int(1, 2),
          shape: 'sq',
          colors: r() < 0.3 ? [r.pick(BOW), '#ffffff'] : ['#ffffff', '#ffe08a', '#ff8a1e'],
        })
      }
    if (t > T_RISE && t < T_UP && r() < 0.9) {
      const sz = spriteSize(s.foe)
      s.fx.add({
        x: F.x + r.range(-sz.w * 0.45, sz.w * 0.45),
        y: F.y - r.range(0, 4),
        vx: r.range(-30, 30),
        vy: -r.range(10, 50),
        ay: 60,
        life: 0.7,
        size: r.int(1, 2),
        shape: 'sq',
        colors: ['#8a7a72', '#5a4a46', '#3a2a28'],
      })
    }
    // The roar: its mane flares, and the ashes are blown flat, outward.
    if (within(t, T_ROAR, T_ROAR + dt)) {
      const sz = spriteSize(s.foe)
      for (let i = 0; i < 40; i++)
        fire(
          F.x + r.range(-sz.w * 0.3, sz.w * 0.35),
          F.y - sz.h * r.range(0.8, 1),
          r.range(-30, 30),
          -r.range(60, 160),
          r.range(0.4, 0.8),
          r.int(1, 2),
        )
    }
    if (within(t, T_ROAR, T_ROAR + dt))
      for (let i = 0; i < 50; i++) {
        const a = r.range(-Math.PI, 0)
        const v = r.range(80, 200)
        s.fx.add({
          x: F.x,
          y: F.y - 4,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v * 0.35,
          drag: 2,
          life: r.range(0.5, 0.9),
          size: r.int(1, 2),
          shape: 'sq',
          colors: ['#fff6c8', '#ff8a1e', '#5a4a46'],
        })
      }
    // The eruptions: lava bombs arcing out of each crater; after the biggest, burning rock rains on the town.
    VOLCANOES.forEach(([x, py, , , at, pw]) => {
      if (t < at || t > REVEAL + 2) return
      const n = within(t, at, at + dt) ? Math.round(36 * pw) : r() < 0.6 ? 1 : 0
      for (let k = 0; k < n; k++)
        s.lava.add({
          x: x + r.range(-3, 3),
          y: py - 2,
          vx: r.range(-60, 60) * pw,
          vy: -r.range(80, 190) * pw,
          ay: 200,
          life: r.range(0.9, 1.5),
          size: pw > 0.9 ? 2 : 1,
          shape: 'streak',
          trail: 0.035,
          colors: ['#fff6c8', '#ffbe2e', '#ff8a1e', '#e0501e', '#a8281a'],
        })
    })
    if (t > VOLCANOES[3][4] + 0.1 && t < REVEAL + 0.3 && r() < 0.35)
      s.fx.add({
        x: r.range(-20, W),
        y: -4,
        vx: r.range(30, 60),
        vy: r.range(120, 180),
        life: 1.2,
        size: 1,
        shape: 'streak',
        trail: 0.04,
        colors: ['#fff6c8', '#ffbe2e', '#ff8a1e'],
      })
    // Sacred Fire: sparks of every colour climbing the pillar.
    if (t > T_SACRED && t < REVEAL)
      for (let i = 0; i < 3; i++)
        s.fx.add({
          x: F.x + r.range(-34, 34),
          y: F.y - r.range(0, 60),
          vx: r.range(-8, 8),
          vy: -r.range(90, 180),
          life: 0.5,
          size: r.int(1, 2),
          shape: r() < 0.5 ? 'star' : 'sq',
          colors: [r.pick(BOW), '#ffffff'],
        })
    // The reveal throws the fire out across the courtyard in a ring; then it burns on its body.
    if (within(t, REVEAL, REVEAL + dt))
      for (let i = 0; i < 70; i++) {
        const a = r() * Math.PI * 2
        const v = r.range(80, 170)
        fire(F.x, F.y, Math.cos(a) * v, Math.sin(a) * v * 0.3, r.range(0.5, 0.9), r.int(2, 3))
      }
    if (t > REVEAL && t < REVEAL + 2.5 && r() < 0.8) {
      const sz = spriteSize(s.foe)
      fire(
        F.x + r.range(-sz.w * 0.4, sz.w * 0.4),
        F.y - r.range(sz.h * 0.5, sz.h),
        r.range(-6, 6),
        -r.range(20, 40),
        0.35,
        1,
      )
    }
  },
  back(g, s, t, k) {
    if (k <= 0) return
    const b = s.buf.g
    const F = s.L.foe
    const heat = heatAt(t)
    // The sky: a storm at night, red with the fire, then glaring with the eruptions.
    b.drawImage(s.night, 0, 0)
    dissolve(b, s.red, heat)
    dissolve(b, s.hot, 0.85 * span(t, VOLCANOES[0][4], VOLCANOES[3][4] + 0.2))
    // Lightning in the clouds, then the strike on the spire.
    if (within(t, T_GLINT, T_GLINT + 0.06) || within(t, T_GLINT + 0.1, T_GLINT + 0.14))
      b.drawImage(glow(34, '#26263e', 1.2, 0.9), 70, -24)
    if (within(t, T_BOLT, T_BOLT + 0.13)) {
      polyline(
        b,
        s.strike.map(([x, y]) => [x + 1, y] as [number, number]),
        '#8a7ad8',
        3,
      )
      polyline(b, s.strike, '#e8e8ff', 2)
      polyline(b, s.strike, '#ffffff', 1)
    }
    b.drawImage(s.range, 0, 0)
    eruptions(b, s, t)
    s.lava.draw(b)
    b.drawImage(s.court, 0, 0)
    // The fire's light on the wall and the flagstones: a warm pool, close in tone so its dither reads as light.
    const lit = q8(0.9 * heat)
    if (lit > 0) b.drawImage(glow(90, '#3a1a16', 1.1, lit), F.x - 90, BASE - 90)
    if (lit > 0) b.drawImage(glow(50, '#4e2216', 1.3, lit), F.x - 50, BASE - 50)
    // The smoke rises behind the tower and the ruin, black against the red.
    s.smoke.draw(b)
    if (t < T_CRASH + 0.05) drawTower(b, s, t)
    if (t > T_FALL + 0.1) dissolve(b, s.heap, span(t, T_FALL + 0.1, T_CRASH), F.x - 62, BASE + 4 - 26)
    drawHeapFire(b, s, t)
    // Ho-Oh's light in the ashes: the cracks glow gold, then white.
    const re = span(t, T_BEAM + 0.05, T_RISE + 0.2) * (1 - span(t, REVEAL + 0.5, REVEAL + 1.2))
    if (re > 0) {
      b.drawImage(glow(44, '#5a2412', 1.2, q8(re)), F.x - 44, BASE - 50)
      b.drawImage(glow(18, '#ffbe2e', 1.6, q8(0.8 * re)), F.x - 18, BASE - 22)
      for (const c of s.cracks) {
        const n = Math.round(c.length * Math.min(1, re * 1.5))
        polyline(b, c.slice(0, n), '#ff8a1e', 2)
        polyline(b, c.slice(0, n), re > 0.6 ? '#fff6c8' : '#ffe08a')
      }
    }
    drawShards(b, s.debris)
    if (t > T_SACRED) drawPillar(b, F, t)
    if (t > REVEAL) drawRingOfFire(b, F, t)
    b.drawImage(s.town, 0, 0)
    dissolve(b, s.townLit, heat)
    s.amb.draw(b)
    // The hush after the crash, darker, so the rainbow is the only light.
    const hush = 0.4 * span(t, T_CRASH + 0.25, T_HOOH + 0.25) * (1 - span(t, T_BEAM - 0.05, T_BEAM + 0.3))
    if (hush > 0) wash(b, '#05020a', hush, 8)
    drawHooh(b, s, t)
    s.feathers.draw(b)
    // The shake moves the whole place; nothing of the battle's ground shows at the edges.
    const sh = screenShake(t, s.shakes)
    if (sh.x || sh.y) rect(g, 0, 0, W, H, '#0a0606')
    dissolve(g, s.buf, k, sh.x, sh.y)
  },
  before(g, s, t) {
    if (t < T_RISE) return
    const F = s.L.foe
    const sz = spriteSize(s.foe)
    const sh = screenShake(t, s.shakes)
    // Climbing out of the ashes: drawn on its own canvas and cut at the ground. Then rearing as it roars.
    const q = ease.outC(span(t, T_RISE, T_UP))
    const fy = Math.round(F.y + (sz.h + 2) * (1 - q))
    const rear = pulse(t, T_ROAR, T_ROAR + 0.4)
    const sacred = t >= T_SACRED
    const roar = t >= T_ROAR
    const b = s.rise.g
    b.clearRect(0, 0, W, H)
    drawSprite(b, s.foe, F.x, fy, {
      sil: sacred ? '#2a0804' : '#140404',
      outline: sacred
        ? '#ffffff'
        : roar
          ? Math.floor(t * 20) % 2
            ? '#ffffff'
            : '#ffe08a'
          : Math.floor(t * 12) % 3
            ? '#ff8a1e'
            : '#ffe08a',
      sx: 1 + 0.03 * rear,
      sy: 1 + 0.07 * rear,
    })
    g.drawImage(s.rise, 0, 0, W, F.y + 1, sh.x, sh.y, W, F.y + 1)
    // The roar: rings of heat going out from its head.
    const hx = F.x + Math.round(sz.w * 0.1) + sh.x
    const hy = F.y - Math.round(sz.h * 0.8) + sh.y
    ;[FIRE[1], '#ffffff'].forEach((c, i) =>
      burstRing(g, hx, hy, span(t, T_ROAR + i * 0.14, T_ROAR + i * 0.14 + 0.55), 120, 2, c),
    )
  },
  front(g, _s, t) {
    // The flashes: the bolt, the crash, the great eruption (never closer than 0.34 s).
    if (within(t, T_BOLT, T_BOLT + 0.1)) screenFlash(g, '#e0e0ff', 0.55)
    if (within(t, T_CRASH, T_CRASH + 0.1)) screenFlash(g, '#ff8a1e', 0.3)
    if (within(t, VOLCANOES[3][4], VOLCANOES[3][4] + 0.1)) screenFlash(g, '#ff6a1e', 0.3)
  },
  sounds: [
    [
      0.05,
      () => (
        hiss(0.8, { freq: 260, type: 'lowpass', vol: 0.05 }),
        tone(49, 0.8, { type: 'sine', vol: 0.05 })
      ),
    ],
    [T_GLINT, () => tone(70, 0.3, { type: 'sine', vol: 0.06, slide: -20 })],
    [T_BOLT, () => (fxSound('thunder.strike'), hiss(0.4, { freq: 2400, slide: -2000, vol: 0.06 }))],
    [T_BOLT + 0.15, () => (fxSound('fire.stream'), hiss(1.6, { freq: 500, type: 'lowpass', vol: 0.06 }))],
    [1.25, () => fxSound('fire.stream')],
    [T_FALL - 0.25, () => tone(150, 0.35, { type: 'sawtooth', vol: 0.03, slide: -70 })],
    [T_FALL, () => tone(110, 0.45, { type: 'sawtooth', vol: 0.035, slide: -60 })],
    [
      T_CRASH,
      () => (
        fxSound('ug.collapse'),
        tone(45, 0.7, { type: 'sine', vol: 0.16, slide: -15 }),
        hiss(0.9, { freq: 200, type: 'lowpass', vol: 0.12 })
      ),
    ],
    [
      T_HOOH + 0.1,
      () =>
        [784, 988, 1175, 1568, 1976].forEach((f, i) =>
          tone(f, 0.3, { type: 'triangle', vol: 0.025, at: i * 0.07 }),
        ),
    ],
    [
      T_BEAM,
      () => (tone(392, 0.6, { type: 'sine', vol: 0.05, slide: 400 }), hiss(0.5, { freq: 3000, vol: 0.03 })),
    ],
    [T_RISE + 0.05, () => fxSound('legend.heart')],
    [T_RISE + 0.32, () => fxSound('legend.heart')],
    [T_ROAR, () => fxSound('legend.roar')],
    ...VOLCANOES.map(
      ([, , , , at, pw]) =>
        [
          at,
          () => (
            tone(40 + 20 * pw, 0.5, { type: 'sine', vol: 0.06 + 0.1 * pw, slide: -20 }),
            hiss(0.4 + 0.5 * pw, { freq: 180, type: 'lowpass', vol: 0.05 + 0.08 * pw })
          ),
        ] as const,
    ),
    [
      T_SACRED,
      () => (
        hiss(0.45, { freq: 500, slide: 2400, vol: 0.08 }),
        tone(220, 0.45, { type: 'sawtooth', vol: 0.03, slide: 440 })
      ),
    ],
    [
      REVEAL,
      () => (
        fxSound('fire.hit'),
        hiss(0.9, { freq: 220, type: 'lowpass', vol: 0.14 }),
        tone(55, 0.6, { type: 'sine', vol: 0.14, slide: -15 })
      ),
    ],
  ],
})

/** How far the tower has sunk into its own ruin (px): nothing, then faster and faster. */
const sinkAt = (t: number) => 104 * ease.inC(span(t, T_FALL + 0.12, T_CRASH))

/** The tower with its fires, sinking and leaning as it falls: row by row, each row pushed over by the lean. */
function drawTower(g: G, s: X & { L: { foe: { x: number } } }, t: number) {
  const b = s.tb.g
  b.clearRect(0, 0, TW, TH)
  b.drawImage(s.tower, 0, 0)
  TIERS.forEach((tr, i) => {
    const f = ease.outQ(span(t, ignite(i), ignite(i) + 0.45))
    if (f <= 0) return
    // Its windows lit from inside, flames licking out of them up the wall.
    for (const [wx, wy, ww, wh, ti] of s.windows) {
      if (ti !== i) continue
      rect(b, wx, wy, ww, wh, FIRE[f > 0.6 ? 2 : 4]!)
      rect(b, wx + 1, wy + 1, 1, wh - 2, FIRE[flick(wx, t) > 0.5 ? 0 : 1]!)
      for (let k = 0; k < ww; k++) tongue(b, wx + k, wy - 1, Math.round(f * 5 * flick(wx + k, t)))
    }
    // The roof's flames: tall over its ridge, lower out to the eaves.
    const top = roofTop(i)
    for (let x = -tr.rw; x <= tr.rw; x++) {
      const ax = Math.abs(x)
      const hb = ax <= top ? tr.r1 : tr.r1 - ((tr.r1 - tr.b1) * (ax - top)) / (tr.rw - top)
      const h = Math.round(f * (3 + 8 * flick(x + i * 37, t)) * (1 - 0.6 * (ax / tr.rw) ** 2))
      tongue(b, TC + x, Math.round(TB - hb) - 1, h)
    }
  })
  // The struck spire: white-hot for an instant, then a torch.
  const sp = span(t, T_BOLT, T_BOLT + 0.3)
  if (sp > 0) {
    if (sp < 1) rect(b, TC - 1, TB - SPIRE - 1, 2, SPIRE - 78, sp < 0.4 ? '#ffffff' : '#ffbe2e')
    for (let x = -2; x <= 2; x++) tongue(b, TC + x, TB - SPIRE + 4, Math.round(10 * sp * flick(x + 90, t)))
  }
  const ox = s.L.foe.x - TC
  if (t < T_FALL - 0.3) return void g.drawImage(s.tb, ox, OY)
  // It groans and sways; its upper tiers snap off at the second roof and topple over, and the rest sinks into the
  // fire at its foot. Row by row: each pushed over by the lean, the broken part turned about the break.
  const sink = sinkAt(t)
  const sway = Math.sin(t * 40) * 1.5 * pulse(t, T_FALL - 0.35, T_FALL + 0.05)
  const lean = -10 * ease.inQ(span(t, T_FALL, T_CRASH))
  const tip = 1.25 * ease.inQ(span(t, T_FALL, T_FALL + 0.42))
  for (let y = 0; y < TH; y++) {
    const hb = TB - y
    const u = hb / SPIRE
    const above = Math.max(0, hb - TIERS[2].b0)
    const dx = lean * u * u + sway * u - above * Math.sin(tip) - (above ? 14 * tip : 0)
    const dy = Math.round(y + OY + sink + above * (1 - Math.cos(tip)) + (above ? 26 * tip * tip : 0))
    if (dy <= BASE + 2) g.drawImage(s.tb, 0, y, TW, 1, ox + Math.round(dx), dy, TW, 1)
  }
}

/** The ruin's fire: high when it falls, dying down in the hush, flaring again as the beast climbs out. */
const heapFire = (t: number) =>
  t < T_FALL + 0.15
    ? 0
    : span(t, T_FALL + 0.15, T_CRASH) * (1 - 0.75 * span(t, T_CRASH + 0.1, T_BEAM)) +
      (0.5 * span(t, T_RISE, T_UP) + 0.5 * pulse(t, T_ROAR, T_ROAR + 0.5)) *
        (1 - span(t, T_SACRED, T_SACRED + 0.2))

function drawHeapFire(g: G, s: X & { L: { foe: { x: number } } }, t: number) {
  const f = heapFire(t)
  if (f <= 0) return
  const x0 = s.L.foe.x - 62
  for (let i = 0; i < s.heapTop.length; i++) {
    const u = Math.abs(i - 62) / 62
    const h = Math.round(f * (2 + 10 * flick(i * 3, t)) * (1 - u * u))
    tongue(g, x0 + i, s.heapTop[i]!, h)
  }
}

/** The volcanoes: each crater a dull ember, then blown open: a flash, a fountain of fire, lava down its flanks. */
function eruptions(g: G, s: X, t: number) {
  VOLCANOES.forEach((v, i) => {
    const [x, py, cw, , at, pw] = v
    // Asleep, a dull red over the crater; awake, the sky over it lit and a white-hot mouth.
    const R = pw > 0.9 ? 36 : 22
    g.drawImage(glow(R, '#7a2412', 1.2, q8(0.3 + 0.7 * span(t, at, at + 0.25))), x - R, py - R + 2)
    if (t < at) return
    // The summit lit from inside, brightest at the rim, the glow creeping down; lava finding its way down the flanks.
    const sm = s.summits[i]!
    const cap = Math.round(sm.height * ease.outQ(span(t, at, at + 0.6)))
    if (cap > 0) g.drawImage(sm, 0, 0, sm.width, cap, x - (sm.width >> 1), py, sm.width, cap)
    s.flows[i]!.forEach((fl, j) => {
      const n = Math.max(1, Math.round(fl.length * span(t, at + 0.05 * j, at + 1.1 + 0.3 * j)))
      polyline(g, fl.slice(0, n), '#c8401a')
      const [hx, hy] = fl[n - 1]!
      rect(g, hx, hy, 1, 1, '#ffe08a')
    })
    g.drawImage(glow(12, '#ffbe2e', 1.4, q8(1 - 0.5 * span(t, at, at + 0.4))), x - 12, py - 10)
    // Its ash climbing over it: dark dithered billows, rising and spreading with the wind.
    const ash = span(t, at + 0.1, at + 0.5)
    if (ash > 0)
      for (let k = 0; k < 6; k++) {
        const ph = ((t - at) * 34 + k * 10) % 60
        const rr = Math.round(3 + ph * 0.22 * (0.6 + pw))
        ellipse(
          g,
          x + ph * 0.35,
          py - 14 - ph * 1.1,
          rr,
          Math.round(rr * 0.8),
          pattern(g, '#1a080c', 13 * ash),
        )
      }
    // The fountain: a jet straight up into the sky as it blows, then a fan of molten rock thrown out of the crater,
    // white at its root, red and broken at its top.
    const jet = ease.outC(span(t, at, at + 0.12)) * (1 - 0.55 * ease.ioS(span(t, at + 0.12, at + 0.6)))
    const h = Math.round((py + 8) * jet * (0.9 + 0.1 * Math.sin(t * 13 + i)))
    const spread = (pw > 0.9 ? 30 : 9 + 8 * pw) * ease.outQ(span(t, at + 0.05, at + 0.5))
    for (let k = 0; k < h; k++) {
      const y = py - k
      const e = k / h
      const w = cw + e * spread + Math.sin(y * 0.5 + t * 20) * 1.5
      const wr = Math.round(w)
      for (let dx = -wr; dx <= wr; dx++) {
        const u = Math.abs(dx) / (w + 0.5)
        if ((1 - e * e) * (1 - u * u) * 1.7 < bayer(x + dx, y + Math.floor(t * 30))) continue
        rect(
          g,
          x + dx,
          y,
          1,
          1,
          FIRE[clamp(Math.floor(e * 3.4 + u * 2.2 + bayer(x + dx + 1, y) * 1.2), 0, 6)]!,
        )
      }
    }
  })
}

/** Where Ho-Oh is along its flight (u 0..1 crosses the sky): swooping lowest over the ashes at PASS. */
const hoohAt = (u: number, fx: number) => ({
  x: fx + (u - PASS) * 276,
  y: 30 - 22 * ((u - PASS) / 0.72) ** 2,
})

/** Ho-Oh crossing the sky: a gold glow, a little bird of fire, a rainbow streaming behind it; its light on the ruin. */
function drawHooh(g: G, s: X & { L: { foe: { x: number; y: number } } }, t: number) {
  const F = s.L.foe
  const u = (t - T_HOOH) / HOOH_DUR
  if (u <= 0 || u > 1.5) return
  // The rainbow behind it: six bands thinning out towards the tail.
  const n = 30
  for (let j = n; j > 0; j--) {
    const ua = Math.max(0, u - (j / n) * 0.34)
    const ub = Math.max(0, u - ((j - 1) / n) * 0.34)
    if (ub <= 0 || ua === ub) continue
    const a = hoohAt(ua, F.x)
    const c = hoohAt(Math.min(ub, 1.5), F.x)
    const keep = Math.ceil(6 * (1 - j / n) + 0.5)
    BOW.forEach((col, i) => {
      if (i < (6 - keep) / 2 || i >= 6 - (6 - keep) / 2) return
      line(g, a.x, a.y + i - 3, c.x, c.y + i - 3, col)
    })
  }
  // Its light falling on the ruin as it passes over.
  const bq = span(t, T_BEAM - 0.04, T_BEAM + 0.08) * (1 - span(t, T_BEAM + 0.3, T_BEAM + 0.48))
  if (bq > 0) drawBeam(g, F.x, hoohAt(PASS, F.x).y + 4, BASE - 12, bq)
  if (u > 1.2) return
  const at = hoohAt(u, F.x)
  const x = Math.round(at.x)
  const y = Math.round(at.y)
  g.drawImage(glow(12, '#fff3a0', 1.4, 0.75), x - 12, y - 12)
  const up = Math.sin(t * 24) > 0
  line(g, x - 4, y + 1, x - 14, y + 3, '#ffd23a')
  line(g, x - 4, y + 2, x - 12, y + 6, '#ff8a1e')
  rect(g, x - 15, y + 3, 2, 1, '#7ac74c')
  rect(g, x - 13, y + 6, 2, 1, '#7ac74c')
  ellipse(g, x, y + 1, 4, 2, '#e0403a')
  rect(g, x - 2, y + 2, 4, 1, '#fff6c8')
  rect(g, x + 4, y - 1, 3, 2, '#e0403a')
  rect(g, x + 7, y, 2, 1, '#ffd23a')
  rect(g, x + 4, y - 3, 1, 2, '#ffd23a')
  if (up) {
    tri(g, x - 3, y, x + 3, y, x - 7, y - 9, '#ffd23a')
    tri(g, x - 1, y, x + 3, y, x + 1, y - 7, '#ff8a1e')
  } else {
    tri(g, x - 3, y + 1, x + 3, y + 1, x - 8, y + 8, '#ffd23a')
    tri(g, x - 1, y + 1, x + 3, y + 1, x - 2, y + 7, '#ff8a1e')
  }
}

/** A shaft of Ho-Oh's light: a gold core with a white heart, rainbow down both edges. */
function drawBeam(g: G, x: number, y0: number, y1: number, k: number) {
  const hw = Math.max(1, Math.round(9 * k))
  const yb = Math.round(lerp(y0, y1, Math.min(1, k * 1.5)))
  g.fillStyle = pattern(g, '#fff3a0', 6 + 6 * k)
  g.fillRect(x - hw, y0, hw * 2 + 1, yb - y0)
  rect(g, x - 1, y0, 3, yb - y0, '#ffffff')
  BOW.forEach((c, i) => {
    rect(g, x - hw - 6 + i, y0, 1, yb - y0, pattern(g, c, 8 + 6 * k))
    rect(g, x + hw + 6 - i, y0, 1, yb - y0, pattern(g, c, 8 + 6 * k))
  })
  g.drawImage(glow(24, '#fff6c8', 1.3, q8(0.8 * k)), x - 24, yb - 24)
}

/** Sacred Fire: a pillar of white-gold flame round it, ragged edges in every colour; the reveal blows it into the sky. */
function drawPillar(g: G, F: { x: number; y: number }, t: number) {
  const grow = ease.outBack(span(t, T_SACRED, T_SACRED + 0.18))
  const gone = span(t, REVEAL, REVEAL + 0.35)
  const hw = 40 * grow * (1 - gone)
  if (hw < 1) return
  const top = Math.round(lerp(F.y, -6, ease.outQ(span(t, T_SACRED, T_SACRED + 0.14))))
  const bot = Math.round(F.y + 3 - (t > REVEAL ? (t - REVEAL) * 480 : 0))
  for (let y = Math.max(0, top); y < bot; y++) {
    const e = Math.sin(y * 0.35 + t * 40) * 2 + Math.sin(y * 0.13 - t * 23) * 2.5
    const w = hw + e
    rect(g, F.x - w - 2, y, (w + 2) * 2 + 1, 1, BOW[Math.floor(y / 3 + t * 20) % 6]!)
    rect(g, F.x - w, y, w * 2 + 1, 1, FIRE[3])
    rect(g, F.x - w * 0.75, y, w * 1.5 + 1, 1, FIRE[2])
    rect(g, F.x - w * 0.5, y, w + 1, 1, FIRE[1])
    rect(g, F.x - w * 0.25 - 1, y, w * 0.5 + 3, 1, FIRE[0])
  }
  if (t < REVEAL) {
    ellipse(g, F.x, F.y + 2, Math.round(hw * 1.5), 5, FIRE[2])
    ellipse(g, F.x, F.y + 2, Math.round(hw * 1.1), 3, FIRE[0])
  }
}

/** The reveal's ring of fire racing out over the flagstones, then dying down. */
function drawRingOfFire(g: G, F: { x: number; y: number }, t: number) {
  const q = ease.outC(span(t, REVEAL, REVEAL + 0.5))
  const die = 1 - span(t, REVEAL + 0.5, REVEAL + 1.5)
  if (die <= 0) return
  const R = 10 + 100 * q
  const n = Math.min(140, Math.round(R * 1.3) + 12)
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const sn = Math.sin(a)
    // The courtyard is shallow behind it: the far side of the ring hugs the wall, the near side comes at us.
    const x = Math.round(F.x + Math.cos(a) * R)
    const y = Math.round(F.y + 3 + sn * (sn < 0 ? Math.min(R * 0.2, 6) : R * 0.3))
    const h = Math.round(die * (sn < 0 ? 0.6 : 1) * (3 + 7 * flick(i * 5, t)))
    tongue(g, x, y, h)
    tongue(g, x + 1, y, Math.max(0, h - 2))
  }
}
