// Friend invite rewards (docs/15 §25): every new player someone invites with their invite link who goes on to win their
// first badge fills that player's gauge, and each tier the gauge reaches gives its gifts once — by default a Rare Candy,
// then ₽1,000, a shiny Ditto and a Master Ball. The server counts the invites and hands each tier over once (migration
// 0051); these functions read the admin's tiers, place the gauge, and put the gifts away (engine/gifts.ts decides where
// each one lands). The screens only say it.
import { eventOpenTo } from './events'
import { isExtreme } from './extreme'
import { parseGifts, placeGifts, type GiftLanded } from './gifts'
import { inWorldRegion } from './regions'
import type { GameData, Gift, InviteTier, InvitesSave, SaveData } from './types'

/** At most this many stops on the gauge (they share a phone's width), each at most this many friends. */
export const INVITE_TIERS_MAX = 6
export const INVITE_FRIENDS_MAX = 99
/** Tiers remembered as opened in the save. */
const DONE_KEPT = 100

/** The admin's switch (docs/15 §20): on for everyone, or for the admin only. */
export const inviteRewardsOn = (data: GameData): boolean =>
  eventOpenTo(data.config.inviteRewards?.access, data)

/**
 * The admin's tiers, cleaned: a whole number of friends from 1 to 99, each number once (the first kept), with at least
 * one gift the game can read; fewest friends first, six at most.
 */
export function inviteTiers(data: GameData): InviteTier[] {
  const raw = data.config.inviteRewards?.tiers
  const out: InviteTier[] = []
  for (const t of Array.isArray(raw) ? raw : []) {
    const friends = t?.friends
    if (
      typeof friends !== 'number' ||
      !Number.isInteger(friends) ||
      friends < 1 ||
      friends > INVITE_FRIENDS_MAX
    )
      continue
    if (out.some((o) => o.friends === friends)) continue
    const gifts = parseGifts(t.gifts)
    if (gifts.length) out.push({ friends, gifts })
  }
  return out.sort((a, b) => a.friends - b.friends).slice(0, INVITE_TIERS_MAX)
}

/** What the server says about the player's invites (invite_status(), migration 0051). */
export interface InviteStatus {
  /** Players they invited who have won their first badge: the gauge. */
  count: number
  /** Players they invited who haven't yet. */
  pending: number
  /** The tiers already handed over, by their number of friends. */
  claimed: number[]
  /** The last invited player to win their first badge. */
  latest: { name: string; avatar: string } | null
}

export type InviteTierState = 'claimed' | 'ready' | 'locked'

export interface InviteGaugeTier extends InviteTier {
  state: InviteTierState
}

/** The gauge as the screens draw it. */
export interface InviteGauge {
  count: number
  pending: number
  /** The last tier's number of friends: the gauge is full there. */
  goal: number
  /** How far the fill reaches, 0–1: the stops are evenly spaced, and the fill moves evenly between two of them. */
  fill: number
  tiers: InviteGaugeTier[]
  /** Tiers reached and not handed over yet: their gifts wait to be opened. */
  ready: InviteGaugeTier[]
  /** The next tier still to reach, and how many more friends it needs. */
  next: InviteGaugeTier | null
  toNext: number
}

/** Where the fill reaches with `count` friends, the stops evenly spaced from the start of the track (0) to its end. */
export function inviteFill(count: number, tiers: readonly { friends: number }[]): number {
  if (!tiers.length || count <= 0) return 0
  let prev = 0
  for (let i = 0; i < tiers.length; i++) {
    const at = tiers[i]!.friends
    if (count < at) return (i + (count - prev) / (at - prev)) / tiers.length
    prev = at
  }
  return 1
}

export function inviteGauge(status: InviteStatus | null, data: GameData): InviteGauge {
  const count = Math.max(0, status?.count ?? 0)
  const claimed = status?.claimed ?? []
  const tiers = inviteTiers(data).map((t): InviteGaugeTier => ({
    ...t,
    // A tier handed over stays so even if the count went down since (an invited player deleted their data).
    state: claimed.includes(t.friends) ? 'claimed' : count >= t.friends ? 'ready' : 'locked',
  }))
  const next = tiers.find((t) => t.state === 'locked') ?? null
  return {
    count,
    pending: Math.max(0, status?.pending ?? 0),
    goal: tiers[tiers.length - 1]?.friends ?? 0,
    fill: inviteFill(count, tiers),
    tiers,
    ready: tiers.filter((t) => t.state === 'ready'),
    next,
    toNext: next ? next.friends - count : 0,
  }
}

/** Why invite rewards can't be opened in this save right now, and wait on the server (as the developer's gifts do). */
export type InvitesWait = 'off' | 'extreme' | 'world'

export function invitesWait(save: SaveData, data: GameData): InvitesWait | null {
  if (!inviteRewardsOn(data)) return 'off'
  if (isExtreme(save)) return 'extreme'
  if (inWorldRegion(save, data)) return 'world'
  return null
}

export const invitesOf = (save: SaveData): InvitesSave => save.invites ?? { done: [] }

/**
 * A tier's gifts go into the save, once (engine/gifts.ts places each). Null when this tier's gifts are in the save
 * already.
 */
export function applyInviteReward(
  save: SaveData,
  data: GameData,
  friends: number,
  gifts: readonly Gift[],
  now: number,
  newId: () => string,
): { save: SaveData; landed: GiftLanded[] } | null {
  if (invitesOf(save).done.includes(friends)) return null
  const { save: next, landed } = placeGifts(save, data, gifts, now, newId)
  const inv = invitesOf(next)
  return { save: { ...next, invites: { ...inv, done: [friends, ...inv.done].slice(0, DONE_KEPT) } }, landed }
}

/**
 * The rules pop-up opens by itself once, the first time the player opens the Friends page with the rewards open to
 * this save (docs/15 §20; never over another page: the user's call, 2026-10-25).
 */
export const inviteRulesDue = (save: SaveData, data: GameData): boolean =>
  invitesWait(save, data) === null && !invitesOf(save).rulesSeen

export const markInviteRulesSeen = (save: SaveData): SaveData =>
  invitesOf(save).rulesSeen ? save : { ...save, invites: { ...invitesOf(save), rulesSeen: true } }
