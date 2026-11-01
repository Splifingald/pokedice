// Lance's entrance (docs/56), on the battle stage: the Indigo Plateau at night, a dry storm rolling over the League.
// We look up at the storm first: the moon veiled, the clouds lit from inside, and in one flash a dragon's shadow in
// them. A roar shakes the sky and the storm flickers again; the camera comes down onto the League's terrace as
// Dragonite tears out of the clouds, black against the lightning, and sweeps round the Plateau in a wide hook, vapour
// trailing from its wingtips. It turns and dives straight at you until it fills the screen and roars past overhead; in
// its wake a man drops out of the sky, his cape streaming above him like a pair of wings. He lands on the dais in a
// crouch that cracks the stone and flares every brazier, the cape whipping down round him. Dragonite wheels back over
// the League's roof, gathers Hyper Beam and fires it into the sky: the beam blows the clouds open and its light falls
// on the Dragon Master.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  bayer,
  bolt,
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
  polyline,
  rect,
  rng,
  shade,
  span,
  type Canvas,
  type G,
  type Rng,
} from '../../../pixel'
import { drawSprite, spriteKey, spriteSize } from '../../../sprites'
import { H, screenFlash, W, within } from '../../../timeline'
import { championCinema, type ChampionState } from '../champion'
import { dGradient, dissolve, pulse, tri } from '../kit'

const REVEAL = 4.6
/** Lance's own Dragonite, whatever team this Lance has. */
const DRAGONITE = spriteKey(149, false)
/**
 * Always drawn on the canvas: a fight may keep its lead's sprite live on the page (sprites.ts `drawWithLive`), and with
 * some team that lead is this Dragonite; a look the page can't take keeps it here.
 */
const ON_CANVAS = { wave: { amp: 0 } } as const

const T_FLICK = 0.4
const T_SHADOW = 0.78
const T_ROAR = 0.95
const T_TILT0 = 1.0
const T_TILT1 = 1.95
const T_EMERGE = 1.15
/** Out of the storm and past the League; then, unseen, it climbs back into the cloud and comes about. */
const T_BY = T_EMERGE + 0.6
const T_TURN = 1.82
const T_DIVE = 2.0
const T_PASS = 2.64
const T_DROP = 2.66
const T_LAND = 3.16
const T_SWOOP = 3.24
const T_HOVER = 3.68
const T_CHARGE = 3.7
const T_BEAM = 4.2

/** Where the shadow shows in the storm, and Dragonite bursts out of it (with the camera down). */
const SHADOW = { x: 166, y: -24 }
/** Where it comes about in the cloud before its dive, a shape in the lightning (with the camera down). */
const TURN = { x: 118, y: 8 }
/** The terrace's far edge (the balustrade's foot) and where the League stands on it. */
const HZ = 88
/** Where Dragonite hovers to fire, over the League's roof: its feet, its size. */
const HOVER = { x: 78, y: 74 }
const HOVER_K = 0.72
/** The braziers flanking the dais (their feet), and the two big ones in the foreground. */
const BRAZIERS = [
  [128, 92],
  [218, 92],
] as const
const NEAR = [
  [12, 166],
  [229, 166],
] as const
/** How far each layer moves when the camera looks up at the storm (px): the nearer, the more. */
const SHIFT = { sky: 24, cloud: 50, range: 84, plateau: 124, near: 160 } as const
/** The storm's canvas: rows above the frame, for the camera looking up at it. */
const CT = 64
const CH = 140

const FIRE = ['#fff6c8', '#ffe08a', '#ffbe2e', '#ff8a1e', '#e0501e', '#a8281a', '#5a120c'] as const
/** Hyper Beam, its core to its edge. */
const BEAM = ['#ffffff', '#fff2b0', '#ffc84a', '#ff8a1e', '#d8401a'] as const
const CAPE = '#140812'
const LINING = '#7a1624'
const MOON_RIM = '#8088c8'

/** The camera looking up at the storm (1) or down at the terrace (0). */
const lift = (t: number) => 1 - ease.ioS(span(t, T_TILT0, T_TILT1))
const shiftOf = (t: number, d: number) => Math.round(d * lift(t))
/** A glow's strength in eighths: `glow` caches each strength it is asked for. */
const q8 = (v: number) => Math.round(clamp(v) * 8) / 8

/** A flicker 0..1 for a column of fire at x: two waves and a jitter that changes a few times a second. */
function flick(x: number, t: number) {
  const f = Math.floor(t * 24)
  const j = ((((x * 7919 + f * 104729) % 13) + 13) % 13) / 13
  return clamp(0.5 + 0.28 * Math.sin(x * 0.7 + t * 11) + 0.18 * Math.sin(x * 1.9 - t * 17) + (j - 0.5) * 0.3)
}

/** How the braziers burn: steady, flaring at the landing, higher with the beam. */
const fireAt = (t: number) => 1 + 1.4 * pulse(t, T_LAND, T_LAND + 0.5) + 0.35 * span(t, T_BEAM, REVEAL)
/** Which way the wind bends the flames (px at their tips): Dragonite's wake flattens them as it sweeps past. */
const leanAt = (t: number) => 2 * Math.sin(t * 3) - 9 * pulse(t, T_EMERGE + 0.25, T_BY + 0.2)

/** A brazier's flames over a bowl w wide at (cx, y): white-gold at the root, red at the tips, bent by the wind. */
function flames(g: G, cx: number, y: number, w: number, h: number, t: number, lean: number) {
  const x0 = cx - (w >> 1)
  for (let i = 0; i < w; i++) {
    const u = (i + 0.5) / w - 0.5
    const hh = Math.round(h * flick(x0 * 3 + i, t) * (1 - 2.6 * u * u))
    for (let k = 0; k < hh; k++) {
      const q = k / Math.max(1, hh)
      const c = clamp(Math.floor(q * 4.6 + bayer(x0 + i, y - k) * 1.3), 0, 6)
      rect(g, x0 + i + Math.round(lean * q * q), y - k, 1, 1, FIRE[c]!)
    }
  }
}

type Puff = readonly [number, number, number, number, number]
/**
 * A cloud bank of shaded puffs: each a dome lit from the upper left (the moon), the later ones in front, its colour
 * stepped through the ramp with the ordered dither. `dark` (per puff) sinks its belly into the storm.
 */
function bank(
  w: number,
  h: number,
  puffs: readonly Puff[],
  ramp: readonly string[],
  light: 'moon' | 'inside' | 'below' = 'moon',
): Canvas {
  const n = ramp.length - 1
  return shade(w, h, (x, y) => {
    for (let i = puffs.length - 1; i >= 0; i--) {
      const [cx, cy, rx, ry, dark] = puffs[i]!
      const nx = (x - cx) / rx
      const ny = (y - cy) / ry
      const d = nx * nx + ny * ny
      if (d > 1) continue
      const nz = Math.sqrt(1 - d)
      // Lit by the moon (upper left), from inside by lightning (its middle brightest), or from below by the beam.
      const lum =
        light === 'inside'
          ? 0.2 + 0.8 * nz - 0.15 * dark
          : light === 'below'
            ? 0.1 + 0.9 * Math.max(0, 0.7 * ny + 0.6 * nz) - 0.1 * dark
            : 0.12 +
              0.8 * Math.max(0, -0.5 * nx - 0.62 * ny + 0.6 * nz) -
              0.35 * dark -
              0.15 * Math.max(0, ny)
      return ramp[clamp(Math.round(clamp(lum) * n + bayer(x, y) - 0.5), 0, n)]!
    }
    return null
  })
}

