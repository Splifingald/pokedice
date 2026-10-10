// Screens that take the whole screen (the battle): while one is mounted, the game's top bar, side bar and tab bar step
// aside. A counter, so overlapping holders (a battle replacing another) don't release it early.
import { useEffect, useSyncExternalStore } from 'react'

let holders = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

/** Hold full screen for as long as the calling component is mounted. */
export function useHoldFullscreen(on = true) {
  useEffect(() => {
    if (!on) return
    holders++
    emit()
    return () => {
      holders--
      emit()
    }
  }, [on])
}

/** Whether something holds full screen now. */
export function useFullscreen(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => holders > 0,
    () => false,
  )
}
