// Regions: the block swap, the league gate, sending a Pokémon on, and the rescue when one is switched off.
import { describe, expect, it } from 'vitest'
import {
  compileGameData,
  createInstance,
  enabledRegions,
  leagueDone,
  liveBlock,
  newRegionBlock,
  newSave,
  offeredRegion,
  regionAreas,
  regionOf,
  regionSpecies,
  sendOnBlocked,
  sendOnTarget,
  sendPokemonOn,
  rescueFromDisabledRegion,
  startRegion,
  switchRegion,
  unlockedRegions,
  type Area,
  type GameData,
  type Region,
  type SaveData,
} from '@/engine'
import { BUNDLE } from '@/config/bundle'
import { newId } from '../fixtures'

/**
 * Kanto's own areas, re-badged into a second region, so these tests exercise the machinery without waiting for the
 * hand-written Johto content. Ids are rewritten so the two chains never collide.
 */
function twoRegionData(opts: { johtoEnabled?: boolean } = {}): GameData {
  const kanto = (BUNDLE.areas as Area[]).filter((a) => (a.regionId ?? 'kanto') === 'kanto')
  const johto = kanto.map((a) => ({
    ...a,
    id: `j-${a.id}`,
    regionId: 'johto',
    orderIndex: a.orderIndex + 1000,
    gyms: a.gyms.map((g) => g),
    unlockConditions: a.unlockConditions?.map((c) => (c.kind === 'area' ? { ...c, areaId: `j-${c.areaId}` } : c)) ?? null,
  }))
  const kantoLeague = kanto.find((a) => a.name === 'Indigo Plateau')!
  const regions: Region[] = [
    { id: 'kanto', name: 'Kanto', orderIndex: 0, dexRange: [1, 151], starters: [1, 4, 7], starterLevel: 5, leagueAreaId: kantoLeague.id, nextRegion: 'johto', enabled: true },
    { id: 'johto', name: 'Johto', orderIndex: 1, dexRange: [152, 251], starters: [152, 155, 158], starterLevel: 5, leagueAreaId: `j-${kantoLeague.id}`, nextRegion: null, enabled: opts.johtoEnabled ?? true },
  ]
  return compileGameData({ ...BUNDLE, areas: [...kanto, ...johto], regions })
}

const data = twoRegionData()
const johto = data.regions.find((r) => r.id === 'johto')!
const clearLeague = (save: SaveData, data: GameData, regionId = regionOf(save)): SaveData => {
  const region = data.regions.find((r) => r.id === regionId)!
  const progress = { roundsDone: 9, cleared: true, bossDefeated: true, bossesDefeated: [], gymsDefeated: [] }
  if (regionId === regionOf(save)) return { ...save, areaProgress: { ...save.areaProgress, [region.leagueAreaId]: progress } }
  const block = save.parked![regionId]!
  return { ...save, parked: { ...save.parked, [regionId]: { ...block, areaProgress: { ...block.areaProgress, [region.leagueAreaId]: progress } } } }
}
const start = (save: SaveData, dex = 152) =>
  startRegion(save, johto, newRegionBlock(johto, dex, data, 1, newId, createInstance))

describe('regions', () => {
  it('a new save starts in the first region with none parked', () => {
    const s = newSave(7, data, 1, newId)
    expect(regionOf(s)).toBe('kanto')
    expect(s.parked).toEqual({})
    expect(unlockedRegions(s, data).map((r) => r.id)).toEqual(['kanto'])
  })

  it('scopes each chain to its own region', () => {
    expect(regionAreas(data, 'kanto').every((a) => a.regionId === 'kanto')).toBe(true)
    expect(regionAreas(data, 'johto').every((a) => a.regionId === 'johto')).toBe(true)
    expect(regionAreas(data, 'kanto')).toHaveLength(regionAreas(data, 'johto').length)
  })

  it('offers nothing until a league is done — nothing names Johto before then', () => {
    const s = newSave(7, data, 1, newId)
    expect(offeredRegion(s, data)).toBeNull()
    expect(offeredRegion(clearLeague(s, data), data)?.id).toBe('johto')
  })

  it('offers nothing once the region has been started', () => {
    const s = start(clearLeague(newSave(7, data, 1, newId), data))
    expect(offeredRegion(s, data)).toBeNull()
  })

  it('starting a region gives a fresh everything and parks the old one whole', () => {
    const kanto = { ...clearLeague(newSave(7, data, 1, newId), data), gold: 900, inventory: { potion: 4 } }
    const s = start(kanto)
    expect(regionOf(s)).toBe('johto')
    expect(s.gold).toBe(0)
    expect(s.box).toHaveLength(1)
    expect(s.box[0]!.dex).toBe(152)
    expect(s.pokedex).toEqual([152])
    // A new region opens like a new game does: the same starting bag, not an empty one.
    expect(s.inventory).toEqual(data.config.startInventory)
    expect(Object.values(s.comboLevels).every((l) => l === 1)).toBe(true)
    // Kanto is parked untouched.
    expect(s.parked!.kanto!.gold).toBe(900)
    expect(s.parked!.kanto!.box).toEqual(kanto.box)
    expect(s.parked!.kanto!.inventory).toEqual({ potion: 4 })
  })

  it('switches back and forth without losing anything', () => {
    const kanto = { ...clearLeague(newSave(7, data, 1, newId), data), gold: 900 }
    const inJohto = { ...start(kanto), gold: 12 }
    const back = switchRegion(inJohto, 'kanto')
    expect(regionOf(back)).toBe('kanto')
    expect(back.gold).toBe(900)
    expect(liveBlock(back)).toEqual(liveBlock(kanto))
    const forward = switchRegion(back, 'johto')
    expect(regionOf(forward)).toBe('johto')
    expect(forward.gold).toBe(12)
    expect(forward.box[0]!.dex).toBe(152)
  })

  it('will not switch to a region that was never started', () => {
    const s = newSave(7, data, 1, newId)
    expect(switchRegion(s, 'johto')).toBe(s)
  })

  it('hides a region switched off, and rescues a player standing in it', () => {
    const off = twoRegionData({ johtoEnabled: false })
    expect(enabledRegions(off).map((r) => r.id)).toEqual(['kanto'])

    const kanto = clearLeague(newSave(7, data, 1, newId), data)
    const inJohto = start(kanto)
    expect(unlockedRegions(inJohto, off).map((r) => r.id)).toEqual(['kanto'])

    const rescued = rescueFromDisabledRegion(inJohto, off)
    expect(rescued?.from.id).toBe('johto')
    expect(regionOf(rescued!.save)).toBe('kanto')
    // The region is only parked, never lost: switching it back on restores it exactly.
    expect(rescued!.save.parked!.johto!.box[0]!.dex).toBe(152)
    expect(rescueFromDisabledRegion(rescued!.save, off)).toBeNull()
  })

  it('reads a save from before regions as Kanto', () => {
    const { region: _r, parked: _p, ...old } = newSave(7, data, 1, newId)
    expect(regionOf(old as SaveData)).toBe('kanto')
    expect(leagueDone(old as SaveData, data, 'kanto')).toBe(false)
    expect(unlockedRegions(old as SaveData, data).map((r) => r.id)).toEqual(['kanto'])
  })
})

