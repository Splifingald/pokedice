// Act 6, the end card (57.5 → 61 s): the title's navy floor with its Poké Balls, the POKÉDICE dice dropping back into
// their crooked row with the gold ring pulsing under them, then the website, the Discord and the fan-made line.
import { canvas, ellipseLine, icon } from '@/fx/pixel'
import { PALETTE } from '@/theme/colors'
import { ACT, hit } from '../lib/clock'
import { play } from '../lib/audio'
import { pokeballBackdrop } from '../lib/backdrop'
import { drawDie, drawShadow, project, type View } from '../lib/cube'
import { GOLD, INK, OW, span, text, textWidth, wash } from '../lib/draw'
import { blit } from '../lib/hud'
import { LH, LK, logoDice, LW } from './title'
import type { Act } from '../main'

const T0 = ACT.end[0]
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
    pokeballBackdrop(low.g, LW, LH, T)
    // The dice drop in, one after another, onto their crooked row.
    const v: View = { tilt: (62 * Math.PI) / 180, cs: 2.2, cx: LW / 2, cy: 118 }
    const dice = logoDice(0, { thrown: false }).map((d, i) => {
      const a = 0.1 + i * 0.05
      const p = span(e, a, a + 0.36)
      const fall = p < 0.7 ? (1 - p / 0.7) ** 2 * 140 : Math.sin(((p - 0.7) / 0.3) * Math.PI) * 7
      return { ...d, pos: [d.pos[0], d.pos[1], d.pos[2] + fall] as const, show: e >= a, landAt: a + 0.25 }
    })
    // The ring under the row, pulsing once a second.
    const ringOn = 0.7
    if (e > ringOn) {
      const c = project(v, [0, 0, 0])
      const pulse = (e - ringOn) % 1
      low.g.globalAlpha = Math.round((1 - pulse) * 4) / 4
      const r = 300 + pulse * 50
      for (const k of [0, 1, 2]) ellipseLine(low.g, c.x, c.y + 8, r + k, (r + k) * 0.17, GOLD)
      low.g.globalAlpha = 1
    }
    for (const d of dice) if (d.show) drawShadow(low.g, v, d, 'rgba(4,6,20,0.5)')
    for (const d of dice) if (d.show) drawDie(low.g, v, { ...d, ring: e > ringOn ? GOLD : null })
    dice.forEach((d) => hit(T0 + d.landAt) && play('land'))
    g.imageSmoothingEnabled = false
    g.drawImage(low, 0, 0, LW * LK, LH * LK)

    const step = (a: number) => Math.round(span(e, a, a + 0.15) * 4) / 4
    text(g, 'PLAY FREE IN YOUR BROWSER', OW / 2, 640, { size: 64, font: 'Jersey 15', color: GOLD, align: 'center', ow: 6, spacing: 8, alpha: step(0.8) })
    text(g, 'poke-dice.netlify.app', OW / 2, 790, { size: 150, align: 'center', ow: 10, drop: 10, alpha: step(1.0) })
    if (e >= 1.2) {
      const label = 'discord.gg/XKJQYw3p9'
      const w = textWidth(g, label, 80) + 14 * 7 + 30
      const x = OW / 2 - w / 2
      g.save()
      g.globalAlpha = step(1.2)
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
      alpha: step(1.4),
    })
    if (e > 3.2) wash(g, '#000000', span(e, 3.2, 3.5))
  },
}
