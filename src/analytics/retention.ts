// Day-1 retention: of the players whose first day falls in the time frame and who were active that day (≥ 3 events),
// the share who came back the next calendar day (≥ 1 event). Days are the viewer's local calendar days.

export const RETENTION_MIN_FIRST_DAY_EVENTS = 3

export interface RetentionEvent {
  player: string
  at: Date
}

export interface Retention {
  /** Players who qualified (first day in frame, ≥ 3 events that day, next day already over). */
  cohort: number
  /** Of those, the ones with at least one event on the next day. */
  returned: number
  /** null when nobody qualified yet. */
  rate: number | null
  /** New players in the frame with fewer than 3 events on their first day (left out). */
  tooFewEvents: number
  /** Qualifying players whose next day isn't over yet (left out until it is). */
  pending: number
}

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

/**
 * `events` must cover each player's whole history (their first day may predate the frame), at least up to the day
 * after the frame. `from`/`to` bound the first day: from ≤ first-day start < to (null = open).
 */
export function dayOneRetention(
  events: RetentionEvent[],
  from: Date | null,
  to: Date | null,
  now: Date = new Date(),
): Retention {
  const byPlayer = new Map<string, Date[]>()
  for (const e of events) {
    const list = byPlayer.get(e.player)
    if (list) list.push(e.at)
    else byPlayer.set(e.player, [e.at])
  }
  const out: Retention = { cohort: 0, returned: 0, rate: null, tooFewEvents: 0, pending: 0 }
  for (const times of byPlayer.values()) {
    const first = dayStart(times.reduce((a, b) => (b < a ? b : a)))
    // A player counts in the frame whose first day overlaps it.
    if ((from && addDays(first, 1) <= from) || (to && first >= to)) continue
    const day1 = addDays(first, 1)
    const day2 = addDays(first, 2)
    const onFirstDay = times.filter((t) => t < day1).length
    if (onFirstDay < RETENTION_MIN_FIRST_DAY_EVENTS) {
      out.tooFewEvents++
      continue
    }
    // Counting early returners before the day is over would inflate the rate: wait for the whole next day.
    if (now < day2) {
      out.pending++
      continue
    }
    out.cohort++
    if (times.some((t) => t >= day1 && t < day2)) out.returned++
  }
  out.rate = out.cohort ? out.returned / out.cohort : null
  return out
}
