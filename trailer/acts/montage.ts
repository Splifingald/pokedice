// Act 3, the big moments (26.5 → 44 s): Rayquaza's raid opening, a Mega Evolution and a Gigantamax, each full screen
// with the game's own line; then four mythical bosses at once (Mew, Celebi, Jirachi, Shaymin) and four raids at once
// (Lugia, Groudon, Palkia, Zacian), each tile framed on its battle with an ink border and its type colour as a rim.
import { gmaxTimeline, megaTimeline } from '@/fx/timelines/forms'
import { legendLook, legendTimeline } from '@/fx/timelines/legend'
import type { PokeType } from '@/engine/types'
import { ACT, hit } from '../lib/clock'
import { cry } from '../lib/audio'
import { GOLD, INK, OH, OW, outBack, rect, span, text, textWidth, TYPE, wash, type G } from '../lib/draw'
import { caption } from '../lib/hud'
import { RaidIntroScene } from '../lib/raidIntro'
import { Run } from '../lib/run'
import { playAt } from '../lib/scene'
import { loadMon, mon } from '../lib/sprites'
import { drawStage, loadPicture, picture, type Box } from '../lib/stage'
import type { Act } from '../main'

const T0 = ACT.montage[0]
const RAY = [0, 4.5] as const
const MEGA = [4.5, 7.5] as const
const GMAX = [7.5, 10.5] as const
const BOSSES = [10.5, 14] as const
const RAIDS = [14, 17.5] as const

const legend = (dex: number, name: string, type: PokeType, level: string) =>
  legendTimeline({ own: mon(6, true), foe: mon(dex), look: legendLook(dex, type), name, level, types: type.toUpperCase() })

const BOSS_LIST: { dex: number; name: string; type: PokeType; pic: string; rim: string }[] = [
  { dex: 151, name: 'MEW', type: 'psychic', pic: 'lair-island', rim: TYPE.psychic },
  { dex: 251, name: 'CELEBI', type: 'grass', pic: 'oldforest', rim: TYPE.grass },
  { dex: 385, name: 'JIRACHI', type: 'steel', pic: 'lair-summit', rim: TYPE.steel },
  { dex: 492, name: 'SHAYMIN', type: 'grass', pic: 'flowers', rim: TYPE.fairy },
]
const RAID_LIST: { dex: number; name: string; rim: string }[] = [
  { dex: 249, name: 'LUGIA', rim: TYPE.flying },
  { dex: 383, name: 'GROUDON', rim: TYPE.ground },
  { dex: 484, name: 'PALKIA', rim: TYPE.water },
  { dex: 888, name: 'ZACIAN', rim: TYPE.fairy },
]

let made: ReturnType<typeof make> | null = null
function make() {
  return {
    ray: new RaidIntroScene(mon(384), 'RAYQUAZA'),
    mega: new Run(
      () => megaTimeline({ own: mon(6, true), foe: mon(149), side: 'own', from: mon(6, true), to: mon(10034, true), die: 'dragon' }),
      { art: true },
    ),
    gmax: new Run(
      () => gmaxTimeline({ own: mon(94, true), foe: mon(143), side: 'own', from: mon(94, true), to: mon(10202, true), die: 'ghost' }),
      { art: true },
    ),
    bosses: BOSS_LIST.map((b) => new Run(() => legend(b.dex, b.name, b.type, 'LV60'), { art: true })),
    raids: RAID_LIST.map((r, i) => new RaidIntroScene(mon(r.dex), r.name, 21 + i * 7)),
  }
}

const QUAD: Box[] = [
  { x: 0, y: 0, w: OW / 2, h: OH / 2 },
  { x: OW / 2, y: 0, w: OW / 2, h: OH / 2 },
  { x: 0, y: OH / 2, w: OW / 2, h: OH / 2 },
  { x: OW / 2, y: OH / 2, w: OW / 2, h: OH / 2 },
]

function frame(g: G, box: Box, rim: string) {
  g.save()
  g.lineWidth = 6
  g.strokeStyle = rim
  g.strokeRect(box.x + 9, box.y + 9, box.w - 18, box.h - 18)
  g.lineWidth = 12
  g.strokeStyle = INK
  g.strokeRect(box.x, box.y, box.w, box.h)
  g.restore()
}

