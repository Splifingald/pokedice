// The Loyal Three's raid entrances (docs/53): Kitakami's Loyalty Plaza at night. Mt. Oni black against the stars,
// mist in the valley, fireflies, two stone lanterns lit, and on its pedestal the hero's statue (its own shape in stone)
// between two lesser ones. Toxic chains burst out of the flagstones, slither in from every side and coil up the statue;
// its cracks glow, the mist turns violet. Then each its own:
// - Okidogi: the statue cracks, once, twice, three times, and bursts; it leaps from the pedestal and slams the plaza,
//   the flagstones jumping in a ring and a crown of poison splashing up round it.
// - Munkidori: eyes open in the dark all round the plaza, a hypnotic spiral turns in the sky behind the statue, and
//   its shape blinks from place to place, nearer each time, until it is before the statue.
// - Fezandipiti: a great train of feathers fans open behind the statue, eye after eye, glitter drifting off it; a
//   shimmer runs out along every feather, and the fan bursts into sparkles.
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
  mix,
  polyline,
  rect,
  rng,
  span,
  wash,
  type Canvas,
  type G,
  type Rng,
} from '../../pixel'
import { drawSprite } from '../../sprites'
import { screenFlash, within } from '../../timeline'
import { chain, moon, q4, raidScene, ridge, stars, type Base, type Ctx } from './gen9kit'
import {
  burstRing,
  dGradient,
  drawShards,
  makeShard,
  pulse,
  stepShards,
  type Cinema,
  type Shard,
} from './kit'

const T_CHAINS = 1.15
const T_WRAP = 2.2
const T_SIG = 2.8
const REVEAL = 4.5

const TOXIC = { dark: '#3a1448', lit: '#e070e8', glow: '#b040d0' }
const STONE = { lit: '#9a98a0', mid: '#6a6872', dark: '#3a3842', ink: '#1a1a20' }

type X = {
  sky: Canvas
  plaza: Canvas
  chains: [number, number][][]
  shards: Shard[]
  cracks: [number, number][][]
  eyes: { x: number; y: number; at: number }[]
  /** Its statue is gone (burst, or crumbled on the reveal). */
  broken: boolean
}

interface Sig {
  setup?(c: Ctx, r: Rng, s: X): void
  step?(c: Ctx, s: Base & X, t: number, dt: number): void
  back?(g: G, c: Ctx, s: Base & X, t: number): void
  /** On the plaza, under it. */
  floor?(g: G, c: Ctx, s: Base & X, t: number): void
  front?(g: G, c: Ctx, s: Base & X, t: number): void
  /** Its shape before the reveal, if the signature shows it. */
  before?(g: G, c: Ctx, s: Base & X, t: number): void
  /** When its statue goes. */
  breakAt: number
  shakes?: () => [number, number, number][]
  sounds: readonly (readonly [number, () => void])[]
}

function layout(c: Ctx) {
  const horizon = Math.round(c.h * 0.47)
  // The statue: its own shape at 0.8 on a pedestal behind where it will stand.
  const ped = Math.round(c.feet - Math.max(12, c.h * 0.05))
  const sw = Math.round(c.sz.w * 0.8)
  const sh = Math.round(c.sz.h * 0.8)
  return { horizon, ped, sw, sh, head: ped - sh, mid: ped - (sh >> 1) }
}

/** The sky: stars, the moon, Mt. Oni and the hills, a band of mist. */
function skyArt(c: Ctx, r: Rng): Canvas {
  const L = layout(c)
  const cv = canvas(c.w, L.horizon + 4)
  const g = cv.g
  g.drawImage(dGradient(c.w, L.horizon + 4, ['#04040c', '#0a0c1e', '#141a30', '#22283e']), 0, 0)
  stars(g, r, c.w, L.horizon * 0.7, Math.round(c.w * 0.35), '#e8f0ff', '#4a5a7a')
  moon(
    g,
    Math.round(c.w * 0.8),
    Math.round(c.h * 0.1),
    Math.max(5, Math.round(c.m * 0.045)),
    '#f0ecd8',
    '#c8c0a0',
    '#4a5a7a',
  )
  // Mt. Oni: one great peak, its top split in two horns.
  const px = Math.round(c.w * 0.3)
  const top = Math.round(L.horizon - c.h * 0.24)
  const hw = Math.round(c.h * 0.36)
  for (let y = top; y < L.horizon + 4; y++) {
    const k = (y - top) / (L.horizon - top)
    // Craggy: its flanks notched, the moon catching its right side.
    const ww = Math.round(hw * Math.pow(k, 0.8) + Math.sin(y / 3) * 1.2 + Math.sin(y / 7) * 2 * k)
    rect(g, px - ww, y, ww * 2, 1, '#0c1024')
    if (k < 0.6) rect(g, px + Math.round(ww * 0.3), y, Math.round(ww * 0.7), 1, '#141c36')
    if (k < 0.15) rect(g, px - ww, y, ww * 2, 1, '#2a3450')
  }
  for (const d of [-3, 3]) rect(g, px + d - 1, top - 4, 3, 5, '#2a3450')
  ridge(g, c.w, L.horizon, c.h * 0.04, '#0a0c16', 1014, L.horizon + 4, 0.4)
  // Mist lying in the valley.
  for (let x = 0; x < c.w; x += 2) rect(g, x, L.horizon - 3 + ((x >> 3) % 2), 2, 1, '#3a4258')
  return cv
}

