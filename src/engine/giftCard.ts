// The Gift card (docs/64 §4.0, the user's design of 2026-11-01): a card in an area's deck, in place of its item cards
// while the switch is on. A present appears at level 1; OPEN gives that level's reward, MAKE IT BIGGER grows it a level,
// but each tap may break it: a broken gift is a wild Pokémon of the area, fought and caught as any. Owning the helper
// (Delibird) makes every tap safer and adds a level on top. A boss marked `present` (Evergreen Hill's Delibird, §4.2)
// comes out of a present that only grows and bursts on its last tap. Every number and outcome is decided here; the
// screen plays them.
import { DEFAULT_CONFIG } from './defaults'
import { eventOpenTo } from './events'
import { MONEY } from './items'
import type { LiveSet } from './liveEvents'
import type { Rng } from './rng'
import { pickUpItem } from './run'
import {
  GIFT_REWARD_KINDS,
  type Area,
  type BossDef,
  type GameData,
  type GiftCardConfig,
  type GiftRewardPart,
  type SaveData,
} from './types'
import { worldOfArea } from './worldList'

const clamp = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback
}

export const giftCfg = (data: Pick<GameData, 'config'>): GiftCardConfig =>
  data.config.giftCard ?? DEFAULT_CONFIG.giftCard

/** Switched on for whoever is playing (docs/15 §20). Off: the item cards are dealt as before. */
export const giftOn = (data: GameData): boolean => eventOpenTo(data.config.giftCard?.access, data)

/**
 * This area deals Gift cards: the switch is on and its deck counts some. A broken gift is one of its wild Pokémon, so
 * an area without a wild pool deals none (its item cards stay).
 */
export const giftDealable = (data: GameData, area: Pick<Area, 'encounterWeights' | 'wildPool'>): boolean =>
  giftOn(data) && Math.round(Number(area.encounterWeights.gift) || 0) > 0 && area.wildPool.length > 0

// ---------------------------------------------------------------- the levels and their odds

/** Each level's break chance as the admin set it, cleaned: whole % from 0 to 100. */
const baseChances = (cfg: GiftCardConfig): number[] =>
  (Array.isArray(cfg.breakChances) ? cfg.breakChances : DEFAULT_CONFIG.giftCard.breakChances).map((c) =>
    clamp(c, 0, 100, 100),
  )

/** The helper's bonus, cleaned. */
export function giftHelper(cfg: GiftCardConfig): { dex: number; safer: number; extraLevels: number } {
  const d = DEFAULT_CONFIG.giftCard.helper
  const h = cfg.helper ?? d
  return {
    dex: clamp(h.dex, 0, 99999, d.dex),
    safer: clamp(h.safer, 0, 100, d.safer),
    extraLevels: clamp(h.extraLevels, 0, 5, d.extraLevels),
  }
}

/** The save owns the helper (Delibird): in its team or its Box. */
export const hasGiftHelper = (save: Pick<SaveData, 'box'>, cfg: GiftCardConfig): boolean => {
  const dex = giftHelper(cfg).dex
  return dex > 0 && save.box.some((p) => p.dex === dex)
}

/** The top level: it can't grow further. The level after the last break chance, plus the helper's extra levels. */
export const giftTop = (cfg: GiftCardConfig, helper: boolean): number =>
  baseChances(cfg).length + 1 + (helper ? giftHelper(cfg).extraLevels : 0)

/**
 * The % that a MAKE IT BIGGER tap at this level breaks the gift (0–100), or null at the top (it can't grow). Past the
 * admin's list a level breaks for sure (100), which the helper's bonus brings down: Delibird's level 5 is 80 %.
 */
export function giftBreakChance(cfg: GiftCardConfig, level: number, helper: boolean): number | null {
  if (level >= giftTop(cfg, helper)) return null
  const base = baseChances(cfg)[level - 1] ?? 100
  return helper ? Math.max(0, base - giftHelper(cfg).safer) : base
}

/**
 * The chance (0–1) of reaching each level by always tapping, from level 1 (always 1) to the top: the admin's view of the
 * numbers, and the balance test's.
 */
export function giftReachOdds(cfg: GiftCardConfig, helper: boolean): number[] {
  const top = giftTop(cfg, helper)
  const out = [1]
  for (let l = 1; l < top; l++) out.push(out[l - 1]! * (1 - (giftBreakChance(cfg, l, helper) ?? 100) / 100))
  return out
}

// ---------------------------------------------------------------- the rewards

/** One thing a gift gives: an item (its key) or Pokédollars (`money`), and how many. */
export interface GiftItem {
  key: string
  qty: number
}

