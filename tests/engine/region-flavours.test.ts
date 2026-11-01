// The region flavours (docs/62): Hoenn's and Galar's weather, Kalos hordes, Alola's island trials, Paldea's Titans.
import { describe, expect, it } from 'vitest'
import {
  asHorde,
  bossCaught,
  challengeEncounter,
  computeDamage,
  createBattle,
  createRng,
  dailyWeather,
  DEFAULT_CONFIG,
  emptyProgress,
  fightBosses,
  foesOnField,
  gymsFor,
  hordeThrowAt,
  hordesThisRound,
  isDoubleEncounter,
  markFlavourSeen,
  newSave,
  noteHorde,
  reduce,
  titanFight,
  titanReward,
  trialFoes,
  trialOf,
  uniformLevels,
  weatherAt,
  weatherPoolTimes,
  weatherRulesDue,
  weatherWear,
  wildOdds,
  type BattleState,
  type Encounter,
  type EncounterContext,
  type GameConfig,
  type LogEntry,
  type SaveData,
} from '@/engine'
import { data, die, makeData } from '../fixtures'

let n = 0
const id = () => `id-${++n}`
const on = { access: 'all' as const }
const allOn: Partial<GameConfig> = {
  hoennWeather: { ...DEFAULT_CONFIG.hoennWeather, ...on },
  galarWeather: { ...DEFAULT_CONFIG.galarWeather, ...on },
  hordes: { ...DEFAULT_CONFIG.hordes, ...on, chance: 100 },
  trials: { ...DEFAULT_CONFIG.trials, ...on },
  titans: { ...DEFAULT_CONFIG.titans, ...on },
}
const live = makeData(allOn)
const area = (name: string, d = live) => d.areas.find((a) => a.name === name)!
const save = (d = live): SaveData => newSave(1, d, 0, id)
const DAY = 86_400_000

