// The Paradox Pokémon's raid entrances (docs/53): two, each shared by its kind, built to look right whatever comes
// out (only its own sprite is drawn, at its own size).
// - The ancient ones (Walking Wake, Gouging Fire, Raging Bolt): the deep jungle of Area Zero, tree ferns and hanging
//   vines in an amber haze, shafts of light, a giant dragonfly. The air ripples; a hairline of amber light splits it,
//   then tears open like burning paper, and through the tear is the far past: a red sky, a volcano erupting, winged
//   reptiles. A shape walks towards us out of that world, growing, steps through, and the tear snaps shut behind it in
//   shards of amber.
// - The future ones (Iron Leaves, Iron Boulder, Iron Crown): a chrome corridor of the time machine, circuits in its
//   panels. Its lights come on down the corridor, data races along the traces, the gate at the end lights segment by
//   segment; a scan sweeps the corridor and the picture glitches. A rift opens in the gate, white, data pouring into
//   it, and it is printed in front of us line by line: a wireframe climbing, the light filling it, a scan beam
//   throwing sparks; the rift collapses to a point.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  canvas,
  ease,
  ellipse,
  glow,
  lerp,
  line,
  pattern,
  polyline,
  rect,
  rng,
  shade,
  span,
  type Canvas,
  type G,
  type Rng,
} from '../../pixel'
import { drawSprite } from '../../sprites'
import { screenFlash, within } from '../../timeline'
import { hexagon, q4, raidScene, ridge, type Ctx } from './gen9kit'
import { burstRing, dGradient, drawShards, makeShard, stepShards, tri, wobble, type Shard } from './kit'

// ---------------------------------------------------------------------------------------------- the past

const A_RIPPLE = 1.2
const A_CRACK = 1.7
const A_TEAR = 2.3
const A_WALK = 3.0
const A_OUT = 3.95
const A_SHUT = 4.1
const A_REVEAL = 4.5

const AMBER = ['#fff0c0', '#ffc85a', '#e08a1e', '#7a3a0a'] as const

type PastX = {
  jungle: Canvas
  front: Canvas
  past: Canvas
  edge: number[]
  shards: Shard[]
  fly: { x: number; y: number }
}

function pastLayout(c: Ctx) {
  // The tear: tall, over where it will stand, its widest at its middle.
  const top = Math.round(Math.max(c.h * 0.14, c.feet - c.sz.h - 30))
  const bottom = c.feet + 6
  const half = Math.round(Math.min(c.w * 0.36, Math.max(28, c.sz.w * 0.75)))
  return { top, bottom, half, ground: c.feet + 4 }
}

/** The jungle, drawn once: haze, trunks fading into it, tree ferns, vines, the forest floor. */
function jungleArt(c: Ctx, r: Rng): Canvas {
  const P = pastLayout(c)
  const cv = canvas(c.w, c.h)
  const g = cv.g
  g.drawImage(dGradient(c.w, c.h, ['#0e140a', '#1a2410', '#2e3614', '#3a3a16', '#1a200c']), 0, 0)
  // Far trunks, pale in the haze; nearer ones darker.
  for (const [n, col, wd] of [
    [Math.round(c.w / 16), '#3a3a1a', 3],
    [Math.round(c.w / 30), '#1a200e', 6],
  ] as const)
    for (let i = 0; i < n; i++) {
      const x = r.range(0, c.w)
      const w = wd + r.int(0, 3)
      rect(g, x, 0, w, P.ground + 4, col)
      rect(g, x, 0, 1, P.ground + 4, wd > 4 ? '#3a3a1a' : '#4a4a22')
    }
  // Tree ferns at the clearing's edge, their crowns spread.
  for (let x = r.range(-4, 10); x < c.w + 6; x += r.range(c.w * 0.18, c.w * 0.3)) {
    const top = Math.round(P.ground - r.range(c.h * 0.12, c.h * 0.2))
    rect(g, x - 1, top, 3, P.ground - top, '#141a0a')
    for (let i = 0; i < 9; i++) {
      const a = Math.PI + (i / 8) * Math.PI
      const len = r.range(10, 16)
      let px = x
      let py = top
      for (let k = 1; k <= len; k++) {
        const nx = x + Math.cos(a) * k * 1.3
        const ny = top + Math.sin(a) * k * 0.7 + (k * k) / (len * 1.1)
        line(g, px, py, nx, ny, '#1a240e')
        if (k % 2 === 0) rect(g, nx, ny + 1, 1, 2, '#2a3812')
        px = nx
        py = ny
      }
    }
  }
  // Canopy: fronds hanging from the top.
  for (let x = -6; x < c.w + 6; x += r.range(8, 14)) {
    const len = r.range(c.h * 0.08, c.h * 0.2)
    for (let k = 0; k < len; k++) {
      const fx = x + Math.sin(k / 6) * 3
      rect(g, fx, k, 2, 1, '#0e140a')
      if (k % 3 === 0) rect(g, fx - 3, k, 3, 1, '#0e140a')
      if (k % 3 === 1) rect(g, fx + 2, k, 3, 1, '#0e140a')
    }
  }
  // Vines hanging straight down.
  for (let i = 0; i < c.w / 20; i++) {
    const x = r.range(0, c.w)
    const len = r.range(c.h * 0.2, c.h * 0.5)
    rect(g, x, 0, 1, len, '#141a0a')
    for (let y = 6; y < len; y += 7) rect(g, x - 1, y, 3, 2, '#1e2a10')
  }
  // The forest floor: earth, roots, low ferns.
  g.drawImage(dGradient(c.w, c.h - P.ground, ['#2a2010', '#1a140a', '#0e0a06']), 0, P.ground)
  rect(g, 0, P.ground, c.w, 1, '#5a4a20')
  for (let i = 0; i < c.w / 6; i++) {
    const x = r.range(0, c.w)
    const y = r.range(P.ground + 2, c.h)
    line(g, x, y, x + r.range(-8, 8), y + r.range(1, 4), '#0e0a06')
  }
  return cv
}

