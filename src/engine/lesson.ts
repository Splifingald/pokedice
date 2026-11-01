// The reroll lesson (docs/46 §6): in a new player's first fight, their first throw is an average hit that leaves the
// foe standing, their second the worst their dice can do; a hand has them pick every die and REROLL, and the reroll
// lands a pair of 4s, whose combo bonus the guide shows before the ATTACK that finishes the foe. The foe's throws are
// set too (a 2, then a 1 rerolled into a 3), so the fight plays the same for everyone. This file is the rigging;
// battle.ts's reducer calls it.
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
  /** The foe's throws so far this fight (absent in a fight saved before they were set). */
  foeThrows?: number
}

/** A throw's damage to the foe, as the attack would deal it (battle.ts passes its own computeDamage). */
export type LessonHit = (dice: readonly RolledDie[]) => number

/** The foe's throws, in order: each die shows `value`, then `reroll` when it has one (the user's call, 2026-10-31). */
export const LESSON_FOE: readonly { value: number; reroll?: number }[] = [
  { value: 2 },
  { value: 1, reroll: 3 },
]

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

/** Every throw these dice can make (null when there are too many to look at). */
function everyThrow(types: readonly DieType[], data: GameData): RolledDie[][] | null {
  const faces = types.map((t) => facesOf(t, data))
  const total = faces.reduce((n, f) => n * f.length, 1)
  if (!types.length || total === 0 || total > MAX_THROWS) return null
  return Array.from({ length: total }, (_, n) => {
    let k = n
    return types.map((type, i) => {
      const count = faces[i]!.length
      const faceIndex = k % count
      k = Math.floor(k / count)
      return { type, faceIndex }
    })
  })
}

/** A throw with no combo and no status face: a plain hit, nothing to explain yet. */
const plain = (dice: readonly RolledDie[], data: GameData) => {
  const faces = dice.map((d) => facesOf(d.type, data)[d.faceIndex]!)
  return faces.every((f) => f.kind === 'number') && !detectCombos(faces.map((f) => f.value)).length
}

/**
 * The first throw's damage window: below the foe's HP (it stays standing for the lesson), and enough that the pair the
 * reroll lands finishes it. Null when the dice can't pair.
 */
export function lessonWindow(
  types: readonly DieType[],
  data: GameData,
  hit: LessonHit,
  foeHp: number,
): { min: number; max: number } | null {
  const value = lessonPairValue(types, data)
  if (value == null) return null
  const pair = types.map((type) => ({ type, faceIndex: plainFace(type, value, data) }))
  return { min: foeHp - hit(pair), max: foeHp - 1 }
}

/**
 * The lesson's first throw: an average hit, the plain throw whose damage is nearest the dice's mean (its dice close to
 * each other), inside the window (`lessonWindow`). Null when no throw fits: the throw is then left to chance.
 */
export function lessonFirstRoll(
  types: readonly DieType[],
  data: GameData,
  hit: LessonHit,
  foeHp: number,
): RolledDie[] | null {
  const window = lessonWindow(types, data, hit, foeHp)
  const all = everyThrow(types, data)
  if (!window || !all) return null
  const scored = all.map((dice) => ({ dice, damage: hit(dice) }))
  const mean = scored.reduce((n, t) => n + t.damage, 0) / scored.length
  const fits = scored.filter((t) => t.damage >= window.min && t.damage <= window.max)
  const pool = fits.some((t) => plain(t.dice, data)) ? fits.filter((t) => plain(t.dice, data)) : fits
  // Nearest the mean; on a tie, the dice closest to each other (a 3 and a 4 reads as average, a 6 and a 1 doesn't).
  const spread = (dice: readonly RolledDie[]) => {
    const v = dice.map((d) => facesOf(d.type, data)[d.faceIndex]!.value)
    return Math.max(...v) - Math.min(...v)
  }
  const off = (t: (typeof pool)[number]) => Math.abs(t.damage - mean)
  const best = pool.reduce<(typeof pool)[number] | null>(
    (b, t) => (!b || off(t) < off(b) || (off(t) === off(b) && spread(t.dice) < spread(b.dice)) ? t : b),
    null,
  )
  return best?.dice ?? null
}

/** Every die of the foe showing `value` (its plain face); null when one has no such face. */
export function lessonFoeRoll(types: readonly DieType[], value: number, data: GameData): RolledDie[] | null {
  const dice = types.map((type) => ({ type, faceIndex: plainFace(type, value, data) }))
  return dice.length && dice.every((d) => d.faceIndex >= 0) ? dice : null
}
