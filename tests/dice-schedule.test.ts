// v1.8 dice schedule: dice grow with the evolution stage and level, and every new die brings a reroll.
// dicePlan / secondDieLevel are the seed's rules. The bundled species are tuned in admin since, so the checks on them
// are the lines that still follow the schedule, plus the hard cap of 5 dice.
import { describe, expect, it } from 'vitest'
import { effectiveStats, getSpecies } from '@/engine'
import { dicePlan, secondDieLevel } from '../scripts/seed'
import { data } from './fixtures'

const diceAt = (dex: number, level: number) => effectiveStats(getSpecies(data, dex), level, data)

describe('dice schedule', () => {
  it('first stages start with one die and get a second at Lv.5 — weak ones later', () => {
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
    for (const s of data.speciesList) expect(effectiveStats(s, 100, data).dice.length).toBeLessThanOrEqual(5)
  })
})
