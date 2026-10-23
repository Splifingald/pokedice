// The thrown die as pixel art (docs/37): a cube seen from straight above with a touch of fake perspective, each
// visible face an exact affine image of its face art, three stepped shades, an ink outline and a dithered floor
// shadow. It draws into a canvas-sized pixel buffer (1 pixel = 1 CSS px) in 2 px blocks, the game's art pixel, with the
// block grid on the resting die's corner; the resting pose is copied pixel for pixel, so the last frame is the DOM die
// exactly. Pure: the canvas, the font and the loop are fx/dice/player.ts's.
import type { Face } from '@/engine/types'
import { ICONS, STATUS_ICON } from '@/components/icons'
import { ICON_PALETTE, PALETTE, STATUS_COLORS } from '@/theme/colors'
import { hexToRgb } from '@/theme/util'
import { numberPx, pipLayout, PIPS } from './pips'
import { CORNERS, FACE_N, FACE_RIGHT, FACE_UP, type Pose } from './solve'

/** CSS px per art pixel (docs/15 §4). */
export const ART = 2
/** Height lifts the die up the screen as well, the way 2D games show a jump. */
const LIFT = 0.55
/** Fake perspective: the die grows this much per unit of height. */
const PERSP = 0.09
/** The light: from the top left, as on every die and frame. */
const LIGHT = (() => {
  const l = [-1, 2.2, -1.3]
  const n = Math.hypot(l[0]!, l[1]!, l[2]!)
  return [l[0]! / n, l[1]! / n, l[2]! / n]
})()
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

/** RGBA as one pixel of a little-endian Uint32 view of ImageData (every browser the game runs on). */
export const pack = (r: number, g: number, b: number, a = 255) => ((a << 24) | (b << 16) | (g << 8) | r) >>> 0
const unpack = (c: number) => [c & 255, (c >>> 8) & 255, (c >>> 16) & 255, c >>> 24] as const
const packHex = (hex: string, a = 255) => {
  const [r, g, b] = hexToRgb(hex)
  return pack(r, g, b, a)
}
/** `top` (alpha 0–1) over an opaque colour. */
const over = (rgb: readonly number[], a: number, under: number) => {
  const u = unpack(under)
  return pack(
    Math.round(rgb[0]! * a + u[0] * (1 - a)),
    Math.round(rgb[1]! * a + u[1] * (1 - a)),
    Math.round(rgb[2]! * a + u[2] * (1 - a)),
  )
}

/** What a die looks like, as the DOM die draws it (components/Die.tsx, .die / .die-mini in pixel.css). */
export interface DieLook {
  /** CSS px. */
  size: number
  fill: string
  /** Pips and numbers: ink on light dice, white on dark ones. */
  pip: string
  /** Under 40 px the DOM die has no light and dark rows. */
  mini: boolean
  /** A locked die (the foe's) is a little see-through. */
  alpha: number
  faces: readonly Face[]
}

/** The number's coverage at the die's size (1 = ink), from the pixel font; null where no font can be drawn. */
export type Glyph = (text: string, px: number, size: number) => Uint8Array | null

export interface DieArt {
  size: number
  /** Per face: [light, mid, dark]; mid is the face as the resting die shows it. */
  faces: Uint32Array[][]
  status: boolean[]
  ink: number
  /** The dithered floor shadow while it flies. */
  floor: number
  /** The resting die's drop shadow (.die-wrap's 3 px). */
  drop: number
}

/** A status face's badge, folded inside the face's top right corner: a 10-block disc, its ink ring, the icon 1:1. */
function badge(buf: Uint32Array, S: number, status: string, ink: number) {
  const sc = packHex(STATUS_COLORS[status as keyof typeof STATUS_COLORS] ?? PALETTE.gold)
  const rows = ICONS[STATUS_ICON[status] ?? 'star']
  const bx0 = Math.floor(S / ART) - 11
  const block = (bx: number, by: number, c: number) => {
    for (let y = by * ART; y < by * ART + ART && y < S; y++)
      for (let x = bx * ART; x < bx * ART + ART && x < S; x++) if (x >= 0) buf[y * S + x] = c
  }
  for (let y = 0; y < 10; y++)
    for (let x = 0; x < 10; x++) {
      const dx = x - 4.5
      const dy = y - 4.5
      const r2 = dx * dx + dy * dy
      if (r2 <= 22) block(bx0 + x, 1 + y, r2 > 13 ? ink : sc)
    }
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === '.') return
      block(bx0 + 1 + x, 2 + y, ch === 'k' ? ink : packHex(ICON_PALETTE[ch] ?? PALETTE.ink))
    }),
  )
}

