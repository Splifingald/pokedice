// Terapagos's raid entrance (docs/53): the depths of Area Zero. A cavern of dark rock under the crater, stalactites,
// giant Terastal crystals growing out of the walls and the floor, motes of light rising, a floor of crystal tiles. A
// heartbeat; the crystals wake one by one, each in its own Tera colour and its own chime, and veins of light run over
// the floor from each to the middle. There a shell of crystal builds itself tile by tile, a honeycomb sphere glowing
// brighter, its cracks leaking rainbow light, until it shatters into a Tera Starstorm: a turning star of every
// colour, its rays sweeping the cavern. It stands in the middle, a ring of stellar light round it.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  bolt,
  canvas,
  ease,
  glow,
  lerp,
  line,
  pattern,
  polyline,
  rect,
  span,
  type Canvas,
  type G,
  type Rng,
} from '../../pixel'
import { drawSprite } from '../../sprites'
import { screenFlash, within } from '../../timeline'
import { hexagon, q4, raidScene, type Ctx } from './gen9kit'
import { burstRing, dGradient, drawShards, makeShard, stepShards, tri, type Shard } from './kit'

const BEAT = [0.35, 0.95] as const
/** The crystals waking, quickening. */
const CHIMES = [1.0, 1.3, 1.55, 1.78, 1.98, 2.15, 2.3] as const
const T_SHELL = 2.45
const T_FULL = 3.4
const T_CRACK = 3.55
const T_STORM = 3.95
const REVEAL = 4.5

const AURA = ['#ffffff', '#c8f0ff', '#4ab0ff', '#1a2a6a'] as const
/** Tera colours, each a ramp: deep, mid, bright. */
const TERA = [
  ['#7a1a4a', '#ff4a9a', '#ffc8e0'],
  ['#7a5a0a', '#ffd23a', '#fff3b0'],
  ['#0a5a4a', '#2af0c0', '#c0fff0'],
  ['#0a3a7a', '#3aa0ff', '#c0e8ff'],
  ['#4a1a7a', '#a050ff', '#e0c8ff'],
  ['#7a2a0a', '#ff7a2a', '#ffd8b0'],
  ['#2a5a0a', '#8ae02a', '#e0ffb0'],
] as const
const STELLAR = ['#ff4a6a', '#ffa83a', '#ffe84a', '#4ae07a', '#3ac8ff', '#6a6aff', '#c84aff'] as const

type Cluster = {
  x: number
  y: number
  s: number
  prisms: { dx: number; h: number; w: number; lean: number }[]
}

type X = {
  cave: Canvas
  clusters: Cluster[]
  veins: [number, number][][]
  tiles: { x: number; y: number; at: number; c: number }[]
  shards: Shard[]
}

function layout(c: Ctx) {
  const floor = Math.round(c.h * 0.58)
  const R = Math.round(Math.max(Math.max(c.sz.w, c.sz.h) * 0.62 + 6, c.m * 0.2))
  return { floor, R, cy: c.mid }
}