/** The plaza: flagstones in perspective, the pedestals, the stone lanterns, a fence of trees at the back. */
function plazaArt(c: Ctx): Canvas {
  const L = layout(c)
  const cv = canvas(c.w, c.h)
  const g = cv.g
  // Trees behind the plaza.
  for (let x = -4; x < c.w + 4; x += 7) {
    const th = 10 + ((x * 13) % 9)
    ellipse(g, x, L.horizon + 2 - th / 2, 6, Math.round(th / 2), '#081008')
    rect(g, x - 2, L.horizon + 2 - th + 2, 2, 2, '#14241a')
  }
  // The grass of the hillside, blades taller nearer.
  g.drawImage(dGradient(c.w, c.h - L.horizon - 4, ['#0e1a12', '#14241a', '#1a2e1e']), 0, L.horizon + 4)
  const r = rng(1015)
  for (let i = 0; i < c.w * 1.2; i++) {
    const x = r.range(0, c.w)
    const y = r.range(L.horizon + 6, c.h)
    const k = (y - L.horizon) / (c.h - L.horizon)
    const bh = 1 + Math.round(k * 4)
    rect(g, x, y - bh, 1, bh, k > 0.5 ? '#24402a' : '#1a3020')
  }
  // The plaza: a raised round of flagstones about the statues, its rim lit.
  const prx = Math.round(Math.min(c.w * 0.5, 150))
  const pry = Math.round(Math.max(10, prx * 0.2))
  const py = c.feet + 6
  ellipse(g, c.cx, py + 2, prx, pry, '#16161e')
  ellipse(g, c.cx, py, prx, pry, '#3a3a46')
  for (let k = 1; k < 4; k++)
    ellipseLine(g, c.cx, py, Math.round((prx * k) / 4), Math.round((pry * k) / 4), '#2a2a34')
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2
    line(
      g,
      c.cx + Math.cos(a) * prx * 0.25,
      py + Math.sin(a) * pry * 0.25,
      c.cx + Math.cos(a) * prx,
      py + Math.sin(a) * pry,
      '#2a2a34',
    )
  }
  ellipseLine(g, c.cx, py, prx, pry, '#5a5a66', Math.PI, Math.PI * 2)
  // A stone path down the hill towards us, narrowing to the plaza.
  for (let y = py + pry - 1; y < c.h; y++) {
    const k = (y - py) / (c.h - py)
    const hw = Math.round(lerp(10, Math.min(c.w * 0.22, 60), k))
    rect(g, c.cx - hw, y, hw * 2, 1, '#34343e')
    rect(g, c.cx - hw, y, 1, 1, '#16161e')
    rect(g, c.cx + hw - 1, y, 1, 1, '#16161e')
    if ((y - py) % Math.max(3, Math.round(3 + k * 9)) === 0) rect(g, c.cx - hw, y, hw * 2, 1, '#22222a')
  }
  // The side statues' pedestals and their worn figures: the other two heroes, faceless with age.
  for (const side of [-1, 1]) {
    const x = Math.round(c.cx + side * Math.min(c.w * 0.36, 110))
    const top = Math.round(L.ped + 6)
    const pw = 16
    rect(g, x - pw / 2, top, pw, 12, STONE.mid)
    rect(g, x - pw / 2, top, pw, 1, STONE.lit)
    rect(g, x - pw / 2 - 2, top + 12, pw + 4, 3, STONE.dark)
    ellipse(g, x, top - 12, 7, 11, STONE.dark)
    ellipse(g, x - 1, top - 13, 6, 10, STONE.mid)
    ellipse(g, x - 1, top - 24, 5, 5, STONE.mid)
    rect(g, x - 5, top - 26, 2, 4, STONE.lit)
    rect(g, x - 6, top - 14, 1, 8, STONE.lit)
  }
  // The hero's pedestal: tall, a plaque on its face, steps at its foot.
  const pw = Math.max(24, Math.round(L.sw * 0.7))
  rect(g, c.cx - pw / 2, L.ped, pw, c.feet - L.ped + 4, STONE.mid)
  rect(g, c.cx - pw / 2, L.ped, pw, 2, STONE.lit)
  rect(g, c.cx - pw / 2, L.ped, 1, c.feet - L.ped + 4, STONE.lit)
  rect(g, c.cx + pw / 2 - 1, L.ped, 1, c.feet - L.ped + 4, STONE.dark)
  rect(g, c.cx - 6, L.ped + 4, 12, 4, STONE.dark)
  rect(g, c.cx - pw / 2 - 4, c.feet + 4, pw + 8, 3, STONE.dark)
  rect(g, c.cx - pw / 2 - 4, c.feet + 4, pw + 8, 1, STONE.mid)
  // Stone lanterns between the statues.
  for (const side of [-1, 1]) {
    const x = Math.round(c.cx + side * Math.min(c.w * 0.21, 70))
    const yb = c.feet + 8
    rect(g, x - 1, yb - 14, 3, 14, STONE.mid)
    rect(g, x - 3, yb - 20, 7, 6, STONE.mid)
    rect(g, x - 1, yb - 19, 3, 3, '#ffcf6a')
    rect(g, x - 4, yb - 22, 9, 2, STONE.lit)
    rect(g, x - 3, yb - 1, 7, 2, STONE.dark)
  }
  return cv
}

