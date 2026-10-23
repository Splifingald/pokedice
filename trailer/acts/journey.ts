// Act 2, the hero journey (4 → 26.5 s): three fights, each bigger than the last, framed close on the stage with the
// dice thrown over its bottom. No formula on screen: each die's value pops up, the combo's chip appears, the damage
// slams in, and the numbers are simple enough to add up at a glance. Charmander's two dice (3 + 4 = 7), the whole
// evolution into Charmeleon, its three dice with a pair against a trainer's Scyther, Mewtwo's entrance, then
// Charizard's five dice — three Fire, two Flying — the last one rerolled in a long slow motion onto five 5s, a
// celebration, the biggest hit.
import { attackTimeline } from '@/fx/timelines/attacks'
import { legendLook, legendTimeline } from '@/fx/timelines/legend'
import { evolveTimeline } from '@/fx/timelines/moments'
import { ACT, hit } from '../lib/clock'
import { cry, play } from '../lib/audio'
import { contactOf, diceAt, faint, fiveBanner, flameWipe, idleAt, shakeAt, STAGE, tray } from '../lib/fight'
import { slowLanding, type TrayPlan } from '../lib/dice'
import { INK, OH, OW, outBack, outCubic, rect, span, speedLines, TYPE, wash, type G } from '../lib/draw'
import { blit, boulderBadge, caption, celebrate, comboChip, damageSlam, foePlate, ownPlate, valuePops } from '../lib/hud'
import { Run } from '../lib/run'
import { idle, playAt } from '../lib/scene'
import { loadMon, mon } from '../lib/sprites'
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
const F3 = { legend: 11.5, reverse: 13.3, throw: 14.1, pops: 14.8, pick: 15.4, reroll: 15.9, slowA: 16.05, slowB: 18.25 }
const LAND = slowLanding(F3.reroll, 0.5, F3.slowA, F3.slowB, 0.08)
const F3b = { damage: LAND + 0.9, attack: 20.1, end: 21 }

const C1 = contactOf(F1.attack, 0.7, 1.6)
const C2own = contactOf(F2.strike, 1.2, 1.4, 1.67)
const C2 = contactOf(F2.attack, 0.7, 1.6)
const C3 = contactOf(F3b.attack, 0.7, 1.6)

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
// Charizard's: five dice, three Fire and two Flying; the last one rerolled in slow motion. Five 5s: 25, and a maxed
// Five of a Kind's +70 (upgrades.json, level 10): 95.
const F3_DICE: TrayPlan = {
  fills: [TYPE.fire, TYPE.fire, TYPE.fire, TYPE.flying, TYPE.flying],
  throws: [
    { t: F3.throw, values: [5, 5, 2, 5, 3], dur: 0.55 },
    { t: F3.reroll, values: [5, 5], which: [2, 4], dur: 0.5 },
  ],
  picked: { t: F3.pick, which: [2, 4] },
  slow: [[2, 4], F3.slowA, F3.slowB, 0.08],
  combo: { t: LAND, which: [0, 1, 2, 3, 4] },
  flash: LAND,
  jump: LAND + 0.05,
}

// ---------------------------------------------------------------- fight 1: Charmander vs Bulbasaur (0 → 5)
function fight1(g: G, u: number) {
  const r = runs!
  const pic = picture('meadow')
  // One still shot of the whole stage: the action moves, the camera doesn't.
  const cam = STAGE
  const attack = u >= F1.attack && u < F1.faint
  const layer = attack ? playAt(r.f1fire, u, F1.attack, 0.7, 1.6) : idleAt(r.f1idle, u)
  drawStage(g, pic, [layer], clampCam(cam, pic), undefined, { shake: shakeAt(u, C1, 9) })
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
    damageSlam(g, 7, 960, 700, u, F1.damage, { size: 200 })
  }
  if (u >= F1.white) wash(g, '#ffffff', span(u, F1.white, F1.white + 0.35))
}

// ---------------------------------------------------------------- the evolution (5 → 8)
function evolution(g: G, u: number) {
  // The morph, quick: the silhouette changing, the burst, Charmeleon standing in its light.
  const layer = playAt(runs!.evo, u, EVO.from, EVO.tl, EVO.speed)
  drawStage(g, null, [layer], { x: 120, y: 82, z: 8 })
  if (u < EVO.from + 0.1) wash(g, '#ffffff', 1 - span(u, EVO.from, EVO.from + 0.1))
  caption(g, 'What? Charmander is evolving!', u, EVO.from + 0.05, EVOLVED - 0.05)
  caption(g, 'Charmander evolved into Charmeleon!', u, EVOLVED, EVO.to)
  if (hit(T0 + EVOLVED + 0.03)) cry(5)
}

