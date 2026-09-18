import { BUNDLE } from '@/config/bundle'
import {
  compileGameData,
  DEFAULT_CONFIG,
  type DieType,
  type GameConfig,
  type GameData,
  type RolledDie,
  type StatusKind,
} from '@/engine'

/**
 * Rules tests pin the pacing knobs to neutral (×1), and regen, status effects and the shiny rate to the defaults, so
 * their arithmetic documents the formulas, not the tuning done in admin.
 */
export function makeData(config: Partial<GameConfig> = {}): GameData {
  return compileGameData({
    ...BUNDLE,
    config: {
      ...BUNDLE.config,
      goldMultiplier: 1,
      hpMultiplier: 1,
      xpMultiplier: 1,
      regenPercentPerHour: DEFAULT_CONFIG.regenPercentPerHour,
      shinyChance: DEFAULT_CONFIG.shinyChance,
      status: DEFAULT_CONFIG.status,
      ...config,
    },
  })
}

export const data = makeData()

/** A die of `type` showing the first numeric face equal to `value`. */
export function die(type: DieType, value: number, d: GameData = data): RolledDie {
  const faceIndex = d.diceTypes[type].faces.findIndex((f) => f.kind === 'number' && f.value === value)
  if (faceIndex < 0) throw new Error(`${type} has no ${value} face`)
  return { type, faceIndex }
}

/** A die of `type` showing its `status` face. */
export function sdie(type: DieType, status: StatusKind, d: GameData = data): RolledDie {
  const faceIndex = d.diceTypes[type].faces.findIndex((f) => f.kind === 'status' && f.status === status)
  if (faceIndex < 0) throw new Error(`${type} has no ${status} face`)
  return { type, faceIndex }
}

let counter = 0
export const newId = () => `id-${++counter}`
