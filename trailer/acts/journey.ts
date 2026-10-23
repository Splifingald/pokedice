// Act 2, the hero journey (2.5 → 10 s): three fights, each bigger than the last, framed close on the stage with the
// dice thrown over its bottom. Charmander vs a wild Bulbasaur (a pair); Charmeleon, fresh from evolving, vs a
// trainer's Scyther (a reroll, three of a kind); Mewtwo's legendary entrance, then Charizard's five of a kind, the
// last die in slow motion, an impact frame and an ink freeze.
import { attackTimeline } from '@/fx/timelines/attacks'
import { legendLook, legendTimeline } from '@/fx/timelines/legend'
import { evolveTimeline } from '@/fx/timelines/moments'
import { ACT, hit } from '../lib/clock'
import { cry, play } from '../lib/audio'
import { drawTray, TRAY_H, TRAY_K, TRAY_W, type TrayPlan } from '../lib/dice'
import { bottomShade, inOut, INK, OH, OW, outBack, outCubic, rect, span, speedLines, TYPE, wash, type G } from '../lib/draw'
import { blit, boulderBadge, comboChip, damageSlam, foePlate, ownPlate } from '../lib/hud'
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

let runs: ReturnType<typeof makeRuns> | null = null
const faint = (u: number, a: number, b: number) => {
  const p = span(u, a, b)
  return p > 0 ? { dy: Math.round(26 * p * p), alpha: Math.round((1 - p) * 4) / 4 } : {}
}

function makeRuns() {
  return {
    f1idle: new Run(
      () =>
        idle(CHARMANDER, BULBASAUR, (t) => ({
          foe: faint(t, 1.55, 1.75),
          own: t > 1.72 ? { flash: Math.round(span(t, 1.72, 1.86) * 4) / 4 } : {},
        })),
      { art: true },
    ),
    f1fire: new Run(() => attackTimeline({ own: CHARMANDER, foe: BULBASAUR, type: 'fire', damage: 14 }), { art: true }),
    f2evo: new Run(() => evolveTimeline({ from: mon(4), to: mon(5), type: 'fire' })),
    f2idle: new Run(() => idle(CHARMELEON, SCYTHER, (t) => ({ foe: faint(t, 4.3, 4.45) })), { art: true }),
    f2bug: new Run(() => attackTimeline({ own: CHARMELEON, foe: SCYTHER, by: 'foe', type: 'bug', damage: 31 }), { art: true }),
    f2fire: new Run(() => attackTimeline({ own: CHARMELEON, foe: SCYTHER, type: 'fire', damage: 38 }), { art: true }),
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
    f3fire: new Run(() => attackTimeline({ own: CHARIZARD, foe: MEWTWO, type: 'fire', damage: 126 }), { art: true }),
    f3ink: new Run(() => idle(CHARIZARD, MEWTWO, () => ({ own: { sil: INK }, foe: { sil: INK } }), { bare: true })),
  }
}

// ---------------------------------------------------------------- the dice of each fight
const F1_DICE: TrayPlan = {
  fills: [TYPE.fire, TYPE.fire, TYPE.fire],
  throws: [{ t: 0.15, values: [4, 4, 2], dur: 0.45 }],
  combo: { t: 0.68, which: [0, 1] },
}
const F2_DICE: TrayPlan = {
  fills: [TYPE.fire, TYPE.fire, TYPE.fire, TYPE.normal],
  throws: [
    { t: 2.66, values: [6, 2, 6, 3], dur: 0.45 },
    { t: 3.3, values: [6, 3], which: [1, 3], dur: 0.4 },
  ],
  picked: { t: 3.18, which: [1, 3] },
  combo: { t: 3.71, which: [0, 1, 2] },
}
// The last die is rerolled in slow motion: it lands at 6.875.
const F3_LAND = 6.875
const F3_DICE: TrayPlan = {
  fills: [TYPE.fire, TYPE.fire, TYPE.fire, TYPE.flying, TYPE.fire],
  throws: [
    { t: 5.58, values: [5, 5, 5, 5, 2], dur: 0.45 },
    { t: 6.2, values: [5], which: [4], dur: 0.45 },
  ],
  picked: { t: 6.08, which: [4] },
  slow: [4, 6.35, 6.65, 0.25],
  combo: { t: F3_LAND, which: [0, 1, 2, 3, 4] },
  flash: F3_LAND,
}

function tray(g: G, plan: TrayPlan, u: number) {
  bottomShade(g, 620, 0.85)
  g.imageSmoothingEnabled = false
  g.drawImage(drawTray(plan, u), 0, 0, TRAY_W * TRAY_K, TRAY_H * TRAY_K)
}

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

