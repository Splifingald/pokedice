// Global messages (docs/69-GLOBAL-MESSAGES.md): the developer writes once, in Admin › Messages, a title, words (links
// and YouTube videos welcome: lib/richText.ts) and, if they like, gifts for everyone, for every player or only those
// holding so many badges, every region's together. Each player who qualifies finds it as a developer's message (docs/15
// §23: the gift under it, My messages, the Inbox count), and it pops up on Home. No switch, no rules and no INFO: the
// user's call, 2026-11-08.
//
// The server decides (migration 0143, broadcast_claim): it writes the player's copy of every message running that
// their badges reach, once. These are the same rules in the game's terms: the badge range, the limits the
// admin's form keeps to, and the tests that hold the engine and the SQL together.
import { isExtreme } from './extreme'
import { badgesHeld } from './liveEvents'
import type { GameData, SaveData } from './types'

export const BROADCAST_TITLE_MAX = 120
export const BROADCAST_BODY_MAX = 4000
/** A badge bound is a whole number from 0 to this (every region's badges together stay far below). */
export const BROADCAST_BADGES_MAX = 999

/** Who a message goes to: at least `minBadges` badges, and at most `maxBadges` when set (every region's together). */
export interface BroadcastAudience {
  minBadges: number
  maxBadges: number | null
}

/** This many badges are within the message's range (both ends included). */
export const broadcastReaches = (a: BroadcastAudience, badges: number): boolean =>
  badges >= a.minBadges && (a.maxBadges == null || badges <= a.maxBadges)

/** The range is one the server takes: whole numbers 0–999, the most no lower than the least. */
export const broadcastAudienceOk = (a: BroadcastAudience): boolean =>
  Number.isInteger(a.minBadges) &&
  a.minBadges >= 0 &&
  a.minBadges <= BROADCAST_BADGES_MAX &&
  (a.maxBadges == null ||
    (Number.isInteger(a.maxBadges) && a.maxBadges >= a.minBadges && a.maxBadges <= BROADCAST_BADGES_MAX))

/**
 * The game asks the server for the messages this player is owed from the main save: the Extreme save's badges aren't
 * the player's own count (they get theirs back in the main game). No switch: the user's call, 2026-11-08.
 */
export const broadcastsAsk = (save: SaveData): boolean => !isExtreme(save)

/** The badges the game tells the server: every region's, live and parked (the trainer card's count). */
export const broadcastBadges = (save: SaveData, data: GameData): number =>
  Math.min(BROADCAST_BADGES_MAX, badgesHeld(save, data))
