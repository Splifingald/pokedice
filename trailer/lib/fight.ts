// What the trailer's fights share, in every cut: the one stage shot, the dice tray over its dark band, the moves'
// contact times, a faint, the screen shake on a hit, the five of a kind's banner and the flame wipe.
import { play } from './audio'
import { drawTray, restScreen, slowLanding, TRAY_H, TRAY_K, TRAY_W, type TrayPlan } from './dice'
import { bottomShade, GOLD, inOut, INK, OH, OW, outBack, outCubic, panel, rect, span, speedLines, text, TYPE, type G } from './draw'
import { celebrate, damageSlam, valuePops } from './hud'
import { icon } from '@/fx/pixel'
import { F } from './frame'
import type { Run } from './run'
import { setArtUnderStage, stageBackground } from '@/fx/scenes'
import { H, W } from '@/fx/timeline'
import { sharpDraw, type Cam } from './stage'

/** The fights' one shot: the whole stage. Every fight, and a legend's entrance, are framed exactly alike. */
export const STAGE: Cam = { x: 120, y: 90, z: 8 }

/**
 * Your Pokémon stands higher than in the game. The game puts its feet 4 px below the stage (a back view cut by the
 * panel under it); in a video, the bottom of the frame is the dice's dark band and a player's control bar, so it stands
 * 12 px up, whole. Every battle timeline over an area picture reads this one cached layout when it builds its stage.
 */
export function liftHero() {
  setArtUnderStage(true)
  stageBackground(W, H).layout.own.y = H - 8
  setArtUnderStage(false)
}

/** When an attack timeline's hit lands on the act's clock: started at `start`, played from `from` at `speed`. */
export const contactOf = (start: number, from: number, speed: number, at = 1.47) => start + (at - from) / speed

/** A Pokémon fainting from time a: it sinks and fades in steps. */
export const faint = (u: number, a: number) => {
  const p = span(u, a, a + 0.25)
  return p > 0 ? { dy: Math.round(26 * p * p), alpha: Math.round((1 - p) * 4) / 4 } : {}
}

/** Where the tray canvas goes on the screen when `zoom` pushes in on die `on`: its top left and its scale. */
function trayFrame(n: number, zoom: number, on: number) {
  const p = restScreen(n, on)
  const k = TRAY_K * zoom
  // Keep the die where it is, sliding it toward the frame's spot as the camera closes in.
  const tx = p.x + ((F.zoomTo.x - p.x) * (zoom - 1)) / 1.6
  const ty = p.y + ((F.zoomTo.y - p.y) * (zoom - 1)) / 1.6
  // The die's place on the tray canvas (restScreen without the frame's offset), scaled.
  return { x: tx - ((p.x - F.tray.x) / TRAY_K) * k, y: ty - ((p.y - F.tray.y) / TRAY_K) * k, k }
}

/** The tray over a dark band; `zoom` pushes in on die `on`. */
export function tray(g: G, plan: TrayPlan, u: number, zoom = 1, on = 0) {
  // Light enough that your Pokémon, bottom left, stays in view behind the dice.
  if (F.shade != null) bottomShade(g, F.shade, 0.6)
  const cv = drawTray(plan, u)
  const f = trayFrame(plan.fills.length, zoom, on)
  sharpDraw(g, cv, f.x, f.y, TRAY_W * f.k, TRAY_H * f.k)
}

/** Where die i of n rests on the screen under the tray's zoom; its readout sits `lift` px above it, zoomed too. */
export function trayPoint(n: number, i: number, zoom = 1, on = 0, lift = 96) {
  const f = trayFrame(n, zoom, on)
  const p = restScreen(n, i)
  return { x: f.x + ((p.x - F.tray.x) / TRAY_K) * f.k, y: f.y + ((p.y - F.tray.y) / TRAY_K) * f.k - lift * (zoom - 1) }
}

/** Where each of n dice rests on the screen (for the values popping up over them). */
export const diceAt = (n: number) => (i: number) => restScreen(n, i)

