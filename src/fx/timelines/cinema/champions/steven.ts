// Steven's entrance (docs/54), on the battle stage: the deepest chamber of Meteor Falls at night, where he waits once
// the League is won. The camera tilts down from a hole in the cavern's roof (stars, the moon, its light pouring in) past
// a ceiling studded with glinting stones, to the chamber's floor, a waterfall spilling into a pool, a tunnel at the back.
// Out of the dark, three heavy steel footfalls: Metagross, its eyes lighting red, each step sending a pulse through the
// rock that runs up the ore veins further across the walls, lighting the stones in them. It hums and lifts off the
// ground on its own magnetism, and every stone in the chamber tears out of the rock and rises with it: gems and ore
// hanging in the air, turning, glinting. Steven walks out of the tunnel through his floating collection, small in the
// dark and then full size; the rarest stone drifts down into his open hand; the Key Stone on his lapel flares, threads
// of light run from it to every stone, and the whole collection blazes as he is revealed.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  bayer,
  cached,
  canvas,
  clamp,
  ease,
  ellipse,
  ellipseLine,
  glow,
  lerp,
  line,
  Particles,
  pattern,
  rect,
  shade,
  span,
  type Canvas,
  type G,
  type Rng,
} from '../../../pixel'
import { drawSprite, silhouette, spriteFrame, spriteKey, spriteSize } from '../../../sprites'
import { H, screenFlash, screenShake, W, within } from '../../../timeline'
import { championCinema, type ChampionState } from '../champion'
import { burstRing, dissolve, pulse } from '../kit'

const REVEAL = 4.6
/** Rows of cavern above the stage's top: the roof the camera starts on, tilting down to the floor. */
const TOP = 100
const CH = H + TOP
const T_TILT0 = 0.3
const T_TILT1 = 1.45
const T_SHOOT = 0.3
/** Metagross's three footfalls, each lighting one network of ore veins. */
const STEPS = [1.32, 1.72, 2.12] as const
/** It lifts off on its magnetism; every stone tears out of the rock and rises with it. */
const T_RISE = 2.5
/** Steven walks out of the tunnel to where he stands. */
const T_WALK0 = 2.75
const T_WALK1 = 3.85
/** The rarest stone drifts down into his open hand. */
const T_HAND = 3.55
const T_HELD = 3.95
/** The Key Stone flares; its light runs to every stone; the collection blazes. */
const T_KEY = 3.98
const T_WEB0 = 4.04
const T_WEB1 = 4.22
const T_BLAZE = 4.24
const VEIN_SPEED = 230

/** The cavern's rock, darkest to lightest: blue-grey slate in moonlight. */
const ROCK = ['#05060b', '#090b13', '#0e121c', '#141a27', '#1b2334', '#242e43', '#313d56', '#43516e'] as const
const VEIN = ['#ffffff', '#c8f0ff', '#6ac8f0', '#2a6a9a'] as const
const KEY = ['#ffffff', '#ffe8a8', '#ff8ad8', '#8ad8ff', '#a8ffb0'] as const

/** Each kind of stone: its light, mid, shade and dark (ore is steel). */
const GEMS = {
  ruby: ['#ffd8e0', '#ff5a6a', '#c81e3a', '#5a0a1e'],
  sapphire: ['#e0f4ff', '#5aa8ff', '#1e5ad0', '#0a1a50'],
  emerald: ['#d8ffe8', '#4ade80', '#14985a', '#06402a'],
  amethyst: ['#f4e4ff', '#b47aff', '#7a3ad0', '#2a1060'],
  topaz: ['#fff6c8', '#ffd23a', '#d8901e', '#5a300a'],
  steel: ['#dce6f4', '#8a9ab0', '#4a5a72', '#1a2230'],
} as const
type Kind = keyof typeof GEMS
const KINDS = Object.keys(GEMS) as Kind[]

/** Where things are (the stage's own coordinates once the camera has come down; the roof is above y 0). */
const HOLE = { x: 100, y: -70, rx: 34, ry: 13 }
/** How far right the moon's shaft leans by the time it reaches the floor (it lands on Metagross). */
const LEAN = 6
/** The moon in the sky canvas: framed by the hole as the camera starts. */
const SKY_MOON = { x: 114, y: 62 }
const FALLS = { x0: 13, x1: 21, top: -34, pool: 86 }
const ARCH = { x0: 182, x1: 214, top: 34, foot: 78 }
/** Metagross's three steps forward, then where it hovers. */
const MG_X = [80, 88, 96, 104] as const
const MG_Y = 84
const MG_LIFT = 13
/** Where Steven comes out of the tunnel (far, small) and where he stands. */
const FAR = { x: 199, y: 78, k: 0.5 }

// ---------------------------------------------------------------------------------------------------------------- noise
/** A hash of a lattice point, 0..1. */
function hash(x: number, y: number, seed: number) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)
  n = Math.imul(n ^ (n >>> 13), 1274126177)
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}
/** Smooth value noise, 0..1, a few octaves: the rock's grain (only ever painted once, into the static layers). */
function fbm(x: number, y: number, seed: number, oct = 3) {
  let a = 0
  let w = 0.5
  let f = 1
  let tot = 0
  for (let o = 0; o < oct; o++) {
    const X = x * f
    const Y = y * f
    const ix = Math.floor(X)
    const iy = Math.floor(Y)
    const fx = X - ix
    const fy = Y - iy
    const sx = fx * fx * (3 - 2 * fx)
    const sy = fy * fy * (3 - 2 * fy)
    const v0 = lerp(hash(ix, iy, seed + o), hash(ix + 1, iy, seed + o), sx)
    const v1 = lerp(hash(ix, iy + 1, seed + o), hash(ix + 1, iy + 1, seed + o), sx)
    a += lerp(v0, v1, sy) * w
    tot += w
    w *= 0.5
    f *= 2.1
  }
  return a / tot
}
/** A value through the rock's ramp, dithered between its steps. */
const rock = (v: number, x: number, y: number, ramp: readonly string[] = ROCK) =>
  ramp[clamp(Math.floor(clamp(v) * (ramp.length - 1) + bayer(x, y)), 0, ramp.length - 1)]!

// ---------------------------------------------------------------------------------------------------------------- the cavern
/** Where the back wall meets the floor (a wavy line, the stage's y). */
const footAt = (x: number) => 76 + Math.round(Math.sin(x * 0.07) * 2 + Math.sin(x * 0.19 + 1) * 1)

/** How much of the moon's light falls on a point: the shaft from the hole, and the pool it makes on the floor. */
function moonAt(x: number, y: number) {
  // The shaft widens as it falls, leaning a little right.
  const q = clamp((y - HOLE.y) / (MG_Y + 10 - HOLE.y))
  const cx = lerp(HOLE.x, HOLE.x + LEAN, q)
  const hw = lerp(HOLE.rx * 0.85, 44, q)
  const inShaft = clamp(1 - Math.abs(x - cx) / hw) ** 0.7
  const pool = clamp(1 - Math.hypot((x - (HOLE.x + LEAN)) / 58, (y - (MG_Y + 4)) / 15)) ** 0.7
  return Math.max(inShaft * 0.55 * q, y > footAt(x) ? pool : 0)
}

/**
 * The rock as faceted blocks: a jittered grid of cells (wider than tall, like strata), each a flat face tilted its own
 * way, the seams between them dark cracks. Returns the face's normal, how close to a seam the pixel is, and how far
 * into its face (a face bulges a little: lighter at its heart).
 */
