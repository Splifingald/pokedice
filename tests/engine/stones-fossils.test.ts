import { describe, expect, it } from 'vitest'
import {
  addFossil,
  applyFieldItem,
  createInstance,
  DEFAULT_CONFIG,
  createRng,
  depositError,
  gainXp,
  getInstance,
  isAreaUnlocked,
  newSave,
  pickUpItem,
  reviveFossils,
  sellPrice,
  setTeam,
  shopStock,
  swapIntoTeam,
  xpToNext,
  wildShinyChance,
  type GameData,
  type SaveData,
} from '@/engine'
import { data, makeData, newId } from '../fixtures'

const fresh = () => newSave(4, data, 0, newId)
const withMon = (s: SaveData, dex: number, level: number, id = 'mon'): SaveData => ({
  ...s,
  box: [...s.box, createInstance(dex, level, data, id, 0)],
  inventory: { ...s.inventory, 'thunder-stone': 1, 'water-stone': 1, 'fire-stone': 1 },
})

describe('evolution stones', () => {
  it('stone Pokémon no longer evolve by level', () => {
    const pika = createInstance(25, 60, data, 'p', 0)
    expect(gainXp(pika, xpToNext(60, data.config), data, createRng(1)).inst.dex).toBe(25)
  })

  it('the right stone evolves it from the Team screen; the wrong one does nothing', () => {
    const s = withMon(fresh(), 25, 10)
    expect(applyFieldItem(s, 'water-stone', 'mon', data, createRng(1))).toBeNull()
    const r = applyFieldItem(s, 'thunder-stone', 'mon', data, createRng(1))!
    expect(getInstance(r.save, 'mon')!.dex).toBe(26)
    expect(r.save.inventory['thunder-stone']).toBe(0)
    expect(r.save.pokedex).toContain(26)
    expect(r.events).toContainEqual(expect.objectContaining({ kind: 'evolve', fromDex: 25, toDex: 26 }))
  })

  it("Eevee: the stone picks its form", () => {
    const s = withMon(fresh(), 133, 10)
    const to = (key: string) => getInstance(applyFieldItem(s, key, 'mon', data, createRng(1))!.save, 'mon')!.dex
    expect([to('water-stone'), to('thunder-stone'), to('fire-stone')]).toEqual([134, 135, 136])
  })

  // Which stones the Mart gates is admin-tuned: Celadon held Kanto's five when this was written, and on the live
  // database they carry no `shopArea` at all and are on sale from the start. The rule is what is checked here.
  it('₽200 in the Mart, on sale once its shopArea is reached; sold back for ₽100', () => {
    const celadon = data.areas.find((a) => a.name === 'Routes 7 & 8')!.id
    for (const open of [false, true]) {
      const stock = shopStock(data, 8, (id) => open && id === celadon).filter((x) => x.item.effect.kind === 'stone')
      expect(stock.length).toBeGreaterThan(0)
      for (const row of stock) {
        const gate = row.item.shopArea
        expect(row.unlocked, `${row.item.key} (open=${open})`).toBe(!gate || (open && gate === celadon))
      }
    }
    expect(data.items['moon-stone']!.price).toBe(200)
    expect(sellPrice(data.items['moon-stone'])).toBe(100)
    expect(isAreaUnlocked(fresh(), celadon, data)).toBe(false)
  })
})

