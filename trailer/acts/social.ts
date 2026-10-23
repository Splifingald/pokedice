// The social media cut (15 s, docs/36 §12): no title; straight into Charmander's two dice (3 + 4 = 7), then
// Charmeleon evolving into Charizard, the Charizard fight (Mewtwo's entrance short, the slow die short), and a
// shorter end card. The same stage shot, dice and readouts as the main trailer.
import { attackTimeline } from '@/fx/timelines/attacks'
import { legendLook, legendTimeline } from '@/fx/timelines/legend'
import { evolveTimeline } from '@/fx/timelines/moments'
import { hit } from '../lib/clock'
import { cry, play } from '../lib/audio'
import { slowLanding, type TrayPlan } from '../lib/dice'
import { INK, OH, OW, outCubic, rect, span, speedLines, TYPE, wash } from '../lib/draw'
import { contactOf, diceAt, faint, fiveBanner, idleAt, shakeAt, STAGE, tray } from '../lib/fight'
import { caption, celebrate, damageSlam, foePlate, ownPlate, valuePops } from '../lib/hud'
import { Run } from '../lib/run'
import { idle, playAt } from '../lib/scene'
import { loadMon, mon } from '../lib/sprites'
import { clampCam, drawStage, loadPicture, picture } from '../lib/stage'
import { drawEnd } from './end'
import type { Act } from '../main'

export const SOCIAL = {
  charmander: [0, 3.8],
  evolution: [3.8, 6.3],
  charizard: [6.3, 12.5],
  end: [12.5, 15],
} as const satisfies Record<string, readonly [number, number]>
export const SOCIAL_FRAMES = 15 * 60

const CHARMANDER = mon(4, true)
const CHARIZARD = mon(6, true)
const BULBASAUR = mon(1)
const MEWTWO = mon(150)

// Charmander (0 → 3.8)
const A = { throw: 0.25, pops: 0.78, damage: 1.15, attack: 1.9, faint: 2.75, white: 3.45 }
const CA = contactOf(A.attack, 0.7, 1.6)
// The evolution (3.8 → 6.3): the game's, from the light gathering, 2.6× its speed.
const E = { from: 3.8, tl: 1.2, speed: 2.6 }
const EVOLVED = E.from + (6.37 - E.tl) / E.speed
// Charizard (6.3 → 12.5)
const Z = { legend: 6.3, idle: 7.1, throw: 7.3, pops: 8.0, pick: 8.3, reroll: 8.6, slowA: 8.75, slowB: 9.95, attack: 11.2, end: 12.5 }
const LAND = slowLanding(Z.reroll, 0.5, Z.slowA, Z.slowB, 0.08)
const CZ = contactOf(Z.attack, 0.7, 1.8)

let runs: ReturnType<typeof makeRuns> | null = null
function makeRuns() {
  return {
    a: new Run(() => idle(CHARMANDER, BULBASAUR, (t) => ({ foe: faint(t, A.faint) })), { art: true }),
    aFire: new Run(() => attackTimeline({ own: CHARMANDER, foe: BULBASAUR, type: 'fire', damage: 7 }), { art: true }),
    evo: new Run(() => evolveTimeline({ from: mon(5), to: mon(6), type: 'fire' })),
    legend: new Run(
      () => legendTimeline({ own: CHARIZARD, foe: MEWTWO, look: legendLook(150, 'psychic'), name: 'MEWTWO', level: 'LV70', types: 'PSYCHIC' }),
      { art: true },
    ),
    z: new Run(() => idle(CHARIZARD, MEWTWO), { art: true }),
    zFire: new Run(() => attackTimeline({ own: CHARIZARD, foe: MEWTWO, type: 'fire', damage: 95 }), { art: true }),
    ink: new Run(() => idle(CHARIZARD, MEWTWO, () => ({ own: { sil: INK }, foe: { sil: INK } }), { bare: true })),
  }
}

const A_DICE: TrayPlan = { fills: [TYPE.fire, TYPE.fire], throws: [{ t: A.throw, values: [3, 4], dur: 0.45 }] }
const Z_DICE: TrayPlan = {
  fills: [TYPE.fire, TYPE.fire, TYPE.fire, TYPE.flying, TYPE.flying],
  throws: [
    { t: Z.throw, values: [5, 5, 5, 5, 2], dur: 0.5 },
    { t: Z.reroll, values: [5], which: [4], dur: 0.5 },
  ],
  picked: { t: Z.pick, which: [4] },
  slow: [4, Z.slowA, Z.slowB, 0.08],
  combo: { t: LAND, which: [0, 1, 2, 3, 4] },
  flash: LAND,
  jump: LAND + 0.05,
}