/** Tree ferns and leaves in front, dark against the haze: the camera is in the jungle. */
function frontArt(c: Ctx): Canvas {
  const cv = canvas(c.w, c.h)
  const g = cv.g
  const leaf = (x: number, y: number, a: number, len: number) => {
    for (let k = 0; k < len; k++) {
      const q = k / len
      const fx = x + Math.cos(a + q * 0.8) * k
      const fy = y + Math.sin(a + q * 0.8) * k
      rect(g, fx, fy, 2, 2, '#060804')
      const lw = Math.round((1 - q) * 6) + 1
      rect(g, fx - lw, fy + 1, lw, 1, '#060804')
      rect(g, fx, fy + 2, 1, lw, '#060804')
    }
  }
  for (const [x, a] of [
    [-4, -0.7],
    [-2, -0.3],
    [0, -1.2],
  ] as const)
    leaf(x, c.h + 2, a, Math.round(c.h * 0.24))
  for (const [x, a] of [
    [c.w + 4, -2.4],
    [c.w + 2, -2.8],
  ] as const)
    leaf(x, c.h + 2, a, Math.round(c.h * 0.22))
  // A frond hanging into the top corner.
  for (let k = 0; k < c.h * 0.16; k++) rect(g, c.w * 0.86 + Math.sin(k / 5) * 2, k, 2, 1, '#060804')
  return cv
}

/** The far past seen through the tear: a red sky, a volcano erupting, ash, winged reptiles. */
function pastArt(c: Ctx): Canvas {
  const P = pastLayout(c)
  const cv = canvas(c.w, c.h)
  const g = cv.g
  g.drawImage(dGradient(c.w, c.h, ['#3a0a0a', '#7a1a10', '#c8401a', '#ff8a2a', '#5a2a10']), 0, 0)
  const vx = c.cx
  const base = Math.round(lerp(P.top, P.bottom, 0.75))
  const vt = Math.round(lerp(P.top, P.bottom, 0.38))
  tri(g, vx - c.w * 0.4, base, vx + c.w * 0.4, base, vx, vt, '#1a0a08')
  rect(g, vx - 4, vt, 8, 2, '#ffd23a')
  // The eruption: a column of fire and ash.
  for (let y = P.top; y < vt; y++) {
    const k = (vt - y) / Math.max(1, vt - P.top)
    const hw = Math.round(3 + k * 10)
    rect(g, vx - hw, y, hw * 2, 1, k < 0.3 ? '#ff6a1e' : k < 0.6 ? '#7a2a1a' : '#3a1a14')
  }
  ridge(g, c.w, base + 4, c.h * 0.03, '#120606', 1020, c.h, 0.5)
  // Winged reptiles crossing the red sky.
  for (const [fx, fy] of [
    [0.38, 0.5],
    [0.6, 0.42],
  ] as const) {
    const x = Math.round(c.w * fx)
    const y = Math.round(lerp(P.top, P.bottom, fy))
    rect(g, x - 1, y, 4, 1, '#1a0a08')
    line(g, x, y, x - 6, y - 3, '#1a0a08')
    line(g, x + 2, y, x + 8, y - 3, '#1a0a08')
  }
  return cv
}

