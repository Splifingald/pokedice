// Pixel-art 3D dice: real cubes, drawn small (one texel per art pixel) with the game's die look on every face (Die.tsx:
// the type colour, the ink edge, a light top-left and a shaded bottom-right, pips on whole pixels), then scaled up with
// square pixels. Each face is an affine-mapped texture under an orthographic camera, so a turning die stays crisp.
import { pipLayout } from '@/components/Die'
import { canvas, type Canvas } from '@/fx/pixel'
import { hexToRgb } from '@/theme/util'
import { PALETTE } from '@/theme/colors'

export type V3 = readonly [number, number, number]
/** A rotation: three columns (where local x, y, z go). */
export type M3 = readonly [V3, V3, V3]

export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k]
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const norm = (a: V3): V3 => scale(a, 1 / Math.hypot(a[0], a[1], a[2]))
export const apply = (m: M3, v: V3): V3 => add(add(scale(m[0], v[0]), scale(m[1], v[1])), scale(m[2], v[2]))
export const mul = (a: M3, b: M3): M3 => [apply(a, b[0]), apply(a, b[1]), apply(a, b[2])]
export const I3: M3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
]

/** Rotation by angle about a unit axis (Rodrigues). */
export function rot(axis: V3, a: number): M3 {
  const [x, y, z] = norm(axis)
  const c = Math.cos(a)
  const s = Math.sin(a)
  const t = 1 - c
  return [
    [t * x * x + c, t * x * y + s * z, t * x * z - s * y],
    [t * x * y - s * z, t * y * y + c, t * y * z + s * x],
    [t * x * z + s * y, t * y * z - s * x, t * z * z + c],
  ]
}

/**
 * The six faces: normal, texture right (u) and texture down (v), seen from outside. Values on a standard die: opposite
 * faces add up to 7.
 */
export const FACES: { n: V3; u: V3; v: V3; pips: number }[] = [
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, -1, 0], pips: 1 },
  { n: [0, 0, -1], u: [1, 0, 0], v: [0, 1, 0], pips: 6 },
  { n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, -1], pips: 3 },
  { n: [-1, 0, 0], u: [0, -1, 0], v: [0, 0, -1], pips: 4 },
  { n: [0, 1, 0], u: [-1, 0, 0], v: [0, 0, -1], pips: 2 },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, -1], pips: 5 },
]

/**
 * The rotation that rests face `f` up (world +z), its texture upright for a camera in front (texture down = world −y),
 * turned by `yaw` about the vertical.
 */
export function restOn(f: number, yaw = 0): M3 {
  const F = FACES[f]!
  // R maps n → z, u → x, v → −y: R = Σ target ⊗ local.
  const targets: [V3, V3][] = [
    [F.n, [0, 0, 1]],
    [F.u, [1, 0, 0]],
    [F.v, [0, -1, 0]],
  ]
  const col = (i: number): V3 => {
    let c: V3 = [0, 0, 0]
    for (const [loc, tgt] of targets) c = add(c, scale(tgt, loc[i]!))
    return c
  }
  const r: M3 = [col(0), col(1), col(2)]
  return yaw ? mul(rot([0, 0, 1], yaw), r) : r
}

/** Which face shows `pips`. */
export const faceOf = (pips: number) => FACES.findIndex((f) => f.pips === pips)

// ---------------------------------------------------------------- face textures
const lum = (hex: string) => {
  const [r, g, b] = hexToRgb(hex)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}
/** Ink pips on light dice, white on dark ones (Die.tsx `pipColor`). */
export const pipInk = (fill: string) => (lum(fill) > 0.6 ? PALETTE.ink : '#ffffff')

const textures = new Map<string, Canvas>()

