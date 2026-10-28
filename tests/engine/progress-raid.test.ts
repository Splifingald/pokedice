// Progression raids (docs/24): every area boss but the mythicals is a raid of its own area, open once the area is
// completed, fought until caught; your team for it comes from that region's Box and stays on it for your friends.
// START with empty slots offers four NPC trainers, the same four until the try starts.
import { describe, expect, it } from 'vitest'
import {
  RAID_SPECIALS,
  applyProgressRaidCatch,
  createInstance,
  createRng,
  emptyProgress,
  fightBosses,
  newRegionBlock,
  newSave,
  openRaidIn,
  progressRaidKey,
  progressRaidOf,
  progressRaids,
  progressRaidState,
  progressRaidTeam,
  raidBosses,
  raidNpcOffer,
  raidRules,
  raidTeamCap,
  regionBox,
  regionSpecies,
  setProgressRaidTeam,
  settleClears,
  startRegion,
  type Area,
  type SaveData,
} from '@/engine'
import { parseSave } from '@/save/schema'
import { bossData, data, makeData, newId, RAIDS_OFF } from '../fixtures'

const area = (name: string): Area => data.areas.find((a) => a.name === name)!
const SEAFOAM = area('Seafoam Islands') // Articuno, once the team averages Lv.50
const LAKE = area('Routes 42 & 43 and the Lake of Rage') // the red Gyarados, due once the round is done
const WHIRL = area('Whirl Islands') // Lugia
const ARTICUNO = progressRaidKey(SEAFOAM.id, 144)
const region = (id: string) => data.regions.find((r) => r.id === id)!

const fresh = (): SaveData => newSave(4, data, 0, newId)
const withProgress = (s: SaveData, a: Area, p: Partial<SaveData['areaProgress'][string]>): SaveData => ({
  ...s,
  areaProgress: { ...s.areaProgress, [a.id]: { ...emptyProgress(), ...s.areaProgress[a.id], ...p } },
})
/** A save playing `id`, its starter in the Box, Kanto parked. */
const playing = (s: SaveData, id: string): SaveData => {
  const r = region(id)
  return startRegion(s, r, newRegionBlock(r, r.starters[0]!, data, 0, newId, createInstance))
}

describe('which bosses are raids', () => {
  it('every boss flagged Raid, while Raid Battles are on; off, every boss is fought as before', () => {
    const flagged = data.areas.flatMap((a) => (a.legendaryBoss ?? []).filter((b) => b.raid))
    // Besides, the Mega raids (docs/40) come after their raid boss's.
    expect(progressRaids(data).filter((r) => !r.mega)).toHaveLength(flagged.length)
    expect(progressRaids(data, 'kanto').map((r) => r.dex)).toEqual(
      expect.arrayContaining([144, 145, 146, 150]),
    )
    expect(progressRaids(bossData)).toEqual([])
    expect(raidBosses(LAKE, data).map((b) => b.dex)).toEqual([130])
    expect(fightBosses(LAKE, data)).toEqual([])
    expect(fightBosses(LAKE, bossData).map((b) => b.dex)).toEqual([130])
  })

  it('a key names its raid; a stale one, or one with raids off, names none', () => {
    expect(progressRaidOf(data, ARTICUNO)).toMatchObject({
      key: ARTICUNO,
      dex: 144,
      areaId: SEAFOAM.id,
      region: 'kanto',
    })
    expect(progressRaidOf(data, progressRaidKey(SEAFOAM.id, 145))).toBeNull()
    expect(progressRaidOf(data, 'nowhere:144')).toBeNull()
    expect(progressRaidOf(bossData, ARTICUNO)).toBeNull()
  })
})

