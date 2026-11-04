// Friend Battles (docs/65): two friends fight 3 v 3 live, Classic (each their Versus team) or Draft (a coin, then one
// pick each in turn; the first picker carries the Bonus Shield).
//
// The fight is lockstep: both games hold this same match and apply the same moves in the order the server gave them,
// each with the seed the server answered it with, so every die thrown comes from a number that didn't exist before the
// move asking for it. Nothing here knows about the network: it is plain data in, plain data out.
//
// The battle engine is built around "you" against one foe at a time, with the foe played by its AI. Here both sides are
// people, so each turn is fought as a one-turn duel step (`startDuelStep`, the raids' own) with the side whose turn it
// is in the engine's "player" seat: both sides go through the same code, statuses, talents and rerolls carried on
// their own Pokémon from turn to turn. Between turns this file keeps the two teams, who is out, and who acts next.
import {
  activeBattler,
  canHurt,
  makeBattler,
  reduce,
  startDuelStep,
  type BattleState,
  type Battler,
  type LogEntry,
  type Side,
} from './battle'
import { uniformLevels } from './damage'
import { eventOpenTo } from './events'
import { isExtreme } from './extreme'
import { createRng, type Rng } from './rng'
import { getSpecies } from './data'
import { battleSpeed, effectiveStats } from './progression'
import { carriedTalent } from './talents'
import { versusChoices, versusSeedLevels, type VersusMon } from './versus'
import { versusPower } from './versusLeague'
import type { FriendBattlesConfig, GameData, SaveData } from './types'

/** The challenger is side `a`, the friend who answered side `b`, on both games. */
export type PvpSide = 'a' | 'b'
export type PvpMode = 'classic' | 'draft'

export const FRIEND_BATTLES_DEFAULTS: FriendBattlesConfig = {
  access: 'off',
  expiry: 120,
  pick: 30,
  order: 20,
  turn: 45,
  grace: 90,
  // % of the hit the first picker's team still takes from the opponent's first attack: 75, a quarter blocked (the
  // user's call, 2026-11-03; it was half).
  shield: 75,
  classic: true,
  draft: true,
  ticketDaily: 1,
  ticketCap: 3,
  ticketPrice: 10,
  ticketWeekly: 10,
  lv100: true,
}

/** The Friend Market's key for battle tickets (docs/65 §15): never an item of the Bag, held by the server. */
export const BATTLE_TICKET_KEY = 'battle-ticket'

export const friendBattlesConfig = (data: GameData): FriendBattlesConfig => ({
  ...FRIEND_BATTLES_DEFAULTS,
  ...(data.config.friendBattles ?? {}),
})

/** The switch, for whoever is playing (beta testers included when it says so). */
export const friendBattlesOn = (data: GameData): boolean => eventOpenTo(friendBattlesConfig(data).access, data)

/** This save may battle friends: the switch, the main game (Extreme mode is a race of its own, as for Trades). */
export const friendBattlesFor = (save: Pick<SaveData, 'mode'> | null | undefined, data: GameData): boolean =>
  !!save && friendBattlesOn(data) && !isExtreme(save) && !data.viewer?.race

export const friendBattlesRulesDue = (save: SaveData | null | undefined, data: GameData): boolean =>
  !!save && friendBattlesFor(save, data) && !save.friendBattlesRulesSeen

/** GOT IT on the page's rules card. */
export const markFriendBattlesRulesSeen = (save: SaveData): SaveData | null =>
  save.friendBattlesRulesSeen ? null : { ...save, friendBattlesRulesSeen: true }

export const otherSide = (s: PvpSide): PvpSide => (s === 'a' ? 'b' : 'a')

// ---------------------------------------------------------------- the draft

/** A Pokémon a player can draft: one per species (its shiny apart), at its best level. */
export interface DraftMon {
  dex: number
  level: number
  shiny: boolean
  talent?: boolean
}

