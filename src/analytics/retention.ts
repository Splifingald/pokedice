// Day-1 retention: of the players whose first day falls in the time frame, the share who played again the next
// calendar day. A day is the player's own (the daily ping, src/analytics/ping.ts, sends their local date); the
// database sums the players up per first day (analytics_d1, migration 0028).

/** first day ('YYYY-MM-DD') → [new players that day, of them back the next day]. */
export type D1Cohorts = Record<string, readonly [number, number]>

export interface Retention {
  /** New players in the frame whose next day is over. */
  cohort: number
  /** Of those, the ones who played on their next day. */
  returned: number
  /** null when nobody qualified yet. */
  rate: number | null
  /** New players in the frame whose next day isn't over yet (left out until it is). */
  pending: number
}

/** 'YYYY-MM-DD' in the viewer's time zone. */
export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

/**
 * Sums the cohorts whose first day is in [from, to) (null = open). A first day counts once the day after it is over
 * where the viewer is: counting early returners before the day ends would inflate the rate.
 */
export function dayOneRetention(
  cohorts: D1Cohorts,
  from: Date | null,
  to: Date | null,
  now: Date = new Date(),
): Retention {
  const lo = from ? dayKey(from) : null
  const hi = to ? dayKey(to) : null
  const lastMeasured = dayKey(addDays(now, -2))
  const out: Retention = { cohort: 0, returned: 0, rate: null, pending: 0 }
  for (const [day, [n, back]] of Object.entries(cohorts)) {
    if ((lo && day < lo) || (hi && day >= hi)) continue
    if (day > lastMeasured) {
      out.pending += n
      continue
    }
    out.cohort += n
    out.returned += back
  }
  out.rate = out.cohort ? out.returned / out.cohort : null
  return out
}
