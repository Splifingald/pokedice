// Admin cheats: give or take away a Pokémon on a player's save, and make that edit win the player's next sync.
import { describe, expect, it } from 'vitest'
import {
  adminAddPokemon,
  adminCompleteLeague,
  adminGiveItem,
  adminRemovePokemon,
  adminStartRegion,
  adminStartRoamers,
} from '@/admin/playerSave'
import { leagueDone, newSave, offeredRegion, regionOf, type SaveData } from '@/engine'
import { decideSync } from '@/save/cloud'
import { parseSave } from '@/save/schema'
import { data, newId } from './fixtures'

const base = newSave(4, data, 1000, newId)

describe('admin cheats', () => {
  it('gives a Pokémon: into the team when there is room, else the Box, and into the Pokédex', () => {
    const s = adminAddPokemon(base, { dex: 25, level: 12, shiny: true }, data, 5000, 'pika')
    const pika = s.box.find((p) => p.id === 'pika')!
    expect([pika.dex, pika.level, pika.shiny]).toEqual([25, 12, true])
    expect(s.team).toContain('pika')
    expect(s.pokedex).toContain(25)
    expect([s.updatedAt, s.adminEditAt]).toEqual([5000, 5000])
    let full: SaveData = base
    for (let i = full.team.length; i < data.config.maxTeamSize; i++) full = adminAddPokemon(full, { dex: 16, level: 3, shiny: false }, data, 5000, `m${i}`)
    const boxed = adminAddPokemon(full, { dex: 19, level: 3, shiny: false }, data, 6000, 'rat')
    expect(boxed.team).not.toContain('rat')
    expect(boxed.pokedex.filter((d) => d === 16)).toHaveLength(1)
    expect(parseSave(boxed).ok).toBe(true)
  })

  it('takes a Pokémon away from the team, the Box or the Day Care, never the last one', () => {
    const starter = base.box[0]!.id
    expect(() => adminRemovePokemon(base, starter, 2000)).toThrow()
    const two = adminAddPokemon(base, { dex: 25, level: 5, shiny: false }, data, 2000, 'pika')
    const s = adminRemovePokemon(two, starter, 3000)
    expect(s.box.map((p) => p.id)).toEqual(['pika'])
    expect(s.team).toEqual(['pika'])
    expect(s.pokedex).toContain(base.box[0]!.dex)
    const inst = two.box.find((p) => p.id === 'pika')!
    const withDayCare: SaveData = { ...base, dayCare: { residents: [{ inst, since: 1 }], eggClaimed: false } }
    expect(adminRemovePokemon(withDayCare, 'pika', 4000).dayCare!.residents).toEqual([])
  })

  it('an admin edit wins the next sync, even with less progress', () => {
    const local: SaveData = { ...adminAddPokemon(base, { dex: 25, level: 50, shiny: false }, data, 2000, 'pika'), adminEditAt: undefined }
    const cloud = adminRemovePokemon(local, 'pika', 3000)
    expect(decideSync(local, { ...cloud, adminEditAt: undefined })).toBe('ask')
    expect(decideSync(local, cloud)).toBe('cloud')
    // Once the player has played past it, the flag no longer matters.
    expect(decideSync({ ...local, updatedAt: 4000 }, cloud)).not.toBe('cloud')
  })
})

describe('admin region cheats', () => {
  const johto = data.regions.find((r) => r.id === 'johto')!

  it('starts a region, then switches back to it instead of restarting it', () => {
    const started = adminStartRegion(base, data, 2000, 'johto', newId)
    expect(regionOf(started)).toBe('johto')
    expect(started.box.map((p) => p.dex)).toEqual([johto.starters[0]])
    expect(started.parked!.kanto!.box).toEqual(base.box)

    const back = adminStartRegion(started, data, 3000, 'kanto', newId)
    expect(regionOf(back)).toBe('kanto')
    const again = adminStartRegion(back, data, 4000, 'johto', newId)
    // The Johto Pokémon is the one from before: going back is not a fresh start.
    expect(again.box.map((p) => p.id)).toEqual(started.box.map((p) => p.id))
    expect(parseSave(again).ok).toBe(true)
  })

  it('completes a league, which is what puts the next region on offer', () => {
    expect(offeredRegion(base, data)).toBeNull()
    const done = adminCompleteLeague(base, data, 2000)
    expect(leagueDone(done, data, 'kanto')).toBe(true)
    expect(offeredRegion(done, data)?.id).toBe('johto')
    expect(parseSave(done).ok).toBe(true)
  })

  it('completes a parked region’s league too, and refuses one never started', () => {
    const inJohto = adminStartRegion(base, data, 2000, 'johto', newId)
    const done = adminCompleteLeague(inJohto, data, 3000, 'kanto')
    expect(leagueDone(done, data, 'kanto')).toBe(true)
    expect(regionOf(done)).toBe('johto')
    expect(() => adminCompleteLeague(base, data, 3000, 'sinnoh')).toThrow()
  })

  it('gives items, and opens the roamer gate', () => {
    const withItem = adminGiveItem(base, data, 2000, 'sun-stone', 2)
    expect(withItem.inventory['sun-stone']).toBe(2)
    expect(() => adminGiveItem(base, data, 2000, 'nope', 1)).toThrow()

    const roaming = adminStartRoamers(base, data, 2000)
    for (const dex of data.config.roamers.requires) expect(roaming.pokedex).toContain(dex)
    expect(parseSave(roaming).ok).toBe(true)
  })
})
