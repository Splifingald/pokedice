// Crown Shrine's whiteout (docs/64 §4.3, docs/15 §47) on the pixel engine, built like the legends' cinematics: a
// shrine in layers (a storm sky, two ranges of mountains, a forest ridge, a snowfield in perspective, stone steps and
// lanterns climbing to the crown tree, rocks), each layer drifting at its own pace (parallax). The crown tree is a huge
// old fir: six snow-laden tiers, a sacred rope round its trunk, a gold crown on its top; the eyes in it are
// Abomasnow's. The snow falls in three depths (far, middle, near), with sheets of blown snow (spindrift) for the gusts.
// The way in (the blizzard rolls over the area and the light goes, then the eyes open in the tree), the bonfire (a fire
// catching in the dark, the team round it in depth, lit warm on the fire's side), the end (the blizzard thins out
// layer by layer, the clouds part, sunbeams on the shrine, the snow glinting, shiny Abomasnow in the light) and the
// snowfall over the fights' stage. Abomasnow's entrance is a boss cinematic of its own (cinema/abomasnow.ts), drawn
// with the shrine from here. Words come from the screen.
import { fxSound } from '@/audio/sfx'
import {
  bayer,
  cached,
  canvas,
  clamp,
  disc,
  ease,
  ellipse,
  glow,
  label,
  labelWidth,
  lerp,
  line,
  Particles,
  rect,
  rng,
  shade,
  softEllipse,
  span,
  wash,
  type Canvas,
  type G,
  type Rng,
} from '../pixel'
import { background } from '../scenes'
import { drawSprite, spriteFrame, spriteSize } from '../sprites'
import { H, screenShake, skippingNow, W, type Cue, type Timeline } from '../timeline'
import type { PortalLoop, SceneSize } from './portal'

/** The whiteout's palette: the storm's blues, the snow's whites, the pine's greens, the fire's ramp, the sun's golds. */
export const WO = {
  night: '#060b18',
  deep: '#0b1530',
  storm: '#16264a',
  slate: '#2a3d63',
  mist: '#587194',
  frost: '#a6c2db',
  snow: '#e6f1fa',
  white: '#ffffff',
  shade: '#8ea9c4',
  pine: '#163a2d',
  pineLit: '#2a5d45',
  pineDark: '#0a2219',
  bark: '#3a2a22',
  stone: '#6f7c8c',
  stoneDark: '#454f5c',
  gold: '#f2c24a',
  goldPale: '#ffeaa8',
  eye: '#ff3d2e',
  eyeGlow: '#ff9a6a',
  fireCore: '#fff6c8',
  fireHot: '#ffd34a',
  fire: '#ff8a2a',
  fireDeep: '#e2482a',
  ember: '#8a2618',
  warm: '#ffb060',
  log: '#4a2c1c',
  logLit: '#7a4a2a',
  dawnTop: '#5f9fd8',
  dawn: '#9fd0f2',
  dawnLow: '#e8f4fb',
  sun: '#fff2b0',
} as const

/** A sound, unless the scene is being skipped to its end (no pile of sounds then). */
const quiet = (name: Parameters<typeof fxSound>[0]) => !skippingNow() && fxSound(name)

// ---------------------------------------------------------------- noise and dithered ramps

/** A hash of two integers, 0..1: the same cell always gives the same value (a replay is the same take). */
function hash2(x: number, y: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** Smooth value noise; `px` makes it repeat every `px` cells across (a strip that tiles as it scrolls). */
function vnoise(x: number, y: number, px = 0): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const fx = x - xi
  const fy = y - yi
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const wx = (v: number) => (px ? ((v % px) + px) % px : v)
  const a = lerp(hash2(wx(xi), yi), hash2(wx(xi + 1), yi), sx)
  const b = lerp(hash2(wx(xi), yi + 1), hash2(wx(xi + 1), yi + 1), sx)
  return lerp(a, b, sy)
}

/** Three octaves of it. */
const fbm = (x: number, y: number, px = 0) =>
  vnoise(x, y, px) * 0.55 +
  vnoise(x * 2 + 17, y * 2 + 5, px * 2) * 0.3 +
  vnoise(x * 4 + 3, y * 4 + 29, px * 4) * 0.15

/** A colour from a dark-to-light ramp at v (0..1), ordered-dithered between its two nearest steps. */
function pick(cols: readonly string[], v: number, x: number, y: number): string {
  const f = clamp(v) * (cols.length - 1)
  return cols[Math.min(cols.length - 1, Math.floor(f + bayer(x, y)))]!
}

// ---------------------------------------------------------------- the shrine's two lights

/** The shrine's colours in the storm's night, or in the morning sun. Ramps go dark to light. */
interface ShrinePal {
  sky: readonly string[]
  far: { rock: readonly string[]; snow: readonly string[]; haze: string }
  mid: { rock: readonly string[]; snow: readonly string[]; haze: string }
  forest: readonly [string, string]
  field: readonly string[]
  pine: readonly string[]
  /** Snow on the tree: shade, middle, lit. */
  tsnow: readonly string[]
  bark: readonly string[]
  stone: readonly string[]
  rope: readonly string[]
  /** Light from the left (the storm's faint glow) or the right (the sun). */
  light: -1 | 1
  day: boolean
}

const NIGHT: ShrinePal = {
  sky: ['#03060e', '#060b18', '#0a1428', '#101d38', '#17284a', '#22355c', '#2f456e'],
  far: { rock: ['#16223e', '#1c2a4a'], snow: ['#2a3d63', '#3a5078', '#4b6390'], haze: '#2a3d63' },
  mid: { rock: ['#0e1830', '#14203a'], snow: ['#22355c', '#34496f', '#4f6890'], haze: '#1c2c4c' },
  forest: ['#09121f', '#22355c'],
  field: ['#1a2b4c', '#22355c', '#2f456e', '#425b84', '#587194', '#7590b0', '#93adc8'],
  pine: ['#06140e', '#0c2219', '#143224', '#1d4434', '#2a5a45'],
  tsnow: ['#4b6390', '#7d98b8', '#b4cbe0', '#dce8f4'],
  bark: ['#160e0a', '#26180f', '#3a2a1e', '#523b2b'],
  stone: ['#1a1f2a', '#2c3442', '#434d5e', '#5d6879'],
  rope: ['#4a3e24', '#7a6a40', '#a8955e'],
  light: -1,
  day: false,
}

const DAY: ShrinePal = {
  sky: ['#3d7cc2', '#4f8fd0', '#64a3dc', '#7db8e6', '#9ccbef', '#bfdff6', '#e2f1fb'],
  far: { rock: ['#7895bb', '#86a2c6'], snow: ['#c7daec', '#e0ecf7', '#f6fafe'], haze: '#b8d3eb' },
  mid: { rock: ['#4f6f98', '#5e7fa8'], snow: ['#b6cce2', '#d6e5f2', '#ffffff'], haze: '#9fc0de' },
  forest: ['#28504c', '#dceaf6'],
  field: ['#9ab8d4', '#aec8e0', '#c2d7ea', '#d6e6f3', '#e6f0f9', '#f4f9fd', '#ffffff'],
  pine: ['#123426', '#1d4a37', '#2a6249', '#3b7d5c', '#56a072'],
  tsnow: ['#9cbad6', '#cfe0f0', '#f2f8fd', '#ffffff'],
  bark: ['#2c1c12', '#46301f', '#664630', '#8a6244'],
  stone: ['#4c5564', '#6c7787', '#929cab', '#bcc4cf'],
  rope: ['#8a7442', '#c4a966', '#ecd99c'],
  light: 1,
  day: true,
}

// ---------------------------------------------------------------- the sky

/** The storm's sky: near-black at the top, a heavy cloud deck, the snow-light at the horizon, dithered. Cached. */
export const stormSky = (w: number, h: number): Canvas => cached(`wo-sky|${w}|${h}`, () => skyOf(w, h, NIGHT))

function skyOf(w: number, h: number, P: ShrinePal): Canvas {
  return shade(w, h, skyColour(w, h, P))
}

function skyColour(w: number, h: number, P: ShrinePal) {
  const s = 240 / Math.max(160, Math.min(w, 480))
  return (x: number, y: number) => {
    const q = y / Math.max(1, h - 1)
    // The cloud deck: long lumpy bands, darker in their hearts.
    const c = fbm((x * s) / 44, ((y * s) / 13) * (P.day ? 0.6 : 1) + 3)
    const v = Math.pow(q, P.day ? 0.9 : 0.75) * 0.92 + (c - 0.5) * (P.day ? 0.12 : 0.42)
    return pick(P.sky, v, x, y)
  }
}

// ---------------------------------------------------------------- the snow

/** One snowflake (the fights' snowfall): where it is, how fast it falls, how it sways, how big. */
export interface Flake {
  x: number
  y: number
  v: number
  ph: number
  s: 1 | 2
}

export function makeFlakes(r: Rng, w: number, h: number, n: number): Flake[] {
  return Array.from({ length: n }, () => ({
    x: r.range(0, w),
    y: r.range(0, h),
    v: r.range(14, 34),
    ph: r.range(0, 6.3),
    s: r() < 0.25 ? 2 : 1,
  }))
}

/**
 * Snow falling: `wind` pushes it sideways (art pixels a second, a blizzard 60–120), `speed` scales its fall. Off the
 * stage it comes back on the other side, or at the top.
 */
export function stepFlakes(fl: Flake[], w: number, h: number, dt: number, wind: number, speed = 1) {
  for (const f of fl) {
    f.y += f.v * speed * dt * (f.s === 2 ? 1.3 : 1)
    f.x += (wind * (f.s === 2 ? 1.2 : 0.8) + Math.sin(f.y / 9 + f.ph) * 6) * dt
    if (f.y > h) f.y -= h + 2
    if (f.x > w + 2) f.x -= w + 4
    if (f.x < -2) f.x += w + 4
  }
}

/** The flakes; `k` of them shown (a snowfall thinning out), the big ones whiter. */
export function drawFlakes(g: G, fl: readonly Flake[], k = 1) {
  const n = Math.round(fl.length * clamp(k))
  for (let i = 0; i < n; i++) {
    const f = fl[i]!
    const x = Math.round(f.x)
    const y = Math.round(f.y)
    if (f.s === 2) {
      rect(g, x, y, 2, 2, WO.snow)
      rect(g, x, y, 1, 1, WO.white)
    } else rect(g, x, y, 1, 1, i % 3 ? WO.frost : WO.white)
  }
}

/** The blizzard's streaks: short white dashes driven across the stage, `k` of them. */
function drawStreaks(g: G, w: number, h: number, t: number, k: number, seed = 3) {
  if (k <= 0) return
  const n = Math.round(((w * h) / 900) * k)
  for (let i = 0; i < n; i++) {
    const sp = 140 + ((i * 37) % 90)
    const len = 4 + ((i * 13) % 7)
    const y = Math.round(((i * 53 + seed * 17) % h) + Math.sin(t * 3 + i) * 2)
    const x = Math.round(((i * 97 + t * sp) % (w + len * 2)) - len)
    rect(g, x, y, len, 1, i % 2 ? WO.frost : WO.snow)
  }
}

/**
 * The scenes' snow, in three depths: far (fine, slow, dim), middle, near (big, fast, drawn as streaks along the wind).
 * Each depth is its own run of flakes, so a snowfall can thin out one depth at a time.
 */
export interface Snow {
  w: number
  h: number
  x: Float32Array
  y: Float32Array
  vx: Float32Array
  v: Float32Array
  ph: Float32Array
  /** Where each depth's flakes start and end in the arrays. */
  at: [number, number, number, number]
}

const DEPTH = [
  { fall: 0.45, wind: 0.5, sway: 3 },
  { fall: 1, wind: 0.85, sway: 6 },
  { fall: 2, wind: 1.35, sway: 9 },
] as const

