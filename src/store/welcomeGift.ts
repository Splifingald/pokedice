// A small world's starting gift (docs/64 §4.7): the server's check and opening it. The engine decides
// (engine/welcomeGift.ts); for a signed-in player the server confirms the switch (welcome_gift_open(), migration 0152)
// before the partner pick gives a present, so an old build or a hand-made save can't get one while it's off. A guest's
// switch can only be "On for everyone", which the content already says. As the Gift card's check (store/giftCard.ts).
import { openWelcomeGift, welcomeGiftOn } from '@/engine'
import { getSupabase } from '@/lib/supabase'
import { mutateSave, useGame } from './game'

const KEEP_MS = 5 * 60 * 1000
let cached: { ok: boolean; at: number; user: string | null } | null = null

/** Forget the server's last answer (tests; a sign-in or out changes who asks). */
export function resetWelcomeGiftCheck() {
  cached = null
}

/** The server allows the starting gift for this player: true, false, or false when it can't be reached. */
export async function welcomeGiftAllowed(): Promise<boolean> {
  const { data, auth } = useGame.getState()
  if (!welcomeGiftOn(data)) return false
  if (auth.status !== 'signed_in') return true
  const user = auth.email ?? null
  if (cached && cached.user === user && Date.now() - cached.at < KEEP_MS) return cached.ok
  try {
    const client = await getSupabase()
    if (!client) return false
    const { data: ok, error } = await client.rpc('welcome_gift_open')
    if (error) return false
    cached = { ok: ok === true, at: Date.now(), user }
    return cached.ok
  } catch {
    return false
  }
}

/** Opens the present waiting in the world: its items into the bag, its ₽ into the purse. False when none waits. */
export function openStartingGift(): boolean {
  const data = useGame.getState().data
  return mutateSave((s) => openWelcomeGift(s, data))
}
