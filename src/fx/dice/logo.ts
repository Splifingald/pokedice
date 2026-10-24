// The title's dice logo (docs/38 §9): POKÉDICE as eight pixel-art dice thrown onto the page from the bottom right,
// rolling right to left and stopping a little crooked on their letters, then a white flash, a gold ring round each die
// and a gold ring spreading once over the floor. Ported from the trailer (`trailer/acts/title.ts`,
// `trailer/acts/end.ts` and `trailer/lib/cube.ts` on the trailer branch, docs/36 §2 and §7), with its camera changed
// so the letters land on whole pixels (`project`). Pure: where each die is at a moment, what that frame draws and which
// sounds it fires. `logoArt.ts` draws it; `components/DiceLogo.tsx` plays it.
import { DAYBREAK_TYPES } from '@/theme/colors'
import { LOGO_RING_FLAT, type LogoBox, type LogoLayout } from './logoSize'

export type { LogoLayout } from './logoSize'

export type V3 = readonly [number, number, number]
/** A rotation: three columns (where local x, y, z go). */
export type M3 = readonly [V3, V3, V3]

export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k]
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const norm = (a: V3): V3 => scale(a, 1 / Math.hypot(a[0], a[1], a[2]))
export const apply = (m: M3, v: V3): V3 => add(add(scale(m[0], v[0]), scale(m[1], v[1])), scale(m[2], v[2]))
export const mul = (a: M3, b: M3): M3 => [apply(a, b[0]), apply(a, b[1]), apply(a, b[2])]

/** Rotation by an angle about an axis (Rodrigues). */
export function rot(axis: V3, a: number): M3 {
  const [x, y, z] = norm(axis)
  const c = Math.cos(a)
  const s = Math.sin(a)
  const t = 1 - c
  return [
    [t * x * x + c, t * x * y + s * z, t * x * z - s * y],
    [t * x * y - s * z, t * y * y + c, t * y * z + s * x],
    [t * x * z + s * y, t * y * z - s * x, t * z * z + c],
  ]
}

// ---------------------------------------------------------------- the world and the camera
// x runs right, y away from the player (up the screen), z up from the floor; one unit is one art pixel.

/**
 * The six faces: normal, texture right (u) and texture down (v), seen from outside. Values on a standard die: opposite
 * faces add up to 7. The letter goes on face 0, the one that ends up.
 */
export const FACES: { n: V3; u: V3; v: V3; pips: number }[] = [
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, -1, 0], pips: 1 },
  { n: [0, 0, -1], u: [1, 0, 0], v: [0, 1, 0], pips: 6 },
  { n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, -1], pips: 3 },
  { n: [-1, 0, 0], u: [0, -1, 0], v: [0, 0, -1], pips: 4 },
  { n: [0, 1, 0], u: [-1, 0, 0], v: [0, 0, -1], pips: 2 },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, -1], pips: 5 },
]

/**
 * Where a point lands on screen, in art pixels from the origin. The trailer's camera looked down at 60°, which
 * squeezed the top faces to 87 % and left the letters' rows uneven. This one keeps the floor at one pixel per unit both
 * ways (a top face at rest is its texture pixel for pixel) and a height at half a pixel per unit: the same view, from
 * 63° and stretched 12 % up the screen.
 */
export const project = (p: V3) => ({ x: p[0], y: -p[1] - p[2] / 2 })
/** The direction the camera looks along (what `project` flattens away): a face turned this way is out of sight. */
export const VIEW: V3 = norm([0, 1, -2])

/**
 * The rotation that rests face `f` up (+z), its texture upright for the player (texture down = −y), turned by `yaw`
 * about the vertical.
 */
export function restOn(f: number, yaw = 0): M3 {
  const F = FACES[f]!
  // R maps n → z, u → x, v → −y: R = Σ target ⊗ local.
  const targets: [V3, V3][] = [
    [F.n, [0, 0, 1]],
    [F.u, [1, 0, 0]],
    [F.v, [0, -1, 0]],
  ]
  const col = (i: number): V3 => {
    let c: V3 = [0, 0, 0]
    for (const [loc, tgt] of targets) c = add(c, scale(tgt, loc[i]!))
    return c
  }
  const r: M3 = [col(0), col(1), col(2)]
  return yaw ? mul(rot([0, 0, 1], yaw), r) : r
}

// ---------------------------------------------------------------- a throw

/**
 * A die's flight: from a start point to its rest, rolling along the way (the turn follows the distance, so it stops
 * turning exactly when it arrives), bouncing, with a spin that dies out first.
 */