/** The cavern, drawn once: its back wall, rock either side, stalactites, the crystal floor's tiles. */
function cavern(c: Ctx, r: Rng): Canvas {
  const L = layout(c)
  const cv = canvas(c.w, c.h)
  const g = cv.g
  g.drawImage(dGradient(c.w, L.floor + 2, ['#02030a', '#060a1a', '#0c1428', '#121c34']), 0, 0)
  // Glints far off in the back wall: crystals too deep to wake.
  for (let i = 0; i < c.w * 0.3; i++)
    rect(g, r.range(0, c.w), r.range(c.h * 0.1, L.floor), 1, 1, r.pick(['#1a2a4a', '#2a2a5a', '#3a4a7a']))
  // Rock walls closing in either side, ragged.
  for (const side of [-1, 1])
    for (let y = 0; y < c.h; y++) {
      const wd = Math.round(
        c.w * 0.14 +
          Math.sin(y / 9 + side) * 6 +
          Math.sin(y / 3.1) * 2 +
          (y > L.floor ? (y - L.floor) * 0.3 : 0),
      )
      const x = side < 0 ? 0 : c.w - wd
      rect(g, x, y, wd, 1, '#05070e')
      rect(g, side < 0 ? wd - 1 : x, y, 1, 1, '#1a2238')
    }
  // Stalactites.
  for (let i = 0; i < Math.round(c.w / 12); i++) {
    const x = r.range(0, c.w)
    const len = r.range(8, c.h * 0.16)
    const hw = r.range(3, 6)
    tri(g, x - hw, -1, x + hw, -1, x + r.range(-1, 1), len, '#070a14')
    line(g, x - hw, 0, x, len, '#1a2238')
  }
  // The crystal floor: dark, hexagonal tiles in perspective, nearer bigger.
  g.drawImage(dGradient(c.w, c.h - L.floor, ['#0c1630', '#101c3a', '#142244']), 0, L.floor)
  rect(g, 0, L.floor, c.w, 1, '#2a3a6a')
  for (let row = 0; row < 8; row++) {
    const k = (row + 1) / 8
    const y = Math.round(L.floor + (c.h - L.floor) * k * k)
    const hr = Math.round(4 + k * 14)
    for (let x = (row % 2) * hr - hr; x < c.w + hr; x += hr * 2)
      hexagon(g, Math.round(c.cx + (x - c.cx)), y, hr, '#1e2c52', 0.32)
  }
  return cv
}

/** Crystal clusters on the walls and the floor's edges, each a few faceted prisms. */
function clusterSet(c: Ctx, r: Rng): Cluster[] {
  const L = layout(c)
  const spots: [number, number, number][] = [
    [0.08, 0.3, 0.8],
    [0.92, 0.22, 0.7],
    [0.14, L.floor / c.h + 0.02, 1.1],
    [0.86, L.floor / c.h + 0.04, 1.2],
    [0.3, L.floor / c.h - 0.01, 0.7],
    [0.7, L.floor / c.h - 0.01, 0.75],
    [0.5, 0.06, 0.6],
  ]
  return spots.map(([fx, fy, s]) => ({
    x: Math.round(c.w * fx),
    y: Math.round(c.h * fy),
    s: s * (c.m > 200 ? 1.3 : 1),
    prisms: Array.from({ length: 4 }, (_, i) => ({
      dx: (i - 1.5) * r.range(4, 7),
      h: r.range(10, 26),
      w: r.range(4, 7),
      lean: (i - 1.5) * r.range(0.15, 0.35),
    })),
  }))
}

/** A cluster: dim slate until its chime, then its Tera colour, facets lit, a glow round it. */
function drawCluster(
  g: G,
  cl: Cluster,
  lit: number,
  col: readonly [string, string, string],
  t: number,
  i: number,
) {
  const hang = cl.y < 60 && cl.x > 0 && i === 6
  if (lit > 0) {
    const gr = Math.round(22 * cl.s)
    const flick = 0.45 + 0.15 * Math.sin(t * 5 + i)
    g.drawImage(glow(gr, col[1], 1.4, q4(flick * lit)), cl.x - gr, cl.y - Math.round(10 * cl.s) - gr)
  }
  for (const p of cl.prisms) {
    const h = p.h * cl.s * (hang ? -1 : 1)
    const w = Math.round(p.w * cl.s)
    const bx = cl.x + p.dx * cl.s
    const tx = bx + p.lean * Math.abs(h)
    const ty = cl.y - h
    const body = lit > 0 ? col[1] : '#1e2a48'
    const face = lit > 0 ? col[2] : '#3a4a72'
    const dark = lit > 0 ? col[0] : '#101830'
    // Two faces of a hexagonal prism, its pointed tip.
    tri(g, bx - w, cl.y, bx + w, cl.y, tx, ty, body)
    tri(g, bx - w, cl.y, bx, cl.y, tx, ty, face)
    line(g, bx + w, cl.y, tx, ty, dark)
    line(g, bx, cl.y, tx, ty, lit > 0.5 ? '#ffffff' : face)
  }
}

