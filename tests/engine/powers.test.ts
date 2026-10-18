// The battle powers (docs/31): where each opens, the Mega Gems, and what a battle does with them under the newer rules.
import { describe, expect, it } from 'vitest'
import {
  activeBattler,
  autoEvents,
  battlePowersFor,
  buyGem,
  canZMove,
  computeDamage,
  createBattle,
  createRng,
  DEFAULT_CONFIG,
  enemyPlanFor,
  gemRegions,
  gemShelf,
  getRegion,
  gmaxChoices,
  gmaxUnlocked,
  megaChoices,
  megaUnlocked,
  newSave,
  powerRulesDue,
  reduce,
  regionCaseOf,
  simulateVersus,
  syncPowers,
  uniformLevels,
  zUnlocked,
  type BattleEvent,
  type BattleState,
  type CreateBattleOptions,
  type GameData,
  type LogEntry,
  type RegionId,
  type SaveData,
} from '@/engine'
import { data as off, makeData } from '../fixtures'

const D = DEFAULT_CONFIG
/** Every power's newer rules switched on for everyone. */
const on: GameData = makeData({
  megaEvolution: { ...D.megaEvolution, gems: { ...D.megaEvolution.gems, access: 'all' } },
  gigantamax: { ...D.gigantamax, boost: { ...D.gigantamax.boost, access: 'all' } },
  zMove: { ...D.zMove, access: 'all' },
})

let n = 0
const newId = () => `id${++n}`
const rng = createRng(3)

/** A save standing in `live`, with the first `badges` badges of `region` won there, and its league beaten if `league`. */
function withBadges(save: SaveData, region: RegionId, badges: number, league = false): SaveData {
  const progress: Record<string, unknown> = {}
  for (const b of regionCaseOf(on, region, [], false)!.badges.slice(0, badges)) {
    const p = (progress[b.areaId] ?? { gymsDefeated: [] }) as { gymsDefeated: string[] }
    progress[b.areaId] = { ...p, gymsDefeated: [...p.gymsDefeated, b.trainerId] }
  }
  if (league) progress[getRegion(on, region)!.leagueAreaId] = { cleared: true, gymsDefeated: [] }
  const block = { ...save, areaProgress: progress as SaveData['areaProgress'] }
  if (region === (save.region ?? 'kanto')) return block
  return { ...save, parked: { ...save.parked, [region]: { ...block, region: undefined } as never } }
}
const inRegion = (save: SaveData, region: RegionId): SaveData => {
  const live = save.region ?? 'kanto'
  if (live === region) return save
  const { [region]: block, ...parked } = save.parked ?? {}
  return {
    ...save,
    ...(block as object),
    region,
    parked: { ...parked, [live]: { ...save, region: undefined, parked: undefined } as never },
  }
}

const start = (): SaveData => newSave(7, on, 1, newId)

describe('where each power opens', () => {
  it('Mega Evolution: Korrina’s badge in Kalos, a league anywhere else (earlier regions too)', () => {
    const kalos = inRegion(start(), 'kalos')
    expect(megaUnlocked(withBadges(kalos, 'kalos', 2), on)).toBe(false)
    const korrina = withBadges(kalos, 'kalos', 3)
    expect(megaUnlocked(korrina, on)).toBe(true)
    // Back in Kanto: not before its league is beaten.
    expect(megaUnlocked(inRegion(korrina, 'kanto'), on)).toBe(false)
    expect(megaUnlocked(withBadges(inRegion(korrina, 'kanto'), 'kanto', 8, true), on)).toBe(true)
    // In Alola, after its league too.
    expect(megaUnlocked(withBadges(inRegion(korrina, 'alola'), 'alola', 0), on)).toBe(false)
    expect(megaUnlocked(withBadges(inRegion(korrina, 'alola'), 'alola', 0, true), on)).toBe(true)
  })

  it('switched off, the older rule stands: reaching Kalos', () => {
    const kalos = inRegion(start(), 'kalos')
    expect(megaUnlocked(kalos, off)).toBe(true)
    expect(megaUnlocked(kalos, on)).toBe(false)
  })

  it('Gigantamax: Kabu’s badge in Galar; Z-Moves: Lana’s trial in Alola', () => {
    const galar = inRegion(start(), 'galar')
    expect(gmaxUnlocked(withBadges(galar, 'galar', 2), on)).toBe(false)
    expect(gmaxUnlocked(withBadges(galar, 'galar', 3), on)).toBe(true)
    const alola = inRegion(start(), 'alola')
    expect(zUnlocked(withBadges(alola, 'alola', 2), on)).toBe(false)
    expect(zUnlocked(withBadges(alola, 'alola', 3), on)).toBe(true)
    // Z-Moves have no older rules: off, there are none.
    expect(zUnlocked(withBadges(alola, 'alola', 8), off)).toBe(false)
  })

  it('pops each power’s rules up once its badge is won, Mega first', () => {
    const s = withBadges(withBadges(inRegion(start(), 'kalos'), 'kalos', 3), 'kanto', 0)
    expect(powerRulesDue(s, on)).toBe('mega')
    expect(powerRulesDue({ ...s, powers: { seen: ['mega'] } }, on)).toBeNull()
    expect(powerRulesDue(s, off)).toBeNull()
  })
})

