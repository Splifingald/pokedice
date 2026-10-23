// Act 2, the hero journey (4 → 26.5 s): three fights, each bigger than the last, framed close on the stage with the
// dice thrown over its bottom. No formula on screen: each die's value pops up, the combo's chip appears, the damage
// slams in, and the numbers are simple enough to add up at a glance. Charmander's two dice (3 + 4 = 7), the whole
// evolution into Charmeleon, its three dice with a pair against a trainer's Scyther, Mewtwo's entrance, then
// Charizard's five dice — three Fire, two Flying — a hand picking the 2 and the 3 and pressing REROLL, the two turning
// in slow motion onto five 5s, a celebration, the biggest hit.
import { attackTimeline } from '@/fx/timelines/attacks'
import { legendLook, legendTimeline } from '@/fx/timelines/legend'
import { evolveTimeline } from '@/fx/timelines/moments'
import { ACT, hit } from '../lib/clock'
import { cry, play } from '../lib/audio'
import {
  bigRoll,
  bigRollBusy,
  bigRollLand,
  contactOf,
  diceAt,
  faint,
  flameWipe,
  idleAt,
  shakeAt,
  tray,
  type BigRoll,
} from '../lib/fight'
import type { TrayPlan } from '../lib/dice'
import { INK, OH, OW, outBack, rect, span, speedLines, TYPE, wash, type G } from '../lib/draw'
import { blit, boulderBadge, caption, comboChip, damageSlam, foePlate, ownPlate, valuePops } from '../lib/hud'
import { Run } from '../lib/run'
import { idle, playAt } from '../lib/scene'
import { loadMon, mon } from '../lib/sprites'
import { F, stageEdge, surround } from '../lib/frame'
import { clampCam, drawStage, loadPicture, picture } from '../lib/stage'
import type { Act } from '../main'

const T0 = ACT.journey[0]

const CHARMANDER = mon(4, true)
const CHARMELEON = mon(5, true)
const CHARIZARD = mon(6, true)
const BULBASAUR = mon(1)
const SCYTHER = mon(123)
const MEWTWO = mon(150)

// The beats, in seconds from the act's start.
const F1 = { throw: 0.7, pops: 1.2, damage: 1.65, attack: 2.25, faint: 3.15, level: 3.6, white: 4.6 }
// The evolution: the game's, from the silhouette's morph on, 3× its speed (1.5 s).
const EVO = { from: 5, to: 6.5, tl: 2.9, speed: 3 }
const EVOLVED = EVO.from + (6.37 - EVO.tl) / EVO.speed
const F2 = { cut: 6.5, strike: 6.7, throw: 7.5, pops: 8.05, combo: 8.45, damage: 8.85, attack: 9.9, faint: 10.6, burn: 11.25 }
const F3 = { legend: 11.5, reverse: 13.3, attack: 20.1, end: 21 }
const ROLL_DICE = { throw: 14.1, pops: 14.8, taps: [15.45, 15.85] as [number, number], press: 16.3, slowA: 16.5, slowB: 17.6 }
const LAND = bigRollLand(ROLL_DICE)
// The five 5s held close for a second, then the camera eases back and the damage lands.
const ROLL: BigRoll = { ...ROLL_DICE, out: LAND + 1.1, damage: LAND + 1.5 }

const C1 = contactOf(F1.attack, 0.7, 1.6)
const C2own = contactOf(F2.strike, 1.2, 1.4, 1.67)
const C2 = contactOf(F2.attack, 0.7, 1.6)
const C3 = contactOf(F3.attack, 0.7, 1.6)

let runs: ReturnType<typeof makeRuns> | null = null
function makeRuns() {
  return {
    f1idle: new Run(
      () =>
        idle(CHARMANDER, BULBASAUR, (t) => ({
          foe: faint(t, F1.faint),
          own: t > F1.level ? { flash: Math.round(span(t, F1.level, F1.white) * 4) / 4 } : {},
        })),
      { art: true },
    ),
    f1fire: new Run(() => attackTimeline({ own: CHARMANDER, foe: BULBASAUR, type: 'fire', damage: 7 }), { art: true }),
    evo: new Run(() => evolveTimeline({ from: mon(4), to: mon(5), type: 'fire' })),
    f2idle: new Run(() => idle(CHARMELEON, SCYTHER, (t) => ({ foe: faint(t, F2.faint) })), { art: true }),
    f2bug: new Run(() => attackTimeline({ own: CHARMELEON, foe: SCYTHER, by: 'foe', type: 'bug', damage: 9 }), { art: true }),
    f2fire: new Run(() => attackTimeline({ own: CHARMELEON, foe: SCYTHER, type: 'fire', damage: 14 }), { art: true }),
    f3legend: new Run(
      () =>
        legendTimeline({
          own: CHARIZARD,
          foe: MEWTWO,
          look: legendLook(150, 'psychic'),
          name: 'MEWTWO',
          level: 'LV70',
          types: 'PSYCHIC',
        }),
      { art: true },
    ),
    f3idle: new Run(() => idle(CHARIZARD, MEWTWO), { art: true }),
    f3fire: new Run(() => attackTimeline({ own: CHARIZARD, foe: MEWTWO, type: 'fire', damage: 95 }), { art: true }),
    f3ink: new Run(() => idle(CHARIZARD, MEWTWO, () => ({ own: { sil: INK }, foe: { sil: INK } }), { bare: true })),
  }
}

