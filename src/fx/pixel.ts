// The pixel engine (from the Visual Lab's pixel.js). Everything draws at native resolution, one canvas pixel to one art
// pixel, and CSS scales the canvas up with `image-rendering: pixelated`. Glows, shadows and fades are ordered-dithered,
// never blurred, so every frame stays one a pixel artist could have drawn (docs/15-UI-GUIDELINES.md, Motion).
// No React here: scenes, timelines and the Home team build on it.

import { getLang } from '@/i18n'
import { cjkFamily } from '@/i18n/cjk'

// ---------------------------------------------------------------- maths
export const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
/** How far t is through [a, b], clamped to 0..1. */
export const span = (t: number, a: number, b: number) => clamp((t - a) / (b - a))

export const ease = {
  lin: (t: number) => t,
  inQ: (t: number) => t * t,
  outQ: (t: number) => 1 - (1 - t) * (1 - t),
  ioQ: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inC: (t: number) => t * t * t,
  outC: (t: number) => 1 - Math.pow(1 - t, 3),
  ioS: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t: number, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
  outExpo: (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  outElastic: (t: number) =>
    t <= 0 || t >= 1 ? t : Math.pow(2, -10 * t) * Math.sin(((t * 10 - 0.75) * 2 * Math.PI) / 3) + 1,
  outBounce: (t: number) => {
    const n = 7.5625
    const d = 2.75
    if (t < 1 / d) return n * t * t
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375
    return n * (t -= 2.625 / d) * t + 0.984375
  },
}

export interface Rng {
  (): number
  range: (a: number, b: number) => number
  int: (a: number, b: number) => number
  pick: <T>(arr: readonly T[]) => T
}

/** xorshift32: the same seed replays the same particles, so a replay is the same take. */
export function rng(seed = 1): Rng {
  let s = seed >>> 0 || 1
  const next = (() => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }) as Rng
  next.range = (a, b) => a + (b - a) * next()
  next.int = (a, b) => Math.floor(a + (b - a + 1) * next())
  next.pick = (arr) => arr[Math.floor(next() * arr.length)]!
  return next
}

// ---------------------------------------------------------------- colour
const rgbCache = new Map<string, [number, number, number, number]>()
/** '#rgb', '#rrggbb' or '#rrggbbaa' → [r, g, b, a]. */
export function rgba(hex: string): [number, number, number, number] {
  let v = rgbCache.get(hex)
  if (v) return v
  let h = hex.slice(1)
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  v = [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
    h.length >= 8 ? parseInt(h.slice(6, 8), 16) : 255,
  ]
  rgbCache.set(hex, v)
  return v
}
const toHex = (r: number, g: number, b: number) =>
  '#' +
  [r, g, b]
    .map((x) =>
      Math.round(clamp(x, 0, 255))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
export function mix(a: string, b: string, t: number): string {
  const A = rgba(a)
  const B = rgba(b)
  return toHex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t))
}
/** A colour from a ramp, t in 0..1, stepped (no in-between colours: the ramp is the palette). */
export const ramp = (cols: readonly string[], t: number) =>
  cols[Math.min(cols.length - 1, Math.max(0, Math.floor(t * cols.length)))]!

// ---------------------------------------------------------------- dithering
const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
/** Bayer 4×4 threshold for a pixel, 0..1. */
export const bayer = (x: number, y: number) => (B4[((y & 3) << 2) | (x & 3)]! + 0.5) / 16

// ---------------------------------------------------------------- canvases
export type Canvas = HTMLCanvasElement & { g: CanvasRenderingContext2D }
export type G = CanvasRenderingContext2D

export function canvas(w: number, h: number): Canvas {
  const c = document.createElement('canvas') as Canvas
  c.width = Math.max(1, w | 0)
  c.height = Math.max(1, h | 0)
  c.g = c.getContext('2d')!
  c.g.imageSmoothingEnabled = false
  return c
}