describe('Mega Gems', () => {
  it('a badge hands its gem over: Korrina the Lucarionite, badges 6, 7 and 8 the Kanto starters’', () => {
    const kalos = inRegion(start(), 'kalos')
    const three = syncPowers(withBadges(kalos, 'kalos', 3), on)
    expect(three.given.map((g) => g.gem.key)).toEqual(['lucarionite'])
    expect(three.given[0]!.leader).toBe('Korrina')
    expect(three.save.powers?.earned).toEqual(['mega'])
    // Handed over once.
    expect(syncPowers(three.save, on).given).toEqual([])
    const all = syncPowers(withBadges(three.save, 'kalos', 8), on)
    expect(all.given.map((g) => g.gem.key)).toEqual(['charizardite-y', 'venusaurite', 'blastoisinite'])
    // Gem rules off: nothing handed over (the badge is noted for Versus all the same).
    expect(syncPowers(withBadges(kalos, 'kalos', 3), off).given).toEqual([])
  })

  it('are sold where their Pokémon, or one it evolves from, can be had', () => {
    expect(gemRegions(on, on.items['gengarite']!)).toContain('kanto')
    expect(gemRegions(on, on.items['charizardite-x']!)).toContain('kanto')
    expect(gemRegions(on, on.items['garchompite']!)).toContain('sinnoh')
    expect(gemRegions(on, on.items['clefablite']!)).toContain('kanto')
  })

  it('the shelf opens with Mega Evolution there, without the badges’ gems, each bought once and never sold', () => {
    const kalos = inRegion(start(), 'kalos')
    expect(gemShelf(withBadges(kalos, 'kalos', 2), on)).toBeNull()
    const open = { ...withBadges(kalos, 'kalos', 3), gold: 2500 }
    const shelf = gemShelf(open, on)!
    expect(shelf.length).toBeGreaterThan(0)
    expect(
      shelf.some((r) =>
        ['lucarionite', 'charizardite-y', 'venusaurite', 'blastoisinite'].includes(r.item.key),
      ),
    ).toBe(false)
    const key = shelf[0]!.item.key
    const bought = buyGem(open, on, key)!
    expect(bought.gold).toBe(1500)
    expect(bought.powers?.gems).toEqual([key])
    expect(gemShelf(bought, on)!.find((r) => r.item.key === key)!.owned).toBe(true)
    expect(buyGem(bought, on, key)).toBeNull()
    expect(buyGem({ ...open, gold: 999 }, on, key)).toBeNull()
    // Kanto's shelf waits for Kanto's league.
    const kanto = inRegion(open, 'kanto')
    expect(gemShelf(kanto, on)).toBeNull()
    expect(gemShelf(withBadges(kanto, 'kanto', 8, true), on)!.some((r) => r.item.key === 'gengarite')).toBe(
      true,
    )
  })

  it('a battle gets the gems’ Mega forms and the turns', () => {
    const s = syncPowers(withBadges(inRegion(start(), 'kalos'), 'kalos', 3), on).save
    expect(battlePowersFor(s, on)).toMatchObject({ megaAllowed: true, megaForms: [10059], megaTurns: 3 })
  })
})

