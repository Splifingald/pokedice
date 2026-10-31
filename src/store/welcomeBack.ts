// Welcome-back gifts (docs/56), the game's side: once a day, whoever is playing tells the server the day it is where
// they are, and the server decides (migration 0101, welcome_back_claim): days away on its own records of the days
// played, the tier, the cooldown. A gift comes as a developer's message, so all that is left here is to load the
// messages again when one was just written: the usual pop-up, wrapped gift and opening follow (ReplyPopup, Gifts).
// Nothing at all without Supabase, or while the switch (or the gifts') is off for the player.
import { welcomeBackSends } from '@/engine'
import { localDay } from '@/analytics/ping'
import { deviceId } from '@/lib/device'
import { useInbox } from '@/lib/feedback'
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase'
import { useGame } from './game'

/** player key → the last day asked for them on this device: a reload or a new tab asks nothing more that day. */
const ASKED_KEY = 'pokedice.welcomeBack.asked'
/** After a failed ask, the next one waits this long. */
const RETRY_MS = 10 * 60_000

function readAsked(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(ASKED_KEY) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

/** Only today's entries are worth keeping. */
function markAsked(player: string, day: string) {
  const keep = Object.fromEntries(Object.entries(readAsked()).filter(([, d]) => d === day))
  try {
    localStorage.setItem(ASKED_KEY, JSON.stringify({ ...keep, [player]: day }))
  } catch {
    /* storage blocked: at worst one more ask next load, answered the same */
  }
}

let asking = false
let failedAt = -Infinity

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

/**
 * Today's ask, once the sign-in state is known, unless it went out already for this player today. The answer is the
 * server's; a message just written loads the messages again so it pops up.
 */
export async function askWelcomeBack(now = new Date()): Promise<void> {
  if (!isSupabaseConfigured) return
  const { auth, save, data } = useGame.getState()
  if (!save || auth.status === 'unknown' || !welcomeBackSends(data)) return
  const player = auth.status === 'signed_in' && auth.userId ? auth.userId : `device:${deviceId()}`
  const day = localDay(now)
  if (readAsked()[player] === day || asking || performance.now() - failedAt < RETRY_MS) return
  asking = true
  try {
    const client = await getSupabase()
    if (!client) return
    const { data: answer, error } = await client.rpc('welcome_back_claim', {
      p_device_id: deviceId(),
      p_day: day,
    })
    if (error) throw error
    markAsked(player, day)
    if ((answer as { fresh?: boolean } | null)?.fresh) {
      await inboxIdle()
      await useInbox.getState().load()
    }
  } catch (err) {
    failedAt = performance.now()
    console.info('[welcome back] not asked:', err instanceof Error ? err.message : err)
  } finally {
    asking = false
  }
  // Signed in (or out) while it asked: the new player's ask, which was turned away meanwhile.
  const after = useGame.getState().auth
  if ((after.status === 'signed_in' && after.userId ? after.userId : `device:${deviceId()}`) !== player)
    void askWelcomeBack()
}

let started = false
/** Asks when the player is known (and again when that changes), when the content arrives, and back to the tab. */
export function startWelcomeBack() {
  if (started || !isSupabaseConfigured) return
  started = true
  useGame.subscribe((s, prev) => {
    if (
      s.auth.status !== prev.auth.status ||
      s.auth.userId !== prev.auth.userId ||
      s.data !== prev.data ||
      (!!s.save && !prev.save)
    )
      void askWelcomeBack()
  })
  // A tab left open overnight: the new day is a new ask.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void askWelcomeBack()
  })
  void askWelcomeBack()
}
