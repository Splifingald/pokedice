// Global messages (docs/69), the game's side: the game tells the server how many badges the player holds (every
// region's), and the server writes the player's copy of each message running that reaches them, once (migration 0143,
// broadcast_claim). A copy is a developer's message, so all that is left here is to load the messages again when one
// was just written: the pop-up on Home, the wrapped gift and its opening follow (BroadcastPopup, Gifts).
// Nothing at all without Supabase. No switch: the user's call (2026-11-08).
import { broadcastBadges, broadcastsAsk } from '@/engine'
import { deviceId } from '@/lib/device'
import { useInbox } from '@/lib/feedback'
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase'
import { useGame } from './game'

/** Asked again at most this often for the same player and badge count (a new badge asks at once). */
export const BROADCAST_ASK_MS = 10 * 60_000
/** After a failed ask, the next one waits this long. */
const RETRY_MS = 10 * 60_000

let asking = false
let failedAt = -Infinity
/** The last answered ask: whose, with how many badges, when. */
let last: { player: string; badges: number; at: number } | null = null

/** A load of the messages already under way (the game's first, at sign-in) ends first: it can't land after ours. */
const inboxIdle = () =>
  new Promise<void>((resolve) => {
    if (!useInbox.getState().loading) return resolve()
    const off = useInbox.subscribe((s) => {
      if (s.loading) return
      off()
      resolve()
    })
  })

const playerKey = () => {
  const { auth } = useGame.getState()
  return auth.status === 'signed_in' && auth.userId ? auth.userId : `device:${deviceId()}`
}

/**
 * Asks the server for the global messages this player is owed, unless it was asked for the same player and badge
 * count a short while ago. A message just written loads the messages again, so it pops up.
 */
export async function askBroadcasts(now = Date.now()): Promise<void> {
  if (!isSupabaseConfigured || asking) return
  const { auth, save, data } = useGame.getState()
  if (!save || auth.status === 'unknown' || !broadcastsAsk(save)) return
  const player = playerKey()
  const badges = broadcastBadges(save, data)
  if (last && last.player === player && last.badges === badges && now - last.at < BROADCAST_ASK_MS) return
  if (now - failedAt < RETRY_MS) return
  asking = true
  try {
    const client = await getSupabase()
    if (!client) return
    const { data: sent, error } = await client.rpc('broadcast_claim', {
      p_device_id: deviceId(),
      p_badges: badges,
    })
    if (error) throw error
    last = { player, badges, at: now }
    if (Number(sent) > 0) {
      await inboxIdle()
      await useInbox.getState().load()
    }
  } catch (err) {
    failedAt = now
    console.info('[global messages] not asked:', err instanceof Error ? err.message : err)
  } finally {
    asking = false
  }
}

/** Tests: forget what was asked. */
export function resetBroadcastAsks() {
  last = null
  failedAt = -Infinity
  asking = false
}
