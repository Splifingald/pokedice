// The Safari (docs/61 §4): a secret area of its own, off the main road, where nobody battles. Its wild cards are Safari
// encounters: Trick or Treat's gauge (trickOrTreat.ts) with Bait for the Treat and the Safari Ball for the Trick Ball,
// with the Safari's own numbers. No Pokémon Center is dealt there (nothing hurts), no XP or ₽ is won, and its rounds
// are paid for as they're dealt: the first ones in each Safari area free, then `roundPrice` ₽ each. Off, a Safari area
// is still a secret area, its cards fought as wild Pokémon.
import { DEFAULT_CONFIG } from './defaults'
import { eventOpenTo } from './events'
import {
  TRICK_TIERS,
  type Area,
  type AreaProgress,
  type GameData,
  type SafariConfig,
  type SaveData,
  type TrickOrTreatConfig,
  type TrickTier,
  type LureTheme,
} from './types'

export const safariCfg = (data: Pick<GameData, 'config'>): SafariConfig => data.config.safari ?? DEFAULT_CONFIG.safari

/** Switched on for whoever is playing (docs/15 §20). */
export const safariOn = (data: GameData): boolean => eventOpenTo(data.config.safari?.access, data)

/** A Safari area, whatever its switch. */
export const isSafariArea = (area: Pick<Area, 'mode'> | null | undefined): boolean => area?.mode?.kind === 'safari'

/** This area deals Safari encounters now: a Safari, its switch on for the player. */
export const safariDealable = (data: GameData, area: Pick<Area, 'mode'> | null | undefined): boolean =>
  isSafariArea(area) && safariOn(data)

/** The numbers the gauge plays by, for a theme: the Safari's or Trick or Treat's. */
export const lureCfg = (data: Pick<GameData, 'config'>, theme?: LureTheme): TrickOrTreatConfig =>
  theme === 'safari' ? safariCfg(data) : (data.config.trickOrTreat ?? DEFAULT_CONFIG.trickOrTreat)

/** A catch value's tier: 1–3 common, 4–5 rare, 6 and up very rare (Chansey), as their Safari odds were. */
export const tierFromCatchValue = (catchValue: number): TrickTier =>
  catchValue >= 6 ? 'veryRare' : catchValue >= 4 ? 'rare' : 'common'

const isTier = (t: unknown): t is TrickTier => (TRICK_TIERS as readonly unknown[]).includes(t)

/** A Pokémon's tier in this Safari: the admin's for the area when set, else from its catch value. */
export function safariTier(data: GameData, areaId: string, dex: number): TrickTier {
  const set = safariCfg(data).areas?.[areaId]?.find((g) => g?.dex === dex)?.tier
  return isTier(set) ? set : tierFromCatchValue(data.species[dex]?.catchValue ?? 1)
}

const whole = (v: unknown, fallback: number) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

/** The next draw here deals a new Safari round: no deck in play, the switch on. */
export const safariRoundDue = (data: GameData, area: Area, progress: AreaProgress): boolean =>
  safariDealable(data, area) && !progress.deck?.length

/** What the next round here costs: 0 mid-round, while free rounds are left, or anywhere but a Safari. */
export function safariRoundPrice(data: GameData, area: Area, progress: AreaProgress): number {
  if (!safariRoundDue(data, area, progress)) return 0
  const cfg = safariCfg(data)
  const free = whole(cfg.freeRounds, DEFAULT_CONFIG.safari.freeRounds)
  return (progress.safariRounds ?? 0) < free ? 0 : whole(cfg.roundPrice, DEFAULT_CONFIG.safari.roundPrice)
}

/**
 * The round about to be dealt is begun: its price paid from the region's ₽ and counted. Null when the purse is short;
 * the save as it was when no round is due.
 */
export function startSafariRound(save: SaveData, data: GameData, area: Area): SaveData | null {
  const progress = save.areaProgress[area.id]
  // An area never entered has no progress yet (run.ts's emptyProgress, written out: run.ts imports this file's users).
  const p: AreaProgress = progress ?? { roundsDone: 0, cleared: false, bossDefeated: false, bossesDefeated: [], gymsDefeated: [] }
  if (!safariRoundDue(data, area, p)) return save
  const price = safariRoundPrice(data, area, p)
  if (save.gold < price) return null
  return {
    ...save,
    gold: save.gold - price,
    areaProgress: { ...save.areaProgress, [area.id]: { ...p, safariRounds: (p.safariRounds ?? 0) + 1 } },
  }
}

/** Its rules pop-up is due: switched on for the player and not seen yet (the first Safari encounter shows it). */
export const safariRulesDue = (save: SaveData, data: GameData): boolean => safariOn(data) && !save.safari?.rulesSeen

export function markSafariRulesSeen(save: SaveData): SaveData {
  return { ...save, safari: { ...save.safari, rulesSeen: true } }
}
