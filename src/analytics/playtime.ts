// Playtime from the 'playtime' events: seconds actually played, summed per player per local calendar day.

export interface PlaytimeEvent {
  player: string
  at: Date
  seconds: number
}

export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Seconds per day ('YYYY-MM-DD', local) for one player, or everyone when `player` is omitted. */
export function dailySeconds(events: PlaytimeEvent[], player?: string): Map<string, number> {
  const out = new Map<string, number>()
  for (const e of events) {
    if (player && e.player !== player) continue
    const k = dayKey(e.at)
    out.set(k, (out.get(k) ?? 0) + Math.max(0, e.seconds))
  }
  return out
}

export interface AveragePlaytime {
  /** Mean seconds played per player on each day they played; null without any playtime. */
  perPlayerDay: number | null
  totalSeconds: number
  /** (player, day) pairs with some playtime. */
  playerDays: number
}

/** Average daily playtime: total seconds ÷ the number of days each player played (a day with no play isn't a 0). */
export function averageDailyPlaytime(events: PlaytimeEvent[]): AveragePlaytime {
  const days = new Map<string, number>()
  let total = 0
  for (const e of events) {
    const s = Math.max(0, e.seconds)
    if (!s) continue
    total += s
    const k = `${e.player}|${dayKey(e.at)}`
    days.set(k, (days.get(k) ?? 0) + s)
  }
  return { perPlayerDay: days.size ? total / days.size : null, totalSeconds: total, playerDays: days.size }
}

/** "1 h 05", "23 min", "40 s". */
export function formatDuration(seconds: number): string {
  const s = Math.round(seconds)
  if (s < 60) return `${s} s`
  const m = Math.round(s / 60)
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`
}
