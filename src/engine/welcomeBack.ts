// Welcome-back gifts (docs/58-WELCOME-BACK.md): a player who comes back after days away finds a message from the
// developer carrying a gift, bigger the longer they were gone (by default 3, 7 and 14 days), at most once every 14 days.
// It is a developer's message like any other (docs/15 §23): the same pop-up, the same wrapped gift and opening, kept in
// My messages, opened only in the main game outside a small world.
//
// The server decides (migration 0103, welcome_back_claim): days away are counted on the days it has recorded the
// player playing (the analytics' player_days, their own calendar days), never on the device's clock, and the message
// is written there. These are the same rules in the game's terms: the admin's preview, the words of the message, and
// the tests that hold the engine and the SQL together.
import { eventOpenTo } from './events'
import { GIFT_MAX, giftsOn, parseGifts } from './gifts'
import type { GameData, WelcomeBackConfig, WelcomeBackTier } from './types'

/** At most this many tiers, each at most this many days away; the cooldown within the same bounds. */
export const WELCOME_BACK_TIERS_MAX = 6
export const WELCOME_BACK_DAYS_MAX = 365
export const WELCOME_BACK_COOLDOWN_DEFAULT = 14

/** The admin's switch (docs/15 §20): on for everyone, or for the admin only. */
export const welcomeBackOn = (data: GameData): boolean => eventOpenTo(data.config.welcomeBack?.access, data)

/**
 * A welcome back can be sent to this player: its switch and the gifts' are both on for them. The gift rides on a
 * message, and a message's gift is hidden while the gifts are off, so the server sends none then (0103).
 */
export const welcomeBackSends = (data: GameData): boolean => welcomeBackOn(data) && giftsOn(data)

const cfgOf = (src: GameData | Partial<WelcomeBackConfig> | undefined): Partial<WelcomeBackConfig> =>
  (src && 'config' in src ? src.config.welcomeBack : src) ?? {}

/**
 * The admin's tiers, cleaned as the server reads them: a whole number of days from 1 to 365, each number once (the
 * first kept), and 1–20 gifts that are all readable (one bad gift leaves its tier out, as the server's check does);
 * fewest days first, six at most.
 */
export function welcomeBackTiers(src: GameData | Partial<WelcomeBackConfig> | undefined): WelcomeBackTier[] {
  const raw = cfgOf(src).tiers
  const out: WelcomeBackTier[] = []
  for (const t of Array.isArray(raw) ? raw : []) {
    const minDays = (t as Partial<WelcomeBackTier> | null)?.minDays
    if (
      typeof minDays !== 'number' ||
      !Number.isInteger(minDays) ||
      minDays < 1 ||
      minDays > WELCOME_BACK_DAYS_MAX
    )
      continue
    if (out.some((o) => o.minDays === minDays)) continue
    const list = Array.isArray(t.gifts) ? t.gifts : []
    const gifts = parseGifts(list)
    if (!gifts.length || gifts.length !== list.length || list.length > GIFT_MAX) continue
    out.push({ minDays, gifts })
  }
  return out.sort((a, b) => a.minDays - b.minDays).slice(0, WELCOME_BACK_TIERS_MAX)
}

/** Days between two welcome backs: a whole number from 1 to 365 (14 when unset or not a number). */
export function welcomeBackCooldown(src: GameData | Partial<WelcomeBackConfig> | undefined): number {
  const v = cfgOf(src).cooldownDays
  if (typeof v !== 'number' || !Number.isFinite(v)) return WELCOME_BACK_COOLDOWN_DEFAULT
  return Math.max(1, Math.min(WELCOME_BACK_DAYS_MAX, Math.round(v)))
}

/** A calendar day, 'YYYY-MM-DD', as a count of days (so two can be subtracted); null when it isn't one. */
export function dayNumber(day: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!m) return null
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isFinite(t) ? Math.round(t / 86_400_000) : null
}

/** The highest tier `days` away reaches, or null below the first. */
export function welcomeBackTier(days: number, tiers: readonly WelcomeBackTier[]): WelcomeBackTier | null {
  let best: WelcomeBackTier | null = null
  for (const t of tiers) if (t.minDays <= days && (!best || t.minDays > best.minDays)) best = t
  return best
}

/** What the server knows of a player when they come back: every day is their own calendar day, 'YYYY-MM-DD'. */
export interface WelcomeBackHistory {
  /** Today, where the player is. */
  today: string
  /** The days they played (their account's and this device's): today's and any other may be among them. */
  played: readonly string[]
  /** The day the last welcome back was sent to them, or null for never. */
  lastClaim: string | null
}

export type WelcomeBackOutcome =
  /** Already sent today: the same answer again, and no second gift. */
  | { kind: 'same' }
  /** Nothing: a player with no earlier day, within the cooldown, away too short, or a day played after today. */
  | { kind: 'none'; reason: 'new' | 'cooldown' | 'short' | 'clock' }
  /** Send the gifts of `tier`: away `days` days (back the next day = 1). */
  | { kind: 'send'; days: number; tier: WelcomeBackTier }

/**
 * The rule, as welcome_back_claim (0103) applies it: the same day's claim answers again; then the cooldown since the last
 * one; a day played after today (the device's clock or zone moved back) gives nothing; days away are today minus the
 * last day played before today; only the highest tier reached is given.
 */
export function welcomeBackOutcome(
  h: WelcomeBackHistory,
  tiers: readonly WelcomeBackTier[],
  cooldownDays: number,
): WelcomeBackOutcome {
  const today = dayNumber(h.today)
  if (today == null) return { kind: 'none', reason: 'clock' }
  const claim = h.lastClaim == null ? null : dayNumber(h.lastClaim)
  if (claim != null) {
    if (claim === today) return { kind: 'same' }
    if (today < claim + cooldownDays) return { kind: 'none', reason: 'cooldown' }
  }
  const days = h.played.map(dayNumber).filter((d): d is number => d != null)
  if (days.some((d) => d > today)) return { kind: 'none', reason: 'clock' }
  const before = days.filter((d) => d < today)
  if (!before.length) return { kind: 'none', reason: 'new' }
  const away = today - Math.max(...before)
  const tier = welcomeBackTier(away, tiers)
  return tier ? { kind: 'send', days: away, tier } : { kind: 'none', reason: 'short' }
}

/** The welcome-back message's title, as the server writes it (the game shows its own words). */
export const WELCOME_BACK_TITLE = 'welcome_back'
const NOTE_PREFIX = '@welcome_back:'

/** The numbers the server puts in a welcome-back message; the game words them in the player's language. */
export interface WelcomeBackNote {
  /** Days away. */
  days: number
  /** The tier reached. */
  minDays: number
  /** The first tier's days then: "from 3 days away". */
  from: number
  /** The cooldown then. */
  cooldown: number
}

/** A welcome-back message's numbers (its `reply`), or null for any other message. */
export function welcomeBackNote(reply: string | null | undefined): WelcomeBackNote | null {
  if (!reply?.startsWith(NOTE_PREFIX)) return null
  try {
    const o = JSON.parse(reply.slice(NOTE_PREFIX.length)) as Record<string, unknown>
    const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : d)
    const days = num(o.days, 0)
    return {
      days,
      minDays: num(o.minDays, days),
      from: num(o.from, num(o.minDays, days)),
      cooldown: num(o.cooldown, WELCOME_BACK_COOLDOWN_DEFAULT),
    }
  } catch {
    return null
  }
}

/** The note as the server writes it (the kitchen sink and the tests write theirs the same way). */
export const welcomeBackReply = (note: WelcomeBackNote): string => `${NOTE_PREFIX}${JSON.stringify(note)}`
