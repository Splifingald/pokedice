// Admin → Events → Raids (the user's ask, 2026-10-11): each raid Pokémon can have its own numbers; the calendar comes
// from the rules and a seed, a new seed re-plans only the days after it, and any day can be set by hand.
import { describe, expect, it } from 'vitest'
import {
  buildRaidCalendar,
  createRaid,
  createRng,
  npcTeam,
  raidOfDay,
  raidPlanOf,
  raidRules,
  raidSeedOn,
  type GameData,
  type RaidConfig,
} from '@/engine'
import { EVENTS_ON, makeData } from '../fixtures'

const withRaid = (patch: Partial<RaidConfig>, cal: Partial<RaidConfig['calendar']> = {}): GameData => {
  const raid = { ...EVENTS_ON.raid, ...patch, calendar: { ...EVENTS_ON.raid.calendar, ...cal } }
  return makeData({ events: { ...EVENTS_ON, raid } })
}
const data = withRaid({})
const regions = data.regions.map((r) => r.id)
const sides = (d: GameData) => {
  const rng = createRng(4)
  return [0, 1, 2].map((k) => ({ owner: `Side ${k}`, look: null, kind: 'npc' as const, team: npcTeam(d, regions, rng, `s${k}`) }))
}
const yearDays = (y: number) => Array.from({ length: 365 }, (_, i) => new Date(Date.UTC(y, 0, 1 + i)).toISOString().slice(0, 10))

describe('a raid Pokémon’s own numbers', () => {
  it('override the defaults, field by field', () => {
    const d = withRaid({ perMon: { 151: { bars: 5, level: 70 } } })
    const mew = raidRules(d, 151)
    expect(mew).toMatchObject({
      bars: 5,
      level: 70,
      barHp: EVENTS_ON.raid.barHp,
      upgradeLevel: EVENTS_ON.raid.upgradeLevel,
    })
    expect(raidRules(d, 251)).toMatchObject({ bars: EVENTS_ON.raid.bars, level: EVENTS_ON.raid.level })
  })

  it('ignore the summon numbers an older config still holds', () => {
    const d = withRaid({ perMon: { 151: { bars: 4, startAllies: 2, maxField: 2 } as never } })
    expect(Object.keys(raidRules(d, 151)).sort()).toEqual(['barHp', 'bars', 'level', 'upgradeLevel'])
  })

  it('shape the fight: its bars, its level', () => {
    const d = withRaid({ perMon: { 151: { bars: 5, level: 70 } } })
    const own = createRaid({ boss: { dex: 151, shiny: false }, sides: sides(d) }, d, createRng(1))
    expect(own.state.bars).toBe(5)
    expect(own.state.boss.level).toBe(70)
    const plain = createRaid({ boss: { dex: 151, shiny: false }, sides: sides(data) }, data, createRng(1))
    expect(plain.state.bars).toBe(EVENTS_ON.raid.bars)
    expect(plain.state.boss.level).toBe(EVENTS_ON.raid.level)
  })

  it('the type matchups are the admin’s, the sides’ and the raid Pokémon’s', () => {
    const d = withRaid({
      sideTypes: { super: 1.5, resisted: 0.4, immune: 0 },
      bossTypes: { super: 1.8, resisted: 0.6, immune: 0.3 },
    })
    const { state } = createRaid({ boss: { dex: 151, shiny: false }, sides: sides(d) }, d, createRng(1))
    expect(state.sideLevels.typeScale).toEqual({ super: 1.5, resisted: 0.4, immune: 0 })
    expect(state.foeLevels.typeScale).toEqual({ super: 1.8, resisted: 0.6, immune: 0.3 })
  })
})

describe('the seed', () => {
  it('seed 0 is the calendar as it was', () => {
    expect(raidSeedOn(data, '2027-05-01')).toBe(0)
    expect(buildRaidCalendar(withRaid({}, { seeds: [{ from: '2020-01-01', seed: 0 }] }), 2027)).toEqual(buildRaidCalendar(data, 2027))
  })

  it('a new seed re-plans only the days from its date, without repeating a mythical or legendary of the year', () => {
    const d = withRaid({}, { seeds: [{ from: '2027-06-01', seed: 777 }] })
    expect(raidSeedOn(d, '2027-05-31')).toBe(0)
    expect(raidSeedOn(d, '2027-06-01')).toBe(777)
    const before = buildRaidCalendar(data, 2027)
    const after = buildRaidCalendar(d, 2027)
    const june = yearDays(2027).indexOf('2027-06-01')
    expect(after.slice(0, june)).toEqual(before.slice(0, june))
    expect(after.slice(june).some((r, i) => r.dex !== before[june + i]!.dex)).toBe(true)
    // Fixed dates keep their day.
    expect(after[yearDays(2027).indexOf('2027-10-31')]!.dex).toBe(before[yearDays(2027).indexOf('2027-10-31')]!.dex)
    const big = after.filter((r) => r.kind === 'mythical' || r.kind === 'legendary').map((r) => `${r.dex}${r.shiny}`)
    expect(new Set(big).size).toBe(big.length)
    expect(after.every((r) => r.dex > 0)).toBe(true)
  })

  it('a seed from an earlier year applies from the start of the next', () => {
    const d = withRaid({}, { seeds: [{ from: '2026-12-01', seed: 9 }] })
    expect(raidSeedOn(d, '2027-01-01')).toBe(9)
    expect(buildRaidCalendar(d, 2027)).not.toEqual(buildRaidCalendar(data, 2027))
  })
})

describe('days set by hand', () => {
  it('replace that day’s raid, the plan still known', () => {
    const day = '2027-03-10'
    const plan = raidOfDay(data, day)!
    const d = withRaid({}, { overrides: { [day]: { dex: 384, shiny: true } } })
    expect(raidOfDay(d, day)).toMatchObject({ dex: 384, shiny: true, manual: true })
    expect(raidOfDay(d, day)!.areaId).toBeTruthy()
    expect(raidPlanOf(d, day)).toMatchObject({ dex: plan.dex, shiny: plan.shiny })
    expect(raidOfDay(d, '2027-03-11')).toEqual(raidOfDay(data, '2027-03-11'))
  })

  it('a swap is two days set by hand', () => {
    const a = '2027-04-02'
    const b = '2027-04-09'
    const ra = raidOfDay(data, a)!
    const rb = raidOfDay(data, b)!
    const d = withRaid({}, { overrides: { [a]: { dex: rb.dex, shiny: rb.shiny }, [b]: { dex: ra.dex, shiny: ra.shiny } } })
    expect(raidOfDay(d, a)).toMatchObject({ dex: rb.dex, shiny: rb.shiny })
    expect(raidOfDay(d, b)).toMatchObject({ dex: ra.dex, shiny: ra.shiny })
  })

  it('an unknown species set by hand is ignored', () => {
    const day = '2027-03-10'
    const d = withRaid({}, { overrides: { [day]: { dex: 99_999, shiny: false } } })
    expect(raidOfDay(d, day)).toEqual(raidOfDay(data, day))
  })
})
