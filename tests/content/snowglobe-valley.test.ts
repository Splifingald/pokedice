// Snowglobe Valley's content (docs/61 §3): the user's brief of 2026-11-01 holds in the data itself.
import { describe, expect, it } from 'vitest'
import {
  areaOpenAt,
  compileGameData,
  evolutionsIn,
  isTradeEvolution,
  isLegendary,
  regionSpecies,
  smallWorlds,
  worldPrizes,
  worldProblems,
  DEFAULT_TRACKS,
  tracksModeOf,
  type GameData,
} from '@/engine'
import { BUNDLE } from '@/config/bundle'
import {
  AREAS,
  DATES,
  REGION_ID,
  STARTERS,
  WORLD_ID,
  snowglobe,
  withSnowglobe,
} from '../../scripts/content-snowglobe-valley'

const data: GameData = compileGameData(withSnowglobe(BUNDLE))
const h = snowglobe()
const typesOf = (dex: number) => {
  const s = data.species[dex]!
  return [s.type1, s.type2].filter(Boolean)
}
const areaMons = (a: (typeof h.areas)[number]) => [
  ...a.wildPool.map((w) => w.dex),
  ...[...a.trainerPool.map((p) => p.trainerId), ...a.gyms].flatMap((t) =>
    data.trainers[t]!.team.map((m) => m.dex),
  ),
]
const areaId = (name: string) => h.areas.find((a) => a.name === name)!.id
const PRIZES = [234, 225, 460, 483, 484, 493]

