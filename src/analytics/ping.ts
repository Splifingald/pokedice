// Analytics, all of it: one call per player per day (player_ping, migration 0028). That day counts for day-1
// retention, and the player's row in Admin → Analytics gets their name and a snapshot of their game. Nothing else is
// sent. A day already sent is remembered in localStorage, so reloads and new tabs cost nothing.
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase'
import { deviceId } from '@/lib/device'
import { onSaveCommitted, useGame } from '@/store/game'
import { snapshotOf } from './events'

const SENT_KEY = 'pokedice.analytics.pinged'
/** After a failed ping, the next try waits this long (it comes with the next save change). */
const RETRY_MS = 10 * 60_000

/** 'YYYY-MM-DD' in the player's own time zone. */
export const localDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** player key → the last day pinged for them on this device. */
function readSent(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SENT_KEY) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

let sending = false
let lastTry = 0

/** Today's ping for whoever is playing, unless it already went out. Waits until we know whether they're signed in. */
export async function pingToday(now = new Date()) {
  if (!isSupabaseConfigured) return
  const { auth, save, data } = useGame.getState()
  if (!save || auth.status === 'unknown') return
  const player = auth.status === 'signed_in' && auth.userId ? auth.userId : `device:${deviceId()}`
  const day = localDay(now)
  const sent = readSent()
  if (sent[player] === day || sending || now.getTime() - lastTry < RETRY_MS) return
  sending = true
  lastTry = now.getTime()
  try {
    const client = await getSupabase()
    if (!client) return
    const { error } = await client.rpc('player_ping', {
      p_device_id: deviceId(),
      p_day: day,
      p_name: save.player?.name?.trim() || null,
      p_snapshot: snapshotOf(save, data),
    })
    if (error) throw error
    lastTry = 0
    // Only today's entries are worth keeping.
    const keep = Object.fromEntries(Object.entries(readSent()).filter(([, d]) => d === day))
    try {
      localStorage.setItem(SENT_KEY, JSON.stringify({ ...keep, [player]: day }))
    } catch {
      /* storage blocked: at worst one more ping next load */
    }
  } catch (err) {
    console.info('[analytics] ping not sent:', err instanceof Error ? err.message : err)
  } finally {
    sending = false
  }
}

let started = false
/** Pings once the sign-in state is known, and again on any save change (a new day, or a retry). */
export function startAnalytics() {
  if (started || !isSupabaseConfigured) return
  started = true
  onSaveCommitted(() => void pingToday())
  useGame.subscribe((s, prev) => {
    if (s.auth.status !== prev.auth.status || s.auth.userId !== prev.auth.userId) void pingToday()
  })
  void pingToday()
}
