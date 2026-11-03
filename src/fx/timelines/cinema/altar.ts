// The Altar of the Sunne and the Altar of the Moone (docs/53), where Cosmog, Solgaleo and Lunala come: a round stone
// platform on Poni's heights above a sea of clouds, its emblem cut into the floor (the sun's, the moon's, or the two
// together for Cosmog), a flute pedestal at either side, steps going down into the clouds. The place only: each legend's
// own file tells its scene on it.
import { bayer, canvas, ellipse, rect, shade, type Canvas, type G, type Rng } from '../../pixel'
import { spriteSize } from '../../sprites'
import { hash2 } from './alolaKit'
import { tri } from './kit'

export type Emblem = 'sunne' | 'moone' | 'both'

export interface AltarPal {
  lit: string
  mid: string
  dark: string
  ink: string
  /** The emblem's grooves, unlit. */
  groove: string
}

export interface Altar {
  w: number
  h: number
  cx: number
  m: number
  /** The legend's feet: on the emblem's heart. */
  feet: number
  sz: { w: number; h: number }
  /** The platform: its top, an ellipse in perspective, and its front face's height. */
  py: number
  rx: number
  ry: number
  face: number
  /** The sea of clouds' horizon. */
  sea: number
  /** The flute pedestals: their feet on the platform and their tops (where the light sits). */
  peds: { x: number; base: number; top: number }[]
}

export function altarLayout(w: number, h: number, mon: string): Altar {
  const m = Math.min(w, h)
  const cx = Math.round(w / 2)
  const feet = Math.round(h * 0.62)
  const rx = Math.round(Math.min(w * 0.47, m * 0.6))
  const ry = Math.max(8, Math.round(rx * 0.26))
  const py = feet + 1
  const ph = Math.round(m * 0.26)
  return {
    w,
    h,
    cx,
    m,
    feet,
    sz: spriteSize(mon),
    py,
    rx,
    ry,
    face: Math.round(m * 0.05) + 5,
    sea: Math.round(h * 0.55),
    peds: [-1, 1].map((s) => {
      const x = Math.round(cx + s * rx * 0.8)
      const base = Math.round(py - ry * 0.45)
      return { x, base, top: base - ph }
    }),
  }
}

/** Is (x, y) on the floor's ellipse (and how far out: 0 centre, 1 rim)? */
const onFloor = (A: Altar, x: number, y: number) => Math.hypot((x - A.cx) / A.rx, (y - A.py) / A.ry)

/**
 * The emblem's shape in the floor's own plane (u, v: pixels, round, before perspective): filled parts, and rings
 * (radii, drawn one pixel wide wherever the ring crosses between two pixels, so they never break up when squashed).
 */
function emblemShape(kind: Emblem, R: number) {
  const rings = kind === 'sunne' ? [0.24, 0.38, 0.72] : kind === 'moone' ? [0.5, 0.72] : [0.3, 0.52, 0.72]
  const fill = (u: number, v: number) => {
    const d = Math.hypot(u, v)
    const a = Math.atan2(v, u)
    if (kind === 'sunne') {
      if (d < R * 0.12) return true
      if (d > R * 0.42 && d < R * 0.66) {
        // Twelve rays, wide at the ring, pointed outward.
        const f = ((((a / (Math.PI * 2)) * 12) % 1) + 1) % 1
        return Math.abs(f - 0.5) < 0.3 * (1 - (d - R * 0.42) / (R * 0.24))
      }
      return false
    }
    if (kind === 'moone') {
      // A crescent, its horns up, and eight stars round it.
      if (Math.hypot(u + R * 0.06, v) < R * 0.34 && Math.hypot(u - R * 0.08, v - R * 0.08) > R * 0.28)
        return true
      for (let i = 0; i < 8; i++) {
        const sa = (i / 8) * Math.PI * 2
        if (Math.hypot(u - Math.cos(sa) * R * 0.61, v - Math.sin(sa) * R * 0.61) < R * 0.045) return true
      }
      return false
    }
    // Cosmog's: a four-pointed star in the middle, a small sun on one side, a crescent on the other.
    if (Math.abs(u) * Math.abs(v) < R * R * 0.002 && d < R * 0.26) return true
    if (Math.abs(u) + Math.abs(v) < R * 0.08) return true
    if (Math.hypot(u + R * 0.62, v) < R * 0.07) return true
    if (Math.hypot(u - R * 0.62, v) < R * 0.08 && Math.hypot(u - R * 0.65, v - R * 0.03) > R * 0.065)
      return true
    return false
  }
  return { rings, fill }
}

