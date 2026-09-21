// The Box order shared by the Team screen and the Pokémon Center's PC.
import { describe, expect, it } from 'vitest'
import { createInstance, type PokemonInstance } from '@/engine'
import { sortBox } from '@/components/BoxSort'
import { data } from './fixtures'

const mon = (dex: number, level: number, caughtAt: number): PokemonInstance => ({
  ...createInstance(dex, level, data, `m${dex}-${level}-${caughtAt}`, caughtAt),
  caughtAt,
})

// Bulbasaur (grass), Charmander (fire), Squirtle (water), and a second, stronger Bulbasaur.
const box = [mon(4, 20, 300), mon(1, 5, 100), mon(7, 50, 200), mon(1, 40, 400)]
const keys = (list: PokemonInstance[]) => list.map((p) => `${p.dex}/${p.level}`)

describe('sortBox', () => {
  it('by Pokédex number, the strongest first within a species', () => {
    expect(keys(sortBox(box, 'dex', data))).toEqual(['1/40', '1/5', '4/20', '7/50'])
  })

  it('by level, highest first, ties broken by number', () => {
    expect(keys(sortBox(box, 'level', data))).toEqual(['7/50', '1/40', '4/20', '1/5'])
  })

  it('by type, then by number within a type', () => {
    // fire (Charmander), grass (both Bulbasaur), water (Squirtle) — the type keys, alphabetically. Within grass,
    // the same species orders by level, exactly as the Pokédex-number sort does.
    expect(keys(sortBox(box, 'type', data))).toEqual(['4/20', '1/40', '1/5', '7/50'])
  })

  it('by newest caught first', () => {
    expect(keys(sortBox(box, 'newest', data))).toEqual(['1/40', '4/20', '7/50', '1/5'])
  })

  it('never reorders the caller’s array', () => {
    const before = keys(box)
    sortBox(box, 'level', data)
    expect(keys(box)).toEqual(before)
  })
})