/** How wide the tear is at row y: a lens, jagged at its edges, `open` 0 (a hairline) to 1. */
function tearAt(c: Ctx, edge: readonly number[], y: number, open: number) {
  const P = pastLayout(c)
  const q = (y - P.top) / (P.bottom - P.top)
  if (q < 0 || q > 1) return -1
  const lens = Math.sin(q * Math.PI) ** 0.7
  return Math.max(
    0,
    Math.round(P.half * lens * open + edge[Math.round(q * (edge.length - 1))]! * (0.3 + open)),
  )
}

export const ancientParadoxCinema = raidScene<PastX>({
  id: 'cinema-paradox-past',
  reveal: A_REVEAL,
  seed: 1009,
  aura: ['#ffffff', '#ffe0a0', '#e0902a', '#5a2a0a'],
  flash: '#fff0c8',
  feet: 0.62,
  rays: AMBER[2],
  setup(c, r) {
    return {
      jungle: jungleArt(c, r),
      front: frontArt(c),
      past: pastArt(c),
      edge: Array.from({ length: 48 }, () => r.range(-1, 3)),
      shards: [],
      fly: { x: -20, y: c.h * 0.3 },
    }
  },
  step(c, s, t, dt) {
    const r = s.r
    const P = pastLayout(c)
    stepShards(s.shards, dt, { floor: P.ground + 4 })
    // A giant dragonfly crossing early, wings a blur.
    s.fly.x += dt * c.w * 0.45
    s.fly.y = c.h * 0.3 + Math.sin(t * 3) * 8
    // Spores drifting in the haze; drawn to the tear once it opens.
    if (r() < 0.5 * c.many)
      s.fx.add({
        x: r.range(0, c.w),
        y: r.range(0, c.h * 0.8),
        vx: r.range(-4, 4),
        vy: r.range(-2, 6),
        life: r.range(1.5, 3),
        size: 1,
        shape: 'px',
        colors: [AMBER[0], AMBER[1], AMBER[2]],
        ...(t > A_CRACK && t < A_SHUT ? { home: { x: c.cx, y: (P.top + P.bottom) / 2, k: 120 } } : {}),
      })
    // Embers off the tear's burning edges.
    if (t > A_TEAR && t < A_SHUT)
      for (let i = 0; i < 2 * c.many + 1; i++) {
        const y = r.range(P.top, P.bottom)
        const hw = tearAt(c, s.edge, y, ease.outC(span(t, A_TEAR, A_WALK)))
        if (hw <= 0) continue
        s.fx.add({
          x: c.cx + (r() < 0.5 ? -hw : hw),
          y,
          vx: r.range(-20, 20),
          vy: -r.range(10, 40),
          life: r.range(0.4, 0.8),
          size: 1,
          shape: 'px',
          colors: ['#ffffff', AMBER[1], AMBER[2], AMBER[3]],
        })
      }
    // The tear snapping shut: amber shards.
    if (t >= A_SHUT && t - dt < A_SHUT)
      for (let i = 0; i < 36 * c.many + 10; i++) {
        const sh = makeShard(
          r,
          c.cx + r.range(-6, 6),
          r.range(P.top, P.bottom),
          r.range(80, 200),
          r() < 0.5 ? AMBER[1] : AMBER[2],
          AMBER[0],
          0.4,
        )
        s.shards.push(sh)
      }
  },
  back(g, c, s, t) {
    const P = pastLayout(c)
    // The air rippling before it splits: the jungle drawn with a wobble.
    const rip = span(t, A_RIPPLE, A_CRACK) * (1 - span(t, A_SHUT, A_SHUT + 0.4))
    if (rip > 0 && !c.short) wobble(g, s.jungle, c.w, 0, c.h, t, 1 + rip * 1.5, 6, 10)
    else g.drawImage(s.jungle, 0, 0)
    // Shafts of amber light through the canopy.
    for (const [fx, wd] of [
      [0.22, 10],
      [0.64, 14],
      [0.86, 7],
    ] as const) {
      const x = Math.round(c.w * fx)
      tri(g, x - 2, 0, x + wd, 0, x + wd * 3, P.ground, pattern(g, AMBER[1], 3))
      tri(g, x - 2, 0, x + wd, 0, x + wd * 3, P.ground, pattern(g, '#ffffff', 1))
    }
    if (t < A_RIPPLE + 0.5 && s.fly.x < c.w + 20) {
      // The dragonfly: a long body, two pairs of wings flickering.
      const x = Math.round(s.fly.x)
      const y = Math.round(s.fly.y)
      rect(g, x - 9, y, 16, 2, '#1a1408')
      rect(g, x + 7, y - 1, 3, 3, '#2a3a14')
      const up = Math.floor(t * 30) % 2
      for (const dx of [-1, 3]) {
        rect(g, x + dx - 6, y - (up ? 4 : 1), 7, 2, '#d8d0b0')
        rect(g, x + dx, y - (up ? 4 : 1), 7, 2, '#a8a088')
      }
    }
    // The tear: the far past through it, a burning amber edge round it.
    const crack = span(t, A_CRACK, A_TEAR)
    const open = t < A_TEAR ? 0 : ease.outC(span(t, A_TEAR, A_WALK)) * (1 - ease.inQ(span(t, A_OUT, A_SHUT)))
    if (t >= A_CRACK && t < A_SHUT) {
      // In steps of 4: a glow is cached by its radius.
      const gr = Math.round((P.half * 1.6 * (0.4 + open)) / 4) * 4 + 4
      g.drawImage(glow(gr, AMBER[2], 1.2, 0.6), c.cx - gr, Math.round((P.top + P.bottom) / 2) - gr)
      const grow = t < A_TEAR ? crack : 1
      const mid = (P.top + P.bottom) / 2
      for (let y = P.top; y < P.bottom; y++) {
        if (Math.abs(y - mid) > ((P.bottom - P.top) / 2) * grow) continue
        const hw = tearAt(c, s.edge, y, open)
        if (open > 0.05 && hw > 1) g.drawImage(s.past, c.cx - hw, y, hw * 2, 1, c.cx - hw, y, hw * 2, 1)
        // Its edges: white-hot, then amber, charring outward.
        rect(g, c.cx - hw - 1, y, 2, 1, '#ffffff')
        rect(g, c.cx + hw - 1, y, 2, 1, '#ffffff')
        rect(g, c.cx - hw - 3, y, 2, 1, AMBER[1])
        rect(g, c.cx + hw + 1, y, 2, 1, AMBER[1])
        rect(g, c.cx - hw - 4, y, 1, 1, AMBER[3])
        rect(g, c.cx + hw + 3, y, 1, 1, AMBER[3])
      }
    }
  },
  before(g, c, s, t) {
    const P = pastLayout(c)
    // Walking out of the past: small and far inside the tear, growing, then through it.
    if (t < A_WALK || t >= A_REVEAL) return
    const q = ease.inQ(span(t, A_WALK, A_OUT))
    const sc = lerp(0.35, 1, q)
    const y = Math.round(lerp(lerp(P.top, P.bottom, 0.75), c.feet, q))
    const step = Math.round(Math.abs(Math.sin(t * 9)) * 2 * (1 - q))
    const inside = t < A_OUT
    if (inside) {
      // Clipped to the tear while it is still in the other world.
      g.save()
      g.beginPath()
      const hw = Math.max(1, tearAt(c, s.edge, (P.top + P.bottom) / 2, 1))
      g.rect(c.cx - hw, P.top, hw * 2, P.bottom - P.top)
      g.clip()
    }
    drawSprite(g, c.mon, c.cx, y - step, {
      sx: sc,
      sy: sc,
      sil: inside ? '#1a0806' : '#0a0806',
      outline: Math.floor(t * 12) % 2 ? AMBER[1] : AMBER[0],
    })
    if (inside) g.restore()
  },
  front(g, c, s, t) {
    const P = pastLayout(c)
    drawShards(g, s.shards, AMBER[3])
    g.drawImage(s.front, 0, 0)
    burstRing(g, c.cx, (P.top + P.bottom) / 2, span(t, A_SHUT, A_SHUT + 0.4), c.m * 0.7, 2, AMBER[1])
    if (within(t, A_TEAR, A_TEAR + 0.12)) screenFlash(g, '#ffe8b0', 0.4)
    if (within(t, A_SHUT, A_SHUT + 0.1)) screenFlash(g, '#fff0c8', 0.35)
  },
  shakes: () => [
    [A_TEAR, 0.4, 3],
    [A_WALK + 0.3, 0.15, 1],
    [A_WALK + 0.6, 0.15, 1],
    [A_WALK + 0.85, 0.18, 2],
    [A_OUT, 0.25, 3],
  ],
  sounds: () => [
    // Insects and a deep forest hum.
    [0.2, () => tone(110, 3, { type: 'triangle', vol: 0.02 })],
    ...[0.4, 0.75, 1.0].map(
      (at) => [at, () => tone(3800, 0.12, { type: 'square', vol: 0.006, slide: -400 })] as const,
    ),
    [A_RIPPLE, () => tone(220, 1.2, { type: 'sine', vol: 0.03, slide: -100 })],
    [
      A_CRACK,
      () => (
        hiss(0.6, { freq: 5000, vol: 0.04, slide: -2000 }),
        tone(880, 0.6, { type: 'sine', vol: 0.02, slide: 440 })
      ),
    ],
    [
      A_TEAR,
      () => (hiss(0.9, { freq: 600, vol: 0.12, slide: -300 }), tone(70, 1, { type: 'sawtooth', vol: 0.05 })),
    ],
    [A_WALK + 0.3, () => tone(55, 0.3, { type: 'sine', vol: 0.1 })],
    [A_WALK + 0.6, () => tone(52, 0.3, { type: 'sine', vol: 0.11 })],
    [A_WALK + 0.85, () => tone(48, 0.35, { type: 'sine', vol: 0.13 })],
    [A_OUT, () => fxSound('legend.heart')],
    [
      A_SHUT,
      () => (fxSound('legend.shatter'), tone(1760, 0.3, { type: 'triangle', vol: 0.03, slide: -1200 })),
    ],
  ],
})

