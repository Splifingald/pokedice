import { describe, expect, it } from 'vitest'
import { opponentsOf, parseVersusBoard, rankVersus, versusErrorCode } from '@/lib/versus'

const raw = (name: string, attack: number, defense: number, extra: Record<string, unknown> = {}) => ({
  user_id: `u-${name}`,
  is_me: false,
  name,
  character: 'red',
  team: [{ dex: 6, level: 50, shiny: false }],
  version: 1,
  attack_wins: attack,
  defense_wins: defense,
  beaten: false,
  ...extra,
})

describe('Versus board', () => {
  const rows = parseVersusBoard([
    raw('Ash', 3, 0),
    raw('Misty', 5, 2),
    raw('Brock', 3, 7, { beaten: true }),
    raw('Gary', 0, 1, { is_me: true, character: 'green' }),
  ])

  it('ranks by attack wins, ties sharing a rank, players without a win left out', () => {
    expect(rankVersus(rows, 'attack').map((r) => [r.rank, r.name, r.score])).toEqual([
      [1, 'Misty', 5],
      [2, 'Ash', 3],
      [2, 'Brock', 3],
    ])
  })

  it('ranks by defense wins', () => {
    expect(rankVersus(rows, 'defense').map((r) => [r.rank, r.name])).toEqual([
      [1, 'Brock'],
      [2, 'Misty'],
      [3, 'Gary'],
    ])
  })

  it('lists opponents without you, the ones still to beat first', () => {
    expect(opponentsOf(rows).map((r) => r.name)).toEqual(['Ash', 'Misty', 'Brock'])
  })

  it('parses defensively', () => {
    const [r] = parseVersusBoard([{ ...raw('', 0, 0), name: null, character: 'blue', version: null }])
    expect(r).toMatchObject({ name: 'Trainer', character: 'red', version: 1 })
  })

  it('names the refusals of the database', () => {
    expect(versusErrorCode({ message: 'versus_already_won' })).toBe('versus_already_won')
    expect(versusErrorCode({ code: 'P0001', message: 'versus_team_changed' })).toBe('versus_team_changed')
    expect(versusErrorCode({ code: 'PGRST202', message: 'Could not find the function' })).toBe('versus_missing')
    expect(versusErrorCode(new Error('boom'))).toBe('versus_unknown')
  })
})
