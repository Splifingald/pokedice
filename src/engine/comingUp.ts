// Home's "Coming up" line (docs/15 §12): Home shows a square only for what is open, and one line for the next thing to
// open with how close the player is ("Coming up: Day Care · 7/20 caught"). On a new game three of Home's four squares
// were locked or empty, each answering a tap its own way; one line says the same, once.
import { isDayCareOpen, speciesCaughtEverywhere } from './daycare'
import { eventsTeaser } from './events'
import { inWorldRegion, regionOf, regionOfArea } from './regions'
import { conditionStatus, isAreaUnlocked, type ConditionStatus } from './run'
import { versusReadyCount, versusUnlocked, VERSUS_TEAM_SIZE } from './versus'
import type { Area, GameData, SaveData } from './types'

export type ComingUp =
  | { kind: 'dayCare'; current: number; target: number }
  /** The first special event, once the teaser names the area that opens it. */
  | { kind: 'events'; areaId: string }
  | { kind: 'versus'; current: number; target: number }
  /** The secret area closest to opening, and the condition still to meet. */
  | { kind: 'secret'; area: Area; status: ConditionStatus }

/**
 * The locked secret area of the region closest to opening: fewest conditions left, then furthest along the first of
 * them (most want several things: an area reached, a Pokédex, a level). Null once every one is open.
 */
export function closestSecret(
  save: SaveData,
  data: GameData,
): { area: Area; status: ConditionStatus } | null {
  let best: { area: Area; status: ConditionStatus; left: number; k: number } | null = null
  for (const area of data.areas) {
    if (!area.hidden || regionOfArea(area) !== regionOf(save) || isAreaUnlocked(save, area.id, data)) continue
    const unmet = (area.unlockConditions ?? [])
      .map((c) => conditionStatus(c, save, data))
      .filter((s) => !s.met)
    const status = unmet[0]
    if (!status) continue
    const k = status.target > 0 ? status.current / status.target : 0
    if (!best || unmet.length < best.left || (unmet.length === best.left && k > best.k))
      best = { area, status, left: unmet.length, k }
  }
  return best && { area: best.area, status: best.status }
}

/**
 * The next thing to open, in the order things usually open: the Day Care, the special events (from the teaser's badge
 * count on, when it names an area), Versus, then the next secret area (a goal rather than a feature, so it comes after
 * them). Null when everything is open, or inside a small world (its own squares only).
 */
export function comingUp(save: SaveData, data: GameData): ComingUp | null {
  if (inWorldRegion(save, data)) return null
  if (!isDayCareOpen(save, data)) {
    const target = data.config.dayCare.unlockPokedex
    return { kind: 'dayCare', current: Math.min(speciesCaughtEverywhere(save), target), target }
  }
  const teaser = eventsTeaser(save, data)
  if (teaser?.kind === 'soon') return { kind: 'events', areaId: teaser.areaId }
  if (!versusUnlocked(save, data))
    return {
      kind: 'versus',
      current: Math.min(versusReadyCount(save, data), VERSUS_TEAM_SIZE),
      target: VERSUS_TEAM_SIZE,
    }
  const secret = closestSecret(save, data)
  return secret && { kind: 'secret', ...secret }
}