/** A canvas painted by a per-pixel function returning a colour (or null for transparent). */
export function shade(
  w: number,
  h: number,
  fn: (x: number, y: number) => string | null | undefined | false,
): Canvas {
  const c = canvas(w, h)
  const img = c.g.createImageData(c.width, c.height)
  const d = img.data
  for (let y = 0; y < c.height; y++)
    for (let x = 0; x < c.width; x++) {
      const col = fn(x, y)
      if (!col) continue
      const v = rgba(col)
      const i = (y * c.width + x) * 4
      d[i] = v[0]
      d[i + 1] = v[1]
      d[i + 2] = v[2]
      d[i + 3] = v[3]
    }
  c.g.putImageData(img, 0, 0)
  return c
}

const memo = new Map<string, unknown>()
/** Draw once, reuse: glows, patterns, icons and scenes are cached by a key. */
export function cached<T>(key: string, make: () => T): T {
  let v = memo.get(key) as T | undefined
  if (v === undefined) memo.set(key, (v = make()))
  return v
}

/** A dithered radial glow: opaque pixels thinning out with distance. r in art pixels. */
export const glow = (r: number, color: string, power = 1.5, max = 1) =>
  cached(`glow|${r}|${color}|${power}|${max}`, () =>
    shade(2 * r + 1, 2 * r + 1, (x, y) => {
      const d = Math.hypot(x - r, y - r) / (r + 0.5)
      if (d >= 1) return null
      return Math.pow(1 - d, power) * max > bayer(x, y) ? color : null
    }),
  )

/** A dithered ring of radius r and width w, soft on both edges. */
export const ring = (r: number, w: number, color: string, density = 1) =>
  cached(`ring|${r}|${w}|${color}|${density}`, () =>
    shade(2 * r + 3, 2 * r + 3, (x, y) => {
      const d = Math.hypot(x - r - 1, y - r - 1)
      const k = 1 - Math.abs(d - (r - w / 2)) / (w / 2 + 0.5)
      return k > 0 && k * density > bayer(x, y) * 0.9 ? color : null
    }),
  )

/** A 4×4 ordered-dither pattern at a coverage level (0..16): screen fades without a single blended pixel. */
export function pattern(g: G, color: string, level: number): CanvasPattern | string {
  const lv = Math.round(clamp(level, 0, 16))
  const tile = cached(`pat|${color}|${lv}`, () => shade(4, 4, (x, y) => (B4[y * 4 + x]! < lv ? color : null)))
  return g.createPattern(tile, 'repeat') ?? color
}

/**
 * Full-screen washes (dims, tints, flashes) use stepped alpha, not dither: a dither pattern laid over sprites reads as
 * a screen door. Dither stays for local light, glows and shadows.
 */
export function wash(g: G, color: string, alpha: number, steps = 8) {
  const a = Math.round(clamp(alpha) * steps) / steps
  if (a <= 0) return
  const prev = g.globalAlpha
  g.globalAlpha = a
  g.fillStyle = color
  g.fillRect(-8, -8, g.canvas.width + 16, g.canvas.height + 16)
  g.globalAlpha = prev
}

export function ditherFill(g: G, x: number, y: number, w: number, h: number, color: string, alpha: number) {
  if (alpha <= 0) return
  g.fillStyle = alpha >= 1 ? color : pattern(g, color, alpha * 16)
  g.fillRect(x | 0, y | 0, w | 0, h | 0)
}

// ---------------------------------------------------------------- primitives
export function rect(g: G, x: number, y: number, w: number, h: number, c: string | CanvasPattern) {
  g.fillStyle = c
  g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
}
export const px = (g: G, x: number, y: number, c: string) => rect(g, x, y, 1, 1, c)

