// The gentle foe (docs/46 §7): once the item tutorial has shown, foes on the set opening's area throw no die above 3
// until its first round is won, so a new player reaches Youngster Joey's ₽10 (and the dice tutorial) rather than a K.O.
import { describe, expect, it } from 'vitest'
import {
  capFoeThrow,
  createBattle,
  createRng,
  DEFAULT_CONFIG,
  dieValue,
  emptyProgress,
  faceOf,
  GENTLE_FOE_MAX,
  gentleFoeMax,
  newSave,
  reduce,
  rollAll,
  uniformLevels,
  type BattleState,
  type DieType,
  type LogEntry,
} from '@/engine'
import { makeData, newId } from '../fixtures'

const on = makeData({ openingRounds: { ...DEFAULT_CONFIG.openingRounds, access: 'all' } })
const off = makeData()
const ROUTE1 = DEFAULT_CONFIG.openingRounds.areaId

/** A new player past the item tutorial, on Route 1's first round. */
const player = () => ({
  ...newSave(4, on, 0, newId),
  rerollLesson: 'done' as const,
  itemLesson: 'done' as const,
})

describe('the gentle foe (docs/46 §7)', () => {
  it('caps the foe at 3 once the item tutorial has shown, on the opening area, until its first round is won', () => {
    const save = player()
    expect(gentleFoeMax(save, on, ROUTE1)).toBe(GENTLE_FOE_MAX)
    expect(GENTLE_FOE_MAX).toBe(3)
    // Not before the item tutorial, switched off, elsewhere, or once the round is won.
    expect(gentleFoeMax({ ...save, itemLesson: undefined }, on, ROUTE1)).toBeUndefined()
    expect(gentleFoeMax(save, off, ROUTE1)).toBeUndefined()
    expect(gentleFoeMax(save, on, 'elsewhere')).toBeUndefined()
    expect(gentleFoeMax(save, on, null)).toBeUndefined()
    const won = {
      ...save,
      areaProgress: { ...save.areaProgress, [ROUTE1]: { ...emptyProgress(), roundsDone: 1 } },
    }
    expect(gentleFoeMax(won, on, ROUTE1)).toBeUndefined()
  })

  it('lands every die above the cap on a plain face at or below it, and leaves the others', () => {
    const types = Object.keys(on.diceTypes) as DieType[]
    const rng = createRng(5)
    for (let n = 0; n < 200; n++) {
      const thrown = rollAll(types, on, rng)
      const capped = capFoeThrow(thrown, 3, on, rng)
      capped.forEach((d, i) => {
        const f = faceOf(d, on)
        const was = faceOf(thrown[i]!, on)
        const low = on.diceTypes[d.type].faces.some((x) => x.kind === 'number' && x.value <= 3)
        if (was.kind === 'number' && was.value <= 3) expect(d).toEqual(thrown[i])
        else if (low) expect(f.kind === 'number' && f.value <= 3, d.type).toBe(true)
      })
    }
  })

  it("keeps every one of the foe's throws and rerolls at 3 or below in a fight", () => {
    const fight = (foeDiceMax?: number) =>
      createBattle(
        {
          kind: 'trainer',
          team: [{ uid: 'me', dex: 1, level: 60, hp: Infinity }],
          enemy: { dex: 19, level: 40 },
          playerLevels: uniformLevels(1),
          enemyLevels: uniformLevels(1),
          foeDiceMax,
        },
        on,
      )
    const foeValues = (start: { state: BattleState; log: LogEntry[] }, seed: number) => {
      let s = start.state
      const rng = createRng(seed)
      const seen: number[] = []
      for (let i = 0; i < 400 && s.phase !== 'won' && s.phase !== 'lost'; i++) {
        const e = s.phase === 'player_roll' ? 'ROLL' : s.phase === 'player_reroll' ? 'ATTACK' : 'AI_TURN'
        const r = reduce(s, { t: e }, on, rng)
        for (const l of r.log)
          if ((l.kind === 'roll' || l.kind === 'reroll') && l.side === 'enemy')
            seen.push(...l.dice.map((d) => dieValue(d, on)))
        if (r.state === s) break
        s = r.state
      }
      return seen
    }
    const gentle = [1, 2, 3, 4, 5].flatMap((seed) => foeValues(fight(3), seed))
    expect(gentle.length).toBeGreaterThan(10)
    expect(Math.max(...gentle)).toBeLessThanOrEqual(3)
    // Without it the foe's dice go higher.
    const plain = [1, 2, 3, 4, 5].flatMap((seed) => foeValues(fight(), seed))
    expect(Math.max(...plain)).toBeGreaterThan(3)
  })
})
