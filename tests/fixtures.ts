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

/** Every event switched on for everyone: rules tests check what they do; the switch has tests of its own. */
const d = DEFAULT_CONFIG.events
export const EVENTS_ON = {
  ...d,
  wheel: { ...d.wheel, access: 'all' as const },
  raid: { ...d.raid, access: 'all' as const },
  rebattle: { ...d.rebattle, access: 'all' as const },
}

/**
 * Rules tests pin the pacing knobs to neutral (×1), and status effects and the shiny rate to the defaults, so
 * their arithmetic documents the formulas, not the tuning done in admin. The events are on.
 */
export function makeData(config: Partial<GameConfig> = {}): GameData {
  return compileGameData({
    ...BUNDLE,
    config: {
      ...BUNDLE.config,
      goldMultiplier: 1,
      hpMultiplier: 1,
      xpMultiplier: 1,
      shinyChance: DEFAULT_CONFIG.shinyChance,
      status: DEFAULT_CONFIG.status,
      events: EVENTS_ON,
      liveEvents: { access: 'all', list: [] },
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
