// Time for the special events (docs/18): every daily thing (the wheel's spin, the day's raid) turns over at midnight UTC,
// read from the server, never from the device's clock. The engine only does the arithmetic; where `now` comes from is
// the store's business (store/serverTime.ts).

const DAY = 86_400_000

/** The UTC day a moment falls in, as yyyy-mm-dd: the key of daily things. */
export function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10)
}

/** Milliseconds until the next midnight UTC: when the next spin and the next raid come. */
export function msToUtcMidnight(now: number): number {
  return DAY - (((now % DAY) + DAY) % DAY)
}

/** Whole days from one UTC day key to another (b after a is positive). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY)
}
