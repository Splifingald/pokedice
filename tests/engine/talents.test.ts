import { describe, expect, it } from 'vitest'
import {
  applyCatch,
  applyFieldItem,
  applyVictory,
  attackModsFor,
  comboBonus,
  emptyStatus,
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
  type Battler,
  type BattleState,
  type Encounter,
  type GameData,
  type HiddenTalentsConfig,
  type SaveData,
  type TalentKey,
} from '@/engine'
import { data as off, die, makeData, sdie } from '../fixtures'

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
    expect(familyTalent(on, 20)).toBe('extraReroll')
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
      expect.objectContaining({ kind: 'talent', how: 'passed', talent: 'extraReroll' }),
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
    const inst = { dex: 27, level: 30, talent: true } // Sandshrew: Thick Hide
    expect(instanceMaxHp(inst, on)).toBeGreaterThan(instanceMaxHp({ dex: 27, level: 30 }, on))
    expect(instanceMaxHp(inst, off)).toBe(instanceMaxHp({ dex: 27, level: 30 }, off))
  })

  it("Technician, Opener, Finisher and Mind's Eye scale the hit, and say so", () => {
    const roll = [die('fire', 6), die('fire', 6), die('fire', 5)]
    const plain = computeDamage(roll, ['fire'], ['normal'], L1, on)
    const pair = computeDamage(roll, ['fire'], ['normal'], L1, on, undefined, {
      talent: 'technician',
      comboTimes: { key: 'pair', times: 1.05 },
    })
    expect(plain.combo?.key).toBe('pair')
    expect(pair.final).toBe(Math.round(plain.final * 1.05))
    expect(pair.talent).toEqual({ key: 'technician', amount: pair.final - plain.final })
    // No pair, no bonus.
    const odd = [die('fire', 6), die('fire', 5)]
    expect(
      computeDamage(odd, ['fire'], ['normal'], L1, on, undefined, {
        talent: 'technician',
        comboTimes: { key: 'pair', times: 1.05 },
      }).final,
    ).toBe(computeDamage(odd, ['fire'], ['normal'], L1, on).final)
    const ghost = computeDamage([die('normal', 4)], ['normal'], ['ghost'], L1, on)
    expect(ghost.final).toBe(0)
    const eye = computeDamage([die('normal', 4)], ['normal'], ['ghost'], L1, on, undefined, {
      talent: 'mindsEye',
      immuneAs: 0.5,
    })
    expect(eye.final).toBe(2)
    expect(eye.immune).toBe(false)

    // Opener: +10 % on the first attack of the battle only.
    let s = fight({ dex: 4, level: 50, talent: 'opener' }, { dex: 129, level: 80 })
    expect(attackModsFor(s, s.player[0]!, s.enemy)).toEqual({ talent: 'opener', times: 1.1 })
    expect(attackModsFor(s, { ...s.player[0]!, attacks: 1 }, s.enemy)).toBeUndefined()
    s = {
      ...s,
      phase: 'player_reroll',
      actor: 'player',
      dice: [die('fire', 6), die('fire', 6)],
      selected: [false, false],
    }
    const first = reduce(s, { t: 'ATTACK' }, on, createRng(1))
    expect(first.log).toContainEqual(expect.objectContaining({ kind: 'talent', talent: 'opener' }))

    // Finisher: +10 % against a foe under a third of its HP.
    const fin = fight({ dex: 4, level: 50, talent: 'finisher' }, { dex: 129, level: 80 })
    expect(attackModsFor(fin, fin.player[0]!, fin.enemy)).toBeUndefined()
    const low = { ...fin.enemy, hp: Math.floor(fin.enemy.maxHp * 0.3) }
    expect(attackModsFor(fin, fin.player[0]!, low)).toEqual({ talent: 'finisher', times: 1.1 })
  })

  it('Power Spot: +10 % to the partner on the field in a double battle, and from another side in a raid', () => {
    const s = createBattle(
      {
        kind: 'wild',
        team: [
          { uid: 'a', dex: 25, level: 30, hp: 99 },
          { uid: 'b', dex: 133, level: 30, hp: 99, talent: 'powerSpot' },
        ],
        enemy: { dex: 19, level: 5 },
        double: {
          foes: [
            { dex: 19, level: 5 },
            { dex: 16, level: 5 },
          ],
          leadUids: ['a', 'b'],
        },
        playerLevels: L1,
        enemyLevels: L1,
      },
      on,
    ).state
    expect(s.double).toBeTruthy()
    const [pika, eevee] = s.player
    expect(attackModsFor(s, pika!, s.enemy)).toEqual({ powerSpot: 'b', times: 1.1 })
    // It never boosts itself, nor a partner once it is down.
    expect(attackModsFor(s, eevee!, s.enemy)).toBeUndefined()
    const down = { ...s, player: [pika!, { ...eevee!, hp: 0 }] }
    expect(attackModsFor(down, pika!, s.enemy)).toBeUndefined()
    // A single battle has no partner, but a raid's other side can be one.
    const one = fight({ dex: 25, level: 30 })
    expect(attackModsFor(one, one.player[0]!, one.enemy)).toBeUndefined()
    const raid = { ...one, allyPowerSpot: { uid: 'x', name: 'Eevee' } }
    expect(attackModsFor(raid, raid.player[0]!, raid.enemy)).toEqual({ powerSpot: 'x', times: 1.1 })
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
    expect(s.enemy.talent).toBe('extraReroll')
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
      expect.objectContaining({ kind: 'talent', how: 'candy', talent: 'extraReroll' }),
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
  it("Pay Day and Amulet Coin add to a trainer's ₽; Regenerator heals after the win", () => {
    const area = on.areas.find((a) => a.trainerPool.length > 0)!
    const plain = saveWith([{ dex: 52, level: 30 }], never)
    const meowth = saveWith([{ dex: 52, level: 30, talent: true }])
    const input = { areaId: area.id, kind: 'trainer' as const, enemyDex: 19, enemyLevel: 20, fighterUid: '' }
    const gold = (s: SaveData, d: GameData) =>
      applyVictory(s, { ...input, fighterUid: s.team[0]! }, d, createRng(1), 0, newId).save.gold - s.gold
    expect(gold(meowth, on)).toBe(Math.round(gold(plain, never) * 1.1))
    const hurt = saveWith([{ dex: 114, level: 30, talent: true }])
    hurt.box[0]!.currentHp = 10
    expect(talentOf(on, hurt.box[0]!)).toBe('regenerator')
    const won = applyVictory(
      hurt,
      { ...input, kind: 'wild', fighterUid: hurt.team[0]! },
      on,
      createRng(1),
      0,
      newId,
    )
    expect(won.events).toContainEqual(expect.objectContaining({ kind: 'regenerator' }))
  })

  it('Pickup sometimes finds one of the area\u2019s items after a win, for the find screen to show', () => {
    const area = on.areas.find((a) => a.lootPool.some((e) => !e.unique && e.itemKey !== 'money'))!
    const zig = saveWith([{ dex: 263, level: 30, talent: true }])
    const input = {
      areaId: area.id,
      kind: 'wild' as const,
      enemyDex: 19,
      enemyLevel: 5,
      fighterUid: zig.team[0]!,
    }
    const events = Array.from({ length: 200 }, (_, i) =>
      applyVictory(zig, input, on, createRng(i), 0, newId).events.find((e) => e.kind === 'pickup'),
    ).filter(Boolean)
    expect(events.length).toBeGreaterThan(0)
    expect(events.length).toBeLessThan(40)
    const found = events[0]!
    expect(found).toMatchObject({ kind: 'pickup', uid: zig.team[0], dex: 263 })
    // Only an item the area can give, never a once-only find; nothing is added to the bag here.
    expect(area.lootPool.some((e) => found.kind === 'pickup' && e.id === found.entryId && !e.unique)).toBe(
      true,
    )
  })

  it('Daycare Darling earns more Day Care XP', () => {
    const since = 0
    const now = 24 * 3_600_000
    const inst = { id: 'x', dex: 69, level: 5, xp: 0, currentHp: 1, caughtAt: 0, talent: true }
    expect(dayCareXp({ since, inst }, now, on)).toBe(Math.floor(dayCareXp({ since }, now, on) * 1.5))
  })
})