export const sameMon = (x: Pick<DraftMon, 'dex' | 'shiny'>, y: Pick<DraftMon, 'dex' | 'shiny'>) =>
  x.dex === y.dex && x.shiny === y.shiny

/** What a player brings to a draft: Versus's list (Lv.50 or more, every region's Box, one per species, shiny apart). */
export function draftCandidates(save: SaveData, data: GameData): DraftMon[] {
  return versusChoices(save, data).map(({ inst }) => ({
    dex: inst.dex,
    level: inst.level,
    shiny: !!inst.shiny,
    ...(inst.talent && { talent: true }),
  }))
}

/** Who picks at each of the six picks: the coin's winner first, then in turn. */
export const draftOrder = (first: PvpSide): PvpSide[] => {
  const second = otherSide(first)
  return [first, second, first, second, first, second]
}

/** Whose pick it is after `picked` picks, or null once the six are in. */
export const draftTurn = (first: PvpSide, picked: number): PvpSide | null => draftOrder(first)[picked] ?? null

/**
 * What a player may pick now: their own Pokémon, a species once in their team, and never a species the other player
 * took — unless that would leave them nothing (the server's rule too, pvp_pick).
 */
export function draftChoices(own: readonly DraftMon[], mine: readonly DraftMon[], theirs: readonly DraftMon[]): DraftMon[] {
  const free = own.filter((c) => !mine.some((m) => m.dex === c.dex))
  const open = free.filter((c) => !theirs.some((t) => t.dex === c.dex))
  return open.length ? open : free
}

/** A pick's strength: the species at Lv.50 with the dice of its own level, as the fight will have it. */
const draftStrength = (data: GameData, m: DraftMon) => versusPower(data, m.dex) + m.level / 1000

/** The time-out's pick: the strongest left (`versusPower`), the higher level on a tie. */
export function draftAutoPick(choices: readonly DraftMon[], data: GameData): DraftMon | null {
  let best: DraftMon | null = null
  for (const c of choices) if (!best || draftStrength(data, c) > draftStrength(data, best)) best = c
  return best
}

/** The coin's face from the server's toss: heads when the challenger picks first. */
export const coinFace = (first: PvpSide): 'heads' | 'tails' => (first === 'a' ? 'heads' : 'tails')

// ---------------------------------------------------------------- the fight

/**
 * A player's move. `timeout`: the side whose turn it is ran out of time and attacks with the dice in hand. `switch`:
 * another of their able Pokémon comes in (its uid), and the turn is spent, as switching costs a turn in every fight.
 */
export type PvpMove =
  | { k: 'reroll'; mask: boolean[] }
  | { k: 'attack' }
  | { k: 'switch'; uid: string }
  | { k: 'timeout' }
  | { k: 'forfeit' }

/**
 * The match's log, in side a's view (a is "player", b is "enemy"): the battle's own entries, and `pvp_out` when a
 * side's Pokémon comes out: its next one after a K.O., or one it switched in (`switched`, the turn spent). Each game
 * turns it to its own side (`pvpLogFor`). The engine's own `switch` entry names no side, so it never enters this log.
 */
export type PvpEntry = LogEntry | { kind: 'pvp_out'; side: Side; uid: string; switched?: boolean }

export interface PvpMatch {
  /** Both teams, in fight order, as the last turn left them (uids `a0`… and `b0`…). */
  a: Battler[]
  b: Battler[]
  activeA: number
  activeB: number
  /** Whose turn it is. */
  actor: PvpSide
  /** That turn in progress, the dice in hand: the engine's duel step with `actor` in its player seat. Null once over. */
  step: BattleState | null
  shield: { side: PvpSide; pct: number; used: boolean } | null
  turn: number
  winner?: PvpSide | 'draw'
  reason?: 'ko' | 'forfeit' | 'stalemate'
}

/** A fight that drags on stops here, the side with more of its HP left winning. */
export const PVP_MAX_TURNS = 200

const toSide = (s: PvpSide): Side => (s === 'a' ? 'player' : 'enemy')

