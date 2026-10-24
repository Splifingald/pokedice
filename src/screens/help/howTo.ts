// How to play's cards (docs/38 §8b), the parts without React: the made-up fight they show, with every number from the
// engine, and the clock they run on. The clock steps in fixed ticks, so every frame of a card is a pure function of its
// time: a still is a time, the end state is the card's length, and a loop starts over after a short pause. Tested
// without a page in tests/how-to-play.test.ts.
import {
  ballBonus,
  catchValueOf,
  comboDice,
  computeDamage,
  faceOf,
  makeBattler,
  sureThrow,
  type Battler,
  type DamageResult,
  type DieType,
  type Face,
  type GameData,
  type RolledDie,
} from '@/engine'

/** Charmeleon (two fire dice and a Base one) against a Machop: hit ×1 by fire, caught on a 3 with a Poké Ball. */
export const ME = { dex: 5, level: 16 }
export const FOE = { dex: 66, level: 6 }
/** The throw; the reroll brings the second die back as the first one's number, for the pair. */
export const THROW = [5, 2, 3]
export const REROLLED = 1

export interface ShownDie {
  type: DieType
  face: Face
}

export interface Demo {
  me: Battler
  foe: Battler
  first: ShownDie[]
  after: ShownDie[]
  hit: DamageResult
  /** The dice of the combo after the reroll. */
  ring: number[]
  /** The catch die, the Poké Ball's bonus and the need; none when a Poké Ball can't miss. */
  catchRoll: { die: number; bonus: number; need: number } | null
}

/** The face of a die type showing this number (or its first number face): the throw is made up, the faces are real. */
function faceIndex(type: DieType, value: number, data: GameData): number {
  const faces = data.diceTypes[type]?.faces ?? []
  const at = faces.findIndex((f) => f.kind === 'number' && f.value === value)
  return at >= 0
    ? at
    : Math.max(
        0,
        faces.findIndex((f) => f.kind === 'number'),
      )
}

/** The fight the cards show, as the engine plays it: the dice, the damage, the combo, the catch. */
export function makeDemo(data: GameData): Demo | null {
  if (!data.species[ME.dex] || !data.species[FOE.dex]) return null
  const me = makeBattler({ uid: 'howto-me', dex: ME.dex, level: ME.level, hp: Infinity }, data)
  const foe = makeBattler({ uid: 'howto-foe', dex: FOE.dex, level: FOE.level, hp: Infinity }, data)
  const first: RolledDie[] = me.dice
    .slice(0, THROW.length)
    .map((type, i) => ({ type, faceIndex: faceIndex(type, THROW[i]!, data) }))
  const after = first.map((d, i) =>
    i === REROLLED ? { ...d, faceIndex: faceIndex(d.type, THROW[0]!, data) } : d,
  )
  const hit = computeDamage(after, me.types, foe.types, { comboLevels: {}, dieLevels: {} }, data)
  const shown = (dice: RolledDie[]) => dice.map((d) => ({ type: d.type, face: faceOf(d, data) }))
  const need = catchValueOf(data, FOE.dex)
  const bonus = ballBonus(data.items['poke-ball'])
  return {
    me,
    foe,
    first: shown(first),
    after: shown(after),
    hit,
    ring: hit.combo
      ? comboDice(
          hit.perDie.map((p) => p.value),
          hit.combo.key,
        )
      : [],
    // The lowest die that catches it with the ball: the ball's +1 is what makes the catch, as the card says.
    catchRoll: sureThrow({ bonus, need })
      ? null
      : { die: Math.min(6, Math.max(1, need - bonus)), bonus, need },
  }
}

/** One step of a card's clock: pixel motion moves in steps (docs/15 §8), 20 a second. */
export const TICK_MS = 50
/** The rest on a card's last frame before its loop starts over. */
export const LOOP_PAUSE_MS = 1400

/**
 * How a card runs at the player's motion level: `loop` (full motion: it plays and starts over), `still` (the OS asks
 * for less motion: a still of its key moment until PLAY plays it once), `off` (no animations: PLAY shows its end).
 */
export type HowToMode = 'loop' | 'still' | 'off'

export interface Clock {
  /** Milliseconds into the card, a whole number of ticks. */
  t: number
  /** Bumped by each new run (a loop starting over, a PLAY): the dice's roll keys, so each run throws them again. */
  round: number
  running: boolean
}

export type ClockAction =
  | { kind: 'tick'; length: number; loop: boolean }
  | { kind: 'play'; length: number; off: boolean }
  | { kind: 'reset'; mode: HowToMode; still: number }

export const startClock = (mode: HowToMode, still: number): Clock =>
  mode === 'loop' ? { t: 0, round: 0, running: true } : { t: still, round: 0, running: false }

export function clockStep(c: Clock, a: ClockAction): Clock {
  switch (a.kind) {
    case 'tick': {
      if (!c.running) return c
      const t = c.t + TICK_MS
      if (a.loop)
        return t >= a.length + LOOP_PAUSE_MS ? { t: 0, round: c.round + 1, running: true } : { ...c, t }
      // Played once: it stays on its last frame.
      return t >= a.length ? { ...c, t: a.length, running: false } : { ...c, t }
    }
    case 'play':
      // No animations: PLAY shows the end at once.
      return a.off
        ? { t: a.length, round: c.round + 1, running: false }
        : { t: 0, round: c.round + 1, running: true }
    case 'reset':
      return { ...startClock(a.mode, a.still), round: c.round + 1 }
  }
}

/** A hit's two white frames (docs/15 §8), far enough apart that nothing flashes more than 3 times a second. */
export const FLASHES_MS = [0, 400] as const
export const FLASH_MS = 100

/** Whether a sprite hit at `hit` is a white silhouette at `t`. */
export const whiteAt = (t: number, hit: number): boolean =>
  FLASHES_MS.some((at) => t >= hit + at && t < hit + at + FLASH_MS)

/** Where a move from `a` to `b` over [from, to] stands at `t`, on the 2 px art grid (in steps, never a glide). */
export function stepTo(t: number, from: number, to: number, a: number, b: number): number {
  const s = to > from ? Math.max(0, Math.min(1, (t - from) / (to - from))) : t >= to ? 1 : 0
  return Math.round((a + (b - a) * s) / 2) * 2
}
