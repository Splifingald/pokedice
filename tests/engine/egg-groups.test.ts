import { describe, expect, it } from 'vitest'
import { data } from '../fixtures'

// src/data/egg-groups.json, from Showdown's pokedex (`pnpm egg-groups`), loaded into GameData by the bundle.
describe('Egg groups', () => {
  it('has an entry for every species in the game, forms included', () => {
    const missing = data.speciesList.filter((s) => !data.eggGroups[s.dex]?.g.length).map((s) => s.dex)
    expect(missing).toEqual([])
  })

  it('reads the groups as Showdown names them', () => {
    expect(data.eggGroups[132]!.g).toEqual(['Ditto'])
    expect(data.eggGroups[133]!.g).toEqual(['Field'])
    expect(data.eggGroups[131]!.g).toEqual(['Monster', 'Water 1'])
  })

  it('marks fixed genders only', () => {
    expect(data.eggGroups[81]!.s).toBe('N')
    expect(data.eggGroups[128]!.s).toBe('M')
    expect(data.eggGroups[241]!.s).toBe('F')
    expect(data.eggGroups[133]!.s).toBeUndefined()
  })

  it('marks legendaries and mythicals, and nothing else', () => {
    for (const dex of [150, 251, 490, 144, 386]) expect(data.eggGroups[dex]!.l).toBe(1)
    for (const dex of [132, 143, 172, 147]) expect(data.eggGroups[dex]!.l).toBeUndefined()
    const national = data.speciesList.filter((s) => !s.form && data.eggGroups[s.dex]?.l)
    expect(national.length).toBe(94)
  })

  it('gives a form its base species’ entry', () => {
    const form = data.speciesList.find((s) => s.form?.kind === 'regional')!
    expect(data.eggGroups[form.dex]).toEqual(data.eggGroups[form.form!.of])
  })
})