/** The battle engine's side, the other way round. */
const flipSide = (s: Side): Side => (s === 'player' ? 'enemy' : 'player')

/** An entry seen from the other side: every side it names swapped, a win a loss. */
export function flipEntry(e: PvpEntry): PvpEntry {
  const out = { ...e } as Record<string, unknown>
  for (const key of ['side', 'target', 'first'] as const) {
    const v = out[key]
    if (v === 'player' || v === 'enemy') out[key] = flipSide(v)
  }
  const hurt = out.hurt as { side: Side } | undefined
  if (hurt) out.hurt = { ...hurt, side: flipSide(hurt.side) }
  if (e.kind === 'end' && e.result !== 'fled') out.result = e.result === 'won' ? 'lost' : 'won'
  return out as PvpEntry
}

/** The match's log as `viewer`'s game shows it: their own Pokémon "player", the other's "enemy". */
export const pvpLogFor = (log: readonly PvpEntry[], viewer: PvpSide): PvpEntry[] =>
  viewer === 'a' ? [...log] : log.map(flipEntry)

const teamOf = (m: PvpMatch, s: PvpSide) => (s === 'a' ? m.a : m.b)
const activeOf = (m: PvpMatch, s: PvpSide) => (s === 'a' ? m.activeA : m.activeB)
const setActive = (m: PvpMatch, s: PvpSide, i: number) => (s === 'a' ? (m.activeA = i) : (m.activeB = i))

/** The levels a Friend Battle is fought at (docs/65 §16). */
export const PVP_LEVELS = [50, 100] as const
export type PvpLevel = (typeof PVP_LEVELS)[number]
export const pvpLevelOf = (n: unknown): PvpLevel => (n === 100 ? 100 : 50)

/**
 * A Pokémon in a Friend Battle at `level` (docs/65 §16), Versus's rule at either level: it shows that level and has
 * that level's HP and Speed, and keeps the dice and rerolls of its own level. At Lv.50 a stronger one is brought down;
 * at Lv.100 a weaker one is brought up, its dice its own.
 */
export function pvpBattler(mon: VersusMon, uid: string, data: GameData, level: PvpLevel = 50): Battler {
  const talent = carriedTalent(data, mon.dex, mon.talent)
  const seed = { uid, dex: mon.dex, hp: Number.MAX_SAFE_INTEGER, shiny: mon.shiny, talent }
  if (level === 50) return makeBattler({ ...seed, ...versusSeedLevels(mon.level) }, data)
  // Its own level's dice and rerolls, then the fight's level, HP and Speed.
  const b = makeBattler({ ...seed, level: Math.min(mon.level, level) }, data)
  if (mon.level >= level) return b
  const species = getSpecies(data, mon.dex)
  const at = effectiveStats(species, level, data, talent)
  return { ...b, level, maxHp: at.maxHp, hp: at.maxHp, speed: battleSpeed(species, level, data, talent) }
}

/** The engine's state for `actor`'s turn: its team in the player seat, the other side's Pokémon out as the foe. */
function stepFor(m: PvpMatch, data: GameData): BattleState {
  const actor = m.actor
  const foe = otherSide(actor)
  const levels = uniformLevels(data.config.versusUpgradeLevel)
  const team = structuredClone(teamOf(m, actor))
  const shield: BattleState['shield'] =
    m.shield && !m.shield.used ? { side: m.shield.side === actor ? 'player' : 'enemy', pct: m.shield.pct } : undefined
  return {
    kind: 'trainer',
    phase: 'player_roll',
    turn: m.turn,
    actor: 'player',
    nextActor: 'enemy',
    player: team,
    activeIndex: activeOf(m, actor),
    enemy: structuredClone(teamOf(m, foe)[activeOf(m, foe)]!),
    dice: [],
    selected: [],
    playerLevels: levels,
    enemyLevels: levels,
    participants: [team[activeOf(m, actor)]!.uid],
    canRun: false,
    noBag: true,
    lastDamage: null,
    itemUsedThisTurn: false,
    ...(shield && { shield }),
  }
}

