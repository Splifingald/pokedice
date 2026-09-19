import { describe, expect, it } from 'vitest'
import {
  buildDeck,
  createRng,
  deckAbilities,
  centerWouldHelp,
  deckCounts,
  deckSize,
  hasFaintedMember,
  recordDraws,
  linearAreas,
  newSave,
  nextEncounter,
  progressOf,
  setAreaDeck,
  teamAverageLevel,
  type Area,
  type EncounterContext,
  type GameData,
  type SaveData,
} from '@/engine'
import { data, makeData, newId } from '../fixtures'

const ROUTE1 = linearAreas(data)[0]! // wild + Center, no trainers
const FOREST = data.areas.find((a) => a.name === 'Viridian Forest')!

const ctx = (save: SaveData, area: Area, over: Partial<EncounterContext> = {}, d: GameData = data): EncounterContext => ({
  area,
  progress: progressOf(save, area.id),
  data: d,
  teamAvgLevel: teamAverageLevel(save),
  teamHurt: false,
  teamFainted: false,
  isFirstInArea: false,
  pokedex: save.pokedex,
  ...over,
})

describe('deckCounts', () => {
  const both = { wild: true, trainer: true }

  it('an encounter weight is the number of copies of that card in the deck', () => {
    expect(deckCounts({ wild: 7, trainer: 2, center: 1 }, both)).toEqual({ wild: 7, trainer: 2, center: 1, item: 0, casino: 0 })
    expect(deckCounts({ wild: 5, trainer: 3, center: 1, item: 1 }, { ...both, item: true })).toEqual({ wild: 5, trainer: 3, center: 1, item: 1, casino: 0 })
    expect(deckCounts({ wild: 2.6, trainer: 0, center: 1 }, both)).toEqual({ wild: 3, trainer: 0, center: 1, item: 0, casino: 0 })
  })

  it('gives no cards to kinds the area cannot produce, and a lone Center to an empty deck', () => {
    expect(deckCounts({ wild: 6, trainer: 3, center: 1 }, { wild: true, trainer: false })).toEqual({ wild: 6, trainer: 0, center: 1, item: 0, casino: 0 })
    expect(deckCounts({ wild: 0, trainer: 0, center: 0 }, both)).toEqual({ wild: 0, trainer: 0, center: 1, item: 0, casino: 0 })
    expect(deckCounts({ wild: 8, center: 1, item: 1 }, both).item).toBe(0) // no loot table → no item cards
  })

  it('the bundled areas deal decks of a sensible size (tuned per area in admin)', () => {
    for (const a of data.areas.filter((x) => x.wildPool.length || x.trainerPool.length)) {
      expect(deckSize(a), a.name).toBeGreaterThanOrEqual(3)
      expect(deckSize(a), a.name).toBeLessThanOrEqual(20)
    }
  })
})

describe('encounter deck', () => {
  it('deals every deck with the exact mix, and hands back what is left to save', () => {
    let save = newSave(4, data, 0, newId)
    const rng = createRng(11)
    const counts = deckCounts(ROUTE1.encounterWeights, deckAbilities(ROUTE1))
    const size = counts.wild + counts.trainer + counts.center + counts.item
    const expected = Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 0))
    for (let d = 0; d < 5; d++) {
      const seen: Record<string, number> = {}
      for (let i = 0; i < size; i++) {
        const { encounter, deck } = nextEncounter(ctx(save, ROUTE1), rng)
        expect(deck).toHaveLength(size - 1 - i)
        save = setAreaDeck(save, ROUTE1.id, deck!)
        seen[encounter.kind] = (seen[encounter.kind] ?? 0) + 1
      }
      expect(seen).toEqual(expected)
    }
  })

  it('never goes more than two decks without a Center', () => {
    let save = newSave(4, data, 0, newId)
    const rng = createRng(3)
    let gap = 0
    let worst = 0
    for (let i = 0; i < 2000; i++) {
      const { encounter, deck } = nextEncounter(ctx(save, FOREST), rng)
      save = setAreaDeck(save, FOREST.id, deck!)
      if (encounter.kind === 'center') {
        worst = Math.max(worst, gap)
        gap = 0
      } else gap++
    }
    expect(worst).toBeLessThanOrEqual(2 * (deckSize(FOREST) - 1))
  })

  it('forced encounters do not use up a card', () => {
    const base = newSave(4, data, 0, newId)
    const hurt = { ...base, box: base.box.map((p) => ({ ...p, currentHp: 1 })) }
    expect(nextEncounter(ctx(hurt, ROUTE1, { isFirstInArea: true, teamHurt: true }), createRng(1))).toEqual({
      encounter: { kind: 'center', forced: true },
      deck: null,
      lootDeck: null,
    })
  })

  it('discards a stale card the area can no longer produce', () => {
    const save = setAreaDeck(newSave(4, data, 0, newId), ROUTE1.id, ['wild', 'trainer']) // Route 1 has no trainers
    const { encounter, deck } = nextEncounter(ctx(save, ROUTE1), createRng(2))
    expect(encounter.kind).toBe('wild')
    expect(deck).toEqual([])
  })

  it('random mode rolls independently and keeps no deck', () => {
    const rnd = makeData({ encounterMode: 'random' })
    const save = newSave(4, rnd, 0, newId)
    const r = nextEncounter(ctx(save, linearAreas(rnd)[0]!, {}, rnd), createRng(5))
    expect(r.deck).toBeNull()
    expect(['wild', 'center', 'item']).toContain(r.encounter.kind)
  })
})

