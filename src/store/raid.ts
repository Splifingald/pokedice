// Raid Battles, the day's raid: the shared calendar's (engine/raidCalendar.ts), the same for every player, kept in the
// save with the day. Signed in, raid_today() (migration 0035) records it on the server too, which raid_close() needs.
import { useEffect } from 'react'
import { calendarRaid, eventUnlocked, msToUtcMidnight, setTodayRaid, todayRaid, utcDay, type TodayRaid } from '@/engine'
import { getSupabase } from '@/lib/supabase'
import { mutateSave, useGame } from './game'
import { serverNow, useServerNow } from './serverTime'

/** Records the day's raid on the server (signed in): quietly, the game doesn't wait for it. */
export async function recordOnServer(raid: TodayRaid) {
  const client = await getSupabase()
  if (!client) return
  const { error } = await client.rpc('raid_today', {
    p_candidates: { kind: 'calendar', list: [{ dex: raid.dex, shiny: raid.shiny, areaId: raid.areaId }] },
  })
  if (error) console.warn('[raid] raid_today', error.message)
}

let asking = false

/** Sets today's raid in the save if it isn't yet (raids open, the real time known). */
export function ensureTodayRaid() {
  if (asking) return
  const { save, data, auth } = useGame.getState()
  const now = serverNow()
  if (!save || now == null || !eventUnlocked('raid', save, data)) return
  const day = utcDay(now)
  if (todayRaid(save, day)) return
  const raid = calendarRaid(data, day)
  if (!raid) return
  asking = true
  try {
    mutateSave((s) => (todayRaid(s, day) ? null : setTodayRaid(s, raid)))
    if (auth.status === 'signed_in') void recordOnServer(raid)
  } finally {
    asking = false
  }
}

/** Today's raid (set on first use), or null while the time isn't known or raids aren't open. */
export function useTodayRaid(): { raid: TodayRaid | null; msLeft: number | null; day: string | null } {
  const now = useServerNow(30_000)
  const day = now == null ? null : utcDay(now)
  const raid = useGame((s) => (s.save && day ? todayRaid(s.save, day) : null))
  const signedState = useGame((s) => s.auth.status)
  useEffect(() => {
    if (day && !raid) ensureTodayRaid()
  }, [day, raid, signedState])
  return { raid, msLeft: now == null ? null : msToUtcMidnight(now), day }
}