// ---------------------------------------------------------------------------------------------- the future

const F_LIGHTS = 0.35
const F_GATE = 1.3
const F_SCAN = 1.75
const GLITCH = [2.05, 2.35, 3.15] as const
const F_RIFT = 2.5
const F_WIRE = 3.25
const F_FILL = 3.6
const F_DONE = 4.15
const F_REVEAL = 4.5

const CHROME = { lit: '#c8d4dc', mid: '#8a96a2', dark: '#4a5662', ink: '#1a2026' }
const TEAL = { on: '#2ae0c0', dim: '#0e4a44', hot: '#e0fffa' }

type FutureX = {
  hall: Canvas
  traces: [number, number][][]
  shards: Shard[]
}

function futureLayout(c: Ctx) {
  const vy = Math.round(c.h * 0.4)
  // The far end: where the corridor's walls meet the gate.
  const fw = Math.round(Math.max(26, Math.min(c.w * 0.3, c.h * 0.3)))
  const fh = Math.round(fw * 0.85)
  return { vy, fw, fh, gx0: c.cx - fw, gx1: c.cx + fw, gy0: vy - fh, gy1: vy + fh }
}

/** Depth of the n-th ring of the corridor, 0 far to 1 near, as a frame between the gate and the screen's edges. */
function ringAt(c: Ctx, k: number) {
  const F = futureLayout(c)
  const e = k * k
  return {
    x0: lerp(F.gx0, -6, e),
    x1: lerp(F.gx1, c.w + 6, e),
    y0: lerp(F.gy0, -6, e),
    y1: lerp(F.gy1, c.h + 6, e),
  }
}

