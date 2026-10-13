// Push notifications' plan (docs/25): what the game asks the server to announce, and when. The day's raid at the
// player's morning whatever their time zone, an Egg named after its likely pair and kept out of the night, live events
// at their start for players who'll see them, and nothing at all while the switch is off for them.
import { describe, expect, it } from 'vitest'
import {
  createInstance,
  DEFAULT_CONFIG,
  eggNotice,
  liveNotices,
  newLiveEvent,
  newSave,
  outOfQuiet,
  PUSH_RAID_DAYS,
  pushOn,
  pushPlan,
  raidNoticeAt,
  raidNotices,
  raidOfDay,
  utcDay,
  type DayCareState,
  type GameData,
  type LiveEvent,
  type SaveData,
} from '@/engine'
import { makeData, newId } from '../fixtures'

const H = 3_600_000
const MIN = 60_000
const pushData = (over: Partial<GameData['config']['push']> = {}, more: Partial<GameData['config']> = {}) =>
  makeData({ push: { ...DEFAULT_CONFIG.push, access: 'all', ...over }, ...more })
const data = pushData()
const cfg = data.config.dayCare
/** A fixed zone, in minutes east of UTC. */
const zone = (min: number) => () => min
const PARIS = zone(120)
const T0 = Date.parse('2026-10-14T06:00:00.000Z')

/** An open Day Care with these Pokémon of yours (nicknames optional) and the gift taken. */
function care(mine: (number | [number, string])[], dc: Partial<DayCareState> = {}): SaveData {
  const s = newSave(4, data, 0, newId)
  return {
    ...s,
    pokedex: Array.from({ length: cfg.unlockPokedex }, (_, i) => i + 1),
    dayCare: {
      residents: mine.map((m, i) => {
        const [dex, nickname] = typeof m === 'number' ? [m, undefined] : m
        return {
          inst: { ...createInstance(dex, 20, data, `r${i}`, 0), ...(nickname && { nickname }) },
          since: 0,
          region: 'kanto',
        }
      }),
      guests: [],
      eggClaimed: true,
      ...dc,
    },
  }
}

const progress = { roundsDone: 1, cleared: true, bossDefeated: false, bossesDefeated: [], gymsDefeated: [] }
/** Raids open: the Safari Zone cleared. */
const raider = (): SaveData => {
  const s = newSave(4, data, 0, newId)
  return { ...s, areaProgress: { ...s.areaProgress, [DEFAULT_CONFIG.events.raid.unlockAreaId!]: progress } }
}

describe('the switch', () => {
  it('is off by default, and plans nothing while off', () => {
    expect(DEFAULT_CONFIG.push.access).toBe('off')
    const off = makeData()
    expect(pushOn(off)).toBe(false)
    expect(pushPlan(raider(), off, T0, PARIS)).toEqual([])
    expect(pushPlan(raider(), data, T0, PARIS).length).toBeGreaterThan(0)
  })

  it('on for admin: only while the admin plays', () => {
    const admin = pushData({ access: 'admin' })
    expect(pushOn(admin)).toBe(false)
    expect(pushOn({ ...admin, viewer: { admin: true } })).toBe(true)
  })
})

describe('the raid of the day', () => {
  it("is announced at the player's morning, inside its UTC day, in every time zone", () => {
    const day = '2026-10-14'
    const start = Date.parse(`${day}T00:00:00Z`)
    for (const off of [-720, -600, -300, 0, 60, 120, 330, 540, 600, 720, 765, 840]) {
      const at = raidNoticeAt(day, 9, zone(off))
      expect(at).toBeGreaterThanOrEqual(start)
      expect(at).toBeLessThan(start + 24 * H)
      // 9:00 on the player's clock.
      expect(new Date(at + off * MIN).getUTCHours()).toBe(9)
    }
    // Paris (UTC+2): 7:00 UTC. Tokyo (UTC+9): the stroke of midnight UTC. Auckland (UTC+13): 20:00 UTC, its next morning.
    expect(raidNoticeAt(day, 9, zone(120))).toBe(start + 7 * H)
    expect(raidNoticeAt(day, 9, zone(540))).toBe(start)
    expect(raidNoticeAt(day, 9, zone(780))).toBe(start + 20 * H)
  })

  it('covers the coming week, nothing in the past, never once raids are shut or today is caught', () => {
    const list = raidNotices(raider(), data, T0, PARIS)
    expect(list.length).toBeGreaterThan(0)
    expect(list.length).toBeLessThanOrEqual(PUSH_RAID_DAYS)
    for (const n of list) {
      expect(n.at).toBeGreaterThan(T0)
      if (n.topic !== 'raid') throw new Error('raid')
      expect(raidOfDay(data, n.day)).toMatchObject({ dex: n.dex, shiny: n.shiny })
      expect(n.key).toBe(`raid:${n.day}`)
    }
    // 6:00 UTC in Paris is before today's 7:00: today is still to come. Once caught, it isn't.
    const today = utcDay(T0)
    expect(list[0]!.key).toBe(`raid:${today}`)
    const r = raidOfDay(data, today)!
    const caught = {
      ...raider(),
      events: { raid: { day: today, dex: r.dex, shiny: r.shiny, areaId: r.areaId, caught: true, tries: 1 } },
    }
    expect(raidNotices(caught, data, T0, PARIS).map((n) => n.key)).not.toContain(`raid:${today}`)
    // Raids not open to this player yet: nothing.
    expect(raidNotices(newSave(4, data, 0, newId), data, T0, PARIS)).toEqual([])
  })
})