/** The toxic chains' paths: in from the edges over the flagstones to the pedestal, then coiled up the statue. */
function chainPaths(c: Ctx, r: Rng): [number, number][][] {
  const L = layout(c)
  const starts: [number, number][] = [
    [-6, c.h * 0.78],
    [c.w + 6, c.h * 0.84],
    [-6, c.h * 0.95],
    [c.w + 6, c.h * 0.68],
    [c.cx + r.range(-20, 20), c.h + 6],
  ]
  return starts.map(([x0, y0], i) => {
    const pts: [number, number][] = []
    const ex = c.cx + (i - 2) * 4
    const ey = c.feet + 2
    // Slithering in: a sine across its way.
    for (let k = 0; k <= 24; k++) {
      const q = k / 24
      const x = lerp(x0, ex, q)
      const y = lerp(y0, ey, q)
      const nx = -(ey - y0)
      const ny = ex - x0
      const nl = Math.hypot(nx, ny) || 1
      const wv = Math.sin(q * Math.PI * 3 + i) * 8 * (1 - q)
      pts.push([x + (nx / nl) * wv, y + (ny / nl) * wv])
    }
    // Two of them then coil up the statue; the rest hold it down at its foot.
    if (i > 1) return pts
    const turns = 1.25
    for (let k = 1; k <= 20; k++) {
      const q = k / 20
      const a = q * turns * Math.PI * 2 + i * 1.3
      pts.push([c.cx + Math.cos(a) * L.sw * 0.45, L.ped - q * L.sh * 0.8 + Math.sin(a) * 4])
    }
    return pts
  })
}

