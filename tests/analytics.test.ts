import { describe, expect, it } from 'vitest'
import { snapshotOf } from '@/analytics/events'
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
  })
})
