// Retention on day 1, 3, 7 and 30: of the players whose first day falls in the time frame, the share who played again
// exactly N calendar days after it (the first day is day 0). A day is the player's own (the daily ping,
// src/analytics/ping.ts, sends their local date); the database sums the players up per first day (analytics_retention,
// migration 0100). A guest who signs in on the same device is one player there, with their guest days (docs/55).

/** The days after the first that retention looks at, in the order analytics_retention returns them. */
export const RETENTION_DAYS = [1, 3, 7, 30] as const
export type RetentionDay = (typeof RETENTION_DAYS)[number]

/** first day ('YYYY-MM-DD') → [new players that day, of them back on day 1, day 3, day 7, day 30]. */
export type Cohorts = Record<string, readonly number[]>

export interface Retention {
  /** New players in the frame whose day N is over. */
  cohort: number
  /** Of those, the ones who played on their day N. */
  returned: number
  /** null when nobody qualified yet. */
  rate: number | null
  /** New players in the frame whose day N isn't over yet (left out until it is). */
  pending: number
  /** The first days (cohorts) they started on. */
  pendingCohorts: number
}

/** 'YYYY-MM-DD' in the viewer's time zone. */
export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

/**
 * Sums day-N retention over the cohorts whose first day is in [from, to) (null = open). A first day counts once its
 * day N is over where the viewer is: counted while that day runs, the players still to come back that day would be
 * missing from the rate.
 */
export function retentionOn(
  cohorts: Cohorts,
  day: RetentionDay,
  from: Date | null,
  to: Date | null,
  now: Date = new Date(),
): Retention {
  const slot = RETENTION_DAYS.indexOf(day) + 1
  const lo = from ? dayKey(from) : null
  const hi = to ? dayKey(to) : null
  // Day N of a first day F is F + N; it is over once today is F + N + 1 or later.
  const lastMeasured = dayKey(addDays(now, -(day + 1)))
  const out: Retention = { cohort: 0, returned: 0, rate: null, pending: 0, pendingCohorts: 0 }
  for (const [first, row] of Object.entries(cohorts)) {
    if ((lo && first < lo) || (hi && first >= hi)) continue
    const n = row[0] ?? 0
    if (first > lastMeasured) {
      out.pending += n
      out.pendingCohorts += n > 0 ? 1 : 0
      continue
    }
    out.cohort += n
    out.returned += row[slot] ?? 0
  }
  out.rate = out.cohort ? out.returned / out.cohort : null
  return out
}

/** Every day of RETENTION_DAYS over the same frame. */
export function retentionByDay(
  cohorts: Cohorts,
  from: Date | null,
  to: Date | null,
  now: Date = new Date(),
): Record<RetentionDay, Retention> {
  return Object.fromEntries(RETENTION_DAYS.map((d) => [d, retentionOn(cohorts, d, from, to, now)])) as Record<
    RetentionDay,
    Retention
  >
}
