// The map's area popup lists every Pokémon an area can give, once each.
import { describe, expect, it } from 'vitest'
import { compileGameData } from '@/engine'
import { BUNDLE } from '@/config/bundle'
import { areaPokemon } from '@/components/AreaDex'

const data = compileGameData(BUNDLE)

describe('areaPokemon', () => {
  it("lists an area's wild species by Pokédex number, each once, with shares that add up", () => {
    const area = data.areas.find((a) => a.wildPool.some((w) => w.weight > 0))!
    const wild = areaPokemon(area, data).filter((m) => m.kind === 'wild')
    const dexes = wild.map((m) => m.dex)
    expect(dexes).toEqual([...new Set(area.wildPool.filter((w) => w.weight > 0).map((w) => w.dex))].sort((a, b) => a - b))
    expect(wild.reduce((sum, m) => sum + m.share, 0)).toBeCloseTo(1)
  })

  it('adds legendaries and fossils after the wild ones, and never lists a species twice', () => {
    for (const area of data.areas) {
      const mons = areaPokemon(area, data)
      expect(new Set(mons.map((m) => m.dex)).size, area.name).toBe(mons.length)
      for (const b of area.legendaryBoss ?? []) expect(mons.some((m) => m.dex === b.dex), area.name).toBe(true)
    }
    const fossilArea = data.areas.find((a) =>
      a.lootPool.some((e) => data.items[e.itemKey]?.effect.kind === 'fossil' && e.weight > 0),
    )
    if (fossilArea) expect(areaPokemon(fossilArea, data).some((m) => m.kind === 'fossil')).toBe(true)
  })
})