function loyal(id: string, seed: number, aura: readonly [string, string, string, string], sig: Sig): Cinema {
  return raidScene<X>({
    id,
    reveal: REVEAL,
    seed,
    aura,
    feet: 0.62,
    rays: aura[2],
    flash: aura[1],
    setup(c, r) {
      const s: X = {
        sky: skyArt(c, r),
        plaza: plazaArt(c),
        chains: chainPaths(c, r),
        shards: [],
        cracks: [],
        eyes: [],
        broken: false,
      }
      const L = layout(c)
      s.cracks = Array.from({ length: 4 }, () =>
        bolt(
          r,
          c.cx + r.range(-L.sw * 0.3, L.sw * 0.3),
          L.head + r.range(0, L.sh * 0.3),
          c.cx + r.range(-L.sw * 0.3, L.sw * 0.3),
          L.ped - r.range(0, L.sh * 0.2),
          0.4,
          3,
        ),
      )
      sig.setup?.(c, r, s)
      return s
    },
    step(c, s, t, dt) {
      const r = s.r
      const L = layout(c)
      stepShards(s.shards, dt, { floor: c.feet + 6 })
      // Fireflies over the plaza, until the poison comes.
      if (t < T_WRAP && r() < 0.15 * c.many)
        s.fx.add({
          x: r.range(0, c.w),
          y: r.range(L.horizon, c.h * 0.9),
          vx: r.range(-6, 6),
          vy: r.range(-6, 2),
          life: r.range(1, 2),
          size: 1,
          shape: 'px',
          colors: ['#3a4a1a', '#d0ff7a', '#fff6a0', '#d0ff7a', '#3a4a1a'],
        })
      // Each chain bursting up out of the stones where it starts.
      if (t >= T_CHAINS && t - dt < T_CHAINS)
        for (const p of s.chains)
          for (let k = 0; k < 8 * c.many; k++)
            s.fx.add({
              x: Math.min(c.w - 2, Math.max(2, p[0]![0])),
              y: p[0]![1],
              vx: r.range(-40, 40),
              vy: -r.range(30, 80),
              ay: 200,
              life: 0.6,
              size: 1,
              shape: 'sq',
              colors: [STONE.lit, STONE.mid],
            })
      // Poison bubbling up round the pedestal once it is wrapped.
      if (t > T_WRAP && t < REVEAL + 1 && r() < 0.4 * c.many)
        s.fx.add({
          x: c.cx + r.range(-L.sw * 0.5, L.sw * 0.5),
          y: c.feet + 4,
          vy: -r.range(8, 20),
          life: r.range(0.6, 1.2),
          size: r.int(1, 2),
          shape: 'bubble',
          colors: ['#e070e8', '#b040d0', '#5a1a6a'],
        })
      // The statue goes: stone everywhere.
      const at = sig.breakAt
      if (t >= at && t - dt < at) {
        s.broken = true
        for (let k = 0; k < 44 * c.many + 12; k++) {
          const sh = makeShard(
            r,
            c.cx + r.range(-L.sw * 0.4, L.sw * 0.4),
            r.range(L.head, L.ped),
            r.range(90, 200),
            r() < 0.5 ? STONE.mid : STONE.dark,
            STONE.lit,
            0.8,
          )
          sh.r = r.range(1.5, 4)
          s.shards.push(sh)
        }
      }
      sig.step?.(c, s, t, dt)
    },
    back(g, c, s, t) {
      const L = layout(c)
      g.drawImage(s.sky, 0, 0)
      sig.back?.(g, c, s, t)
      g.drawImage(s.plaza, 0, 0)
      // The lanterns' light, and the mist turning violet once the chains have it.
      for (const side of [-1, 1]) {
        const x = Math.round(c.cx + side * Math.min(c.w * 0.21, 70))
        const lit = t < T_WRAP + 0.3 || Math.floor(t * 9 + side) % 4 ? 1 : 0
        if (lit) g.drawImage(glow(14, '#ffcf6a', 1.4, 0.4), x - 14, c.feet - 26)
      }
      const toxic = span(t, T_WRAP, T_SIG)
      if (toxic > 0) wash(g, '#3a0a48', 0.25 * toxic * (1 - span(t, REVEAL, REVEAL + 1)), 8)
      // The statue: its own shape in stone, lit on one side, its cracks glowing violet.
      if (!s.broken) {
        const jit = within(t, sig.breakAt - 0.6, sig.breakAt) ? Math.round(Math.sin(t * 90)) : 0
        drawSprite(g, c.mon, c.cx + jit - 1, L.ped - 1, { sx: 0.8, sy: 0.8, sil: STONE.lit })
        drawSprite(g, c.mon, c.cx + jit, L.ped, {
          sx: 0.8,
          sy: 0.8,
          sil: STONE.mid,
          outline: toxic > 0 && Math.floor(t * 6) % 2 ? TOXIC.glow : STONE.ink,
        })
        const cq = span(t, T_WRAP + 0.2, T_SIG + 0.4)
        if (cq > 0)
          s.cracks.forEach((cr) => {
            const n = Math.max(2, Math.round(cr.length * cq))
            polyline(
              g,
              cr.slice(0, n).map(([x, y]) => [x + jit, y] as [number, number]),
              Math.floor(t * 10) % 3 ? TOXIC.lit : '#ffffff',
            )
          })
      }
      // The chains: their heads slithering in, then coiling up.
      const reach = span(t, T_CHAINS, T_WRAP + 0.5)
      if (reach > 0 && (!s.broken || t < sig.breakAt + 0.05)) {
        if (toxic > 0) {
          const gr = Math.round(L.sw * 0.7)
          g.drawImage(glow(gr, TOXIC.glow, 1.3, q4(0.5 * toxic)), c.cx - gr, L.mid - gr)
        }
        // Once it has the statue, the chains over the stones sink back into them, tail first; the coils hold.
        const sink = Math.round(25 * ease.inQ(span(t, T_SIG, T_SIG + 0.7)))
        for (const p of s.chains) {
          const n = Math.max(2, Math.round(p.length * ease.outQ(reach)))
          if (sink < 24) chain(g, p.slice(sink, Math.min(n, 25)), TOXIC.dark, TOXIC.lit, t * 30, true)
          if (n > 25) chain(g, p.slice(24, n), TOXIC.dark, TOXIC.lit, t * 30)
        }
      }
      // Its broken links lying about once the statue has gone.
      if (s.broken) drawShards(g, s.shards, STONE.ink)
      sig.floor?.(g, c, s, t)
    },
    before(g, c, s, t) {
      sig.before?.(g, c, s, t)
    },
    front(g, c, s, t) {
      sig.front?.(g, c, s, t)
    },
    shakes: () => [[T_CHAINS, 0.3, 2], ...(sig.shakes?.() ?? [])],
    sounds: () => [
      // Crickets in the warm night.
      ...[0.3, 0.55, 0.9, 1.05].map(
        (at) => [at, () => tone(4200, 0.05, { type: 'square', vol: 0.008 })] as const,
      ),
      [0.2, () => tone(147, 2.6, { type: 'triangle', vol: 0.025 })],
      [T_CHAINS, () => (hiss(0.4, { freq: 300, type: 'lowpass', vol: 0.1 }), fxSound('legend.pulse'))],
      ...[0, 1, 2, 3, 4].map(
        (i) =>
          [T_CHAINS + 0.1 + i * 0.18, () => tone(220 + i * 30, 0.08, { type: 'square', vol: 0.02 })] as const,
      ),
      [T_WRAP, () => tone(98, 1.2, { type: 'sawtooth', vol: 0.03, slide: 50 })],
      [T_WRAP + 0.4, () => fxSound('legend.heart')],
      [sig.breakAt, () => (fxSound('legend.shatter'), hiss(0.5, { freq: 500, vol: 0.08 }))],
      ...sig.sounds,
    ],
  })
}

