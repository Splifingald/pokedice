// The gift calendar (docs/55): a live event (docs/20) of type `calendar`, behind its own switch. From its start, a door
// opens every 24 hours, each with one reward the admin set (an item, Pokédollars or a Pokémon, in a quantity). A door
// opens on its day, or the day after (the catch-up); a day later it is missed for good. Each door opens once per save,
// on the server's clock (no device clock opens a door early), and its reward lands as the developer's gifts do
// (engine/gifts.ts), in the region being played. Advent first, any calendar later: the admin sets the start, the number
// of days and each day's reward.
import { eventOpenTo } from './events'
import { GIFT_CURRENT, GIFT_GOLD_MAX, GIFT_QTY_MAX, placeGifts, type GiftLanded } from './gifts'
import { livesFor } from './liveEvents'
import { cleanOutfit } from './outfits'
import type { CalendarReward, GameData, Gift, LiveEvent, SaveData } from './types'

const DAY = 24 * 3_600_000

/** A calendar has 1 to 31 days. */
export const CALENDAR_MAX_DAYS = 31
/** A day's Pokémon come at most this many at once (a team's worth). */
export const CALENDAR_MON_MAX = 6
/** Calendars whose opened doors a save keeps (the running one is always the newest). */
const KEPT = 12

/** The admin's switch (docs/15 §20): Off, no calendar shows or opens, whatever the live events' list says. */
export const calendarOn = (data: GameData): boolean => eventOpenTo(data.config.giftCalendar?.access, data)

/** A calendar's end: the day after its last, so the last door has its catch-up day too. */
export function calendarEnd(start: string, days: number): string {
  const s = Date.parse(start)
  return Number.isFinite(s) ? new Date(s + (Math.max(1, days) + 1) * DAY).toISOString() : start
}

const int = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) ? v : null)

/** One day's reward as saved, in range, or null (an item or species since removed is the admin's problem to fix). */
export function normaliseCalendarReward(raw: unknown): CalendarReward | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (o.kind === 'item') {
    const qty = int(o.qty)
    return typeof o.key === 'string' && o.key && qty != null && qty >= 1 && qty <= GIFT_QTY_MAX
      ? { kind: 'item', key: o.key, qty }
      : null
  }
  if (o.kind === 'gold') {
    const amount = int(o.amount)
    return amount != null && amount >= 1 && amount <= GIFT_GOLD_MAX ? { kind: 'gold', amount } : null
  }
  if (o.kind === 'pokemon') {
    const dex = int(o.dex)
    const level = int(o.level)
    const qty = int(o.qty) ?? 1
    return dex != null &&
      dex >= 1 &&
      level != null &&
      level >= 1 &&
      level <= 100 &&
      qty >= 1 &&
      qty <= CALENDAR_MON_MAX
      ? {
          kind: 'pokemon',
          dex,
          level,
          ...(o.shiny === true && { shiny: true }),
          ...(cleanOutfit(o.outfit, dex) && { outfit: o.outfit as string }),
          qty,
        }
      : null
  }
  return null
}

/** A calendar's rewards, day 1 first (null for a day whose reward isn't one the game can give). */
export const calendarRewards = (e: LiveEvent): (CalendarReward | null)[] =>
  (e.calendar?.days ?? []).slice(0, CALENDAR_MAX_DAYS).map((r) => normaliseCalendarReward(r))

/** The calendars running for this player (the switch on, the main game: an Extreme save has none), oldest first. */
export function calendarsFor(save: SaveData, data: GameData, now: number | null): LiveEvent[] {
  if (!calendarOn(data) || save.mode === 'extreme') return []
  return livesFor(save, data, now).filter((e) => e.type === 'calendar')
}

/** The day whose door is today's at `now`: 1 on the first day; 0 or less before it, past the last after it. */
export const calendarToday = (e: LiveEvent, now: number): number =>
  Math.floor((now - Date.parse(e.start)) / DAY) + 1

/** When a day's door opens (ms). */
export const calendarOpensAt = (e: LiveEvent, day: number): number => Date.parse(e.start) + (day - 1) * DAY

/**
 * A door's state: `opened` (its reward is in the save), `today` (its day), `late` (yesterday's, still open today: the
 * catch-up), `missed` (two days on, or the event ended first) and `shut` (to come).
 */
export type CalendarDoorState = 'opened' | 'today' | 'late' | 'missed' | 'shut'

export interface CalendarDoor {
  /** 1 = the first. */
  day: number
  reward: CalendarReward | null
  state: CalendarDoorState
  /** When it opens (ms). */
  opensAt: number
}

/** The days opened in this calendar, in this save. */
export const calendarOpened = (save: SaveData, e: Pick<LiveEvent, 'id'>): number[] =>
  save.events?.calendarOpened?.[e.id] ?? []

