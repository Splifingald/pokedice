// Headless battles: both sides driven by the §8 AI. Powers the admin simulator and the balance scripts.
import { aiRerollMask } from './ai'
import {
  activeBattler,
  autoTypeForm,
  canHurt,
  canZMove,
  createBattle,
  foesOnField,
  gmaxChoices,
  megaChoices,
  reduce,
  type BattleEvent,
  type BattleState,
  type LogEntry,
} from './battle'
import { attackMultiplier, attackType } from './damage'
import { computeDamage, uniformLevels, type UpgradeLevels } from './damage'
import { getSpecies } from './data'
import { rollAll, rerollMasked } from './dice'
import { effectiveStats } from './progression'
import { createRng, type Rng } from './rng'
import type { GameData, PokeType } from './types'

export interface SimSide {
  dex: number
  level: number
}

export interface SimResult {
  winner: 'player' | 'enemy' | 'draw'
  /** The battle reached a terminal phase (a stalemate counts as finished, as a draw). */
  finished: boolean
  /** Turns the player side got to act (stunned turns included). */
  playerTurns: number
  turns: number
  playerDamage: number[]
  enemyDamage: number[]
}

/**
 * The events the player side would send right now, in order — the same greedy AI as enemies. Reroll turns come as
 * die toggles then REROLL (or ATTACK). Empty when it isn't the player's move. Powers the sims and the battle's auto-mode.
 */
export function autoEvents(state: BattleState, data: GameData, rng: Rng): BattleEvent[] {
  switch (state.phase) {
    case 'player_roll': {
      // In an auto battle a type changer (Arceus…) first takes a type that hits the foe harder, if it has one.
      const form = state.auto ? autoTypeForm(state, data, rng) : null
      if (form) return [{ t: 'CHANGE_FORM', toDex: form.dex }]
      const a = activeBattler(state)
      // A double battle: aim at the foe its dice hit hardest, the weakest of those first (docs/33).
      const aim = state.double ? bestTarget(state, data) : null
      if (aim && aim.uid !== state.enemy.uid) return [{ t: 'TARGET', uid: aim.uid }, { t: 'ROLL' }]
      // Like a player would: a Pokémon that can't touch the foe (Normal vs Ghost) makes way for one that can.
      const scale = state.playerLevels.typeScale
      const better =
        !canHurt(a, state.enemy, data, scale) &&
        benchOf(state).find((b) => b.hp > 0 && canHurt(b, state.enemy, data, scale))
      if (better && data.config.allowVoluntarySwitch) return [{ t: 'SWITCH', instanceId: better.uid }]
      // The battle powers it has (docs/35), the first Pokémon able to taking each: a Mega first, else a Gigantamax.
      const mega = megaChoices(state, data)[0]
      if (mega) return [{ t: 'MEGA', toDex: mega.dex }]
      const gmax = gmaxChoices(state, data)[0]
      if (gmax) return [{ t: 'GMAX', toDex: gmax.dex }]
      return [{ t: 'ROLL' }]
    }
    case 'player_stunned':
      // A Steel-type's Z-Move shakes the stun off (docs/35).
      return [canZMove(state, data) ? { t: 'ZMOVE' } : { t: 'PASS' }]
    case 'player_switch': {
      const alive = benchOf(state).filter((b) => b.hp > 0)
      const next = alive.find((b) => canHurt(b, state.enemy, data, state.playerLevels.typeScale)) ?? alive[0]
      return next ? [{ t: 'SWITCH', instanceId: next.uid }] : []
    }
    case 'player_reroll': {
      const a = activeBattler(state)
      const mask =
        a.rerollsLeft > 0
          ? aiRerollMask({
              dice: state.dice,
              attackerTypes: a.types,
              defenderTypes: state.enemy.types,
              levels: state.playerLevels,
              data,
              rng,
              // Auto-mode swings the moment the roll is lethal rather than hunting a bigger number it cannot use.
              targetHp: state.enemy.hp,
            })
          : null
      // A Pokémon that took no other power attacks with the Z-Move as soon as it may.
      if (!mask?.some(Boolean)) return [canZMove(state, data) ? { t: 'ZMOVE' } : { t: 'ATTACK' }]
      const toggles: BattleEvent[] = mask.flatMap((m, i) => (m !== !!state.selected[i] ? [{ t: 'TOGGLE_DIE' as const, i }] : []))
      return [...toggles, { t: 'REROLL' }]
    }
    default:
      return []
  }
}

/** Yours that could come in: every other one, or in a double battle those not out on the field. */
function benchOf(state: BattleState) {
  const out = state.double?.ownSlots ?? [state.activeIndex]
  return state.player.filter((_, i) => !out.includes(i))
}

/** The foe out that the Pokémon in front hits hardest (its dice's best type against each), the weakest of those. */
function bestTarget(state: BattleState, data: GameData) {
  const a = activeBattler(state)
  const dice = a.dice.map((type) => ({ type, faceIndex: 0 }))
  const score = (f: (typeof state.player)[number]) => attackMultiplier(attackType(dice, a.types, f.types, data), f.types, data)
  const able = foesOnField(state).filter((f) => f.hp > 0)
  return able.sort((x, y) => score(y) - score(x) || x.hp - y.hp)[0] ?? null
}

/** One automatic step for whoever must act — the player side uses the same greedy AI as enemies. */
export function autoStep(state: BattleState, data: GameData, rng: Rng): { state: BattleState; log: LogEntry[] } {
  if (state.phase === 'enemy_turn') return reduce(state, { t: 'AI_TURN' }, data, rng)
  const events = autoEvents(state, data, rng)
  if (!events.length) return { state, log: [] }
  let s = state
  const log: LogEntry[] = []
  for (const e of events) {
    const r = reduce(s, e, data, rng)
    s = r.state
    log.push(...r.log)
  }
  return { state: s, log }
}