describe('Snowglobe Valley', () => {
  it('is a sound world for the admin, Ice ×1.2 and XP ×1.5', () => {
    const list = smallWorlds(data)
    const w = list.find((x) => x.id === WORLD_ID)!
    expect(worldProblems(list, w, data)).toEqual([])
    expect(w.boosters).toEqual([{ type: 'ice', multiplier: 1.2 }])
    expect(w.xpMultiplier).toBe(1.5)
    expect(w.starters).toEqual(STARTERS)
  })

  it('offers three starters with a plain three-stage line, evolving at about the same levels, none strong against Ice', () => {
    // The user's reviews (2026-11-01): fan favourites, none a game's own starter.
    expect(STARTERS.map((d) => data.species[d]!.name)).toEqual(['Mareep', 'Lillipup', 'Pikipek'])
    const ICE_BEATERS = ['fire', 'fighting', 'rock', 'steel']
    // Only the evolutions this world allows (a regional one, such as a Hisuian form, happens in its region alone).
    const evos = (dex: number) => evolutionsIn(data.species[dex]!.evolutions ?? [], REGION_ID)
    const levels = STARTERS.map((d) => {
      const line = [d]
      for (let e = evos(d); e.length; e = evos(line.at(-1)!)) {
        expect(e, data.species[line.at(-1)!]!.name).toHaveLength(1)
        // By level only: Kadabra, for one, evolves by trade here.
        expect(e[0]!.level, data.species[line.at(-1)!]!.name).toBeTruthy()
        expect(isTradeEvolution(data, line.at(-1)!, e[0]!.toDex)).toBe(false)
        line.push(e[0]!.toDex)
      }
      expect(line, data.species[d]!.name).toHaveLength(3)
      for (const x of line)
        expect(
          typesOf(x).filter((t) => ICE_BEATERS.includes(t!)),
          data.species[x]!.name,
        ).toEqual([])
      return line.slice(0, 2).map((x) => evos(x)[0]!.level!)
    })
    for (const i of [0, 1]) {
      const at = levels.map((l) => l[i]!)
      expect(Math.max(...at) - Math.min(...at), `stage ${i + 2}`).toBeLessThanOrEqual(4)
    }
  })

  it('lets every Pokémon of Moonlit Glade, Evergreen Hill and Crown Shrine be found on the road too', () => {
    // Their bosses close them once caught (the user's review), so nothing may be met only there.
    const road = compileGameData({
      ...withSnowglobe(BUNDLE),
      areas: withSnowglobe(BUNDLE).areas.filter((a) => !(a.regionId === REGION_ID && a.hidden)),
    })
    const onRoad = regionSpecies(road, REGION_ID)
    for (const name of ['Moonlit Glade', 'Evergreen Hill', 'Crown Shrine'])
      for (const w of h.areas.find((a) => a.name === name)!.wildPool)
        expect(onRoad.has(w.dex), `${name}: ${data.species[w.dex]!.name}`).toBe(true)
  })

  it('puts every type among the Hall of Origin’s Pokémon (the user’s review)', () => {
    const hall = h.areas.find((a) => a.name === 'Hall of Origin')!
    const types = new Set(hall.wildPool.flatMap((w) => typesOf(w.dex)))
    expect([...types].sort()).toEqual([
      'bug',
      'dark',
      'dragon',
      'electric',
      'fairy',
      'fighting',
      'fire',
      'flying',
      'ghost',
      'grass',
      'ground',
      'ice',
      'normal',
      'poison',
      'psychic',
      'rock',
      'steel',
      'water',
    ])
  })

  it('has no Houndour line (the user: it led Haunted Hollow’s picks)', () => {
    expect([228, 229].filter((d) => regionSpecies(data, REGION_ID).has(d))).toEqual([])
  })

  it('makes Abomasnow the Champion’s ace: his last and strongest', () => {
    const league = h.areas.find((a) => a.name === 'Frost League')!
    const champ = data.trainers[league.gyms.at(-1)!]!
    expect(champ.role).toBe('champion')
    const top = Math.max(...champ.team.map((m) => m.level))
    expect(champ.team.at(-1)).toEqual({ dex: 460, level: top })
    expect(champ.team.filter((m) => m.level === top)).toHaveLength(1)
  })

  it('runs Sat 19 Dec 2026 → Sun 3 Jan 2027, exactly 15 days', () => {
    const w = h.world
    expect(new Date(w.start).getUTCDay()).toBe(6)
    expect(new Date(w.end).getUTCDay()).toBe(0)
    expect((Date.parse(w.end) - Date.parse(w.start)) / 86_400_000).toBe(15)
  })

  it('opens Evergreen Hill on Christmas Eve, Spear Pillar on Christmas Day and the Hall of Origin on New Year’s Day', () => {
    const before = (iso: string) => Date.parse(iso) - 1
    for (const [name, iso] of [
      ['Evergreen Hill', DATES.christmasEve],
      ['Spear Pillar', DATES.christmas],
      ['Hall of Origin', DATES.newYear],
    ] as const) {
      expect(areaOpenAt(data, areaId(name), before(iso)), name).toBe(false)
      expect(areaOpenAt(data, areaId(name), Date.parse(iso)), name).toBe(true)
    }
    // Midnight in Paris: the dates the French community expects.
    expect(new Date(DATES.christmasEve).toLocaleString('en-GB', { timeZone: 'Europe/Paris' })).toBe(
      '24/12/2026, 00:00:00',
    )
    expect(new Date(DATES.newYear).toLocaleString('en-GB', { timeZone: 'Europe/Paris' })).toBe(
      '01/01/2027, 00:00:00',
    )
  })

  it('has 125 Pokémon to catch, all but its legendary prizes catchable before Spear Pillar and the Hall of Origin open', () => {
    const all = regionSpecies(data, REGION_ID)
    expect(all.size).toBe(125)
    const without = compileGameData({
      ...withSnowglobe(BUNDLE),
      areas: withSnowglobe(BUNDLE).areas.filter(
        (a) => a.name !== 'Spear Pillar' && a.name !== 'Hall of Origin',
      ),
    })
    const before = regionSpecies(without, REGION_ID)
    expect([...all].filter((d) => !before.has(d)).sort((a, b) => a - b)).toEqual([483, 484, 493])
  })

  it('gives shiny Stantler, Delibird, Abomasnow, Dialga, Palkia and Arceus as its prizes', () => {
    const w = smallWorlds(data).find((x) => x.id === WORLD_ID)!
    expect(worldPrizes(data, w).map((p) => p.dex)).toEqual(PRIZES)
  })

  it('holds an Ice type in every area', () => {
    for (const a of h.areas)
      expect(
        areaMons(a).some((d) => typesOf(d).includes('ice')),
        a.name,
      ).toBe(true)
  })

  it('sells every item its Pokémon evolve with', () => {
    const sold = new Set(h.world.shop.map((r) => r.key))
    for (const dex of regionSpecies(data, REGION_ID))
      for (const e of data.species[dex]!.evolutions ?? [])
        if (e.item && regionSpecies(data, REGION_ID).has(e.toDex))
          expect(sold, `${data.species[dex]!.name}: ${e.item}`).toContain(e.item)
  })

  it('meets a level-evolving species in the wild only below its evolution level', () => {
    for (const a of h.areas)
      for (const w of a.wildPool)
        for (const e of data.species[w.dex]!.evolutions ?? [])
          if (e.level != null && regionSpecies(data, REGION_ID).has(e.toDex))
            expect(w.maxLevel, `${a.name}: ${data.species[w.dex]!.name}`).toBeLessThan(e.level)
  })

  it('has no legendary or mythical but its prizes', () => {
    // The Egg groups' flag covers both (Arceus is a mythical).
    const met = h.areas.flatMap(areaMons)
    expect([...new Set(met.filter((d) => isLegendary(data, d)))]).toEqual([])
    for (const d of PRIZES) expect(isLegendary(data, d), `#${d}`).toBe(d >= 483)
  })

  it('deals 10 cards in every main area and 6 in a secret one, each with one item and one Center', () => {
    for (const a of h.areas) {
      const w = a.encounterWeights
      const total = w.wild + w.trainer + w.item + w.center + (w.casino ?? 0) + (w.trick ?? 0)
      if (a.name === 'Frost League') {
        expect(total).toBe(0)
        expect(a.gyms).toHaveLength(5)
        continue
      }
      expect([a.name, total]).toEqual([a.name, a.hidden ? 6 : 10])
      expect([w.item, w.center]).toEqual([1, 1])
    }
    expect(AREAS).toHaveLength(16)
  })

  it('opens its secret areas as the user set: 20 caught, Christmas Eve, 50 caught, the League then Christmas, 90 caught then New Year', () => {
    const secrets = h.areas.filter((a) => a.hidden)
    expect(secrets.map((a) => [a.name, a.unlockConditions, a.legendaryBoss])).toEqual([
      ['Moonlit Glade', [{ kind: 'pokedex', count: 20 }], [{ dex: 234, level: 30, shiny: true }]],
      ['Evergreen Hill', [], [{ dex: 225, level: 40, shiny: true }]],
      ['Crown Shrine', [{ kind: 'pokedex', count: 50 }], [{ dex: 460, level: 50, shiny: true }]],
      [
        'Spear Pillar',
        [{ kind: 'cleared', areaId: h.region.leagueAreaId }],
        [
          { dex: 483, level: 70, shiny: true, raid: true },
          { dex: 484, level: 70, shiny: true, raid: true },
        ],
      ],
      [
        'Hall of Origin',
        [{ kind: 'pokedex', count: 90 }],
        [{ dex: 493, level: 90, shiny: true, raid: true }],
      ],
    ])
  })

  it('plays Moonlit Glade as Tracks in the Snow (docs/61 §4.1) while its switch is on; the others have no mode yet', () => {
    const secrets = h.areas.filter((a) => a.hidden)
    expect(secrets.map((a) => [a.name, a.mode?.kind ?? null])).toEqual([
      ['Moonlit Glade', 'tracks'],
      ['Evergreen Hill', null],
      ['Crown Shrine', null],
      ['Spear Pillar', null],
      ['Hall of Origin', null],
    ])
    expect(secrets[0]!.mode).toEqual(DEFAULT_TRACKS)
    // The switch ships Off: the glade is a plain secret area until the admin turns it on.
    expect(tracksModeOf(secrets[0], data)).toBeNull()
  })
})
