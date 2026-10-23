// Drawing on the trailer's 1920×1080 canvas in the game's look (docs/15): Jersey type with the ink outline, panels with
// an ink edge and a lip, the HP bar, and the trailer's own touches (flashes, speed lines, wipes).
import { DAYBREAK_TYPES, PALETTE } from '@/theme/colors'

export const OW = 1920
export const OH = 1080
export const INK = PALETTE.ink
export const GOLD = PALETTE.gold
export const TYPE = DAYBREAK_TYPES

export type G = CanvasRenderingContext2D

export interface TextOpts {
  size?: number
  font?: 'Jersey 25' | 'Jersey 15'
  color?: string
  align?: CanvasTextAlign
  base?: CanvasTextBaseline
  /** Ink outline width in screen pixels (0: none). */
  ow?: number
  outline?: string
  /** A hard drop shadow under the outline. */
  drop?: number
  dropColor?: string
  spacing?: number
  alpha?: number
}

/** Text with a hard pixel outline (stamped in 16 directions, no blur), like the game's labels. */
export function text(g: G, s: string, x: number, y: number, o: TextOpts = {}) {
  const {
    size = 64,
    font = 'Jersey 25',
    color = '#ffffff',
    align = 'left',
    base = 'alphabetic',
    ow = Math.round(size / 12),
    outline = INK,
    drop = 0,
    dropColor = INK,
    spacing = 0,
    alpha = 1,
  } = o
  g.save()
  g.globalAlpha *= alpha
  g.font = `${size}px "${font}"`
  g.textAlign = align
  g.textBaseline = base
  g.letterSpacing = `${spacing}px`
  const stamp = (dx: number, dy: number, c: string) => {
    g.fillStyle = c
    g.fillText(s, Math.round(x + dx), Math.round(y + dy))
  }
  if (drop) for (let i = 1; i <= drop; i += Math.max(1, ow)) stamp(0, ow + i, dropColor)
  if (ow > 0) {
    const n = 16
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      stamp(Math.round(Math.cos(a) * ow), Math.round(Math.sin(a) * ow), outline)
    }
  }
  stamp(0, 0, color)
  g.restore()
}

export function textWidth(g: G, s: string, size: number, font = 'Jersey 25', spacing = 0) {
  g.save()
  g.font = `${size}px "${font}"`
  g.letterSpacing = `${spacing}px`
  const w = g.measureText(s).width
  g.restore()
  return w
}

export function rect(g: G, x: number, y: number, w: number, h: number, c: string) {
  g.fillStyle = c
  g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
}

/** A Daybreak panel: fill, an ink edge `b` px, a light top lip and a shaded bottom one. */
export function panel(
  g: G,
  x: number,
  y: number,
  w: number,
  h: number,
  { fill = PALETTE.panel as string, b = 6, lip = true }: { fill?: string; b?: number; lip?: boolean } = {},
) {
  rect(g, x - b, y - b, w + 2 * b, h + 2 * b, INK)
  rect(g, x, y, w, h, fill)
  if (lip) {
    rect(g, x, y + h - b, w, b, PALETTE.lip)
    rect(g, x, y, w, Math.round(b / 2), '#ffffff')
  }
}

/** The HP bar: an ink well and the green / yellow / red fill, with its light top stripe. */
export function hpBar(g: G, x: number, y: number, w: number, h: number, frac: number, b = 4) {
  rect(g, x - b, y - b, w + 2 * b, h + 2 * b, INK)
  rect(g, x, y, w, h, '#3a4566')
  const f = Math.max(0, Math.min(1, frac))
  const c = f > 0.5 ? PALETTE.hpGreen : f > 0.2 ? PALETTE.hpYellow : PALETTE.hpRed
  rect(g, x, y, w * f, h, c)
  rect(g, x, y, w * f, Math.max(2, Math.round(h / 4)), 'rgba(255,255,255,0.45)')
}

/** A flat colour over everything, in steps (the game's washes never fade smoothly). */
export function wash(g: G, c: string, a: number, steps = 8) {
  const q = Math.round(Math.max(0, Math.min(1, a)) * steps) / steps
  if (q <= 0) return
  g.save()
  g.globalAlpha = q
  g.fillStyle = c
  g.fillRect(0, 0, OW, OH)
  g.restore()
}

/** Manga speed lines toward a point. */
export function speedLines(g: G, cx: number, cy: number, t: number, { color = '#ffffff', n = 48, inner = 360, a = 0.8 } = {}) {
  g.save()
  g.globalAlpha = a
  g.fillStyle = color
  for (let i = 0; i < n; i++) {
    const seed = Math.sin(i * 91.7 + Math.floor(t * 30) * 13.1) * 43758.5
    const r = seed - Math.floor(seed)
    const ang = (i / n) * Math.PI * 2 + r * 0.12
    const w = 0.006 + r * 0.012
    const r0 = inner + r * 220
    g.beginPath()
    g.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0)
    g.lineTo(cx + Math.cos(ang - w) * 2400, cy + Math.sin(ang - w) * 2400)
    g.lineTo(cx + Math.cos(ang + w) * 2400, cy + Math.sin(ang + w) * 2400)
    g.closePath()
    g.fill()
  }
  g.restore()
}

/** A dark gradient band from the bottom (behind the dice overlay). */
export function bottomShade(g: G, top: number, a = 0.8) {
  const gr = g.createLinearGradient(0, top, 0, OH)
  gr.addColorStop(0, 'rgba(14,18,36,0)')
  gr.addColorStop(0.45, `rgba(14,18,36,${a * 0.75})`)
  gr.addColorStop(1, `rgba(14,18,36,${a})`)
  g.fillStyle = gr
  g.fillRect(0, top, OW, OH - top)
}

/** The parchment's 8-px dot texture (docs/15), on any ground. */
export function dots(g: G, ground: string, dot: string, step = 24, size = 6) {
  rect(g, 0, 0, OW, OH, ground)
  g.fillStyle = dot
  for (let y = 0; y < OH; y += step) for (let x = (y / step) % 2 ? step / 2 : 0; x < OW; x += step) g.fillRect(x, y, size, size)
}

/** A vignette in hard steps. */
export function vignette(g: G, a = 0.5, color = '14,18,36') {
  const gr = g.createRadialGradient(OW / 2, OH / 2, OH * 0.35, OW / 2, OH / 2, OH * 1.05)
  gr.addColorStop(0, `rgba(${color},0)`)
  gr.addColorStop(1, `rgba(${color},${a})`)
  g.fillStyle = gr
  g.fillRect(0, 0, OW, OH)
}

export const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v))
export const span = (t: number, a: number, b: number) => clamp((t - a) / (b - a))
export const lerp = (a: number, b: number, p: number) => a + (b - a) * p
export const outBack = (p: number, s = 1.70158) => 1 + (s + 1) * (p - 1) ** 3 + s * (p - 1) ** 2
export const outCubic = (p: number) => 1 - (1 - p) ** 3
export const inOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2)
/** Hold each value for n frames (a stepped, pixel-art motion). */
export const stepped = (t: number, fps = 30) => Math.floor(t * fps) / fps