/** The turn's state back into the match: the actor's team, the foe out, the shield. */
function writeBack(m: PvpMatch, step: BattleState) {
  const actor = m.actor
  const foe = otherSide(actor)
  const team = step.player.map((b) => structuredClone(b))
  if (actor === 'a') m.a = team
  else m.b = team
  setActive(m, actor, step.activeIndex)
  const foes = [...teamOf(m, foe)]
  foes[activeOf(m, foe)] = structuredClone(step.enemy)
  if (foe === 'a') m.a = foes
  else m.b = foes
  if (step.shield?.used && m.shield) m.shield = { ...m.shield, used: true }
  m.turn = step.turn
}

/** The step's entries, in side a's view. */
const fromActor = (m: PvpMatch, entries: LogEntry[]): PvpEntry[] => (m.actor === 'a' ? entries : entries.map(flipEntry))

const alive = (team: Battler[]) => team.some((b) => b.hp > 0)
const hpShare = (team: Battler[]) => team.reduce((sum, b) => sum + Math.max(0, b.hp) / Math.max(1, b.maxHp), 0)

function end(m: PvpMatch, winner: PvpSide | 'draw', reason: NonNullable<PvpMatch['reason']>, log: PvpEntry[]) {
  m.winner = winner
  m.reason = reason
  m.step = null
  const result = winner === 'a' ? 'won' : winner === 'b' ? 'lost' : 'fled'
  log.push(reason === 'ko' ? { kind: 'end', result } : { kind: 'end', result, reason: reason === 'forfeit' ? 'forfeit' : 'stalemate' })
}

/** A side's Pokémon out is down: it faints, and its next one in order comes out (or that side has lost). */
function knockOut(m: PvpMatch, s: PvpSide, log: PvpEntry[]): boolean {
  const team = teamOf(m, s)
  const b = team[activeOf(m, s)]!
  if (b.hp > 0) return false
  log.push({ kind: 'faint', side: toSide(s), uid: b.uid, dex: b.dex })
  const next = team.findIndex((x) => x.hp > 0)
  if (next < 0) return true
  setActive(m, s, next)
  log.push({ kind: 'pvp_out', side: toSide(s), uid: team[next]!.uid })
  return false
}

/** After a turn: the K.O.s, the end, and the other side's turn. */
function afterTurn(m: PvpMatch, log: PvpEntry[]) {
  const actor = m.actor
  const foe = otherSide(actor)
  // The foe fell first (the hit), then the attacker to its own recoil: the attacker's hit decided it.
  const foeOut = knockOut(m, foe, log)
  const actorOut = knockOut(m, actor, log)
  if (foeOut) return end(m, actor, 'ko', log)
  if (actorOut) return end(m, foe, 'ko', log)
  m.actor = foe
}

/** Neither Pokémon out can hurt the other, or the fight went on too long: more HP left wins. */
function stalled(m: PvpMatch, data: GameData): boolean {
  if (m.turn >= PVP_MAX_TURNS) return true
  const a = m.a[m.activeA]!
  const b = m.b[m.activeB]!
  return !canHurt(a, b, data) && !canHurt(b, a, data)
}

/**
 * Turns run until one waits for a decision (the dice in hand) or the fight is over: a stunned Pokémon's turn passes by
 * itself (no Bag to cure it), a status tick can K.O., a Z-Move's strike from up high lands on its own.
 */
