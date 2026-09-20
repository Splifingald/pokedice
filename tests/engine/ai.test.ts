import { describe, expect, it } from 'vitest'
import { aiRerollMask, candidateKeepSets, computeDamage, createRng, expectedDamage, uniformLevels, type RolledDie } from '@/engine'
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

  // A roll that already kills is not improved by a bigger number, and the reroll budget lasts the whole battle — so
  // chasing damage past the target's last hit point costs a reroll and buys nothing. Auto-mode swings instead.
  describe('when the roll already kills', () => {
    const junk = [die('electric', 1), die('electric', 2), die('base', 1), die('base', 3)]
    const damageOf = (dice: RolledDie[]) =>
      computeDamage(dice, ['electric'], ['water'], uniformLevels(1), data).final

    it('attacks instead of rerolling', () => {
      const dmg = damageOf(junk)
      // Without the target's HP this is a roll the heuristic wants to improve…
      expect(aiRerollMask(input(junk))).not.toBeNull()
      // …and with a target it would kill, it swings, at exactly its own damage and at anything less.
      expect(aiRerollMask({ ...input(junk), targetHp: dmg })).toBeNull()
      expect(aiRerollMask({ ...input(junk), targetHp: 1 })).toBeNull()
    })

    it('still rerolls when one more point of HP is left', () => {
      expect(aiRerollMask({ ...input(junk), targetHp: damageOf(junk) + 1 })).not.toBeNull()
    })

    it('is unchanged when the caller does not know the target HP', () => {
      for (let seed = 0; seed < 25; seed++)
        expect(aiRerollMask(input(junk, seed))).toEqual(aiRerollMask({ ...input(junk, seed), targetHp: undefined }))
    })

    it('does not swing at an immune defender it cannot kill', () => {
      // 0 damage against a Ghost is never lethal, so the rule must not fire and hand it a free pass.
      const dice = [die('normal', 6), die('normal', 6)]
      const immune = { ...input(dice), attackerTypes: ['normal'] as const, defenderTypes: ['ghost'] as const }
      expect(computeDamage(dice, ['normal'], ['ghost'], uniformLevels(1), data).final).toBe(0)
      expect(aiRerollMask({ ...immune, targetHp: 10 })).toEqual(aiRerollMask(immune))
    })
  })

  it('respects the highestRank payout mode in its estimate', () => {
    const d = makeData({ comboPayoutMode: 'highestRank' })
    const dice = [die('base', 2, d), die('base', 2, d), die('base', 3, d)]
    const exp = expectedDamage({ ...input(dice), data: d }, [true, true, true], 10)
    expect(exp).toBe(2 + 2 + 3 + 2)
  })
})
