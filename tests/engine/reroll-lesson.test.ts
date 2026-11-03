// The reroll lesson (docs/46 §6): a new player's first fight rigs their second throw (the worst their dice can do) and
// the reroll that mends it (a pair of 4s), then lets the fight go on as any other.
import { describe, expect, it } from 'vitest'
import {
  activeBattler,
  applyVictory,
  createBattle,
  createRng,
  DEFAULT_CONFIG,
  detectCombos,
  dieValue,
  emptyProgress,
  faceOf,
  finishRerollLesson,
  lessonBadRoll,
  lessonPairValue,
  newSave,
  reduce,
  rerollLessonDue,
  uniformLevels,
  effectiveStats,
  type BattleState,
  type LogEntry,
  type GameData,
} from '@/engine'
import { makeData, newId } from '../fixtures'

const on = makeData({ openingRounds: { ...DEFAULT_CONFIG.openingRounds, access: 'all' } })
const off = makeData()
const ROUTE1 = DEFAULT_CONFIG.openingRounds.areaId
const STARTERS = [1, 4, 7, 152, 155, 158, 252, 255, 258, 387, 390, 393, 495, 498, 501]

/** The first fight: the starter at Lv.5 against Route 1's opening Rattata Lv.2. */
function firstFight(starter: number, d: GameData = on, rerollLesson = true) {
  return createBattle(
    {
      kind: 'wild',
      team: [{ uid: 'me', dex: starter, level: 5, hp: Infinity }],
      enemy: { dex: 19, level: 2 },
      playerLevels: uniformLevels(1),
      enemyLevels: uniformLevels(1),
      rerollLesson,
    },
    d,
  ).state
}

/** Plays the fight on until the player has a throw in hand: the foe's turns, the ROLL. */
function toThrow(s: BattleState, rng = createRng(7), d: GameData = on): BattleState {
  for (let i = 0; i < 50 && s.phase !== 'player_reroll' && s.phase !== 'won' && s.phase !== 'lost'; i++) {
    s = reduce(s, s.phase === 'player_roll' ? { t: 'ROLL' } : { t: 'AI_TURN' }, d, rng).state
  }
  return s
}

const values = (s: BattleState, d: GameData = on) => s.dice.map((x) => dieValue(x, d))