/** The emblem drawn on its own canvas (the size of the screen), in one colour with a lighter edge. */
export function emblemCanvas(A: Altar, kind: Emblem, col: string, edge?: string): Canvas {
  const R = A.rx * 0.78
  const s = A.ry / A.rx
  const { rings, fill } = emblemShape(kind, R)
  const f = (x: number, y: number) => {
    const u = x - A.cx
    const v = (y - A.py) / s
    return { u, v, d: Math.hypot(u, v) }
  }
  const x0 = Math.round(A.cx - R - 2)
  const y0 = Math.round(A.py - R * s - 2)
  const cw = Math.round(R * 2 + 4)
  const ch = Math.round(R * s * 2 + 4)
  const cv = canvas(A.w, A.h)
  const part = shade(cw, ch, (px, py) => {
    const x = px + x0
    const y = py + y0
    const p = f(x, y)
    if (fill(p.u, p.v)) return edge && !fill(p.u, f(x, y - 1).v) ? edge : col
    // A ring passes here if it falls between this pixel and its right or lower neighbour.
    const pr = f(x + 1, y)
    const pd = f(x, y + 1)
    for (const k of rings) {
      const r = k * R
      if ((p.d - r) * (pr.d - r) <= 0 || (p.d - r) * (pd.d - r) <= 0) return col
    }
    return null
  })
  cv.g.drawImage(part, x0, y0)
  return cv
}