function facet(x: number, y: number, cw: number, ch: number, seed: number) {
  const gx = Math.floor(x / cw)
  const gy = Math.floor(y / ch)
  let d1 = Infinity
  let d2 = Infinity
  let best = 0
  let bx = 0
  let by = 0
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const cx = gx + i
      const px = (cx + 0.05 + 0.9 * hash(cx, gy + j, seed)) * cw
      const py = (gy + j + 0.05 + 0.9 * hash(cx, gy + j, seed + 1)) * ch
      const d = Math.hypot((x - px) / cw, (y - py) / ch)
      if (d < d1) {
        d2 = d1
        d1 = d
        best = hash(cx * 7 + 3, gy + j, seed + 2)
        bx = cx
        by = gy + j
      } else if (d < d2) d2 = d
    }
  const nx = (hash(bx, by, seed + 3) - 0.5) * 1.3
  const ny = -0.25 - hash(bx, by, seed + 4) * 0.75 + (best < 0.2 ? 0.8 : 0)
  return { nx, ny, seam: d2 - d1, heart: 1 - d1 }
}

/**
 * The cavern, roof to floor, as one tall canvas, the hole in its roof left open for the sky. The rock is big faceted
 * faces lit from the hole above (a face turned up toward the moon catches it, one turned away falls into shadow), plus
 * a little cold light everywhere so nothing is flat black; the floor is slabs seen at an angle under the moon's pool.
 */
function cavern(r: Rng): Canvas {
  const cv = shade(W, CH, (x, cy) => {
    const y = cy - TOP
    // The hole: open (the sky shows), its lip lit by the moon on the far side.
    const hd =
      Math.hypot((x - HOLE.x) / HOLE.rx, (y - HOLE.y) / HOLE.ry) + (fbm(x / 6, y / 6, 7, 2) - 0.5) * 0.35
    if (hd < 1) return null
    const foot = footAt(x)
    const moon = moonAt(x, y)
    const mass = fbm(x / 60, y / 40, 17, 2)
    const grain = fbm(x / 5, y / 3, 12, 2)
    if (y < foot) {
      // Big faces, warped by a slow noise so their seams wander like real fractures, not courses of masonry.
      const wx = x + (fbm(x / 20, y / 20, 61, 2) - 0.5) * 22
      const wy = y + (fbm(x / 20, y / 20, 62, 2) - 0.5) * 14
      const f = facet(wx, wy, 34, 18, 41)
      // Light from the hole: a face turned up toward it catches it; one turned away stays in the dark.
      const lx = HOLE.x - x
      const ly = HOLE.y - y
      const ll = Math.hypot(lx, ly, 70)
      const lam = clamp((f.nx * lx + f.ny * ly + 0.55 * 70) / ll)
      const up = clamp((y + TOP) / (foot + TOP))
      const lip = hd < 1.3 ? (1.3 - hd) * 2 * clamp((y - HOLE.y) / HOLE.ry + 0.4) : 0
      let v = 0.05 + 0.1 * up + lam * (0.1 + 0.12 * up + 0.5 * moon) + 0.12 * (mass - 0.5) + 0.05 * grain
      v += 0.05 * f.heart + lip
      // The seams: a dark crack (not everywhere: some faces run into each other), the lip above it lit.
      const crack = fbm(x / 9, y / 9, 63, 2) > 0.5
      if (f.seam < 0.08 && crack) v -= 0.16
      else if (f.seam < 0.15 && crack) v += 0.06 * lam
      // The wall's foot falls into shadow where it meets the floor.
      return rock(v - 0.1 * clamp(1 - (foot - y) / 7), x, y)
    }
    // The floor: lighter toward us, flat slabs seen at an angle, the moon's pool on it.
    const near = clamp((y - foot) / (H - foot))
    const f = facet(x + (fbm(x / 30, y / 10, 64, 2) - 0.5) * 30, y * 2.6, 44, 22, 51)
    let v = 0.13 + 0.12 * near + 0.1 * (mass - 0.5) + 0.05 * grain + 0.6 * moon + 0.06 * f.nx
    if (f.seam < 0.06 && fbm(x / 12, y / 5, 65, 2) > 0.5) v -= 0.1
    return rock(v, x, y)
  })
  const g = cv.g
  const Y = (y: number) => y + TOP
  // The wall's foot: a dark seam, a few boulders sitting on it.
  for (let x = 0; x < W; x++) rect(g, x, Y(footAt(x)), 1, 1, ROCK[0])
  for (let i = 0; i < 9; i++) {
    const x = r.range(0, W)
    if (x > ARCH.x0 - 6 && x < ARCH.x1 + 6) continue
    boulder(g, x, Y(footAt(x) + 1), r.int(3, 7), r)
  }
  // Pebbles over the floor, each with its shadow.
  for (let i = 0; i < 46; i++) {
    const x = r.range(0, W)
    const y = r.range(82, H)
    const v = 0.34 + 0.4 * moonAt(x, y)
    rect(g, x, Y(y) + 1, 3, 1, ROCK[1])
    rect(g, x, Y(y), 2, 1, rock(v, x, y))
  }
  // Stalactites hanging from the roof's dome.
  for (let i = 0; i < 26; i++) {
    const x = r.range(0, W)
    const y0 = lerp(-TOP, -12, r() ** 1.4)
    if (Math.abs(x - HOLE.x) < HOLE.rx + 6 && y0 < HOLE.y + 14) continue
    fang(g, x, Y(y0), r.range(2, 5), r.range(8, 30) * (1 - (y0 + TOP) / (TOP * 1.4)), 1, moonAt(x, y0))
  }
  // Stalagmites along the wall's foot.
  for (let i = 0; i < 9; i++) {
    const x = r.range(0, W)
    if (x > ARCH.x0 - 10 && x < ARCH.x1 + 10) continue
    if (x > 60 && x < 150) continue
    fang(g, x, Y(footAt(x) + 2), r.range(2, 4), r.range(8, 18), -1, moonAt(x, footAt(x)))
  }
  tunnel(g)
  pool(g)
  return cv
}

/** A rounded boulder, lit from above. */
function boulder(g: G, x: number, y: number, rr: number, r: Rng) {
  for (let dy = -rr; dy <= 0; dy++)
    for (let dx = -rr - 2; dx <= rr + 2; dx++) {
      const d = Math.hypot(dx / (rr + 2), dy / rr)
      if (d > 1) continue
      const lit = clamp(0.5 - dy / rr / 2 - dx / (rr + 2) / 3 + (r() - 0.5) * 0.1)
      rect(g, x + dx, y + dy, 1, 1, rock(0.12 + 0.3 * lit * (1 - d * 0.5), x + dx, y + dy))
    }
}

/** A stalactite (dir 1, hanging) or stalagmite (dir −1, standing): its left face lit, its right in shade. */
function fang(g: G, x: number, y: number, hw: number, len: number, dir: 1 | -1, moon: number) {
  for (let k = 0; k < len; k++) {
    const w = hw * (1 - k / len) ** 0.8
    const yy = Math.round(y + k * dir)
    const wr = Math.ceil(w)
    for (let dx = -wr; dx <= wr; dx++) {
      if (Math.abs(dx) > w + 0.3) continue
      // A rim on its lit edge, a body, a shaded side; the tip lighter where it drips.
      const u = dx / (w + 0.5)
      const lit = dx === -wr ? 0.5 : u < -0.2 ? 0.34 : u < 0.4 ? 0.22 : 0.1
      rect(g, x + dx, yy, 1, 1, rock(lit + 0.35 * moon + (k > len - 3 ? 0.1 : 0), x + dx, yy))
    }
  }
}

