// Raid Battles, the day's raid (the shared calendar, 2026-10-11): one raid a UTC day, the same for every player, laid out
// per year — fixed dates, then the mythicals and the shiny legendaries on the weekends, the pseudo-legendaries spread,
// shiny fillers from late areas. Each raid Pokémon has its area; a catch waits, locked, until that area is completed.
// Legendaries met in their areas are never shiny.
import { describe, expect, it } from 'vitest'
import {
  applyRaidCatch,
  buildRaidCalendar,
  calendarRaid,
  challengeEncounter,
  countRaidTry,
  createInstance,
  createRng,
  emptyProgress,
  isLegendary,
  newRegionBlock,
  newSave,
  nextRaidsOf,
  raidEntries,
  raidHomeArea,
  raidHomeRegion,
  raidLocked,
  raidOfDay,
  raidTeam,
  releaseRaidLocks,
  rollRoamer,
  rollWild,
  setTodayRaid,
  shinyLocked,
  startRegion,
  todayRaid,
  upcomingRaids,
  type EncounterContext,
  type SaveData,
} from '@/engine'
import { parseSave } from '@/save/schema'
import { data, makeData, newId, RAIDS_OFF } from '../fixtures'

const cfg = data.config.events.raid
const FARAWAY = cfg.pool.find((p) => p.dex === 151)!.areaId
const DAY = '2026-10-10'
const area = (name: string) => data.areas.find((a) => a.name === name)!

const fresh = (): SaveData => newSave(4, data, 0, newId)
const cleared = (s: SaveData, areaId: string): SaveData => ({
  ...s,
  areaProgress: { ...s.areaProgress, [areaId]: { ...emptyProgress(), cleared: true } },
})
/** An encounter's colours (trainers have none). */
const shinyOf = (e: unknown) => (e as { shiny?: boolean } | null)?.shiny
const weekday = (year: number, i: number) => new Date(Date.UTC(year, 0, 1 + i)).getUTCDay()

describe('the raid lairs and the legendaries', () => {
  it('the mythicals are their lairs’ bosses again (Melmetal aside); every other boss is its area’s progression raid', () => {
    for (const p of cfg.pool) {
      const a = data.areas.find((x) => x.id === p.areaId)!
      expect(a, `#${p.dex}`).toBeTruthy()
      // Melmetal shares Meltan's lair, and Meltan evolves into it.
      const boss = (a.legendaryBoss ?? []).find((b) => b.dex === p.dex)
      if (p.dex === 809) expect(boss, a.name).toBeUndefined()
      else expect(boss && !boss.raid, a.name).toBe(true)
      expect(a.roundsToClear, a.name).toBe(1)
      expect(a.wildPool.length, a.name).toBeGreaterThan(0)
    }
    expect(cfg.pool.map((p) => p.dex)).toEqual(expect.arrayContaining([491, 809, 1025]))
    for (const [name, dex] of [
      ['Sky Pillar', 384],
      ['Southern Island II', 381],
      ['Fullmoon Island', 488],
    ] as const)
      expect(area(name).legendaryBoss?.find((b) => b.dex === dex)?.raid, name).toBe(true)
  })

  it('every raid Pokémon has its area: a lair, a boss area, the roamers’, where it lives, an earlier stage’s', () => {
    expect(raidHomeArea(data, 151)?.name).toBe('Faraway Island')
    expect(raidHomeArea(data, 150)?.name).toBe('Cerulean Cave')
    expect(raidHomeArea(data, 243)?.name).toMatch(/Burned Tower|Bell Tower|Whirl Islands/)
    expect(raidHomeArea(data, 149)?.name).toBe('Cerulean Cave')
    expect(raidHomeArea(data, 809)?.id).toBe(cfg.pool.find((p) => p.dex === 808)!.areaId)
    expect(raidHomeArea(data, 25)?.name).toBe('Viridian Forest')
    for (const kind of Object.values(raidEntries(data))) for (const e of kind) expect(e.areaId, `#${e.dex}`).toBeTruthy()
  })
})

