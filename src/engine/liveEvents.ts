// Live events (docs/20): the whole game changes for a while, the same for every player, scheduled by the admin
// (game_config `liveEvents`). Several can run at once, each its own:
//  - a Shiny Parade: wild Pokémon's shiny odds × n, in some areas, one region or everywhere;
//  - a Special Shop: items at a special price, items the Mart never sells, some limited per player;
//  - Cash Flow: every ₽ earned × n (selling excluded, so buying and selling back never pays).
// Two of a kind add up: two Cash Flows of +50 % pay +100 %, two Shiny Parades of ×5 make ×9 where both cover.
// An event runs once (a start and an end) or comes back (§9): every year on a date, or on a weekday, every week or on
// some weeks of the month. Each run of a recurring event is an event of its own for players (its own id, pop-up and
// shop limits), built from the rule here; the admin's list holds only the rule.
// Time is the server's (store/serverTime): it starts and ends at the same moment for everyone; while the time is
// unknown, no event runs. A player sees it, and gets it, from the event's badge count on.
import { eventOpenTo } from './events'
import { addFossil } from './fossils'
import { sellPrice } from './items'
import { inWorldRegion, regionCases, regionOf, regionOfArea } from './regions'
import type {
  Area,
  GameData,
  ItemDef,
  LiveEvent,
  LiveRepeat,
  LiveShopItem,
  LiveType,
  LiveWeek,
  SaveData,
  WheelReward,
} from './types'

const at = (iso: string): number => Date.parse(iso)
const HOUR = 3_600_000
const DAY = 24 * HOUR

/** How long a recurring event's runs may last: a weekly one's never reach the next week's, a yearly one's a month. */
export const LIVE_REPEAT_MAX_HOURS: Record<LiveRepeat['kind'], number> = { weekly: 7 * 24, yearly: 31 * 24 }

/** A recurring event's settings as saved, filled in and in range enough to compute with (liveProblems says what's off). */
export function normaliseRepeat(raw: Partial<LiveRepeat> | null | undefined): LiveRepeat | null {
  if (!raw || (raw.kind !== 'yearly' && raw.kind !== 'weekly')) return null
  const time = typeof raw.time === 'string' && /^\d{1,2}:\d{2}$/.test(raw.time) ? raw.time : '00:00'
  const hours = Number(raw.hours) > 0 ? Number(raw.hours) : 24
  if (raw.kind === 'yearly') {
    const r = raw as Partial<Extract<LiveRepeat, { kind: 'yearly' }>>
    return { kind: 'yearly', month: Math.round(Number(r.month)) || 1, day: Math.round(Number(r.day)) || 1, time, hours }
  }
  const r = raw as Partial<Extract<LiveRepeat, { kind: 'weekly' }>>
  const weeks = (Array.isArray(r.weeks) ? r.weeks : []).filter((w): w is LiveWeek => w === 'last' || [1, 2, 3, 4].includes(w as number))
  return { kind: 'weekly', weekday: Math.round(Number(r.weekday)) || 0, weeks: [...new Set(weeks)], time, hours }
}

/** An event as the admin saved it, every type's settings filled in (a row from an older admin may miss some). */
export function normaliseLiveEvent(raw: Partial<LiveEvent>): LiveEvent {
  const d = newLiveEvent(String(raw.id ?? ''), String(raw.start ?? ''), String(raw.end ?? ''))
  return {
    ...d,
    ...raw,
    repeat: normaliseRepeat(raw.repeat),
    title: { ...raw.title },
    shiny: { ...d.shiny, ...raw.shiny, areaIds: raw.shiny?.areaIds ?? [] },
    shop: { items: raw.shop?.items ?? [] },
    cash: { ...d.cash, ...raw.cash },
  } as LiveEvent
}

// ------------------------------------------------------------------ recurring events (§9)

