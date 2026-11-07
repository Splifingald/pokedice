// Real-player battles in areas (docs/54): the switch and where the card is dealt, the cards among the round's last
// ones and only with a team waiting, the team turned into a trainer's fight (their upgrades, no talents drawn), the ×1.5
// on each K.O.'s ₽, and the server's answer checked.
import { describe, expect, it } from 'vitest'
import {
  applyVictory,
  areaVersusConfig,
  areaVersusHere,
  buildDeck,
  createRng,
  dealTalents,
  foeEncounter,
  foeLevels,
  foePrize,
  isPlayerFoe,
  matchFoe,
  newSave,
  nextEncounter,
  parseAreaFoe,
  placeVersusCards,
  progressOf,
  runCampaignSync,
  teamAverageLevel,
  trainerGoldFor,
  withVersusCards,
  type Area,
  type AreaFoe,
  type DeckCard,
  type EncounterContext,
  type GameData,
  type SaveData,
} from '@/engine'
import { makeData, newId } from '../fixtures'

const on = makeData({
  areaVersus: { access: 'all' },
  hiddenTalents: { access: 'all', wildChance: 1, evolveChance: 0.3, families: {} },
})
const off = makeData()
const ROUTE3 = on.areas.find((a) => a.name === 'Route 3')!
const VICTORY = on.areas.find((a) => a.regionId === 'kanto' && /victory road/i.test(a.name))!
const PEWTER = on.areas.find((a) => a.gyms.length && a.regionId === 'kanto')!

const foe: AreaFoe = {
  id: '00000000-0000-4000-8000-000000000002',
  name: 'Misty',
  avatar: 'kanto/lass',
  playedAt: Date.now() - 2 * 86_400_000,
  team: [
    { dex: 25, level: 18 },
    { dex: 16, level: 15, shiny: true, talent: true },
  ],
  comboLevels: { pair: 3 },
  dieLevels: { fire: 4 },
}

const save = (): SaveData => newSave(1, on, 0, newId)
const ctx = (s: SaveData, area: Area, d: GameData, versusFoe: AreaFoe | null): EncounterContext => ({
  area,
  progress: progressOf(s, area.id),
  data: d,
  teamAvgLevel: teamAverageLevel(s),
  teamHurt: false,
  teamFainted: false,
  isFirstInArea: false,
  pokedex: s.pokedex,
  versusFoe,
})

describe('the switch and the areas', () => {
  it('meets real players only with the switch on, in an area that deals the card, never in Extreme mode', () => {
    expect(ROUTE3.encounterWeights.versus).toBe(1)
    expect(VICTORY.encounterWeights.versus).toBe(2)
    expect(PEWTER.encounterWeights.versus ?? 0).toBe(0)
    expect(areaVersusHere(save(), ROUTE3, on)).toBe(true)
    expect(areaVersusHere(save(), ROUTE3, off)).toBe(false)
    expect(areaVersusHere(save(), PEWTER, on)).toBe(false)
    expect(areaVersusHere({ ...save(), mode: 'extreme' }, ROUTE3, on)).toBe(false)
  })

  it('reads the admin’s numbers over the defaults, an odd one keeping its default', () => {
    expect(areaVersusConfig(off)).toEqual({
      access: 'off',
      prizeMultiplier: 1.5,
      recentDays: 14,
      requestDays: 30,
      lastCards: 3,
      levelMatchAccess: 'off',
      levelMargin: 1,
    })
    const d = makeData({ areaVersus: { access: 'admin', prizeMultiplier: 2, recentDays: -3 as number } })
    expect(areaVersusConfig(d)).toMatchObject({ access: 'admin', prizeMultiplier: 2, recentDays: 14 })
  })
})

describe('the deck', () => {
  it('puts the cards among the round’s last ones, the others in their order', () => {
    const order: DeckCard[] = ['wild', 'trainer', 'center', 'wild', 'item', 'wild']
    for (let seed = 1; seed < 60; seed++) {
      const one = placeVersusCards(order, 1, 3, createRng(seed))
      expect(one).toHaveLength(7)
      expect(one.indexOf('versus')).toBeGreaterThanOrEqual(4)
      expect(one.filter((c) => c !== 'versus')).toEqual(order)
      const two = placeVersusCards(order, 2, 3, createRng(seed))
      expect(two.filter((c) => c === 'versus')).toHaveLength(2)
      expect(two.slice(0, 5).filter((c) => c === 'versus')).toEqual([])
    }
    expect(placeVersusCards(order, 0, 3, createRng(1))).toEqual(order)
  })

  it('deals the card only with a team waiting, among the last 3 drawn', () => {
    for (let seed = 1; seed < 30; seed++) {
      const deck = buildDeck(ROUTE3, on, createRng(seed), [], { foe: true })
      // Drawn from the end: the round's last cards are the array's first.
      expect(deck.indexOf('versus')).toBeGreaterThanOrEqual(0)
      expect(deck.indexOf('versus')).toBeLessThan(3)
      expect(buildDeck(ROUTE3, on, createRng(seed)).includes('versus')).toBe(false)
      expect(
        buildDeck(VICTORY, on, createRng(seed), [], { foe: true }).filter((c) => c === 'versus'),
      ).toHaveLength(2)
    }
  })

  it('turns the card over as the real player’s fight; without a team, sets it aside', () => {
    const s = save()
    const withCard = {
      ...s,
      areaProgress: {
        ...s.areaProgress,
        [ROUTE3.id]: { ...progressOf(s, ROUTE3.id), deck: ['wild', 'versus'] as DeckCard[], drawn: [] },
      },
    }
    const met = nextEncounter(ctx(withCard, ROUTE3, on, foe), createRng(3)).encounter
    expect(isPlayerFoe(met)).toBe(true)
    expect(met).toMatchObject({ kind: 'trainer', name: 'Misty', player: { id: foe.id } })
    const without = nextEncounter(ctx(withCard, ROUTE3, on, null), createRng(3)).encounter
    expect(isPlayerFoe(without)).toBe(false)
  })
})

