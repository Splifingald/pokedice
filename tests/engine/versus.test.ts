import { describe, expect, it } from 'vitest'
import {
  battleOutcome,
  cloneForVersus,
  createRng,
  liveBlock,
  newSave,
  reduce,
  sameEvent,
  simulateVersus,
  uniformLevels,
  versusCandidates,
  versusMoveAt,
  versusReadyCount,
  versusUnlocked,
  VERSUS_LEVEL,
  type VersusSide,
} from '@/engine'
import { data } from '../fixtures'

const side = (dexes: number[], level = VERSUS_LEVEL): VersusSide => ({
  team: dexes.map((dex) => ({ dex, level, shiny: false })),
  levels: uniformLevels(0),
})

const MEWTWOS = side([150, 150, 150])
const MAGIKARPS = side([129, 129, 129])
const MIXED = side([6, 9, 3])

describe('Versus teams', () => {
  it('clones a Pokémon at Lv.50 at most, keeping its species and colours', () => {
    expect(cloneForVersus({ dex: 25, level: 87, shiny: true })).toEqual({ dex: 25, level: 50, shiny: true })
    expect(cloneForVersus({ dex: 25, level: 50 })).toEqual({ dex: 25, level: 50, shiny: false })
  })

  it('opens with three Pokémon at Lv.50 or more in the Box', () => {
    const save = newSave(1, data, 0, (() => {
      let i = 0
      return () => `id${i++}`
    })())
    const at = (level: number, extra = {}) => ({ id: `m${level}${Math.random()}`, dex: 25, level, xp: 0, currentHp: 1, caughtAt: 0, ...extra })
    const two = { ...save, box: [...save.box, at(50), at(64)] }
    expect(versusUnlocked(two, data)).toBe(false)
    const three = { ...two, box: [...two.box, at(55)] }
    expect(versusUnlocked(three, data)).toBe(true)
    expect(versusCandidates(three, data).map((p) => p.level)).toEqual([50, 64, 55])
    // A fossil still reviving doesn't count, nor a Pokémon under Lv.50.
    const fossil = { ...two, box: [...two.box, at(60, { revivesAt: Date.now() + 1e6 }), at(49)] }
    expect(versusUnlocked(fossil, data)).toBe(false)
    // Pokémon left behind in a region played before still count towards opening it (not towards the team).
    const parked = { ...two, parked: { kanto: { ...liveBlock(save), box: [at(70)] } } }
    expect(versusReadyCount(parked, data)).toBe(3)
    expect(versusUnlocked(parked, data)).toBe(true)
    expect(versusCandidates(parked, data)).toHaveLength(2)
  })
})

describe('simulateVersus', () => {
  it('is decided by the seed alone', () => {
    const a = simulateVersus(MIXED, side([65, 68, 94]), data, 1234)
    const b = simulateVersus(MIXED, side([65, 68, 94]), data, 1234)
    expect(b.winner).toBe(a.winner)
    expect(b.rounds.map((r) => r.steps.map((s) => s.event))).toEqual(a.rounds.map((r) => r.steps.map((s) => s.event)))
    expect(b.rounds.map((r) => r.steps.at(-1)?.state)).toEqual(a.rounds.map((r) => r.steps.at(-1)?.state))
  })

  it('the stronger team wins, whichever side it is on', () => {
    for (const seed of [1, 2, 3]) {
      expect(simulateVersus(MEWTWOS, MAGIKARPS, data, seed).winner).toBe('attacker')
      expect(simulateVersus(MAGIKARPS, MEWTWOS, data, seed).winner).toBe('defender')
    }
  })

  it("faces the defender's Pokémon one after the other, in their order", () => {
    const fight = simulateVersus(MEWTWOS, side([129, 25, 7]), data, 5)
    expect(fight.winner).toBe('attacker')
    expect(fight.rounds.map((r) => r.defenderIndex)).toEqual([0, 1, 2])
    expect(fight.rounds.map((r) => r.start.state.enemy.dex)).toEqual([129, 25, 7])
    for (const r of fight.rounds) expect(r.steps.at(-1)!.state.phase).toBe('won')
  })

  it("carries the attacker's HP from one battle to the next", () => {
    const fight = simulateVersus(MIXED, side([6, 9, 3]), data, 11)
    for (let i = 1; i < fight.rounds.length; i++) {
      const before = battleOutcome(fight.rounds[i - 1]!.steps.at(-1)!.state).hp
      const after = Object.fromEntries(fight.rounds[i]!.start.state.player.map((b) => [b.uid, b.hp]))
      expect(after).toEqual(before)
    }
  })

  it('sends the attacker out in their order', () => {
    const fight = simulateVersus(side([25, 6, 9]), MAGIKARPS, data, 3)
    const first = fight.rounds[0]!.start.state
    expect(first.player.map((b) => b.dex)).toEqual([25, 6, 9])
    expect(first.activeIndex).toBe(0)
  })

  it('ends as soon as the attacker has nobody left', () => {
    const fight = simulateVersus(MAGIKARPS, MEWTWOS, data, 8)
    expect(fight.winner).toBe('defender')
    const last = fight.rounds.at(-1)!.steps.at(-1)!.state
    expect(last.phase).toBe('lost')
    expect(last.player.every((b) => b.hp === 0)).toBe(true)
  })

  it("replays: each step is exactly what the engine does with the step's event", () => {
    const fight = simulateVersus(MIXED, side([65, 68, 94]), data, 77)
    // The battle's rolls come from the seed's stream, so re-running the recorded events reproduces every state.
    const rng = createRng(77)
    for (const round of fight.rounds) {
      let state = round.start.state
      for (const step of round.steps) {
        state = reduce(state, step.event, data, rng).state
        expect(state).toEqual(step.state)
      }
    }
  })

  it('hands the battle screen one auto move at a time', () => {
    const fight = simulateVersus(MIXED, MAGIKARPS, data, 21)
    const round = fight.rounds[0]!
    let cursor = 0
    let moves = 0
    while (cursor < round.steps.length) {
      const move = versusMoveAt(round, cursor)
      expect(move.length).toBeGreaterThan(0)
      // Every event of a move but the last is a die toggle.
      for (const e of move.slice(0, -1)) expect(e.t).toBe('TOGGLE_DIE')
      move.forEach((e, i) => expect(sameEvent(e, round.steps[cursor + i]!.event)).toBe(true))
      cursor += move.length
      moves++
    }
    expect(moves).toBeGreaterThan(1)
    expect(versusMoveAt(round, cursor)).toEqual([])
  })

  it('tells events apart the way the replay needs', () => {
    expect(sameEvent({ t: 'TOGGLE_DIE', i: 1 }, { t: 'TOGGLE_DIE', i: 2 })).toBe(false)
    expect(sameEvent({ t: 'SWITCH', instanceId: 'a1' }, { t: 'SWITCH', instanceId: 'a2' })).toBe(false)
    expect(sameEvent({ t: 'AI_TURN' }, { t: 'AI_TURN' })).toBe(true)
    expect(sameEvent({ t: 'ROLL' }, { t: 'ATTACK' })).toBe(false)
  })
})
