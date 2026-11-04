// The load test's arithmetic (scripts/load-test/plan.ts, docs/66 §3): the request mix, the random gaps between
// requests, percentiles, and when a step counts as failed.
import { describe, expect, it } from 'vitest'
import {
  MIX,
  nextGapMs,
  percentile,
  ratePerSecond,
  steps,
  summarize,
  verdict,
  type Sample,
} from '../scripts/load-test/plan'

describe('load test plan', () => {
  it('the mix: about 33 requests per player-hour, so 1000 players send ~9 a second', () => {
    const perHour = MIX.reduce((s, m) => s + m.perHour, 0)
    expect(perHour).toBeCloseTo(32.9, 1)
    expect(ratePerSecond(1000)).toBeCloseTo(9.14, 1)
    expect(new Set(MIX.map((m) => m.kind)).size).toBe(MIX.length)
  })

  it('gaps: random, averaging one per 3600/(rate × players) s', () => {
    // u = 1 - 1/e gives exactly the mean gap.
    expect(nextGapMs(36, 100, 1 - 1 / Math.E)).toBeCloseTo(1000, 6)
    expect(nextGapMs(0, 100, 0.5)).toBe(Infinity)
    let sum = 0
    const n = 20_000
    for (let i = 0; i < n; i++) sum += nextGapMs(36, 100, (i + 0.5) / n)
    expect(sum / n).toBeGreaterThan(950)
    expect(sum / n).toBeLessThan(1050)
  })

  it('percentiles: nearest rank', () => {
    const xs = Array.from({ length: 100 }, (_, i) => i + 1)
    expect(percentile(xs, 50)).toBe(50)
    expect(percentile(xs, 95)).toBe(95)
    expect(percentile(xs, 100)).toBe(100)
    expect(percentile([], 95)).toBe(0)
  })

  it('a step: its rates, errors and slowest kind; the verdict', () => {
    const samples: Sample[] = [
      ...Array.from({ length: 95 }, () => ({ kind: 'event_time' as const, ms: 20, ok: true })),
      ...Array.from({ length: 5 }, () => ({ kind: 'versus_board' as const, ms: 900, ok: true })),
    ]
    const s = summarize(200, samples, 10)
    expect(s).toMatchObject({
      players: 200,
      requests: 100,
      perSecond: 10,
      errors: 0,
      p50: 20,
      p95: 20,
      p99: 900,
    })
    expect(s.slowest).toEqual({ kind: 'versus_board', p95: 900 })
    expect(verdict(s)).toBe('ok')
    expect(verdict({ ...s, p95: 801 })).toBe('slow')
    expect(verdict({ ...s, errorRate: 0.02 })).toBe('errors')
  })

  it('steps: ×factor up to the max, always ending on it', () => {
    expect(steps(50, 2, 300)).toEqual([50, 100, 200, 300])
    expect(steps(100, 1.5, 100)).toEqual([100])
    expect(steps(50, 1, 300)).toEqual([50])
  })
})