export function makeSnow(r: Rng, w: number, h: number, density = 1): Snow {
  const n = [
    Math.round(((w * h) / 140) * density),
    Math.round(((w * h) / 420) * density),
    Math.round(((w * h) / 1500) * density),
  ]
  const total = n[0]! + n[1]! + n[2]!
  const s: Snow = {
    w,
    h,
    x: new Float32Array(total),
    y: new Float32Array(total),
    vx: new Float32Array(total),
    v: new Float32Array(total),
    ph: new Float32Array(total),
    at: [0, n[0]!, n[0]! + n[1]!, total],
  }
  for (let i = 0; i < total; i++) {
    s.x[i] = r.range(0, w)
    s.y[i] = r.range(0, h)
    s.v[i] = r.range(16, 30)
    s.ph[i] = r.range(0, 6.3)
  }
  return s
}

/** The snow on: `wind` sideways (art pixels a second), `fall` its fall's speed. */
export function stepSnow(s: Snow, dt: number, wind: number, fall = 1) {
  for (let d = 0; d < 3; d++) {
    const D = DEPTH[d]!
    for (let i = s.at[d]!; i < s.at[d + 1]!; i++) {
      const vy = s.v[i]! * D.fall * fall
      const vx = wind * D.wind + Math.sin(s.y[i]! / (8 + d * 6) + s.ph[i]!) * D.sway
      s.vx[i] = vx
      s.x[i] = s.x[i]! + vx * dt
      s.y[i] = s.y[i]! + vy * dt
      if (s.y[i]! > s.h + 4) s.y[i] = s.y[i]! - s.h - 8
      if (s.x[i]! > s.w + 6) s.x[i] = s.x[i]! - s.w - 12
      if (s.x[i]! < -6) s.x[i] = s.x[i]! + s.w + 12
    }
  }
}

export interface SnowLook {
  /** How much of each depth shows (far, middle, near), 0..1; one number for all three. */
  k?: number | readonly [number, number, number]
  /** Its colours: the storm's, the dark round a fire, or the morning's (glittering). */
  tone?: 'storm' | 'dark' | 'day'
  /** Flakes near this point are lit by it (the bonfire). */
  warm?: { x: number; y: number; r: number }
  /** Only these depths (the far ones go behind the scene's front, the near ones over everything). */
  depths?: readonly number[]
}

const SNOW_TONES = {
  storm: [
    ['#587194', '#7d98b8', '#a6c2db'],
    ['#c7dbec', '#e6f1fa', '#ffffff'],
    ['#a6c2db', '#ffffff'],
  ],
  dark: [
    ['#22355c', '#2f456e', '#425b84'],
    ['#587194', '#7d98b8', '#a6c2db'],
    ['#7d98b8', '#c7dbec'],
  ],
  day: [
    ['#ffffff', '#e2f1fb', '#fff6d0'],
    ['#ffffff', '#f4f9fd', '#ffffff'],
    ['#e6f1fa', '#ffffff'],
  ],
} as const

export function drawSnow(g: G, s: Snow, o: SnowLook = {}) {
  const ks = typeof o.k === 'number' || o.k === undefined ? [o.k ?? 1, o.k ?? 1, o.k ?? 1] : o.k
  const tone = SNOW_TONES[o.tone ?? 'storm']
  const wm = o.warm
  for (const d of o.depths ?? [0, 1, 2]) {
    const a = s.at[d]!
    const n = Math.round((s.at[d + 1]! - a) * clamp(ks[d]!))
    const cols = tone[d]!
    for (let j = 0; j < n; j++) {
      const i = a + j
      const x = Math.round(s.x[i]!)
      const y = Math.round(s.y[i]!)
      const lit = wm && Math.hypot(x - wm.x, (y - wm.y) * 1.4) < wm.r
      if (d < 2) {
        const c = lit ? (j % 3 ? WO.warm : WO.goldPale) : cols[j % cols.length]!
        rect(g, x, y, d === 1 && j % 5 === 0 ? 2 : 1, 1, c)
        continue
      }
      // Near: a streak along its way (longer in a gale), a brighter head.
      const len = Math.min(4, 1 + Math.abs(s.vx[i]!) / 30)
      const vy = s.v[i]! * DEPTH[2].fall
      const sp = Math.hypot(s.vx[i]!, vy) || 1
      const tx = x - Math.round((s.vx[i]! / sp) * len)
      const ty = y - Math.round((vy / sp) * len)
      if (len > 2) line(g, tx, ty, x, y, lit ? WO.fire : cols[0]!)
      rect(g, x, y, 2, 2, lit ? WO.goldPale : cols[1]!)
    }
  }
}

/**
 * A strip of blown snow (spindrift) twice the stage wide, repeating as it scrolls: long soft-edged wisps in a few
 * flat tones, `lv` 1–4 how thick. Cached.
 */
function driftStrip(w: number, lv: number, tone: 'storm' | 'dark'): Canvas {
  return cached(`wo-drift|${w}|${lv}|${tone}`, () => {
    const sw = w * 2
    const sh = 36
    const cells = Math.max(4, Math.round(sw / 40))
    const cols = tone === 'storm' ? ['#a6c2db', '#d4e3f0', '#f2f8fd'] : ['#1a2a48', '#22355c', '#2f456e']
    return shade(sw, sh, (x, y) => {
      const prof = Math.pow(Math.sin((Math.PI * (y + 0.5)) / sh), 1.2)
      const n = fbm((x / sw) * cells, y / 5 + (x / sw) * 3, cells)
      const v = n * prof * 1.7 - (1 - lv / 4) * 0.8 - 0.35
      // Hard-edged tones; only the outermost pixels of a wisp break up.
      if (v <= (v < 0.06 ? bayer(x, y) * 0.06 : 0)) return null
      return cols[v > 0.4 ? 2 : v > 0.18 ? 1 : 0]!
    })
  })
}

/**
 * Gusts: wisps of blown snow driven across the stage at different heights, sizes and speeds, half seen through.
 * `cover` 0 none, 1 the blizzard at its worst (the picture lost behind them). `y0`/`y1` the band they keep to.
 */
function drawGusts(
  g: G,
  w: number,
  h: number,
  t: number,
  cover: number,
  { tone = 'storm', y0 = 0, y1 = h }: { tone?: 'storm' | 'dark'; y0?: number; y1?: number } = {},
) {
  if (cover <= 0.02) return
  const n = 7
  const prev = g.globalAlpha
  for (let i = 0; i < n; i++) {
    const lv = Math.round(clamp(cover * 1.4 - ((i * 3) % 4) * 0.12) * 4)
    if (lv <= 0) continue
    const strip = driftStrip(w, lv, tone)
    const band = (y1 - y0) / n
    // Near wisps (every third) are bigger, faster, more solid.
    const near = i % 3 === 1
    const sh = Math.round(band * (near ? 3.2 : 1.8))
    const yy = Math.round(y0 + band * (i + 0.5) - sh / 2 + Math.sin(t * 0.7 + i * 1.7) * band * 0.4)
    const speed = (near ? 260 : 140) + ((i * 53) % 70)
    const off = ((t * speed + i * 97) % strip.width) - strip.width
    g.globalAlpha = (near ? 0.75 : 0.5) * Math.min(1, 0.4 + cover)
    for (let x = Math.round(off); x < w; x += strip.width) g.drawImage(strip, x, yy, strip.width, sh)
  }
  g.globalAlpha = prev
}

// ---------------------------------------------------------------- the crown tree

export interface TreeLook {
  /** Sideways shake of its tiers (pixels at the top; its trunk stays put; each tier swings a little later). */
  shake?: number
  /** Snow left on its branches, 1 full, 0 shaken off. */
  snow?: number
  /** Its eyes glowing in the dark, 0 none. */
  eyes?: number
  /** How open its eyes are (1 wide, 0 shut: a blink). */
  open?: number
  /** Night (the storm's colours) or day (lit by the sun). */
  day?: boolean
}

export interface Tier {
  /** Its tip, from the tree's top. */
  y0: number
  th: number
  hw: number
  droop: number
}

interface TreeGeo {
  tiers: Tier[]
  trunkH: number
  trunkW: number
  /** Where the eyes are, from the top, and how far apart. */
  eyeY: number
  eyeGap: number
  eyeTier: number
  /** 1 or 2: the crown and the eyes drawn twice as big on a big stage. */
  px: number
}

/** The tree's shape at a size: its tiers from the top, its trunk, where its eyes are. */
function treeGeo(size: number): TreeGeo {
  return cached(`wo-geo|${size}`, () => {
    const n = size >= 120 ? 6 : 5
    const trunkH = Math.max(4, Math.round(size * 0.15))
    const body = size - trunkH
    const tiers: Tier[] = []
    for (let i = 0; i < n; i++) {
      const q = i / (n - 1)
      const th = Math.round(body * (0.27 + 0.07 * q))
      const y0 = Math.round((body + 1 - th) * Math.pow(q, 0.9))
      const hw = Math.round(size * (0.12 + 0.33 * Math.pow(q, 0.85)))
      tiers.push({ y0, th, hw, droop: Math.max(2, Math.round(hw * 0.2)) })
    }
    // The eyes peer out of a tier's dark hem, under its snow, about halfway up.
    let eyeTier = 0
    const hemY = (i: number) => tiers[i]!.y0 + Math.round(tiers[i]!.th * 0.86)
    for (let i = 0; i < n; i++)
      if (Math.abs(hemY(i) - size * 0.46) < Math.abs(hemY(eyeTier) - size * 0.46)) eyeTier = i
    const eyeY = hemY(eyeTier)
    return {
      tiers,
      trunkH,
      trunkW: Math.max(3, Math.round(size * 0.08)),
      eyeY,
      eyeGap: Math.max(4, Math.round(size * 0.075)),
      eyeTier,
      px: size >= 150 ? 2 : 1,
    }
  })
}

/**
 * One tier of the fir, `snowQ` eighths of its snow left: a heavy drooping skirt of boughs under a thick blanket of
 * snow. The blanket's lower edge hangs in rounded lumps, a blue shade under it; below it the needles show as a dark
 * hem, its bough tips ragged. As the snow goes, the blanket thins and breaks into clumps, the green showing through.
 */
function tierCanvas(size: number, i: number, P: ShrinePal, snowQ: number): Canvas {
  return cached(`wo-tier|${size}|${i}|${P.day}|${snowQ}`, () => {
    const T = treeGeo(size).tiers[i]!
    const { th, hw, droop } = T
    const snow = snowQ / 8
    const per = Math.max(4, Math.round(size * 0.055))
    const pad = 4
    const cw = hw * 2 + pad * 2 + 3
    const ch = th + droop + pad + 4
    const baseHalf = (dy: number) => hw * Math.pow(clamp(dy / th), 0.8)
    /** Where a point is in its bough: 0 its top, 1 its underside. */
    const saw = (dx: number, dy: number) => {
      const e = (dy - Math.abs(dx) * 0.45 + (dx < 0 ? 0 : per * 0.5) + i * 1.7) / per
      return e - Math.floor(e)
    }
    const halfAt = (dx: number, dy: number) => {
      const b = baseHalf(Math.min(dy, th))
      return b * (0.86 + 0.18 * saw(dx < 0 ? -b : b, dy))
    }
    const hem = (dx: number) =>
      th + Math.round(droop * (dx / hw) ** 2) + (hash2(Math.round(dx / 2), i) < 0.35 ? 1 : 0)
    const needles = (dx: number, dy: number) =>
      dy >= 0 && dy <= hem(dx) && Math.abs(dx) <= halfAt(dx, dy) + 0.5
    /** The blanket's lower edge at dx: lumpy, following the droop; gone in columns as the snow goes. */
    const lip = (dx: number) => {
      const lump = 1.8 * Math.pow(Math.abs(Math.sin(dx * 0.33 + i * 1.3)), 0.6)
      const kept = vnoise(dx * 0.16 + i * 7, 2) < snow * 1.25 - 0.1
      const depth = kept ? 0.3 + 0.42 * snow : 0.12 * snow
      return th * depth + droop * (dx / hw) ** 2 * 0.8 + lump
    }
    return shade(cw, ch, (px, py) => {
      const dx = px - pad - hw
      const dy = py - pad
      const half = Math.max(1, baseHalf(Math.min(dy, th)))
      const side = clamp(dx / half, -1, 1)
      const L = side * P.light
      const edge = snow > 0 ? lip(dx) : -1
      // The snow: sits on the boughs and overhangs their tips by a pixel.
      if (dy >= 0 && dy <= edge && Math.abs(dx) <= halfAt(dx, dy) + 1.5) {
        const under = edge - dy
        if (under < 1) return P.tsnow[0]!
        if (under < 2) return pick(P.tsnow, 0.3 + L * 0.2, px, py)
        const rim = Math.abs(dx) > halfAt(dx, dy) - 0.5
        let v = 0.62 + 0.34 * L + (fbm(dx * 0.3 + i * 9, dy * 0.4) - 0.5) * 0.3 + (rim && L > 0 ? 0.25 : 0)
        if (under < 3) v -= 0.18
        return pick(P.tsnow, v, px, py)
      }
      if (!needles(dx, dy)) return null
      if (!needles(dx, dy + 1)) return P.pine[0]!
      let v = 0.48 + 0.32 * L - (1 - Math.abs(side)) * 0.12 + 0.15 - saw(dx, dy) * 0.4
      // In the snow's shadow just under its lip.
      if (dy - edge < 2.5) v -= 0.35
      v += (fbm((dx + i * 31) * 0.5, dy * 0.8) - 0.5) * 0.4
      if (!needles(dx - P.light, dy)) v += 0.3
      return pick(P.pine, v, px, py)
    })
  })
}

