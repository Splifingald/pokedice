// Admin → Live events → Calendar: each run as a bar over the UTC days it's on, Monday first, overlapping ones in lanes,
// a recurring event's every time it comes back.
import { describe, expect, it } from 'vitest'
import { monthWeeks, shiftMonth } from '@/admin/liveCalendar'
import { newLiveEvent, type LiveEvent } from '@/engine'

const ev = (id: string, start: string, end: string, p: Partial<LiveEvent> = {}): LiveEvent => ({
  ...newLiveEvent(id, start, end),
  ...p,
})
const barsOf = (month: string, list: LiveEvent[]) =>
  monthWeeks(month, list).flatMap((w) =>
    w.bars.map((b) => ({ week: w.days[0], id: b.run.id, rule: b.rule.id, col: b.col, span: b.span, lane: b.lane, s: b.startsHere, e: b.endsHere })),
  )

describe('live events calendar', () => {
  it('shows a month as its weeks, Monday to Sunday', () => {
    // November 2026 starts on a Sunday and ends on a Monday.
    const weeks = monthWeeks('2026-11', [])
    expect(weeks.map((w) => w.days[0])).toEqual(['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30'])
    expect(weeks[0]!.days).toHaveLength(7)
    expect(weeks[5]!.days[6]).toBe('2026-12-06')
    expect(weeks.every((w) => w.lanes === 0)).toBe(true)
  })

  it('cuts a run at the weeks it crosses; an end at midnight leaves that day free', () => {
    const a = ev('a', '2026-11-07T18:00:00.000Z', '2026-11-10T18:00:00.000Z')
    const b = ev('b', '2026-11-03T18:00:00.000Z', '2026-11-05T00:00:00.000Z')
    expect(barsOf('2026-11', [a, b])).toEqual([
      { week: '2026-11-02', id: 'b', rule: 'b', col: 1, span: 2, lane: 0, s: true, e: true },
      { week: '2026-11-02', id: 'a', rule: 'a', col: 5, span: 2, lane: 0, s: true, e: false },
      { week: '2026-11-09', id: 'a', rule: 'a', col: 0, span: 2, lane: 0, s: false, e: true },
    ])
  })

  it('puts overlapping runs in lanes, the longer on top, and reuses a lane once it is free', () => {
    const long = ev('long', '2026-11-16T00:00:00.000Z', '2026-11-22T00:00:00.000Z')
    const short = ev('short', '2026-11-16T12:00:00.000Z', '2026-11-17T12:00:00.000Z')
    const later = ev('later', '2026-11-19T00:00:00.000Z', '2026-11-20T00:00:00.000Z')
    const week = monthWeeks('2026-11', [short, later, long]).find((w) => w.days[0] === '2026-11-16')!
    expect(week.bars.map((b) => [b.run.id, b.lane])).toEqual([
      ['long', 0],
      ['short', 1],
      ['later', 1],
    ])
    expect(week.lanes).toBe(2)
  })

  it("shows a recurring event's every run, each with its own id and the rule it comes from", () => {
    // 20:00 for 6 h: into the Sunday. The last week shows December's 1st Saturday too.
    const sat = ev('sat', '', '', { repeat: { kind: 'weekly', weekday: 6, weeks: [1, 3], time: '20:00', hours: 6 } })
    expect(barsOf('2026-11', [sat])).toEqual([
      { week: '2026-11-02', id: 'sat@2026-11-07', rule: 'sat', col: 5, span: 2, lane: 0, s: true, e: true },
      { week: '2026-11-16', id: 'sat@2026-11-21', rule: 'sat', col: 5, span: 2, lane: 0, s: true, e: true },
      { week: '2026-11-30', id: 'sat@2026-12-05', rule: 'sat', col: 5, span: 2, lane: 0, s: true, e: true },
    ])
  })

  it('moves a month at a time across years', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-11', 0)).toBe('2026-11')
  })
})