/** The ms past midnight (UTC) of "HH:MM"; 0 when it isn't one. */
export function repeatTime(time: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time)
  if (!m) return 0
  const h = Number(m[1])
  const min = Number(m[2])
  return h < 24 && min < 60 ? h * HOUR + min * 60_000 : 0
}

/** A run's length, in ms (at least an hour, at most its kind's longest). */
const runLength = (r: LiveRepeat) => Math.min(LIVE_REPEAT_MAX_HOURS[r.kind], Math.max(1, Number(r.hours) || 0)) * HOUR

/** Which of its weekday this date is in its month: 1 to 5. */
const weekOfMonth = (d: Date) => Math.ceil(d.getUTCDate() / 7)
/** This date is its weekday's last in the month (a week later is next month). */
const lastOfMonth = (d: Date) => new Date(d.getTime() + 7 * DAY).getUTCMonth() !== d.getUTCMonth()

/** A recurring event starts on this UTC day (ms at its midnight). */
export function repeatsOn(r: LiveRepeat, day: number): boolean {
  const d = new Date(day)
  if (r.kind === 'yearly') return d.getUTCMonth() + 1 === r.month && d.getUTCDate() === r.day
  if (d.getUTCDay() !== r.weekday) return false
  if (!r.weeks.length) return true
  return r.weeks.some((w) => (w === 'last' ? lastOfMonth(d) : weekOfMonth(d) === w))
}

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** The run of a recurring event that starts on that UTC day (ms at its midnight), cut short if "End now" stopped it. */
function runOn(e: LiveEvent, r: LiveRepeat, day: number): LiveEvent {
  const key = ymd(day)
  const s = day + repeatTime(r.time)
  const stop = e.stops?.[key] ? at(e.stops[key]!) : NaN
  const end = Number.isFinite(stop) ? Math.max(s, Math.min(s + runLength(r), stop)) : s + runLength(r)
  return { ...e, id: `${e.id}@${key}`, ruleId: e.id, repeat: null, stops: undefined, start: new Date(s).toISOString(), end: new Date(end).toISOString() }
}

/**
 * The runs of an event that are on at some point between `from` and `to` (ms), in order, `max` at most: the event
 * itself when it runs once, each date's run when it comes back.
 */
export function liveRuns(e: LiveEvent, from: number, to: number, max = Infinity): LiveEvent[] {
  if (!e.repeat) return at(e.start) < to && from < at(e.end) && at(e.end) > at(e.start) ? [e] : []
  const r = e.repeat
  const out: LiveEvent[] = []
  // A run that started up to its length before `from` may still be on.
  for (let day = Math.floor((from - runLength(r) - repeatTime(r.time)) / DAY) * DAY; day < to && out.length < max; day += DAY) {
    if (!repeatsOn(r, day)) continue
    const run = runOn(e, r, day)
    if (at(run.start) < to && from < at(run.end) && at(run.end) > at(run.start)) out.push(run)
  }
  return out
}

/** Its next run not over yet at `now` (the one on, or the next to come), looking up to four years ahead (a 29 February). */
export const liveNextRun = (e: LiveEvent, now: number): LiveEvent | null => liveRuns(e, now, now + 4 * 366 * DAY, 1)[0] ?? null

/** An event or a run by its id ("<id>@<YYYY-MM-DD>" for a recurring event's run), as it is now in the admin's list. */
export function liveById(data: GameData, id: string): LiveEvent | null {
  const [ruleId, key] = id.split('@')
  const e = liveEvents(data).find((x) => x.id === ruleId)
  if (!e) return null
  if (key == null) return e.repeat ? null : e
  const day = Date.parse(`${key}T00:00:00Z`)
  return e.repeat && Number.isFinite(day) && repeatsOn(e.repeat, day) ? runOn(e, e.repeat, day) : null
}
const LISTS = new WeakMap<object, LiveEvent[]>()

/** The admin's live events, past, running and to come. */
export function liveEvents(data: GameData): LiveEvent[] {
  const raw = data.config.liveEvents?.list ?? []
  let list = LISTS.get(raw)
  if (!list) LISTS.set(raw, (list = raw.map((e) => normaliseLiveEvent(e))))
  return list
}

