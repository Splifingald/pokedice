// Raid Battles, the fight (docs/18 §3, docs/19 §6.3): three sides of up to three Pokémon, one out each, against the
// raid Pokémon (its HP in bars) and the summons beside it. The battle reducer stays one-on-one: every action here is a
// real duel step (battle.ts `startDuelStep`), so damage, combos, type matchups, statuses and items are exactly the
// game's. This file only decides who acts, against whom, and what a broken bar or a K.O. does to the raid.
import {
  canHurt,
  copyFoeDice,
  makeBattler,
  reduce,
  startDuelStep,
  type BattleEvent,
  type BattleState,
  type Battler,
  type BattlerSeed,
  type LogEntry,
} from './battle'
import { isLegendary } from './breeding'
import { uniformLevels, type UpgradeLevels } from './damage'
import { regionSpecies } from './regions'
import type { Rng } from './rng'
import { autoEvents } from './sim'
import { emptyStatus } from './status'
import type { GameData, RaidConfig, RegionId } from './types'

/** Who a side is: you, a friend's registered raid team, or an NPC trainer filling an empty slot. */
export type RaidSideKind = 'me' | 'friend' | 'npc'

export interface RaidSideSeed {
  owner: string
  /** The trainer's look (a character key or a trainer sprite), for the queue and the cut-ins. */
  look: string | null
  kind: RaidSideKind
  userId?: string
  /** Up to three Pokémon, levels already capped; uids unique in the raid. */
  team: BattlerSeed[]
}

export interface RaidSide extends Omit<RaidSideSeed, 'team'> {
  mons: Battler[]
  active: number
  /** All its Pokémon K.O.: the side is out of the raid. */
  out: boolean
}

/** Who acts: a side (with whichever of its Pokémon is out) or one foe. */
export type RaidActor = { side: number } | { foe: string }

export type RaidPhase = 'running' | 'player' | 'won' | 'lost'

export interface RaidState {
  phase: RaidPhase
  sides: RaidSide[]
  boss: Battler
  /** Bars in all, and broken so far: the boss is beaten when its last bar empties. */
  bars: number
  broken: number
  /** On the field beside the boss, in summoning order. */
  summons: Battler[]
  /** Summon points: one per summon, gained when a bar breaks. */
  points: number
  /** Summons so far (their uids). */
  summoned: number
  /** The species the boss summons from. */
  summonPool: number[]
  round: number
  /** Still to act this round, in speed order. */
  queue: RaidActor[]
  actor: RaidActor | null
  /** The side the last foe attack hit: never the same twice in a row while another is left. */
  lastHit: number | null
  /** The player's turn: their Pokémon's duel against the foe they aim at, waiting on their input. */
  duel: BattleState | null
  /** Actions so far (the raid ends as a loss at `RAID_MAX_STEPS`). */
  steps: number
  sideLevels: UpgradeLevels
  foeLevels: UpgradeLevels
  /** Every side plays itself (the sims). */
  auto?: boolean
}

export type RaidLogEntry =
  | LogEntry
  /** The raid Pokémon appears, with its first summons. */
  | { kind: 'raid_start'; boss: string; summons: Battler[] }
  /** The pair that steps to the front for the next action. */
  | { kind: 'raid_front'; ally: string; foe: string; actor: 'ally' | 'foe' }
  /** A bar broke: the next one fills, and the boss gains summon points. */
  | { kind: 'raid_bar'; broken: number; barsLeft: number; points: number; hpAfter: number }
  /** A summon arrives (`b` as it comes out), the boss's points left. */
  | { kind: 'raid_summon'; b: Battler; points: number }
  /** A side sends its next Pokémon after a K.O. */
  | { kind: 'raid_next'; side: number; uid: string }
  | { kind: 'raid_out'; side: number }
  /** The boss is down: its summons run. */
  | { kind: 'raid_flee'; uids: string[] }
  | { kind: 'raid_end'; result: 'won' | 'lost'; reason?: 'stalemate' | 'forfeit' }

/** The player's input on their turn: a battle event in their duel, or a new target. */
export type RaidEvent = BattleEvent | { t: 'TARGET'; uid: string }

/** A raid that drags on this long (actions, every side's and every foe's) is lost. */
export const RAID_MAX_STEPS = 400

export const BOSS_UID = 'raid-boss'

// ---------------------------------------------------------------------------------------------------------------------
// Who can stand beside the sides and the boss.