/** The trunk under the lowest tier: bark lit on one side, roots spreading into the snow, the sacred rope round it. */
function trunkCanvas(size: number, P: ShrinePal): Canvas {
  return cached(`wo-trunk|${size}|${P.day}`, () => {
    const G = treeGeo(size)
    const tw = G.trunkW
    const th = G.trunkH + 8
    const cw = tw * 5
    const c = shade(cw, th, (px, py) => {
      const q = py / (th - 1)
      const half = (tw / 2) * (1 + 1.6 * Math.pow(q, 5))
      const dx = px - cw / 2
      if (Math.abs(dx) > half) return null
      const side = (dx / half) * P.light
      let v = 0.5 + side * 0.35 + (fbm(px * 0.9, py * 0.12) - 0.5) * 0.6
      if ((px + Math.floor(py / 5)) % 3 === 0) v -= 0.25
      return pick(P.bark, v, px, py)
    })
    // The sacred rope: twisted straw, sagging a little, two paper streamers hanging from it.
    const g = c.g
    const ry = Math.round(th - G.trunkH * 0.55)
    const rw = Math.max(2, Math.round(size / 45))
    for (let x = Math.round(cw / 2 - tw / 2 - 1); x <= Math.round(cw / 2 + tw / 2); x++) {
      const sag = Math.round(Math.abs(x - cw / 2) < tw / 4 ? 1 : 0)
      for (let k = 0; k < rw; k++)
        rect(g, x, ry + sag + k, 1, 1, P.rope[(x + k) % 3 === 0 ? 0 : k === 0 ? 2 : 1]!)
    }
    for (const sx of [-0.25, 0.25]) {
      const x = Math.round(cw / 2 + sx * tw)
      for (let k = 0; k < 4 + rw; k++) rect(g, x + (Math.floor(k / 2) % 2), ry + rw + 1 + k, 1, 1, '#f4f8fc')
    }
    return c
  })
}

/** The gold crown on the top: three points, a band of jewels. Pixel art, drawn 1× or 2×. */
const CROWN = [
  'p....p....p',
  'g...gpg...g',
  'gg.ggggg.gg',
  'ggggggggggg',
  'gpgpgogpgpg',
  'ddddddddddd',
] as const
const CROWN_PAL: Record<string, string> = { p: '#fff3c4', g: WO.gold, d: '#a8741c', o: '#5fd0ff' }

function drawCrown(g: G, x: number, bottom: number, s: number, dim = 0) {
  for (let r = 0; r < CROWN.length; r++)
    for (let q = 0; q < 11; q++) {
      const ch = CROWN[r]![q]!
      if (ch === '.') continue
      const c = dim > 0 && ch !== 'p' ? '#8a6a24' : CROWN_PAL[ch]!
      rect(g, x + (q - 5) * s, bottom - (CROWN.length - r) * s, s, s, c)
    }
}

/**
 * The crown tree: a huge old fir of five or six tiers, snow on every shelf, a sacred rope round its trunk, a golden
 * crown on its top. `x` its middle, `base` the ground line, `size` its height (art pixels). Its eyes, two red points
 * in its upper tiers, are what the blizzard hides (Abomasnow).
 */
export function drawCrownTree(g: G, x: number, base: number, size: number, o: TreeLook = {}) {
  const P = o.day ? DAY : NIGHT
  const G = treeGeo(size)
  const top = base - size
  const snowQ = Math.round(clamp(o.snow ?? 1) * 8)
  const n = G.tiers.length
  // Each tier swings a little after the one above (a whip), the top furthest.
  const sway = (i: number) => Math.round((o.shake ?? 0) * Math.pow(1 - i / (n + 0.5), 1.3))
  const tc = trunkCanvas(size, P)
  g.drawImage(tc, Math.round(x - tc.width / 2), base - tc.height + 2)
  for (let i = n - 1; i >= 0; i--) {
    const T = G.tiers[i]!
    const cv = tierCanvas(size, i, P, snowQ)
    g.drawImage(cv, x - T.hw - 3 + sway(i), top + T.y0 - 3)
  }
  drawCrown(g, x + sway(0), top + 2, G.px)
  if ((o.eyes ?? 0) > 0)
    drawEyes(g, x + sway(G.eyeTier), top + G.eyeY, G.eyeGap, o.eyes ?? 0, o.open ?? 1, G.px)
}

/** The tree's tiers at a size (their tips from its top, heights, half-widths): where snow can fall from. */
export const treeTiers = (size: number): readonly Tier[] => treeGeo(size).tiers

/** Where the tree's eyes are (their middle), and how far apart, for a tree at (x, base) of that size. */
export function treeEyes(x: number, base: number, size: number) {
  const G = treeGeo(size)
  return { x, y: base - size + G.eyeY, gap: G.eyeGap, px: G.px }
}

/**
 * Two eyes glowing in the dark: slanted (an angry look), white-hot in their hearts, a red bloom round them. `e` how
 * bright, `open` how open (a blink). `s` 1 or 2 (pixel size).
 */
export function drawEyes(g: G, x: number, y: number, gap: number, e: number, open = 1, s = 1) {
  if (e <= 0) return
  const q = (v: number) => Math.round(clamp(v) * 10) / 10
  const R = Math.round(gap * 2.8)
  g.drawImage(glow(R, '#7a1012', 1.8, q(0.55 * e)), x - R, y - R)
  for (const side of [-1, 1]) {
    const ex = x + side * gap
    const r2 = Math.max(4, Math.round(gap * 0.95))
    g.drawImage(glow(r2, WO.eye, 1.7, q(0.75 * e)), ex - r2, y - r2)
    const r3 = Math.max(2, Math.round(gap * 0.5))
    g.drawImage(glow(r3, WO.eyeGlow, 2, q(e)), ex - r3, y - r3)
    if (open <= 0.15) continue
    // Slanted down toward the middle: the inner end lower.
    // dx from its outer end (−2) to its inner end (2).
    const px = (dx: number, dy: number, c: string) => rect(g, ex - side * dx * s, y + dy * s, s, s, c)
    if (open < 0.6) {
      for (let dx = -2; dx <= 2; dx++) px(dx, dx > 0 ? 1 : 0, e > 0.5 ? WO.eye : WO.ember)
      continue
    }
    for (let dx = -2; dx <= 0; dx++) px(dx, -1, WO.eye)
    for (let dx = -2; dx <= 2; dx++) px(dx, 0, dx === 0 ? '#ffffff' : Math.abs(dx) === 1 ? WO.sun : WO.eye)
    for (let dx = 0; dx <= 2; dx++) px(dx, 1, dx === 2 ? WO.eye : WO.eyeGlow)
  }
}

/** The tree's height that fits a stage: tall, but under the sky's top and the words at the bottom. */
export const treeSize = (h: number) => Math.max(40, Math.round(h * 0.6))

// ---------------------------------------------------------------- the shrine

/** Extra width on each side of the layers that drift (parallax). */
const M = 28

export interface ShrineLayout {
  w: number
  h: number
  /** The scene's height above the words. */
  hv: number
  /** The horizon (where the snowfield meets the forest). */
  hz: number
  treeX: number
  /** The tree's foot. */
  base: number
  size: number
  /** The steps' top half-width and their foot's. */
  step: [number, number]
  /** The lanterns' windows (lit at night). */
  lamps: { x: number; y: number; s: number }[]
}

export interface ShrineOpts {
  hv?: number
  treeX?: number
  base?: number
  size?: number
  hz?: number
  /** The lowest pair of lanterns kept off (the cinematic: the foe stands there). */
  fewLamps?: boolean
  seed?: number
}

export function shrineLayout(w: number, h: number, o: ShrineOpts = {}): ShrineLayout {
  const hv = o.hv ?? h
  const base = o.base ?? Math.round(hv * 0.69)
  const size = o.size ?? Math.max(30, Math.min(Math.round(hv * 0.6), Math.round(w * 1.05), base - 10))
  const hz = o.hz ?? Math.round(Math.min(base - size * 0.12, hv * 0.58))
  return {
    w,
    h,
    hv,
    hz,
    treeX: o.treeX ?? Math.round(w / 2),
    base,
    size,
    step: [Math.max(4, Math.round(size * 0.08)), Math.round(Math.min(w * 0.26, size * 0.34))],
    lamps: [],
  }
}

/** A peaked range of mountains along `base`, `ht` tall, snow on its heights; `w` with the drift margins. */
function range(L: ShrineLayout, part: 'far' | 'mid', P: ShrinePal, seed: number): Canvas {
  const cw = L.w + 2 * M
  const s = 240 / Math.max(160, Math.min(L.w, 480))
  const far = part === 'far'
  const pal = P[part]
  const base = L.hz + (far ? -2 : 1)
  const ht = Math.round(L.hv * (far ? 0.3 : 0.17))
  const ridge = (x: number) => {
    const u = x * s
    return (
      Math.pow(1 - Math.abs(Math.sin(u * (far ? 0.012 : 0.02) + seed)), 1.7) * 0.6 +
      Math.pow(1 - Math.abs(Math.sin(u * (far ? 0.031 : 0.047) + seed * 2.1)), 2) * 0.28 +
      vnoise(u * 0.11, seed) * 0.12
    )
  }
  const tops = Array.from({ length: cw + 2 }, (_, i) => base - ht * ridge(i - 1))
  return shade(cw, L.h, (x, y) => {
    const top = tops[x + 1]!
    if (y < top || y > base + 1) return null
    const d = y - top
    // Lit faces climb toward the light; snow on the heights and down the gullies.
    const slope = tops[x + 2]! - tops[x]!
    const lit = slope * P.light > 0
    const gully = fbm(x * s * 0.22, y * 0.08 + seed) > 0.55
    const line = ht * (0.32 + 0.4 * ridge(x)) * (gully ? 1.5 : 1)
    const q = (y - (base - ht)) / ht
    if (d < 1) return pal.snow[2]!
    let c: string
    if (d < line + (hash2(x, y >> 2) - 0.5) * 3)
      c = pick(pal.snow, (lit ? 0.85 : 0.35) - d / (line * 3), x, y)
    else c = pick(pal.rock, lit ? 0.8 : 0.2, x, y)
    // Haze toward the foot: the far range fades into the snow-light.
    return q > 0.7 && bayer(x, y) < (q - 0.7) * (far ? 2.4 : 1.6) ? pal.haze : c
  })
}

/** A small snowy pine (the forest's, the field's). */
function pine(g: G, x: number, base: number, ht: number, dark: string, snow: string, lit?: string) {
  const tiers = Math.max(2, Math.round(ht / 6))
  rect(g, x, base - Math.round(ht * 0.15), 1, Math.round(ht * 0.15), dark)
  for (let i = 0; i < tiers; i++) {
    const t0 = base - ht + Math.round((i * ht * 0.75) / tiers)
    const tH = Math.round(ht * 0.42)
    for (let r = 0; r < tH; r++) {
      const hw = Math.round(((r + 1) / tH) * ht * (0.13 + i * 0.06))
      rect(g, x - hw, t0 + r, hw * 2 + 1, 1, dark)
      if (lit && hw > 1) rect(g, x - hw, t0 + r, Math.max(1, Math.round(hw * 0.6)), 1, lit)
    }
    const hw = Math.round(ht * (0.13 + i * 0.06))
    for (let k = -hw; k <= hw; k += 2)
      if ((k + i) % 3) rect(g, x + k, t0 + tH - 2 - (Math.abs(k) < hw / 2 ? 1 : 0), 1, 1, snow)
    rect(g, x, t0, 1, 1, snow)
  }
}