/** The screen's shake on a hit at time `at`: whole pixels, decaying. */
export const shakeAt = (u: number, at: number, amp: number, dur = 0.3) => {
  const p = (u - at) / dur
  if (p < 0 || p >= 1) return { x: 0, y: 0 }
  const f = Math.floor((u - at) * 30)
  const k = amp * (1 - p)
  return { x: (f % 2 ? 1 : -1) * Math.round(k), y: ((f >> 1) % 2 ? 1 : -1) * Math.round(k * 0.5) }
}

/** A still scene's canvas at time u. */
export const idleAt = (r: Run, u: number) => (r.at(u), r.draw())

/** FIVE OF A KIND!, huge, slamming in at `land` with its two sounds (`hit` tells when to play them). */
export function fiveBanner(g: G, u: number, land: number, sounded: (t: number) => boolean) {
  if (u < land) return
  const k = 2.2 - 1.2 * outBack(span(u, land, land + 0.2), 2.2)
  const sh = Math.round(Math.sin(u * 70) * 6 * (1 - span(u, land, land + 0.6)))
  const b = F.banner
  const mid = ((b.lines.length - 1) * b.step) / 2
  g.save()
  g.translate(b.x + sh, b.y + mid)
  g.scale(k, k)
  b.lines.forEach((line, i) =>
    text(g, line, 0, i * b.step - mid, { size: b.size, color: '#ffbe2e', align: 'center', base: 'middle', ow: 14, drop: 16, dropColor: '#c4382a' }),
  )
  g.restore()
  if (sounded(land)) play('levelup')
  if (sounded(land + 0.18)) play('catch')
}

