// Act 2, the hero journey (4 → 29.5 s): three fights, each bigger than the last, framed close on the stage with the
// dice thrown over its bottom, every roll worked out on screen the way the game scores it — (the dice + the combo) ×
// the type — and held long enough to read. Charmander vs a wild Bulbasaur (a pair), the whole evolution into
// Charmeleon, a trainer's Scyther (a reroll, three of a kind), Mewtwo's entrance, then Charizard's five dice — three
// Fire, two Flying — the last one rerolled in a long slow motion onto five 5s, a celebration, the biggest hit.
import { attackTimeline } from '@/fx/timelines/attacks'
import { legendLook, legendTimeline } from '@/fx/timelines/legend'
import { evolveTimeline } from '@/fx/timelines/moments'
import { ACT, hit } from '../lib/clock'
import { cry, play } from '../lib/audio'
import { drawTray, restScreen, slowLanding, TRAY_H, TRAY_K, TRAY_W, type TrayPlan } from '../lib/dice'
import { bottomShade, inOut, INK, OH, OW, outBack, outCubic, rect, span, speedLines, text, TYPE, wash, type G } from '../lib/draw'
import { blit, boulderBadge, caption, celebrate, equation, foePlate, ownPlate, valuePops, type Term } from '../lib/hud'
import { Run } from '../lib/run'
import { idle, playAt } from '../lib/scene'
import { loadMon, mon } from '../lib/sprites'
import { camLerp, clampCam, drawStage, loadPicture, picture, type Cam } from '../lib/stage'
import type { Act } from '../main'

const T0 = ACT.journey[0]

const CHARMANDER = mon(4, true)
const CHARMELEON = mon(5, true)
const CHARIZARD = mon(6, true)
const BULBASAUR = mon(1)
const SCYTHER = mon(123)
const MEWTWO = mon(150)

// The beats, in seconds from the act's start.
const F1 = { throw: 0.7, pops: 1.3, sum: 1.6, combo: 2.0, type: 2.45, result: 2.9, attack: 3.7, faint: 4.6, level: 4.9, white: 5.6 }
const EVO = { from: 6, to: 9 }
const F2 = {
  cut: 9,
  strike: 9.2,
  throw: 10,
  pops: 10.62,
  pick: 11.2,
  reroll: 11.9,
  pops2: 12.4,
  sum: 12.7,
  combo: 13.1,
  type: 13.5,
  result: 13.9,
  attack: 14.6,
  faint: 15.3,
  burn: 15.75,
}
const F3 = { legend: 16, reverse: 17.8, throw: 18.6, pops: 19.3, pick: 19.9, reroll: 20.4, slowA: 20.55, slowB: 22.75 }
const LAND = slowLanding(F3.reroll, 0.5, F3.slowA, F3.slowB, 0.08)
const F3b = { sum: LAND + 0.5, combo: LAND + 0.8, result: LAND + 1.2, attack: 24.6, end: 25.5 }

const contactOf = (start: number, from: number, speed: number, at = 1.47) => start + (at - from) / speed
const C1 = contactOf(F1.attack, 0.7, 1.6)
const C2own = contactOf(F2.strike, 1.2, 1.4, 1.67)
const C2 = contactOf(F2.attack, 0.7, 1.6)
const C3 = contactOf(F3b.attack, 0.7, 1.6)

