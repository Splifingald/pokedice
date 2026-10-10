// Raid Battles, the day's raid (docs/19 §6.2): picked once per UTC day and kept in the save. A guest's is picked here,
// the same all day on this device; a signed-in player's by raid_today() (migration 0035), the same on every device.
import { useEffect } from 'react'
import { eventUnlocked, msToUtcMidnight, pickRaid, raidCandidates, setTodayRaid, todayRaid, utcDay, type TodayRaid } from '@/engine'
import { deviceId } from '@/lib/device'
import { getSupabase } from '@/lib/supabase'
import { mutateSave, useGame } from './game'
import { serverNow, useServerNow } from './serverTime'

async function serverPick(candidates: ReturnType<typeof raidCandidates>, fallbackShiny: number): Promise<TodayRaid | null> {
  const client = await getSupabase()
  if (!client) return null
  const { data, error } = await client.rpc('raid_today', { p_candidates: { ...candidates, fallbackShiny } })
  if (error || !data) return null
  const r = data as Omit<TodayRaid, 'tries'>
  return { ...r, tries: 0 }
}

let asking: Promise<void> | null = null

/** Picks today's raid if the save doesn't have it yet (once at a time). Nothing while the real time isn't known. */
export function ensureTodayRaid(): Promise<void> {
  asking ??= (async () => {
    const { save, data, auth } = useGame.getState()
    const now = serverNow()
    // Signed in or not isn't known yet: a guest's pick now could differ from the server's.
    // Only once raids are open (an Events page asks for every event's status, open or not).
    if (!save || now == null || auth.status === 'unknown' || !eventUnlocked('raid', save, data)) return
    const day = utcDay(now)
    if (todayRaid(save, day)) return
    let raid: TodayRaid | null
    if (auth.status === 'signed_in') {
      const candidates = raidCandidates(save, data, day)
      raid = candidates.list.length ? await serverPick(candidates, data.config.events.raid.fallbackShiny) : null
    } else raid = pickRaid(save, data, day, deviceId())
    if (raid) mutateSave((s) => (todayRaid(s, raid.day) ? null : setTodayRaid(s, raid)))
  })().finally(() => (asking = null))
  return asking
}

/** Today's raid (picked on first use), or null while it's being picked or the time isn't known. */
export function useTodayRaid(): { raid: TodayRaid | null; msLeft: number | null } {
  const now = useServerNow(30_000)
  const day = now == null ? null : utcDay(now)
  const raid = useGame((s) => (s.save && day ? todayRaid(s.save, day) : null))
  const signedState = useGame((s) => s.auth.status)
  useEffect(() => {
    if (day && !raid) void ensureTodayRaid()
  }, [day, raid, signedState])
  return { raid, msLeft: now == null ? null : msToUtcMidnight(now) }
}