/** The corridor, drawn once: chrome walls, ceiling and floor converging on the gate, panel seams, dark circuits. */
function hallArt(c: Ctx): Canvas {
  const F = futureLayout(c)
  const near = ringAt(c, 1)
  // Each pixel: which face it is on (by which side of the diagonals from the gate's corners), banded by depth.
  const cv = shade(c.w, c.h, (x, y) => {
    if (x >= F.gx0 && x < F.gx1 && y >= F.gy0 && y < F.gy1) return '#0a0e12'
    const dx =
      x < c.cx ? (F.gx0 - x) / Math.max(1, F.gx0 - near.x0) : (x - F.gx1) / Math.max(1, near.x1 - F.gx1)
    const dy =
      y < F.vy ? (F.gy0 - y) / Math.max(1, F.gy0 - near.y0) : (y - F.gy1) / Math.max(1, near.y1 - F.gy1)
    const wall = dx > dy
    const k = Math.max(dx, dy)
    const band = Math.floor(k * 6)
    if (wall) return band % 2 ? '#3a444e' : '#323c46'
    return y < F.vy ? (band % 2 ? '#262e36' : '#2a323a') : band % 2 ? '#4a5662' : '#424e5a'
  })
  const g = cv.g
  // The corridor's rings: seams round each panel.
  for (let i = 1; i < 7; i++) {
    const R = ringAt(c, i / 7)
    const col = i % 2 ? CHROME.ink : '#5a6672'
    rect(g, R.x0, R.y0, R.x1 - R.x0, 1, col)
    rect(g, R.x0, R.y1, R.x1 - R.x0, 1, col)
    rect(g, R.x0, R.y0, 1, R.y1 - R.y0, col)
    rect(g, R.x1, R.y0, 1, R.y1 - R.y0, col)
  }
  // The corners where the faces meet, lit.
  line(g, F.gx0, F.gy0, near.x0, near.y0, CHROME.lit)
  line(g, F.gx1, F.gy0, near.x1, near.y0, CHROME.lit)
  line(g, F.gx0, F.gy1, near.x0, near.y1, CHROME.mid)
  line(g, F.gx1, F.gy1, near.x1, near.y1, CHROME.mid)
  // The gate's frame.
  rect(g, F.gx0 - 2, F.gy0 - 2, F.gx1 - F.gx0 + 4, 2, CHROME.lit)
  rect(g, F.gx0 - 2, F.gy1, F.gx1 - F.gx0 + 4, 2, CHROME.mid)
  rect(g, F.gx0 - 2, F.gy0, 2, F.gy1 - F.gy0, CHROME.mid)
  rect(g, F.gx1, F.gy0, 2, F.gy1 - F.gy0, CHROME.dark)
  return cv
}