function runTurns(m: PvpMatch, data: GameData, rng: Rng, log: PvpEntry[]) {
  for (let guard = 0; guard < 50 && !m.winner; guard++) {
    if (stalled(m, data)) {
      const a = hpShare(m.a)
      const b = hpShare(m.b)
      return end(m, a > b ? 'a' : b > a ? 'b' : 'draw', 'stalemate', log)
    }
    let step = stepFor(m, data)
    const entries: LogEntry[] = []
    startDuelStep(step, 'player', data, entries, rng)
    if (step.phase === 'player_stunned') {
      const r = reduce(step, { t: 'PASS' }, data, rng)
      step = r.state
      entries.push(...r.log)
    }
    if (step.phase === 'player_roll') {
      const r = reduce(step, { t: 'ROLL' }, data, rng)
      step = r.state
      entries.push(...r.log)
    }
    log.push(...fromActor(m, entries))
    writeBack(m, step)
    if (step.phase === 'player_reroll') {
      m.step = step
      return
    }
    m.step = null
    afterTurn(m, log)
  }
}

/**
 * The fight opened: both teams in their order, the faster lead first (a tie goes to the seed), and the first turn's
 * dice thrown. `shield`: the Draft's first picker. The log opens the way a battle's does (`start`).
 */
export function startPvp(
  teamA: VersusMon[],
  teamB: VersusMon[],
  shield: PvpSide | null,
  data: GameData,
  seed: number,
  shieldPct = FRIEND_BATTLES_DEFAULTS.shield,
  level: PvpLevel = 50,
): { match: PvpMatch; log: PvpEntry[] } {
  if (!teamA.length || !teamB.length) throw new Error('pvp_empty_team')
  const rng = createRng(seed)
  const a = teamA.map((mon, i) => pvpBattler(mon, `a${i}`, data, level))
  const b = teamB.map((mon, i) => pvpBattler(mon, `b${i}`, data, level))
  const speedA = a[0]!.speed ?? 0
  const speedB = b[0]!.speed ?? 0
  const first: PvpSide = speedA > speedB ? 'a' : speedB > speedA ? 'b' : rng.next() < 0.5 ? 'a' : 'b'
  const match: PvpMatch = {
    a,
    b,
    activeA: 0,
    activeB: 0,
    actor: first,
    step: null,
    shield: shield ? { side: shield, pct: shieldPct, used: false } : null,
    turn: 0,
  }
  const log: PvpEntry[] = [{ kind: 'start', first: toSide(first) }]
  runTurns(match, data, rng, log)
  return { match, log }
}

/**
 * One move, as the server ordered it, with its seed. A move that can't be made now (not that side's turn, no reroll
 * left, the fight over) changes nothing on either game, so the two stay the same whatever is sent. Returns the entries
 * it added, in side a's view.
 */
export function applyPvpMove(
  match: PvpMatch,
  side: PvpSide,
  move: PvpMove,
  seed: number,
  data: GameData,
): { match: PvpMatch; log: PvpEntry[] } {
  if (match.winner) return { match, log: [] }
  const log: PvpEntry[] = []
  if (move.k === 'forfeit') {
    const m = structuredClone(match)
    end(m, otherSide(side), 'forfeit', log)
    return { match: m, log }
  }
  const step = match.step
  if (!step) return { match, log: [] }
  // A time-out is the turn's own side running out of time, whoever reports it: it can only cost that side its turn.
  if (move.k !== 'timeout' && side !== match.actor) return { match, log: [] }
  const m = structuredClone(match)
  const rng = createRng(seed)
  if (move.k === 'reroll') {
    const mask = move.mask
    if (!Array.isArray(mask) || mask.length !== step.dice.length || !mask.some(Boolean)) return { match, log: [] }
    if (activeBattler(step).rerollsLeft <= 0) return { match, log: [] }
    let s: BattleState = { ...step, selected: mask.map((x) => !!x) }
    const r = reduce(s, { t: 'REROLL' }, data, rng)
    if (r.state === s) return { match, log: [] }
    s = r.state
    log.push(...fromActor(m, r.log))
    writeBack(m, s)
    m.step = s
    return { match: m, log }
  }
  if (move.k === 'switch') {
    // The engine's own voluntary switch (the Pokémon out goes back, the dice are dropped, the turn ends), refused as it
    // refuses it anywhere: an unknown, fainted or already-out Pokémon changes nothing.
    const r = reduce(step, { t: 'SWITCH', instanceId: String(move.uid) }, data, rng)
    if (r.state === step || r.state.activeIndex === step.activeIndex) return { match, log: [] }
    const entries: PvpEntry[] = r.log.map((e) =>
      e.kind === 'switch' ? { kind: 'pvp_out', side: 'player', uid: e.uid, switched: true } : e,
    )
    log.push(...(m.actor === 'a' ? entries : entries.map(flipEntry)))
    writeBack(m, r.state)
    m.step = null
    afterTurn(m, log)
    runTurns(m, data, rng, log)
    return { match: m, log }
  }
  // ATTACK (or the time-out's attack): the turn resolves, then the turns that follow run until the next decision.
  const r = reduce({ ...step, selected: step.dice.map(() => false) }, { t: 'ATTACK' }, data, rng)
  log.push(...fromActor(m, r.log))
  writeBack(m, r.state)
  m.step = null
  afterTurn(m, log)
  runTurns(m, data, rng, log)
  return { match: m, log }
}

