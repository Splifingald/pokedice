import { PALETTE, TYPE_COLORS } from './colors'
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

const badgeCache = new Map<string, { bg: string; fg: string }>()

/**
 * Colours for text that sits on a type colour (badges, chart headers). Keeps the type's hue but nudges the fill —
 * darker under white text, lighter under ink — until the text clears 4.5:1 (WCAG AA for small text).
 */
export function badgeColors(hex: string): { bg: string; fg: string } {
  const hit = badgeCache.get(hex)
  if (hit) return hit
  const fg = readableOn(hex)
  let bg = hex
  for (let i = 0; i < 40 && contrast(fg, bg) < 4.6; i++) bg = fg === PALETTE.panel ? shade(bg, 0.95) : mix(bg, '#ffffff', 0.08)
  const out = { bg, fg }
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
  return override ?? TYPE_COLORS[type as DieType] ?? PALETTE.shadow
}

export function hpColor(pct: number): string {
  if (pct > 0.5) return PALETTE.hpGreen
  if (pct > 0.2) return PALETTE.hpYellow
  return PALETTE.hpRed
}

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ')