/** The tunnel at the back: a black arch, a little of the far passage's light in its depth, a rim of lit rock. */
function tunnel(g: G) {
  const { x0, x1, top, foot } = ARCH
  const cx = (x0 + x1) / 2
  const hw = (x1 - x0) / 2
  for (let y = top - 3; y <= foot; y++) {
    const q = (y - top) / (foot - top)
    // An arch: round on top, the sides falling straight.
    const w = q < 0.4 ? hw * Math.sqrt(1 - ((0.4 - q) / 0.4) ** 2) : hw
    const wr = Math.round(w + Math.sin(y * 0.9) * 0.8)
    for (let dx = -wr - 2; dx <= wr + 2; dx++) {
      const x = Math.round(cx + dx)
      const edge = Math.abs(dx) > wr
      if (edge) {
        if (y >= top) rect(g, x, y + TOP, 1, 1, dx < 0 ? ROCK[4] : ROCK[2])
        continue
      }
      // Its depth: black at the mouth, the far passage's faint blue glow deep inside, low down.
      const deep = clamp(1 - Math.hypot(dx / (hw * 0.7), (y - (foot - 14)) / 22))
      rect(
        g,
        x,
        y + TOP,
        1,
        1,
        deep * 0.9 > bayer(x, y) * 0.9 + 0.1 ? (deep > 0.55 ? '#2a4a70' : '#14243a') : '#030407',
      )
    }
  }
  // The rim of the arch catching the light.
  for (let y = top - 3; y < foot; y += 1) {
    const q = (y - top) / (foot - top)
    const w = q < 0.4 ? hw * Math.sqrt(Math.max(0, 1 - ((0.4 - q) / 0.4) ** 2)) : hw
    rect(g, Math.round(cx - w - 3), y + TOP, 1, 1, ROCK[5])
  }
}

/** The waterfall's pool at the foot of the left wall: black water, a moonlit rim. */
function pool(g: G) {
  const cx = (FALLS.x0 + FALLS.x1) / 2 + 8
  ellipse(g, cx, FALLS.pool + TOP, 30, 5, '#060a12')
  ellipseLine(g, cx, FALLS.pool + TOP, 30, 5, ROCK[4], 0, Math.PI)
  for (let i = 0; i < 6; i++) rect(g, cx - 20 + i * 7, FALLS.pool + TOP + 1 + (i % 2), 3, 1, '#16243a')
}

/** The night through the hole: deep blue, many stars, the moon high in it, a halo round it. */
function sky(): Canvas {
  return shade(W, 140, (x, y) => {
    const md = Math.hypot(x - SKY_MOON.x, y - SKY_MOON.y)
    if (md < 9) {
      // Its disc: lit from the left, a few maria.
      if (md > 8) return '#8aa4cc'
      const m = fbm(x / 4, y / 4, 31, 2)
      return x - SKY_MOON.x > 4 + (md > 6 ? 1 : 0) ? '#a8c0e0' : m > 0.62 ? '#c4d6ee' : '#eef4ff'
    }
    if (md < 20 && (1 - (md - 9) / 11) * 0.7 > bayer(x, y)) return md < 13 ? '#3a5488' : '#22325a'
    const h = hash(x, y, 3)
    if (h > 0.982) return h > 0.995 ? '#ffffff' : h > 0.99 ? '#c8d8ff' : '#6a7aa8'
    return rock(0.3 + 0.25 * (y / 140), x, y, ['#03050e', '#060a1a', '#0a1028', '#101a3a', '#16244a'])
  })
}

/**
 * Rock in close to the camera, black in the dark with a cold rim where the light catches it: stalactites hanging at
 * the top edge, two masses at the bottom corners. It moves faster than the cavern as the camera tilts, so the chamber
 * reads deep.
 */
function near(r: Rng): Canvas {
  const cv = canvas(W, CH + 60)
  const g = cv.g
  const body = '#030408'
  const mid = '#0a0d16'
  const rim = '#2a3650'
  // Hanging from the top edge, ragged.
  for (const [x, len, hw] of [
    [4, 92, 14],
    [30, 54, 8],
    [232, 76, 12],
    [212, 40, 7],
    [146, 30, 5],
  ] as const) {
    let wob = 0
    for (let k = 0; k < len; k++) {
      wob += r.range(-0.6, 0.6)
      wob *= 0.85
      const w = Math.round(hw * (1 - k / len) ** 0.7 + wob)
      if (w < 0) continue
      rect(g, x - w, k, w * 2 + 1, 1, body)
      rect(g, x - w + 1, k, 2, 1, mid)
      rect(g, x - w, k, 1, 1, rim)
    }
  }
  // The masses at the bottom corners: a ragged top edge, rimmed, a band of dark relief under it.
  for (const [x0, x1, h0, h1] of [
    [-4, 62, 30, 4],
    [184, 244, 2, 26],
  ] as const) {
    let wob = 0
    for (let x = x0; x <= x1; x++) {
      const q = (x - x0) / (x1 - x0)
      wob += r.range(-1.2, 1.2)
      wob *= 0.8
      const top = Math.round(cv.height - lerp(h0, h1, ease.ioS(q)) - Math.sin(q * 9) * 2 - wob)
      rect(g, x, top, 1, cv.height - top, body)
      rect(g, x, top + 1, 1, 2, mid)
      rect(g, x, top, 1, 1, rim)
    }
  }
  return cv
}

// ---------------------------------------------------------------------------------------------------------------- stones
/**
 * A cut stone turning: an octagon of facets lit from the top left; `turn` (0..7) rotates its facets so the light runs
 * round it. `dim` the stone still in the rock, unlit.
 */
const gem = (kind: Kind, r: number, turn: number, dim: boolean) =>
  cached(`steven-gem|${kind}|${r}|${turn}|${dim}`, () => {
    // Dull: the rock's own greys round it, only its heart showing its colour.
    const C = dim ? [ROCK[5], ROCK[4], ROCK[3], ROCK[1]] : GEMS[kind]
    const ore = kind === 'steel'
    const n = 2 * r + 1
    return shade(n, n, (x, y) => {
      const dx = x - r
      const dy = y - r
      // An octagon (ore: a rougher, squatter lump).
      const d = Math.max(Math.abs(dx), Math.abs(dy) * (ore ? 1.25 : 1), (Math.abs(dx) + Math.abs(dy)) * 0.72)
      if (d > r + 0.2) return null
      // Dull: a lump of rock, lit on top, one pixel of its colour at its heart.
      if (dim) return dx === 0 && dy === 0 ? GEMS[kind][2] : C[dx + dy < 0 ? 1 : dy > 0 ? 3 : 2]
      if (d > r - 0.8) return C[3]
      // The table on top, then eight facets round it.
      if (!ore && d < r * 0.42) return dx === -1 && dy === -1 ? '#ffffff' : C[1]
      const a = Math.atan2(dy, dx) + (turn * Math.PI) / 8
      const sector = Math.floor((a / (Math.PI / 4) + 16.5) % 8)
      const lit = Math.cos(sector * (Math.PI / 4) - Math.PI * 1.25)
      return C[lit > 0.6 ? 0 : lit > 0 ? 1 : lit > -0.6 ? 2 : 3]
    })
  })

interface Stone {
  kind: Kind
  r: number
  /** In the rock: where it sits. */
  hx: number
  hy: number
  /** Hanging in the air: where it drifts to. */
  fx: number
  fy: number
  /** When the veins' light reaches it, when it tears out. */
  lit: number
  out: number
  /** Depth (a floor y): the farther ones are drawn first. */
  z: number
  /** Turning speed, bobbing phase. */
  spin: number
  ph: number
  /** Still in the roof (it never comes down: a glint over the camera's tilt). */
  roof: boolean
  /** The rarest one, for his hand. */
  rare?: boolean
}

/** A segment of an ore vein, with how far along its network it lies (its light runs out from the network's root). */
type Seg = [number, number, number, number, number]
interface Vein {
  segs: Seg[]
  at: number
}

