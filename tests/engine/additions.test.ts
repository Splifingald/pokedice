// Grass Heal faces and Multi EXP.
import { describe, expect, it } from 'vitest'
import {
  applyVictory,
  candidateKeepSets,
  computeDamage,
  createBattle,
  createInstance,
  createRng,
  multiExpShareFor,
  newSave,
  reduce,
  statusesFromRoll,
  uniformLevels,
  type SaveData,
} from '@/engine'
import { data, die, makeData, newId, sdie } from '../fixtures'
import { multiExpText } from '@/i18n/text'

describe('Grass Heal face', () => {
  it('the Grass die is 1, 2, Heal, 4, 5, 6 and Heal is worth 3', () => {
    const faces = data.diceTypes.grass.faces
    expect(faces.map((f) => (f.kind === 'status' ? f.status : f.value))).toEqual([1, 2, 'heal', 4, 5, 6])
    expect(computeDamage([sdie('grass', 'heal')], ['grass'], [], uniformLevels(1), data).perDie[0]!.value).toBe(3)
  })

  it('needs a pair of Heal faces, then heals the total value of the dice rolled', () => {
    expect(statusesFromRoll([sdie('grass', 'heal'), die('grass', 6)], data)).toEqual([])
    const roll = [sdie('grass', 'heal'), sdie('grass', 'heal'), die('base', 5)]
    expect(statusesFromRoll(roll, data)).toEqual([{ status: 'heal', amount: 3 + 3 + 5 }])
  })

  it('can heal by the Heal faces only (admin option)', () => {
    const d = makeData({ status: { ...data.config.status, heal: { threshold: 2, amount: 'healFaces' } } })
    const roll = [sdie('grass', 'heal', d), sdie('grass', 'heal', d), die('base', 5, d)]
    expect(statusesFromRoll(roll, d)).toEqual([{ status: 'heal', amount: 6 }])
  })

  it('heals the attacker on top of the damage, capped at max HP', () => {
    const { state } = createBattle(
      {
        kind: 'wild',
        team: [{ uid: 'b', dex: 1, level: 20, hp: 10 }],
        enemy: { dex: 74, level: 5 },
        playerLevels: uniformLevels(1),
        enemyLevels: uniformLevels(1),
      },
      data,
    )
    const s = { ...state, phase: 'player_reroll' as const, dice: [sdie('grass', 'heal'), sdie('grass', 'heal')], selected: [false, false] }
    s.enemy = { ...s.enemy, hp: 500, maxHp: 500 }
    const r = reduce(s, { t: 'ATTACK' }, data, createRng(1))
    const kinds = r.log.map((l) => l.kind)
    expect(kinds.indexOf('damage')).toBeLessThan(kinds.indexOf('heal'))
    expect(r.log.find((l) => l.kind === 'heal')).toMatchObject({ side: 'player', uid: 'b', amount: 6, hpAfter: 16 })
    expect(r.log.some((l) => l.kind === 'status')).toBe(false) // heal never lands on the defender

    const full = { ...s, player: s.player.map((p) => ({ ...p, hp: p.maxHp })) }
    expect(reduce(full, { t: 'ATTACK' }, data, createRng(1)).log.some((l) => l.kind === 'heal')).toBe(false)
  })

  it('the AI always keeps a satisfied pair of Heal faces', () => {
    const roll = [sdie('grass', 'heal'), sdie('grass', 'heal'), die('grass', 1), die('base', 1)]
    for (const keep of candidateKeepSets(roll, data)) expect(keep.slice(0, 2)).toEqual([true, true])
  })
})

