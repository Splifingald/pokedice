// Sudden death (docs/72): after 10 turns in a row that hurt nobody, every Pokémon loses 25 % of its max HP as each of
// its turns starts, so a stalled fight ends with a winner rather than at the turn cap.
import { describe, expect, it } from 'vitest'
import {
  createBattle,
  createRng,
  reduce,
  suddenDeathOn,
  uniformLevels,
  type BattleState,
  type EventAccess,
  type GameData,
  type LogEntry,
} from '@/engine'
import { data } from '../fixtures'

const withSwitch = (access: EventAccess, viewer?: GameData['viewer']): GameData => ({
  ...data,
  config: { ...data.config, suddenDeath: { access }, maxBattleTurns: 60 },
  ...(viewer && { viewer }),
})

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
  it('the stall really hurts nobody and ends at the turn cap with the switch off', () => {
    const { s, log } = playOut(withSwitch('off'))
    expect(log.some((e) => (e.kind === 'damage' && e.amount > 0) || e.kind === 'sudden_death')).toBe(false)
    expect(log.at(-1)).toEqual({ kind: 'end', result: 'fled', reason: 'stalemate' })
    expect(s.turn).toBe(60)
  })

  it('starts after 10 turns that hurt nobody, then takes a quarter of max HP as each turn starts', () => {
    const d = withSwitch('all')
    const { s, log } = playOut(d)
    const at = log.findIndex((e) => e.kind === 'sudden_death')
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
    const turnsAfter = log.slice(at).filter((e) => e.kind === 'turn').length
    expect(ticks).toHaveLength(turnsAfter)
    // Someone falls: no stalemate.
    expect(['won', 'lost']).toContain(s.phase)
    expect(s.turn).toBeLessThan(30)
  })

  it('is On for admin for the admin alone', () => {
    expect(suddenDeathOn(withSwitch('admin'))).toBe(false)
    expect(suddenDeathOn(withSwitch('admin', { admin: false }))).toBe(false)
    expect(suddenDeathOn(withSwitch('admin', { admin: true }))).toBe(true)
    expect(suddenDeathOn(withSwitch('all'))).toBe(true)
    expect(suddenDeathOn(withSwitch('off', { admin: true }))).toBe(false)
    expect(playOut(withSwitch('admin', { admin: true })).log.some((e) => e.kind === 'sudden_death')).toBe(true)
  })

  it('a turn that hurt someone starts the count again', () => {
    const d = withSwitch('all')
    const start = stall(d)
    // Nine calm turns behind, but the foe lost 1 HP since the last turn began.
    const s: BattleState = {
      ...start.state,
      calm: { turns: 9, hp: { g: start.state.player[0]!.hp, s: start.state.player[1]!.hp, enemy: start.state.enemy.hp + 1 } },
    }
    const r = reduce(s, { t: 'ROLL' }, d, createRng(3))
    const after = reduce(r.state, { t: 'ATTACK' }, d, createRng(3))
    expect(after.log.some((e) => e.kind === 'sudden_death')).toBe(false)
    expect(after.state.calm?.turns).toBe(0)
    // Nine calm turns with nothing lost: the next turn starts it.
    const calm: BattleState = {
      ...start.state,
      calm: { turns: 9, hp: { g: start.state.player[0]!.hp, s: start.state.player[1]!.hp, enemy: start.state.enemy.hp } },
    }
    const next = reduce(reduce(calm, { t: 'ROLL' }, d, createRng(3)).state, { t: 'ATTACK' }, d, createRng(3))
    expect(next.log.some((e) => e.kind === 'sudden_death')).toBe(true)
    expect(next.state.suddenDeath).toBe(true)
  })

  it('takes its numbers from the row', () => {
    const d = { ...data, config: { ...data.config, suddenDeath: { access: 'all' as const, turns: 4, share: 0.5 } } }
    const { log } = playOut(d)
    expect(log.find((e) => e.kind === 'sudden_death')).toEqual({ kind: 'sudden_death', turns: 4, pct: 50 })
  })
})
