// Trick or Treat's server check (docs/28, docs/15 §20): the game deals the card only while the switch is on for the
// player, and for a signed-in player the server confirms it (trick_or_treat_open(), migration 0056) before the ghost
// comes out, so an old build or a hand-made save can't play it while it's off. A guest's switch can only be "On for
// everyone" (eventOpenTo), which the content already says. The answer is kept for a few minutes: one call per session
// in practice, not one per card.
import { trickOn } from '@/engine'
import { getSupabase } from '@/lib/supabase'
import { useGame } from './game'

const KEEP_MS = 5 * 60 * 1000
let cached: { ok: boolean; at: number; user: string | null } | null = null

/** Forget the server's last answer (tests; a sign-in or out changes who asks). */
export function resetTrickCheck() {
  cached = null
}

/** The server allows Trick or Treat for this player: true, false, or false when it can't be reached. */
export async function trickAllowed(): Promise<boolean> {
  const { data, auth } = useGame.getState()
  if (!trickOn(data)) return false
  if (auth.status !== 'signed_in') return true
  const user = auth.email ?? null
  if (cached && cached.user === user && Date.now() - cached.at < KEEP_MS) return cached.ok
  try {
    const client = await getSupabase()
    if (!client) return false
    const { data: ok, error } = await client.rpc('trick_or_treat_open')
    if (error) return false
    cached = { ok: ok === true, at: Date.now(), user }
    return cached.ok
  } catch {
    return false
  }
}