/**
 * Where an event stands at `now`: before its start, running (start included, end excluded) or over. A recurring
 * event is live while one of its runs is, else scheduled (it comes back), ended only if it never runs again.
 */
export function liveState(e: Pick<LiveEvent, 'start' | 'end'> & Partial<LiveEvent>, now: number): 'scheduled' | 'live' | 'ended' {
  if (e.repeat) {
    const next = liveNextRun(e as LiveEvent, now)
    return !next ? 'ended' : now < at(next.start) ? 'scheduled' : 'live'
  }
  const s = at(e.start)
  const end = at(e.end)
  if (!Number.isFinite(s) || !Number.isFinite(end) || end <= s) return 'ended'
  return now < s ? 'scheduled' : now < end ? 'live' : 'ended'
}

/**
 * The events (and recurring events' runs) running at that server time, the earliest started first; none while the
 * time is unknown or when they're switched off.
 */
export function liveEventsAt(data: GameData, now: number | null): LiveEvent[] {
  if (now == null || !eventOpenTo(data.config.liveEvents?.access, data)) return []
  return liveEvents(data)
    .flatMap((e) => liveRuns(e, now, now + 1))
    .sort((a, b) => at(a.start) - at(b.start) || a.id.localeCompare(b.id))
}

/** The first of the events running at that server time (for one picture, as the push question's), or null. */
export const liveEventAt = (data: GameData, now: number | null): LiveEvent | null => liveEventsAt(data, now)[0] ?? null

/** Runs starting between `from` and `to` (ms), the soonest first: what reminders announce. */
export function liveStartsBetween(data: GameData, from: number, to: number): LiveEvent[] {
  return liveEvents(data)
    .flatMap((e) => liveRuns(e, from, to))
    .filter((e) => at(e.start) >= from && at(e.start) < to)
    .sort((a, b) => at(a.start) - at(b.start) || a.id.localeCompare(b.id))
}

/** Badges held in every region: a live event shows from its own count of them. */
export const badgesHeld = (save: SaveData, data: GameData): number => regionCases(save, data).reduce((n, r) => n + r.earned, 0)

/**
 * The events running for this player: running, and they have their badges. Their effects follow the same rule. They
 * stay outside a small world (docs/21): while one is played, there's none.
 */
export function livesFor(save: SaveData, data: GameData, now: number | null): LiveEvent[] {
  if (inWorldRegion(save, data)) return []
  const badges = badgesHeld(save, data)
  return liveEventsAt(data, now).filter((e) => badges >= e.minBadges)
}

/** The live events in effect: one, several (they add up), or none. */
export type LiveSet = LiveEvent | readonly LiveEvent[] | null | undefined
const isList = (l: LiveSet): l is readonly LiveEvent[] => Array.isArray(l)
/** The events of a set, as a list. */
export const liveList = (l: LiveSet): readonly LiveEvent[] => (!l ? [] : isList(l) ? l : [l])

/** Time left (ms), and the share of the event still to come (1 → 0), for the timer and its gauge. */
export function liveLeft(e: Pick<LiveEvent, 'start' | 'end'>, now: number): { ms: number; share: number } {
  const s = at(e.start)
  const end = at(e.end)
  const ms = Math.max(0, end - now)
  return { ms, share: end > s ? Math.min(1, ms / (end - s)) : 0 }
}

// ------------------------------------------------------------------ the pop-up (once per event)

/** The first of these events whose pop-up is due: running for this player, and not shown yet. */
export const livePopupNext = (save: SaveData, live: LiveSet): LiveEvent | null =>
  liveList(live).find((e) => !(save.events?.liveSeen ?? []).includes(e.id)) ?? null

/** A pop-up is due for one of these events. */
export const livePopupDue = (save: SaveData, live: LiveSet): boolean => !!livePopupNext(save, live)