/** Every species of a starter line: each region's starters and everything they evolve into. */
function starterLines(data: GameData): Set<number> {
  const out = new Set<number>([...data.config.starters, ...(data.regions ?? []).flatMap((r) => r.starters)])
  for (const dex of out) for (const e of data.species[dex]?.evolutions ?? []) out.add(e.toDex)
  return out
}

/**
 * NPC allies and summons: fully evolved, never legendary or mythical, never a starter line, never on the config's
 * pseudo-legendary and extra lists (Ultra Beasts, Paradox Pokémon…), never a form row, never a copier (Ditto).
 */
export function raidAllyAllowed(data: GameData, cfg: RaidConfig = data.config.events.raid): (dex: number) => boolean {
  const starters = starterLines(data)
  const banned = new Set([...cfg.exclude.pseudo, ...cfg.exclude.extra, 132, 292])
  return (dex) => {
    const s = data.species[dex]
    return !!s && !s.form && s.evolutions.length === 0 && !isLegendary(data, dex) && !starters.has(dex) && !banned.has(dex)
  }
}

/** The species a raid Pokémon summons: allowed, of its region, sharing no type with it. */
export function summonPool(data: GameData, bossDex: number, regionId: RegionId): number[] {
  const allowed = raidAllyAllowed(data)
  const boss = data.species[bossDex]
  const bossTypes = new Set([boss?.type1, boss?.type2].filter(Boolean))
  const pool = [...regionSpecies(data, regionId)].filter((dex) => {
    const s = data.species[dex]!
    return allowed(dex) && !bossTypes.has(s.type1) && !(s.type2 && bossTypes.has(s.type2))
  })
  return pool.sort((a, b) => a - b)
}

/** An NPC trainer's three Pokémon: allowed species of the given regions, at the raid's level. */
export function npcTeam(data: GameData, regionIds: RegionId[], rng: Rng, prefix: string): BattlerSeed[] {
  const allowed = raidAllyAllowed(data)
  const pool = [...new Set(regionIds.flatMap((r) => [...regionSpecies(data, r)]))].filter(allowed).sort((a, b) => a - b)
  const level = data.config.events.raid.teamCap
  const picks: number[] = []
  for (let i = 0; i < 3 && pool.length; i++) {
    const left = pool.filter((d) => !picks.includes(d))
    picks.push(rng.pick(left.length ? left : pool))
  }
  return picks.map((dex, i) => ({ uid: `${prefix}-${i}`, dex, level, hp: Number.MAX_SAFE_INTEGER }))
}

// ---------------------------------------------------------------------------------------------------------------------
// The raid.

export interface CreateRaidOptions {
  boss: { dex: number; shiny: boolean }
  sides: RaidSideSeed[]
  /** The region whose Pokémon the boss summons (its lair's, or a fallback raid's). */
  regionId: RegionId
  auto?: boolean
}

const live = (b: Battler) => b.hp > 0
const activeOf = (side: RaidSide) => side.mons[side.active]!
const foes = (s: RaidState) => [s.boss, ...s.summons]
const foeOf = (s: RaidState, uid: string) => foes(s).find((f) => f.uid === uid) ?? null

function putFoe(s: RaidState, b: Battler) {
  if (b.uid === s.boss.uid) s.boss = b
  else s.summons = s.summons.map((m) => (m.uid === b.uid ? b : m))
}

export function createRaid(opts: CreateRaidOptions, data: GameData, rng: Rng): { state: RaidState; log: RaidLogEntry[] } {
  const cfg = data.config.events.raid
  const boss = makeBattler({ uid: BOSS_UID, dex: opts.boss.dex, level: cfg.level, hp: Number.MAX_SAFE_INTEGER, shiny: opts.boss.shiny }, data)
  // A bar holds `barHp` times its own HP.
  boss.maxHp = Math.max(1, Math.round(boss.maxHp * Math.max(0.1, cfg.barHp ?? 1)))
  boss.hp = boss.maxHp
  const sides: RaidSide[] = opts.sides.map((seed) => {
    const { team, ...who } = seed
    const mons = team.map((t) => makeBattler(t, data))
    const active = Math.max(0, mons.findIndex(live))
    return { ...who, mons, active, out: !mons.some(live) }
  })
  const s: RaidState = {
    phase: 'running',
    sides,
    boss,
    bars: Math.max(1, cfg.bars),
    broken: 0,
    summons: [],
    points: 0,
    summoned: 0,
    summonPool: summonPool(data, opts.boss.dex, opts.regionId),
    round: 0,
    queue: [],
    actor: null,
    lastHit: null,
    duel: null,
    steps: 0,
    sideLevels: uniformLevels(cfg.sideUpgradeLevel),
    foeLevels: uniformLevels(cfg.upgradeLevel),
    ...(opts.auto && { auto: true }),
  }
  const log: RaidLogEntry[] = []
  // The first summons come free.
  const first: Battler[] = []
  for (let i = 0; i < Math.min(cfg.startAllies, cfg.maxField); i++) {
    const m = summonOne(s, data, rng)
    if (m) first.push(structuredClone(m))
  }
  log.push({ kind: 'raid_start', boss: boss.uid, summons: first })
  advance(s, data, rng, log)
  return { state: s, log }
}

