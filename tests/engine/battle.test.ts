import { describe, expect, it } from 'vitest'
import {
  activeBattler,
  battleOutcome,
  createBattle,
  createRng,
  reduce,
  simulateBattle,
  simulateMany,
  turnsToKill,
  uniformLevels,
  autoStep,
  makeBattler,
  type BattleState,
} from '@/engine'
import { data, die } from '../fixtures'

function start(kind: 'wild' | 'trainer' = 'wild', enemy = { dex: 19, level: 5 }) {
  return createBattle(
    {
      kind,
      team: [
        { uid: 'a', dex: 7, level: 10, hp: 999 },
        { uid: 'b', dex: 1, level: 10, hp: 999 },
        { uid: 'c', dex: 4, level: 10, hp: 0 },
      ],
      leadUid: 'a',
      enemy,
      playerLevels: uniformLevels(1),
      enemyLevels: uniformLevels(1),
    },
    data,
  )
}

/** Force a state where it is the player's reroll phase with a known roll. */
function atReroll(s: BattleState, dice = [die('water', 3), die('base', 2)]): BattleState {
  return { ...s, phase: 'player_reroll', actor: 'player', dice, selected: dice.map(() => false) }
}

describe('battle setup', () => {
  it('speed decides who acts first; ties go to the player', () => {
    // Squirtle (43) vs Rattata (72): Rattata is faster
    expect(start().log[0]).toEqual({ kind: 'start', first: 'enemy' })
    expect(start().state.phase).toBe('enemy_turn')
    // Squirtle vs Geodude (20): Squirtle first
    expect(start('wild', { dex: 74, level: 5 }).state.phase).toBe('player_roll')
    const tie = createBattle(
      {
        kind: 'wild',
        team: [{ uid: 'a', dex: 7, level: 5, hp: 99 }],
        enemy: { dex: 7, level: 5 },
        playerLevels: uniformLevels(1),
        enemyLevels: uniformLevels(1),
      },
      data,
    )
    expect(tie.state.actor).toBe('player')
  })

  it('skips a fainted lead and refuses a team with nobody able', () => {
    const s = createBattle(
      {
        kind: 'wild',
        team: [
          { uid: 'x', dex: 7, level: 5, hp: 0 },
          { uid: 'y', dex: 1, level: 5, hp: 10 },
        ],
        leadUid: 'x',
        enemy: { dex: 74, level: 3 },
        playerLevels: uniformLevels(1),
        enemyLevels: uniformLevels(1),
      },
      data,
    )
    expect(activeBattler(s.state).uid).toBe('y')
    expect(() =>
      createBattle(
        {
          kind: 'wild',
          team: [{ uid: 'x', dex: 7, level: 5, hp: 0 }],
          enemy: { dex: 74, level: 3 },
          playerLevels: uniformLevels(1),
          enemyLevels: uniformLevels(1),
        },
        data,
      ),
    ).toThrow()
  })

  it('each battler enters with rerolls = its rerolls stat', () => {
    const b = makeBattler({ uid: 'z', dex: 6, level: 36, hp: 10 }, data)
    expect(b.rerolls).toBe(5)
    expect(b.rerollsLeft).toBe(5)
    expect(b.dice).toHaveLength(5)
  })
})

describe('rerolls', () => {
  it('one press = one reroll, however many dice were selected', () => {
    let s = atReroll(start('wild', { dex: 74, level: 5 }).state)
    const rng = createRng(5)
    s = reduce(s, { t: 'TOGGLE_DIE', i: 0 }, data, rng).state
    s = reduce(s, { t: 'TOGGLE_DIE', i: 1 }, data, rng).state
    const before = activeBattler(s).rerollsLeft
    const r = reduce(s, { t: 'REROLL' }, data, rng)
    expect(activeBattler(r.state).rerollsLeft).toBe(before - 1)
    expect(r.state.selected).toEqual([false, false])
    expect(r.log[0]).toMatchObject({ kind: 'reroll', mask: [true, true] })
  })

  it('rerolling with nothing selected is a no-op and costs nothing', () => {
    const s = atReroll(start('wild', { dex: 74, level: 5 }).state)
    const r = reduce(s, { t: 'REROLL' }, data, createRng(1))
    expect(r.state).toBe(s)
    expect(r.log).toEqual([])
  })

  it('the budget is spent over the whole battle, not per turn', () => {
    let s = atReroll(start('wild', { dex: 74, level: 5 }).state)
    const rng = createRng(9)
    const budget = activeBattler(s).rerollsLeft
    s = reduce(s, { t: 'TOGGLE_DIE', i: 0 }, data, rng).state
    s = reduce(s, { t: 'REROLL' }, data, rng).state
    s = reduce(s, { t: 'ATTACK' }, data, rng).state
    // enemy acts, then it's our turn again — the budget must not have reset
    while (s.phase === 'enemy_turn') s = reduce(s, { t: 'AI_TURN' }, data, rng).state
    expect(activeBattler(s).rerollsLeft).toBe(budget - 1)
  })

  it('cannot reroll with an empty budget', () => {
    const s = atReroll(start('wild', { dex: 74, level: 5 }).state)
    s.player[0]!.rerollsLeft = 0
    s.selected = [true, false]
    expect(reduce(s, { t: 'REROLL' }, data, createRng(1)).state).toBe(s)
  })
})