describe('a round dealt before the team arrived', () => {
  const dealt = (deck: DeckCard[], drawn: DeckCard[] = []) => {
    const s = save()
    return {
      ...s,
      areaProgress: { ...s.areaProgress, [ROUTE3.id]: { ...progressOf(s, ROUTE3.id), deck, drawn } },
    }
  }
  it('gets its card among its last ones', () => {
    const s = dealt(['wild', 'trainer', 'wild', 'item', 'wild'])
    const next = withVersusCards(s, ROUTE3, on, createRng(4))
    const deck = next.areaProgress[ROUTE3.id]!.deck!
    expect(deck).toHaveLength(6)
    expect(deck.indexOf('versus')).toBeLessThan(3)
  })
  it('never twice, nor with the switch off, nor in an area without the card', () => {
    const met = dealt(['wild', 'wild'], ['versus'])
    expect(withVersusCards(met, ROUTE3, on, createRng(1))).toBe(met)
    const has = dealt(['versus', 'wild'])
    expect(withVersusCards(has, ROUTE3, on, createRng(1))).toBe(has)
    const s = dealt(['wild', 'wild'])
    expect(withVersusCards(s, ROUTE3, off, createRng(1))).toBe(s)
    expect(withVersusCards(s, PEWTER, on, createRng(1))).toBe(s)
  })
})

describe('the fight', () => {
  it('is their team as it was: their talents only while talents are on, nothing drawn', () => {
    const enc = foeEncounter(foe, on)!
    expect(enc.team).toEqual([
      { dex: 25, level: 18 },
      { dex: 16, level: 15, shiny: true, talent: true },
    ])
    expect(foeEncounter(foe, off)!.team[1]).toEqual({ dex: 16, level: 15, shiny: true })
    // The wild odds at 100 % would give every trainer's Pokémon one: not theirs.
    expect(dealTalents(enc, on, createRng(1))).toBe(enc)
    expect(foeEncounter({ ...foe, team: [{ dex: 99999, level: 5 }] }, on)).toBeNull()
  })

  it('fights with their own upgrades', () => {
    expect(foeLevels(foe)).toEqual({ comboLevels: { pair: 3 }, dieLevels: { fire: 4 } })
  })

  it('pays ×1.5 a trainer’s ₽ for each K.O.', () => {
    const s = { ...save(), currentAreaId: ROUTE3.id }
    const fighter = s.team[0]!
    const plain = applyVictory(
      s,
      { areaId: ROUTE3.id, kind: 'trainer', enemyDex: 25, enemyLevel: 18, fighterUid: fighter },
      on,
      createRng(1),
      0,
      newId,
    )
    const real = applyVictory(
      s,
      {
        areaId: ROUTE3.id,
        kind: 'trainer',
        enemyDex: 25,
        enemyLevel: 18,
        fighterUid: fighter,
        goldMultiplier: 1.5,
      },
      on,
      createRng(1),
      0,
      newId,
    )
    const base = Math.round(trainerGoldFor(18, ROUTE3, false, on))
    expect(plain.save.gold - s.gold).toBe(base)
    expect(real.save.gold - s.gold).toBe(Math.round(base * 1.5))
    expect(foePrize(foe.team, ROUTE3, false, on)).toBe(
      Math.round(trainerGoldFor(18, ROUTE3, false, on) * 1.5) +
        Math.round(trainerGoldFor(15, ROUTE3, false, on) * 1.5),
    )
  })
})

