import { describe, expect, it } from 'vitest'
import {
  activeBattler,
  applyVictory,
  asDouble,
  autoStep,
  battleOutcome,
  createBattle,
  createRng,
  emptyProgress,
  foesOnField,
  getInstance,
  isDoubleEncounter,
  newSave,
  ownOnField,
  reduce,
  uniformLevels,
  type BattleState,
  type Encounter,
  type EncounterContext,
  type GameData,
  type LogEntry,
} from '@/engine'
import { data, die, makeData } from '../fixtures'

let n = 0
const newId = () => `id-${++n}`

/** Squirtle (Speed 4) and Bulbasaur (4) with Charmander (6) on the bench, against two Pidgey (5) or a trainer's team. */
function start(foes = [{ dex: 16, level: 5 }, { dex: 16, level: 6 }], kind: 'wild' | 'trainer' = 'wild', d = data) {
  return createBattle(
    {
      kind,
      team: [
        { uid: 'a', dex: 7, level: 10, hp: 999 },
        { uid: 'b', dex: 1, level: 10, hp: 999 },
        { uid: 'c', dex: 4, level: 10, hp: 999 },
      ],
      enemy: foes[0]!,
      double: { foes, leadUids: ['a', 'b'] },
      playerLevels: uniformLevels(1),
      enemyLevels: uniformLevels(1),
    },
    d,
  )
}

const rng = () => createRng(7)

/** Play the foes' turns until it is the player's move (or the battle ends). */
function toPlayer(s: BattleState, r = rng()): { state: BattleState; log: LogEntry[] } {
  const log: LogEntry[] = []
  for (let i = 0; i < 20 && s.phase === 'enemy_turn'; i++) {
    const out = reduce(s, { t: 'AI_TURN' }, data, r)
    s = out.state
    log.push(...out.log)
  }
  return { state: s, log }
}