const isKind = (k: unknown): k is GiftRewardPart['kind'] =>
  (GIFT_REWARD_KINDS as readonly unknown[]).includes(k)

/** The area's level for its ₽: the bottom of its range (the user's call). */
export const giftAreaLevel = (area: Pick<Area, 'minLevel'>): number => Math.max(1, Math.round(area.minLevel))

/**
 * The area's balls: the best of the admin's list that its finds hold (a Poké Ball when they hold none), and the next
 * one up (the same at the top of the list).
 */
export function giftBalls(
  area: Pick<Area, 'lootPool'>,
  data: Pick<GameData, 'items' | 'config'>,
): { ball: string; better: string } {
  const list = (giftCfg(data).balls ?? []).filter((k) => !!data.items[k])
  if (!list.length) return { ball: 'poke-ball', better: 'poke-ball' }
  const found = new Set(area.lootPool.filter((e) => e.weight > 0).map((e) => e.itemKey))
  let best = 0
  list.forEach((k, i) => {
    if (found.has(k)) best = i
  })
  return { ball: list[best]!, better: list[Math.min(list.length - 1, best + 1)]! }
}

/**
 * The evolution items the area's Mart sells: its small world's shop (docs/21), else the main Mart's (sold there, of its
 * region or every region's).
 */
export function giftEvolutionItems(area: Pick<Area, 'regionId'>, data: GameData): string[] {
  const stone = (k: string) => data.items[k]?.effect.kind === 'stone'
  const world = worldOfArea(data, area)
  if (world) return world.shop.map((r) => r.key).filter(stone)
  const region = area.regionId ?? 'kanto'
  return Object.values(data.items)
    .filter((i) => i.effect.kind === 'stone' && i.inShop && (!i.region || i.region === region))
    .map((i) => i.key)
}

/** One part of a reward as it lands in this area: what it is and how many. Null for an item the game doesn't have. */
export function giftPart(
  part: GiftRewardPart,
  area: Pick<Area, 'lootPool' | 'minLevel' | 'regionId'>,
  data: GameData,
  rng: Rng,
): GiftItem | null {
  if (!part || !isKind(part.kind)) return null
  const qty = Math.max(1, Math.round(Number(part.qty) || 1))
  switch (part.kind) {
    case 'ball':
      return { key: giftBalls(area, data).ball, qty }
    case 'betterBall':
      return { key: giftBalls(area, data).better, qty }
    case 'money':
      return { key: MONEY, qty: qty * giftAreaLevel(area) }
    case 'evolution': {
      const keys = giftEvolutionItems(area, data)
      // No evolution item sold here: a Revive, as the level's other option is.
      return keys.length ? { key: rng.pick(keys), qty } : data.items.revive ? { key: 'revive', qty } : null
    }
    case 'item':
      return part.key && data.items[part.key] ? { key: part.key, qty } : null
  }
}

/** A level's reward options (a level past the admin's list takes its last). */
const levelOptions = (cfg: GiftCardConfig, level: number): GiftRewardPart[][] => {
  const list =
    Array.isArray(cfg.rewards) && cfg.rewards.length ? cfg.rewards : DEFAULT_CONFIG.giftCard.rewards
  return (list[Math.min(level, list.length) - 1] ?? []).filter((o) => Array.isArray(o) && o.length > 0)
}

/** Each level's reward for this gift (first = level 1), one option drawn per level as it appears. */
export function drawGiftRewards(
  cfg: GiftCardConfig,
  top: number,
  area: Pick<Area, 'lootPool' | 'minLevel' | 'regionId'>,
  data: GameData,
  rng: Rng,
): GiftItem[][] {
  const out: GiftItem[][] = []
  for (let level = 1; level <= top; level++) {
    const options = levelOptions(cfg, level)
    const option = options.length ? rng.pick(options) : []
    out.push(option.map((p) => giftPart(p, area, data, rng)).filter((x): x is GiftItem => !!x))
  }
  return out
}

// ---------------------------------------------------------------- one gift

export interface GiftState {
  /** Its level, from 1. */
  level: number
  /** The top: a tap there does nothing (or, for a boss's present, bursts it). */
  top: number
  /** The player owns the helper (Delibird): every tap safer, one more level. */
  helper: boolean
  /** What OPEN gives at each level (first = level 1). Empty for a boss's present. */
  rewards: GiftItem[][]
  taps: number
  /** A boss's present (`BossDef.present`): only MAKE IT BIGGER; it bursts on the last tap. */
  boss?: { dex: number; level: number; shiny?: boolean }
  /** Null while it waits; then opened, broken (a wild Pokémon comes out) or burst (the boss comes out). */
  end: null | 'opened' | 'broken' | 'burst'
}

