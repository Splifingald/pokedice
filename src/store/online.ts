// Players online (docs/70): how many players have the game open, at the foot of the side menu, for everyone (no
// switch, the user's call of 2026-11-09). Each game says it's open (online_ping, migration 0144) every 5 minutes while
// its tab is visible, and the answer is the count: one tiny call, about 12 per hour of play, and none from a hidden tab.
// Opening the menu asks again when the last answer is more than a minute old. The server counts the players heard from
// in the last 6 minutes.
import { create } from 'zustand'
import { deviceId } from '@/lib/device'
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase'
import { useGame } from './game'

/** The last count the server gave, or null: not asked yet, or never answered (offline, before migration 0144). */
export const useOnlineCount = create<{ count: number | null }>(() => ({ count: null }))

export const ONLINE_PING_MS = 5 * 60_000
/** Opening the menu asks again past this. */
export const ONLINE_MENU_MS = 60_000
// A little under the timer's gap, so a timer firing a hair early isn't skipped (and the player missed for 10 minutes).
const TIMER_GAP_MS = ONLINE_PING_MS - 15_000

let lastPing = 0
let pinging = false

/** Says this game is open and keeps the count, unless the last call was less than `minGap` ago. */
export async function pingOnline(minGap = TIMER_GAP_MS): Promise<void> {
  if (!isSupabaseConfigured || pinging) return
  // Until the sign-in is known, the call would count the device and then the account: the same player twice.
  if (useGame.getState().auth.status === 'unknown') return
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
  if (Date.now() - lastPing < minGap) return
  pinging = true
  lastPing = Date.now()
  try {
    const client = await getSupabase()
    if (!client) return
    const { data: n, error } = await client.rpc('online_ping', { p_device_id: deviceId() })
    if (error) throw error
    useOnlineCount.setState({ count: typeof n === 'number' && n > 0 ? n : null })
  } catch {
    // Offline, or before migration 0144: the last count stays (none at first, so the line stays hidden).
  } finally {
    pinging = false
  }
}

let started = false
/** On start, once the sign-in is known, every 5 minutes while visible, and on coming back to the tab. */
export function startOnlinePing() {
  if (started || !isSupabaseConfigured) return
  started = true
  setInterval(() => void pingOnline(), ONLINE_PING_MS)
  document.addEventListener('visibilitychange', () => void pingOnline())
  // The sign-in becoming known (or changing): counted as who they are now.
  useGame.subscribe((s, prev) => {
    if (s.auth.status !== prev.auth.status || s.auth.userId !== prev.auth.userId) {
      lastPing = 0
      void pingOnline()
    }
  })
  void pingOnline()
}

/** Tests: forget the last call. */
export function resetOnlinePing() {
  lastPing = 0
  pinging = false
  useOnlineCount.setState({ count: null })
}
