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

/** Versus is open and its rules pop-up hasn't been shown yet (the other one-time pop-ups queue ahead of it). */
export const versusRulesDue = (save: SaveData, data: GameData): boolean =>
  !save.versusRulesSeen && versusUnlocked(save, data)

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

/** Both sides' battle powers (docs/31 §5): absent = none, the way Versus was before them. */
export interface VersusSides {
  attacker?: VersusPowers
  defender?: VersusPowers
}

/** What one side has spent of its powers, the whole fight being one battle (docs/31 §5): each power once. */
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
 * The whole fight, decided by `seed` alone: the attacker's three go out in their order against each of the
 * defender's in turn, carrying their HP from one battle to the next, both sides played by the auto-mode AI.
 *
 * Nobody brings their own upgrades: both sides fight with every combo and die track at `versusUpgradeLevel` (admin).
 * Each side brings its battle powers (`sides`, docs/31 §5): the whole fight counts as one battle, so each power is
 * used once per side, and one per Pokémon.
 *
 * The attacker wins by knocking out all three defenders. Anything else — the attacker's team knocked out, or a
 * stalemate neither side can break — is the defender's win.
 */
export function simulateVersus(
  attacker: VersusMon[],
  defender: VersusMon[],
  data: GameData,
  seed: number,
  sides: VersusSides = {},
  maxSteps = 5000,
): VersusFight {
  // The battle's own rolls and the auto player's choices draw from separate streams, like on the battle screen.
  const battleRng = createRng(seed)
  const choiceRng = createRng(seed ^ 0x5bd1e995)
  const rounds: VersusRound[] = []
  const hp: Record<string, number> = {}
  let lead: string | undefined
  let group = 0
  const levels = uniformLevels(data.config.versusUpgradeLevel)
  const powers = attackerPowers(sides.attacker, data)
  // The powers spent so far, and by which of the attacker's Pokémon: they carry from one battle to the next.
  const used: Spent = {}
  const powered: Record<string, PowerKind> = {}
  const foeSpent: Spent = {}

  for (let d = 0; d < defender.length; d++) {
    const team = attacker.map((m, i) => ({
      uid: attackerUid(i),
      dex: m.dex,
      level: m.level,
      // Full health for the first battle; afterwards, whatever the last one left.
      hp: hp[attackerUid(i)] ?? Number.MAX_SAFE_INTEGER,
      shiny: m.shiny,
      ...(powered[attackerUid(i)] && { powered: powered[attackerUid(i)] }),
    }))
    // A mutual K.O. — the attacker's last Pokémon falling as it wins — leaves nobody to face the next one.
    if (!team.some((p) => p.hp > 0)) return { seed, rounds, winner: 'defender' }
    const foe = defender[d]!
    const start = createBattle(
      {
        kind: 'trainer',
        team,
        leadUid: lead,
        enemy: { dex: foe.dex, level: foe.level, shiny: foe.shiny },
        playerLevels: levels,
        enemyLevels: levels,
        ...powers,
        used,
        enemyPlan: defenderPlan(foe.dex, sides.defender, foeSpent, data),
      },
      data,
    )
    const round: VersusRound = { defenderIndex: d, start, steps: [] }
    rounds.push(round)
    let state = start.state
    for (let guard = 0; guard < maxSteps && !terminal(state); guard++) {
      const events: BattleEvent[] = state.phase === 'enemy_turn' ? [{ t: 'AI_TURN' }] : autoEvents(state, data, choiceRng)
      if (!events.length) break
      group++
      for (const event of events) {
        const r = reduce(state, event, data, battleRng)
        state = r.state
        round.steps.push({ event, group, state, log: r.log })
      }
    }
    const out = battleOutcome(state)
    Object.assign(hp, out.hp)
    Object.assign(used, { mega: state.megaUsed ?? 0, gmax: state.gmaxUsed ?? 0, z: state.zUsed ?? 0 })
    for (const b of state.player) if (b.powered) powered[b.uid] = b.powered
    if (state.enemy.powered) foeSpent[state.enemy.powered] = 1
    if (out.result !== 'won') return { seed, rounds, winner: 'defender' }
    // The Pokémon that won stays out for the next one, when it's still standing.
    lead = out.fighterUid
  }
  return { seed, rounds, winner: rounds.length ? 'attacker' : 'defender' }
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
