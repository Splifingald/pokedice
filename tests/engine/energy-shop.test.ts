import { describe, expect, it } from 'vitest'
import {
  applyFieldItem,
  createBattle,
  createRng,
  encounterEnergyCost,
  energyNow,
  getInstance,
  newSave,
  reduce,
  sellItem,
  sellPrice,
  shopStock,
  spendEnergy,
  uniformLevels,
  type EnergyConfig,
} from '@/engine'
import { data, newId } from '../fixtures'

const fresh = () => newSave(4, data, 0, newId)
const CFG: EnergyConfig = { enabled: true, max: 50, minutesPerEnergy: 30 }
const MIN = 60_000

describe('energy', () => {
  it('a new save is full', () => {
    expect(energyNow(fresh(), CFG, 123)).toEqual({ value: 50, max: 50, nextAt: null })
  })

  it('spending from full starts the clock; a point comes back every 30 minutes, up to the cap', () => {
    const s = spendEnergy(fresh(), CFG, 1000)!
    expect(energyNow(s, CFG, 1000)).toEqual({ value: 49, max: 50, nextAt: 1000 + 30 * MIN })
    expect(energyNow(s, CFG, 1000 + 30 * MIN).value).toBe(50)
    expect(energyNow(s, CFG, 1000 + 999 * MIN).value).toBe(50)
  })

  it('keeps the time already put towards the next point', () => {
    let s = spendEnergy(fresh(), CFG, 0, 10)! // 40, clock from 0
    s = spendEnergy(s, CFG, 20 * MIN)! // 39, still due at 30 min
    expect(energyNow(s, CFG, 30 * MIN).value).toBe(40)
    expect(energyNow(s, CFG, 29 * MIN).nextAt).toBe(30 * MIN)
  })

  it("can't go below 0", () => {
    const empty = spendEnergy(fresh(), CFG, 0, 50)!
    expect(energyNow(empty, CFG, 0).value).toBe(0)
    expect(spendEnergy(empty, CFG, 0)).toBeNull()
    expect(spendEnergy(empty, CFG, 30 * MIN)).not.toBeNull()
  })

  it('gyms, legendaries and Pokémon Centers are free; everything else costs 1', () => {
    expect(encounterEnergyCost({ kind: 'wild', dex: 16, level: 3, isNew: true })).toBe(1)
    expect(encounterEnergyCost({ kind: 'casino' })).toBe(1)
    expect(encounterEnergyCost({ kind: 'center', forced: false })).toBe(0)
    expect(encounterEnergyCost({ kind: 'center', forced: true, reason: 'round' })).toBe(0)
    expect(encounterEnergyCost({ kind: 'boss', dex: 144, level: 50 })).toBe(0)
  })
})

describe('selling', () => {
  it('the Mart buys its own stock back at half price, rounded down', () => {
    const s = { ...fresh(), gold: 0, inventory: { potion: 3, 'rare-candy': 1 } }
    const potion = data.items.potion!
    expect(sellPrice(potion)).toBe(Math.floor(potion.price / 2))
    const sold = sellItem(s, 'potion', 2, data)!
    expect(sold.inventory.potion).toBe(1)
    expect(sold.gold).toBe(2 * Math.floor(potion.price / 2))
    expect(sellItem(s, 'potion', 4, data)).toBeNull() // not that many
    expect(sellItem(s, 'rare-candy', 1, data)).toBeNull() // not Mart stock
  })
})

describe('revives', () => {
  it('Revive and Max Revive arrive with the 6th and 8th badges', () => {
    const at = (b: number) => shopStock(data, b).filter((x) => x.unlocked).map((x) => x.item.key)
    expect(at(5)).not.toContain('revive')
    expect(at(6)).toContain('revive')
    expect(at(7)).not.toContain('max-revive')
    expect(at(8)).toContain('max-revive')
  })

  it('from the Team screen: only on a K.O.d Pokémon, with half (or all) its HP', () => {
    const s0 = fresh()
    const id = s0.team[0]!
    const inst = getInstance(s0, id)!
    const max = inst.currentHp
    const ko = { ...s0, box: s0.box.map((p) => (p.id === id ? { ...p, currentHp: 0 } : p)), inventory: { revive: 1, 'max-revive': 1 } }
    const half = applyFieldItem(ko, 'revive', id, data, createRng(1))!.save
    expect(getInstance(half, id)!.currentHp).toBe(Math.floor(max / 2))
    expect(half.inventory.revive).toBe(0)
    expect(applyFieldItem(half, 'max-revive', id, data, createRng(1))).toBeNull() // not K.O. any more
    expect(getInstance(applyFieldItem(ko, 'max-revive', id, data, createRng(1))!.save, id)!.currentHp).toBe(max)
  })

  it('in battle: brings a K.O.d teammate back without using the turn', () => {
    const s = createBattle(
      {
        kind: 'wild',
        team: [{ uid: 'a', dex: 143, level: 50, hp: 999 }, { uid: 'b', dex: 16, level: 5, hp: 0 }],
        enemy: { dex: 19, level: 3 },
        playerLevels: uniformLevels(1),
        enemyLevels: uniformLevels(1),
      },
      data,
    ).state
    const mine = reduce(s, { t: 'AI_TURN' }, data, createRng(2)).state
    expect(mine.phase).toBe('player_roll')
    expect(reduce(mine, { t: 'USE_ITEM', key: 'revive', targetUid: 'a' }, data, createRng(1)).state).toBe(mine) // not K.O.
    const r = reduce(mine, { t: 'USE_ITEM', key: 'revive', targetUid: 'b' }, data, createRng(1))
    const b = r.state.player[1]!
    expect(b.hp).toBe(Math.floor(b.maxHp / 2))
    expect(r.state.phase).toBe('player_roll')
    expect(r.log).toContainEqual(expect.objectContaining({ kind: 'item', revived: true, targetUid: 'b' }))
    expect(reduce(mine, { t: 'USE_ITEM', key: 'potion', targetUid: 'b' }, data, createRng(1)).state).toBe(mine) // potions don't revive
  })
})