describe('the weather (docs/62 §2–4)', () => {
  it('Hoenn: fixed, and Sootopolis takes turns a round each; nothing while the switch is off', () => {
    expect(weatherAt(area('Routes 118 & 119'), live, { now: 0 })).toBe('rain')
    expect(weatherAt(area('Route 111 Desert & Mirage Tower'), live, { now: 0 })).toBe('sand')
    const soot = area('Sootopolis City & the Cave of Origin')
    expect([0, 1, 2].map((round) => weatherAt(soot, live, { now: 0, round }))).toEqual(['sun', 'rain', 'sun'])
    expect(weatherAt(area('Routes 118 & 119', data), data, { now: 0 })).toBeNull()
    expect(weatherAt(area('Route 101'), live, { now: 0 })).toBeNull()
  })

  it('never in Extreme mode', () => {
    expect(weatherAt(area('Routes 118 & 119'), live, { now: 0, save: { ...save(), mode: 'extreme' } })).toBeNull()
  })

  it('Galar: the day’s weather is the same all day for everyone, from its odds, and changes with the day', () => {
    const fields = area('The Wild Area: Rolling Fields & Dappled Grove')
    const day = weatherAt(fields, live, { now: 10 * DAY + 1000 })
    expect(weatherAt(fields, live, { now: 10 * DAY + 80_000_000 })).toBe(day)
    const odds = live.config.galarWeather.areas[fields.id]!.daily!
    const seen = new Set(Array.from({ length: 200 }, (_, i) => dailyWeather(fields.id, i * DAY, odds)))
    expect([...seen].every((w) => (odds[w] ?? 0) > 0)).toBe(true)
    expect(seen.size).toBeGreaterThan(3)
    expect(weatherAt(area('Steamdrift Way & Circhester'), live, { now: 0 })).toBe('snow')
  })

  it('Galar: the day’s weather doubles its types’ weight; Hoenn’s changes no pool', () => {
    const fields = area('The Wild Area: Rolling Fields & Dappled Grove')
    expect(weatherPoolTimes(fields, live, 'rain', ['water'])).toBe(2)
    expect(weatherPoolTimes(fields, live, 'rain', ['fire'])).toBe(1)
    expect(weatherPoolTimes(area('Routes 118 & 119'), live, 'rain', ['water'])).toBe(1)
    const base = { area: fields, progress: emptyProgress(), data: live, pokedex: [] as number[] }
    const plain = wildOdds(base)
    const rain = wildOdds({ ...base, weather: 'rain' })
    plain.forEach((o, i) => {
      const sp = live.species[o.entry.dex]!
      const wet = [sp.type1, sp.type2].some((t) => t === 'water' || t === 'electric' || t === 'bug')
      expect(rain[i]!.weight, sp.name).toBe(wet ? o.weight * 2 : o.weight)
    })
  })

  it('rain: Water attacks ×1.25 for both sides, shown in the damage result', () => {
    const levels = { ...uniformLevels(1), weather: { kind: 'rain' as const, boost: { water: 1.25, fire: 0.75 } } }
    const r = computeDamage([die('water', 5), die('water', 5)], ['water'], ['normal'], levels, data)
    const dry = computeDamage([die('water', 5), die('water', 5)], ['water'], ['normal'], uniformLevels(1), data)
    expect(r.weather).toEqual({ kind: 'rain', type: 'water', multiplier: 1.25 })
    expect(r.final).toBe(Math.round(dry.raw * 1.25))
  })

  it('a battle under a sandstorm wears whoever it doesn’t spare, at their turn; Rock is spared', () => {
    expect(weatherWear('sand', ['rock'], 100)).toBe(0)
    expect(weatherWear('sand', ['water'], 100)).toBe(4)
    expect(weatherWear('rain', ['water'], 100)).toBe(0)
    const { state, log } = createBattle(
      {
        kind: 'wild',
        team: [{ uid: 'a', dex: 7, level: 20, hp: 999 }],
        enemy: { dex: 74, level: 20 },
        playerLevels: uniformLevels(1),
        enemyLevels: uniformLevels(1),
        weather: 'sand',
      },
      data,
    )
    expect(state.weather).toBe('sand')
    // The first to act (Squirtle is faster than Geodude) loses 4 % at once; Geodude never does.
    const worn = log.filter((e) => e.kind === 'weather_tick')
    expect(worn).toEqual([{ kind: 'weather_tick', target: 'player', targetUid: 'a', weather: 'sand', amount: Math.max(1, Math.round(state.player[0]!.maxHp * 0.04)), hpAfter: state.player[0]!.hp }])
  })

  it('rain puts its × on both sides’ levels; no weather, none', () => {
    const opts = {
      kind: 'wild' as const,
      team: [{ uid: 'a', dex: 7, level: 20, hp: 999 }],
      enemy: { dex: 74, level: 20 },
      playerLevels: uniformLevels(1),
      enemyLevels: uniformLevels(1),
    }
    const wet = createBattle({ ...opts, weather: 'rain' }, data).state
    expect(wet.playerLevels.weather?.kind).toBe('rain')
    expect(wet.enemyLevels.weather?.kind).toBe('rain')
    expect(createBattle(opts, data).state.playerLevels.weather).toBeUndefined()
  })

  it('the rules are due once per region, in an area with weather', () => {
    const s = { ...save(), currentAreaId: area('Routes 118 & 119').id }
    expect(weatherRulesDue(s, live, 0)).toBe(true)
    expect(weatherRulesDue(markFlavourSeen(s, 'hoennWeather'), live, 0)).toBe(false)
    expect(weatherRulesDue({ ...s, currentAreaId: area('Route 101').id }, live, 0)).toBe(false)
  })
})

/** A Kalos encounter context over a two-Pokémon team. */
function kalos(name = 'Route 3 & Santalune City', d = live): { ctx: EncounterContext; s: SaveData } {
  const s0 = save(d)
  const two = [s0.box[0]!, { ...s0.box[0]!, id: 'second' }]
  const s: SaveData = { ...s0, box: two, team: two.map((p) => p.id) }
  const a = area(name, d)
  const ctx = {
    area: a,
    progress: emptyProgress(),
    data: d,
    teamAvgLevel: 10,
    teamHurt: false,
    isFirstInArea: false,
    pokedex: [],
  } as EncounterContext
  return { ctx, s }
}