describe('double battle: the field (docs/31)', () => {
  it('puts both leads and both foes out, and says so in the opening', () => {
    const { state, log } = start()
    expect(ownOnField(state).map((b) => b.uid)).toEqual(['a', 'b'])
    expect(foesOnField(state).map((b) => b.uid)).toEqual(['enemy', 'enemy-1'])
    expect(state.participants).toEqual(['a', 'b'])
    const first = log[0]
    expect(first?.kind === 'start' && first.double).toEqual({ own: ['a', 'b'], foes: ['enemy', 'enemy-1'] })
  })

  it('lets everyone act once a round, fastest first', () => {
    // Charmander (6) and Squirtle (5) against two Pidgey (5): Charmander, then Squirtle (a tie goes to yours), then
    // both Pidgey.
    const r = rng()
    let s = createBattle(
      {
        kind: 'wild',
        team: [
          { uid: 'c', dex: 4, level: 10, hp: 999 },
          { uid: 'a', dex: 7, level: 10, hp: 999 },
        ],
        enemy: { dex: 16, level: 5 },
        double: { foes: [{ dex: 16, level: 5 }, { dex: 16, level: 5 }], leadUids: ['c', 'a'] },
        playerLevels: uniformLevels(1),
        enemyLevels: uniformLevels(1),
      },
      data,
    ).state
    const turns: string[] = []
    const note = (log: LogEntry[]) => log.forEach((e) => e.kind === 'turn' && turns.push(e.uid))
    turns.push(activeBattler(s).uid)
    for (let i = 0; i < 6 && turns.length < 4; i++) {
      if (s.phase === 'player_roll') {
        const out = reduce({ ...s, phase: 'player_reroll', dice: [die('base', 1)], selected: [false] }, { t: 'ATTACK' }, data, r)
        s = out.state
        note(out.log)
      } else {
        const out = reduce(s, { t: 'AI_TURN' }, data, r)
        s = out.state
        note(out.log)
      }
    }
    expect(turns.slice(0, 4)).toEqual(['c', 'a', 'enemy', 'enemy-1'])
  })

  it('attacks the foe picked with TARGET', () => {
    let s = toPlayer(start().state).state
    expect(s.phase).toBe('player_roll')
    const aimed = reduce(s, { t: 'TARGET', uid: 'enemy-1' }, data, rng())
    s = aimed.state
    expect(s.enemy.uid).toBe('enemy-1')
    expect(aimed.log).toContainEqual({ kind: 'focus', own: activeBattler(s).uid, foe: 'enemy-1' })
    const hit = reduce({ ...s, phase: 'player_reroll', dice: [die('base', 3)], selected: [false] }, { t: 'ATTACK' }, data, rng())
    const dmg = hit.log.find((e) => e.kind === 'damage')
    expect(dmg?.kind === 'damage' && dmg.targetUid).toBe('enemy-1')
    // A foe that isn't out (or yours) can't be aimed at.
    expect(reduce(s, { t: 'TARGET', uid: 'a' }, data, rng()).state).toBe(s)
  })

  it('sends the foe at one of yours out, at random', () => {
    const targets = new Set<string>()
    for (let seed = 1; seed < 40; seed++) {
      // Bulbasaur and Caterpie (Speed 4) are slower than the Pidgey (5): a foe opens.
      let s = createBattle(
        {
          kind: 'wild',
          team: [
            { uid: 'a', dex: 1, level: 10, hp: 999 },
            { uid: 'b', dex: 10, level: 10, hp: 999 },
          ],
          enemy: { dex: 16, level: 5 },
          double: { foes: [{ dex: 16, level: 5 }, { dex: 16, level: 5 }] },
          playerLevels: uniformLevels(1),
          enemyLevels: uniformLevels(1),
        },
        data,
      ).state
      expect(s.phase).toBe('enemy_turn')
      const out = reduce(s, { t: 'AI_TURN' }, data, createRng(seed))
      s = out.state
      const dmg = out.log.find((e) => e.kind === 'damage')
      if (dmg?.kind === 'damage') targets.add(dmg.targetUid)
    }
    expect([...targets].sort()).toEqual(['a', 'b'])
  })
})

