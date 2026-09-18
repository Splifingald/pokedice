import { describe, expect, it } from 'vitest'
import {
  applyStatuses,
  confusionRecoil,
  consumeStun,
  createBattle,
  emptyStatus,
  hasAnyStatus,
  reduce,
  statusesFromRoll,
  stunKind,
  tickDot,
  uniformLevels,
  createRng,
  type BattleState,
} from '@/engine'
import { data, die, sdie } from '../fixtures'

const rules = data.config.status

describe('status thresholds', () => {
  it('burn triggers on a single face and stacks per face', () => {
    const apps = statusesFromRoll([sdie('fire', 'burn'), sdie('fire', 'burn'), sdie('fire', 'burn')], data)
    expect(apps).toEqual([{ status: 'burn', stacks: 3, turns: 3 }])
  })

  it('poison needs 2', () => {
    expect(statusesFromRoll([sdie('poison', 'poison')], data)).toEqual([])
    expect(statusesFromRoll([sdie('poison', 'poison'), sdie('poison', 'poison')], data)[0]?.status).toBe('poison')
  })

  it('frozen needs 3 in one roll', () => {
    const two = [sdie('ice', 'frozen'), sdie('ice', 'frozen'), die('ice', 5)]
    expect(statusesFromRoll(two, data)).toEqual([])
    const three = [sdie('ice', 'frozen'), sdie('ice', 'frozen'), sdie('ice', 'frozen')]
    expect(statusesFromRoll(three, data)).toEqual([{ status: 'frozen', turns: 2 }])
  })

  it('paralyze needs 2, confuse needs 2', () => {
    expect(statusesFromRoll([sdie('electric', 'paralyze')], data)).toEqual([])
    expect(statusesFromRoll([sdie('electric', 'paralyze'), sdie('electric', 'paralyze')], data)[0]?.status).toBe(
      'paralyze',
    )
    expect(statusesFromRoll([sdie('psychic', 'confuse')], data)).toEqual([])
    expect(statusesFromRoll([sdie('psychic', 'confuse'), sdie('psychic', 'confuse')], data)[0]?.status).toBe('confuse')
  })
})

describe('status application', () => {
  it('burn stacks and refreshes; poison only refreshes', () => {
    let s = applyStatuses(emptyStatus(), [{ status: 'burn', stacks: 2 }], rules)
    s = tickDot(s, rules).state
    expect(s.burn).toEqual({ stacks: 2, turns: 2 })
    s = applyStatuses(s, [{ status: 'burn', stacks: 1 }], rules)
    expect(s.burn).toEqual({ stacks: 3, turns: 3 })

    let p = applyStatuses(emptyStatus(), [{ status: 'poison' }], rules)
    p = tickDot(p, rules).state
    p = applyStatuses(p, [{ status: 'poison' }], rules)
    expect(p.poison).toEqual({ turns: 3 })
    expect(tickDot(p, rules).ticks).toEqual([{ status: 'poison', amount: 3 }])
  })

  it('DoT deals stacks × 1 for burn, 3 for poison, and expires', () => {
    let s = applyStatuses(emptyStatus(), [{ status: 'burn', stacks: 3 }, { status: 'poison' }], rules)
    const t1 = tickDot(s, rules)
    expect(t1.ticks).toEqual([
      { status: 'burn', amount: 3 },
      { status: 'poison', amount: 3 },
    ])
    s = tickDot(tickDot(t1.state, rules).state, rules).state
    expect(s.burn).toBeNull()
    expect(s.poison).toBeNull()
  })

  it('stuns refresh and burn down; confusion is untouched by a skipped turn', () => {
    let s = applyStatuses(emptyStatus(), [{ status: 'frozen' }, { status: 'confuse' }], rules)
    expect(stunKind(s)).toBe('frozen')
    s = consumeStun(s)
    s = consumeStun(s)
    expect(stunKind(s)).toBeNull()
    expect(s.confused).toBe(true)
    s = applyStatuses(s, [{ status: 'paralyze' }], rules)
    expect(stunKind(s)).toBe('paralyze')
    expect(hasAnyStatus(emptyStatus())).toBe(false)
  })
})

function battle(): BattleState {
  return createBattle(
    {
      kind: 'wild',
      team: [
        { uid: 'a', dex: 7, level: 10, hp: 999 },
        { uid: 'b', dex: 1, level: 10, hp: 999 },
      ],
      enemy: { dex: 19, level: 5 },
      playerLevels: uniformLevels(1),
      enemyLevels: uniformLevels(1),
    },
    data,
  ).state
}

