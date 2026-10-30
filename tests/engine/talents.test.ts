import { describe, expect, it } from 'vitest'
import {
  applyCatch,
  applyFieldItem,
  applyVictory,
  catchTarget,
  computeDamage,
  createBattle,
  createRng,
  dayCareXp,
  dealTalents,
  familyOf,
  familyTalent,
  familyUnlocked,
  instanceMaxHp,
  isStarterFamily,
  makeBattler,
  newSave,
  reduce,
  rerollMasked,
  rollTalent,
  syncTalents,
  talentOf,
  talentOnEvolve,
  uniformLevels,
  type BattleState,
  type Encounter,
  type GameData,
  type HiddenTalentsConfig,
  type SaveData,
} from '@/engine'
import { data as off, die, makeData } from '../fixtures'

const D: HiddenTalentsConfig = { access: 'all', wildChance: 0.05, evolveChance: 0.3, families: {} }
const on = makeData({ hiddenTalents: D })
const sure = makeData({ hiddenTalents: { ...D, wildChance: 1, evolveChance: 1 } })
const never = makeData({ hiddenTalents: { ...D, wildChance: 0, evolveChance: 0 } })

let n = 0
const newId = () => `id-${++n}`
const L1 = uniformLevels(1)

/** A save whose team is these Pokémon (the starter replaced). */
function saveWith(mons: { dex: number; level: number; talent?: boolean }[], d: GameData = on): SaveData {
  const s = newSave(1, d, 0, newId)
  const box = mons.map((m) => ({
    id: newId(),
    dex: m.dex,
    level: m.level,
    xp: 0,
    currentHp: 999,
    caughtAt: 0,
    ...(m.talent && { talent: true }),
  }))
  return { ...s, box, team: box.slice(0, 3).map((p) => p.id), pokedex: [...new Set(mons.map((m) => m.dex))] }
}

describe('families and their talents (docs/51)', () => {
  it('joins every evolution and form of a line under its lowest dex', () => {
    expect(familyOf(on, 26)).toBe(25) // Raichu
    expect(familyOf(on, 172)).toBe(25) // Pichu
    expect(familyOf(on, 149)).toBe(147) // Dragonite
    expect(familyOf(on, 10034)).toBe(4) // Mega Charizard X
  })

  it('gives Rattata something common and Dragonite something cool, the admin picking over both', () => {
    expect(familyTalent(on, 20)).toBe('pickup')
    expect(familyTalent(on, 149)).toBe('mirror')
    const picked = makeData({ hiddenTalents: { ...D, families: { '19': 'sturdy' } } })
    expect(familyTalent(picked, 20)).toBe('sturdy')
  })

  it('knows the starter lines', () => {
    expect(isStarterFamily(on, 3)).toBe(true)
    expect(isStarterFamily(on, 158)).toBe(true)
    expect(isStarterFamily(on, 19)).toBe(false)
  })
})

describe('who carries a talent', () => {
  it('draws nothing while the switch is off', () => {
    const rng = createRng(1)
    const before = rng.getState()
    expect(rollTalent(off, 150, rng)).toBe(false)
    expect(rng.getState()).toBe(before)
  })

  it('always gives a legendary its talent, never a starter line, any other at the wild odds', () => {
    expect(rollTalent(never, 150, createRng(1))).toBe(true)
    expect(rollTalent(sure, 1, createRng(1))).toBe(false)
    expect(rollTalent(sure, 19, createRng(1))).toBe(true)
    expect(rollTalent(never, 19, createRng(1))).toBe(false)
  })

  it("deals a gym leader's ace its talent", () => {
    const gym: Encounter = {
      kind: 'gym',
      trainerId: 't',
      name: 'Brock',
      spriteUrl: null,
      team: [
        { dex: 74, level: 12 },
        { dex: 95, level: 14 },
      ],
      role: 'leader',
      badge: 'boulder',
      index: 1,
      total: 1,
    }
    const dealt = dealTalents(gym, never, createRng(1))
    expect(dealt.kind === 'gym' && dealt.team.map((m) => !!m.talent)).toEqual([false, true])
  })
})

describe('catching a talented one', () => {
  it('can be caught below your copy: the family learns it and the Pokémon is let go', () => {
    const save = saveWith([{ dex: 19, level: 30 }])
    expect(catchTarget(save, 19, 5, 'wild', on)).toBeNull()
    const target = catchTarget(save, 19, 5, 'wild', on, false, save.currentAreaId, true)
    expect(target?.mode).toBe('learn')
    const res = applyCatch(save, { dex: 19, level: 5, talent: true }, target!, on, 0, newId)
    expect(res.save.box).toHaveLength(1)
    expect(res.save.box[0]!.talent).toBe(true)
    expect(familyUnlocked(res.save, on, 20)).toBe(true)
    expect(res.events).toContainEqual(
      expect.objectContaining({ kind: 'talent', how: 'passed', talent: 'pickup' }),
    )
  })

  it('a new catch with its talent unlocks the family for every member owned', () => {
    const save = saveWith([{ dex: 20, level: 30 }])
    const caught = applyCatch(save, { dex: 19, level: 5, talent: true }, { mode: 'new' }, on, 0, newId)
    expect(caught.save.box.every((p) => p.talent)).toBe(true)
    expect(caught.events).toContainEqual(expect.objectContaining({ kind: 'talent', how: 'caught' }))
  })

  it('a Pokémon that arrives with its talent (a trade) unlocks its family as the save settles', () => {
    const save = saveWith([
      { dex: 20, level: 30 },
      { dex: 19, level: 3, talent: true },
    ])
    const synced = syncTalents(save, on)
    expect(synced.box.every((p) => p.talent)).toBe(true)
    expect(syncTalents(synced, on)).toBe(synced)
  })
})

