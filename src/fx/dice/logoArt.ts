// Draws the title's dice logo (logo.ts) into a pixel buffer, one buffer pixel per art pixel. Each visible face is an
// exact affine image of its face art sampled per pixel, as fx/dice/cube.ts draws the battle's dice; the face art is the
// trailer's (trailer/lib/cube.ts `faceTexture`): the type colour, the game's light lip top and left and shaded one
// bottom and right inside the ink edge, the letter in the game's own bitmap font (fx/pixel GLYPHS, three pixels a dot,
// ink on light dice and white with an ink outline on dark ones) and pips elsewhere. Faces turned from the light darken
// in steps, every silhouette gets an ink outline whatever its angle, and the floor shadow is ordered-dithered. Pure:
// the canvas and the loop are components/DiceLogo.tsx's.
import { GLYPHS } from '@/fx/pixel'
import { PALETTE } from '@/theme/colors'
import { hexToRgb } from '@/theme/util'
import type { Frame } from './cube'
import { apply, dot, FACES, norm, project, VIEW, type LogoDie, type LogoFrame, type V3 } from './logo'
import { pipLayout, PIPS } from './pips'

export type { Frame } from './cube'

/** RGBA as one pixel of a little-endian Uint32 view of ImageData (every browser the game runs on). */
const pack = (r: number, g: number, b: number, a = 255) => ((a << 24) | (b << 16) | (g << 8) | r) >>> 0
const packHex = (hex: string, a = 255) => {
  const [r, g, b] = hexToRgb(hex)
  return pack(r, g, b, a)
}
/** `rgb` at opacity `a` over an opaque pixel, as a canvas's fillRect would lay it. */
const over = (rgb: readonly number[], a: number, under: number) =>
  pack(
    Math.round(rgb[0]! * a + (under & 255) * (1 - a)),
    Math.round(rgb[1]! * a + ((under >>> 8) & 255) * (1 - a)),
    Math.round(rgb[2]! * a + ((under >>> 16) & 255) * (1 - a)),
  )

const INK = packHex(PALETTE.ink)
const GOLD = packHex(PALETTE.gold)
const WHITE = pack(255, 255, 255)
/** The floor shadow: the battle's flying dice's (fx/dice/cube.ts). */
const SHADOW = pack(36, 48, 79, Math.round(0.42 * 255))
const LIP_LIGHT = [255, 255, 255]
const LIP_DARK = [20, 30, 60]
const SHADE = [16, 20, 40]
/**
 * The light: from the top left, toward the player, high enough that a top face at rest is its art exactly (the
 * resting logo shows the game's die colours), a front face a step darker, the sides darker still.
 */
const LIGHT: V3 = norm([-0.25, -0.4, 0.88])

const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
const bayer = (x: number, y: number) => (B4[((y & 3) << 2) | (x & 3)]! + 0.5) / 16

/** Ink letters and pips on light dice, white on dark ones (Die.tsx's `pipColor`). */
export function inkOn(fill: string): string {
  const [r, g, b] = hexToRgb(fill)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? PALETTE.ink : '#ffffff'
}

/** The dots of a letter on an N-pixel face: top-left corners, `k` pixels square. É keeps its accent above the E. */
export function letterDots(letter: string, N: number): { dots: [number, number][]; k: number } {
  const base = letter.normalize('NFD')[0]!
  const glyph = GLYPHS[base.toUpperCase()] ?? GLYPHS[' ']!
  const k = Math.max(1, Math.floor((N - 4) / 8))
  const accent = letter !== base
  const x0 = Math.round((N - 5 * k) / 2)
  const y0 = accent ? N - 1 - 7 * k : Math.round((N - 7 * k) / 2)
  const dots: [number, number][] = []
  glyph.forEach((row, r) => [...row].forEach((ch, c) => ch === '1' && dots.push([x0 + c * k, y0 + r * k])))
  // The accent: two blocks stepping up to the right, in the rows left above the E.
  if (accent) dots.push([x0 + 3 * k, 1], [x0 + 3 * k - 2, 2])
  return { dots, k }
}