/** Circuit traces along the floor and walls, running from near us towards the gate, stepping as circuits do. */
function traceSet(c: Ctx, r: Rng): [number, number][][] {
  const F = futureLayout(c)
  const out: [number, number][][] = []
  for (let i = 0; i < 10; i++) {
    const onFloor = i < 6
    const side = i % 2 ? 1 : -1
    const f = r.range(0.15, 0.9)
    const pts: [number, number][] = []
    for (let k = 0; k <= 7; k++) {
      const R = ringAt(c, 1 - k / 7)
      // Along the face at a fixed share across it, jogging sideways at each ring.
      const jog = k % 2 ? r.range(-0.08, 0.08) : 0
      if (onFloor) pts.push([lerp(R.x0, R.x1, Math.min(0.95, Math.max(0.05, f + jog))), R.y1 - 1])
      else pts.push([side < 0 ? R.x0 + 1 : R.x1 - 1, lerp(R.y0, R.y1, Math.min(0.9, Math.max(0.1, f + jog)))])
    }
    pts.push([onFloor ? c.cx + (f - 0.5) * F.fw : side < 0 ? F.gx0 : F.gx1, onFloor ? F.gy1 : F.vy])
    out.push(pts)
  }
  return out
}

/** A point a share of the way along a path. */
function along(pts: readonly [number, number][], q: number): [number, number] {
  const n = pts.length - 1
  const f = Math.min(n - 0.001, Math.max(0, q * n))
  const i = Math.floor(f)
  const k = f - i
  return [lerp(pts[i]![0], pts[i + 1]![0], k), lerp(pts[i]![1], pts[i + 1]![1], k)]
}

/** The picture slipping sideways in a few bands: a glitch. Only on a canvas the size of the art. */
function glitch(g: G, c: Ctx, t: number, k: number) {
  if (k <= 0 || g.canvas.width !== c.w || g.canvas.height !== c.h) return
  const r = rng(Math.floor(t * 30) + 7)
  g.save()
  g.setTransform(1, 0, 0, 1, 0, 0)
  for (let i = 0; i < 5; i++) {
    const y = Math.round(r.range(0, c.h - 8))
    const hh = r.int(2, 7)
    const dx = Math.round(r.range(-10, 10) * k)
    g.drawImage(g.canvas, 0, y, c.w, hh, dx, y, c.w, hh)
    if (i % 2) rect(g, 0, y, c.w, 1, i % 4 === 1 ? '#ff4ad8' : TEAL.on)
  }
  g.restore()
}

