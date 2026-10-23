// Act 6, the end card (54.5 → 60 s): the title's navy floor with its Poké Balls, the POKÉDICE dice dropping back into
// their crooked row with the gold ring pulsing under them, the website, then two badges — MOBILE FRIENDLY and DISCORD
// COMMUNITY — and the fan-made line.
import { canvas, ellipseLine, icon } from '@/fx/pixel'
import { PALETTE } from '@/theme/colors'
import { ACT, hit } from '../lib/clock'
import { play } from '../lib/audio'
import { pokeballBackdrop } from '../lib/backdrop'
import { drawDie, drawShadow, project, type View } from '../lib/cube'
import { GOLD, INK, outBack, OW, rect, span, text, textWidth, wash, type G } from '../lib/draw'
import { F } from '../lib/frame'
import { blit } from '../lib/hud'
import { LH, LK, logoDice, LW, SIZE } from './title'
import type { Act } from '../main'

const low = canvas(LW, LH)

// Discord's mark in pixels: its blurple badge, the white face with two eyes.
const DISCORD = [
  '..bbbbbbbbbbbbbbbbbbbb..',
  '.bBBBBBBBBBBBBBBBBBBBBb.',
  'bbbbbbbbbbbbbbbbbbbbbbbb',
  'bbbbbbwwwbbbbbbwwwbbbbbb',
  'bbbbwwwwwwwwwwwwwwwwbbbb',
  'bbbwwwwwwwwwwwwwwwwwwbbb',
  'bbbwwwwwwwwwwwwwwwwwwbbb',
  'bbwwwwwwwwwwwwwwwwwwwwbb',
  'bbwwwwbbbwwwwwwbbbwwwwbb',
  'bbwwwbbbbbwwwwbbbbbwwwbb',
  'bbwwwbbbbbwwwwbbbbbwwwbb',
  'bbwwwwbbbwwwwwwbbbwwwwbb',
  'bbwwwwwwwwwwwwwwwwwwwwbb',
  'bbwwwwwwwwwwwwwwwwwwwwbb',
  'bbbwwwwwbbbbbbbbwwwwwbbb',
  'bbbbbwwwbbbbbbbbwwwbbbbb',
  'bbbbbbbbbbbbbbbbbbbbbbbb',
  '.bbbbbbbbbbbbbbbbbbbbbb.',
  '..bbbbbbbbbbbbbbbbbbbb..',
]
const discord = () => icon(DISCORD, { b: '#5865f2', B: '#7c87f6', w: '#ffffff' }, 1)

// A phone: the game on its screen.
const PHONE = [
  '.kkkkkkkkkk.',
  'kppppkkppppk',
  'kpkkkkkkkkpk',
  'kpkSssssskpk',
  'kpkSssssskpk',
  'kpkSsggsskpk',
  'kpkSsggsskpk',
  'kpkSssssskpk',
  'kpkSssysskpk',
  'kpkSssyyskpk',
  'kpkSssssskpk',
  'kpkSssssskpk',
  'kpkkkkkkkkpk',
  'kppppkkppppk',
  'kppppkkppppk',
  '.kkkkkkkkkk.',
]
const phone = () => icon(PHONE, { k: INK, p: '#fbfdff', s: '#6390f0', S: '#a9c4ff', g: '#7ac74c', y: '#ffbe2e' }, 1)

/** A badge: a dark pixel panel with a gold edge, an icon and a word. */
function badge(g: G, ic: HTMLCanvasElement, k: number, word: string, x: number, y: number, w: number, a: number) {
  if (a <= 0) return
  const p = outBack(Math.min(1, a), 1.6)
  const h = 128
  g.save()
  g.translate(x + w / 2, y + h / 2)
  g.scale(p, p)
  g.translate(-w / 2, -h / 2)
  rect(g, -8, -8, w + 16, h + 16, INK)
  rect(g, -2, -2, w + 4, h + 4, GOLD)
  rect(g, 0, 0, w, h, '#1c2550')
  const iw = ic.width * k
  const ih = ic.height * k
  blit(g, ic, 28, (h - ih) / 2, k)
  text(g, word, 28 + iw + 28, h / 2 + 24, { size: 66, ow: 6 })
  g.restore()
}