describe('double battle: K.O.s (docs/31)', () => {
  it("brings the trainer's next Pokémon out in a fallen one's spot, and shares the K.O. with both of yours", () => {
    const { state } = start([{ dex: 16, level: 5 }, { dex: 16, level: 5 }, { dex: 19, level: 5 }], 'trainer')
    let s = toPlayer(state).state
    const target = s.enemy.uid
    s = { ...s, enemy: { ...s.enemy, hp: 1 }, double: { ...s.double!, foes: s.double!.foes.map((f) => (f.uid === target ? { ...f, hp: 1 } : f)) } }
    const out = reduce({ ...s, phase: 'player_reroll', dice: [die('base', 6)], selected: [false] }, { t: 'ATTACK' }, data, rng())
    expect(out.log).toContainEqual({ kind: 'foe_out', uid: 'enemy-2' })
    expect(foesOnField(out.state).map((f) => f.uid)).toContain('enemy-2')
    expect(out.state.double!.kos).toEqual([{ uid: target, dex: 16, level: 5, shiny: false, fighters: ['a', 'b'] }])
  })

  it('asks for a replacement from the bench, then fights on 1 v 2 when the bench is empty', () => {
    let s = toPlayer(start().state).state
    // Squirtle out, at 0 HP after a hit: Charmander waits on the bench.
    const fallen = s.double!.ownSlots.map((i) => s.player[i]!.uid)[0]!
    s = { ...s, player: s.player.map((p) => (p.uid === fallen ? { ...p, hp: 1 } : p)) }
    s = { ...s, phase: 'enemy_turn', activeIndex: s.player.findIndex((p) => p.uid === fallen) }
    let out = { state: s, log: [] as LogEntry[] }
    for (let seed = 1; seed < 200 && out.state.phase !== 'player_switch'; seed++)
      out = reduce({ ...s, enemy: { ...s.enemy, rerollsLeft: 0 } }, { t: 'AI_TURN' }, data, createRng(seed))
    expect(out.state.phase).toBe('player_switch')
    const back = reduce(out.state, { t: 'SWITCH', instanceId: 'c' }, data, rng())
    expect(ownOnField(back.state).map((b) => b.uid)).toContain('c')
    expect(back.log).toContainEqual({ kind: 'switch', uid: 'c', free: true })

    // No one left on the bench: the other one fights both alone.
    const alone = createBattle(
      {
        kind: 'wild',
        team: [
          { uid: 'a', dex: 7, level: 10, hp: 999 },
          { uid: 'b', dex: 1, level: 10, hp: 0 },
        ],
        enemy: { dex: 16, level: 5 },
        double: { foes: [{ dex: 16, level: 5 }, { dex: 16, level: 5 }], leadUids: ['a', 'b'] },
        playerLevels: uniformLevels(1),
        enemyLevels: uniformLevels(1),
      },
      data,
    ).state
    expect(ownOnField(alone).map((b) => b.uid)).toEqual(['a'])
    expect(foesOnField(alone)).toHaveLength(2)
  })

  it('brings a revived one back into an empty spot (yours fought on alone)', () => {
    let s = createBattle(
      {
        kind: 'wild',
        team: [
          { uid: 'a', dex: 7, level: 10, hp: 999 },
          { uid: 'b', dex: 1, level: 10, hp: 0 },
        ],
        enemy: { dex: 16, level: 5 },
        double: { foes: [{ dex: 16, level: 5 }, { dex: 16, level: 5 }], leadUids: ['a', 'b'] },
        playerLevels: uniformLevels(1),
        enemyLevels: uniformLevels(1),
      },
      data,
    ).state
    s = toPlayer(s).state
    expect(s.phase).toBe('player_roll')
    const revive = Object.values(data.items).find((i) => i.effect.kind === 'revive')!
    const out = reduce(s, { t: 'USE_ITEM', key: revive.key, targetUid: 'b' }, data, rng())
    expect(ownOnField(out.state).map((b) => b.uid)).toEqual(['a', 'b'])
    expect(out.state.participants).toContain('b')
  })

  it('is won once every foe is down, with each K.O. in the outcome', () => {
    let s = toPlayer(start().state).state
    s = { ...s, double: { ...s.double!, foes: s.double!.foes.map((f) => ({ ...f, hp: 1 })) } }
    s = { ...s, enemy: s.double!.foes[s.double!.foeIndex]! }
    for (let i = 0; i < 40 && s.phase !== 'won'; i++) {
      if (s.phase === 'player_roll' || s.phase === 'player_reroll')
        s = reduce({ ...s, phase: 'player_reroll', dice: [die('base', 6)], selected: [false] }, { t: 'ATTACK' }, data, rng()).state
      else if (s.phase === 'enemy_turn') s = reduce(s, { t: 'AI_TURN' }, data, rng()).state
      else break
    }
    expect(s.phase).toBe('won')
    expect(battleOutcome(s).kos?.map((k) => k.uid).sort()).toEqual(['enemy', 'enemy-1'])
  })

  it('plays to the end on auto, whatever the seed', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const r = createRng(seed)
      let s = start([{ dex: 16, level: 8 }, { dex: 19, level: 8 }, { dex: 10, level: 8 }], 'trainer').state
      for (let i = 0; i < 2000 && !['won', 'lost', 'fled'].includes(s.phase); i++) s = autoStep(s, data, r).state
      expect(['won', 'lost', 'fled']).toContain(s.phase)
    }
  })
})