describe('turn flow', () => {
  it('ROLL throws every die of the active Pokémon', () => {
    const s = start('wild', { dex: 74, level: 5 }).state
    const r = reduce(s, { t: 'ROLL' }, data, createRng(2))
    expect(r.state.phase).toBe('player_reroll')
    expect(r.state.dice).toHaveLength(activeBattler(s).dice.length)
    expect(reduce(r.state, { t: 'ROLL' }, data, createRng(2)).state).toBe(r.state)
  })

  it('ignores out-of-phase events', () => {
    const s = start().state // enemy_turn
    expect(reduce(s, { t: 'ATTACK' }, data, createRng(1)).state).toBe(s)
    expect(reduce(s, { t: 'TOGGLE_DIE', i: 0 }, data, createRng(1)).state).toBe(s)
    expect(reduce(s, { t: 'USE_ITEM', key: 'potion' }, data, createRng(1)).state).toBe(s)
    const p = start('wild', { dex: 74, level: 5 }).state
    expect(reduce(p, { t: 'AI_TURN' }, data, createRng(1)).state).toBe(p)
  })

  it('a player K.O. prompts a free switch, then the turn passes', () => {
    let s = start().state // enemy acts first
    s.player[0]!.hp = 1
    const rng = createRng(4)
    s = reduce(s, { t: 'AI_TURN' }, data, rng).state
    expect(s.phase).toBe('player_switch')
    expect(reduce(s, { t: 'SWITCH', instanceId: 'c' }, data, rng).state).toBe(s) // fainted
    const r = reduce(s, { t: 'SWITCH', instanceId: 'b' }, data, rng)
    expect(r.log[0]).toEqual({ kind: 'switch', uid: 'b', free: true })
    expect(activeBattler(r.state).uid).toBe('b')
    expect(r.state.phase).toBe('player_roll')
    expect(r.state.participants).toEqual(['a', 'b'])
  })

  it('all three down → lost', () => {
    let s = start().state
    s.player[0]!.hp = 1
    s.player[1]!.hp = 0
    s = reduce(s, { t: 'AI_TURN' }, data, createRng(4)).state
    expect(s.phase).toBe('lost')
    expect(battleOutcome(s).result).toBe('lost')
  })

  it('a voluntary switch costs the turn', () => {
    const s = start('wild', { dex: 74, level: 5 }).state
    const r = reduce(s, { t: 'SWITCH', instanceId: 'b' }, data, createRng(1))
    expect(r.log[0]).toEqual({ kind: 'switch', uid: 'b', free: false })
    expect(r.state.phase).toBe('enemy_turn')
  })

  it('a voluntary switch is still allowed after the roll, and drops the dice', () => {
    const rolled = reduce(start('wild', { dex: 74, level: 5 }).state, { t: 'ROLL' }, data, createRng(1)).state
    expect(rolled.phase).toBe('player_reroll')
    const r = reduce(rolled, { t: 'SWITCH', instanceId: 'b' }, data, createRng(1))
    expect(r.log[0]).toEqual({ kind: 'switch', uid: 'b', free: false })
    expect(activeBattler(r.state).uid).toBe('b')
    expect(r.state.phase).toBe('enemy_turn')
    expect(r.state.dice).toEqual([])
  })

  it('items heal without ending the turn, one per turn, and cannot overheal or revive', () => {
    const s = start('wild', { dex: 74, level: 5 }).state
    s.player[0]!.hp = 5
    const r = reduce(s, { t: 'USE_ITEM', key: 'potion' }, data, createRng(1))
    expect(r.log[0]).toMatchObject({ kind: 'item', amount: 20, hpAfter: 25 })
    expect(r.state.phase).toBe('player_roll') // the turn goes on
    expect(r.state.itemUsedThisTurn).toBe(true)
    const again = { ...r.state, player: r.state.player.map((p, i) => (i === 0 ? { ...p, hp: 5 } : p)) }
    expect(reduce(again, { t: 'USE_ITEM', key: 'potion' }, data, createRng(1)).state).toBe(again) // one per turn
    const full = start('wild', { dex: 74, level: 5 }).state
    expect(reduce(full, { t: 'USE_ITEM', key: 'potion' }, data, createRng(1)).state).toBe(full)
    expect(reduce(full, { t: 'USE_ITEM', key: 'potion', targetUid: 'c' }, data, createRng(1)).state).toBe(full)
    expect(reduce(full, { t: 'USE_ITEM', key: 'nope' }, data, createRng(1)).state).toBe(full)
  })

  it('noEscape (the default) blocks RUN', () => {
    expect(data.config.noEscape).toBe(true)
    const w = start('wild', { dex: 74, level: 5 }).state
    expect(w.canRun).toBe(false)
    expect(reduce(w, { t: 'RUN' }, data, createRng(1)).state).toBe(w)
  })

  it('without noEscape, RUN works in wild battles only', () => {
    data.config.noEscape = false
    try {
      const w = start('wild', { dex: 74, level: 5 }).state
      const r = reduce(w, { t: 'RUN' }, data, createRng(1))
      expect(r.state.phase).toBe('fled')
      expect(r.log).toContainEqual({ kind: 'end', result: 'fled' })
      expect(reduce(r.state, { t: 'ROLL' }, data, createRng(1)).state).toBe(r.state)
      const t = start('trainer', { dex: 74, level: 5 }).state
      expect(reduce(t, { t: 'RUN' }, data, createRng(1)).state).toBe(t)
    } finally {
      data.config.noEscape = true
    }
  })

  it('winning reports the fighter and remaining HP', () => {
    const s = atReroll(start('wild', { dex: 74, level: 5 }).state)
    s.enemy.hp = 1
    const r = reduce(s, { t: 'ATTACK' }, data, createRng(1))
    const out = battleOutcome(r.state)
    expect(out.result).toBe('won')
    expect(out.fighterUid).toBe('a')
    expect(out.hp.a).toBe(activeBattler(s).hp)
    expect(r.log.map((l) => l.kind)).toEqual(['damage', 'faint', 'end'])
  })

  it('is deterministic under a fixed seed', () => {
    const run = (seed: number) => {
      const rng = createRng(seed)
      let s = start().state
      const kinds: string[] = []
      for (let i = 0; i < 200 && !['won', 'lost', 'fled'].includes(s.phase); i++) {
        const r = autoStep(s, data, rng)
        s = r.state
        kinds.push(...r.log.map((l) => (l.kind === 'damage' ? `d${l.amount}` : l.kind)))
      }
      return kinds.join(',')
    }
    expect(run(42)).toBe(run(42))
  })
})