// ---------------------------------------------------------------------------------------------- Okidogi

const OKI_CRACKS = [2.9, 3.2, 3.42] as const
const T_BURST = 3.6
const T_SLAM = 3.98
const POISON = ['#e8ff8a', '#a8f040', '#5ac020', '#2a6a10'] as const

/** Its leap off the pedestal: up out of the burst, over, down onto the plaza. */
function okiLeap(c: Ctx, t: number) {
  const L = layout(c)
  const q = span(t, T_BURST, T_SLAM)
  return {
    x: c.cx,
    y: lerp(L.ped, c.feet, ease.inQ(q)) - Math.sin(q * Math.PI) * c.h * 0.12,
    s: lerp(0.8, 1, q),
  }
}

const okidogiSig: Sig = {
  breakAt: T_BURST,
  step(c, s, t, dt) {
    const r = s.r
    // The slam: a crown of poison splashing up round it, drops raining.
    if (t >= T_SLAM && t - dt < T_SLAM)
      for (let k = 0; k < 70 * c.many + 10; k++) {
        const a = r() * Math.PI * 2
        const rr = r.range(8, 22)
        s.fx.add({
          x: c.cx + Math.cos(a) * rr * 1.6,
          y: c.feet + Math.sin(a) * rr * 0.4,
          vx: Math.cos(a) * r.range(30, 90),
          vy: -r.range(80, 200),
          ay: 380,
          life: r.range(0.6, 1.1),
          size: r.int(1, 2),
          shape: r() < 0.6 ? 'drop' : 'sq',
          colors: [...POISON],
        })
      }
  },
  floor(g, c, _s, t) {
    // The pool of poison spreading under it from the slam, its surface rippling.
    const q = ease.outC(span(t, T_SLAM, T_SLAM + 0.5))
    if (q <= 0) return
    const rx = Math.round(Math.min(c.w * 0.3, 80) * q)
    const ry = Math.max(2, Math.round(rx * 0.24))
    ellipse(g, c.cx, c.feet + 4, rx + 2, ry + 1, '#1a3a0a')
    ellipse(g, c.cx, c.feet + 3, rx, ry, '#3a8a14')
    ellipse(g, c.cx - 2, c.feet + 2, Math.max(1, rx - 6), Math.max(1, ry - 2), '#5ac020')
    for (const k of [0.35, 0.7]) {
      const rr = Math.round(rx * ((k + t * 0.4) % 1))
      if (rr > 3) ellipseLine(g, c.cx, c.feet + 3, rr, Math.max(1, Math.round(rr * 0.24)), '#a8f040')
    }
    rect(g, c.cx - Math.round(rx * 0.5), c.feet + 3 - ry + 1, Math.round(rx * 0.3), 1, '#e8ff8a')
  },
  front(g, c, _s, t) {
    // The flagstones jumping in a ring as the shock runs out.
    for (const [d, col] of [
      [0, '#e8ff8a'],
      [0.1, '#a8f040'],
    ] as const) {
      const k = span(t, T_SLAM + d, T_SLAM + d + 0.6)
      if (k > 0 && k < 1) {
        const rx = Math.round(lerp(10, c.w * 0.8, ease.outC(k)))
        const lift = Math.round(Math.sin(k * Math.PI) * 4)
        // A row of stones lifted on the wave's front.
        for (let a = 0; a < Math.PI * 2; a += 0.22) {
          const x = c.cx + Math.cos(a) * rx
          const y = c.feet + 3 + Math.sin(a) * rx * 0.22 - lift
          rect(g, x - 3, y, 6, 2, STONE.mid)
          rect(g, x - 3, y, 6, 1, STONE.lit)
        }
        ellipseLine(g, c.cx, c.feet + 3, rx, Math.max(2, Math.round(rx * 0.22)), col)
      }
    }
    burstRing(g, c.cx, c.mid, span(t, T_BURST, T_BURST + 0.5), c.m * 0.8, 3, STONE.lit)
    if (within(t, T_SLAM, T_SLAM + 0.15)) screenFlash(g, '#e8ff8a', 0.4)
  },
  before(g, c, _s, t) {
    if (t < T_BURST) return
    const f = t < T_SLAM ? okiLeap(c, t) : { x: c.cx, y: c.feet, s: 1 }
    const crouch = t >= T_SLAM ? ease.outQ(span(t, T_SLAM, T_SLAM + 0.3)) : 1
    drawSprite(g, c.mon, Math.round(f.x), Math.round(f.y), {
      sx: f.s * lerp(1.15, 1, crouch),
      sy: f.s * lerp(0.82, 1, crouch),
      sil: '#0c140a',
      outline: Math.floor(t * 14) % 2 ? '#a8f040' : '#e8ff8a',
    })
  },
  shakes: () => [
    ...OKI_CRACKS.map((at, i) => [at, 0.2, 1 + i] as [number, number, number]),
    [T_BURST, 0.3, 3],
    [T_SLAM, 0.6, 6],
  ],
  sounds: [
    ...OKI_CRACKS.map(
      (at, i) =>
        [
          at,
          () => (
            hiss(0.12, { freq: 2500 - i * 400, vol: 0.06 + i * 0.02 }),
            tone(90 - i * 10, 0.2, { type: 'square', vol: 0.04 })
          ),
        ] as const,
    ),
    [T_BURST + 0.05, () => tone(160, 0.4, { type: 'sawtooth', vol: 0.06, slide: 120 })],
    [
      T_SLAM,
      () => (
        fxSound('impact.hit'),
        hiss(0.7, { freq: 180, type: 'lowpass', vol: 0.16 }),
        tone(48, 0.6, { type: 'sine', vol: 0.12 })
      ),
    ],
    [T_SLAM + 0.1, () => hiss(0.5, { freq: 1600, vol: 0.05 })],
  ],
}

