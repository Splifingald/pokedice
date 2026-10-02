import { describe, expect, it } from 'vitest'
import { dayOneRetention, type D1Cohorts } from '@/analytics/retention'

// Local-time dates: day n of September 2026 at hour h.
const at = (day: number, h = 12) => new Date(2026, 8, day, h)
const NOW = at(20)

describe('dayOneRetention', () => {
  const cohorts: D1Cohorts = {
    '2026-09-10': [3, 2],
    '2026-09-12': [4, 1],
    '2026-09-18': [2, 1], // day 1 = the 19th, over on the 20th
    '2026-09-19': [5, 0], // day 1 = today: not over
    '2026-09-20': [1, 0], // started today
  }

  it('sums every first day whose next day is over, and holds back the rest', () => {
    expect(dayOneRetention(cohorts, null, null, NOW)).toEqual({
      cohort: 9,
      returned: 4,
      rate: 4 / 9,
      pending: 6,
    })
  })

  it('keeps to the first days inside the frame: from included, to excluded', () => {
    expect(dayOneRetention(cohorts, at(12, 0), at(19, 0), NOW)).toEqual({
      cohort: 6,
      returned: 2,
      rate: 2 / 6,
      pending: 0,
    })
  })

  it('has no rate while nobody qualifies', () => {
    expect(dayOneRetention({}, null, null, NOW)).toEqual({ cohort: 0, returned: 0, rate: null, pending: 0 })
    expect(dayOneRetention({ '2026-09-19': [2, 1] }, null, null, NOW)).toMatchObject({
      rate: null,
      pending: 2,
    })
  })
})