/** One face at the die's size, pixel for pixel what the DOM die shows (the badge folded in, for the flight). */
function faceArt(face: Face, look: DieLook, glyph: Glyph | undefined): Uint32Array {
  const S = look.size
  const buf = new Uint32Array(S * S)
  const fill = packHex(look.fill)
  const ink = packHex(PALETTE.ink)
  const pip = packHex(look.pip)
  buf.fill(fill)
  if (!look.mini) {
    // .die's inset shadows: under the 2 px ink ring, a light row along the top and a dark one along the bottom.
    const hi = over([255, 255, 255], 0.45, fill)
    const lo = over([20, 30, 60], 0.18, fill)
    for (let x = 2; x < S - 2; x++) {
      buf[2 * S + x] = buf[3 * S + x] = hi
      buf[(S - 4) * S + x] = buf[(S - 3) * S + x] = lo
    }
  }
  for (let i = 0; i < S; i++)
    for (let k = 0; k < 2; k++) {
      buf[k * S + i] = buf[(S - 1 - k) * S + i] = ink
      buf[i * S + k] = buf[i * S + S - 1 - k] = ink
    }
  const lit = PIPS[face.value]
  if (lit) {
    const { pip: p, at } = pipLayout(S)
    for (const cell of lit) {
      const x0 = at[cell % 3]!,
        y0 = at[Math.floor(cell / 3)]!
      for (let y = y0; y < y0 + p; y++) for (let x = x0; x < x0 + p; x++) buf[y * S + x] = pip
    }
  } else {
    const mask = glyph?.(String(face.value), numberPx(S), S)
    if (mask) for (let i = 0; i < S * S; i++) if (mask[i]) buf[i] = pip
  }
  if (face.kind === 'status' && S >= 30) badge(buf, S, face.status, ink)
  if (look.alpha < 1) {
    const a = Math.round(look.alpha * 255)
    for (let i = 0; i < S * S; i++) buf[i] = ((buf[i]! & 0xffffff) | (a << 24)) >>> 0
  }
  return buf
}

/** The three shades of a face: lit (towards white), as is, turned away (towards ink). Ink stays ink. */
function shades(mid: Uint32Array): Uint32Array[] {
  const [ir, ig, ib] = hexToRgb(PALETTE.ink)
  const towards = (to: readonly number[], k: number) => {
    const out = new Uint32Array(mid.length)
    for (let i = 0; i < mid.length; i++) {
      const [r, g, b, a] = unpack(mid[i]!)
      out[i] =
        r === ir && g === ig && b === ib
          ? mid[i]!
          : pack(
              Math.round(r + (to[0]! - r) * k),
              Math.round(g + (to[1]! - g) * k),
              Math.round(b + (to[2]! - b) * k),
              a,
            )
    }
    return out
  }
  return [towards([255, 255, 255], 0.3), mid, towards([ir, ig, ib], 0.28)]
}

/** Every face of a die drawn once, in its three shades. A die with fewer than six faces repeats them round the cube. */
export function buildDieArt(look: DieLook, glyph?: Glyph): DieArt {
  const faces = Array.from({ length: 6 }, (_, i) => look.faces[i % look.faces.length]!)
  const alpha = Math.round(look.alpha * 255)
  return {
    size: look.size,
    faces: faces.map((f) => shades(faceArt(f, look, glyph))),
    status: faces.map((f) => f.kind === 'status'),
    ink: packHex(PALETTE.ink, alpha),
    floor: pack(36, 48, 79, Math.round(0.42 * 255)),
    drop: pack(36, 48, 79, Math.round(0.22 * look.alpha * 255)),
  }
}

/** A canvas-sized pixel buffer. */
export interface Frame {
  buf: Uint32Array
  w: number
  h: number
}

/** What a frame drew (px, end exclusive), so the next one clears only that. */
export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

export const emptyBox = (b: Box) => {
  b.x0 = b.y0 = Infinity
  b.x1 = b.y1 = -Infinity
}

const grow = (b: Box, x0: number, y0: number, x1: number, y1: number) => {
  if (x0 < b.x0) b.x0 = x0
  if (y0 < b.y0) b.y0 = y0
  if (x1 > b.x1) b.x1 = x1
  if (y1 > b.y1) b.y1 = y1
}

export function clearBox(fb: Frame, b: Box) {
  const x0 = Math.max(0, b.x0),
    x1 = Math.min(fb.w, b.x1)
  for (let y = Math.max(0, b.y0); y < Math.min(fb.h, b.y1); y++) fb.buf.fill(0, y * fb.w + x0, y * fb.w + x1)
}

