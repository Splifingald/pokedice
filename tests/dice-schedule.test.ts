// v1.8 dice schedule: dice grow with the evolution stage and level, and every new die brings a reroll.
import { describe, expect, it } from 'vitest'
import { effectiveStats, getSpecies } from '@/engine'
import { dicePlan, secondDieLevel } from '../scripts/seed'
import { data } from './fixtures'

const diceAt = (dex: number, level: number) => effectiveStats(getSpecies(data, dex), level, data)

describe('dice schedule', () => {
  it('first stages start with one die and get a second at Lv.5 — weak ones later', () => {
    expect(diceAt(4, 4).dice).toEqual(['fire'])
    expect(diceAt(4, 5).dice).toEqual(['fire', 'base'])
    expect(diceAt(4, 5).rerolls).toBe(2)
    expect(diceAt(16, 7).dice).toHaveLength(1) // Pidgey
    expect(diceAt(16, 8).dice).toHaveLength(2)
    expect(diceAt(19, 8).dice).toHaveLength(2) // Rattata
    expect(diceAt(1, 15).dice).toHaveLength(2) // capped at 2 until it evolves
    expect([secondDieLevel(250), secondDieLevel(270), secondDieLevel(290), secondDieLevel(318)]).toEqual([8, 7, 6, 5])
  })

  it('three-stage lines: 3 dice on the 2nd stage, 4 on the 3rd, a 5th at Lv.50', () => {
    expect(diceAt(2, 16).dice).toHaveLength(3)
    expect(diceAt(2, 31).dice).toHaveLength(3)
    expect(diceAt(3, 32).dice).toHaveLength(4)
    expect(diceAt(3, 49).dice).toHaveLength(4)
    expect(diceAt(3, 50).dice).toHaveLength(5)
    expect(diceAt(3, 50).rerolls).toBe(5)
  })

  it('Caterpie and Weedle lines gain dice by evolving, a 4th at Lv.36, never a 5th', () => {
    expect([10, 11, 12].map((d) => diceAt(d, 20).dice.length)).toEqual([1, 2, 3])
    expect([13, 14, 15].map((d) => diceAt(d, 20).dice.length)).toEqual([1, 2, 3])
    expect(diceAt(12, 36).dice).toHaveLength(4)
    expect(diceAt(15, 100).dice).toHaveLength(4)
  })

  it('keeps other lines fair: two-stage finals, single stages and legendaries', () => {
    expect(dicePlan(20, 2, 2, 413, false)).toEqual({ start: 3, adds: [36] }) // Raticate
    expect(dicePlan(130, 2, 2, 540, false)).toEqual({ start: 3, adds: [36, 50] }) // Gyarados
    expect(dicePlan(143, 1, 1, 540, false)).toEqual({ start: 1, adds: [5, 20, 36, 50] }) // Snorlax
    expect(dicePlan(150, 1, 1, 680, true)).toEqual({ start: 5, adds: [] })
    expect(diceAt(143, 36).dice).toHaveLength(4)
    expect(diceAt(95, 100).dice).toHaveLength(3) // Onix stops at 3
    expect(diceAt(132, 100).dice).toHaveLength(3) // Ditto
    for (const s of data.speciesList) expect(effectiveStats(s, 100, data).dice.length).toBeLessThanOrEqual(5)
  })

  it('applies the per-family choices', () => {
    expect(diceAt(129, 19).dice).toHaveLength(1) // Magikarp never grows
    expect(diceAt(130, 20).dice).toHaveLength(3) // Gyarados
    expect(diceAt(148, 39).dice).toHaveLength(3) // Dragonair
    expect(diceAt(148, 40).dice).toHaveLength(4)
    expect(diceAt(149, 55).dice).toHaveLength(5) // Dragonite
    expect([138, 140].map((d) => diceAt(d, 30).dice.length)).toEqual([2, 2]) // revived fossils
    expect(diceAt(142, 30).dice).toHaveLength(4) // Aerodactyl
    expect(diceAt(142, 50).dice).toHaveLength(5)
    expect(diceAt(151, 39).dice).toHaveLength(4) // Mew
    expect(diceAt(151, 40).dice).toHaveLength(5)
    expect(diceAt(151, 40).rerolls).toBe(5)
    expect(diceAt(146, 50).dice).toHaveLength(5) // Moltres
  })
})