/** The sky behind it all, from above the frame (the camera looks up at it first): indigo, stars, the moon. */
function sky(): Canvas {
  const cv = canvas(W, H + SHIFT.sky)
  const g = cv.g
  g.drawImage(
    dGradient(W, H + SHIFT.sky, ['#03030a', '#070716', '#0c0c24', '#15143a', '#241e4c', '#342a5c']),
    0,
    0,
  )
  const r = rng(1491)
  for (let i = 0; i < 60; i++) rect(g, r.int(0, W), r.int(0, 100), 1, 1, r() < 0.2 ? '#c8ccff' : '#5a5a8a')
  // The moon, a dithered halo round it, its dark side to the right.
  const my = 26 + SHIFT.sky
  g.drawImage(glow(30, '#2a2a5a', 1.2, 0.9), 40 - 30, my - 30)
  g.drawImage(glow(19, '#4a4a86', 1.5, 0.8), 40 - 19, my - 19)
  ellipse(g, 40, my, 11, 11, '#dfe4ff')
  ellipse(g, 43, my, 9, 11, '#c8d0f4')
  ellipse(g, 46, my, 6, 10, '#aab2e0')
  for (const [x, y, rr] of [
    [36, -4, 2],
    [41, 4, 3],
    [45, -5, 1],
    [34, 4, 1],
  ] as const)
    ellipse(g, x, my + y, rr, rr, '#b8c0ea')
  return cv
}

/** The storm overhead: a heavy bank, thinner on the left where the moon looks through. */
function stormPuffs(r: Rng): Puff[] {
  // In the frame's coordinates with the camera down (it sees the storm's belly); the canvas adds CT rows above.
  const out: Puff[] = []
  for (let i = 0; i < 18; i++)
    out.push([r.range(0, 290), r.range(-60, -34), r.range(26, 44), r.range(9, 14), 0.1])
  for (let i = 0; i < 24; i++)
    out.push([r.range(66, 290), r.range(-34, 14), r.range(24, 40), r.range(9, 14), 0])
  for (let i = 0; i < 16; i++)
    out.push([r.range(84, 290), r.range(14, 30), r.range(14, 26), r.range(6, 9), 0.5])
  for (let i = 0; i < 6; i++) out.push([r.range(0, 86), r.range(-30, 0), r.range(18, 30), r.range(5, 8), 0.2])
  // A ragged tongue drifting across the moon's foot.
  out.push([30, 38, 20, 4, 0.3], [64, 34, 16, 4, 0.4])
  return out.map(([x, y, a, b, d]) => [x, y + CT, a, b, d] as const)
}

/**
 * The ranges below the Plateau: the far one pale under the moon with Mt. Silver's snowy peak on the right, a nearer
 * one darker, and the sea of cloud filling the valleys between.
 */
function range(): Canvas {
  const far = [
    [-14, 58, 0.62],
    [30, 52, 0.7],
    [84, 56, 0.66],
    [140, 46, 0.72],
    [198, 26, 0.9],
    [250, 50, 0.7],
  ] as const
  const near = [
    [8, 72, 0.5],
    [70, 68, 0.55],
    [126, 70, 0.6],
    [176, 66, 0.5],
    [236, 70, 0.6],
  ] as const
  const ridge = (pk: readonly (readonly [number, number, number])[], x: number) => {
    let best = Infinity
    let at = 0
    for (const [px, py, s] of pk) {
      const y = py + Math.abs(x - px) * s + Math.sin(x * 0.9 + px) * 0.8 + Math.sin(x * 0.27) * 1.6
      if (y < best) {
        best = y
        at = px
      }
    }
    return { y: best, at }
  }
  const cv = shade(W, H, (x, y) => {
    const n = ridge(near, x)
    if (y >= n.y) {
      // The near range: the moon's side a slate blue, the other near black, a lit rim on the crest.
      if (y < n.y + 1) return '#3a3c66'
      const lit = x < n.at
      const crease = Math.abs(x - n.at) < 2 + (y - n.y) * 0.15
      if (crease) return '#141428'
      return lit ? (bayer(x, y) < 0.35 - (y - n.y) * 0.01 ? '#2c2c50' : '#1e1e3a') : '#121226'
    }
    const f = ridge(far, x)
    if (y < f.y) return null
    const dy = y - f.y
    const tall = f.y < 44
    if (tall && dy < 9 - Math.abs(x - f.at) * 0.08 + Math.sin(x * 1.3) * 2)
      return x < f.at ? '#e4e8ff' : '#8a90c0'
    if (dy < 1) return '#6a70a8'
    const lit = x < f.at
    // Gullies running down its lit flanks.
    const gully = lit && (x * 3 + y) % 9 === 0 && dy > 3
    if (gully) return '#3a3a68'
    return lit ? (bayer(x, y) < 0.5 - dy * 0.012 ? '#545a90' : '#3e4274') : '#2a2a50'
  })
  // The sea of cloud in the valleys, moonlit on top.
  const r = rng(1492)
  const sea: Puff[] = []
  for (let i = 0; i < 30; i++)
    sea.push([r.range(-10, W + 10), r.range(80, 92), r.range(10, 22), r.range(3, 6), 0])
  cv.g.drawImage(bank(W, H, sea, ['#262a52', '#3a3e6e', '#565c92', '#7a82b8', '#a8b0dc']), 0, 0)
  rect(cv.g, 0, 92, W, H - 92, '#262a52')
  return cv
}

/**
 * The Plateau: the League's hall at the back on the left (a red roof, a tower with the League's emblem, its windows
 * and doors lit), the terrace running to a balustrade over the drop, the dais in the middle of it.
 */