/** Every door of a calendar at `now`, day 1 first. */
export function calendarDoors(save: SaveData, e: LiveEvent, now: number): CalendarDoor[] {
  const today = calendarToday(e, now)
  const opened = new Set(calendarOpened(save, e))
  const over = now >= Date.parse(e.end)
  return calendarRewards(e).map((reward, i) => {
    const day = i + 1
    const state: CalendarDoorState = opened.has(day)
      ? 'opened'
      : day > today
        ? over
          ? 'missed'
          : 'shut'
        : over || day < today - 1
          ? 'missed'
          : day === today
            ? 'today'
            : 'late'
    return { day, reward, state, opensAt: calendarOpensAt(e, day) }
  })
}

/** The doors that can be opened now: yesterday's first (it closes sooner), then today's. Never one with no reward. */
export const calendarReady = (save: SaveData, e: LiveEvent, now: number): CalendarDoor[] =>
  calendarDoors(save, e, now)
    .filter((d) => (d.state === 'late' || d.state === 'today') && d.reward)
    .sort((a, b) => a.day - b.day)

/** When the next door opens (ms), or null after the last one. */
export function calendarNextAt(e: LiveEvent, now: number): number | null {
  const next = Math.max(1, calendarToday(e, now) + 1)
  return next <= calendarRewards(e).length ? calendarOpensAt(e, next) : null
}

/** A day's reward as gifts for the region being played: a Pokémon `qty` times, each one of its own. */
export function calendarGifts(r: CalendarReward): Gift[] {
  if (r.kind === 'item') return [{ kind: 'item', key: r.key, qty: r.qty, region: GIFT_CURRENT }]
  if (r.kind === 'gold') return [{ kind: 'gold', amount: r.amount, region: GIFT_CURRENT }]
  const mon: Gift = {
    kind: 'pokemon',
    dex: r.dex,
    level: r.level,
    ...(r.shiny && { shiny: true }),
    ...(r.outfit && { outfit: r.outfit }),
    region: GIFT_CURRENT,
  }
  return Array.from({ length: r.qty }, () => mon)
}

/**
 * Opens a door: its reward goes into the save (the region being played: its Bag, its ₽, its Box or team) and the
 * day is kept as opened. Null when that door can't be opened now (to come, missed, opened already, no reward).
 */
export function openCalendarDay(
  save: SaveData,
  data: GameData,
  e: LiveEvent,
  day: number,
  now: number,
  newId: () => string,
): { save: SaveData; landed: GiftLanded[] } | null {
  const door = calendarReady(save, e, now).find((d) => d.day === day)
  if (!door?.reward) return null
  const { save: placed, landed } = placeGifts(save, data, calendarGifts(door.reward), now, newId)
  const all = placed.events?.calendarOpened ?? {}
  // The running calendar's entry goes last, so the oldest ones are the first to go.
  const { [e.id]: mine = [], ...rest } = all
  const kept = Object.entries(rest).slice(-(KEPT - 1))
  const calendarOpened = { ...Object.fromEntries(kept), [e.id]: [...mine, day].sort((a, b) => a - b) }
  return { save: { ...placed, events: { ...placed.events, calendarOpened } }, landed }
}

/** The rules card shows at the top of the calendar's page until GOT IT (docs/15 §20); Home's notice says it opened. */
export const calendarRulesDue = (save: SaveData, data: GameData, now: number | null): boolean =>
  !save.events?.calendarRulesSeen && calendarsFor(save, data, now).length > 0

export const markCalendarRulesSeen = (save: SaveData): SaveData =>
  save.events?.calendarRulesSeen ? save : { ...save, events: { ...save.events, calendarRulesSeen: true } }

// ------------------------------------------------------------------ the admin

/** A calendar's days set to `n`: the days kept, new ones copying the last (₽1,000 for a calendar with none). */
export function resizeCalendar(days: readonly CalendarReward[], n: number): CalendarReward[] {
  const size = Math.max(1, Math.min(CALENDAR_MAX_DAYS, Math.round(n) || 1))
  const last: CalendarReward = days[days.length - 1] ?? { kind: 'gold', amount: 1000 }
  return Array.from({ length: size }, (_, i) => days[i] ?? last)
}

/** What stops the admin from saving a calendar (empty = fine). */
export function calendarProblems(e: LiveEvent, data: GameData): string[] {
  const out: string[] = []
  const days = e.calendar?.days ?? []
  if (e.repeat) out.push('A gift calendar runs once: pick its start date.')
  if (!days.length) out.push('The calendar has no day.')
  if (days.length > CALENDAR_MAX_DAYS) out.push(`A calendar has ${CALENDAR_MAX_DAYS} days at most.`)
  days.forEach((raw, i) => {
    const r = normaliseCalendarReward(raw)
    const day = `Day ${i + 1}`
    if (!r)
      out.push(
        `${day}: its reward isn't complete (a quantity of 1 to ${GIFT_QTY_MAX}, ₽1 to ${GIFT_GOLD_MAX.toLocaleString('en')}, Lv.1 to 100, ${CALENDAR_MON_MAX} Pokémon at most).`,
      )
    else if (r.kind === 'item' && !data.items[r.key]) out.push(`${day}: unknown item ${r.key}.`)
    else if (r.kind === 'pokemon' && !data.species[r.dex]) out.push(`${day}: unknown Pokémon #${r.dex}.`)
  })
  return out
}
