import { describe, expect, it } from 'vitest'
import { comboBonus, computeDamage, detectCombos, longestRun, selectCombo, type UpgradeLevels } from '@/engine'
import { data, die, makeData } from '../fixtures'

describe('combo detection', () => {
  it('detects each of the 8 combos', () => {
    expect(detectCombos([1, 1, 3])).toEqual(['pair'])
    expect(detectCombos([1, 1, 3, 3, 6])).toEqual(['pair', 'two_pair'])
    expect(detectCombos([2, 2, 2, 5])).toEqual(['pair', 'three_kind'])
    expect(detectCombos([1, 2, 3, 4])).toContain('small_straight')
    expect(detectCombos([3, 3, 3, 5, 5])).toEqual(['pair', 'two_pair', 'three_kind', 'full_house'])
    expect(detectCombos([6, 6, 6, 6, 1])).toEqual(['pair', 'three_kind', 'four_kind'])
    expect(detectCombos([2, 3, 4, 5, 6])).toEqual(['small_straight', 'full_straight'])
    expect(detectCombos([4, 4, 4, 4, 4])).toEqual(['pair', 'three_kind', 'four_kind', 'five_kind'])
    expect(detectCombos([1, 3, 5])).toEqual([])
    expect(detectCombos([])).toEqual([])
  })

  it('scans straights over distinct sorted values, so duplicates do not break them', () => {
    expect(detectCombos([4, 4, 5, 6, 7])).toContain('small_straight')
    expect(detectCombos([4, 4, 5, 6, 7])).not.toContain('full_straight')
    expect(longestRun([7, 4, 5, 4, 6])).toBe(4)
  })

  it('lets Ghost 0s and Ground 8s extend runs', () => {
    expect(detectCombos([0, 1, 2, 3])).toContain('small_straight')
    expect(detectCombos([4, 5, 6, 7, 8])).toContain('full_straight')
  })

  it('treats a four of a kind with a pair as a full house too', () => {
    expect(detectCombos([2, 2, 2, 2, 5, 5])).toContain('full_house')
  })
})

describe('combo payout', () => {
  it('pays the highest damage, not the highest rank (Pair L9 beats Two Pair L1)', () => {
    const levels: UpgradeLevels = { comboLevels: { pair: 9, two_pair: 1 }, dieLevels: {} }
    expect(comboBonus('pair', 9, data)).toBe(10)
    expect(comboBonus('two_pair', 1, data)).toBe(5)
    const r = computeDamage([die('base', 2), die('base', 2), die('base', 3), die('base', 3)], ['normal'], ['normal'], levels, data)
    expect(r.combo).toMatchObject({ key: 'pair', bonus: 10 })
  })

  it('pays only one combo per roll', () => {
    const r = computeDamage(
      [die('base', 3), die('base', 3), die('base', 3), die('base', 5), die('base', 5)],
      ['normal'],
      ['normal'],
      { comboLevels: {}, dieLevels: {} },
      data,
    )
    expect(r.combo?.key).toBe('full_house')
    expect(r.raw).toBe(3 + 3 + 3 + 5 + 5 + 10)
  })

  it('supports the highestRank payout mode', () => {
    const d = makeData({ comboPayoutMode: 'highestRank' })
    const pick = selectCombo(['pair', 'two_pair'], { pair: 9, two_pair: 1 }, 1, d)
    expect(pick?.key).toBe('two_pair')
  })

  it('breaks exact ties towards the higher rank', () => {
    const pick = selectCombo(['pair', 'two_pair'], { pair: 4, two_pair: 1 }, 1, data) // 5 vs 5
    expect(pick?.key).toBe('two_pair')
    expect(selectCombo([], {}, 1, data)).toBeNull()
  })

  it('clamps out-of-range levels', () => {
    expect(comboBonus('pair', 99, data)).toBe(11)
    expect(comboBonus('pair', 0, data)).toBe(2)
  })
})