/** A network of veins: a seam meandering across the wall from a root at its foot, a few short branches off it. */
function veins(r: Rng, x: number, y: number, at: number, heading: number, reach: number): Vein {
  const segs: Seg[] = []
  const grow = (x0: number, y0: number, a: number, d0: number, left: number, trunk: boolean) => {
    let px = x0
    let py = y0
    let d = d0
    let bend = 0
    for (let i = 0; i < left; i++) {
      // A slow meander, not a scribble: the bend itself drifts.
      bend = clamp(bend + r.range(-0.12, 0.12), -0.18, 0.18)
      a += bend + r.range(-0.15, 0.15)
      // Veins keep to the wall: turned back from the roof and from the floor.
      if (py < 6) a += 0.2 * (Math.cos(a) >= 0 ? 1 : -1)
      if (py > footAt(px) - 10) a -= 0.25 * (Math.cos(a) >= 0 ? 1 : -1)
      const len = r.range(5, 8)
      const nx = clamp(px + Math.cos(a) * len, -6, W + 6)
      const ny = Math.min(footAt(px) - 3, py + Math.sin(a) * len)
      segs.push([Math.round(px), Math.round(py), Math.round(nx), Math.round(ny), d])
      d += Math.hypot(nx - px, ny - py)
      px = nx
      py = ny
      if (trunk && i > 2 && r() < 0.16)
        grow(px, py, a + r.range(0.6, 1.2) * (r() < 0.5 ? -1 : 1), d, r.int(4, 9), false)
    }
  }
  grow(x, y, heading, 0, reach, true)
  return { segs, at }
}

// ---------------------------------------------------------------------------------------------------------------- state
type X = {
  buf: Canvas
  fbuf: Canvas
  tmp: Canvas
  cave: Canvas
  sky: Canvas
  near: Canvas
  stones: Stone[]
  nets: Vein[]
  motes: Particles
  spray: Particles
}
type S = ChampionState<X>

const camY = (t: number) => -TOP * (1 - ease.ioS(span(t, T_TILT0, T_TILT1)))

/** Metagross's feet: three steps forward (each lifted, then slammed down), then up on its magnetism, bobbing. */
function metagross(t: number) {
  let x: number = MG_X[0]
  let y = MG_Y
  STEPS.forEach((at, i) => {
    const q = span(t, at - 0.22, at)
    x = lerp(x, MG_X[i + 1]!, ease.ioS(q))
    if (q > 0 && q < 1) y -= Math.round(3 * Math.sin(Math.PI * q))
  })
  const lift = ease.ioS(span(t, T_RISE, T_RISE + 0.7))
  y -= Math.round(MG_LIFT * lift + lift * Math.sin((t - T_RISE) * 3.4) * 1.5)
  return { x, y, lift }
}

/** Steven, from the tunnel's mouth to where he stands: where, how big, and his walk's bob. */
function steven(s: S, t: number) {
  const q = span(t, T_WALK0, T_WALK1)
  const e = q < 0.85 ? q / 0.92 : lerp(0.85 / 0.92, 1, ease.outQ((q - 0.85) / 0.15))
  const x = lerp(FAR.x, s.L.foe.x, e)
  const y = lerp(FAR.y, s.L.foe.y + 2, e)
  const k = lerp(FAR.k, 1, e)
  const step = q > 0 && q < 0.95 ? Math.floor((t - T_WALK0) / 0.17) % 2 : 0
  return { x, y: y - step, k, q, depth: y }
}

/** Where a stone is at t: in the rock, tearing out, rising, hanging; the rarest gliding to his hand. */
function stoneAt(s: S, o: Stone, t: number) {
  if (o.roof || t < o.out) return { x: o.hx, y: o.hy, up: 0 }
  // Torn out with a jerk (a little past where it settles), then hanging there, bobbing.
  const q = ease.outBack(span(t, o.out, o.out + 0.55), 1.8)
  const bob = Math.sin((t - o.out) * 2.2 + o.ph) * 2 * Math.min(1, q)
  let x = lerp(o.hx, o.fx, q) + Math.sin((t - o.out) * 0.9 + o.ph) * 1.5 * q
  let y = lerp(o.hy, o.fy, q) + bob
  if (o.rare) {
    const h = hand(s)
    const g = ease.ioS(span(t, T_HAND, T_HELD))
    x = lerp(x, h.x, g)
    y = lerp(y, h.y - 6 + Math.sin(t * 3) * 1, g)
  }
  return { x, y, up: q }
}

/** His open hand (the picture reaches out to the left) and the Key Stone on his lapel, where he stands. */
const hand = (s: S) => {
  const z = spriteSize(s.p.trainer)
  return { x: s.L.foe.x - z.w / 2 + Math.round(z.w * 0.11), y: s.L.foe.y + 2 - z.h + Math.round(z.h * 0.33) }
}
const lapel = (s: S) => {
  const z = spriteSize(s.p.trainer)
  return { x: s.L.foe.x - z.w / 2 + Math.round(z.w * 0.8), y: s.L.foe.y + 2 - z.h + Math.round(z.h * 0.4) }
}

/**
 * Steven at a scale (far off, smaller): scaled first, then rimmed a pixel round, so the rim stays whole at any size
 * (a sprite's own outline, scaled down, breaks up). `dark` −1: only his shape, black; else his picture darkened that
 * much. At full size it lands exactly where the reveal draws him.
 */
function walker(g: G, s: S, x: number, y: number, k: number, o: { dark: number; rim: string }) {
  const key = s.p.trainer
  const fr = spriteFrame(key)
  if (!fr) return
  const w = Math.max(1, Math.round(fr.width * k))
  const h = Math.max(1, Math.round(fr.height * k))
  if (s.tmp.width < w + 2 || s.tmp.height < h + 2) {
    s.tmp.width = Math.max(s.tmp.width, w + 2)
    s.tmp.height = Math.max(s.tmp.height, h + 2)
    s.tmp.g.imageSmoothingEnabled = false
  }
  const b = s.tmp.g
  b.clearRect(0, 0, s.tmp.width, s.tmp.height)
  const rim = silhouette(key, o.rim)!
  for (const [ox, oy] of [
    [0, 1],
    [2, 1],
    [1, 0],
    [1, 2],
  ] as const)
    b.drawImage(rim, ox, oy, w, h)
  if (o.dark < 0) b.drawImage(silhouette(key, '#05070c')!, 1, 1, w, h)
  else {
    b.drawImage(fr, 1, 1, w, h)
    if (o.dark > 0) {
      b.globalAlpha = o.dark
      b.drawImage(silhouette(key, '#0a1020')!, 1, 1, w, h)
      b.globalAlpha = 1
    }
  }
  g.drawImage(s.tmp, 0, 0, w + 2, h + 2, Math.round(x - w / 2) - 1, Math.round(y - h) - 1, w + 2, h + 2)
}

/** A dotted line of light: only the pixels the dither lets through at strength k. */
function dline(g: G, x0: number, y0: number, x1: number, y1: number, c: string, k: number) {
  const n = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))))
  g.fillStyle = c
  for (let i = 0; i <= n; i++) {
    const x = Math.round(lerp(x0, x1, i / n))
    const y = Math.round(lerp(y0, y1, i / n))
    if (k >= 1 || bayer(x, y) < k) g.fillRect(x, y, 1, 1)
  }
}

const q8 = (v: number) => Math.round(clamp(v) * 8) / 8

