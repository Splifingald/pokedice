import { describe, expect, it } from 'vitest'
import { aiRerollMask, candidateKeepSets, createRng, expectedDamage, uniformLevels, type RolledDie } from '@/engine'
import { data, die, makeData, sdie } from '../fixtures'

const input = (dice: RolledDie[], seed = 1) => ({
  dice,
  attackerTypes: ['electric'] as const,
  defenderTypes: ['water'] as const,
  levels: uniformLevels(1),
  data,
  rng: createRng(seed),
})

describe('AI reroll heuristic', () => {
  it('never rerolls a satisfied status threshold', () => {
    for (let seed = 0; seed < 40; seed++) {
      const dice = [sdie('electric', 'paralyze'), sdie('electric', 'paralyze'), die('electric', 1), die('base', 1)]
      const mask = aiRerollMask(input(dice, seed))
      if (mask) {
        expect(mask[0]).toBe(false)
        expect(mask[1]).toBe(false)
      }
      for (const keep of candidateKeepSets(dice, data)) {
        expect(keep[0]).toBe(true)
        expect(keep[1]).toBe(true)
      }
    }
  })

  it('is deterministic under a fixed seed', () => {
    const dice = [die('electric', 1), die('electric', 2), die('base', 1), die('base', 6)]
    expect(aiRerollMask(input(dice, 7))).toEqual(aiRerollMask(input(dice, 7)))
  })

  it('rerolls junk and keeps a strong roll', () => {
    const junk = [die('electric', 1), die('electric', 2), die('base', 1), die('base', 3)]
    expect(aiRerollMask(input(junk))).not.toBeNull()
    const great = [die('electric', 6), die('electric', 6), die('base', 6), die('base', 6)]
    expect(aiRerollMask(input(great))).toBeNull()
  })

  it('builds group, straight-draw and high-dice keep sets', () => {
    const dice = [die('base', 2), die('base', 3), die('base', 4), die('base', 4), die('base', 6)]
    const sets = candidateKeepSets(dice, data)
    expect(sets).toContainEqual([false, false, true, true, false]) // the pair of 4s
    expect(sets).toContainEqual([true, true, true, false, false]) // 2-3-4 draw
    expect(sets).toContainEqual([false, false, false, false, true]) // ≥5
  })

  it('estimates 0 against an immune defender', () => {
    const dice = [die('normal', 2), die('normal', 3)]
    const exp = expectedDamage(
      { ...input(dice), attackerTypes: ['normal'], defenderTypes: ['ghost'] },
      [false, false],
      50,
    )
    expect(exp).toBe(0)
    expect(expectedDamage(input(dice), [false, false], 0)).toBe(0)
  })

  it('respects the highestRank payout mode in its estimate', () => {
    const d = makeData({ comboPayoutMode: 'highestRank' })
    const dice = [die('base', 2, d), die('base', 2, d), die('base', 3, d)]
    const exp = expectedDamage({ ...input(dice), data: d }, [true, true, true], 10)
    expect(exp).toBe(2 + 2 + 3 + 2)
  })
})
