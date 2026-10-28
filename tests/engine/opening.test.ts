import { describe, expect, it } from 'vitest'
import {
  applyVictory,
  applyWipe,
  createRng,
  DEFAULT_CONFIG,
  dueCenter,
  finishRound,
  linearAreas,
  newSave,
  nextEncounter,
  nextRoundSize,
  progressOf,
  recordDraws,
  starterFainted,
  teamAverageLevel,
  trainerPrize,
  type Encounter,
  type EncounterContext,
  type GameData,
  type SaveData,
} from '@/engine'
import { makeData, newId } from '../fixtures'

const on = makeData({ openingRounds: { ...DEFAULT_CONFIG.openingRounds, access: 'all' } })
const off = makeData()
const ROUTE1 = linearAreas(on)[0]!
const JOEY = DEFAULT_CONFIG.openingRounds.rounds[0]!.find((c) => c.kind === 'trainer')!

const ctx = (save: SaveData, d: GameData, over: Partial<EncounterContext> = {}): EncounterContext => ({
  area: ROUTE1,
  progress: progressOf(save, ROUTE1.id),
  data: d,
  teamAvgLevel: teamAverageLevel(save),
  teamHurt: false,
  teamFainted: false,
  isFirstInArea: false,
  pokedex: save.pokedex,
  ...over,
})

/** What a card is, in a few words: the order the test reads. */
const label = (e: Encounter): string =>
  e.kind === 'wild'
    ? `wild ${e.dex} Lv${e.level}`
    : e.kind === 'item'
      ? `item ${e.itemKey} ×${e.qty}`
      : e.kind === 'trainer'
        ? `trainer ${e.name} ₽${e.prize}`
        : e.kind === 'center'
          ? `center${e.reason ? ` (${e.reason})` : ''}`
          : e.kind

/** Meets `n` encounters as the game does: draw, record, then the round may count. */
function play(save: SaveData, d: GameData, n: number, over: Partial<EncounterContext> = {}, seed = 3) {
  const rng = createRng(seed)
  const met: Encounter[] = []
  for (let i = 0; i < n; i++) {
    const roll = nextEncounter(ctx(save, d, over), rng)
    save = finishRound(recordDraws(save, ROUTE1.id, roll), ROUTE1.id, d).save
    met.push(roll.encounter)
  }
  return { save, met }
}

