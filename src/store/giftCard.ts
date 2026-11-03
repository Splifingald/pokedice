// The Gift card's server check (docs/64 §4.0, docs/15 §20): the game deals the card only while the switch is on for the
// player, and for a signed-in player the server confirms it (gift_card_open(), migration 0123) before a present
// appears, so an old build or a hand-made save can't open one while it's off. A guest's switch can only be "On for
// everyone" (eventOpenTo), which the content already says. The answer is kept for a few minutes: one call per session
// in practice, not one per card. As Trick or Treat's (store/trick.ts).
import { giftOn } from '@/engine'
import { getSupabase } from '@/lib/supabase'
import { useGame } from './game'

const KEEP_MS = 5 * 60 * 1000
let cached: { ok: boolean; at: number; user: string | null } | null = null

/** Forget the server's last answer (tests; a sign-in or out changes who asks). */
export function resetGiftCheck() {
  cached = null
}

/** The server allows the Gift card for this player: true, false, or false when it can't be reached. */
export async function giftAllowed(): Promise<boolean> {
  const { data, auth } = useGame.getState()
  if (!giftOn(data)) return false
  if (auth.status !== 'signed_in') return true
  const user = auth.email ?? null
  if (cached && cached.user === user && Date.now() - cached.at < KEEP_MS) return cached.ok
  try {
    const client = await getSupabase()
    if (!client) return false
    const { data: ok, error } = await client.rpc('gift_card_open')
    if (error) return false
    cached = { ok: ok === true, at: Date.now(), user }
    return cached.ok
  } catch {
    return false
  }
}
