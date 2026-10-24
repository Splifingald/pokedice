import { describe, expect, it } from 'vitest'
import {
  applyStatuses,
  confusionLevel,
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
  type StatusState,
} from '@/engine'
import { data, die, sdie } from '../fixtures'

const rules = data.config.status

describe('what status faces do', () => {
  it('burn triggers on a single face and stacks per face', () => {
    const apps = statusesFromRoll([sdie('fire', 'burn'), sdie('fire', 'burn'), sdie('fire', 'burn')], data)
    expect(apps).toEqual([{ status: 'burn', stacks: 3, turns: 3 }])
  })

  it('one Poison face poisons, for 5 turns', () => {
    expect(statusesFromRoll([sdie('poison', 'poison')], data)).toEqual([{ status: 'poison', turns: 5 }])
    expect(statusesFromRoll([sdie('poison', 'poison'), sdie('poison', 'poison')], data)).toEqual([
      { status: 'poison', turns: 5 },
    ])
  })

  it('each Ice face gives a 1-in-3 chance to freeze (2 turns), sure at 3', () => {
    const ice = (n: number) => [...Array.from({ length: n }, () => sdie('ice', 'frozen')), die('ice', 5)]
    expect(statusesFromRoll(ice(1), data)).toEqual([{ status: 'frozen', turns: 2, chance: 1 / 3 }])
    expect(statusesFromRoll(ice(2), data)).toEqual([{ status: 'frozen', turns: 2, chance: 2 / 3 }])
    expect(statusesFromRoll(ice(3), data)).toEqual([{ status: 'frozen', turns: 2, chance: 1 }])
    expect(statusesFromRoll(ice(4), data)[0]?.chance).toBe(1)
  })

  it('each Electric face gives a 50 % chance to paralyze (1 turn), sure at 2', () => {
    expect(statusesFromRoll([sdie('electric', 'paralyze')], data)).toEqual([{ status: 'paralyze', turns: 1, chance: 0.5 }])
    const two = [sdie('electric', 'paralyze'), sdie('electric', 'paralyze')]
    expect(statusesFromRoll(two, data)).toEqual([{ status: 'paralyze', turns: 1, chance: 1 }])
  })

  it('confusion grows with its faces, 3 at most', () => {
    const psy = (n: number) => Array.from({ length: n }, () => sdie('psychic', 'confuse'))
    expect(statusesFromRoll(psy(1), data)).toEqual([{ status: 'confuse', level: 1 }])
    expect(statusesFromRoll(psy(2), data)).toEqual([{ status: 'confuse', level: 2 }])
    expect(statusesFromRoll(psy(3), data)).toEqual([{ status: 'confuse', level: 3 }])
    expect(statusesFromRoll(psy(4), data)).toEqual([{ status: 'confuse', level: 3 }])
  })
})