export interface Throw {
  from: V3
  to: V3
  /** When it's thrown and when it comes to rest (s). */
  t0: number
  t1: number
  /** Its resting turn: the face that ends up, and its yaw. */
  rest: M3
  /** Extra tumbling, radians at the start. */
  spin: number
  spinAxis: V3
  /** Heights of the arcs: the fall's start, then the two bounces. */
  arcs: readonly [number, number, number]
  /** A wobble on an edge after it arrives: amplitude, radians. */
  wobble: number
  size: number
}

// The fall takes the first 30 % of the flight, the bounces 30 % and 18 %, then it slides to rest.
const FALL = 0.3
const BOUNCE1 = 0.3
const BOUNCE2 = 0.18

/** Where a thrown die is at time t, how it's turned, and when it touches the floor (its first three contacts). */
export function throwAt(th: Throw, t: number): { pos: V3; R: M3; landings: number[] } {
  const dur = th.t1 - th.t0
  const p = Math.max(0, Math.min(1, (t - th.t0) / dur))
  const travel = 1 - (1 - p) ** 2.4
  const [z0, b1, b2] = th.arcs
  let z = 0
  if (p < FALL) z = z0 * (1 - (p / FALL) ** 2)
  else if (p < FALL + BOUNCE1) {
    const u = (p - FALL) / BOUNCE1
    z = 4 * b1 * u * (1 - u)
  } else if (p < FALL + BOUNCE1 + BOUNCE2) {
    const u = (p - FALL - BOUNCE1) / BOUNCE2
    z = 4 * b2 * u * (1 - u)
  }
  const h = th.size / 2
  const pos: V3 = [
    th.from[0] + (th.to[0] - th.from[0]) * travel,
    th.from[1] + (th.to[1] - th.from[1]) * travel,
    h + z,
  ]
  // Rolling: the turn still to come is the distance still to go over the die's rolling radius.
  const dir: V3 = [th.to[0] - th.from[0], th.to[1] - th.from[1], 0]
  const len = Math.hypot(dir[0], dir[1]) || 1
  const axis = norm([-dir[1] / len, dir[0] / len, 0.0001])
  // Negative: the angle grows toward zero as it travels, so it rolls forward.
  let R = mul(rot(axis, -(len * (1 - travel)) / (h * 1.15)), th.rest)
  if (th.spin) {
    const k = Math.max(0, 1 - p / 0.6)
    R = mul(rot(th.spinAxis, th.spin * k * k * k), R)
  }
  if (th.wobble && p >= 1) {
    const tau = t - th.t1
    R = mul(rot(axis, th.wobble * Math.exp(-tau * 7) * Math.sin(tau * 26)), R)
  }
  return {
    pos,
    R,
    landings: [th.t0 + FALL * dur, th.t0 + (FALL + BOUNCE1) * dur, th.t0 + (FALL + BOUNCE1 + BOUNCE2) * dur],
  }
}

// ---------------------------------------------------------------- the logo

export const LETTERS = ['P', 'O', 'K', 'É', 'D', 'I', 'C', 'E'] as const
const T = DAYBREAK_TYPES
export const FILLS = [T.fire, T.water, T.grass, T.electric, T.psychic, T.ice, T.dragon, T.fairy]
/** A die's edge: 28 art pixels (56 CSS px), the letters' dots three pixels each. */
export const SIZE = 28
const H = SIZE / 2
/** One row: the gap between two dice. */
const GAP = 6
/** Two rows (POKÉ over DICE): a die and its gap, and how far each row is from the middle. */
const TALL_PITCH = SIZE + 9
const TALL_ROW = 24
// Thrown, not typeset: each die's turn and its step off the line (the trailer's).
const YAW = [0.08, -0.05, 0.1, -0.08, 0.03, -0.1, 0.06, -0.04]
const OFF = [1.5, -1, 0.5, -2, 1, -0.5, 2, -1.5]

/** Die i's resting place on the floor (x, y): one row, or POKÉ over DICE. */
export function restOf(i: number, layout: LogoLayout): readonly [number, number] {
  return layout === 'tall'
    ? [((i % 4) - 1.5) * TALL_PITCH, OFF[i]! * 0.5 + (i < 4 ? TALL_ROW : -TALL_ROW)]
    : [(i - 3.5) * (SIZE + GAP), OFF[i]!]
}

/**
 * How the logo forms, from the motion level (docs/15 §8): `throw` (full) the trailer's throw; `drop` (short) the
 * trailer's end card, the dice dropping in one after another, no rolling; `calm` (the OS asks for less motion) each die
 * two pixels up, one, down, as the game's calm dice, with no flash and no ring; `rest` (off) at rest at once.
 */