// ---------------------------------------------------------------- the dice of each fight
// Charmander's first roll: two dice, 3 + 4 = 7.
const F1_DICE: TrayPlan = {
  fills: [TYPE.fire, TYPE.fire],
  throws: [{ t: F1.throw, values: [3, 4], dur: 0.5 }],
}
// Charmeleon's: three dice, a pair of 5s — 5 + 5 + 2, and the pair's +2: 14.
const F2_DICE: TrayPlan = {
  fills: [TYPE.fire, TYPE.fire, TYPE.normal],
  throws: [{ t: F2.throw, values: [5, 5, 2], dur: 0.5 }],
  combo: { t: F2.combo, which: [0, 1] },
}
// ---------------------------------------------------------------- fight 1: Charmander vs Bulbasaur (0 → 5)
function fight1(g: G, u: number) {
  const r = runs!
  const pic = picture('meadow')
  // One still shot of the whole stage: the action moves, the camera doesn't.
  const attack = u >= F1.attack && u < F1.faint
  const layer = attack ? playAt(r.f1fire, u, F1.attack, 0.7, 1.6) : idleAt(r.f1idle, u)
  surround(g, T0 + u)
  drawStage(g, pic, [layer], clampCam(F.cam, pic, F.stage), F.stage, { shake: shakeAt(u, C1, 9) })
  stageEdge(g)
  if (hit(T0 + 0.05)) cry(1)
  if (hit(T0 + C1)) play('super')
  if (hit(T0 + F1.faint)) play('faint')
  if (hit(T0 + F1.level)) play('levelup')
  foePlate(g, { name: 'Bulbasaur', level: 5, hp: 1 - span(u, C1, C1 + 0.3), types: ['grass', 'poison'] }, u, 0)
  ownPlate(g, { name: 'Charmander', level: u >= F1.level ? 16 : 5, hp: 1, max: u >= F1.level ? 46 : 20 }, u, 0.04)
  caption(g, 'What will Charmander do?', u, 0.3, F1.throw + 0.6)
  caption(g, 'Charmander grew to Lv.16!', u, F1.level, F1.white)
  if (u >= F1.throw && u < F1.attack) {
    tray(g, F1_DICE, u)
    valuePops(g, [3, 4], diceAt(2), u, F1.pops)
    damageSlam(g, 7, F.damageSmall.x, F.damageSmall.y, u, F1.damage, { size: 200 })
  }
  if (u >= F1.white) wash(g, '#ffffff', span(u, F1.white, F1.white + 0.35))
}

// ---------------------------------------------------------------- the evolution (5 → 8)
function evolution(g: G, u: number) {
  // The morph, quick: the silhouette changing, the burst, Charmeleon standing in its light.
  const layer = playAt(runs!.evo, u, EVO.from, EVO.tl, EVO.speed)
  surround(g, T0 + u)
  drawStage(g, null, [layer], { x: 120, y: F.portrait ? 80 : 82, z: F.cam.z }, F.stage)
  stageEdge(g)
  if (u < EVO.from + 0.1) wash(g, '#ffffff', 1 - span(u, EVO.from, EVO.from + 0.1))
  caption(g, 'What? Charmander is evolving!', u, EVO.from + 0.05, EVOLVED - 0.05)
  caption(g, 'Charmander evolved into Charmeleon!', u, EVOLVED, EVO.to)
  if (hit(T0 + EVOLVED + 0.03)) cry(5)
}