function summonOne(s: RaidState, data: GameData, rng: Rng): Battler | null {
  const onField = new Set(s.summons.map((m) => m.dex))
  const left = s.summonPool.filter((d) => !onField.has(d))
  const pool = left.length ? left : s.summonPool
  if (!pool.length) return null
  s.summoned += 1
  const m = makeBattler(
    { uid: `raid-summon-${s.summoned}`, dex: rng.pick(pool), level: data.config.events.raid.level, hp: Number.MAX_SAFE_INTEGER },
    data,
  )
  s.summons.push(m)
  return m
}

/** Every active Pokémon, fastest first; ties go to the sides (in order), then the boss, then its summons. */
function roundOrder(s: RaidState): RaidActor[] {
  const all: { a: RaidActor; speed: number; rank: number }[] = []
  s.sides.forEach((side, i) => {
    if (!side.out) all.push({ a: { side: i }, speed: activeOf(side).speed, rank: i })
  })
  all.push({ a: { foe: s.boss.uid }, speed: s.boss.speed, rank: 10 })
  s.summons.forEach((m, j) => all.push({ a: { foe: m.uid }, speed: m.speed, rank: 11 + j }))
  return all.sort((x, y) => y.speed - x.speed || x.rank - y.rank).map((x) => x.a)
}

const canAct = (s: RaidState, a: RaidActor) => ('side' in a ? !s.sides[a.side]!.out : !!foeOf(s, a.foe))

/** Runs the raid until the player must act or it's over. */
function advance(s: RaidState, data: GameData, rng: Rng, log: RaidLogEntry[]) {
  while (s.phase === 'running') {
    if (s.steps >= RAID_MAX_STEPS) return finish(s, 'lost', log, 'stalemate')
    if (!s.queue.length) {
      s.round += 1
      s.queue = roundOrder(s)
    }
    const actor = s.queue.shift()!
    if (!canAct(s, actor)) continue
    s.actor = actor
    s.steps += 1
    if ('foe' in actor) foeTurn(s, actor.foe, data, rng, log)
    else sideTurn(s, actor.side, data, rng, log)
  }
}

/** The duel for one action: the side's team (its active Pokémon out) against one foe. */
function duelOf(s: RaidState, sideIdx: number, foe: Battler): BattleState {
  const side = s.sides[sideIdx]!
  return {
    kind: 'boss',
    phase: 'player_roll',
    turn: s.steps - 1,
    actor: 'player',
    nextActor: 'player',
    player: structuredClone(side.mons),
    activeIndex: side.active,
    enemy: structuredClone(foe),
    dice: [],
    selected: [],
    playerLevels: s.sideLevels,
    enemyLevels: s.foeLevels,
    participants: [activeOf(side).uid],
    canRun: false,
    lastDamage: null,
    itemUsedThisTurn: false,
    // Mega Evolution and Gigantamax stay out of raids; a type changer on auto picks its type itself.
    ...((side.kind !== 'me' || s.auto) && { auto: true }),
    single: true,
  }
}

/**
 * The foe an ally aims at: a summon on its last third of HP first (finishing it frees a slot), else the boss; any foe
 * it can hurt when it can't touch the boss.
 */
export function allyTarget(s: RaidState, sideIdx: number, data: GameData): Battler {
  const me = activeOf(s.sides[sideIdx]!)
  const weak = s.summons.filter((m) => m.hp * 3 <= m.maxHp && canHurt(me, m, data)).sort((a, b) => a.hp - b.hp)[0]
  if (weak) return weak
  if (canHurt(me, s.boss, data)) return s.boss
  return s.summons.find((m) => canHurt(me, m, data)) ?? s.boss
}

