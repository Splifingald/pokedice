import { chartKey } from './data'
import type { DieType, PokeType } from './types'

/** Nothing hits harder than double, however many of the defender's types it beats. */
export const MAX_TYPE_MULTIPLIER = 2

/**
 * Gen 6+ chart, product over the defender's types, capped: mult(atk,def1) × mult(atk,def2) ∈ {0, 0.25, 0.5, 1, 2}.
 * A double weakness lands as a single one — ×4 on top of dice, combos and upgrades took most fights out of the
 * player's hands in one roll, either way round. Resistances still stack, so ×¼ remains.
 * The Base die is untyped and always neutral.
 */
export function typeMultiplier(
  chart: Record<string, number>,
  attacking: DieType,
  defending: readonly PokeType[],
): number {
  if (attacking === 'base') return 1
  let m = 1
  for (const d of defending) m *= chart[chartKey(attacking, d)] ?? 1
  return Math.min(m, MAX_TYPE_MULTIPLIER)
}