export const stevenChampion = championCinema<X>({
  id: 'steven',
  reveal: REVEAL,
  seed: 376,
  aura: ['#ffffff', '#c8e8ff', '#5a9ad8', '#16243e'],
  flash: '#e8f4ff',
  sample: { trainer: '/trainers/classes/hoenn/steven.png', name: 'Steven', lead: 376, ace: 346, team: 3 },
  extras: [376],
  setup(st, r) {
    // Each footfall lights two seams out from under Metagross, the last the longest, up across the whole wall.
    const root = (i: number, dx: number) => [MG_X[i + 1]! + dx, footAt(MG_X[i + 1]! + dx) - 3] as const
    const nets = [
      veins(r, ...root(0, -18), STEPS[0] + 0.04, -2.6, 12),
      veins(r, ...root(0, 16), STEPS[0] + 0.06, -0.5, 11),
      veins(r, ...root(1, -10), STEPS[1] + 0.04, -2.2, 19),
      veins(r, ...root(1, 22), STEPS[1] + 0.06, -0.8, 18),
      veins(r, ...root(2, -4), STEPS[2] + 0.04, -1.9, 30),
      veins(r, ...root(2, 8), STEPS[2] + 0.06, -1.1, 30),
    ]
    const stones: Stone[] = []
    const free = (x: number, y: number) =>
      !(x > ARCH.x0 - 4 && x < ARCH.x1 + 4 && y > ARCH.top - 4) &&
      !(x > FALLS.x0 - 4 && x < FALLS.x1 + 4) &&
      Math.hypot((x - HOLE.x) / (HOLE.rx + 6), (y - HOLE.y) / (HOLE.ry + 6)) > 1
    // In the roof: a ceiling of glints the camera tilts past.
    for (let i = 0; i < 30; i++) {
      const x = r.range(4, W - 4)
      const y = r.range(-TOP + 4, -14)
      if (!free(x, y)) continue
      stones.push({
        kind: r.pick(KINDS),
        r: r.int(1, 2),
        hx: x,
        hy: y,
        fx: x,
        fy: y,
        lit: 0,
        out: Infinity,
        z: 0,
        spin: r.range(2, 5),
        ph: r() * 6,
        roof: true,
      })
    }
    /** A stone that rises, from (x, y): in the wall it drifts out a little, off the floor it rises high. */
    const rise = (x: number, y: number, wall: boolean, lit: number) => {
      let fx = x + r.range(-8, 8) + (wall ? (x - MG_X[3]) * 0.08 : 0)
      const fy = wall ? y - r.range(8, 20) : y - r.range(26, 54)
      // Never over the champion's own figure once it hangs in the air.
      if (fx > 144 && fx < 206 && fy > 16 && fy < 100) fx = fx < 175 ? fx - 36 : fx + 36
      stones.push({
        kind: r() < 0.15 ? 'steel' : r.pick(KINDS.slice(0, 5)),
        r: wall ? r.int(2, 3) : r.int(2, 4),
        hx: x,
        hy: y,
        fx,
        fy: Math.max(8, fy),
        lit,
        // They tear out nearest Metagross first.
        out: T_RISE + 0.04 + Math.hypot(x - MG_X[3], y - MG_Y) * 0.0022 + r() * 0.06,
        z: wall ? 0 : y,
        spin: r.range(2, 6),
        ph: r() * 6,
        roof: false,
      })
    }
    // In the seams: the light reaches them as it runs along.
    for (const n of nets)
      for (let i = 3; i < n.segs.length; i += r.int(5, 8)) {
        const [x, y, , , d] = n.segs[i]!
        if (free(x, y) && y > 4) rise(x, y, true, n.at + d / VEIN_SPEED)
      }
    // On the floor: dull pebbles until they light as they rise.
    for (let i = 0; i < 14; i++) {
      const x = r.range(44, 236)
      const y = r.range(84, 128)
      if (x < 70 && y > 116) continue
      rise(x, y, false, T_RISE - 0.05)
    }
    // The rarest: a big sapphire high in the wall, which comes down into his hand.
    stones.push({
      kind: 'sapphire',
      r: 4,
      hx: 134,
      hy: 26,
      fx: 140,
      fy: 22,
      lit: STEPS[2] + 0.3,
      out: T_RISE + 0.12,
      z: 0,
      spin: 3,
      ph: 1,
      roof: false,
      rare: true,
    })
    st.screenShakes.push(
      [STEPS[0], 0.3, 2],
      [STEPS[1], 0.3, 2],
      [STEPS[2], 0.4, 3],
      [T_RISE, 0.5, 1],
      [T_BLAZE, 0.3, 2],
    )
    return {
      buf: canvas(W, H),
      fbuf: canvas(W, H),
      tmp: canvas(100, 100),
      cave: cavern(r),
      sky: sky(),
      near: near(r),
      stones,
      nets,
      motes: new Particles(),
      spray: new Particles(),
    }
  },
  step(s, t, dt) {
    const r = s.r
    s.motes.update(dt)
    s.spray.update(dt)
    const cy = camY(t)
    // Dust motes drifting in the moon's shaft.
    if (r() < 0.35) {
      const y = r.range(HOLE.y + 10, MG_Y)
      const q = clamp((y - HOLE.y) / (MG_Y + 10 - HOLE.y))
      s.motes.add({
        x: lerp(HOLE.x, HOLE.x + LEAN, q) + r.range(-1, 1) * lerp(HOLE.rx * 0.7, 36, q),
        y,
        vx: r.range(-2, 2),
        vy: r.range(2, 6),
        life: r.range(1.5, 2.5),
        size: 1,
        shape: 'px',
        colors: ['#5a6a8a', '#8a9ac0', '#5a6a8a'],
      })
    }
    // The waterfall's spray off the pool.
    if (r() < 0.7)
      s.spray.add({
        x: r.range(FALLS.x0, FALLS.x1),
        y: FALLS.pool - 1,
        vx: r.range(-14, 14),
        vy: -r.range(6, 22),
        ay: 40,
        life: r.range(0.4, 0.8),
        size: 1,
        shape: 'px',
        colors: ['#c8e0ff', '#6a8ab0', '#3a4a6a'],
      })
    // Each footfall: dust shaken off the roof, grit kicked up at its feet.
    STEPS.forEach((at, i) => {
      if (!within(t, at, at + dt)) return
      const m = metagross(at)
      for (let k = 0; k < 12 + i * 8; k++)
        s.fx.add({
          x: r.range(0, W),
          y: cy - 2,
          vx: r.range(-4, 4),
          vy: r.range(30, 70),
          ay: 120,
          life: r.range(0.8, 1.4),
          size: 1,
          shape: 'px',
          colors: ['#5a6478', '#3a4256'],
        })
      for (let k = 0; k < 18; k++)
        s.fx.add({
          x: m.x + r.range(-30, 30),
          y: MG_Y + r.range(-1, 2),
          vx: r.range(-40, 40),
          vy: -r.range(10, 40),
          ay: 140,
          drag: 1.5,
          life: r.range(0.4, 0.7),
          size: r.int(1, 2),
          shape: 'sq',
          colors: ['#4c5a74', '#313d56', '#1b2334'],
        })
    })
    // Each stone tearing out of the rock: a puff of grit where it was.
    for (const o of s.stones)
      if (!o.roof && within(t, o.out, o.out + dt))
        for (let k = 0; k < 5; k++)
          s.fx.add({
            x: o.hx + r.range(-2, 2),
            y: o.hy + r.range(-2, 2),
            vx: r.range(-30, 30),
            vy: r.range(-20, 10),
            ay: 160,
            life: r.range(0.4, 0.8),
            size: 1,
            shape: 'px',
            colors: ['#6a7a92', '#3a4256', '#242e43'],
          })
    // Magnet Rise: motes of grit pulled up off the floor under it.
    if (t > T_RISE && t < REVEAL + 1 && r() < 0.6) {
      const m = metagross(t)
      s.fx.add({
        x: m.x + r.range(-34, 34),
        y: MG_Y + r.range(-2, 4),
        vx: r.range(-3, 3),
        vy: -r.range(16, 34),
        life: r.range(0.6, 1),
        size: 1,
        shape: 'px',
        colors: ['#8ad8ff', '#4c6a8a', '#242e43'],
      })
    }
    // The collection blazing: sparks off every stone.
    if (within(t, T_BLAZE, T_BLAZE + dt))
      for (const o of s.stones) {
        if (o.roof) continue
        const p = stoneAt(s, o, t)
        for (let k = 0; k < 3; k++)
          s.fx.add({
            x: p.x,
            y: p.y,
            vx: r.range(-50, 50),
            vy: r.range(-50, 50),
            drag: 3,
            life: r.range(0.3, 0.6),
            size: 1,
            shape: r() < 0.4 ? 'star' : 'px',
            colors: ['#ffffff', GEMS[o.kind][0], GEMS[o.kind][1]],
          })
      }
  },
  back(g, s, t, k) {
    if (k <= 0) return
    const b = s.buf.g
    const cy = camY(t)
    const oy = Math.round(-TOP - cy)
    // The night through the hole (it moves less than the roof: it is far away), a shooting star across it.
    b.drawImage(s.sky, 0, Math.round(-40 - (cy + TOP) * 0.55))
    const sq = span(t, T_SHOOT, T_SHOOT + 0.32)
    if (sq > 0 && sq < 1) {
      const sx = lerp(HOLE.x - 30, HOLE.x + 30, sq)
      const sy = lerp(HOLE.y - 8, HOLE.y + 4, sq) - cy
      line(b, sx, sy, sx - 9, sy - 3, '#6a8ac8')
      line(b, sx, sy, sx - 4, sy - 1, '#ffffff')
    }
    b.drawImage(s.cave, 0, oy)
    // The moon's shaft down through the dark: thin dither, brighter where it starts.
    shaft(b, t, cy)
    // Moving through the translate below: everything in the stage's own coordinates, the camera's tilt applied.
    b.save()
    b.translate(0, -Math.round(cy))
    s.motes.draw(b)
    falls(b, s, t)
    // The ore veins, each network lit by a footfall: a white front running out along it, a glow left behind.
    for (const n of s.nets) drawVeins(b, n, t)
    // The stones still in the rock, and those risen behind the champion.
    const st = steven(s, t)
    // The light web runs from his lapel out to every stone: behind him (he stands in front of its heart), and behind
    // Metagross for the stones in the wall.
    drawStones(b, s, t, (o) => o.z <= MG_Y)
    if (t > T_WEB0) web(b, s, t, (o) => o.z <= MG_Y)
    drawMetagross(b, t)
    drawStones(b, s, t, (o) => o.z > MG_Y && o.z <= st.depth)
    if (t > T_WEB0) web(b, s, t, (o) => o.z > MG_Y && o.z <= st.depth)
    b.restore()
    const sh = screenShake(t, s.screenShakes)
    if (sh.x || sh.y) rect(g, 0, 0, W, H, '#05060b')
    dissolve(g, s.buf, k, sh.x, sh.y)
  },
  before(g, s, t) {
    if (t < T_WALK0) return
    const st = steven(s, t)
    const sh = screenShake(t, s.screenShakes)
    const x = Math.round(st.x) + sh.x
    const y = Math.round(st.y) + sh.y
    // A shape against the tunnel's glow; lit by his stones as he comes out among them; full colour as the Key Stone
    // flares (the reveal's own flash finishes it).
    const lit = span(t, T_WALK0 + 0.5, T_KEY + 0.3)
    walker(g, s, x, y, st.k, {
      dark: lit < 0.35 ? -1 : q8(0.85 * (1 - lit)),
      rim: t > T_KEY ? (Math.floor(t * 16) % 2 ? VEIN[1] : VEIN[2]) : lit < 0.35 ? '#34557e' : '#2a4a6a',
    })
  },
  front(g, s, t, k) {
    if (k <= 0) return
    const f = s.fbuf.g
    f.clearRect(0, 0, W, H)
    const cy = camY(t)
    const st = steven(s, t)
    f.save()
    f.translate(0, -Math.round(cy))
    drawStones(f, s, t, (o) => o.z > Math.max(MG_Y, st.depth))
    if (t > T_WEB0) web(f, s, t, (o) => o.z > Math.max(MG_Y, st.depth))
    f.restore()
    if (t > T_KEY) keyStone(f, s, t)
    // The rock in close, moving faster than the cavern as the camera tilts.
    f.drawImage(s.near, 0, Math.round(H - s.near.height - cy * 1.5))
    const sh = screenShake(t, s.screenShakes)
    dissolve(g, s.fbuf, k, sh.x, sh.y)
    // The collection blazing: a flash (0.34 s before the reveal's own).
    if (within(t, T_BLAZE, T_BLAZE + 0.08)) screenFlash(g, '#e8f4ff', 0.4)
  },
  sounds: [
    [
      0.02,
      () => (
        hiss(2.6, { freq: 700, type: 'lowpass', vol: 0.05 }),
        tone(55, 1.6, { type: 'sine', vol: 0.05 })
      ),
    ],
    [T_SHOOT, () => tone(2400, 0.3, { type: 'triangle', vol: 0.015, slide: -1400 })],
    [0.9, () => hiss(2.5, { freq: 900, type: 'lowpass', vol: 0.04 })],
    ...STEPS.map(
      (at, i) =>
        [
          at,
          () => (
            tone(196 - i * 12, 0.45, { type: 'square', vol: 0.035, slide: -40 }),
            tone(1318, 0.3, { type: 'triangle', vol: 0.02 + i * 0.006 }),
            tone(50, 0.5, { type: 'sine', vol: 0.14 + i * 0.03, slide: -14 }),
            hiss(0.25, { freq: 2800, vol: 0.04 })
          ),
        ] as const,
    ),
    ...STEPS.map(
      (at, i) =>
        [
          at + 0.08,
          () =>
            [1568, 1976, 2349, 2637]
              .slice(0, 2 + i)
              .forEach((fq, j) => tone(fq, 0.18, { type: 'triangle', vol: 0.012, at: j * 0.06 })),
        ] as const,
    ),
    [STEPS[0] + 0.05, () => tone(880, 0.5, { type: 'sine', vol: 0.02, slide: -200 })],
    [
      T_RISE,
      () => (
        fxSound('psychic.focus'),
        tone(70, 1.4, { type: 'sawtooth', vol: 0.03, slide: 50 }),
        hiss(0.8, { freq: 300, slide: 1800, vol: 0.05 })
      ),
    ],
    [
      T_RISE + 0.1,
      () =>
        [0, 0.07, 0.13, 0.22, 0.3].forEach((a) =>
          tone(2093 + a * 900, 0.04, { type: 'square', vol: 0.012, at: a }),
        ),
    ],
    ...[0, 1, 2, 3, 4, 5].map(
      (i) => [T_WALK0 + 0.1 + i * 0.17, () => tone(620, 0.04, { type: 'triangle', vol: 0.025 })] as const,
    ),
    [T_HAND + 0.2, () => tone(1760, 0.5, { type: 'sine', vol: 0.03, slide: 400 })],
    [T_KEY, () => fxSound('mega.key')],
    [
      T_WEB0,
      () =>
        [1047, 1319, 1568, 2093, 2637].forEach((fq, i) =>
          tone(fq, 0.25, { type: 'triangle', vol: 0.02, at: i * 0.045 }),
        ),
    ],
    [
      T_BLAZE,
      () => (
        tone(2093, 0.6, { type: 'sine', vol: 0.03 }),
        tone(1568, 0.6, { type: 'sine', vol: 0.03 }),
        hiss(0.5, { freq: 4000, vol: 0.03 })
      ),
    ],
    [
      REVEAL,
      () => (
        tone(98, 0.7, { type: 'square', vol: 0.03, slide: -30 }),
        tone(49, 0.8, { type: 'sine', vol: 0.14 }),
        hiss(0.6, { freq: 1600, vol: 0.06 })
      ),
    ],
  ],
})