function plateau(F: { x: number; y: number }): Canvas {
  const cv = canvas(W, H)
  const g = cv.g
  // The terrace: dark slate going away to the balustrade, its joints in perspective.
  g.drawImage(dGradient(W, H - HZ, ['#221e30', '#1a1626', '#120e1a', '#0c0a12']), 0, HZ)
  for (let k = -14; k <= 14; k++) line(g, F.x - 20 + k * 9, HZ, F.x - 20 + k * 40, H, '#0e0a16')
  for (let y = HZ + 2, d = 2; y < H; y += d, d += 1.5) rect(g, 0, Math.round(y), W, 1, '#0e0a16')
  // The balustrade along the drop: a lit rail, balusters, the void showing between them.
  rect(g, 100, HZ - 9, W - 100, 2, '#4a4664')
  rect(g, 100, HZ - 9, W - 100, 1, '#6a6690')
  for (let x = 102; x < W; x += 4) {
    rect(g, x, HZ - 7, 2, 6, '#2a2640')
    rect(g, x, HZ - 6, 1, 4, '#3e3a58')
  }
  for (let x = 104; x < W; x += 28) {
    rect(g, x - 1, HZ - 12, 5, 12, '#2e2a44')
    rect(g, x - 1, HZ - 12, 5, 1, '#6a6690')
    rect(g, x - 1, HZ - 11, 1, 11, '#4a4664')
  }
  rect(g, 100, HZ - 1, W - 100, 2, '#2a2640')
  // The League's hall: two wings and a taller middle under red roofs, a tower over it.
  const wall = (x0: number, y0: number, x1: number, y1: number) => {
    g.drawImage(dGradient(x1 - x0, y1 - y0, ['#5a5a80', '#46466a', '#36365a']), x0, y0)
    rect(g, x0, y0, 2, y1 - y0, '#6e6e98')
    rect(g, x1 - 2, y0, 2, y1 - y0, '#2a2a48')
    for (let y = y0 + 4; y < y1; y += 5) rect(g, x0 + 2, y, x1 - x0 - 4, 1, '#3e3e62')
  }
  const roof = (x0: number, x1: number, yb: number, h: number, inset: number) => {
    for (let k = 0; k < h; k++) {
      const q = k / h
      const a = Math.round(x0 - 2 + inset * q)
      const b = Math.round(x1 + 2 - inset * q)
      rect(g, a, yb - k, b - a, 1, k % 2 ? '#5a1c22' : '#4a161c')
      rect(g, a, yb - k, 2, 1, '#8a3a32')
      rect(g, b - 1, yb - k, 1, 1, '#2a0a10')
    }
    rect(g, x0 - 3, yb, x1 - x0 + 6, 1, '#2a0a10')
    rect(g, Math.round(x0 - 2 + inset), yb - h, Math.round(x1 - x0 + 4 - inset * 2), 1, '#9a4a3a')
  }
  const window = (x: number, y: number, w: number, h: number) => {
    rect(g, x - 1, y - 1, w + 2, h + 2, '#22223a')
    rect(g, x, y, w, h, '#ffb84a')
    rect(g, x, y + h - 2, w, 2, '#e07a2a')
    rect(g, x + 1, y, w - 2, 1, '#fff0b0')
    rect(g, x + (w >> 1), y, 1, h, '#5a3a2a')
  }
  wall(10, 66, 40, HZ - 2)
  wall(72, 66, 104, HZ - 2)
  roof(10, 40, 65, 6, 6)
  roof(72, 104, 65, 6, 6)
  for (const x of [14, 24, 33, 76, 86, 96]) window(x, 72, 4, 7)
  wall(38, 52, 74, HZ - 2)
  roof(38, 74, 51, 7, 8)
  // The tower, its pointed roof and a gold finial.
  wall(48, 28, 64, 45)
  for (let k = 0; k < 14; k++) {
    const hw = Math.round(lerp(10, 0, k / 14))
    rect(g, 56 - hw, 27 - k, hw * 2, 1, k % 2 ? '#5a1c22' : '#4a161c')
    rect(g, 56 - hw, 27 - k, 1, 1, '#8a3a32')
  }
  rect(g, 55, 9, 2, 4, '#c8a040')
  rect(g, 55, 9, 1, 1, '#fff0a0')
  window(54, 32, 4, 8)
  // The League's emblem on the middle block, ringed in gold: a ball, red over white.
  const ex = 56
  const ey = 58
  ellipse(g, ex, ey, 6, 6, '#c8a040')
  ellipse(g, ex, ey, 5, 5, '#e8e8f4')
  for (let dy = -5; dy < 0; dy++) {
    const hw = Math.round(Math.sqrt(25 - dy * dy))
    rect(g, ex - hw, ey + dy, hw * 2 + 1, 1, '#c8302a')
  }
  rect(g, ex - 5, ey, 11, 1, '#1a1020')
  ellipse(g, ex, ey, 1, 1, '#1a1020')
  rect(g, ex, ey, 1, 1, '#ffffff')
  // The great doors, open, their light spilling down the steps.
  rect(g, 49, 68, 14, HZ - 70, '#22223a')
  rect(g, 50, 70, 12, HZ - 72, '#ffb84a')
  rect(g, 50, 70, 12, 2, '#fff0b0')
  rect(g, 55, 70, 2, HZ - 72, '#e07a2a')
  for (const x of [42, 68]) window(x, 66, 3, 8)
  // Red banners either side of the doors, a gold scale on each.
  for (const x of [44, 65]) {
    rect(g, x, 54, 4, 10, '#8a1a22')
    rect(g, x, 54, 1, 10, '#b0303a')
    rect(g, x, 54, 4, 1, '#c8a040')
    rect(g, x + 1, 64, 2, 1, '#8a1a22')
    rect(g, x + 1, 58, 2, 2, '#c8a040')
  }
  // Its steps down onto the terrace.
  for (let k = 0; k < 3; k++) rect(g, 44 - k * 3, HZ - 2 + k, 24 + k * 6, 1, k ? '#3e3a58' : '#5a5680')
  // The dais: a raised ring of pale stone, two gold rings inlaid.
  ellipse(g, F.x, F.y + 3, 44, 11, '#141020')
  ellipse(g, F.x, F.y + 1, 44, 11, '#34304a')
  ellipse(g, F.x, F.y + 1, 41, 10, '#26223a')
  ellipseLine(g, F.x, F.y + 1, 44, 11, '#4e4a6e', Math.PI, Math.PI * 2)
  ellipseLine(g, F.x, F.y + 1, 34, 8, '#8a6a2a')
  ellipseLine(g, F.x, F.y + 1, 24, 6, '#5a4420')
  // The braziers' stone pillars and bowls.
  for (const [bx, by] of BRAZIERS) pillar(g, bx, by, 16, 3)
  return cv
}

/**
 * A brazier: a fluted stone pillar standing on (x, y), h tall, `hw` its half-width, moonlit on its left, its own fire
 * warming its capital; a gold-rimmed bowl on top, widening upward.
 */