export const futureParadoxCinema = raidScene<FutureX>({
  id: 'cinema-paradox-future',
  reveal: F_REVEAL,
  seed: 1010,
  aura: ['#ffffff', '#d0fff8', '#4ad0e0', '#1a3a50'],
  flash: '#e8fffc',
  feet: 0.62,
  rays: '#4ad0e0',
  setup(c, r) {
    return { hall: hallArt(c), traces: traceSet(c, r), shards: [] }
  },
  step(c, s, t, dt) {
    const r = s.r
    const F = futureLayout(c)
    stepShards(s.shards, dt, { g: 0, drag: 2 })
    // Data blocks streaming into the rift once it is open.
    if (t > F_RIFT && t < F_DONE && r() < 0.9 * c.many) {
      const tr = s.traces[r.int(0, s.traces.length - 1)]!
      const [x, y] = tr[0]!
      s.fx.add({
        x,
        y,
        home: { x: c.cx, y: F.vy, k: 500 },
        life: 1.2,
        size: 2,
        shape: 'sq',
        colors: [TEAL.hot, TEAL.on, '#4ad0e0'],
      })
    }
    // Sparks off the printing beam.
    if (t > F_FILL && t < F_DONE && r() < c.many) {
      const y = lerp(c.feet, c.feet - c.sz.h, span(t, F_FILL, F_DONE))
      for (let i = 0; i < 2; i++)
        s.fx.add({
          x: c.cx + r.range(-c.sz.w * 0.5, c.sz.w * 0.5),
          y,
          vx: r.range(-30, 30),
          vy: -r.range(10, 50),
          ay: 200,
          life: r.range(0.3, 0.5),
          size: 1,
          shape: 'px',
          colors: ['#ffffff', TEAL.hot, TEAL.on],
        })
    }
    // The rift collapsing: its light thrown out as a ring of fragments.
    if (t >= F_DONE && t - dt < F_DONE)
      for (let i = 0; i < 24 * c.many + 6; i++) {
        const sh = makeShard(r, c.cx, F.vy, r.range(80, 180), '#e0fffa', '#ffffff', 0)
        sh.life = 0.8
        s.shards.push(sh)
      }
  },
  back(g, c, s, t) {
    const F = futureLayout(c)
    g.drawImage(s.hall, 0, 0)
    // The lights coming on down the corridor, near to far: strips along the ceiling's middle.
    for (let i = 6; i >= 1; i--) {
      const R = ringAt(c, i / 7)
      const on = t > F_LIGHTS + (6 - i) * 0.1 && Math.floor((t - F_LIGHTS - (6 - i) * 0.1) * 30) !== 1
      const wd = Math.round((R.x1 - R.x0) * 0.25)
      rect(g, c.cx - wd, R.y0 + 1, wd * 2, Math.max(1, Math.round(i / 2.5)), on ? '#e8fffc' : '#2a3238')
      if (on && i > 3) g.drawImage(glow(wd, '#a8d0d8', 1.6, 0.25), c.cx - wd, R.y0 - wd + 2)
    }
    // The traces, and data racing along them to the gate.
    for (const [i, tr] of s.traces.entries()) {
      polyline(g, tr, t > F_LIGHTS + 0.3 ? TEAL.dim : '#141c20')
      if (t > F_LIGHTS + 0.4)
        for (let k = 0; k < 2; k++) {
          const q = (t * (0.5 + span(t, F_GATE, F_RIFT) * 1.2) + i * 0.13 + k * 0.5) % 1
          const [x, y] = along(tr, q)
          rect(g, x - 1, y - 1, 2, 2, TEAL.on)
          rect(g, x, y, 1, 1, TEAL.hot)
        }
    }
    // The gate: a hexagon on its back wall, lit segment by segment.
    const segs = Math.floor(span(t, F_GATE, F_GATE + 0.6) * 6)
    const hr = Math.round(Math.min(F.fw, F.fh) * 0.82)
    for (let i = 0; i < 6; i++) {
      const a0 = -Math.PI / 2 + (i * Math.PI) / 3
      const a1 = a0 + Math.PI / 3
      line(
        g,
        c.cx + Math.cos(a0) * hr,
        F.vy + Math.sin(a0) * hr,
        c.cx + Math.cos(a1) * hr,
        F.vy + Math.sin(a1) * hr,
        i < segs ? TEAL.on : '#1e2a30',
        2,
      )
    }
    // The rift: a white field opening inside it, ringed in teal, data pouring in.
    const open = ease.outBack(span(t, F_RIFT, F_RIFT + 0.5)) * (1 - ease.inQ(span(t, F_DONE - 0.15, F_DONE)))
    if (open > 0) {
      const rw = Math.max(1, Math.round(hr * 0.75 * open))
      const rh = Math.max(1, Math.round(hr * 0.75 * Math.min(1, open * 1.3)))
      const gr = Math.round(rw / 2) * 4 + 4
      g.drawImage(glow(gr, TEAL.on, 1.3, 0.6), c.cx - gr, F.vy - gr)
      rect(g, c.cx - rw, F.vy - rh, rw * 2, rh * 2, TEAL.hot)
      rect(g, c.cx - rw + 2, F.vy - rh + 2, Math.max(1, rw * 2 - 4), Math.max(1, rh * 2 - 4), '#ffffff')
      hexagon(g, c.cx, F.vy, Math.round(hr * 0.9), Math.floor(t * 12) % 2 ? TEAL.hot : TEAL.on)
      // Bars of static running across it.
      for (let k = 0; k < 3; k++)
        rect(g, c.cx - rw, F.vy - rh + ((t * 90 + k * 17) % (rh * 2)), rw * 2, 1, '#a8f0e8')
    } else if (t > F_DONE && t < F_DONE + 0.25) rect(g, c.cx - 1, F.vy - 1, 3, 3, '#ffffff')
    // The scan: a plane of light sweeping the corridor top to bottom.
    const sq = span(t, F_SCAN, F_SCAN + 0.5)
    if (sq > 0 && sq < 1) {
      const y = Math.round(lerp(0, c.h, sq))
      rect(g, 0, y, c.w, 1, TEAL.hot)
      rect(g, 0, y - 2, c.w, 2, pattern(g, TEAL.on, 8))
    }
    // The floor's glow where it will be printed.
    if (t > F_WIRE) {
      const gr = Math.round(Math.max(c.sz.w, 40) * 0.7)
      g.drawImage(glow(gr, TEAL.on, 1.3, q4(0.5 * span(t, F_WIRE, F_WIRE + 0.3))), c.cx - gr, c.feet - gr)
      ellipse(g, c.cx, c.feet + 2, Math.round(c.sz.w * 0.55), 3, TEAL.dim)
      hexagon(g, c.cx, c.feet + 2, Math.round(c.sz.w * 0.55), TEAL.on, 0.25)
    }
  },
  before(g, c, _s, t) {
    if (t < F_WIRE) return
    // Printed bottom to top: first a wireframe climbing, then the light filling it, a beam at the line being made.
    const wireY = Math.round(lerp(c.feet + 1, c.feet - c.sz.h - 1, ease.ioQ(span(t, F_WIRE, F_FILL + 0.1))))
    const fillY = Math.round(lerp(c.feet + 1, c.feet - c.sz.h - 1, span(t, F_FILL, F_DONE)))
    const clip = (y0: number, y1: number, f: () => void) => {
      if (y1 <= y0) return
      g.save()
      g.beginPath()
      g.rect(0, y0, c.w, y1 - y0)
      g.clip()
      f()
      g.restore()
    }
    clip(wireY, fillY, () =>
      drawSprite(g, c.mon, c.cx, c.feet, {
        sil: '#0a2026',
        outline: Math.floor(t * 20) % 3 ? TEAL.on : TEAL.hot,
      }),
    )
    clip(fillY, c.feet + 2, () =>
      drawSprite(g, c.mon, c.cx, c.feet, {
        tint: { color: '#a8f0e8', a: lerp(0.9, 0.5, span(t, F_FILL, F_REVEAL)) },
        outline: TEAL.hot,
      }),
    )
    // The beams: a white line at the fill, a teal one at the wire.
    const hw = Math.round(c.sz.w * 0.6)
    if (t < F_DONE) {
      rect(g, c.cx - hw, fillY, hw * 2, 1, '#ffffff')
      rect(g, c.cx - hw, wireY, hw * 2, 1, TEAL.on)
    }
  },
  front(g, c, s, t) {
    const F = futureLayout(c)
    drawShards(g, s.shards)
    for (const at of GLITCH) {
      const k = span(t, at, at + 0.14)
      if (k > 0 && k < 1) glitch(g, c, t, 1 - k)
    }
    burstRing(g, c.cx, F.vy, span(t, F_DONE, F_DONE + 0.4), c.m * 0.6, 2, TEAL.hot)
    if (within(t, F_RIFT, F_RIFT + 0.12)) screenFlash(g, '#e0fffa', 0.4)
  },
  shakes: () => [
    [F_RIFT, 0.3, 2],
    [GLITCH[0], 0.1, 2],
    [GLITCH[1], 0.1, 2],
  ],
  sounds: () => [
    // Relays clicking as the lights come on, a machine hum.
    ...[0, 1, 2, 3, 4, 5].map(
      (i) => [F_LIGHTS + i * 0.1, () => tone(1400 - i * 80, 0.03, { type: 'square', vol: 0.02 })] as const,
    ),
    [F_LIGHTS + 0.2, () => tone(60, 3.8, { type: 'sawtooth', vol: 0.018, slide: 30 })],
    ...[0, 1, 2, 3, 4, 5].map(
      (i) => [F_GATE + i * 0.1, () => tone(440 + i * 110, 0.08, { type: 'square', vol: 0.02 })] as const,
    ),
    [F_SCAN, () => tone(2000, 0.5, { type: 'sine', vol: 0.02, slide: -1500 })],
    ...GLITCH.map(
      (at) =>
        [
          at,
          () => (hiss(0.12, { freq: 3500, vol: 0.06 }), tone(180, 0.08, { type: 'square', vol: 0.03 })),
        ] as const,
    ),
    [F_RIFT, () => (fxSound('portal.breach'), tone(110, 1.2, { type: 'sine', vol: 0.04, slide: 330 }))],
    [F_WIRE, () => tone(880, 0.9, { type: 'square', vol: 0.012, slide: 880 })],
    [F_FILL, () => hiss(0.6, { freq: 2500, vol: 0.04, slide: 2500 })],
    [F_DONE, () => (fxSound('legend.heart'), tone(2093, 0.15, { type: 'sine', vol: 0.03 }))],
  ],
})