describe('fossils', () => {
  const mtMoon = data.areas.find((a) => a.name === 'Mt. Moon')!
  const helix = mtMoon.lootPool.find((e) => e.itemKey === 'helix-fossil')!

  it('are found once in Mt. Moon (Old Amber in Silph Co.) and never sold', () => {
    expect(helix.unique).toBe(true)
    expect(mtMoon.lootPool.some((e) => e.itemKey === 'dome-fossil')).toBe(true)
    expect(data.areas.find((a) => a.name === 'Silph Co.')!.lootPool.some((e) => e.itemKey === 'old-amber')).toBe(true)
    expect(sellPrice(data.items['helix-fossil'])).toBe(0)
    expect(data.items['helix-fossil']!.inShop).toBe(false)
    // The wild ones are gone.
    for (const a of data.areas) expect(a.wildPool.filter((w) => [138, 140, 142].includes(w.dex) && w.weight > 0)).toEqual([])
  })

  it('go straight to the Box at Lv.20, reviving for 24 h: no team, no Day Care, no items, not in the Pokédex', () => {
    const s = pickUpItem(fresh(), mtMoon.id, { entryId: helix.id, itemKey: 'helix-fossil', qty: 1 }, data, 1000, () => 'fossil')
    const f = getInstance(s, 'fossil')!
    expect(f).toMatchObject({ dex: 138, level: 20, revivesAt: 1000 + 24 * 3_600_000, fossil: 'helix-fossil' })
    expect(s.inventory['helix-fossil'] ?? 0).toBe(0)
    expect(s.pokedex).not.toContain(138)
    expect(swapIntoTeam(s, 'fossil', null, data).team).not.toContain('fossil')
    expect(setTeam(s, [...s.team, 'fossil'], data).team).not.toContain('fossil')
    expect(depositError(s, 'fossil', data)).toBe('fossil')
    expect(applyFieldItem({ ...s, inventory: { potion: 1 } }, 'potion', 'fossil', data, createRng(1))).toBeNull()

    // Not yet…
    expect(reviveFossils(s, data, 1000 + 23 * 3_600_000).revived).toEqual([])
    // …then revived: full HP, in the Pokédex, free to join.
    const r = reviveFossils(s, data, 1000 + 24 * 3_600_000)
    const mon = getInstance(r.save, 'fossil')!
    expect(r.revived).toHaveLength(1)
    expect(mon.revivesAt).toBeUndefined()
    expect(r.save.pokedex).toContain(138)
    expect(swapIntoTeam(r.save, 'fossil', null, data).team).toContain('fossil')
  })
})

describe('shiny fossils', () => {
  const day = 24 * 3_600_000
  const ids = Array.from({ length: 4000 }, (_, i) => `fossil-${i}`)
  const revived = (d: GameData, id: string, s: SaveData = fresh()) =>
    reviveFossils(addFossil(s, d.items['helix-fossil']!, d, 0, id), d, day).revived[0]!
  const shinyShare = (d: GameData, s?: SaveData) => ids.filter((id) => revived(d, id, s).shiny).length / ids.length

  it('revive shiny 1 in 10 by default, the roll fixed from the find', () => {
    expect(DEFAULT_CONFIG.fossilShinyChance).toBe(0.1)
    const share = shinyShare(data)
    expect(share).toBeGreaterThan(0.08)
    expect(share).toBeLessThan(0.12)
    // Reloading before the revived save is written rolls nothing again: the Pokémon's id decides.
    for (const id of ids.slice(0, 100)) expect(revived(data, id).shiny).toBe(revived(data, id).shiny)
    // Still reviving, it isn't shiny yet.
    expect(addFossil(fresh(), data.items['helix-fossil']!, data, 0, 'x').box.at(-1)!.shiny).toBeUndefined()
  })

  it("follow the admin's odds: never at 0, always at 1", () => {
    expect(shinyShare(makeData({ fossilShinyChance: 0 }))).toBe(0)
    expect(shinyShare(makeData({ fossilShinyChance: 1 }))).toBe(1)
  })

  it("aren't touched by the Shiny Charm", () => {
    const charmed = makeData({ shinyChance: 0.001, general: { ...DEFAULT_CONFIG.general, access: 'all', charmAccess: 'all' } })
    const maxed: SaveData = { ...fresh(), general: { charm: 10 } }
    expect(wildShinyChance(maxed, charmed)).toBeGreaterThan(0.001)
    expect(shinyShare(charmed, maxed)).toBe(shinyShare(charmed))
  })

  it('never in Extreme mode', () => {
    const extreme: SaveData = { ...fresh(), mode: 'extreme' }
    expect(shinyShare(makeData({ fossilShinyChance: 1 }), extreme)).toBe(0)
  })
})