/** The forest ridge on the horizon, and a few tall pines at the sides framing the shrine. */
function forest(L: ShrineLayout, P: ShrinePal, seed: number): Canvas {
  const c = canvas(L.w + 2 * M, L.h)
  const g = c.g
  const r = rng(seed)
  const u = L.size / 100
  const [dark, snow] = P.forest
  for (let x = -4; x < c.width + 4; x += Math.max(3, Math.round(4 * u))) {
    const ht = Math.round((5 + r() * 9) * Math.max(0.7, u))
    pine(g, x, L.hz + 1, ht, dark, snow)
  }
  rect(g, 0, L.hz, c.width, 2, dark)
  // Taller ones, nearer, at the edges: well clear of the crown tree.
  const clear = L.size * 0.48
  for (let k = 0; k < 9; k++) {
    const x = Math.round(r.range(0, c.width))
    if (Math.abs(x - M - L.treeX) < clear) continue
    const ht = Math.round(L.size * r.range(0.22, 0.42))
    pine(
      g,
      x,
      L.hz + Math.round(r.range(2, 6) * u),
      ht,
      P.day ? '#1f4a3a' : '#07101c',
      P.day ? '#f4f9fd' : '#33496f',
    )
  }
  return c
}

/** A boulder half buried in snow, snow heaped on its top. */
function boulder(g: G, x: number, y: number, rx: number, P: ShrinePal) {
  const ry = Math.max(2, Math.round(rx * 0.62))
  for (let dy = -ry; dy <= 0; dy++)
    for (let dx = -rx; dx <= rx; dx++) {
      const d = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry)
      if (d > 1) continue
      const L = (dx / rx) * P.light
      const capY = -ry * 0.45 + Math.sin(dx * 0.7) * 1.2
      const c =
        dy < capY
          ? pick(P.tsnow, 0.65 + L * 0.35, x + dx, y + dy)
          : pick(P.stone, 0.45 + L * 0.4 - (dy - capY) / (ry * 2), x + dx, y + dy)
      rect(g, x + dx, y + dy, 1, 1, c)
    }
  rect(g, x - rx - 1, y, rx * 2 + 3, 1, P.field[3]!)
}

/** A stone lantern (tōrō) with its foot at (x, y): pedestal, post, firebox with its window, wide roof under snow. */
function lantern(g: G, x: number, y: number, s: number, P: ShrinePal): { x: number; y: number } {
  const u = (v: number) => Math.max(1, Math.round(v * s))
  const [ink, dark, mid, lit] = P.stone as [string, string, string, string]
  const sideLit = P.light < 0 ? 0 : 1
  const block = (bx: number, by: number, bw: number, bh: number) => {
    rect(g, bx, by, bw, bh, mid)
    rect(
      g,
      sideLit ? bx + bw - Math.max(1, Math.round(bw * 0.35)) : bx,
      by,
      Math.max(1, Math.round(bw * 0.35)),
      bh,
      lit,
    )
    rect(g, bx, by + bh - 1, bw, 1, dark)
  }
  let yy = y
  block(x - u(3.5), yy - u(2), u(7), u(2))
  yy -= u(2)
  block(x - u(1.5), yy - u(5), u(3), u(5))
  yy -= u(5)
  block(x - u(3), yy - u(1.5), u(6), u(1.5))
  yy -= u(1.5)
  const boxH = u(4.5)
  block(x - u(2.5), yy - boxH, u(5), boxH)
  const win = { x: x, y: yy - Math.round(boxH / 2) }
  rect(g, x - u(1), yy - boxH + u(1), u(2), boxH - u(2), P.day ? ink : '#ffcf7a')
  if (!P.day) rect(g, x - u(1), yy - boxH + u(1), u(2), u(1), '#fff2b0')
  yy -= boxH
  // The roof: wider at its eaves, its corners turned up, snow heaped on it.
  const rh = u(2.5)
  for (let r = 0; r < rh; r++) {
    const hw = Math.round(lerp(u(2), u(5.5), r / Math.max(1, rh - 1)))
    rect(g, x - hw, yy - rh + r, hw * 2, 1, r === rh - 1 ? ink : dark)
  }
  rect(g, x - u(6), yy - u(1) - 1, u(1), 1, dark)
  rect(g, x + u(5), yy - u(1) - 1, u(1), 1, dark)
  const sw = u(5)
  for (let r = 0; r < u(2); r++)
    rect(g, x - sw + r, yy - rh - r, (sw - r) * 2, 1, r ? P.tsnow[3]! : P.tsnow[2]!)
  rect(g, x - 1, yy - rh - u(2) - u(1), 2, u(1), P.tsnow[3]!)
  return win
}

/**
 * The ground and the shrine's stonework: the snowfield in perspective (drift ridges closer together toward the
 * horizon), the mound the tree stands on, stone steps climbing to it. `w` with the drift margins.
 */
function ground(L: ShrineLayout, P: ShrinePal, seed: number): Canvas {
  const cw = L.w + 2 * M
  const fh = L.h - L.hz
  const cx = L.treeX + M
  const c = shade(cw, L.h, (x, y) => {
    if (y < L.hz) return null
    const q = (y - L.hz) / Math.max(1, fh)
    const z = 1 / (q + 0.07)
    const wx = (x - cx) * z * 0.012
    const amp = clamp((q - 0.03) * 5)
    const ph = z * 0.75 + 0.3 * Math.sin(wx * 2.2 + z * 0.3 + seed) + 0.15 * vnoise(wx * 3, z)
    const f = ph - Math.floor(ph)
    let v = 0.18 + 0.7 * Math.pow(q, 0.55) + (fbm(x / (10 + 40 * q), y / (2 + 6 * q) + seed) - 0.5) * 0.3
    if (f < 0.1) v += 0.32 * amp
    else if (f < 0.32) v -= 0.22 * amp
    // The shrine's lit ground round the mound.
    v += 0.18 * clamp(1 - Math.hypot((x - cx) / (L.size * 0.7), (y - L.base) / (L.size * 0.25)))
    return pick(P.field, v, x, y)
  })
  const g = c.g
  // The mound under the tree.
  const mrx = Math.round(L.size * 0.46)
  const mry = Math.max(3, Math.round(L.size * 0.075))
  for (let dy = -mry; dy <= mry; dy++) {
    const hw = Math.round(mrx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (mry * mry))))
    for (let dx = -hw; dx <= hw; dx++) {
      const v = 0.72 - (dy / mry) * 0.18 + (dx / mrx) * -P.light * 0.18
      rect(g, cx + dx, L.base + dy, 1, 1, pick(P.field, v, cx + dx, L.base + dy))
    }
  }
  softEllipse(
    g,
    cx,
    L.base + 1,
    Math.round(L.size * 0.24),
    Math.max(2, Math.round(mry * 0.6)),
    P.field[0]!,
    0.75,
  )
  // Boulders on the field, away from the steps.
  const r = rng(seed * 7 + 1)
  for (let k = 0; k < 7; k++) {
    const side = k % 2 ? 1 : -1
    const q = r.range(0.08, 0.7)
    const y = Math.round(L.hz + (L.h - L.hz) * q * q + 2)
    const x = Math.round(cx + side * (L.size * 0.5 + r.range(0, L.w * 0.45)))
    boulder(g, x, y, Math.max(2, Math.round((2 + q * 12) * (L.size / 100))), P)
  }
  // The steps: a flight of stone climbing to the mound, wider toward us, snow on every tread.
  const top = L.base + Math.max(2, Math.round(mry * 0.6))
  const bottom = L.h + 6
  const [hw0, hw1] = L.step
  const n = Math.max(4, Math.round((bottom - top) / Math.max(7, 9 * (L.size / 100))))
  const hwAt = (y: number) => lerp(hw0, hw1, clamp((y - top) / (bottom - top)))
  const [ink, dark, mid, lit] = P.stone as [string, string, string, string]
  for (let j = 0; j < n; j++) {
    const y0 = Math.round(top + (bottom - top) * Math.pow(j / n, 1.35))
    const y1 = Math.round(top + (bottom - top) * Math.pow((j + 1) / n, 1.35))
    const riser = Math.max(1, Math.round((y1 - y0) * 0.3))
    for (let y = y0; y < y1; y++) {
      const hw = Math.round(hwAt(y))
      if (y < y1 - riser) {
        // The tread: snow like the field's, bluer at its back, worn in the middle, the stone's ends showing.
        const qq = (y - y0) / Math.max(1, y1 - riser - y0)
        for (let dx = -hw; dx <= hw; dx++) {
          const end = Math.abs(dx) > hw - 2
          const worn = Math.abs(dx) < hw * 0.35 ? -0.12 : 0
          const v = 0.42 + qq * 0.4 + worn + (dx / hw) * -P.light * 0.12
          rect(g, cx + dx, y, 1, 1, end ? mid : pick(P.field, v, cx + dx, y))
        }
      } else {
        // The riser: stone, lit on one side, snow lipping over its top edge.
        for (let dx = -hw; dx <= hw; dx++) {
          const top1 = y === y1 - riser && hash2(dx, j) < 0.6
          const v = 0.7 + (dx / hw) * -P.light * 0.3 - (y - (y1 - riser)) / (riser * 2.5)
          rect(g, cx + dx, y, 1, 1, top1 ? P.field[5]! : pick([ink, dark, mid, lit], v, cx + dx, y))
        }
      }
      // Snow banked against the steps' sides.
      const bank = Math.round(2 + (y - top) * 0.1)
      for (let k = 0; k < bank; k++) {
        rect(g, cx - hw - 2 - k, y, 1, 1, pick(P.field, 0.72 - k * 0.05, cx - hw - 2 - k, y))
        rect(g, cx + hw + 2 + k, y, 1, 1, pick(P.field, 0.6 - k * 0.05, cx + hw + 2 + k, y))
      }
    }
  }
  return c
}

/** What stands in front of the tree: the stone lanterns up the steps. Their windows are noted in the layout. */
function stonework(L: ShrineLayout, P: ShrinePal, fewLamps: boolean): Canvas {
  const c = canvas(L.w + 2 * M, L.h)
  const g = c.g
  const cx = L.treeX + M
  const top = L.base + 3
  const bottom = L.h + 6
  const [hw0, hw1] = L.step
  L.lamps = []
  const at = fewLamps ? [0.3] : [0.06, 0.38]
  for (const q of at) {
    const y = Math.round(top + (bottom - top) * q)
    if (y > L.hv + 6) continue
    const hw = lerp(hw0, hw1, q)
    const s = lerp(0.75, 2.2, q) * Math.max(0.6, L.size / 100)
    for (const side of [-1, 1]) {
      const x = Math.round(cx + side * (hw + 6 * s))
      softEllipse(
        g,
        x + 2 * P.light * -1,
        y,
        Math.round(6 * s),
        Math.max(1, Math.round(1.5 * s)),
        P.field[1]!,
        0.7,
      )
      const win = lantern(g, x, y, s, P)
      L.lamps.push({ x: win.x - M, y: win.y, s })
    }
  }
  return c
}

/** The near foreground: big snow-capped rocks at the bottom corners and a drift crest (they drift fastest). */
function foreground(L: ShrineLayout, P: ShrinePal, seed: number): Canvas {
  const c = canvas(L.w + 2 * M, L.h)
  const g = c.g
  const u = Math.max(0.7, L.size / 100)
  const y = Math.min(L.h, L.hv + Math.round(6 * u))
  boulder(g, M + Math.round(6 * u), y, Math.round(22 * u), P)
  boulder(g, M + Math.round(28 * u), y + 3, Math.round(10 * u), P)
  boulder(g, M + L.w - Math.round(4 * u), y + 2, Math.round(26 * u), P)
  boulder(g, M + L.w - Math.round(30 * u), y + 4, Math.round(8 * u) + (seed % 2), P)
  return c
}