/** The altar, drawn once: the platform and its face, the steps down, rim posts, the pedestals, the emblem's grooves. */
export function altarCanvas(A: Altar, kind: Emblem, P: AltarPal): Canvas {
  const cv = canvas(A.w, A.h)
  const g = cv.g
  const { cx, py, rx, ry, face } = A
  // The front face: below the ellipse's front half, courses of stone, darker down.
  for (let x = cx - rx; x <= cx + rx; x++) {
    const u = (x - cx) / rx
    const yTop = Math.round(py + ry * Math.sqrt(Math.max(0, 1 - u * u)))
    for (let y = yTop; y < yTop + face; y++) {
      const q = (y - yTop) / face
      const c = (y - yTop) % 5 === 4 ? P.ink : q < 0.3 ? P.mid : P.dark
      rect(g, x, y, 1, 1, Math.abs(u) > 0.92 ? P.ink : c)
    }
    if (((x - cx + 400) >> 3) % 2 === 0) rect(g, x, yTop + 1 + ((x >> 3) % 2) * 5, 1, 4, P.ink)
  }
  // The top: worn stone in rings, lit at the back, a darker band at the rim.
  const top = shade(rx * 2 + 2, ry * 2 + 2, (x, y) => {
    const e = onFloor(A, x + cx - rx - 1, y + py - ry - 1)
    if (e > 1) return null
    if (e > 0.94) return P.ink
    if (e > 0.86) return P.dark
    const k = e + hash2(x >> 2, y) * 0.25 + bayer(x, y) * 0.3 + (y / (ry * 2)) * 0.3
    return k < 0.75 ? P.lit : P.mid
  })
  g.drawImage(top, cx - rx - 1, py - ry - 1)
  // The steps: down the face at the front, into the clouds.
  const sw = Math.round(rx * 0.3)
  for (let k = 0; k < 5; k++) {
    const y = py + ry + face - 2 + k * 4
    const half = sw + k * 4
    rect(g, cx - half, y, half * 2, 4, k % 2 ? P.mid : P.lit)
    rect(g, cx - half, y + 3, half * 2, 1, P.ink)
    rect(g, cx - half, y, 1, 4, P.ink)
    rect(g, cx + half - 1, y, 1, 4, P.ink)
  }
  // Posts round the back of the rim.
  for (let i = 1; i < 10; i++) {
    const a = Math.PI + (i / 10) * Math.PI
    const x = Math.round(cx + Math.cos(a) * rx * 0.97)
    const y = Math.round(py + Math.sin(a) * ry * 0.97)
    if (A.peds.some((p) => Math.abs(p.x - x) < 6)) continue
    rect(g, x - 1, y - 6, 3, 6, P.mid)
    rect(g, x - 1, y - 6, 1, 6, P.lit)
    rect(g, x - 2, y - 7, 5, 1, P.dark)
  }
  // The pedestals: tall, tapering, a capital and a dish on top.
  for (const pd of A.peds) {
    const hgt = pd.base - pd.top
    for (let y = pd.top + 4; y < pd.base; y++) {
      const q = (y - pd.top) / hgt
      const half = Math.round(3 + q * 3)
      rect(g, pd.x - half, y, half * 2, 1, P.mid)
      rect(g, pd.x - half, y, 1, 1, P.lit)
      rect(g, pd.x + half - 1, y, 1, 1, P.ink)
    }
    for (let y = pd.top + 10; y < pd.base - 4; y += 9) rect(g, pd.x - 4, y, 8, 1, P.dark)
    rect(g, pd.x - 6, pd.base - 3, 12, 3, P.dark)
    rect(g, pd.x - 6, pd.base - 3, 12, 1, P.lit)
    rect(g, pd.x - 6, pd.top + 2, 12, 3, P.dark)
    rect(g, pd.x - 6, pd.top + 2, 12, 1, P.lit)
    tri(g, pd.x - 7, pd.top + 2, pd.x + 7, pd.top + 2, pd.x, pd.top - 3, P.mid)
    ellipse(g, pd.x, pd.top - 3, 4, 1, P.ink)
  }
  g.drawImage(emblemCanvas(A, kind, P.groove), 0, 0)
  return cv
}

/** Peaks standing out of the sea of clouds, both sides, in the distance's colour. */
export function peaks(g: G, A: Altar, far: string, near: string, r: Rng) {
  for (const [col, k0] of [
    [far, 0.6],
    [near, 1],
  ] as const)
    for (const side of [-1, 1]) {
      const n = Math.max(2, Math.round(A.w / 90))
      for (let i = 0; i < n; i++) {
        const x = Math.round(A.cx + side * (A.w * 0.18 + i * A.w * r.range(0.14, 0.24)) * (k0 < 1 ? 1.1 : 1))
        const hh = Math.round(A.h * r.range(0.08, 0.2) * k0)
        const half = Math.round(hh * r.range(0.7, 1.1))
        tri(g, x - half, A.sea + 2, x + half, A.sea + 2, x + r.range(-4, 4), A.sea - hh, col)
      }
    }
}

/**
 * The sea of clouds under the altar: rolling banks in three tones, lit along their tops. Drawn on its own canvas
 * from the horizon down.
 */
export function cloudSea(A: Altar, tones: readonly [string, string, string, string], r: Rng): Canvas {
  const H = A.h - A.sea
  const cv = canvas(A.w, H)
  const g = cv.g
  g.fillStyle = tones[3]
  g.fillRect(0, 2, A.w, H)
  for (let row = 0; row < 6; row++) {
    const y = Math.round(2 + (row / 6) ** 1.3 * H)
    const s = 4 + row * 3
    const c = tones[Math.min(2, Math.floor(row / 2))]!
    for (let x = -s; x < A.w + s; x += s * 1.6) {
      const xx = x + r.range(-s * 0.4, s * 0.4)
      ellipse(g, xx, y, s, Math.max(2, Math.round(s * 0.45)), c)
      rect(g, xx - s * 0.6, y - Math.round(s * 0.45), s * 1.2, 1, tones[0])
    }
  }
  return cv
}
