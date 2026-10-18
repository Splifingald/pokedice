// Raid Battles, the fight (docs/18 §3, docs/19 §6.3): three sides of up to three Pokémon, one out each, against the
// raid Pokémon alone (its HP in bars). Each round the sides play in order, you first, and the raid Pokémon strikes
// back at each one right after its turn (the user's design, 2026-10-13: no summons, simpler to follow). The battle
// reducer stays one-on-one: every action here is a real duel step (battle.ts `startDuelStep`), so damage, combos,
// statuses and items are exactly the game's; only the type matchups are the raid's own (`sideTypes`, `bossTypes`).
// This file only decides who acts, against whom, and what a broken bar or a K.O. does to the raid.
import {
  makeBattler,
  reduce,
  startDuelStep,
  unleashForm,
  type BattleEvent,
  type BattleState,
  type Battler,
  type BattlerSeed,
  type LogEntry,
} from './battle'
import { isLegendary } from './breeding'
import { uniformLevels, type UpgradeLevels } from './damage'
import { raidRules, type RaidKindOf, type RaidRules } from './raidCalendar'
import { regionSpecies } from './regions'
import { createRng, type Rng } from './rng'
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
  /** Up to three Pokémon, levels already capped (`raidSeedLevels`); uids unique in the raid. */
  team: BattlerSeed[]
}

export interface RaidSide extends Omit<RaidSideSeed, 'team'> {
  mons: Battler[]
  active: number
  /** All its Pokémon K.O.: the side is out of the raid. */
  out: boolean
}

/** Who acts: a side (with whichever of its Pokémon is out), or the raid Pokémon striking back after side `boss`. */
export type RaidActor = { side: number } | { boss: number }

export type RaidPhase = 'running' | 'player' | 'won' | 'lost'

export interface RaidState {
  phase: RaidPhase
  sides: RaidSide[]
  boss: Battler
  /** Bars in all, and broken so far: the boss is beaten when its last bar empties. */
  bars: number
  broken: number
  round: number
  /** Still to act this round, in order. */
  queue: RaidActor[]
  actor: RaidActor | null
  /** The player's turn: their Pokémon's duel against the raid Pokémon, waiting on their input. */
  duel: BattleState | null
  /** Actions so far (the raid ends as a loss at `RAID_MAX_STEPS`). */
  steps: number
  /** This raid Pokémon's numbers (its own over the defaults), fixed when the raid starts. */
  rules?: RaidRules
  /** The sides' tracks and the raid Pokémon's, each with its type matchups (`typeScale`). */
  sideLevels: UpgradeLevels
  foeLevels: UpgradeLevels
  /** Every side plays itself (the sims). */
  auto?: boolean
}

export type RaidLogEntry =
  | LogEntry
  /** The raid Pokémon appears, alone. */
  | { kind: 'raid_start'; boss: string }
  /** The ally that steps to the front against the raid Pokémon, and who of the two acts. */
  | { kind: 'raid_front'; ally: string; actor: 'ally' | 'boss' }
  /** A bar broke: the next one fills. */
  | { kind: 'raid_bar'; broken: number; barsLeft: number; hpAfter: number }
  /** A side sends its next Pokémon after a K.O. */
  | { kind: 'raid_next'; side: number; uid: string }
  | { kind: 'raid_out'; side: number }
  | { kind: 'raid_end'; result: 'won' | 'lost'; reason?: 'stalemate' | 'forfeit' }

/** The player's input on their turn: a battle event in their duel. */
export type RaidEvent = BattleEvent

/** A raid that drags on this long (actions, every side's and every foe's) is lost. */
export const RAID_MAX_STEPS = 400

export const BOSS_UID = 'raid-boss'

/**
 * A Pokémon of yours or a friend's in a raid: at the team cap at most (its level shown, its HP), with the dice and
 * rerolls of its own level (the user's rule, 2026-10-18). The NPC trainers' fight at the cap, both alike.
 */