/** One art pixel (a 2×2 block), clipped to the frame. */
function block(fb: Frame, bx: number, by: number, c: number) {
  const x = bx * ART,
    y = by * ART
  for (let yy = y; yy < y + ART; yy++) {
    if (yy < 0 || yy >= fb.h) continue
    for (let xx = x; xx < x + ART; xx++) if (xx >= 0 && xx < fb.w) fb.buf[yy * fb.w + xx] = c
  }
}

// Scratch, so a frame allocates nothing: the visible faces (at most three) and the silhouette's mask.
const vis = new Float64Array(3 * 6)
const visArt: Uint32Array[] = []
let mask = new Uint8Array(64 * 64)

/** The floor shadow: the die's footprint, smaller and sparser (ordered dither) the higher it flies. */
function drawShadow(fb: Frame, cx: number, cy: number, S: number, pose: Pose, col: number, box: Box) {
  const m = pose.m
  const ht = Math.max(0, pose.y - 0.5)
  let x0 = Infinity,
    x1 = -Infinity,
    z0 = Infinity,
    z1 = -Infinity
  for (const c of CORNERS) {
    const rx = m[0]! * c[0] + m[1]! * c[1] + m[2]! * c[2]
    const rz = m[6]! * c[0] + m[7]! * c[1] + m[8]! * c[2]
    if (rx < x0) x0 = rx
    if (rx > x1) x1 = rx
    if (rz < z0) z0 = rz
    if (rz > z1) z1 = rz
  }
  const shrink = Math.max(0.5, 1 - 0.14 * ht)
  const dens = Math.max(0.25, 0.75 - 0.18 * ht)
  const gx = cx + pose.x * S,
    gy = cy + pose.z * S
  const L = Math.round((gx + x0 * S * shrink) / ART),
    R = Math.round((gx + x1 * S * shrink) / ART)
  const T = Math.round((gy + z0 * S * shrink) / ART + 1),
    B = Math.round((gy + z1 * S * shrink) / ART + 2)
  for (let by = T; by < B; by++)
    for (let bx = L; bx < R; bx++) {
      const corner = (by === T || by === B - 1) && (bx === L || bx === R - 1)
      if (corner || BAYER[(by & 3) * 4 + (bx & 3)]! >= dens * 16) continue
      block(fb, bx, by, col)
    }
  grow(box, L * ART, T * ART, R * ART, B * ART)
}