/** The side a foe attacks: any side still in, never the one hit last while another is left. */
export function foeTarget(s: RaidState, rng: Rng): number | null {
  const inRaid = s.sides.flatMap((side, i) => (side.out ? [] : [i]))
  const fresh = inRaid.filter((i) => i !== s.lastHit)
  const pool = fresh.length ? fresh : inRaid
  return pool.length ? rng.pick(pool) : null
}

function sideTurn(s: RaidState, sideIdx: number, data: GameData, rng: Rng, log: RaidLogEntry[]) {
  const side = s.sides[sideIdx]!
  const target = allyTarget(s, sideIdx, data)
  let duel = duelOf(s, sideIdx, target)
  log.push({ kind: 'raid_front', ally: activeOf(side).uid, foe: target.uid, actor: 'ally' })
  const step: LogEntry[] = []
  startDuelStep(duel, 'player', data, step)
  log.push(...step)
  if (side.kind === 'me' && !s.auto && duel.phase !== 'done') {
    s.duel = duel
    s.phase = 'player'
    return
  }
  for (let guard = 0; guard < 40 && duel.phase !== 'done'; guard++) {
    const events = autoEvents(duel, data, rng)
    if (!events.length) break
    for (const e of events) {
      const r = reduce(duel, e, data, rng)
      duel = r.state
      step.push(...r.log)
      log.push(...r.log)
    }
  }
  settle(s, sideIdx, duel, target.hp, step, data, log)
}

function foeTurn(s: RaidState, uid: string, data: GameData, rng: Rng, log: RaidLogEntry[]) {
  const cfg = data.config.events.raid
  // The boss fills its free slots first, a point each.
  if (uid === s.boss.uid) {
    while (s.summons.length < cfg.maxField && s.points > 0) {
      const m = summonOne(s, data, rng)
      if (!m) break
      s.points -= 1
      log.push({ kind: 'raid_summon', b: structuredClone(m), points: s.points })
    }
  }
  const foe = foeOf(s, uid)!
  const sideIdx = foeTarget(s, rng)
  if (sideIdx == null) return
  s.lastHit = sideIdx
  let duel = duelOf(s, sideIdx, foe)
  log.push({ kind: 'raid_front', ally: activeOf(s.sides[sideIdx]!).uid, foe: uid, actor: 'foe' })
  const step: LogEntry[] = []
  startDuelStep(duel, 'enemy', data, step)
  if (duel.phase === 'enemy_turn') {
    const r = reduce(duel, { t: 'AI_TURN' }, data, rng)
    duel = r.state
    step.push(...r.log)
  }
  log.push(...step)
  settle(s, sideIdx, duel, foe.hp, step, data, log)
}

/**
 * Takes a finished duel step back into the raid: HP, statuses, the side's switch; then bars and K.O.s. `foeHpBefore` is
 * the foe's HP when the step started, `step` its log.
 */
function settle(s: RaidState, sideIdx: number, duel: BattleState, foeHpBefore: number, step: LogEntry[], data: GameData, log: RaidLogEntry[]) {
  const side = s.sides[sideIdx]!
  side.mons = duel.player
  side.active = duel.activeIndex
  putFoe(s, duel.enemy)
  if (duel.enemy.uid === s.boss.uid && s.boss.hp <= 0) {
    // What the step took past the bar carries into the next one.
    const harm = step.reduce(
      (n, e) => n + ((e.kind === 'damage' || e.kind === 'status_tick') && e.targetUid === s.boss.uid ? e.amount : 0),
      0,
    )
    breakBar(s, Math.max(0, harm - foeHpBefore), data, log)
    if (s.phase !== 'running') return
  }
  knockouts(s, log)
}

function breakBar(s: RaidState, overflow: number, data: GameData, log: RaidLogEntry[]) {
  s.broken += 1
  if (s.broken >= s.bars) return finish(s, 'won', log)
  // A new bar never empties on the hit that broke the last one.
  s.boss.hp = Math.max(1, s.boss.maxHp - overflow)
  s.points += data.config.events.raid.summonPerBreak
  log.push({ kind: 'raid_bar', broken: s.broken, barsLeft: s.bars - s.broken, points: s.points, hpAfter: s.boss.hp })
}

