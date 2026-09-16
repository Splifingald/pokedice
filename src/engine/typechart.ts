import { chartKey } from './data'
import type { DieType, PokeType } from './types'

/**
 * Gen 6+ chart, product over the defender's types: mult(atk,def1) × mult(atk,def2) ∈ {0, 0.25, 0.5, 1, 2, 4}.
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
  return m
}
