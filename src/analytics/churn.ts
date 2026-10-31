// Churn by area (Admin → Analytics, docs/57): where the players who stopped playing were when they left. The database
// counts them per area (analytics_churn, migration 0102); this puts the areas in game order with their English names.
// "Where they were" is the area of the last hour they played (player_seen carries it; the daily snapshot before it).
import { regionOfArea } from '@/engine/regions'
import type { GameData } from '@/engine/types'

/** What analytics_churn returns. */
export interface ChurnRaw {
  /** The server's day (UTC). */
  today: string
  /** The latest last day that counts as churned: today − the days asked. */
  cutoff: string
  /** area id → [churned, active, churned's average days played, active's] (null: none of them). */
  areas: Record<string, readonly [number, number, number | null, number | null]>
  /** Players with no area recorded: [churned, active]. */
  unknown: readonly [number, number]
}

export interface ChurnRow {
  areaId: string
  name: string
  churned: number
  active: number
  /** churned / (churned + active). */
  share: number
  churnedDays: number | null
  activeDays: number | null
}

export interface ChurnGroup {
  /** The region's id; null for the areas the game data doesn't know (removed, or a world's that closed). */
  regionId: string | null
  name: string
  rows: ChurnRow[]
}

export interface Churn {
  today: string
  cutoff: string
  /** Regions in game order, each area in its `orderIndex` order; unknown areas last, most churned first. */
  groups: ChurnGroup[]
  /** Everyone counted, the players with no area included. */
  churned: number
  active: number
  /** Churned and active players with no area recorded (not in `groups`). */
  unknown: { churned: number; active: number }
  /** The most churned in one area: the bars' full width. */
  maxChurned: number
}

export function churnByArea(raw: ChurnRaw, data: Pick<GameData, 'areas' | 'regions'>): Churn {
  const row = (areaId: string, name: string): ChurnRow => {
    const [churned, active, churnedDays, activeDays] = raw.areas[areaId]!
    return {
      areaId,
      name,
      churned,
      active,
      share: churned / Math.max(1, churned + active),
      churnedDays,
      activeDays,
    }
  }
  const known = new Map(data.areas.map((a) => [a.id, a]))
  const regions = new Map(data.regions.map((r) => [r.id, r]))
  // A region the data doesn't list goes after the ones it does.
  const rank = (regionId: string) => regions.get(regionId)?.orderIndex ?? Number.MAX_SAFE_INTEGER
  const ids = Object.keys(raw.areas)
  const ordered = ids
    .flatMap((id) => {
      const area = known.get(id)
      return area ? [{ id, area, regionId: regionOfArea(area) }] : []
    })
    .sort(
      (x, y) =>
        rank(x.regionId) - rank(y.regionId) ||
        x.regionId.localeCompare(y.regionId) ||
        x.area.orderIndex - y.area.orderIndex,
    )
  const byRegion = new Map<string, ChurnGroup>()
  for (const { id, area, regionId } of ordered) {
    let group = byRegion.get(regionId)
    if (!group) {
      group = { regionId, name: regions.get(regionId)?.name ?? regionId, rows: [] }
      byRegion.set(regionId, group)
    }
    group.rows.push(row(id, area.name))
  }
  const other = ids
    .filter((id) => !known.has(id))
    .map((id) => row(id, `Area ${id.slice(0, 8)}`))
    .sort((a, b) => b.churned - a.churned || a.areaId.localeCompare(b.areaId))
  const groups = [...byRegion.values()]
  if (other.length) groups.push({ regionId: null, name: 'Areas the game no longer has', rows: other })
  const all = groups.flatMap((g) => g.rows)
  const unknown = { churned: raw.unknown[0], active: raw.unknown[1] }
  return {
    today: raw.today,
    cutoff: raw.cutoff,
    groups,
    churned: all.reduce((n, r) => n + r.churned, unknown.churned),
    active: all.reduce((n, r) => n + r.active, unknown.active),
    unknown,
    maxChurned: Math.max(0, ...all.map((r) => r.churned)),
  }
}
