// The load test's arithmetic (docs/66 §3), apart from the network so it can be tested: what a player sends per hour of
// play, when the next request of each kind leaves, and how a step's latencies read.

/** One kind of request the game sends, and how often per hour of play. */
export interface MixEntry {
  kind: RequestKind
  perHour: number
}

export type RequestKind =
  | 'event_time'
  | 'friend_status'
  | 'invite_status'
  | 'my_feedback'
  | 'trade_mine'
  | 'app_signals'
  | 'config_version'
  | 'save_stamp'
  | 'save_write'
  | 'versus_board'
  | 'leaderboard'
  | 'content'

/**
 * Requests per player per hour of play, as the live game sent them in the 24 h to 2026-11-03 (Supabase's edge logs,
 * about 1.4k player-hours a day; pg_stat_statements for the split). Browsers add a CORS preflight to about 30 % of
 * these, which Node doesn't send. The analytics pings (~1/h) are left out so test accounts don't count as players.
 * `content` is one full download of the game's tables (about 15 requests, 2.5 MB), sent after each deploy or admin edit.
 */
export const MIX: readonly MixEntry[] = [
  { kind: 'event_time', perHour: 8 },
  { kind: 'friend_status', perHour: 2.5 },
  { kind: 'invite_status', perHour: 2.5 },
  { kind: 'my_feedback', perHour: 2.5 },
  { kind: 'trade_mine', perHour: 2 },
  { kind: 'app_signals', perHour: 1.5 },
  { kind: 'config_version', perHour: 3 },
  { kind: 'save_stamp', perHour: 4 },
  { kind: 'save_write', perHour: 2 },
  { kind: 'versus_board', perHour: 4 },
  { kind: 'leaderboard', perHour: 0.1 },
  { kind: 'content', perHour: 0.8 },
]

/** Requests per second for `players` playing at once (a `content` download counts once here). */
export const ratePerSecond = (players: number, mix: readonly MixEntry[] = MIX): number =>
  (players * mix.reduce((s, m) => s + m.perHour, 0)) / 3600

/**
 * Milliseconds to the next request of one kind: arrivals at random (a Poisson process), as real players' requests
 * are. `u` in [0, 1) is the random draw.
 */
export function nextGapMs(perHour: number, players: number, u: number): number {
  const perMs = (perHour * players) / 3_600_000
  if (perMs <= 0) return Infinity
  return -Math.log(1 - u) / perMs
}

/** The `p` percentile (0–100) of latencies already sorted ascending; 0 for none. */
export function percentile(sorted: readonly number[], p: number): number {
  if (!sorted.length) return 0
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[i]!
}

export interface Sample {
  kind: RequestKind
  ms: number
  ok: boolean
}

export interface StepStats {
  players: number
  requests: number
  perSecond: number
  errors: number
  errorRate: number
  p50: number
  p95: number
  p99: number
  /** The slowest kind by its own p95, to say what gave first. */
  slowest: { kind: RequestKind; p95: number } | null
}

export function summarize(players: number, samples: readonly Sample[], seconds: number): StepStats {
  const sorted = samples.map((s) => s.ms).sort((a, b) => a - b)
  const errors = samples.filter((s) => !s.ok).length
  const byKind = new Map<RequestKind, number[]>()
  for (const s of samples) byKind.set(s.kind, [...(byKind.get(s.kind) ?? []), s.ms])
  let slowest: StepStats['slowest'] = null
  for (const [kind, ms] of byKind) {
    const p95 = percentile(
      ms.sort((a, b) => a - b),
      95,
    )
    if (!slowest || p95 > slowest.p95) slowest = { kind, p95 }
  }
  return {
    players,
    requests: samples.length,
    perSecond: seconds > 0 ? samples.length / seconds : 0,
    errors,
    errorRate: samples.length ? errors / samples.length : 0,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    slowest,
  }
}

export interface Limits {
  /** A step whose p95 goes over this is too slow (ms). */
  p95Ms: number
  /** A step with more errors than this share fails. */
  errorRate: number
}

export const DEFAULT_LIMITS: Limits = { p95Ms: 800, errorRate: 0.01 }

/** Whether a step held: the test stops at the first one that didn't. */
export function verdict(s: StepStats, limits: Limits = DEFAULT_LIMITS): 'ok' | 'slow' | 'errors' {
  if (s.errorRate > limits.errorRate) return 'errors'
  if (s.p95 > limits.p95Ms) return 'slow'
  return 'ok'
}

/** The players at once of each step: from `start`, ×`factor` each time, up to `max` (always ending on it). */
export function steps(start: number, factor: number, max: number): number[] {
  if (start <= 0 || factor <= 1 || max < start) return [Math.max(1, Math.min(start, max))]
  const out: number[] = []
  for (let p = start; p < max; p = Math.ceil(p * factor)) out.push(p)
  out.push(max)
  return out
}