function pillar(g: G, x: number, y: number, h: number, hw: number) {
  rect(g, x - hw - 2, y - 3, hw * 2 + 5, 3, '#2a2640')
  rect(g, x - hw - 2, y - 3, hw * 2 + 5, 1, '#4a4664')
  rect(g, x - hw - 1, y - 5, hw * 2 + 3, 2, '#34304a')
  for (let dx = -hw; dx <= hw; dx++) {
    const c =
      dx === -hw
        ? '#5e5a86'
        : dx === hw
          ? '#18142a'
          : (dx + hw) % 3 === 2
            ? '#26223a'
            : dx < 0
              ? '#3e3a5a'
              : '#302c48'
    rect(g, x + dx, y - h, 1, h - 5, c)
  }
  // The fire's warmth on the top of the shaft, fading down it.
  for (let k = 0; k < Math.min(8, h - 6); k++)
    for (let dx = -hw; dx <= hw; dx++)
      if (bayer(x + dx, y - h + k) < 0.55 * (1 - k / 8)) rect(g, x + dx, y - h + k, 1, 1, '#6a3a32')
  rect(g, x - hw - 1, y - h - 2, hw * 2 + 3, 2, '#4a4664')
  rect(g, x - hw - 1, y - h - 2, hw * 2 + 3, 1, '#8a5a4a')
  const bw = hw * 2 + 6
  for (let k = 0; k < 4; k++) {
    const in_ = 3 - k
    rect(g, x - (bw >> 1) + in_, y - h - 3 - k, bw - in_ * 2 + 1, 1, k === 3 ? '#3a2a36' : '#221a2a')
  }
  rect(g, x - (bw >> 1) - 1, y - h - 7, bw + 3, 1, '#ffd27a')
  rect(g, x - (bw >> 1) - 1, y - h - 6, bw + 3, 1, '#a87a30')
}
/** The bowl's top above a pillar's foot: where its flames stand. */
const bowlTop = (h: number) => h + 7

type Fly = { x: number; y: number; k: number }

/**
 * Its fly-past, in the frame as the camera comes down: out of the storm's belly, a swoop down past the League's tower
 * close enough to shake the Plateau, and away out to the left under the moon.
 */
const BY = [
  [166, 23],
  [160, 100],
  [64, 126],
  [-64, 84],
] as const

/**
 * Where Dragonite is (its centre, its size): bursting out of the storm and sweeping past the League; gone, climbing
 * back into the cloud; then out of it again and straight at the camera.
 */
function flier(t: number): Fly | null {
  if (t < T_EMERGE || (t >= T_BY && t < T_DIVE)) return null
  let x: number
  let y: number
  let k: number
  if (t < T_BY) {
    const u = span(t, T_EMERGE, T_BY)
    const [a, b, c, d] = BY
    const v = 1 - u
    x = v * v * v * a[0] + 3 * v * v * u * b[0] + 3 * v * u * u * c[0] + u * u * u * d[0]
    y = v * v * v * a[1] + 3 * v * v * u * b[1] + 3 * v * u * u * c[1] + u * u * u * d[1]
    k = 0.3 + 0.5 * ease.outQ(Math.min(1, u * 1.6))
  } else {
    // Straight at the camera, growing until it fills the screen; then it roars on past overhead.
    const q = span(t, T_DIVE, T_PASS)
    k = lerp(0.5, 3.7, ease.inC(q))
    x = lerp(TURN.x, 168, ease.outQ(q))
    y = lerp(TURN.y, 36, ease.outQ(Math.min(1, q * 1.4))) - 30 * ease.inQ(q)
    const p = span(t, T_PASS, T_PASS + 0.16)
    if (p >= 1) return null
    y -= 320 * ease.inQ(p)
  }
  // A wingbeat's bob.
  return { x, y: y + Math.sin(t * 15) * 3 * k, k }
}

/** Dragonite coming back over the League's roof to hover there and fire: from the top left, into its hover. */
function hoverAt(t: number): Fly | null {
  if (t < T_SWOOP) return null
  const q = ease.outC(span(t, T_SWOOP, T_HOVER))
  const x = lerp(-40, HOVER.x, q)
  const y = lerp(-30, HOVER.y, q) - 18 * Math.sin(Math.PI * q) + Math.round(Math.sin(t * 6) * 1.5)
  // The beam's kick pushes it back down a little.
  const kick = 3 * pulse(t, T_BEAM, T_BEAM + 0.3)
  return { x, y: y + kick, k: lerp(0.5, HOVER_K, q) }
}

/** Its mouth, where the beam starts (the front sprite's head is up and to the left). */
function mouth(f: Fly) {
  const z = spriteSize(DRAGONITE)
  return { x: Math.round(f.x - z.w * f.k * 0.16), y: Math.round(f.y - z.h * f.k * 0.76) }
}

/**
 * Lance's cape behind him: anchored at his shoulders, its hem `ey` below them (above when it streams up). `inside`: its
 * crimson lining faces us (streaming up over him as he falls), else its black back.
 */
function cape(
  g: G,
  cx: number,
  sy: number,
  ey: number,
  spread: number,
  t: number,
  flutter: number,
  rim: string,
  inside: boolean,
) {
  const N = 12
  const pts: [number, number][] = []
  for (let i = 0; i <= N; i++) {
    const u = (i / N) * 2 - 1
    const w = Math.sin(t * 17 + u * 4.2) * flutter
    // The hem's middle trails furthest; its corners ride back toward the shoulders.
    const curve = (1 - u * u) * ey * 0.22 - Math.abs(ey) * 0.12 * u * u
    pts.push([cx + u * spread + w * 0.5, sy + ey + curve + w])
  }
  const aL = [cx - 7, sy] as const
  const aR = [cx + 7, sy] as const
  for (let i = 0; i < N; i++) {
    const a = i < N / 2 ? aL : aR
    tri(g, a[0], a[1], pts[i]![0], pts[i]![1], pts[i + 1]![0], pts[i + 1]![1], inside ? LINING : CAPE)
  }
  tri(g, aL[0], aL[1], aR[0], aR[1], pts[N / 2]![0], pts[N / 2]![1], inside ? LINING : CAPE)
  // Its folds, from the shoulders out to the hem: dark troughs, and on the lining a lit crest beside each.
  for (const i of [2, 4, 6, 8, 10]) {
    const fx = (aL[0] + aR[0]) / 2 + (i - N / 2) * 0.6
    line(g, fx, sy + Math.sign(ey) * 3, pts[i]![0], pts[i]![1], inside ? '#4a0c16' : '#22101c')
    if (inside) line(g, fx + 1, sy + Math.sign(ey) * 4, pts[i]![0] + 1, pts[i]![1], '#a82a30')
  }
  // Where the hem turns toward us the other side shows; the light catches its edge.
  for (let i = 0; i < N; i++)
    if (Math.sin(t * 17 + (((i + 0.5) / N) * 2 - 1) * 4.2) > 0.3)
      line(g, pts[i]![0], pts[i]![1], pts[i + 1]![0], pts[i + 1]![1], inside ? CAPE : LINING, 2)
  polyline(g, pts, rim)
}

type X = {
  buf: Canvas
  clouds: Canvas
  cloudBuf: Canvas
  litBuf: Canvas
  lit: Canvas
  fireLit: Canvas
  sky: Canvas
  range: Canvas
  plateau: Canvas
  capeBuf: Canvas
  cracks: [number, number][][]
  bolt: [number, number][]
  amb: Particles
}
type S = ChampionState<X>

