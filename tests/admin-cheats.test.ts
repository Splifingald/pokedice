// Admin cheats: give or take away a Pokémon on a player's save, and make that edit win the player's next sync.
import { describe, expect, it } from 'vitest'
import { adminAddPokemon, adminRemovePokemon } from '@/admin/playerSave'
import { newSave, type SaveData } from '@/engine'
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
