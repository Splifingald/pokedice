import { describe, expect, it } from 'vitest'
import {
  activeBattler,
  attackMultiplier,
  createBattle,
  createRng,
  evolutionGate,
  enemyPlanFor,
  formChoices,
  gmaxChoices,
  gmaxUnlocked,
  levelEvolutions,
  megaChoices,
  megaUnlocked,
  nationalDex,
  newSave,
  reduce,
  regionSpecies,
  speciesAllowedIn,
  stoneEvolution,
  uniformLevels,
  type BattleState,
  type PokemonInstance,
  type SaveData,
} from '@/engine'
import { data } from '../fixtures'

const rng = createRng(1)
let n = 0
const newId = () => `id${++n}`
const mon = (dex: number, level: number): PokemonInstance => ({ id: 'm', dex, level, xp: 0, currentHp: 1, caughtAt: 0 })

function battle(lead: { dex: number; level: number; hp?: number }, enemy = { dex: 19, level: 5 }, megaAllowed = true) {
  return createBattle(
    {
      kind: 'wild',
      team: [{ uid: 'a', dex: lead.dex, level: lead.level, hp: lead.hp ?? 9999 }],
      leadUid: 'a',
      enemy,
      playerLevels: uniformLevels(1),
      enemyLevels: uniformLevels(1),
      megaAllowed,
    },
    data,
  ).state
}
const playerTurn = (s: BattleState): BattleState => ({ ...s, phase: 'player_roll', actor: 'player', dice: [], selected: [] })

describe('regional forms', () => {
  it('are species of their own, numbered after their National Dex entry', () => {
    const rattata = data.species[10091]!
    expect(rattata.name).toBe('Alolan Rattata')
    expect([rattata.type1, rattata.type2]).toEqual(['dark', 'normal'])
    expect(rattata.form).toEqual({ of: 19, kind: 'regional', region: 'alola' })
    expect(nationalDex(data, 10091)).toBe(19)
    expect(nationalDex(data, 19)).toBe(19)
  })

  it('can each be had in their own region: the first of every line is caught there', () => {
    for (const s of data.speciesList.filter((x) => x.form?.kind === 'regional')) {
      expect(regionSpecies(data, s.form!.region!).has(s.dex), s.name).toBe(true)
    }
    // …and never in a region before their own.
    expect(regionSpecies(data, 'kanto').has(10091)).toBe(false)
    expect(speciesAllowedIn(data, 'kalos')(10091)).toBe(false)
    expect(speciesAllowedIn(data, 'alola')(10091)).toBe(true)
  })

  it('evolve into their own forms, and a plain species evolves into one in that region only', () => {
    const inAlola = Object.assign(speciesAllowedIn(data, 'alola'), { region: 'alola' })
    const inKanto = Object.assign(speciesAllowedIn(data, 'kanto'), { region: 'kanto' })
    expect(stoneEvolution(mon(25, 20), 'thunder-stone', data, inAlola)).toBe(10100)
    expect(stoneEvolution(mon(25, 20), 'thunder-stone', data, inKanto)).toBe(26)
    expect(levelEvolutions(mon(104, 28), data, inAlola).map((e) => e.toDex)).toEqual([10115])
    expect(levelEvolutions(mon(104, 28), data, inKanto).map((e) => e.toDex)).toEqual([105])
    expect(levelEvolutions(mon(10091, 20), data, inAlola).map((e) => e.toDex)).toEqual([10092])
    // The Galarian forms carry the Gen 8 evolutions the plain species used to.
    const inGalar = Object.assign(speciesAllowedIn(data, 'galar'), { region: 'galar' })
    expect(levelEvolutions(mon(10161, 28), data, inGalar).map((e) => e.toDex)).toEqual([863])
    expect(levelEvolutions(mon(52, 28), data, inGalar).map((e) => e.toDex)).toEqual([53])
    // Bergmite lives in Galar as itself: there it may become either Avalugg.
    expect(levelEvolutions(mon(712, 37), data, inGalar).map((e) => e.toDex).sort((a, b) => a - b)).toEqual([713, 10243])
  })

  it('reads the region off the save', () => {
    const s = newSave(7, data, 1, newId)
    expect(evolutionGate(s, data).region).toBe('kanto')
  })
})