describe('Kalos hordes (docs/62 §5)', () => {
  const wildOf = (ctx: EncounterContext): Encounter => {
    const e = [...ctx.area.wildPool].sort((x, y) => y.weight - x.weight)[0]!
    return { kind: 'wild', dex: e.dex, level: 12, isNew: true }
  }

  it('five of a species, three levels down, a double of its own', () => {
    const { ctx, s } = kalos()
    const enc = asHorde(wildOf(ctx), ctx, s, createRng(3))
    expect(enc.kind === 'wild' && enc.horde?.length).toBe(4)
    expect(enc.kind === 'wild' && enc.level).toBe(9)
    expect(isDoubleEncounter(enc)).toBe(true)
  })

  it('never with the switch off, with one able, in another region, or past its limit a round', () => {
    const off = kalos('Route 3 & Santalune City', data)
    expect(asHorde(wildOf(off.ctx), off.ctx, off.s, createRng(3))).toEqual(wildOf(off.ctx))
    const { ctx, s } = kalos()
    const alone = { ...s, team: [s.team[0]!] }
    expect(asHorde(wildOf(ctx), ctx, alone, createRng(3))).toEqual(wildOf(ctx))
    const hoenn = { ...ctx, area: area('Route 101') }
    expect(asHorde(wildOf(hoenn), hoenn, s, createRng(3))).toEqual(wildOf(hoenn))
    const met = noteHorde({ ...s, areaProgress: { [ctx.area.id]: emptyProgress() } }, ctx.area.id)
    expect(hordesThisRound(met.areaProgress[ctx.area.id]!)).toBe(1)
    const full = { ...ctx, progress: met.areaProgress[ctx.area.id]! }
    expect(asHorde(wildOf(full), full, met, createRng(3))).toEqual(wildOf(full))
  })

  it('one throw: the shiny one if there is one, else the last one K.O.’d', () => {
    expect(hordeThrowAt([{ uid: 'a', shiny: false }, { uid: 'b', shiny: true }, { uid: 'c', shiny: false }])?.uid).toBe('b')
    expect(hordeThrowAt([{ uid: 'a', shiny: false }, { uid: 'c', shiny: false }])?.uid).toBe('c')
  })
})

/** Play the foes' turns until it is the player's move (or the battle ends). */
function toPlayer(s: BattleState, r = createRng(7)): { state: BattleState; log: LogEntry[] } {
  const log: LogEntry[] = []
  for (let i = 0; i < 20 && s.phase === 'enemy_turn'; i++) {
    const out = reduce(s, { t: 'AI_TURN' }, data, r)
    s = out.state
    log.push(...out.log)
  }
  return { state: s, log }
}

/** The player's next attack knocks out the foe in front (its HP set to 1). */
function knockFront(s: BattleState) {
  const target = s.enemy.uid
  const foes = s.double!.foes.map((f) => (f.uid === target ? { ...f, hp: 1 } : f))
  const next = { ...s, enemy: { ...s.enemy, hp: 1 }, double: { ...s.double!, foes } }
  return reduce({ ...next, phase: 'player_reroll', dice: [die('base', 6)], selected: [false] }, { t: 'ATTACK' }, data, createRng(7))
}

const TEAM = [
  { uid: 'a', dex: 7, level: 40, hp: 999 },
  { uid: 'b', dex: 1, level: 40, hp: 999 },
]