/** The shell's tiles: a honeycomb filling a disc round its middle, built from the edge in, in a spiral. */
function tileSet(c: Ctx): X['tiles'] {
  const L = layout(c)
  const hr = Math.max(4, Math.round(L.R / 6))
  const out: X['tiles'] = []
  const dx = hr * Math.sqrt(3)
  const dy = hr * 1.5
  for (let row = -Math.ceil(L.R / dy); row <= Math.ceil(L.R / dy); row++)
    for (let col = -Math.ceil(L.R / dx) - 1; col <= Math.ceil(L.R / dx) + 1; col++) {
      const x = col * dx + (row % 2 ? dx / 2 : 0)
      const y = row * dy
      const d = Math.hypot(x, y)
      if (d > L.R - hr * 0.5) continue
      const a = Math.atan2(y, x)
      // Outer first, swept round: the shell closing in on it.
      const q = (1 - d / L.R) * 0.75 + (((a + Math.PI) / (Math.PI * 2)) % 1) * 0.25
      out.push({
        x: c.cx + x,
        y: L.cy + y,
        at: lerp(T_SHELL, T_FULL, q),
        c: Math.floor(((a + Math.PI) / (Math.PI * 2)) * 7) % 7,
      })
    }
  return out
}

export const terapagosCinema = raidScene<X>({
  id: 'cinema-terapagos',
  reveal: REVEAL,
  seed: 1024,
  aura: AURA,
  flash: '#f0f8ff',
  feet: 0.62,
  rays: '#8ab0ff',
  setup(c, r) {
    const L = layout(c)
    const clusters = clusterSet(c, r)
    return {
      cave: cavern(c, r),
      clusters,
      // A vein of light from each cluster's foot over the floor to the middle.
      veins: clusters.map((cl) => bolt(r, cl.x, Math.max(cl.y, L.floor + 2), c.cx, c.feet + 2, 0.18, 4)),
      tiles: tileSet(c),
      shards: [],
    }
  },
  step(c, s, t, dt) {
    const r = s.r
    const L = layout(c)
    stepShards(s.shards, dt, { g: 60, floor: c.h + 20 })
    // Motes rising from the floor, in Tera colours once the crystals wake.
    if (r() < 0.35 * c.many) {
      const k = r.int(0, 6)
      s.fx.add({
        x: r.range(c.w * 0.1, c.w * 0.9),
        y: r.range(L.floor, c.h),
        vy: -r.range(6, 16),
        life: r.range(1.5, 3),
        size: 1,
        shape: 'px',
        colors: t > CHIMES[0] ? [TERA[k]![2], TERA[k]![1], TERA[k]![0]] : ['#3a4a7a', '#2a3a5a'],
      })
    }
    // Each chime: a burst of sparks off its crystal.
    CHIMES.forEach((at, i) => {
      if (t >= at && t - dt < at) {
        const cl = s.clusters[i]!
        for (let k = 0; k < 14 * c.many; k++)
          s.fx.add({
            x: cl.x,
            y: cl.y - 10 * cl.s,
            vx: r.range(-40, 40),
            vy: r.range(-50, 20),
            drag: 2,
            life: r.range(0.4, 0.8),
            size: 1,
            shape: k % 3 ? 'px' : 'star',
            colors: ['#ffffff', TERA[i]![2], TERA[i]![1]],
          })
      }
    })
    // The shell shatters: hexagonal shards of every colour.
    if (t >= T_STORM && t - dt < T_STORM)
      for (const tl of s.tiles) {
        if (s.r() > 0.6 * c.many + 0.2) continue
        const sh = makeShard(r, tl.x, tl.y, r.range(120, 240), TERA[tl.c]![1], TERA[tl.c]![2], 0.2)
        const a = Math.atan2(tl.y - L.cy, tl.x - c.cx)
        sh.vx = Math.cos(a) * r.range(120, 240)
        sh.vy = Math.sin(a) * r.range(120, 240)
        sh.r = r.range(2, 4.5)
        s.shards.push(sh)
      }
    // The stellar ring turning round it after the reveal.
    if (t > REVEAL && r() < 0.8 * c.many) {
      const a = t * 2.5 + r() * 0.3
      s.fx.add({
        x: c.cx + Math.cos(a) * L.R * 0.95,
        y: c.feet - 2 + Math.sin(a) * L.R * 0.25,
        vy: -r.range(5, 15),
        life: 0.7,
        size: r.int(1, 2),
        shape: 'star',
        colors: [STELLAR[Math.floor(r() * 7)]!, '#ffffff'],
      })
    }
  },
  back(g, c, s, t) {
    const L = layout(c)
    g.drawImage(s.cave, 0, 0)
    // A dim pulse with the heartbeat before anything wakes.
    for (const b of BEAT) {
      const k = span(t, b, b + 0.4)
      if (k > 0 && k < 1) {
        const gr = Math.round(c.m * 0.35)
        g.drawImage(glow(gr, '#1a2a5a', 1.2, q4(0.6 * (1 - k))), c.cx - gr, L.cy - gr)
      }
    }
    // The veins: drawn out from each crystal as it wakes, pulsing in its colour.
    s.veins.forEach((v, i) => {
      const at = CHIMES[i]!
      const q = span(t, at + 0.05, at + 0.5)
      if (q <= 0) return
      const n = Math.max(2, Math.round(v.length * q))
      polyline(g, v.slice(0, n), TERA[i]![0], 3)
      polyline(g, v.slice(0, n), Math.floor(t * 8 + i) % 3 ? TERA[i]![1] : TERA[i]![2])
    })
    s.clusters.forEach((cl, i) => drawCluster(g, cl, span(t, CHIMES[i]!, CHIMES[i]! + 0.15), TERA[i]!, t, i))
    // The shell: tile by tile, each a hexagon of crystal, lit edge, its colour by its angle round the sphere.
    if (t >= T_SHELL && t < T_STORM) {
      const hr = Math.max(4, Math.round(L.R / 6))
      const bright = span(t, T_FULL - 0.2, T_STORM)
      const gr = Math.round(L.R * 1.4)
      g.drawImage(glow(gr, '#4ab0ff', 1.3, q4(0.3 + 0.5 * bright)), c.cx - gr, L.cy - gr)
      for (const tl of s.tiles) {
        if (t < tl.at) continue
        const pop = span(t, tl.at, tl.at + 0.1)
        const col = TERA[tl.c]!
        const rr = Math.max(1, Math.round(hr * lerp(0.4, 1, pop)) - 1)
        for (let dy = -rr; dy <= rr; dy++) {
          const hw = Math.round(
            rr * 0.87 * (1 - (Math.max(0, Math.abs(dy) - rr * 0.5) / (rr * 0.5 + 0.01)) * 0.5),
          )
          rect(
            g,
            tl.x - hw,
            tl.y + dy,
            hw * 2 + 1,
            1,
            dy < -rr * 0.3 ? col[2] : bright > 0.6 ? col[2] : col[1],
          )
        }
        hexagon(g, tl.x, tl.y, rr + 1, pop < 1 ? '#ffffff' : col[0])
      }
      // Cracks across the full shell, rainbow light leaking from them.
      const cq = span(t, T_CRACK, T_STORM)
      if (cq > 0)
        for (let k = 0; k < 5; k++) {
          const a = k * 1.26 + 0.4
          const len = L.R * cq
          line(
            g,
            c.cx,
            L.cy,
            c.cx + Math.cos(a) * len,
            L.cy + Math.sin(a) * len,
            Math.floor(t * 20 + k) % 2 ? '#ffffff' : STELLAR[k]!,
            2,
          )
        }
    }
    // The Tera Starstorm: a turning star of rainbow rays from its middle.
    const sq = span(t, T_STORM, REVEAL + 0.8)
    if (sq > 0 && sq < 1) {
      const len = Math.max(c.w, c.h) * ease.outC(Math.min(1, sq * 2.5))
      const fade = 1 - span(sq, 0.6, 1)
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2 + t * 0.8
        const col = STELLAR[k % 7]!
        const ex = c.cx + Math.cos(a) * len
        const ey = L.cy + Math.sin(a) * len
        const px = -Math.sin(a) * 6
        const py = Math.cos(a) * 6
        tri(g, c.cx, L.cy, ex + px, ey + py, ex - px, ey - py, pattern(g, col, 12 * fade))
        if (k % 2 === 0) line(g, c.cx, L.cy, ex, ey, fade > 0.5 ? '#ffffff' : col)
      }
    }
  },
  before(g, c, _s, t) {
    // Inside the shell, a shape curled small; out of the storm, itself.
    if (t >= T_SHELL && t < T_FULL)
      drawSprite(g, c.mon, c.cx, c.feet, { sx: 0.7, sy: 0.7, sil: '#0a1430', outline: '#4ab0ff' })
    if (t >= T_STORM) {
      const q = ease.outBack(span(t, T_STORM, REVEAL))
      drawSprite(g, c.mon, c.cx, c.feet, {
        sx: lerp(0.7, 1, q),
        sy: lerp(0.7, 1, q),
        sil: '#ffffff',
        outline: STELLAR[Math.floor(t * 20) % 7],
      })
    }
  },
  front(g, c, s, t) {
    const L = layout(c)
    drawShards(g, s.shards)
    // The stellar ring at its feet once it is here.
    if (t > REVEAL) {
      const rx = Math.round(L.R * 0.95)
      const ry = Math.max(3, Math.round(L.R * 0.25))
      for (let k = 0; k < 28; k++) {
        const a = (k / 28) * Math.PI * 2 + t * 2.5
        if (Math.sin(a) < 0) continue
        rect(g, c.cx + Math.cos(a) * rx, c.feet - 2 + Math.sin(a) * ry, 2, 1, STELLAR[k % 7]!)
      }
    }
    for (const [i, at] of CHIMES.entries()) {
      const cl = s.clusters[i]!
      burstRing(g, cl.x, cl.y - 10 * cl.s, span(t, at, at + 0.4), 30, 1, TERA[i]![2])
    }
    burstRing(g, c.cx, L.cy, span(t, T_FULL, T_FULL + 0.4), L.R * 1.6, 2, '#c8f0ff')
    if (within(t, T_STORM, T_STORM + 0.15)) screenFlash(g, '#f0e8ff', 0.5)
  },
  shakes: () => [
    [T_CRACK, 0.4, 2],
    [T_STORM, 0.5, 4],
  ],
  sounds: () => [
    ...BEAT.map((b) => [b, () => tone(55, 0.35, { type: 'sine', vol: 0.12 })] as const),
    // Each crystal's chime: a glassy note up a bright scale.
    ...CHIMES.map(
      (at, i) =>
        [
          at,
          () => (
            tone([1047, 1175, 1319, 1568, 1760, 2093, 2349][i]!, 0.6, { type: 'sine', vol: 0.035 }),
            tone([1047, 1175, 1319, 1568, 1760, 2093, 2349][i]! * 2, 0.3, { type: 'triangle', vol: 0.012 })
          ),
        ] as const,
    ),
    [T_SHELL, () => hiss(1, { freq: 4000, vol: 0.025, slide: 2000 })],
    ...[0, 1, 2, 3, 4, 5].map(
      (i) => [T_SHELL + i * 0.15, () => tone(2637 + i * 200, 0.05, { type: 'square', vol: 0.01 })] as const,
    ),
    [T_FULL, () => fxSound('legend.heart')],
    [T_CRACK, () => (hiss(0.15, { freq: 6000, vol: 0.05 }), tone(1900, 0.08, { type: 'square', vol: 0.02 }))],
    [
      T_STORM,
      () => (
        fxSound('legend.shatter'),
        [1568, 1976, 2349, 3136, 3951].forEach((f, i) =>
          tone(f, 0.3, { type: 'sine', vol: 0.03, at: i * 0.05 }),
        )
      ),
    ],
    [T_STORM + 0.1, () => hiss(0.8, { freq: 1500, vol: 0.06, slide: 3000 })],
  ],
})