/** Lightning in the clouds: two flickers, then the big one that shows the shadow. 0..1. */
function lightning(t: number) {
  const f = (a: number, b: number, v: number) => (within(t, a, b) ? v : 0)
  return Math.max(
    f(T_FLICK, T_FLICK + 0.05, 0.45),
    f(T_FLICK + 0.1, T_FLICK + 0.14, 0.3),
    f(T_SHADOW, T_SHADOW + 0.08, 1),
    f(T_SHADOW + 0.13, T_SHADOW + 0.2, 0.75),
    f(T_SHADOW + 0.26, T_SHADOW + 0.3, 0.45),
    // The roar's echo: the storm lit again round the shape, the shape gone.
    f(T_ROAR + 0.12, T_ROAR + 0.17, 0.5),
    f(T_ROAR + 0.24, T_ROAR + 0.27, 0.3),
    // Behind Dragonite as it bursts out, black against the light.
    f(T_EMERGE - 0.02, T_EMERGE + 0.05, 0.75),
    // As it comes about in the cloud: its shape again, smaller, nearer the middle.
    f(T_TURN, T_TURN + 0.06, 0.85),
    f(T_TURN + 0.11, T_TURN + 0.15, 0.55),
  )
}

/** Where Lance is before the reveal: dropping from under Dragonite's belly, nearer the camera, down onto the dais. */
function lanceAt(s: S, t: number) {
  const F = s.L.foe
  const q = span(t, T_DROP, T_LAND)
  // He leapt down off it: already falling, faster and faster.
  const fall = lerp(q, q * q, 0.55)
  // He falls away from the camera, shrinking to his own size; a crouch on landing, then he rises.
  const k = lerp(1.2, 1, ease.outQ(q))
  const crouch = pulse(t, T_LAND, T_LAND + 0.32)
  return {
    x: Math.round(lerp(F.x + 8, F.x, q)),
    y: Math.round(lerp(52, F.y + 2, fall)),
    sx: k * (1 + 0.08 * crouch),
    sy: k * (q < 1 ? 1.05 : 1 - 0.14 * crouch),
  }
}

