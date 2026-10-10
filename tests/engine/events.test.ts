// The special events' shared rules (docs/18, docs/19 phase 1): which are open, Home's order, the unlock pop-up, the
// teaser, and the UTC day arithmetic.
import { describe, expect, it } from 'vitest'
import {
  activeEvents,
  badgeCase,
  createInstance,
  daysBetween,
  DEFAULT_CONFIG,
  eventsTeaser,
  eventUnlockDue,
  eventUnlocked,
  markEventsSeen,
  msToUtcMidnight,
  newRegionBlock,
  newSave,
  startRegion,
  utcDay,
  type EventsConfig,
  type GameData,
  type SaveData,
} from '@/engine'
import { parseSave } from '@/save/schema'
import { makeData, newId } from '../fixtures'

const ROUTES_7_8 = DEFAULT_CONFIG.events.wheel.unlockAreaId!
const SAFARI = DEFAULT_CONFIG.events.raid.unlockAreaId!

/** All three events on (they ship off until each is built). */
const allOn = (patch: Partial<EventsConfig> = {}): GameData => {
  const d = DEFAULT_CONFIG.events
  return makeData({
    events: {
      ...d,
      wheel: { ...d.wheel, enabled: true },
      raid: { ...d.raid, enabled: true },
      rebattle: { ...d.rebattle, enabled: true },
      ...patch,
    },
  })
}

const progress = (cleared: boolean) => ({ roundsDone: 1, cleared, bossDefeated: false, bossesDefeated: [], gymsDefeated: [] })

function clear(save: SaveData, ...areaIds: string[]): SaveData {
  const areaProgress = { ...save.areaProgress }
  for (const id of areaIds) areaProgress[id] = progress(true)
  return { ...save, areaProgress }
}

/** The first `n` Kanto badges won. */
function withBadges(save: SaveData, data: GameData, n: number): SaveData {
  const areaProgress = { ...save.areaProgress }
  for (const b of badgeCase(save, data).slice(0, n)) {
    const p = areaProgress[b.areaId] ?? progress(false)
    areaProgress[b.areaId] = { ...p, gymsDefeated: [...p.gymsDefeated, b.trainerId] }
  }
  return { ...save, areaProgress }
}

describe('special events: unlocking', () => {
  const data = allOn()
  const fresh = newSave(4, data, 1000, newId)

  it('the wheel ships on; the others stay off until they are built', () => {
    const shipped = makeData()
    const late = clear(fresh, ROUTES_7_8, SAFARI)
    expect(activeEvents(late, shipped)).toEqual(['wheel'])
    const d = DEFAULT_CONFIG.events
    const off = makeData({ events: { ...d, wheel: { ...d.wheel, enabled: false } } })
    expect(activeEvents(late, off)).toEqual([])
    expect(eventUnlockDue(late, off)).toBeNull()
  })

  it('open when their area is cleared', () => {
    expect(activeEvents(fresh, data)).toEqual([])
    const wheel = clear(fresh, ROUTES_7_8)
    expect(activeEvents(wheel, data)).toEqual(['wheel'])
    expect(eventUnlocked('raid', wheel, data)).toBe(false)
    const both = clear(wheel, SAFARI)
    // Home's order: raids (3) before the wheel (5).
    expect(activeEvents(both, data)).toEqual(['raid', 'wheel'])
  })

  it('the rebattle opens with a league, and an area cleared in a parked region still counts', () => {
    const kanto = data.regions.find((r) => r.id === 'kanto')!
    const johto = data.regions.find((r) => r.id === 'johto')!
    const champ = clear(clear(fresh, ROUTES_7_8), kanto.leagueAreaId)
    expect(activeEvents(champ, data)).toEqual(['rebattle', 'wheel'])
    // Moving on to Johto parks Kanto: its cleared areas still open the events.
    const inJohto = startRegion(champ, johto, newRegionBlock(johto, 152, data, 1, newId, createInstance))
    expect(activeEvents(inJohto, data)).toEqual(['rebattle', 'wheel'])
  })

  it('follows the admin order', () => {
    const d = DEFAULT_CONFIG.events
    const reordered = allOn({ wheel: { ...d.wheel, enabled: true, priority: 1 } })
    expect(activeEvents(clear(fresh, ROUTES_7_8, SAFARI), reordered)).toEqual(['wheel', 'raid'])
  })
})

describe('special events: the unlock pop-up', () => {
  const data = allOn()
  const fresh = newSave(4, data, 1000, newId)

  it('is due once per event, newest first, and showing one marks every open event seen', () => {
    const wheel = clear(fresh, ROUTES_7_8)
    expect(eventUnlockDue(wheel, data)).toBe('wheel')
    const seen = markEventsSeen(wheel, data)
    expect(eventUnlockDue(seen, data)).toBeNull()
    // Two open at once (an older save): one pop-up, the newest.
    const both = clear(fresh, ROUTES_7_8, SAFARI)
    expect(eventUnlockDue(both, data)).toBe('raid')
    expect(eventUnlockDue(markEventsSeen(both, data), data)).toBeNull()
  })

  it('survives a save round trip', () => {
    const seen = markEventsSeen(clear(fresh, ROUTES_7_8), data)
    const back = parseSave(JSON.parse(JSON.stringify(seen)))
    expect(back.ok && back.save.events?.seen).toEqual(['wheel'])
    expect(markEventsSeen(seen, data)).toBe(seen)
  })
})

describe('special events: the teaser', () => {
  const data = allOn()
  const fresh = newSave(4, data, 1000, newId)

  it('says "coming later" before the 3rd Kanto badge, then names the first event\'s area', () => {
    expect(eventsTeaser(fresh, data)).toEqual({ kind: 'later' })
    expect(eventsTeaser(withBadges(fresh, data, 2), data)).toEqual({ kind: 'later' })
    expect(eventsTeaser(withBadges(fresh, data, 3), data)).toEqual({ kind: 'soon', areaId: ROUTES_7_8 })
  })

  it('is gone once an event opens, and stays "later" while every event is off', () => {
    expect(eventsTeaser(clear(withBadges(fresh, data, 4), ROUTES_7_8), data)).toBeNull()
    const d = DEFAULT_CONFIG.events
    const none = makeData({ events: { ...d, wheel: { ...d.wheel, enabled: false } } })
    expect(eventsTeaser(withBadges(fresh, none, 3), none)).toEqual({ kind: 'later' })
  })
})

describe('special events: time', () => {
  it('turns days over at midnight UTC', () => {
    const t = Date.parse('2026-10-10T23:59:30Z')
    expect(utcDay(t)).toBe('2026-10-10')
    expect(utcDay(t + 31_000)).toBe('2026-10-11')
    expect(msToUtcMidnight(t)).toBe(30_000)
    expect(msToUtcMidnight(Date.parse('2026-10-11T00:00:00Z'))).toBe(86_400_000)
    expect(daysBetween('2026-10-08', '2026-10-11')).toBe(3)
  })
})
