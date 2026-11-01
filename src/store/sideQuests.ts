// The side quests' server check (docs/61, docs/15 §20): the game only deals a feature while its switch is on for the
// player, and for a signed-in player the server confirms it (side_quest_open(key), migration 0111) at the moment it
// matters (a disguise springing out, a Safari round, a rival's or a gift's moment), so an old build or a hand-made save
// can't use a feature that's off. A guest's switch can only be "On for everyone", which the content already says. The
// answer is kept for a few minutes per feature: one call per session in practice.
import { getSupabase } from '@/lib/supabase'
import { useGame } from './game'

export type SideQuestKey =
  | 'disguises'
  | 'safari'
  | 'rivals'
  | 'giftMoments'
  // The region flavours (docs/62, migrations 0115–0118).
  | 'hoennWeather'
  | 'galarWeather'
  | 'hordes'
  | 'trials'
  | 'titans'

const KEEP_MS = 5 * 60 * 1000
const cache = new Map<SideQuestKey, { ok: boolean; at: number; user: string | null }>()

/** Forget the server's answers (tests; a sign-in or out changes who asks). */
export function resetSideQuestChecks() {
  cache.clear()
}

/**
 * The server allows this feature for this player: true, false, or false when it can't be reached. `on` is the
 * engine's own answer (the switch as the content says it), asked first.
 */
export async function sideQuestAllowed(key: SideQuestKey, on: boolean): Promise<boolean> {
  if (!on) return false
  const { auth } = useGame.getState()
  if (auth.status !== 'signed_in') return true
  const user = auth.email ?? null
  const hit = cache.get(key)
  if (hit && hit.user === user && Date.now() - hit.at < KEEP_MS) return hit.ok
  try {
    const client = await getSupabase()
    if (!client) return false
    const { data: ok, error } = await client.rpc('side_quest_open', { p_key: key })
    if (error) return false
    cache.set(key, { ok: ok === true, at: Date.now(), user })
    return ok === true
  } catch {
    return false
  }
}

/** The answer as known now without asking: the switch itself for a guest, the kept answer, or null (not asked yet). */
export function sideQuestCached(key: SideQuestKey, on: boolean): boolean | null {
  if (!on) return false
  const { auth } = useGame.getState()
  if (auth.status !== 'signed_in') return true
  const hit = cache.get(key)
  return hit && hit.user === (auth.email ?? null) && Date.now() - hit.at < KEEP_MS ? hit.ok : null
}

/**
 * The server's answer already known, for a step that can't wait for it (a rival's or a gift's moment, dealt as the
 * next card is): a guest's is the switch itself; a signed-in player's the answer kept, else false while it's asked now
 * (the next card knows).
 */
export function sideQuestKnown(key: SideQuestKey, on: boolean): boolean {
  if (!on) return false
  const { auth } = useGame.getState()
  if (auth.status !== 'signed_in') return true
  const hit = cache.get(key)
  if (hit && hit.user === (auth.email ?? null) && Date.now() - hit.at < KEEP_MS) return hit.ok
  void sideQuestAllowed(key, on)
  return false
}
