// The Fortune Wheel's rules (docs/18; tickets since 2026-10-25): the slices, the real chances, the jackpot's stages,
// the tickets, the ₽150 average and a prize that's paid once, into the live region.
import { describe, expect, it } from 'vitest'
import {
  buyTicket,
  canSpin,
  createRng,
  DEFAULT_CONFIG,
  drawPrize,
  jackpotIndex,
  jackpotStage,
  newSave,
  payWheelPrize,
  prizeChances,
  roulettePrizes,
  sliceFor,
  takeSpin,
  wheelAverage,
  wheelSlices,
  wheelTickets,
  type SaveData,
  type WheelPrize,
} from '@/engine'
import { parseSave } from '@/save/schema'
import { makeData, newId } from '../fixtures'

const WHEEL = DEFAULT_CONFIG.events.wheel
const HOUR = 60 * 60 * 1000
const gold = (amount: number, count: number, odds: number): WheelPrize => ({ reward: { kind: 'gold', amount }, count, odds })
const item = (key: string, count: number, odds: number): WheelPrize => ({ reward: { kind: 'item', key, qty: 1 }, count, odds })
const data = makeData()
const fresh = newSave(4, data, 1000, newId)
const T0 = Date.UTC(2026, 9, 25, 8)

describe('the wheel: slices', () => {
  it('has one slice per count plus the jackpot’s, and equal prizes never side by side', () => {
    const prizes = roulettePrizes(WHEEL, 0)
    const slices = wheelSlices(prizes)
    expect(slices).toHaveLength(12)
    for (const [i, p] of prizes.entries()) expect(slices.filter((s) => s === i)).toHaveLength(p.count)
    for (let i = 0; i < slices.length; i++) expect(slices[i]).not.toBe(slices[(i + 1) % slices.length])
  })

  it('leaves out the prizes the admin gave no slice or no chance', () => {
    const slices = wheelSlices([gold(10, 3, 10), item('poke-ball', 0, 50), item('great-ball', 2, 0), item('ultra-ball', 3, 5)])
    expect(slices.sort()).toEqual([0, 0, 0, 3, 3, 3])
  })

  it('lands on one of the prize’s own slices', () => {
    const prizes = roulettePrizes(WHEEL, 0)
    const slices = wheelSlices(prizes)
    const rng = createRng(7)
    for (let n = 0; n < 50; n++) {
      const prize = n % prizes.length
      expect(slices[sliceFor(slices, prize, rng)]).toBe(prize)
    }
  })
})

describe('the wheel: chances', () => {
  it('give the jackpot exactly its own chance at each stage: Porygon 10 %, shiny Porygon 1 %, a Master Ball 0.25 %', () => {
    for (const [stage, odds] of [10, 1, 0.25].entries()) {
      const chances = prizeChances(roulettePrizes(WHEEL, stage))
      expect(chances[jackpotIndex(WHEEL, stage)]).toBeCloseTo(odds, 9)
    }
  })

  it("are scaled to 100 % when the admin's odds don't add up", () => {
    expect(prizeChances([gold(10, 1, 30), item('poke-ball', 1, 10)])).toEqual([75, 25])
  })

  it('come up as often as they say', () => {
    const prizes = roulettePrizes(WHEEL, 0)
    const rng = createRng(42)
    const hits = prizes.map(() => 0)
    const n = 20_000
    for (let i = 0; i < n; i++) hits[drawPrize(prizes, rng)]!++
    for (const [i, c] of prizeChances(prizes).entries()) expect(Math.abs((hits[i]! * 100) / n - c)).toBeLessThan(1.2)
  })

  it('never draw a prize without a chance', () => {
    const rng = createRng(3)
    const prizes = [gold(10, 4, 0), item('master-ball', 1, 1), item('poke-ball', 0, 90)]
    for (let i = 0; i < 200; i++) expect(drawPrize(prizes, rng)).toBe(1)
  })

  it('pay back ₽150 at most a spin on average, at every stage, and can pay more than a ticket', () => {
    const averages = WHEEL.jackpot.map((_, stage) => wheelAverage(WHEEL, stage, data))
    expect(averages.map(Math.round)).toEqual([136, 147, 120])
    for (const a of averages) expect(a).toBeLessThanOrEqual(WHEEL.tickets.maxAverage)
    expect(WHEEL.slices.some((p) => p.reward.kind === 'gold' && p.reward.amount > WHEEL.tickets.price)).toBe(true)
  })
})

