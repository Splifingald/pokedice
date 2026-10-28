// A find's rarity (docs/43): its share of the area's loot deck — common from 12 %, uncommon from 5 %, rare under it;
// a once-only find is always rare.
import { describe, expect, it } from 'vitest'
import { emptyProgress, findRarity, MONEY, type Area, type GameData, type LootEntry } from '@/engine'
import { gameData } from '../e2e/helpers'

const data = gameData() as GameData
const base = data.areas.find((a) => a.lootPool.length)!
const entry = (id: string, weight: number, unique = false): LootEntry => ({
  id,
  itemKey: unique ? 'master-ball' : id === 'cash' ? MONEY : 'potion',
  weight,
  unique,
  minQty: 1,
  maxQty: 1,
})
const area = (pool: LootEntry[]): Area => ({ ...base, lootPool: pool })

describe('a find’s rarity', () => {
  it('follows its share of the loot deck', () => {
    // 50 copies in all: 30 (60 %), 15 (30 %), 3 (6 %), 2 (4 %).
    const a = area([entry('a', 30), entry('b', 15), entry('c', 3), entry('d', 2)])
    expect(findRarity(a, emptyProgress(), data, 'a')).toBe('common')
    expect(findRarity(a, emptyProgress(), data, 'b')).toBe('common')
    expect(findRarity(a, emptyProgress(), data, 'c')).toBe('uncommon')
    expect(findRarity(a, emptyProgress(), data, 'd')).toBe('rare')
  })

  it('reads the thresholds inclusively: 12 % is common, 5 % uncommon', () => {
    // 100 copies: 12, 5, and the rest.
    const a = area([entry('a', 12), entry('b', 5), entry('rest', 83)])
    expect(findRarity(a, emptyProgress(), data, 'a')).toBe('common')
    expect(findRarity(a, emptyProgress(), data, 'b')).toBe('uncommon')
  })

  it('a once-only find is rare, however large its share; Pokédollars rank as any find', () => {
    const a = area([entry('once', 1, true), entry('cash', 1)])
    expect(findRarity(a, emptyProgress(), data, 'once')).toBe('rare')
    expect(findRarity(a, emptyProgress(), data, 'cash')).toBe('common')
  })

  it('an entry no longer on the table reads as rare', () => {
    const a = area([entry('a', 10)])
    expect(findRarity(a, emptyProgress(), data, 'gone')).toBe('rare')
  })
})