export type LogoMode = 'throw' | 'drop' | 'calm' | 'rest'

/** The thrown dice: how far toward the player they start, and how long each takes. */
const DEPTH = 76
const THROW_DUR = 1.15
const STAGGER = 0.04
/** The drop (`drop`): the end card's. */
const DROP = { first: 0.1, stagger: 0.05, dur: 0.36, from: 96 }
/** `calm`: the game's calm dice (fx/dice/solve.ts): two steps of a fifteenth of a second each. */
const CALM = { stagger: 0.05, step: 1 / 15 }
const CALM_END = 7 * CALM.stagger + 2 * CALM.step

interface Beats {
  /** The flash, the gold ring round each die: when the logo is formed. */
  combo: number
  flash: boolean
  /** The gold ring spreading over the floor, once. */
  ring: readonly [number, number] | null
  /** "Roll · Battle · Catch" comes in, in four steps. */
  tagline: readonly [number, number]
  /** Nothing moves after this: the last frame is the logo at rest. */
  end: number
}
export const BEATS: Record<LogoMode, Beats> = {
  throw: { combo: 1.5, flash: true, ring: [1.5, 2.1], tagline: [2.0, 2.3], end: 2.3 },
  drop: { combo: 0.85, flash: true, ring: [0.85, 1.45], tagline: [1.0, 1.3], end: 1.45 },
  calm: { combo: CALM_END, flash: false, ring: null, tagline: [CALM_END, CALM_END], end: CALM_END },
  rest: { combo: 0, flash: false, ring: null, tagline: [0, 0], end: 0 },
}

const span = (t: number, a: number, b: number) =>
  b <= a ? (t >= a ? 1 : 0) : Math.max(0, Math.min(1, (t - a) / (b - a)))
/** Four steps, never a smooth fade (docs/15 §8). */
const quarters = (p: number) => Math.round(p * 4) / 4

/** Die i's throw. `edge`: how far right of the logo's middle the canvas ends; every die comes in from past it. */
export function throwOf(i: number, layout: LogoLayout, edge: number): Throw {
  const [x, y] = restOf(i, layout)
  const t0 = i * STAGGER
  return {
    from: [edge + 30 + i * 8, y - DEPTH - (7 - i) * 2, 0],
    to: [x, y, 0],
    t0,
    t1: t0 + THROW_DUR + (i === 7 ? 0.05 : 0),
    rest: restOn(0, YAW[i]!),
    spin: 10 + (i % 3) * 3,
    spinAxis: [0.2 + (i % 2) * 0.5, 0.6, 1],
    arcs: [76 + (i % 3) * 12, 24 - (i % 2) * 6, 7],
    // The last one rocks on an edge before it settles.
    wobble: i === 7 ? 0.5 : 0,
    size: SIZE,
  }
}

export interface LogoDie {
  /** Its centre (z: the centre's height above the floor). */
  pos: V3
  R: M3
  fill: string
  /** The six faces' contents in FACES order: the letter on top, pips elsewhere. */
  faces: readonly (number | string)[]
  size: number
  /** Not thrown in yet (the drops come one after another). */
  show: boolean
}

const facesOf = (i: number) => FACES.map((f, k) => (k === 0 ? LETTERS[i]! : f.pips))
const FACE_SETS = LETTERS.map((_, i) => facesOf(i))

/** The eight dice at time t (s since the throw). */
export function logoDice(t: number, mode: LogoMode, layout: LogoLayout, edge = 200): LogoDie[] {
  return LETTERS.map((_, i) => {
    const [x, y] = restOf(i, layout)
    const die = { fill: FILLS[i]!, faces: FACE_SETS[i]!, size: SIZE }
    const rest = restOn(0, YAW[i]!)
    if (mode === 'throw') {
      const at = throwAt(throwOf(i, layout, edge), t)
      return { ...die, pos: at.pos, R: at.R, show: true }
    }
    if (mode === 'drop') {
      const a = DROP.first + i * DROP.stagger
      const p = span(t, a, a + DROP.dur)
      const fall = p < 0.7 ? (1 - p / 0.7) ** 2 * DROP.from : Math.sin(((p - 0.7) / 0.3) * Math.PI) * 7
      return { ...die, pos: [x, y, H + fall], R: rest, show: t >= a }
    }
    if (mode === 'calm') {
      const a = i * CALM.stagger
      // Two art pixels up, then one, then down: a pixel up the screen is two units of height.
      const up = t < a + CALM.step ? 2 : t < a + 2 * CALM.step ? 1 : 0
      return { ...die, pos: [x, y, H + up * 2], R: rest, show: t >= a }
    }
    return { ...die, pos: [x, y, H], R: rest, show: true }
  })
}

