// How much the game animates, in one place: every timeline and transition asks here (docs/15-UI-GUIDELINES.md).
import { createContext, useContext } from 'react'
import { useGame } from '@/store/game'
import { useMediaQuery } from './useMediaQuery'

/**
 * - `full`: everything plays.
 * - `short`: the player's quick setting. A hit is one generic impact (no typed attack), Mega Evolution and Gigantamax
 *   are a white flash and the new sprite, a catch is the throw with its result at once, the Pokémon Center is quick.
 *   Evolutions, Eggs hatching and encounters (legendary and trainer intros) still play in full.
 * - `off`: an admin switch (settings.reducedMotion). Nothing animates; every timeline jumps to its end state.
 */
export type MotionLevel = 'full' | 'short' | 'off'

/** The OS's "reduce motion" is the player saying so: short animations, and nothing shakes or roams (`calm`). */
export function motionLevel(
  s: { reducedMotion: boolean; animations?: 'full' | 'short' },
  osReduce: boolean,
): MotionLevel {
  if (s.reducedMotion) return 'off'
  return s.animations === 'short' || osReduce ? 'short' : 'full'
}

/** A screen that wants less motion than the setting (an auto battle plays `short`) caps it for everything inside. */
export const MotionCap = createContext<MotionLevel | null>(null)

const RANK: Record<MotionLevel, number> = { off: 0, short: 1, full: 2 }
export const capMotion = (level: MotionLevel, cap: MotionLevel | null): MotionLevel =>
  cap && RANK[cap] < RANK[level] ? cap : level

export function useMotion(): { level: MotionLevel; calm: boolean } {
  const s = useGame((g) => g.settings)
  const osReduce = useMediaQuery('(prefers-reduced-motion: reduce)')
  const level = capMotion(motionLevel(s, osReduce), useContext(MotionCap))
  // No screen shake, no flashing, a still Home team: what the OS setting and "no animations" both ask for.
  return { level, calm: level === 'off' || osReduce }
}
