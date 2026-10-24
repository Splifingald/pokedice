// The one-time pop-ups (docs/15 §20): which one is due now, in one place and one order. Each pop-up keeps its own rule
// (its *Due helper, in its feature's module); this only decides whose turn it is, so they queue rather than stack.
// Before, every pop-up carried its own hand-made list of the ones ahead of it, each a different subset: the battle
// powers' rules waited on the gifts' and Trick or Treat's, which only clear at the first gift or the first ghost, so
// with either switched on they never opened.
//
// The rules that open at their own moment (the gifts' before the first gift, Trick or Treat's at the first ghost, the
// portal's and the nightmare's on their way in, the looks' at the first open) aren't in the queue, and being due holds
// nothing back.
import { dayCareTutorialDue, leaderboardTutorialDue } from './daycare'
import { donationDue } from './donation'
import { dayNightRulesDue } from './dayNight'
import { eventUnlockDue } from './events'
import { extremeRulesDue, isExtreme } from './extreme'
import { generalRulesDue } from './general'
import { inviteRulesDue } from './invites'
import { livePopupDue, livesFor } from './liveEvents'
import { powerRulesDue } from './powers'
import { raidOverhaulRulesDue } from './progressRaid'
import { inWorldRegion, regionOfferDue } from './regions'
import { badgeCase, portalRulesDue } from './run'
import { tradeRulesDue, tradesToWatch } from './trade'
import { versusRulesDue } from './versus'
import { inWorld, worldByeDue, worldFinishPopupDue, worldFor, worldPopupDue } from './worlds'
import type { GameData, SaveData } from './types'

/** Prof. Oak's invite comes once per region, at its 2nd badge. */
export const SHARE_PROMPT_BADGES = 2

/** What the engine can't know: the screen, the account, the clock, and what waits outside the save. */
export interface PopupContext {
  /** Between fights: no encounter under way (`run.phase === 'idle'`), no battle, no full-screen moment on screen. */
  calm: boolean
  /** The page open (its path): a pop-up never opens over the page it leads to. */
  path: string
  /** Signed in to the online service: Trades and the invite rewards are only there for an account. */
  signedIn: boolean
  /** The online service is set up (the trades' scene needs it). */
  online?: boolean
  /** The server's time, null until known: the small worlds and live events run on it. */
  now: number | null
  /** Prof. Oak's invite was closed already in this region, on this device (it's kept on the device, not the save). */
  shareSeen?: boolean
  /** Extreme mode's "while you were away" report is waiting. */
  awayReport?: boolean
  /** The General upgrades' "while you were away" report is waiting. */
  offlineReport?: boolean
  /** The developer's answers, or gifts in their messages, not seen or opened yet. */
  replies?: boolean
  /** Gifts friends' raids left, collected and not shown yet. */
  raidGifts?: boolean
  /** An invite reward is ready to open, and wasn't put off this visit. */
  inviteReward?: boolean
  /** Push notifications' question was asked by a page, and waits for its turn. */
  pushAsking?: boolean
  /** The pop-up on screen now: it keeps its turn while it is still due, rather than give way to one that just came. */
  showing?: OneTimePopup | null
}

interface Entry {
  due: (save: SaveData, data: GameData, ctx: PopupContext) => boolean
  /** The pages it doesn't open on: the one it leads to (whose own page explains it), or the only one it opens on. */
  away?: (path: string) => boolean
}

const under = (prefix: string) => (path: string) => path === prefix || path.startsWith(`${prefix}/`)

/**
 * Every one-time pop-up, in the order they take the screen. The order is the one the pop-ups kept by hand, made one:
 * what you came back to first, then Prof. Oak's tutorials, the messages, the developer's ask, a new region, then each
 * feature's rules as it opens, and the question about notifications last.
 */
