// How hard a hit lands (docs/38 F3a): a resisted scratch stays light, a super-effective full house that takes most of
// the HP lands as hard as anything, and the final blow is never weak.
import { describe, expect, it } from 'vitest'
import { HIT_POWER_K, hitPower } from '@/engine'

describe('hitPower', () => {
  it('a resisted 1 and a ×2 60 no longer land alike', () => {
    const scratch = hitPower({ effectiveness: 0.5, damage: 1, maxHp: 100 })
    const smash = hitPower({ effectiveness: 2, combo: 'full_house', damage: 60, maxHp: 100 })
    expect(scratch).toMatchObject({ tier: 0, resisted: true, super: false, ko: false })
    expect(smash).toMatchObject({ tier: 3, resisted: false, super: true })
    expect(smash.k).toBeGreaterThan(scratch.k)
  })

  it('a plain hit is tier 1, at scale 1', () => {
    const plain = hitPower({ effectiveness: 1, combo: 'pair', damage: 10, maxHp: 100 })
    expect(plain.tier).toBe(1)
    expect(plain.k).toBe(1)
  })

  it('each of super effective, a big combo and a big share of the HP adds weight', () => {
    expect(hitPower({ effectiveness: 2, damage: 5, maxHp: 100 }).tier).toBe(2)
    expect(hitPower({ effectiveness: 1, combo: 'four_kind', damage: 5, maxHp: 100 }).tier).toBe(2)
    expect(hitPower({ effectiveness: 1, damage: 50, maxHp: 100 }).tier).toBe(2)
    // Two halves make a point.
    expect(hitPower({ effectiveness: 1, combo: 'three_kind', damage: 30, maxHp: 100 }).tier).toBe(2)
    expect(hitPower({ effectiveness: 1, combo: 'five_kind', damage: 80, maxHp: 100 }).tier).toBe(3)
  })

  it('stays light when resisted, whatever the numbers, unless it is the K.O.', () => {
    expect(hitPower({ effectiveness: 0.5, combo: 'five_kind', damage: 90, maxHp: 100 }).tier).toBe(0)
    const ko = hitPower({ effectiveness: 0.5, damage: 3, maxHp: 100, ko: true })
    expect(ko).toMatchObject({ tier: 2, ko: true, resisted: true })
  })

  it('reads effectiveness with the battle log’s thresholds', () => {
    expect(hitPower({ effectiveness: 1.5, damage: 1, maxHp: 10 }).super).toBe(true)
    expect(hitPower({ effectiveness: 1.4, damage: 1, maxHp: 10 }).super).toBe(false)
    expect(hitPower({ effectiveness: 0.67, damage: 1, maxHp: 10 }).resisted).toBe(true)
    expect(hitPower({ effectiveness: 0.7, damage: 1, maxHp: 10 }).resisted).toBe(false)
  })

  it('scales by tier, from light to huge', () => {
    expect([...HIT_POWER_K]).toEqual([...HIT_POWER_K].sort((a, b) => a - b))
    for (const tier of [0, 1, 2, 3] as const) expect(HIT_POWER_K[tier]).toBeGreaterThan(0)
  })
})
