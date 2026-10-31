// The reroll lesson (docs/46 §6): in a new player's first fight, their second throw is the worst their dice can do, a
// hand has them pick every die and REROLL, and the reroll lands a pair of 4s, whose combo bonus the guide shows before
// ATTACK. The fight decides nothing else differently. This file is the rigging; battle.ts's reducer calls it.
import { detectCombos } from './combos'
import { facesOf, type RolledDie } from './dice'
import type { DieType, GameData } from './types'

/**
 * Where the lesson is in a fight: waiting for its throw (`throws` counts the player's), the bad throw down and the
 * reroll to make, the pair down and ATTACK to press, or over.
 */
export interface RerollLesson {
  step: 'wait' | 'reroll' | 'attack' | 'done'
  throws: number
}

/** The throw the lesson rigs: the player's second of the fight. */
export const LESSON_THROW = 2
/** The pair the reroll lands, when every die has that number. */
export const LESSON_PAIR = 4

/** Throws looked at before falling back to each die's lowest face (a starter has 2 dice: 36 throws). */
const MAX_THROWS = 6 ** 4

/** One face's worth: its number, a status face's far more. */
const worthOne = (f: { kind: string; value: number }) => f.value + (f.kind === 'status' ? 50 : 0)

/**
 * The worst throw these dice can make: the least damage, so no combo, and no status face (a burn or a heal still does
 * something). Each die's lowest plain number when there are too many dice to look at every throw.
 */
export function lessonBadRoll(types: readonly DieType[], data: GameData): RolledDie[] {
  const faces = types.map((t) => facesOf(t, data))
  const worth = (dice: readonly number[]) => {
    const shown = dice.map((f, i) => faces[i]![f]!)
    const sum = shown.reduce((s, f) => s + f.value, 0)
    const statuses = shown.filter((f) => f.kind === 'status').length
    // A combo or a status face makes a throw better than any plain one.
    return sum + (detectCombos(shown.map((f) => f.value)).length ? 100 : 0) + statuses * 50
  }
  const total = faces.reduce((n, f) => n * Math.max(1, f.length), 1)
  if (total > MAX_THROWS || faces.some((f) => !f.length)) {
    return types.map((type, i) => {
      const list = faces[i]!
      const best = list.reduce((b, f, j) => (b < 0 || worthOne(f) < worthOne(list[b]!) ? j : b), -1)
      return { type, faceIndex: Math.max(0, best) }
    })
  }
  let best: number[] | null = null
  let bestWorth = Infinity
  for (let n = 0; n < total; n++) {
    let k = n
    const pick = faces.map((f) => {
      const j = k % f.length
      k = Math.floor(k / f.length)
      return j
    })
    const w = worth(pick)
    if (w < bestWorth) {
      best = pick
      bestWorth = w
    }
  }
  return types.map((type, i) => ({ type, faceIndex: best![i]! }))
}

/** A die's plain face showing `value`, if it has one. */
const plainFace = (type: DieType, value: number, data: GameData): number =>
  facesOf(type, data).findIndex((f) => f.kind === 'number' && f.value === value)

/**
 * The number the reroll's pair shows: 4 when every die has a plain 4 (every starter's does), else the highest plain
 * number they all have; null when they share none (the reroll is then a plain one).
 */
export function lessonPairValue(types: readonly DieType[], data: GameData): number | null {
  if (!types.length) return null
  const shared = (v: number) => types.every((t) => plainFace(t, v, data) >= 0)
  if (shared(LESSON_PAIR)) return LESSON_PAIR
  const values = [...new Set(facesOf(types[0]!, data).map((f) => f.value))].sort((a, b) => b - a)
  return values.find(shared) ?? null
}

/**
 * The lesson's reroll: the picked dice land on the pair's number (the kept ones stay). Null when the dice share no
 * number to pair on: the caller then rerolls as usual.
 */
export function lessonPairRoll(
  dice: readonly RolledDie[],
  mask: readonly boolean[],
  data: GameData,
): RolledDie[] | null {
  const value = lessonPairValue(
    dice.map((d) => d.type),
    data,
  )
  if (value == null) return null
  return dice.map((d, i) => (mask[i] ? { type: d.type, faceIndex: plainFace(d.type, value, data) } : d))
}
