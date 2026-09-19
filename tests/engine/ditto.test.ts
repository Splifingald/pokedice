import { describe, expect, it } from 'vitest'
import { activeBattler, createBattle, createRng, effectiveStats, getSpecies, reduce, uniformLevels } from '@/engine'
import { data } from '../fixtures'

const DITTO = 132
const diceOf = (dex: number, level: number) => effectiveStats(getSpecies(data, dex), level, data).dice

const battle = (team: { uid: string; dex: number; level: number }[], enemy: { dex: number; level: number }) =>
  createBattle(
    {
      kind: 'wild',
      team: team.map((t) => ({ ...t, hp: 999 })),
      enemy,
      playerLevels: uniformLevels(1),
      enemyLevels: uniformLevels(1),
    },
    data,
  )

describe('Ditto', () => {
  it('never gains dice of its own', () => {
    expect(diceOf(DITTO, 5)).toEqual(diceOf(DITTO, 100))
  })

  it("fights with a copy of its opponent's dice, from the first turn", () => {
    const { state, log } = battle([{ uid: 'd', dex: DITTO, level: 30 }], { dex: 6, level: 50 })
    expect(activeBattler(state).dice).toEqual(diceOf(6, 50))
    expect(log).toContainEqual({ kind: 'transform', side: 'player', uid: 'd', fromUid: 'enemy', dice: diceOf(6, 50) })
    // Its own rerolls, though.
    expect(activeBattler(state).rerolls).toBe(effectiveStats(getSpecies(data, DITTO), 30, data).rerolls)
  })

  it("a foe's Ditto copies your Pokémon, and copies again when you switch", () => {
    const { state } = battle(
      [
        { uid: 'a', dex: 25, level: 30 },
        { uid: 'b', dex: 143, level: 50 },
      ],
      { dex: DITTO, level: 30 },
    )
    expect(state.enemy.dice).toEqual(diceOf(25, 30))
    // Get to the player's turn, then switch to Snorlax.
    let s = state
    for (let i = 0; i < 5 && s.phase !== 'player_roll'; i++) s = reduce(s, { t: 'AI_TURN' }, data, createRng(i)).state
    expect(s.phase).toBe('player_roll')
    const r = reduce(s, { t: 'SWITCH', instanceId: 'b' }, data, createRng(1))
    expect(r.state.enemy.dice).toEqual(diceOf(143, 50))
    expect(r.log).toContainEqual(expect.objectContaining({ kind: 'transform', side: 'enemy', fromUid: 'b' }))
  })

  it('Ditto against Ditto: each copies the other’s own dice', () => {
    const { state } = battle([{ uid: 'd', dex: DITTO, level: 30 }], { dex: DITTO, level: 30 })
    expect(activeBattler(state).dice).toEqual(diceOf(DITTO, 30))
    expect(state.enemy.dice).toEqual(diceOf(DITTO, 30))
  })
})
