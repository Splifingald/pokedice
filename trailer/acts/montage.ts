// Act 3, the big moments (26.5 → 44 s): Rayquaza's raid opening, a Mega Evolution and a Gigantamax, each full screen
// with the game's own line; then four mythical bosses at once (Mew, Celebi, Jirachi, Manaphy) and four raids at once
// (Lugia, Groudon, Palkia, Zacian), each tile framed on its battle with an ink border and its type colour as a rim.
// Every legend comes in by its own cinematic, as in the game (docs/53): the raids' scenes under the raid intro's
// words, the bosses' on the battle stage with their name card.
import { gmaxTimeline, megaTimeline } from '@/fx/timelines/forms'
import { legendLook } from '@/fx/timelines/legend'
import { BOSS_CINEMAS, RAID_CINEMAS } from '@/fx/timelines/cinema'
import type { PokeType } from '@/engine/types'
import { ACT, hit } from '../lib/clock'
import { cry } from '../lib/audio'
import { GOLD, INK, outBack, rect, span, text, textWidth, TYPE, wash, type G } from '../lib/draw'
import { caption } from '../lib/hud'
import { RaidIntro } from '../lib/raidIntro'
import { Run } from '../lib/run'
import { playAt } from '../lib/scene'
import { loadMon, mon } from '../lib/sprites'
import { F, stageEdge, surround } from '../lib/frame'
import { drawStage, loadPicture, picture, type Box, type Cam } from '../lib/stage'
import type { Act } from '../main'

const T0 = ACT.montage[0]
const RAY = [0, 4.5] as const
const MEGA = [4.5, 7.5] as const
const GMAX = [7.5, 10.5] as const
const BOSSES = [10.5, 14] as const
const RAIDS = [14, 17.5] as const

/** A mythical boss's own entrance on the battle stage (docs/53), Charizard sent out after its name card. */
const bossEntrance = (dex: number, name: string, type: PokeType, level: string) =>
  BOSS_CINEMAS[dex]!.makeBattle({
    own: mon(6, true),
    foe: mon(dex),
    look: legendLook(dex, type),
    name,
    level,
    types: type.toUpperCase(),
  })
// Each boss's entrance from 2.5 s before its reveal, 1.25× its speed: the reveal 2 s into the grid, its card after.
const BOSS_LEAD = 2.5
const BOSS_SPEED = 1.25
// Rayquaza's from 2.2 s of screen time before its reveal (on the music's crash), 1.1× its speed; the four raids' from
// 2 s of their own before, 1.2×.
const RAY_SPEED = 1.1
const RAY_LEAD = 2.2
const RAID_LEAD = 2
const RAID_SPEED = 1.2

const BOSS_LIST: { dex: number; name: string; type: PokeType; pic: string; rim: string }[] = [
  { dex: 151, name: 'MEW', type: 'psychic', pic: 'lair-island', rim: TYPE.psychic },
  { dex: 251, name: 'CELEBI', type: 'grass', pic: 'oldforest', rim: TYPE.grass },
  { dex: 385, name: 'JIRACHI', type: 'steel', pic: 'lair-summit', rim: TYPE.steel },
  { dex: 490, name: 'MANAPHY', type: 'water', pic: 'beach', rim: TYPE.water },
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
    // Full screen at ×4 (the size the game gives it on a 1080p screen), or the portrait stage's window at ×4.
    ray: F.portrait ? new RaidIntro(384, 'RAYQUAZA', 270, 200) : new RaidIntro(384, 'RAYQUAZA', 480, 270),
    mega: new Run(
      () => megaTimeline({ own: mon(6, true), foe: mon(149), side: 'own', from: mon(6, true), to: mon(10034, true), die: 'dragon' }),
      { art: true },
    ),
    gmax: new Run(
      () => gmaxTimeline({ own: mon(94, true), foe: mon(143), side: 'own', from: mon(94, true), to: mon(10202, true), die: 'ghost' }),
      { art: true },
    ),
    bosses: BOSS_LIST.map((b) => new Run(() => bossEntrance(b.dex, b.name, b.type, 'LV60'), { art: true })),
    // A tile at ×3.
    raids: RAID_LIST.map((r) => new RaidIntro(r.dex, r.name, F.grid.w / 6, F.grid.h / 6)),
  }
}

/** A grid's four tiles (the whole frame in landscape, under the header in portrait). */
function quads(grid: Box): Box[] {
  const { x, y, w, h } = grid
  return [
    { x, y, w: w / 2, h: h / 2 },
    { x: x + w / 2, y, w: w / 2, h: h / 2 },
    { x, y: y + h / 2, w: w / 2, h: h / 2 },
    { x: x + w / 2, y: y + h / 2, w: w / 2, h: h / 2 },
  ]
}

