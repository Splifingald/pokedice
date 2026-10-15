// Haunted Hollow's new species (docs/26 §2.8, the user's calls of 2026-10-15) on the real content: Joltik, Riolu,
// Galvantula and Lucario are found where the user put them, count in the world's Pokédex, and evolve inside the world
// by level (Riolu at 30, Joltik at 36) even though Sinnoh and Unova are far off; the Mart sells at the new prices.
import { describe, expect, it } from 'vitest'
import {
  applyFieldItem,
  compileGameData,
  createInstance,
  createRng,
  enterWorld,
  evolutionGate,
  gainXp,
  newSave,
  regionSpecies,
  smallWorlds,
  xpToNext,
  type GameData,
  type SaveData,
} from '@/engine'
import { BUNDLE } from '@/config/bundle'
import { REGION_ID, WORLD_ID, withHaunted } from '../../scripts/content-haunted-hollow'
import { newId } from '../fixtures'

const data: GameData = compileGameData(withHaunted(BUNDLE))
const world = smallWorlds(data).find((w) => w.id === WORLD_ID)!
const NOW = Date.parse(world.start) + 3_600_000
const kanto = (): SaveData => newSave(4, data, 0, newId)
const inside = (): SaveData => enterWorld(kanto(), data, world, world.starters[0]!, NOW, newId)!
const pool = (area: string) => data.areas.find((a) => a.regionId === REGION_ID && a.name === area)!.wildPool
const weightOf = (area: string, dex: number) => pool(area).find((w) => w.dex === dex)?.weight

describe('Haunted Hollow’s new species', () => {
  it('are found where the user put them: Joltik common, Riolu uncommon, Galvantula and Lucario rare', () => {
    const where = (dex: number) =>
      data.areas
        .filter((a) => a.regionId === REGION_ID && a.wildPool.some((w) => w.dex === dex))
        .map((a) => [a.name, a.minLevel, a.maxLevel])
    expect(where(595)).toEqual([['Whispering Woods', 11, 16]])
    expect(where(596)).toEqual([['Rusted Armory', 37, 44]])
    expect(where(447)).toEqual([['Old Quarry', 20, 26]])
    expect(where(448)).toEqual([['Spirit Mountain', 48, 56]])
    // As common as the area's commons, as rare as its rares.
    expect(weightOf('Whispering Woods', 595)).toBe(weightOf('Whispering Woods', 48))
    expect(weightOf('Old Quarry', 447)).toBe(weightOf('Old Quarry', 104))
    expect(weightOf('Rusted Armory', 596)).toBe(weightOf('Rusted Armory', 680))
    expect(weightOf('Spirit Mountain', 448)).toBe(weightOf('Spirit Mountain', 229))
  })

  it('count in the world’s Pokédex', () => {
    const dex = regionSpecies(data, REGION_ID)
    for (const d of [447, 448, 595, 596]) expect(dex.has(d)).toBe(true)
  })

  it('evolve by level inside the world: Riolu at 30, Joltik at 36', () => {
    const s = inside()
    const gate = evolutionGate(s, data)
    for (const [from, at, to] of [
      [447, 30, 448],
      [595, 36, 596],
    ] as const) {
      const before = createInstance(from, at - 1, data, newId(), NOW)
      const up = gainXp(before, xpToNext(at - 1, data.config), data, createRng(1), { allowDex: gate })
      expect([up.inst.level, up.inst.dex]).toEqual([at, to])
      expect(up.events).toContainEqual(expect.objectContaining({ kind: 'evolve', fromDex: from, toDex: to }))
      // A level short, it waits.
      const short = createInstance(from, at - 2, data, newId(), NOW)
      expect(
        gainXp(short, xpToNext(at - 2, data.config), data, createRng(1), { allowDex: gate }).inst.dex,
      ).toBe(from)
    }
    // Outside, in Kanto, Lucario (Sinnoh) waits for its generation; the world opens every one.
    expect(evolutionGate(kanto(), data)(448)).toBe(false)
    expect(gate(448)).toBe(true)
  })

  it('evolve with a Rare Candy from the world’s bag, the evolved form added to its Pokédex', () => {
    const s = inside()
    const riolu = createInstance(447, 29, data, newId(), NOW)
    const bag: SaveData = { ...s, box: [...s.box, riolu], inventory: { ...s.inventory, 'rare-candy': 1 } }
    const used = applyFieldItem(bag, 'rare-candy', riolu.id, data, createRng(1))!
    expect(used.save.box.find((p) => p.id === riolu.id)?.dex).toBe(448)
    expect(used.save.pokedex).toContain(448)
  })

  it('come with a cheaper Mart: Link Cable ₽300, Master Ball ₽999 (still 1 per player)', () => {
    const line = (key: string) => world.shop.find((s) => s.key === key)
    expect(line('link-cable')).toEqual({ key: 'link-cable', price: 300, limit: null })
    expect(line('master-ball')).toEqual({ key: 'master-ball', price: 999, limit: 1 })
  })
})