describe('the Day Care', () => {
  it('names the pair: their nicknames, or their species', () => {
    const s = care([[133, 'Fluffy'], 135])
    const n = eggNotice(s, data, T0, PARIS)
    expect(n?.topic).toBe('egg')
    if (n?.topic !== 'egg') return
    expect(n.parents.map((p) => p.name)).toEqual(['Fluffy', data.species[135]!.name])
    expect(n.parents.map((p) => p.dex)).toEqual([133, 135])
  })

  it('is due at the next check, out of the quiet hours', () => {
    const last = T0 - 2 * H
    const s = care([133, 135], { breedAt: last })
    const due = last + cfg.breedHours * H
    const n = eggNotice(s, data, T0, zone(0))!
    expect(n.key).toBe(`egg:${due}`)
    expect(n.at).toBe(outOfQuiet(due, DEFAULT_CONFIG.push.quietHours, zone(0)))
  })

  it('says nothing with an Egg waiting (one at a time), or without a pair', () => {
    expect(eggNotice(care([133, 135], { egg: { at: 0 } }), data, T0, PARIS)).toBeNull()
    expect(eggNotice(care([133, 147]), data, T0, PARIS)).toBeNull()
    expect(eggNotice(care([133]), data, T0, PARIS)).toBeNull()
  })

  it('keeps the night quiet, the window crossing midnight or not', () => {
    const night = Date.parse('2026-10-14T23:30:00Z')
    expect(outOfQuiet(night, [22, 8], zone(0))).toBe(Date.parse('2026-10-15T08:00:00Z'))
    expect(outOfQuiet(Date.parse('2026-10-14T05:00:00Z'), [22, 8], zone(0))).toBe(
      Date.parse('2026-10-14T08:00:00Z'),
    )
    expect(outOfQuiet(Date.parse('2026-10-14T12:00:00Z'), [22, 8], zone(0))).toBe(
      Date.parse('2026-10-14T12:00:00Z'),
    )
    // 21:00 UTC is 23:00 in Paris: held until 8:00 there, 6:00 UTC.
    expect(outOfQuiet(Date.parse('2026-10-14T21:00:00Z'), [22, 8], PARIS)).toBe(
      Date.parse('2026-10-15T06:00:00Z'),
    )
    expect(outOfQuiet(Date.parse('2026-10-14T13:00:00Z'), [12, 14], zone(0))).toBe(
      Date.parse('2026-10-14T14:00:00Z'),
    )
    expect(outOfQuiet(night, [8, 8], zone(0))).toBe(night)
  })
})

describe('live events', () => {
  const ev = (id: string, startH: number, over: Partial<LiveEvent> = {}): LiveEvent => ({
    ...newLiveEvent(
      id,
      new Date(T0 + startH * H).toISOString(),
      new Date(T0 + (startH + 48) * H).toISOString(),
    ),
    minBadges: 0,
    ...over,
  })

  it('announces the ones to come in the next two weeks, at their start, to players with the badges', () => {
    const d = pushData(
      {},
      {
        liveEvents: {
          access: 'all',
          list: [ev('soon', 5), ev('now', -1), ev('far', 24 * 20), ev('big', 6, { minBadges: 3 })],
        },
      },
    )
    const list = liveNotices(raider(), d, T0)
    expect(list.map((n) => n.key)).toEqual(['live:soon'])
    expect(list[0]!.at).toBe(T0 + 5 * H)
  })

  it('none while live events are switched off', () => {
    const d = pushData({}, { liveEvents: { access: 'off', list: [ev('soon', 5)] } })
    expect(liveNotices(raider(), d, T0)).toEqual([])
  })
})

describe('the plan', () => {
  it('is sorted, capped, and only has the topics wanted', () => {
    const d = pushData(
      {},
      {
        liveEvents: {
          access: 'all',
          list: [
            {
              ...newLiveEvent(
                'soon',
                new Date(T0 + 2 * H).toISOString(),
                new Date(T0 + 50 * H).toISOString(),
              ),
              minBadges: 0,
            },
          ],
        },
      },
    )
    const s = { ...care([133, 135]), areaProgress: raider().areaProgress }
    const all = pushPlan(s, d, T0, PARIS)
    expect(all.map((n) => n.at)).toEqual([...all.map((n) => n.at)].sort((a, b) => a - b))
    expect(new Set(all.map((n) => n.topic))).toEqual(new Set(['egg', 'raid', 'live']))
    expect(pushPlan(s, d, T0, PARIS, ['raid']).every((n) => n.topic === 'raid')).toBe(true)
    expect(pushPlan(s, d, T0, PARIS, [])).toEqual([])
  })
})
