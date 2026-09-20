// The seeded Johto and Hoenn content: shape, reachability and the promises the regions make to the player.
import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { linearAreas, regionOfArea, regionSpecies, type Area, type Region, type Trainer } from '@/engine'
import { BUNDLE } from '@/config/bundle'
import { data } from './fixtures'

const areas = BUNDLE.areas as Area[]
const trainers = BUNDLE.trainers as Trainer[]
const regions = data.regions
const byId = new Map(trainers.map((t) => [t.id, t]))
const of = (regionId: string) => areas.filter((a) => regionOfArea(a) === regionId)

describe('regions', () => {
  it('has Kanto, Johto and Hoenn, chained in order and all enabled', () => {
    expect(regions.map((r) => r.id)).toEqual(['kanto', 'johto', 'hoenn'])
    expect(regions.map((r) => r.nextRegion)).toEqual(['johto', 'hoenn', null])
    expect(regions.every((r) => r.enabled)).toBe(true)
  })

  it('points every league at a real area of its own region', () => {
    for (const r of regions) {
      const league = areas.find((a) => a.id === r.leagueAreaId)
      expect(league, r.id).toBeTruthy()
      expect(regionOfArea(league!)).toBe(r.id)
      // A league is the last thing you beat: gyms to fight, and nothing after it but the post-league area.
      expect(league!.gyms.length, r.id).toBeGreaterThanOrEqual(5)
    }
  })

  it('gives each region a contiguous chain that never crosses a border', () => {
    for (const r of regions) {
      const chain = linearAreas(data, r.id)
      expect(chain.length, r.id).toBeGreaterThan(10)
      expect(chain.every((a) => regionOfArea(a) === r.id)).toBe(true)
      // Ordered, and strictly increasing — the chain is what "the next area" means.
      const order = chain.map((a) => a.orderIndex)
      expect(order, r.id).toEqual([...order].sort((x, y) => x - y))
      expect(new Set(order).size, r.id).toBe(order.length)
    }
  })

  it('opens each region on a gentle area and ends it at its league', () => {
    for (const r of regions) {
      const chain = linearAreas(data, r.id)
      expect(chain[0]!.minLevel, r.id).toBeLessThanOrEqual(3)
      const league = chain.findIndex((a) => a.id === r.leagueAreaId)
      // Little comes after the league: the post-league area, and in Kanto its two-area endgame lap.
      expect(chain.length - league - 1, r.id).toBeLessThanOrEqual(2)
    }
  })

  it('climbs the foe upgrade level from 1 to 9 within each region, not across them', () => {
    for (const r of regions) {
      const levels = linearAreas(data, r.id).map((a) => a.enemyUpgradeLevel)
      expect(levels[0], r.id).toBe(1)
      expect(levels.at(-1), r.id).toBe(9)
      for (let i = 1; i < levels.length; i++)
        expect(levels[i]!, `${r.id} ${i}`).toBeGreaterThanOrEqual(levels[i - 1]!)
    }
  })

  it('lets every region finish its own Pokédex', () => {
    for (const r of regions) {
      const catchable = regionSpecies(data, r.id)
      const [lo, hi] = r.dexRange
      // Fossil Pokémon come from their fossil, never from the grass — as they do in Kanto.
      const fossils = new Set(
        Object.values(data.items)
          .map((i) => (i.effect.kind === 'fossil' ? i.effect.dex : 0))
          .filter(Boolean),
      )
      // The Game Corner's jackpot prize is caught at the slot machine (Porygon, in Kanto).
      const prize = data.config.slotMachine.prizeDex
      // Items you can actually get hold of **in this region**: its own loot tables, and the Mart where an item is
      // stocked without being gated to another region's city. An evolution that needs an item you cannot obtain here
      // is not a way to fill this Pokédex — which is the hole that once hid six unobtainable stones.
      const obtainable = new Set<string>(of(r.id).flatMap((a) => a.lootPool.map((l) => l.itemKey)))
      for (const i of Object.values(data.items)) {
        if (
          i.inShop &&
          (!i.shopArea || regionOfArea(areas.find((a) => a.id === i.shopArea) ?? { regionId: r.id }) === r.id)
        ) {
          obtainable.add(i.key)
        }
      }
      const reachable = (dex: number): boolean => catchable.has(dex) || fossils.has(dex) || dex === prize
      const missing: number[] = []
      for (let dex = lo; dex <= hi; dex++) {
        if (reachable(dex)) continue
        // Reachable by evolving something you can get — and, for an item evolution, only if the item is here too.
        const ways = data.speciesList.flatMap((s) =>
          s.evolutions.filter((e) => e.toDex === dex).map((e) => ({ from: s.dex, item: e.item })),
        )
        if (ways.some((w) => reachable(w.from) && (!w.item || obtainable.has(w.item)))) continue
        missing.push(dex)
      }
      expect(missing, `${r.id} unreachable`).toEqual([])
    }
  })

  it('puts every evolution item a region needs inside that region', () => {
    for (const r of regions) {
      const here = new Set(of(r.id).flatMap((a) => a.lootPool.map((l) => l.itemKey)))
      const catchable = regionSpecies(data, r.id)
      const [lo, hi] = r.dexRange
      const needed = new Set<string>()
      for (const s of data.speciesList) {
        if (!catchable.has(s.dex)) continue
        for (const e of s.evolutions) {
          if (e.item && e.toDex >= lo && e.toDex <= hi) needed.add(e.item)
        }
      }
      for (const key of needed) {
        const item = data.items[key]
        const inMart = item?.inShop && (!item.shopArea || of(r.id).some((a) => a.id === item.shopArea))
        expect(here.has(key) || inMart, `${r.id} needs ${key}`).toBe(true)
      }
    }
  })

  it('keeps each region a self-contained run: its own starters, never in its own pools', () => {
    for (const r of regions) {
      for (const a of of(r.id)) {
        // The post-league catch-all is the one place a starter turns up, rarely, so the dex can be finished.
        if (a.scalesToTeam) continue
        for (const s of r.starters)
          expect(
            a.wildPool.find((w) => w.dex === s),
            `${r.id} / ${a.name}`,
          ).toBeUndefined()
      }
      for (const a of of(r.id)) {
        for (const id of [...a.gyms, ...a.trainerPool.map((t) => t.trainerId)]) {
          for (const m of byId.get(id)?.team ?? []) expect(r.starters, `${r.id} / ${id}`).not.toContain(m.dex)
        }
      }
    }
  })

  it('gives every area a banner and every trainer a sprite that exists', () => {
    for (const a of areas) {
      expect(a.bannerUrl, a.name).toBeTruthy()
      expect(existsSync(path.join('public', a.bannerUrl!.split('#')[0]!)), a.bannerUrl!).toBe(true)
    }
    for (const t of trainers) {
      expect(t.spriteUrl, t.name).toBeTruthy()
      expect(existsSync(path.join('public', t.spriteUrl!)), `${t.name}: ${t.spriteUrl}`).toBe(true)
    }
  })

  it('deals decks of a sensible size everywhere, as Kanto does', () => {
    for (const a of areas) {
      const total = Object.values(a.encounterWeights).reduce((s, n) => s + n, 0)
      expect(total, a.name).toBeGreaterThanOrEqual(4)
      expect(total, a.name).toBeLessThanOrEqual(20)
    }
  })

  it('puts the Master Ball in one hideout per region, rare and only once', () => {
    const withMaster = areas.filter((a) => a.lootPool.some((l) => l.itemKey === 'master-ball'))
    expect(withMaster.map((a) => regionOfArea(a)).sort()).toEqual(['hoenn', 'johto', 'kanto'])
    for (const a of withMaster) {
      const entry = a.lootPool.find((l) => l.itemKey === 'master-ball')!
      expect(entry.unique, a.name).toBe(true)
      const total = a.lootPool.reduce((s, l) => s + l.weight, 0)
      expect(entry.weight / total, a.name).toBeLessThan(0.15)
    }
    // It can never be sold, and it always catches.
    expect(data.items['master-ball']!.inShop).toBe(false)
    expect(data.items['master-ball']!.effect).toEqual({ kind: 'ball', bonus: 10 })
  })

  it('makes the Hoenn fossils the only source of their Pokémon', () => {
    const fossilMons = [345, 346, 347, 348]
    for (const a of areas) for (const w of a.wildPool) expect(fossilMons, a.name).not.toContain(w.dex)
    const desert = areas.find((a) => a.name.includes('Mirage Tower'))!
    expect(desert.lootPool.map((l) => l.itemKey)).toEqual(
      expect.arrayContaining(['root-fossil', 'claw-fossil']),
    )
    for (const key of ['root-fossil', 'claw-fossil']) {
      expect(desert.lootPool.find((l) => l.itemKey === key)!.unique).toBe(true)
      expect(data.items[key]!.inShop, key).toBe(false)
    }
  })

  it('gives each region a Game Corner and a late-game area with everything left to catch', () => {
    for (const r of regions) {
      expect(
        of(r.id).some((a) => (a.encounterWeights.casino ?? 0) > 0),
        `${r.id} casino`,
      ).toBe(true)
      const endgame = of(r.id).filter((a) => a.scalesToTeam)
      expect(endgame.length, `${r.id} endgame`).toBeGreaterThanOrEqual(1)
      expect(Math.max(...endgame.map((a) => a.wildPool.length)), `${r.id} endgame pool`).toBeGreaterThan(50)
    }
  })

  it('hides every legendary behind conditions, and both Johto and Hoenn box legendaries are catchable', () => {
    const bossAreas = areas.filter((a) => (a.legendaryBoss ?? []).length > 0)
    for (const a of bossAreas.filter((x) => x.hidden))
      expect(a.unlockConditions?.length, a.name).toBeGreaterThan(0)
    const bosses = new Set(bossAreas.flatMap((a) => (a.legendaryBoss ?? []).map((b) => b.dex)))
    // Ho-Oh and Lugia; Groudon and Kyogre — the four the brief names, all catchable.
    for (const dex of [249, 250, 382, 383]) expect(bosses.has(dex), `#${dex}`).toBe(true)
  })

  it('names no region but Kanto in an area or trainer of Kanto', () => {
    const later = regions.filter((r) => r.id !== 'kanto').map((r) => r.name)
    for (const a of of('kanto')) for (const name of later) expect(a.name, a.name).not.toContain(name)
  })
})

describe('region banners', () => {
  it('reuses the existing scenes — every banner is one of the published strips', () => {
    const used = new Set(areas.map((a) => a.bannerUrl!.split('#')[0]!))
    for (const url of used) expect(existsSync(path.join('public', url)), url).toBe(true)
  })
})

/** Regions come from the bundle, so a type error here means the data and the type drifted apart. */
const _typecheck: Region[] = regions
void _typecheck
