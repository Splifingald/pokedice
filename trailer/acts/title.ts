// Act 1, the title (0 → 4 s): eight pixel-art dice thrown onto a dark floor patterned with Poké Balls roll right to
// left and stop, a little crooked, on the letters P O K É D I C E, under a still camera. The gold combo ring, a long
// hold on the word with "Roll · Battle · Catch" under it, then a side swap into the first fight.
import { canvas, ellipseLine } from '@/fx/pixel'
import { ACT, hit } from '../lib/clock'
import { play } from '../lib/audio'
import { pokeballBackdrop } from '../lib/backdrop'
import { drawDie, drawShadow, FACES, project, restOn, throwAt, type DieDraw, type Throw, type View } from '../lib/cube'
import { GOLD, inOut, OH, OW, span, text, TYPE, wash } from '../lib/draw'
import { journey } from './journey'
import type { Act } from '../main'

// Twice the art resolution of the stage acts (640×360 shown ×3): the turning letters step half as coarsely.
export const LW = 640
export const LH = 360
export const LK = 3
const low = canvas(LW, LH)

export const LETTERS = ['P', 'O', 'K', 'É', 'D', 'I', 'C', 'E'] as const
export const FILLS = [TYPE.fire, TYPE.water, TYPE.grass, TYPE.electric, TYPE.psychic, TYPE.ice, TYPE.dragon, TYPE.fairy]
export const SIZE = 28
const GAP = 6
// Thrown, not typeset: each die's turn and its step off the line (world units).
const YAW = [0.08, -0.05, 0.1, -0.08, 0.03, -0.1, 0.06, -0.04]
const OFF = [1.5, -1, 0.5, -2, 1, -0.5, 2, -1.5]

/** The eight dice at rest, or rolling in: where each one is at time t (seconds since the throw). */
export function logoDice(t: number, { thrown = true, dur = 1.15 } = {}): (DieDraw & { landings: number[] })[] {
  return LETTERS.map((letter, i) => {
    const x = (i - 3.5) * (SIZE + GAP)
    const faces: (number | string)[] = FACES.map((f) => f.pips)
    faces[0] = letter
    const th: Throw = {
      from: [x + 200 + i * 12, OFF[i]! - 140 - (7 - i) * 5, 0],
      to: [x, OFF[i]!, 0],
      t0: i * 0.04,
      t1: i * 0.04 + dur + (i === 7 ? 0.05 : 0),
      rest: restOn(0, YAW[i]!),
      spin: 10 + (i % 3) * 3,
      spinAxis: [0.2 + (i % 2) * 0.5, 0.6, 1],
      arcs: [76 + (i % 3) * 12, 24 - (i % 2) * 6, 7],
      wobble: i === 7 ? 0.5 : 0,
      size: SIZE,
    }
    const at = thrown ? throwAt(th, t) : { pos: [x, OFF[i]!, SIZE / 2] as const, R: th.rest, landings: [] }
    return { pos: at.pos, R: at.R, fill: FILLS[i]!, faces, size: SIZE, landings: at.landings }
  })
}

/** The dice row on the dark floor at time t (seconds since the throw), on the low-res canvas. */
export function drawLogoScene(t: number, v: View, bgT: number, { combo = -1, flash = -1, thrown = true } = {}) {
  const g = low.g
  pokeballBackdrop(g, LW, LH, bgT)
  const dice = logoDice(t, { thrown })
  for (const d of dice) drawShadow(g, v, d, 'rgba(4,6,20,0.5)')
  // Smears behind the dice still in the air: two ghost frames.
  if (thrown)
    for (const back of [2 / 60, 1 / 60]) {
      const prev = logoDice(t - back)
      g.globalAlpha = 0.3
      prev.forEach((d, i) => {
        if (dice[i]!.pos[2] > SIZE * 0.9 && t - back > 0) drawDie(g, v, d)
      })
      g.globalAlpha = 1
    }
  const order = dice.map((d, i) => ({ d, i })).sort((a, b) => b.d.pos[1] - a.d.pos[1])
  for (const { d } of order)
    drawDie(g, v, {
      ...d,
      ring: combo >= 0 && t >= combo ? GOLD : null,
      flash: flash >= 0 && t >= flash && t < flash + 2 / 60 ? 1 : 0,
    })
  return { low, dice }
}

const T0 = ACT.title[0]
const COMBO = 1.5
const SWAP = 3.6

export const title: Act = {
  range: ACT.title,
  load: async () => {},
  render(g, T) {
    const t = T - T0
    // The side swap: the title slides out to the left as the first fight, already in its still shot, slides in.
    const swap = Math.round(inOut(span(t, SWAP, ACT.title[1])) * OW)
    g.save()
    g.translate(-swap, 0)
    drawTitle(g, t)
    g.restore()
    if (swap > 0) {
      g.save()
      g.translate(OW - swap, 0)
      g.beginPath()
      g.rect(0, 0, OW, OH)
      g.clip()
      journey.render(g, ACT.journey[0])
      g.restore()
    }
    if (t < 0.12) wash(g, '#000000', 1 - t / 0.12)
  },
}

function drawTitle(g: CanvasRenderingContext2D, t: number) {
  // A still camera: only the dice move.
  const v: View = { tilt: (60 * Math.PI) / 180, cs: 2.15, cx: LW / 2, cy: LH * 0.52 }
  const { dice } = drawLogoScene(t, v, t, { combo: COMBO, flash: COMBO })
  // The combo: a gold ring rushes out over the floor, in art pixels.
  if (t >= COMBO && t < COMBO + 0.6) {
    const p = span(t, COMBO, COMBO + 0.6)
    const c = project(v, [0, 0, 0])
    const r = 60 + 560 * p
    low.g.globalAlpha = Math.round((1 - p) * 4) / 4
    for (const k of [0, 1, 2]) ellipseLine(low.g, c.x, c.y, r + k, (r + k) * Math.sin(v.tilt), GOLD)
    low.g.globalAlpha = 1
  }
  if (hit(T0 + 0.02)) play('rattle')
  dice.forEach((d) => d.landings.slice(0, 2).forEach((l) => hit(T0 + l) && play('land')))
  if (hit(T0 + COMBO)) play('levelup')
  g.imageSmoothingEnabled = false
  g.drawImage(low, 0, 0, LW * LK, LH * LK)
  // What the game is, in three words, under the row for the long hold.
  if (t >= 2.0) {
    const a = Math.round(span(t, 2.0, 2.3) * 4) / 4
    text(g, 'Roll · Battle · Catch', OW / 2, OH * 0.74, { size: 96, font: 'Jersey 15', align: 'center', ow: 7, alpha: a, spacing: 8 })
  }
}
