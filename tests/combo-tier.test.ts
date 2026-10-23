// The game-feel pass's combo tiers (docs/38): every combo has one, and they rise with how rare the combo is.
import { describe, expect, it } from 'vitest'
import { COMBO_KEYS, comboTier } from '@/engine'

describe('comboTier', () => {
  it('gives every combo a tier from 1 to 4, never lower than the one before it', () => {
    const tiers = COMBO_KEYS.map((k) => comboTier(k))
    expect(tiers.every((t) => t >= 1 && t <= 4)).toBe(true)
    expect(tiers).toEqual([...tiers].sort((a, b) => a - b))
    expect(comboTier('pair')).toBe(1)
    expect(comboTier('five_kind')).toBe(4)
  })

  it('is 0 without a combo', () => {
    expect(comboTier(null)).toBe(0)
    expect(comboTier(undefined)).toBe(0)
  })
})
