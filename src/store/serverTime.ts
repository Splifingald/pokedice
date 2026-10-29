// The real time, for the special events (docs/18): the daily spin and the day's raid turn over at midnight UTC as the
// server sees it, so changing the device's clock changes nothing. Guests included: `event_time()` needs no sign-in,
// and when the cloud isn't set up (or can't be reached) the site's own `Date` header stands in. Until one of them
// answers, the time is unknown and the events wait ("Connect to the internet").
import { useEffect } from 'react'
import { create } from 'zustand'
import { getSupabase } from '@/lib/supabase'
import { anchorClock } from './clock'
import { useNow } from './hooks'

interface ServerTime {
  /** Server time minus the device's clock (ms), or null while unknown. */
  offset: number | null
}

export const useServerTime = create<ServerTime>(() => ({ offset: null }))

/** The server's clock, from the database. */
async function fromDatabase(): Promise<number | null> {
  const client = await getSupabase()
  if (!client) return null
  const { data, error } = await client.rpc('event_time')
  if (error || !data) return null
  const at = Date.parse((data as { now?: string }).now ?? '')
  return Number.isNaN(at) ? null : at
}

/** The web server's clock, from the `Date` header of a tiny request to the site itself (to the second). */
async function fromSite(): Promise<number | null> {
  if (import.meta.env.VITE_PROTO) return null // the prototype page has no site of its own
  const res = await fetch(`/?t=${Date.now()}`, { method: 'HEAD', cache: 'no-store' })
  const at = Date.parse(res.headers.get('date') ?? '')
  return Number.isNaN(at) ? null : at
}

/**
 * The longest round trip a reading is kept from. Longer (the page frozen in the background, the device asleep, its
 * clock moved meanwhile), the halfway guess below could be off by half of it — days, for a page left a week — and a
 * small world could close early on it (2026-10-25).
 */
export const MAX_ROUND_TRIP_MS = 20_000

/** Reads the real time and keeps how far the device's clock is from it. Failures leave the last value. */
export async function syncServerTime(): Promise<void> {
  const before = Date.now()
  const perfBefore = performance.now()
  let server: number | null = null
  try {
    server = await fromDatabase()
  } catch {
    /* offline or the function isn't deployed yet: the site's header next */
  }
  if (server == null) {
    try {
      server = await fromSite()
    } catch {
      /* offline */
    }
  }
  if (server == null) return
  const after = Date.now()
  const perfAfter = performance.now()
  // Too long a wait to tell when the server read its clock, on either clock: the last reading stays.
  const wall = after - before
  if (wall < 0 || wall > MAX_ROUND_TRIP_MS || perfAfter - perfBefore > MAX_ROUND_TRIP_MS) return
  // Halfway through the round trip is the best guess for when the server read its clock.
  anchorClock(server, (perfBefore + perfAfter) / 2)
  useServerTime.setState({ offset: server - (before + after) / 2 })
}

/** The real time now, or null while unknown. */
export function serverNow(): number | null {
  const { offset } = useServerTime.getState()
  return offset == null ? null : Date.now() + offset
}

/** The real time, re-read every `ms`; null while unknown. */
export function useServerNow(ms = 1000): number | null {
  const now = useNow(ms)
  const offset = useServerTime((s) => s.offset)
  return offset == null ? null : now + offset
}

const RESYNC_MS = 10 * 60_000

/** Keeps the time fresh: on start, every 10 minutes, and whenever the tab comes back. Mounted once, in GameLayout. */
export function useServerTimeSync(): void {
  useEffect(() => {
    void syncServerTime()
    const timer = setInterval(() => void syncServerTime(), RESYNC_MS)
    const onShow = () => {
      if (document.visibilityState === 'visible') void syncServerTime()
    }
    document.addEventListener('visibilitychange', onShow)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onShow)
    }
  }, [])
}
