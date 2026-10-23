// The battle's plates and readouts for the trailer, drawn at screen size in the game's look (Plates.tsx, the damage
// readout, the combo chip): name and level, the HP bar, a trainer's party as red squares, the damage alone and big.
import { PALETTE } from '@/theme/colors'
import { icon } from '@/fx/pixel'
import { sharpDraw } from './stage'
import { GOLD, hpBar, INK, outBack, panel, rect, span, text, textWidth, type G } from './draw'

export interface PlateInfo {
  name: string
  level: number
  hp: number
  /** Yours shows the numbers. */
  max?: number
  /** A trainer's party: how many, and how many are spent. */
  party?: number
  types?: string[]
}

const W = 560

/** The foe's plate, top left; slides in from the left from `inAt`. */
export function foePlate(g: G, p: PlateInfo, t: number, inAt: number, x = 48, y = 48) {
  if (t < inAt) return
  const k = outBack(span(t, inAt, inAt + 0.18), 1.4)
  const dx = Math.round((1 - k) * -(W + 120))
  plate(g, p, x + dx, y, false)
}

/** Your plate, bottom right (clear of the Pokémon and the dice); slides in from the right. */
export function ownPlate(g: G, p: PlateInfo, t: number, inAt: number, x = 1920 - 48 - W, y = 1080 - 48 - 150) {
  if (t < inAt) return
  const k = outBack(span(t, inAt, inAt + 0.18), 1.4)
  const dx = Math.round((1 - k) * (W + 120))
  plate(g, p, x + dx, y, true)
}

function plate(g: G, p: PlateInfo, x: number, y: number, own: boolean) {
  const h = own ? 150 : 128
  panel(g, x, y, W, h, { b: 6 })
  text(g, p.name, x + 24, y + 58, { size: 56, color: INK, ow: 0 })
  text(g, `Lv.${p.level}`, x + W - 24, y + 58, { size: 48, color: PALETTE.muted, ow: 0, align: 'right' })
  if (p.types) {
    let tx = x + 24 + textWidth(g, p.name, 56) + 20
    for (const ty of p.types) {
      const w = textWidth(g, ty.toUpperCase(), 28, 'Jersey 15') + 20
      rect(g, tx - 3, y + 24, w + 6, 40, INK)
      rect(g, tx, y + 27, w, 34, typeFill(ty))
      text(g, ty.toUpperCase(), tx + w / 2, y + 53, { size: 28, font: 'Jersey 15', align: 'center', ow: 3 })
      tx += w + 14
    }
  }
  if (p.party) for (let i = 0; i < p.party; i++) rect(g, x + W - 30 - i * 26, y - 30, 18, 18, PALETTE.danger)
  hpBar(g, x + 24, y + 82, W - 48, 22, p.hp)
  if (own && p.max) {
    const cur = Math.max(0, Math.round(p.hp * p.max))
    text(g, `${cur}/${p.max}`, x + W - 24, y + 140, { size: 38, color: INK, ow: 0, align: 'right', font: 'Jersey 15' })
  }
}

const TYPE_FILLS: Record<string, string> = {
  fire: '#ee8130',
  grass: '#7ac74c',
  poison: '#a33ea1',
  bug: '#a6b91a',
  flying: '#a98ff3',
  psychic: '#f95587',
}
const typeFill = (t: string) => TYPE_FILLS[t] ?? PALETTE.muted

/** The damage, alone and big, slamming in at `at` (scale from 2.4 down, then a shake for a big one). */
export function damageSlam(g: G, n: number, x: number, y: number, t: number, at: number, { size = 170, shake = 0 } = {}) {
  if (t < at) return
  const p = span(t, at, at + 0.14)
  const k = 2.4 - 1.4 * outBack(p, 2)
  const sh = shake && t < at + 0.35 ? Math.round(Math.sin((t - at) * 90) * shake * (1 - span(t, at, at + 0.35))) : 0
  g.save()
  g.translate(x + sh, y)
  g.scale(k, k)
  text(g, String(n), 0, 0, { size, align: 'center', base: 'middle', ow: Math.round(size / 14), drop: Math.round(size / 12), dropColor: '#c4382a' })
  g.restore()
}