// ---------------------------------------------------------------------------------------------------------------- drawing
/** The moon's light falling through the hole: a widening shaft of sparse dither. */
function shaft(g: G, t: number, cy: number) {
  // Added on, not painted over: the rock under it shows through, lit.
  g.globalCompositeOperation = 'lighter'
  for (let y = Math.max(HOLE.y + 4, Math.round(cy)); y < Math.min(MG_Y + 4, cy + H); y++) {
    const q = (y - HOLE.y) / (MG_Y + 10 - HOLE.y)
    const cx = lerp(HOLE.x, HOLE.x + LEAN, q)
    const hw = lerp(HOLE.rx * 0.8, 40, q)
    const core = hw * 0.6
    const sy = Math.round(y - cy)
    // Brighter high up, thinning out as it spreads; its edges dithered.
    const c = q < 0.3 ? '#121a2c' : q < 0.65 ? '#0e1524' : '#0a101c'
    rect(g, cx - core, sy, core * 2 + 1, 1, c)
    rect(g, cx - hw, sy, hw - core, 1, pattern(g, c, 7))
    rect(g, cx + core + 1, sy, hw - core, 1, pattern(g, c, 7))
    // Streaks drifting slowly across it.
    for (let i = 0; i < 4; i++) {
      const u = ((i * 0.27 + t * 0.03 + q * 0.12) % 1) * 2 - 1
      rect(g, cx + u * core, sy, 2, 1, '#0c1424')
    }
  }
  g.globalCompositeOperation = 'source-over'
}

