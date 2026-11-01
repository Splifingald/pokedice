// Raid Battles, the fight (docs/18 §3, docs/19 §6.3): three sides of up to three Pokémon, one out each, against the
// raid Pokémon alone (its HP in bars). Each round the sides play in order, you first, and the raid Pokémon strikes
// back at each one right after its turn (the user's design, 2026-10-13: no summons, simpler to follow). The battle
// reducer stays one-on-one: every action here is a real duel step (battle.ts `startDuelStep`), so damage, combos,
// statuses and items are exactly the game's; only the type matchups are the raid's own (`sideTypes`, `bossTypes`).
// This file only decides who acts, against whom, and what a broken bar or a K.O. does to the raid.
import {
  makeBattler,
  raidFormShift,
  raidPlate,
  reduce,
  startDuelStep,
  unleashForm,
  wearForm,
  type BattleEvent,
  type BattleState,
  type Battler,
  type BattlerSeed,
  type LogEntry,
} from './battle'
import { isLegendary } from './breeding'
import { attackMultiplier, uniformLevels, type UpgradeLevels } from './damage'
import { portalRaidRules } from './portalMode'
import { raidRules, raidSpecialFor, type RaidKindOf, type RaidRules } from './raidCalendar'
import type { RaidHit } from './raidHit'
import {
  GRASSY_HEAL,
  INTERRUPT_SHARE,
  megaRaidDie,
  WEATHER_CHIP,
  WEATHER_SPARES,
  weatherBoosts,
  type RaidMod,
  type RaidMove,
  type RaidSpecial,
  type RaidTerrain,
  type RaidWeather,
} from './raidSpecials'
import { regionSpecies } from './regions'
import { createRng, type Rng } from './rng'
import { autoEvents } from './sim'
import { applyStatuses, emptyStatus } from './status'
import type { DieType, GameData, PokeType, RaidConfig, RegionId } from './types'

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
  /** The raid overhaul's own rules for this raid and where they stand (docs/40); absent when it's off. */
  special?: RaidSpecialState
  /**
   * The type it takes as each bar starts (the Hall of Origin's Arceus changing its Plate, docs/64 §4.5: its area's mode
   * says which), by bar; absent for every other raid.
   */
  plates?: PokeType[]
}

/** What heals in a raid outside a duel step (docs/40). */
export type RaidHealCause = 'regen' | 'recover' | 'grassy' | 'lifesteal' | 'love' | 'combo'
/** What wears a Pokémon down outside a duel step (docs/40). */
export type RaidTickCause = 'snow' | 'sand' | 'chip' | 'meteor' | 'hazard' | 'reflect' | 'recoil'

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
  // The raid overhaul's (docs/40):
  /** The raid's weather and terrain, as it starts. */
  | { kind: 'raid_field'; weather: RaidWeather | null; terrain: RaidTerrain | null }
  /** It starts charging a move that fires on round `fires`. */
  | { kind: 'raid_charge'; move: RaidMove; fires: number }
  /** The sides dealt enough while it charged: the move is lost, and its next strike too. */
  | { kind: 'raid_interrupt' }
  /** The charged move fires. */
  | { kind: 'raid_move'; move: RaidMove }
  /** It skips a strike: recharging (or interrupted), or teleported away. */
  | { kind: 'raid_skip'; reason: 'recharge' | 'teleport' }
  /** A side's Pokémon (`side`) or the raid Pokémon (`side` null) loses HP outside a hit. */
  | {
      kind: 'raid_tick'
      side: number | null
      uid: string
      amount: number
      hpAfter: number
      cause: RaidTickCause
    }
  /** A side's Pokémon (`side`) or the raid Pokémon (`side` null) heals. */
  | {
      kind: 'raid_heal'
      side: number | null
      uid: string
      amount: number
      hpAfter: number
      cause: RaidHealCause
    }
  /** Its combo-only shield: HP left, of `max`. */
  | { kind: 'raid_shield'; hp: number; max: number }
  /** A hit without a combo bounced off the shield. */
  | { kind: 'raid_bounce' }
  /** It gains dice: a broken bar, a K.O., an absorbed type, a charge. */
  | { kind: 'raid_boost'; dice: DieType[]; cause: 'bar' | 'ko' | 'absorb' | 'charge' }
  /** It takes a type (its dice that change, Rotom's appliance…). */
  | { kind: 'raid_shift'; type: PokeType; dice: DieType[] }
  /** Its last bar's power: the dice it gains; its strikes hit every side from now on. */
  | { kind: 'raid_final'; dice: DieType[]; spread: boolean }

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
export function raidAllyAllowed(
  data: GameData,
  cfg: RaidConfig = data.config.events.raid,
): (dex: number) => boolean {
  const starters = starterLines(data)
  const banned = new Set([...cfg.exclude.pseudo, ...cfg.exclude.extra, 132, 292])
  return (dex) => {
    const s = data.species[dex]
    return (
      !!s &&
      !s.form &&
      s.evolutions.length === 0 &&
      !isLegendary(data, dex) &&
      !starters.has(dex) &&
      !banned.has(dex)
    )
  }
}