/** One face's art, N pixels square: a pip count or a letter. */
export function faceArt(fill: string, face: number | string, N: number): Uint32Array {
  const buf = new Uint32Array(N * N).fill(packHex(fill))
  const tint = (x0: number, y0: number, w: number, h: number, rgb: readonly number[], a: number) => {
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++) buf[y * N + x] = over(rgb, a, buf[y * N + x]!)
  }
  const fillRect = (x0: number, y0: number, w: number, h: number, c: number) => {
    for (let y = Math.max(0, y0); y < Math.min(N, y0 + h); y++)
      for (let x = Math.max(0, x0); x < Math.min(N, x0 + w); x++) buf[y * N + x] = c
  }
  // The game's lips (.die): light along the top and left, shaded along the bottom and right, inside the ink edge.
  tint(1, 1, N - 2, 2, LIP_LIGHT, 0.45)
  tint(1, 1, 1, N - 2, LIP_LIGHT, 0.45)
  tint(1, N - 3, N - 2, 2, LIP_DARK, 0.18)
  tint(N - 2, 1, 1, N - 2, LIP_DARK, 0.18)
  fillRect(0, 0, N, 1, INK)
  fillRect(0, N - 1, N, 1, INK)
  fillRect(0, 0, 1, N, INK)
  fillRect(N - 1, 0, 1, N, INK)
  const ink = inkOn(fill)
  const inkPx = packHex(ink)
  if (typeof face === 'number') {
    const { pip, at } = pipLayout(N)
    for (const cell of PIPS[face] ?? []) fillRect(at[cell % 3]!, at[Math.floor(cell / 3)]!, pip, pip, inkPx)
  } else {
    const { dots, k } = letterDots(face, N)
    // A one-pixel ink outline keeps a white letter readable on any fill.
    if (ink === '#ffffff') for (const [x, y] of dots) fillRect(x - 1, y - 1, k + 2, k + 2, INK)
    for (const [x, y] of dots) fillRect(x, y, k, k, inkPx)
  }
  return buf
}

const arts = new Map<string, Uint32Array>()
/** A face's art darkened `level` quarters of the way (0 lit … 4 turned away); ink stays ink. Built once each. */
function shadedArt(fill: string, face: number | string, N: number, level: number): Uint32Array {
  const key = `${fill}|${face}|${N}|${level}`
  let art = arts.get(key)
  if (!art) {
    const base = level ? shadedArt(fill, face, N, 0) : faceArt(fill, face, N)
    art = level ? base.map((c) => (c === INK ? c : over(SHADE, 0.42 * (level / 4), c))) : base
    arts.set(key, art)
  }
  return art
}

// Scratch for one die (its box), so a frame allocates next to nothing.
let mask = new Uint8Array(64 * 64)
let cols = new Uint32Array(64 * 64)
interface Face {
  ox: number
  oy: number
  ux: number
  uy: number
  vx: number
  vy: number
  det: number
  art: Uint32Array
  /** Face 0, the letter: drawn by `topTexel` instead while the die lies flat. */
  top: boolean
}
const vis: Face[] = []

interface FlatTop {
  /** The face's centre, on a pixel corner. */
  x: number
  y: number
  /** Paeth's shears for the yaw: −tan(yaw / 2) along x, sin(yaw) along y. */
  sx: number
  sy: number
  art: Uint32Array
}

/**
 * A die lying flat (at rest, or dropping straight down) shows its top face as its art turned by the yaw alone. Turned
 * by three shears of whole pixels rather than sampled, every pixel of the letter is kept once and none is doubled: its
 * strokes stay three pixels wide and only step where the turn moves them (Paeth's rotation).
 */
function flatTop(d: LogoDie, cx: number, cy: number, N: number): FlatTop | null {
  // Local z (face 0's normal) straight up: lying flat on the letter.
  const [ex, , ez] = d.R
  if (Math.abs(ez[0]) > 1e-9 || Math.abs(ez[1]) > 1e-9 || ez[2] < 0) return null
  const yaw = Math.atan2(ex[1], ex[0])
  const c = project([d.pos[0], d.pos[1], d.pos[2] + d.size / 2])
  const level = Math.round((1 - Math.max(0, dot(ez, LIGHT))) * 4)
  return {
    x: Math.round(cx + c.x),
    y: Math.round(cy + c.y),
    sx: -Math.tan(yaw / 2),
    sy: Math.sin(yaw),
    art: shadedArt(d.fill, d.faces[0]!, N, level),
  }
}

