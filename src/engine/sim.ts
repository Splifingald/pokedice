// Headless battles: both sides driven by the §8 AI. Powers the admin simulator and the balance scripts.
import { aiRerollMask } from './ai'
import { activeBattler, canHurt, createBattle, reduce, type BattleState, type LogEntry } from './battle'
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

/** One automatic step for whoever must act — the player side uses the same greedy AI as enemies. */
export function autoStep(state: BattleState, data: GameData, rng: Rng): { state: BattleState; log: LogEntry[] } {
  switch (state.phase) {
    case 'enemy_turn':
      return reduce(state, { t: 'AI_TURN' }, data, rng)
    case 'player_roll': {
      // Like a player would: a Pokémon that can't touch the foe (Normal vs Ghost) makes way for one that can.
      const a = activeBattler(state)
      const better = !canHurt(a, state.enemy, data) && state.player.find((b) => b.hp > 0 && canHurt(b, state.enemy, data))
      if (better && data.config.allowVoluntarySwitch) return reduce(state, { t: 'SWITCH', instanceId: better.uid }, data, rng)
      return reduce(state, { t: 'ROLL' }, data, rng)
    }
    case 'player_stunned':
      return reduce(state, { t: 'PASS' }, data, rng)
    case 'player_switch': {
      const alive = state.player.filter((b, i) => b.hp > 0 && i !== state.activeIndex)
      const next = alive.find((b) => canHurt(b, state.enemy, data)) ?? alive[0]
      return next ? reduce(state, { t: 'SWITCH', instanceId: next.uid }, data, rng) : { state, log: [] }
    }
    case 'player_reroll': {
      const a = activeBattler(state)
      const mask =
        a.rerollsLeft > 0 && !a.status.confused
          ? aiRerollMask({
              dice: state.dice,
              attackerTypes: a.types,
              defenderTypes: state.enemy.types,
              levels: state.playerLevels,
              data,
              rng,
            })
          : null
      if (mask && mask.some(Boolean)) {
        let s = state
        mask.forEach((m, i) => {
          if (m !== !!s.selected[i]) s = reduce(s, { t: 'TOGGLE_DIE', i }, data, rng).state
        })
        return reduce(s, { t: 'REROLL' }, data, rng)
      }
      return reduce(state, { t: 'ATTACK' }, data, rng)
    }
    default:
      return { state, log: [] }
  }
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
      if (e.kind === 'damage' && !e.selfHit) (e.side === 'player' ? playerDamage : enemyDamage).push(e.amount)
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
        const mask = aiRerollMask({ dice, attackerTypes: stats.types, defenderTypes, levels, data, rng })
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
