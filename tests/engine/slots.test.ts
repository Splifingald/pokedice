import { describe, expect, it } from 'vitest'
import {
  buildDeck,
  conditionStatus,
  createInstance,
  createRng,
  isAreaUnlocked,
  newSave,
  slotOdds,
  slotReturnPerSpin,
  spinSlots,
  type Area,
  type SaveData,
  type SlotMachineConfig,
} from '@/engine'
import { data, makeData, newId } from '../fixtures'

const SLOTS: SlotMachineConfig = {
  cost: 10,
  oneBall: { weight: 50, gold: 1 },
  twoBalls: { weight: 30, gold: 10 },
  threeBalls: { weight: 10, gold: 50 },
  jackpot: { weight: 10, gold: 10 },
  prizeDex: 137,
  prizeLevel: 30,
}
const d = makeData({ slotMachine: SLOTS })
const rich = (): SaveData => ({ ...newSave(1, d, 0, newId), gold: 100_000 })
const only = (k: keyof SlotMachineConfig) =>
  makeData({
    slotMachine: {
      ...SLOTS,
      ...Object.fromEntries(
        ['oneBall', 'twoBalls', 'threeBalls', 'jackpot'].map((x) => [
          x,
          { ...SLOTS[x as 'oneBall'], weight: x === k ? 1 : 0 },
        ]),
      ),
    },
  })

describe('slot machine', () => {
  it('turns the weights into odds and an average payback', () => {
    expect(slotOdds(SLOTS)).toEqual({ oneBall: 0.5, twoBalls: 0.3, threeBalls: 0.1, jackpot: 0.1 })
    expect(slotReturnPerSpin(SLOTS)).toBeCloseTo(0.5 * 1 + 0.3 * 10 + 0.1 * 50 + 0.1 * 10)
  })

  it('charges the spin and pays each result, with reels that show it', () => {
    const cases = [
      ['oneBall', 1, 1],
      ['twoBalls', 2, 10],
      ['threeBalls', 3, 50],
    ] as const
    for (const [k, balls, gold] of cases) {
      const res = spinSlots(rich(), only(k), createRng(7), 0, newId)!
      expect(res.outcome).toBe(k)
      expect(res.reels.filter((r) => r === 'ball')).toHaveLength(balls)
      expect(res.gold).toBe(gold)
      expect(res.save.gold).toBe(100_000 - 10 + gold)
    }
  })

  it('follows the configured odds over many spins', () => {
    const rng = createRng(42)
    const counts = { oneBall: 0, twoBalls: 0, threeBalls: 0, jackpot: 0 }
    let s = rich()
    for (let i = 0; i < 20_000; i++) {
      const res = spinSlots(s, d, rng, 0, newId)!
      counts[res.outcome]++
      s = { ...res.save, gold: 100_000 }
    }
    expect(counts.oneBall / 20_000).toBeCloseTo(0.5, 1)
    expect(counts.twoBalls / 20_000).toBeCloseTo(0.3, 1)
    expect(counts.threeBalls / 20_000).toBeCloseTo(0.1, 1)
    expect(counts.jackpot / 20_000).toBeCloseTo(0.1, 1)
  })

  it('refuses a spin the player cannot pay for', () => {
    expect(spinSlots({ ...rich(), gold: 9 }, d, createRng(1), 0, newId)).toBeNull()
  })

  it('jackpot: three prize Pokémon and the prize joins the team', () => {
    const jd = only('jackpot')
    const res = spinSlots(rich(), jd, createRng(3), 0, newId)!
    expect(res.reels).toEqual(['prize', 'prize', 'prize'])
    expect(res.prize).toMatchObject({ dex: 137, level: 30, joinedTeam: true })
    expect(res.save.pokedex).toContain(137)
    expect(res.gold).toBe(0)
  })

  it('jackpot: a stronger copy replaces a weaker one; an equal one pays gold instead', () => {
    const jd = only('jackpot')
    const weak = rich()
    const low = createInstance(137, 20, jd, 'pory', 0)
    const withWeak = { ...weak, box: [...weak.box, low], pokedex: [...weak.pokedex, 137] }
    const up = spinSlots(withWeak, jd, createRng(3), 0, newId)!
    expect(up.prize).toMatchObject({ uid: 'pory', level: 30, replacedLevel: 20 })

    const strong = { ...withWeak, box: withWeak.box.map((p) => (p.id === 'pory' ? { ...p, level: 30 } : p)) }
    const paid = spinSlots(strong, jd, createRng(3), 0, newId)!
    expect(paid.prize).toBeNull()
    expect(paid.gold).toBe(10)
    expect(paid.save.box).toHaveLength(strong.box.length)
  })
})

describe('Game Corner cards and the "area reached" condition', () => {
  const route1 = data.areas.find((a) => !a.hidden)!
  const second = data.areas.filter((a) => !a.hidden).sort((a, b) => a.orderIndex - b.orderIndex)[1]!

  it('deals the Game Corner cards the area asks for', () => {
    const area: Area = { ...route1, encounterWeights: { wild: 2, trainer: 0, center: 1, item: 0, casino: 3 } }
    const deck = buildDeck(area, data, createRng(5))
    expect(deck.filter((c) => c === 'casino')).toHaveLength(3)
  })

  it('opens a secret area once the area it names is reached', () => {
    const hideout: Area = {
      ...route1,
      id: 'hideout',
      hidden: true,
      unlockConditions: [{ kind: 'area', areaId: second.id }],
    }
    const d2 = { ...data, areas: [...data.areas, hideout] }
    const s = newSave(1, d2, 0, newId)
    expect(isAreaUnlocked(s, 'hideout', d2)).toBe(false)
    expect(conditionStatus({ kind: 'area', areaId: second.id }, s, d2)).toMatchObject({
      met: false,
      label: `Reach ${second.name}`,
    })
    const reached = {
      ...s,
      areaProgress: { ...s.areaProgress, [route1.id]: { ...s.areaProgress[route1.id]!, cleared: true } },
    }
    expect(isAreaUnlocked(reached, 'hideout', d2)).toBe(true)
  })

  it('does not loop on two secret areas that require each other', () => {
    const a: Area = { ...route1, id: 'a', hidden: true, unlockConditions: [{ kind: 'area', areaId: 'b' }] }
    const b: Area = { ...route1, id: 'b', hidden: true, unlockConditions: [{ kind: 'area', areaId: 'a' }] }
    const d2 = { ...data, areas: [...data.areas, a, b] }
    expect(isAreaUnlocked(newSave(1, d2, 0, newId), 'a', d2)).toBe(false)
  })
})