describe("Route 1's set opening (docs/46)", () => {
  const start = () => newSave(1, on, 0, newId)

  it('deals the first round in its set order, ending with Youngster Joey', () => {
    const { save, met } = play(start(), on, 6)
    expect(met.map(label)).toEqual([
      'wild 19 Lv2',
      'wild 16 Lv2',
      'item poke-ball ×2',
      'center',
      'wild 19 Lv3',
      'trainer Youngster Joey ₽10',
    ])
    const joey = met[5]!
    expect(joey.kind === 'trainer' && joey.team.map((m) => [m.dex, m.level])).toEqual([[19, 4]])
    expect(progressOf(save, ROUTE1.id).roundsDone).toBe(1)
  })

  it('opens the second round with the usual Center, then its set cards; the area clears', () => {
    const first = play(start(), on, 6).save
    const { save, met } = play(first, on, 6)
    expect(met.map(label)).toEqual([
      'center (round)',
      'wild 16 Lv4',
      'wild 19 Lv3',
      'item potion ×1',
      'wild 43 Lv4',
      'wild 16 Lv5',
    ])
    expect(progressOf(save, ROUTE1.id)).toMatchObject({ roundsDone: 2, cleared: true })
  })

  it('shuffles the rounds after it, as before', () => {
    const two = play(play(start(), on, 6).save, on, 6).save
    expect(progressOf(two, ROUTE1.id).roundsDone).toBe(2)
    // The third round opens with its Pokémon Center, as every round does, and deals a shuffled deck.
    const third = play(two, on, 1)
    expect(third.met.map(label)).toEqual(['center (round)'])
    expect(progressOf(third.save, ROUTE1.id).opening).toBeUndefined()
    expect(progressOf(third.save, ROUTE1.id).deck).toHaveLength(5)
    expect(nextRoundSize(ROUTE1, progressOf(two, ROUTE1.id), on)).toBe(5) // Route 1's own deck
  })

  it('a wipe replays the round from its first card', () => {
    const mid = play(start(), on, 3).save
    const { met } = play(applyWipe(mid, ROUTE1.id, on), on, 2)
    expect(met.map(label)).toEqual(['wild 19 Lv2', 'wild 16 Lv2'])
  })

  it('the gauge counts the set round before it is dealt', () => {
    expect(nextRoundSize(ROUTE1, progressOf(start(), ROUTE1.id), on)).toBe(6)
    expect(nextRoundSize(ROUTE1, progressOf(start(), ROUTE1.id), off)).toBe(5)
  })

  it('switched off, Route 1 is shuffled from the start, and never deals Joey', () => {
    const { save, met } = play(newSave(1, off, 0, newId), off, 10)
    expect(met.some((e) => e.kind === 'trainer')).toBe(false)
    expect(progressOf(save, ROUTE1.id).opening).toBeUndefined()
  })

  it('switched on for the admin only, only the admin gets it', () => {
    const admin = makeData({ openingRounds: { ...DEFAULT_CONFIG.openingRounds, access: 'admin' } })
    expect(progressOf(play(start(), admin, 1).save, ROUTE1.id).opening).toBeUndefined() // a player: shuffled
    const viewer = { ...admin, viewer: { admin: true } } as GameData
    expect(play(start(), viewer, 2).met.map(label)).toEqual(['wild 19 Lv2', 'wild 16 Lv2'])
  })

  it("during the opening, the easy area's extra Center comes only for the starter's K.O.", () => {
    const save = start()
    expect(dueCenter(ctx(save, on, { teamFainted: true, starterFainted: false }))).toBeNull()
    expect(dueCenter(ctx(save, on, { teamFainted: true, starterFainted: true }))).toBe('fainted')
    // After it (or with it off), any K.O. sends one, as before: mid-round, the round's own Center already met.
    const midRound = (sv: SaveData): SaveData => ({
      ...sv,
      areaProgress: {
        ...sv.areaProgress,
        [ROUTE1.id]: { ...progressOf(sv, ROUTE1.id), deck: ['wild'], lastCenter: false },
      },
    })
    const after = midRound(play(play(save, on, 6).save, on, 6).save)
    expect(dueCenter(ctx(after, on, { teamFainted: true, starterFainted: false }))).toBe('fainted')
    expect(dueCenter(ctx(midRound(save), off, { teamFainted: true, starterFainted: false }))).toBe('fainted')
  })

  it('knows the starter: the Pokémon held longest, on the team and at 0 HP', () => {
    const save = start()
    const starter = save.box[0]!
    const caught = { ...starter, id: 'caught', caughtAt: starter.caughtAt + 1 }
    const both = { ...save, box: [caught, starter], team: [starter.id, caught.id] }
    expect(starterFainted(both)).toBe(false)
    expect(starterFainted({ ...both, box: [{ ...caught, currentHp: 0 }, starter] })).toBe(false)
    expect(starterFainted({ ...both, box: [caught, { ...starter, currentHp: 0 }] })).toBe(true)
  })
})

describe("a set trainer's prize", () => {
  const joey: Encounter = {
    kind: 'trainer',
    trainerId: 'joey',
    name: 'Youngster Joey',
    spriteUrl: null,
    team: [],
    prize: 10,
  }

  it('is all paid with the last K.O., nothing with the others; other foes pay as before', () => {
    expect(trainerPrize(joey, true)).toBe(10)
    expect(trainerPrize(joey, false)).toBe(0)
    expect(trainerPrize({ ...joey, prize: undefined }, true)).toBeUndefined()
    expect(trainerPrize({ kind: 'wild', dex: 19, level: 2, isNew: true }, true)).toBeUndefined()
  })

  it('pays its ₽ in place of the levels', () => {
    const save = newSave(1, on, 0, newId)
    const win = (prize?: number) =>
      applyVictory(
        save,
        { areaId: ROUTE1.id, kind: 'trainer', enemyDex: 19, enemyLevel: 4, fighterUid: save.team[0]!, prize },
        on,
        createRng(1),
        0,
        newId,
      )
    expect(win(10).save.gold - save.gold).toBe(10)
    expect(win(10).events).toContainEqual({ kind: 'gold', amount: 10 })
    expect(win(0).save.gold).toBe(save.gold)
    expect(win(0).events.some((e) => e.kind === 'gold')).toBe(false)
    expect(win().save.gold - save.gold).toBe(4) // Σ levels × 1 in the tests
  })

  it('Youngster Joey is in the bundle with his Rattata', () => {
    expect(JOEY.kind === 'trainer' && on.trainers[JOEY.trainerId]?.team).toEqual([{ dex: 19, level: 4 }])
  })
})