describe('rounds', () => {
  it('a new round opens with a Pokémon Center when one would help, and records the cards met', () => {
    const base = newSave(4, data, 0, newId)
    let save: SaveData = { ...base, areaProgress: { ...base.areaProgress, [ROUTE1.id]: { ...progressOf(base, ROUTE1.id), xp: 17 } } }
    const rng = createRng(21)
    const first = nextEncounter(ctx(save, ROUTE1, { centerUseful: true }), rng)
    expect(first.encounter).toEqual({ kind: 'center', forced: true, reason: 'round' })
    expect(first.newRound).toBe(true)
    save = recordDraws(save, ROUTE1.id, first)
    const size = deckSize(ROUTE1)
    expect(progressOf(save, ROUTE1.id)).toMatchObject({ round: 1, drawn: [], roundStartXp: 17 }) // where a wipe returns
    expect(progressOf(save, ROUTE1.id).deck).toHaveLength(size) // the Center was outside the deck
    for (let i = 0; i < size; i++) save = recordDraws(save, ROUTE1.id, nextEncounter(ctx(save, ROUTE1, { centerUseful: true }), rng))
    expect(progressOf(save, ROUTE1.id).drawn).toHaveLength(size)
    expect(progressOf(save, ROUTE1.id).deck).toEqual([])
    // Round 2 opens with a Center again — unless it would do nothing, then the deck is dealt straight away.
    expect(nextEncounter(ctx(save, ROUTE1, { centerUseful: true }), rng).encounter).toMatchObject({ kind: 'center', reason: 'round' })
    const useless = nextEncounter(ctx(save, ROUTE1, { centerUseful: false }), rng)
    expect(useless.newRound).toBe(true)
    const after = progressOf(recordDraws(save, ROUTE1.id, useless), ROUTE1.id)
    expect(after.round).toBe(2)
    expect(after.drawn).toHaveLength(1)
  })

  it('knows when a Center would help: someone hurt, or a Pokémon in the Box', () => {
    const s = newSave(4, data, 0, newId)
    expect(centerWouldHelp(s, data)).toBe(false)
    expect(centerWouldHelp({ ...s, box: s.box.map((p) => ({ ...p, currentHp: 1 })) }, data)).toBe(true)
    const spare = { ...s.box[0]!, id: 'spare' }
    expect(centerWouldHelp({ ...s, box: [...s.box, spare] }, data)).toBe(true)
  })
})

describe('easy areas', () => {
  it('send a Center whenever a team member is K.O.', () => {
    const base = newSave(4, data, 0, newId)
    const ko = { ...base, box: base.box.map((p) => ({ ...p, currentHp: 0 })) }
    expect(hasFaintedMember(ko)).toBe(true)
    expect(hasFaintedMember(base)).toBe(false)
    const easy = { ...ROUTE1, easyMode: true }
    expect(nextEncounter(ctx(ko, easy, { teamFainted: true }), createRng(1))).toEqual({
      encounter: { kind: 'center', forced: true, reason: 'fainted' },
      deck: null,
      lootDeck: null,
    })
    // Not in a normal area, and not in an easy one while everybody stands.
    expect(nextEncounter(ctx(ko, { ...ROUTE1, easyMode: false }, { teamFainted: true }), createRng(1)).deck).not.toBeNull()
    expect(nextEncounter(ctx(base, easy), createRng(1)).deck).not.toBeNull()
  })
})

describe('never two Pokémon Centers in a row', () => {
  const CENTERY: Area = { ...ROUTE1, encounterWeights: { wild: 4, trainer: 0, center: 3, item: 0, casino: 0 } }

  it('deals decks with the Centers apart, and none on top when asked', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const deck = buildDeck(CENTERY, data, createRng(seed), [], { noCenterFirst: seed % 2 === 0 })
      expect(deck.filter((c) => c === 'center')).toHaveLength(3)
      for (let i = 1; i < deck.length; i++) expect(deck[i] === 'center' && deck[i - 1] === 'center', deck.join()).toBe(false)
      if (seed % 2 === 0) expect(deck.at(-1)).not.toBe('center') // drawn first
    }
  })

  it('holds across rounds, round-opening Centers and forced ones', () => {
    const rng = createRng(5)
    let save = newSave(4, data, 0, newId)
    let prev = ''
    for (let i = 0; i < 400; i++) {
      const roll = nextEncounter(
        ctx(save, CENTERY, { centerUseful: rng.next() < 0.7, teamHurt: rng.next() < 0.5, isFirstInArea: rng.next() < 0.2 }),
        rng,
      )
      const kind = roll.encounter.kind
      expect(prev === 'center' && kind === 'center', `encounter ${i}`).toBe(false)
      save = recordDraws(save, CENTERY.id, roll)
      prev = kind
    }
  })

  it('meets another card first when the top card is a Center right after one', () => {
    let save = newSave(4, data, 0, newId)
    save = setAreaDeck(save, ROUTE1.id, ['wild', 'center'])
    save = recordDraws(save, ROUTE1.id, { encounter: { kind: 'center' }, deck: null })
    const roll = nextEncounter(ctx(save, ROUTE1), createRng(3))
    expect(roll.encounter.kind).toBe('wild')
    expect(roll.deck).toEqual(['center'])
  })
})