const charmander: Act = {
  range: SOCIAL.charmander,
  async load() {
    await Promise.all([loadPicture('meadow'), loadPicture('a26'), loadMon(4, true), loadMon(1), loadMon(5), loadMon(6), loadMon(6, true), loadMon(150)])
    runs = makeRuns()
  },
  render(g, u) {
    const r = runs!
    const pic = picture('meadow')
    const attack = u >= A.attack && u < A.faint
    const layer = attack ? playAt(r.aFire, u, A.attack, 0.7, 1.6) : idleAt(r.a, u)
    drawStage(g, pic, [layer], clampCam(STAGE, pic), undefined, { shake: shakeAt(u, CA, 9) })
    if (hit(0.03)) cry(1)
    if (hit(CA)) play('super')
    if (hit(A.faint)) play('faint')
    foePlate(g, { name: 'Bulbasaur', level: 5, hp: 1 - span(u, CA, CA + 0.3), types: ['grass', 'poison'] }, u, -1)
    ownPlate(g, { name: 'Charmander', level: 5, hp: 1, max: 20 }, u, -1)
    if (u >= A.throw && u < A.attack) {
      tray(g, A_DICE, u)
      valuePops(g, [3, 4], diceAt(2), u, A.pops)
      damageSlam(g, 7, 960, 700, u, A.damage, { size: 200 })
    }
    if (u >= A.white) wash(g, '#ffffff', span(u, A.white, SOCIAL.charmander[1]))
  },
}

const evolution: Act = {
  range: SOCIAL.evolution,
  load: async () => {},
  render(g, u) {
    const layer = playAt(runs!.evo, u, E.from, E.tl, E.speed)
    drawStage(g, null, [layer], { x: 120, y: 82, z: 8 })
    if (u < E.from + 0.1) wash(g, '#ffffff', 1 - span(u, E.from, E.from + 0.1))
    caption(g, 'What? Charmeleon is evolving!', u, E.from + 0.1, EVOLVED - 0.05)
    caption(g, 'Charmeleon evolved into Charizard!', u, EVOLVED, SOCIAL.evolution[1])
    if (hit(EVOLVED + 0.03)) cry(6)
  },
}

const charizard: Act = {
  range: SOCIAL.charizard,
  load: async () => {},
  render(g, u) {
    const r = runs!
    const pic = picture('a26')
    if (u < Z.idle) {
      // Mewtwo's entrance, from its rising silhouette to its name, twice the game's speed.
      r.legend.at(2.4 + (u - Z.legend) * 2, 2.4)
      drawStage(g, pic, [r.legend.draw()], STAGE)
      if (hit(Z.legend + (3.2 - 2.4) / 2)) cry(150)
      return
    }
    const slow = u >= Z.slowA && u < LAND
    const layer = u >= Z.attack ? playAt(r.zFire, u, Z.attack, 0.7, 1.8) : idleAt(r.z, u)
    drawStage(g, pic, [layer], clampCam(STAGE, pic), undefined, { shake: shakeAt(u, CZ, 14, 0.4) })
    if (hit(Z.idle + 0.02)) cry(6)
    if (hit(CZ)) play('super')
    if (slow) {
      const beat = Math.max(0, Math.sin((u - Z.slowA) * Math.PI * 2.4)) ** 6
      wash(g, '#0b0f24', 0.55 * span(u, Z.slowA, Z.slowA + 0.2) + 0.15 * beat)
    }
    foePlate(g, { name: 'Mewtwo', level: 70, hp: 1 - span(u, CZ + 0.1, CZ + 0.25), types: ['psychic'] }, u, Z.idle)
    if (!slow) ownPlate(g, { name: 'Charizard', level: 68, hp: 1, max: 210 }, u, Z.idle + 0.03)
    caption(g, 'Tap dice to throw them again.', u, Z.pick - 0.15, Z.reroll + 0.1)
    if (u >= Z.throw && u < Z.attack) {
      const zoom = slow
        ? 1 + 1.6 * outCubic(span(u, Z.slowA, Z.slowA + 0.4))
        : u >= LAND
          ? 1 + 1.6 * (1 - outCubic(span(u, LAND, LAND + 0.2)))
          : 1
      celebrate(g, u, LAND)
      tray(g, Z_DICE, u, zoom, 4)
      if (u >= LAND - 0.02 && u < LAND + 0.1) speedLines(g, OW / 2, 900, u, { color: '#ffbe2e', inner: 260, a: 0.6 })
      if (u < Z.reroll) valuePops(g, [5, 5, 5, 5, 2], diceAt(5), u, Z.pops)
      else if (u >= LAND + 0.15) valuePops(g, [5, 5, 5, 5, 5], diceAt(5), u, LAND + 0.15)
      fiveBanner(g, u, LAND, hit)
      damageSlam(g, 95, 960, 640, u, LAND + 0.5, { size: 230, shake: 16 })
    }
    if (u >= CZ && u < CZ + 2 / 60) wash(g, '#ffffff', 1)
    else if (u >= CZ + 2 / 60 && u < CZ + 7 / 60) {
      rect(g, 0, 0, OW, OH, '#ffffff')
      r.ink.at(u)
      drawStage(g, null, [r.ink.draw()], clampCam({ x: 140, y: 88, z: 10 }, pic), undefined, { ground: '#ffffff' })
      speedLines(g, 1300, 420, u, { color: INK, inner: 420, a: 1, n: 64 })
    }
    if (u >= Z.end - 0.08) wash(g, '#000000', 1)
  },
}

const end: Act = {
  range: SOCIAL.end,
  load: async () => {},
  render: (g, u) =>
    drawEnd(g, u - SOCIAL.end[0], SOCIAL.end[0], {
      dice: 0.05,
      stagger: 0.03,
      ring: 0.45,
      tagline: 0.35,
      url: 0.45,
      badges: [0.65, 0.75],
      footer: 0.9,
      fade: [2.3, 2.5],
    }),
}

export const SOCIAL_ACTS = [charmander, evolution, charizard, end]