export const raidSeedLevels = (level: number, cap: number): Pick<BattlerSeed, 'level' | 'diceLevel'> => ({
  level: Math.min(level, cap),
  diceLevel: level,
})

// ---------------------------------------------------------------------------------------------------------------------
// Who can fight beside you.

/** Every species of a starter line: each region's starters and everything they evolve into. */
function starterLines(data: GameData): Set<number> {
  const out = new Set<number>([...data.config.starters, ...(data.regions ?? []).flatMap((r) => r.starters)])
  for (const dex of out) for (const e of data.species[dex]?.evolutions ?? []) out.add(e.toDex)
  return out
}

/**
 * NPC allies (and the calendar's shiny fillers): fully evolved, never legendary or mythical, never a starter line, never
 * on the config's pseudo-legendary and extra lists (Ultra Beasts, Paradox Pokémon…), never a form row, never a copier
 * (Ditto).
 */
export function raidAllyAllowed(data: GameData, cfg: RaidConfig = data.config.events.raid): (dex: number) => boolean {
  const starters = starterLines(data)
  const banned = new Set([...cfg.exclude.pseudo, ...cfg.exclude.extra, 132, 292])
  return (dex) => {
    const s = data.species[dex]
    return !!s && !s.form && s.evolutions.length === 0 && !isLegendary(data, dex) && !starters.has(dex) && !banned.has(dex)
  }
}

/** Three different allowed species of the given regions (fewer only when the regions have fewer). */
function npcPicks(data: GameData, regionIds: RegionId[], rng: Rng): number[] {
  const allowed = raidAllyAllowed(data)
  const pool = [...new Set(regionIds.flatMap((r) => [...regionSpecies(data, r)]))].filter(allowed).sort((a, b) => a - b)
  const picks: number[] = []
  for (let i = 0; i < 3 && pool.length; i++) {
    const left = pool.filter((d) => !picks.includes(d))
    picks.push(rng.pick(left.length ? left : pool))
  }
  return picks
}

/** An NPC trainer's three Pokémon: allowed species of the given regions, at the raid's team cap (or `level`). */
export function npcTeam(data: GameData, regionIds: RegionId[], rng: Rng, prefix: string, level = data.config.events.raid.teamCap): BattlerSeed[] {
  return npcPicks(data, regionIds, rng).map((dex, i) => ({ uid: `${prefix}-${i}`, dex, level, hp: Number.MAX_SAFE_INTEGER }))
}

/** One NPC trainer on offer when a raid starts with empty slots: a class trainer's name and look, three Pokémon. */
export interface RaidNpcOption {
  /** The trainer's name ("Ace Trainer Kai"); null when the content has no class trainer (the screen names it). */
  owner: string | null
  look: string | null
  team: number[]
}

/**
 * The NPC trainers offered on START with empty slots (docs/24): `count` class trainers — never a gym leader, a rival or
 * a named character, each a different look — with three allowed Pokémon of the given regions each. The same for a given
 * seed, so a reload offers the same four; the store draws a new seed for every try.
 */
export function raidNpcOffer(data: GameData, regionIds: RegionId[], seed: number, count = 4): RaidNpcOption[] {
  const rng = createRng(seed)
  // In id order, so the draw doesn't depend on the order the content was loaded in.
  const classes = Object.values(data.trainers)
    .filter((tr) => tr.role === 'trainer' && tr.spriteUrl?.includes('/classes/') && tr.name.includes(' '))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const used = new Set<string>()
  return Array.from({ length: count }, () => {
    const pool = classes.filter((tr) => !used.has(tr.spriteUrl ?? '') && !used.has(tr.name))
    const tr = pool.length ? rng.pick(pool) : null
    if (tr) {
      used.add(tr.spriteUrl ?? '')
      used.add(tr.name)
    }
    return { owner: tr?.name ?? null, look: tr?.spriteUrl ?? null, team: npcPicks(data, regionIds, rng) }
  })
}