describe('the reroll lesson (docs/46 §6)', () => {
  it("rigs the worst throw each starter's dice can make: no combo, no status face, the lowest sum", () => {
    for (const dex of STARTERS) {
      const sp = on.species[dex]
      if (!sp) continue
      const dice = effectiveStats(sp, 5, on).dice
      const bad = lessonBadRoll(dice, on)
      const faces = bad.map((x) => faceOf(x, on))
      expect(
        faces.every((f) => f.kind === 'number'),
        sp.name,
      ).toBe(true)
      expect(detectCombos(faces.map((f) => f.value)), sp.name).toEqual([])
      // No plain throw without a combo sums less.
      const lows = dice.map((t) =>
        Math.min(...on.diceTypes[t].faces.filter((f) => f.kind === 'number').map((f) => f.value)),
      )
      expect(
        faces.reduce((n, f) => n + f.value, 0),
        sp.name,
      ).toBeLessThanOrEqual(lows.reduce((a, b) => a + b, 0) + 1)
      // Every starter's dice can pair on 4.
      expect(lessonPairValue(dice, on), sp.name).toBe(4)
    }
  })

  it('plays the first fight the same for every starter: an average hit, the bad throw, the pair that finishes Rattata', () => {
    for (const starter of STARTERS) {
      if (!on.species[starter]) continue
      const name = on.species[starter]!.name
      let s = firstFight(starter)
      const log: LogEntry[] = []
      const step = (e: Parameters<typeof reduce>[1], seed = 1) => {
        const r = reduce(s, e, on, createRng(seed))
        log.push(...r.log)
        s = r.state
      }
      const throwNow = () => {
        for (let i = 0; i < 20 && s.phase !== 'player_reroll' && s.phase !== 'won'; i++)
          step(s.phase === 'player_roll' ? { t: 'ROLL' } : { t: 'AI_TURN' }, i + 11)
      }
      // 1. An average hit: plain, and Rattata left standing within the pair's reach.
      throwNow()
      expect(s.lesson, name).toMatchObject({ step: 'wait', throws: 1 })
      const faces = s.dice.map((x) => faceOf(x, on))
      expect(
        faces.every((f) => f.kind === 'number'),
        name,
      ).toBe(true)
      expect(detectCombos(faces.map((f) => f.value)), name).toEqual([])
      step({ t: 'ATTACK' })
      const left = s.enemy.hp
      expect(left, name).toBeGreaterThan(0)
      expect(left, name).toBeLessThanOrEqual(10)
      // 2. The bad throw, mended by a reroll of both dice into a pair of 4s.
      throwNow()
      expect(s.lesson?.step, name).toBe('reroll')
      expect(s.dice, name).toEqual(lessonBadRoll(activeBattler(s).dice, on))
      const rerolls = activeBattler(s).rerollsLeft
      step({ t: 'TOGGLE_DIE', i: 0 })
      step({ t: 'TOGGLE_DIE', i: 1 })
      step({ t: 'REROLL' })
      expect(values(s), name).toEqual([4, 4])
      expect(activeBattler(s).rerollsLeft, name).toBe(rerolls - 1)
      expect(s.lesson?.step, name).toBe('attack')
      // 3. ATTACK: the pair's 10 finishes Rattata.
      step({ t: 'ATTACK' })
      expect(s.lesson?.step, name).toBe('done')
      expect(s.lastDamage?.combo?.key, name).toBe('pair')
      expect(s.lastDamage?.final, name).toBe(10)
      expect(s.phase, name).toBe('won')
      // Rattata threw a 2, then (if it had a second turn) a 1 rerolled into a 3.
      const shown = log.flatMap((l) =>
        (l.kind === 'roll' || l.kind === 'reroll') && l.side === 'enemy'
          ? [`${l.kind} ${l.dice.map((x) => dieValue(x, on)).join()}`]
          : [],
      )
      expect(['roll 2', 'roll 2,roll 1,reroll 3'], name).toContain(shown.join(','))
    }
  })

  it('a reroll of the first throw stays a hit Rattata survives and the pair finishes', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      let s = toThrow(firstFight(4), createRng(seed))
      s = reduce(s, { t: 'TOGGLE_DIE', i: 0 }, on, createRng(seed)).state
      s = reduce(s, { t: 'TOGGLE_DIE', i: 1 }, on, createRng(seed)).state
      s = reduce(s, { t: 'REROLL' }, on, createRng(seed)).state
      s = reduce(s, { t: 'ATTACK' }, on, createRng(seed)).state
      expect(s.enemy.hp).toBeGreaterThan(0)
      expect(s.enemy.hp).toBeLessThanOrEqual(10)
    }
  })

  it('in a fight without it, throws are left to chance', () => {
    const rng = () => createRng(42)
    const plain = toThrow(firstFight(4, on, false), rng())
    expect(plain.lesson).toBeUndefined()
    expect(plain.dice).toEqual(toThrow(firstFight(4, on, false), rng()).dice)
  })

  it('needs a reroll left: with none, the second throw falls as it may and the lesson waits for the next fight', () => {
    let s = toThrow(firstFight(4))
    s = { ...s, enemy: { ...s.enemy, hp: 99, maxHp: 99 } }
    s.player = s.player.map((b) => ({ ...b, rerollsLeft: 0 }))
    s = reduce(s, { t: 'ATTACK' }, on, createRng(1)).state
    s = toThrow(s)
    expect(s.lesson?.step).toBe('wait')
  })

  it("is due in a new player's first fights on Route 1, until it has played or the first round is won", () => {
    const fresh = { ...newSave(4, on, 0, newId), currentAreaId: ROUTE1 }
    expect(rerollLessonDue(fresh, on, ROUTE1)).toBe(true)
    expect(rerollLessonDue(fresh, off, ROUTE1)).toBe(false)
    expect(rerollLessonDue(fresh, on, 'some-other-area')).toBe(false)
    expect(rerollLessonDue(finishRerollLesson(fresh), on, ROUTE1)).toBe(false)
    expect(rerollLessonDue({ ...fresh, diceTutorial: 'done' }, on, ROUTE1)).toBe(false)
    const roundWon = {
      ...fresh,
      areaProgress: { ...fresh.areaProgress, [ROUTE1]: { ...emptyProgress(), roundsDone: 1 } },
    }
    expect(rerollLessonDue(roundWon, on, ROUTE1)).toBe(false)
    // A K.O. on the way doesn't end it: only its ATTACK does.
    const won = applyVictory(
      fresh,
      { areaId: ROUTE1, kind: 'wild', enemyDex: 19, enemyLevel: 2, fighterUid: fresh.team[0]! },
      on,
      createRng(1),
      0,
      newId,
    ).save
    expect(rerollLessonDue(won, on, ROUTE1)).toBe(true)
  })
})
