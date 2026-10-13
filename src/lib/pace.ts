import { createContext, useContext } from 'react'

/**
 * Battle pace: every battle animation's duration, delay and timer is multiplied by it. Auto-mode plays 50% faster
 * (1.5× speed, so ⅔ of the time).
 */
export const AUTO_PACE = 2 / 3
export const PaceContext = createContext(1)
export const usePace = () => useContext(PaceContext)

/** Versus fights play on auto at 1.75× speed. */
export const VERSUS_PACE = 1 / 1.75

/** A raid's speed button: the ally sides' turns play 1.5× faster (the raid Pokémon's and yours never). */
export const RAID_FAST_SPEED = 1.5
