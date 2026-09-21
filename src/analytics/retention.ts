// Retention: of the players whose first day falls in the time frame and who were active that day (≥ 3 events), the
// share who came back on a given later calendar day (≥ 1 event). Day 1 is the day after their first; day 7 is a week
// on. Days are the viewer's local calendar days.

export const RETENTION_MIN_FIRST_DAY_EVENTS = 3

export interface RetentionEvent {
  player: string
  at: Date
}

export interface Retention {
  /** Which day after the first this measures: 1 = the day after, 7 = a week on. */
  day: number
  /** Players who qualified (first day in frame, ≥ 3 events that day, the measured day already over). */
  cohort: number
  /** Of those, the ones with at least one event on the measured day. */
  returned: number
  /** null when nobody qualified yet. */
  rate: number | null
  /** New players in the frame with fewer than 3 events on their first day (left out). */
  tooFewEvents: number
  /** Qualifying players whose measured day isn't over yet (left out until it is). */
  pending: number
}

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

/**
 * Every requested day in one pass over the events, keyed by day. Each day is measured independently and gets its own
 * cohort, so the later ones are smaller: a player whose day 7 has not finished is pending for day 7 while already
 * counted for day 1. Comparing D1 and D7 therefore compares different, overlapping groups of players — which is the
 * usual way retention is read, but worth knowing before reading a fall from D1 to D7 as churn.
 *
 * `events` must cover each player's whole history (their first day may predate the frame), at least up to the last
 * measured day. `from`/`to` bound the first day: from ≤ first-day start < to (null = open).
 */
export function retentionByDay(
  events: RetentionEvent[],
  from: Date | null,
  to: Date | null,
  days: readonly number[],
  now: Date = new Date(),
): Record<number, Retention> {
  const byPlayer = new Map<string, Date[]>()
  for (const e of events) {
    const list = byPlayer.get(e.player)
    if (list) list.push(e.at)
    else byPlayer.set(e.player, [e.at])
  }
  const out: Record<number, Retention> = {}
  for (const day of days) out[day] = { day, cohort: 0, returned: 0, rate: null, tooFewEvents: 0, pending: 0 }

  for (const times of byPlayer.values()) {
    const first = dayStart(times.reduce((a, b) => (b < a ? b : a)))
    // A player counts in the frame whose first day overlaps it.
    if ((from && addDays(first, 1) <= from) || (to && first >= to)) continue
    const onFirstDay = times.filter((t) => t < addDays(first, 1)).length
    const active = onFirstDay >= RETENTION_MIN_FIRST_DAY_EVENTS
    for (const day of days) {
      const r = out[day]!
      if (!active) {
        r.tooFewEvents++
        continue
      }
      const start = addDays(first, day)
      const end = addDays(first, day + 1)
      // Counting early returners before the day is over would inflate the rate: wait for the whole day.
      if (now < end) {
        r.pending++
        continue
      }
      r.cohort++
      if (times.some((t) => t >= start && t < end)) r.returned++
    }
  }
  for (const day of days) {
    const r = out[day]!
    r.rate = r.cohort ? r.returned / r.cohort : null
  }
  return out
}

/** Day-1 retention on its own — the headline number. */
export function dayOneRetention(
  events: RetentionEvent[],
  from: Date | null,
  to: Date | null,
  now: Date = new Date(),
): Retention {
  return retentionByDay(events, from, to, [1], now)[1]!
}