/** Bresenham line, `w` pixels thick. */
export function line(g: G, x0: number, y0: number, x1: number, y1: number, c: string, w = 1) {
  x0 = Math.round(x0)
  y0 = Math.round(y0)
  x1 = Math.round(x1)
  y1 = Math.round(y1)
  g.fillStyle = c
  const dx = Math.abs(x1 - x0)
  const dy = -Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx + dy
  const o = (w - 1) >> 1
  for (let i = 0; i < 2000; i++) {
    g.fillRect(x0 - o, y0 - o, w, w)
    if (x0 === x1 && y0 === y1) break
    const e2 = 2 * err
    if (e2 >= dy) {
      err += dy
      x0 += sx
    }
    if (e2 <= dx) {
      err += dx
      y0 += sy
    }
  }
}

export function ellipse(g: G, cx: number, cy: number, rx: number, ry: number, c: string | CanvasPattern) {
  g.fillStyle = c
  cx = Math.round(cx)
  cy = Math.round(cy)
  for (let dy = -ry; dy <= ry; dy++) {
    const hw = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry + 0.25))))
    g.fillRect(cx - hw, cy + dy, hw * 2 + 1, 1)
  }
}
export const disc = (g: G, cx: number, cy: number, r: number, c: string) => ellipse(g, cx, cy, r, r, c)

/** Outline of an ellipse, one pixel wide, 8-connected. */
export function ellipseLine(
  g: G,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  c: string,
  from = 0,
  to = Math.PI * 2,
) {
  g.fillStyle = c
  const steps = Math.max(24, Math.ceil((rx + ry) * 4))
  let lx: number | null = null
  let ly: number | null = null
  for (let i = 0; i <= steps; i++) {
    const a = from + ((to - from) * i) / steps
    const x = Math.round(cx + Math.cos(a) * rx)
    const y = Math.round(cy + Math.sin(a) * ry)
    if (x !== lx || y !== ly) g.fillRect(x, y, 1, 1)
    lx = x
    ly = y
  }
}

/** A dithered ellipse (contact shadows, ground glows): coverage falls off from the centre. */
export function softEllipse(
  g: G,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  c: string,
  alpha = 0.5,
  power = 1,
) {
  g.fillStyle = c
  cx = Math.round(cx)
  cy = Math.round(cy)
  for (let y = -ry; y <= ry; y++)
    for (let x = -rx; x <= rx; x++) {
      const d = (x * x) / (rx * rx) + (y * y) / (ry * ry)
      if (d > 1) continue
      if (Math.pow(1 - d, power) * alpha > bayer(cx + x, cy + y)) g.fillRect(cx + x, cy + y, 1, 1)
    }
}

// ---------------------------------------------------------------- bitmap font (5×7)
export const GLYPHS: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01111', '10000', '10000', '10011', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  0: ['01110', '10011', '10101', '10101', '10101', '11001', '01110'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  6: ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  9: ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  '-': ['00000', '00000', '00000', '01110', '00000', '00000', '00000'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  '.': ['00000', '00000', '00000', '00000', '00000', '00000', '00100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
}
/** Width of a string in art pixels at scale s (6 px advance per glyph). */
export const textWidth = (str: string, s = 1) => (str.length * 6 - 1) * s