describe('the wheel: the jackpot’s stages', () => {
  const porygon = (s: SaveData, shiny: boolean): SaveData => payWheelPrize({ ...s, events: { wheelPending: { kind: 'pokemon', dex: 137, level: 30, shiny } } }, data, T0, newId)

  it('is Porygon until it’s caught, then a shiny Porygon until that’s caught, then a Master Ball for good', () => {
    expect(jackpotStage(fresh, WHEEL)).toBe(0)
    const caught = porygon(fresh, false)
    expect(caught.pokedex).toContain(137)
    expect(jackpotStage(caught, WHEEL)).toBe(1)
    const shiny = porygon(caught, true)
    expect(shiny.box.some((p) => p.dex === 137 && p.shiny)).toBe(true)
    expect(jackpotStage(shiny, WHEEL)).toBe(2)
  })

  it('counts a Porygon caught anywhere, and a shiny one noted in the shiny Pokédex', () => {
    expect(jackpotStage({ ...fresh, pokedex: [...fresh.pokedex, 137] }, WHEEL)).toBe(1)
    expect(jackpotStage({ ...fresh, pokedex: [...fresh.pokedex, 137], shinyDex: { johto: [137] } }, WHEEL)).toBe(2)
  })
})

describe('the wheel: tickets', () => {
  it('start as a full stack of 4, with the clock stopped', () => {
    expect(wheelTickets(fresh, data, T0)).toEqual({ tickets: 4, nextAt: null })
    expect(canSpin(fresh, data, T0)).toBe(true)
  })

  it('cost one a spin; the first spent starts the 12 h clock, and a free one comes back on it', () => {
    const spun = takeSpin(fresh, data, T0, { kind: 'gold', amount: 50 })!
    expect(spun.events?.wheelPending).toEqual({ kind: 'gold', amount: 50 })
    const paid = payWheelPrize(spun, data, T0, newId)
    expect(wheelTickets(paid, data, T0)).toEqual({ tickets: 3, nextAt: T0 + 12 * HOUR })
    expect(wheelTickets(paid, data, T0 + 12 * HOUR)).toEqual({ tickets: 4, nextAt: null })
  })

  it('come one every 12 h up to 4, and no further', () => {
    const empty: SaveData = { ...fresh, events: { wheelTickets: 0, wheelTicketAt: T0 + HOUR } }
    expect(canSpin(empty, data, T0)).toBe(false)
    expect(takeSpin(empty, data, T0, { kind: 'gold', amount: 50 })).toBeNull()
    expect(wheelTickets(empty, data, T0 + HOUR)).toEqual({ tickets: 1, nextAt: T0 + 13 * HOUR })
    expect(wheelTickets(empty, data, T0 + 25 * HOUR)).toEqual({ tickets: 3, nextAt: T0 + 37 * HOUR })
    expect(wheelTickets(empty, data, T0 + 100 * HOUR)).toEqual({ tickets: 4, nextAt: null })
  })

  it('wait for the last prize to be paid before the next spin', () => {
    const spun = takeSpin(fresh, data, T0, { kind: 'gold', amount: 50 })!
    expect(canSpin(spun, data, T0)).toBe(false)
  })

  it('sell for ₽200 each while fewer than 4 are held', () => {
    const rich = { ...fresh, gold: 1000 }
    expect(buyTicket(rich, data, T0)).toBeNull()
    const two: SaveData = { ...rich, events: { wheelTickets: 2, wheelTicketAt: T0 + HOUR } }
    const three = buyTicket(two, data, T0)!
    expect(three.gold).toBe(800)
    expect(wheelTickets(three, data, T0)).toEqual({ tickets: 3, nextAt: T0 + HOUR })
    // The fourth fills the stack: its clock stops.
    const four = buyTicket(three, data, T0)!
    expect(wheelTickets(four, data, T0)).toEqual({ tickets: 4, nextAt: null })
    expect(buyTicket({ ...two, gold: 199 }, data, T0)).toBeNull()
  })
})

describe('the wheel: paying the prize', () => {
  const spun = (s: SaveData, reward: Parameters<typeof takeSpin>[3]) => takeSpin(s, data, T0, reward)!

  it('pays once: ₽ into the live region, items into the bag', () => {
    const paid = payWheelPrize(spun(fresh, { kind: 'gold', amount: 500 }), data, T0, newId)
    expect(paid.gold).toBe(fresh.gold + 500)
    expect(payWheelPrize(paid, data, T0, newId)).toBe(paid)
    const balls = payWheelPrize(spun(fresh, { kind: 'item', key: 'ultra-ball', qty: 2 }), data, T0, newId)
    expect(balls.inventory['ultra-ball']).toBe((fresh.inventory['ultra-ball'] ?? 0) + 2)
  })

  it('a Pokémon joins as a catch', () => {
    const paid = payWheelPrize(spun(fresh, { kind: 'pokemon', dex: 137, level: 30 }), data, T0, newId)
    const mon = paid.box.find((p) => p.dex === 137)
    expect(mon?.level).toBe(30)
    expect(paid.events?.wheelPending).toBeUndefined()
  })

  it('keeps the waiting prize and the tickets through a save round trip', () => {
    const taken = spun(fresh, { kind: 'pokemon', dex: 137, level: 30, shiny: true })
    const back = parseSave(JSON.parse(JSON.stringify(taken)))
    expect(back.ok && back.save.events).toEqual({
      wheelTickets: 3,
      wheelTicketAt: T0 + 12 * HOUR,
      wheelPending: { kind: 'pokemon', dex: 137, level: 30, shiny: true },
    })
  })
})