export function simulateBattle(
  player: SimSide,
  enemy: SimSide,
  playerLevels: UpgradeLevels,
  enemyLevels: UpgradeLevels,
  data: GameData,
  rng: Rng,
  maxSteps = 5000,
): SimResult {
  const maxHp = effectiveStats(getSpecies(data, player.dex), player.level, data).maxHp
  const created = createBattle(
    {
      kind: 'trainer',
      team: [{ uid: 'p1', dex: player.dex, level: player.level, hp: maxHp }],
      enemy,
      playerLevels,
      enemyLevels,
    },
    data,
  )
  let state = created.state
  const playerDamage: number[] = []
  const enemyDamage: number[] = []
  let playerTurns = 0
  const record = (log: LogEntry[]) => {
    for (const e of log) {
      if (e.kind === 'damage') (e.side === 'player' ? playerDamage : enemyDamage).push(e.amount)
      if (e.kind === 'turn' && e.side === 'player') playerTurns++
    }
  }
  record(created.log)
  for (let i = 0; i < maxSteps; i++) {
    if (state.phase === 'won' || state.phase === 'lost' || state.phase === 'fled') break
    const step = autoStep(state, data, rng)
    state = step.state
    record(step.log)
  }
  const winner = state.phase === 'won' ? 'player' : state.phase === 'lost' ? 'enemy' : 'draw'
  const finished = state.phase === 'won' || state.phase === 'lost' || state.phase === 'fled'
  return { winner, finished, playerTurns, turns: state.turn, playerDamage, enemyDamage }
}

export interface SimSummary {
  n: number
  winRate: number
  medianTurns: number
  meanTurns: number
  medianDamagePerTurn: number
  /** player turns → number of battles */
  histogram: Record<number, number>
}

export const median = (xs: readonly number[]) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

export function simulateMany(
  player: SimSide,
  enemy: SimSide,
  playerTrack: number | UpgradeLevels,
  enemyTrack: number | UpgradeLevels,
  n: number,
  data: GameData,
  seed = 1,
): SimSummary {
  const rng = createRng(seed)
  const pl = typeof playerTrack === 'number' ? uniformLevels(playerTrack) : playerTrack
  const el = typeof enemyTrack === 'number' ? uniformLevels(enemyTrack) : enemyTrack
  let wins = 0
  const turns: number[] = []
  const dmg: number[] = []
  const histogram: Record<number, number> = {}
  for (let i = 0; i < n; i++) {
    const r = simulateBattle(player, enemy, pl, el, data, rng)
    if (r.winner === 'player') wins++
    turns.push(r.playerTurns)
    histogram[r.playerTurns] = (histogram[r.playerTurns] ?? 0) + 1
    dmg.push(...r.playerDamage)
  }
  return {
    n,
    winRate: n ? wins / n : 0,
    medianTurns: median(turns),
    meanTurns: turns.reduce((s, t) => s + t, 0) / Math.max(1, n),
    medianDamagePerTurn: median(dmg),
    histogram,
  }
}

/**
 * Turns to remove `targetHp` from a passive target with the greedy reroll AI and every track at `track`.
 *
 * - `'battle'` (default) plays it out for real: whole turns, one reroll budget for the whole battle (§2.1).
 * - `'perRoll'` is the methodology behind the table printed in 01-GAME-SPEC §2.3: the mean damage of a single roll
 *   given the *full* reroll budget, then HP ÷ mean (so it can go below 1).
 */
export function turnsToKill(
  attacker: SimSide,
  defenderTypes: readonly PokeType[],
  targetHp: number,
  track: number,
  n: number,
  data: GameData,
  seed = 7,
  method: 'battle' | 'perRoll' = 'battle',
): number {
  const rng = createRng(seed)
  const levels = uniformLevels(track)
  const stats = effectiveStats(getSpecies(data, attacker.dex), attacker.level, data)
  if (method === 'perRoll') {
    let dmg = 0
    for (let i = 0; i < n; i++) {
      let dice = rollAll(stats.dice, data, rng)
      for (let r = stats.rerolls; r > 0; r--) {
        const mask = aiRerollMask({ dice, attackerTypes: stats.types, defenderTypes, levels, data, rng })
        if (!mask) break
        dice = rerollMasked(dice, mask, data, rng)
      }
      dmg += computeDamage(dice, stats.types, defenderTypes, levels, data).final
    }
    return targetHp / Math.max(1e-9, dmg / n)
  }
  let total = 0
  for (let i = 0; i < n; i++) {
    let hp = targetHp
    let t = 0
    let rerolls = stats.rerolls
    while (hp > 0 && t < 200) {
      t++
      let dice = rollAll(stats.dice, data, rng)
      while (rerolls > 0) {
        // This method plays out a real fight against a real HP pool, so it stops rerolling on a lethal roll exactly
        // as the game does. (`perRoll`, above, measures damage per roll with no target to kill, so it does not.)
        const mask = aiRerollMask({ dice, attackerTypes: stats.types, defenderTypes, levels, data, rng, targetHp: hp })
        if (!mask) break
        dice = rerollMasked(dice, mask, data, rng)
        rerolls--
      }
      hp -= computeDamage(dice, stats.types, defenderTypes, levels, data).final
    }
    total += t
  }
  return total / n
}