/** The screen burning from the bottom: three layers of flame tongues, red, orange, yellow. */
export function flameWipe(g: G, p: number, u: number) {
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


// ---------------------------------------------------------------- Charizard's roll
/**
 * Charizard's five dice in both cuts: 5 · 5 · 2 · 5 · 3; a hand taps the 2 and the 3 (lifted, red ring, their numbers
 * red) and presses REROLL, the way a player does; the two dice turn in a short slow motion onto 5s, the camera closer
 * but every die still in view, and FIVE OF A KIND lands on five gold-ringed 5s before the camera eases back for 95.
 */
export interface BigRoll {
  throw: number
  pops: number
  /** The hand's taps on the 2, then the 3. */
  taps: [number, number]
  /** REROLL pressed: the two dice are thrown again just after. */
  press: number
  /** The slow motion, in real time. */
  slowA: number
  slowB: number
  /** The camera eases back from here, and the damage lands. */
  out: number
  damage: number
}

const FIRST = [5, 5, 2, 5, 3]
const PICKED = [2, 4]
const SLOW = 0.3
// The middle die: closing in on it keeps the row centred, all five in view (the tray at a whole 6× at full zoom).
const ON = 2

const reroll = (b: Pick<BigRoll, 'press'>) => b.press + 0.05
export const bigRollLand = (b: Pick<BigRoll, 'press' | 'slowA' | 'slowB'>) => slowLanding(reroll(b), 0.5, b.slowA, b.slowB, SLOW)

export function bigRollPlan(b: BigRoll): TrayPlan {
  const land = bigRollLand(b)
  return {
    fills: [TYPE.fire, TYPE.fire, TYPE.fire, TYPE.flying, TYPE.flying],
    throws: [
      { t: b.throw, values: FIRST, dur: 0.55 },
      { t: reroll(b), values: [5, 5], which: PICKED, dur: 0.5 },
    ],
    picked: { t: b.taps, which: PICKED },
    slow: [PICKED, b.slowA, b.slowB, SLOW],
    combo: { t: land, which: [0, 1, 2, 3, 4] },
    flash: land,
    jump: land + 0.05,
  }
}

/** The plate's corner is the REROLL button's while the hand picks dice, then the close dice's, until the camera is back. */
// In portrait the plate would come back over the damage: it stays away until the cut.
export const bigRollBusy = (u: number, b: BigRoll) => u >= b.taps[0] - 0.4 && (F.portrait || u < b.out + 0.3)

const HAND = [
  '....kk......',
  '...kwwk.....',
  '...kwwk.....',
  '...kwwk.....',
  '...kwwkkk...',
  '...kwwkwwkk.',
  '.kkkwwkwwkwk',
  'kwwkwwwwwwwk',
  'kwwwwwwwwwsk',
  'kwwwwwwwwwsk',
  '.kwwwwwwwwsk',
  '.kwwwwwwwsk.',
  '..kwwwwwwsk.',
  '...kwwwwsk..',
  '...kkkkkkk..',
]
const HK = 6

/** The game's REROLL button (a secondary PixelButton): greyed until a die is picked, pushed in when pressed. */
function rerollButton(g: G, u: number, b: BigRoll) {
  const BUTTON = F.button
  const a = span(u, b.taps[0] - 0.4, b.taps[0] - 0.25) * (1 - span(u, b.press + 0.4, b.press + 0.55))
  if (a <= 0) return
  const down = u >= b.press && u < b.press + 0.12 ? 6 : 0
  g.save()
  g.globalAlpha = Math.round(a * 4) / 4
  if (u < b.taps[0]) g.globalAlpha *= 0.55
  panel(g, BUTTON.x, BUTTON.y + down, BUTTON.w, BUTTON.h - down, { lip: !down })
  text(g, 'REROLL (2)', BUTTON.x + BUTTON.w / 2, BUTTON.y + down + 66, { size: 56, color: INK, ow: 0, align: 'center' })
  g.restore()
}

/** The hand: in from the bottom right, onto the 2, the 3, then REROLL, dipping as it taps, and away. */
function hand(g: G, u: number, b: BigRoll) {
  const die = (i: number) => {
    const p = restScreen(5, i)
    return { x: p.x + 10, y: p.y - 40 }
  }
  const B = F.button
  const stops = [
    { t: b.taps[0] - 0.4, x: B.x + 110, y: B.y + 300 },
    { t: b.taps[0], ...die(PICKED[0]!) },
    { t: b.taps[1], ...die(PICKED[1]!) },
    { t: b.press, x: B.x + B.w / 2, y: B.y + 50 },
    { t: b.press + 0.45, x: B.x + 250, y: B.y + 320 },
  ]
  if (u < stops[0]!.t || u >= stops[4]!.t) return
  let j = 0
  while (j + 1 < stops.length && stops[j + 1]!.t <= u) j++
  const a = stops[j]!
  const z = stops[j + 1] ?? a
  // Rests on each stop, then travels to the next in the last 0.25 s before it.
  const p = inOut(span(u, Math.max(a.t, z.t - 0.25), z.t))
  const dip = j > 0 && j < 4 && u - a.t < 0.1 ? 10 : 0
  const x = a.x + (z.x - a.x) * p
  const y = a.y + (z.y - a.y) * p + dip
  sharpDraw(g, icon(HAND, { k: INK, w: '#ffffff', s: '#cfd6e4' }, 1), x - 4.5 * HK, y, 12 * HK, 15 * HK)
}

/** The roll's whole overlay at time u (from the throw to the attack): the tray, its readouts, the hand and the banner. */
export function bigRoll(g: G, u: number, b: BigRoll, sounded: (t: number) => boolean) {
  const land = bigRollLand(b)
  const zoom =
    1 + (F.zoom - 1) * (u < land ? outCubic(span(u, b.slowA, b.slowA + 0.4)) : 1 - inOut(span(u, b.out, b.out + 0.3)))
  celebrate(g, u, land, F.burst.x, F.burst.y)
  tray(g, bigRollPlan(b), u, zoom, ON)
  if (u >= land - 0.02 && u < land + 0.1) speedLines(g, F.burst.x, F.burst.y, u, { color: '#ffbe2e', inner: 260, a: 0.6 })
  const at = (i: number) => trayPoint(5, i, zoom, ON, 150)
  if (u < reroll(b))
    valuePops(g, FIRST, at, u, b.pops, (i) =>
      PICKED.includes(i) && u >= (b.taps[PICKED.indexOf(i)] ?? Infinity) ? '#f2553f' : GOLD,
    )
  else if (u >= land + 0.15) valuePops(g, [5, 5, 5, 5, 5], at, u, land + 0.15)
  rerollButton(g, u, b)
  hand(g, u, b)
  for (const t of [...b.taps, b.press]) if (sounded(t)) play('button')
  fiveBanner(g, u, land, sounded)
  damageSlam(g, 95, F.damage.x, F.damage.y, u, b.damage, { size: 230, shake: 16 })
}
