// What the Upgrades screen can sell right now, shared with the tab bar's dot (only things you can act on get a dot).
import {
  COMBO_KEYS,
  COMBO_MIN_DICE,
  generalOn,
  generalShown,
  inWorldRegion,
  nextGeneralCost,
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

/**
 * Upgrades open, not maxed and within your gold, the General tab's included (not inside a small world, whose ₽ buy its
 * own combos and dice only).
 */
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
  // The General tab's (docs/25), while the admin has it on.
  if (generalOn(data) && !inWorldRegion(save, data))
    for (const id of generalShown(data)) {
      const cost = nextGeneralCost(save, data, id)
      if (cost != null && cost <= save.gold) n++
    }
  return n
}

/**
 * The best buy on a list of upgrades (docs/15 §13): the cheapest one open and within your gold — the quickest step up —
 * the first listed on a tie (dice come by how many of your Pokémon throw them). Its button is gold, the others navy.
 * Null when nothing there is affordable.
 */
export function bestBuy(
  ups: readonly { id: string; cost: number | null; locked: string | null }[],
  gold: number,
): string | null {
  let best: { id: string; cost: number } | null = null
  for (const u of ups)
    if (!u.locked && u.cost != null && u.cost <= gold && (!best || u.cost < best.cost))
      best = { id: u.id, cost: u.cost }
  return best?.id ?? null
}
