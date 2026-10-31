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

  it('leaves the first throw alone, rigs the second, and the reroll of both dice lands a pair of 4s', () => {
    for (const starter of [1, 4, 7]) {
      let s = toThrow(firstFight(starter))
      expect(s.lesson).toEqual({ step: 'wait', throws: 1 })
      // The first throw is attacked with as it fell (the foe left standing, for the test's sake).
      s = { ...s, enemy: { ...s.enemy, hp: 99, maxHp: 99 } }
      s = reduce(s, { t: 'ATTACK' }, on, createRng(1)).state
      s = toThrow(s)
      expect(s.lesson?.step).toBe('reroll')
      expect(s.dice).toEqual(lessonBadRoll(activeBattler(s).dice, on))
      const left = activeBattler(s).rerollsLeft
      s = reduce(s, { t: 'TOGGLE_DIE', i: 0 }, on, createRng(1)).state
      s = reduce(s, { t: 'TOGGLE_DIE', i: 1 }, on, createRng(1)).state
      s = reduce(s, { t: 'REROLL' }, on, createRng(1)).state
      expect(values(s)).toEqual([4, 4])
      expect(s.dice.every((x) => faceOf(x, on).kind === 'number')).toBe(true)
      expect(activeBattler(s).rerollsLeft).toBe(left - 1)
      expect(s.lesson?.step).toBe('attack')
      s = reduce(s, { t: 'ATTACK' }, on, createRng(1)).state
      expect(s.lesson?.step).toBe('done')
      expect(s.lastDamage?.combo?.key).toBe('pair')
      expect(s.lastDamage?.final).toBe(10)
    }
  })

  it('once done, or in a fight without it, throws are left to chance', () => {
    const rng = () => createRng(42)
    const plain = toThrow(firstFight(4, on, false), rng())
    expect(plain.lesson).toBeUndefined()
    const withIt = toThrow(firstFight(4), rng())
    expect(withIt.dice).toEqual(plain.dice)
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
