// Tracks in the Snow's server check (docs/61 §4.1, docs/15 §20): the glade's way in opens only while the switch is on
// for the player, and for a signed-in player the server confirms it (tracks_open(), migration 0122) before BEGIN, so
// an old build or a hand-made save can't search the glade while it's off. A guest's switch can only be "On for
// everyone" (eventOpenTo), which the content already says. The answer is kept a few minutes, as Trick or Treat's.
import { tracksRunsOn } from '@/engine'
import { getSupabase } from '@/lib/supabase'
import { useGame } from './game'

const KEEP_MS = 5 * 60 * 1000
let cached: { ok: boolean; at: number; user: string | null } | null = null

/** Forget the server's last answer (tests; a sign-in or out changes who asks). */
export function resetTracksCheck() {
  cached = null
}

/** The server allows Tracks in the Snow for this player: true, false, or false when it can't be reached. */
export async function tracksAllowed(): Promise<boolean> {
  const { data, auth } = useGame.getState()
  if (!tracksRunsOn(data)) return false
  if (auth.status !== 'signed_in') return true
  const user = auth.email ?? null
  if (cached && cached.user === user && Date.now() - cached.at < KEEP_MS) return cached.ok
  try {
    const client = await getSupabase()
    if (!client) return false
    const { data: ok, error } = await client.rpc('tracks_open')
    if (error) return false
    cached = { ok: ok === true, at: Date.now(), user }
    return cached.ok
  } catch {
    return false
  }
}
