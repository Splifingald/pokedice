// A feature's rules used to wait at the top of its page as a card until GOT IT (docs/43 §7). Since the user's call of
// 2026-11-07 they are behind the page's INFO button only: opening the page counts as meeting them. The feature's "seen"
// flag stays, because Home's notice that sends the player there waits on it, so it is set as soon as the page shows.
import { useEffect } from 'react'

export function useSeenOnOpen(due: boolean, markSeen: () => void) {
  useEffect(() => {
    if (due) markSeen()
    // The flag is all that matters: once set, `due` goes false and this never runs again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [due])
}
