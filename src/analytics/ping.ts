// Analytics, all of it: one call per player per day (player_ping, migration 0028). That day counts for retention, and
// the player's row in Admin → Analytics gets their name and a snapshot of their game. Each later hour they play in
// costs one tiny call (player_seen, migration 0042) for the players-per-hour chart; it carries the area they're in, so
// churn by area knows where they were in the last hour they played (0102), and the seconds played since the last call
// (playtime.ts, 0130). Nothing else is sent.
// A day or hour already sent is remembered in localStorage, so reloads and new tabs cost nothing.
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase'
import { deviceId } from '@/lib/device'
import { onSaveCommitted, useGame } from '@/store/game'
import { snapshotOf } from './events'
import { markPlaytimeSent, MAX_SEND, movePlaytime, pendingSeconds, startPlaytime } from './playtime'

const SENT_KEY = 'pokedice.analytics.pinged'
const SENT_HOUR_KEY = 'pokedice.analytics.hour'
/** After a failed ping, the next try waits this long (it comes with the next save change). */
const RETRY_MS = 10 * 60_000

/** 'YYYY-MM-DD' in the player's own time zone. */
export const localDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** 'YYYY-MM-DDTHH' in UTC: the hour player_hours counts the player in. */
export const utcHour = (d: Date) => d.toISOString().slice(0, 13)

/** player key → the last day (SENT_KEY) or hour (SENT_HOUR_KEY) sent for them on this device. */
function readSent(key: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

/** Remembers `value` as sent for `player`. Only that same day's (or hour's) entries are worth keeping. */
function markSent(key: string, player: string, value: string) {
  const keep = Object.fromEntries(Object.entries(readSent(key)).filter(([, v]) => v === value))
  try {
    localStorage.setItem(key, JSON.stringify({ ...keep, [player]: value }))
  } catch {
    /* storage blocked: at worst one more ping next load */
  }
}

let sending = false
let lastTry = 0

/**
 * Today's ping for whoever is playing (it counts this hour too), else this hour's, unless it already went out. Waits
 * until we know whether they're signed in.
 */
export async function pingNow(now = new Date()) {
  if (!isSupabaseConfigured) return
  const { auth, save, data } = useGame.getState()
  if (!save || auth.status === 'unknown') return
  // A guest who just signed in: the seconds they played as a guest go with the account's call (0102 merges the rows).
  if (auth.status === 'signed_in' && auth.userId) movePlaytime(`device:${deviceId()}`, auth.userId)
  const player = playerKey()!
  const day = localDay(now)
  const hour = utcHour(now)
  const dayDue = readSent(SENT_KEY)[player] !== day
  const hourDue = readSent(SENT_HOUR_KEY)[player] !== hour
  if ((!dayDue && !hourDue) || sending || now.getTime() - lastTry < RETRY_MS) return
  sending = true
  lastTry = now.getTime()
  try {
    const client = await getSupabase()
    if (!client) return
    // An Extreme save (docs/22) counts the day played, but leaves the admin's picture of the player — their name,
    // snapshot and area — to the main save.
    const extreme = save.mode === 'extreme'
    // Only with seconds to send does the call take the new signature (0130); without, it is the one before it.
    const seconds = Math.min(MAX_SEND, pendingSeconds(player))
    const played = seconds > 0 ? { p_seconds: seconds } : {}
    const { error } = dayDue
      ? await client.rpc('player_ping', {
          p_device_id: deviceId(),
          p_day: day,
          p_name: extreme ? null : save.player?.name?.trim() || null,
          p_snapshot: extreme ? null : snapshotOf(save, data),
          ...played,
        })
      : await client.rpc('player_seen', {
          p_device_id: deviceId(),
          p_area_id: extreme ? null : save.currentAreaId,
          ...played,
        })
    if (error) throw error
    lastTry = 0
    if (seconds > 0) markPlaytimeSent(player, seconds)
    if (dayDue) markSent(SENT_KEY, player, day)
    markSent(SENT_HOUR_KEY, player, hour)
  } catch (err) {
    console.info('[analytics] ping not sent:', err instanceof Error ? err.message : err)
  } finally {
    sending = false
  }
}

/** Who is playing, as the analytics key them: the account when signed in, else the device. Null before a save. */
function playerKey(): string | null {
  const { auth, save } = useGame.getState()
  if (!save || auth.status === 'unknown') return null
  return auth.status === 'signed_in' && auth.userId ? auth.userId : `device:${deviceId()}`
}

let started = false
/** Pings once the sign-in state is known, and again on any save change (a new hour or day, or a retry). */
export function startAnalytics() {
  if (started || !isSupabaseConfigured) return
  started = true
  startPlaytime(playerKey)
  onSaveCommitted(() => void pingNow())
  useGame.subscribe((s, prev) => {
    if (s.auth.status !== prev.auth.status || s.auth.userId !== prev.auth.userId) void pingNow()
  })
  void pingNow()
}