// ---------------------------------------------------------------- fight 2: Charmeleon vs Scyther (8 → 13)
function fight2(g: G, u: number) {
  const r = runs!
  const pic = picture('forest')
  let layer
  if (u >= F2.strike && u < F2.strike + 0.7) layer = playAt(r.f2bug, u, F2.strike, 1.2, 1.4)
  else if (u >= F2.attack && u < F2.faint) layer = playAt(r.f2fire, u, F2.attack, 0.7, 1.6)
  else layer = idleAt(r.f2idle, u)
  const shake = u < F2.throw ? shakeAt(u, C2own, 7) : shakeAt(u, C2, 10)
  surround(g, T0 + u)
  drawStage(g, pic, [layer], clampCam(F.cam, pic, F.stage), F.stage, { shake })
  stageEdge(g)
  if (hit(T0 + F2.cut + 0.02)) cry(123)
  if (hit(T0 + C2own)) play('hit')
  if (hit(T0 + F2.combo)) play('gold')
  if (hit(T0 + C2)) play('super')
  if (hit(T0 + F2.faint)) play('faint')
  foePlate(g, { name: 'Scyther', level: 24, hp: 1 - span(u, C2, C2 + 0.25), party: 3, types: ['bug', 'flying'] }, u, F2.cut)
  ownPlate(g, { name: 'Charmeleon', level: 24, hp: 1 - 0.3 * span(u, C2own, C2own + 0.2), max: 66 }, u, F2.cut + 0.03)
  if (u >= F2.throw && u < F2.attack) {
    tray(g, F2_DICE, u)
    valuePops(g, [5, 5, 2], diceAt(3), u, F2.pops)
    comboChip(g, 'PAIR', F.combo.x, F.combo.y, u, F2.combo, 64)
    damageSlam(g, 14, F.damageSmall.x, F.damageSmall.y + 15, u, F2.damage, { size: 200 })
  }
  if (u >= F2.faint + 0.05) {
    const a = F2.faint + 0.05
    const k = 14 * outBack(span(u, a, a + 0.14), 2)
    const b = boulderBadge()
    g.save()
    g.translate(F.badge.x, F.badge.y)
    g.scale(Math.cos((u - a) * 14) || 0.05, 1)
    blit(g, b, (-b.width * k) / 2, (-b.height * k) / 2, k)
    g.restore()
    if (hit(T0 + a)) play('gold')
  }
  if (u >= F2.burn) flameWipe(g, span(u, F2.burn, F3.legend), u)
}

// ---------------------------------------------------------------- fight 3: Charizard vs Mewtwo (13 → 22.5)
function fight3(g: G, u: number) {
  const r = runs!
  const pic = picture('a26')
  if (u < F3.reverse) {
    // The legendary entrance: through the dark and the rising silhouette, a little slower for the reveal.
    const v = u - F3.legend
    const tl = v < 1.2 ? 1.9 + v : 3.1 + (v - 1.2) * 1.2
    r.f3legend.at(tl, 1.9)
    surround(g, T0 + u)
    drawStage(g, pic, [r.f3legend.draw()], F.cam, F.stage)
    stageEdge(g)
    if (hit(T0 + F3.legend + 1.3)) cry(150)
    if (u < F3.legend + 0.08) wash(g, '#ee8130', 1 - span(u, F3.legend, F3.legend + 0.08))
    return
  }
  const slow = u >= ROLL.slowA && u < LAND
  const layer = u >= F3.attack ? playAt(r.f3fire, u, F3.attack, 0.7, 1.6) : idleAt(r.f3idle, u)
  surround(g, T0 + u)
  drawStage(g, pic, [layer], clampCam(F.cam, pic, F.stage), F.stage, { shake: shakeAt(u, C3, 14, 0.4) })
  stageEdge(g)
  if (hit(T0 + F3.reverse + 0.02)) cry(6)
  if (hit(T0 + C3)) play('super')
  // The slow die: the stage goes dark while it turns, pulsing with a heartbeat.
  if (slow) {
    const beat = Math.max(0, Math.sin((u - ROLL.slowA) * Math.PI * 2.4)) ** 6
    wash(g, '#0b0f24', 0.45 * span(u, ROLL.slowA, ROLL.slowA + 0.2) + 0.12 * beat)
  }
  foePlate(g, { name: 'Mewtwo', level: 70, hp: 1 - span(u, C3 + 0.1, C3 + 0.25), types: ['psychic'] }, u, F3.reverse)
  if (!bigRollBusy(u, ROLL)) ownPlate(g, { name: 'Charizard', level: 68, hp: 1, max: 210 }, u, F3.reverse + 0.03)
  caption(g, 'Select dice to reroll', u, ROLL.taps[0] - 0.4, ROLL.press + 0.2)
  if (u >= ROLL.throw && u < F3.attack) bigRoll(g, u, ROLL, (t) => hit(T0 + t))
  // The impact frame, then two silhouettes in ink on white, then colour again.
  if (u >= C3 && u < C3 + 2 / 60) wash(g, '#ffffff', 1)
  else if (u >= C3 + 2 / 60 && u < C3 + 7 / 60) {
    rect(g, 0, 0, OW, OH, '#ffffff')
    r.f3ink.at(u)
    drawStage(g, null, [r.f3ink.draw()], clampCam(F.inkCam, pic, F.stage), F.stage, { ground: '#ffffff' })
    speedLines(g, 1300, 420, u, { color: INK, inner: 420, a: 1, n: 64 })
  }
  if (u >= F3.end - 0.08) wash(g, '#000000', 1)
}

export const journey: Act = {
  range: ACT.journey,
  async load() {
    await Promise.all([
      loadPicture('meadow'),
      loadPicture('forest'),
      loadPicture('a26'),
      loadMon(4, true),
      loadMon(4),
      loadMon(1),
      loadMon(5),
      loadMon(5, true),
      loadMon(123),
      loadMon(6, true),
      loadMon(150),
    ])
    runs = makeRuns()
  },
  render(g, T) {
    const u = T - T0
    if (u < EVO.from) fight1(g, u)
    else if (u < EVO.to) evolution(g, u)
    else if (u < F3.legend) fight2(g, u)
    else fight3(g, u)
  },
}