describe('the level match', () => {
  const matched = makeData({ areaVersus: { access: 'all', levelMatchAccess: 'all' } })
  const strong: AreaFoe = {
    ...foe,
    team: [45, 42, 38, 30, 22].map((level) => ({ dex: 25, level })),
  }
  // Their best is 30 in the Box, 12 on the team: the Box counts.
  const at30 = (): SaveData => {
    const s = save()
    return {
      ...s,
      box: s.box
        .map((p, i) => ({ ...p, level: i ? 30 : 12 }))
        .concat({ ...s.box[0]!, id: 'boxed', level: 30 }),
    }
  }

  it('scales a stronger team by one ratio: their best at the player’s best +1, the proportions kept', () => {
    const m = matchFoe(strong, at30(), ROUTE3, matched)
    expect(m.team.map((p) => p.level)).toEqual([31, 29, 26, 21, 15])
    expect(foeEncounter(m, matched)!.team.map((p) => p.level)).toEqual([31, 29, 26, 21, 15])
  })

  it('fights with the area’s dice and combos, their levels kept within reach', () => {
    const m = matchFoe(foe, at30(), ROUTE3, matched)
    expect(m.team).toEqual(foe.team)
    const lv = ROUTE3.enemyUpgradeLevel ?? matched.config.enemyUpgradeLevel
    expect(Object.values(foeLevels(m).comboLevels).every((v) => v === lv)).toBe(true)
    expect(Object.values(foeLevels(m).dieLevels).every((v) => v === lv)).toBe(true)
  })

  it('takes back each evolution their new level stands below, not a stone’s', () => {
    const m = matchFoe(
      {
        ...foe,
        team: [
          { dex: 6, level: 60, shiny: true }, // Charizard at 31: below Charmeleon's 36
          { dex: 6, level: 28 }, // …at 14: below Charmander's 16 as well
          { dex: 3, level: 54 }, // Venusaur at 28: below Ivysaur's 32
          { dex: 25, level: 20 }, // Pikachu at 10: below its Pichu's 30
          { dex: 135, level: 40 }, // Jolteon: a stone's, no level to go by
        ],
      },
      at30(),
      ROUTE3,
      matched,
    )
    expect(m.team).toEqual([
      { dex: 5, level: 31, shiny: true },
      { dex: 4, level: 14 },
      { dex: 2, level: 28 },
      { dex: 172, level: 10 },
      { dex: 135, level: 21 },
    ])
    // A team within reach keeps its species, a Lv.20 Charizard included.
    expect(matchFoe({ ...foe, team: [{ dex: 6, level: 20 }] }, at30(), ROUTE3, matched).team).toEqual([
      { dex: 6, level: 20 },
    ])
  })

  it('takes the admin’s margin, and never goes below level 1', () => {
    const d = makeData({ areaVersus: { access: 'all', levelMatchAccess: 'all', levelMargin: 0 } })
    const s = { ...save(), box: save().box.map((p) => ({ ...p, level: 5 })) }
    const m = matchFoe(
      {
        ...foe,
        team: [
          { dex: 25, level: 100 },
          { dex: 16, level: 2 },
        ],
      },
      s,
      ROUTE3,
      d,
    )
    expect(m.team.map((p) => p.level)).toEqual([5, 1])
  })

  it('leaves the team as it was with its switch off, or real players off', () => {
    expect(matchFoe(strong, at30(), ROUTE3, on)).toBe(strong)
    expect(matchFoe(strong, at30(), ROUTE3, makeData({ areaVersus: { levelMatchAccess: 'all' } }))).toBe(
      strong,
    )
  })
})

describe('the server’s answer', () => {
  it('is checked: unknown species out, levels and upgrades kept to the game’s', () => {
    const f = parseAreaFoe(
      {
        id: foe.id,
        name: '  Misty  ',
        avatar: 'kanto/lass',
        friend: true,
        playedAt: '2026-10-29T10:00:00Z',
        team: [
          { dex: 25, level: 180, shiny: true },
          { dex: 99999, level: 5 },
          { dex: 16, level: 0, talent: true },
        ],
        levels: { combo: { pair: 99 }, dice: { fire: 'x' } },
      },
      on,
    )!
    expect(f).toMatchObject({
      id: foe.id,
      name: 'Misty',
      friend: true,
      playedAt: Date.parse('2026-10-29T10:00:00Z'),
    })
    expect(f.team).toEqual([
      { dex: 25, level: 100, shiny: true },
      { dex: 16, level: 1, talent: true },
    ])
    expect(f.dieLevels.fire).toBe(1)
    expect(f.comboLevels.pair).toBeGreaterThan(1)
    expect(parseAreaFoe(null, on)).toBeNull()
    expect(parseAreaFoe({ id: foe.id, team: [{ dex: 99999, level: 5 }] }, on)).toBeNull()
  })
})

describe('the simulator (pnpm area-versus-balance)', () => {
  it('deals and fights the card where an area has it, only with realPlayers set', () => {
    const run = (realPlayers: { levelShift: number } | null) =>
      runCampaignSync(on, {
        encounters: 60,
        seed: 3,
        starterDex: 4,
        spend: false,
        multiExp: true,
        areaId: ROUTE3.id,
        team: [{ dex: 6, level: 30 }],
        realPlayers,
      }).areas.find((a) => a.areaId === ROUTE3.id)!
    const without = run(null)
    expect(without.versus.fights).toBe(0)
    const met = run({ levelShift: 0 })
    expect(met.versus.fights).toBeGreaterThan(0)
    expect(met.versus.wins + met.versus.losses).toBe(met.versus.fights)
    expect(met.versus.xp).toBeGreaterThan(0)
    expect(met.xp).toBeGreaterThan(met.versus.xp)
  })
})
