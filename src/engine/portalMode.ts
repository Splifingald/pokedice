// The portal run's settings (docs/28), on their own so the raid's numbers can read them without the run's rules: an
// area's `mode` as the admin set it, cleaned and filled from the defaults, and the switch that turns it on.
import { eventOpenTo } from './events'
import {
  POKE_TYPES,
  type Area,
  type GameData,
  type PokeType,
  type PortalRunMode,
  type PortalSkin,
} from './types'

/** Distortion World's numbers (the user's spec of 2026-10-15): what a new portal area starts with. */
export const DEFAULT_PORTAL_RUN: PortalRunMode = {
  kind: 'portal',
  portals: 10,
  wild: 5,
  items: 1,
  offers: 3,
  heal: { weight: 1, percent: 30 },
  revive: { weight: 1 },
  boost: { weight: 1, amount: 10 },
  die: { weight: 1, maxDice: 8 },
  item: {
    weight: 1,
    items: [
      { key: 'hyper-potion', weight: 40 },
      { key: 'revive', weight: 40 },
      { key: 'max-revive', weight: 20 },
    ],
  },
  raid: { level: 100, upgradeLevel: 10, bars: 4, teamCap: 100 },
}

const num = (v: unknown, fallback: number, min: number, max: number): number => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback
}
const int = (v: unknown, fallback: number, min: number, max: number) => Math.round(num(v, fallback, min, max))
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {}

/**
 * The Hall of Origin's raid (docs/64 §4.5, the user's call): Arceus's Plate on each of its four bars, Normal → Ice →
 * Steel → Dragon. What the admin's "Plates" button fills in.
 */
export const PLATE_BARS: readonly PokeType[] = ['normal', 'ice', 'steel', 'dragon']

const isType = (v: unknown): v is PokeType =>
  typeof v === 'string' && (POKE_TYPES as readonly string[]).includes(v)

/** A portal run's look: Distortion World's unless it says the Stairway of Plates. */
export const portalSkin = (mode: Pick<PortalRunMode, 'skin'> | null | undefined): PortalSkin =>
  mode?.skin === 'plates' ? 'plates' : 'distortion'

/** A portal mode as the admin left it (a missing or odd number falls back to the default); null when it isn't one. */
export function normalisePortal(raw: unknown): PortalRunMode | null {
  const r = obj(raw)
  if (r.kind !== 'portal') return null
  const d = DEFAULT_PORTAL_RUN
  const heal = obj(r.heal)
  const boost = obj(r.boost)
  const die = obj(r.die)
  const item = obj(r.item)
  const raid = obj(r.raid)
  const items = Array.isArray(item.items)
    ? item.items
        .map((x) => obj(x))
        .filter((x) => typeof x.key === 'string' && x.key)
        .map((x) => ({ key: String(x.key), weight: num(x.weight, 0, 0, 1e6) }))
    : d.item.items
  // Only the types the game knows, up to one per bar the admin may set.
  const barTypes = Array.isArray(raid.barTypes) ? raid.barTypes.filter(isType).slice(0, 10) : []
  return {
    kind: 'portal',
    // Written only when it isn't the default, so Distortion World's mode reads exactly as it always has.
    ...(r.skin === 'plates' && { skin: 'plates' as const }),
    portals: int(r.portals, d.portals, 1, 99),
    wild: int(r.wild, d.wild, 0, 30),
    items: int(r.items, d.items, 0, 30),
    offers: int(r.offers, d.offers, 1, 5),
    heal: {
      weight: num(heal.weight, d.heal.weight, 0, 1e6),
      percent: num(heal.percent, d.heal.percent, 0, 100),
    },
    revive: { weight: num(obj(r.revive).weight, d.revive.weight, 0, 1e6) },
    boost: {
      weight: num(boost.weight, d.boost.weight, 0, 1e6),
      amount: int(boost.amount, d.boost.amount, 0, 999),
    },
    die: { weight: num(die.weight, d.die.weight, 0, 1e6), maxDice: int(die.maxDice, d.die.maxDice, 1, 12) },
    item: { weight: num(item.weight, d.item.weight, 0, 1e6), items },
    raid: {
      level: int(raid.level, d.raid.level, 1, 100),
      upgradeLevel: int(raid.upgradeLevel, d.raid.upgradeLevel, 1, 10),
      bars: int(raid.bars, d.raid.bars, 1, 10),
      teamCap: int(raid.teamCap, d.raid.teamCap, 1, 100),
      ...(barTypes.length > 0 && { barTypes }),
    },
  }
}

/**
 * The switch a portal run answers to (the user's call of 2026-11-01): the Stairway of Plates has its own (`platesRun`),
 * so Arceus's climb and Distortion World open apart; every other portal run, Distortion World's (`portalRun`).
 * The server picks the same way (0127, raid_progress_portal).
 */
export const portalSwitchOf = (
  mode: Pick<PortalRunMode, 'skin'> | null | undefined,
): 'portalRun' | 'platesRun' => (portalSkin(mode) === 'plates' ? 'platesRun' : 'portalRun')

/** That portal run is switched on for whoever is playing (each switch Off by default; docs/15 §20). */
export const portalRunsOn = (data: GameData, mode?: Pick<PortalRunMode, 'skin'> | null): boolean =>
  eventOpenTo(data.config[portalSwitchOf(mode)]?.access, data)

/** The area's portal run, when it has one and its switch is on for the player; null otherwise (it plays as before). */
export function portalModeOf(
  area: Pick<Area, 'mode'> | undefined | null,
  data: GameData,
): PortalRunMode | null {
  const mode = area?.mode ? normalisePortal(area.mode) : null
  return mode && portalRunsOn(data, mode) ? mode : null
}

/**
 * The raid's numbers of a portal area (Lv.100, dice level 10, 4 bars, teams up to Lv.100; the Hall of Origin's Lv.90
 * with its Plate on each bar); null elsewhere.
 */
export function portalRaidRules(data: GameData, areaId: string | undefined): PortalRunMode['raid'] | null {
  const area = areaId ? data.areas.find((a) => a.id === areaId) : undefined
  return portalModeOf(area, data)?.raid ?? null
}
