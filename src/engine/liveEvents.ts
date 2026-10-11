// Live events (docs/20): the whole game changes for a while, the same for every player, scheduled by the admin
// (game_config `liveEvents`). One runs at a time:
//  - a Shiny Parade: wild Pokémon's shiny odds × n, in some areas, one region or everywhere;
//  - a Special Shop: items at a special price, items the Mart never sells, some limited per player;
//  - Cash Flow: every ₽ earned × n (selling excluded, so buying and selling back never pays).
// Time is the server's (store/serverTime): it starts and ends at the same moment for everyone; while the time is
// unknown, no event runs. A player sees it, and gets it, from the event's badge count on.
import { addFossil } from './fossils'
import { sellPrice } from './items'
import { regionCases, regionOf, regionOfArea } from './regions'
import type { Area, GameData, ItemDef, LiveEvent, LiveShopItem, SaveData, WheelReward } from './types'

const at = (iso: string): number => Date.parse(iso)

/** An event as the admin saved it, every type's settings filled in (a row from an older admin may miss some). */
export function normaliseLiveEvent(raw: Partial<LiveEvent>): LiveEvent {
  const d = newLiveEvent(String(raw.id ?? ''), String(raw.start ?? ''), String(raw.end ?? ''))
  return {
    ...d,
    ...raw,
    title: { ...raw.title },
    shiny: { ...d.shiny, ...raw.shiny, areaIds: raw.shiny?.areaIds ?? [] },
    shop: { items: raw.shop?.items ?? [] },
    cash: { ...d.cash, ...raw.cash },
  } as LiveEvent
}
const LISTS = new WeakMap<object, LiveEvent[]>()

/** The admin's live events, past, running and to come. */
export function liveEvents(data: GameData): LiveEvent[] {
  const raw = data.config.liveEvents?.list ?? []
  let list = LISTS.get(raw)
  if (!list) LISTS.set(raw, (list = raw.map((e) => normaliseLiveEvent(e))))
  return list
}

/** Where an event stands at `now`: before its start, running (start included, end excluded) or over. */
export function liveState(e: Pick<LiveEvent, 'start' | 'end'>, now: number): 'scheduled' | 'live' | 'ended' {
  const s = at(e.start)
  const end = at(e.end)
  if (!Number.isFinite(s) || !Number.isFinite(end) || end <= s) return 'ended'
  return now < s ? 'scheduled' : now < end ? 'live' : 'ended'
}

/** The event running at that server time; null when none is, or while the time is unknown. */
export function liveEventAt(data: GameData, now: number | null): LiveEvent | null {
  if (now == null) return null
  return liveEvents(data).find((e) => liveState(e, now) === 'live') ?? null
}

/** Badges held in every region: a live event shows from its own count of them. */
export const badgesHeld = (save: SaveData, data: GameData): number => regionCases(save, data).reduce((n, r) => n + r.earned, 0)

/** The event running for this player: running, and they have its badges. Its effects follow the same rule. */
export function liveFor(save: SaveData, data: GameData, now: number | null): LiveEvent | null {
  const e = liveEventAt(data, now)
  return e && badgesHeld(save, data) >= e.minBadges ? e : null
}

/** Time left (ms), and the share of the event still to come (1 → 0), for the timer and its gauge. */
export function liveLeft(e: Pick<LiveEvent, 'start' | 'end'>, now: number): { ms: number; share: number } {
  const s = at(e.start)
  const end = at(e.end)
  const ms = Math.max(0, end - now)
  return { ms, share: end > s ? Math.min(1, ms / (end - s)) : 0 }
}

// ------------------------------------------------------------------ the pop-up (once per event)

/** Its pop-up is due: running for this player, and not shown yet. */
export const livePopupDue = (save: SaveData, live: LiveEvent | null): boolean => !!live && !(save.events?.liveSeen ?? []).includes(live.id)

/** The pop-up was shown. Only the last 50 ids are kept: an old event never comes back. */
export function markLiveSeen(save: SaveData, live: LiveEvent): SaveData {
  const seen = save.events?.liveSeen ?? []
  if (seen.includes(live.id)) return save
  return { ...save, events: { ...save.events, liveSeen: [...seen, live.id].slice(-50) } }
}

// ------------------------------------------------------------------ Cash Flow

/** × every ₽ earned while Cash Flow runs (never below 1). */
export const cashMultiplier = (live: LiveEvent | null | undefined): number =>
  live?.type === 'cash' ? Math.max(1, Number(live.cash?.multiplier) || 1) : 1

/** ₽ earned, with Cash Flow's share: `amount` is what's paid, `bonus` the part Cash Flow added (0 without it). */
export function earnedGold(base: number, live: LiveEvent | null | undefined): { amount: number; bonus: number } {
  const b = Math.max(0, Math.round(base))
  const amount = Math.round(b * cashMultiplier(live))
  return { amount, bonus: amount - b }
}

/** The Fortune Wheel's prize as paid: its ₽ under Cash Flow (an item stays as it is). */
export const cashReward = (r: WheelReward, live: LiveEvent | null | undefined): WheelReward =>
  r.kind === 'gold' ? { kind: 'gold', amount: earnedGold(r.amount, live).amount } : r

// ------------------------------------------------------------------ Shiny Parade

/** The Shiny Parade covers this area: every area, its region, or one of its areas. */
export function liveCovers(live: LiveEvent | null | undefined, area: Area | undefined): boolean {
  if (!live || live.type !== 'shiny' || !area || !live.shiny) return false
  const s = live.shiny
  if (s.scope === 'all') return true
  if (s.scope === 'region') return !!s.regionId && regionOfArea(area) === s.regionId
  return s.areaIds.includes(area.id)
}

/** × the wild shiny odds in this area (1 when the parade doesn't cover it). */
export const shinyBoost = (live: LiveEvent | null | undefined, area: Area | undefined): number =>
  liveCovers(live, area) ? Math.max(1, Number(live!.shiny.multiplier) || 1) : 1

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

/** The event of the list that overlaps this one, if any: one runs at a time. */
export function liveOverlap(list: readonly LiveEvent[], e: LiveEvent): LiveEvent | null {
  const s = at(e.start)
  const end = at(e.end)
  return list.find((o) => o.id !== e.id && at(o.start) < end && s < at(o.end)) ?? null
}

/** What stops the admin from saving an event (empty = fine). */
export function liveProblems(list: readonly LiveEvent[], e: LiveEvent, data: GameData): string[] {
  const out: string[] = []
  if (!(at(e.end) > at(e.start))) out.push('It ends before it starts.')
  const clash = liveOverlap(list, e)
  if (clash) out.push(`It overlaps another live event (${clash.start.slice(0, 16)} → ${clash.end.slice(0, 16)} UTC).`)
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

/** A new event's settings: every type's defaults, so switching type in the admin starts from sensible numbers. */
export function newLiveEvent(id: string, start: string, end: string): LiveEvent {
  return {
    id,
    type: 'shiny',
    start,
    end,
    banner: '',
    title: {},
    minBadges: 3,
    shiny: { multiplier: 5, scope: 'all', areaIds: [], regionId: null },
    shop: { items: [] },
    cash: { multiplier: 1.5 },
  }
}
