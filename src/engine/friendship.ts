// Friendship streaks and the Friend Market (docs/59). Two friends who interact on a UTC day (a raid beside the other's
// team, a trade between them, an Egg made with the other's Pokémon) keep a streak going; each new day of it pays both
// Festival Coins by the streak's tier, at most the day's cap across every friend. The coins buy from a weekly market.
// The server keeps the streaks, the wallet and the purchases (migration 0105); these functions read the admin's
// numbers, name the tiers, lay out the market and put what was bought in the save. The screens only say it.
import { eventOpenTo } from './events'
import { daysBetween } from './eventTime'
import { isExtreme } from './extreme'
import { parseGifts, placeGifts, type GiftLanded } from './gifts'
import { inWorldRegion } from './regions'
import type {
  FriendshipConfig,
  FriendshipSave,
  FriendshipTier,
  FriendMarketItem,
  GameData,
  Gift,
  SaveData,
} from './types'

/** Purchases remembered as put away in the save: a purchase handed back twice is never applied twice. */
const APPLIED_KEPT = 60
/** Egg reports waiting to reach the server, at most. */
const EGG_REPORTS_KEPT = 8

export type FriendshipKind = 'raid' | 'trade' | 'egg'

/** The admin's switch (docs/15 §20): on for everyone, or for the admin only. */
export const friendshipOn = (data: GameData): boolean => eventOpenTo(data.config.friendship?.access, data)

/** The tiers, cleaned: a whole first day from 1 and coins 0–99, each first day once, in order. Never empty. */
export function friendshipTiers(data: GameData): FriendshipTier[] {
  const raw = data.config.friendship?.tiers
  const out: FriendshipTier[] = []
  for (const t of Array.isArray(raw) ? raw : []) {
    if (!Number.isInteger(t?.from) || t.from < 1 || t.from > 9999) continue
    if (!Number.isInteger(t?.coins) || t.coins < 0 || t.coins > 99) continue
    if (out.some((o) => o.from === t.from)) continue
    out.push({ from: t.from, coins: t.coins })
  }
  out.sort((a, b) => a.from - b.from)
  return out.length ? out : [{ from: 1, coins: 0 }]
}

/** The coins a player can earn a UTC day, across every friend. */
export function friendshipCap(data: GameData): number {
  const cap = data.config.friendship?.dailyCap
  return Number.isInteger(cap) && cap! >= 0 ? cap! : 50
}

/** The tier a streak has reached: its index (0 = the first), what a day pays, and the next tier with the days to it. */
export interface StreakTier {
  level: number
  coins: number
  /** The first day of the next tier, and what it pays; null on the last. */
  next: FriendshipTier | null
  /** Days of streak still to go to the next tier. */
  toNext: number
}

export function streakTier(streak: number, data: GameData): StreakTier {
  const tiers = friendshipTiers(data)
  let level = 0
  tiers.forEach((t, i) => {
    if (t.from <= streak) level = i
  })
  const next = tiers[level + 1] ?? null
  return {
    level: streak < tiers[0]!.from ? -1 : level,
    coins: streak < tiers[0]!.from ? 0 : tiers[level]!.coins,
    next,
    toNext: next ? Math.max(0, next.from - streak) : 0,
  }
}

/** What one day of a streak this long pays (the server's friendship_coins_for). */
export const streakCoins = (streak: number, data: GameData): number => streakTier(streak, data).coins

/** A friend's streak as the server keeps it (friendship_status()). */
export interface FriendStreak {
  friend: string
  streak: number
  best: number
  /** The UTC day of the pair's last interaction (yyyy-mm-dd). */
  lastDay: string
  lastKind: FriendshipKind
}

/**
 * Where a streak stands on `today`: kept (they interacted today), waiting (yesterday: one interaction today keeps it),
 * or lost (a whole day went by: the next interaction starts again at day 1).
 */
export type StreakState = 'kept' | 'waiting' | 'lost'

export function streakState(
  s: Pick<FriendStreak, 'lastDay' | 'streak'> | undefined,
  today: string,
): StreakState {
  if (!s || s.streak < 1) return 'lost'
  const gap = daysBetween(s.lastDay, today)
  return gap <= 0 ? 'kept' : gap === 1 ? 'waiting' : 'lost'
}

/** The streak a friend shows today: its days while it's alive, 0 once lost. */
export const liveStreak = (s: FriendStreak | undefined, today: string): number =>
  s && streakState(s, today) !== 'lost' ? s.streak : 0

/** What the next interaction with this friend would pay, and how long the streak would be (null: already today). */
export function nextStreakDay(
  s: FriendStreak | undefined,
  today: string,
  data: GameData,
): { streak: number; coins: number } | null {
  const state = streakState(s, today)
  if (state === 'kept') return null
  const streak = state === 'waiting' ? s!.streak + 1 : 1
  return { streak, coins: streakCoins(streak, data) }
}

// ---------------------------------------------------------------- the market

/** The market's week: the Monday (UTC) of the day, as yyyy-mm-dd. */
export function marketWeek(day: string): string {
  const d = new Date(`${day}T00:00:00Z`)
  const back = (d.getUTCDay() + 6) % 7
  return new Date(d.getTime() - back * 86_400_000).toISOString().slice(0, 10)
}

/** When the market's week turns over (ms): the next Monday, 00:00 UTC. */
export const marketWeekEnds = (week: string): number => Date.parse(`${week}T00:00:00Z`) + 7 * 86_400_000