/** A battle with the newer rules on, from these options. */
function fight(
  lead: { dex: number; level: number; hp?: number }[],
  opts: Partial<CreateBattleOptions> = {},
  foe = { dex: 242, level: 100 },
) {
  return createBattle(
    {
      kind: 'trainer',
      team: lead.map((p, i) => ({ uid: `p${i}`, dex: p.dex, level: p.level, hp: p.hp ?? 9999 })),
      leadUid: 'p0',
      enemy: foe,
      playerLevels: uniformLevels(1),
      enemyLevels: uniformLevels(1),
      megaAllowed: true,
      megaForms: [10059, 10034],
      megaTurns: 3,
      gmaxAllowed: true,
      gmaxBoost: { dice: 2, healPercent: 30 },
      zAllowed: true,
      ...opts,
    },
    on,
  )
}
const step = (s: BattleState, e: BattleEvent) => reduce(s, e, on, rng)
/** The player's turn: roll and attack. Then the foe's, back to the player's. */
function round(s: BattleState): { state: BattleState; log: LogEntry[] } {
  const log: LogEntry[] = []
  for (const e of [{ t: 'ROLL' }, { t: 'ATTACK' }, { t: 'AI_TURN' }] as BattleEvent[]) {
    const r = step(s, e)
    s = r.state
    log.push(...r.log)
  }
  return { state: s, log }
}

describe('a Mega under the gem rules', () => {
  it('needs its gem, at any level', () => {
    const { state } = fight([{ dex: 448, level: 12 }])
    expect(megaChoices(state, on).map((m) => m.dex)).toEqual([10059])
    expect(megaChoices(fight([{ dex: 94, level: 80 }]).state, on)).toEqual([])
  })

  it('lasts 3 of its own turns, the one it Mega Evolves in included, then changes back', () => {
    let s = fight([{ dex: 448, level: 100 }]).state
    const before = { types: [...activeBattler(s).types], dice: activeBattler(s).dice.length }
    s = step(s, { t: 'MEGA', toDex: 10059 }).state
    expect(activeBattler(s).megaTimer?.turns).toBe(3)
    expect(activeBattler(s).dice.length).toBe(before.dice + 1)
    s = round(s).state
    expect(activeBattler(s).megaTimer?.turns).toBe(2)
    s = round(s).state
    expect(activeBattler(s).mega).toBe(true)
    const last = round(s)
    s = last.state
    expect(activeBattler(s).mega).toBeFalsy()
    expect(activeBattler(s).dex).toBe(448)
    expect(activeBattler(s).types).toEqual(before.types)
    expect(activeBattler(s).dice.length).toBe(before.dice)
    expect(last.log.some((e) => e.kind === 'form' && e.reason === 'mega' && e.revert)).toBe(true)
    // It has had its power: no Z-Move and no second Mega.
    s = step(s, { t: 'ROLL' }).state
    expect(canZMove(s, on)).toBe(false)
    expect(megaChoices(s, on)).toEqual([])
  })

  it('changes back when it leaves the field', () => {
    let s = fight([
      { dex: 448, level: 100 },
      { dex: 25, level: 100 },
    ]).state
    s = step(s, { t: 'MEGA', toDex: 10059 }).state
    s = step(s, { t: 'SWITCH', instanceId: 'p1' }).state
    expect(s.player[0]!.mega).toBeFalsy()
    expect(s.player[0]!.dex).toBe(448)
  })
})

describe('Gigantamax under the newer rules', () => {
  it('two dice and 30 % of its HP back; a use of its own beside the Mega’s, never on the same Pokémon', () => {
    let s = fight([
      { dex: 6, level: 100, hp: 30 },
      { dex: 448, level: 100 },
    ]).state
    const dice = activeBattler(s).dice.length
    const max = activeBattler(s).maxHp
    const r = step(s, { t: 'GMAX', toDex: 10196 })
    s = r.state
    expect(activeBattler(s).dice.length).toBe(dice + 2)
    expect(activeBattler(s).hp).toBe(Math.min(max, 30 + Math.round(max * 0.3)))
    expect(r.log.some((e) => e.kind === 'heal')).toBe(true)
    expect(s.gmaxUsed).toBe(1)
    expect(s.megaUsed ?? 0).toBe(0)
    // The same Pokémon can't Mega Evolve too…
    expect(megaChoices(s, on)).toEqual([])
    // …but the next one can.
    s = step(s, { t: 'SWITCH', instanceId: 'p1' }).state
    s = step(s, { t: 'AI_TURN' }).state
    expect(megaChoices(s, on).map((m) => m.dex)).toEqual([10059])
    expect(gmaxChoices(s, on)).toEqual([])
  })
})