/** The crown shrine in layers, built once per stage and light; `draw` puts it together, the camera at `cam`. */
export interface Shrine {
  L: ShrineLayout
  P: ShrinePal
  sky: Canvas
  far: Canvas
  mid: Canvas
  forest: Canvas
  ground: Canvas
  front: Canvas
  fore: Canvas
}

export function makeShrine(w: number, h: number, o: ShrineOpts & { day?: boolean } = {}): Shrine {
  const L = shrineLayout(w, h, o)
  const P = o.day ? DAY : NIGHT
  const seed = o.seed ?? 3
  const key = `wo-shrine|${w}|${h}|${L.hv}|${L.treeX}|${L.base}|${L.size}|${L.hz}|${!!o.fewLamps}|${P.day}|${seed}`
  return cached(key, () => {
    const front = stonework(L, P, !!o.fewLamps)
    return {
      L,
      P,
      sky: P.day ? daySky(w, h) : stormSky(w, h),
      far: range(L, 'far', P, seed + 1),
      mid: range(L, 'mid', P, seed + 4),
      forest: forest(L, P, seed + 9),
      ground: ground(L, P, seed),
      front,
      fore: foreground(L, P, seed + 2),
    }
  })
}

export interface ShrineDraw {
  /** The camera's drift (art pixels; the near layers move most). */
  cam?: number
  look?: TreeLook
  /** The lanterns' light, 0 out. */
  lamps?: number
  /** Leave out the sky (drawn already, or another one). */
  noSky?: boolean
  /** Leave out what stands in front of the tree (drawn later, over the foe). */
  noFront?: boolean
}

export function drawShrine(g: G, S: Shrine, o: ShrineDraw = {}) {
  const cam = o.cam ?? 0
  const L = S.L
  if (!o.noSky) g.drawImage(S.sky, 0, 0)
  g.drawImage(S.far, -M + Math.round(cam * 0.15), 0)
  g.drawImage(S.mid, -M + Math.round(cam * 0.3), 0)
  g.drawImage(S.forest, -M + Math.round(cam * 0.55), 0)
  g.drawImage(S.ground, -M + Math.round(cam), 0)
  drawCrownTree(g, L.treeX + Math.round(cam), L.base, L.size, { ...o.look, eyes: 0, day: S.P.day })
  if (!o.noFront) drawShrineFront(g, S, o)
}

export function drawShrineFront(g: G, S: Shrine, o: ShrineDraw = {}) {
  const cam = o.cam ?? 0
  g.drawImage(S.front, -M + Math.round(cam), 0)
  const lamps = o.lamps ?? 0
  if (lamps > 0 && !S.P.day)
    for (const l of S.L.lamps) {
      const r = Math.max(4, Math.round(7 * l.s))
      g.drawImage(glow(r, WO.warm, 1.8, Math.round(lamps * 6) / 10), l.x + Math.round(cam) - r, l.y - r)
    }
  g.drawImage(S.fore, -M + Math.round(cam * 1.35), 0)
}

/** The clear sky after the blizzard: deep morning blue to pale snow-light. Cached. */
const daySky = (w: number, h: number): Canvas => cached(`wo-dawn|${w}|${h}`, () => skyOf(w, h, DAY))

// ---------------------------------------------------------------- the cards

/** A title band (the way in's and the end's names): the storm's blue, a snow-white rim on top and gold under. */
export function snowCard(g: G, w: number, y0: number, pin: number, title: string) {
  const s = labelWidth(g, title, 2) + 40 <= w ? 2 : 1
  const h = s === 2 ? 30 : 22
  const x = Math.round(-w * (1 - ease.outExpo(clamp(pin))))
  for (let y = 0; y < h; y++) {
    const slant = Math.round((h - y) * 0.6)
    const col =
      y === 0
        ? WO.snow
        : y === h - 1
          ? WO.gold
          : y < 3
            ? WO.slate
            : bayer(y, y * 3) < y / h
              ? WO.storm
              : WO.deep
    rect(g, x + slant - 10, y0 + y, w + 20, 1, col)
  }
  label(g, title, x + 14, y0 + 8, '#ffffff', WO.night, s)
}

/** Where the name card goes: in the foreground under the tree's foot, so the crown and the eyes stay clear. */
const cardY = (L: ShrineLayout) => Math.round(L.base + Math.max(4, (L.hv - L.base - 30) * 0.55))

/** The area as the blizzard finds it: its picture covering the stage, or the Daybreak field. */
function pictureOf(w: number, h: number, picture: string | null | undefined): Canvas {
  const c = canvas(w, h)
  const f = picture ? spriteFrame(picture) : undefined
  if (f) {
    const k = Math.max(w / f.width, h / f.height)
    const dw = Math.round(f.width * k)
    const dh = Math.round(f.height * k)
    c.g.drawImage(f, Math.round((w - dw) / 2), Math.round((h - dh) / 2), dw, dh)
  } else c.g.drawImage(background(w, h).cv, 0, 0)
  return c
}

// ---------------------------------------------------------------- the way in

export interface WayInParams extends SceneSize {
  /** On the name card (the whiteout's name, in the player's language). */
  title: string
  /** The area's picture as a canvas sprite key (loadItemSprite), lost in the blizzard; null: the drawn field. */
  picture?: string | null
  short?: boolean
}

type WayInState = {
  pic: Canvas
  shrine: Shrine
  snow: Snow
  shakes: [number, number, number][]
}

/**
 * The way in, as the whiteout begins: the first flakes over the area, then the blizzard rolls in, gust after gust of
 * blown snow at every depth, the light going, until the area is lost in the white; the gust passes and the shrine
 * shows in the storm (its layers drifting as the camera settles), the crown tree under its snow, the lanterns lit. The
 * dark closes in and the lanterns gutter out; two red eyes open in the tree (a blink, then held: `beat('line')`, the
 * screen's words); the name card. It then holds its end (the snow driving, the eyes glowing, now and then a blink)
 * until the page takes it away. `short`: the same in half the time.
 */
export function whiteoutIntroTimeline(p: WayInParams): Timeline<WayInState> {
  const w = p.w ?? W
  const h = p.h ?? H
  const k = p.short ? 0.5 : 1
  const hv = h - (p.inset ?? 0)
  const T_WALL = 0.2 * k
  const T_PEAK = 1.55 * k
  const T_CLEAR = 2.6 * k
  const T_DIM = 2.65 * k
  const T_EYES = 3.05 * k
  const T_LINE = 3.4 * k
  const T_CARD = 3.85 * k
  return {
    id: 'whiteout-intro',
    hold: true,
    dur: p.short ? 2.3 : 4.6,
    setup() {
      const r = rng(460)
      return {
        pic: pictureOf(w, h, p.picture),
        shrine: makeShrine(w, h, { hv }),
        snow: makeSnow(r, w, h),
        shakes: [
          [T_EYES + 0.2 * k, 0.35, 1],
          [T_LINE, 0.4, 1],
        ],
      }
    },
    step(s, t, dt) {
      const gale = t < T_PEAK ? lerp(30, 150, span(t, 0, T_PEAK)) : lerp(150, 95, span(t, T_PEAK, T_CLEAR))
      stepSnow(s.snow, dt, gale + Math.sin(t * 1.3) * 20, 1.2)
    },
    draw(g, s, t) {
      const sh = screenShake(t, s.shakes)
      const L = s.shrine.L
      // How thick the blizzard is: it builds to the white-out, passes, then keeps gusting.
      const cover =
        t < T_PEAK
          ? ease.inQ(span(t, T_WALL, T_PEAK))
          : lerp(1, 0.22, ease.outC(span(t, T_PEAK, T_CLEAR))) + 0.12 * Math.max(0, Math.sin(t * 1.4))
      const fog =
        t < T_PEAK
          ? 0.82 * ease.inQ(span(t, T_WALL + 0.25 * k, T_PEAK))
          : lerp(0.82, 0.1, ease.outC(span(t, T_PEAK, T_CLEAR)))
      const dark = t < T_PEAK ? 0.45 * span(t, T_WALL, T_PEAK) : 0.5 * ease.ioS(span(t, T_DIM, T_EYES))
      const cam = Math.round(22 * (1 - ease.outC(span(t, T_PEAK, T_EYES + 0.6 * k))))
      // The lanterns: lit as the shrine shows, guttering out as the dark closes in.
      const gut = span(t, T_DIM + 0.1 * k, T_EYES - 0.05 * k)
      const lamps =
        gut <= 0
          ? 0.6 + 0.1 * Math.sin(t * 17)
          : gut >= 1
            ? 0
            : [0.6, 0, 0.4, 0, 0, 0.2, 0][Math.floor(gut * 7)]!
      g.save()
      g.translate(sh.x, sh.y)
      if (t < T_PEAK) g.drawImage(s.pic, 0, 0)
      else drawShrine(g, s.shrine, { cam, lamps })
      // The light going: the storm's dark over all of it.
      wash(g, WO.night, dark)
      drawSnow(g, s.snow, { k: [span(t, 0, T_WALL + 0.4 * k), 1, 1], depths: [0] })
      drawGusts(g, w, hv, t, cover)
      wash(g, '#c3d4e6', fog)
      // The eyes, through it all.
      if (t >= T_EYES) {
        const e = treeEyes(L.treeX + cam, L.base, L.size)
        drawEyes(g, e.x, e.y, e.gap, eyesAt(t, T_EYES, k), openAt(t, T_EYES, k), e.px)
      }
      drawSnow(g, s.snow, { k: span(t, 0, T_WALL + 0.6 * k), depths: [1, 2] })
      g.restore()
      if (t >= T_CARD) snowCard(g, w, cardY(s.shrine.L), span(t, T_CARD, T_CARD + 0.3), p.title)
    },
    cues: () =>
      [
        [T_WALL, () => quiet('whiteout.wind')],
        [T_EYES, () => quiet('whiteout.eyes')],
        [T_LINE, (hud) => hud.beat?.('line')],
        [T_CARD, (hud) => hud.beat?.('card')],
      ] satisfies Cue<WayInState>[],
  }
}

/** How bright the eyes are from when they open: a flash open, shut, then slowly wide and burning, breathing. */
function eyesAt(t: number, t0: number, k: number) {
  const e = t - t0
  if (e < 0) return 0
  if (e < 0.1 * k) return 0.7
  return 0.55 + 0.35 * ease.outC(span(e, 0.2 * k, 0.55 * k)) + 0.1 * Math.sin(t * 3.2)
}

/** How open: open, a blink, slowly open; then a blink every few seconds as it watches. */
function openAt(t: number, t0: number, k: number) {
  const e = t - t0
  if (e < 0) return 0
  if (e < 0.1 * k) return 1
  if (e < 0.2 * k) return 0
  if (e < 0.45 * k) return span(e, 0.2 * k, 0.45 * k) < 0.5 ? 0.4 : 1
  return (e - 1.2) % 3.3 > 0 && (e - 1.2) % 3.3 < 0.12 ? 0.3 : 1
}

// ---------------------------------------------------------------- the bonfire

export interface BonfireParams {
  /** The team's front sprite keys (spriteKey(dex, false, shiny)), in team order: they sit round the fire. */
  team: readonly string[]
  w?: number
  h?: number
  short?: boolean
}

/** A team member's light, worked out once its sprite has loaded: the sprite, its shade, its warm side, its rim. */
interface Lit {
  base: Canvas
  dark: Canvas
  warm: Canvas
  rim: Canvas
  cold: Canvas
}

type BonfireState = {
  r: Rng
  snow: Snow
  sparks: Particles
  smoke: Particles
  back: Canvas
  lit: (Lit | null)[]
  pop: number
}

