import { describe, expect, it } from 'vitest'
import { liveDicePlan, type LiveDiceInput } from '../scripts/dice-live'
import pokemon from '@/data/pokemon.json'
import type { DiceEntry, Species } from '@/engine/types'

const base: LiveDiceInput = {
  dex: 0,
  type1: 'normal',
  type2: null,
  bst: 400,
  stage: 1,
  lineLength: 2,
  evolvesAt: null,
  evolvesByItem: false,
  arrivesAt: null,
  starter: false,
  pseudo: false,
  fossil: false,
  legend: null,
}
const total = (dice: DiceEntry[]) => dice.reduce((s, d) => s + d.count, 0)
const addLevels = (p: ReturnType<typeof liveDicePlan>) => p.milestones.filter((m) => m.effect === 'ADD_DIE').map((m) => m.level)
const byDex = new Map((pokemon as Species[]).map((p) => [p.dex, p]))

describe('liveDicePlan — the live game read back as rules', () => {
  it('gives a starter line Sinnoh’s shape: 2, then 3 with the base die typed at Lv.24, then 4 typed and a 5th at 50', () => {
    const first = liveDicePlan({ ...base, type1: 'fire', starter: true, lineLength: 3, evolvesAt: 17 })
    expect(first.dice).toEqual([{ type: 'fire', count: 2 }])
    const middle = liveDicePlan({ ...base, type1: 'fire', type2: 'fighting', starter: true, stage: 2, lineLength: 3, arrivesAt: 17, evolvesAt: 36 })
    expect(middle.milestones).toContainEqual({ level: 24, effect: 'REPLACE_DIE', fromDieType: 'base', dieType: 'fighting' })
    const final = liveDicePlan({ ...base, type1: 'fire', type2: 'fighting', starter: true, stage: 3, lineLength: 3, arrivesAt: 36 })
    expect(final.dice).toEqual([
      { type: 'fire', count: 2 },
      { type: 'fighting', count: 2 },
    ])
    expect(addLevels(final)).toEqual([50])
    // The same as Chimchar's line on the live database.
    expect(byDex.get(392)!.dice).toEqual(final.dice)
  })

  it('makes a late 2-stage evolver a 4-dice final, like Drapion and Toxicroak', () => {
    const plan = liveDicePlan({ ...base, type1: 'poison', type2: 'dark', bst: 500, stage: 2, arrivesAt: 40 })
    expect(total(plan.dice)).toBe(4)
    expect(addLevels(plan)).toEqual([50])
    const early = liveDicePlan({ ...base, type1: 'water', bst: 495, stage: 2, arrivesAt: 26 })
    expect(total(early.dice)).toBe(3)
    expect(addLevels(early)).toEqual([38, 50])
  })

  it('gives a first stage 2 dice and a 3rd about a dozen levels before a late evolution', () => {
    const plan = liveDicePlan({ ...base, type1: 'poison', type2: 'dark', bst: 329, evolvesAt: 34 })
    expect(total(plan.dice)).toBe(2)
    expect(addLevels(plan)).toEqual([22])
    const weak = liveDicePlan({ ...base, bst: 250, evolvesAt: 15 })
    expect(total(weak.dice)).toBe(1)
    expect(addLevels(weak)).toEqual([8])
  })

  it('keeps legendaries at five: a trio with two base dice, a box legendary all typed', () => {
    const trio = liveDicePlan({ ...base, type1: 'steel', type2: 'fighting', bst: 580, lineLength: 1, legend: 'trio' })
    expect(trio.dice.find((d) => d.type === 'base')?.count).toBe(2)
    const box = liveDicePlan({ ...base, type1: 'dragon', type2: 'fire', bst: 680, lineLength: 1, legend: 'box' })
    expect(box.dice).toEqual([
      { type: 'dragon', count: 3 },
      { type: 'fire', count: 2 },
    ])
    expect(box.rerolls).toBe(5)
  })

  it('gives every die added later its reroll', () => {
    const plan = liveDicePlan({ ...base, bst: 470, lineLength: 1 })
    expect(plan.milestones.filter((m) => m.effect === 'ADD_REROLL')).toHaveLength(addLevels(plan).length)
  })
})
