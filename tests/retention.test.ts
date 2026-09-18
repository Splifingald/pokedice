import { describe, expect, it } from 'vitest'
import { dayOneRetention, type RetentionEvent } from '@/analytics/retention'

// Local-time dates: day n of September 2026 at hour h.
const at = (day: number, h = 12) => new Date(2026, 8, day, h)
const ev = (player: string, ...times: Date[]): RetentionEvent[] => times.map((t) => ({ player, at: t }))
const NOW = at(20)

describe('dayOneRetention', () => {
  it('counts active new players and the ones who came back the next day', () => {
    const events = [
      ...ev('a', at(10, 9), at(10, 10), at(10, 11), at(11, 8)), // came back
      ...ev('b', at(10, 9), at(10, 10), at(10, 23), at(12, 8)), // skipped a day
      ...ev('c', at(10, 9), at(10, 10), at(10, 22), at(11, 0)), // back just after midnight
    ]
    expect(dayOneRetention(events, null, null, NOW)).toEqual({
      cohort: 3,
      returned: 2,
      rate: 2 / 3,
      tooFewEvents: 0,
      pending: 0,
    })
  })

  it('leaves out players with fewer than 3 events on their first day', () => {
    const r = dayOneRetention(
      [...ev('a', at(10), at(10), at(11)), ...ev('b', at(10), at(10), at(10))],
      null,
      null,
      NOW,
    )
    expect(r).toMatchObject({ cohort: 1, returned: 0, tooFewEvents: 1, rate: 0 })
  })

  it('uses the first day ever, not the first day inside the frame', () => {
    const veteran = ev('v', at(1), at(1), at(1), at(15), at(15), at(15), at(16))
    expect(dayOneRetention(veteran, at(14, 0), at(18, 0), NOW)).toMatchObject({ cohort: 0, rate: null })
  })

  it('keeps players out until their next day is over', () => {
    const events = ev('a', at(19), at(19), at(19), at(20, 9))
    expect(dayOneRetention(events, null, null, at(20, 10))).toMatchObject({
      cohort: 0,
      pending: 1,
      rate: null,
    })
    expect(dayOneRetention(events, null, null, at(21, 0))).toMatchObject({ cohort: 1, returned: 1, rate: 1 })
  })

  it('includes a first day that overlaps the start of a rolling frame', () => {
    const events = ev('a', at(10, 9), at(10, 10), at(10, 11), at(11, 9))
    expect(dayOneRetention(events, at(10, 15), null, NOW)).toMatchObject({ cohort: 1, returned: 1 })
    expect(dayOneRetention(events, at(11, 0), null, NOW)).toMatchObject({ cohort: 0 })
  })
})