/** Where each one sits round the fire, by team size: across (−1 left … 1 right) and how far back (1) or in front. */
const RING: readonly (readonly (readonly [number, number])[])[] = [
  [],
  [[-0.5, 0.35]],
  [
    [-0.55, 0.3],
    [0.55, 0.3],
  ],
  [
    [-0.7, 0.1],
    [0.14, 1],
    [0.72, 0.1],
  ],
  [
    [-0.86, -0.4],
    [-0.32, 0.9],
    [0.32, 0.9],
    [0.86, -0.4],
  ],
  [
    [-0.95, -0.6],
    [-0.56, 0.55],
    [0.06, 1],
    [0.56, 0.55],
    [0.95, -0.6],
  ],
  [
    [-1, -0.75],
    [-0.64, 0.35],
    [-0.22, 1],
    [0.22, 1],
    [0.64, 0.35],
    [1, -0.75],
  ],
]

/** The fire's foot on a bonfire stage. */
const fireAt = (w: number, h: number) => ({ x: Math.round(w / 2), y: Math.round(h * 0.7) })

/**
 * Where each team member sits: in a ring round the fire, seen in depth: the back ones further off (higher, smaller,
 * lit full in the face), the side ones half lit, the front ones nearer (lower, bigger, between us and the fire, so
 * dark with a rim of light). Left to right in team order; those on its left turned to face it.
 */
export function campSlots(
  n: number,
  w: number,
  h: number,
): { x: number; y: number; k: number; flip: boolean; depth: number }[] {
  const f = fireAt(w, h)
  const rows = RING[Math.max(0, Math.min(6, n))]!
  const S = h / 120
  return Array.from({ length: n }, (_, i) => {
    // Beyond six (never, a team is six), the rest squeeze in along the back.
    const [u, depth] = rows[i] ?? [-0.9 + (1.8 * i) / Math.max(1, n - 1), 0.8]
    const x = Math.round(f.x + u * w * 0.39)
    return {
      x: Math.max(1, Math.min(w - 1, x)),
      // The back row well back, so the flames only hide their feet.
      y: Math.round(f.y - depth * h * (depth > 0 ? 0.19 : 0.2)),
      k: S * (0.47 - 0.1 * depth),
      flip: x < w / 2,
      depth,
    }
  })
}

/** A sprite worked into its light (cached per bonfire): `fdx` which way the fire is (+1 right), `depth` its row. */
function litSprite(key: string, k: number, flip: boolean, fdx: number, depth: number): Lit | null {
  const f = spriteFrame(key)
  if (!f) return null
  const sw = Math.max(1, Math.round(f.width * k))
  const sh = Math.max(1, Math.round(f.height * k))
  const base = canvas(sw, sh)
  base.g.save()
  if (flip) {
    base.g.translate(sw, 0)
    base.g.scale(-1, 1)
  }
  base.g.drawImage(f, 0, 0, sw, sh)
  base.g.restore()
  const sil = (color: string) => {
    const c = canvas(sw, sh)
    c.g.drawImage(base, 0, 0)
    c.g.globalCompositeOperation = 'source-in'
    c.g.fillStyle = color
    c.g.fillRect(0, 0, sw, sh)
    c.g.globalCompositeOperation = 'source-over'
    return c
  }
  // A light falling across it, in a few hard bands (pixel art's shading, not a blur).
  const bands = (color: string, max: number, fn: (x: number, y: number) => number) => {
    const c = sil(color)
    const m = shade(sw, sh, (x, y) => {
      const a = Math.round(clamp(fn(x / sw, y / sh)) * 4) / 4
      return a > 0
        ? `#000000${Math.round(a * max * 255)
            .toString(16)
            .padStart(2, '0')}`
        : null
    })
    c.g.globalCompositeOperation = 'destination-in'
    c.g.drawImage(m, 0, 0)
    c.g.globalCompositeOperation = 'source-over'
    return c
  }
  const toward = (x: number) => (fdx > 0 ? x : 1 - x)
  const front = depth < -0.1
  const back = depth > 0.6
  const dark = bands('#050a18', front ? 0.78 : 0.62, (x, y) =>
    front
      ? 0.75 + 0.25 * (1 - y)
      : back
        ? 0.15 + 0.6 * (1 - y) * 0.6
        : 0.1 + 0.85 * (1 - toward(x)) + 0.2 * (1 - y),
  )
  const warm = bands('#ff9a40', 0.6, (x, y) =>
    front ? 0.15 * toward(x) : back ? 0.45 + 0.45 * y : 0.15 + 0.75 * toward(x) + 0.25 * y,
  )
  // The rim: its edge on the fire's side (and its top, for one with the fire behind it).
  const rim = sil(front ? '#ffb060' : '#ffd36a')
  rim.g.globalCompositeOperation = 'destination-out'
  rim.g.drawImage(base, back ? 0 : -fdx * (front ? 1 : 2), front ? 1 : back ? -1 : 0)
  rim.g.globalCompositeOperation = 'source-over'
  return { base, dark, warm, rim, cold: sil(WO.storm) }
}

/**
 * The fire at (x, y) (its foot), `k` 0..1 how big it has grown, at time t; `s` its scale (1 on a 120-high stage).
 * Stones round it, crossed logs with glowing cracks, a bed of embers, tongues of flame in frames (12 a second) through
 * the fire's ramp, licks breaking off its tips.
 */
export function drawFire(g: G, x: number, y: number, k: number, t: number, s = 1) {
  const tq = Math.floor(t * 12) / 12
  const u = (v: number) => Math.round(v * s)
  const stones = (frontRow: boolean) => {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3
      if (Math.sin(a) > 0 !== frontRow) continue
      const sx = x + Math.round(Math.cos(a) * u(15))
      const sy = y + Math.round(Math.sin(a) * u(4.5))
      const rx = u(2.5 + (i % 3) * 0.6)
      ellipse(g, sx, sy, rx, Math.max(1, u(1.5)), '#2c3442')
      rect(g, sx - rx + 1, sy - Math.max(1, u(1.5)), rx * 2 - 1, 1, k > 0.2 ? '#a06a4a' : '#5d6879')
    }
  }
  stones(false)
  // The ember bed.
  const ef = Math.floor(t * 8)
  for (let dy = -u(2); dy <= u(1); dy++) {
    const hw = Math.round(u(10) * Math.sqrt(Math.max(0, 1 - (dy * dy) / (u(2.5) * u(2.5)))))
    for (let dx = -hw; dx <= hw; dx++) {
      const hv = hash2(dx * 7 + ef * 131, dy)
      const c =
        k <= 0
          ? hv < 0.2
            ? '#3a2a22'
            : '#1c1410'
          : hv < 0.15 * k
            ? WO.fireHot
            : hv < 0.5
              ? WO.fireDeep
              : WO.ember
      rect(g, x + dx, y + dy, 1, 1, c)
    }
  }
  // The logs, crossed, a lit top edge, glowing cracks.
  const logs: [number, number, number, number][] = [
    [-13, 2, 7, -7],
    [13, 2, -6, -8],
    [-9, -1, 10, -1],
  ]
  for (const [ax, ay, bx, by] of logs) {
    line(g, x + u(ax), y + u(ay), x + u(bx), y + u(by), WO.log, Math.max(2, u(3)))
    line(g, x + u(ax), y + u(ay) - Math.max(1, u(1)), x + u(bx), y + u(by) - Math.max(1, u(1)), WO.logLit)
    if (k > 0) {
      const m = 0.35 + 0.3 * Math.sin(t * 5 + ax)
      rect(g, x + Math.round(lerp(u(ax), u(bx), m)), y + Math.round(lerp(u(ay), u(by), m)), 1, 1, WO.fireHot)
    }
  }
  if (k > 0) {
    // The flames: a few tongues, each swelling and swaying on its own beat; the hottest in its heart.
    const tongues = [
      [0, 1, 1, 7.3, 0],
      [-5, 0.68, 0.72, 9.1, 1.7],
      [5, 0.74, 0.7, 8.3, 3.1],
      [-2, 0.86, 0.62, 11.7, 4.4],
      [3, 0.58, 0.55, 10.3, 2.2],
    ] as const
    const hmax = 38 * s * k
    const bw = Math.ceil(u(18)) + 4
    const bh = Math.ceil(hmax * 1.12) + 2
    const heat = new Float32Array((bw * 2 + 1) * bh)
    for (const [bx, hk, wk, f, ph] of tongues) {
      const ht = hmax * hk * (0.8 + 0.2 * Math.sin(tq * f + ph))
      const wt = 9.5 * s * Math.sqrt(k) * wk
      for (let r = 0; r < ht && r < bh; r++) {
        const q = r / ht
        const half =
          wt *
          Math.pow(1 - q, 0.62) *
          Math.min(1, (r + 2) / (3 * s)) *
          (1 + 0.14 * Math.sin(tq * 13 + r * 0.5 + ph))
        const cx = bx * s + Math.sin(tq * 5.3 + r * 0.21 + ph) * Math.pow(q, 1.3) * 3.2 * s
        for (let dx = Math.floor(cx - half); dx <= Math.ceil(cx + half); dx++) {
          if (dx < -bw || dx > bw) continue
          const v = Math.pow(clamp(1 - Math.abs(dx - cx) / Math.max(0.5, half)), 0.7) * (1 - q * 0.78)
          const i = r * (bw * 2 + 1) + dx + bw
          if (v > heat[i]!) heat[i] = v
        }
      }
    }
    const ramp = [WO.ember, WO.fireDeep, WO.fire, WO.fireHot, WO.fireCore] as const
    for (let r = 0; r < bh; r++) {
      const yy = y - 1 - r
      for (let dx = -bw; dx <= bw; dx++) {
        const v = heat[r * (bw * 2 + 1) + dx + bw]!
        if (v <= 0.03) continue
        const lv = v * 4.4 + (bayer(dx, yy) - 0.5) * 0.7
        rect(g, x + dx, yy, 1, 1, ramp[Math.max(0, Math.min(4, Math.floor(lv)))]!)
      }
    }
    // Licks breaking off the tips and rising, shrinking.
    for (let m = 0; m < 3; m++) {
      const ph = (tq * 1.6 + m * 0.37) % 1
      const sz = Math.round((1 - ph) * 2.4 * s * k)
      if (sz <= 0) continue
      const lx = x + Math.round(Math.sin(m * 2.1 + tq * 4) * 3 * s)
      const ly = y - Math.round(hmax * (0.78 + ph * 0.55))
      disc(g, lx, ly, sz, ph < 0.35 ? WO.fireHot : ph < 0.7 ? WO.fire : WO.fireDeep)
    }
  }
  stones(true)
}

/** The bonfire's still layers: the night, the far ridge, the crown tree's shape looming, pines, the snow. Cached. */
function campBack(w: number, h: number): Canvas {
  return cached(`wo-camp|${w}|${h}`, () => {
    const hz = Math.round(h * 0.47)
    const c = shade(w, h, (x, y) => {
      if (y < hz) {
        const v = (y / hz) * 0.7 + (fbm(x / 40, y / 10) - 0.5) * 0.35
        return pick(['#020409', '#04070f', '#070d1b', '#0b1428', '#101c36'], v, x, y)
      }
      const q = (y - hz) / (h - hz)
      const z = 1 / (q + 0.08)
      const f = (z * 0.8 + 0.3 * Math.sin((x - w / 2) * z * 0.03)) % 1
      const amp = clamp((q - 0.05) * 5)
      const v = 0.2 + 0.55 * q + (f < 0.1 ? 0.3 * amp : f < 0.3 ? -0.2 * amp : 0)
      return pick(['#0a1222', '#0e1a30', '#14223c', '#1b2b48', '#22355a'], v, x, y)
    })
    const g = c.g
    // The far ridge.
    for (let x = 0; x < w; x++) {
      const top = Math.round(
        hz - h * 0.12 * (0.5 + 0.5 * Math.abs(Math.sin(x * 0.03 + 1.2))) - vnoise(x * 0.1, 2) * 4,
      )
      rect(g, x, top, 1, hz - top, '#0b1426')
      rect(g, x, top, 1, 1, '#1a2a48')
    }
    // The crown tree far off, a dark shape over the forest, its crown catching a glint.
    const t = canvas(w, h)
    const ts = Math.round(h * 0.55)
    drawCrownTree(t.g, Math.round(w * 0.8), hz + 3, ts, { snow: 0.8 })
    t.g.globalCompositeOperation = 'source-atop'
    t.g.globalAlpha = 0.82
    t.g.fillStyle = '#081020'
    t.g.fillRect(0, 0, w, h)
    g.drawImage(t, 0, 0)
    drawCrown(g, Math.round(w * 0.8), hz + 3 - ts + 2, 1, 1)
    // The forest.
    const r = rng(29)
    for (let x = -2; x < w + 4; x += 4) pine(g, x, hz + 1, Math.round(r.range(5, 13)), '#060c18', '#1a2a48')
    for (let k = 0; k < 6; k++) {
      const x = Math.round(r.range(0, w))
      if (Math.abs(x - w * 0.8) < h * 0.2) continue
      pine(g, x, hz + 3, Math.round(h * r.range(0.18, 0.3)), '#050a14', '#1a2a48')
    }
    return c
  })
}

