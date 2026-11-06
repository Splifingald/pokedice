// Support me's sessions, on the device (engine/donation decides what they mean): one starts when the game is opened, or
// when the player comes back to it after half an hour away; a reload or a short break carries the same one on. Kept in
// localStorage, with the local day the pop-up last opened, so its "after the third session, once a day" survives reloads.
import { useEffect } from 'react'
import { create } from 'zustand'
import { localDay } from '@/analytics/ping'
import { touchSession, type SupportSession } from '@/engine'

const KEY = 'pokedice.supportSession'
/** While the game is on screen, it notes it's still open this often (well under the 30 minutes that end a session). */
const BEAT_MS = 60_000

function read(): SupportSession | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<SupportSession> | null
    if (
      !raw ||
      typeof raw.count !== 'number' ||
      typeof raw.startedAt !== 'number' ||
      typeof raw.lastSeen !== 'number'
    ) {
      return null
    }
    return {
      count: raw.count,
      startedAt: raw.startedAt,
      lastSeen: raw.lastSeen,
      shownDay: raw.shownDay ?? null,
    }
  } catch {
    return null
  }
}

function write(session: SupportSession) {
  try {
    localStorage.setItem(KEY, JSON.stringify(session))
  } catch {
    // Private mode: this page load keeps it in memory.
  }
}

/** The session now, null until the tracker has run (a page with no game layout never counts one). */
export const useSupportSession = create<{ session: SupportSession | null }>(() => ({ session: null }))

function touch() {
  // Another tab may have moved it on: the device's copy is the one that counts.
  const next = touchSession(read() ?? useSupportSession.getState().session, Date.now())
  write(next)
  useSupportSession.setState({ session: next })
}

/** Counts the sessions while the game is open. Mounted once, by PopupQueue. */
export function useSupportSessionTracker(): void {
  useEffect(() => {
    touch()
    const beat = setInterval(() => {
      // A hidden tab's timers still run: only time on screen keeps the session going.
      if (document.visibilityState === 'visible') touch()
    }, BEAT_MS)
    // Back to the tab: a new session after a long enough break. Leaving it: the break starts now.
    const onVisibility = () => touch()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(beat)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])
}

/** The pop-up was closed: not again today (the player's local day). */
export function markSupportShown(now = Date.now()): void {
  const session = read() ?? useSupportSession.getState().session
  if (!session) return
  const next = { ...session, shownDay: localDay(new Date(now)) }
  write(next)
  useSupportSession.setState({ session: next })
}
