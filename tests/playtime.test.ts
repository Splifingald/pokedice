import { describe, expect, it } from 'vitest'
import { snapshotOf } from '@/analytics/events'
import { averageDailyPlaytime, dailySeconds, formatDuration, type PlaytimeEvent } from '@/analytics/playtime'
import { createInstance, newSave } from '@/engine'
import { data, newId } from './fixtures'

// Local-time dates: day n of September 2026 at hour h.
const at = (day: number, h = 12) => new Date(2026, 8, day, h)
const ev = (player: string, day: number, seconds: number, h = 12): PlaytimeEvent => ({ player, at: at(day, h), seconds })

describe('playtime', () => {
  it('sums seconds per local day, per player or for everyone', () => {
    const events = [ev('a', 10, 300, 9), ev('a', 10, 600, 23), ev('a', 11, 60, 0), ev('b', 10, 120)]
    expect(Object.fromEntries(dailySeconds(events, 'a'))).toEqual({ '2026-09-10': 900, '2026-09-11': 60 })
    expect(dailySeconds(events).get('2026-09-10')).toBe(1020)
  })

  it('averages over the days each player played (a day off is not a zero)', () => {
    // a: 30 min on the 10th, 10 min on the 12th · b: 20 min on the 10th → 60 min over 3 player-days.
    const events = [ev('a', 10, 1200), ev('a', 10, 600), ev('a', 12, 600), ev('b', 10, 1200)]
    expect(averageDailyPlaytime(events)).toEqual({ perPlayerDay: 1200, totalSeconds: 3600, playerDays: 3 })
    expect(averageDailyPlaytime([])).toEqual({ perPlayerDay: null, totalSeconds: 0, playerDays: 0 })
  })

  it('formats durations for the admin', () => {
    expect(formatDuration(40)).toBe('40 s')
    expect(formatDuration(23 * 60)).toBe('23 min')
    expect(formatDuration(65 * 60)).toBe('1 h 05')
  })
})

describe('player snapshot', () => {
  it('captures Pokédex, area, team, Box, bag and gold', () => {
    const s = newSave(4, data, 0, newId)
    const boxed = createInstance(16, 7, data, 'boxed', 0)
    const save = { ...s, box: [...s.box, boxed], pokedex: [16, 4, 16], gold: 123, inventory: { potion: 2, 'poke-ball': 0 } }
    const snap = snapshotOf(save, data)
    expect(snap.dex).toEqual([4, 16])
    expect(snap.areaId).toBe(s.currentAreaId)
    expect(snap.area).toBe(data.areas.find((a) => a.id === s.currentAreaId)!.name)
    expect(snap.team).toEqual([{ dex: 4, level: s.box[0]!.level }])
    expect(snap.box).toBe(1)
    expect(snap.inventory).toEqual({ potion: 2 })
    expect(snap.gold).toBe(123)
    expect(snap.badges).toBe(0)
  })
})
