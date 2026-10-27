// Versus: one player's team of three against another's, fought on auto from start to finish. The whole fight is
// computed before a single frame plays, so its result can be recorded first and leaving halfway changes nothing.
import { battleOutcome, createBattle, reduce, type BattleEvent, type BattleState, type EnemyPlan, type LogEntry } from './battle'
import { uniformLevels } from './damage'
import { gmaxFormsOf, megaFormsOf } from './forms'
import { gemRulesOn, gmaxBoostOn, megaFormsOfGems, zMovesOn, type VersusPowers } from './powers'
import { regionOf, worldRegionOf } from './regions'
import { autoEvents } from './sim'
import { createRng } from './rng'
import { typeMultiplier } from './typechart'
import { versusLeagueFor } from './versusLeague'
import type { GameData, PokeType, PokemonInstance, PowerKind, RegionId, SaveData } from './types'

/** Every Pokémon of a Versus team fights at this level: higher ones are brought down to it, lower ones can't enter. */
export const VERSUS_LEVEL = 50
export const VERSUS_TEAM_SIZE = 3

/** A Pokémon cloned into a Versus team: what the fight needs of it, frozen when the team is registered. */
export interface VersusMon {
  dex: number
  level: number
  shiny: boolean
}

const eligible = (p: PokemonInstance, data: GameData) => p.level >= VERSUS_LEVEL && p.revivesAt == null && !!data.species[p.dex]

/** A Pokémon that can join a Versus team, and the region whose Box it sits in. */
export interface VersusCandidate {
  inst: PokemonInstance
  region: RegionId
}

/**
 * The Pokémon that can join a Versus team: Lv.50 or more, hatched (not a reviving fossil), known species — from the
 * Box of every region the player has played, the one being played first.
 */
export function versusCandidates(save: SaveData, data: GameData): VersusCandidate[] {
  return everyBox(save).flatMap(([region, box]) => box.filter((p) => eligible(p, data)).map((inst) => ({ inst, region })))
}

/**
 * The team picker's list: one Pokémon per species, and one more for its shiny. Two of them fight exactly alike in
 * Versus (cloneForVersus keeps only the species, Lv.50 and the shine), so a species owned in several regions shows
 * once, the region being played first. Picked ones (`keep`) are always listed and take their species' place.
 */
export function versusChoices(save: SaveData, data: GameData, keep: readonly string[] = []): VersusCandidate[] {
  const all = versusCandidates(save, data)
  const kind = (c: VersusCandidate) => `${c.inst.dex}:${c.inst.shiny ? 'shiny' : ''}`
  const out = all.filter((c) => keep.includes(c.inst.id))
  const listed = new Set(out.map(kind))
  for (const c of all)
    if (!listed.has(kind(c))) {
      out.push(c)
      listed.add(kind(c))
    }
  return out
}

/** Every region's Box the player has played, the one being played first. A small world's stays in it. */
function everyBox(save: SaveData): [RegionId, PokemonInstance[]][] {
  const live = regionOf(save)
  const world = worldRegionOf(save)
  return [
    ...(live === world ? [] : [[live, save.box] as [RegionId, PokemonInstance[]]]),
    ...Object.entries(save.parked ?? {})
      .filter(([region, b]) => region !== live && region !== world && !!b)
      .map(([region, b]): [RegionId, PokemonInstance[]] => [region as RegionId, b!.box]),
  ]
}

/** While Versus is locked: the `n` Pokémon closest to Lv.50 (highest level first), from every region's Box. */
export function versusClosest(save: SaveData, data: GameData, n = VERSUS_TEAM_SIZE): VersusCandidate[] {
  return everyBox(save)
    .flatMap(([region, box]) => box.filter((p) => p.revivesAt == null && !!data.species[p.dex]).map((inst) => ({ inst, region })))
    .sort((a, b) => b.inst.level - a.inst.level)
    .slice(0, n)
}

/**
 * How many of their Pokémon your team hits super effectively: one of your Pokémon's types does more than ×1 against
 * all of its types together. A quick read of a matchup before the fight, not a prediction.
 */
export function versusEdge(mine: readonly number[], theirs: readonly number[], data: GameData): number {
  const attacking = [...new Set(mine.flatMap((dex) => speciesTypes(data, dex)))]
  return theirs.filter((dex) => {
    const defending = speciesTypes(data, dex)
    return defending.length > 0 && attacking.some((ty) => typeMultiplier(data.typeChart, ty, defending) > 1)
  }).length
}

const speciesTypes = (data: GameData, dex: number): PokeType[] => {
  const s = data.species[dex]
  return s ? (s.type2 ? [s.type1, s.type2] : [s.type1]) : []
}

