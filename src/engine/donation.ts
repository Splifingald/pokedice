// "Support me": the developer's pop-up (Discord, invite, Ko-fi) behind the SUPPORT ME button. It also opens by itself
// (the user's rule, 2026-11-06): from the player's 4th session (after the third), with a badge won, on Home only, once
// the session has run 5 minutes, at most once a day. The sessions and the day it last showed are kept on the device
// (lib/supportSession.ts); the rule and its numbers are here.
import { regionCases } from './regions'
import type { GameData, SaveData } from './types'

/** Sessions the player must have finished first: it opens from the next one (the 4th). */
export const SUPPORT_AFTER_SESSIONS = 3
/** How long the session must have run before it opens (ms): never on arrival. */
export const SUPPORT_SESSION_DELAY_MS = 5 * 60_000
/** Badges won, all regions together, before it ever opens. */
export const SUPPORT_MIN_BADGES = 1
/** Away from the game this long (ms), the next visit is a new session; a reload or a short break carries on. */
export const SESSION_GAP_MS = 30 * 60_000

/** A web address the Ko-fi (or Discord) button may open (nothing else: no javascript: or data: links). */
export const isDonationUrl = (url: string): boolean => /^https?:\/\/\S+$/i.test(url.trim())

/** The Ko-fi link, when it is a web address the button may open; null otherwise. */
export function donationUrl(data: GameData): string | null {
  const url = String(data.config.donation.kofiUrl ?? '').trim()
  return isDonationUrl(url) ? url : null
}

/** Switched on in Admin with a usable link: only then does the pop-up (or the Settings button) exist. */
export const donationEnabled = (data: GameData): boolean => data.config.donation.enabled && !!donationUrl(data)

/** The player's sessions on this device, and the day the pop-up last opened (their local 'YYYY-MM-DD'). */
export interface SupportSession {
  /** Sessions started, this one included. */
  count: number
  /** When this session started (ms). */
  startedAt: number
  /** The last moment the game was seen open (ms): a gap longer than `SESSION_GAP_MS` starts a new session. */
  lastSeen: number
  /** The local day the pop-up last opened by itself (or SUPPORT ME was closed); null when never. */
  shownDay: string | null
}

/** The session at `now`: this one carried on, or a new one after a long enough gap (the first one, with none yet). */
export function touchSession(prev: SupportSession | null, now: number): SupportSession {
  if (!prev) return { count: 1, startedAt: now, lastSeen: now, shownDay: null }
  // A clock moved back counts as a break too: a new session rather than one that would never reach its 5 minutes.
  if (now - prev.lastSeen > SESSION_GAP_MS || now < prev.lastSeen) {
    return { ...prev, count: prev.count + 1, startedAt: now, lastSeen: now }
  }
  return { ...prev, lastSeen: now }
}

/** Badges won, every region together (parked regions too). */
const badgesWon = (save: SaveData, data: GameData): number =>
  regionCases(save, data).reduce((n, r) => n + r.earned, 0)

/**
 * The pop-up opens by itself now: switched on with a link, a badge won, past the third session, 5 minutes into this
 * one, and not yet today. Home only and between fights: the pop-ups' queue (engine/popups.ts) sees to those.
 */
export function supportPopupDue(
  save: SaveData,
  data: GameData,
  session: SupportSession | null | undefined,
  now: number,
  today: string,
): boolean {
  if (!session || !donationEnabled(data)) return false
  if (session.count <= SUPPORT_AFTER_SESSIONS) return false
  if (now - session.startedAt < SUPPORT_SESSION_DELAY_MS) return false
  if (session.shownDay === today) return false
  return badgesWon(save, data) >= SUPPORT_MIN_BADGES
}