export const okidogiCinema = loyal(
  'cinema-okidogi',
  1014,
  ['#ffffff', '#d8ff8a', '#6ad02a', '#1a3a10'],
  okidogiSig,
)

// ---------------------------------------------------------------------------------------------- Munkidori

const T_EYES = 2.85
const T_SPIRAL = 3.2
/** Where its shape blinks in: [time, x share, y share of the band, scale]. */
const BLINKS: readonly [number, number, number, number][] = [
  [3.55, 0.18, 0.3, 0.55],
  [3.78, 0.84, 0.15, 0.62],
  [3.98, 0.3, 0.75, 0.75],
  [4.16, 0.72, 0.6, 0.85],
]

/** The hypnotic spiral: two arms turning, violet and yellow, wound round its middle. */
function drawSpiral(g: G, x: number, y: number, R: number, t: number, k: number) {
  if (k <= 0) return
  const gr = Math.round(R * k)
  g.drawImage(glow(gr, '#2a0a3a', 1, 0.9), x - gr, y - gr)
  // One arm wound four times, its colour changing every quarter turn: the eye follows it in.
  const turns = 4
  let prev: [number, number] | null = null
  for (let a = 0; a < Math.PI * 2 * turns; a += 0.12) {
    const rr = (a / (Math.PI * 2 * turns)) * R * k
    const ang = a - t * 5
    const p: [number, number] = [x + Math.cos(ang) * rr, y + Math.sin(ang) * rr * 0.8]
    if (prev)
      line(g, prev[0], prev[1], p[0], p[1], Math.floor(a / (Math.PI / 2)) % 2 ? '#ffe040' : '#b050e0', 3)
    prev = p
  }
}