/** The dark round the fire's light: dithered at the edges, `rk` how far the light reaches. Cached by size. */
function campDark(w: number, h: number, rk: number): Canvas {
  return cached(`wo-campdark|${w}|${h}|${rk}`, () => {
    const f = fireAt(w, h)
    return shade(w, h, (x, y) => {
      const d = Math.hypot((x - f.x) / (w * 0.62 * rk), (y - f.y + h * 0.12) / (h * 0.85 * rk))
      const a = Math.pow(clamp((d - 0.42) / 0.62), 1.3) * 0.88
      return a > bayer(x, y) ? '#03060d' : null
    })
  })
}

/**
 * The bonfire, the cozy moment between waves: the dark, the blizzard blowing beyond the light, the crown tree's shape
 * far off; flint sparks on the logs, a wisp of smoke, then the fire catching and growing; its light pooling warm on
 * the snow (flickering) and pushing the dark back; the team in a ring round it in depth, lit warm on the fire's side,
 * those in front dark against it with a rim of light; sparks rising and dying, smoke. When the fire has caught
 * (`hud.heal`, `beat('warm')`) the screen has the engine give the heal. It then holds, the fire burning on, until the
 * page takes it away. `short`: it catches at once.
 */
export function bonfireTimeline(p: BonfireParams): Timeline<BonfireState> {
  const w = p.w ?? 240
  const h = p.h ?? 120
  const S = h / 120
  const T_SPARK = p.short ? 0.05 : 0.25
  const T_FLAME = p.short ? 0.12 : 0.75
  const T_CATCH = p.short ? 0.35 : 1.3
  const F = fireAt(w, h)
  const slots = campSlots(p.team.length, w, h)
  const STRIKES = p.short ? [T_SPARK] : [T_SPARK, T_SPARK + 0.2, T_SPARK + 0.38]
  const grownAt = (t: number) => (t < T_FLAME ? 0 : ease.outBack(span(t, T_FLAME, T_CATCH), 1.3))
  return {
    id: 'whiteout-bonfire',
    hold: true,
    dur: T_CATCH + 0.45,
    setup() {
      const r = rng(37)
      return {
        r,
        snow: makeSnow(r, w, h, 0.55),
        sparks: new Particles(),
        smoke: new Particles(),
        back: campBack(w, h),
        lit: slots.map(() => null),
        pop: 1,
      }
    },
    step(s, t, dt) {
      stepSnow(s.snow, dt, 34 + Math.sin(t * 0.8) * 14, 0.6)
      s.sparks.update(dt)
      s.smoke.update(dt)
      const r = s.r
      const grow = grownAt(t)
      for (const at of STRIKES)
        if (t >= at && t - dt < at)
          for (let i = 0; i < 7; i++)
            s.sparks.add({
              x: F.x - 3 * S,
              y: F.y - 3 * S,
              vx: r.range(-40, 40) * S,
              vy: -r.range(10, 50) * S,
              ay: 120 * S,
              life: r.range(0.15, 0.35),
              shape: 'px',
              colors: [WO.white, WO.fireCore, WO.fireHot],
            })
      // A wisp of smoke off the logs before they catch; then only now and then, high over the flames.
      if (t > T_SPARK + 0.2 && grow <= 0 && r() < 0.18)
        s.smoke.add({
          x: F.x + r.range(-2, 2) * S,
          y: F.y - (4 + 40 * Math.min(1, grow)) * S,
          vx: r.range(6, 14) * S,
          vy: -r.range(12, 20) * S,
          life: r.range(1, 1.6),
          size: 1,
          size1: Math.round(4 * S),
          shape: 'smoke',
          density: 0.5,
          colors: grow > 0 ? ['#2a2632', '#1c1e2a', '#141826'] : ['#4a5262', '#343c4c', '#262c38'],
        })
      if (grow > 0.2) {
        if (r() < 0.32 * grow)
          s.sparks.add({
            x: F.x + r.range(-6, 6) * S,
            y: F.y - r.range(8, 22) * S * grow,
            vx: r.range(-10, 10) * S,
            vy: -r.range(30, 60) * S,
            ax: r.range(-30, 30) * S,
            ay: 8 * S,
            drag: 0.8,
            life: r.range(0.6, 1.6),
            shape: 'px',
            colors: [WO.fireCore, WO.fireHot, WO.fire, WO.fireDeep, WO.ember],
          })
        // Now and then a log cracks: a burst of sparks shooting up.
        s.pop -= dt
        if (s.pop <= 0) {
          s.pop = r.range(0.7, 1.6)
          for (let i = 0; i < 6; i++)
            s.sparks.add({
              x: F.x + r.range(-4, 4) * S,
              y: F.y - 6 * S,
              vx: r.range(-25, 25) * S,
              vy: -r.range(70, 110) * S,
              ay: 30 * S,
              drag: 1.2,
              life: r.range(0.5, 1.1),
              size: 1,
              shape: i ? 'px' : 'plus',
              colors: [WO.white, WO.fireCore, WO.fireHot, WO.fire, WO.ember],
            })
        }
      }
    },
    draw(g, s, t) {
      const grow = grownAt(t)
      const flick = 0.82 + 0.1 * Math.sin(t * 9) + 0.08 * Math.sin(t * 23 + 1)
      g.drawImage(s.back, 0, 0)
      drawSnow(g, s.snow, { tone: 'dark', depths: [0] })
      // The dark round the light: close in until the fire catches, pushed back as it grows (behind the team: they
      // take their own shade).
      const rk = grow <= 0 ? 0.62 : Math.min(1.04, 0.62 + 0.42 * grow) + (flick > 0.88 ? 0.03 : 0)
      g.drawImage(campDark(w, h, Math.round(rk * 33) / 33), 0, 0)
      // The light on the snow: warm rings round the fire, flickering.
      if (grow > 0) {
        const R = w * 0.44 * Math.min(1, grow) * (0.96 + 0.06 * flick)
        const pool = ['#2c2232', '#4e3030', '#83462f', '#c4683a', '#f0a050', '#ffd890'] as const
        const frac = [1, 0.8, 0.6, 0.42, 0.26, 0.13]
        for (let i = 0; i < pool.length; i++)
          softEllipse(
            g,
            F.x,
            F.y + 1,
            Math.round(R * frac[i]!),
            Math.max(2, Math.round(R * frac[i]! * 0.25)),
            pool[i]!,
            1.6,
            0.9,
          )
      }
      // Back to front, the fire among them at its own depth.
      const order = slots.map((sl, i) => ({ sl, i })).sort((a, b) => a.sl.y - b.sl.y)
      let fireDrawn = false
      const fire = () => {
        drawFire(g, F.x, F.y, grow, t, S)
        if (t >= T_SPARK && t < T_FLAME && Math.floor(t * 20) % 2)
          rect(g, F.x - 2, F.y - 3, 1, 1, WO.fireCore)
        fireDrawn = true
      }
      for (const { sl, i } of order) {
        if (!fireDrawn && sl.y > F.y) fire()
        const key = p.team[i]!
        const fdx = sl.x < F.x ? 1 : -1
        s.lit[i] ??= litSprite(key, sl.k, sl.flip, fdx, sl.depth)
        const L = s.lit[i]
        // Its shadow, thrown away from the fire.
        const sz = spriteSize(key)
        const sw = Math.round(sz.w * sl.k)
        softEllipse(
          g,
          sl.x - fdx * Math.round(sw * 0.18 * grow),
          sl.y,
          Math.round(sw * 0.42),
          Math.max(2, Math.round(3 * S)),
          '#03060d',
          0.7,
        )
        if (!L) continue
        const bob = Math.floor(t * 1.6 + i * 0.7) % 2
        const x = Math.round(sl.x - L.base.width / 2)
        const y = sl.y - L.base.height + bob
        g.drawImage(L.base, x, y)
        g.drawImage(L.dark, x, y)
        const prev = g.globalAlpha
        g.globalAlpha = Math.round((1 - Math.min(1, grow)) * 4) / 8
        if (g.globalAlpha > 0) g.drawImage(L.cold, x, y)
        g.globalAlpha = Math.round(Math.min(1, grow) * flick * 4) / 4
        if (g.globalAlpha > 0) {
          g.drawImage(L.warm, x, y)
          g.drawImage(L.rim, x, y)
        }
        g.globalAlpha = prev
      }
      if (!fireDrawn) fire()
      s.smoke.draw(g)
      s.sparks.draw(g)
      drawSnow(g, s.snow, {
        tone: 'storm',
        depths: [1, 2],
        warm: grow > 0.2 ? { x: F.x, y: F.y - 16 * S, r: 52 * S * Math.min(1, grow) } : undefined,
      })
    },
    cues: () =>
      [
        [T_SPARK, () => quiet('whiteout.fire')],
        [T_CATCH, (hud) => (hud.heal?.(), hud.beat?.('warm'))],
      ] satisfies Cue<BonfireState>[],
  }
}

// ---------------------------------------------------------------- the end

export interface OutroParams extends SceneSize {
  /** On the name card. */
  title: string
  /** The caught boss's front sprite key (shiny Abomasnow), standing by its tree in the sun. */
  mon: string
  short?: boolean
}

type OutroState = {
  r: Rng
  snow: Snow
  night: Shrine
  day: Shrine
  nightLand: Canvas
  dayLand: Canvas
  clouds: Canvas[]
  tmp: Canvas
  rays: Canvas[]
  fx: Particles
  glints: [number, number][]
}

/** Where the sun breaks through: up and to the right of the tree. */
const sunAt = (L: ShrineLayout) => ({ x: Math.round(L.treeX + L.w * 0.3), y: Math.round(L.hv * 0.09) })

/**
 * The clouds breaking: the storm's sky with a hole opening round the sun, ragged like cloud, its rim a lit silver
 * lining, in ten frames from a crack of light to gone. The morning sky shows through the hole.
 */
function cloudBreak(w: number, hz: number, sx: number, sy: number, h: number): Canvas[] {
  return cached(`wo-break|${w}|${hz}|${sx}|${sy}|${h}`, () => {
    const sh = hz + 10
    const col = skyColour(w, h, NIGHT)
    const d = new Float32Array(w * sh)
    for (let y = 0; y < sh; y++)
      for (let x = 0; x < w; x++)
        d[y * w + x] = Math.hypot(x - sx, (y - sy) * 1.5) * (0.62 + 0.75 * fbm(x / 24, y / 8 + 7))
    const far = Math.hypot(Math.max(sx, w - sx), (sh - sy) * 1.5) * 1.4
    return Array.from({ length: 10 }, (_, i) => {
      const R = far * Math.pow((i + 1) / 10, 1.3)
      const rim = 2.5 + R * 0.05
      return shade(w, sh, (x, y) => {
        const v = d[y * w + x]!
        if (v < R) return null
        if (v < R + rim) {
          const q = (v - R) / rim
          return q < 0.35 ? '#fff6d8' : q < 0.7 || bayer(x, y) > q ? '#c7d6e8' : '#7f97b8'
        }
        return col(x, y)
      })
    })
  })
}

