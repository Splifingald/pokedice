// The game goes quiet while something else plays sound: a YouTube video in a message's pop-up (docs/69, the user's call
// of 2026-11-08). Every effect, cry and the battle music stop; the last hold let go brings them back. Holds stack, so two
// at once can't wake the sound early.
import { setCriesHushed } from './cries'
import { setSfxHushed } from './sfx'

let holds = 0

/** Silences the game until the returned function is called (once; calling it again does nothing). */
export function hushGame(): () => void {
  holds++
  if (holds === 1) {
    setSfxHushed(true)
    setCriesHushed(true)
  }
  let released = false
  return () => {
    if (released) return
    released = true
    holds--
    if (holds > 0) return
    setSfxHushed(false)
    setCriesHushed(false)
  }
}

/** The game is silenced now. */
export const gameHushed = () => holds > 0
