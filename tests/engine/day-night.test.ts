// Day and night in Johto (docs/31): the two halves of the player's day, the switch (off, the admin's, everyone's), only
// Johto keeping the time, the wild Pokémon of the other half never dealt (an area never running dry), the lists'
// shares and tags, the rules pop-up once, and the bundled Johto pools carrying the real games' times.
import { describe, expect, it } from 'vitest'
import {
  areaDayTime,
  compileGameData,
  createRng,
  dayNightRulesDue,
  dayTimeAt,
  markDayNightRulesSeen,
  nextTurnHour,
  regionKeepsTime,
  rollWild,
  speciesTime,
  wildOdds,
  wildPoolAt,
  wildShare,
  emptyProgress,
  type Area,
  type EncounterContext,
  type EventAccess,
  type GameData,
  type SaveData,
} from '@/engine'
import { BUNDLE } from '@/config/bundle'
import { DAY_NIGHT_TAGS, withDayNight } from '../../scripts/patch-day-night'

const base = compileGameData(BUNDLE)
const route29 = base.areas.find((a) => a.name === 'Route 29' && a.regionId === 'johto')!
const route1 = base.areas.find((a) => a.name === 'Route 1')!

const withAccess = (access: EventAccess, admin = false): GameData =>
  ({
    ...base,
    config: { ...base.config, dayNight: { access } },
    ...(admin && { viewer: { admin: true } }),
  }) as GameData
const ON = withAccess('all')

const ctx = (data: GameData, area: Area, hour: number | null): EncounterContext => ({
  area,
  progress: emptyProgress(),
  data,
  teamAvgLevel: 5,
  teamHurt: false,
  isFirstInArea: false,
  pokedex: [],
  hour,
})

describe('the two halves of the day', () => {
  it('is day from 6:00 to 17:59 and night from 18:00 to 5:59', () => {
    expect([0, 5, 6, 12, 17, 18, 23].map(dayTimeAt)).toEqual([
      'night',
      'night',
      'day',
      'day',
      'day',
      'night',
      'night',
    ])
    expect(nextTurnHour('day')).toBe(18)
    expect(nextTurnHour('night')).toBe(6)
  })
})

describe('the switch and the region', () => {
  it('keeps the time only in Johto, only while switched on for the player', () => {
    expect(areaDayTime(withAccess('off'), route29, 20)).toBeNull()
    expect(areaDayTime(withAccess('admin'), route29, 20)).toBeNull()
    expect(areaDayTime(withAccess('admin', true), route29, 20)).toBe('night')
    expect(areaDayTime(ON, route29, 20)).toBe('night')
    expect(areaDayTime(ON, route29, 9)).toBe('day')
    expect(areaDayTime(ON, route1, 20)).toBeNull()
    expect(areaDayTime(ON, route29, null)).toBeNull()
  })

  it('shows the sun or the moon only to a player in Johto', () => {
    const johto = { region: 'johto' } as SaveData
    expect(regionKeepsTime(johto, ON)).toBe(true)
    expect(regionKeepsTime({ region: 'kanto' } as SaveData, ON)).toBe(false)
    expect(regionKeepsTime(johto, withAccess('off'))).toBe(false)
  })
})