describe('the calendar', () => {
  const entries = raidEntries(data)

  it('holds the mythicals and every legendary as shinies, the pseudo-legendaries both ways, shiny fillers', () => {
    // The mythicals are their lairs' bosses (docs/24), never shiny there: the calendar is where their shiny is.
    expect(entries.mythical.every((e) => e.shiny)).toBe(true)
    expect(entries.mythical).toHaveLength(new Set(cfg.pool.map((p) => p.dex)).size)
    expect(entries.legendary.length).toBeGreaterThan(50)
    expect(entries.legendary.every((e) => e.shiny && isLegendary(data, e.dex))).toBe(true)
    expect(entries.pseudo.filter((e) => e.dex === 149).map((e) => e.shiny)).toEqual([false, true])
    for (const f of entries.filler) {
      expect(f.shiny).toBe(true)
      expect(data.areas.find((a) => a.id === f.areaId)!.minLevel).toBeGreaterThanOrEqual(cfg.calendar.fillerMinLevel)
    }
  })

  for (const year of [2026, 2027, 2028]) {
    it(`${year}: a raid every day, each once, the fixed dates on their day, the legendaries on the weekends`, () => {
      const cal = buildRaidCalendar(data, year)
      const days = year === 2028 ? 366 : 365
      expect(cal).toHaveLength(days)
      expect(cal.every((r) => r.dex > 0 && r.areaId)).toBe(true)
      expect(new Set(cal.map((r) => `${r.dex}:${r.shiny}`)).size).toBe(days)
      // Never the same species two days running.
      for (let i = 1; i < cal.length; i++) expect(cal[i]!.dex, `day ${i}`).not.toBe(cal[i - 1]!.dex)
      // The big ones: all there, and almost all on a weekend (the rest are fixed dates).
      const big = cal.map((r, i) => ({ r, i })).filter(({ r }) => r.kind === 'mythical' || r.kind === 'legendary')
      expect(big.length).toBe(entries.mythical.length + entries.legendary.length)
      const weekend = big.filter(({ i }) => [0, 6].includes(weekday(year, i))).length
      const anchored = cfg.calendar.anchors.length
      expect(weekend).toBeGreaterThanOrEqual(big.length - anchored)
      expect(raidOfDay(data, `${year}-02-27`)).toMatchObject({ dex: 25, shiny: true })
      expect(raidOfDay(data, `${year}-04-22`)).toMatchObject({ dex: 251, shiny: true })
      expect(raidOfDay(data, `${year}-10-31`)).toMatchObject({ dex: 491, shiny: true })
    })
  }

  it('lays the year out the same whether a mythical’s fixed date is shiny yet or not (before or after 0044)', () => {
    const myth = new Set(cfg.pool.map((p) => p.dex))
    const before = makeData({
      events: {
        ...data.config.events,
        raid: {
          ...cfg,
          calendar: { ...cfg.calendar, anchors: cfg.calendar.anchors.map((a) => (myth.has(a.dex) ? { ...a, shiny: false } : a)) },
        },
      },
    })
    for (const year of [2026, 2027]) {
      const now = buildRaidCalendar(data, year)
      const old = buildRaidCalendar(before, year)
      expect(old.map((r) => r.dex)).toEqual(now.map((r) => r.dex))
      // Only the mythicals' fixed dates differ: their colours.
      const differ = now.flatMap((r, i) => (r.shiny !== old[i]!.shiny ? [r.dex] : []))
      expect(differ.every((d) => myth.has(d))).toBe(true)
      expect(differ.length).toBe(cfg.calendar.anchors.filter((a) => myth.has(a.dex)).length)
    }
    expect(raidOfDay(before, '2027-04-22')).toMatchObject({ dex: 251, shiny: false, kind: 'mythical' })
  })

  it('is the same for everyone, and different from one year to the next', () => {
    expect(buildRaidCalendar(data, 2026)).toEqual(buildRaidCalendar(makeData(), 2026))
    expect(buildRaidCalendar(data, 2026).map((r) => r.dex)).not.toEqual(buildRaidCalendar(data, 2027).map((r) => r.dex))
  })

  it('says what comes next and when a species comes back', () => {
    const next = upcomingRaids(data, '2026-12-30', 3)
    expect(next.map((n) => n.day)).toEqual(['2026-12-31', '2027-01-01', '2027-01-02'])
    expect(next[1]!.raid).toMatchObject({ dex: 493 })
    expect(nextRaidsOf(data, 251, '2026-04-23', 1)).toEqual([{ day: '2027-04-22', shiny: true }])
    expect(nextRaidsOf(data, 251, '2026-04-22', 1)[0]!.day).toBe('2026-04-22')
  })

  it('today’s raid goes in the save with its day', () => {
    const raid = calendarRaid(data, DAY)!
    expect(raid).toMatchObject({ day: DAY, caught: false, tries: 0 })
    const s = setTodayRaid(fresh(), raid)
    expect(todayRaid(s, DAY)).toEqual(raid)
    expect(todayRaid(s, '2026-10-11')).toBeNull()
    const back = parseSave(JSON.parse(JSON.stringify(s)))
    expect(back.ok && back.save.events?.raid).toEqual(raid)
  })
})