// ---------------------------------------------------------------- fight 1: Charmander vs Bulbasaur (0 → 2)
function fight1(g: G, u: number) {
  const r = runs!
  const pic = picture('meadow')
  const contact = 0.85 + (1.47 - 0.7) / 1.8
  const cam = path(u, [
    [0, { x: 160, y: 76, z: 9 }],
    [0.12, { x: 156, y: 78, z: 9 }],
    [0.5, { x: 122, y: 86, z: 8 }],
    [0.85, { x: 122, y: 86, z: 8 }],
    [0.95, { x: 92, y: 108, z: 9 }],
    [1.12, { x: 98, y: 106, z: 9 }],
    [1.2, { x: 158, y: 80, z: 9 }],
    [1.55, { x: 150, y: 82, z: 9 }],
    [1.7, { x: 120, y: 90, z: 8 }],
    [2.0, { x: 96, y: 108, z: 10 }],
  ])
  const attack = u >= 0.85 && u < 1.55
  const layer = attack ? playAt(r.f1fire, u, 0.85, 0.7, 1.8) : (r.f1idle.at(u), r.f1idle.draw())
  drawStage(g, pic, [layer], clampCam(cam, pic), undefined, { shake: shakeAt(u, contact, 18) })
  if (hit(T0 + 0.02)) cry(1)
  if (hit(T0 + contact)) play('super')
  if (hit(T0 + 1.56)) play('faint')
  if (hit(T0 + 1.72)) play('levelup')
  const foeHp = 1 - span(u, contact, contact + 0.25)
  foePlate(g, { name: 'Bulbasaur', level: 5, hp: foeHp, types: ['grass', 'poison'] }, u, 0)
  ownPlate(g, { name: 'Charmander', level: u >= 1.72 ? 16 : 5, hp: 1, max: u >= 1.72 ? 46 : 20 }, u, 0.04)
  if (u >= 0.15 && u < 0.85) {
    tray(g, F1_DICE, u)
    comboChip(g, 'PAIR', 960, 600, u, 0.68)
    damageSlam(g, 14, 960, 740, u, 0.7)
  }
  // The level-up: Charmander glows and the white takes the screen.
  if (u >= 1.84) wash(g, '#ffffff', span(u, 1.84, 1.98))
}