describe('Alola island trials (docs/62 §6)', () => {
  const ilima = '4f91ae65-c2ed-5625-8493-cc888560e844'

  it('the captain’s battle is its Totem’s while the switch is on, never in Extreme mode', () => {
    expect(trialOf(live, ilima)?.totem).toBe(735)
    expect(trialOf(data, ilima)).toBeNull()
    expect(trialOf(live, ilima, { ...save(), mode: 'extreme' })).toBeNull()
  })

  it('the challenge is the trial: the Totem and its allies', () => {
    const route2 = area('Route 2 & the Verdant Cavern')
    const p = { ...emptyProgress(), roundsDone: route2.roundsToClear ?? 1 }
    const enc = challengeEncounter(route2, p, live, 12, null, createRng(1), undefined, save())
    expect(enc?.kind === 'gym' && enc.trial).toBe('trial-verdant-cavern')
    expect(enc?.kind === 'gym' && enc.team.map((m) => m.dex)).toEqual([735, 734, 734])
  })

  it('Vast Poni Canyon’s Totem Kommo-o is a gym only while trials are on, before Hapu', () => {
    const canyon = area('Exeggutor Island & Vast Poni Canyon')
    expect(gymsFor(canyon, live)).toEqual(['7278511c-319e-5fc1-a053-0be766cb70fd', 'c6106307-fd9e-50e1-aa2c-8edd1069cb8f'])
    expect(gymsFor(area('Exeggutor Island & Vast Poni Canyon', data), data)).toEqual(['c6106307-fd9e-50e1-aa2c-8edd1069cb8f'])
  })

  it('the Totem has ×2 HP and a die more; it calls an ally at once, another when one falls; its K.O. ends the trial', () => {
    const def = trialOf(live, ilima)!
    const foes = trialFoes(def, live)
    expect(foes[0]).toMatchObject({ dex: 735, hpTimes: 2, aura: 'totem', extraDice: ['normal'] })
    const { state, log } = createBattle(
      { kind: 'trainer', team: TEAM, enemy: foes[0]!, double: { foes, leadUids: ['a', 'b'], leader: 0, calls: true }, playerLevels: uniformLevels(1), enemyLevels: uniformLevels(1) },
      data,
    )
    const totem = state.double!.foes[0]!
    const plain = createBattle({ kind: 'wild', team: TEAM, enemy: { dex: 735, level: 12 }, playerLevels: uniformLevels(1), enemyLevels: uniformLevels(1) }, data).state.enemy
    expect(totem.maxHp).toBe(plain.maxHp * 2)
    expect(totem.dice.length).toBe(plain.dice.length + 1)
    expect(log).toContainEqual({ kind: 'sos', from: 'enemy', uid: 'enemy-1' })
    let s = toPlayer(state).state
    // The ally in front falls: the Totem calls the next.
    if (s.enemy.uid === 'enemy') s = { ...s, enemy: s.double!.foes[1]!, double: { ...s.double!, foeIndex: 1 } }
    const out = knockFront(s)
    expect(out.log).toContainEqual({ kind: 'sos', from: 'enemy', uid: 'enemy-2' })
    // The Totem falls: won, the ally still out flees.
    let t = toPlayer(out.state).state
    t = { ...t, enemy: t.double!.foes[0]!, double: { ...t.double!, foeIndex: 0 } }
    const end = knockFront(t)
    expect(end.state.phase).toBe('won')
    expect(end.log).toContainEqual({ kind: 'foe_fled', uid: 'enemy-2' })
  })
})