/** Pokémon still standing on each side. */
export function pvpStanding(m: PvpMatch): { a: number; b: number } {
  return { a: m.a.filter((b) => b.hp > 0).length, b: m.b.filter((b) => b.hp > 0).length }
}

/**
 * A short fingerprint of the match as it stands: both games send it with the result, and two that differ mean the
 * games played different fights (the match is void).
 */
export function pvpHash(m: PvpMatch): string {
  const parts = [
    m.winner ?? '-',
    m.turn,
    ...[...m.a, ...m.b].map((b) => `${b.uid}:${b.hp}:${b.rerollsLeft}`),
  ].join('|')
  let h = 0x811c9dc5
  for (let i = 0; i < parts.length; i++) {
    h ^= parts.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/**
 * The battle screen's state for `viewer`: their team in the player seat and the other's Pokémon out as the foe. On
 * their turn the dice are theirs to reroll; on the other's, the phase is the foe's turn (the screen waits, its moves
 * coming from the network). `foeUid`: the foe the screen is showing, when the match has moved past it (it fainted):
 * that battle is then over for the screen, won, until it opens the next.
 */
export function pvpView(m: PvpMatch, viewer: PvpSide, data: GameData, foeUid?: string): BattleState {
  const foeSide = otherSide(viewer)
  const own = teamOf(m, viewer)
  const foes = teamOf(m, foeSide)
  const shownFoe = (foeUid && foes.find((b) => b.uid === foeUid)) || foes[activeOf(m, foeSide)]!
  const passed = shownFoe.uid !== foes[activeOf(m, foeSide)]!.uid
  const levels = uniformLevels(data.config.versusUpgradeLevel)
  const mine = m.actor === viewer
  const phase: BattleState['phase'] =
    m.winner && !passed
      ? m.winner === viewer
        ? 'won'
        : m.winner === 'draw'
          ? 'fled'
          : 'lost'
      : passed
        ? alive(own)
          ? 'won'
          : 'lost'
        : mine
          ? 'player_reroll'
          : 'enemy_turn'
  const live = !m.winner && !passed && m.step
  return {
    kind: 'trainer',
    phase,
    turn: m.turn,
    actor: mine ? 'player' : 'enemy',
    nextActor: mine ? 'enemy' : 'player',
    player: structuredClone(own),
    activeIndex: activeOf(m, viewer),
    enemy: structuredClone(shownFoe),
    dice: live ? [...m.step!.dice] : [],
    selected: live ? m.step!.dice.map(() => false) : [],
    playerLevels: levels,
    enemyLevels: levels,
    participants: own.map((b) => b.uid),
    canRun: false,
    noBag: true,
    lastDamage: null,
    itemUsedThisTurn: false,
    ...(m.shield && {
      shield: { side: m.shield.side === viewer ? 'player' : 'enemy', pct: m.shield.pct, used: m.shield.used },
    }),
  }
}
