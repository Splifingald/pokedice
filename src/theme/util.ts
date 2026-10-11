import { DAYBREAK_TYPES, PALETTE } from './colors'
import type { DieType } from '@/engine/types'

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)]
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio between two colours (1–21). */
export function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** Whichever of ink / panel-white reads better on this colour. */
export function readableOn(bg: string): string {
  return contrast(PALETTE.ink, bg) >= contrast(PALETTE.panel, bg) ? PALETTE.ink : PALETTE.panel
}

/** Ink on light colours, panel-white on dark ones (the higher-contrast of the two). */
export function textOn(hex: string): string {
  return readableOn(hex)
}

export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a)
  const [r2, g2, b2] = hexToRgb(b)
  const c = (x: number, y: number) =>
    Math.round(x + (y - x) * t)
      .toString(16)
      .padStart(2, '0')
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`
}

// OKLab, so a mix keeps its hue the way CSS `color-mix(in oklab, …)` does (the lab's badges are specified that way).
const toLinear = (v: number) => {
  const c = v / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
const toByte = (v: number) => {
  const c = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
  return Math.max(0, Math.min(255, Math.round(c * 255)))
}
function oklab(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map(toLinear) as [number, number, number]
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}
function fromOklab([L, A, B]: [number, number, number]): string {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  return `#${rgb.map((v) => toByte(v).toString(16).padStart(2, '0')).join('')}`
}

/** `color-mix(in oklab, a p, b)`: p of `a`, the rest `b`. */
export function mixOklab(a: string, p: number, b: string): string {
  const x = oklab(a)
  const y = oklab(b)
  return fromOklab([x[0] * p + y[0] * (1 - p), x[1] * p + y[1] * (1 - p), x[2] * p + y[2] * (1 - p)])
}

const badgeCache = new Map<string, { bg: string; fg: string; ring: string }>()

/**
 * A type badge's colours: the type mixed 32 % into white for the fill, 45 % into deep navy for the text, 75 % into
 * ink for the ring. The text is darkened further if a type ever falls under 4.5:1 (WCAG AA for small text).
 */
export function badgeColors(hex: string): { bg: string; fg: string; ring: string } {
  const hit = badgeCache.get(hex)
  if (hit) return hit
  const bg = mixOklab(hex, 0.32, '#ffffff')
  let p = 0.45
  let fg = mixOklab(hex, p, '#141a33')
  while (contrast(fg, bg) < 4.6 && p > 0) fg = mixOklab(hex, (p -= 0.05), '#141a33')
  const out = { bg, fg, ring: mixOklab(hex, 0.75, PALETTE.ink) }
  badgeCache.set(hex, out)
  return out
}

export function shade(hex: string, f: number): string {
  const [r, g, b] = hexToRgb(hex)
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v * f)))
      .toString(16)
      .padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

export function typeColor(type: DieType | string, override?: string): string {
  return override ?? DAYBREAK_TYPES[type as DieType] ?? PALETTE.shadow
}

export function hpColor(pct: number): string {
  if (pct > 0.5) return PALETTE.hpGreen
  if (pct > 0.2) return PALETTE.hpYellow
  return PALETTE.hpRed
}

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ')