/** When each part of the end card comes in (seconds from its start), and when it fades out. */
export interface EndTimes {
  dice: number
  stagger: number
  ring: number
  tagline: number
  url: number
  badges: [number, number]
  footer: number
  fade: [number, number]
}
const SLOW: EndTimes = { dice: 0.1, stagger: 0.05, ring: 0.7, tagline: 0.8, url: 1.0, badges: [1.3, 1.5], footer: 1.9, fade: [5.2, 5.5] }

/** The end card at time e of its own, starting at T0 on the cut's clock. */
export function drawEnd(g: G, e: number, T0: number, at: EndTimes = SLOW) {
  if (F.portrait) return drawEndTall(g, e, T0, at)
  pokeballBackdrop(low.g, LW, LH, T0 + e)
  // The dice drop in, one after another, onto their crooked row.
  const v: View = { tilt: (62 * Math.PI) / 180, cs: 2, cx: LW / 2, cy: 100 }
  const dice = logoDice(0, { thrown: false }).map((d, i) => {
    const a = at.dice + i * at.stagger
    const p = span(e, a, a + 0.36)
    const fall = p < 0.7 ? (1 - p / 0.7) ** 2 * 140 : Math.sin(((p - 0.7) / 0.3) * Math.PI) * 7
    return { ...d, pos: [d.pos[0], d.pos[1], d.pos[2] + fall] as const, show: e >= a, landAt: a + 0.25 }
  })
  // The ring under the row, pulsing once a second.
  if (e > at.ring) {
    const c = project(v, [0, 0, 0])
    const pulse = (e - at.ring) % 1
    low.g.globalAlpha = Math.round((1 - pulse) * 4) / 4
    const r = 276 + pulse * 46
    for (const k of [0, 1, 2]) ellipseLine(low.g, c.x, c.y + 8, r + k, (r + k) * 0.17, GOLD)
    low.g.globalAlpha = 1
  }
  for (const d of dice) if (d.show) drawShadow(low.g, v, d, 'rgba(4,6,20,0.5)')
  for (const d of dice) if (d.show) drawDie(low.g, v, { ...d, ring: e > at.ring ? GOLD : null })
  dice.forEach((d) => hit(T0 + d.landAt) && play('land'))
  g.imageSmoothingEnabled = false
  g.drawImage(low, 0, 0, LW * LK, LH * LK)

  const step = (a: number) => Math.round(span(e, a, a + 0.15) * 4) / 4
  text(g, 'PLAY FREE IN YOUR BROWSER', OW / 2, 560, { size: 64, font: 'Jersey 15', color: GOLD, align: 'center', ow: 6, spacing: 8, alpha: step(at.tagline) })
  text(g, 'poke-dice.netlify.app', OW / 2, 712, { size: 150, align: 'center', ow: 10, drop: 10, alpha: step(at.url) })
  // The two badges, side by side.
  const ph = phone()
  const dc = discord()
  const w1 = 28 + ph.width * 6 + 28 + textWidth(g, 'MOBILE FRIENDLY', 66) + 36
  const w2 = 28 + dc.width * 4 + 28 + textWidth(g, 'DISCORD COMMUNITY', 66) + 36
  const gap = 60
  const x0 = OW / 2 - (w1 + gap + w2) / 2
  const [b1, b2] = at.badges
  badge(g, ph, 6, 'MOBILE FRIENDLY', x0, 820, w1, span(e, b1, b1 + 0.2))
  badge(g, dc, 4, 'DISCORD COMMUNITY', x0 + w1 + gap, 820, w2, span(e, b2, b2 + 0.2))
  if (hit(T0 + b1) || hit(T0 + b2)) play('button')
  text(g, 'Fan-made · non-commercial. Pokémon © Nintendo / Game Freak / Creatures.', OW / 2, 1050, {
    size: 32,
    font: 'Jersey 15',
    color: PALETTE.faint,
    align: 'center',
    ow: 0,
    alpha: step(at.footer),
  })
  if (e > at.fade[0]) wash(g, '#000000', span(e, at.fade[0], at.fade[1]))
}

// ---------------------------------------------------------------- portrait
const tall = canvas(360, 640)
// POKÉ over DICE: two rows of four dice, the word big enough on a phone.
const ROW = 26
const PITCH = SIZE + 9