/** The top face's texel under a pixel centre (an index into its art), or −1 off the face. */
export function topTexel(
  t: Pick<FlatTop, 'x' | 'y' | 'sx' | 'sy'>,
  px: number,
  py: number,
  N: number,
): number {
  // Half-pixel offsets from the face's centre, as the texels' centres are: each shear moves whole pixels.
  const x = px - t.x
  const y = py - t.y
  const x1 = x + Math.round(t.sx * y)
  const y1 = y + Math.round(t.sy * x1)
  const x2 = x1 + Math.round(t.sx * y1)
  const a = x2 + N / 2 - 0.5
  const b = y1 + N / 2 - 0.5
  return a >= 0 && a < N && b >= 0 && b < N ? b * N + a : -1
}

function set(fb: Frame, x: number, y: number, c: number) {
  if (x >= 0 && y >= 0 && x < fb.w && y < fb.h) fb.buf[y * fb.w + x] = c
}

/**
 * One die: each pixel samples the visible face under its centre; then an ink outline on the silhouette's edge, the
 * gold ring outside it (a formed logo, the combo's ring as Die.tsx draws it), the white flash over all of it.
 * `density` below 1 draws an ordered-dithered share of it: a smear.
 */
export function drawDie(
  fb: Frame,
  cx: number,
  cy: number,
  d: LogoDie,
  { ring = false, flash = false, density = 1 }: { ring?: boolean; flash?: boolean; density?: number } = {},
) {
  const N = Math.round(d.size)
  const h = d.size / 2
  const k = d.size / N
  vis.length = 0
  for (let f = 0; f < 6; f++) {
    const face = FACES[f]!
    const n = apply(d.R, face.n)
    if (dot(n, VIEW) > -1e-3) continue
    const u = apply(d.R, face.u)
    const w = apply(d.R, face.v)
    const corner = project([
      d.pos[0] + (n[0] - u[0] - w[0]) * h,
      d.pos[1] + (n[1] - u[1] - w[1]) * h,
      d.pos[2] + (n[2] - u[2] - w[2]) * h,
    ])
    const du = project(u)
    const dv = project(w)
    const ux = du.x * k,
      uy = du.y * k,
      vx = dv.x * k,
      vy = dv.y * k
    const det = ux * vy - vx * uy
    if (Math.abs(det) < 1e-6) continue
    const level = Math.round((1 - Math.max(0, dot(n, LIGHT))) * 4)
    const art = shadedArt(d.fill, d.faces[f]!, N, level)
    vis.push({ ox: cx + corner.x, oy: cy + corner.y, ux, uy, vx, vy, det, art, top: f === 0 })
  }
  const top = flatTop(d, cx, cy, N)
  // The box round the cube's eight corners, a pixel wider each way for the ring.
  let x0 = Infinity,
    x1 = -Infinity,
    y0 = Infinity,
    y1 = -Infinity
  for (const sx of [-h, h])
    for (const sy of [-h, h])
      for (const sz of [-h, h]) {
        const c = apply(d.R, [sx, sy, sz])
        const s = project([d.pos[0] + c[0], d.pos[1] + c[1], d.pos[2] + c[2]])
        x0 = Math.min(x0, s.x)
        x1 = Math.max(x1, s.x)
        y0 = Math.min(y0, s.y)
        y1 = Math.max(y1, s.y)
      }
  const X0 = Math.floor(cx + x0) - 1,
    Y0 = Math.floor(cy + y0) - 1
  const bw = Math.ceil(cx + x1) + 2 - X0,
    bh = Math.ceil(cy + y1) + 2 - Y0
  if (X0 >= fb.w || Y0 >= fb.h || X0 + bw <= 0 || Y0 + bh <= 0) return
  if (mask.length < bw * bh) {
    mask = new Uint8Array(bw * bh * 2)
    cols = new Uint32Array(bw * bh * 2)
  }
  mask.fill(0, 0, bw * bh)
  for (let y = 1; y < bh - 1; y++)
    for (let x = 1; x < bw - 1; x++) {
      const px = X0 + x + 0.5,
        py = Y0 + y + 0.5
      if (top) {
        const c = topTexel(top, px, py, N)
        if (c >= 0) {
          mask[y * bw + x] = 1
          cols[y * bw + x] = top.art[c]!
          continue
        }
      }
      // The face under the pixel's centre. Lying flat, the sides reach a pixel up under the turned top face, so
      // its stepped edge leaves no gap above them; the top face itself is the shears' alone, its outline clean.
      const reach = top ? -1 : 0
      for (const v of vis) {
        if (top && v.top) continue
        const ex = px - v.ox,
          ey = py - v.oy
        const a = (ex * v.vy - v.vx * ey) / v.det
        const b = (v.ux * ey - ex * v.uy) / v.det
        if (a >= 0 && a < N && b >= reach && b < N) {
          mask[y * bw + x] = 1
          cols[y * bw + x] = v.art[Math.max(0, b | 0) * N + (a | 0)]!
          break
        }
      }
    }
  for (let y = 0; y < bh; y++)
    for (let x = 0; x < bw; x++) {
      const i = y * bw + x
      const fx = X0 + x,
        fy = Y0 + y
      if (density < 1 && bayer(fx, fy) >= density) continue
      const inside = mask[i] === 1
      const near = (j: number, ok: boolean) => ok && mask[j] === 1
      const touches =
        near(i - 1, x > 0) || near(i + 1, x < bw - 1) || near(i - bw, y > 0) || near(i + bw, y < bh - 1)
      if (!inside) {
        if (ring && touches) set(fb, fx, fy, GOLD)
        continue
      }
      const edge =
        !near(i - 1, x > 0) || !near(i + 1, x < bw - 1) || !near(i - bw, y > 0) || !near(i + bw, y < bh - 1)
      set(fb, fx, fy, flash ? WHITE : edge ? INK : cols[i]!)
    }
}