let runs: ReturnType<typeof makeRuns> | null = null
const faint = (u: number, a: number) => {
  const p = span(u, a, a + 0.25)
  return p > 0 ? { dy: Math.round(26 * p * p), alpha: Math.round((1 - p) * 4) / 4 } : {}
}

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
    f1fire: new Run(() => attackTimeline({ own: CHARMANDER, foe: BULBASAUR, type: 'fire', damage: 24 }), { art: true }),
    evo: new Run(() => evolveTimeline({ from: mon(4), to: mon(5), type: 'fire' })),
    f2idle: new Run(() => idle(CHARMELEON, SCYTHER, (t) => ({ foe: faint(t, F2.faint) })), { art: true }),
    f2bug: new Run(() => attackTimeline({ own: CHARMELEON, foe: SCYTHER, by: 'foe', type: 'bug', damage: 31 }), { art: true }),
    f2fire: new Run(() => attackTimeline({ own: CHARMELEON, foe: SCYTHER, type: 'fire', damage: 54 }), { art: true }),
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
const F1_DICE: TrayPlan = {
  fills: [TYPE.fire, TYPE.fire, TYPE.fire],
  throws: [{ t: F1.throw, values: [4, 4, 2], dur: 0.5 }],
  combo: { t: F1.combo, which: [0, 1] },
}
const F1_MATH: Term[] = [
  { text: '(4 + 4 + 2', at: F1.sum },
  { text: '+ 2)', at: F1.combo, color: '#ffbe2e', label: 'PAIR' },
  { text: '× 2', at: F1.type, color: '#ff8a7a', label: 'SUPER EFFECTIVE', labelFill: '#c4382a' },
]
const F2_DICE: TrayPlan = {
  fills: [TYPE.fire, TYPE.fire, TYPE.fire, TYPE.normal],
  throws: [
    { t: F2.throw, values: [6, 2, 6, 3], dur: 0.5 },
    { t: F2.reroll, values: [6, 3], which: [1, 3], dur: 0.45 },
  ],
  picked: { t: F2.pick, which: [1, 3] },
  combo: { t: F2.combo, which: [0, 1, 2] },
}
const F2_MATH: Term[] = [
  { text: '(6 + 6 + 6 + 3', at: F2.sum },
  { text: '+ 6)', at: F2.combo, color: '#ffbe2e', label: 'THREE OF A KIND' },
  { text: '× 2', at: F2.type, color: '#ff8a7a', label: 'SUPER EFFECTIVE', labelFill: '#c4382a' },
]
const F3_DICE: TrayPlan = {
  fills: [TYPE.fire, TYPE.fire, TYPE.fire, TYPE.flying, TYPE.flying],
  throws: [
    { t: F3.throw, values: [5, 5, 5, 5, 2], dur: 0.55 },
    { t: F3.reroll, values: [5], which: [4], dur: 0.5 },
  ],
  picked: { t: F3.pick, which: [4] },
  slow: [4, F3.slowA, F3.slowB, 0.08],
  combo: { t: LAND, which: [0, 1, 2, 3, 4] },
  flash: LAND,
  jump: LAND + 0.05,
}
// A Charizard this far along has its Five of a Kind maxed: +70 (upgrades.json, level 10).
const F3_MATH: Term[] = [
  { text: '5 + 5 + 5 + 5 + 5', at: F3b.sum },
  { text: '+ 70', at: F3b.combo, color: '#ffbe2e', label: 'FIVE OF A KIND' },
]

/** The tray over a dark band; `zoom` pushes in on die `on` (the slow one). */
function tray(g: G, plan: TrayPlan, u: number, zoom = 1, on = 0) {
  bottomShade(g, 560, 0.88)
  g.imageSmoothingEnabled = false
  const cv = drawTray(plan, u)
  if (zoom === 1) g.drawImage(cv, 0, 0, TRAY_W * TRAY_K, TRAY_H * TRAY_K)
  else {
    const p = restScreen(plan.fills.length, on)
    const k = TRAY_K * zoom
    // Keep the die where it is, sliding it toward the middle as the camera closes in.
    const tx = p.x + ((960 - p.x) * (zoom - 1)) / 1.6
    const ty = p.y + ((640 - p.y) * (zoom - 1)) / 1.6
    g.drawImage(cv, Math.round(tx - (p.x / TRAY_K) * k), Math.round(ty - (p.y / TRAY_K) * k), TRAY_W * k, TRAY_H * k)
  }
}
const at = (n: number) => (i: number) => restScreen(n, i)

/** A camera path: keyframes [time, cam], eased between. */
function path(u: number, keys: [number, Cam][]): Cam {
  if (u <= keys[0]![0]) return keys[0]![1]
  for (let i = 1; i < keys.length; i++) {
    const [t1, c1] = keys[i]!
    const [t0, c0] = keys[i - 1]!
    if (u <= t1) return camLerp(c0, c1, inOut(span(u, t0, t1)))
  }
  return keys[keys.length - 1]![1]
}

const shakeAt = (u: number, at: number, amp: number, dur = 0.3) => {
  const p = (u - at) / dur
  if (p < 0 || p >= 1) return { x: 0, y: 0 }
  const f = Math.floor((u - at) * 30)
  const k = amp * (1 - p)
  return { x: (f % 2 ? 1 : -1) * Math.round(k), y: ((f >> 1) % 2 ? 1 : -1) * Math.round(k * 0.5) }
}
const idleAt = (r: Run, u: number) => (r.at(u), r.draw())