export const lanceChampion = championCinema<X>({
  id: 'lance',
  shake: true,
  reveal: REVEAL,
  seed: 149,
  aura: ['#ffffff', '#ffc85a', '#e0402a', '#4a0a18'],
  flash: '#fff0c8',
  sample: {
    trainer: '/trainers/classes/johto/champion-lance.png',
    name: 'Champion Lance',
    lead: 130,
    ace: 149,
    team: 3,
  },
  extras: [149],
  setup(st, r) {
    const F = st.L.foe
    const puffs = stormPuffs(rng(1493))
    st.screenShakes.push(
      [T_SHADOW, 0.25, 1],
      [T_ROAR, 0.7, 2],
      [T_EMERGE + 0.32, 0.35, 1],
      [T_PASS - 0.1, 0.4, 2],
      [T_LAND, 0.5, 4],
      [T_BEAM, 0.6, 2],
    )
    return {
      buf: canvas(W, H),
      clouds: bank(W + 40, CH, puffs, ['#07071a', '#0e0e26', '#181838', '#24244c', '#363866', '#50548a']),
      cloudBuf: canvas(W + 40, CH),
      litBuf: canvas(W + 40, CH),
      lit: bank(
        W + 40,
        CH,
        puffs,
        ['#1e1e48', '#30306a', '#4a4a92', '#6e70bc', '#a0a6e8', '#dfe4ff'],
        'inside',
      ),
      fireLit: bank(
        W + 40,
        CH,
        puffs,
        ['#1e0e1e', '#3e1622', '#6a2622', '#a8421e', '#e88028', '#ffd27a'],
        'below',
      ),
      sky: sky(),
      range: range(),
      plateau: plateau(F),
      capeBuf: canvas(W, H),
      cracks: Array.from({ length: 9 }, (_, i) => {
        const a = (i / 9) * Math.PI * 2 + r.range(-0.2, 0.2)
        const len = r.range(18, 44)
        return bolt(r, F.x, F.y + 1, F.x + Math.cos(a) * len, F.y + 1 + Math.sin(a) * len * 0.26, 0.3, 3)
      }),
      bolt: bolt(r, 214, 20, 226, 74, 0.28, 5),
      amb: new Particles(),
    }
  },
  step(s, t, dt) {
    const r = s.r
    const F = s.L.foe
    s.amb.update(dt)
    const pl = shiftOf(t, SHIFT.plateau)
    // Embers off the braziers, blown with the wind.
    const heat = fireAt(t)
    for (const [bx, by] of BRAZIERS)
      if (r() < 0.25 * heat)
        s.amb.add({
          x: bx + r.range(-3, 3),
          y: by - 26 + pl,
          vx: leanAt(t) * 4 + r.range(-6, 6),
          vy: -r.range(16, 40),
          life: r.range(0.6, 1.2),
          size: 1,
          shape: 'px',
          colors: ['#fff6c8', '#ffbe2e', '#ff8a1e', '#a8281a'],
        })
    // Dragonite tearing out of the clouds: vapour flung out in streaks.
    if (within(t, T_EMERGE, T_EMERGE + dt * 1.5))
      for (let i = 0; i < 22; i++) {
        const a = r() * Math.PI * 2
        const v = r.range(50, 130)
        s.amb.add({
          x: SHADOW.x + r.range(-6, 6),
          y: SHADOW.y + shiftOf(t, SHIFT.cloud) + r.range(-3, 3),
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v * 0.6,
          drag: 3,
          life: r.range(0.4, 0.7),
          size: 1,
          shape: 'streak',
          trail: 0.06,
          colors: ['#c8ccf0', '#7a80b8', '#50548a'],
        })
      }
    // Its fly-past: the air torn along behind it.
    const by = flier(t)
    if (by && t < T_BY && t > T_EMERGE + 0.15 && r() < 0.8)
      s.fx.add({
        // In its wake, not across it.
        x: by.x + r.range(26, 60) * by.k,
        y: by.y + r.range(-34, 34) * by.k,
        vx: -r.range(280, 420),
        vy: r.range(-40, 10),
        life: 0.25,
        size: 1,
        shape: 'streak',
        trail: 0.04,
        colors: ['#c8ccff', '#8088c8', '#50548a'],
      })
    // The dive: the air rushing past, streaks flying out from the middle of the screen.
    if (t > T_DIVE + 0.2 && t < T_PASS + 0.1)
      for (let i = 0; i < 3; i++) {
        const a = r() * Math.PI * 2
        const v = r.range(260, 420)
        s.fx.add({
          x: W / 2 + Math.cos(a) * 20,
          y: H / 2 + Math.sin(a) * 14,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v * 0.7,
          life: 0.35,
          size: 1,
          shape: 'streak',
          trail: 0.05,
          colors: ['#c8ccff', '#8088c8', '#50548a'],
        })
      }
    // His fall: the wind tearing up past him.
    if (t > T_DROP && t < T_LAND && r() < 0.8) {
      const at = lanceAt(s, t)
      s.fx.add({
        x: at.x + r.range(-40, 40),
        y: at.y + r.range(0, 40),
        vx: r.range(-10, 10),
        vy: -r.range(380, 520),
        life: 0.2,
        size: 1,
        shape: 'streak',
        trail: 0.03,
        colors: ['#c8ccff', '#8088c8'],
      })
    }
    // The landing: chips of stone, a ring of dust rolling out, sparks thrown off every brazier.
    if (within(t, T_LAND, T_LAND + dt * 1.5)) {
      for (let i = 0; i < 40; i++) {
        const sd = r() < 0.5 ? -1 : 1
        s.fx.add({
          x: F.x + sd * r.range(6, 26),
          y: F.y + r.range(-1, 4),
          vx: sd * r.range(90, 230),
          vy: -r.range(0, 18),
          drag: 2.2,
          life: r.range(0.45, 0.8),
          size: r.int(2, 4),
          size1: 6,
          shape: 'smoke',
          colors: ['#3a3450', '#2a2640'],
          light: '#4a4460',
        })
      }
      for (let i = 0; i < 26; i++)
        s.fx.add({
          x: F.x + r.range(-16, 16),
          y: F.y,
          vx: r.range(-90, 90),
          vy: -r.range(60, 170),
          ay: 420,
          life: r.range(0.5, 0.9),
          size: r.int(1, 2),
          shape: 'sq',
          colors: ['#8a84a8', '#5a5478'],
        })
      for (const [bx, by] of BRAZIERS)
        for (let i = 0; i < 16; i++)
          s.fx.add({
            x: bx + r.range(-4, 4),
            y: by - 24,
            vx: r.range(-50, 50),
            vy: -r.range(60, 150),
            ay: 160,
            life: r.range(0.4, 0.8),
            size: 1,
            shape: 'sq',
            colors: [...FIRE],
          })
    }
    // Hyper Beam gathering: light drawn into Dragonite's mouth from all round it.
    const d = hoverAt(t)
    if (d && t > T_CHARGE && t < T_BEAM) {
      const m = mouth(d)
      for (let i = 0; i < 2; i++) {
        const a = r() * Math.PI * 2
        const dd = r.range(24, 44)
        s.fx.add({
          x: m.x + Math.cos(a) * dd,
          y: m.y + Math.sin(a) * dd,
          vx: -Math.sin(a) * 40,
          vy: Math.cos(a) * 40,
          home: { x: m.x, y: m.y, k: 900 },
          life: 0.6,
          size: 1,
          shape: r() < 0.4 ? 'plus' : 'sq',
          colors: ['#ffffff', '#fff2b0', '#ffc84a'],
        })
      }
    }
    // The beam sheds sparks all the way up.
    if (d && t > T_BEAM && t < REVEAL + 0.5) {
      const m = mouth(d)
      for (let i = 0; i < 2; i++) {
        const sd = r() < 0.5 ? -1 : 1
        s.fx.add({
          x: m.x + sd * 6,
          y: r.range(0, m.y),
          vx: sd * r.range(30, 90),
          vy: r.range(-40, 20),
          drag: 1.5,
          life: r.range(0.3, 0.6),
          size: 1,
          shape: 'sq',
          colors: [...BEAM],
        })
      }
    }
  },
  back(g, s, t, k) {
    if (k <= 0) return
    const b = s.buf.g
    const F = s.L.foe
    const flash = lightning(t)
    // The sky and the storm, the camera looking up at them first.
    b.drawImage(s.sky, 0, -20 + shiftOf(t, SHIFT.sky))
    const cy = -CT + shiftOf(t, SHIFT.cloud)
    const cx = -20 + Math.round(t * 5)
    const cb = s.cloudBuf.g
    cb.clearRect(0, 0, W + 40, CH)
    cb.drawImage(s.clouds, 0, 0)
    // Lightning inside the bank, lighting it from within round the strike; the big one shows the shadow in it.
    if (flash > 0) {
      const at =
        t < T_SHADOW
          ? { x: 92, y: -34, r: 56, sh: 0 }
          : t < T_ROAR
            ? { ...SHADOW, r: 84, sh: 1.5 }
            : t < T_EMERGE - 0.05
              ? { x: 120, y: -10, r: 56, sh: 0 }
              : t < T_TURN - 0.05
                ? { ...SHADOW, r: 60, sh: 0 }
                : { ...TURN, r: 60, sh: 0.6 }
      lightUp(s, s.lit, at.x - cx, at.y + CT, at.r, flash, at.sh)
    }
    // Hyper Beam lights the storm's belly gold and blows it open over Dragonite's head.
    const d = hoverAt(t)
    const beam = beamAt(t)
    const m = d && mouth(d)
    // Its light spreading along the storm's belly from where it strikes.
    const spread = 48 + 8 * Math.round(12 * ease.outC(span(t, T_BEAM, T_BEAM + 0.6)))
    if (m && beam > 0) lightUp(s, s.fireLit, m.x - cx, -cy, spread, beam)
    const hole = m ? 56 * ease.outC(span(t, T_BEAM, T_BEAM + 0.5)) : 0
    if (m && hole > 1) {
      cb.globalCompositeOperation = 'destination-out'
      ellipse(cb, m.x - cx, -cy - 8, Math.round(hole), Math.round(hole * 0.55), '#000000')
      cb.globalCompositeOperation = 'source-over'
    }
    b.drawImage(s.cloudBuf, cx, cy)
    // A bolt to the far range on the big flash.
    if (within(t, T_SHADOW, T_SHADOW + 0.1) || within(t, T_SHADOW + 0.13, T_SHADOW + 0.18)) {
      const dy = shiftOf(t, SHIFT.range)
      const pts = s.bolt.map(([x, y]) => [x, y + dy] as [number, number])
      polyline(b, pts, '#8a8ae0', 3)
      polyline(b, pts, '#ffffff', 1)
    }
    b.drawImage(s.range, 0, shiftOf(t, SHIFT.range))
    const pl = shiftOf(t, SHIFT.plateau)
    b.drawImage(s.plateau, 0, pl)
    // Dragonite out of the storm and round the Plateau, vapour streaming off its wingtips (in front of all of it once
    // near: its dive is drawn over the champion).
    if (t <= T_DIVE + 0.25) drawFlier(b, t)
    // The braziers' light on the terrace, and the beam's over everything once it fires.
    const heat = fireAt(t)
    for (const [bx, by] of BRAZIERS) {
      b.drawImage(glow(30, '#2e1a24', 1.1, q8(0.5 + 0.3 * heat)), bx - 30, by - 30 + pl)
      b.drawImage(glow(14, '#5a2a1e', 1.3, q8(0.4 + 0.3 * heat)), bx - 14, by - 22 + pl)
    }
    // The landing's cracks, glowing gold for a moment and then dark.
    const cr = span(t, T_LAND, T_LAND + 0.12)
    if (cr > 0) {
      const hot = 1 - span(t, T_LAND + 0.1, T_LAND + 0.9)
      for (const c of s.cracks) {
        const n = Math.max(2, Math.round(c.length * cr))
        polyline(b, c.slice(0, n), '#0a0610', 2)
        if (hot > 0) polyline(b, c.slice(0, n), hot > 0.5 ? '#ffe08a' : '#a8501e')
      }
      const ring = span(t, T_LAND, T_LAND + 0.4)
      if (ring < 1)
        ellipseLine(b, F.x, F.y + 1, Math.round(10 + 50 * ring), Math.round(3 + 12 * ring), '#8a84a8')
    }
    // The braziers' fires.
    const lean = leanAt(t)
    for (const [bx, by] of BRAZIERS)
      flames(b, bx, by - bowlTop(16) + pl, 11, Math.round(clamp(13 * heat, 3, 30)), t, lean)
    s.amb.draw(b)
    // Dragonite back over the League, gathering Hyper Beam, firing it into the sky.
    if (d) drawHover(b, t, d)
    // The big braziers in the foreground, black against their own fire.
    const nr = shiftOf(t, SHIFT.near)
    for (const [nx, ny] of NEAR) {
      pillar(b, nx, ny + nr, 38, 7)
      flames(b, nx, ny - bowlTop(38) + nr, 19, Math.round(clamp(20 * heat, 4, 40)), t + nx, lean * 1.6)
    }
    dissolve(g, s.buf, k)
  },
  before(g, s, t) {
    if (t < T_DROP) return
    const at = lanceAt(s, t)
    const z = spriteSize(s.p.trainer)
    const sy = at.y - z.h * at.sy * 0.7
    // Backlit by the moon as he falls, by the braziers once down, then the beam's gold.
    const rim =
      t < T_LAND
        ? MOON_RIM
        : t < T_BEAM
          ? Math.floor(t * 14) % 3
            ? '#ff8a3a'
            : '#ffbe5a'
          : Math.floor(t * 20) % 2
            ? '#ffe08a'
            : '#fff6c8'
    // The cape: streaming up above him in the fall, whipping down through a wide spread like wings as he lands, then
    // settling into the one he wears.
    const w = ease.outQ(span(t, T_LAND, T_LAND + 0.32))
    const settle = span(t, T_LAND + 0.32, T_LAND + 0.9)
    // Falling, it streams up and out from his shoulders like a pair of crimson wings.
    const ey = (t < T_LAND ? -16 : lerp(-16, lerp(46, 40, settle), w)) * at.sy
    const spread =
      (t < T_LAND ? 38 : lerp(38, 12, settle) + 16 * Math.sin(Math.PI * Math.min(1, w * 1.1))) * at.sx
    const fade = 1 - span(t, T_LAND + 0.7, T_BEAM - 0.1)
    if (fade > 0) {
      const cb = s.capeBuf.g
      cb.clearRect(0, 0, W, H)
      cape(cb, at.x, sy, ey, spread, t, t < T_LAND + 0.4 ? 4 : 1.5, rim, ey < 0)
      dissolve(g, s.capeBuf, fade)
    }
    // Night on him, deepest as he lands; the orb's light finds him, then the beam's.
    const dark =
      0.75 +
      0.125 * pulse(t, T_LAND - 0.1, T_LAND + 0.6) -
      0.125 * span(t, T_CHARGE, T_BEAM) -
      0.375 * span(t, T_BEAM, REVEAL - 0.05)
    drawSprite(g, s.p.trainer, at.x, at.y, {
      sx: at.sx,
      sy: at.sy,
      tint: { color: '#0c0812', a: Math.round(8 * dark) / 8 },
      outline: rim,
    })
  },
  front(g, _s, t) {
    // The lead Dragonite's dive at the camera, so near it fills the screen.
    if (t > T_DIVE + 0.25 && t < T_PASS + 0.2) drawFlier(g, t)
    if (within(t, T_SHADOW, T_SHADOW + 0.07)) screenFlash(g, '#c8ccff', 0.2)
    if (within(t, T_LAND, T_LAND + 0.07)) screenFlash(g, '#ffe8c0', 0.25)
    if (within(t, T_BEAM, T_BEAM + 0.08)) screenFlash(g, '#fff0b0', 0.3)
  },
  sounds: [
    [
      0.05,
      () => (
        hiss(1.6, { freq: 300, type: 'lowpass', vol: 0.05 }),
        tone(55, 1.2, { type: 'sine', vol: 0.04 })
      ),
    ],
    [T_FLICK + 0.15, () => tone(62, 0.6, { type: 'sine', vol: 0.06, slide: -20 })],
    [T_SHADOW, () => (fxSound('thunder.strike'), hiss(0.6, { freq: 200, type: 'lowpass', vol: 0.08 }))],
    [T_ROAR, () => (fxSound('legend.roar'), tone(73, 0.8, { type: 'sawtooth', vol: 0.04, slide: -25 }))],
    // It tears out of the cloud and roars past the League; its cry as it comes about in the storm.
    [T_EMERGE, () => hiss(0.3, { freq: 900, slide: 900, vol: 0.05 })],
    [
      T_EMERGE + 0.22,
      () => (
        hiss(0.55, { freq: 2600, slide: -2200, vol: 0.09 }),
        tone(240, 0.5, { type: 'sawtooth', vol: 0.035, slide: -140 })
      ),
    ],
    [T_TURN, () => tone(330, 0.45, { type: 'sawtooth', vol: 0.04, slide: -160 })],
    [T_DIVE + 0.1, () => hiss(0.6, { freq: 400, slide: 2600, vol: 0.06 })],
    [
      T_PASS - 0.05,
      () => (
        hiss(0.5, { freq: 2400, slide: -2000, vol: 0.1 }),
        tone(90, 0.4, { type: 'sawtooth', vol: 0.05, slide: -40 })
      ),
    ],
    [T_DROP + 0.1, () => hiss(0.4, { freq: 1600, q: 2, vol: 0.04 })],
    [
      T_LAND,
      () => (
        fxSound('impact.hit'),
        tone(45, 0.5, { type: 'sine', vol: 0.16, slide: -15 }),
        hiss(0.5, { freq: 220, type: 'lowpass', vol: 0.12 })
      ),
    ],
    [T_LAND + 0.05, () => fxSound('fire.stream')],
    [T_SWOOP + 0.1, () => hiss(0.35, { freq: 700, slide: 900, vol: 0.05 })],
    [T_CHARGE, () => fxSound('z.charge')],
    [
      T_BEAM,
      () => (
        fxSound('mega.beam'),
        hiss(1.2, { freq: 900, vol: 0.09 }),
        tone(55, 0.9, { type: 'sine', vol: 0.14, slide: -15 })
      ),
    ],
    [REVEAL, () => (fxSound('legend.roar'), hiss(0.6, { freq: 300, type: 'lowpass', vol: 0.08 }))],
  ],
})

