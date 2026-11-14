// Sudden death (docs/72): after 10 turns in a row that hurt nobody, every Pokémon loses 25 % of its max HP as each of
// its turns starts, so a stalled fight ends with a winner rather than at the turn cap. On for everyone, no switch.
import { describe, expect, it } from 'vitest'
import { createBattle, createRng, reduce, uniformLevels, type BattleState, type GameData, type LogEntry } from '@/engine'
import { data } from '../fixtures'

const d: GameData = { ...data, config: { ...data.config, maxBattleTurns: 60 } }

/**
 * A stall: your Gastly Lv.4 (a Ghost die and a base one) can't hurt the foe's Rattata nor can it hurt Gastly, but
 * Squirtle on the bench could, so the fight is no deadlock and goes on.
 */
function stall(d: GameData) {
  return createBattle(
    {
      kind: 'wild',
      team: [
        { uid: 'g', dex: 92, level: 4, hp: 999 },
        { uid: 's', dex: 7, level: 10, hp: 999 },
      ],
      leadUid: 'g',
      enemy: { dex: 19, level: 10 },
      playerLevels: uniformLevels(1),
      enemyLevels: uniformLevels(1),
    },
    d,
  )
}

/** Plays the fight out, your side throwing and attacking with what it rolled. */
function playOut(d: GameData, start = stall(d)) {
  const rng = createRng(7)
  let s: BattleState = start.state
  const log: LogEntry[] = [...start.log]
  for (let i = 0; i < 400 && !['won', 'lost', 'fled'].includes(s.phase); i++) {
    const e =
      s.phase === 'enemy_turn'
        ? ({ t: 'AI_TURN' } as const)
        : s.phase === 'player_roll'
          ? ({ t: 'ROLL' } as const)
          : s.phase === 'player_switch'
            ? ({ t: 'SWITCH', instanceId: s.player.find((b) => b.hp > 0)!.uid } as const)
            : ({ t: 'ATTACK' } as const)
    const r = reduce(s, e, d, rng)
    s = r.state
    log.push(...r.log)
  }
  return { s, log }
}

describe('sudden death', () => {
  it('starts after 10 turns that hurt nobody, then takes a quarter of max HP as each turn starts', () => {
    const { s, log } = playOut(d)
    const at = log.findIndex((e) => e.kind === 'sudden_death')
    // The stall really hurt nobody before it.
    expect(log.slice(0, at).some((e) => e.kind === 'damage' && e.amount > 0)).toBe(false)
    expect(log[at]).toEqual({ kind: 'sudden_death', turns: 10, pct: 25 })
    // Said once, before the 11th turn.
    expect(log.filter((e) => e.kind === 'sudden_death')).toHaveLength(1)
    expect(log.slice(at + 1).find((e) => e.kind === 'turn')).toMatchObject({ turn: 11 })
    const ticks = log.filter((e) => e.kind === 'sudden_death_tick')
    expect(ticks.length).toBeGreaterThan(0)
    for (const t of ticks) {
      const b = [...s.player, s.enemy].find((x) => x.uid === t.targetUid)!
      expect(t.amount).toBe(Math.min(t.hpAfter + t.amount, Math.ceil(b.maxHp / 4)))
    }
    // Every turn from the 11th on starts with one.
    expect(ticks).toHaveLength(log.slice(at).filter((e) => e.kind === 'turn').length)
    // Someone falls, long before the turn cap: no stalemate.
    expect(['won', 'lost']).toContain(s.phase)
    expect(s.turn).toBeLessThan(30)
  })

  it('a turn that hurt someone starts the count again', () => {
    const start = stall(d)
    const hp = (enemy: number) => ({ g: start.state.player[0]!.hp, s: start.state.player[1]!.hp, enemy })
    const turn = (s: BattleState) => reduce(reduce(s, { t: 'ROLL' }, d, createRng(3)).state, { t: 'ATTACK' }, d, createRng(3))
    // Nine calm turns behind, but the foe lost 1 HP since the last turn began.
    const hurt = turn({ ...start.state, calm: { turns: 9, hp: hp(start.state.enemy.hp + 1) } })
    expect(hurt.log.some((e) => e.kind === 'sudden_death')).toBe(false)
    expect(hurt.state.calm?.turns).toBe(0)
    // Nine calm turns with nothing lost: the next turn starts it.
    const calm = turn({ ...start.state, calm: { turns: 9, hp: hp(start.state.enemy.hp) } })
    expect(calm.log.some((e) => e.kind === 'sudden_death')).toBe(true)
    expect(calm.state.suddenDeath).toBe(true)
  })
})
