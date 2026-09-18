// Game Corner slot machine (Rocket Hideout). The result is drawn from the configured weights first, then the three reels
// are laid out to show it — so the odds are exactly what the admin set, whatever the reels look like.
import { applyCatch, catchTarget } from './catching'
import type { Rng } from './rng'
import type { RunEvent } from './run'
import type { GameData, SaveData, SlotMachineConfig } from './types'

export type SlotSymbol = 'ball' | 'prize'
export type SlotOutcomeKey = 'oneBall' | 'twoBalls' | 'threeBalls' | 'jackpot'
export const SLOT_OUTCOMES: SlotOutcomeKey[] = ['oneBall', 'twoBalls', 'threeBalls', 'jackpot']

const BALLS: Record<SlotOutcomeKey, number> = { oneBall: 1, twoBalls: 2, threeBalls: 3, jackpot: 0 }

/** Each outcome's share of spins (0–1), from the weights. */
export function slotOdds(cfg: SlotMachineConfig): Record<SlotOutcomeKey, number> {
  const w = (k: SlotOutcomeKey) => Math.max(0, Number(cfg[k]?.weight) || 0)
  const total = SLOT_OUTCOMES.reduce((sum, k) => sum + w(k), 0)
  return Object.fromEntries(SLOT_OUTCOMES.map((k) => [k, total ? w(k) / total : 0])) as Record<
    SlotOutcomeKey,
    number
  >
}

/** Average Pokédollars paid back per spin, the jackpot counted at its gold (what it pays once the prize is owned). */
export function slotReturnPerSpin(cfg: SlotMachineConfig): number {
  const odds = slotOdds(cfg)
  return SLOT_OUTCOMES.reduce((sum, k) => sum + odds[k] * Math.max(0, Number(cfg[k]?.gold) || 0), 0)
}

export interface SpinResult {
  save: SaveData
  reels: [SlotSymbol, SlotSymbol, SlotSymbol]
  outcome: SlotOutcomeKey
  /** Pokédollars paid out (the spin's cost is already taken off `save.gold`). */
  gold: number
  /** Jackpot: the prize Pokémon joined (new) or replaced a weaker copy; null when it paid gold instead. */
  prize: { uid: string; dex: number; level: number; joinedTeam: boolean; replacedLevel?: number } | null
  events: RunEvent[]
}

/** One spin: null when the player can't pay for it. */
export function spinSlots(
  save: SaveData,
  data: GameData,
  rng: Rng,
  now: number,
  newId: () => string,
): SpinResult | null {
  const cfg = data.config.slotMachine
  const cost = Math.max(0, Math.round(cfg.cost))
  if (save.gold < cost) return null
  const odds = slotOdds(cfg)
  const outcome = rng.weighted(SLOT_OUTCOMES, (k) => odds[k]) ?? 'oneBall'
  const balls = BALLS[outcome]
  // Lay the balls on random reels; the rest show the prize Pokémon.
  const reels: SlotSymbol[] = ['prize', 'prize', 'prize']
  const order = [0, 1, 2]
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.int(0, i)
    ;[order[i], order[j]] = [order[j]!, order[i]!]
  }
  for (let i = 0; i < balls; i++) reels[order[i]!] = 'ball'

  let next: SaveData = { ...save, gold: save.gold - cost }
  let gold = outcome === 'jackpot' ? 0 : Math.max(0, Math.round(cfg[outcome].gold))
  let prize: SpinResult['prize'] = null
  const events: RunEvent[] = []
  if (outcome === 'jackpot') {
    const target = data.species[cfg.prizeDex]
      ? catchTarget(next, cfg.prizeDex, cfg.prizeLevel, 'wild', data)
      : null
    if (target) {
      const res = applyCatch(next, { dex: cfg.prizeDex, level: cfg.prizeLevel }, target, data, now, newId)
      next = res.save
      events.push(...res.events)
      const caught = res.events.find((e) => e.kind === 'caught')
      if (caught?.kind === 'caught')
        prize = {
          uid: caught.uid,
          dex: caught.dex,
          level: caught.level,
          joinedTeam: caught.joinedTeam,
          ...(caught.replacedLevel != null && { replacedLevel: caught.replacedLevel }),
        }
    } else gold = Math.max(0, Math.round(cfg.jackpot.gold))
  }
  next = { ...next, gold: next.gold + gold }
  return { save: next, reels: reels as SpinResult['reels'], outcome, gold, prize, events }
}