/** The pop-up was shown. Only the last 50 ids are kept: an old event never comes back. */
export function markLiveSeen(save: SaveData, live: LiveEvent): SaveData {
  const seen = save.events?.liveSeen ?? []
  if (seen.includes(live.id)) return save
  return { ...save, events: { ...save.events, liveSeen: [...seen, live.id].slice(-50) } }
}

// ------------------------------------------------------------------ Cash Flow

/** × every ₽ earned while Cash Flow runs (never below 1); two at once add their bonuses (+50 % and +50 % = +100 %). */
export const cashMultiplier = (live: LiveSet): number =>
  liveList(live).reduce((m, e) => (e.type === 'cash' ? m + Math.max(0, (Number(e.cash?.multiplier) || 1) - 1) : m), 1)

/** ₽ earned, with Cash Flow's share: `amount` is what's paid, `bonus` the part Cash Flow added (0 without it). */
export function earnedGold(base: number, live: LiveSet): { amount: number; bonus: number } {
  const b = Math.max(0, Math.round(base))
  const amount = Math.round(b * cashMultiplier(live))
  return { amount, bonus: amount - b }
}

/** The Fortune Wheel's prize as paid: its ₽ under Cash Flow (an item stays as it is). */
export const cashReward = (r: WheelReward, live: LiveSet): WheelReward =>
  r.kind === 'gold' ? { kind: 'gold', amount: earnedGold(r.amount, live).amount } : r

// ------------------------------------------------------------------ Shiny Parade

/** This Shiny Parade covers this area: every area, its region, or one of its areas. */
function covers(e: LiveEvent, area: Area): boolean {
  if (e.type !== 'shiny' || !e.shiny) return false
  const s = e.shiny
  if (s.scope === 'all') return true
  if (s.scope === 'region') return !!s.regionId && regionOfArea(area) === s.regionId
  return s.areaIds.includes(area.id)
}

/** A Shiny Parade covers this area. */
export const liveCovers = (live: LiveSet, area: Area | undefined): boolean => !!area && liveList(live).some((e) => covers(e, area))

/** × the wild shiny odds in this area (1 when no parade covers it); two parades add their boosts (×5 and ×5 = ×9). */
export const shinyBoost = (live: LiveSet, area: Area | undefined): number =>
  !area ? 1 : liveList(live).reduce((m, e) => (covers(e, area) ? m + Math.max(0, (Number(e.shiny.multiplier) || 1) - 1) : m), 1)

// ------------------------------------------------------------------ Special Shop

export interface LiveShopRow {
  item: ItemDef
  /** What it costs now: the event's price, never below what the Mart pays back for it (no buy-and-sell profit). */
  price: number
  /** The Mart's usual price when it sells it here, else null ("not in the Mart"). */
  usual: number | null
  limit: number | null
  bought: number
  /** Left for this player; null = no limit. */
  left: number | null
}

const boughtOf = (save: SaveData, live: LiveEvent, key: string): number => save.events?.liveBought?.[live.id]?.[key] ?? 0

/** A Special Shop item is sold where the player is playing, if its region list has it. */
const soldHere = (row: LiveShopItem, save: SaveData): boolean => row.regions === 'all' || row.regions.includes(regionOf(save))

/** The price a row is sold at: the admin's, raised to the Mart's buy-back price if it's lower. */
export const livePrice = (row: LiveShopItem, item: ItemDef | undefined): number => Math.max(1, Math.round(row.price), sellPrice(item))

/** The Special Shop's rows for this player, in the admin's order (empty without a running Special Shop). */
export function liveShopRows(save: SaveData, data: GameData, live: LiveEvent | null): LiveShopRow[] {
  if (!live || live.type !== 'shop') return []
  const out: LiveShopRow[] = []
  for (const row of live.shop?.items ?? []) {
    const item = data.items[row.key]
    if (!item || !soldHere(row, save)) continue
    const bought = boughtOf(save, live, row.key)
    const limit = row.limit == null ? null : Math.max(0, Math.floor(row.limit))
    // The usual price, when the Mart stocks it in this region at all.
    const usual = item.inShop && (!item.region || item.region === regionOf(save)) ? item.price : null
    out.push({ item, price: livePrice(row, item), usual, limit, bought, left: limit == null ? null : Math.max(0, limit - bought) })
  }
  return out
}