/** Sunbeams from the sun: dithered wedges fanning down over the shrine, one falling on the boss; `lv` 1–4. */
function raysOf(L: ShrineLayout, mx: number, my: number, lv: number): Canvas {
  return cached(`wo-rays|${L.w}|${L.h}|${L.hv}|${L.treeX}|${lv}`, () => {
    const S = sunAt(L)
    const toMon = Math.atan2(my - S.y, mx - S.x)
    const beams = [
      [toMon, 0.07, 1],
      [toMon - 0.17, 0.045, 0.6],
      [toMon - 0.32, 0.08, 0.8],
      [toMon - 0.5, 0.05, 0.55],
      [toMon + 0.15, 0.04, 0.6],
      [toMon + 0.3, 0.07, 0.5],
    ] as const
    const reach = Math.hypot(L.w, L.hv) * 1.1
    return shade(L.w, L.h, (x, y) => {
      if (y > L.hv) return null
      const a = Math.atan2(y - S.y, x - S.x)
      const d = Math.hypot(x - S.x, y - S.y)
      let v = 0
      for (const [ba, bw, str] of beams) {
        const q = 1 - Math.abs(a - ba) / bw
        if (q > 0) v = Math.max(v, str * Math.pow(q, 0.5))
      }
      v *= clamp(1.1 - d / reach) * (lv / 4) * 0.72
      if (v <= bayer(x, y)) return null
      return v > 0.36 ? '#fffbea' : '#ffeaa8'
    })
  })
}

/**
 * The end, once the boss is caught: the shrine still in the storm; the wind falls away and the blizzard thins out
 * layer by layer (the near snow first, the far last); the clouds part over the shrine, the morning blue behind them,
 * and the sunlight sweeps over the land from the sun's side; sunbeams fan down through the gap, the snow glints on the
 * ground and the tree, a glitter of fine snow drifting in the light; one beam falls in front of the tree and the caught
 * boss (shiny Abomasnow) appears in it, a sparkle; the name card. It then holds (the beams breathing, glints).
 * `short`: in half the time.
 */
export function whiteoutOutroTimeline(p: OutroParams): Timeline<OutroState> {
  const w = p.w ?? W
  const h = p.h ?? H
  const k = p.short ? 0.5 : 1
  const hv = h - (p.inset ?? 0)
  const T_LIFT = 0.4 * k
  const T_PART = 1.0 * k
  const T_PARTED = 2.3 * k
  const T_SWEEP = 1.5 * k
  const T_SWEPT = 2.7 * k
  const T_SUN = 2.0 * k
  const T_MON = 2.9 * k
  const T_CARD = 3.6 * k
  const L = shrineLayout(w, h, { hv })
  const monY = L.base + 2
  return {
    id: 'whiteout-outro',
    hold: true,
    dur: p.short ? 2.25 : 4.5,
    setup() {
      const r = rng(4600)
      const night = makeShrine(w, h, { hv })
      const day = makeShrine(w, h, { hv, day: true })
      const land = (S: Shrine) => {
        const c = canvas(w, h)
        drawShrine(c.g, S, { noSky: true, lamps: 0 })
        return c
      }
      const S = sunAt(L)
      // Where glints can catch: on the snowfield and on the tree's snow.
      const glints: [number, number][] = []
      for (let i = 0; i < 160; i++) {
        if (i % 3) glints.push([Math.round(r.range(0, w)), Math.round(r.range(L.hz + 2, hv - 2))])
        else {
          const q = r()
          const y = L.base - L.size * (0.1 + q * 0.85)
          const hw = L.size * (0.1 + 0.27 * (1 - q)) * 0.9
          glints.push([Math.round(L.treeX + r.range(-hw, hw)), Math.round(y)])
        }
      }
      return {
        r,
        snow: makeSnow(r, w, h),
        night,
        day,
        nightLand: land(night),
        dayLand: land(day),
        clouds: cloudBreak(w, L.hz, S.x, S.y, h),
        tmp: canvas(w, h),
        rays: [1, 2, 3, 4].map((lv) => raysOf(L, L.treeX, monY - 30, lv)),
        fx: new Particles(),
        glints,
      }
    },
    step(s, t, dt) {
      const calm = ease.ioS(span(t, T_LIFT, T_LIFT + 1.6 * k))
      stepSnow(s.snow, dt, lerp(120, 5, calm), lerp(1.3, 0.25, calm))
      s.fx.update(dt)
      const r = s.r
      if (t > T_SWEEP + 0.4 * k && r() < 0.45) {
        const [gx, gy] = r.pick(s.glints)
        s.fx.add({
          x: gx,
          y: gy,
          life: r.range(0.3, 0.6),
          size: r() < 0.3 ? 2 : 1,
          size1: 0,
          shape: 'star',
          colors: [WO.white, '#fff6d0', WO.goldPale],
        })
      }
      // The shiny's sparkle as it appears.
      if (t >= T_MON + 0.15 * k && t - dt < T_MON + 0.15 * k)
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2
          s.fx.add({
            x: L.treeX,
            y: monY - 28,
            vx: Math.cos(a) * 60,
            vy: Math.sin(a) * 45,
            drag: 3,
            life: 0.7,
            size: i % 2 ? 2 : 3,
            size1: 0,
            shape: 'star',
            colors: [WO.white, WO.sun, '#8ad0f0'],
          })
        }
    },
    draw(g, s, t) {
      const S = sunAt(L)
      // The sky: the morning behind, the storm's halves sliding apart over it.
      g.drawImage(s.day.sky, 0, 0)
      const sun = span(t, T_PART, T_PARTED)
      if (sun > 0) {
        const R = Math.round(Math.min(w, hv) * 0.32)
        g.drawImage(glow(R, WO.sun, 1.4, Math.round(sun * 7) / 10), S.x - R, S.y - R)
        disc(g, S.x, S.y, Math.round(R * 0.22), '#fffbe6')
      }
      // The storm's clouds over it, breaking open round the sun, frame by frame.
      if (t < T_PART) g.drawImage(s.night.sky, 0, 0)
      else if (t < T_PARTED) {
        const f = Math.min(9, Math.floor(ease.inQ(span(t, T_PART, T_PARTED)) * 10))
        g.drawImage(s.clouds[f]!, 0, 0)
      }
      // The land: the night's, the sunlight sweeping over it from the sun's side.
      const sweep = ease.ioQ(span(t, T_SWEEP, T_SWEPT))
      if (sweep < 1) g.drawImage(s.nightLand, 0, 0)
      if (sweep >= 1) g.drawImage(s.dayLand, 0, 0)
      else if (sweep > 0) {
        const tg = s.tmp.g
        tg.clearRect(0, 0, w, h)
        tg.drawImage(s.dayLand, 0, 0)
        tg.globalCompositeOperation = 'destination-in'
        tg.drawImage(sweepMask(w, h), -Math.round(sweep * (w + h * 0.4 + 10)), 0)
        tg.globalCompositeOperation = 'source-over'
        g.drawImage(s.tmp, 0, 0)
      }
      // Sunbeams, breathing.
      const ray = span(t, T_SUN, T_SUN + 0.8 * k) * (0.8 + 0.2 * Math.sin(t * 1.4))
      const lv = Math.round(ray * 4)
      if (lv > 0) g.drawImage(s.rays[lv - 1]!, 0, 0)
      // The caught one, in the beam in front of its tree.
      if (t >= T_MON) {
        const q = span(t, T_MON, T_MON + 0.25 * k)
        // A shaft of light lands first, then it is there.
        if (q < 1) {
          const bw = Math.round(6 + 10 * q)
          for (let y = 0; y < monY; y += 1)
            for (let x = -bw; x <= bw; x++)
              if (
                bayer(L.treeX + x, y) <
                (1 - Math.abs(x) / bw) * 0.8 * (1 - q * 0.5) * clamp((y / monY) * 3)
              )
                rect(g, L.treeX + x, y, 1, 1, '#fff6d8')
        }
        if (t >= T_MON + 0.15 * k) {
          const kk = ease.outBack(span(t, T_MON + 0.15 * k, T_MON + 0.5 * k), 1.6)
          const sz = spriteSize(p.mon)
          softEllipse(
            g,
            L.treeX - 6,
            monY,
            Math.round(sz.w * 0.42),
            Math.max(2, Math.round(sz.w * 0.08)),
            '#7f9fc4',
            0.85,
          )
          drawSprite(g, p.mon, L.treeX, monY + (Math.floor(t * 1.5) % 2), {
            sx: kk,
            sy: kk,
            flash: 1 - span(t, T_MON + 0.15 * k, T_MON + 0.6 * k),
          })
        }
      }
      s.fx.draw(g)
      // The blizzard thinning out, near to far; a glitter of fine snow left in the sun.
      const near = 1 - span(t, T_LIFT, T_LIFT + 0.7 * k)
      const mid = 1 - span(t, T_LIFT + 0.3 * k, T_LIFT + 1.3 * k)
      const far = 1 - span(t, T_LIFT + 0.6 * k, T_LIFT + 1.9 * k)
      drawGusts(g, w, hv, t, 0.55 * (1 - span(t, 0, T_LIFT + 0.5 * k)))
      wash(g, '#c3d4e6', 0.2 * (1 - span(t, T_LIFT, T_PART)))
      drawSnow(g, s.snow, { k: [far, mid, near] })
      if (t > T_SWEEP)
        drawSnow(g, s.snow, { k: [0.12 * span(t, T_SWEEP, T_SWEPT), 0, 0], tone: 'day', depths: [0] })
      if (t >= T_CARD) snowCard(g, w, cardY(L), span(t, T_CARD, T_CARD + 0.3), p.title)
    },
    cues: () =>
      [
        [T_LIFT, () => quiet('whiteout.lift')],
        [T_MON, (hud) => (quiet('hatch.shiny'), hud.beat?.('mon'))],
        [T_CARD, (hud) => hud.beat?.('card')],
      ] satisfies Cue<OutroState>[],
  }
}

/**
 * The sunlight's edge as it sweeps over the land: opaque right of a slanted line, a dithered band at its edge,
 * transparent left of it. Slid left across the stage, it lets the morning in from the sun's side. Cached.
 */
function sweepMask(w: number, h: number): Canvas {
  return cached(`wo-sweep|${w}|${h}`, () => {
    const band = 10
    return shade(w * 2 + Math.round(h * 0.4) + band + 2, h, (x, y) => {
      const e = w + (h - y) * 0.4
      const q = (x - e) / band
      return q >= 1 || (q > 0 && q > bayer(x, y)) ? '#000' : null
    })
  })
}

// ---------------------------------------------------------------- loops

/**
 * The shrine in its storm on a loop (the rules' banner, the way in's pop-up): the crown tree under its snow, the eyes
 * glowing faintly, snow and gusts driving across. `still`: one frame, held.
 */
export function shrineLoop(w: number, h: number, { still = false }: { still?: boolean } = {}): PortalLoop {
  const r = rng(w * 31 + h)
  const snow = makeSnow(r, w, h, 0.8)
  const S = makeShrine(w, h)
  const e = treeEyes(S.L.treeX, S.L.base, S.L.size)
  return {
    step(_t, dt) {
      if (!still) stepSnow(snow, dt, 100, 1.2)
    },
    draw(g, t) {
      drawShrine(g, S, { lamps: 0.5 })
      wash(g, WO.night, 0.3)
      if (!still) drawGusts(g, w, h, t, 0.3)
      drawEyes(g, e.x, e.y, e.gap, 0.65 + (still ? 0 : 0.2 * Math.sin(t * 2)), 1, e.px)
      drawSnow(g, snow)
    },
  }
}

/**
 * Snow over a fight's stage in the blizzard (docs/15 §47): flakes driven sideways and a few streaks, on a clear canvas
 * over the stage (no taps). `level` 'short' half of them; 'off' one still frame.
 */
export function snowStageLoop(
  w: number,
  h: number,
  { level = 'full' }: { level?: 'full' | 'short' | 'off' } = {},
): PortalLoop {
  const r = rng(w * 13 + h)
  const flakes = makeFlakes(r, w, h, Math.round(((w * h) / 140) * (level === 'short' ? 0.5 : 1)))
  return {
    step(_t, dt) {
      if (level !== 'off') stepFlakes(flakes, w, h, dt, 70, 1.3)
    },
    draw(g, t) {
      g.clearRect(0, 0, w, h)
      drawFlakes(g, flakes)
      if (level === 'full') drawStreaks(g, w, h, t, 0.35)
    },
  }
}