/** The die's shadow on the floor: a square under it to the bottom right, smaller and sparser the higher it is. */
export function drawShadow(fb: Frame, cx: number, cy: number, d: LogoDie) {
  const lift = Math.max(0, d.pos[2] - d.size / 2)
  const k = Math.max(0.4, 1 - lift / (d.size * 4))
  const s = d.size * 0.56 * k
  const dens = Math.max(0.25, 0.75 - (0.18 * lift) / d.size)
  const L = Math.round(cx + d.pos[0] - s + 2),
    R = Math.round(cx + d.pos[0] + s + 2)
  const T = Math.round(cy - (d.pos[1] + s - 1)),
    B = Math.round(cy - (d.pos[1] - s - 1))
  for (let y = T; y < B; y++)
    for (let x = L; x < R; x++) {
      const corner = (y === T || y === B - 1) && (x === L || x === R - 1)
      if (!corner && bayer(x, y) < dens) set(fb, x, y, SHADOW)
    }
}

/** The gold ring over the floor: three pixels thick, its height `flat` of its width, an ordered-dithered share left. */
export function drawRing(fb: Frame, cx: number, cy: number, r: number, flat: number, density: number) {
  for (let t = 0; t < 3; t++) {
    const rx = r + t,
      ry = r * flat + t
    const steps = Math.max(24, Math.ceil((rx + ry) * 4))
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2
      const x = Math.round(cx + Math.cos(a) * rx),
        y = Math.round(cy + Math.sin(a) * ry)
      if (bayer(x, y) < density) set(fb, x, y, GOLD)
    }
  }
}

/** One frame of the logo, its origin (`project`'s) at (cx, cy) in the buffer: shadows, the ring, smears, the dice. */
export function drawLogo(fb: Frame, f: LogoFrame, cx: number, cy: number) {
  fb.buf.fill(0)
  for (const d of f.dice) drawShadow(fb, cx, cy, d)
  if (f.ring) drawRing(fb, cx, cy, f.ring.r, f.ring.flat, f.ring.density)
  for (const g of f.ghosts) drawDie(fb, cx, cy, g.die, { density: g.density })
  for (const d of f.dice) drawDie(fb, cx, cy, d, { ring: d.ring, flash: d.flash })
}

export { logoBox, logoCues, logoFrame, BEATS, type LogoCue, type LogoFrame, type LogoMode } from './logo'