/**
 * Buys `qty` of a Special Shop item: within its limit, at its event price. A fossil goes to the Box like one bought
 * at the Mart. Null when it isn't sold here, the limit is reached or the purse is short.
 */
export function buyLiveItem(
  save: SaveData,
  data: GameData,
  live: LiveEvent | null,
  key: string,
  qty: number,
  now: number,
  newId: () => string = () => `fossil-${now}`,
): SaveData | null {
  const row = liveShopRows(save, data, live).find((r) => r.item.key === key)
  if (!row || !live || qty <= 0 || !Number.isInteger(qty)) return null
  if (row.left != null && qty > row.left) return null
  const cost = row.price * qty
  if (save.gold < cost) return null
  const bought = save.events?.liveBought ?? {}
  let next: SaveData = {
    ...save,
    gold: save.gold - cost,
    events: { ...save.events, liveBought: { ...bought, [live.id]: { ...bought[live.id], [key]: row.bought + qty } } },
  }
  if (row.item.effect.kind === 'fossil') {
    for (let i = 0; i < qty; i++) next = addFossil(next, row.item, data, now, newId())
    return next
  }
  return { ...next, inventory: { ...next.inventory, [key]: (next.inventory[key] ?? 0) + qty } }
}

// ------------------------------------------------------------------ the admin

/** How far ahead the admin's checks look at a recurring event's runs. */
const CHECK_YEARS = 2

/**
 * The run of another event that overlaps one of this event's, if any. Events may overlap (they add up), except two
 * Undergrounds: a player digs one at a time, with one team (the server keeps one running too).
 */
export function liveOverlap(list: readonly LiveEvent[], e: LiveEvent, now: number): LiveEvent | null {
  if (e.type !== 'underground') return null
  const from = e.repeat ? now : Math.min(now, at(e.start))
  const to = Math.max(now, e.repeat ? now : at(e.end)) + CHECK_YEARS * 366 * DAY
  const mine = liveRuns(e, from, to)
  for (const o of list) {
    if (o.id === e.id || o.type !== 'underground') continue
    for (const r of liveRuns(o, from, to)) if (mine.some((m) => at(r.start) < at(m.end) && at(m.start) < at(r.end))) return r
  }
  return null
}

const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/** What stops the admin from saving an event (empty = fine). */
export function liveProblems(list: readonly LiveEvent[], e: LiveEvent, data: GameData, now: number): string[] {
  const out: string[] = []
  const r = e.repeat
  if (!r && !(at(e.end) > at(e.start))) out.push('It ends before it starts.')
  if (r) {
    if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(r.time)) out.push('The start time isn’t a time (HH:MM).')
    const max = LIVE_REPEAT_MAX_HOURS[r.kind]
    if (!(r.hours >= 1 && r.hours <= max))
      out.push(r.kind === 'weekly' ? `A weekly event lasts 1 to ${max} hours (a week).` : `A yearly event lasts 1 to ${max} hours (31 days).`)
    if (r.kind === 'yearly' && !(r.month >= 1 && r.month <= 12 && r.day >= 1 && r.day <= (MONTH_DAYS[r.month - 1] ?? 0)))
      out.push('That date doesn’t exist.')
    if (r.kind === 'weekly' && !(r.weekday >= 0 && r.weekday <= 6)) out.push('No weekday picked.')
  }
  const clash = liveOverlap(list, e, now)
  if (clash)
    out.push(`It overlaps another Underground (${clash.start.slice(0, 16).replace('T', ' ')} → ${clash.end.slice(0, 16).replace('T', ' ')} UTC): one at a time.`)
  if (e.type === 'shiny') {
    if (!(e.shiny.multiplier >= 1)) out.push('The shiny multiplier is below 1.')
    if (e.shiny.scope === 'areas' && !e.shiny.areaIds.length) out.push('No area picked.')
    if (e.shiny.scope === 'region' && !e.shiny.regionId) out.push('No region picked.')
  }
  if (e.type === 'cash' && !(e.cash.multiplier > 1)) out.push('Cash Flow’s multiplier must be above 1.')
  if (e.type === 'shop') {
    if (!e.shop.items.length) out.push('The shop has no item.')
    for (const r of e.shop.items) if (!data.items[r.key]) out.push(`Unknown item: ${r.key}.`)
  }
  return out
}

