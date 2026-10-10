// Raid Battles, the day's raid (docs/18 §3, docs/19 phase 4): the pool mythicals left their lairs (one round of wild
// Pokémon each), clearing a lair unlocks its raid, and the day's pick follows the rules: the pool's mythicals to catch,
// then their shinies, then the fallback species of the regions reached, never one raided in the last 72 h.
import { describe, expect, it } from 'vitest'
import {
  emptyProgress,
  newSave,
  pickRaid,
  raidCandidates,
  raidPool,
  raidUnlockedBy,
  regionOfArea,
  regionSpecies,
  setTodayRaid,
  todayRaid,
  type SaveData,
} from '@/engine'
import { parseSave } from '@/save/schema'
import { data, newId } from '../fixtures'

const cfg = data.config.events.raid
const FARAWAY = cfg.pool.find((p) => p.dex === 151)!.areaId
const DAY = '2026-10-10'

const fresh = (): SaveData => newSave(4, data, 0, newId)
const cleared = (s: SaveData, areaId: string): SaveData => ({
  ...s,
  areaProgress: { ...s.areaProgress, [areaId]: { ...emptyProgress(), cleared: true } },
})
const owning = (s: SaveData, ...dex: number[]): SaveData => ({ ...s, pokedex: [...new Set([...s.pokedex, ...dex])] })

describe('the raid lairs', () => {
  it('no longer hold their mythicals; each is one round of wild Pokémon', () => {
    for (const p of cfg.pool) {
      const a = data.areas.find((x) => x.id === p.areaId)!
      expect(a, `#${p.dex}`).toBeTruthy()
      expect((a.legendaryBoss ?? []).some((b) => b.dex === p.dex), a.name).toBe(false)
      expect(a.roundsToClear, a.name).toBe(1)
      expect(a.wildPool.length, a.name).toBeGreaterThan(0)
      expect(a.encounterWeights.wild, a.name).toBeGreaterThan(0)
    }
    expect(raidUnlockedBy(data, FARAWAY).map((p) => p.dex)).toEqual([151])
  })

  it('keep their mythicals in the region’s Pokédex: Mew is still Kanto’s #151', () => {
    for (const p of cfg.pool) {
      const lair = data.areas.find((x) => x.id === p.areaId)!
      expect(regionSpecies(data, regionOfArea(lair)).has(p.dex), `#${p.dex}`).toBe(true)
    }
    expect(regionSpecies(data, 'kanto').size).toBe(151)
  })
})

describe('the raid pool', () => {
  it('grows as lairs are cleared, and keeps a mythical caught before the raids', () => {
    expect(raidPool(fresh(), data)).toEqual([])
    expect(raidPool(cleared(fresh(), FARAWAY), data).map((p) => p.dex)).toEqual([151])
    expect(raidPool(owning(fresh(), 251), data).map((p) => p.dex)).toEqual([251])
  })
})

describe("the day's raid", () => {
  it('a pool mythical to catch comes first', () => {
    const c = raidCandidates(cleared(fresh(), FARAWAY), data, DAY)
    expect(c).toEqual({ kind: 'pool', list: [{ dex: 151, shiny: false, areaId: FARAWAY }] })
  })

  it('then, the pool all caught but locked ones left, the fallback species of the regions reached', () => {
    const s = owning(cleared(fresh(), FARAWAY), 151)
    const c = raidCandidates(s, data, DAY)
    expect(c.kind).toBe('fallback')
    expect(c.list.map((x) => x.dex).sort((a, b) => a - b)).toEqual([130, 131, 143, 149])
    // A fallback raid is fought where the species lives.
    for (const x of c.list) expect(data.areas.find((a) => a.id === x.areaId)?.regionId ?? 'kanto').toBe('kanto')
  })

  it('then, every pool species caught, their shinies', () => {
    const s = owning(fresh(), ...cfg.pool.map((p) => p.dex))
    const c = raidCandidates(s, data, DAY)
    expect(c.kind).toBe('shiny')
    expect(c.list).toHaveLength(cfg.pool.length)
    expect(c.list.every((x) => x.shiny)).toBe(true)
  })

  it('never one raided in the last 72 h, unless nothing else is left', () => {
    let s = owning(cleared(fresh(), FARAWAY), 151)
    s = { ...s, events: { raidHistory: [{ day: '2026-10-09', dex: 149 }, { day: '2026-10-07', dex: 130 }] } }
    const c = raidCandidates(s, data, DAY)
    expect(c.list.map((x) => x.dex)).not.toContain(149)
    // Three days ago is outside the window.
    expect(c.list.map((x) => x.dex)).toContain(130)
    const only = { ...cleared(fresh(), FARAWAY), events: { raidHistory: [{ day: '2026-10-09', dex: 151 }] } }
    expect(raidCandidates(only, data, DAY).list.map((x) => x.dex)).toEqual([151])
  })

  it('is the same all day for the same player, and a fallback one is shiny about 30 % of the time', () => {
    const s = owning(cleared(fresh(), FARAWAY), 151)
    expect(pickRaid(s, data, DAY, 'device-1')).toEqual(pickRaid(s, data, DAY, 'device-1'))
    let shiny = 0
    for (let d = 1; d <= 400; d++) if (pickRaid(s, data, `2027-01-${String(d).padStart(3, '0')}`, 'device-1')!.shiny) shiny++
    expect(shiny / 400).toBeGreaterThan(0.2)
    expect(shiny / 400).toBeLessThan(0.4)
  })

  it('is kept with its day and a week of history, through a save round trip', () => {
    const raid = pickRaid(cleared(fresh(), FARAWAY), data, DAY, 'x')!
    const s = setTodayRaid({ ...fresh(), events: { raidHistory: [{ day: '2026-09-01', dex: 1 }, { day: '2026-10-08', dex: 149 }] } }, raid)
    expect(todayRaid(s, DAY)).toEqual(raid)
    expect(todayRaid(s, '2026-10-11')).toBeNull()
    expect(s.events?.raidHistory).toEqual([{ day: '2026-10-08', dex: 149 }, { day: DAY, dex: 151 }])
    const back = parseSave(JSON.parse(JSON.stringify(s)))
    expect(back.ok && back.save.events?.raid).toEqual(raid)
  })
})