describe('the full set (2026-10-30): real names, combos, statuses, guards', () => {
  const duel = (mine: Partial<Battler> = {}, foe: Partial<Battler> = {}): BattleState => {
    const s = createBattle(
      {
        kind: 'wild',
        team: [{ uid: 'a', dex: 4, level: 50, hp: 9999 }],
        enemy: { dex: 129, level: 80 },
        playerLevels: L1,
        enemyLevels: L1,
      },
      on,
    ).state
    return {
      ...s,
      player: [{ ...s.player[0]!, ...mine }],
      enemy: { ...s.enemy, ...foe },
      phase: 'player_reroll',
      actor: 'player',
      dice: [die('fire', 3), die('fire', 5)],
      selected: [false, false],
    }
  }
  const attack = (s: BattleState, seed = 1) => reduce(s, { t: 'ATTACK' }, on, createRng(seed))

  it('Skill Link pays every combo a level up, past level 10 too', () => {
    expect(comboBonus('pair', 10, on)).toBe(11)
    expect(comboBonus('pair', 10, on, 1)).toBe(12)
    expect(comboBonus('three_kind', 10, on, 1)).toBe(26)
    expect(comboBonus('five_kind', 99, on, 1)).toBe(75)
    expect(comboBonus('pair', 99, on)).toBe(11)
    const roll = [die('fire', 6), die('fire', 6), die('fire', 2)]
    const plain = computeDamage(roll, ['fire'], ['normal'], L1, on)
    const linked = computeDamage(roll, ['fire'], ['normal'], L1, on, undefined, {
      talent: 'skillLink',
      comboUp: 1,
    })
    expect(linked.combo!.bonus).toBe(comboBonus('pair', 2, on))
    expect(linked.final).toBeGreaterThan(plain.final)
    expect(linked.talent?.key).toBe('skillLink')
  })

  it('Triple Pro and Fours Pro boost their own combo only', () => {
    const three = [die('fire', 4), die('fire', 4), die('fire', 4)]
    const plain = computeDamage(three, ['fire'], ['normal'], L1, on)
    const pro = { talent: 'triplePro' as const, comboTimes: { key: 'three_kind' as const, times: 1.1 } }
    expect(computeDamage(three, ['fire'], ['normal'], L1, on, undefined, pro).final).toBe(
      Math.round(plain.final * 1.1),
    )
    const fours = { talent: 'foursPro' as const, comboTimes: { key: 'four_kind' as const, times: 1.25 } }
    expect(computeDamage(three, ['fire'], ['normal'], L1, on, undefined, fours).final).toBe(plain.final)
    const s = duel({ talent: 'foursPro' })
    expect(attackModsFor(s, s.player[0]!, s.enemy)).toEqual({
      talent: 'foursPro',
      comboTimes: { key: 'four_kind', times: 1.25 },
    })
  })

  it('Guts boosts while it has a status; Intimidate and Disguise soften the hits it takes', () => {
    const s = duel({ talent: 'guts' })
    expect(attackModsFor(s, s.player[0]!, s.enemy)).toBeUndefined()
    const hurt = { ...s.player[0]!, status: { ...s.player[0]!.status, poison: { turns: 2 } } }
    expect(attackModsFor(s, hurt, s.enemy)).toEqual({ talent: 'guts', times: 1.25 })

    const scary = duel({}, { talent: 'intimidate' })
    expect(attackModsFor(scary, scary.player[0]!, scary.enemy)).toMatchObject({ guardTimes: 0.8 })
    expect(attackModsFor(scary, { ...scary.player[0]!, attacks: 2 }, scary.enemy)).toBeUndefined()

    const mimic = duel({}, { talent: 'disguise' })
    const first = attack(mimic)
    expect(first.log).toContainEqual(expect.objectContaining({ kind: 'talent', talent: 'disguise' }))
    expect(first.state.enemy.talentSpent).toContain('disguise')
    expect(attackModsFor(first.state, first.state.player[0]!, first.state.enemy)).toBeUndefined()
  })

  it('Shell Bell heals from its hit; Rough Skin hurts the attacker back, unless Magic Guard', () => {
    const bell = duel({ talent: 'shellBell', hp: 10 })
    const healed = attack(bell)
    expect(healed.log).toContainEqual(expect.objectContaining({ kind: 'talent', talent: 'shellBell' }))
    expect(healed.state.player[0]!.hp).toBeGreaterThan(10)

    const spiky = duel({}, { talent: 'roughSkin' })
    const before = spiky.player[0]!.hp
    const out = attack(spiky)
    const entry = out.log.find((e) => e.kind === 'talent' && e.talent === 'roughSkin')
    expect(entry).toMatchObject({ ally: 'a', hurt: { uid: 'a' } })
    expect(out.state.player[0]!.hp).toBeLessThan(before)
    const guarded = attack(duel({ talent: 'magicGuard' }, { talent: 'roughSkin' }))
    expect(guarded.state.player[0]!.hp).toBe(before)
  })

  it('Static may paralyse the attacker, never one with Limber', () => {
    const tries = Array.from({ length: 200 }, (_, i) => attack(duel({}, { talent: 'static' }), i))
    const zapped = tries.filter((r) => r.state.player[0]!.status.paralyze > 0).length
    expect(zapped).toBeGreaterThan(0)
    expect(zapped).toBeLessThan(60)
    const limber = Array.from({ length: 200 }, (_, i) =>
      attack(duel({ talent: 'limber' }, { talent: 'static' }), i),
    )
    expect(limber.every((r) => r.state.player[0]!.status.paralyze === 0)).toBe(true)
  })

  it('Limber shrugs off a paralysing roll', () => {
    const s = {
      ...duel({}, { talent: 'limber' }),
      dice: [sdie('electric', 'paralyze'), sdie('electric', 'paralyze')],
    }
    const out = attack(s)
    expect(out.state.enemy.status.paralyze).toBe(0)
    expect(out.log).toContainEqual(expect.objectContaining({ kind: 'talent', talent: 'limber' }))
  })

  it('Poison Heal turns poison into a heal; Magic Guard takes no status damage', () => {
    const sick = (talent: TalentKey) =>
      duel({}, { talent, hp: 50, status: { ...emptyStatus(), poison: { turns: 3 } } })
    const healed = attack(sick('poisonHeal'))
    expect(healed.state.enemy.hp).toBeGreaterThan(50 - 20)
    expect(healed.log).toContainEqual(expect.objectContaining({ kind: 'talent', talent: 'poisonHeal' }))
    expect(healed.log.some((e) => e.kind === 'status_tick')).toBe(false)
    const guard = attack(sick('magicGuard'))
    expect(guard.log).toContainEqual(expect.objectContaining({ kind: 'talent', talent: 'magicGuard' }))
    expect(guard.log.some((e) => e.kind === 'status_tick')).toBe(false)
  })

  it('Pressure takes a reroll from a foe that faces it, once', () => {
    const s = duel({ talent: 'pressure' })
    const out = attack(s)
    expect(out.state.enemy.rerollsLeft).toBe(s.enemy.rerollsLeft - 1)
    expect(out.log).toContainEqual(
      expect.objectContaining({ kind: 'talent', talent: 'pressure', ally: s.enemy.uid }),
    )
  })

  it('Shed Skin sometimes sheds its status at the end of its turn', () => {
    const sick = duel({ talent: 'shedSkin', status: { ...emptyStatus(), poison: { turns: 3 } } })
    const shed = Array.from({ length: 100 }, (_, i) => attack(sick, i)).filter((r) =>
      r.log.some((e) => e.kind === 'talent' && e.talent === 'shedSkin'),
    ).length
    expect(shed).toBeGreaterThan(10)
    expect(shed).toBeLessThan(60)
  })

  it('Friend Guard softens the hits on its partner in a double battle', () => {
    const s = createBattle(
      {
        kind: 'wild',
        team: [
          { uid: 'a', dex: 25, level: 30, hp: 99 },
          { uid: 'b', dex: 35, level: 30, hp: 99, talent: 'friendGuard' },
        ],
        enemy: { dex: 19, level: 5 },
        double: {
          foes: [
            { dex: 19, level: 5 },
            { dex: 16, level: 5 },
          ],
          leadUids: ['a', 'b'],
        },
        playerLevels: L1,
        enemyLevels: L1,
      },
      on,
    ).state
    const foe = s.double!.foes[0]!
    expect(attackModsFor(s, foe, s.player[0]!)).toEqual({
      guardTimes: 0.9,
      guards: [{ key: 'friendGuard', uid: 'b' }],
    })
    expect(attackModsFor(s, foe, s.player[1]!)).toBeUndefined()
  })

  it('Ditto always carries Imposter, those owned before included; Imposter copies the foe', () => {
    expect(familyTalent(on, 132)).toBe('imposter')
    expect(rollTalent(never, 132, createRng(1))).toBe(true)
    const owned = syncTalents(saveWith([{ dex: 132, level: 20 }]), on)
    expect(owned.box[0]!.talent).toBe(true)
    expect(syncTalents(saveWith([{ dex: 132, level: 20 }], off), off).box[0]!.talent).toBeUndefined()
    expect(makeBattler({ uid: 'x', dex: 19, level: 5, hp: 10, talent: 'imposter' }, on).copiesFoe).toBe(true)
  })
})