/** The combo chip: gold, ink edge, ink words. */
export function comboChip(g: G, label: string, x: number, y: number, t: number, at: number, size = 56) {
  if (t < at) return
  const p = outBack(span(t, at, at + 0.15), 2)
  const w = textWidth(g, label, size, 'Jersey 25', 3) + 44
  const h = size + 16
  g.save()
  g.translate(x, y)
  g.scale(p, p)
  rect(g, -w / 2 - 6, -h / 2 - 6, w + 12, h + 12, INK)
  rect(g, -w / 2, -h / 2, w, h, GOLD)
  rect(g, -w / 2, -h / 2, w, 6, PALETTE.goldLight)
  text(g, label, 0, 2, { size, color: INK, ow: 0, align: 'center', base: 'middle', spacing: 3 })
  g.restore()
}

// The Boulder Badge, as BadgeIcon draws it: the gem in greys.
const GEM = [
  '...kkkkkk...',
  '..kbbbaaak..',
  '.kbwbaaaaak.',
  'kbwbaaaaaack',
  'kbbaaaaaaack',
  'kbaaaaaaaack',
  'kaaaaaaaacck',
  'kaaaaaaaacck',
  'kaaaaaaaccck',
  '.kaaaaacccck',
  '..kaacccck..',
  '...kkkkkk...',
]
export const boulderBadge = () => icon(GEM, { k: INK, w: '#ffffff', a: '#a8aebb', b: '#d8dce4', c: '#6f7686' }, 1)

/** A small canvas scaled up with even pixels (sharp scaling when k isn't whole). */
export function blit(g: G, c: HTMLCanvasElement, x: number, y: number, k: number) {
  sharpDraw(g, c, x, y, c.width * k, c.height * k)
}

// ---------------------------------------------------------------- explaining a roll
/** Each die's value popping up over it as the dice settle (screen positions of the dice). */
export function valuePops(g: G, values: number[], at: (i: number) => { x: number; y: number }, t: number, from: number) {
  values.forEach((v, i) => {
    const a = from + i * 0.06
    if (t < a) return
    const p = at(i)
    const k = outBack(span(t, a, a + 0.14), 2.2)
    g.save()
    g.translate(p.x, p.y - 96)
    g.scale(k, k)
    text(g, String(v), 0, 0, { size: 64, color: GOLD, align: 'center', base: 'middle', ow: 7 })
    g.restore()
  })
}

/** A line of the game's battle message, in its box, at the top of the screen. */
export function caption(g: G, line: string, t: number, from: number, to: number) {
  if (t < from || t >= to) return
  const p = outBack(span(t, from, from + 0.15), 1.3)
  const w = textWidth(g, line, 56) + 80
  const x = 960 - w / 2
  const y = 64 - (1 - p) * 220
  panel(g, x, y, w, 96, { b: 6 })
  text(g, line, 960, y + 66, { size: 56, color: INK, ow: 0, align: 'center' })
}

// ---------------------------------------------------------------- the five of a kind
const CONFETTI = Array.from({ length: 140 }, (_, i) => {
  const r = (n: number) => {
    const s = Math.sin(i * 127.1 + n * 311.7) * 43758.5453
    return s - Math.floor(s)
  }
  return {
    x: r(1) * 1920,
    vx: (r(2) - 0.5) * 500,
    vy: -900 - r(3) * 900,
    c: ['#ffbe2e', '#f2553f', '#6390f0', '#7ac74c', '#ffffff', '#f95587'][i % 6]!,
    s: 12 + Math.round(r(4) * 3) * 6,
    spin: r(5) * 10,
  }
})

/** Gold rays turning behind the dice, confetti bursting up and raining down. */
export function celebrate(g: G, t: number, at: number, cx = 960, cy = 900) {
  const e = t - at
  if (e < 0) return
  const a = Math.min(1, e / 0.15) * (1 - span(e, 1.6, 2.0))
  if (a <= 0) return
  g.save()
  g.globalAlpha = 0.55 * a
  g.fillStyle = GOLD
  const n = 18
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + e * 0.8
    g.beginPath()
    g.moveTo(cx, cy)
    g.lineTo(cx + Math.cos(ang - 0.06) * 2600, cy + Math.sin(ang - 0.06) * 2600)
    g.lineTo(cx + Math.cos(ang + 0.06) * 2600, cy + Math.sin(ang + 0.06) * 2600)
    g.closePath()
    g.fill()
  }
  g.restore()
  for (const c of CONFETTI) {
    const x = c.x + c.vx * e
    const y = 1100 + c.vy * e + 900 * e * e
    if (y > 1140) continue
    const w = Math.round(c.s * Math.abs(Math.cos(e * c.spin)))
    rect(g, Math.round(x / 6) * 6, Math.round(y / 6) * 6, Math.max(6, w), c.s, c.c)
  }
}
