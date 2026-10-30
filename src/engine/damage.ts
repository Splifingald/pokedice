import { detectCombos, selectCombo, type ComboResult } from './combos'
import { dieValue, type RolledDie } from './dice'
import { typeMultiplier } from './typechart'
import {
  COMBO_KEYS,
  POKE_TYPES,
  type ComboKey,
  type DieType,
  type GameData,
  type PokeType,
  type RaidTypeScale,
} from './types'
import type { TalentKey } from './talents'

export interface UpgradeLevels {
  comboLevels: Partial<Record<ComboKey, number>>
  dieLevels: Partial<Record<PokeType, number>>
  /** A small world's boosters: × the damage of every hit of these types (shown in the damage recap). */
  typeBoost?: Partial<Record<PokeType, number>>
  /** A raid's type matchups for this side's attacks, instead of ×2, ×½ and ×0 (`scaleMatchup`). */
  typeScale?: RaidTypeScale
  /**
   * A portal run's boosts (docs/28): + this much on every attack of the type, added like the combo bonus (before the
   * type's multiplier and a booster). Shown in the damage recap.
   */
  typeFlat?: Partial<Record<PokeType, number>>
}

/** + damage an attack of this type gets from a portal run's boosts (0 without one, or untyped). */
export const typeFlatOf = (levels: UpgradeLevels, type: PokeType | null): number => {
  const n = type ? Number(levels.typeFlat?.[type]) : NaN
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** The type chart's multiplier read through a raid's matchups: neutral stays ×1, an untyped hit too. */
export function scaleMatchup(m: number, scale: RaidTypeScale | undefined): number {
  if (!scale) return m
  return m === 0 ? scale.immune : m > 1 ? scale.super : m < 1 ? scale.resisted : m
}

/** Every combo and die track at the same level — used for wild/trainer Pokémon and the simulator. */
export function uniformLevels(level: number): UpgradeLevels {
  return {
    comboLevels: Object.fromEntries(COMBO_KEYS.map((k) => [k, level])),
    dieLevels: Object.fromEntries(POKE_TYPES.map((t) => [t, level])),
  }
}

/** × an attack of this type gets from a small world's boosters (1 without one). */
export const typeBoostOf = (levels: UpgradeLevels, type: PokeType | null): number => {
  const m = type ? Number(levels.typeBoost?.[type]) : NaN
  return Number.isFinite(m) && m > 0 ? m : 1
}

/** Account-wide die track bonus. Base dice (and anything not upgradeable) always give +0. */
export function dieUpgradeBonus(type: DieType, levels: UpgradeLevels, data: GameData): number {
  if (type === 'base' || !data.diceTypes[type]?.upgradeable) return 0
  const rows = data.dieUpgrades[type]
  if (!rows?.length) return 0
  const lv = Math.min(rows.length, Math.max(1, Math.floor(levels.dieLevels[type] ?? 1)))
  return rows[lv - 1]?.bonus ?? 0
}

/**
 * The attack's type (v1.8): among the typed dice, the type that hits this defender hardest. Base dice never count.
 * Ties (same multiplier) → the type with the most dice, then the attacker's Type 1, Type 2, then the highest die.
 * Null when only base dice were rolled (untyped, ×1).
 */
export function attackType(
  dice: readonly RolledDie[],
  attackerTypes: readonly PokeType[],
  defenderTypes: readonly PokeType[],
  data: GameData,
): PokeType | null {
  const counts = new Map<PokeType, number>()
  const best = new Map<PokeType, number>()
  for (const d of dice) {
    if (d.type === 'base' || !data.diceTypes[d.type]?.countsForMajority) continue
    const t = d.type
    counts.set(t, (counts.get(t) ?? 0) + 1)
    best.set(t, Math.max(best.get(t) ?? -Infinity, dieValue(d, data)))
  }
  if (!counts.size) return null
  const [t1, t2] = attackerTypes
  const score = (t: PokeType) => [typeMultiplier(data.typeChart, t, defenderTypes), counts.get(t)!, t === t1 ? 2 : t === t2 ? 1 : 0, best.get(t)!]
  const better = (a: number[], b: number[]) => {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! > b[i]!
    return false
  }
  return [...counts.keys()].reduce((a, b) => (better(score(b), score(a)) ? b : a))
}

/** The multiplier the whole attack gets: its attack type vs the defender (×1 when untyped), through a raid's matchups. */
export function attackMultiplier(
  type: PokeType | null,
  defenderTypes: readonly PokeType[],
  data: GameData,
  scale?: RaidTypeScale,
): number {
  return type ? scaleMatchup(typeMultiplier(data.typeChart, type, defenderTypes), scale) : 1
}

/**
 * What a hidden talent (docs/51) does to one attack, worked out by the battle (`attackModsFor`): every field absent
 * leaves the attack as the dice made it.
 */
export interface AttackMods {
  /** The attacker's own talent when it acts on this hit (Opener, Finisher, Technician, Guts, Mind's Eye, Raider…). */
  talent?: TalentKey
  /** A partner's Power Spot boosting this hit: the partner's uid. */
  powerSpot?: string
  /** × the hit when this combo pays (Technician: a Pair; Triple Pro, Fours Pro). */
  comboTimes?: { key: ComboKey; times: number }
  /** An attack the foe is immune to hits × this instead (Mind's Eye). */
  immuneAs?: number
  /** × the whole hit (Opener, Finisher, Guts, Raider, Power Spot): a share, never a flat amount. */
  times?: number
  /** Upgrade levels its combo pays above its own (Skill Link), past the table's last level too. */
  comboUp?: number
  /** The target's side softening the hit (Intimidate, Disguise, a partner's Friend Guard): × the hit… */
  guardTimes?: number
  /** …and whose talents did it. */
  guards?: { key: TalentKey; uid: string }[]
}

export interface DieBreakdown {
  type: DieType
  value: number
  bonus: number
  multiplier: number
  damage: number
}

export interface DamageResult {
  perDie: DieBreakdown[]
  combo: ComboResult | null
  /** The type the whole attack takes (v1.8); null = untyped. */
  attackType: PokeType | null
  raw: number
  final: number
  /** The attack type's multiplier was 0 — "It doesn't affect…" */
  immune: boolean
  /** raw ÷ neutral raw: > 1 super effective, < 1 resisted, 0 immune. A small world's booster isn't part of it. */
  effectiveness: number
  /** A small world's booster on this attack's type: × `multiplier` after the type's, on top of everything. */
  boost?: { type: PokeType; multiplier: number } | null
  /** A portal run's boost on this attack's type (docs/28): + `amount`, like the combo's bonus, before the multipliers. */
  flat?: { type: PokeType; amount: number } | null
  /** A Z-Move of a type with no effect of its own (docs/35): `final` is this % more than the dice made. */
  zPercent?: number
  /**
   * The hidden talents that changed this hit (docs/51): its own and a partner's Power Spot (`amount` the damage they
   * added), the target's side that softened it (`guards`, `saved` the damage they took off).
   */
  talent?: {
    key?: TalentKey
    powerSpot?: string
    amount: number
    guards?: { key: TalentKey; uid: string }[]
    saved?: number
  } | null
}

/**
 * 01-GAME-SPEC §2.3 — (Σ (face + upgrade) + best combo) × the attack type's multiplier (the dice type that hits the
 * defender hardest); rounded, floored at 1 unless immune. No global multiplier and no level term: what the dice show is what hits.
 * In a small world, a booster of the attack's type multiplies that too (`boost`, shown in the recap: never hidden).
 * `chosen`: the type the attack takes instead of the dice's pick (a dual-type's Z-Move, docs/35).
 */
export function computeDamage(
  dice: readonly RolledDie[],
  attackerTypes: readonly PokeType[],
  defenderTypes: readonly PokeType[],
  levels: UpgradeLevels,
  data: GameData,
  chosen?: PokeType,
  mods?: AttackMods,
): DamageResult {
  const plain = mods ? computeDamage(dice, attackerTypes, defenderTypes, levels, data, chosen) : null
  const type = chosen ?? attackType(dice, attackerTypes, defenderTypes, data)
  const typeMult = attackMultiplier(type, defenderTypes, data, levels.typeScale)
  const multiplier = typeMult === 0 && mods?.immuneAs && dice.length ? mods.immuneAs : typeMult
  const perDie: DieBreakdown[] = dice.map((d) => {
    const value = dieValue(d, data)
    const bonus = dieUpgradeBonus(d.type, levels, data)
    return { type: d.type, value, bonus, multiplier, damage: (value + bonus) * multiplier }
  })
  const values = perDie.map((p) => p.value)
  const combo = selectCombo(detectCombos(values), levels.comboLevels, multiplier, data, mods?.comboUp ?? 0)
  const times = (mods?.times ?? 1) * (combo && combo.key === mods?.comboTimes?.key ? mods.comboTimes.times : 1)

  // A portal run's boost is a flat bonus of its type, added to the dice and the combo and multiplied with them.
  const flat = typeFlatOf(levels, type)
  const typed = perDie.reduce((s, p) => s + p.damage, 0) + (combo?.damage ?? 0) + flat * multiplier
  const neutral = perDie.reduce((s, p) => s + p.value + p.bonus, 0) + (combo?.bonus ?? 0) + flat
  const immune = perDie.length > 0 && multiplier === 0
  // The booster comes after the type's multiplier, and stays out of the effectiveness ("super effective" is the type's).
  const boost = typeBoostOf(levels, type)
  const raw = typed * boost * times * (mods?.guardTimes ?? 1)
  const final = immune ? 0 : Math.max(1, Math.round(raw))
  // The hit before the target's side softened it: what the attacker's talents made of it.
  const up = immune ? 0 : Math.max(1, Math.round(typed * boost * times))
  const boosted = !!plain && up !== plain.final && (!!mods?.talent || !!mods?.powerSpot)
  const guarded = !!mods?.guards?.length && final < up
  return {
    perDie,
    combo,
    attackType: type,
    raw,
    final,
    immune,
    effectiveness: immune ? 0 : neutral > 0 ? typed / neutral : 1,
    ...(boost !== 1 && type && { boost: { type, multiplier: boost } }),
    ...(flat > 0 && type && { flat: { type, amount: flat } }),
    ...(plain &&
      mods &&
      (boosted || guarded) && {
        talent: {
          ...(boosted && mods.talent && { key: mods.talent }),
          ...(boosted && mods.powerSpot && { powerSpot: mods.powerSpot }),
          amount: boosted ? up - plain.final : 0,
          ...(guarded && { guards: mods.guards, saved: up - final }),
        },
      }),
  }
}