describe('Z-Moves', () => {
  const zData = (o: Partial<GameData['config']['zMove']>) =>
    makeData({ ...on.config, zMove: { ...on.config.zMove, access: 'all', ...o } })
  const zFight = (dex: number, foe: number, data: GameData, hp?: number) =>
    createBattle(
      {
        kind: 'trainer',
        team: [{ uid: 'p0', dex, level: 50, hp: hp ?? 9999 }],
        enemy: { dex: foe, level: 100 },
        playerLevels: uniformLevels(1),
        enemyLevels: uniformLevels(1),
        zAllowed: true,
      },
      data,
    ).state
  const zMove = (dex: number, foe: number, data: GameData, hp?: number) => {
    let s = zFight(dex, foe, data, hp)
    if (s.phase !== 'player_roll') s = reduce(s, { t: 'AI_TURN' }, data, rng).state
    s = reduce(s, { t: 'ROLL' }, data, rng).state
    expect(canZMove(s, data)).toBe(true)
    const r = reduce(s, { t: 'ZMOVE' }, data, rng)
    return { before: s, ...r }
  }

  it('Electric paralyzes (here at 100 %), once per battle', () => {
    const d = zData({ paralyzeChance: 100 })
    const { state, log } = zMove(25, 7, d)
    expect(log.find((e) => e.kind === 'zmove')).toMatchObject({ effect: 'paralyze', landed: true })
    expect(log.some((e) => e.kind === 'status' && e.status === 'paralyze')).toBe(true)
    expect(state.zUsed).toBe(1)
    let s = reduce(state, { t: 'AI_TURN' }, d, rng).state
    if (s.phase === 'player_stunned') s = reduce(s, { t: 'PASS' }, d, rng).state
    if (s.phase === 'enemy_turn') s = reduce(s, { t: 'AI_TURN' }, d, rng).state
    s = reduce(s, { t: 'ROLL' }, d, rng).state
    expect(canZMove(s, d)).toBe(false)
  })

  it('Fire lands two Burn stacks; Grass heals 20 %', () => {
    const fire = zMove(4, 1, on)
    expect(fire.log.find((e) => e.kind === 'status' && e.status === 'burn')).toMatchObject({ stacks: 2 })
    const grass = zMove(1, 7, on, 10)
    const heal = grass.log.find((e) => e.kind === 'heal')
    expect(heal).toBeTruthy()
    expect(heal!.kind === 'heal' && heal!.amount).toBe(
      Math.min(grass.before.player[0]!.maxHp - 10, Math.round(grass.before.player[0]!.maxHp * 0.2)),
    )
  })

  it('every other type hits 20 % harder', () => {
    const { before, log } = zMove(19, 1, on)
    const plain = computeDamage(
      before.dice,
      before.player[0]!.types,
      before.enemy.types,
      before.playerLevels,
      on,
    )
    const hit = log.find((e) => e.kind === 'damage')
    expect(hit && hit.kind === 'damage' && hit.amount).toBe(Math.max(1, Math.round(plain.final * 1.2)))
  })

  it('Fighting hits 40 % harder and takes 20 % of it back', () => {
    const { before, log } = zMove(66, 19, on)
    const plain = computeDamage(
      before.dice,
      before.player[0]!.types,
      before.enemy.types,
      before.playerLevels,
      on,
    )
    const hit = log.find((e) => e.kind === 'damage')
    const dealt = Math.max(1, Math.round(plain.final * 1.4))
    expect(hit && hit.kind === 'damage' && hit.amount).toBe(dealt)
    expect(log.find((e) => e.kind === 'recoil')).toMatchObject({
      z: true,
      amount: Math.max(1, Math.round(dealt * 0.2)),
    })
  })

  it('Ground digs: a turn out of reach, every attack missing it, then the strike with the roll it kept', () => {
    const { before, state, log } = zMove(50, 25, on)
    expect(log.find((e) => e.kind === 'zmove')).toMatchObject({ effect: 'dig' })
    expect(log.some((e) => e.kind === 'away')).toBe(true)
    expect(log.some((e) => e.kind === 'damage')).toBe(false)
    expect(state.player[0]!.away?.how).toBe('dig')
    const hp = state.player[0]!.hp
    // The foe's turn: its attack misses; then the player's turn opens on the strike.
    const r = reduce(state, { t: 'AI_TURN' }, on, rng)
    expect(r.log.find((e) => e.kind === 'dodge')).toMatchObject({ how: 'dig', uid: 'p0' })
    expect(r.state.player[0]!.hp).toBe(hp)
    const strike = r.log.find((e) => e.kind === 'damage')
    expect(strike).toMatchObject({ side: 'player', z: { from: 'dig' } })
    expect(strike && strike.kind === 'damage' && strike.dice).toEqual(before.dice)
    expect(r.state.player[0]!.away).toBeUndefined()
  })

  it('Flying flies up and Water dives the same way', () => {
    expect(zMove(641, 66, on).state.player[0]!.away?.how).toBe('fly')
    expect(zMove(7, 4, on).state.player[0]!.away?.how).toBe('dive')
  })

  it('Steel shakes off every status, and can be used while paralyzed', () => {
    let s = zFight(379, 25, on)
    if (s.phase !== 'player_roll') s = reduce(s, { t: 'AI_TURN' }, on, rng).state
    const p = s.player[0]!
    s = {
      ...s,
      phase: 'player_stunned',
      player: [{ ...p, status: { ...p.status, paralyze: 1, poison: { turns: 2 } } }],
    }
    expect(canZMove(s, on)).toBe(true)
    const r = reduce(s, { t: 'ZMOVE' }, on, rng)
    expect(r.log.map((e) => e.kind).slice(0, 3)).toEqual(['cleansed', 'roll', 'zmove'])
    expect(r.state.player[0]!.status.paralyze).toBe(0)
    expect(r.state.player[0]!.status.poison).toBeNull()
    // Not a Steel-type: no Z-Move while stunned.
    let q = zFight(25, 7, on)
    if (q.phase !== 'player_roll') q = reduce(q, { t: 'AI_TURN' }, on, rng).state
    expect(canZMove({ ...q, phase: 'player_stunned' }, on)).toBe(false)
  })

  it('an Alola ace uses one on its first attack', () => {
    const alola = withBadges(inRegion(start(), 'alola'), 'alola', 3)
    const plan = enemyPlanFor(
      alola,
      on,
      { dex: 724, level: 60 },
      { regionId: 'alola', role: 'champion', ace: true },
    )
    expect(plan).toEqual({ z: true })
    let s = fight([{ dex: 448, level: 100 }], { enemyPlan: plan }, { dex: 724, level: 60 }).state
    if (s.phase !== 'enemy_turn') s = step(step(s, { t: 'ROLL' }).state, { t: 'ATTACK' }).state
    const r = step(s, { t: 'AI_TURN' })
    expect(r.log.find((e) => e.kind === 'zmove')).toMatchObject({ side: 'enemy' })
  })
})