/** A Gift card's present, at level 1, its rewards drawn. */
export function startGift(
  save: Pick<SaveData, 'box'>,
  area: Pick<Area, 'lootPool' | 'minLevel' | 'regionId'>,
  data: GameData,
  rng: Rng,
): GiftState {
  const cfg = giftCfg(data)
  const helper = hasGiftHelper(save, cfg)
  const top = giftTop(cfg, helper)
  return { level: 1, top, helper, rewards: drawGiftRewards(cfg, top, area, data, rng), taps: 0, end: null }
}

/** The taps a boss's present takes to burst (the admin's, at least 1). */
export const giftBossTaps = (cfg: GiftCardConfig): number =>
  clamp(cfg.bossTaps, 1, 10, DEFAULT_CONFIG.giftCard.bossTaps)

/** A boss's present: it grows on each tap and bursts on the last one; nothing to open. */
export function startBossPresent(
  cfg: GiftCardConfig,
  boss: { dex: number; level: number; shiny?: boolean },
): GiftState {
  return {
    level: 1,
    top: giftBossTaps(cfg),
    helper: false,
    rewards: [],
    taps: 0,
    boss: { dex: boss.dex, level: boss.level, ...(boss.shiny && { shiny: true }) },
    end: null,
  }
}

/** This boss comes out of a present: marked so, and the Gift card is on for the player. */
export const bossInPresent = (data: GameData, boss: Pick<BossDef, 'present'> | null | undefined): boolean =>
  !!boss?.present && giftOn(data)

/** What a MAKE IT BIGGER tap did. */
export interface GiftStep {
  state: GiftState
  from: number
  to: number
  /** The break chance it was taken at (%), null for a boss's present (it never breaks before its last tap). */
  chance: number | null
  /** It broke: a wild Pokémon comes out. */
  broke: boolean
  /** A boss's present burst on its last tap. */
  burst: boolean
}

/**
 * MAKE IT BIGGER: one level up, unless the tap breaks it (its level's chance). At the top nothing happens (null). A
 * boss's present grows on every tap and bursts on the one at its top.
 */
export function growGift(state: GiftState, cfg: GiftCardConfig, rng: Rng): GiftStep | null {
  if (state.end) return null
  const taps = state.taps + 1
  if (state.boss) {
    const burst = state.level >= state.top
    const to = burst ? state.level : state.level + 1
    return {
      state: { ...state, level: to, taps, end: burst ? 'burst' : null },
      from: state.level,
      to,
      chance: null,
      broke: false,
      burst,
    }
  }
  const chance = giftBreakChance(cfg, state.level, state.helper)
  if (chance == null) return null
  const broke = rng.next() * 100 < chance
  const to = broke ? state.level : state.level + 1
  return {
    state: { ...state, level: to, taps, end: broke ? 'broken' : null },
    from: state.level,
    to,
    chance,
    broke,
    burst: false,
  }
}

/** What OPEN gives at the gift's level now. */
export const giftRewardAt = (state: GiftState, level = state.level): GiftItem[] =>
  state.rewards[level - 1] ?? []

/** OPEN: the gift is opened at its level (a boss's present can't be). Null once it's over. */
export function openGift(state: GiftState): GiftState | null {
  return state.end || state.boss ? null : { ...state, end: 'opened' }
}

/** An opened gift's reward goes into the bag (₽ into the purse), as a find of the area would. */
export function applyGiftOpen(
  save: SaveData,
  data: GameData,
  areaId: string,
  state: GiftState,
  now: number,
  newId: () => string,
  live: LiveSet = null,
): { save: SaveData; items: GiftItem[] } {
  if (state.end !== 'opened') return { save, items: [] }
  const items = giftRewardAt(state)
  let next = save
  for (const it of items)
    next = pickUpItem(next, areaId, { entryId: 'gift', itemKey: it.key, qty: it.qty }, data, now, newId, live)
  return { save: next, items }
}

// ---------------------------------------------------------------- its rules pop-up

/** Its rules pop-up is due: switched on for the player and not seen yet (the first gift shows it). */
export const giftCardRulesDue = (save: SaveData, data: GameData): boolean =>
  giftOn(data) && !save.giftCard?.rulesSeen

export function markGiftCardRulesSeen(save: SaveData): SaveData {
  return { ...save, giftCard: { ...save.giftCard, rulesSeen: true } }
}