/** How strong the beam is: it fires, holds through the reveal, then narrows out. */
const beamAt = (t: number) =>
  t < T_BEAM ? 0 : ease.outQ(span(t, T_BEAM, T_BEAM + 0.07)) * (1 - span(t, REVEAL + 0.4, REVEAL + 0.9))

/**
 * Part of the storm lit up: `src` (the same bank, lit) over the clouds through a dithered disc round (x, y) on the
 * cloud canvas, its strength k. With `shadow` (its size), the dragon's shape dark inside the light.
 */
function lightUp(s: S, src: Canvas, x: number, y: number, r: number, k: number, shadow = 0) {
  const l = s.litBuf.g
  const x0 = Math.round(x - r)
  const y0 = Math.round(y - r)
  const d = 2 * r + 1
  l.clearRect(0, 0, W + 40, CH)
  l.drawImage(src, x0, y0, d, d, x0, y0, d, d)
  if (shadow) {
    l.globalCompositeOperation = 'source-atop'
    const z = spriteSize(DRAGONITE)
    drawSprite(l, DRAGONITE, Math.round(x), Math.round(y + (z.h * shadow) / 2), {
      ...ON_CANVAS,
      sil: '#121236',
      sx: shadow,
      sy: shadow,
    })
  }
  l.globalCompositeOperation = 'destination-in'
  l.drawImage(lightMask(r, q8(k)), x0, y0)
  l.globalCompositeOperation = 'source-over'
  s.cloudBuf.g.drawImage(s.litBuf, x0, y0, d, d, x0, y0, d, d)
}