// ---------------------------------------------------------------- fight 1: Charmander vs Bulbasaur (0 → 6)
function fight1(g: G, u: number) {
  const r = runs!
  const pic = picture('meadow')
  const cam = path(u, [
    [0, { x: 160, y: 76, z: 9 }],
    [0.6, { x: 152, y: 80, z: 9 }],
    [1.1, { x: 122, y: 86, z: 8 }],
    [F1.attack, { x: 122, y: 86, z: 8 }],
    [F1.attack + 0.12, { x: 92, y: 108, z: 9 }],
    [F1.attack + 0.3, { x: 98, y: 106, z: 9 }],
    [F1.attack + 0.4, { x: 158, y: 80, z: 9 }],
    [F1.faint + 0.3, { x: 150, y: 82, z: 9 }],
    [F1.level, { x: 110, y: 96, z: 8 }],
    [6, { x: 92, y: 110, z: 10 }],
  ])
  const attack = u >= F1.attack && u < F1.faint
  const layer = attack ? playAt(r.f1fire, u, F1.attack, 0.7, 1.6) : idleAt(r.f1idle, u)
  drawStage(g, pic, [layer], clampCam(cam, pic), undefined, { shake: shakeAt(u, C1, 18) })
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
    valuePops(g, [4, 4, 2], at(3), u, F1.pops)
    equation(g, F1_MATH, { n: 24, at: F1.result }, u)
  }
  if (u >= F1.white) wash(g, '#ffffff', span(u, F1.white, F1.white + 0.35))
}

// ---------------------------------------------------------------- the evolution (6 → 9)
function evolution(g: G, u: number) {
  // The whole morph, from the light gathering to Charmeleon standing in it, a little faster than the game's.
  const layer = playAt(runs!.evo, u, EVO.from, 1.2, 1.9)
  drawStage(g, null, [layer], { x: 120, y: 82, z: 8 })
  if (u < EVO.from + 0.12) wash(g, '#ffffff', 1 - span(u, EVO.from, EVO.from + 0.12))
  caption(g, 'What? Charmander is evolving!', u, EVO.from + 0.2, EVO.from + 2.2)
  caption(g, 'Charmander evolved into Charmeleon!', u, EVO.from + 2.72, EVO.to)
  if (hit(T0 + EVO.from + 2.75)) cry(5)
}