/** The cube in flight: each pixel block samples the visible face under its centre; then a 1-block ink outline. */
function drawCube(fb: Frame, cx: number, cy: number, S: number, pose: Pose, art: DieArt, box: Box) {
  const m = pose.m
  const ht = pose.y - 0.5
  const k = (1 + PERSP * ht) * S
  const ox = cx + pose.x * S,
    oy = cy + pose.z * S - ht * S * LIFT
  let bx0 = Infinity,
    bx1 = -Infinity,
    by0 = Infinity,
    by1 = -Infinity
  for (const c of CORNERS) {
    const sx = ox + (m[0]! * c[0] + m[1]! * c[1] + m[2]! * c[2]) * k
    const sy = oy + (m[6]! * c[0] + m[7]! * c[1] + m[8]! * c[2]) * k
    if (sx < bx0) bx0 = sx
    if (sx > bx1) bx1 = sx
    if (sy < by0) by0 = sy
    if (sy > by1) by1 = sy
  }
  let nv = 0
  for (let f = 0; f < 6; f++) {
    const n = FACE_N[f]!,
      r = FACE_RIGHT[f]!,
      u = FACE_UP[f]!
    const ny = m[3]! * n[0] + m[4]! * n[1] + m[5]! * n[2]
    // Faces turned away from the camera.
    if (ny < 0.02) continue
    const nx = m[0]! * n[0] + m[1]! * n[1] + m[2]! * n[2],
      nz = m[6]! * n[0] + m[7]! * n[1] + m[8]! * n[2]
    const rx = m[0]! * r[0] + m[1]! * r[1] + m[2]! * r[2],
      rz = m[6]! * r[0] + m[7]! * r[1] + m[8]! * r[2]
    const ux = m[0]! * u[0] + m[1]! * u[1] + m[2]! * u[2],
      uz = m[6]! * u[0] + m[7]! * u[1] + m[8]! * u[2]
    // One art pixel of the face along its right (du) and down (dv), on screen.
    const du0 = (rx * k) / S,
      du1 = (rz * k) / S,
      dv0 = (-ux * k) / S,
      dv1 = (-uz * k) / S
    const det = du0 * dv1 - dv0 * du1
    if (Math.abs(det) < 1e-6) continue
    const lit = nx * LIGHT[0]! + ny * LIGHT[1]! + nz * LIGHT[2]!
    const o = nv * 6
    // Its top left corner on screen.
    vis[o] = ox + (nx * 0.5 - rx * 0.5 + ux * 0.5) * k
    vis[o + 1] = oy + (nz * 0.5 - rz * 0.5 + uz * 0.5) * k
    vis[o + 2] = du0
    vis[o + 3] = du1
    vis[o + 4] = dv0
    vis[o + 5] = dv1
    visArt[nv] = art.faces[f]![lit > 0.93 ? 0 : lit > 0.5 ? 1 : 2]!
    nv++
  }
  const X0 = Math.floor(bx0 / ART) - 1,
    X1 = Math.ceil(bx1 / ART) + 1
  const Y0 = Math.floor(by0 / ART) - 1,
    Y1 = Math.ceil(by1 / ART) + 1
  const bw = X1 - X0 + 1,
    bh = Y1 - Y0 + 1
  if (bw <= 0 || bh <= 0) return
  if (mask.length < bw * bh) mask = new Uint8Array(bw * bh * 2)
  mask.fill(0, 0, bw * bh)
  for (let by = Y0; by <= Y1; by++)
    for (let bx = X0; bx <= X1; bx++) {
      const px = bx * ART + ART / 2,
        py = by * ART + ART / 2
      for (let i = 0; i < nv; i++) {
        const o = i * 6
        const ex = px - vis[o]!,
          ey = py - vis[o + 1]!
        const det = vis[o + 2]! * vis[o + 5]! - vis[o + 4]! * vis[o + 3]!
        const u = (ex * vis[o + 5]! - vis[o + 4]! * ey) / det
        const v = (vis[o + 2]! * ey - ex * vis[o + 3]!) / det
        if (u >= 0 && u < S && v >= 0 && v < S) {
          block(fb, bx, by, visArt[i]![(v | 0) * S + (u | 0)]!)
          mask[(by - Y0) * bw + (bx - X0)] = 1
          break
        }
      }
    }
  // A one-block ink outline round the silhouette, whatever the angle.
  for (let y = 0; y < bh; y++)
    for (let x = 0; x < bw; x++) {
      const i = y * bw + x
      if (!mask[i]) continue
      const edge =
        x === 0 ||
        y === 0 ||
        x === bw - 1 ||
        y === bh - 1 ||
        !mask[i - 1] ||
        !mask[i + 1] ||
        !mask[i - bw] ||
        !mask[i + bw]
      if (edge) block(fb, x + X0, y + Y0, art.ink)
    }
  grow(box, X0 * ART, Y0 * ART, (X1 + 1) * ART, (Y1 + 1) * ART)
}

/** The resting pose: the face copied pixel for pixel, `drop` art pixels up, over the DOM die's own drop shadow. */
function drawRest(fb: Frame, dx: number, dy: number, art: DieArt, face: number, drop: number, box: Box) {
  const S = art.size
  const src = art.faces[face]![1]!
  const y0 = dy - drop * ART
  for (let y = 0; y < S; y++) {
    const fy = y0 + y
    if (fy < 0 || fy >= fb.h) continue
    for (let x = 0; x < S; x++) {
      const fx = dx + x
      if (fx >= 0 && fx < fb.w) fb.buf[fy * fb.w + fx] = src[y * S + x]!
    }
  }
  // .die-wrap's drop-shadow(0 3px): what shows of it under the die. A status face has its rings there instead, which
  // the DOM die brings on landing.
  if (!art.status[face])
    for (let y = dy + S; y < dy + S + 3 && y < fb.h; y++)
      for (let x = dx; x < dx + S && x < fb.w; x++) if (!fb.buf[y * fb.w + x]) fb.buf[y * fb.w + x] = art.drop
  grow(box, dx, y0, dx + S, dy + S + 3)
}

/**
 * One frame of a die: its pose drawn with the resting die's top left corner at (dx, dy) in the frame (even numbers,
 * so the art-pixel grid sits on the die). `face` is the face it lands on.
 */
export function drawDie(fb: Frame, dx: number, dy: number, pose: Pose, art: DieArt, face: number, box: Box) {
  if (pose.rest) {
    drawRest(fb, dx, dy, art, face, pose.drop, box)
    return
  }
  const cx = dx + art.size / 2,
    cy = dy + art.size / 2
  drawShadow(fb, cx, cy, art.size, pose, art.floor, box)
  drawCube(fb, cx, cy, art.size, pose, art, box)
}