/** A disc of light, solid in its middle and dithered only at its rim; weaker, the rim comes further in. */
const lightMask = (r: number, k: number) =>
  cached(`lance-light|${r}|${k}`, () =>
    shade(2 * r + 1, 2 * r + 1, (x, y) => {
      const d = Math.hypot(x - r, y - r) / (r + 0.5)
      return (1 - d) * 4 * k > bayer(x, y) + 0.5 ? '#ffffff' : null
    }),
  )

/** Dragonite in flight: rimmed in moonlight, vapour trailing off its wingtips; near, its own colours in the dark. */
function drawFlier(g: G, t: number) {
  const f = flier(t)
  if (!f) return
  const z = spriteSize(DRAGONITE)
  // The trails: where its wingtips were a moment ago, a vapour thinning out behind it.
  const trail = ['#c8ccf0', '#9aa0d8', '#6a70a8']
  const N = 14
  for (const side of [-1, 1]) {
    let prev: [number, number] | null = null
    for (let j = 0; j < N; j++) {
      const p = flier(t - j * 0.03)
      if (!p) break
      const pt: [number, number] = [p.x + side * z.w * p.k * 0.4, p.y - z.h * p.k * 0.12]
      if (prev) {
        const n = Math.max(1, Math.ceil(Math.hypot(pt[0] - prev[0], pt[1] - prev[1])))
        for (let i = 0; i < n; i++) {
          const x = Math.round(lerp(prev[0], pt[0], i / n))
          const y = Math.round(lerp(prev[1], pt[1], i / n))
          if ((1 - (j + i / n) / N) * 1.1 > bayer(x, y))
            rect(g, x, y, 1, 1, trail[Math.min(2, (j * 3) / N) | 0]!)
        }
      }
      prev = pt
    }
  }
  const far = f.k < 0.32
  drawSprite(g, DRAGONITE, Math.round(f.x), Math.round(f.y + (z.h * f.k) / 2), {
    ...ON_CANVAS,
    sx: f.k,
    sy: f.k * (1 + 0.04 * Math.sin(t * 15)),
    sil: far ? '#0a0816' : undefined,
    tint: far ? null : { color: '#0a0818', a: f.k > 1.4 ? 0.5 : 0.625 },
    outline: f.k > 0.14 && f.k < 1.4 ? MOON_RIM : undefined,
  })
}

/** Dragonite over the League's roof: lit by its own beam as it gathers and fires; the beam into the sky. */
function drawHover(g: G, t: number, d: Fly) {
  const m = mouth(d)
  const charge = span(t, T_CHARGE, T_BEAM)
  const beam = beamAt(t)
  // Night on it until the light at its mouth reaches it.
  const dark = Math.round(8 * (0.75 - 0.35 * charge - 0.3 * beam)) / 8
  drawSprite(g, DRAGONITE, Math.round(d.x), Math.round(d.y), {
    ...ON_CANVAS,
    sx: d.k,
    sy: d.k,
    tint: dark > 0 ? { color: '#0c0a1e', a: dark } : null,
    outline:
      charge <= 0
        ? MOON_RIM
        : beam > 0 || t < T_BEAM
          ? Math.floor(t * 16) % 2
            ? '#ffc84a'
            : '#ff8a1e'
          : '#ffc84a',
  })
  if (charge > 0 && t < T_BEAM) {
    // The orb swelling at its mouth, pulsing faster as it fills.
    const r0 = Math.round(2 + 7 * charge + (Math.floor(t * (10 + 20 * charge)) % 2))
    g.drawImage(glow(r0 + 8, '#ff8a1e', 1.4, 0.75), m.x - r0 - 8, m.y - r0 - 8)
    ellipse(g, m.x, m.y, r0, r0, '#ffc84a')
    ellipse(g, m.x, m.y, Math.max(1, r0 - 2), Math.max(1, r0 - 2), '#fff6c8')
  }
  if (beam <= 0) return
  // The beam: a haze dithered round it, layered bands, its width flickering, rings of force climbing it.
  const wv = Math.round(19 * beam) + (Math.floor(t * 30) % 2) * 2
  const half = wv >> 1
  for (let y = -10; y < m.y; y++)
    for (let dx = half; dx < half + 9; dx++) {
      const v = (1 - (dx - half) / 9) * 0.8 * beam
      for (const sd of [-1, 1]) {
        const x = m.x + sd * dx
        if (v > bayer(x, y)) rect(g, x, y, 1, 1, dx - half < 3 ? BEAM[4] : '#a8301a')
      }
    }
  BEAM.slice()
    .reverse()
    .forEach((c, j) => {
      const ww = Math.max(2, wv - j * 4)
      rect(g, m.x - (ww >> 1), -10, ww, m.y + 10, c)
    })
  for (let i = 0; i < 4; i++) {
    const y = m.y - (((t - T_BEAM) * 300 + i * 26) % (m.y + 10))
    ellipseLine(g, m.x, Math.round(y), half + 4, 2, '#fff6c8')
  }
  g.drawImage(glow(22, '#ffc84a', 1.3, q8(beam)), m.x - 22, m.y - 22)
  // Where it strikes the storm's belly, a flare.
  g.drawImage(glow(26, '#ffd27a', 1.2, q8(beam * 0.9)), m.x - 26, -18)
  ellipse(g, m.x, m.y, 7, 6, '#fff6c8')
  ellipse(g, m.x, m.y, 5, 4, '#ffffff')
}
