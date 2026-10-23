// Act 3, the montage (10 → 15 s): the screen fills with battles. One clip, then two, four, eight, splitting on the beat,
// every tile framed on the battle area with an ink border and its star's type colour as a rim: the Rayquaza raid's
// opening, Mega Charizard X, Gigantamax Gengar, Groudon's raid, the Mew and Celebi boss fights, Lugia, a trade. The
// tiles flash gold one after another like a combo, then the white takes the screen. No title.
import { gmaxTimeline, megaTimeline } from '@/fx/timelines/forms'
import { legendLook, legendTimeline } from '@/fx/timelines/legend'
import { tradeTimeline } from '@/fx/timelines/trade'
import type { PokeType } from '@/engine/types'
import { ACT } from '../lib/clock'
import { GOLD, INK, OH, OW, rect, span, TYPE, wash, type G } from '../lib/draw'
import { RaidIntroScene } from '../lib/raidIntro'
import { Run } from '../lib/run'
import { playAt } from '../lib/scene'
import { loadMon, mon } from '../lib/sprites'
import { clampCam, drawStage, loadPicture, picture, type Box } from '../lib/stage'
import type { Act } from '../main'

const T0 = ACT.montage[0]

interface Clip {
  appear: number
  rim: string
  pic: string | null
  from: number
  speed: number
  focus: { x: number; y: number }
  run?: Run
  raid?: RaidIntroScene
}

type Key = 'G' | 'E' | 'F' | 'D' | 'A' | 'B' | 'C' | 'H'
let clips: Record<Key, Clip> | null = null

const legend = (dex: number, name: string, type: PokeType) =>
  legendTimeline({
    own: mon(6, true),
    foe: mon(dex),
    look: legendLook(dex, type),
    name,
    level: name === 'MEW' || name === 'CELEBI' ? 'LV60' : 'LV70',
    types: type.toUpperCase(),
  })

function makeClips() {
  return {
    G: { appear: 0, rim: TYPE.dragon, pic: null, from: 0.35, speed: 1.8, focus: { x: 160, y: 90 }, raid: new RaidIntroScene(mon(384), 'RAYQUAZA') },
    E: {
      appear: 1,
      rim: TYPE.fire,
      pic: 'league',
      from: 2.7,
      speed: 1.7,
      focus: { x: 80, y: 108 },
      run: new Run(
        () => megaTimeline({ own: mon(6, true), foe: mon(149), side: 'own', from: mon(6, true), to: mon(10034, true), die: 'dragon' }),
        { art: true },
      ),
    },
    F: {
      appear: 2,
      rim: TYPE.ghost,
      pic: 'haunted',
      from: 3.0,
      speed: 1.6,
      focus: { x: 92, y: 92 },
      run: new Run(
        () => gmaxTimeline({ own: mon(94, true), foe: mon(143), side: 'own', from: mon(94, true), to: mon(10202, true), die: 'ghost' }),
        { art: true },
      ),
    },
    D: { appear: 2, rim: TYPE.ground, pic: 'lair-volcano', from: 2.2, speed: 1.6, focus: { x: 140, y: 82 }, run: new Run(() => legend(383, 'GROUDON', 'ground'), { art: true }) },
    A: { appear: 3, rim: TYPE.psychic, pic: 'lair-island', from: 2.6, speed: 1.5, focus: { x: 140, y: 82 }, run: new Run(() => legend(151, 'MEW', 'psychic'), { art: true }) },
    B: { appear: 3.08, rim: TYPE.flying, pic: 'lair-sea', from: 2.6, speed: 1.5, focus: { x: 140, y: 80 }, run: new Run(() => legend(249, 'LUGIA', 'flying'), { art: true }) },
    C: { appear: 3.16, rim: TYPE.grass, pic: 'oldforest', from: 2.6, speed: 1.5, focus: { x: 140, y: 82 }, run: new Run(() => legend(251, 'CELEBI', 'grass'), { art: true }) },
    H: {
      appear: 3.24,
      rim: GOLD,
      pic: null,
      from: 2.45,
      speed: 1.2,
      focus: { x: 120, y: 80 },
      run: new Run(() => tradeTimeline({ give: mon(25), get: mon(94, false, true), giveBall: 'poke', getBall: 'great', shiny: true })),
    },
  } satisfies Record<string, Clip>
}