const munkidoriSig: Sig = {
  breakAt: REVEAL,
  setup(c, r, s) {
    const L = layout(c)
    // Eyes in the dark round the plaza: in the trees, the mist, over the far statues.
    s.eyes = Array.from({ length: 12 }, (_, i) => ({
      x: Math.round(r.range(8, c.w - 8)),
      y: Math.round(r.range(c.h * 0.12, L.horizon + 18)),
      at: T_EYES + i * 0.05 + r.range(0, 0.1),
    }))
  },
  back(g, c, s, t) {
    const L = layout(c)
    const k = ease.outBack(span(t, T_SPIRAL, T_SPIRAL + 0.6)) * (1 - span(t, REVEAL - 0.1, REVEAL + 0.2))
    drawSpiral(g, c.cx, L.mid - 8, Math.max(c.w, c.h) * 0.5, t, Math.max(0, k))
    // The eyes: opening, blinking, shut again as it comes.
    for (const e of s.eyes) {
      if (t < e.at || t > REVEAL) continue
      const open = span(t, e.at, e.at + 0.12)
      const blink = Math.floor(t * 3 + e.x) % 7 === 0
      if (blink) continue
      const hh = open < 1 ? 1 : 3
      g.drawImage(glow(6, '#ffe040', 1.6, 0.4), e.x - 6, e.y - 5)
      rect(g, e.x - 4, e.y, 3, hh, '#ffe040')
      rect(g, e.x + 2, e.y, 3, hh, '#ffe040')
      if (open >= 1) {
        rect(g, e.x - 3, e.y + 1, 1, 2, '#1a0a1a')
        rect(g, e.x + 3, e.y + 1, 1, 2, '#1a0a1a')
      }
    }
  },
  before(g, c, _s, t) {
    // Blinking from place to place, a flash where it lands, afterimages trailing.
    const band = { y0: c.h * 0.22, y1: c.h * 0.6 }
    for (let i = 0; i < BLINKS.length; i++) {
      const [at, fx, fy, sc] = BLINKS[i]!
      const end = BLINKS[i + 1]?.[0] ?? REVEAL - 0.1
      if (t < at || t >= end) continue
      const x = Math.round(c.w * fx)
      const y = Math.round(lerp(band.y0, band.y1, fy) + c.sz.h * sc * 0.5)
      const q = span(t, at, at + 0.08)
      drawSprite(g, c.mon, x, y, {
        sx: sc * lerp(0.4, 1, q),
        sy: sc * lerp(1.6, 1, q),
        sil: '#14081e',
        outline: Math.floor(t * 20) % 2 ? '#ffe040' : '#b050e0',
        ghost: [
          { dx: -4, color: '#b050e0', a: 0.6 },
          { dx: 4, color: '#ffe040', a: 0.4 },
        ],
      })
    }
    // Last: in the spiral's eye, before the statue.
    if (t >= REVEAL - 0.1) drawSprite(g, c.mon, c.cx, c.feet, { sil: '#14081e', outline: '#ffe040' })
  },
  front(g, c, _s, t) {
    for (const [at, fx, fy, sc] of BLINKS) {
      const x = Math.round(c.w * fx)
      const y = Math.round(lerp(c.h * 0.22, c.h * 0.6, fy))
      burstRing(g, x, y, span(t, at, at + 0.3), 30 * sc + 10, 2, '#e070e8')
    }
    burstRing(g, c.cx, c.mid, span(t, REVEAL - 0.1, REVEAL + 0.2), 40, 2, '#ffe040')
  },
  sounds: [
    ...[0, 1, 2, 3].map(
      (i) => [T_EYES + i * 0.12, () => tone(1800 + i * 200, 0.04, { type: 'sine', vol: 0.025 })] as const,
    ),
    [T_SPIRAL, () => (fxSound('psychic.focus'), tone(330, 1.2, { type: 'sine', vol: 0.03, slide: -160 }))],
    ...BLINKS.map(
      ([at], i) =>
        [
          at,
          () => (
            hiss(0.08, { freq: 3000, vol: 0.05 }),
            tone(500 + i * 120, 0.08, { type: 'square', vol: 0.025, slide: 300 })
          ),
        ] as const,
    ),
    [3.9, () => tone(70, 0.6, { type: 'sawtooth', vol: 0.04 })],
  ],
}

export const munkidoriCinema = loyal(
  'cinema-munkidori',
  1015,
  ['#ffffff', '#ffe870', '#b050e0', '#3a1050'],
  munkidoriSig,
)

// ---------------------------------------------------------------------------------------------- Fezandipiti

const T_FAN = 2.85
const FEATHERS = 13
const T_SHIMMER = 3.85
const FEZ = { teal: '#2ab0a0', gold: '#e8c050', pink: '#e05aa0', dark: '#2a1030', pale: '#ffd0f0' }

/** One feather of the train: a shaft, barbs widening to an eye near its tip. */
function drawFeather(g: G, x: number, y: number, a: number, len: number, lit: number) {
  const ux = Math.cos(a)
  const uy = Math.sin(a)
  const px = -uy
  const py = ux
  for (let d = 4; d < len; d++) {
    const q = d / len
    const wd = Math.round(lerp(1, 5, Math.min(1, q * 1.6)) * (q > 0.92 ? (1 - q) / 0.08 : 1))
    const fx = x + ux * d
    const fy = y + uy * d
    for (let k = -wd; k <= wd; k++)
      rect(
        g,
        fx + px * k,
        fy + py * k,
        1,
        1,
        Math.abs(k) === wd
          ? q > 0.5
            ? FEZ.gold
            : FEZ.dark
          : q < 0.35
            ? '#4a1a5a'
            : q < 0.65
              ? '#2a6a6a'
              : '#1e8a7a',
      )
  }
  line(g, x + ux * 4, y + uy * 4, x + ux * len * 0.95, y + uy * len * 0.95, '#6a3a7a')
  // The eye: dark, teal, gold, a pink heart; flashing white as the shimmer passes.
  const ex = x + ux * len * 0.8
  const ey = y + uy * len * 0.8
  ellipse(g, ex, ey, 5, 5, FEZ.dark)
  ellipse(g, ex, ey, 4, 4, lit > 0.5 ? '#ffffff' : FEZ.teal)
  ellipse(g, ex, ey, 2, 2, lit > 0.5 ? FEZ.pale : FEZ.gold)
  rect(g, ex, ey, 1, 1, FEZ.pink)
}

