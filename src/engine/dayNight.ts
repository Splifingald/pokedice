// Day and night in Johto (docs/32): the player's own clock splits the day in two, 6:00 to 17:59 the day and 18:00 to
// 5:59 the night, and a wild Pokémon whose row says `time` (from the real games) is met only in its half. The engine
// never reads a clock: the hour comes in from the store, as Extreme mode's and the events' times do.
import { eventOpenTo } from './events'
import { regionOf, regionOfArea } from './regions'
import type { Area, DayTime, GameData, RegionId, SaveData, WildPoolEntry } from './types'

/** The day starts at 6:00 and the night at 18:00, the player's local time. */
export const DAY_START_HOUR = 6
export const NIGHT_START_HOUR = 18

/** The regions that keep the time. Only Johto: its games are the ones that brought the clock in. */
export const DAY_NIGHT_REGIONS: readonly RegionId[] = ['johto']

/** The half of the day an hour (0–23) falls in. */
export const dayTimeAt = (hour: number): DayTime =>
  hour >= DAY_START_HOUR && hour < NIGHT_START_HOUR ? 'day' : 'night'

/** The hour the other half begins. */
export const nextTurnHour = (time: DayTime): number => (time === 'day' ? NIGHT_START_HOUR : DAY_START_HOUR)

/** Switched on for whoever is playing (Admin → Config → Day and night). */
export const dayNightOn = (data: GameData): boolean => eventOpenTo(data.config.dayNight?.access, data)

const keepsTime = (region: RegionId) => DAY_NIGHT_REGIONS.includes(region)

/** This area keeps the time: one of Johto's, while the switch is on for the player. */
export const areaKeepsTime = (data: GameData, area: Area): boolean =>
  dayNightOn(data) && keepsTime(regionOfArea(area))

/** The player is in a region that keeps the time: the top bar shows the sun or the moon. */
export const regionKeepsTime = (save: SaveData, data: GameData): boolean =>
  dayNightOn(data) && keepsTime(regionOf(save))

/** The time in this area at this hour; null where time isn't kept, or while the hour is unknown. */
export const areaDayTime = (data: GameData, area: Area, hour: number | null | undefined): DayTime | null =>
  hour == null || !areaKeepsTime(data, area) ? null : dayTimeAt(hour)

/** A row is met at this time: untagged rows always, and every row where time isn't kept (null). */
export const entryFitsTime = (entry: WildPoolEntry, time: DayTime | null): boolean =>
  !time || !entry.time || entry.time === time

/**
 * The area's wild pool at this time: the rows of the other half weigh 0 (kept, so lists still show them). An area
 * whose every row belongs to the other half keeps its whole pool rather than run dry.
 */
export function wildPoolAt(area: Area, time: DayTime | null): WildPoolEntry[] {
  if (!time || area.wildPool.every((e) => entryFitsTime(e, time))) return area.wildPool
  if (!area.wildPool.some((e) => e.weight > 0 && entryFitsTime(e, time))) return area.wildPool
  return area.wildPool.map((e) => (entryFitsTime(e, time) ? e : { ...e, weight: 0 }))
}

/**
 * When a species is met in this area: 'day' or 'night' when every one of its rows says so, else null (any time). For
 * the area's lists, which show a sun or a moon by it; null too where the area doesn't keep the time.
 */
export function speciesTime(data: GameData, area: Area, dex: number): DayTime | null {
  if (!areaKeepsTime(data, area)) return null
  const rows = area.wildPool.filter((e) => e.dex === dex && e.weight > 0)
  const first = rows[0]?.time
  return first && rows.every((e) => e.time === first) ? first : null
}

/** Its rules pop-up is due: switched on for the player, in Johto, not seen yet. */
export const dayNightRulesDue = (save: SaveData, data: GameData): boolean =>
  regionKeepsTime(save, data) && !save.dayNight?.rulesSeen

export function markDayNightRulesSeen(save: SaveData): SaveData {
  return save.dayNight?.rulesSeen ? save : { ...save, dayNight: { ...save.dayNight, rulesSeen: true } }
}

/**
 * A species' share of the area's wild Pokémon when it is met: at `now` (null = time not kept, the whole pool), or in
 * its own half when it comes only in the other. The area's lists show this next to its sun or moon.
 */
export function wildShare(data: GameData, area: Area, dex: number, now: DayTime | null): number {
  const pool = wildPoolAt(area, speciesTime(data, area, dex) ?? (areaKeepsTime(data, area) ? now : null))
  let total = 0
  let mine = 0
  for (const e of pool) {
    if (e.weight <= 0) continue
    total += e.weight
    if (e.dex === dex) mine += e.weight
  }
  return total ? mine / total : 0
}