describe('the shiny lock', () => {
  const always = makeData({ shinyChance: 1 })
  it('a legendary met in its area is never shiny; anything else still rolls', () => {
    // Mewtwo's boss fight, where Raid Battles are off (else it's a progression raid), and Mew's, its lair's boss.
    const off = makeData({ shinyChance: 1, events: RAIDS_OFF })
    const mewtwo = off.areas.find((a) => (a.legendaryBoss ?? []).some((b) => b.dex === 150))!
    const boss = challengeEncounter(mewtwo, { ...emptyProgress(), roundsDone: 9, cleared: true }, off, 70, null, createRng(1))
    expect(boss).toMatchObject({ kind: 'boss', dex: 150 })
    expect(shinyOf(boss)).toBeUndefined()
    const mew = challengeEncounter(area('Faraway Island'), emptyProgress(), always, 70, null, createRng(1))
    expect(mew).toMatchObject({ kind: 'boss', dex: 151 })
    expect(shinyOf(mew)).toBeUndefined()
    expect(shinyLocked(always, 150)).toBe(true)
    expect(shinyLocked(always, 149)).toBe(false)
    const route = always.areas.find((a) => a.wildPool.length && a.wildPool.every((w) => !isLegendary(always, w.dex)))!
    const ctx = { area: route, progress: emptyProgress(), data: always, teamAvgLevel: 10, teamHurt: false, isFirstInArea: false, pokedex: [] } as EncounterContext
    expect(shinyOf(rollWild(ctx, createRng(2)))).toBe(true)
  })

  it('a roamer is never shiny either', () => {
    const r = always.config.roamers
    const johto = always.areas.find((a) => (a.regionId ?? 'kanto') === r.regionId && a.wildPool.length)!
    const ctx = {
      area: johto,
      progress: emptyProgress(),
      data: makeData({ shinyChance: 1, roamers: { ...r, chance: 1 } }),
      teamAvgLevel: 40,
      teamHurt: false,
      isFirstInArea: false,
      pokedex: r.requires,
    } as EncounterContext
    const met = rollRoamer(ctx, createRng(3))
    expect(met?.kind).toBe('boss')
    expect(shinyOf(met)).toBeUndefined()
  })
})