/** The live events' pictures (public/backgrounds): one per type, one per occasion. */
export const LIVE_BANNERS = {
  shiny: '/backgrounds/live-shiny.png',
  cash: '/backgrounds/live-cash.png',
  underground: '/backgrounds/live-underground.png',
  halloween: '/backgrounds/live-halloween.png',
  winter: '/backgrounds/live-winter.png',
  newyear: '/backgrounds/live-newyear.png',
  spring: '/backgrounds/live-spring.png',
  summer: '/backgrounds/live-summer.png',
  celebration: '/backgrounds/live-celebration.png',
} as const

/** Each occasion's dates, as month * 100 + day (UTC), first match wins. */
const SEASONS: readonly { banner: keyof typeof LIVE_BANNERS; from: number; to: number }[] = [
  { banner: 'halloween', from: 1015, to: 1107 },
  { banner: 'winter', from: 1201, to: 1225 },
  { banner: 'newyear', from: 1226, to: 1231 },
  { banner: 'newyear', from: 101, to: 110 },
  { banner: 'spring', from: 301, to: 531 },
  { banner: 'summer', from: 601, to: 831 },
]

/** A type's own picture, outside the occasions; a Special Shop has none yet, so it's a celebration. */
const TYPE_BANNER: Record<LiveType, keyof typeof LIVE_BANNERS> = {
  shiny: 'shiny',
  cash: 'cash',
  underground: 'underground',
  shop: 'celebration',
}

/**
 * The picture an event gets until the admin picks one (the user's rule, 2026-10-31): the occasion of the day halfway
 * through it (a one-off's dates, a yearly one's date) wins, else its type's own. A weekly one comes back all year, so
 * no occasion fits it: its type's. The Underground is always its cave, the place players dig in.
 */
export function liveDefaultBanner(e: LiveEvent): string {
  const own = LIVE_BANNERS[TYPE_BANNER[e.type]]
  const r = e.repeat
  if (e.type === 'underground' || r?.kind === 'weekly') return own
  // A yearly one in a leap year, so its 29 February is a date.
  const start = r?.kind === 'yearly' ? Date.UTC(2028, r.month - 1, r.day) + repeatTime(r.time) : Date.parse(e.start)
  const length = r?.kind === 'yearly' ? runLength(r) : Date.parse(e.end) - start
  if (!Number.isFinite(start)) return own
  const mid = new Date(start + (Number.isFinite(length) && length > 0 ? length / 2 : 0))
  const md = (mid.getUTCMonth() + 1) * 100 + mid.getUTCDate()
  const occasion = SEASONS.find((s) => md >= s.from && md <= s.to)
  return occasion ? LIVE_BANNERS[occasion.banner] : own
}

/** A new event's settings: every type's defaults, so switching type in the admin starts from sensible numbers. */
export function newLiveEvent(id: string, start: string, end: string): LiveEvent {
  return {
    id,
    type: 'shiny',
    start,
    end,
    banner: '',
    repeat: null,
    title: {},
    minBadges: 3,
    shiny: { multiplier: 5, scope: 'all', areaIds: [], regionId: null },
    shop: { items: [] },
    cash: { multiplier: 1.5 },
  }
}