describe('evolving', () => {
  it('a starter line always finds its talent, any other on the evolution odds', () => {
    const save = saveWith([
      { dex: 2, level: 16 },
      { dex: 17, level: 18 },
    ])
    const [ivy, otto] = save.box
    const starter = talentOnEvolve(save, never, [{ kind: 'evolve', uid: ivy!.id, toDex: 2 }], createRng(1))
    expect(starter.found).toEqual([{ uid: ivy!.id, dex: 2, talent: 'leftovers' }])
    const missed = talentOnEvolve(save, never, [{ kind: 'evolve', uid: otto!.id, toDex: 17 }], createRng(1))
    expect(missed.found).toEqual([])
    const lucky = talentOnEvolve(save, sure, [{ kind: 'evolve', uid: otto!.id, toDex: 17 }], createRng(1))
    expect(lucky.found).toHaveLength(1)
  })
})

describe('in battle', () => {
  const fight = (
    mine: { dex: number; level: number; talent?: string },
    foe = { dex: 19, level: 5 },
    d = on,
  ): BattleState =>
    createBattle(
      {
        kind: 'wild',
        team: [
          { uid: 'a', dex: mine.dex, level: mine.level, hp: 9999, talent: (mine.talent ?? null) as never },
        ],
        enemy: foe,
        playerLevels: L1,
        enemyLevels: L1,
      },
      d,
    ).state

  it('Extra Reroll, Double Reroll, Quick, Ultra Speed and Thick Hide change the numbers', () => {
    const plain = makeBattler({ uid: 'p', dex: 25, level: 30, hp: 1 }, on)
    const reroll = makeBattler({ uid: 'p', dex: 25, level: 30, hp: 1, talent: 'doubleReroll' }, on)
    expect(reroll.rerolls).toBe(plain.rerolls + 2)
    expect(makeBattler({ uid: 'p', dex: 25, level: 30, hp: 1, talent: 'extraReroll' }, on).rerolls).toBe(
      plain.rerolls + 1,
    )
    expect(makeBattler({ uid: 'p', dex: 25, level: 30, hp: 1, talent: 'quick' }, on).speed).toBe(
      Math.round(plain.speed * 1.1),
    )
    expect(makeBattler({ uid: 'p', dex: 25, level: 30, hp: 1, talent: 'ultraSpeed' }, on).speed).toBe(
      Math.round(plain.speed * 1.2),
    )
    expect(makeBattler({ uid: 'p', dex: 25, level: 30, hp: 9999, talent: 'thickHide' }, on).maxHp).toBe(
      Math.round(plain.maxHp * 1.1),
    )
    // …and outside battle too, for a Pokémon of yours that carries it.
    const inst = { dex: 74, level: 30, talent: true }
    expect(instanceMaxHp(inst, on)).toBeGreaterThan(instanceMaxHp({ dex: 74, level: 30 }, on))
    expect(instanceMaxHp(inst, off)).toBe(instanceMaxHp({ dex: 74, level: 30 }, off))
  })

  it("Type Focus, Pair Pro, Opener and Mind's Eye change the hit, and say so", () => {
    const roll = [die('fire', 3), die('fire', 3)]
    const plain = computeDamage(roll, ['fire'], ['normal'], L1, on)
    const focus = computeDamage(roll, ['fire'], ['normal'], L1, on, undefined, {
      talent: 'typeFocus',
      focus: { type: 'fire', amount: 1 },
    })
    expect(focus.final).toBe(plain.final + 2)
    expect(focus.talent).toEqual({ key: 'typeFocus', amount: 2 })
    const pair = computeDamage(roll, ['fire'], ['normal'], L1, on, undefined, { talent: 'pairPro', pair: 2 })
    expect(pair.final).toBe(plain.final + 2)
    const ghost = computeDamage([die('normal', 4)], ['normal'], ['ghost'], L1, on)
    expect(ghost.final).toBe(0)
    const eye = computeDamage([die('normal', 4)], ['normal'], ['ghost'], L1, on, undefined, {
      talent: 'mindsEye',
      immuneAs: 0.5,
    })
    expect(eye.final).toBe(2)
    expect(eye.immune).toBe(false)

    // Opener: only the first attack of the battle.
    let s = fight({ dex: 4, level: 50, talent: 'opener' }, { dex: 129, level: 80 })
    s = { ...s, phase: 'player_reroll', actor: 'player', dice: [die('fire', 3)], selected: [false] }
    const first = reduce(s, { t: 'ATTACK' }, on, createRng(1))
    expect(first.log).toContainEqual(expect.objectContaining({ kind: 'talent', talent: 'opener', amount: 3 }))
  })

  it('Sturdy leaves it at 1 HP once', () => {
    // Dragonite: no status face to finish it off afterwards.
    let s = fight({ dex: 74, level: 5, talent: 'sturdy' }, { dex: 149, level: 90 })
    s = { ...s, player: [{ ...s.player[0]!, hp: 3 }] }
    s = { ...s, phase: 'enemy_turn', actor: 'enemy' }
    const out = reduce(s, { t: 'AI_TURN' }, on, createRng(4))
    expect(out.state.player[0]!.hp).toBe(1)
    expect(out.log).toContainEqual(expect.objectContaining({ kind: 'talent', talent: 'sturdy' }))
  })

  it('Reroller never lands a rerolled die on the number it showed', () => {
    const rng = createRng(9)
    for (let i = 0; i < 50; i++) {
      const [d] = rerollMasked([die('bug', 1)], [true], on, rng, true)
      expect(on.diceTypes.bug.faces[d!.faceIndex]!.value).toBe(4)
    }
  })

  it('a foe dealt its talent fights with it', () => {
    const s = createBattle(
      {
        kind: 'wild',
        team: [{ uid: 'a', dex: 7, level: 10, hp: 99 }],
        enemy: { dex: 19, level: 5, talent: true },
        playerLevels: L1,
        enemyLevels: L1,
      },
      on,
    ).state
    expect(s.enemy.talent).toBe('pickup')
    expect(
      createBattle(
        {
          kind: 'wild',
          team: [{ uid: 'a', dex: 7, level: 10, hp: 99 }],
          enemy: { dex: 19, level: 5, talent: true },
          playerLevels: L1,
          enemyLevels: L1,
        },
        off,
      ).state.enemy.talent,
    ).toBeUndefined()
  })
})