/** How many Pokémon at Lv.50 or more the player has, across every region they have played. */
export function versusReadyCount(save: SaveData, data: GameData): number {
  return versusCandidates(save, data).length
}

/** Versus opens once three Pokémon reach Lv.50, in any region. */
export function versusUnlocked(save: SaveData, data: GameData): boolean {
  return versusReadyCount(save, data) >= VERSUS_TEAM_SIZE
}

/**
 * Versus is open and its rules haven't been read yet (its page's card, Home's notice). With the weekly league on
 * (docs/44), the league's rules, read once more by players who knew Versus before.
 */
export const versusRulesDue = (save: SaveData, data: GameData): boolean =>
  versusLeagueFor(save, data)
    ? !save.versusLeagueRulesSeen && versusUnlocked(save, data)
    : !save.versusRulesSeen && versusUnlocked(save, data)

/** The clone that fights for `p`: the same species and colours, at Lv.50 at most. */
export function cloneForVersus(p: Pick<PokemonInstance, 'dex' | 'level' | 'shiny'>): VersusMon {
  return { dex: p.dex, level: Math.min(p.level, VERSUS_LEVEL), shiny: !!p.shiny }
}

/** One engine call of the fight, with what it produced: the replay feeds these back to the battle screen in order. */
export interface VersusStep {
  event: BattleEvent
  /** Steps of one group are one move of the auto player (die toggles, then the REROLL or ATTACK they lead to). */
  group: number
  state: BattleState
  log: LogEntry[]
}

/** One defending Pokémon's battle: the attacker's team, as the previous battles left it, against it. */
export interface VersusRound {
  /** Which defender is out (0-based, in the defender's order). */
  defenderIndex: number
  start: { state: BattleState; log: LogEntry[] }
  steps: VersusStep[]
}

export interface VersusFight {
  seed: number
  rounds: VersusRound[]
  winner: 'attacker' | 'defender'
}

const terminal = (s: BattleState) => s.phase === 'won' || s.phase === 'lost' || s.phase === 'fled'

/** The attacker's Pokémon ids in the battle state; the defender's is always 'enemy', one at a time. */
const attackerUid = (i: number) => `a${i}`

/** Both sides' battle powers (docs/35 §5): absent = none, the way Versus was before them. */
export interface VersusSides {
  attacker?: VersusPowers
  defender?: VersusPowers
}

/** What one side has spent of its powers, the whole fight being one battle (docs/35 §5): each power once. */
type Spent = Partial<Record<PowerKind, number>>

/**
 * A defender's plan in its battle: its first turn Mega Evolves it if its side holds the gem and has its Mega left,
 * else Gigantamaxes it, else its first attack is a Z-Move — the auto player's order, one power per Pokémon.
 */
function defenderPlan(dex: number, powers: VersusPowers | undefined, spent: Spent, data: GameData): EnemyPlan | null {
  if (!powers) return null
  const gems = new Set(gemRulesOn(data) ? megaFormsOfGems(data, powers.gems) : [])
  const mega = !spent.mega && megaFormsOf(data, dex).find((f) => gems.has(f.dex))
  if (mega) return { mega: mega.dex }
  const gmax = !spent.gmax && powers.gmax && gmaxBoostOn(data) && gmaxFormsOf(data, dex)[0]
  if (gmax) return { gmax: gmax.dex }
  return !spent.z && powers.z && zMovesOn(data) ? { z: true } : null
}

/**
 * The attacker's powers, as a battle takes them: only those whose rules are on for whoever watches the fight. The rules
 * themselves (a Mega's turns, Gigantamax's dice and heal) hold for the defender's side too.
 */
function attackerPowers(powers: VersusPowers | undefined, data: GameData) {
  const gems = gemRulesOn(data)
  const boost = gmaxBoostOn(data) ? data.config.gigantamax.boost : null
  return {
    megaAllowed: gems && !!powers?.gems.length,
    gmaxAllowed: !!boost && !!powers?.gmax,
    zAllowed: zMovesOn(data) && !!powers?.z,
    ...(gems && { megaForms: megaFormsOfGems(data, powers?.gems ?? []), megaTurns: data.config.megaEvolution.gems.turns }),
    ...(boost && { gmaxBoost: { dice: boost.dice, healPercent: boost.healPercent } }),
  }
}

/**
 * A Versus fight in progress, as plain data: the battle being fought and what the earlier ones left. The two random
 * streams are kept as their states, so a match can be stepped by the player (the weekly league, docs/44) or played out
 * by the auto player (`simulateVersus`) and come out the same for the same seed and moves.
 */
