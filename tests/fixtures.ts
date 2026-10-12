import { BUNDLE } from '@/config/bundle'
import {
  compileGameData,
  DEFAULT_CONFIG,
  type Area,
  type DieType,
  type GameConfig,
  type GameData,
  type Region,
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
 * Rules tests pin the pacing knobs to neutral (×1), and status effects, the shiny rate, Multi EXP, both pities (once-only
 * finds, new Pokémon), the donation pop-up and the Discord link to the defaults, so their arithmetic documents the
 * formulas, not the tuning done in admin. The events are on.
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
      multiExpShare: DEFAULT_CONFIG.multiExpShare,
      uniquePity: DEFAULT_CONFIG.uniquePity,
      newPokemonPity: DEFAULT_CONFIG.newPokemonPity,
      donation: DEFAULT_CONFIG.donation,
      discordUrl: DEFAULT_CONFIG.discordUrl,
      events: EVENTS_ON,
      liveEvents: { access: 'all', list: [] },
      ...config,
    },
  })
}

export const data = makeData()

/** The same, over extra content: areas and regions added to the bundle's (a small world's, docs/21). */
export function makeDataWith(extra: { areas?: Area[]; regions?: Region[] }, config: Partial<GameConfig> = {}): GameData {
  const base = makeData(config)
  return compileGameData({
    ...BUNDLE,
    areas: [...BUNDLE.areas, ...(extra.areas ?? [])],
    regions: [...(BUNDLE.regions ?? []), ...(extra.regions ?? [])],
    config: base.config as unknown as Record<string, unknown>,
  })
}

/**
 * Raid Battles off: every area boss is fought in its area as before docs/24 (the progression raids switch with the
 * daily raid). Boss tests read this, so they check the fight a legendary still gets wherever raids are closed.
 */
export const RAIDS_OFF = { ...EVENTS_ON, raid: { ...EVENTS_ON.raid, access: 'off' as const } }
export const bossData = makeData({ events: RAIDS_OFF })

/** Starters the admin made less rare in an area (`areaId/dex` → weight), kept by the live bundle of 2026-10-11. */
export const TUNED_STARTERS: Record<string, number> = {
  'bec52d1b-4c7c-5503-810a-5d4b8e5336ec/7': 3, // Squirtle on Routes 5 & 6
}

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
