// The Fortune Wheel's rules (docs/18, docs/19 phase 2): the slices, the real chances, one spin per UTC day, and a
// prize that's paid once, into the live region.
import { describe, expect, it } from 'vitest'
import {
  canSpin,
  createRng,
  DEFAULT_CONFIG,
  drawPrize,
  newSave,
  payWheelPrize,
  prizeChances,
  sameReward,
  sliceFor,
  spinSpent,
  takeSpin,
  wheelSlices,
  type WheelPrize,
} from '@/engine'
import { parseSave } from '@/save/schema'
import { makeData, newId } from '../fixtures'

const PRIZES = DEFAULT_CONFIG.events.wheel.prizes
const gold = (amount: number, count: number, odds: number): WheelPrize => ({ reward: { kind: 'gold', amount }, count, odds })
const item = (key: string, count: number, odds: number): WheelPrize => ({ reward: { kind: 'item', key, qty: 1 }, count, odds })

describe('the wheel: slices', () => {
  it('has one slice per count, and equal prizes never side by side (the last touches the first)', () => {
    const slices = wheelSlices(PRIZES)
    expect(slices).toHaveLength(9)
    for (const [i, p] of PRIZES.entries()) expect(slices.filter((s) => s === i)).toHaveLength(p.count)
    for (let i = 0; i < slices.length; i++) expect(slices[i]).not.toBe(slices[(i + 1) % slices.length])
  })

  it('leaves out the prizes the admin gave no slice or no chance', () => {
    const slices = wheelSlices([gold(10, 3, 10), item('poke-ball', 0, 50), item('great-ball', 2, 0), item('ultra-ball', 3, 5)])
    expect(slices.sort()).toEqual([0, 0, 0, 3, 3, 3])
  })

  it('lands on one of the prize’s own slices', () => {
    const slices = wheelSlices(PRIZES)
    const rng = createRng(7)
    for (let n = 0; n < 50; n++) {
      const prize = n % PRIZES.length
      expect(slices[sliceFor(slices, prize, rng)]).toBe(prize)
    }
  })
})

describe('the wheel: chances', () => {
  it("are each prize's slices × their odds, out of 100", () => {
    expect(prizeChances(PRIZES)).toEqual([50, 25, 12.5, 10, 2.5])
  })

  it("are scaled to 100 % when the admin's odds don't add up", () => {
    expect(prizeChances([gold(10, 1, 30), item('poke-ball', 1, 10)])).toEqual([75, 25])
  })

  it('come up as often as they say', () => {
    const rng = createRng(42)
    const hits = PRIZES.map(() => 0)
    const n = 20_000
    for (let i = 0; i < n; i++) hits[drawPrize(PRIZES, rng)]!++
    for (const [i, c] of prizeChances(PRIZES).entries()) expect(Math.abs((hits[i]! * 100) / n - c)).toBeLessThan(1.2)
  })

  it('never draw a prize without a chance', () => {
    const rng = createRng(3)
    const prizes = [gold(10, 4, 0), item('master-ball', 1, 1), item('poke-ball', 0, 90)]
    for (let i = 0; i < 200; i++) expect(drawPrize(prizes, rng)).toBe(1)
  })
})

describe('the wheel: one spin a day', () => {
  const data = makeData()
  const fresh = newSave(4, data, 1000, newId)
  const master = { kind: 'item', key: 'master-ball', qty: 1 } as const

  it('is there each UTC day, and taking it waits for the wheel to stop to pay', () => {
    expect(canSpin(fresh, '2026-10-10')).toBe(true)
    const taken = takeSpin(fresh, '2026-10-10', master)
    expect(canSpin(taken, '2026-10-10')).toBe(false)
    // A waiting prize blocks tomorrow's spin too, until it's paid.
    expect(canSpin(taken, '2026-10-11')).toBe(false)
    expect(taken.inventory['master-ball'] ?? 0).toBe(fresh.inventory['master-ball'] ?? 0)
    const paid = payWheelPrize(taken, data)
    expect(paid.inventory['master-ball']).toBe((fresh.inventory['master-ball'] ?? 0) + 1)
    expect(canSpin(paid, '2026-10-10')).toBe(false)
    expect(canSpin(paid, '2026-10-11')).toBe(true)
  })

  it('pays once: ₽ into the live region', () => {
    const paid = payWheelPrize(takeSpin(fresh, '2026-10-10', { kind: 'gold', amount: 10 }), data)
    expect(paid.gold).toBe(fresh.gold + 10)
    expect(payWheelPrize(paid, data)).toBe(paid)
  })

  it('a spin taken on another device spends the day here, with nothing to pay', () => {
    const spent = spinSpent(fresh, '2026-10-10')
    expect(canSpin(spent, '2026-10-10')).toBe(false)
    expect(spent.gold).toBe(fresh.gold)
    expect(spinSpent(spent, '2026-10-10')).toBe(spent)
  })

  it('keeps the waiting prize through a save round trip', () => {
    const taken = takeSpin(fresh, '2026-10-10', master)
    const back = parseSave(JSON.parse(JSON.stringify(taken)))
    expect(back.ok && back.save.events).toEqual({ wheelDay: '2026-10-10', wheelPending: master })
  })

  it('tells two prizes apart', () => {
    expect(sameReward(master, { ...master })).toBe(true)
    expect(sameReward(master, { kind: 'item', key: 'master-ball', qty: 2 })).toBe(false)
    expect(sameReward({ kind: 'gold', amount: 10 }, { kind: 'gold', amount: 10 })).toBe(true)
  })
})
