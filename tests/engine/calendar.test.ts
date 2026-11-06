// The gift calendar (docs/55): a live event of type `calendar`, behind its own switch. A door a day from its start, one
// reward each (an item, ₽ or a Pokémon, in a quantity); a door opens on its day or the day after, never later, once per
// save, and its reward lands in the region being played.
import { describe, expect, it } from 'vitest'
import {
  calendarDoors,
  calendarEnd,
  calendarGifts,
  calendarNextAt,
  calendarProblems,
  calendarReady,
  calendarRulesDue,
  calendarsFor,
  calendarToday,
  homeNotices,
  livePopupDue,
  liveProblems,
  livesFor,
  markCalendarRulesSeen,
  newLiveEvent,
  newSave,
  normaliseCalendarReward,
  normaliseLiveEvent,
  openCalendarDay,
  queuedLives,
  resizeCalendar,
  type CalendarReward,
  type GameData,
  type LiveEvent,
  type SaveData,
} from '@/engine'
import { parseSave } from '@/save/schema'
import { data, makeData, newId } from '../fixtures'

const D = 24 * 3_600_000
const T0 = Date.parse('2026-12-01T00:00:00.000Z')
const iso = (ms: number) => new Date(ms).toISOString()

const DAYS: CalendarReward[] = [
  { kind: 'gold', amount: 1000 },
  { kind: 'item', key: 'rare-candy', qty: 3 },
  { kind: 'pokemon', dex: 225, level: 10, qty: 2 },
  { kind: 'pokemon', dex: 25, level: 5, shiny: true, qty: 1 },
]

function cal(over: Partial<LiveEvent> = {}): LiveEvent {
  const start = over.start ?? iso(T0)
  const days = over.calendar?.days ?? DAYS
  return {
    ...newLiveEvent('advent', start, calendarEnd(start, days.length)),
    type: 'calendar',
    minBadges: 0,
    calendar: { days },
    ...over,
  }
}
const withCal = (e: LiveEvent = cal(), access: 'off' | 'admin' | 'all' = 'all'): GameData =>
  makeData({ liveEvents: { access: 'all', list: [e] }, giftCalendar: { access } })
const fresh = (): SaveData => newSave(4, data, 0, newId)
const states = (s: SaveData, e: LiveEvent, now: number) => calendarDoors(s, e, now).map((d) => d.state)

describe('when a calendar shows', () => {
  it('runs from its start to the day after its last (the last door’s catch-up), the switch on', () => {
    const e = cal()
    expect(e.end).toBe(iso(T0 + 5 * D))
    const d = withCal(e)
    expect(calendarsFor(fresh(), d, T0 - 1)).toEqual([])
    expect(calendarsFor(fresh(), d, T0).map((x) => x.id)).toEqual(['advent'])
    expect(calendarsFor(fresh(), d, T0 + 5 * D - 1)).toHaveLength(1)
    expect(calendarsFor(fresh(), d, T0 + 5 * D)).toEqual([])
  })

  it('only with its own switch on: off by default, for the admin alone, for everyone', () => {
    const e = cal()
    expect(livesFor(fresh(), makeData({ liveEvents: { access: 'all', list: [e] } }), T0)).toEqual([])
    const admin = withCal(e, 'admin')
    expect(livesFor(fresh(), admin, T0)).toEqual([])
    expect(livesFor(fresh(), { ...admin, viewer: { admin: true } }, T0)).toHaveLength(1)
    expect(livesFor(fresh(), withCal(e, 'off'), T0)).toEqual([])
  })

  it('never in an Extreme save (its doors are the main game’s), and from its badges', () => {
    const d = withCal(cal({ minBadges: 1 }))
    expect(livesFor(fresh(), d, T0)).toEqual([])
    const open = withCal()
    expect(livesFor({ ...fresh(), mode: 'extreme' }, open, T0)).toEqual([])
  })

  it('takes no turn in the pop-ups’ queue: its page has its rules, Home says it opened', () => {
    const e = cal()
    expect(queuedLives([e])).toEqual([])
    const s = fresh()
    expect(livePopupDue(s, queuedLives(livesFor(s, withCal(e), T0)))).toBe(false)
    expect(calendarRulesDue(s, withCal(e), T0)).toBe(true)
    expect(homeNotices(s, withCal(e), { now: T0 })).toContain('calendar')
    const seen = markCalendarRulesSeen(s)
    expect(calendarRulesDue(seen, withCal(e), T0)).toBe(false)
    expect(homeNotices(seen, withCal(e), { now: T0 })).not.toContain('calendar')
    expect(calendarRulesDue(s, withCal(e, 'off'), T0)).toBe(false)
  })
})

