import { createContext, useContext } from 'react'

/**
 * Battle pace: every battle animation's duration, delay and timer is multiplied by it. Auto-mode plays 50% faster
 * (1.5× speed, so ⅔ of the time).
 */
export const AUTO_PACE = 2 / 3
export const PaceContext = createContext(1)
export const usePace = () => useContext(PaceContext)
