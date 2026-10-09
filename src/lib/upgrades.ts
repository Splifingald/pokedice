// What the Upgrades screen can sell right now, shared with the tab bar's dot (only things you can act on get a dot).
import {
  COMBO_KEYS,
  COMBO_MIN_DICE,
  instanceStats,
  nextComboCost,
  nextDieCost,
  POKE_TYPES,
  type GameData,
  type PokeType,
  type SaveData,
} from '@/engine'

/** How many Pokémon you own carry each die type: a die nobody throws can't be upgraded yet. */
export function dieCarriers(save: SaveData, data: GameData): Record<PokeType, number> {
  const out = {} as Record<PokeType, number>
  for (const t of POKE_TYPES) out[t] = 0
  for (const inst of save.box)
    for (const t of new Set(instanceStats(inst, data).dice)) if (t !== 'base') out[t] += 1
  return out
}

/** The most dice any Pokémon you own throws: a combo needing more can't happen yet. */
export const maxDiceOwned = (save: SaveData, data: GameData) =>
  Math.max(0, ...save.box.map((p) => instanceStats(p, data).dice.length))

/** Upgrades open, not maxed and within your gold. */
export function affordableUpgrades(save: SaveData, data: GameData): number {
  const maxDice = maxDiceOwned(save, data)
  const carriers = dieCarriers(save, data)
  let n = 0
  for (const k of COMBO_KEYS) {
    const cost = nextComboCost(k, save.comboLevels[k] ?? 1, data)
    if (cost != null && cost <= save.gold && maxDice >= COMBO_MIN_DICE[k]) n++
  }
  for (const t of POKE_TYPES) {
    const cost = nextDieCost(t, save.dieLevels[t] ?? 1, data)
    if (cost != null && cost <= save.gold && carriers[t] > 0) n++
  }
  return n
}