/** Three different allowed species of the given regions (fewer only when the regions have fewer). */
function npcPicks(data: GameData, regionIds: RegionId[], rng: Rng): number[] {
  const allowed = raidAllyAllowed(data)
  const pool = [...new Set(regionIds.flatMap((r) => [...regionSpecies(data, r)]))]
    .filter(allowed)
    .sort((a, b) => a - b)
  const picks: number[] = []
  for (let i = 0; i < 3 && pool.length; i++) {
    const left = pool.filter((d) => !picks.includes(d))
    picks.push(rng.pick(left.length ? left : pool))
  }
  return picks
}

/** An NPC trainer's three Pokémon: allowed species of the given regions, at the raid's team cap (or `level`). */
export function npcTeam(
  data: GameData,
  regionIds: RegionId[],
  rng: Rng,
  prefix: string,
  level = data.config.events.raid.teamCap,
): BattlerSeed[] {
  return npcPicks(data, regionIds, rng).map((dex, i) => ({
    uid: `${prefix}-${i}`,
    dex,
    level,
    hp: Number.MAX_SAFE_INTEGER,
  }))
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
export function raidNpcOffer(
  data: GameData,
  regionIds: RegionId[],
  seed: number,
  count = 4,
): RaidNpcOption[] {
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

/** Its own rules' standing (docs/40), with the rules themselves: what changes as the raid goes. */
export interface RaidSpecialState {
  def: RaidSpecial
  /** Rain, sun… none under Air Lock. */
  weather?: RaidWeather
  terrain?: RaidTerrain
  /** A telegraphed move charging: the round it fires, what the sides have dealt since, and what interrupts it. */
  charge?: { move: RaidMove; fires: number; dealt: number; need: number }
  /** Strikes left with Geomancy's two more dice. */
  charged?: number
  /** It skips its next strike (after Roar of Time, or an interrupted move). */
  skipNext?: boolean
  /** Charging Shadow Force: hits on it do half. */
  vanished?: boolean
  /** The combo-only shield on this bar: HP left, and what it started with. */
  shield?: number
  shieldMax?: number
  /** Halved hits left on this bar. */
  halfHits?: number
  /** Recover is spent for this bar. */
  recovered?: boolean
  /** Dice gained from K.O.s. */
  koDice?: number
  /** The absorbed type gave its die already. */
  absorbed?: boolean
  /** A dice-only type change: the type, and which dice took it. */
  shifted?: { type: PokeType; idx: number[] }
  /** Rounds left with every hit on it halved (Cosmoem's last bar). */
  hardened?: number
  /** A combo hit it this round (Zygarde's cells don't heal then). */
  comboHit?: boolean
  /** Its last bar has begun. */
  final?: boolean
}

/** A step's actor in `settle`: a side's turn, or the raid Pokémon's strike. */
type Who = 'side' | 'boss'

export function createRaid(
  opts: CreateRaidOptions,
  data: GameData,
  rng: Rng,
): { state: RaidState; log: RaidLogEntry[] } {
  const cfg = data.config.events.raid
  // This raid Pokémon's own numbers (Admin → Raids), over the raid overhaul's (docs/40), over the defaults.
  const rules = raidRules(data, opts.boss.dex, opts.kind, opts.areaId)
  const def = raidSpecialFor(data, opts.boss.dex, opts.kind, opts.areaId)
  const boss = makeBattler(
    {
      uid: BOSS_UID,
      dex: opts.boss.dex,
      level: rules.level,
      hp: Number.MAX_SAFE_INTEGER,
      shiny: opts.boss.shiny,
    },
    data,
  )
  // A bar holds `barHp` times its own HP.
  boss.maxHp = Math.max(1, Math.round(boss.maxHp * rules.barHp))
  boss.hp = boss.maxHp
  // Giratina's Origin Forme (any below-half-HP form) is its last bar's, not its HP's.
  boss.formHeld = true
  // A portal area's raid may set its type bar by bar (the Hall of Origin's Arceus and its Plates).
  const plates = opts.kind === 'progress' ? portalRaidRules(data, opts.areaId)?.barTypes : undefined
  const sides: RaidSide[] = opts.sides.map((seed) => {
    const { team, ...who } = seed
    const mons = team.map((t) => makeBattler(t, data))
    const active = Math.max(0, mons.findIndex(live))
    return { ...who, mons, active, out: !mons.some(live) }
  })
  const special = def ? specialStart(def, boss, data) : undefined
  const drop = def?.mods.reduce((n, m) => (m.k === 'upgradeDrop' ? n + m.levels : n), 0) ?? 0
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
    sideLevels: {
      ...uniformLevels(Math.max(1, cfg.sideUpgradeLevel - drop)),
      typeScale: cfg.sideTypes,
      ...boosts(special, 'side'),
    },
    foeLevels: { ...uniformLevels(rules.upgradeLevel), typeScale: cfg.bossTypes, ...boosts(special, 'boss') },
    ...(special && { special }),
    ...(opts.auto && { auto: true }),
    ...(plates && plates.length > 0 && { plates }),
  }
  const log: RaidLogEntry[] = [{ kind: 'raid_start', boss: boss.uid }]
  // Its first bar's Plate (none to announce when it starts in that type already).
  takePlate(s, data, log)
  if (special) {
    if (special.weather || special.terrain)
      log.push({ kind: 'raid_field', weather: special.weather ?? null, terrain: special.terrain ?? null })
    newBar(s, 0, data, log)
  }
  // A raid of one bar starts on its last.
  if (s.bars === 1) unleash(s, data, log)
  advance(s, data, rng, log)
  return { state: s, log }
}

/** Its rules' standing at the start: the weather (none under Air Lock), its extra dice (a Mega raid's Mega die). */
function specialStart(def: RaidSpecial, boss: Battler, data: GameData): RaidSpecialState {
  const airLock = def.mods.some((m) => m.k === 'airLock')
  for (const m of def.mods) if (m.k === 'extraDie') addDie(boss, m.die)
  const mega = megaRaidDie(data, boss.dex)
  if (mega) addDie(boss, mega)
  return {
    def,
    ...(!airLock && def.weather && { weather: def.weather }),
    ...(!airLock && def.terrain && { terrain: def.terrain }),
  }
}

/** The weather's and the auras' type boosts, for the sides' attacks or the raid Pokémon's. */
function boosts(
  special: RaidSpecialState | undefined,
  who: 'side' | 'boss',
): Pick<UpgradeLevels, 'typeBoost'> {
  if (!special) return {}
  const out: Partial<Record<PokeType, number>> = { ...weatherBoosts(special.weather) }
  for (const a of special.def.auras ?? [])
    if (a.who === 'all' || who === 'boss') out[a.type] = (out[a.type] ?? 1) * a.mult
  return Object.keys(out).length ? { typeBoost: out } : {}
}

/** A die more for the raid Pokémon, with its other typed dice (ahead of any base die). */
function addDie(b: Battler, die: DieType) {
  b.dice.splice(die === 'base' ? b.dice.length : b.dice.filter((d) => d !== 'base').length, 0, die)
}

const modOf = <K extends RaidMod['k']>(s: RaidState, k: K): Extract<RaidMod, { k: K }> | undefined =>
  s.special?.def.mods.find((m): m is Extract<RaidMod, { k: K }> => m.k === k)

/** A round: the sides still in, in order (you first), the raid Pokémon striking back after each one's turn. */
function roundOrder(s: RaidState): RaidActor[] {
  // Trick Room (docs/40): it strikes before each side's turn instead.
  const first = !!modOf(s, 'trickRoom')
  return s.sides.flatMap((side, i): RaidActor[] =>
    side.out ? [] : first ? [{ boss: i }, { side: i }] : [{ side: i }, { boss: i }],
  )
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
      if (s.round > 0 && s.special) {
        endOfRound(s, rng, log)
        if (s.phase !== 'running') return
      }
      s.round += 1
      s.queue = roundOrder(s)
      if (s.special) startOfRound(s, log)
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
function duelOf(s: RaidState, sideIdx: number, hit?: RaidHit): BattleState {
  const side = s.sides[sideIdx]!
  // Power Spot (docs/51): another side's Pokémon in battle that carries it boosts this side's hits.
  const others = s.sides.filter((x, i) => i !== sideIdx && !x.out).map((x) => activeOf(x))
  const powerSpot = others.find((b) => b && b.hp > 0 && b.talent === 'powerSpot')
  // Friend Guard: one softens the raid Pokémon's hits on this side.
  const friendGuard = others.find((b) => b && b.hp > 0 && b.talent === 'friendGuard')
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
    // No items in this raid (Unnerve, docs/40): as if one were used already.
    itemUsedThisTurn: !!modOf(s, 'noItems'),
    // Mega Evolution and Gigantamax stay out of raids; a type changer on auto picks its type itself.
    ...((side.kind !== 'me' || s.auto) && { auto: true }),
    single: true,
    ...(hit && { raidHit: hit }),
    ...(powerSpot && { allyPowerSpot: { uid: powerSpot.uid, name: powerSpot.name } }),
    ...(friendGuard && { allyFriendGuard: { uid: friendGuard.uid, name: friendGuard.name } }),
  }
}

/** What the raid's rules do to a side's hits on the raid Pokémon this step. */
function sideHit(s: RaidState): RaidHit | undefined {
  const sp = s.special
  if (!sp) return undefined
  const hit: RaidHit = {}
  const half = (sp.halfHits ?? 0) > 0 || sp.vanished || (sp.hardened ?? 0) > 0
  if (half) hit.mult = 0.5
  if (sp.shield) hit.shield = sp.shield
  const absorb = modOf(s, 'absorb')
  if (absorb) hit.absorb = absorb.type
  const prism = modOf(s, 'prism')
  if (prism) hit.prism = prism.mult
  const cut = modOf(s, 'comboCut')
  if (cut) hit.comboCut = cut.pct
  if (sp.weather === 'heavyRain') hit.nullType = 'fire'
  if (sp.weather === 'strongWinds' && s.boss.types.includes('flying')) hit.deltaStream = true
  if (sp.terrain === 'misty') hit.noStatus = true
  return Object.keys(hit).length ? hit : undefined
}

/** What the raid's rules do to the raid Pokémon's strike on a side (`mult`: the strike's own ×). */
function bossHit(s: RaidState, target: Battler, mult: number): RaidHit | undefined {
  const sp = s.special
  if (!sp) return mult === 1 ? undefined : { mult }
  const hit: RaidHit = {}
  let m = mult
  for (const mod of sp.def.mods) {
    if (mod.k === 'strikeMult' && (mod.above == null || target.hp > target.maxHp * mod.above)) m *= mod.mult
    if (mod.k === 'neverResisted') hit.neverResisted = mod.types ?? 'all'
    if (mod.k === 'burnLonger') hit.burnLonger = mod.turns
  }
  if (m !== 1) hit.mult = m
  if (sp.final && sp.def.final?.stellar) hit.stellar = true
  if (sp.weather === 'heavyRain') hit.nullType = 'fire'
  if (sp.terrain === 'misty') hit.noStatus = true
  return Object.keys(hit).length ? hit : undefined
}

function sideTurn(s: RaidState, sideIdx: number, data: GameData, rng: Rng, log: RaidLogEntry[]) {
  const side = s.sides[sideIdx]!
  const bossHp = s.boss.hp
  let duel = duelOf(s, sideIdx, sideHit(s))
  log.push({ kind: 'raid_front', ally: activeOf(side).uid, actor: 'ally' })
  const step: LogEntry[] = []
  startDuelStep(duel, 'player', data, step, rng)
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
  settle(s, sideIdx, duel, bossHp, step, log, data, 'side')
}

function bossTurn(s: RaidState, after: number, data: GameData, rng: Rng, log: RaidLogEntry[]) {
  const sideIdx = bossTarget(s, after)
  if (sideIdx == null) return
  const sp = s.special
  if (!sp) return strike(s, sideIdx, 1, data, rng, log)
  const skipEvery = modOf(s, 'skipEvery')
  if (skipEvery && s.round % skipEvery.n === 0)
    return void log.push({ kind: 'raid_skip', reason: 'teleport' })
  if (sp.skipNext) {
    sp.skipNext = false
    return void log.push({ kind: 'raid_skip', reason: 'recharge' })
  }
  // Love and hate (Enamorus): odd rounds it heals the side it faces instead of striking, even rounds it hits harder.
  const loveHate = modOf(s, 'loveHate')
  let mult = 1
  if (loveHate) {
    if (s.round % 2 === 1) {
      const t = activeOf(s.sides[sideIdx]!)
      return void healSide(sideIdx, t, Math.max(1, Math.round(t.maxHp * loveHate.heal)), 'love', log)
    }
    mult *= loveHate.mult
  }
  // A telegraphed move fires on its round's first strike.
  if (sp.charge && s.round >= sp.charge.fires) {
    const move = sp.charge.move
    delete sp.charge
    sp.vanished = false
    log.push({ kind: 'raid_move', move })
    switch (move) {
      case 'spread':
        return strikeAll(s, sideIdx, mult, data, rng, log)
      case 'blast': {
        const cost = Math.max(1, Math.round(s.boss.maxHp * 0.05))
        s.boss.hp = Math.max(1, s.boss.hp - cost)
        log.push({
          kind: 'raid_tick',
          side: null,
          uid: s.boss.uid,
          amount: cost,
          hpAfter: s.boss.hp,
          cause: 'recoil',
        })
        return strikeAll(s, sideIdx, mult, data, rng, log)
      }
      case 'charge':
        sp.charged = 2
        return void log.push({ kind: 'raid_boost', dice: [], cause: 'charge' })
      case 'burn': {
        strike(s, sideIdx, mult, data, rng, log)
        const t = activeOf(s.sides[sideIdx]!)
        if (s.phase === 'running' && live(t)) {
          t.status = applyStatuses(
            t.status,
            [{ status: 'burn', stacks: 3, turns: data.config.status.burn.duration }],
            data.config.status,
          )
          log.push({
            kind: 'status',
            target: 'player',
            targetUid: t.uid,
            status: 'burn',
            stacks: 3,
            turns: data.config.status.burn.duration,
          })
        }
        return
      }
      case 'recharge':
        sp.skipNext = true
        return strike(s, sideIdx, mult * 1.5, data, rng, log)
      case 'strong':
      case 'vanish':
        return strike(s, sideIdx, mult * 1.5, data, rng, log)
    }
  }
  const fin = sp.final ? sp.def.final : undefined
  if (fin?.shiftEvery) shiftType(s, activeOf(s.sides[sideIdx]!), data, log)
  if (fin?.spread) return strikeAll(s, sideIdx, mult * fin.spread, data, rng, log)
  const twice = modOf(s, 'twice')
  if (twice && (twice.every == null || s.round % twice.every === 0)) {
    const m = twice.every == null ? twice.mult : 1
    strike(s, sideIdx, mult * m, data, rng, log)
    const next = bossTarget(s, sideIdx)
    if (s.phase === 'running' && next != null) strike(s, next, mult * m, data, rng, log)
    return
  }
  strike(s, sideIdx, mult, data, rng, log)
  if (modOf(s, 'spacialRend') && s.phase === 'running') {
    const next = bossTarget(s, (sideIdx + 1) % s.sides.length)
    if (next != null && next !== sideIdx) strike(s, next, mult, data, rng, log)
  }
}

/** Its strike lands on every side still in, the one it faces first. */
function strikeAll(s: RaidState, first: number, mult: number, data: GameData, rng: Rng, log: RaidLogEntry[]) {
  const order = s.sides.map((_, k) => (first + k) % s.sides.length)
  for (const i of order) {
    if (s.phase !== 'running') return
    if (!s.sides[i]!.out) strike(s, i, mult, data, rng, log)
  }
}

/** One strike of the raid Pokémon on side `sideIdx`: a duel step, its dice as its rules have them right now. */
function strike(s: RaidState, sideIdx: number, mult: number, data: GameData, rng: Rng, log: RaidLogEntry[]) {
  const bossHp = s.boss.hp
  const target = activeOf(s.sides[sideIdx]!)
  const sp = s.special
  // Slow Start halves its dice for its first rounds; Geomancy adds two for two strikes.
  const dice = s.boss.dice
  const slow = modOf(s, 'slowStart')
  if (slow && s.round <= slow.rounds) s.boss.dice = dice.slice(0, Math.ceil(dice.length / 2))
  if (sp?.charged) {
    s.boss.dice = [...s.boss.dice, s.boss.types[0]!, s.boss.types[0]!]
    sp.charged -= 1
  }
  let duel = duelOf(s, sideIdx, bossHit(s, target, mult))
  log.push({ kind: 'raid_front', ally: target.uid, actor: 'boss' })
  const step: LogEntry[] = []
  startDuelStep(duel, 'enemy', data, step, rng)
  if (duel.phase === 'enemy_turn') {
    const r = reduce(duel, { t: 'AI_TURN' }, data, rng)
    duel = r.state
    step.push(...r.log)
  }
  log.push(...step)
  settle(s, sideIdx, duel, bossHp, step, log, data, 'boss')
  s.boss.dice = dice
}

/** Damage `step` dealt to `uid`. */
const dealt = (step: LogEntry[], uid: string) =>
  step.reduce(
    (n, e) => n + ((e.kind === 'damage' || e.kind === 'status_tick') && e.targetUid === uid ? e.amount : 0),
    0,
  )

/**
 * Takes a finished duel step back into the raid: HP, statuses, the side's switch; then the raid's rules, bars and K.O.s.
 * `bossHpBefore` is the raid Pokémon's HP when the step started, `step` its log, `who` whose step it was.
 */
function settle(
  s: RaidState,
  sideIdx: number,
  duel: BattleState,
  bossHpBefore: number,
  step: LogEntry[],
  log: RaidLogEntry[],
  data: GameData,
  who: Who = 'side',
) {
  const side = s.sides[sideIdx]!
  side.mons = duel.player
  side.active = duel.activeIndex
  s.boss = duel.enemy
  const harm = dealt(step, s.boss.uid)
  if (s.special) afterStep(s, sideIdx, duel, step, harm, log, who)
  if (s.boss.hp <= 0) {
    // What the step took past the bar carries into the next one.
    breakBar(s, Math.max(0, harm - bossHpBefore), sideIdx, log, data)
    if (s.phase !== 'running') return
  }
  knockouts(s, log, who === 'boss' ? sideIdx : null)
}

/** The raid's rules after a step (docs/40): the shield, halved hits, what a hit gives or costs. */
function afterStep(
  s: RaidState,
  sideIdx: number,
  duel: BattleState,
  step: LogEntry[],
  harm: number,
  log: RaidLogEntry[],
  who: Who,
) {
  const sp = s.special!
  const fin = sp.final ? sp.def.final : undefined
  const attacker = activeOf(s.sides[sideIdx]!)
  if (who === 'side') {
    const hits = step.filter(
      (e): e is Extract<LogEntry, { kind: 'damage' }> => e.kind === 'damage' && e.targetUid === s.boss.uid,
    )
    const hit = duel.raidHit
    if (hit && sp.shield != null && hit.shield != null && hit.shield !== sp.shield) {
      sp.shield = hit.shield
      log.push({ kind: 'raid_shield', hp: sp.shield, max: sp.shieldMax ?? sp.shield })
    }
    if (hit?.bounced) log.push({ kind: 'raid_bounce' })
    if (hits.length && (sp.halfHits ?? 0) > 0) sp.halfHits = Math.max(0, sp.halfHits! - hits.length)
    if (hits.some((e) => e.result.combo)) {
      sp.comboHit = true
      const heal = modOf(s, 'comboHeal')
      if (heal && live(attacker))
        healSide(sideIdx, attacker, Math.max(1, Math.round(attacker.maxHp * heal.pct)), 'combo', log)
    }
    if (hit?.absorbed && !sp.absorbed) {
      sp.absorbed = true
      addDie(s.boss, hit.absorb!)
      log.push({ kind: 'raid_boost', dice: [hit.absorb!], cause: 'absorb' })
    }
    if (sp.charge) {
      sp.charge.dealt += harm
      if (sp.charge.dealt >= sp.charge.need) {
        delete sp.charge
        sp.vanished = false
        sp.skipNext = true
        log.push({ kind: 'raid_interrupt' })
      }
    }
    if (fin?.reflect && harm > 0 && live(attacker)) {
      const back = Math.max(1, Math.round(harm * fin.reflect))
      tickSide(sideIdx, attacker, back, 'reflect', log)
    }
    // Full Metal Body: statuses on it last one turn.
    if (modOf(s, 'statusShort')) {
      const st = s.boss.status
      if (st.burn) st.burn.turns = Math.min(st.burn.turns, 1)
      if (st.poison) st.poison.turns = Math.min(st.poison.turns, 1)
      st.frozen = Math.min(st.frozen, 1)
      st.paralyze = Math.min(st.paralyze, 1)
    }
    const recover = modOf(s, 'recover')
    if (recover && !sp.recovered && s.boss.hp > 0 && s.boss.hp * 2 < s.boss.maxHp) {
      sp.recovered = true
      healBoss(s, Math.round(s.boss.maxHp * recover.pct), 'recover', log)
    }
  } else {
    const target = activeOf(s.sides[sideIdx]!)
    const steal = modOf(s, 'lifesteal')
    const done = dealt(step, target.uid)
    if (steal && done > 0 && s.boss.hp > 0) healBoss(s, Math.round(done * steal.pct), 'lifesteal', log)
  }
}

function healBoss(s: RaidState, amount: number, cause: RaidHealCause, log: RaidLogEntry[]) {
  const before = s.boss.hp
  s.boss.hp = Math.min(s.boss.maxHp, s.boss.hp + Math.max(0, amount))
  if (s.boss.hp > before)
    log.push({
      kind: 'raid_heal',
      side: null,
      uid: s.boss.uid,
      amount: s.boss.hp - before,
      hpAfter: s.boss.hp,
      cause,
    })
}

function healSide(sideIdx: number, mon: Battler, amount: number, cause: RaidHealCause, log: RaidLogEntry[]) {
  const before = mon.hp
  mon.hp = Math.min(mon.maxHp, mon.hp + Math.max(0, amount))
  if (mon.hp > before)
    log.push({
      kind: 'raid_heal',
      side: sideIdx,
      uid: mon.uid,
      amount: mon.hp - before,
      hpAfter: mon.hp,
      cause,
    })
}

function tickSide(sideIdx: number, mon: Battler, amount: number, cause: RaidTickCause, log: RaidLogEntry[]) {
  mon.hp = Math.max(0, mon.hp - amount)
  log.push({ kind: 'raid_tick', side: sideIdx, uid: mon.uid, amount, hpAfter: mon.hp, cause })
}

/** A round begins: a telegraphed move starts charging a round before it fires; Shadow Force vanishes meanwhile. */
function startOfRound(s: RaidState, log: RaidLogEntry[]) {
  const sp = s.special!
  sp.comboHit = false
  const tg = modOf(s, 'telegraph')
  if (tg && !sp.charge && s.round % tg.every === tg.every - 1) {
    sp.charge = {
      move: tg.move,
      fires: s.round + 1,
      dealt: 0,
      need: Math.max(1, Math.round(s.boss.maxHp * INTERRUPT_SHARE)),
    }
    if (tg.move === 'vanish') sp.vanished = true
    log.push({ kind: 'raid_charge', move: tg.move, fires: s.round + 1 })
  }
}

/** A round ends: the weather's and the terrain's wear and healing, the raid Pokémon's own healing, then the K.O.s. */
function endOfRound(s: RaidState, rng: Rng, log: RaidLogEntry[]) {
  const sp = s.special!
  const fin = sp.final ? sp.def.final : undefined
  const spares = sp.weather ? WEATHER_SPARES[sp.weather] : undefined
  const ins = s.sides.map((side, i) => ({ side, i })).filter(({ side }) => !side.out && live(activeOf(side)))
  if (spares)
    for (const { side, i } of ins) {
      const mon = activeOf(side)
      if (!mon.types.some((t) => spares.includes(t)))
        tickSide(i, mon, Math.max(1, Math.round(mon.maxHp * WEATHER_CHIP)), sp.weather as RaidTickCause, log)
    }
  const chip = modOf(s, 'chip')
  if (chip) {
    const hit = chip.who === 'all' ? ins : ins.length ? [rng.pick(ins)] : []
    for (const { side, i } of hit) {
      const mon = activeOf(side)
      if (live(mon))
        tickSide(
          i,
          mon,
          Math.max(1, Math.round(mon.maxHp * chip.pct)),
          chip.who === 'all' ? 'chip' : 'meteor',
          log,
        )
    }
  }
  if (sp.terrain === 'grassy') {
    for (const { side, i } of ins) {
      const mon = activeOf(side)
      if (live(mon)) healSide(i, mon, Math.max(1, Math.round(mon.maxHp * GRASSY_HEAL)), 'grassy', log)
    }
    healBoss(s, Math.round(s.boss.maxHp * GRASSY_HEAL), 'grassy', log)
  }
  const regen = modOf(s, 'regen')
  if (regen) {
    const st = s.boss.status
    const blocked =
      (regen.unless === 'status' && (!!st.burn || !!st.poison)) || (regen.unless === 'combo' && sp.comboHit)
    if (!blocked) healBoss(s, Math.round(s.boss.maxHp * regen.pct * (fin?.regen ?? 1)), 'regen', log)
  }
  if (sp.hardened) sp.hardened -= 1
  knockouts(s, log)
}

/** A new bar (0: the first): its shield and halved hits; its type change, the bar's die, its last bar's power. */
function newBar(s: RaidState, sideIdx: number, data: GameData, log: RaidLogEntry[]) {
  const sp = s.special!
  const shield = modOf(s, 'shield')
  if (shield) {
    sp.shield = sp.shieldMax = Math.max(1, Math.round(s.boss.maxHp * shield.share))
    log.push({ kind: 'raid_shield', hp: sp.shield, max: sp.shieldMax })
  }
  const first = modOf(s, 'firstHits')
  if (first) sp.halfHits = first.n
  sp.recovered = false
  const barDie = modOf(s, 'barDie')
  if (barDie && s.broken > 0) {
    addDie(s.boss, barDie.die)
    log.push({ kind: 'raid_boost', dice: [barDie.die], cause: 'bar' })
  }
  const shift = modOf(s, 'shift')
  if (shift && (!shift.bars || shift.bars.includes(s.broken + 1))) {
    const facing = s.sides[sideIdx] && !s.sides[sideIdx]!.out ? sideIdx : bossTarget(s, sideIdx)
    if (facing != null) shiftType(s, activeOf(s.sides[facing]!), data, log)
  }
}

/**
 * It takes the type that hits `target` hardest (docs/40): a menu form (Arceus, Ogerpon), else one of its shift's types
 * on its `from` dice (Rotom, Calyrex, Necrozma). Nothing when what it has is already best.
 */
function shiftType(s: RaidState, target: Battler, data: GameData, log: RaidLogEntry[]) {
  const shift = modOf(s, 'shift')
  const b = s.boss
  if (!shift?.types) {
    const e = raidFormShift(b, target, data)
    if (e) log.push(e)
    return
  }
  const sp = s.special!
  const score = (t: PokeType) => attackMultiplier(t, target.types, data)
  let best = shift.types[0]!
  for (const t of shift.types) if (score(t) > score(best)) best = t
  if (sp.shifted?.type === best) return
  const idx =
    sp.shifted?.idx ??
    b.dice
      .map((d, i) => ((shift.from ?? []).includes(d) ? i : -1))
      .filter((i) => i >= 0)
      .slice(0, shift.count ?? Infinity)
  if (!idx.length) return
  for (const i of idx) b.dice[i] = best
  sp.shifted = { type: best, idx }
  log.push({ kind: 'raid_shift', type: best, dice: [...b.dice] })
}

function breakBar(s: RaidState, overflow: number, sideIdx: number, log: RaidLogEntry[], data: GameData) {
  s.broken += 1
  if (s.broken >= s.bars) return finish(s, 'won', log)
  // A new bar never empties on the hit that broke the last one.
  s.boss.hp = Math.max(1, s.boss.maxHp - overflow)
  log.push({ kind: 'raid_bar', broken: s.broken, barsLeft: s.bars - s.broken, hpAfter: s.boss.hp })
  if (s.special) {
    // A move charging when its bar breaks is lost.
    if (s.special.charge) {
      delete s.special.charge
      s.special.vanished = false
    }
    newBar(s, sideIdx, data, log)
  }
  takePlate(s, data, log)
  if (s.bars - s.broken === 1) unleash(s, data, log)
}

/** The bar starting now takes its Plate, when the raid has them (docs/64 §4.5): its type form, every die that type. */
function takePlate(s: RaidState, data: GameData, log: RaidLogEntry[]) {
  const type = s.plates?.[s.broken]
  if (!type) return
  const e = raidPlate(s.boss, type, data)
  if (e) log.push(e)
}

/** The last bar: the raid Pokémon's below-half-HP form unleashed, one more die with it (none for most); its own power. */
function unleash(s: RaidState, data: GameData, log: RaidLogEntry[]) {
  const e = unleashForm(s.boss, data)
  if (e) log.push(e)
  const sp = s.special
  if (!sp) return
  sp.final = true
  const fin = sp.def.final
  if (!fin) return
  if (fin.form && data.species[fin.form]) {
    const fromDex = s.boss.dex
    wearForm(s.boss, data.species[fin.form]!, data)
    log.push({
      kind: 'form',
      side: 'enemy',
      uid: s.boss.uid,
      fromDex,
      toDex: s.boss.dex,
      reason: 'unleash',
      dice: [...s.boss.dice],
    })
  }
  const dice: DieType[] = [...(fin.dice ?? [])]
  if (fin.shiftDice) for (let i = 0; i < fin.shiftDice; i++) dice.push(sp.shifted?.type ?? s.boss.types[0]!)
  for (const d of dice) addDie(s.boss, d)
  if (fin.harden) sp.hardened = fin.harden
  log.push({ kind: 'raid_final', dice, spread: !!fin.spread })
}

/**
 * A side whose Pokémon is down sends its next, or is out. `byBoss`: the side the raid Pokémon just struck (a K.O. there
 * feeds Beast Boost). A side's next Pokémon steps onto Stealth Rock.
 */
function knockouts(s: RaidState, log: RaidLogEntry[], byBoss: number | null = null) {
  const hazard = modOf(s, 'hazard')
  const koDie = modOf(s, 'koDie')
  s.sides.forEach((side, i) => {
    for (let guard = 0; guard < 4 && !side.out; guard++) {
      const a = activeOf(side)
      if (live(a)) return
      log.push({ kind: 'faint', side: 'player', uid: a.uid, dex: a.dex })
      if (koDie && byBoss === i && s.special && (s.special.koDice ?? 0) < koDie.max) {
        s.special.koDice = (s.special.koDice ?? 0) + 1
        const d = s.boss.types[0]!
        addDie(s.boss, d)
        log.push({ kind: 'raid_boost', dice: [d], cause: 'ko' })
      }
      const next = side.mons.findIndex(live)
      if (next < 0) {
        side.out = true
        log.push({ kind: 'raid_out', side: i })
        return
      }
      side.active = next
      log.push({ kind: 'raid_next', side: i, uid: side.mons[next]!.uid })
      if (hazard) {
        const mon = side.mons[next]!
        tickSide(i, mon, Math.max(1, Math.round(mon.maxHp * hazard.pct)), 'hazard', log)
      }
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
export function raidDispatch(
  state: RaidState,
  e: RaidEvent,
  data: GameData,
  rng: Rng,
): { state: RaidState; log: RaidLogEntry[] } {
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
  settle(s, sideIdx, r.state, before, r.log, log, data, 'side')
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
