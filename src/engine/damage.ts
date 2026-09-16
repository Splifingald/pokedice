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
 * The type most represented among the typed dice. Base dice never count.
 * Ties → attacker's Type 1, then Type 2, then the type of the highest-value die.
 */
export function majorityType(
  dice: readonly RolledDie[],
  attackerTypes: readonly PokeType[],
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
  const top = Math.max(...counts.values())
  const tied = [...counts.keys()].filter((t) => counts.get(t) === top)
  if (tied.length === 1) return tied[0]!
  const [t1, t2] = attackerTypes
  if (t1 && tied.includes(t1)) return t1
  if (t2 && tied.includes(t2)) return t2
  return tied.reduce((a, b) => ((best.get(b) ?? 0) > (best.get(a) ?? 0) ? b : a))
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
  majority: PokeType | null
  raw: number
  final: number
  /** Every die multiplier was 0 — "It doesn't affect…" */
  immune: boolean
  /** raw ÷ neutral raw: > 1 super effective, < 1 resisted, 0 immune. */
  effectiveness: number
}

/**
 * 01-GAME-SPEC §2.3 — per die: (face + upgrade) × type multiplier; plus the best combo × majority-type multiplier;
 * rounded, floored at 1 unless immune. No global multiplier and no level term: what the dice show is what hits.
 */
export function computeDamage(
  dice: readonly RolledDie[],
  attackerTypes: readonly PokeType[],
  defenderTypes: readonly PokeType[],
  levels: UpgradeLevels,
  data: GameData,
): DamageResult {
  const perDie: DieBreakdown[] = dice.map((d) => {
    const value = dieValue(d, data)
    const bonus = dieUpgradeBonus(d.type, levels, data)
    const multiplier = typeMultiplier(data.typeChart, d.type, defenderTypes)
    return { type: d.type, value, bonus, multiplier, damage: (value + bonus) * multiplier }
  })
  const values = perDie.map((p) => p.value)
  const majority = majorityType(dice, attackerTypes, data)
  const comboMult = majority ? typeMultiplier(data.typeChart, majority, defenderTypes) : 1
  const combo = selectCombo(detectCombos(values), levels.comboLevels, comboMult, data)

  const raw = perDie.reduce((s, p) => s + p.damage, 0) + (combo?.damage ?? 0)
  const neutral = perDie.reduce((s, p) => s + p.value + p.bonus, 0) + (combo?.bonus ?? 0)
  const immune = perDie.length > 0 && perDie.every((p) => p.multiplier === 0)
  const final = immune ? 0 : Math.max(1, Math.round(raw))
  return {
    perDie,
    combo,
    majority,
    raw,
    final,
    immune,
    effectiveness: immune ? 0 : neutral > 0 ? raw / neutral : 1,
  }
}