describe('Mega Evolution', () => {
  const withKalos = (s: SaveData): SaveData => ({ ...s, parked: { ...s.parked, kalos: { ...s, region: undefined } as never } })

  it('opens once the player has reached Kalos', () => {
    const s = newSave(7, data, 1, newId)
    expect(megaUnlocked(s, data)).toBe(false)
    expect(megaUnlocked(withKalos(s), data)).toBe(true)
    expect(megaUnlocked({ ...s, region: 'alola' }, data)).toBe(true)
  })

  it('needs Lv.50 and the feature on', () => {
    expect(megaChoices(playerTurn(battle({ dex: 3, level: 49 })), data)).toEqual([])
    expect(megaChoices(playerTurn(battle({ dex: 3, level: 50 }, undefined, false)), data)).toEqual([])
    expect(megaChoices(playerTurn(battle({ dex: 3, level: 50 })), data).map((m) => m.dex)).toEqual([10033])
    expect(megaChoices(playerTurn(battle({ dex: 6, level: 60 })), data).map((m) => m.name)).toEqual(['Mega Charizard X', 'Mega Charizard Y'])
  })

  it('adds a die of the type it gains, once per battle, for the rest of the battle', () => {
    let s = playerTurn(battle({ dex: 6, level: 60 }))
    const before = activeBattler(s).dice.length
    const r = reduce(s, { t: 'MEGA', toDex: 10034 }, data, rng)
    s = r.state
    const a = activeBattler(s)
    expect(a.dex).toBe(10034)
    expect(a.name).toBe('Mega Charizard X')
    expect(a.types).toEqual(['fire', 'dragon'])
    expect(a.dice).toHaveLength(before + 1)
    expect(a.dice.filter((d) => d === 'dragon')).toHaveLength(1)
    expect(r.log).toContainEqual(expect.objectContaining({ kind: 'form', reason: 'mega', toDex: 10034, die: 'dragon' }))
    // It doesn't take the turn, and there is no second one.
    expect(s.phase).toBe('player_roll')
    expect(megaChoices(s, data)).toEqual([])
    expect(reduce(s, { t: 'MEGA', toDex: 10035 }, data, rng).state).toBe(s)
  })

  it('adds the first type when it gains none, and throws the new die with a hand already rolled', () => {
    let s = playerTurn(battle({ dex: 3, level: 50 }))
    s = reduce(s, { t: 'ROLL' }, data, rng).state
    const hand = s.dice.length
    s = reduce(s, { t: 'MEGA', toDex: 10033 }, data, rng).state
    expect(s.dice).toHaveLength(hand + 1)
    expect(s.selected).toHaveLength(hand + 1)
    expect(activeBattler(s).dice.filter((d) => d === 'grass').length).toBeGreaterThan(0)
    expect(s.dice.some((d) => d.type === 'grass')).toBe(true)
  })

  it('counts the species it was sent out as, for rewards', () => {
    let s = playerTurn(battle({ dex: 6, level: 60 }))
    s = reduce(s, { t: 'MEGA', toDex: 10035 }, data, rng).state
    expect(activeBattler(s).baseDex).toBe(6)
  })
})