describe('a catch and its area (the lock)', () => {
  const MEW = { day: DAY, dex: 151, shiny: false, areaId: FARAWAY, caught: false, tries: 0 }

  it('your raid team: the three you registered, else your three highest-level Pokémon, capped at the raid level', () => {
    let s = fresh()
    const strong = [createInstance(6, 80, data, 'c', 0), createInstance(9, 40, data, 'b', 0), createInstance(3, 60, data, 'v', 0)]
    s = { ...s, box: [...s.box, ...strong] }
    expect(raidTeam(s, data).map((m) => [m.dex, m.level])).toEqual([
      [6, cfg.teamCap],
      [3, cfg.teamCap],
      [9, 40],
    ])
    s = { ...s, events: { raidTeam: ['b', 'nobody', 'c'] } }
    expect(raidTeam(s, data).map((m) => m.id)).toEqual(['b', 'c'])
  })

  it('counts a try on today’s raid only', () => {
    const s = setTodayRaid(fresh(), MEW)
    expect(countRaidTry(s, DAY).events?.raid?.tries).toBe(1)
    expect(countRaidTry(s, '2026-10-11')).toBe(s)
  })

  it('its area completed: it joins the Box, Pokédex and team; the raid is closed, one more raid won', () => {
    const s = setTodayRaid(cleared(fresh(), FARAWAY), MEW)
    expect(raidLocked(s, data, FARAWAY)).toBe(false)
    const r = applyRaidCatch(s, data, s.events!.raid!, 5, newId)
    expect(r).toMatchObject({ region: 'kanto', live: true, locked: false })
    expect(r.save.box.find((p) => p.id === r.instId)).toMatchObject({ dex: 151, level: cfg.level })
    expect(r.save.pokedex).toContain(151)
    expect(r.save.team).toContain(r.instId)
    expect(r.save.events?.raid?.caught).toBe(true)
    expect(r.save.events?.raidsWon).toBe(1)
  })

  it('its area not completed: it waits, locked, and joins the Box the moment the area is completed', () => {
    const s = setTodayRaid(fresh(), MEW)
    const r = applyRaidCatch(s, data, s.events!.raid!, 5, newId)
    expect(r).toMatchObject({ locked: true, instId: null })
    expect(r.save.box.some((p) => p.dex === 151)).toBe(false)
    expect(r.save.pokedex).not.toContain(151)
    expect(r.save.events?.raidLocked).toEqual([{ dex: 151, shiny: false, areaId: FARAWAY, day: DAY }])
    expect(releaseRaidLocks(r.save, data, 9, newId).released).toEqual([])
    const done = releaseRaidLocks(cleared(r.save, FARAWAY), data, 9, newId)
    expect(done.released).toEqual([{ dex: 151, shiny: false, areaId: FARAWAY, day: DAY, region: 'kanto' }])
    expect(done.save.box.some((p) => p.dex === 151)).toBe(true)
    expect(done.save.events?.raidLocked).toBeUndefined()
    const back = parseSave(JSON.parse(JSON.stringify(r.save)))
    expect(back.ok && back.save.events?.raidLocked).toHaveLength(1)
  })

  it('a region not started: it waits until you get there and complete its area, then joins that region’s Box', () => {
    const celebi = { ...MEW, dex: 251, areaId: cfg.pool.find((p) => p.dex === 251)!.areaId }
    const s = setTodayRaid(fresh(), celebi)
    expect(raidHomeRegion(data, celebi)).toBe('johto')
    const r = applyRaidCatch(s, data, celebi, 5, newId)
    expect(r.locked).toBe(true)
    const johto = data.regions.find((x) => x.id === 'johto')!
    let there = startRegion(r.save, johto, newRegionBlock(johto, johto.starters[0]!, data, 0, newId, createInstance))
    expect(releaseRaidLocks(there, data, 9, newId).released).toEqual([])
    there = cleared(there, celebi.areaId)
    const done = releaseRaidLocks(there, data, 9, newId)
    expect(done.released.map((x) => x.region)).toEqual(['johto'])
    expect(done.save.box.some((p) => p.dex === 251)).toBe(true)
  })

  it('caught while playing elsewhere, its area completed: its own region’s Box, which stays parked (D3)', () => {
    const johto = data.regions.find((x) => x.id === 'johto')!
    let s = setTodayRaid(cleared(fresh(), FARAWAY), MEW)
    s = startRegion(s, johto, newRegionBlock(johto, johto.starters[0]!, data, 0, newId, createInstance))
    const r = applyRaidCatch(s, data, s.events!.raid!, 5, newId)
    expect(r).toMatchObject({ region: 'kanto', live: false, locked: false })
    expect(r.save.parked?.kanto?.box.find((p) => p.id === r.instId)?.dex).toBe(151)
    const shiny = applyRaidCatch(s, data, { ...MEW, shiny: true }, 5, newId)
    expect(shiny.save.parked?.kanto?.box.find((p) => p.id === shiny.instId)?.shiny).toBe(true)
  })
})