describe('sending a Pokémon on', () => {
  const extra = (save: SaveData, dex: number, id: string) => ({
    ...save,
    box: [...save.box, createInstance(dex, 5, data, id, 1)],
  })
  /** Kanto's league done, Johto started, and the player back in Kanto — where the button lives. */
  const inKanto = () => switchRegion(start(clearLeague(newSave(7, data, 1, newId), data)), 'kanto')

  it('offers the next region only once its league is done and that region exists', () => {
    // League done, but Johto never started: nowhere to send anything.
    expect(sendOnTarget(clearLeague(newSave(7, data, 1, newId), data), data)).toBeNull()
    // Johto started but Kanto's league not done.
    const early = switchRegion(startRegion(newSave(7, data, 1, newId), johto, newRegionBlock(johto, 152, data, 1, newId, createInstance)), 'kanto')
    expect(sendOnTarget(early, data)).toBeNull()
    expect(sendOnTarget(inKanto(), data)?.id).toBe('johto')
    // Johto is last in the chain: from there, there is nowhere further on.
    expect(sendOnTarget(clearLeague(start(clearLeague(newSave(7, data, 1, newId), data)), data, 'johto'), data)).toBeNull()
  })

  it('moves it out of this region and into the next one’s Box and Pokédex', () => {
    const save = extra(inKanto(), 4, 'charmander')
    const sent = sendPokemonOn(save, data, 'charmander')!
    expect(sent.box.map((p) => p.id)).not.toContain('charmander')
    const arrived = sent.parked!.johto!
    expect(arrived.box.map((p) => p.dex)).toEqual([152, 4])
    expect(arrived.pokedex).toContain(4)
    // Kanto keeps its own Pokédex: what it caught, it caught.
    expect(sent.pokedex).toContain(7)
  })

  it('keeps the last Pokémon of a region, so the region stays playable', () => {
    const save = inKanto()
    expect(save.box).toHaveLength(1)
    expect(sendOnBlocked(save, data, save.box[0]!, johto)).toBe('last')
    expect(sendPokemonOn(save, data, save.box[0]!.id)).toBeNull()
  })

  it('refuses a species the next region could not have given you', () => {
    const mine = regionSpecies(data, 'johto')
    const alien = data.speciesList.map((sp) => sp.dex).find((dex) => !mine.has(dex))!
    const save = extra(extra(inKanto(), 4, 'charmander'), alien, 'alien')
    expect(sendOnBlocked(save, data, save.box.find((p) => p.id === 'alien')!, johto)).toBe('species')
    expect(sendPokemonOn(save, data, 'alien')).toBeNull()
  })

  it('a fossil still reviving stays put', () => {
    const save = extra(inKanto(), 4, 'charmander')
    const reviving = { ...save, box: save.box.map((p) => (p.id === 'charmander' ? { ...p, revivesAt: 9e12 } : p)) }
    expect(sendOnBlocked(reviving, data, reviving.box.find((p) => p.id === 'charmander')!, johto)).toBe('reviving')
  })

  it('promotes a replacement when the whole team leaves', () => {
    const save = extra(inKanto(), 4, 'charmander')
    const sent = sendPokemonOn({ ...save, team: [save.box[0]!.id] }, data, save.box[0]!.id)!
    // The team cannot be left empty: the Box's next Pokémon takes over.
    expect(sent.team).toEqual(['charmander'])
  })
})
