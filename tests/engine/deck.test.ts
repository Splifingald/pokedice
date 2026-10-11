import { describe, expect, it } from 'vitest'
import {
  buildDeck,
  createRng,
  deckAbilities,
  centerWouldHelp,
  deckCounts,
  deckSize,
  finishRound,
  hasFaintedMember,
  isAreaClosed,
  recordDraws,
  linearAreas,
  newSave,
  nextEncounter,
  pickUpItem,
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
    let save: SaveData = { ...base, areaProgress: { ...base.areaProgress, [ROUTE1.id]: { ...progressOf(base, ROUTE1.id), roundsDone: 1 } } }
    const rng = createRng(21)
    const first = nextEncounter(ctx(save, ROUTE1, { centerUseful: true }), rng)
    expect(first.encounter).toEqual({ kind: 'center', forced: true, reason: 'round' })
    expect(first.newRound).toBe(true)
    save = recordDraws(save, ROUTE1.id, first)
    const size = deckSize(ROUTE1)
    expect(progressOf(save, ROUTE1.id)).toMatchObject({ round: 1, drawn: [], roundCounted: false, roundsDone: 1 })
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

  it('a cleared area still opens with a Pokémon Center', () => {
    const base = newSave(4, data, 0, newId)
    const hurt = { ...base, box: base.box.map((p) => ({ ...p, currentHp: 1 })) }
    const cleared: SaveData = { ...hurt, areaProgress: { ...hurt.areaProgress, [ROUTE1.id]: { ...progressOf(hurt, ROUTE1.id), cleared: true } } }
    const roll = nextEncounter(ctx(cleared, ROUTE1, { centerUseful: true, teamHurt: true, isFirstInArea: true }), createRng(21))
    expect(roll.newRound).toBe(true)
    expect(roll.encounter).toMatchObject({ kind: 'center', forced: true, reason: 'round' })
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

describe('closed areas', () => {
  const LAIR = data.areas.find((a) => a.name === 'Fullmoon Island')! // Cresselia, nothing else
  const LAKES = data.areas.find((a) => a.name === 'The Lakes of Sinnoh')! // three legendaries, Centers and items
  const withProgress = (save: SaveData, area: Area, p: Partial<ReturnType<typeof progressOf>>): SaveData => ({
    ...save,
    areaProgress: { ...save.areaProgress, [area.id]: { ...progressOf(save, area.id), ...p } },
  })

  it('a deckless area closes once its legendaries are beaten and caught', () => {
    const save = newSave(4, data, 0, newId)
    const cresselia = LAIR.legendaryBoss![0]!.dex
    expect(isAreaClosed(save, LAIR.id, data)).toBe(false)
    const beaten = withProgress(save, LAIR, { bossesDefeated: [cresselia] })
    expect(isAreaClosed(beaten, LAIR.id, data)).toBe(false) // it fled the catch: it comes back
    expect(isAreaClosed({ ...beaten, pokedex: [...beaten.pokedex, cresselia] }, LAIR.id, data)).toBe(true)

    const dexes = LAKES.legendaryBoss!.map((b) => b.dex)
    const lakes = { ...withProgress(save, LAKES, { bossesDefeated: dexes.slice(1) }), pokedex: [...save.pokedex, ...dexes] }
    expect(isAreaClosed(lakes, LAKES.id, data)).toBe(false)
    expect(isAreaClosed(withProgress(lakes, LAKES, { bossesDefeated: dexes }), LAKES.id, data)).toBe(true)
  })

  it('an area with wild Pokémon or trainers never closes', () => {
    const save = withProgress(newSave(4, data, 0, newId), ROUTE1, { cleared: true, roundsDone: 99 })
    expect(isAreaClosed(save, ROUTE1.id, data)).toBe(false)
    const dex = LAIR.legendaryBoss![0]!.dex
    const lair: Area = { ...LAIR, wildPool: ROUTE1.wildPool, encounterWeights: { ...LAIR.encounterWeights, wild: 4 } }
    const d = { ...data, areas: data.areas.map((a) => (a.id === LAIR.id ? lair : a)) }
    const done = { ...withProgress(save, LAIR, { bossesDefeated: [dex] }), pokedex: [...save.pokedex, dex] }
    expect(isAreaClosed(done, LAIR.id, d)).toBe(false)
  })
})

describe('a legendary lair: mostly Centers and a few finds (Ultra Megalopolis, the Altar of the Sunne and Moone)', () => {
  const lairs = data.areas.filter((a) => a.name === 'Ultra Megalopolis' || a.name === 'The Altar of the Sunne and Moone')

  /** One encounter as the store plays it: settle the round, draw, note the draw, take a find. */
  const play = (save: SaveData, area: Area, rng: ReturnType<typeof createRng>) => {
    const settled = finishRound(save, area.id, data)
    const roll = nextEncounter(ctx(settled.save, area, { centerUseful: true }), rng)
    let next = recordDraws(settled.save, area.id, roll)
    if (roll.encounter.kind === 'item') next = pickUpItem(next, area.id, roll.encounter, data, 0)
    return { save: next, roll, roundDone: settled.roundDone }
  }

  it('turns over every card of the round, one at a time, and counts the round', () => {
    expect(lairs).toHaveLength(2)
    for (const area of lairs)
      for (let seed = 1; seed <= 40; seed++) {
        const rng = createRng(seed)
        let save = newSave(4, data, 0, newId)
        let seen = 0
        let rounds = 0
        // A round is one deck, plus the Center that may open it: it can't take more than that.
        for (let i = 0; i < 3 * (deckSize(area) + 1) && rounds < 2; i++) {
          const step = play(save, area, rng)
          if (step.roundDone) rounds++
          const drawn = progressOf(step.save, area.id).drawn?.length ?? 0
          // The gauge never jumps back mid-round: it only moves on, or starts over with a new deck.
          if (!step.roll.newRound) expect(drawn, `${area.name} seed ${seed} step ${i}`).toBeGreaterThanOrEqual(seen)
          else expect(seen === 0 || rounds > 0 || step.roundDone, `${area.name} seed ${seed} step ${i}: a new deck before the round was counted`).toBe(true)
          seen = drawn
          save = step.save
        }
        expect(rounds, `${area.name} seed ${seed}`).toBeGreaterThanOrEqual(1)
      }
  })
})

describe('Centers left on their own right after a Center', () => {
  const lair = data.areas.find((a) => a.name === 'Ultra Megalopolis')!

  it('are turned over at once: the round ends and counts (a forced Center before the last card of a deck)', () => {
    let save = newSave(4, data, 0, newId)
    save = setAreaDeck(save, ROUTE1.id, ['center'])
    save = recordDraws(save, ROUTE1.id, { encounter: { kind: 'center' }, deck: null })
    expect(progressOf(save, ROUTE1.id).deck).toEqual([])
    const settled = finishRound(save, ROUTE1.id, data)
    expect(settled.roundDone).toBe(true)
    expect(progressOf(settled.save, ROUTE1.id).roundsDone).toBe(1)
  })

  it('a save caught in the middle of a lair with only Centers left meets one, then the round counts', () => {
    let save = newSave(4, data, 0, newId)
    save = setAreaDeck(save, lair.id, ['center', 'center', 'center'])
    // Saved before the fix: the Centers were left in the deck after a Center.
    const p = progressOf(save, lair.id)
    save = { ...save, areaProgress: { ...save.areaProgress, [lair.id]: { ...p, lastCenter: true, drawn: ['item', 'center'] } } }
    const roll = nextEncounter(ctx(save, lair), createRng(1))
    expect(roll.newRound).toBeFalsy()
    expect(roll.encounter.kind).toBe('center')
    save = recordDraws(save, lair.id, roll)
    expect(finishRound(save, lair.id, data).roundDone).toBe(true)
  })
})

describe('every area', () => {
  it('never deals a new deck before the round in progress counted', () => {
    const broken: string[] = []
    for (const area of data.areas)
      for (let seed = 1; seed <= 3; seed++) {
        const rng = createRng(seed)
        let save = newSave(4, data, 0, newId)
        let seen = 0
        for (let i = 0; i < 3 * (deckSize(area) + 1); i++) {
          const settled = finishRound(save, area.id, data)
          const roll = nextEncounter(ctx(settled.save, area, { centerUseful: rng.next() < 0.5 }), rng)
          if (roll.newRound && seen > 0 && !settled.roundDone && !progressOf(settled.save, area.id).roundCounted)
            broken.push(`${area.name} (seed ${seed}, encounter ${i + 1})`)
          save = recordDraws(settled.save, area.id, roll)
          if (roll.encounter.kind === 'item') save = pickUpItem(save, area.id, roll.encounter, data, 0)
          seen = progressOf(save, area.id).drawn?.length ?? 0
        }
      }
    expect(broken.slice(0, 10)).toEqual([])
  })
})