type Tile = [Key, Box]
const HALF_W = OW / 2
const HALF_H = OH / 2
const Q = OW / 4

function layout(v: number): Tile[] {
  if (v < 1) return [['G', { x: 0, y: 0, w: OW, h: OH }]]
  if (v < 2)
    return [
      ['G', { x: 0, y: 0, w: HALF_W, h: OH }],
      ['E', { x: HALF_W, y: 0, w: HALF_W, h: OH }],
    ]
  if (v < 3)
    return [
      ['G', { x: 0, y: 0, w: HALF_W, h: HALF_H }],
      ['E', { x: HALF_W, y: 0, w: HALF_W, h: HALF_H }],
      ['F', { x: 0, y: HALF_H, w: HALF_W, h: HALF_H }],
      ['D', { x: HALF_W, y: HALF_H, w: HALF_W, h: HALF_H }],
    ]
  const order = ['G', 'E', 'F', 'D', 'A', 'B', 'C', 'H'] as const
  return order.map((k, i): Tile => [k, { x: (i % 4) * Q, y: Math.floor(i / 4) * HALF_H, w: Q, h: HALF_H }])
}

function drawTile(g: G, v: number, key: Key, box: Box, loud: boolean) {
  const c = clips![key]
  if (v < c.appear) {
    rect(g, box.x, box.y, box.w, box.h, INK)
    return
  }
  if (c.raid) {
    // The raid's own 320×180 scene: it fills a tile at 6, 3 or 1.5 screen pixels per art pixel.
    const z = box.h / 180
    const layer = c.raid.draw(c.from + (v - c.appear) * c.speed, loud)
    drawStage(g, null, [layer], { x: 160, y: 90, z }, box)
  } else if (c.run) {
    c.run.loud = loud
    const pic = c.pic ? picture(c.pic) : null
    const z = box.h >= OH ? 6 : box.w >= HALF_W ? 4 : c.pic ? 3 : 4
    const layer = playAt(c.run, v, c.appear, c.from, c.speed)
    drawStage(g, pic, [layer], clampCam({ ...c.focus, z }, pic, box), box)
  }
  // A new tile comes in white.
  const age = v - c.appear
  if (age >= 0 && age < 0.1) {
    g.save()
    g.globalAlpha = Math.round((1 - age / 0.1) * 4) / 4
    rect(g, box.x, box.y, box.w, box.h, '#ffffff')
    g.restore()
  }
}

function frame(g: G, box: Box, rim: string, thick = 4) {
  g.save()
  g.lineWidth = thick
  g.strokeStyle = rim
  g.strokeRect(box.x + 6 + thick / 2, box.y + 6 + thick / 2, box.w - 12 - thick, box.h - 12 - thick)
  g.lineWidth = 12
  g.strokeStyle = INK
  g.strokeRect(box.x, box.y, box.w, box.h)
  g.restore()
}

export const montage: Act = {
  range: ACT.montage,
  async load() {
    await Promise.all([
      ...['league', 'haunted', 'lair-volcano', 'lair-island', 'lair-sea', 'oldforest'].map(loadPicture),
      loadMon(384),
      loadMon(6, true),
      loadMon(10034, true),
      loadMon(149),
      loadMon(94, true),
      loadMon(10202, true),
      loadMon(143),
      loadMon(383),
      loadMon(151),
      loadMon(249),
      loadMon(251),
      loadMon(25),
      loadMon(94, false, true),
    ])
    clips = makeClips()
  },
  render(g, T) {
    const v = T - T0
    const tiles = layout(v)
    // Sound: the big tile, then the two newest; the eight-tile grid leaves it to the music.
    const loudKeys: Key[] = v < 1 ? ['G'] : v < 2 ? ['G', 'E'] : v < 3 ? ['G', 'F', 'D'] : []
    for (const [k, box] of tiles) drawTile(g, v, k, box, loudKeys.includes(k))
    tiles.forEach(([k, box], i) => {
      const flashAt = 4.5 + i * 0.04
      const gold = v >= flashAt && v < flashAt + 0.14
      frame(g, box, gold ? GOLD : clips![k].rim, gold ? 18 : 4)
    })
    if (v >= 4.82) wash(g, '#ffffff', span(v, 4.82, 4.98))
  },
}
