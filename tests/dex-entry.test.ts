// A Pokédex entry only ever points at the region being played.
import { describe, expect, it } from 'vitest'
import { compileGameData, regionOfArea, type Area, type Region } from '@/engine'
import { whereToFind } from '@/components/DexEntry'
import { BUNDLE } from '@/config/bundle'

/** Kanto's areas, re-badged into a second region, so both regions hold the same wild pools. */
function twoRegions() {
  const kanto = (BUNDLE.areas as Area[]).filter((a) => (a.regionId ?? 'kanto') === 'kanto')
  const johto = kanto.map((a) => ({ ...a, id: `j-${a.id}`, regionId: 'johto', orderIndex: a.orderIndex + 1000, unlockConditions: null }))
  const regions: Region[] = [
    { id: 'kanto', name: 'Kanto', orderIndex: 0, dexRange: [1, 151], starters: [1, 4, 7], starterLevel: 5, leagueAreaId: kanto[0]!.id, nextRegion: 'johto', enabled: true },
    { id: 'johto', name: 'Johto', orderIndex: 1, dexRange: [152, 251], starters: [152], starterLevel: 5, leagueAreaId: `j-${kanto[0]!.id}`, nextRegion: null, enabled: true },
  ]
  return compileGameData({ ...BUNDLE, areas: [...kanto, ...johto], regions })
}

const data = twoRegions()
/** A species that is wild somewhere in Kanto, so it is wild in both regions of this fixture. */
const wildDex = data.areas.find((a) => a.wildPool.some((w) => w.weight > 0))!.wildPool.find((w) => w.weight > 0)!.dex

describe('whereToFind', () => {
  it('lists only the areas of the region being played', () => {
    const inKanto = whereToFind(wildDex, data, 'kanto')
    const inJohto = whereToFind(wildDex, data, 'johto')
    expect(inKanto.length).toBeGreaterThan(0)
    expect(inJohto.length).toBeGreaterThan(0)
    expect(inKanto.every((s) => regionOfArea(s.area) === 'kanto')).toBe(true)
    expect(inJohto.every((s) => regionOfArea(s.area) === 'johto')).toBe(true)
    // The two never overlap — which is the bug this pins: one list used to hold both.
    expect(inKanto.map((s) => s.area.id).some((id) => inJohto.some((s) => s.area.id === id))).toBe(false)
  })

  it('says nothing at all about a species only the other region holds', () => {
    // Strip the species from Kanto's pools, leaving it in Johto's.
    const stripped = compileGameData({
      ...BUNDLE,
      areas: [
        ...(BUNDLE.areas as Area[])
          .filter((a) => (a.regionId ?? 'kanto') === 'kanto')
          .map((a) => ({ ...a, wildPool: a.wildPool.filter((w) => w.dex !== wildDex), legendaryBoss: null })),
        ...data.areas.filter((a) => regionOfArea(a) === 'johto'),
      ] as Area[],
      regions: data.regions,
    })
    expect(whereToFind(wildDex, stripped, 'kanto')).toEqual([])
    expect(whereToFind(wildDex, stripped, 'johto').length).toBeGreaterThan(0)
  })
})
