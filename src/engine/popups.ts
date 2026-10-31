// The one-time pop-ups (docs/15 §20): which one is due now, in one place and one order. Each pop-up keeps its own rule
// (its *Due helper, in its feature's module); this only decides whose turn it is, so they queue rather than stack.
// Before, every pop-up carried its own hand-made list of the ones ahead of it, each a different subset: the battle
// powers' rules waited on the gifts' and Trick or Treat's, which only clear at the first gift or the first ghost, so
// with either switched on they never opened.
//
// The rules that open at their own moment (the gifts' before the first gift, Trick or Treat's at the first ghost, the
// portal's and the nightmare's on their way in, the looks' at the first open) aren't in the queue, and being due holds
// nothing back.
//
// Home's notices (`homeNotices`, below; docs/43 §7) took what never needed a pop-up over Home: what asks nothing of the
// player (Prof. Oak's leaderboard tip, his invite, Support me) and the opening of every feature with a page of its own
// (the Day Care, Versus, the special events, Trades, the General upgrades, the shiny and Unown Pokédexes, the invite
// rewards, the raid overhaul, the Underground), whose rules are now a card at the top of that page (`RulesCard`).
// Every "seen" flag stays where it was in the save.
import { calendarRulesDue } from './calendar'
import { dayCareTutorialDue, leaderboardTutorialDue } from './daycare'
import { donationDue } from './donation'
import { dayNightRulesDue } from './dayNight'
import { eventUnlockDue } from './events'
import { extremeRulesDue, isExtreme } from './extreme'
import { generalRulesDue } from './general'
import { friendshipRulesDue, friendshipWaits } from './friendship'
import { inviteRulesDue } from './invites'
import { liveList, livePopupDue, livesFor, type LiveSet } from './liveEvents'
import { powerRulesDue } from './powers'
import { raidOverhaulRulesDue } from './progressRaid'
import { inWorldRegion, regionOfferDue } from './regions'
import { badgeCase, portalRulesDue } from './run'
import { shinyDexRulesDue } from './shinyDex'
import { talentRulesDue } from './talents'
import { tradeRulesDue, tradesToWatch } from './trade'
import { diceTutorialDue } from './tutorial'
import { ugRulesDue } from './underground'
import { unownDexRulesDue } from './unownDex'
import { versusRulesDue } from './versus'
import { inWorld, worldByeDue, worldFinishPopupDue, worldFor, worldPopupDue } from './worlds'
import type { GameData, LiveEvent, SaveData } from './types'

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
  /** Prof. Oak's invite was closed already in this region, on this device (kept on the device): `homeNotices`. */
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
 * The live events whose pop-up still takes a turn in the queue: all but those with a page of their own, the
 * Underground and the gift calendar (docs/55), whose rules are on their page (docs/43 §7) and whose opening is a notice
 * on Home.
 */
export const queuedLives = (lives: LiveSet): LiveEvent[] =>
  liveList(lives).filter((e) => e.type !== 'underground' && e.type !== 'calendar')

/**
 * Every one-time pop-up, in the order they take the screen: what you came back to first, the messages, a new region,
 * then the rules of what has no page of its own as it opens, and the question about notifications last.
 */
const QUEUE = {
  /**
   * The dice tutorial (docs/46 §5), a new player's first steps: first, and it keeps the turn on every page it walks
   * them through, so nothing comes between its steps.
   */
  diceTutorial: { due: (s, d) => diceTutorialDue(s, d) },
  /** Extreme mode: what the team healed while the player was away. */
  away: { due: (_s, _d, c) => !!c.awayReport },
  /** The General upgrades: the gold earned while away. */
  offline: { due: (_s, _d, c) => !!c.offlineReport },
  /** The developer's answers (and the gifts they carry). */
  replies: { due: (_s, _d, c) => !!c.replies },
  /** What friends' raids left the player. */
  raidGifts: { due: (_s, _d, c) => !!c.raidGifts },
  /** The next region, once its league is won: only Home shows it (the Areas sheet's regions are there). */
  regionOffer: { due: (s, d) => !!regionOfferDue(s, d), away: (p) => p !== '/home' },
  extreme: { due: (s, d) => extremeRulesDue(s, d), away: under('/settings') },
  inviteReward: { due: (_s, _d, c) => !!c.inviteReward, away: under('/friends') },
  portal: { due: (s, d) => !!portalRulesDue(s, d), away: (p) => p === '/area' },
  dayNight: { due: (s, d) => dayNightRulesDue(s, d) },
  /** Mega Evolution, Gigantamax and Z-Moves, each once its badge is won. */
  powers: { due: (s, d) => !!powerRulesDue(s, d) },
  /** Hidden talents (docs/51), as the switch opens them. */
  talents: { due: (s, d) => talentRulesDue(s, d) },
  /** A small world has opened (the player outside it). */
  world: {
    due: (s, d, c) => !inWorld(s, d) && worldPopupDue(s, worldFor(s, d, c.now)),
    away: under('/shop'),
  },
  /** Everything in the world is done: finish it early? */
  worldFinish: { due: (s, d, c) => worldFinishPopupDue(s, d, c.now) },
  /** A world has closed. */
  worldBye: { due: (s, d, c) => !!worldByeDue(s, d, c.now) },
  /** A live event runs (but the Underground: `queuedLives`). */
  live: { due: (s, d, c) => livePopupDue(s, queuedLives(livesFor(s, d, c.now))), away: under('/shop') },
  /** A listing the player posted was taken: its scene plays on Home. */
  tradeScene: {
    due: (s, d, c) => !!c.online && !isExtreme(s) && !inWorldRegion(s, d) && tradesToWatch(s).length > 0,
    away: (p) => p !== '/home',
  },
  /** Push notifications' question, once a page has asked it. */
  push: { due: (_s, _d, c) => !!c.pushAsking },
} satisfies Record<string, Entry>

