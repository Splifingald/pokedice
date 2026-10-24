// A raid's own rules on one hit (docs/39): the raid (engine/raidBattle.ts) sets them on each duel step, the battle
// (battle.ts `resolveAttack`) runs every hit through `adjustRaidHit`. Pure numbers on the damage the dice made.
import type { DamageResult } from './damage'
import type { PokeType, RaidTypeScale } from './types'

/** What a raid does to the hits of one duel step (all optional; absent = the hit as the dice made it). */
export interface RaidHit {
  /** × on the hit (a halved first hit, a charged strike, Crush Grip…). */
  mult?: number
  /** These types (or every type) are never resisted. */
  neverResisted?: PokeType[] | 'all'
  /** Lands as super effective on every type (Terapagos's Stellar Form). */
  stellar?: boolean
  /** Super-effective hits are × this (Prism Armor). */
  prism?: number
  /** The combo's bonus is cut by this share (Tablets of Ruin). */
  comboCut?: number
  /** Hits of this type do nothing (the target absorbs them: Flash Fire). Set `absorbed` when one did. */
  absorb?: PokeType
  absorbed?: boolean
  /** Hits of this type do nothing, either side's (Primordial Sea's Fire). */
  nullType?: PokeType
  /** Rock and Electric aren't super effective on the target any more (Delta Stream: its Flying has no weakness). */
  deltaStream?: boolean
  /** A shield in front of the target that only combos damage: its HP, left after the hit. `bounced` when one didn't. */
  shield?: number
  bounced?: boolean
  /** No status lands (Misty Terrain). */
  noStatus?: boolean
  /** Burns it inflicts last this many more turns. */
  burnLonger?: number
}

/** The hit through the raid's rules. `scale`: the attacker's raid matchups (what super effective lands at). */
export function adjustRaidHit(
  result: DamageResult,
  hit: RaidHit,
  scale: RaidTypeScale | undefined,
): DamageResult {
  const type = result.attackType
  // The matchup the dice were multiplied by (the same for every die).
  const m = result.perDie[0]?.multiplier ?? 1
  let raw = result.raw
  if ((hit.absorb && type === hit.absorb) || (hit.nullType && type === hit.nullType)) {
    if (hit.absorb && type === hit.absorb) hit.absorbed = true
    return { ...result, raw: 0, final: 0, immune: true, effectiveness: 0 }
  }
  if (m > 0) {
    const resisted = m < 1
    const never = hit.neverResisted === 'all' || (!!type && !!hit.neverResisted?.includes(type))
    if (resisted && never) raw /= m
    const sup = scale?.super ?? 2
    if (hit.stellar && m < sup) raw = (raw / m) * sup
    if (hit.deltaStream && m > 1 && (type === 'rock' || type === 'electric')) raw /= m
    if (hit.prism && m > 1) raw *= hit.prism
  }
  if (hit.comboCut && result.combo) raw -= result.combo.damage * hit.comboCut
  if (hit.mult != null) raw *= hit.mult
  let final = raw <= 0 ? 0 : Math.max(1, Math.round(raw))
  if (hit.shield && hit.shield > 0 && final > 0) {
    if (!result.combo) {
      hit.bounced = true
      final = 0
    } else {
      const take = Math.min(hit.shield, final)
      hit.shield -= take
      final -= take
    }
  }
  return { ...result, raw, final }
}