describe('the wild Pokémon of the hour', () => {
  const hoothoot = 163
  const sentret = 161
  const rattata = 19

  it("deals Route 29's night Pokémon only at night and its day ones only by day; the untagged ones always", () => {
    const seen = (hour: number) => {
      const out = new Set<number>()
      const rng = createRng(7)
      for (let i = 0; i < 400; i++) {
        const e = rollWild(ctx(ON, route29, hour), rng)
        if (e?.kind === 'wild') out.add(e.dex)
      }
      return out
    }
    const night = seen(22)
    const day = seen(10)
    expect(night.has(hoothoot)).toBe(true)
    expect(night.has(sentret)).toBe(false)
    expect(day.has(sentret)).toBe(true)
    expect(day.has(hoothoot)).toBe(false)
    expect(night.has(rattata) && day.has(rattata)).toBe(true)
  })

  it('weighs the other half 0 and changes nothing while switched off or outside Johto', () => {
    const odds = (data: GameData, area: Area, hour: number) =>
      Object.fromEntries(wildOdds(ctx(data, area, hour)).map((o) => [o.entry.dex, o.weight]))
    expect(odds(ON, route29, 10)[hoothoot]).toBe(0)
    expect(odds(ON, route29, 22)[sentret]).toBe(0)
    expect(odds(withAccess('off'), route29, 22)).toEqual(odds(withAccess('off'), route29, 10))
    expect(odds(ON, route1, 22)).toEqual(odds(ON, route1, 10))
  })

  it('keeps the whole pool where every row belongs to the other half', () => {
    const allNight: Area = {
      ...route29,
      wildPool: route29.wildPool.map((w) => ({ ...w, time: 'night' as const })),
    }
    expect(wildPoolAt(allNight, 'day')).toBe(allNight.wildPool)
    expect(wildPoolAt(allNight, 'night')).toBe(allNight.wildPool)
    expect(rollWild(ctx(ON, allNight, 10), createRng(1))?.kind).toBe('wild')
  })
})

describe("the area's lists", () => {
  it('tags a species met only in one half, and gives its share when it is met', () => {
    expect(speciesTime(ON, route29, 163)).toBe('night')
    expect(speciesTime(ON, route29, 161)).toBe('day')
    expect(speciesTime(ON, route29, 19)).toBeNull()
    expect(speciesTime(withAccess('off'), route29, 163)).toBeNull()
    const nightPool = route29.wildPool.filter((w) => w.time !== 'day')
    const nightTotal = nightPool.reduce((n, w) => n + w.weight, 0)
    const share = (dex: number) =>
      nightPool.filter((w) => w.dex === dex).reduce((n, w) => n + w.weight, 0) / nightTotal
    // Hoothoot's share is the night's, even by day; Rattata's is the hour's.
    expect(wildShare(ON, route29, 163, 'day')).toBeCloseTo(share(163))
    expect(wildShare(ON, route29, 19, 'night')).toBeCloseTo(share(19))
    const total = route29.wildPool.reduce((n, w) => n + w.weight, 0)
    const all = route29.wildPool.filter((w) => w.dex === 163).reduce((n, w) => n + w.weight, 0) / total
    expect(wildShare(withAccess('off'), route29, 163, 'day')).toBeCloseTo(all)
  })
})

describe('its rules pop-up', () => {
  it('is due once, in Johto, while switched on', () => {
    const save = { region: 'johto' } as SaveData
    expect(dayNightRulesDue(save, ON)).toBe(true)
    expect(dayNightRulesDue(save, withAccess('off'))).toBe(false)
    expect(dayNightRulesDue({ region: 'kanto' } as SaveData, ON)).toBe(false)
    const seen = markDayNightRulesSeen(save)
    expect(dayNightRulesDue(seen, ON)).toBe(false)
    expect(markDayNightRulesSeen(seen)).toBe(seen)
  })
})

describe('the bundled Johto pools', () => {
  it("carry the real games' times, on rows of the areas they were already in", () => {
    expect(withDayNight(BUNDLE.areas)).toEqual(BUNDLE.areas)
    for (const [areaId, tags] of Object.entries(DAY_NIGHT_TAGS)) {
      const area = BUNDLE.areas.find((a) => a.id === areaId)
      expect(area?.regionId, areaId).toBe('johto')
      for (const [dex, time] of Object.entries(tags)) {
        const rows = area!.wildPool.filter((w) => w.dex === Number(dex))
        expect(rows.length, `${area!.name} #${dex}`).toBeGreaterThan(0)
        for (const r of rows) expect(r.time).toBe(time)
      }
    }
    // Only Johto's rows have a time, and every Johto area still meets someone in each half.
    for (const a of BUNDLE.areas) {
      if (a.regionId !== 'johto')
        expect(
          a.wildPool.some((w) => w.time),
          a.name,
        ).toBe(false)
      else if (a.wildPool.length)
        for (const half of ['day', 'night'] as const)
          expect(
            a.wildPool.some((w) => w.weight > 0 && (!w.time || w.time === half)),
            `${a.name} ${half}`,
          ).toBe(true)
    }
  })
})