describe('an area and its raid', () => {
  it('a raid boss no longer holds its area back: the rounds and gyms done, it is completed', () => {
    const johto = withProgress(playing(fresh(), 'johto'), LAKE, { roundsDone: LAKE.roundsToClear ?? 1 })
    expect(settleClears(johto, data).areaProgress[LAKE.id]?.cleared).toBe(true)
    // Raids off: the red Gyarados is still the fight that completes it.
    expect(settleClears(johto, bossData).areaProgress[LAKE.id]?.cleared).toBe(false)
    // Rounds left: nothing to settle.
    const early = withProgress(playing(fresh(), 'johto'), LAKE, { roundsDone: 0 })
    expect(settleClears(early, data)).toBe(early)
  })

  it('settles a parked region too, and leaves a save with nothing to settle as it is', () => {
    const johto = withProgress(playing(fresh(), 'johto'), LAKE, { roundsDone: LAKE.roundsToClear ?? 1 })
    const hoenn = playing(johto, 'hoenn')
    expect(hoenn.parked?.johto?.areaProgress[LAKE.id]?.cleared).toBe(false)
    expect(settleClears(hoenn, data).parked?.johto?.areaProgress[LAKE.id]?.cleared).toBe(true)
    const s = fresh()
    expect(settleClears(s, data)).toBe(s)
  })

  it('locked until its area is completed, open then, done once caught', () => {
    const raid = progressRaidOf(data, ARTICUNO)!
    let s = fresh()
    expect(progressRaidState(s, data, raid)).toBe('locked')
    expect(openRaidIn(s, data, SEAFOAM)).toBeNull()
    s = withProgress(s, SEAFOAM, { cleared: true })
    expect(progressRaidState(s, data, raid)).toBe('open')
    expect(openRaidIn(s, data, SEAFOAM)?.key).toBe(ARTICUNO)
    s = { ...s, events: { ...s.events, raidsDone: [ARTICUNO] } }
    expect(progressRaidState(s, data, raid)).toBe('done')
    expect(openRaidIn(s, data, SEAFOAM)).toBeNull()
  })

  it('an old save that caught it in its boss fight has it done; one it fled from still has it open', () => {
    const raid = progressRaidOf(data, ARTICUNO)!
    const beaten = withProgress(fresh(), SEAFOAM, { cleared: true, bossesDefeated: [144] })
    expect(progressRaidState(beaten, data, raid)).toBe('open')
    expect(progressRaidState({ ...beaten, pokedex: [...beaten.pokedex, 144] }, data, raid)).toBe('done')
  })

  it('a parked region’s raid reads that region’s progress and Pokédex', () => {
    const raid = progressRaidOf(data, ARTICUNO)!
    const s = playing(withProgress(fresh(), SEAFOAM, { cleared: true }), 'johto')
    expect(progressRaidState(s, data, raid)).toBe('open')
    // Articuno in the Johto Pokédex counts for nothing in Kanto.
    expect(progressRaidState({ ...s, pokedex: [...s.pokedex, 144] }, data, raid)).toBe('open')
  })
})

describe('your team for a raid', () => {
  it('that region’s Box only: the three left on it, else its three highest, at their own levels', () => {
    const raid = progressRaidOf(data, ARTICUNO)!
    const strong = [
      createInstance(6, 80, data, 'c', 0),
      createInstance(9, 40, data, 'b', 0),
      createInstance(3, 60, data, 'v', 0),
    ]
    let s = { ...fresh(), box: [...fresh().box, ...strong] }
    expect(raidTeamCap(data, 144, 'progress')).toBe(data.config.events.raid.progress.teamCap)
    // The fight caps them, all but their dice and rerolls (`raidSeedLevels`).
    expect(progressRaidTeam(s, data, raid).map((m) => [m.id, m.level])).toEqual([
      ['c', 80],
      ['v', 60],
      ['b', 40],
    ])
    s = setProgressRaidTeam(s, ARTICUNO, ['b', 'nobody', 'c', 'b'])
    expect(s.events?.raidTeams?.[ARTICUNO]).toEqual(['b', 'nobody', 'c'])
    expect(progressRaidTeam(s, data, raid).map((m) => m.id)).toEqual(['b', 'c'])
    // Playing Johto: Kanto's Box is parked, and it's still the one Articuno's team comes from.
    const johto = playing(s, 'johto')
    expect(regionBox(johto, 'kanto').map((p) => p.id)).toEqual(expect.arrayContaining(['b', 'c', 'v']))
    expect(progressRaidTeam(johto, data, raid).map((m) => m.id)).toEqual(['b', 'c'])
    expect(regionBox(johto, 'johto').some((p) => p.id === 'b')).toBe(false)
  })

  it('a raid Pokémon’s own numbers in Admin: its progression ones, never the day’s raid’s', () => {
    const d = makeData({
      events: {
        ...RAIDS_OFF,
        raid: {
          ...RAIDS_OFF.raid,
          access: 'all',
          perMon: { 144: { level: 99 } },
          progress: { teamCap: 45, perMon: { 144: { level: 60, bars: 4, teamCap: 30 } } },
        },
      },
    })
    expect(raidRules(d, 144, 'progress')).toMatchObject({ level: 60, bars: 4 })
    expect(raidRules(d, 144)).toMatchObject({ level: 99 })
    expect(raidTeamCap(d, 144, 'progress')).toBe(30)
    // Without numbers of its own in Admin, a raid fights at the overhaul's (docs/40), its cap with it.
    expect(raidTeamCap(d, 145, 'progress')).toBe(RAID_SPECIALS[145]!.level)
    expect(raidTeamCap(d, 144)).toBe(d.config.events.raid.teamCap)
  })
})

