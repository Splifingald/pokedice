import { DEFAULT_CONFIG } from './defaults'
import {
  COMBO_KEYS,
  POKE_TYPES,
  type Area,
  type BossDef,
  type BundleRaw,
  type ComboKey,
  type ComboUpgradeRow,
  type DiceTypeDef,
  type DieType,
  type DieUpgradeRow,
  type GameConfig,
  type GameData,
  type ItemDef,
  type PokeType,
  type Species,
  type Trainer,
} from './types'

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

function deepMerge<T>(base: T, over: unknown): T {
  if (over === undefined || over === null) return base
  if (!isObj(base) || !isObj(over)) return over as T
  const out: Record<string, unknown> = { ...base }
  for (const [k, v] of Object.entries(over)) out[k] = deepMerge((base as Record<string, unknown>)[k], v)
  return out as T
}

/** game_config rows over the defaults — missing keys never break the game. */
export function mergeConfig(raw: Record<string, unknown> | undefined): GameConfig {
  return deepMerge(DEFAULT_CONFIG, raw ?? {})
}

export const chartKey = (attacking: string, defending: string) => `${attacking}>${defending}`

function normaliseBoss(b: unknown): BossDef[] | null {
  if (!b) return null
  if (Array.isArray(b)) return b.length ? (b as BossDef[]) : null
  if (isObj(b)) return [b as unknown as BossDef]
  return null
}

const clampCatch = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(1, Math.min(9, Math.round(v))) : 5)

export function compileGameData(raw: BundleRaw): GameData {
  // Older bundles / DB rows may lack the v1.5 fields (catch value, shop tiers, loot tables): default them.
  const species: Record<number, Species> = {}
  for (const p of raw.pokemon) species[p.dex] = { ...p, catchValue: clampCatch(p.catchValue) }

  const diceTypes = {} as Record<DieType, DiceTypeDef>
  for (const d of raw.diceTypes) diceTypes[d.type] = d

  const typeChart: Record<string, number> = {}
  for (const r of raw.typeChart) typeChart[chartKey(r.attacking, r.defending)] = Number(r.multiplier)

  const comboUpgrades = {} as Record<ComboKey, ComboUpgradeRow[]>
  for (const k of COMBO_KEYS)
    comboUpgrades[k] = raw.upgrades.combos.filter((r) => r.comboKey === k).sort((a, b) => a.level - b.level)

  const dieUpgrades = {} as Record<PokeType, DieUpgradeRow[]>
  for (const t of POKE_TYPES)
    dieUpgrades[t] = raw.upgrades.dice.filter((r) => r.dieType === t).sort((a, b) => a.level - b.level)

  const items: Record<string, ItemDef> = {}
  for (const i of raw.items) items[i.key] = { ...i, inShop: i.inShop ?? true, shopBadges: i.shopBadges ?? 0 }

  const trainers: Record<string, Trainer> = {}
  for (const t of raw.trainers) trainers[t.id] = { ...t, role: t.role ?? 'trainer', badge: t.badge ?? null }

  // Older bundles / DB rows may lack the v1.3 columns: default them.
  const areas: Area[] = [...raw.areas]
    .map((a) => ({
      ...a,
      legendaryBoss: normaliseBoss(a.legendaryBoss),
      hidden: !!a.hidden,
      easyMode: !!a.easyMode,
      unlockConditions: Array.isArray(a.unlockConditions) && a.unlockConditions.length ? a.unlockConditions : null,
      gyms: Array.isArray(a.gyms) ? a.gyms : [],
      lootPool: Array.isArray(a.lootPool) ? a.lootPool : [],
    }))
    .sort((a, b) => a.orderIndex - b.orderIndex)

  return {
    species,
    speciesList: Object.values(species).sort((a, b) => a.dex - b.dex),
    diceTypes,
    typeChart,
    comboUpgrades,
    dieUpgrades,
    items,
    areas,
    trainers,
    config: mergeConfig(raw.config),
  }
}

/** The main chain, in order (hidden areas excluded). */
export function linearAreas(data: GameData): Area[] {
  return data.areas.filter((a) => !a.hidden)
}

export function getSpecies(data: GameData, dex: number): Species {
  const s = data.species[dex]
  if (!s) throw new Error(`Unknown species #${dex}`)
  return s
}