export interface VersusMatch {
  seed: number
  attacker: VersusMon[]
  defender: VersusMon[]
  sides: VersusSides
  /** Which defender is out (0-based). */
  round: number
  state: BattleState
  /** The battle's own rolls, and the auto player's choices. */
  battleRng: number
  choiceRng: number
  /** The attacker's HP as the finished battles left it, by uid. */
  hp: Record<string, number>
  lead?: string
  /** The powers spent so far, and by which of the attacker's Pokémon: they carry from one battle to the next. */
  used: Spent
  powered: Record<string, PowerKind>
  foeSpent: Spent
  /** Set once the fight is over: the attacker knocked out all three, or not. */
  winner?: 'attacker' | 'defender'
}

/** A battle of the match, opened against defender `d`: its start, or null when the attacker has nobody left. */
function openRound(m: Omit<VersusMatch, 'state'>, d: number, data: GameData): { state: BattleState; log: LogEntry[] } | null {
  const team = m.attacker.map((p, i) => ({
    uid: attackerUid(i),
    dex: p.dex,
    level: p.level,
    // Full health for the first battle; afterwards, whatever the last one left.
    hp: m.hp[attackerUid(i)] ?? Number.MAX_SAFE_INTEGER,
    shiny: p.shiny,
    ...(m.powered[attackerUid(i)] && { powered: m.powered[attackerUid(i)] }),
  }))
  // A mutual K.O. — the attacker's last Pokémon falling as it wins — leaves nobody to face the next one.
  if (!team.some((p) => p.hp > 0)) return null
  const foe = m.defender[d]!
  const levels = uniformLevels(data.config.versusUpgradeLevel)
  return createBattle(
    {
      kind: 'trainer',
      team,
      leadUid: m.lead,
      enemy: { dex: foe.dex, level: foe.level, shiny: foe.shiny },
      playerLevels: levels,
      enemyLevels: levels,
      ...attackerPowers(m.sides.attacker, data),
      used: m.used,
      enemyPlan: defenderPlan(foe.dex, m.sides.defender, m.foeSpent, data),
    },
    data,
  )
}

/**
 * A Versus fight, opened: the attacker's three go out in their order against each of the defender's in turn, carrying
 * their HP from one battle to the next.
 *
 * Nobody brings their own upgrades: both sides fight with every combo and die track at `versusUpgradeLevel` (admin).
 * Each side brings its battle powers (`sides`, docs/35 §5): the whole fight counts as one battle, so each power is
 * used once per side, and one per Pokémon. No item is ever used (`versusStep` ignores them).
 */
export function startVersus(
  attacker: VersusMon[],
  defender: VersusMon[],
  data: GameData,
  seed: number,
  sides: VersusSides = {},
): { match: VersusMatch; log: LogEntry[] } {
  // The battle's own rolls and the auto player's choices draw from separate streams, like on the battle screen.
  const base = {
    seed,
    attacker,
    defender,
    sides,
    round: 0,
    battleRng: createRng(seed).getState(),
    choiceRng: createRng(seed ^ 0x5bd1e995).getState(),
    hp: {},
    used: {},
    powered: {},
    foeSpent: {},
  }
  const start = defender.length ? openRound(base, 0, data) : null
  if (!start) throw new Error('versus_empty_team')
  return { match: { ...base, state: start.state }, log: start.log }
}

/** Events the fight never takes: no item, no running from a trainer. */
const refused = (e: BattleEvent) => e.t === 'USE_ITEM' || e.t === 'RUN'

/** One event of the battle being fought. A refused or impossible one changes nothing. */
export function versusStep(
  match: VersusMatch,
  event: BattleEvent,
  data: GameData,
): { match: VersusMatch; log: LogEntry[] } {
  if (match.winner || terminal(match.state) || refused(event)) return { match, log: [] }
  const rng = createRng(match.battleRng)
  const r = reduce(match.state, event, data, rng)
  return { match: { ...match, state: r.state, battleRng: rng.getState() }, log: r.log }
}

/** The auto player's next move in the battle being fought (die toggles, then the REROLL or ATTACK they lead to). */
export function versusAutoMove(match: VersusMatch, data: GameData): { match: VersusMatch; events: BattleEvent[] } {
  const s = match.state
  if (match.winner || terminal(s)) return { match, events: [] }
  if (s.phase === 'enemy_turn') return { match, events: [{ t: 'AI_TURN' }] }
  const rng = createRng(match.choiceRng)
  const events = autoEvents(s, data, rng)
  return { match: { ...match, choiceRng: rng.getState() }, events }
}

/**
 * The battle being fought is over: the next one opens (the winner stays out), or the fight ends. Before then, nothing
 * changes. `log` is the next battle's opening.
 */