describe('battle forms', () => {
  it('Giratina takes its Origin Forme below half HP, a Ghost die turning Dragon, and leaves it above', () => {
    const full = battle({ dex: 7, level: 50 }, { dex: 487, level: 50 })
    expect(full.enemy.dex).toBe(487)
    const ghosts = full.enemy.dice.filter((d) => d === 'ghost').length
    const low = createBattle(
      {
        kind: 'boss',
        team: [{ uid: 'a', dex: 7, level: 50, hp: 9999 }],
        enemy: { dex: 487, level: 50, hp: 10 },
        playerLevels: uniformLevels(1),
        enemyLevels: uniformLevels(1),
      },
      data,
    ).state
    expect(low.enemy.dex).toBe(10007)
    expect(low.enemy.baseDex).toBe(487)
    expect(low.enemy.dice.filter((d) => d === 'ghost')).toHaveLength(ghosts - 1)
    expect(low.enemy.dice.filter((d) => d === 'dragon')).toHaveLength(full.enemy.dice.filter((d) => d === 'dragon').length + 1)
  })

  it('Giratina healed back over half HP returns to its Altered Forme', () => {
    let s = playerTurn(battle({ dex: 487, level: 30, hp: 30 }))
    expect(activeBattler(s).dex).toBe(10007)
    const r = reduce(s, { t: 'USE_ITEM', key: 'hyper-potion' }, data, rng)
    s = r.state
    expect(activeBattler(s).dex).toBe(487)
    expect(activeBattler(s).dice).toEqual(battle({ dex: 487, level: 30 }).player[0]!.dice)
    expect(r.log).toContainEqual(expect.objectContaining({ kind: 'form', reason: 'lowHp', revert: true }))
  })

  it('Giratina sent out below half HP starts in its Origin Forme', () => {
    const s = battle({ dex: 487, level: 60, hp: 10 })
    expect(activeBattler(s).dex).toBe(10007)
    expect(activeBattler(s).dice).toContain('dragon')
  })

  it('Arceus changes type from a menu, every die with it, once a battle', () => {
    let s = playerTurn(battle({ dex: 493, level: 80 }))
    const opts = formChoices(s, data)
    expect(opts).toHaveLength(17)
    const fire = opts.find((f) => f.type1 === 'fire')!
    s = reduce(s, { t: 'CHANGE_FORM', toDex: fire.dex }, data, rng).state
    const a = activeBattler(s)
    expect(a.types).toEqual(['fire'])
    expect(new Set(a.dice)).toEqual(new Set(['fire']))
    expect(a.dice).toHaveLength(6)
    expect(formChoices(s, data)).toEqual([])
    expect(reduce(s, { t: 'CHANGE_FORM', toDex: 493 }, data, rng).state).toBe(s)
  })

  it('Silvally has the same menu, and Ogerpon its masks, its dice taking the mask’s type', () => {
    expect(formChoices(playerTurn(battle({ dex: 773, level: 60 })), data)).toHaveLength(17)
    let s = playerTurn(battle({ dex: 1017, level: 70 }))
    const masks = formChoices(s, data)
    expect(masks.map((m) => m.dex).sort((a, b) => a - b)).toEqual([10273, 10274, 10275])
    s = reduce(s, { t: 'CHANGE_FORM', toDex: 10274 }, data, rng).state
    expect(activeBattler(s).types).toEqual(['grass', 'fire'])
    expect(new Set(activeBattler(s).dice)).toEqual(new Set(['fire']))
  })

  it('Darmanitan, Zygarde, Wishiwashi and Minior change form below half HP too', () => {
    for (const [dex, form, gains] of [
      [555, 10017, 'psychic'],
      [10177, 10178, 'fire'],
      [718, 10120, 'dragon'],
      [774, 10136, 'flying'],
    ] as const) {
      const s = battle({ dex, level: 60, hp: 5 })
      expect(activeBattler(s).dex, String(dex)).toBe(form)
      expect(activeBattler(s).dice, String(dex)).toContain(gains)
    }
  })
})

describe('Gigantamax', () => {
  const gmaxBattle = (megaToo = false) =>
    playerTurn({ ...battle({ dex: 6, level: 60 }), gmaxAllowed: true, megaAllowed: megaToo || undefined })

  it('adds a die for three of its turns, then it shrinks back', () => {
    let s = gmaxBattle()
    const dice = activeBattler(s).dice.length
    expect(gmaxChoices(s, data).map((f) => f.dex)).toEqual([10196])
    s = reduce(s, { t: 'GMAX', toDex: 10196 }, data, rng).state
    expect(activeBattler(s).dex).toBe(10196)
    expect(activeBattler(s).dice).toHaveLength(dice + 1)
    let turns = 0
    const r = createRng(9)
    // Both sides kept standing so the turns can be counted.
    const tough = (x: BattleState): BattleState => ({
      ...x,
      enemy: { ...x.enemy, hp: 99999, maxHp: 99999 },
      player: x.player.map((p) => ({ ...p, hp: 99999, maxHp: 99999 })),
    })
    for (let i = 0; i < 200 && activeBattler(s).gmax; i++) {
      s = tough(s)
      if (s.phase === 'player_roll') s = reduce(s, { t: 'ROLL' }, data, r).state
      else if (s.phase === 'player_reroll') {
        s = reduce(s, { t: 'ATTACK' }, data, r).state
        turns++
      } else if (s.phase === 'enemy_turn') s = reduce(s, { t: 'AI_TURN' }, data, r).state
      else if (s.phase === 'player_stunned') {
        s = reduce(s, { t: 'PASS' }, data, r).state
        turns++
      } else break
    }
    expect(turns).toBe(data.config.gigantamax.turns)
    expect(activeBattler(s).dex).toBe(6)
    expect(activeBattler(s).dice).toHaveLength(dice)
  })

  it('shares the Mega’s one per battle', () => {
    let s = gmaxBattle(true)
    expect(megaChoices(s, data).length).toBeGreaterThan(0)
    s = reduce(s, { t: 'GMAX', toDex: 10196 }, data, rng).state
    expect(megaChoices(s, data)).toEqual([])
    let t = gmaxBattle(true)
    t = reduce(t, { t: 'MEGA', toDex: 10034 }, data, rng).state
    expect(gmaxChoices(t, data)).toEqual([])
  })

  it('opens with Galar', () => {
    const s = newSave(7, data, 1, newId)
    expect(gmaxUnlocked(s, data)).toBe(false)
    expect(gmaxUnlocked({ ...s, region: 'galar' }, data)).toBe(true)
  })
})