describe('what the player sees (docs/15 §38)', () => {
  const battle = (talent: TalentKey, foeTalent?: TalentKey) => {
    const s = createBattle(
      {
        kind: 'wild',
        team: [{ uid: 'a', dex: 4, level: 50, hp: 9999, talent }],
        enemy: { dex: 129, level: 80 },
        playerLevels: L1,
        enemyLevels: L1,
      },
      on,
    )
    if (foeTalent) s.state.enemy.talent = foeTalent
    return s
  }

  it('a talent that works on its own is said once, as its Pokémon first acts', () => {
    const { state, log } = battle('quick')
    const said = (l: typeof log) => l.filter((e) => e.kind === 'talent' && e.talent === 'quick' && e.entry)
    let all = [...log]
    let s = state
    for (let i = 0; i < 6 && s.phase !== 'won' && s.phase !== 'lost'; i++) {
      const e =
        s.phase === 'player_roll'
          ? { t: 'ROLL' as const }
          : s.phase === 'player_reroll'
            ? { t: 'ATTACK' as const }
            : { t: 'AI_TURN' as const }
      const r = reduce(s, e, on, createRng(i + 1))
      s = r.state
      all = [...all, ...r.log]
    }
    expect(said(all)).toHaveLength(1)
  })

  it('a talent that changes the hit is said before it lands', () => {
    const { state } = battle('opener')
    const s = {
      ...state,
      phase: 'player_reroll' as const,
      actor: 'player' as const,
      dice: [die('fire', 6), die('fire', 6)],
      selected: [false, false],
    }
    const { log } = reduce(s, { t: 'ATTACK' }, on, createRng(1))
    const said = log.findIndex((e) => e.kind === 'talent' && e.talent === 'opener')
    const hit = log.findIndex((e) => e.kind === 'damage')
    expect(said).toBeGreaterThanOrEqual(0)
    expect(said).toBeLessThan(hit)
  })

  it('Imposter is said as Ditto copies', () => {
    const { log } = createBattle(
      {
        kind: 'wild',
        team: [{ uid: 'a', dex: 132, level: 30, hp: 99, talent: 'imposter' }],
        enemy: { dex: 6, level: 30 },
        playerLevels: L1,
        enemyLevels: L1,
      },
      on,
    )
    const said = log.findIndex((e) => e.kind === 'talent' && e.talent === 'imposter')
    expect(said).toBeGreaterThanOrEqual(0)
    expect(log[said + 1]?.kind).toBe('transform')
  })

  it('Pay Day and Amulet Coin say what they added, for the victory card', () => {
    const area = on.areas.find((a) => a.trainerPool.length > 0)!
    const save = saveWith([
      { dex: 52, level: 40, talent: true },
      { dex: 624, level: 30, talent: true },
    ])
    const won = applyVictory(
      save,
      { areaId: area.id, kind: 'trainer', enemyDex: 19, enemyLevel: 40, fighterUid: save.team[0]! },
      on,
      createRng(1),
      0,
      newId,
    )
    const gold = won.events.filter((e) => e.kind === 'talent_gold')
    expect(gold.map((e) => e.kind === 'talent_gold' && e.talent)).toEqual(['payDay', 'amuletCoin'])
    expect(gold.every((e) => e.kind === 'talent_gold' && e.amount > 0)).toBe(true)
  })
})
