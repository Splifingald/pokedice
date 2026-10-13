// Haunted Hollow's content (docs/26 §2): the rules the user set hold in the data itself.
import { describe, expect, it } from 'vitest'
import { compileGameData, regionSpecies, worldProblems, smallWorlds, type GameData } from '@/engine'
import { BUNDLE } from '@/config/bundle'
import { AREAS, REGION_ID, WORLD_ID, haunted, withHaunted } from '../../scripts/content-haunted-hollow'

const data: GameData = compileGameData(withHaunted(BUNDLE))
const h = haunted()
const typesOf = (dex: number) => {
  const s = data.species[dex]!
  return [s.type1, s.type2].filter(Boolean)
}
const areaMons = (a: (typeof h.areas)[number]) => [
  ...a.wildPool.map((w) => w.dex),
  ...a.trainerPool.flatMap((p) => data.trainers[p.trainerId]!.team.map((m) => m.dex)),
]

describe('Haunted Hollow', () => {
  it('is a sound world for the admin', () => {
    const list = smallWorlds(data)
    const w = list.find((x) => x.id === WORLD_ID)!
    expect(worldProblems(list, w, data)).toEqual([])
  })

  it('has 120 Pokémon to catch, and every one but Giratina can be caught before the Distortion World opens', () => {
    const all = regionSpecies(data, REGION_ID)
    expect(all.size).toBe(120)
    const without = compileGameData({
      ...withHaunted(BUNDLE),
      areas: withHaunted(BUNDLE).areas.filter((a) => !a.name.startsWith('Distortion')),
    })
    const before = regionSpecies(without, REGION_ID)
    expect([...all].filter((d) => !before.has(d))).toEqual([487])
  })

  it('has no Normal or Fighting type, wild or on a trainer', () => {
    const bad = h.areas.flatMap(areaMons).concat(h.trainers.flatMap((t) => t.team.map((m) => m.dex)))
    expect(bad.filter((d) => typesOf(d).some((t) => t === 'normal' || t === 'fighting'))).toEqual([])
  })

  it('has no Dark type before area 5', () => {
    const early = h.areas.filter((a) => !a.hidden).slice(0, 4)
    expect(early.flatMap(areaMons).filter((d) => typesOf(d).includes('dark'))).toEqual([])
  })

  it('deals 10 cards in every main area, a short deck in the secret ones, each with one item and one Center', () => {
    for (const a of h.areas) {
      const w = a.encounterWeights
      const total = w.wild + w.trainer + w.item + w.center + (w.casino ?? 0)
      if (a.name === 'Shadow Elite') {
        expect(total).toBe(0)
        expect(a.gyms).toHaveLength(5)
        continue
      }
      expect([a.name, total]).toEqual([a.name, a.hidden ? 6 : 10])
      expect([w.item, w.center]).toEqual([1, 1])
    }
    expect(AREAS).toHaveLength(16)
  })

  it('opens its secret areas as the user set: 20 and 50 caught, a Pokémon at Lv.60, the Elite beaten, all but Giratina', () => {
    const secrets = h.areas.filter((a) => a.hidden)
    expect(secrets.map((a) => [a.name, a.unlockConditions, a.legendaryBoss])).toEqual([
      ['Cemetery', [{ kind: 'pokedex', count: 20 }], [{ dex: 93, level: 30, shiny: true }]],
      ['Haunted House', [{ kind: 'pokedex', count: 50 }], [{ dex: 778, level: 40, shiny: true }]],
      ['Cavern', [{ kind: 'maxLevel', level: 60 }], [{ dex: 442, level: 50, shiny: true }]],
      [
        'Newmoon Island',
        [{ kind: 'cleared', areaId: h.region.leagueAreaId }],
        [{ dex: 491, level: 60, shiny: true, raid: true }],
      ],
      [
        'Distortion World',
        [{ kind: 'pokedex', count: 119 }],
        [{ dex: 487, level: 70, shiny: true, raid: true }],
      ],
    ])
  })
})