/** One face's texture, N texels square: a pip count, or a letter. */
export function faceTexture(fill: string, face: number | string, N: number): Canvas {
  const key = `${fill}|${face}|${N}`
  const hit = textures.get(key)
  if (hit) return hit
  const c = canvas(N, N)
  const g = c.g
  g.fillStyle = fill
  g.fillRect(0, 0, N, N)
  // The game's lips: a light top-left, a shaded bottom-right, inside the ink edge.
  g.fillStyle = 'rgba(255,255,255,0.45)'
  g.fillRect(1, 1, N - 2, 2)
  g.fillRect(1, 1, 1, N - 2)
  g.fillStyle = 'rgba(20,30,60,0.18)'
  g.fillRect(1, N - 3, N - 2, 2)
  g.fillRect(N - 2, 1, 1, N - 2)
  g.fillStyle = PALETTE.ink
  g.fillRect(0, 0, N, 1)
  g.fillRect(0, N - 1, N, 1)
  g.fillRect(0, 0, 1, N)
  g.fillRect(N - 1, 0, 1, N)
  const ink = pipInk(fill)
  if (typeof face === 'number') {
    const lit: Record<number, number[]> = {
      1: [4],
      2: [0, 8],
      3: [0, 4, 8],
      4: [0, 2, 6, 8],
      5: [0, 2, 4, 6, 8],
      6: [0, 2, 3, 5, 6, 8],
    }
    const { pip, at } = pipLayout(N)
    g.fillStyle = ink
    for (const cell of lit[face] ?? []) g.fillRect(at[cell % 3]!, at[Math.floor(cell / 3)]!, pip, pip)
  } else {
    // A letter in Jersey 25, thresholded so it stays pixel-sharp.
    const m = canvas(N * 4, N * 4)
    m.g.font = `${Math.round(N * 4 * 0.98)}px "Jersey 25"`
    m.g.textAlign = 'center'
    m.g.textBaseline = 'middle'
    m.g.fillStyle = '#000'
    m.g.fillText(face, N * 2, N * 2 + N * 0.12)
    const small = canvas(N, N)
    small.g.imageSmoothingEnabled = true
    small.g.drawImage(m, 0, 0, N, N)
    const d = small.g.getImageData(0, 0, N, N)
    const [r, gg, b] = hexToRgb(ink)
    const out = g.getImageData(0, 0, N, N)
    // A one-texel outline in the other colour keeps the letter readable on any fill.
    const on = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N && d.data[(y * N + x) * 4 + 3]! >= 110
    const [or, og, ob] = hexToRgb(ink === '#ffffff' ? PALETTE.ink : '#ffffff')
    for (let y = 1; y < N - 1; y++)
      for (let x = 1; x < N - 1; x++) {
        const i = (y * N + x) * 4
        if (on(x, y)) {
          out.data[i] = r
          out.data[i + 1] = gg
          out.data[i + 2] = b
        } else if (ink === '#ffffff' && (on(x + 1, y) || on(x - 1, y) || on(x, y + 1) || on(x, y - 1))) {
          out.data[i] = or
          out.data[i + 1] = og
          out.data[i + 2] = ob
        }
      }
    g.putImageData(out, 0, 0)
  }
  textures.set(key, c)
  return c
}

// ---------------------------------------------------------------- the camera and drawing
export interface View {
  /** How far the camera looks down, radians (π/2: straight down). */
  tilt: number
  /** Texels per world unit. */
  cs: number
  /** Where the world origin lands on the canvas. */
  cx: number
  cy: number
}
const fwd = (v: View): V3 => [0, Math.cos(v.tilt), -Math.sin(v.tilt)]
const down = (v: View): V3 => [0, -Math.sin(v.tilt), -Math.cos(v.tilt)]
export const project = (v: View, p: V3) => ({ x: v.cx + p[0] * v.cs, y: v.cy + dot(p, down(v)) * v.cs })

