// The Upgrades screen's best buy (docs/15 §13): the cheapest upgrade you can afford, gold among navy buttons.
import { describe, expect, it } from 'vitest'
import { bestBuy } from '@/lib/upgrades'

const up = (id: string, cost: number | null, locked: string | null = null) => ({ id, cost, locked })

describe('bestBuy', () => {
  it('is the cheapest upgrade within your gold', () => {
    expect(bestBuy([up('pair', 40), up('triple', 15), up('quad', 90)], 100)).toBe('triple')
  })

  it('skips locked, maxed and unaffordable ones; the first listed wins a tie', () => {
    expect(bestBuy([up('a', 5, 'Locked'), up('b', null), up('c', 300), up('d', 20), up('e', 20)], 100)).toBe(
      'd',
    )
  })

  it('is nothing when nothing is affordable', () => {
    expect(bestBuy([up('a', 500), up('b', 5, 'Locked')], 100)).toBeNull()
    expect(bestBuy([], 100)).toBeNull()
  })
})