// ---------------------------------------------------------------- fight 2: Charmeleon vs Scyther (8 → 13)
function fight2(g: G, u: number) {
  const r = runs!
  const pic = picture('forest')
  const cam = STAGE
  let layer
  if (u >= F2.strike && u < F2.strike + 0.7) layer = playAt(r.f2bug, u, F2.strike, 1.2, 1.4)
  else if (u >= F2.attack && u < F2.faint) layer = playAt(r.f2fire, u, F2.attack, 0.7, 1.6)
  else layer = idleAt(r.f2idle, u)
  const shake = u < F2.throw ? shakeAt(u, C2own, 7) : shakeAt(u, C2, 10)
  drawStage(g, pic, [layer], clampCam(cam, pic), undefined, { shake })
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
    comboChip(g, 'PAIR', 960, 560, u, F2.combo, 64)
    damageSlam(g, 14, 960, 715, u, F2.damage, { size: 200 })
  }
  if (u >= F2.faint + 0.05) {
    const a = F2.faint + 0.05
    const k = 14 * outBack(span(u, a, a + 0.14), 2)
    const b = boulderBadge()
    g.save()
    g.translate(OW - 200, 230)
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
    drawStage(g, pic, [r.f3legend.draw()], STAGE)
    if (hit(T0 + F3.legend + 1.3)) cry(150)
    if (u < F3.legend + 0.08) wash(g, '#ee8130', 1 - span(u, F3.legend, F3.legend + 0.08))
    return
  }
  const slow = u >= F3.slowA && u < LAND
  const cam = STAGE
  const layer = u >= F3b.attack ? playAt(r.f3fire, u, F3b.attack, 0.7, 1.6) : idleAt(r.f3idle, u)
  drawStage(g, pic, [layer], clampCam(cam, pic), undefined, { shake: shakeAt(u, C3, 14, 0.4) })
  if (hit(T0 + F3.reverse + 0.02)) cry(6)
  if (hit(T0 + C3)) play('super')
  // The slow die: the stage goes dark while it turns, pulsing with a heartbeat.
  if (slow) {
    const beat = Math.max(0, Math.sin((u - F3.slowA) * Math.PI * 2.4)) ** 6
    wash(g, '#0b0f24', 0.55 * span(u, F3.slowA, F3.slowA + 0.2) + 0.15 * beat)
  }
  foePlate(g, { name: 'Mewtwo', level: 70, hp: 1 - span(u, C3 + 0.1, C3 + 0.25), types: ['psychic'] }, u, F3.reverse)
  if (!slow) ownPlate(g, { name: 'Charizard', level: 68, hp: 1, max: 210 }, u, F3.reverse + 0.03)
  caption(g, 'Tap dice to throw them again.', u, F3.pick - 0.2, F3.reroll + 0.1)
  if (u >= F3.throw && u < F3b.attack) {
    const zoom = slow
      ? 1 + 1.6 * outCubic(span(u, F3.slowA, F3.slowA + 0.5))
      : u >= LAND
        ? 1 + 1.6 * (1 - outCubic(span(u, LAND, LAND + 0.25)))
        : 1
    celebrate(g, u, LAND)
    // The camera closes in between the two slow dice (the 3rd and the 5th): on the 4th's place.
    tray(g, F3_DICE, u, zoom, 3)
    if (u >= LAND - 0.02 && u < LAND + 0.1) speedLines(g, OW / 2, 900, u, { color: '#ffbe2e', inner: 260, a: 0.6 })
    if (u < F3.reroll) valuePops(g, [5, 5, 2, 5, 3], diceAt(5), u, F3.pops)
    else if (u >= LAND + 0.2) valuePops(g, [5, 5, 5, 5, 5], diceAt(5), u, LAND + 0.2)
    // FIVE OF A KIND, huge, then the damage under it.
    fiveBanner(g, u, LAND, (t) => hit(T0 + t))
    damageSlam(g, 95, 960, 640, u, F3b.damage, { size: 230, shake: 16 })
  }
  // The impact frame, then two silhouettes in ink on white, then colour again.
  if (u >= C3 && u < C3 + 2 / 60) wash(g, '#ffffff', 1)
  else if (u >= C3 + 2 / 60 && u < C3 + 7 / 60) {
    rect(g, 0, 0, OW, OH, '#ffffff')
    r.f3ink.at(u)
    drawStage(g, null, [r.f3ink.draw()], clampCam({ x: 140, y: 88, z: 10 }, pic), undefined, { ground: '#ffffff' })
    speedLines(g, 1300, 420, u, { color: INK, inner: 420, a: 1, n: 64 })
  }
  if (u >= F3b.end - 0.08) wash(g, '#000000', 1)
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