describe('double battle: when (docs/31)', () => {
  const on = (config: Partial<GameData['config']> = {}) =>
    makeData({ doubleBattles: { access: 'all', regions: ['hoenn'], wildChance: 100 }, ...config })
  const ctxIn = (d: GameData, region: string): EncounterContext => {
    const area = d.areas.find((a) => a.regionId === region && a.wildPool.length > 0 && !a.hidden && !a.mode)!
    return { area, progress: emptyProgress(), data: d, teamAvgLevel: 10, teamHurt: false, isFirstInArea: false, pokedex: [] }
  }
  const wild: Encounter = { kind: 'wild', dex: 263, level: 5, isNew: true }

  it('is off by default, and leaves the encounter alone', () => {
    const save = newSave(4, data, 0, newId)
    expect(asDouble(wild, ctxIn(data, 'hoenn'), save, rng())).toBe(wild)
  })

  it('pairs a wild Pokémon in a ticked region only, and never in Extreme mode', () => {
    const d = on()
    const save = newSave(4, d, 0, newId)
    const paired = asDouble(wild, ctxIn(d, 'hoenn'), save, rng())
    expect(paired.kind === 'wild' && paired.partner).toBeTruthy()
    expect(isDoubleEncounter(paired)).toBe(true)
    expect(asDouble(wild, ctxIn(d, 'kanto'), save, rng())).toBe(wild)
    expect(asDouble(wild, ctxIn(d, 'hoenn'), { ...save, mode: 'extreme' }, rng())).toBe(wild)
    // 0 %: never.
    const never = on({ doubleBattles: { access: 'all', regions: ['hoenn'], wildChance: 0 } })
    expect(asDouble(wild, ctxIn(never, 'hoenn'), newSave(4, never, 0, newId), rng())).toBe(wild)
  })

  it('makes Tate & Liza fight 2 v 2, and never an Elite Four member', () => {
    const d = on()
    const save = newSave(4, d, 0, newId)
    const tl = Object.values(d.trainers).find((t) => t.name === 'Tate & Liza')!
    expect(tl.duo).toBe(true)
    const gym: Encounter = { kind: 'gym', trainerId: tl.id, name: tl.name, spriteUrl: null, team: tl.team, role: 'leader', badge: tl.badge, index: 7, total: 8 }
    expect(isDoubleEncounter(asDouble(gym, ctxIn(d, 'hoenn'), save, rng()))).toBe(true)
    const elite = { ...d, trainers: { ...d.trainers, [tl.id]: { ...tl, role: 'elite' as const } } }
    expect(isDoubleEncounter(asDouble({ ...gym, role: 'elite' }, ctxIn(elite, 'hoenn'), save, rng()))).toBe(false)
    // The Elite Rebattle never.
    expect(isDoubleEncounter(asDouble({ ...gym, rebattle: { regionId: 'hoenn', tier: 0 } }, ctxIn(d, 'hoenn'), save, rng()))).toBe(false)
  })

  it('gives each of the two out the full XP of a K.O.', () => {
    const save = newSave(4, data, 0, newId)
    const area = data.areas.find((a) => a.regionId === 'kanto' && a.wildPool.length > 0)!
    const first = getInstance(save, save.team[0]!)!
    const second = { ...first, id: 'second' }
    const two = { ...save, team: [first.id, second.id], box: [...save.box, second] }
    const input = { areaId: area.id, kind: 'wild' as const, enemyDex: 16, enemyLevel: 5, fighterUid: first.id }
    const solo = applyVictory(two, input, data, rng(), 0, newId)
    const pair = applyVictory(two, { ...input, fighterUids: [first.id, second.id] }, data, rng(), 0, newId)
    const full = (events: typeof solo.events, uid: string) =>
      events.find((e) => e.kind === 'xp' && e.uid === uid && !e.shared)
    const xp = full(solo.events, first.id)
    expect(xp).toBeTruthy()
    expect(full(pair.events, first.id)).toEqual(xp)
    expect(full(pair.events, second.id)).toEqual({ ...xp, uid: second.id })
  })
})