/** The waterfall down the left wall: white streaks sliding down a dark-blue sheet, foam at its foot. */
function falls(g: G, s: S, t: number) {
  const { x0, x1, top, pool } = FALLS
  for (let x = x0; x <= x1; x++) {
    const e = (x - x0) / (x1 - x0)
    const edge = e < 0.15 || e > 0.85
    for (let y = top; y < pool; y++) {
      // Streaks of light sliding down, each column its own speed.
      const ph = (y - t * (90 + ((x * 37) % 23))) * 0.18 + x * 1.7
      const v = Math.sin(ph) * 0.5 + 0.5
      rect(g, x, y, 1, 1, edge ? '#2a4060' : v > 0.82 ? '#e8f4ff' : v > 0.45 ? '#7a9ac8' : '#3a5480')
    }
  }
  // The lip it pours over, and the white water at its foot.
  rect(g, x0 - 2, top - 1, x1 - x0 + 5, 2, ROCK[5])
  for (let i = 0; i < 10; i++) {
    const fx = x0 - 6 + ((i * 7 + Math.floor(t * 20) * 3) % (x1 - x0 + 12))
    rect(g, fx, pool - 2 + (i % 2), 2, 1, i % 3 ? '#c8e0ff' : '#ffffff')
  }
  s.spray.draw(g)
}

function drawVeins(g: G, n: Vein, t: number) {
  const front = t < n.at ? -1 : (t - n.at) * VEIN_SPEED
  const blaze = pulse(t, T_BLAZE - 0.05, T_BLAZE + 0.45)
  for (const [x0, y0, x1, y1, d] of n.segs) {
    // Unlit: a faint silvery seam in the rock.
    if (d > front) {
      dline(g, x0, y0, x1, y1, ROCK[5], 0.3)
      continue
    }
    const behind = front - d
    // The front: white; just behind it pale cyan; then it settles to a glowing seam, brighter as the stones blaze.
    if (behind < 10) line(g, x0, y0, x1, y1, VEIN[0])
    else if (behind < 50) line(g, x0, y0, x1, y1, VEIN[1])
    else {
      line(g, x0, y0, x1, y1, blaze > 0.4 ? VEIN[2] : VEIN[3])
      if (blaze > 0) dline(g, x0, y0, x1, y1, VEIN[1], blaze)
    }
  }
}

/** Every stone the filter takes: a glint in the rock until the veins light it, then up into the air, turning. */
function drawStones(g: G, s: S, t: number, take: (o: Stone) => boolean) {
  const blaze = pulse(t, T_BLAZE - 0.04, T_BLAZE + 0.45)
  for (const o of s.stones) {
    if (!take(o)) continue
    const p = stoneAt(s, o, t)
    const lit = t >= o.lit
    const turn = Math.floor((t * o.spin + o.ph) * (p.up > 0 ? 1 : 0.3)) % 8
    // Its shadow on the floor as it rises off it.
    if (!o.roof && o.z > 0 && p.up > 0) {
      const w = Math.max(1, Math.round(o.r * (1.4 - 0.8 * p.up)))
      rect(g, o.hx - w, o.hy + o.r, w * 2 + 1, 1, ROCK[0])
    }
    if (o.roof) {
      // The roof's glints: a pixel that catches the light now and then.
      const on = Math.floor(t * 3 + o.ph * 7) % 5 === 0
      const im = gem(o.kind, o.r, turn, !on)
      g.drawImage(im, Math.round(p.x - o.r), Math.round(p.y - o.r))
      if (on) rect(g, p.x, p.y - o.r - 1, 1, 1, '#ffffff')
      continue
    }
    // Lit by the veins: a glow round it, stronger as it blazes.
    if (lit) {
      const gl = o.rare ? 9 : o.r + 4
      const a = q8((p.up > 0 ? 0.55 : 0.4) + 0.45 * blaze)
      if (a > 0) g.drawImage(glow(gl, GEMS[o.kind][2], 1.6, a), Math.round(p.x - gl), Math.round(p.y - gl))
    }
    if (!lit) {
      // Still dull in the rock: a lump with one pixel of its colour showing, glinting now and then.
      g.drawImage(gem(o.kind, o.r, 0, true), Math.round(p.x - o.r), Math.round(p.y - o.r))
      continue
    }
    const im = gem(o.kind, o.r, turn, false)
    g.drawImage(im, Math.round(p.x - o.r), Math.round(p.y - o.r))
    // A twinkle now and then; all of them at once as the collection blazes.
    const tw = blaze > 0.5 || Math.floor(t * 4 + o.ph * 5) % 9 === 0
    if (tw) {
      const n = blaze > 0.5 ? o.r + 1 : o.r
      rect(g, p.x - n, p.y - o.r + 1, n * 2 + 1, 1, '#ffffff')
      rect(g, p.x, p.y - o.r + 1 - n, 1, n * 2 + 1, '#ffffff')
    }
    // Clicks in the rock as the front passes: the stone flares white for a beat.
    if (lit && t < o.lit + 0.12) rect(g, p.x - 1, p.y - 1, 3, 3, '#ffffff')
  }
}

/**
 * Metagross out of the dark: three heavy steps into the moonlight, its eyes lit red; then the hum, its X glowing, and
 * it lifts off on its magnetism, rings pulsing down from it to the floor.
 */
