// Trainer potions: which Pokémon holds which potion, and when the AI drinks it.
import { expectedDamage } from './ai'
import type { UpgradeLevels } from './damage'
import type { RolledDie } from './dice'
import type { Rng } from './rng'
import type { DieType, GameData, PokeType, TrainerMon } from './types'

/** Trainers only ever use potions: items that restore HP. */
export const potionHeal = (key: string, data: GameData): number => {
  const fx = data.items[key]?.effect
  return fx?.kind === 'heal' ? fx.amount : 0
}

/**
 * Deal the trainer's potions to its team: one per Pokémon at most, highest level first (ties: the later one, the ace),
 * the best potion to the strongest. Non-potions and potions beyond the team size are dropped.
 */
export function dealTrainerItems(team: readonly TrainerMon[], items: readonly string[] | null | undefined, data: GameData): TrainerMon[] {
  const out = team.map((m) => {
    const { item: _held, ...rest } = m
    return rest as TrainerMon
  })
  const potions = (items ?? []).filter((k) => potionHeal(k, data) > 0).sort((a, b) => potionHeal(b, data) - potionHeal(a, data))
  if (!potions.length) return out
  const order = out.map((m, i) => ({ i, level: m.level })).sort((a, b) => b.level - a.level || b.i - a.i)
  order.slice(0, potions.length).forEach(({ i }, n) => (out[i] = { ...out[i]!, item: potions[n] }))
  return out
}

export interface PotionCheck {
  hp: number
  maxHp: number
  /** The foe's dice (a fresh throw, rerolls not counted). */
  attackerDice: readonly DieType[]
  attackerTypes: readonly PokeType[]
  defenderTypes: readonly PokeType[]
  attackerLevels: UpgradeLevels
}

/**
 * Drink the potion now? Only when it's hurt and the opponent's next hit could K.O. it (an average fresh throw), or
 * when it's down to a quarter of its HP — never earlier, since the potion is its only one. `rng` samples the throw.
 */
export function shouldUsePotion(c: PotionCheck, data: GameData, rng: Rng): boolean {
  if (c.hp <= 0 || c.hp >= c.maxHp) return false
  if (c.hp <= c.maxHp / 4) return true
  const dice: RolledDie[] = c.attackerDice.map((type) => ({ type, faceIndex: 0 }))
  const threat = expectedDamage(
    { dice, attackerTypes: c.attackerTypes, defenderTypes: c.defenderTypes, levels: c.attackerLevels, data, rng },
    dice.map(() => false),
    data.config.ai.samples,
  )
  return c.hp <= threat
}
