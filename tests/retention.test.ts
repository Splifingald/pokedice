import { describe, expect, it } from 'vitest'
import { churnByArea, type ChurnRaw } from '@/analytics/churn'
import { retentionByDay, retentionOn, type Cohorts } from '@/analytics/retention'
import type { Area, Region } from '@/engine/types'

// Local-time dates: day n of September 2026 at hour h.
const at = (day: number, h = 12) => new Date(2026, 8, day, h)
const NOW = at(20)

describe('retentionOn, day 1', () => {
  // [new, back on day 1, day 3, day 7, day 30]
  const cohorts: Cohorts = {
    '2026-09-10': [3, 2, 0, 0, 0],
    '2026-09-12': [4, 1, 0, 0, 0],
    '2026-09-18': [2, 1, 0, 0, 0], // day 1 = the 19th, over on the 20th
    '2026-09-19': [5, 0, 0, 0, 0], // day 1 = today: not over
    '2026-09-20': [1, 0, 0, 0, 0], // started today
  }

  it('sums every first day whose next day is over, and holds back the rest', () => {
    expect(retentionOn(cohorts, 1, null, null, NOW)).toEqual({
      cohort: 9,
      returned: 4,
      rate: 4 / 9,
      pending: 6,
      pendingCohorts: 2,
    })
  })

  it('keeps to the first days inside the frame: from included, to excluded', () => {
    expect(retentionOn(cohorts, 1, at(12, 0), at(19, 0), NOW)).toEqual({
      cohort: 6,
      returned: 2,
      rate: 2 / 6,
      pending: 0,
      pendingCohorts: 0,
    })
  })

  it('has no rate while nobody qualifies', () => {
    expect(retentionOn({}, 1, null, null, NOW)).toEqual({
      cohort: 0,
      returned: 0,
      rate: null,
      pending: 0,
      pendingCohorts: 0,
    })
    expect(retentionOn({ '2026-09-19': [2, 1, 0, 0, 0] }, 1, null, null, NOW)).toMatchObject({
      rate: null,
      pending: 2,
      pendingCohorts: 1,
    })
  })

  it('reads a missing column as nobody back (analytics_d1’s two-number rows)', () => {
    expect(retentionOn({ '2026-09-10': [3, 2] }, 1, null, null, NOW)).toMatchObject({
      cohort: 3,
      returned: 2,
    })
    expect(retentionOn({ '2026-09-10': [3, 2] }, 7, null, null, NOW)).toMatchObject({
      cohort: 3,
      returned: 0,
    })
  })
})

describe('retentionOn, days 3, 7 and 30', () => {
  // Today is Sept 20. Day 3 of the 16th is the 19th (over); of the 17th, today (not over). Day 7 of the 12th is the
  // 19th (over); of the 13th, today. Day 30 of Aug 20 is Sept 19 (over); of Aug 21, today.
  const cohorts: Cohorts = {
    '2026-08-20': [10, 6, 5, 4, 2],
    '2026-08-21': [7, 4, 3, 2, 1],
    '2026-09-12': [4, 3, 2, 1, 0],
    '2026-09-13': [6, 2, 2, 1, 0],
    '2026-09-16': [5, 3, 2, 0, 0],
    '2026-09-17': [3, 1, 1, 0, 0],
  }

  it('counts a first day once its day N is over, each day on its own column', () => {
    expect(retentionOn(cohorts, 3, null, null, NOW)).toEqual({
      cohort: 10 + 7 + 4 + 6 + 5,
      returned: 5 + 3 + 2 + 2 + 2,
      rate: 14 / 32,
      pending: 3,
      pendingCohorts: 1,
    })
    expect(retentionOn(cohorts, 7, null, null, NOW)).toEqual({
      cohort: 10 + 7 + 4,
      returned: 4 + 2 + 1,
      rate: 7 / 21,
      pending: 6 + 5 + 3,
      pendingCohorts: 3,
    })
    expect(retentionOn(cohorts, 30, null, null, NOW)).toEqual({
      cohort: 10,
      returned: 2,
      rate: 2 / 10,
      pending: 7 + 4 + 6 + 5 + 3,
      pendingCohorts: 5,
    })
  })

  it('gives every day over the same frame', () => {
    const all = retentionByDay(cohorts, at(1, 0), null, NOW)
    expect(Object.keys(all)).toEqual(['1', '3', '7', '30'])
    expect(all[1]).toEqual(retentionOn(cohorts, 1, at(1, 0), null, NOW))
    // August's first days are out of the frame: nobody's day 30 is over in it yet.
    expect(all[30]).toEqual({ cohort: 0, returned: 0, rate: null, pending: 4 + 6 + 5 + 3, pendingCohorts: 4 })
  })
})

describe('churnByArea', () => {
  const area = (id: string, orderIndex: number, name: string, regionId?: string) =>
    ({ id, orderIndex, name, ...(regionId && { regionId }) }) as Area
  const region = (id: string, orderIndex: number, name: string) => ({ id, orderIndex, name }) as Region
  // Johto's areas come first in the list and Kanto's are out of order: the game's order puts them right.
  const data = {
    areas: [
      area('r29', 1, 'Route 29', 'johto'),
      area('r2', 3, 'Route 2'),
      area('pallet', 0, 'Pallet Town'),
      area('r1', 1, 'Route 1', 'kanto'),
    ],
    regions: [region('johto', 1, 'Johto'), region('kanto', 0, 'Kanto')],
  }
  const raw: ChurnRaw = {
    today: '2026-09-20',
    cutoff: '2026-09-17',
    areas: {
      r29: [1, 3, 2, 9.5],
      r2: [4, 0, 3.3, null],
      r1: [6, 2, 1.5, 4],
      gone: [2, 0, 1, null],
      pallet: [0, 1, null, 2],
    },
    unknown: [5, 1],
  }

  it('lists regions, then each region’s areas, in game order, and the areas the game lost last', () => {
    const c = churnByArea(raw, data)
    expect(c.groups.map((g) => [g.name, g.rows.map((r) => r.name)])).toEqual([
      ['Kanto', ['Pallet Town', 'Route 1', 'Route 2']],
      ['Johto', ['Route 29']],
      ['Areas the game no longer has', ['Area gone']],
    ])
    expect(c.groups[0]!.rows[1]).toEqual({
      areaId: 'r1',
      name: 'Route 1',
      churned: 6,
      active: 2,
      share: 6 / 8,
      churnedDays: 1.5,
      activeDays: 4,
    })
  })

  it('totals everyone, the players with no area included, and scales the bars to the most churned area', () => {
    const c = churnByArea(raw, data)
    expect(c.churned).toBe(1 + 4 + 6 + 2 + 0 + 5)
    expect(c.active).toBe(3 + 0 + 2 + 0 + 1 + 1)
    expect(c.unknown).toEqual({ churned: 5, active: 1 })
    expect(c.maxChurned).toBe(6)
    expect(c.cutoff).toBe('2026-09-17')
  })
})