/**
 * The rules pop-ups that left the queue for their page's `RulesCard` (docs/43 §7). Never due: the ids stay only so the
 * pop-ups that asked for these turns still compile until their pages drop them.
 */
export type RetiredPopup =
  | 'dayCare'
  | 'leaderboard'
  | 'donation'
  | 'event'
  | 'versus'
  | 'share'
  | 'trades'
  | 'general'
  | 'shinyDex'
  | 'unownDex'
  | 'raidRules'

export type OneTimePopup = keyof typeof QUEUE | RetiredPopup

/** The queue's order, first to last. */
export const ONE_TIME_POPUPS = Object.keys(QUEUE) as (keyof typeof QUEUE)[]

const ready = (id: OneTimePopup, save: SaveData, data: GameData, ctx: PopupContext): boolean => {
  const e: Entry | undefined = (QUEUE as Record<string, Entry>)[id]
  return !!e && !e.away?.(ctx.path) && e.due(save, data, ctx)
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

/** What Home's notices need beyond the save: the invite's mark on the device, the account, the server's clock. */
export interface NoticeContext {
  shareSeen?: boolean
  signedIn?: boolean
  now?: number | null
}

/**
 * Home's notices (docs/43 §7), in the order Home shows them: each feature with a page of its own as it opens (until its
 * page's rules card is read: the feature's own "seen" flag), then what asks nothing of the player. The flags are the
 * pop-ups' own (`dayCare.visited`, `versusRulesSeen`, `events.seen`, `trades.rulesSeen`, `general.rulesSeen`,
 * `shinyDexSeen`, `unownDexSeen`, `invites.rulesSeen`, `friendship.rulesSeen`, `events.raidRulesSeen`, `underground.rulesSeen`,
 * `events.calendarRulesSeen`, `leaderboardVisited`, `donationSeen`, the invite's per-region mark on the device).
 */
const NOTICES = {
  /** The Day Care, at its catches (Prof. Oak's tutorial was its rules). → /daycare */
  dayCare: (s: SaveData, d: GameData) => dayCareTutorialDue(s, d),
  /** A special event opened (`eventUnlockDue` names which). → /events/{id} */
  event: (s: SaveData, d: GameData) => !!eventUnlockDue(s, d),
  /** Versus, at three Pokémon at Lv.50. → /versus */
  versus: (s: SaveData, d: GameData) => versusRulesDue(s, d),
  /** Trades, for an account. → /trades */
  trades: (s: SaveData, d: GameData, c: NoticeContext) => !!c.signedIn && tradeRulesDue(s, d),
  /** The General upgrades (and the Shiny Charm among them). → the Mart's Upgrades */
  general: (s: SaveData, d: GameData) => generalRulesDue(s, d),
  /** The shiny Pokédex, at the first league beaten. → the Pokédex's shiny view */
  shinyDex: (s: SaveData, d: GameData) => shinyDexRulesDue(s, d),
  /** The Unown Pokédex, once an area where Unown live is opened. → the Pokédex's Unown view */
  unownDex: (s: SaveData, d: GameData) => unownDexRulesDue(s, d),
  /** The invite rewards. → /friends */
  invites: (s: SaveData, d: GameData) => inviteRulesDue(s, d),
  /** Friendship streaks and the Friend Market (docs/57), for an account in the main game. → /friends */
  friendship: (s: SaveData, d: GameData, c: NoticeContext) =>
    !!c.signedIn && friendshipRulesDue(s, d) && !friendshipWaits(s, d),
  /** The raid overhaul's rules (docs/40), once a raid is open with it on. → /events/raid */
  raidRules: (s: SaveData, d: GameData) => raidOverhaulRulesDue(s, d),
  /** The Underground, while its live event runs. → /underground */
  underground: (s: SaveData, d: GameData, c: NoticeContext) => ugRulesDue(s, d, c.now ?? null),
  /** A gift calendar, while one runs, until its page's rules card is read (docs/55). → /calendar */
  calendar: (s: SaveData, d: GameData, c: NoticeContext) => calendarRulesDue(s, d, c.now ?? null),
  /** Prof. Oak's leaderboard tip, from the first badge (after the Day Care's). → /leaderboard */
  leaderboard: (s: SaveData, d: GameData) => leaderboardTutorialDue(s, d),
  /** Prof. Oak's invite, at a region's 2nd badge (INVITE shares the link). */
  share: (s: SaveData, d: GameData, c: NoticeContext) =>
    !c.shareSeen && badgeCase(s, d).filter((b) => b.earned).length >= SHARE_PROMPT_BADGES,
  /** Support me, once per region at its 5th badge (SUPPORT ME opens its three asks). */
  donation: (s: SaveData, d: GameData) => donationDue(s, d),
} satisfies Record<string, (s: SaveData, d: GameData, c: NoticeContext) => boolean>

export type HomeNotice = keyof typeof NOTICES

/** Every notice in the order Home shows them. */
export const HOME_NOTICES = Object.keys(NOTICES) as HomeNotice[]

/** The notices due now, first to show first. A card in the page interrupts nothing, so none waits for a calm moment. */
export function homeNotices(save: SaveData | null, data: GameData, ctx: NoticeContext): HomeNotice[] {
  if (!save) return []
  return HOME_NOTICES.filter((id) => NOTICES[id](save, data, ctx))
}
