// The General upgrades (docs/25): the Upgrades screen's third tab. Slow, very expensive upgrades bought with the ₽ of
// whichever region is being played and kept by the save for every region: Capture Luck, offline earnings and "I am
// just rich". The admin's switch (docs/15 §20) hides the tab and stops every effect; what was bought stays in the save.
import { eventOpenTo } from './events'
import { badgesHeld } from './liveEvents'
import { inWorldRegion } from './regions'
import type { GameData, GeneralConfig, GeneralSave, SaveData } from './types'

export const GENERAL_IDS = ['luck', 'offline', 'rich'] as const
export type GeneralId = (typeof GENERAL_IDS)[number]

const HOUR = 3_600_000

export const generalCfg = (data: GameData): GeneralConfig => data.config.general

/** The admin's switch: on for everyone, or for the admin only. */
export const generalOn = (data: GameData): boolean => eventOpenTo(data.config.general?.access, data)

export const generalOf = (save: Pick<SaveData, 'general'>): GeneralSave => save.general ?? {}

/** The level bought: 0 = none; "I am just rich" is 0 or 1. Past the admin's table it counts as its last row. */
export function generalLevel(save: Pick<SaveData, 'general'>, id: GeneralId, data: GameData): number {
  const g = generalOf(save)
  const raw = id === 'rich' ? (g.rich ? 1 : 0) : Math.floor(g[id] ?? 0)
  return Math.max(0, Math.min(generalMax(data, id), raw))
}

/** How many levels it has. */
export function generalMax(data: GameData, id: GeneralId): number {
  const c = generalCfg(data)
  return id === 'rich' ? 1 : (id === 'luck' ? c.luck : c.offline).length
}

/** The price of the next level, or null at the top. */
export function nextGeneralCost(
  save: Pick<SaveData, 'general'>,
  data: GameData,
  id: GeneralId,
): number | null {
  const lv = generalLevel(save, id, data)
  if (lv >= generalMax(data, id)) return null
  const c = generalCfg(data)
  const cost = id === 'rich' ? c.richCost : (id === 'luck' ? c.luck : c.offline)[lv]?.cost
  return cost == null ? null : Math.max(0, Math.round(cost))
}

/** Capture Luck at a level, 0–1 (level 0: none). */
export function luckAt(data: GameData, level: number): number {
  const row = level > 0 ? generalCfg(data).luck[Math.min(level, generalCfg(data).luck.length) - 1] : undefined
  return row ? Math.max(0, Math.min(1, row.chance / 100)) : 0
}

/** Offline earnings at a level, ₽ an hour (level 0: none). */
export function offlineAt(data: GameData, level: number): number {
  const row =
    level > 0 ? generalCfg(data).offline[Math.min(level, generalCfg(data).offline.length) - 1] : undefined
  return row ? Math.max(0, row.perHour) : 0
}

/**
 * Why the General tab can't sell here, or null: the switch, or a small world (its ₽ is the world's, docs/21). Each
 * save buys its own: an Extreme save's are its own too.
 */
export function generalClosed(save: SaveData, data: GameData): 'off' | 'world' | null {
  if (!generalOn(data)) return 'off'
  if (inWorldRegion(save, data)) return 'world'
  return null
}

/** Buy the next level with the live region's ₽. Null when it can't be bought (closed, maxed, too poor). */
export function buyGeneral(save: SaveData, data: GameData, id: GeneralId): SaveData | null {
  if (generalClosed(save, data)) return null
  const cost = nextGeneralCost(save, data, id)
  if (cost == null || save.gold < cost) return null
  const g = generalOf(save)
  const lv = generalLevel(save, id, data)
  const general: GeneralSave = id === 'rich' ? { ...g, rich: true } : { ...g, [id]: lv + 1 }
  return { ...save, gold: save.gold - cost, general }
}

// ---------------------------------------------------------------- Capture Luck

/**
 * The chance (0–1) that a wild Pokémon that broke free stays for one more throw. Wild Pokémon only — never a
 * legendary or a raid — and once per encounter: a second miss is a miss.
 */
export function captureLuck(
  save: Pick<SaveData, 'general'>,
  data: GameData,
  kind: 'wild' | 'boss',
  retried: boolean,
): number {
  if (kind !== 'wild' || retried || !generalOn(data)) return 0
  return luckAt(data, generalLevel(save, 'luck', data))
}

// ---------------------------------------------------------------- offline earnings

/** ₽ an hour the save earns while away (0 with the switch off or nothing bought). */
export function offlineRate(save: Pick<SaveData, 'general'>, data: GameData): number {
  return generalOn(data) ? offlineAt(data, generalLevel(save, 'offline', data)) : 0
}

/**
 * The page went hidden or closed at `now` (the server's time: the device's clock is never trusted). Only when the save
 * earns, and the first time: an absence already open keeps its start.
 */
export function markOfflineFrom(save: SaveData, data: GameData, now: number): SaveData {
  const g = generalOf(save)
  if (g.awayFrom != null || offlineRate(save, data) <= 0) return save
  return { ...save, general: { ...g, awayFrom: now } }
}

export interface OfflinePay {
  save: SaveData
  /** ₽ paid into the live region's wallet. */
  gold: number
  /** The time that counted (ms): the absence, capped at `offlineMaxHours`. */
  ms: number
  /** ₽ an hour it was paid at. */
  perHour: number
}

/**
 * Back at `now` (the server's time): the absence pays `offlineRate` × its hours, up to `offlineMaxHours`, into the live
 * region's wallet; the part of a ₽ left over waits for the next one. Inside a small world nothing is paid (its ₽ is
 * the world's): the absence stays open until the player is back in a region. Null when no absence is open.
 */
export function collectOffline(save: SaveData, data: GameData, now: number): OfflinePay | null {
  const g = generalOf(save)
  if (g.awayFrom == null || inWorldRegion(save, data)) return null
  const perHour = offlineRate(save, data)
  const ms = Math.max(0, Math.min(now - g.awayFrom, Math.max(0, generalCfg(data).offlineMaxHours) * HOUR))
  const earned = perHour > 0 ? (perHour * ms) / HOUR + (g.carry ?? 0) : 0
  const gold = Math.floor(earned + 1e-9)
  // Rounded so a save doesn't carry floating-point noise.
  const carry = Math.round((earned - gold) * 10_000) / 10_000
  const { awayFrom: _from, carry: _carry, ...rest } = g
  const general: GeneralSave = carry > 0 && carry < 1 ? { ...rest, carry } : rest
  return { save: { ...save, gold: save.gold + gold, general }, gold, ms, perHour }
}

// ---------------------------------------------------------------- "I am just rich"

/** This save's trainer shows a golden name (the switch on for whoever plays, and bought). */
export const isRich = (save: Pick<SaveData, 'general'>, data: GameData): boolean =>
  generalOn(data) && !!save.general?.rich

/**
 * The General tab's rules pop-up is due: the tab is open to this player, it hasn't been shown, and the player holds a
 * badge (a new trainer has the starting tutorials to read first, and nothing here to afford).
 */
export const generalRulesDue = (save: SaveData, data: GameData): boolean =>
  generalOn(data) && !save.general?.rulesSeen && !inWorldRegion(save, data) && badgesHeld(save, data) >= 1

export function markGeneralRulesSeen(save: SaveData): SaveData {
  return save.general?.rulesSeen ? save : { ...save, general: { ...generalOf(save), rulesSeen: true } }
}
