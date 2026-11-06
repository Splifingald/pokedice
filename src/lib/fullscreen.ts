// Screens that take the whole screen (the battle): while one is mounted, the game's top bar, side bar and tab bar step
// aside. A counter, so overlapping holders (a battle replacing another) don't release it early.
import { useEffect, useSyncExternalStore } from 'react'

let holders = 0
/** Holders that keep the top bar: the battle (docs/15 §12), whose header stays in reach while it plays. */
let keepers = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

/** Hold full screen for as long as the calling component is mounted. `keepTopBar`: the top bar stays. */
export function useHoldFullscreen(on = true, keepTopBar = false) {
  useEffect(() => {
    if (!on) return
    holders++
    if (keepTopBar) keepers++
    emit()
    return () => {
      holders--
      if (keepTopBar) keepers--
      emit()
    }
  }, [on, keepTopBar])
}

function useHolders<T>(read: () => T, server: T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    read,
    () => server,
  )
}

/** Whether something holds full screen now. */
export function useFullscreen(): boolean {
  return useHolders(() => holders > 0, false)
}

/** Whether the top bar steps aside too: some holder doesn't keep it (a hatching, a trade over a battle's result). */
export function useTopBarHidden(): boolean {
  return useHolders(() => holders > keepers, false)
}
