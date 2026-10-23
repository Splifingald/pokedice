// The dice overlay of the journey's fights: a row of the game's dice thrown in over the bottom of the stage, rerolls
// for the ones picked (lifted, red ring), the combo's gold ring. Drawn as 3D cubes on a 480×270 canvas (×4).
import { canvas } from '@/fx/pixel'
import { drawDie, drawShadow, faceOf, FACES, restOn, throwAt, type Throw, type View } from './cube'
import { play } from './audio'
import { hit } from './clock'

export const TRAY_W = 480
export const TRAY_H = 270
export const TRAY_K = 4
const SIZE = 30
const GAP = 10

export interface TrayPlan {
  fills: string[]
  /** Each throw: when, the values the thrown dice land on, which dice (all by default), how long it rolls. */
  throws: { t: number; values: number[]; which?: number[]; dur?: number }[]
  /** Dice lifted for a reroll (red ring), from when until their throw. */
  picked?: { t: number; which: number[] }
  /** The combo's dice (gold ring) from when. */
  combo?: { t: number; which: number[] }
  /** A white flash on every die (the five of a kind landing). */
  flash?: number
  /** Where the row sits (tray pixels): its centre and baseline. */
  y?: number
  /** The tray's own time stretch for one die (the slow-motion one): [die, from, to, factor]. */
  slow?: [number, number, number, number]
  /** The dice hop for joy from this time (the celebration). */
  jump?: number
}

/** When a slowed die lands, in real time: thrown at t0 for `dur` of its own time, slowed by f between a and b. */
export function slowLanding(t0: number, dur: number, a: number, b: number, f: number) {
  const before = a - t0
  const inside = (b - a) * f
  return before + inside >= dur ? t0 + (dur - before) / f + (a - t0) : b + (dur - before - inside)
}

const tray = canvas(TRAY_W, TRAY_H)
const view: View = { tilt: (72 * Math.PI) / 180, cs: 1, cx: TRAY_W / 2, cy: 0 }

const yaws = [0.05, -0.04, 0.03, -0.06, 0.02, -0.03]

/** Draw the tray at time t (seconds, the act's clock). Returns the canvas, to scale ×4 onto the screen. */
export function drawTray(plan: TrayPlan, t: number) {
  const g = tray.g
  g.clearRect(0, 0, TRAY_W, TRAY_H)
  const n = plan.fills.length
  const rowW = n * SIZE + (n - 1) * GAP
  const baseY = plan.y ?? 228
  const draws: { i: number; d: Parameters<typeof drawDie>[2] }[] = []
  for (let i = 0; i < n; i++) {
    const thrown = plan.throws.filter((th) => !th.which || th.which.includes(i))
    let k = -1
    thrown.forEach((th, j) => t >= th.t && (k = j))
    if (k < 0) continue
    const th = thrown[k]!
    const value = th.values[th.which ? th.which.indexOf(i) : i]!
    const restX = -rowW / 2 + SIZE / 2 + i * (SIZE + GAP)
    // Resting, its centre is SIZE/2 up: screen y = −y·sin(tilt) − z·cos(tilt) = baseY.
    const restY = -(baseY + (SIZE / 2) * Math.cos(view.tilt)) / Math.sin(view.tilt)
    const first = k === 0
    const dur = th.dur ?? 0.62
    // The first throw comes in from the left, low and fast; a reroll hops up in place.
    const fl: Throw = {
      from: first ? [restX - 260 - i * 18, restY - 30, 0] : [restX - 34, restY + 6, 0],
      to: [restX, restY, 0],
      t0: th.t + (first ? i * 0.035 : 0),
      t1: th.t + (first ? i * 0.035 : 0) + dur,
      rest: restOn(faceOf(value), yaws[i % yaws.length]!),
      spin: first ? 9 : 7,
      spinAxis: [0.4, 0.3, 1],
      arcs: first ? [SIZE * 2.2, SIZE * 1.0, SIZE * 0.3] : [SIZE * 3, SIZE * 0.8, SIZE * 0.25],
      size: SIZE,
    }
    let tt = t
    if (plan.slow && plan.slow[0] === i && t > plan.slow[1]) {
      const [, a, b, f] = plan.slow
      tt = a + (Math.min(t, b) - a) * f + Math.max(0, t - b)
    }
    const at = throwAt(fl, tt)
    if (tt < fl.t0) continue
    // Sounds on the real clock: the throw's rattle, then a landing per bounce.
    if (hit(fl.t0) && i === (th.which?.[0] ?? 0)) play('rattle')
    for (const L of at.landings.slice(0, 2)) if (hit(L)) play('land')
    // Picked: lifted with the red ring until its reroll is thrown.
    const pick = plan.picked
    const pickedNow =
      !!pick && t >= pick.t && pick.which.includes(i) && !plan.throws.some((x) => x.which?.includes(i) && x.t > pick.t && t >= x.t)
    const combo = plan.combo && t >= plan.combo.t && plan.combo.which.includes(i)
    const pos = at.pos
    const joy = plan.jump != null && t >= plan.jump ? Math.abs(Math.sin((t - plan.jump) * 9 - i * 0.7)) * 10 * (1 - Math.min(1, (t - plan.jump) / 1.6)) : 0
    draws.push({
      i,
      d: {
        pos: [pos[0], pos[1], pos[2] + (pickedNow ? 3 : 0) + joy],
        R: at.R,
        fill: plan.fills[i]!,
        faces: FACES.map((f) => f.pips),
        size: SIZE,
        ring: pickedNow ? '#f2553f' : combo ? '#ffbe2e' : null,
        flash: plan.flash != null && t >= plan.flash ? Math.max(0, 1 - (t - plan.flash) / 0.25) : 0,
      },
    })
  }
  for (const { d } of draws) drawShadow(g, view, d, 'rgba(0,0,0,0.35)')
  // Back to front: the ones further away first.
  draws.sort((a, b) => b.d.pos[1] - a.d.pos[1])
  for (const { d } of draws) drawDie(g, view, d)
  return tray
}

/** Where die i rests on the screen (1920×1080), for the numbers drawn over the tray. */
export function restScreen(n: number, i: number, baseY = 228) {
  const rowW = n * SIZE + (n - 1) * GAP
  const x = TRAY_W / 2 - rowW / 2 + SIZE / 2 + i * (SIZE + GAP)
  return { x: x * TRAY_K, y: baseY * TRAY_K }
}
