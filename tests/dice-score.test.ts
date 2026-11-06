// The damage count-up's beats (docs/38 F2a): the scoring dice pop 60 ms apart a semitone up each, the combo has its
// own beat, the total counts in whole numbers to the engine's damage over 300–500 ms; short fits 250 ms; off is the
// end state at once.
import { describe, expect, it } from 'vitest'
import {
  COUNT_MAX_MS,
  COUNT_MIN_MS,
  countSteps,
  planScore,
  scoreLength,
  SHORT_TOTAL_MS,
} from '@/fx/dice/score'

const pops = (b: ReturnType<typeof planScore>) => b.filter((x) => x.kind === 'pop')
const counts = (b: ReturnType<typeof planScore>) => b.flatMap((x) => (x.kind === 'count' ? [x] : []))

describe('countSteps', () => {
  it('climbs in whole numbers and ends on the engine number', () => {
    const v = countSteps(0, 26, 12)
    expect(v.at(-1)).toBe(26)
    expect(v.every(Number.isInteger)).toBe(true)
    expect(v.length).toBeLessThanOrEqual(12)
    expect([...v].sort((a, b) => a - b)).toEqual(v)
    expect(new Set(v).size).toBe(v.length)
  })
  it('never more steps than the numbers between', () => {
    expect(countSteps(4, 6, 12)).toEqual([5, 6])
    expect(countSteps(7, 7, 12)).toEqual([7])
  })
  it('counts down too (a reroll worth less)', () => {
    const v = countSteps(20, 12, 4)
    expect(v.at(-1)).toBe(12)
    expect([...v].sort((a, b) => b - a)).toEqual(v)
  })
})

describe('planScore', () => {
  const base = { points: [4, 0, 6, 3, 3], tier: 1 as const, from: 0, to: 18 }

  it('full: a pop per scoring die, 60 ms apart, a semitone up each, in tray order', () => {
    const b = planScore({ ...base, level: 'full' })
    const p = pops(b)
    expect(p.map((x) => (x.kind === 'pop' ? x.die : -1))).toEqual([0, 2, 3, 4])
    expect(p.map((x) => (x.kind === 'pop' ? x.n : -1))).toEqual([4, 6, 3, 3])
    expect(p.map((x) => (x.kind === 'pop' ? x.tick : -1))).toEqual([0, 1, 2, 3])
    expect(p.map((x) => x.at)).toEqual([0, 60, 120, 180])
  })

  it('full: the combo lands after the pops, then the total counts for 300–500 ms to the engine number', () => {
    const b = planScore({ ...base, level: 'full' })
    const combo = b.find((x) => x.kind === 'combo')!
    expect(combo.at).toBeGreaterThan(180)
    const c = counts(b)
    expect(c[0]!.at).toBeGreaterThan(combo.at)
    expect(c.at(-1)!.value).toBe(18)
    const length = c.at(-1)!.at - (combo.at + 120)
    expect(length).toBeGreaterThanOrEqual(COUNT_MIN_MS)
    expect(length).toBeLessThanOrEqual(COUNT_MAX_MS)
    expect(c.every((x) => Number.isInteger(x.value))).toBe(true)
    // A click per step, never closer than 30 ms.
    for (let i = 1; i < c.length; i++) expect(c[i]!.at - c[i - 1]!.at).toBeGreaterThanOrEqual(30)
  })

  it('no combo: no combo beat', () => {
    const b = planScore({ ...base, tier: 0, level: 'full' })
    expect(b.some((x) => x.kind === 'combo')).toBe(false)
    expect(counts(b).at(-1)!.value).toBe(18)
  })

  it('short: the whole run in 250 ms, however many dice', () => {
    for (const n of [1, 2, 5, 8]) {
      const b = planScore({ points: Array(n).fill(6), tier: 4, from: 0, to: 99, level: 'short' })
      expect(scoreLength(b)).toBeLessThanOrEqual(SHORT_TOTAL_MS)
      expect(pops(b)).toHaveLength(n)
      expect(counts(b).at(-1)!.value).toBe(99)
      expect(counts(b).length).toBeLessThanOrEqual(4)
    }
  })

  it('off: the end state at once', () => {
    const b = planScore({ ...base, tier: 3, level: 'off' })
    expect(b.every((x) => x.at === 0)).toBe(true)
    expect(pops(b)).toHaveLength(0)
    expect(b.find((x) => x.kind === 'combo')).toMatchObject({ tier: 3 })
    expect(counts(b)).toEqual([{ at: 0, kind: 'count', value: 18 }])
  })

  it('a reroll counts on from the number shown before', () => {
    const c = counts(planScore({ ...base, from: 12, level: 'full' }))
    expect(c[0]!.value).toBeGreaterThan(12)
    expect(c.at(-1)!.value).toBe(18)
  })

  it('plays at the battle pace', () => {
    const one = planScore({ ...base, level: 'full' })
    const fast = planScore({ ...base, level: 'full', pace: 2 / 3 })
    expect(scoreLength(fast)).toBe(Math.round(scoreLength(one) * (2 / 3)))
  })
})
