// Act 6, the end card (19.5 → 21.5 s): the lab gives way to ink with the parchment's dots, the POKÉDICE dice drop back
// into their crooked row with the gold ring pulsing under them, then the website, the Discord and the fan-made line.
import { canvas, ellipseLine, icon } from '@/fx/pixel'
import { PALETTE } from '@/theme/colors'
import { ACT, hit } from '../lib/clock'
import { play } from '../lib/audio'
import { drawDie, drawShadow, project, type View } from '../lib/cube'
import { dots, GOLD, INK, OW, span, text, textWidth, wash } from '../lib/draw'
import { blit } from '../lib/hud'
import { logoDice } from './title'
import type { Act } from '../main'

const T0 = ACT.end[0]
const LW = 320
const LH = 180
const low = canvas(LW, LH)

// A small Discord-blue badge with a face: the link's icon, in pixels.
const CHAT = [
  '..kkkkkkkkkk..',
  '.kbbbbbbbbbbk.',
  'kbbbbbbbbbbbbk',
  'kbbwwbbbbwwbbk',
  'kbbwwbbbbwwbbk',
  'kbbbbbbbbbbbbk',
  'kbbwbbbbbbwbbk',
  '.kbbwwwwwwbbk.',
  '..kkkbbbbkkk..',
  '....kbbk......',
  '....kkk.......',
]
const chat = () => icon(CHAT, { k: INK, b: '#5865f2', w: '#ffffff' }, 1)

export const endCard: Act = {
  range: ACT.end,
  load: async () => {},
  render(g, T) {
    const e = T - T0
    dots(g, INK, '#2c3a60', 32, 8)
    // The dice drop in, one after another, onto their crooked row.
    const v: View = { tilt: (62 * Math.PI) / 180, cs: 1.12, cx: LW / 2, cy: 60 }
    low.g.clearRect(0, 0, LW, LH)
    const dice = logoDice(0, { thrown: false }).map((d, i) => {
      const p = span(e, 0.05 + i * 0.035, 0.05 + i * 0.035 + 0.3)
      const fall = p < 0.7 ? (1 - p / 0.7) ** 2 * 120 : Math.sin(((p - 0.7) / 0.3) * Math.PI) * 6
      return { ...d, pos: [d.pos[0], d.pos[1], d.pos[2] + fall] as const, landed: p >= 0.7, at: 0.05 + i * 0.035 + 0.21 }
    })
    // The ring under the row, pulsing once a second.
    if (e > 0.45) {
      const c = project(v, [0, 0, 0])
      const pulse = ((e - 0.45) % 1) / 1
      low.g.globalAlpha = Math.round((1 - pulse) * 4) / 4
      const r = 146 + pulse * 26
      for (const k of [0, 1]) ellipseLine(low.g, c.x, c.y + 4, r + k, (r + k) * 0.17, GOLD)
      low.g.globalAlpha = 1
    }
    for (const d of dice) if (e >= d.at - 0.25) drawShadow(low.g, v, d, 'rgba(0,0,0,0.4)')
    for (const d of dice) if (e >= d.at - 0.25) drawDie(low.g, v, { ...d, ring: e > 0.45 ? GOLD : null })
    dice.forEach((d) => hit(T0 + d.at) && play('land'))
    g.imageSmoothingEnabled = false
    g.drawImage(low, 0, 0, LW * 6, LH * 6)

    const step = (a: number) => Math.round(span(e, a, a + 0.12) * 4) / 4
    text(g, 'PLAY FREE IN YOUR BROWSER', OW / 2, 640, { size: 64, font: 'Jersey 15', color: GOLD, align: 'center', ow: 6, spacing: 8, alpha: step(0.4) })
    text(g, 'poke-dice.netlify.app', OW / 2, 790, { size: 150, align: 'center', ow: 10, drop: 10, alpha: step(0.5) })
    if (e >= 0.62) {
      const label = 'discord.gg/XKJQYw3p9'
      const w = textWidth(g, label, 80) + 14 * 7 + 30
      const x = OW / 2 - w / 2
      g.save()
      g.globalAlpha = step(0.62)
      blit(g, chat(), x, 860, 7)
      text(g, label, x + 14 * 7 + 30, 930, { size: 80, ow: 6, color: '#dfe3ff' })
      g.restore()
    }
    text(g, 'Fan-made · non-commercial. Pokémon © Nintendo / Game Freak / Creatures.', OW / 2, 1040, {
      size: 34,
      font: 'Jersey 15',
      color: PALETTE.faint,
      align: 'center',
      ow: 0,
      alpha: step(0.75),
    })
    // The very end fades to black.
    if (e > 1.85) wash(g, '#000000', span(e, 1.85, 2))
  },
}