const fezandipitiSig: Sig = {
  breakAt: REVEAL,
  step(c, s, t) {
    const r = s.r
    const L = layout(c)
    // Glitter shaken off the train, and petals.
    if (t > T_FAN + 0.3 && t < REVEAL + 1.5 && r() < 0.8 * c.many) {
      const a = Math.PI + r() * Math.PI
      const d = r.range(10, Math.min(c.w * 0.5, c.h * 0.38))
      s.fx.add({
        x: c.cx + Math.cos(a) * d,
        y: L.mid + Math.sin(a) * d,
        vx: r.range(-8, 8),
        vy: r.range(6, 18),
        life: r.range(0.8, 1.6),
        size: r.int(1, 2),
        shape: r() < 0.3 ? 'heart' : 'star',
        colors: r() < 0.5 ? [FEZ.pale, FEZ.pink, '#6a2a5a'] : ['#ffffff', '#a8f0e8', FEZ.teal],
      })
    }
    // The fan bursting into sparkles on the reveal.
    if (t >= REVEAL && t - 1 / 60 < REVEAL)
      for (let k = 0; k < FEATHERS * 6 * c.many; k++) {
        const a = Math.PI + r() * Math.PI
        const d = r.range(10, Math.min(c.w * 0.5, c.h * 0.38))
        s.fx.add({
          x: c.cx + Math.cos(a) * d,
          y: L.mid + Math.sin(a) * d,
          vx: Math.cos(a) * r.range(30, 80),
          vy: Math.sin(a) * r.range(30, 80),
          drag: 2,
          life: r.range(0.6, 1.2),
          size: 2,
          shape: 'star',
          colors: ['#ffffff', FEZ.pale, FEZ.teal, FEZ.pink],
        })
      }
  },
  back(g, c, _s, t) {
    const L = layout(c)
    if (t < T_FAN || t >= REVEAL) return
    const len = Math.round(Math.min(c.w * 0.5, c.h * 0.38))
    const ox = c.cx
    const oy = L.mid
    const gr = Math.round(len * 0.9)
    g.drawImage(glow(gr, '#5a1a5a', 1.2, 0.6), ox - gr, oy - gr)
    // Fanned open one by one from the middle out, each swinging from upright to its place.
    for (let i = 0; i < FEATHERS; i++) {
      const order = Math.abs(i - (FEATHERS - 1) / 2)
      const q = ease.outBack(span(t, T_FAN + order * 0.07, T_FAN + order * 0.07 + 0.35))
      if (q <= 0) continue
      const target = Math.PI + (i / (FEATHERS - 1)) * Math.PI
      const a = lerp(-Math.PI / 2, target, q)
      const lit = span(t, T_SHIMMER + order * 0.05, T_SHIMMER + order * 0.05 + 0.12)
      drawFeather(g, ox, oy, a, Math.round(len * lerp(0.5, 1, Math.min(1, q))), lit > 0 && lit < 1 ? 1 : 0)
    }
  },
  front(g, c, _s, t) {
    const L = layout(c)
    burstRing(g, c.cx, L.mid, span(t, T_SHIMMER, T_SHIMMER + 0.6), Math.min(c.w, c.h) * 0.7, 2, FEZ.pale)
    const k = pulse(t, T_SHIMMER - 0.05, T_SHIMMER + 0.4)
    if (k > 0) screenFlash(g, mix(FEZ.pink, '#ffffff', 0.4), 0.15 * k)
  },
  sounds: [
    ...Array.from(
      { length: 7 },
      (_, i) =>
        [T_FAN + i * 0.07, () => tone(880 + i * 110, 0.12, { type: 'triangle', vol: 0.025 })] as const,
    ),
    [T_FAN + 0.2, () => hiss(0.8, { freq: 2500, vol: 0.03, slide: 1500 })],
    [
      T_SHIMMER,
      () =>
        [1319, 1568, 1976, 2637].forEach((f, i) => tone(f, 0.25, { type: 'sine', vol: 0.03, at: i * 0.06 })),
    ],
  ],
}

export const fezandipitiCinema = loyal(
  'cinema-fezandipiti',
  1016,
  ['#ffffff', '#ffd0f0', '#e05aa0', '#3a1040'],
  fezandipitiSig,
)