/** A full-screen moment's camera: landscape's, or the portrait stage's whole width at ×5. */
const shot = (land: Cam, tall: Cam = { x: 120, y: 80, z: 5 }) => (F.portrait ? tall : land)

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
function gridLabel(g: G, grid: Box, word: string, v: number, from: number) {
  const p = outBack(span(v, from + 0.2, from + 0.4), 1.6)
  if (p <= 0) return
  const w = textWidth(g, word, 64, 'Jersey 25', 4) + 60
  g.save()
  g.translate(grid.x + grid.w / 2, grid.y + grid.h / 2)
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
      // The other Pokémon a cinematic shows.
      ...[384, ...RAID_LIST.map((r) => r.dex)].flatMap((d) => RAID_CINEMAS[d]?.sprites ?? []).map(([d, sh]) => loadMon(d, false, sh)),
      ...BOSS_LIST.flatMap((b) => BOSS_CINEMAS[b.dex]?.sprites ?? []).map(([d, sh]) => loadMon(d, false, sh)),
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
    surround(g, T)
    if (v < RAY[1]) {
      // Rayquaza's raid opening, full screen: its cinematic at Sky Pillar, then its name and its three bars.
      const from = m.ray.reveal - RAY_LEAD * RAY_SPEED
      const layer = m.ray.draw(from + (v - RAY[0]) * RAY_SPEED, from)
      drawStage(g, null, [layer], { x: m.ray.w / 2, y: m.ray.h / 2, z: 4 }, F.stage)
      stageEdge(g)
    } else if (v < MEGA[1]) {
      const layer = playAt(m.mega, v, MEGA[0], 1.2, 1.4)
      // Centred on the stage: the timeline's dimming covers the whole frame.
      drawStage(g, picture('league'), [layer], shot({ x: 120, y: 83, z: 8 }), F.stage)
      stageEdge(g)
      caption(g, 'Charizard Mega Evolved into Mega Charizard X!', v, MEGA[0] + 2.15, MEGA[1])
    } else if (v < GMAX[1]) {
      const layer = playAt(m.gmax, v, GMAX[0], 1.4, 1.4)
      drawStage(g, picture('haunted'), [layer], shot({ x: 120, y: 88, z: 8 }), F.stage)
      stageEdge(g)
      caption(g, 'Gengar Gigantamaxed!', v, GMAX[0] + 2.1, GMAX[1])
    } else if (v < BOSSES[1]) {
      // Four bosses at once, their entrances a beat apart so the reveals cascade.
      const quad = quads(F.bossGrid)
      BOSS_LIST.forEach((b, i) => {
        const start = BOSSES[0] + i * 0.12
        const run = m.bosses[i]!
        run.loud = i === 0
        const reveal = BOSS_CINEMAS[b.dex]!.reveal
        const layer = playAt(run, v, start, reveal - BOSS_LEAD, BOSS_SPEED)
        drawStage(g, picture(b.pic), [layer], { x: 120, y: 82, z: F.gridZoom }, quad[i])
        frame(g, quad[i]!, b.rim)
        if (hit(T0 + start + BOSS_LEAD / BOSS_SPEED)) cry(b.dex, 0.6)
      })
      gridLabel(g, F.bossGrid, 'MYTHICAL BOSSES', v, BOSSES[0])
    } else {
      // Four raids at once: each one's opening, offset a little.
      const quad = quads(F.grid)
      RAID_LIST.forEach((r, i) => {
        const tile = m.raids[i]!
        const from = tile.reveal - RAID_LEAD
        const layer = tile.draw(from + Math.max(0, v - RAIDS[0] - i * 0.1) * RAID_SPEED, from, i === 0)
        drawStage(g, null, [layer], { x: tile.w / 2, y: tile.h / 2, z: 3 }, quad[i])
        frame(g, quad[i]!, r.rim)
        if (hit(T0 + RAIDS[0] + i * 0.1 + RAID_LEAD / RAID_SPEED)) cry(r.dex, 0.6)
      })
      gridLabel(g, F.grid, 'RAIDS WITH FRIENDS', v, RAIDS[0])
    }
    if (hit(T0 + RAY[0] + RAY_LEAD)) cry(384)
    if (hit(T0 + MEGA[0] + (4.17 - 1.2) / 1.4)) cry(10034)
    if (hit(T0 + GMAX[0] + (4.27 - 1.4) / 1.4)) cry(94)
    // Each big moment opens on a white frame; the last one hands over to the features in white.
    for (const a of [MEGA[0], GMAX[0], BOSSES[0], RAIDS[0]]) if (v >= a && v < a + 2 / 60) wash(g, '#ffffff', 1)
    if (v >= RAIDS[1] - 0.15) wash(g, '#ffffff', span(v, RAIDS[1] - 0.15, RAIDS[1]))
  },
}
