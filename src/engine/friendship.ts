// Friendship streaks and the Friend Market (docs/60). Two friends who interact on a UTC day (a raid beside the other's
// team, a trade between them, an Egg made with the other's Pokémon) keep a streak going; each new day of it pays both
// Heart Scales by the streak's tier, at most the day's cap across every friend. The coins buy from a weekly market.
// The server keeps the streaks, the wallet and the purchases (migration 0107); these functions read the admin's
// numbers, name the tiers, lay out the market and put what was bought in the save. The screens only say it.
import { eventOpenTo } from './events'
import { daysBetween } from './eventTime'
import { isExtreme } from './extreme'
import { parseGifts, placeGifts, type GiftLanded } from './gifts'
import { regionBestLevel, releaseWorldHome, speciesHome, worldHomers } from './homecoming'
import { createInstance } from './progression'
import { inWorldRegion, regionOf } from './regions'
import type { Rng } from './rng'
import { isStarterFamily, rollTalentFor, talentsOn, wildTalentChance } from './talents'
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

/** The player's best streak still alive today (kept or waiting), across every friend: the Friend Ball reads it. */
export const bestLiveStreak = (streaks: readonly FriendStreak[] | undefined, today: string): number =>
  Math.max(0, ...(streaks ?? []).map((s) => liveStreak(s, today)))

// ---------------------------------------------------------------- the Friend Ball

/** A ball that boosts the hidden talent's chance on its catch (the Friend Ball). */
export const isTalentBall = (
  item: { effect: { kind: string; talentBoost?: boolean } } | undefined,
): boolean => item?.effect.kind === 'ball' && !!item.effect.talentBoost

/**
 * The Friend Ball's boost for the player's best live streak: the tier's (×1 on days 0–3, ×2 on 4–7, ×3 on 8–14, ×4 on
 * 15–30, ×5 from 31 by default); ×1 with no streak or with the switch off.
 */
export function friendBallBoost(streak: number, data: GameData): number {
  if (!friendshipOn(data)) return 1
  const boosts = data.config.friendship?.ballBoost ?? []
  const v = Number(boosts[Math.max(0, streakTier(streak, data).level)])
  return Number.isFinite(v) && v >= 1 ? Math.min(20, v) : 1
}

/**
 * A catch with the Friend Ball: does the Pokémon come out carrying its hidden talent? One that carried it already
 * does. Otherwise a second draw makes the whole chance the wild odds × `boost` (it was met at the wild odds once):
 * (min(1, w × boost) − w) / (1 − w). Never a starter line's, never with hidden talents off, nothing drawn at ×1.
 */
export function friendBallTalent(
  data: GameData,
  dex: number,
  carried: boolean,
  boost: number,
  rng: Rng,
): boolean {
  if (carried) return true
  if (!friendBallHelps(data, dex, carried, boost)) return false
  const w = wildTalentChance(data)
  return rng.next() < (Math.min(1, w * boost) - w) / (1 - w)
}

/** The Friend Ball's boost can still do something for this Pokémon (it doesn't carry its talent, it could). */
export const friendBallHelps = (data: GameData, dex: number, carried: boolean, boost: number): boolean =>
  !carried && boost > 1 && talentsOn(data) && !isStarterFamily(data, dex) && wildTalentChance(data) < 1

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
 * Puts purchases in the save, each once (the save remembers the last ids it put away). Items go where the gifts' rules
 * place them (the Bag of the region being played). A Pokémon goes to its species' own region (Togepi to Johto) and
 * waits there on the regions' waiting list (engine/homecoming.ts), locked until one of the player's Pokémon there
 * reaches its level — or until that region is started; with one there at its level already, it arrives at once.
 * Null when nothing was new.
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
  const placed = placeGifts(
    save,
    data,
    gifts.filter((g) => g.kind !== 'pokemon'),
    now,
    newId,
  )
  let next = placed.save
  const landed = [...placed.landed]
  for (const gift of gifts) {
    if (gift.kind !== 'pokemon' || !data.species[gift.dex]) continue
    const inst = createInstance(gift.dex, gift.level, data, newId(), now)
    if (gift.shiny) inst.shiny = true
    // Its family's hidden talent, at the wild odds (docs/51), as any gift.
    if (rollTalentFor(data, inst.dex, inst.id)) inst.talent = true
    const region = speciesHome(data, gift.dex)
    const dexThere = region === regionOf(next) ? next.pokedex : (next.parked?.[region]?.pokedex ?? [])
    const waiting: SaveData = {
      ...next,
      events: { ...next.events, worldHome: [...worldHomers(next), { inst, region, market: true }] },
    }
    const released = releaseWorldHome(waiting, data)
    next = released.save
    const arrived = released.arrived.find((a) => a.inst.id === inst.id)
    landed.push({
      gift,
      region: arrived?.region ?? region,
      moved: false,
      ...(arrived ? { isNew: !dexThere.includes(gift.dex) } : { locked: true }),
    })
  }
  const applied = [...(f.applied ?? []), ...fresh.map((b) => b.id)].slice(-APPLIED_KEPT)
  return {
    save: { ...next, friendship: { ...friendshipOf(next), applied } },
    landed,
    ids: buys.map((b) => b.id),
  }
}

/** Where the shiny of the week would go now: its species' region, and whether it would wait there, locked. */
export function marketShinyHome(save: SaveData, data: GameData, dex: number, level: number) {
  const region = speciesHome(data, dex)
  return { region, locked: regionBestLevel(save, data, region) < level }
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
