import { useLayoutEffect, useRef } from 'react'

/**
 * A leaderboard opens on the player's own row: it is scrolled to the middle of the screen at once (no animation),
 * before the first paint, and again whenever `key` changes (the board arrives, another tab is picked). Put the ref on
 * the player's row; nothing happens while they aren't on the board.
 */
export function useSnapToMe<T extends HTMLElement = HTMLLIElement>(key: string) {
  const ref = useRef<T>(null)
  useLayoutEffect(() => {
    ref.current?.scrollIntoView?.({ block: 'center', behavior: 'instant' })
  }, [key])
  return ref
}
