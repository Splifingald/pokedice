// Versus: one player's team of three against another's, fought on auto from start to finish. The whole fight is
// computed before a single frame plays, so its result can be recorded first and leaving halfway changes nothing.
import { battleOutcome, createBattle, reduce, type BattleEvent, type BattleState, type LogEntry } from './battle'
import { uniformLevels } from './damage'
import { regionOf } from './regions'
import { autoEvents } from './sim'
import { createRng } from './rng'
import type { GameData, PokemonInstance, RegionId, SaveData } from './types'

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
  const live = regionOf(save)
  const blocks: [RegionId, PokemonInstance[]][] = [
    [live, save.box],
    ...Object.entries(save.parked ?? {})
      .filter(([region, b]) => region !== live && !!b)
      .map(([region, b]): [RegionId, PokemonInstance[]] => [region as RegionId, b!.box]),
  ]
  return blocks.flatMap(([region, box]) => box.filter((p) => eligible(p, data)).map((inst) => ({ inst, region })))
}

/** How many Pokémon at Lv.50 or more the player has, across every region they have played. */
export function versusReadyCount(save: SaveData, data: GameData): number {
  return versusCandidates(save, data).length
}

/** Versus opens once three Pokémon reach Lv.50, in any region. */
export function versusUnlocked(save: SaveData, data: GameData): boolean {
  return versusReadyCount(save, data) >= VERSUS_TEAM_SIZE
}

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

/**
 * The whole fight, decided by `seed` alone: the attacker's three go out in their order against each of the
 * defender's in turn, carrying their HP from one battle to the next, both sides played by the auto-mode AI.
 *
 * Nobody brings their own upgrades: both sides fight with every combo and die track at `versusUpgradeLevel` (admin).
 *
 * The attacker wins by knocking out all three defenders. Anything else — the attacker's team knocked out, or a
 * stalemate neither side can break — is the defender's win.
 */
export function simulateVersus(attacker: VersusMon[], defender: VersusMon[], data: GameData, seed: number, maxSteps = 5000): VersusFight {
  // The battle's own rolls and the auto player's choices draw from separate streams, like on the battle screen.
  const battleRng = createRng(seed)
  const choiceRng = createRng(seed ^ 0x5bd1e995)
  const rounds: VersusRound[] = []
  const hp: Record<string, number> = {}
  let lead: string | undefined
  let group = 0
  const levels = uniformLevels(data.config.versusUpgradeLevel)

  for (let d = 0; d < defender.length; d++) {
    const team = attacker.map((m, i) => ({
      uid: attackerUid(i),
      dex: m.dex,
      level: m.level,
      // Full health for the first battle; afterwards, whatever the last one left.
      hp: hp[attackerUid(i)] ?? Number.MAX_SAFE_INTEGER,
      shiny: m.shiny,
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
  return true
}
