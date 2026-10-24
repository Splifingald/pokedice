// Push notifications (docs/27-PUSH-NOTIFICATIONS.md): what the game tells a player while it's closed, and when. A Day
// Care Egg, the day's raid, a live event starting. The game works out its own player's next few notices from the save
// and hands them to the server, which sends each one at its time; this file decides which notices and their times. The
// words and pictures are the UI's (src/lib/push.ts), so the engine never needs the strings.
import { pairs, nextClock, type CarePair } from './breeding'
import { dayCareOf, isDayCareOpen } from './daycare'
import { utcDay } from './eventTime'
import { eventOpenTo, eventUnlocked } from './events'
import { badgesHeld, liveStartsBetween } from './liveEvents'
import { monName } from './nickname'
import { todayRaid } from './raid'
import { raidOfDay } from './raidCalendar'
import type { GameData, LiveEvent, PushConfig, SaveData } from './types'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** What a player can be told about. Each has its own switch in Settings, and its own one-time question. */
export const PUSH_TOPICS = ['egg', 'raid', 'live'] as const
export type PushTopic = (typeof PUSH_TOPICS)[number]

/** The days of raids announced ahead: the plan is renewed every time the game opens, so a week is plenty. */
export const PUSH_RAID_DAYS = 7
/** Live events announced up to this far ahead. */
export const PUSH_LIVE_DAYS = 14
/** Notices handed to the server at once, the soonest first (the server keeps at most this many per player). */
export const PUSH_PLAN_MAX = 16

/** Switched on for whoever is playing (the admin's three-way switch, docs/15 §20). */
export const pushOn = (data: GameData): boolean => eventOpenTo(data.config.push?.access, data)

export const pushCfg = (data: GameData): PushConfig => data.config.push

/** Minutes east of UTC at a moment (the device's zone, daylight saving included): -Date#getTimezoneOffset(). */
export type LocalOffset = (ms: number) => number

/** One of the Day Care's pair, as the notice names it: its nickname, or its species' name. */
export interface EggParentNotice {
  dex: number
  name: string
  shiny?: boolean
}

export type PushNotice =
  | { topic: 'egg'; key: string; at: number; parents: [EggParentNotice, EggParentNotice] }
  | { topic: 'raid'; key: string; at: number; day: string; dex: number; shiny: boolean; areaId: string }
  | { topic: 'live'; key: string; at: number; event: LiveEvent }

/** The local hour of a moment, 0 to 24. */
const localHour = (ms: number, off: LocalOffset) => ((((ms + off(ms) * MINUTE) % DAY) + DAY) % DAY) / HOUR

/**
 * A moment moved out of the quiet hours: one that falls between `from` and `to` (local, the window may cross
 * midnight) waits until `to`. Equal hours = no quiet time.
 */
export function outOfQuiet(at: number, [from, to]: readonly [number, number], off: LocalOffset): number {
  if (from === to) return at
  const h = localHour(at, off)
  const inside = from < to ? h >= from && h < to : h >= from || h < to
  if (!inside) return at
  const wait = (((to - h) % 24) + 24) % 24
  return at + Math.round(wait * HOUR)
}

/**
 * When the raid of a UTC day is announced: at `hour` the player's time, on whichever local day puts that inside the raid's
 * UTC day (a raid opens at midnight UTC: 2 a.m. in Paris, 9 a.m. in Tokyo). Midnight UTC if no such hour exists.
 */
export function raidNoticeAt(day: string, hour: number, off: LocalOffset): number {
  const start = Date.parse(`${day}T00:00:00Z`)
  for (const k of [0, 1, -1]) {
    const local = start + k * DAY
    const at = local + hour * HOUR - off(local) * MINUTE
    if (at >= start && at < start + DAY) return at
  }
  return start
}

/** The pair a check would most likely pick: the only one, else your own two, else the first. */
function likelyPair(ps: CarePair[]): CarePair | undefined {
  return ps.length === 1 ? ps[0] : (ps.find((p) => p.a.mine != null && p.b.mine != null) ?? ps[0])
}

/**
 * The next Egg, if one is coming: the next check of a running clock, when no Egg waits (one at a time: a check lays
 * nothing until it hatches). Named after the pair that will most likely leave it (a check picks one of its pairs at
 * random; with one pair, that one). Out of the quiet hours.
 */
export function eggNotice(save: SaveData, data: GameData, now: number, off: LocalOffset): PushNotice | null {
  if (!isDayCareOpen(save, data) || dayCareOf(save).egg) return null
  const next = nextClock(save, data, now)
  if (!next || next.at <= now) return null
  const pair = likelyPair(pairs(save, data).filter((p) => p.slow === (next.clock === 'ditto')))
  if (!pair) return null
  const name = (m: CarePair['a']): EggParentNotice => ({
    dex: m.dex,
    name: m.resident ? monName(m.resident.inst, data) : (data.species[m.dex]?.name ?? `#${m.dex}`),
    ...((m.resident?.inst.shiny ?? m.guest?.shiny) && { shiny: true }),
  })
  return {
    topic: 'egg',
    key: `egg:${next.at}`,
    at: outOfQuiet(next.at, pushCfg(data).quietHours, off),
    parents: [name(pair.a), name(pair.b)],
  }
}

/** The raids of the next days, each announced at the player's `raidHour`; none while raids aren't open to them. */
export function raidNotices(save: SaveData, data: GameData, now: number, off: LocalOffset): PushNotice[] {
  if (!eventUnlocked('raid', save, data)) return []
  const out: PushNotice[] = []
  for (let k = 0; k < PUSH_RAID_DAYS; k++) {
    const day = utcDay(now + k * DAY)
    const raid = raidOfDay(data, day)
    const at = raidNoticeAt(day, pushCfg(data).raidHour, off)
    // Today's, once caught, is old news.
    if (!raid || at <= now || todayRaid(save, day)?.caught) continue
    out.push({
      topic: 'raid',
      key: `raid:${day}`,
      at,
      day,
      dex: raid.dex,
      shiny: raid.shiny,
      areaId: raid.areaId,
    })
  }
  return out
}

/** Live events still to start in the next days, at their start, that this player will see (enough badges today). */
export function liveNotices(save: SaveData, data: GameData, now: number): PushNotice[] {
  if (!eventOpenTo(data.config.liveEvents?.access, data)) return []
  const badges = badgesHeld(save, data)
  // A recurring event's runs each have their own id, so each is announced.
  return liveStartsBetween(data, now + 1, now + PUSH_LIVE_DAYS * DAY + 1)
    .filter((e) => badges >= e.minBadges)
    .map((e) => ({ topic: 'live', key: `live:${e.id}`, at: Date.parse(e.start), event: e }))
}

/**
 * Everything to announce to this player, the soonest first, for the topics they want. Nothing while the switch is off
 * for them. The server replaces its list with this one each time it changes.
 */
export function pushPlan(
  save: SaveData,
  data: GameData,
  now: number,
  off: LocalOffset,
  topics: readonly PushTopic[] = PUSH_TOPICS,
): PushNotice[] {
  if (!pushOn(data)) return []
  const egg = topics.includes('egg') ? eggNotice(save, data, now, off) : null
  return [
    ...(egg ? [egg] : []),
    ...(topics.includes('raid') ? raidNotices(save, data, now, off) : []),
    ...(topics.includes('live') ? liveNotices(save, data, now) : []),
  ]
    .sort((a, b) => a.at - b.at)
    .slice(0, PUSH_PLAN_MAX)
}
