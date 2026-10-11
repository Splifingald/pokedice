// The raid's speed button (docs/15 §14): which of the log's entries belong to a turn it plays faster — an ally side's
// or a summon's, never the raid Pokémon's or yours.
import { describe, expect, it } from 'vitest'
import { BOSS_UID, makeBattler, type RaidLogEntry, type RaidSide } from '@/engine'
import { fastTurn } from '@/screens/events/raidAnimator'
import { data } from './fixtures'

const side = (k: number, kind: RaidSide['kind']): RaidSide => ({
  owner: `Side ${k}`,
  look: null,
  kind,
  mons: [makeBattler({ uid: `s${k}-0`, dex: 143, level: 50, hp: 999 }, data)],
  active: 0,
  out: false,
})
const sides = [side(0, 'me'), side(1, 'friend'), side(2, 'npc')]
const front = (ally: string, foe: string, actor: 'ally' | 'foe'): RaidLogEntry => ({
  kind: 'raid_front',
  ally,
  foe,
  actor,
})

describe('the speed button’s turns', () => {
  it('an ally side’s turn and a summon’s turn play faster', () => {
    expect(fastTurn(front('s1-0', BOSS_UID, 'ally'), sides, false)).toBe(true)
    expect(fastTurn(front('s2-0', 'raid-summon-1', 'ally'), sides, false)).toBe(true)
    expect(fastTurn(front('s0-0', 'raid-summon-1', 'foe'), sides, false)).toBe(true)
  })

  it('your turn and the raid Pokémon’s never do, even when it hits an ally', () => {
    expect(fastTurn(front('s0-0', BOSS_UID, 'ally'), sides, true)).toBe(false)
    expect(fastTurn(front('s0-0', 'raid-summon-2', 'ally'), sides, true)).toBe(false)
    expect(fastTurn(front('s1-0', BOSS_UID, 'foe'), sides, true)).toBe(false)
  })

  it('a turn’s entries follow the pair in front; the boss calling a summon, and the end, keep their pace', () => {
    expect(fastTurn({ kind: 'turn', side: 'player', turn: 1, uid: 's1-0' }, sides, true)).toBe(true)
    expect(fastTurn({ kind: 'raid_next', side: 1, uid: 's1-1' }, sides, true)).toBe(true)
    expect(fastTurn({ kind: 'turn', side: 'enemy', turn: 1, uid: BOSS_UID }, sides, false)).toBe(false)
    const summon = makeBattler({ uid: 'raid-summon-3', dex: 143, level: 50, hp: 999 }, data)
    expect(fastTurn({ kind: 'raid_summon', b: summon, points: 0 }, sides, true)).toBe(false)
    expect(fastTurn({ kind: 'raid_end', result: 'won' }, sides, true)).toBe(false)
  })
})