/** The shiny of the week: the pool's entry for the week's number, counted from Monday 5 January 1970 (as the server). */
export function marketShiny(week: string, data: GameData): number | null {
  const pool = (data.config.friendship?.shiny?.pool ?? []).filter((d) => Number.isInteger(d) && d > 0)
  if (!pool.length) return null
  const n = Math.floor(daysBetween('1970-01-05', week) / 7)
  return pool[((n % pool.length) + pool.length) % pool.length]!
}

export interface MarketRow {
  /** An item's key, or 'shiny'. */
  key: string
  kind: 'item' | 'pokemon'
  price: number
  /** The week's limit and what's left of it. */
  limit: number
  left: number
  dex?: number
  level?: number
}

/** The market's shelf this week: the shiny first, then the items as the admin listed them (known items only). */
export function marketRows(data: GameData, week: string, bought: Record<string, number> = {}): MarketRow[] {
  const cfg = data.config.friendship
  const rows: MarketRow[] = []
  const dex = marketShiny(week, data)
  const shiny = cfg?.shiny
  if (dex && shiny && shiny.price > 0 && data.species[dex]) {
    rows.push({
      key: 'shiny',
      kind: 'pokemon',
      price: shiny.price,
      limit: 1,
      left: Math.max(0, 1 - (bought.shiny ?? 0)),
      dex,
      level: Math.max(1, Math.min(100, shiny.level || 15)),
    })
  }
  for (const m of cfg?.market ?? []) {
    if (!data.items[m.key] || !(m.price > 0) || !(m.limit > 0) || rows.some((r) => r.key === m.key)) continue
    rows.push({
      key: m.key,
      kind: 'item',
      price: m.price,
      limit: m.limit,
      left: Math.max(0, m.limit - (bought[m.key] ?? 0)),
    })
  }
  return rows
}

/** Why a row can't be bought now, `qty` of it: sold out this week, or not enough coins. */
export function marketWhy(row: MarketRow, balance: number, qty = 1): 'soldOut' | 'tooPoor' | null {
  if (row.left < qty) return 'soldOut'
  if (balance < row.price * qty) return 'tooPoor'
  return null
}

/** The quantities offered for a row (×1, ×5, ×10 within what's left). */
export const marketQtys = (row: MarketRow): number[] => [1, 5, 10].filter((q) => q === 1 || q <= row.left)

/** The rules' numbers, for the rules card and INFO. */
export function friendshipNumbers(data: GameData) {
  return { tiers: friendshipTiers(data), cap: friendshipCap(data) }
}

// ---------------------------------------------------------------- the save

export const friendshipOf = (save: SaveData): FriendshipSave => save.friendship ?? {}

/** The market can't be used here: switched off, in Extreme mode, or inside a small world (nothing reaches it). */
export type FriendshipWait = 'off' | 'extreme' | 'world'

export function friendshipWaits(save: SaveData, data: GameData): FriendshipWait | null {
  if (!friendshipOn(data)) return 'off'
  if (isExtreme(save)) return 'extreme'
  if (inWorldRegion(save, data)) return 'world'
  return null
}

/** A purchase handed back by the server: its id and its gifts. */
export interface MarketBuy {
  id: string
  gifts: unknown
}

/**
 * Puts purchases in the save, each once (the save remembers the last ids it put away), where the gifts' rules place
 * them. Null when nothing was new.
 */
export function applyMarketBuys(
  save: SaveData,
  data: GameData,
  buys: readonly MarketBuy[],
  now: number,
  newId: () => string,
): { save: SaveData; landed: GiftLanded[]; ids: string[] } | null {
  const f = friendshipOf(save)
  const done = new Set(f.applied ?? [])
  const fresh = buys.filter((b) => !done.has(b.id))
  if (!fresh.length) return null
  const gifts: Gift[] = fresh.flatMap((b) => parseGifts(b.gifts))
  const placed = placeGifts(save, data, gifts, now, newId)
  const applied = [...(f.applied ?? []), ...fresh.map((b) => b.id)].slice(-APPLIED_KEPT)
  return {
    save: { ...placed.save, friendship: { ...friendshipOf(placed.save), applied } },
    landed: placed.landed,
    ids: buys.map((b) => b.id),
  }
}

export const friendshipRulesDue = (save: SaveData, data: GameData): boolean =>
  friendshipOn(data) && !friendshipOf(save).rulesSeen

export const markFriendshipRulesSeen = (save: SaveData): SaveData | null =>
  friendshipOf(save).rulesSeen ? null : { ...save, friendship: { ...friendshipOf(save), rulesSeen: true } }

/** An Egg made with a friend's Pokémon, waiting to be told to the server (by the friend's user id). */
export function queueEggReport(save: SaveData, friend: string): SaveData {
  const f = friendshipOf(save)
  const eggs = [...(f.eggs ?? []).filter((x) => x !== friend), friend].slice(-EGG_REPORTS_KEPT)
  return { ...save, friendship: { ...f, eggs } }
}

/** The reports told: they leave the queue. */
export function clearEggReports(save: SaveData, sent: readonly string[]): SaveData | null {
  const f = friendshipOf(save)
  if (!f.eggs?.length) return null
  const eggs = f.eggs.filter((x) => !sent.includes(x))
  return { ...save, friendship: { ...f, eggs: eggs.length ? eggs : undefined } }
}

/** The admin's market rows, cleaned for the editor: known keys, prices 1–99,999, limits 1–99. */
export function normaliseMarketItem(m: Partial<FriendMarketItem>): FriendMarketItem {
  const clamp = (n: unknown, lo: number, hi: number, d: number) =>
    typeof n === 'number' && Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : d
  return { key: String(m.key ?? ''), price: clamp(m.price, 1, 99_999, 10), limit: clamp(m.limit, 1, 99, 1) }
}

export type { FriendshipConfig }
