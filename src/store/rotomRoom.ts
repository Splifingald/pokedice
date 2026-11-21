// The Rotom Room's store side (docs/73): the server's check before a signed-in player plays it (rotom_room_open(),
// migration 0151), as Tracks in the Snow's, and the week's turn while the game stays open (each save pins it as it
// settles; this makes sure Monday's comes even when nothing is saved).
import { useEffect } from 'react'
import { pinRotomWeek, rotomRoomOn, rotomWeekCurrent } from '@/engine'
import { getSupabase } from '@/lib/supabase'
import { trustedNow } from './clock'
import { commitSave, useGame } from './game'
import { useServerTime } from './serverTime'

const KEEP_MS = 5 * 60 * 1000
let cached: { ok: boolean; at: number; user: string | null } | null = null

/** Forget the server's last answer (tests; a sign-in or out changes who asks). */
export function resetRotomRoomCheck() {
  cached = null
}

/** The server allows the Rotom Room for this player: true, false, or false when it can't be reached. */
export async function rotomRoomAllowed(): Promise<boolean> {
  const { data, auth } = useGame.getState()
  if (!rotomRoomOn(data)) return false
  // A guest's switch can only be "On for everyone" (eventOpenTo), which the content already says.
  if (auth.status !== 'signed_in') return true
  const user = auth.email ?? null
  if (cached && cached.user === user && Date.now() - cached.at < KEEP_MS) return cached.ok
  try {
    const client = await getSupabase()
    if (!client) return false
    const { data: ok, error } = await client.rpc('rotom_room_open')
    if (error) return false
    cached = { ok: ok === true, at: Date.now(), user }
    return cached.ok
  } catch {
    return false
  }
}

/** Pins this week's form when the week has turned and nothing has saved since. */
export function refreshRotomWeek() {
  const { save, data } = useGame.getState()
  const now = trustedNow()
  if (!save || rotomWeekCurrent(save, now)) return
  const next = pinRotomWeek(save, data, now)
  if (next !== save) commitSave(next)
}

/** Keeps the week turning while the game is open: as soon as the server's time is known, then every minute. */
export function useRotomWeekClock() {
  const known = useServerTime((s) => s.offset != null)
  useEffect(() => {
    refreshRotomWeek()
    const timer = setInterval(refreshRotomWeek, 60_000)
    return () => clearInterval(timer)
  }, [known])
}