describe('the doors', () => {
  it('today’s opens on its day; yesterday’s still opens; two days on it is missed; later ones are shut', () => {
    const e = cal()
    const s = fresh()
    expect(calendarToday(e, T0)).toBe(1)
    expect(states(s, e, T0)).toEqual(['today', 'shut', 'shut', 'shut'])
    expect(states(s, e, T0 + D)).toEqual(['late', 'today', 'shut', 'shut'])
    expect(states(s, e, T0 + 2 * D + 5)).toEqual(['missed', 'late', 'today', 'shut'])
    // The day after the last: its catch-up only.
    expect(states(s, e, T0 + 4 * D)).toEqual(['missed', 'missed', 'missed', 'late'])
    expect(calendarReady(s, e, T0 + D).map((x) => x.day)).toEqual([1, 2])
  })

  it('says when the next one opens, none after the last', () => {
    const e = cal()
    expect(calendarNextAt(e, T0 + 5)).toBe(T0 + D)
    expect(calendarNextAt(e, T0 + 3 * D)).toBeNull()
  })

  it('ended early by the admin: every door not opened is missed', () => {
    const e = cal({ end: iso(T0 + D + 3) })
    expect(states(fresh(), e, T0 + D + 3)).toEqual(['missed', 'missed', 'missed', 'missed'])
  })
})

describe('opening a door', () => {
  it('a door giving Santa Pikachu (docs/59): in its hat with outfits on, a plain Pikachu with them off', () => {
    const e = cal({ calendar: { days: [{ kind: 'pokemon', dex: 25, level: 10, outfit: 'santa', qty: 1 }] } })
    const open = (outfits: 'off' | 'all') => {
      const d = makeData({
        liveEvents: { access: 'all', list: [e] },
        giftCalendar: { access: 'all' },
        outfits: { access: outfits },
      })
      const s = fresh()
      const res = openCalendarDay(s, d, e, 1, T0 + 10, newId)!
      return res.save.box.filter((p) => !s.box.some((q) => q.id === p.id))
    }
    expect(open('all').map((p) => [p.dex, p.outfit])).toEqual([[25, 'santa']])
    expect(open('off').map((p) => [p.dex, p.outfit])).toEqual([[25, undefined]])
  })

  it('₽ to the region being played, once', () => {
    const e = cal()
    const d = withCal(e)
    const s = fresh()
    const res = openCalendarDay(s, d, e, 1, T0 + 10, newId)!
    expect(res.save.gold).toBe(s.gold + 1000)
    expect(res.landed).toHaveLength(1)
    expect(res.save.events?.calendarOpened).toEqual({ advent: [1] })
    expect(states(res.save, e, T0 + 10)[0]).toBe('opened')
    expect(openCalendarDay(res.save, d, e, 1, T0 + 10, newId)).toBeNull()
  })

  it('an item in its quantity, into the Bag; a Pokémon as many times as its quantity, each its own', () => {
    const e = cal()
    const d = withCal(e)
    const s = fresh()
    const candy = openCalendarDay(s, d, e, 2, T0 + D + 1, newId)!
    expect(candy.save.inventory['rare-candy']).toBe((s.inventory['rare-candy'] ?? 0) + 3)
    const mons = openCalendarDay(candy.save, d, e, 3, T0 + 2 * D + 1, newId)!
    const delibirds = mons.save.box.filter((m) => m.dex === 225)
    expect(delibirds).toHaveLength(2)
    expect(new Set(delibirds.map((m) => m.id)).size).toBe(2)
    expect(mons.save.events?.calendarOpened?.advent).toEqual([2, 3])
    const shiny = openCalendarDay(mons.save, d, e, 4, T0 + 3 * D + 1, newId)!
    expect(shiny.save.box.find((m) => m.dex === 25 && m.shiny)).toBeTruthy()
  })

  it('yesterday’s on the catch-up day; never a missed one, never one to come', () => {
    const e = cal()
    const d = withCal(e)
    const s = fresh()
    expect(openCalendarDay(s, d, e, 1, T0 + D + 1, newId)).not.toBeNull()
    expect(openCalendarDay(s, d, e, 1, T0 + 2 * D, newId)).toBeNull()
    expect(openCalendarDay(s, d, e, 2, T0 + 5, newId)).toBeNull()
    expect(openCalendarDay(s, d, e, 9, T0 + 5, newId)).toBeNull()
  })

  it('keeps the doors of the last 12 calendars, the running one always', () => {
    const old = Object.fromEntries(Array.from({ length: 14 }, (_, i) => [`old-${i}`, [1]]))
    const s: SaveData = { ...fresh(), events: { calendarOpened: old } }
    const e = cal()
    const res = openCalendarDay(s, withCal(e), e, 1, T0 + 1, newId)!
    const kept = Object.keys(res.save.events!.calendarOpened!)
    expect(kept).toHaveLength(12)
    expect(kept[kept.length - 1]).toBe('advent')
    expect(kept).not.toContain('old-0')
  })

  it('the doors opened survive the save’s round trip', () => {
    const e = cal()
    const res = openCalendarDay(fresh(), withCal(e), e, 1, T0 + 1, newId)!
    const back = parseSave(JSON.parse(JSON.stringify(markCalendarRulesSeen(res.save))))
    if (!back.ok) throw new Error(back.error)
    expect(back.save.events?.calendarOpened).toEqual({ advent: [1] })
    expect(back.save.events?.calendarRulesSeen).toBe(true)
  })
})