describe('status application', () => {
  it('burn stacks and refreshes; poison only refreshes', () => {
    let s = applyStatuses(emptyStatus(), [{ status: 'burn', stacks: 2 }], rules)
    s = tickDot(s, rules, 100).state
    expect(s.burn).toEqual({ stacks: 2, turns: 2 })
    s = applyStatuses(s, [{ status: 'burn', stacks: 1 }], rules)
    expect(s.burn).toEqual({ stacks: 3, turns: 3 })

    let p = applyStatuses(emptyStatus(), [{ status: 'poison' }], rules)
    p = tickDot(p, rules, 100).state
    p = applyStatuses(p, [{ status: 'poison' }], rules)
    expect(p.poison).toEqual({ turns: 5 })
    expect(tickDot(p, rules, 100).ticks).toEqual([{ status: 'poison', amount: 5 }])
  })

  it('DoT deals a share of max HP (burn 4 % per stack, poison 5 %), at least 1, and expires', () => {
    let s = applyStatuses(emptyStatus(), [{ status: 'burn', stacks: 3 }, { status: 'poison' }], rules)
    const t1 = tickDot(s, rules, 100)
    expect(t1.ticks).toEqual([
      { status: 'burn', amount: 12 },
      { status: 'poison', amount: 5 },
    ])
    expect(tickDot(s, rules, 250).ticks.map((t) => t.amount)).toEqual([30, 13])
    expect(tickDot(s, rules, 5).ticks.map((t) => t.amount)).toEqual([1, 1])
    // Burn lasts 3 turns, Poison 5.
    s = tickDot(tickDot(t1.state, rules, 100).state, rules, 100).state
    expect(s.burn).toBeNull()
    expect(s.poison).toEqual({ turns: 2 })
    s = tickDot(tickDot(s, rules, 100).state, rules, 100).state
    expect(s.poison).toBeNull()
  })

  it('stuns refresh and burn down; confusion is untouched by a skipped turn', () => {
    let s = applyStatuses(emptyStatus(), [{ status: 'frozen' }, { status: 'confuse' }], rules)
    expect(stunKind(s)).toBe('frozen')
    s = consumeStun(s)
    s = consumeStun(s)
    expect(stunKind(s)).toBeNull()
    expect(s.confused).toBe(1)
    s = applyStatuses(s, [{ status: 'paralyze' }], rules)
    expect(stunKind(s)).toBe('paralyze')
    expect(hasAnyStatus(emptyStatus())).toBe(false)
  })

  it('the stronger confusion holds; a battle saved with the old flag reads as a bit confused', () => {
    let s = applyStatuses(emptyStatus(), [{ status: 'confuse', level: 3 }], rules)
    s = applyStatuses(s, [{ status: 'confuse', level: 1 }], rules)
    expect(s.confused).toBe(3)
    expect(applyStatuses(s, [{ status: 'confuse', level: 2 }], rules).confused).toBe(3)
    const old = { ...emptyStatus(), confused: true } as unknown as StatusState
    expect(confusionLevel(old)).toBe(1)
    expect(hasAnyStatus(old)).toBe(true)
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
    s.enemy.status = { ...emptyStatus(), frozen: 1, confused: 2 }
    const r = reduce(s, { t: 'ATTACK' }, data, createRng(1))
    expect(r.log.some((l) => l.kind === 'stunned')).toBe(true)
    expect(r.state.enemy.status.confused).toBe(2)
    expect(r.state.enemy.status.frozen).toBe(0)
    expect(r.state.phase).toBe('player_roll') // turn came straight back
  })

  it('a confused attacker still hits the foe, takes recoil (10 % of its max HP per level), then the confusion clears', () => {
    const s = battle()
    s.phase = 'player_reroll'
    s.dice = [die('water', 5)]
    s.selected = [false]
    s.enemy.hp = 500
    s.enemy.maxHp = 500
    s.player[0]!.maxHp = 60
    s.player[0]!.hp = 60
    s.player[0]!.status = { ...emptyStatus(), confused: 2 }
    const pct = data.config.status.confuse.recoilPercentPerFace * 2
    const r = reduce(s, { t: 'ATTACK' }, data, createRng(1))
    const hit = r.log.find((l) => l.kind === 'damage')
    expect(hit && hit.kind === 'damage' && hit.targetUid).toBe(s.enemy.uid)
    expect(r.state.enemy.hp).toBe(500 - (hit && hit.kind === 'damage' ? hit.amount : 0))
    expect(r.state.enemy.hp).toBeLessThan(500)
    const recoil = Math.max(1, Math.round((60 * pct) / 100))
    expect(r.log.find((l) => l.kind === 'recoil')).toMatchObject({ side: 'player', amount: recoil })
    expect(r.state.player[0]!.hp).toBe(60 - recoil)
    expect(r.state.player[0]!.status.confused).toBe(0)
  })

  it('confusion recoil: 10 %, 20 %, 30 % of max HP, capped at 3 levels, never below 1, 0 when not confused', () => {
    expect([1, 2, 3, 4].map((lv) => confusionRecoil(100, lv, data))).toEqual([10, 20, 30, 30])
    expect(confusionRecoil(2, 1, data)).toBe(1)
    expect(confusionRecoil(100, 0, data)).toBe(0)
    const d = { ...data, config: { ...data.config, status: { ...data.config.status, confuse: { recoilPercentPerFace: 25, maxFaces: 2 } } } }
    expect(confusionRecoil(80, 3, d)).toBe(40)
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

  /** The player attacks a sturdy foe with `dice`; `seed` drives the chance roll. */
  function attackWith(dice: ReturnType<typeof sdie>[], seed: number) {
    const s = battle()
    s.phase = 'player_reroll'
    s.dice = dice
    s.selected = dice.map(() => false)
    s.enemy.hp = 500
    s.enemy.maxHp = 500
    s.enemy.speed = 0
    return reduce(s, { t: 'ATTACK' }, data, createRng(seed))
  }

  it('one Electric face paralyzes about half the time; the miss is logged with its chance', () => {
    let landed = 0
    let resisted = 0
    for (let seed = 1; seed <= 400; seed++) {
      const r = attackWith([sdie('electric', 'paralyze'), die('base', 1)], seed)
      const hit = r.log.find((l) => l.kind === 'status')
      const miss = r.log.find((l) => l.kind === 'status_resisted')
      expect(!!hit !== !!miss).toBe(true)
      if (hit) {
        landed++
        expect(hit).toMatchObject({ status: 'paralyze', chance: 0.5 })
      }
      if (miss) {
        resisted++
        expect(miss).toMatchObject({ status: 'paralyze', chance: 0.5, targetUid: r.state.enemy.uid })
        expect(r.state.enemy.status.paralyze).toBe(0)
      }
    }
    expect(landed).toBeGreaterThan(160)
    expect(resisted).toBeGreaterThan(160)
  })

  it('two Electric faces or three Ice faces always land', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const par = attackWith([sdie('electric', 'paralyze'), sdie('electric', 'paralyze')], seed)
      expect(par.log.some((l) => l.kind === 'status_resisted')).toBe(false)
      expect(par.log.find((l) => l.kind === 'status')).toMatchObject({ status: 'paralyze', turns: 1 })
      const ice = attackWith([sdie('ice', 'frozen'), sdie('ice', 'frozen'), sdie('ice', 'frozen')], seed)
      expect(ice.log.find((l) => l.kind === 'status')).toMatchObject({ status: 'frozen', turns: 2 })
    }
  })

  it('the Confuse faces set how confused the foe gets', () => {
    const r = attackWith([sdie('psychic', 'confuse'), sdie('psychic', 'confuse'), die('base', 1)], 1)
    expect(r.log.find((l) => l.kind === 'status')).toMatchObject({ status: 'confuse', level: 2 })
    expect(r.state.enemy.status.confused).toBe(2)
  })

  it("a Heal face heals its value plus its die's upgrade", () => {
    const s = battle()
    s.playerLevels = uniformLevels(3)
    s.phase = 'player_reroll'
    s.dice = [sdie('grass', 'heal')]
    s.selected = [false]
    s.enemy.hp = 500
    s.enemy.maxHp = 500
    s.player[0]!.maxHp = 100
    s.player[0]!.hp = 50
    const r = reduce(s, { t: 'ATTACK' }, data, createRng(1))
    // Heal faces are worth 3; Grass Lv.3 adds 2.
    expect(r.log.find((l) => l.kind === 'heal')).toMatchObject({ amount: 5, hpAfter: 55 })
  })
})