describe('status in battle', () => {
  it('DoT ticks before the stun check and can K.O.', () => {
    const s = battle()
    // Make it the enemy's turn next: the player attacks, then the enemy turn begins with a lethal burn while frozen.
    s.phase = 'player_reroll'
    s.actor = 'player'
    s.dice = [die('base', 1)]
    s.selected = [false]
    s.enemy.hp = 3
    s.enemy.status = { ...emptyStatus(), burn: { stacks: 5, turns: 3 }, frozen: 2 }
    const r = reduce(s, { t: 'ATTACK' }, data, createRng(1))
    const kinds = r.log.map((l) => l.kind)
    expect(kinds.indexOf('status_tick')).toBeGreaterThan(-1)
    expect(kinds).not.toContain('stunned')
    expect(r.state.phase).toBe('won')
  })

  it('a stun skips the turn without consuming a pending confusion', () => {
    const s = battle()
    s.phase = 'player_reroll'
    s.actor = 'player'
    s.dice = [die('base', 1)]
    s.selected = [false]
    s.enemy.hp = 500
    s.enemy.maxHp = 500
    s.enemy.status = { ...emptyStatus(), frozen: 1, confused: true }
    const r = reduce(s, { t: 'ATTACK' }, data, createRng(1))
    expect(r.log.some((l) => l.kind === 'stunned')).toBe(true)
    expect(r.state.enemy.status.confused).toBe(true)
    expect(r.state.enemy.status.frozen).toBe(0)
    expect(r.state.phase).toBe('player_roll') // turn came straight back
  })

  it('a confused attacker still hits the foe, takes recoil (% of its max HP), then the confusion clears', () => {
    const s = battle()
    s.phase = 'player_reroll'
    s.dice = [die('water', 5)]
    s.selected = [false]
    s.enemy.hp = 500
    s.enemy.maxHp = 500
    s.player[0]!.maxHp = 60
    s.player[0]!.hp = 60
    s.player[0]!.status = { ...emptyStatus(), confused: true }
    const pct = data.config.status.confuse.recoilPercent
    const r = reduce(s, { t: 'ATTACK' }, data, createRng(1))
    const hit = r.log.find((l) => l.kind === 'damage')
    expect(hit && hit.kind === 'damage' && hit.targetUid).toBe(s.enemy.uid)
    expect(r.state.enemy.hp).toBe(500 - (hit && hit.kind === 'damage' ? hit.amount : 0))
    expect(r.state.enemy.hp).toBeLessThan(500)
    const recoil = Math.max(1, Math.round((60 * pct) / 100))
    expect(r.log.find((l) => l.kind === 'recoil')).toMatchObject({ side: 'player', amount: recoil })
    expect(r.state.player[0]!.hp).toBe(60 - recoil)
    expect(r.state.player[0]!.status.confused).toBe(false)
  })

  it('confusion recoil follows the admin percentage and never drops below 1', () => {
    const d = { ...data, config: { ...data.config, status: { ...data.config.status, confuse: { threshold: 2, recoilPercent: 25 } } } }
    expect(confusionRecoil(80, d)).toBe(20)
    expect(confusionRecoil(2, data)).toBe(1)
  })

  it('every status clears when the battle ends', () => {
    const s = battle()
    s.phase = 'player_reroll'
    s.dice = [die('water', 5)]
    s.selected = [false]
    s.player[0]!.status = { ...emptyStatus(), burn: { stacks: 2, turns: 3 }, poison: { turns: 2 } }
    s.enemy.hp = 1
    const r = reduce(s, { t: 'ATTACK' }, data, createRng(1))
    expect(r.state.phase).toBe('won')
    for (const b of [...r.state.player, r.state.enemy]) expect(hasAnyStatus(b.status)).toBe(false)
  })

  it('status faces are applied to a surviving defender', () => {
    const s = battle()
    s.phase = 'player_reroll'
    s.dice = [sdie('fire', 'burn'), sdie('fire', 'burn')]
    s.selected = [false, false]
    s.enemy.hp = 500
    s.enemy.maxHp = 500
    s.enemy.speed = 0
    const r = reduce(s, { t: 'ATTACK' }, data, createRng(3))
    expect(r.log.find((l) => l.kind === 'status')).toMatchObject({ status: 'burn', stacks: 2 })
  })
})
