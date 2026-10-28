import { describe, expect, it } from 'vitest'
import {
  applyFieldItem,
  createBattle,
  createRng,
  getInstance,
  newSave,
  reduce,
  sellItem,
  sellPrice,
  shopStock,
  uniformLevels,
} from '@/engine'
import { data, newId } from '../fixtures'

const fresh = () => newSave(4, data, 0, newId)

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
