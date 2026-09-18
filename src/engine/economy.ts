import { comboBonus } from './combos'
import type { Area, ComboKey, GameData, ItemDef, PokeType } from './types'

/** Cost to go from `currentLevel` to the next one, or null at max. */
export function nextComboCost(key: ComboKey, currentLevel: number, data: GameData): number | null {
  const row = data.comboUpgrades[key]?.find((r) => r.level === currentLevel + 1)
  return row ? row.cost : null
}

export function nextDieCost(type: PokeType, currentLevel: number, data: GameData): number | null {
  const row = data.dieUpgrades[type]?.find((r) => r.level === currentLevel + 1)
  return row ? row.cost : null
}

export function dieBonusAt(type: PokeType, level: number, data: GameData): number {
  return data.dieUpgrades[type]?.find((r) => r.level === level)?.bonus ?? 0
}

export { comboBonus as comboBonusAt }

export function maxComboLevel(key: ComboKey, data: GameData): number {
  return data.comboUpgrades[key]?.length ?? 1
}

export function maxDieLevel(type: PokeType, data: GameData): number {
  return data.dieUpgrades[type]?.length ?? 1
}

/** Replaying a cleared area applies its backtrack multiplier to gold and XP. */
export function rewardMultiplier(area: Area, cleared: boolean): number {
  return cleared ? area.backtrackMultiplier : 1
}

/** Only trainers pay: gold = Σ levels of the trainer's Pokémon defeated (× goldMultiplier × backtrack; × gym bonus). */
export function trainerGoldFor(enemyLevel: number, area: Area, cleared: boolean, data: GameData, gym = false): number {
  const bonus = gym ? data.config.gymGoldMultiplier : 1
  return Math.round(enemyLevel * data.config.goldMultiplier * bonus * rewardMultiplier(area, cleared))
}

/** XP from a K.O. — to the Pokémon and to the area's exploration alike: the foe's level × `xpMultiplier` (× backtrack). */
export function pokemonXp(enemyLevel: number, area: Area, cleared: boolean, data: GameData): number {
  return Math.max(1, Math.round(enemyLevel * data.config.xpMultiplier * rewardMultiplier(area, cleared)))
}

/**
 * Multi EXP: a bench Pokémon's share of the fighter's XP. multiExpShare, plus multiExpGapBonus per level it is below
 * the fighter, capped at multiExpMaxShare (never above 1: no more than the fighter got).
 */
export function multiExpShareFor(fighterLevel: number, benchLevel: number, data: GameData): number {
  const cfg = data.config
  const gap = Math.max(0, fighterLevel - benchLevel)
  const cap = Math.max(0, Math.min(1, cfg.multiExpMaxShare))
  return Math.max(0, Math.min(cap, cfg.multiExpShare + gap * Math.max(0, cfg.multiExpGapBonus)))
}

/** Multi EXP in words, for Settings and Help: "30 % of the XP, +5 % per level behind the fighter (up to 100 %)". */
export function multiExpText(data: GameData): string {
  const c = data.config
  const pct = (x: number) => `${Math.round(x * 100)} %`
  const cap = Math.max(0, Math.min(1, c.multiExpMaxShare))
  if (c.multiExpGapBonus <= 0 || cap <= c.multiExpShare) return `${pct(c.multiExpShare)} of the XP`
  return `${pct(c.multiExpShare)} of the XP, +${pct(c.multiExpGapBonus)} for each level they're behind the fighter (up to ${pct(cap)})`
}

export function healAmount(item: ItemDef, hp: number, maxHp: number): number {
  if (item.effect.kind !== 'heal' || hp <= 0 || hp >= maxHp) return 0
  return Math.min(item.effect.amount, maxHp - hp)
}
