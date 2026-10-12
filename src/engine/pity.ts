// Pity: what a player hasn't got from an area yet (its once-only finds, its wild Pokémon not caught) gets likelier
// with the rounds they've done there, so a long grind ends.
import type { PityConfig } from './types'

/**
 * The pity multiplier after `roundsDone` rounds in an area: ×1 up to `startRounds`, rising linearly to
 * `maxMultiplier` at `fullRounds`, and flat from there.
 */
export function pityMultiplier(roundsDone: number, pity: PityConfig): number {
  const { startRounds: start, fullRounds: full, maxMultiplier: max } = pity
  if (!(max > 1)) return 1
  const t = full > start ? (roundsDone - start) / (full - start) : roundsDone >= start ? 1 : 0
  return 1 + (max - 1) * Math.min(1, Math.max(0, t))
}

/** Chance (0–1) of what the pity is for, when it's `share` of the usual odds: × the pity, at most 1. */
export const pityChance = (share: number, roundsDone: number, pity: PityConfig): number =>
  Math.min(1, share * pityMultiplier(roundsDone, pity))
