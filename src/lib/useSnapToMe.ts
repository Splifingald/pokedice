import { useLayoutEffect, useRef } from 'react'

/**
 * Brings the player's own row to the middle of the screen at once (no animation) each time `asked` goes up, i.e. when
 * they press the board's "find me". A board opens on its top: arriving on it never scrolls the player away from it
 * (the user's call, 2026-11-12). Put the ref on the player's row; nothing happens while they aren't on the board.
 */
export function useSnapToMe<T extends HTMLElement = HTMLLIElement>(asked: number) {
  const ref = useRef<T>(null)
  useLayoutEffect(() => {
    if (asked > 0) ref.current?.scrollIntoView?.({ block: 'center', behavior: 'instant' })
  }, [asked])
  return ref
}