/** What one frame draws. */
export interface LogoFrame {
  /** Back to front. */
  dice: (LogoDie & { flash: boolean; ring: boolean })[]
  /** Smears behind the dice still high in the air: the frames before, ordered-dithered at `density`. */
  ghosts: { die: LogoDie; density: number }[]
  /** The gold ring over the floor, round the logo's middle: its radius, how flat it lies, how much of it is left. */
  ring: { r: number; flat: number; density: number } | null
  /** The tagline's opacity, in quarters. */
  tagline: number
  /** The last frame: the logo at rest. */
  done: boolean
}

const RING_FROM = 30
const RING_TO = 300

export function logoFrame(t: number, mode: LogoMode, layout: LogoLayout, edge = 200): LogoFrame {
  const b = BEATS[mode]
  const done = t >= b.end
  // From the end on, exactly the resting logo (the E's wobble has died out well before).
  const time = done ? Math.max(b.end, 10) : t
  const now = logoDice(time, mode, layout, edge)
  const formed = t >= b.combo
  const flash = b.flash && t >= b.combo && t < b.combo + 2 / 60
  const dice = now
    .map((d) => ({ ...d, flash, ring: formed }))
    .filter((d) => d.show)
    .sort((a, c) => c.pos[1] - a.pos[1])
  const ghosts: LogoFrame['ghosts'] = []
  if (mode === 'throw' && !done)
    for (const [back, density] of [
      [2 / 60, 0.2],
      [1 / 60, 0.35],
    ] as const) {
      if (t - back <= 0) continue
      logoDice(t - back, mode, layout, edge).forEach((d, i) => {
        if (now[i]!.pos[2] > SIZE * 0.9) ghosts.push({ die: d, density })
      })
    }
  let ring: LogoFrame['ring'] = null
  if (b.ring && t >= b.ring[0] && t < b.ring[1]) {
    const p = span(t, b.ring[0], b.ring[1])
    ring = {
      r: RING_FROM + (RING_TO - RING_FROM) * p,
      flat: LOGO_RING_FLAT[layout],
      density: quarters(1 - p),
    }
  }
  return { dice, ghosts, ring, tagline: quarters(span(t, b.tagline[0], b.tagline[1])), done }
}

export type LogoCue = 'rattle' | 'land' | 'chime'

/**
 * The sounds, in time order: the rattle as the dice leave the hand, a click on each die's first two contacts, a
 * chime when the logo is formed. `calm` has no clicks (as the game's calm dice), `rest` no sound at all.
 */
export function logoCues(mode: LogoMode, layout: LogoLayout = 'wide'): { t: number; cue: LogoCue }[] {
  const out: { t: number; cue: LogoCue }[] = []
  if (mode === 'rest') return out
  if (mode === 'throw') {
    out.push({ t: 0.02, cue: 'rattle' })
    LETTERS.forEach((_, i) =>
      throwAt(throwOf(i, layout, 200), 0)
        .landings.slice(0, 2)
        .forEach((t) => out.push({ t, cue: 'land' })),
    )
  }
  if (mode === 'drop')
    LETTERS.forEach((_, i) => out.push({ t: DROP.first + i * DROP.stagger + 0.7 * DROP.dur, cue: 'land' }))
  out.push({ t: BEATS[mode].combo, cue: 'chime' })
  return out.sort((a, b) => a.t - b.t)
}

/**
 * The resting logo's box on screen, in whole art pixels from the origin (`project`'s), the gold ring round each die
 * included: what the page keeps room for (`logoSize.ts` holds it as numbers, checked against this by a test).
 */
export function logoBox(layout: LogoLayout): LogoBox {
  let x0 = Infinity
  let x1 = -Infinity
  let y0 = Infinity
  let y1 = -Infinity
  for (const d of logoDice(10, 'rest', layout))
    for (const sx of [-H, H])
      for (const sy of [-H, H])
        for (const sz of [-H, H]) {
          const c = apply(d.R, [sx, sy, sz])
          const s = project([d.pos[0] + c[0], d.pos[1] + c[1], d.pos[2] + c[2]])
          x0 = Math.min(x0, s.x)
          x1 = Math.max(x1, s.x)
          y0 = Math.min(y0, s.y)
          y1 = Math.max(y1, s.y)
        }
  // Two pixels more each way: the ring's, and a turned top face's corner, which the shears can push a pixel out.
  return { x0: Math.floor(x0) - 2, x1: Math.ceil(x1) + 2, y0: Math.floor(y0) - 2, y1: Math.ceil(y1) + 2 }
}
