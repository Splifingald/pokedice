import { chartKey } from './data'
import type { DieType, PokeType } from './types'

/** Nothing hits harder than double, however many of the defender's types it beats. */
export const MAX_TYPE_MULTIPLIER = 2
/** …and nothing short of an immunity hits softer than half, however many of them resist it. */
export const MIN_TYPE_MULTIPLIER = 0.5

/**
 * Gen 6+ chart, product over the defender's types, clamped: mult(atk,def1) × mult(atk,def2) ∈ {0, 0.5, 1, 2}.
 * A double weakness lands as a single one — ×4 on top of dice, combos and upgrades took most fights out of the
 * player's hands in one roll, either way round — and a double resistance as a single one, ×½ rather than ×¼.
 * An immunity stays ×0. The Base die is untyped and always neutral.
 */
export function typeMultiplier(
  chart: Record<string, number>,
  attacking: DieType,
  defending: readonly PokeType[],
): number {
  if (attacking === 'base') return 1
  let m = 1
  for (const d of defending) m *= chart[chartKey(attacking, d)] ?? 1
  if (m === 0) return 0
  return Math.min(Math.max(m, MIN_TYPE_MULTIPLIER), MAX_TYPE_MULTIPLIER)
}
