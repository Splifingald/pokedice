// The raid team's green thumb (docs/18 §3): Lv.50 or more (or the raid's cap, if lower) and super effective against
// the raid Pokémon with one of its typed dice.
import { describe, expect, it } from 'vitest'
import { raidRecommended } from '@/engine'
import { data } from '../fixtures'

const CELEBI = 251 // Grass / Psychic

describe('raidRecommended', () => {
  it('needs a die that hits the raid Pokémon super effectively', () => {
    expect(raidRecommended(data, { dex: 6, level: 60 }, CELEBI, 50)).toBe(true) // Charizard: Fire
    expect(raidRecommended(data, { dex: 248, level: 60 }, CELEBI, 50)).toBe(true) // Tyranitar: Dark
    expect(raidRecommended(data, { dex: 9, level: 60 }, CELEBI, 50)).toBe(false) // Blastoise: Water, resisted
  })

  it('needs Lv.50, or the raid’s cap when it is lower', () => {
    expect(raidRecommended(data, { dex: 6, level: 50 }, CELEBI, 50)).toBe(true)
    expect(raidRecommended(data, { dex: 6, level: 49 }, CELEBI, 50)).toBe(false)
    expect(raidRecommended(data, { dex: 6, level: 30 }, CELEBI, 30)).toBe(true)
    expect(raidRecommended(data, { dex: 6, level: 29 }, CELEBI, 30)).toBe(false)
    expect(raidRecommended(data, { dex: 6, level: 49 }, CELEBI, 60)).toBe(false)
  })

  it('is never true for an unknown species or raid Pokémon', () => {
    expect(raidRecommended(data, { dex: 99999, level: 60 }, CELEBI, 50)).toBe(false)
    expect(raidRecommended(data, { dex: 6, level: 60 }, 99999, 50)).toBe(false)
  })
})