// ---------------------------------------------------------------- fight 2: Charmeleon vs Scyther (2 → 4.5)
function fight2(g: G, u: number) {
  const r = runs!
  if (u < 2.25) {
    // The evolution's last beat: the light bursts and Charmeleon stands there.
    const layer = playAt(r.f2evo, u, 2.0, 6.1, 2)
    drawStage(g, null, [layer], { x: 120, y: 82, z: 8 })
    if (u < 2.07) wash(g, '#ffffff', 1 - span(u, 2.0, 2.07))
    if (hit(T0 + 2.14)) cry(5)
    return
  }
  const pic = picture('forest')
  const hitOwn = 2.3 + (1.67 - 1.3) / 1.6
  const contact = 3.8 + (1.47 - 0.7) / 2
  const cam = path(u, [
    [2.25, { x: 150, y: 80, z: 9 }],
    [2.36, { x: 98, y: 104, z: 9 }],
    [2.62, { x: 104, y: 100, z: 9 }],
    [2.8, { x: 120, y: 86, z: 8 }],
    [3.8, { x: 120, y: 86, z: 8 }],
    [3.9, { x: 96, y: 106, z: 9 }],
    [4.08, { x: 156, y: 80, z: 9 }],
    [4.5, { x: 150, y: 82, z: 10 }],
  ])
  let layer
  if (u >= 2.3 && u < 2.62) layer = playAt(r.f2bug, u, 2.3, 1.3, 1.6)
  else if (u >= 3.8 && u < 4.3) layer = playAt(r.f2fire, u, 3.8, 0.7, 2)
  else layer = (r.f2idle.at(u), r.f2idle.draw())
  const shake = u < 3 ? shakeAt(u, hitOwn, 14) : shakeAt(u, contact, 20)
  drawStage(g, pic, [layer], clampCam(cam, pic), undefined, { shake })
  if (hit(T0 + 2.26)) cry(123)
  if (hit(T0 + hitOwn)) play('hit')
  if (hit(T0 + contact)) play('super')
  if (hit(T0 + 4.3)) play('faint')
  foePlate(g, { name: 'Scyther', level: 24, hp: 1 - span(u, contact, contact + 0.2), party: 3, types: ['bug', 'flying'] }, u, 2.25)
  ownPlate(g, { name: 'Charmeleon', level: 24, hp: 1 - 0.55 * span(u, hitOwn, hitOwn + 0.18), max: 66 }, u, 2.28)
  if (u >= 2.62 && u < 3.8) {
    tray(g, F2_DICE, u)
    comboChip(g, 'THREE OF A KIND', 960, 590, u, 3.71)
    damageSlam(g, 38, 960, 735, u, 3.73, { size: 190 })
  }
  // The badge: the journey goes on.
  if (u >= 4.3) {
    const p = span(u, 4.3, 4.42)
    const k = 14 * outBack(p, 2)
    const b = boulderBadge()
    g.save()
    g.translate(OW - 200, 220)
    g.scale(Math.cos((u - 4.3) * 18) || 0.05, 1)
    blit(g, b, (-b.width * k) / 2, (-b.height * k) / 2, k)
    g.restore()
    if (hit(T0 + 4.32)) play('gold')
  }
  // The screen burns orange from the bottom: three layers of flame tongues, red, orange, yellow.
  if (u >= 4.34) flameWipe(g, span(u, 4.34, 4.5), u)
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

// ---------------------------------------------------------------- fight 3: Charizard vs Mewtwo (4.5 → 7.5)
function fight3(g: G, u: number) {
  const r = runs!
  const pic = picture('a26')
  if (u < 5.3) {
    // The legendary entrance, hurried through the dark and slowed for the reveal.
    const v = u - 4.5
    const tl = v < 0.35 ? 1.9 + 4 * v : 3.3 + 1.5 * (v - 0.35)
    r.f3legend.at(tl, 1.9)
    drawStage(g, pic, [r.f3legend.draw()], { x: 120, y: 80, z: 8 })
    if (hit(T0 + 4.83)) cry(150)
    if (u < 4.56) wash(g, '#ee8130', 1 - span(u, 4.5, 4.56))
    return
  }
  const contact = 6.95 + (1.47 - 0.7) / 2
  const cam = path(u, [
    [5.3, { x: 66, y: 116, z: 10 }],
    [5.52, { x: 74, y: 112, z: 10 }],
    [5.62, { x: 120, y: 86, z: 8 }],
    [6.3, { x: 120, y: 86, z: 8 }],
    [6.85, { x: 120, y: 92, z: 9 }],
    [6.95, { x: 120, y: 86, z: 8 }],
    [7.05, { x: 92, y: 108, z: 9 }],
    [7.22, { x: 158, y: 80, z: 9 }],
    [7.5, { x: 152, y: 82, z: 10 }],
  ])
  const attack = u >= 6.95
  const layer = attack ? playAt(r.f3fire, u, 6.95, 0.7, 2) : (r.f3idle.at(u), r.f3idle.draw())
  drawStage(g, pic, [layer], clampCam(cam, pic), undefined, { shake: shakeAt(u, contact, 28, 0.4) })
  if (hit(T0 + 5.31)) cry(6)
  if (hit(T0 + contact)) play('super')
  // The slow die: the stage dims while it turns.
  if (u >= 6.3 && u < F3_LAND) wash(g, '#0b0f24', 0.45 * span(u, 6.3, 6.4))
  foePlate(g, { name: 'Mewtwo', level: 70, hp: 1 - span(u, 7.43, 7.5), types: ['psychic'] }, u, 5.3)
  ownPlate(g, { name: 'Charizard', level: 68, hp: 1, max: 210 }, u, 5.32)
  if (u >= 5.55 && u < 6.95) {
    tray(g, F3_DICE, u)
    if (u >= F3_LAND - 0.02 && u < F3_LAND + 0.08) speedLines(g, OW / 2, 900, u, { color: '#ffbe2e', inner: 260, a: 0.5 })
    comboChip(g, 'FIVE OF A KIND', 960, 570, u, F3_LAND)
    damageSlam(g, 126, 960, 725, u, F3_LAND + 0.02, { size: 220, shake: 18 })
    if (hit(T0 + F3_LAND)) play('levelup')
  }
  // The impact frame, then two silhouettes in ink on white, then colour again.
  if (u >= contact && u < contact + 2 / 60) wash(g, '#ffffff', 1)
  else if (u >= contact + 2 / 60 && u < contact + 7 / 60) {
    rect(g, 0, 0, OW, OH, '#ffffff')
    r.f3ink.at(u)
    drawStage(g, null, [r.f3ink.draw()], clampCam({ x: 140, y: 88, z: 10 }, pic), undefined, { ground: '#ffffff' })
    speedLines(g, 1300, 420, u, { color: INK, inner: 420, a: 1, n: 64 })
  }
  // Smash cut to black on the beat.
  if (u >= 7.44) wash(g, '#000000', 1)
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
    if (u < 2) fight1(g, u)
    else if (u < 4.5) fight2(g, u)
    else fight3(g, u)
  },
}
