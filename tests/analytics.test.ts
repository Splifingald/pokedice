import { describe, expect, it } from 'vitest'
import { firstStarter, snapshotOf } from '@/analytics/events'
import { newSave } from '@/engine'
import { data, newId } from './fixtures'

describe('snapshotOf', () => {
  it("sums up where a player's game stands", () => {
    const save = { ...newSave(1, data, 0, newId), gold: 1234, inventory: { potion: 2, 'poke-ball': 0 } }
    const s = snapshotOf(save, data)
    expect(s.dex).toEqual([1])
    expect(s.team).toEqual([{ dex: 1, level: save.box[0]!.level }])
    expect(s.box).toBe(0)
    expect(s.gold).toBe(1234)
    expect(s.inventory).toEqual({ potion: 2 })
    expect(s.areaId).toBe(save.currentAreaId)
    expect(s.badges).toBe(0)
    expect(s.starter).toBe(1)
  })
})

describe('firstStarter', () => {
  it("is Kanto's starter, whether Kanto is the live region or a parked one", () => {
    const save = { ...newSave(4, data, 0, newId), region: 'kanto', pokedex: [4, 16, 1] }
    expect(firstStarter(save)).toBe(4)
    const block = { ...save, pokedex: [7, 10] }
    const inJohto = { ...save, region: 'johto', pokedex: [155], parked: { kanto: block } }
    expect(firstStarter(inJohto)).toBe(7)
    expect(firstStarter({ ...inJohto, parked: {} })).toBeNull()
  })
})
