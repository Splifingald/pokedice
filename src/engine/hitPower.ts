// How hard a hit lands, for the game-feel pass (docs/38 F3a): derived from what the engine already decided — how
// effective the attack was, its combo, its damage against the target's max HP, and whether it knocked the target out.
// Presentation only: the stage scales its shake, particles and hit-stop with it; no rule or number depends on it.
import { comboTier, type ComboKey } from './types'

export interface HitPower {
  /** 0 a resisted hit, 1 a plain one, 2 a strong one, 3 a huge one. */
  tier: 0 | 1 | 2 | 3
  /** How much harder than a plain hit it lands (shake, particles, hit-stop): `HIT_POWER_K[tier]`. */
  k: number
  /** Super effective, as the battle log says it (×1.5 or more). */
  super: boolean
  /** Not very effective (×0.67 or less). */
  resisted: boolean
  /** The hit knocks the target out: the final blow. */
  ko: boolean
}

/** Each tier's scale on a plain hit's shake, particles and hit-stop. */
export const HIT_POWER_K = [0.6, 1, 1.3, 1.6] as const

/** The battle log's thresholds (useBattleAnimator's banner): the same hit reads the same everywhere. */
const SUPER = 1.5
const RESISTED = 0.67

export function hitPower(h: {
  effectiveness: number
  combo?: ComboKey | null
  damage: number
  maxHp: number
  ko?: boolean
}): HitPower {
  const sup = h.effectiveness >= SUPER
  const resisted = h.effectiveness > 0 && h.effectiveness <= RESISTED
  const ko = !!h.ko
  const share = h.maxHp > 0 ? h.damage / h.maxHp : 0
  const combo = comboTier(h.combo)
  // A point each for super effective, a big combo (full house and up) and a hit that takes half the HP; half a point
  // for a middling combo or a quarter of the HP. A resisted hit stays light whatever its numbers, unless it's the KO.
  const points =
    (sup ? 1 : 0) + (combo >= 3 ? 1 : combo === 2 ? 0.5 : 0) + (share >= 0.5 ? 1 : share >= 0.25 ? 0.5 : 0)
  let tier: HitPower['tier'] = resisted ? 0 : points >= 2 ? 3 : points >= 1 ? 2 : 1
  // The final blow always lands hard.
  if (ko && tier < 2) tier = 2
  return { tier, k: HIT_POWER_K[tier], super: sup, resisted, ko }
}
