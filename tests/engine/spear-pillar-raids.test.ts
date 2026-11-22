// Snowglobe Valley's Spear Pillar raids (docs/64 §4.4, the user's calls of 2026-11-22): the event's own effects on the
// race's numbers. Palkia's snow hurts every Pokémon out, Ice types too, 4 % a round, never Palkia; Dialga's Patience
// (a round as usual, a round waiting at half damage with no status, a round at ×1.5); freezing on either lasts one turn;
// two dice of its type on its last bar. The main game's Dialga and Palkia, and the Hall of Origin's Arceus, keep theirs.
import { describe, expect, it } from 'vitest'
import {
  createRaid,
  createRng,
  npcTeam,
  portalRaidRules,
  raidRules,
  raidSpecialFor,
  raidSpecialOf,
  raidTeamCap,
  type GameData,
  type RaidLogEntry,
  type RaidSideSeed,
} from '@/engine'
import { HALL_OF_ORIGIN_RUN, snowglobe } from '../../scripts/content-snowglobe-valley'
import { makeDataWith } from '../fixtures'

const h = snowglobe()
const SP = h.areas.find((a) => a.name === 'Spear Pillar')!
const HALL = h.areas.find((a) => a.name === 'Hall of Origin')!
const world = { ...h.world, minBadges: 0, previewHours: 48 }
const dataWith = (race: 'off' | 'all') =>
  makeDataWith(
    { areas: h.areas, regions: [h.region] },
    { smallWorlds: { access: 'all', list: [world] }, timeRace: { access: race }, platesRun: { access: 'all' } },
  )
const data = dataWith('all')
const DIALGA = 483
const PALKIA = 484

function raid(d: GameData, dex: number, seed = 1) {
  const cap = raidTeamCap(d, dex, 'progress', SP.id)
  const rng = createRng(seed)
  const regions = d.regions.map((r) => r.id)
  const sides: RaidSideSeed[] = [0, 1, 2].map((k) => ({
    owner: `Side ${k}`,
    look: null,
    kind: k === 0 ? 'me' : 'npc',
    team: npcTeam(d, regions, rng, `s${k}`, cap),
  }))
  return createRaid({ boss: { dex, shiny: true }, sides, kind: 'progress', areaId: SP.id, auto: true }, d, createRng(seed * 31))
}
const of = <K extends RaidLogEntry['kind']>(log: RaidLogEntry[], kind: K) =>
  log.filter((e): e is Extract<RaidLogEntry, { kind: K }> => e.kind === kind)

describe('Spear Pillar’s raids in Snowglobe Valley', () => {
  it('get the event’s effects on the race’s numbers (Lv.70, 3 bars, dice 8)', () => {
    const p = raidSpecialFor(data, PALKIA, 'progress', SP.id)!
    expect(p).toMatchObject({ level: 70, bars: 3, upgradeLevel: 8, weather: 'snow', final: { dice: ['water', 'water'] } })
    expect(p.mods.map((m) => m.k)).toEqual(['snowAll', 'frostShort'])
    const d = raidSpecialFor(data, DIALGA, 'progress', SP.id)!
    expect(d).toMatchObject({ level: 70, bars: 3, final: { dice: ['steel', 'steel'] } })
    expect(d.weather).toBeUndefined()
    expect(d.mods.map((m) => m.k)).toEqual(['patience', 'frostShort'])
    // The race's numbers stay the raid's.
    expect(raidRules(data, PALKIA, 'progress', SP.id)).toMatchObject({ level: 70, bars: 3, upgradeLevel: 8 })
    expect(raidTeamCap(data, PALKIA, 'progress', SP.id)).toBe(70)
  })

  it('the main game’s Dialga and Palkia keep theirs (Spacial Rend, rain, Roar of Time)', () => {
    expect(raidSpecialOf(PALKIA, 'progress')).toMatchObject({ weather: 'rain', level: 60, bars: 4 })
    expect(raidSpecialOf(PALKIA, 'progress')!.mods.map((m) => m.k)).toEqual(['spacialRend'])
    expect(raidSpecialOf(DIALGA, 'progress')!.mods.map((m) => m.k)).toEqual(['telegraph'])
  })

  it('the Hall of Origin’s Arceus keeps its Plates bar by bar, none of these effects', () => {
    expect(portalRaidRules(data, HALL.id)?.barTypes).toEqual(HALL_OF_ORIGIN_RUN.raid!.barTypes)
    expect(raidSpecialFor(data, 493, 'progress', HALL.id)).toBeNull()
  })

  it('Palkia: the snow hurts every Pokémon out each round, Ice types too, never Palkia', () => {
    const { state, log } = raid(data, PALKIA, 2)
    expect(of(log, 'raid_field')[0]).toMatchObject({ weather: 'snow' })
    const ticks = of(log, 'raid_tick').filter((e) => e.cause === 'snow')
    expect(ticks.length).toBeGreaterThan(0)
    expect(ticks.every((e) => e.uid !== state.boss.uid)).toBe(true)
    // Ice types are hurt too: some tick lands on one, over seeds.
    let iceHit = false
    for (let seed = 1; seed < 40 && !iceHit; seed++) {
      const r = raid(data, PALKIA, seed)
      const ice = new Set(r.state.sides.flatMap((s) => s.mons.filter((m) => m.types.includes('ice')).map((m) => m.uid)))
      iceHit = of(r.log, 'raid_tick').some((e) => e.cause === 'snow' && ice.has(e.uid))
    }
    expect(iceHit).toBe(true)
  })

  it('Dialga: Patience, round by round: as usual, waiting, ×1.5', () => {
    const { log } = raid(data, DIALGA, 3)
    // Its waiting rounds skip every strike; its ×1.5 rounds open with its huge blow.
    expect(of(log, 'raid_skip').some((e) => e.reason === 'patience')).toBe(true)
    expect(of(log, 'raid_move').some((e) => e.move === 'strong')).toBe(true)
  })

  it('switched off, the race and its raids’ effects are gone with it', () => {
    expect(raidSpecialFor(dataWith('off'), PALKIA, 'progress', SP.id)).toBeNull()
  })
})