describe('headless simulation', () => {
  it('simulates 1000 battles without throwing, every one terminating', () => {
    const rng = createRng(1234)
    let finished = 0
    for (let i = 0; i < 1000; i++) {
      const p = data.speciesList[rng.int(0, 150)]!
      const e = data.speciesList[rng.int(0, 150)]!
      const r = simulateBattle(
        { dex: p.dex, level: rng.int(5, 60) },
        { dex: e.dex, level: rng.int(5, 60) },
        uniformLevels(rng.int(1, 10)),
        uniformLevels(1),
        data,
        rng,
      )
      if (r.finished) finished++
    }
    expect(finished).toBe(1000)
  })

  it('two mutually-immune Pokémon end in a stalemate instead of looping forever', () => {
    // Rattata Lv.10 (2 Normal dice after its Lv.7 milestone) vs Gastly Lv.10 (2 Ghost dice): 0 damage both ways.
    const r = simulateBattle({ dex: 19, level: 10 }, { dex: 92, level: 10 }, uniformLevels(1), uniformLevels(1), data, createRng(1))
    expect(r.finished).toBe(true)
    expect(r.winner).toBe('draw')
    expect(r.turns).toBe(data.config.maxBattleTurns)
  })

  it('an even mirror match is roughly a coin flip', () => {
    const s = simulateMany({ dex: 6, level: 40 }, { dex: 6, level: 40 }, 1, 1, 300, data, 3)
    expect(s.winRate).toBeGreaterThan(0.3)
    expect(s.winRate).toBeLessThan(0.8)
    expect(s.medianTurns).toBeGreaterThan(1)
    expect(Object.values(s.histogram).reduce((a, b) => a + b, 0)).toBe(300)
  })

  it('reproduces the §2.3 turns-to-kill table with its per-roll methodology', () => {
    // Spec: Charizard L40 vs 124 HP → 4.1 at track 1, 1.3 at track 10.
    const t1 = turnsToKill({ dex: 6, level: 40 }, ['normal'], 124, 1, 600, data, 7, 'perRoll')
    const t10 = turnsToKill({ dex: 6, level: 40 }, ['normal'], 124, 10, 600, data, 7, 'perRoll')
    expect(t1).toBeGreaterThan(3.3)
    expect(t1).toBeLessThan(4.9)
    expect(t10).toBeGreaterThan(1)
    expect(t10).toBeLessThan(1.7)
    // Played out with the per-battle budget, fights are longer — and upgrades still pull them back.
    const real1 = turnsToKill({ dex: 6, level: 40 }, ['normal'], 124, 1, 200, data)
    const real10 = turnsToKill({ dex: 6, level: 40 }, ['normal'], 124, 10, 200, data)
    expect(real1).toBeGreaterThan(t1)
    expect(real10).toBeLessThan(real1 / 2)
  })
})
