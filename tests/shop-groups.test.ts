// The Mart renders group by group: an item whose effect kind no group claims is dropped from the screen entirely.
import { describe, expect, it } from 'vitest'
import { shopStock, type ItemDef } from '@/engine'
import { groupOf } from '@/screens/Shop'
import { data } from './fixtures'

/** Every kind `ItemEffect` can take. Adding one to the union without a group is what this file exists to catch. */
const ALL_KINDS: ItemDef['effect']['kind'][] = ['heal', 'cure', 'rerolls', 'revive', 'stone', 'fossil', 'level', 'ball']

describe('the Mart lists everything it stocks', () => {
  it('gives every item effect kind a group', () => {
    for (const kind of ALL_KINDS) expect(groupOf(kind), kind).not.toBeNull()
  })

  it('leaves no stocked item without a group to appear in', () => {
    // At every badge count, whatever the Mart says is unlocked has somewhere on screen to go.
    for (const badges of [0, 4, 8]) {
      for (const { item, unlocked } of shopStock(data, badges, () => true)) {
        if (unlocked) expect(groupOf(item.effect.kind), item.key).not.toBeNull()
      }
    }
  })

  it('a fossil the Mart is set to sell is visible once its badges are in', () => {
    // Old Amber ships as loot-only; a deployment that puts it on the shelf must be able to show it.
    const onSale: ItemDef = { ...data.items['old-amber']!, inShop: true, shopBadges: 7, price: 500 }
    const withIt = { ...data, items: { ...data.items, 'old-amber': onSale } }
    const at6 = shopStock(withIt, 6, () => true).find((s) => s.item.key === 'old-amber')!
    const at7 = shopStock(withIt, 7, () => true).find((s) => s.item.key === 'old-amber')!
    expect(at6.unlocked).toBe(false)
    expect(at7.unlocked).toBe(true)
    expect(groupOf(at7.item.effect.kind)).toBe('ui.shop.groupFossils')
  })
})

describe('what a region stocks', () => {
  const mart = (over: Partial<ItemDef>) => ({ ...data.items['potion']!, key: 'special', ...over })
  const withItem = (over: Partial<ItemDef>) => ({ ...data, items: { ...data.items, special: mart(over) } })
  const has = (stock: { item: ItemDef }[]) => stock.some((s) => s.item.key === 'special')

  it('an item with no region is on every shelf', () => {
    const d = withItem({})
    expect(has(shopStock(d, 8, () => true, { region: 'kanto' }))).toBe(true)
    expect(has(shopStock(d, 8, () => true, { region: 'johto' }))).toBe(true)
  })

  it('an item bound to a region is on that shelf alone', () => {
    const d = withItem({ region: 'johto' })
    expect(has(shopStock(d, 8, () => true, { region: 'johto' }))).toBe(true)
    expect(has(shopStock(d, 8, () => true, { region: 'kanto' }))).toBe(false)
    // No region asked for: every region's stock, which is what the tests and the simulator want.
    expect(has(shopStock(d, 8, () => true))).toBe(true)
  })

  it('a unique item leaves the shelf once bought, and does not come back', () => {
    const d = withItem({ unique: true })
    expect(has(shopStock(d, 8, () => true, { region: 'kanto' }))).toBe(true)
    expect(has(shopStock(d, 8, () => true, { region: 'kanto', bought: ['special'] }))).toBe(false)
  })
})