/** A text size that fits `max` px of width, at most `size`. */
const fit = (g: G, s: string, size: number, max: number, font = 'Jersey 25', spacing = 0) =>
  Math.min(size, Math.floor((size * max) / textWidth(g, s, size, font, spacing)))

/** The end card in portrait (1080×1920): the dice in two rows, the website, the badges stacked, the fan-made line. */
function drawEndTall(g: G, e: number, T0: number, at: EndTimes) {
  pokeballBackdrop(tall.g, tall.width, tall.height, T0 + e)
  const v: View = { tilt: (62 * Math.PI) / 180, cs: 2, cx: 180, cy: 220 }
  const dice = logoDice(0, { thrown: false }).map((d, i) => {
    const a = at.dice + i * at.stagger
    const p = span(e, a, a + 0.36)
    const fall = p < 0.7 ? (1 - p / 0.7) ** 2 * 140 : Math.sin(((p - 0.7) / 0.3) * Math.PI) * 7
    const pos = [((i % 4) - 1.5) * PITCH, d.pos[1] * 0.5 + (i < 4 ? ROW : -ROW), d.pos[2] + fall] as const
    return { ...d, pos, show: e >= a, landAt: a + 0.25 }
  })
  if (e > at.ring) {
    const c = project(v, [0, 0, 0])
    const pulse = (e - at.ring) % 1
    tall.g.globalAlpha = Math.round((1 - pulse) * 4) / 4
    const r = 150 + pulse * 26
    for (const k of [0, 1, 2]) ellipseLine(tall.g, c.x, c.y + 8, r + k, (r + k) * 0.42, GOLD)
    tall.g.globalAlpha = 1
  }
  for (const d of dice) if (d.show) drawShadow(tall.g, v, d, 'rgba(4,6,20,0.5)')
  // Back row (POKÉ) first.
  for (const d of [...dice].sort((a, b) => b.pos[1] - a.pos[1]))
    if (d.show) drawDie(tall.g, v, { ...d, ring: e > at.ring ? GOLD : null })
  dice.forEach((d) => hit(T0 + d.landAt) && play('land'))
  g.imageSmoothingEnabled = false
  g.drawImage(tall, 0, 0, 1080, 1920)

  const step = (a: number) => Math.round(span(e, a, a + 0.15) * 4) / 4
  const tag = 'PLAY FREE IN YOUR BROWSER'
  text(g, tag, 540, 1050, { size: fit(g, tag, 64, 900, 'Jersey 15', 8), font: 'Jersey 15', color: GOLD, align: 'center', ow: 6, spacing: 8, alpha: step(at.tagline) })
  const url = 'poke-dice.netlify.app'
  text(g, url, 540, 1190, { size: fit(g, url, 150, 940), align: 'center', ow: 10, drop: 10, alpha: step(at.url) })
  // The two badges, one above the other, the same width.
  const ph = phone()
  const dc = discord()
  const w = Math.max(28 + ph.width * 6 + 28 + textWidth(g, 'MOBILE FRIENDLY', 66), 28 + dc.width * 4 + 28 + textWidth(g, 'DISCORD COMMUNITY', 66)) + 36
  const [b1, b2] = at.badges
  badge(g, ph, 6, 'MOBILE FRIENDLY', 540 - w / 2, 1310, w, span(e, b1, b1 + 0.2))
  badge(g, dc, 4, 'DISCORD COMMUNITY', 540 - w / 2, 1480, w, span(e, b2, b2 + 0.2))
  if (hit(T0 + b1) || hit(T0 + b2)) play('button')
  const foot = { size: 32, font: 'Jersey 15', color: PALETTE.faint, align: 'center', ow: 0, alpha: step(at.footer) } as const
  text(g, 'Fan-made · non-commercial.', 540, 1690, foot)
  text(g, 'Pokémon © Nintendo / Game Freak / Creatures.', 540, 1730, foot)
  if (e > at.fade[0]) wash(g, '#000000', span(e, at.fade[0], at.fade[1]))
}

export const endCard: Act = {
  range: ACT.end,
  load: async () => {},
  render: (g, T) => drawEnd(g, T - ACT.end[0], ACT.end[0]),
}