const QUEUE = {
  /** Extreme mode: what the team healed while the player was away. */
  away: { due: (_s, _d, c) => !!c.awayReport },
  /** The General upgrades: the gold earned while away. */
  offline: { due: (_s, _d, c) => !!c.offlineReport },
  dayCare: { due: (s, d) => dayCareTutorialDue(s, d), away: (p) => p === '/daycare' },
  leaderboard: { due: (s, d) => leaderboardTutorialDue(s, d), away: (p) => p === '/leaderboard' },
  /** The developer's answers (and the gifts they carry). */
  replies: { due: (_s, _d, c) => !!c.replies },
  /** What friends' raids left the player. */
  raidGifts: { due: (_s, _d, c) => !!c.raidGifts },
  /** Support me, once per region at its 5th badge. */
  donation: { due: (s, d) => donationDue(s, d) },
  /** The next region, once its league is won: only Home shows it (the Areas sheet's regions are there). */
  regionOffer: { due: (s, d) => !!regionOfferDue(s, d), away: (p) => p !== '/home' },
  event: { due: (s, d) => !!eventUnlockDue(s, d), away: under('/events') },
  versus: { due: (s, d) => versusRulesDue(s, d), away: under('/versus') },
  /** Prof. Oak's invite, at a region's 2nd badge. */
  share: {
    due: (s, d, c) => !c.shareSeen && badgeCase(s, d).filter((b) => b.earned).length >= SHARE_PROMPT_BADGES,
  },
  extreme: { due: (s, d) => extremeRulesDue(s, d), away: under('/settings') },
  trades: { due: (s, d, c) => c.signedIn && tradeRulesDue(s, d), away: under('/trades') },
  general: { due: (s, d) => generalRulesDue(s, d), away: under('/upgrades') },
  invite: { due: (s, d, c) => c.signedIn && inviteRulesDue(s, d), away: under('/friends') },
  inviteReward: { due: (_s, _d, c) => !!c.inviteReward, away: under('/friends') },
  portal: { due: (s, d) => !!portalRulesDue(s, d), away: (p) => p === '/area' },
  dayNight: { due: (s, d) => dayNightRulesDue(s, d) },
  /** Mega Evolution, Gigantamax and Z-Moves, each once its badge is won. */
  powers: { due: (s, d) => !!powerRulesDue(s, d) },
  /** The raid overhaul's rules (docs/39), once a raid is open with it on. */
  raidRules: { due: (s, d) => raidOverhaulRulesDue(s, d) },
  /** A small world has opened (the player outside it). */
  world: {
    due: (s, d, c) => !inWorld(s, d) && worldPopupDue(s, worldFor(s, d, c.now)),
    away: under('/shop'),
  },
  /** Everything in the world is done: finish it early? */
  worldFinish: { due: (s, d, c) => worldFinishPopupDue(s, d, c.now) },
  /** A world has closed. */
  worldBye: { due: (s, d, c) => !!worldByeDue(s, d, c.now) },
  /** A live event runs (the Underground's pop-up is its rules). */
  live: { due: (s, d, c) => livePopupDue(s, livesFor(s, d, c.now)), away: under('/shop') },
  /** A listing the player posted was taken: its scene plays on Home. */
  tradeScene: {
    due: (s, d, c) => !!c.online && !isExtreme(s) && !inWorldRegion(s, d) && tradesToWatch(s).length > 0,
    away: (p) => p !== '/home',
  },
  /** Push notifications' question, once a page has asked it. */
  push: { due: (_s, _d, c) => !!c.pushAsking },
} satisfies Record<string, Entry>

export type OneTimePopup = keyof typeof QUEUE

/** The queue's order, first to last. */
export const ONE_TIME_POPUPS = Object.keys(QUEUE) as OneTimePopup[]

const ready = (id: OneTimePopup, save: SaveData, data: GameData, ctx: PopupContext): boolean => {
  const e: Entry = QUEUE[id]
  return !e.away?.(ctx.path) && e.due(save, data, ctx)
}

/**
 * The one-time pop-up due now, or null: only between fights, one at a time, the first in the queue's order that is due
 * and isn't kept off this page. The one already on screen keeps its turn while it's still due.
 */
export function nextOneTimePopup(
  save: SaveData | null,
  data: GameData,
  ctx: PopupContext,
): OneTimePopup | null {
  if (!save || !ctx.calm) return null
  if (ctx.showing && ready(ctx.showing, save, data, ctx)) return ctx.showing
  return ONE_TIME_POPUPS.find((id) => ready(id, save, data, ctx)) ?? null
}