describe('Multi EXP', () => {
  const area = data.areas[0]!
  function teamOfThree(multiExp = true, benchHp?: number): SaveData {
    const s = newSave(4, data, 0, newId)
    const a = createInstance(16, 5, data, 'bench-a', 0)
    const b = createInstance(19, 5, data, 'bench-b', 0)
    return {
      ...s,
      box: [...s.box, a, { ...b, currentHp: benchHp ?? b.currentHp }],
      team: [...s.team, a.id, b.id],
      pokedex: [4, 16, 19],
      settings: { ...s.settings, multiExp },
    }
  }
  const win = (save: SaveData, d = data) =>
    applyVictory(save, { areaId: area.id, kind: 'wild', enemyDex: 16, enemyLevel: 10, fighterUid: save.team[0]! }, d, createRng(1), 1, newId)

  it('gives team members who did not fight 30 % of the XP; the fighter keeps 100 %', () => {
    const r = win(teamOfThree())
    const xp = r.events.filter((e) => e.kind === 'xp')
    expect(xp).toEqual([
      { kind: 'xp', uid: r.save.team[0], amount: 10 },
      { kind: 'xp', uid: 'bench-a', amount: 3, shared: true },
      { kind: 'xp', uid: 'bench-b', amount: 3, shared: true },
    ])
  })

  it('skips fainted bench members', () => {
    const r = win(teamOfThree(true, 0))
    expect(r.events.filter((e) => e.kind === 'xp').map((e) => (e as { uid: string }).uid)).not.toContain('bench-b')
  })

  it('is off when the player toggles it off, or when the admin share is 0', () => {
    expect(win(teamOfThree(false)).events.filter((e) => e.kind === 'xp')).toHaveLength(1)
    const d = makeData({ multiExpShare: 0 })
    expect(win(teamOfThree(true), d).events.filter((e) => e.kind === 'xp')).toHaveLength(1)
  })

  it('gives more to Pokémon far behind the fighter: +5 % per level, up to 100 %', () => {
    expect(multiExpShareFor(30, 30, data)).toBeCloseTo(0.3)
    expect(multiExpShareFor(30, 35, data)).toBeCloseTo(0.3) // ahead of the fighter: the base share
    expect(multiExpShareFor(30, 25, data)).toBeCloseTo(0.55)
    expect(multiExpShareFor(30, 16, data)).toBeCloseTo(1)
    expect(multiExpShareFor(30, 10, data)).toBeCloseTo(1) // capped
    expect(multiExpShareFor(30, 10, makeData({ multiExpMaxShare: 0.6 }))).toBeCloseTo(0.6)
    expect(multiExpShareFor(30, 10, makeData({ multiExpGapBonus: 0 }))).toBeCloseTo(0.3)
    expect(multiExpText(data)).toBe("30 % of the XP, +5 % for each level they're behind the fighter (up to 100 %)")
  })

  it('shares by the level gap from before the K.O., the fighter never out-earned', () => {
    // Fighter Lv.30, bench Lv.5 and Lv.25; a Lv.20 foe gives 20 XP.
    const s = teamOfThree()
    const strong = { ...s, box: s.box.map((p) => (p.id === s.team[0] ? { ...p, level: 30 } : p.id === 'bench-b' ? { ...p, level: 25 } : p)) }
    const r = applyVictory(strong, { areaId: area.id, kind: 'wild', enemyDex: 16, enemyLevel: 20, fighterUid: s.team[0]! }, data, createRng(1), 1, newId)
    expect(r.events.filter((e) => e.kind === 'xp')).toEqual([
      { kind: 'xp', uid: s.team[0], amount: 20 },
      { kind: 'xp', uid: 'bench-a', amount: 20, shared: true }, // 25 levels behind: capped at 100 %
      { kind: 'xp', uid: 'bench-b', amount: 11, shared: true }, // 5 behind: 55 %
    ])
  })

  it('never rounds a share down to nothing', () => {
    const s = teamOfThree()
    const r = applyVictory(s, { areaId: area.id, kind: 'wild', enemyDex: 16, enemyLevel: 2, fighterUid: s.team[0]! }, data, createRng(1), 1, newId)
    expect(r.events.filter((e) => e.kind === 'xp' && e.shared).every((e) => (e as { amount: number }).amount === 1)).toBe(true)
  })
})