describe('the admin’s calendar', () => {
  it('cleans each day: whole numbers in range, or nothing', () => {
    expect(normaliseCalendarReward({ kind: 'item', key: 'potion', qty: 5 })).toEqual({
      kind: 'item',
      key: 'potion',
      qty: 5,
    })
    expect(normaliseCalendarReward({ kind: 'item', key: 'potion', qty: 0 })).toBeNull()
    expect(normaliseCalendarReward({ kind: 'gold', amount: 1.5 })).toBeNull()
    expect(normaliseCalendarReward({ kind: 'pokemon', dex: 1, level: 5 })).toEqual({
      kind: 'pokemon',
      dex: 1,
      level: 5,
      qty: 1,
    })
    expect(normaliseCalendarReward({ kind: 'pokemon', dex: 1, level: 5, qty: 7 })).toBeNull()
    expect(normaliseCalendarReward({ kind: 'egg' })).toBeNull()
  })

  it('a calendar runs once, whatever its row says', () => {
    const e = normaliseLiveEvent({
      ...cal(),
      repeat: { kind: 'weekly', weekday: 1, weeks: [], time: '00:00', hours: 24 },
    })
    expect(e.repeat).toBeNull()
    expect(normaliseLiveEvent({ id: 'x', type: 'shiny' }).calendar).toEqual({ days: [] })
  })

  it('says what’s wrong: no day, a day not complete, an unknown item or Pokémon', () => {
    const d = withCal()
    expect(calendarProblems(cal(), d)).toEqual([])
    expect(calendarProblems(cal({ calendar: { days: [] } }), d)).toContain('The calendar has no day.')
    const bad = cal({
      calendar: {
        days: [
          { kind: 'item', key: 'nope', qty: 1 },
          { kind: 'gold', amount: 0 },
          { kind: 'pokemon', dex: 99_999, level: 5, qty: 1 },
        ],
      },
    })
    expect(calendarProblems(bad, d)).toEqual([
      'Day 1: unknown item nope.',
      expect.stringMatching(/^Day 2: its reward isn't complete/),
      'Day 3: unknown Pokémon #99999.',
    ])
    expect(liveProblems([], bad, d, T0)).toContain('Day 1: unknown item nope.')
  })

  it('resizes: the days kept, new ones copying the last, 1 to 31', () => {
    expect(resizeCalendar(DAYS, 2)).toEqual(DAYS.slice(0, 2))
    expect(resizeCalendar(DAYS, 6).slice(4)).toEqual([DAYS[3], DAYS[3]])
    expect(resizeCalendar([], 2)).toEqual([
      { kind: 'gold', amount: 1000 },
      { kind: 'gold', amount: 1000 },
    ])
    expect(resizeCalendar(DAYS, 99)).toHaveLength(31)
    expect(resizeCalendar(DAYS, 0)).toHaveLength(1)
  })

  it('gives a Pokémon as one gift per copy, all to the region being played', () => {
    expect(calendarGifts({ kind: 'pokemon', dex: 225, level: 10, qty: 3 })).toEqual(
      Array.from({ length: 3 }, () => ({ kind: 'pokemon', dex: 225, level: 10, region: 'current' })),
    )
    expect(calendarGifts({ kind: 'gold', amount: 5 })).toEqual([
      { kind: 'gold', amount: 5, region: 'current' },
    ])
  })
})