describe('the Talent Candy', () => {
  it("reveals the talent of a Pokémon whose family hasn't found it, for the whole family, once", () => {
    const save = {
      ...saveWith([
        { dex: 19, level: 10 },
        { dex: 20, level: 30 },
      ]),
      inventory: { 'talent-candy': 2 },
    }
    const rat = save.box[0]!
    const used = applyFieldItem(save, 'talent-candy', rat.id, on, createRng(1))!
    expect(used.events).toContainEqual(
      expect.objectContaining({ kind: 'talent', how: 'candy', talent: 'pickup' }),
    )
    expect(used.save.inventory['talent-candy']).toBe(1)
    expect(used.save.box.every((p) => p.talent)).toBe(true)
    // Already revealed: it can't be given, nothing is spent.
    expect(applyFieldItem(used.save, 'talent-candy', rat.id, on, createRng(1))).toBeNull()
    // Hidden talents off: no effect.
    expect(applyFieldItem({ ...save }, 'talent-candy', rat.id, off, createRng(1))).toBeNull()
  })
})

describe('out of battle', () => {
  it("Pay Day and Amulet Coin add to a trainer's ₽; Field Medic heals after the win", () => {
    const area = on.areas.find((a) => a.trainerPool.length > 0)!
    const plain = saveWith([{ dex: 52, level: 30 }], never)
    const meowth = saveWith([{ dex: 52, level: 30, talent: true }])
    const input = { areaId: area.id, kind: 'trainer' as const, enemyDex: 19, enemyLevel: 20, fighterUid: '' }
    const gold = (s: SaveData, d: GameData) =>
      applyVictory(s, { ...input, fighterUid: s.team[0]! }, d, createRng(1), 0, newId).save.gold - s.gold
    expect(gold(meowth, on)).toBe(Math.round(gold(plain, never) * 1.1))
    const hurt = saveWith([{ dex: 183, level: 30, talent: true }])
    hurt.box[0]!.currentHp = 10
    expect(talentOf(on, hurt.box[0]!)).toBe('fieldMedic')
    const won = applyVictory(
      hurt,
      { ...input, kind: 'wild', fighterUid: hurt.team[0]! },
      on,
      createRng(1),
      0,
      newId,
    )
    expect(won.events).toContainEqual(expect.objectContaining({ kind: 'field_medic' }))
  })

  it('Daycare Darling earns more Day Care XP', () => {
    const since = 0
    const now = 24 * 3_600_000
    const inst = { id: 'x', dex: 10, level: 5, xp: 0, currentHp: 1, caughtAt: 0, talent: true }
    expect(dayCareXp({ since, inst }, now, on)).toBe(Math.floor(dayCareXp({ since }, now, on) * 1.5))
  })
})