/** An NPC on offer as the raid's side `k`: its Pokémon at `level`, uids unique in the raid. */
export function npcSideSeed(o: RaidNpcOption, k: number, level: number, name: string): RaidSideSeed {
  return {
    owner: o.owner ?? name,
    look: o.look,
    kind: 'npc',
    team: o.team.map((dex, i) => ({ uid: `s${k}-${i}`, dex, level, hp: Number.MAX_SAFE_INTEGER })),
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// The raid.

export interface CreateRaidOptions {
  boss: { dex: number; shiny: boolean }
  sides: RaidSideSeed[]
  /** The day's raid's numbers, or a progression raid's (docs/24). */
  kind?: RaidKindOf
  /** The progression raid's area: a small world's fights at its boss's level (docs/26 §2.5). */
  areaId?: string
  auto?: boolean
}

const live = (b: Battler) => b.hp > 0
const activeOf = (side: RaidSide) => side.mons[side.active]!

export function createRaid(opts: CreateRaidOptions, data: GameData, rng: Rng): { state: RaidState; log: RaidLogEntry[] } {
  const cfg = data.config.events.raid
  // This raid Pokémon's own numbers (Admin → Raids), over the defaults.
  const rules = raidRules(data, opts.boss.dex, opts.kind, opts.areaId)
  const boss = makeBattler({ uid: BOSS_UID, dex: opts.boss.dex, level: rules.level, hp: Number.MAX_SAFE_INTEGER, shiny: opts.boss.shiny }, data)
  // A bar holds `barHp` times its own HP.
  boss.maxHp = Math.max(1, Math.round(boss.maxHp * rules.barHp))
  boss.hp = boss.maxHp
  // Giratina's Origin Forme (any below-half-HP form) is its last bar's, not its HP's.
  boss.formHeld = true
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
    bars: rules.bars,
    rules,
    broken: 0,
    round: 0,
    queue: [],
    actor: null,
    duel: null,
    steps: 0,
    // Each side's attacks land through its own matchups: the sides' on the raid Pokémon, the raid Pokémon's on them.
    sideLevels: { ...uniformLevels(cfg.sideUpgradeLevel), typeScale: cfg.sideTypes },
    foeLevels: { ...uniformLevels(rules.upgradeLevel), typeScale: cfg.bossTypes },
    ...(opts.auto && { auto: true }),
  }
  const log: RaidLogEntry[] = [{ kind: 'raid_start', boss: boss.uid }]
  // A raid of one bar starts on its last.
  if (s.bars === 1) unleash(s, data, log)
  advance(s, data, rng, log)
  return { state: s, log }
}

/** A round: the sides still in, in order (you first), the raid Pokémon striking back after each one's turn. */
function roundOrder(s: RaidState): RaidActor[] {
  return s.sides.flatMap((side, i): RaidActor[] => (side.out ? [] : [{ side: i }, { boss: i }]))
}

/**
 * The side the raid Pokémon strikes back at after side `after`'s turn: that side, or when it's just gone out, the next
 * one still in. So it hits them one by one.
 */
export function bossTarget(s: RaidState, after: number): number | null {
  const n = s.sides.length
  for (let k = 0; k < n; k++) {
    const i = (after + k) % n
    if (!s.sides[i]!.out) return i
  }
  return null
}

/** Runs the raid until the player must act or it's over. */
function advance(s: RaidState, data: GameData, rng: Rng, log: RaidLogEntry[]) {
  while (s.phase === 'running') {
    if (s.steps >= RAID_MAX_STEPS) return finish(s, 'lost', log, 'stalemate')
    if (!s.queue.length) {
      s.round += 1
      s.queue = roundOrder(s)
    }
    const actor = s.queue.shift()!
    if ('side' in actor && s.sides[actor.side]!.out) continue
    s.actor = actor
    s.steps += 1
    if ('boss' in actor) bossTurn(s, actor.boss, data, rng, log)
    else sideTurn(s, actor.side, data, rng, log)
  }
}

/** The duel for one action: the side's team (its active Pokémon out) against the raid Pokémon. */
function duelOf(s: RaidState, sideIdx: number): BattleState {
  const side = s.sides[sideIdx]!
  return {
    kind: 'boss',
    phase: 'player_roll',
    turn: s.steps - 1,
    actor: 'player',
    nextActor: 'player',
    player: structuredClone(side.mons),
    activeIndex: side.active,
    enemy: structuredClone(s.boss),
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

function sideTurn(s: RaidState, sideIdx: number, data: GameData, rng: Rng, log: RaidLogEntry[]) {
  const side = s.sides[sideIdx]!
  const bossHp = s.boss.hp
  let duel = duelOf(s, sideIdx)
  log.push({ kind: 'raid_front', ally: activeOf(side).uid, actor: 'ally' })
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
  settle(s, sideIdx, duel, bossHp, step, log, data)
}

function bossTurn(s: RaidState, after: number, data: GameData, rng: Rng, log: RaidLogEntry[]) {
  const sideIdx = bossTarget(s, after)
  if (sideIdx == null) return
  const bossHp = s.boss.hp
  let duel = duelOf(s, sideIdx)
  log.push({ kind: 'raid_front', ally: activeOf(s.sides[sideIdx]!).uid, actor: 'boss' })
  const step: LogEntry[] = []
  startDuelStep(duel, 'enemy', data, step)
  if (duel.phase === 'enemy_turn') {
    const r = reduce(duel, { t: 'AI_TURN' }, data, rng)
    duel = r.state
    step.push(...r.log)
  }
  log.push(...step)
  settle(s, sideIdx, duel, bossHp, step, log, data)
}

/**
 * Takes a finished duel step back into the raid: HP, statuses, the side's switch; then bars and K.O.s. `bossHpBefore`
 * is the raid Pokémon's HP when the step started, `step` its log.
 */
function settle(
  s: RaidState,
  sideIdx: number,
  duel: BattleState,
  bossHpBefore: number,
  step: LogEntry[],
  log: RaidLogEntry[],
  data: GameData,
) {
  const side = s.sides[sideIdx]!
  side.mons = duel.player
  side.active = duel.activeIndex
  s.boss = duel.enemy
  if (s.boss.hp <= 0) {
    // What the step took past the bar carries into the next one.
    const harm = step.reduce(
      (n, e) =>
        n + ((e.kind === 'damage' || e.kind === 'status_tick') && e.targetUid === s.boss.uid ? e.amount : 0),
      0,
    )
    breakBar(s, Math.max(0, harm - bossHpBefore), log, data)
    if (s.phase !== 'running') return
  }
  knockouts(s, log)
}

function breakBar(s: RaidState, overflow: number, log: RaidLogEntry[], data: GameData) {
  s.broken += 1
  if (s.broken >= s.bars) return finish(s, 'won', log)
  // A new bar never empties on the hit that broke the last one.
  s.boss.hp = Math.max(1, s.boss.maxHp - overflow)
  log.push({ kind: 'raid_bar', broken: s.broken, barsLeft: s.bars - s.broken, hpAfter: s.boss.hp })
  if (s.bars - s.broken === 1) unleash(s, data, log)
}

/** The last bar: the raid Pokémon's below-half-HP form unleashed, one more die with it (none for most). */
function unleash(s: RaidState, data: GameData, log: RaidLogEntry[]) {
  const e = unleashForm(s.boss, data)
  if (e) log.push(e)
}

/** A side whose Pokémon is down sends its next, or is out. */
function knockouts(s: RaidState, log: RaidLogEntry[]) {
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
  if (e.t === 'FORFEIT') {
    finish(s, 'lost', log, 'forfeit')
    return { state: s, log }
  }
  const before = s.boss.hp
  const r = reduce(duel, e, data, rng)
  log.push(...r.log)
  if (r.state.phase !== 'done') {
    s.duel = r.state
    return { state: s, log }
  }
  s.duel = null
  s.phase = 'running'
  settle(s, sideIdx, r.state, before, r.log, log, data)
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