/** A word in a chip where the four tiles meet: what the grid is. */
function gridLabel(g: G, word: string, v: number, from: number) {
  const p = outBack(span(v, from + 0.2, from + 0.4), 1.6)
  if (p <= 0) return
  const w = textWidth(g, word, 64, 'Jersey 25', 4) + 60
  g.save()
  g.translate(OW / 2, OH / 2)
  g.scale(p, p)
  rect(g, -w / 2 - 8, -46, w + 16, 92, INK)
  rect(g, -w / 2, -38, w, 76, GOLD)
  text(g, word, 0, 22, { size: 64, color: INK, ow: 0, align: 'center', spacing: 4 })
  g.restore()
}

export const montage: Act = {
  range: ACT.montage,
  async load() {
    await Promise.all([
      ...['league', 'haunted', ...BOSS_LIST.map((b) => b.pic)].map(loadPicture),
      ...[384, 149, 143, ...BOSS_LIST.map((b) => b.dex), ...RAID_LIST.map((r) => r.dex)].map((d) => loadMon(d)),
      loadMon(6, true),
      loadMon(10034, true),
      loadMon(94, true),
      loadMon(10202, true),
    ])
    made = make()
  },
  render(g, T) {
    const v = T - T0
    const m = made!
    if (v < RAY[1]) {
      // Rayquaza's raid opening, full screen: the alarm, the storm, the reveal, its name and its five bars.
      const layer = m.ray.draw(0.1 + (v - RAY[0]) * 1.2)
      drawStage(g, null, [layer], { x: 160, y: 90, z: 6 })
    } else if (v < MEGA[1]) {
      const layer = playAt(m.mega, v, MEGA[0], 1.2, 1.4)
      drawStage(g, picture('league'), [layer], { x: 112, y: 92, z: 8 })
      caption(g, 'Charizard Mega Evolved into Mega Charizard X!', v, MEGA[0] + 2.15, MEGA[1])
    } else if (v < GMAX[1]) {
      const layer = playAt(m.gmax, v, GMAX[0], 1.4, 1.4)
      drawStage(g, picture('haunted'), [layer], { x: 108, y: 93, z: 8 })
      caption(g, 'Gengar Gigantamaxed!', v, GMAX[0] + 2.1, GMAX[1])
    } else if (v < BOSSES[1]) {
      // Four bosses at once, their entrances a beat apart so the reveals cascade.
      BOSS_LIST.forEach((b, i) => {
        const start = BOSSES[0] + i * 0.12
        const run = m.bosses[i]!
        run.loud = i === 0
        const layer = playAt(run, v, start, 1.9, 0.95)
        drawStage(g, picture(b.pic), [layer], { x: 120, y: 82, z: 4 }, QUAD[i])
        frame(g, QUAD[i]!, b.rim)
        if (hit(T0 + start + (3.2 - 1.9) / 0.95)) cry(b.dex, 0.6)
      })
      gridLabel(g, 'MYTHICAL BOSSES', v, BOSSES[0])
    } else {
      // Four raids at once: each one's opening, offset a little.
      RAID_LIST.forEach((r, i) => {
        const layer = m.raids[i]!.draw(0.6 + Math.max(0, v - RAIDS[0] - i * 0.1) * 1.3, i === 0)
        drawStage(g, null, [layer], { x: 160, y: 90, z: 3 }, QUAD[i])
        frame(g, QUAD[i]!, r.rim)
        if (hit(T0 + RAIDS[0] + i * 0.1 + (2.75 - 0.6) / 1.3)) cry(r.dex, 0.6)
      })
      gridLabel(g, 'RAIDS WITH FRIENDS', v, RAIDS[0])
    }
    if (hit(T0 + RAY[0] + (2.75 - 0.1) / 1.2)) cry(384)
    if (hit(T0 + MEGA[0] + (4.17 - 1.2) / 1.4)) cry(10034)
    if (hit(T0 + GMAX[0] + (4.27 - 1.4) / 1.4)) cry(94)
    // Each big moment opens on a white frame; the last one hands over to the features in white.
    for (const a of [MEGA[0], GMAX[0], BOSSES[0], RAIDS[0]]) if (v >= a && v < a + 2 / 60) wash(g, '#ffffff', 1)
    if (v >= RAIDS[1] - 0.15) wash(g, '#ffffff', span(v, RAIDS[1] - 0.15, RAIDS[1]))
  },
}