function drawMetagross(g: G, t: number) {
  const key = spriteKey(376, false)
  const z = spriteSize(key)
  const m = metagross(t)
  // Its shadow on the floor, smaller as it rises.
  const sw = Math.round(z.w * 0.42 * (1 - 0.3 * m.lift))
  for (let dx = -sw; dx <= sw; dx++)
    if ((1 - Math.abs(dx) / sw) * 1.4 > bayer(m.x + dx, MG_Y)) rect(g, m.x + dx, MG_Y + 1, 1, 2, ROCK[0])
  // The pulse it lifts off with: a ring of its field racing out across the floor, tearing the stones out as it goes.
  const pq = span(t, T_RISE, T_RISE + 0.5)
  if (pq > 0 && pq < 1) {
    const e = ease.outC(pq)
    ring2(g, m.x, MG_Y + 1, Math.round(lerp(20, 200, e)), Math.round(lerp(4, 40, e)), VEIN[1], 1 - pq)
    ring2(g, m.x, MG_Y + 1, Math.round(lerp(16, 180, e)), Math.round(lerp(3, 36, e)), VEIN[0], 0.8 * (1 - pq))
  }
  // The magnetic field holding it up: ripples running out over the floor from under it, thinning as they spread.
  if (m.lift > 0)
    for (let i = 0; i < 2; i++) {
      const ph = ((t - T_RISE) * 1.1 + i / 2) % 1
      const rx = Math.round(lerp(z.w * 0.3, z.w * 0.9, ph))
      const ry = Math.round(lerp(3, 9, ph))
      const k = (1 - ph) * m.lift
      if (k > 0.1) ring2(g, m.x, MG_Y + 1, rx, ry, k > 0.5 ? VEIN[1] : VEIN[2], k)
    }
  // Out of the dark into the moon's shaft: a black shape at the back, its top catching the light step by step, its
  // steel blue coming through, still mostly in shade.
  const light = span(t, STEPS[0] - 0.3, STEPS[2] + 0.3)
  if (light > 0) drawSprite(g, key, m.x, m.y - 1, { sil: light > 0.5 ? '#6a8ab8' : '#2a3a58' })
  if (light < 0.2) drawSprite(g, key, m.x, m.y, { sil: '#05070d' })
  else drawSprite(g, key, m.x, m.y, { tint: { color: '#060a14', a: q8(0.9 - 0.5 * light) } })
  const left = m.x - z.w / 2
  const top = m.y - z.h
  // The X across its face, glowing as it takes off and as the collection blazes.
  const xg = Math.max(0.75 * pulse(t, T_RISE - 0.15, T_RISE + 0.7), pulse(t, T_BLAZE - 0.1, T_BLAZE + 0.5))
  if (xg > 0)
    g.drawImage(
      glow(9, '#8ad8ff', 1.8, q8(0.7 * xg)),
      Math.round(left + z.w * 0.44 - 9),
      Math.round(top + z.h * 0.5 - 9),
    )
  // Its eyes: two red lights from its first step.
  if (t > STEPS[0] - 0.05) {
    const on = t < STEPS[0] + 0.08 ? 1.2 : 0.75 + 0.25 * Math.sin(t * 6)
    for (const [fx, fy] of [
      [0.365, 0.49],
      [0.535, 0.51],
    ] as const) {
      const ex = Math.round(left + z.w * fx)
      const ey = Math.round(top + z.h * fy)
      g.drawImage(glow(3, '#ff3a4a', 1.6, q8(Math.min(1, on))), ex - 3, ey - 3)
      rect(g, ex, ey, 1, 1, '#ffd0d0')
    }
  }
}

/** An ellipse's outline through the dither: only the pixels its strength lets through. */
function ring2(g: G, cx: number, cy: number, rx: number, ry: number, c: string, k: number) {
  const n = Math.max(24, Math.ceil((rx + ry) * 4))
  g.fillStyle = c
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const x = Math.round(cx + Math.cos(a) * rx)
    const y = Math.round(cy + Math.sin(a) * ry)
    if (bayer(x, y) < k) g.fillRect(x, y, 1, 1)
  }
}

/** The Key Stone on his lapel flaring: a white heart, a four-point star turning through its rainbow, a ring. */
function keyStone(g: G, s: S, t: number) {
  const st = steven(s, t)
  if (st.q < 1) return
  const L = lapel(s)
  const q = span(t, T_KEY, T_KEY + 0.25)
  const a = q8(Math.max(0.5, 1 - span(t, T_BLAZE, REVEAL)) * Math.min(1, q * 3))
  if (a <= 0) return
  g.drawImage(glow(8, '#ffffff', 1.8, a), L.x - 8, L.y - 8)
  const n = Math.round(2 + 6 * ease.outBack(q, 2) * (1 - 0.4 * span(t, T_BLAZE, REVEAL)))
  const c = KEY[Math.floor(t * 18) % KEY.length]!
  rect(g, L.x - n, L.y, n * 2 + 1, 1, c)
  rect(g, L.x, L.y - n, 1, n * 2 + 1, c)
  rect(g, L.x - 1, L.y - 1, 3, 3, '#ffffff')
  burstRing(g, L.x, L.y, span(t, T_KEY, T_KEY + 0.4), 30, 1, '#ffe8a8')
  // Its light rings out in the Key Stone's colours as it flares; a great white one as the collection blazes.
  KEY.slice(1).forEach((col, i) => {
    const kq = span(t, T_KEY + i * 0.04, T_KEY + 0.34 + i * 0.04)
    if (kq > 0 && kq < 1) {
      const R = Math.round(lerp(4, 54, ease.outC(kq)))
      ring2(g, L.x, L.y, R, R, col, 1 - kq)
    }
  })
  const bq = span(t, T_BLAZE, T_BLAZE + 0.36)
  if (bq > 0 && bq < 1) {
    const R = Math.round(lerp(10, 170, ease.outC(bq)))
    ring2(g, L.x, L.y, R, Math.round(R * 0.8), '#ffffff', 1 - bq)
    ring2(g, L.x, L.y, R - 3, Math.round((R - 3) * 0.8), VEIN[1], 0.8 * (1 - bq))
  }
}

/**
 * The threads of light from the Key Stone to every stone, nearest first, each a white head running out along a pale
 * line; as they all arrive the stones blaze; then they thin out. `near`: only the stones in front of him.
 */
function web(g: G, s: S, t: number, take: (o: Stone) => boolean) {
  const L = lapel(s)
  const list = s.stones
    // Every other stone: the rest light from their neighbours' blaze (a thread to each would be a white mesh).
    .filter((o, i) => !o.roof && !o.rare && take(o) && i % 2 === 0)
    .map((o) => ({ o, p: stoneAt(s, o, t) }))
    .map((e) => ({ ...e, d: Math.hypot(e.p.x - L.x, e.p.y - L.y) }))
  const flash = pulse(t, T_BLAZE - 0.03, T_BLAZE + 0.3)
  for (const { p, d } of list) {
    // Nearest first: a spark runs out along its thread, later the farther its stone; the thread it leaves fades,
    // and they all flash once more as the stones blaze.
    const at = lerp(T_WEB0, T_WEB1, clamp(d / 170))
    const q = span(t, at, at + 0.1)
    if (q <= 0) continue
    const x1 = p.x
    const y1 = p.y
    if (q < 1) {
      const tq = Math.max(0, q - 0.4)
      line(g, lerp(L.x, x1, tq), lerp(L.y, y1, tq), lerp(L.x, x1, q), lerp(L.y, y1, q), VEIN[1])
      rect(g, lerp(L.x, x1, q) - 1, lerp(L.y, y1, q) - 1, 2, 2, '#ffffff')
      continue
    }
    const keep = 0.8 * (1 - span(t, at + 0.1, at + 0.32))
    if (Math.max(keep, flash) > 0.05)
      dline(g, L.x, L.y, x1, y1, flash > keep ? VEIN[1] : VEIN[2], Math.max(keep, 0.45 * flash))
  }
}