describe('auto battles and foes', () => {
  it('an auto battle has no Mega, Gigantamax or type change, on either side', () => {
    const s = createBattle(
      {
        kind: 'trainer',
        team: [{ uid: 'a', dex: 493, level: 80, hp: 9999 }],
        enemy: { dex: 6, level: 60 },
        playerLevels: uniformLevels(1),
        enemyLevels: uniformLevels(1),
        megaAllowed: true,
        gmaxAllowed: true,
        enemyPlan: { mega: 10034 },
        auto: true,
      },
      data,
    ).state
    const p = playerTurn(s)
    expect(megaChoices(p, data)).toEqual([])
    expect(formChoices(p, data)).toEqual([])
    expect(s.enemyPlan).toBeUndefined()
  })

  it('a trainer’s ace Mega Evolves in the regions that have it, once the player has it too', () => {
    const kanto = newSave(7, data, 1, newId)
    const kalos = { ...kanto, region: 'kalos' }
    const ace = { regionId: 'kalos', role: 'champion' as const, ace: true }
    expect(enemyPlanFor(kalos, data, { dex: 282, level: 66 }, ace)).toEqual({ mega: 10051 })
    // Not the ace, a plain trainer, too low, a region without Megas, or the player without them: no.
    expect(enemyPlanFor(kalos, data, { dex: 282, level: 66 }, { ...ace, ace: false })).toBeNull()
    expect(enemyPlanFor(kalos, data, { dex: 282, level: 66 }, { ...ace, role: 'trainer' })).toBeNull()
    expect(enemyPlanFor(kalos, data, { dex: 282, level: 40 }, ace)).toBeNull()
    expect(enemyPlanFor(kalos, data, { dex: 282, level: 66 }, { ...ace, regionId: 'paldea' })).toBeNull()
    expect(enemyPlanFor(kanto, data, { dex: 282, level: 66 }, { ...ace, regionId: 'hoenn' })).toBeNull()
    // Galar's leaders Gigantamax instead.
    const galar = { ...kanto, region: 'galar' }
    expect(enemyPlanFor(galar, data, { dex: 6, level: 65 }, { ...ace, regionId: 'galar' })).toEqual({ gmax: 10196 })
    // A type changer picks its type wherever it is.
    expect(enemyPlanFor(kanto, data, { dex: 493, level: 80 }, null)).toEqual({ formChanges: true })
  })

  it('the foe’s plan happens on its first turn: a Mega, and a type picked against yours', () => {
    let s = createBattle(
      {
        kind: 'trainer',
        team: [{ uid: 'a', dex: 94, level: 60, hp: 9999 }],
        enemy: { dex: 6, level: 60 },
        playerLevels: uniformLevels(1),
        enemyLevels: uniformLevels(1),
        enemyPlan: { mega: 10035 },
      },
      data,
    ).state
    s = { ...s, phase: 'enemy_turn', actor: 'enemy' }
    const r = reduce(s, { t: 'AI_TURN' }, data, rng)
    expect(r.log).toContainEqual(expect.objectContaining({ kind: 'form', side: 'enemy', reason: 'mega', toDex: 10035 }))
    // Arceus against a Ghost: Normal can't touch it, so it turns to a type that can.
    let a = createBattle(
      {
        kind: 'boss',
        team: [{ uid: 'a', dex: 94, level: 60, hp: 9999 }],
        enemy: { dex: 493, level: 80 },
        playerLevels: uniformLevels(1),
        enemyLevels: uniformLevels(1),
        enemyPlan: { formChanges: true },
      },
      data,
    ).state
    a = { ...a, phase: 'enemy_turn', actor: 'enemy' }
    const ra = reduce(a, { t: 'AI_TURN' }, data, rng)
    const change = ra.log.find((l) => l.kind === 'form' && l.reason === 'choice')
    expect(change).toBeDefined()
    const type = data.species[(change as { toDex: number }).toDex]!.type1
    expect(attackMultiplier(type, ['ghost', 'poison'], data)).toBeGreaterThan(1)
  })
})