describe('auto battles', () => {
  it('under the newer rules, the auto player takes a Mega first, and a Z-Move with a Pokémon that took nothing', () => {
    const s = fight([{ dex: 448, level: 100 }], { auto: true }).state
    expect(autoEvents(s, on, rng)).toEqual([{ t: 'MEGA', toDex: 10059 }])
    let z = fight([{ dex: 25, level: 100 }], { auto: true }).state
    z = step(z, { t: 'ROLL' }).state
    z = { ...z, player: z.player.map((p) => ({ ...p, rerollsLeft: 0 })) }
    expect(autoEvents(z, on, rng)).toEqual([{ t: 'ZMOVE' }])
  })

  it('under the older rules, an auto battle has no Mega', () => {
    const s = fight([{ dex: 448, level: 100 }], {
      auto: true,
      megaForms: undefined,
      megaTurns: undefined,
    }).state
    expect(s.megaAllowed).toBeUndefined()
  })
})

describe('Versus', () => {
  it('each side brings its powers, and the whole fight counts as one battle', () => {
    const team = [
      { dex: 448, level: 50, shiny: false },
      { dex: 25, level: 50, shiny: false },
      { dex: 6, level: 50, shiny: false },
    ]
    const foes = [
      { dex: 143, level: 50, shiny: false },
      { dex: 130, level: 50, shiny: false },
      { dex: 248, level: 50, shiny: false },
    ]
    const fightOf = (seed: number) =>
      simulateVersus(team, foes, on, seed, {
        attacker: { gems: ['lucarionite'], gmax: true, z: true },
        defender: { gems: ['gyaradosite'], gmax: false, z: false },
      })
    const fightLog = (seed: number) =>
      fightOf(seed).rounds.flatMap((r) => [...r.start.log, ...r.steps.flatMap((s) => s.log)])
    for (const seed of [1, 2, 3]) {
      const log = fightLog(seed)
      const mine = (reason: string) =>
        log.filter((e) => e.kind === 'form' && e.side === 'player' && e.reason === reason && !e.revert).length
      expect(mine('mega')).toBeLessThanOrEqual(1)
      expect(mine('gmax')).toBeLessThanOrEqual(1)
      expect(log.filter((e) => e.kind === 'zmove' && e.side === 'player').length).toBeLessThanOrEqual(1)
      // Lucario leads with its gem: it Mega Evolves on its first turn.
      expect(mine('mega')).toBe(1)
      // The same seed, the same fight.
      expect(JSON.stringify(fightOf(seed))).toBe(JSON.stringify(fightOf(seed)))
    }
  })
})
