// The special events (docs/18, docs/19): the Fortune Wheel, Raid Battles and the Elite Rebattle. This file is what they
// share: which are open, in which order Home shows them, and which unlock pop-up is due. Each event's own rules live
// in its own file.
import { enabledRegions, leagueDone, regionCases, regionOf, regionOfArea } from './regions'
import { EVENT_IDS, type AreaProgress, type EventDef, type EventId, type GameData, type SaveData } from './types'

/** An area's progress wherever its region is: the live block or a parked one. */
export function areaProgressAnywhere(save: SaveData, data: GameData, areaId: string): AreaProgress | undefined {
  const area = data.areas.find((a) => a.id === areaId)
  if (!area) return undefined
  const region = regionOfArea(area)
  return region === regionOf(save) ? save.areaProgress[areaId] : save.parked?.[region]?.areaProgress[areaId]
}

export const eventDef = (data: GameData, id: EventId): EventDef => data.config.events[id]

/**
 * An event is open once it's switched on and its moment has come: the wheel and the raids when their area is cleared
 * (in whichever region holds it), the rebattle once any region's league is beaten.
 */
export function eventUnlocked(id: EventId, save: SaveData, data: GameData): boolean {
  const def = eventDef(data, id)
  if (!def?.enabled) return false
  if (id === 'rebattle') return enabledRegions(data).some((r) => leagueDone(save, data, r.id))
  return !!def.unlockAreaId && !!areaProgressAnywhere(save, data, def.unlockAreaId)?.cleared
}

/** The open events, in Home's order (priority, then the order they open in). */
export function activeEvents(save: SaveData, data: GameData): EventId[] {
  return EVENT_IDS.filter((id) => eventUnlocked(id, save, data)).sort(
    (a, b) => eventDef(data, a).priority - eventDef(data, b).priority || EVENT_IDS.indexOf(a) - EVENT_IDS.indexOf(b),
  )
}

/**
 * The unlock pop-up that's due: the newest open event not shown yet. Only one ever shows at a time, and showing it
 * marks every open event seen (markEventsSeen), so a save that opens several at once gets one pop-up, not a queue.
 */
export function eventUnlockDue(save: SaveData, data: GameData): EventId | null {
  const seen = new Set(save.events?.seen ?? [])
  for (const id of [...EVENT_IDS].reverse()) if (!seen.has(id) && eventUnlocked(id, save, data)) return id
  return null
}

/** The pop-up was shown: every open event counts as seen. */
export function markEventsSeen(save: SaveData, data: GameData): SaveData {
  const seen = new Set(save.events?.seen ?? [])
  const before = seen.size
  for (const id of EVENT_IDS) if (eventUnlocked(id, save, data)) seen.add(id)
  if (seen.size === before) return save
  return { ...save, events: { ...save.events, seen: EVENT_IDS.filter((id) => seen.has(id)) } }
}

/** Kanto badges held (the teaser counts them, wherever the player is now). */
const kantoBadges = (save: SaveData, data: GameData) => regionCases(save, data).find((r) => r.id === 'kanto')?.earned ?? 0

/**
 * Home's square before any event is open. 'soon': a locked teaser naming the area that opens the first one (from the
 * teaser's badge count on). 'later': the plain "coming later" placeholder. Null once an event is open.
 */
export function eventsTeaser(save: SaveData, data: GameData): { kind: 'soon'; areaId: string } | { kind: 'later' } | null {
  if (activeEvents(save, data).length) return null
  if (kantoBadges(save, data) < data.config.events.teaserBadges) return { kind: 'later' }
  // The first switched-on event whose area isn't cleared yet, in the order the areas come.
  const next = EVENT_IDS.map((id) => eventDef(data, id))
    .filter((d) => d.enabled && d.unlockAreaId && !areaProgressAnywhere(save, data, d.unlockAreaId)?.cleared)
    .map((d) => data.areas.find((a) => a.id === d.unlockAreaId))
    .filter((a) => !!a)
    .sort((a, b) => a.orderIndex - b.orderIndex)[0]
  return next ? { kind: 'soon', areaId: next.id } : { kind: 'later' }
}