describe('the catch', () => {
  it('joins its region’s Box and Pokédex at the raid’s level, closes the raid, counts a raid won', () => {
    const raid = progressRaidOf(data, ARTICUNO)!
    const s = withProgress(fresh(), SEAFOAM, { cleared: true })
    const r = applyProgressRaidCatch(s, data, raid, 5, newId)
    expect(r).toMatchObject({ region: 'kanto', live: true })
    expect(r.save.box.find((p) => p.id === r.instId)).toMatchObject({
      dex: 144,
      level: raidRules(data, 144, 'progress').level,
    })
    expect(r.save.box.find((p) => p.id === r.instId)?.shiny).toBeFalsy()
    expect(r.save.pokedex).toContain(144)
    expect(r.save.events?.raidsDone).toEqual([ARTICUNO])
    expect(r.save.events?.raidsWon).toBe(1)
    expect(progressRaidState(r.save, data, raid)).toBe('done')
  })

  it('caught while playing elsewhere: its own region’s Box, which stays parked; the red Gyarados stays red', () => {
    const gyarados = progressRaidOf(data, progressRaidKey(LAKE.id, 130))!
    const lugia = progressRaidOf(data, progressRaidKey(WHIRL.id, 249))!
    const s = playing(withProgress(playing(fresh(), 'johto'), LAKE, { cleared: true }), 'hoenn')
    const r = applyProgressRaidCatch(s, data, gyarados, 5, newId)
    expect(r).toMatchObject({ region: 'johto', live: false })
    expect(r.save.parked?.johto?.box.find((p) => p.id === r.instId)).toMatchObject({ dex: 130, shiny: true })
    expect(r.save.parked?.johto?.pokedex).toContain(130)
    expect(r.save.pokedex).not.toContain(130)
    expect(progressRaidState(r.save, data, gyarados)).toBe('done')
    expect(progressRaidState(r.save, data, lugia)).toBe('locked')
  })
})

describe('the NPC trainers on offer', () => {
  it('four class trainers, three Pokémon each from the raid’s regions, the same for a seed', () => {
    const offer = raidNpcOffer(data, ['kanto'], 42)
    expect(offer).toHaveLength(4)
    expect(raidNpcOffer(data, ['kanto'], 42)).toEqual(offer)
    expect(raidNpcOffer(data, ['kanto'], 43)).not.toEqual(offer)
    const kanto = regionSpecies(data, 'kanto')
    for (const o of offer) {
      expect(o.owner).toBeTruthy()
      expect(o.look).toMatch(/\/classes\//)
      expect(o.team).toHaveLength(3)
      expect(new Set(o.team).size).toBe(3)
      for (const d of o.team) expect(kanto.has(d), `#${d}`).toBe(true)
    }
    expect(new Set(offer.map((o) => o.owner)).size).toBe(4)
    expect(new Set(offer.map((o) => o.look)).size).toBe(4)
  })

  it('keeps no legendary, mythical or excluded Pokémon on an NPC’s team', () => {
    const cfg = data.config.events.raid
    const banned = new Set([...cfg.exclude.pseudo, ...cfg.exclude.extra])
    const rng = createRng(1)
    for (let i = 0; i < 40; i++)
      for (const o of raidNpcOffer(data, ['kanto', 'johto'], rng.int(0, 1e9)))
        for (const d of o.team) {
          expect(banned.has(d), `#${d}`).toBe(false)
          expect(
            cfg.pool.some((p) => p.dex === d),
            `#${d}`,
          ).toBe(false)
        }
  })
})

describe('the save', () => {
  it('keeps the raids done, the teams left and the NPC offer’s seed through a reload', () => {
    const s: SaveData = {
      ...fresh(),
      events: {
        raidsDone: [ARTICUNO],
        raidTeams: { [ARTICUNO]: ['a', 'b', 'c'] },
        raidNpc: { key: ARTICUNO, seed: 123 },
      },
    }
    const back = parseSave(JSON.parse(JSON.stringify(s)))
    expect(back.ok && back.save.events).toMatchObject({
      raidsDone: [ARTICUNO],
      raidTeams: { [ARTICUNO]: ['a', 'b', 'c'] },
      raidNpc: { key: ARTICUNO, seed: 123 },
    })
  })
})