/** Text with a one-pixel outline (8 directions) and an optional drop shadow. Digits and A–Z only: numbers on canvas. */
export function text(
  g: G,
  str: string | number,
  x: number,
  y: number,
  color: string,
  outline: string | null = null,
  s = 1,
  shadow: string | null = null,
) {
  const up = String(str).toUpperCase()
  x = Math.round(x)
  y = Math.round(y)
  const draw = (ox: number, oy: number, col: string) => {
    g.fillStyle = col
    for (let i = 0; i < up.length; i++) {
      const gl = GLYPHS[up[i]!] ?? GLYPHS[' ']!
      for (let r = 0; r < 7; r++)
        for (let c = 0; c < 5; c++)
          if (gl[r]![c] === '1') g.fillRect(x + ox + (i * 6 + c) * s, y + oy + r * s, s, s)
    }
  }
  if (shadow) draw(s, s * 2, shadow)
  if (outline)
    for (const [ox, oy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const)
      draw(ox * s, oy * s, outline)
  draw(0, 0, color)
}

/** Whether the bitmap font has every character of a string (A–Z, digits, a few signs). */
const covered = (str: string) => [...str.toUpperCase()].every((c) => c in GLYPHS)
const labelFont = (s: number) => `${9 * s}px "Jersey 15", "${cjkFamily(getLang())}", sans-serif`

/**
 * A word on the canvas in the player's language: the bitmap font when it has every letter (crisp, uppercase), else
 * the page's pixel font (accents, Japanese, Korean, Chinese names). Returns the width drawn.
 */
export function label(
  g: G,
  str: string,
  x: number,
  y: number,
  color: string,
  outline: string | null = null,
  s = 1,
): number {
  if (covered(str)) {
    text(g, str, x, y, color, outline, s)
    return textWidth(str, s)
  }
  g.save()
  g.font = labelFont(s)
  g.textBaseline = 'top'
  const up = str.toLocaleUpperCase(getLang())
  if (outline) {
    g.fillStyle = outline
    for (const [ox, oy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as const)
      g.fillText(up, Math.round(x) + ox * s, Math.round(y) - s + oy * s)
  }
  g.fillStyle = color
  g.fillText(up, Math.round(x), Math.round(y) - s)
  const w = Math.ceil(g.measureText(up).width)
  g.restore()
  return w
}

/** The width `label` would draw. */
export function labelWidth(g: G, str: string, s = 1): number {
  if (covered(str)) return textWidth(str, s)
  g.save()
  g.font = labelFont(s)
  const w = Math.ceil(g.measureText(str.toLocaleUpperCase(getLang())).width)
  g.restore()
  return w
}

// ---------------------------------------------------------------- icons (pixel maps)
/** A map of strings ('.' transparent) drawn with a palette. Cached per palette. */
export function icon(map: readonly string[], pal: Record<string, string>, scale = 1): Canvas {
  const key = `ico|${map.join('/')}|${JSON.stringify(pal)}|${scale}`
  return cached(key, () => {
    const w = map[0]!.length
    const h = map.length
    return shade(w * scale, h * scale, (x, y) => {
      const ch = map[Math.floor(y / scale)]![Math.floor(x / scale)]!
      return ch === '.' ? null : (pal[ch] ?? null)
    })
  })
}

// ---------------------------------------------------------------- particles
export type ParticleShape =
  | 'px'
  | 'sq'
  | 'disc'
  | 'plus'
  | 'star'
  | 'ring'
  | 'oval'
  | 'bubble'
  | 'streak'
  | 'drop'
  | 'leaf'
  | 'smoke'
  | 'note'
  | 'heart'
  | 'cross'
  | 'flake'

export interface Particle {
  x: number
  y: number
  px?: number
  py?: number
  age: number
  life: number
  vx: number
  vy: number
  ax: number
  ay: number
  drag: number
  size: number
  size1: number | null
  shape: ParticleShape
  /** Stepped through over the particle's life: the ramp is its palette. */
  colors: readonly string[]
  blend: GlobalCompositeOperation | null
  spin: number
  angle: number
  delay: number
  /** Homing: accelerate toward a point (sucked into a ball, inhaled into a mouth). */
  home?: { x: number; y: number; k: number }
  core?: string
  light?: string
  dark?: string
  squash?: number
  trail?: number
  density?: number
}

const P_DEF: Omit<Particle, 'x' | 'y'> = {
  age: 0,
  life: 1,
  vx: 0,
  vy: 0,
  ax: 0,
  ay: 0,
  drag: 0,
  size: 1,
  size1: null,
  shape: 'sq',
  colors: ['#ffffff'],
  blend: null,
  spin: 0,
  angle: 0,
  delay: 0,
}

const LEAF = [
  ['.ab..', 'abbbc', '..bc.'],
  ['..a', '.ab', 'abb', 'bbc', 'bc.'],
  ['..ba.', 'cbbba', '.cb..'],
  ['a..', 'ba.', 'bba', 'cbb', '.cb'],
]

const DRAW: Record<
  ParticleShape,
  (g: G, x: number, y: number, s: number, c: string, p: Particle, t: number) => void
> = {
  px: (g, x, y, _s, c) => rect(g, x, y, 1, 1, c),
  sq: (g, x, y, s, c) => rect(g, x - (s >> 1), y - (s >> 1), s, s, c),
  disc: (g, x, y, s, c) => (s <= 1 ? rect(g, x, y, 1, 1, c) : disc(g, x, y, s - 1, c)),
  plus: (g, x, y, s, c) => {
    rect(g, x - s, y, s * 2 + 1, 1, c)
    rect(g, x, y - s, 1, s * 2 + 1, c)
  },
  star: (g, x, y, s, c, p) => {
    // A four-point twinkle: long arms, a 3×3 heart once it is big.
    rect(g, x - s, y, s * 2 + 1, 1, c)
    rect(g, x, y - s, 1, s * 2 + 1, c)
    if (s >= 3) rect(g, x - 1, y - 1, 3, 3, c)
    if (s >= 2) rect(g, x, y, 1, 1, p.core ?? '#ffffff')
  },
  ring: (g, x, y, s, c) => ellipseLine(g, x, y, s, s, c),
  oval: (g, x, y, s, c, p) => ellipseLine(g, x, y, s, Math.max(1, Math.round(s * (p.squash ?? 0.35))), c),
  bubble: (g, x, y, s, c, p) => {
    if (s <= 1) return rect(g, x, y, 1, 1, c)
    ellipseLine(g, x, y, s, s, c)
    rect(g, x - Math.ceil(s / 2), y - Math.ceil(s / 2), 1, 1, p.core ?? '#ffffff')
  },
  streak: (g, x, y, s, c, p) => {
    const k = p.trail ?? 0.03
    line(g, x, y, x - p.vx * k, y - p.vy * k, c, Math.max(1, s))
  },
  drop: (g, x, y, s, c, p) => {
    const sp = Math.hypot(p.vx, p.vy) || 1
    line(g, x, y, x - (p.vx / sp) * (s + 1), y - (p.vy / sp) * (s + 1), c)
  },
  leaf: (g, x, y, _s, c, p) => {
    const m = LEAF[((Math.round(p.angle / (Math.PI / 4)) % 4) + 4) % 4]!
    const pal: Record<string, string> = { a: p.light ?? '#c8f58a', b: c, c: p.dark ?? '#2f6b2f' }
    for (let r = 0; r < m.length; r++)
      for (let q = 0; q < m[r]!.length; q++)
        if (m[r]![q] !== '.') rect(g, x - 2 + q, y - 1 + r, 1, 1, pal[m[r]![q]!]!)
  },
  smoke: (g, x, y, s, c, p, t) => {
    // A solid puff with a lit top; it only breaks into dither in its last third.
    const r = Math.max(1, s - 1)
    const light = p.light ?? mix(c, '#ffffff', 0.35)
    if (t < 0.66) {
      ellipse(g, x, y, r, r, c)
      if (r >= 2) ellipse(g, x - 1, y - 1, r - 1, r - 1, light)
    } else ellipse(g, x, y, r, r, pattern(g, c, (1 - t) * 3 * 12 * (p.density ?? 1)))
  },
  note: (g, x, y, _s, c) => {
    // ♪: a stem, a flag and a 2×2 head.
    rect(g, x, y - 5, 1, 6, c)
    rect(g, x + 1, y - 5, 2, 1, c)
    rect(g, x + 3, y - 4, 1, 1, c)
    rect(g, x - 2, y, 3, 2, c)
  },
  heart: (g, x, y, _s, c) => {
    const m = ['.x.x.', 'xxxxx', 'xxxxx', '.xxx.', '..x..']
    for (let r = 0; r < 5; r++)
      for (let q = 0; q < 5; q++) if (m[r]![q] === 'x') rect(g, x - 2 + q, y - 2 + r, 1, 1, c)
  },
  cross: (g, x, y, _s, c) => {
    rect(g, x - 1, y - 2, 3, 5, c)
    rect(g, x - 2, y - 1, 5, 3, c)
    rect(g, x, y - 1, 1, 3, '#ffffff')
    rect(g, x - 1, y, 3, 1, '#ffffff')
  },
  flake: (g, x, y, s, c) => {
    rect(g, x, y, 1, 1, c)
    if (s >= 2) {
      rect(g, x - 1, y, 3, 1, c)
      rect(g, x, y - 1, 1, 3, c)
    }
    if (s >= 3) {
      rect(g, x - 2, y - 2, 1, 1, c)
      rect(g, x + 2, y - 2, 1, 1, c)
      rect(g, x - 2, y + 2, 1, 1, c)
      rect(g, x + 2, y + 2, 1, 1, c)
    }
  },
}

/** Particles with drag, gravity, homing and colour ramps: one list, updated with fixed steps. */
export class Particles {
  list: Particle[] = []
  add(p: Partial<Particle> & { x: number; y: number }) {
    this.list.push({ ...P_DEF, ...p })
  }
  clear() {
    this.list.length = 0
  }
  update(dt: number) {
    const L = this.list
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i]!
      if (p.delay > 0) {
        p.delay -= dt
        continue
      }
      p.age += dt
      if (p.age >= p.life) {
        L.splice(i, 1)
        continue
      }
      if (p.home) {
        const hx = p.home.x - p.x
        const hy = p.home.y - p.y
        const d = Math.hypot(hx, hy) || 1
        p.vx += (hx / d) * p.home.k * dt
        p.vy += (hy / d) * p.home.k * dt
        if (d < 2) {
          L.splice(i, 1)
          continue
        }
      }
      p.vx += p.ax * dt
      p.vy += p.ay * dt
      if (p.drag) {
        const k = Math.max(0, 1 - p.drag * dt)
        p.vx *= k
        p.vy *= k
      }
      p.px = p.x
      p.py = p.y
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.angle += p.spin * dt
    }
  }
  draw(g: G) {
    for (const p of this.list) {
      if (p.delay > 0) continue
      const t = p.age / p.life
      const c = ramp(p.colors, t)
      const s = Math.max(0, Math.round(p.size1 == null ? p.size : lerp(p.size, p.size1, t)))
      if (s <= 0 && p.shape !== 'px') continue
      const x = Math.round(p.x)
      const y = Math.round(p.y)
      if (p.blend) g.globalCompositeOperation = p.blend
      DRAW[p.shape](g, x, y, s, c, p, t)
      if (p.blend) g.globalCompositeOperation = 'source-over'
    }
  }
}

// ---------------------------------------------------------------- lightning
/** A jagged bolt from a to b by midpoint displacement. Returns the points. */
export function bolt(
  r: Rng | (() => number),
  ax: number,
  ay: number,
  bx: number,
  by: number,
  rough = 0.32,
  depth = 5,
): [number, number][] {
  let pts: [number, number][] = [
    [ax, ay],
    [bx, by],
  ]
  let amp = Math.hypot(bx - ax, by - ay) * rough
  for (let d = 0; d < depth; d++) {
    const out: [number, number][] = [pts[0]!]
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1]!
      const [x1, y1] = pts[i]!
      const nx = -(y1 - y0)
      const ny = x1 - x0
      const nl = Math.hypot(nx, ny) || 1
      const k = (r() - 0.5) * amp
      out.push([(x0 + x1) / 2 + (nx / nl) * k, (y0 + y1) / 2 + (ny / nl) * k], pts[i]!)
    }
    pts = out
    amp *= 0.55
  }
  return pts
}

export function polyline(g: G, pts: readonly [number, number][], c: string, w = 1) {
  for (let i = 1; i < pts.length; i++) line(g, pts[i - 1]![0], pts[i - 1]![1], pts[i]![0], pts[i]![1], c, w)
}