describe('Paldea’s Titans (docs/62 §7)', () => {
  const cortondo = () => area('South Province (Area Three) & Cortondo')

  it('a boss only while the switch is on, never caught, done once beaten', () => {
    expect(fightBosses(cortondo(), live).map((b) => b.dex)).toEqual([950])
    expect(fightBosses(area('South Province (Area Three) & Cortondo', data), data)).toEqual([])
    const beaten = { ...emptyProgress(), bossesDefeated: [950] }
    expect(bossCaught(cortondo(), beaten, [], 950, live)).toBe(true)
    expect(bossCaught(cortondo(), emptyProgress(), [950], 950, live)).toBe(false)
    const done = { ...emptyProgress(), roundsDone: 9, gymsDefeated: cortondo().gyms }
    const enc = challengeEncounter(cortondo(), done, live, 16, null, createRng(1), undefined, save())
    expect(enc).toEqual({ kind: 'boss', dex: 950, level: 16, titan: true })
  })

  it('two phases one on one: once the first falls, it comes back with ×2 HP and a die more', () => {
    const def = cortondo().legendaryBoss!.find((b) => b.titan)!
    const f = titanFight(def, live)
    expect(f).toMatchObject({ foeField: 1, ownField: 1 })
    const { state } = createBattle(
      { kind: 'boss', team: TEAM, enemy: f.foes[0]!, double: { foes: f.foes, leadUids: ['a'], foeField: 1, ownField: 1 }, playerLevels: uniformLevels(1), enemyLevels: uniformLevels(1) },
      data,
    )
    expect(foesOnField(state).map((b) => b.uid)).toEqual(['enemy'])
    expect(state.double!.ownSlots).toHaveLength(1)
    const out = knockFront(toPlayer(state).state)
    expect(out.log).toContainEqual({ kind: 'titan_rise', uid: 'enemy-1' })
    const giant = out.state.double!.foes[1]!
    expect(giant.aura).toBe('titan')
    expect(giant.maxHp).toBe(out.state.double!.foes[0]!.maxHp * 2)
  })

  it('Dondozo fights with Tatsugiri; the giant comes only once both are down (Commander)', () => {
    const lake = area('Casseroya Lake')
    const def = lake.legendaryBoss!.find((b) => b.titan)!
    const f = titanFight(def, live)
    expect(f.foes.map((x) => [x.dex, x.phase])).toEqual([[977, 1], [978, 1], [977, 2]])
    const { state } = createBattle(
      { kind: 'boss', team: TEAM, enemy: f.foes[0]!, double: { foes: f.foes, leadUids: ['a', 'b'], foeField: 2, ownField: 2 }, playerLevels: uniformLevels(1), enemyLevels: uniformLevels(1) },
      data,
    )
    const one = knockFront(toPlayer(state).state)
    expect(one.log.some((e) => e.kind === 'titan_rise' || e.kind === 'foe_out')).toBe(false)
    expect(foesOnField(one.state)).toHaveLength(1)
    let s = toPlayer(one.state).state
    s = { ...s, enemy: foesOnField(s)[0]! }
    const two = knockFront(s)
    expect(two.log).toContainEqual({ kind: 'titan_rise', uid: 'enemy-2', commander: true })
  })

  it('Iron Treads for a player in Green’s look; the reward is the config’s', () => {
    const desert = area('The Asado Desert & Cascarrafa')
    const def = desert.legendaryBoss!.find((b) => b.titan)!
    expect(titanFight(def, live, { starterDex: 1, character: 'green' }).foes[0]!.dex).toBe(990)
    expect(titanFight(def, live, { starterDex: 1, character: 'red' }).foes[0]!.dex).toBe(984)
    const s = save()
    const r = titanReward(s, live)
    expect(r.gold).toBe(1000)
    expect(r.save.gold).toBe(s.gold + 1000)
    expect(r.save.inventory['rare-candy']).toBe((s.inventory['rare-candy'] ?? 0) + 3)
  })
})

describe('Castform’s Forecast (docs/62 §3)', () => {
  const start = (weather: 'rain' | 'sun' | 'snow' | 'sand' | null, enemy = { dex: 16, level: 20 }) =>
    createBattle(
      {
        kind: 'wild',
        team: [{ uid: 'a', dex: 351, level: 25, hp: 999 }],
        enemy,
        playerLevels: uniformLevels(1),
        enemyLevels: uniformLevels(1),
        weather,
      },
      live,
    )

  it('takes the weather’s form as the fight starts: its Normal dice its new type’s', () => {
    for (const [weather, dex, type] of [
      ['rain', 10014, 'water'],
      ['sun', 10013, 'fire'],
      ['snow', 10015, 'ice'],
    ] as const) {
      const { state, log } = start(weather)
      const b = state.player[0]!
      expect(b.dex, weather).toBe(dex)
      expect(b.types).toEqual([type])
      expect(b.dice.every((d) => d === type || d === 'base')).toBe(true)
      expect(log).toContainEqual(expect.objectContaining({ kind: 'form', uid: 'a', fromDex: 351, toDex: dex, reason: 'weather' }))
    }
  })

  it('stays Castform under a sandstorm or none, and a foe Castform changes too, caught as Castform', () => {
    expect(start('sand').state.player[0]!.dex).toBe(351)
    expect(start(null).state.player[0]!.dex).toBe(351)
    const foe = start('rain', { dex: 351, level: 20 }).state.enemy
    expect(foe.dex).toBe(10014)
    expect(foe.baseDex).toBe(351)
  })
})
