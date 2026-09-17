import { COMBO_KEYS, type ComboKey, type GameData } from './types'

/** Length of the longest run of consecutive integers among the distinct values. */
export function longestRun(values: readonly number[]): number {
  const distinct = [...new Set(values)].sort((a, b) => a - b)
  let best = distinct.length ? 1 : 0
  let run = 1
  for (let i = 1; i < distinct.length; i++) {
    run = distinct[i] === distinct[i - 1]! + 1 ? run + 1 : 1
    if (run > best) best = run
  }
  return best
}

/** Every combo present in the roll (rank order, lowest first). Values include status fallbacks. */
export function detectCombos(values: readonly number[]): ComboKey[] {
  const counts = new Map<number, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  const sorted = [...counts.values()].sort((a, b) => b - a)
  const max = sorted[0] ?? 0
  const second = sorted[1] ?? 0
  const pairs = sorted.filter((n) => n >= 2).length
  const run = longestRun(values)

  const found: ComboKey[] = []
  if (max >= 2) found.push('pair')
  if (pairs >= 2) found.push('two_pair')
  if (max >= 3) found.push('three_kind')
  if (run >= 4) found.push('small_straight')
  if (max >= 3 && second >= 2) found.push('full_house')
  if (max >= 4) found.push('four_kind')
  if (run >= 5) found.push('full_straight')
  if (max >= 5) found.push('five_kind')
  return found
}

export const comboRank = (key: ComboKey) => COMBO_KEYS.indexOf(key)

export function comboBonus(key: ComboKey, level: number, data: GameData): number {
  const rows = data.comboUpgrades[key]
  if (!rows?.length) return 0
  const lv = Math.min(rows.length, Math.max(1, Math.floor(level)))
  return rows[lv - 1]?.bonus ?? 0
}

export interface ComboResult {
  key: ComboKey
  bonus: number
  multiplier: number
  damage: number
}

/**
 * One combo pays per roll. Default mode pays the single most *damaging* combo (its upgrade level and the
 * majority-type multiplier), not the highest rank. Ties go to the higher rank.
 */
export function selectCombo(
  found: readonly ComboKey[],
  levels: Partial<Record<ComboKey, number>>,
  multiplier: number,
  data: GameData,
): ComboResult | null {
  if (!found.length) return null
  const scored = found.map((key) => {
    const bonus = comboBonus(key, levels[key] ?? 1, data)
    return { key, bonus, multiplier, damage: bonus * multiplier }
  })
  if (data.config.comboPayoutMode === 'highestRank') {
    return scored.reduce((a, b) => (comboRank(b.key) > comboRank(a.key) ? b : a))
  }
  return scored.reduce((a, b) => {
    if (b.damage > a.damage) return b
    if (b.damage === a.damage && b.bonus > a.bonus) return b
    if (b.damage === a.damage && b.bonus === a.bonus && comboRank(b.key) > comboRank(a.key)) return b
    return a
  })
}

/** How many dice a roll needs to make each combo (an upgrade is pointless without a Pokémon that has them). */
export const COMBO_MIN_DICE: Record<ComboKey, number> = {
  pair: 2,
  two_pair: 4,
  three_kind: 3,
  small_straight: 4,
  full_house: 5,
  four_kind: 4,
  full_straight: 5,
  five_kind: 5,
}
