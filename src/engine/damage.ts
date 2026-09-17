import { detectCombos, selectCombo, type ComboResult } from './combos'
import { dieValue, type RolledDie } from './dice'
import { typeMultiplier } from './typechart'
import { COMBO_KEYS, POKE_TYPES, type ComboKey, type DieType, type GameData, type PokeType } from './types'

export interface UpgradeLevels {
  comboLevels: Partial<Record<ComboKey, number>>
  dieLevels: Partial<Record<PokeType, number>>
}

/** Every combo and die track at the same level — used for wild/trainer Pokémon and the simulator. */
export function uniformLevels(level: number): UpgradeLevels {
  return {
    comboLevels: Object.fromEntries(COMBO_KEYS.map((k) => [k, level])),
    dieLevels: Object.fromEntries(POKE_TYPES.map((t) => [t, level])),
  }
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

/** The multiplier the whole attack gets: its attack type vs the defender (×1 when untyped). */
export function attackMultiplier(type: PokeType | null, defenderTypes: readonly PokeType[], data: GameData): number {
  return type ? typeMultiplier(data.typeChart, type, defenderTypes) : 1
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
  /** raw ÷ neutral raw: > 1 super effective, < 1 resisted, 0 immune. */
  effectiveness: number
}

/**
 * 01-GAME-SPEC §2.3 — (Σ (face + upgrade) + best combo) × the attack type's multiplier (the dice type that hits the
 * defender hardest); rounded, floored at 1 unless immune. No global multiplier and no level term: what the dice show is what hits.
 */
export function computeDamage(
  dice: readonly RolledDie[],
  attackerTypes: readonly PokeType[],
  defenderTypes: readonly PokeType[],
  levels: UpgradeLevels,
  data: GameData,
): DamageResult {
  const type = attackType(dice, attackerTypes, defenderTypes, data)
  const multiplier = attackMultiplier(type, defenderTypes, data)
  const perDie: DieBreakdown[] = dice.map((d) => {
    const value = dieValue(d, data)
    const bonus = dieUpgradeBonus(d.type, levels, data)
    return { type: d.type, value, bonus, multiplier, damage: (value + bonus) * multiplier }
  })
  const values = perDie.map((p) => p.value)
  const combo = selectCombo(detectCombos(values), levels.comboLevels, multiplier, data)

  const raw = perDie.reduce((s, p) => s + p.damage, 0) + (combo?.damage ?? 0)
  const neutral = perDie.reduce((s, p) => s + p.value + p.bonus, 0) + (combo?.bonus ?? 0)
  const immune = perDie.length > 0 && multiplier === 0
  const final = immune ? 0 : Math.max(1, Math.round(raw))
  return {
    perDie,
    combo,
    attackType: type,
    raw,
    final,
    immune,
    effectiveness: immune ? 0 : neutral > 0 ? raw / neutral : 1,
  }
}