// ---------------------------------------------------------------- fight 2: Charmeleon vs Scyther (9 → 16)
function fight2(g: G, u: number) {
  const r = runs!
  const pic = picture('forest')
  const cam = path(u, [
    [F2.cut, { x: 150, y: 80, z: 9 }],
    [F2.strike + 0.15, { x: 98, y: 104, z: 9 }],
    [F2.throw - 0.1, { x: 104, y: 100, z: 9 }],
    [F2.throw + 0.4, { x: 120, y: 86, z: 8 }],
    [F2.attack, { x: 120, y: 86, z: 8 }],
    [F2.attack + 0.12, { x: 96, y: 106, z: 9 }],
    [F2.attack + 0.32, { x: 156, y: 80, z: 9 }],
    [16, { x: 150, y: 82, z: 10 }],
  ])
  let layer
  if (u >= F2.strike && u < F2.strike + 0.7) layer = playAt(r.f2bug, u, F2.strike, 1.2, 1.4)
  else if (u >= F2.attack && u < F2.faint) layer = playAt(r.f2fire, u, F2.attack, 0.7, 1.6)
  else layer = idleAt(r.f2idle, u)
  const shake = u < F2.throw ? shakeAt(u, C2own, 14) : shakeAt(u, C2, 20)
  drawStage(g, pic, [layer], clampCam(cam, pic), undefined, { shake })
  if (hit(T0 + F2.cut + 0.02)) cry(123)
  if (hit(T0 + C2own)) play('hit')
  if (hit(T0 + C2)) play('super')
  if (hit(T0 + F2.faint)) play('faint')
  foePlate(g, { name: 'Scyther', level: 24, hp: 1 - span(u, C2, C2 + 0.25), party: 3, types: ['bug', 'flying'] }, u, F2.cut)
  ownPlate(g, { name: 'Charmeleon', level: 24, hp: 1 - 0.55 * span(u, C2own, C2own + 0.2), max: 66 }, u, F2.cut + 0.03)
  caption(g, 'Tap dice to throw them again.', u, F2.pick - 0.2, F2.reroll + 0.5)
  if (u >= F2.throw && u < F2.attack) {
    tray(g, F2_DICE, u)
    if (u < F2.reroll) valuePops(g, [6, 2, 6, 3], at(4), u, F2.pops)
    else valuePops(g, [6, 6, 6, 3], at(4), u, F2.pops2)
    equation(g, F2_MATH, { n: 54, at: F2.result }, u)
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
  if (u >= F2.burn) flameWipe(g, span(u, F2.burn, 16), u)
}

function flameWipe(g: G, p: number, u: number) {
  const layers: [string, number][] = [
    ['#c4382a', 0],
    ['#ee8130', 0.15],
    ['#ffbe2e', 0.3],
  ]
  for (const [c, lag] of layers) {
    const q = Math.max(0, Math.min(1, (p - lag) / (1 - lag)))
    if (q <= 0) continue
    const top = OH * (1.1 - outCubic(q) * 1.45)
    for (let x = 0; x < OW; x += 24) {
      const h = 70 + 55 * Math.sin(x * 0.011 + u * 34 + lag * 9) + 35 * Math.sin(x * 0.037 - u * 21)
      rect(g, x, top - h, 24, OH, c)
    }
  }
}

// ---------------------------------------------------------------- fight 3: Charizard vs Mewtwo (16 → 25.5)
function fight3(g: G, u: number) {
  const r = runs!
  const pic = picture('a26')
  if (u < F3.reverse) {
    // The legendary entrance: through the dark and the rising silhouette, a little slower for the reveal.
    const v = u - F3.legend
    const tl = v < 1.2 ? 1.9 + v : 3.1 + (v - 1.2) * 1.2
    r.f3legend.at(tl, 1.9)
    drawStage(g, pic, [r.f3legend.draw()], { x: 120, y: 80, z: 8 })
    if (hit(T0 + F3.legend + 1.3)) cry(150)
    if (u < F3.legend + 0.08) wash(g, '#ee8130', 1 - span(u, F3.legend, F3.legend + 0.08))
    return
  }
  const slow = u >= F3.slowA && u < LAND
  const cam = path(u, [
    [F3.reverse, { x: 66, y: 116, z: 10 }],
    [F3.reverse + 0.65, { x: 74, y: 112, z: 10 }],
    [F3.throw + 0.1, { x: 120, y: 86, z: 8 }],
    [F3b.attack, { x: 120, y: 86, z: 8 }],
    [F3b.attack + 0.12, { x: 92, y: 108, z: 9 }],
    [F3b.attack + 0.32, { x: 158, y: 80, z: 9 }],
    [F3b.end, { x: 152, y: 82, z: 10 }],
  ])
  const layer = u >= F3b.attack ? playAt(r.f3fire, u, F3b.attack, 0.7, 1.6) : idleAt(r.f3idle, u)
  drawStage(g, pic, [layer], clampCam(cam, pic), undefined, { shake: shakeAt(u, C3, 28, 0.45) })
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
    tray(g, F3_DICE, u, zoom, 4)
    if (u >= LAND - 0.02 && u < LAND + 0.1) speedLines(g, OW / 2, 900, u, { color: '#ffbe2e', inner: 260, a: 0.6 })
    if (u < F3.reroll) valuePops(g, [5, 5, 5, 5, 2], at(5), u, F3.pops)
    else if (u >= LAND + 0.2) valuePops(g, [5, 5, 5, 5, 5], at(5), u, LAND + 0.2)
    // FIVE OF A KIND, huge.
    if (u >= LAND) {
      const k = 2.2 - 1.2 * outBack(span(u, LAND, LAND + 0.2), 2.2)
      const sh = Math.round(Math.sin(u * 70) * 6 * (1 - span(u, LAND, LAND + 0.6)))
      g.save()
      g.translate(OW / 2 + sh, 330)
      g.scale(k, k)
      text(g, 'FIVE OF A KIND!', 0, 0, { size: 190, color: '#ffbe2e', align: 'center', base: 'middle', ow: 14, drop: 16, dropColor: '#c4382a' })
      g.restore()
      if (hit(T0 + LAND)) play('levelup')
      if (hit(T0 + LAND + 0.18)) play('catch')
    }
    if (u >= F3b.sum) equation(g, F3_MATH, { n: 95, at: F3b.result }, u, 960, 730)
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
    else if (u < F2.burn + 0.25) fight2(g, u)
    else fight3(g, u)
  },
}