export interface DieDraw {
  /** Centre, world units (z: the centre's height above the table). */
  pos: V3
  R: M3
  fill: string
  /** Six faces' contents in FACES order: pips or a letter. */
  faces: (number | string)[]
  /** Edge length, world units (= texels at cs 1). */
  size: number
  /** A ring around the shape: the combo's gold, the pick's red. */
  ring?: string | null
  /** White over the whole die (an impact frame). */
  flash?: number
}

const LIGHT = norm([-0.45, -0.55, 0.85])
const scratch = canvas(256, 256)

/** Draw one die on a low-res canvas. Its outline is thresholded: no soft edges. */
export function drawDie(g: CanvasRenderingContext2D, v: View, d: DieDraw) {
  const N = Math.round(d.size)
  const h = d.size / 2
  const c = project(v, d.pos)
  const S = scratch.width
  const sg = scratch.g
  sg.setTransform(1, 0, 0, 1, 0, 0)
  sg.clearRect(0, 0, S, S)
  sg.imageSmoothingEnabled = false
  const F = fwd(v)
  const Dn = down(v)
  for (let i = 0; i < 6; i++) {
    const face = FACES[i]!
    const n = apply(d.R, face.n)
    if (dot(n, F) > -1e-3) continue
    const u = apply(d.R, face.u)
    const w = apply(d.R, face.v)
    const corner = add(scale(n, h), add(scale(u, -h), scale(w, -h)))
    const ox = S / 2 + corner[0] * v.cs
    const oy = S / 2 + dot(corner, Dn) * v.cs
    const k = (2 * h * v.cs) / N
    sg.setTransform(u[0] * k, dot(u, Dn) * k, w[0] * k, dot(w, Dn) * k, ox, oy)
    sg.drawImage(faceTexture(d.fill, d.faces[i]!, N), 0, 0)
    // Light: the face turned from the light darkens, in steps.
    const lit = Math.max(0, dot(n, LIGHT))
    const shade = Math.round((1 - lit) * 4) / 4
    if (shade > 0) {
      sg.fillStyle = `rgba(16,20,40,${0.42 * shade})`
      sg.fillRect(0, 0, N, N)
    }
  }
  sg.setTransform(1, 0, 0, 1, 0, 0)
  // Hard edges: keep only the opaque texels.
  const span = Math.ceil(d.size * 1.8 * v.cs) + 4
  const x0 = Math.max(0, Math.floor(S / 2 - span / 2))
  const img = sg.getImageData(x0, x0, span, span)
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = img.data[i]! >= 128 ? 255 : 0
  sg.putImageData(img, x0, x0)
  if (d.flash) {
    sg.globalCompositeOperation = 'source-atop'
    sg.fillStyle = `rgba(255,255,255,${d.flash})`
    sg.fillRect(x0, x0, span, span)
    sg.globalCompositeOperation = 'source-over'
  }
  const dx = Math.round(c.x - S / 2)
  const dy = Math.round(c.y - S / 2)
  if (d.ring) {
    const ring = ringOf(scratch, d.ring, x0, span)
    for (const [ox, oy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as const)
      g.drawImage(ring, dx + ox, dy + oy)
  }
  g.drawImage(scratch, dx, dy)
}

const ringCv = canvas(256, 256)
function ringOf(src: Canvas, color: string, x0: number, span: number): Canvas {
  const g = ringCv.g
  g.clearRect(0, 0, ringCv.width, ringCv.height)
  g.drawImage(src, x0, x0, span, span, x0, x0, span, span)
  g.globalCompositeOperation = 'source-in'
  g.fillStyle = color
  g.fillRect(0, 0, ringCv.width, ringCv.height)
  g.globalCompositeOperation = 'source-over'
  return ringCv
}

/** The die's shadow on the table: a dark square under it, smaller and lighter the higher it is. */
export function drawShadow(g: CanvasRenderingContext2D, v: View, d: DieDraw, color = 'rgba(30,16,8,0.35)') {
  const lift = Math.max(0, d.pos[2] - d.size / 2)
  const k = Math.max(0.4, 1 - lift / (d.size * 4))
  const s = d.size * 0.62 * k
  const pts: V3[] = [
    [d.pos[0] - s + 2, d.pos[1] - s - 1, 0],
    [d.pos[0] + s + 2, d.pos[1] - s - 1, 0],
    [d.pos[0] + s + 2, d.pos[1] + s - 1, 0],
    [d.pos[0] - s + 2, d.pos[1] + s - 1, 0],
  ]
  g.save()
  g.globalAlpha = k
  g.fillStyle = color
  g.beginPath()
  pts.forEach((p, i) => {
    const q = project(v, p)
    if (i) g.lineTo(Math.round(q.x), Math.round(q.y))
    else g.moveTo(Math.round(q.x), Math.round(q.y))
  })
  g.closePath()
  g.fill()
  g.restore()
}

/**
 * A die's flight: from a start point to its rest, rolling along the way (the turn follows the distance, so it stops
 * turning exactly when it arrives), bouncing, with a spin that dies out first. Returns where it is and how it's turned.
 */
export interface Throw {
  from: V3
  to: V3
  /** When it's thrown and when it comes to rest (seconds, any clock). */
  t0: number
  t1: number
  /** The face that ends up, and its yaw at rest. */
  rest: M3
  /** Extra tumbling spin, radians at the start. */
  spin?: number
  spinAxis?: V3
  /** Heights of the arcs: the fall's start, then the two bounces (world units). */
  arcs?: [number, number, number]
  /** A wobble on an edge after it arrives: amplitude, radians. */
  wobble?: number
  size: number
}

export function throwAt(th: Throw, t: number): { pos: V3; R: M3; landings: number[] } {
  const p = Math.max(0, Math.min(1, (t - th.t0) / (th.t1 - th.t0)))
  const dur = th.t1 - th.t0
  const travel = 1 - (1 - p) ** 2.4
  const pos: V3 = [
    th.from[0] + (th.to[0] - th.from[0]) * travel,
    th.from[1] + (th.to[1] - th.from[1]) * travel,
    0,
  ]
  const [z0, b1, b2] = th.arcs ?? [th.size * 3, th.size * 1.2, th.size * 0.35]
  // The fall takes the first 30 %, the bounces 30 % and 18 %, then it slides to rest.
  const T1 = 0.3
  const B1 = 0.3
  const B2 = 0.18
  let z = 0
  if (p < T1) z = z0 * (1 - (p / T1) ** 2)
  else if (p < T1 + B1) {
    const u = (p - T1) / B1
    z = 4 * b1 * u * (1 - u)
  } else if (p < T1 + B1 + B2) {
    const u = (p - T1 - B1) / B2
    z = 4 * b2 * u * (1 - u)
  }
  const h = th.size / 2
  const P: V3 = [pos[0], pos[1], h + z]
  // Rolling: the turn left is the distance left over the die's rolling radius.
  const dir: V3 = [th.to[0] - th.from[0], th.to[1] - th.from[1], 0]
  const len = Math.hypot(dir[0], dir[1]) || 1
  const axis = norm([-dir[1] / len, dir[0] / len, 0.0001])
  const left = len * (1 - travel)
  // Negative: the angle grows toward zero as it travels, so it rolls forward.
  let R = mul(rot(axis, -left / (h * 1.15)), th.rest)
  if (th.spin) {
    const k = Math.max(0, 1 - p / 0.6)
    R = mul(rot(th.spinAxis ?? [0.3, 0.2, 1], th.spin * k * k * k), R)
  }
  if (th.wobble && p >= 1) {
    const tau = t - th.t1
    const a = th.wobble * Math.exp(-tau * 7) * Math.sin(tau * 26)
    R = mul(rot(axis, a), R)
  }
  return {
    pos: P,
    R,
    landings: [th.t0 + T1 * dur, th.t0 + (T1 + B1) * dur, th.t0 + (T1 + B1 + B2) * dur],
  }
}