/** Down summons leave the field; a side whose Pokémon is down sends its next, or is out. */
function knockouts(s: RaidState, log: RaidLogEntry[]) {
  for (const m of s.summons.filter((x) => !live(x))) log.push({ kind: 'faint', side: 'enemy', uid: m.uid, dex: m.dex })
  const gone = new Set(s.summons.filter((x) => !live(x)).map((x) => x.uid))
  if (gone.size) {
    s.summons = s.summons.filter((x) => !gone.has(x.uid))
    s.queue = s.queue.filter((a) => !('foe' in a) || !gone.has(a.foe))
  }
  s.sides.forEach((side, i) => {
    if (side.out) return
    const a = activeOf(side)
    if (live(a)) return
    log.push({ kind: 'faint', side: 'player', uid: a.uid, dex: a.dex })
    const next = side.mons.findIndex(live)
    if (next >= 0) {
      side.active = next
      log.push({ kind: 'raid_next', side: i, uid: side.mons[next]!.uid })
    } else {
      side.out = true
      log.push({ kind: 'raid_out', side: i })
    }
  })
  if (s.sides.every((x) => x.out)) finish(s, 'lost', log)
}

function finish(s: RaidState, result: 'won' | 'lost', log: RaidLogEntry[], reason?: 'stalemate' | 'forfeit') {
  s.phase = result
  s.duel = null
  s.queue = []
  s.actor = null
  if (result === 'won') {
    s.boss.hp = 0
    log.push({ kind: 'faint', side: 'enemy', uid: s.boss.uid, dex: s.boss.dex })
    if (s.summons.length) log.push({ kind: 'raid_flee', uids: s.summons.map((m) => m.uid) })
    s.summons = []
  }
  // Statuses end with the fight, as in any battle.
  for (const side of s.sides) for (const m of side.mons) m.status = emptyStatus()
  s.boss.status = emptyStatus()
  log.push(reason ? { kind: 'raid_end', result, reason } : { kind: 'raid_end', result })
}

const NOOP = (state: RaidState) => ({ state, log: [] as RaidLogEntry[] })

/** The player's input on their turn. Anything else, or out of turn, changes nothing. */
export function raidDispatch(state: RaidState, e: RaidEvent, data: GameData, rng: Rng): { state: RaidState; log: RaidLogEntry[] } {
  if (state.phase !== 'player' || !state.duel || !state.actor || !('side' in state.actor)) return NOOP(state)
  const s = structuredClone(state)
  const duel = s.duel!
  const sideIdx = (s.actor as { side: number }).side
  const log: RaidLogEntry[] = []
  if (e.t === 'TARGET') {
    const target = foeOf(s, e.uid)
    const aiming = duel.phase === 'player_roll' || duel.phase === 'player_reroll' || duel.phase === 'player_stunned'
    if (!target || target.uid === duel.enemy.uid || !aiming) return NOOP(state)
    duel.enemy = structuredClone(target)
    log.push({ kind: 'raid_front', ally: duel.player[duel.activeIndex]!.uid, foe: target.uid, actor: 'ally' })
    copyFoeDice(duel, log as LogEntry[])
    return { state: s, log }
  }
  if (e.t === 'FORFEIT') {
    finish(s, 'lost', log, 'forfeit')
    return { state: s, log }
  }
  const before = foeOf(s, duel.enemy.uid)?.hp ?? duel.enemy.hp
  const r = reduce(duel, e, data, rng)
  log.push(...r.log)
  if (r.state.phase !== 'done') {
    s.duel = r.state
    return { state: s, log }
  }
  s.duel = null
  s.phase = 'running'
  settle(s, sideIdx, r.state, before, r.log, data, log)
  advance(s, data, rng, log)
  return { state: s, log }
}

export interface RaidSimResult {
  won: boolean
  steps: number
  barsBroken: number
  /** Sides still in at the end. */
  sidesLeft: number
}

/** A whole raid on auto, every side played by the AI (the balance sims). */
export function simulateRaid(opts: Omit<CreateRaidOptions, 'auto'>, data: GameData, rng: Rng): RaidSimResult {
  const { state } = createRaid({ ...opts, auto: true }, data, rng)
  return {
    won: state.phase === 'won',
    steps: state.steps,
    barsBroken: state.broken,
    sidesLeft: state.sides.filter((x) => !x.out).length,
  }
}
