import { describe, expect, it } from 'vitest'
import { createBattle, createRng, dealTrainerItems, reduce, uniformLevels, type BattleState } from '@/engine'
import { gymPotions } from '../../scripts/seed'
import { data } from '../fixtures'

describe('dealTrainerItems', () => {
  it('gives the one potion to the highest level Pokémon', () => {
    const team = dealTrainerItems(
      [
        { dex: 74, level: 12 },
        { dex: 95, level: 14 },
      ],
      ['potion'],
      data,
    )
    expect(team.map((m) => m.item)).toEqual([undefined, 'potion'])
  })

  it('never gives two to one Pokémon, best potion to the strongest, ties to the later (ace)', () => {
    const team = dealTrainerItems(
      [
        { dex: 1, level: 40 },
        { dex: 2, level: 40 },
        { dex: 3, level: 30 },
      ],
      ['potion', 'hyper-potion', 'super-potion', 'potion'],
      data,
    )
    expect(team.map((m) => m.item)).toEqual(['super-potion', 'hyper-potion', 'potion'])
  })

  it('ignores anything that is not a potion', () => {
    const team = dealTrainerItems([{ dex: 1, level: 5 }], ['antidote', 'poke-ball'], data)
    expect(team[0]!.item).toBeUndefined()
    expect(dealTrainerItems([{ dex: 1, level: 5 }], undefined, data)[0]!.item).toBeUndefined()
  })
})

describe('trainer potion AI', () => {
  const battle = (enemyHp: number, item?: string): BattleState =>
    createBattle(
      {
        kind: 'trainer',
        team: [{ uid: 'a', dex: 6, level: 50, hp: 999 }],
        enemy: { dex: 9, level: 50, hp: enemyHp, item },
        playerLevels: uniformLevels(1),
        enemyLevels: uniformLevels(1),
      },
      data,
    ).state
  const enemyTurn = (s: BattleState) => reduce({ ...s, phase: 'enemy_turn', actor: 'enemy' }, { t: 'AI_TURN' }, data, createRng(3))

  it('drinks it when a hit could K.O., then attacks the same turn', () => {
    const r = enemyTurn(battle(5, 'hyper-potion'))
    const used = r.log.find((l) => l.kind === 'item')
    expect(used).toMatchObject({ side: 'enemy', key: 'hyper-potion', targetUid: 'enemy' })
    expect(r.log.some((l) => l.kind === 'damage' && l.side === 'enemy')).toBe(true)
    expect(r.state.enemy.item).toBeNull()
  })

  it('keeps it while healthy', () => {
    const s = battle(10_000, 'hyper-potion')
    const r = enemyTurn(s)
    expect(r.log.some((l) => l.kind === 'item')).toBe(false)
    expect(r.state.enemy.item).toBe('hyper-potion')
  })

  it('uses it only once', () => {
    const first = enemyTurn(battle(5, 'potion'))
    const again = enemyTurn({ ...first.state, enemy: { ...first.state.enemy, hp: 3 } })
    expect(again.log.some((l) => l.kind === 'item')).toBe(false)
  })

  it('does nothing without a potion', () => {
    expect(enemyTurn(battle(5)).log.some((l) => l.kind === 'item')).toBe(false)
  })
})

describe('bundled trainer potions', () => {
  const trainers = Object.values(data.trainers)

  it('are known potions, one per Pokémon at most', () => {
    for (const t of trainers) {
      for (const k of t.items ?? []) expect(data.items[k]?.effect.kind, `${t.name}: ${k}`).toBe('heal')
      expect((t.items ?? []).length, t.name).toBeLessThanOrEqual(t.team.length)
    }
  })

  it('follow the gym defaults: none for gyms 1–3, Potion 4–5, Super 6–7, Hyper for the 8th, Elite Four and Champion', () => {
    for (const t of trainers.filter((x) => x.role !== 'trainer')) {
      const want = gymPotions(t.role, t.badge)
      expect(t.items ?? [], t.name).toEqual(want ? [want] : [])
    }
  })
})
