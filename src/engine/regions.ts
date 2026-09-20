// Regions: the badge case, grouped the way the player profile shows it.
//
// The content is one region (Kanto) for now, so a region is simply "the linear chain". The shape is
// a list because a second region is the obvious next step: when areas gain a `region` field, only
// `regionsOf` changes — every caller already reads a list.
import { linearAreas } from './data'
import { badgeCase, isAreaUnlocked, progressOf, type BadgeInfo } from './run'
import type { Area, GameData, SaveData } from './types'

export interface RegionCase {
  id: string
  /** Sheet key for the region's name (`ui.map.region` — Kanto). */
  nameKey: string
  /** The player has set foot in it: its first area is open. */
  unlocked: boolean
  badges: BadgeInfo[]
  earned: number
  /** The region's last area is cleared — the full endgame lap, not just the first Champion. */
  endgameCleared: boolean
}

/** The areas of each region, in chain order. One region today; the grouping lives here alone. */
function regionsOf(data: GameData): { id: string; nameKey: string; areas: Area[] }[] {
  const chain = linearAreas(data)
  if (!chain.length) return []
  return [{ id: 'kanto', nameKey: 'ui.map.region', areas: chain }]
}

/** Every region with its badges and its crown. Regions the player hasn't reached come back `unlocked: false`. */
export function regionCases(save: SaveData, data: GameData): RegionCase[] {
  const all = badgeCase(save, data)
  return regionsOf(data).map((r) => {
    const ids = new Set(r.areas.map((a) => a.id))
    const badges = all.filter((b) => ids.has(b.areaId))
    const last = r.areas[r.areas.length - 1]!
    return {
      id: r.id,
      nameKey: r.nameKey,
      unlocked: isAreaUnlocked(save, r.areas[0]!.id, data),
      badges,
      earned: badges.filter((b) => b.earned).length,
      endgameCleared: progressOf(save, last.id).cleared,
    }
  })
}