export function versusNextRound(match: VersusMatch, data: GameData): { match: VersusMatch; log: LogEntry[] } {
  const s = match.state
  if (match.winner || !terminal(s)) return { match, log: [] }
  const out = battleOutcome(s)
  const hp = { ...match.hp, ...out.hp }
  const used = { mega: s.megaUsed ?? 0, gmax: s.gmaxUsed ?? 0, z: s.zUsed ?? 0 }
  const powered = { ...match.powered }
  for (const b of s.player) if (b.powered) powered[b.uid] = b.powered
  const foeSpent = { ...match.foeSpent, ...(s.enemy.powered && { [s.enemy.powered]: 1 }) }
  const carried = { ...match, hp, used, powered, foeSpent }
  // Anything but a win — the attacker's team knocked out, a forfeit, a stalemate neither side can break — is the
  // defender's win.
  if (out.result !== 'won') return { match: { ...carried, winner: 'defender' }, log: [] }
  const d = match.round + 1
  if (d >= match.defender.length) return { match: { ...carried, winner: 'attacker' }, log: [] }
  const lead = out.fighterUid
  const next = openRound({ ...carried, lead }, d, data)
  if (!next) return { match: { ...carried, lead, winner: 'defender' }, log: [] }
  return { match: { ...carried, lead, round: d, state: next.state }, log: next.log }
}

/**
 * How the fight ended, in Pokémon still standing: the attacker's when it won (1–3), the defender's when it lost (the one
 * out, if it still stands, and those it never reached). The weekly league's trophies read these (docs/44).
 */
export function versusStanding(match: VersusMatch): { left: number; foeLeft: number } {
  const s = match.state
  const hp = { ...match.hp, ...Object.fromEntries(s.player.map((b) => [b.uid, b.hp])) }
  const left = match.attacker.filter((_, i) => (hp[attackerUid(i)] ?? 0) > 0).length
  const foeOut = s.enemy.hp > 0 || !terminal(s) ? 1 : 0
  const foeLeft = Math.max(0, match.defender.length - match.round - 1) + foeOut
  return match.winner === 'attacker' ? { left, foeLeft: 0 } : { left: 0, foeLeft: Math.max(1, foeLeft) }
}

/**
 * The whole fight, decided by `seed` alone, both sides played by the auto-mode AI (see `startVersus`). The attacker
 * wins by knocking out all three defenders.
 */
export function simulateVersus(
  attacker: VersusMon[],
  defender: VersusMon[],
  data: GameData,
  seed: number,
  sides: VersusSides = {},
  maxSteps = 5000,
): VersusFight {
  const rounds: VersusRound[] = []
  if (!attacker.length || !defender.length) return { seed, rounds, winner: 'defender' }
  let group = 0
  let { match, log } = startVersus(attacker, defender, data, seed, sides)
  while (!match.winner) {
    const round: VersusRound = { defenderIndex: match.round, start: { state: match.state, log }, steps: [] }
    rounds.push(round)
    for (let guard = 0; guard < maxSteps && !terminal(match.state); guard++) {
      const move = versusAutoMove(match, data)
      match = move.match
      if (!move.events.length) break
      group++
      for (const event of move.events) {
        const r = versusStep(match, event, data)
        match = r.match
        round.steps.push({ event, group, state: match.state, log: r.log })
      }
    }
    // A battle stuck short of its end (the guard) is a stalemate: the defender's.
    if (!terminal(match.state)) return { seed, rounds, winner: 'defender' }
    ;({ match, log } = versusNextRound(match, data))
  }
  return { seed, rounds, winner: rounds.length ? match.winner : 'defender' }
}

/** The events of the next auto move from `cursor` on (one group), for the battle screen to dispatch. */
export function versusMoveAt(round: VersusRound, cursor: number): BattleEvent[] {
  const first = round.steps[cursor]
  if (!first) return []
  const out: BattleEvent[] = []
  for (let i = cursor; i < round.steps.length && round.steps[i]!.group === first.group; i++) out.push(round.steps[i]!.event)
  return out
}

/** Same event, as far as the replay is concerned (a die toggle also has to name the same die). */
export function sameEvent(a: BattleEvent, b: BattleEvent): boolean {
  if (a.t !== b.t) return false
  if (a.t === 'TOGGLE_DIE' && b.t === 'TOGGLE_DIE') return a.i === b.i
  if (a.t === 'SWITCH' && b.t === 'SWITCH') return a.instanceId === b.instanceId
  if ((a.t === 'MEGA' || a.t === 'GMAX') && (b.t === 'MEGA' || b.t === 'GMAX')) return a.toDex === b.toDex
  return true
}
