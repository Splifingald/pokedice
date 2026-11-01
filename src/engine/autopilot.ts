// Play styles and the autopilot (docs/36): Auto on explored areas, Idle. Which areas play themselves, and
// what the game does next while one does — every decision here, the screens only carry it out and pace it.
import { catchChance, catchValueOf } from './catching'
import { eventOpenTo } from './events'
import { centersOn } from './extreme'
import { boonCenters } from './extremeCenters'
import { ballBonus, isBallFor } from './items'
import { linearAreas } from './data'
import { nightmareModeOf } from './nightmareMode'
import { nightmareLock } from './nightmare'
import { portalModeOf } from './portalMode'
import { portalLock } from './portal'
import { timeRaceModeOf } from './timeRaceMode'
import { timeRaceLock } from './timeRace'
import { regionOfArea } from './regions'
import { hasAbleTeam, isAreaClosed, isAreaUnlocked, progressOf } from './run'
import {
  PLAY_STYLES,
  type Area,
  type GameData,
  type IdleDetour,
  type PlayStyle,
  type SaveData,
} from './types'
import { areaOpenAt } from './worldList'

export const isPlayStyle = (v: unknown): v is PlayStyle => PLAY_STYLES.includes(v as PlayStyle)

/** The two settings the autopilot reads: the style, and whether auto is engaged right now (the old auto-mode switch). */
export interface AutoSettings {
  playStyle?: PlayStyle
  autoMode?: boolean
}

/** The idle mode's switch (docs/15 §20): Off, the play styles are nowhere and auto-mode is what it always was. */
export const idleModeOn = (data: GameData): boolean => eventOpenTo(data.config.idleMode?.access, data)

/**
 * The player's style, "Auto on explored areas" unless Idle was picked: a new game, settings from before the styles
 * (their auto-mode switch lived in cleared areas, so on or off as it was) and the dropped Classic all read as it.
 */
export const playStyleOf = (s: AutoSettings): PlayStyle =>
  isPlayStyle(s.playStyle) ? s.playStyle : 'explored'

/**
 * The settings a style picks: Idle starts playing at once; Explored starts with auto off, waiting for the player to
 * switch it on in a cleared area.
 */
export const settingsForStyle = (style: PlayStyle): Required<AutoSettings> => ({
  playStyle: style,
  autoMode: style === 'idle',
})

/** What a run is: its area, and whether it is an Elite Rebattle (fights only, never on auto). */
export interface AutoRun {
  areaId: string | null
  rebattle?: unknown
}

/**
 * A portal run's, the nightmare's or the race's area (docs/28, docs/30, docs/61 §4.4): their own steps, so never the
 * autopilot's.
 */
const specialArea = (area: Area | undefined, data: GameData): boolean =>
  !!area && (!!portalModeOf(area, data) || !!nightmareModeOf(area, data) || !!timeRaceModeOf(area, data))

/**
 * Where the auto switch is offered (the area's header, a battle's extras). Off: cleared areas, as auto-mode always was.
 * On: Explored in cleared areas, Idle everywhere but the special areas.
 */
export function autoAvailable(
  save: SaveData,
  data: GameData,
  s: AutoSettings,
  areaId: string | null,
): boolean {
  if (!areaId) return false
  // Extreme mode's boon Centers (docs/47): every Center is a choice, so nothing plays itself there (the user's call,
  // 2026-10-28: no idle mode in Extreme).
  if (boonCenters(save, data)) return false
  // The race of time and space (docs/61 §4.4): auto-battle is off there, whatever the switch (the user's call,
  // 2026-11-01), so the clock means the same for everyone.
  if (timeRaceModeOf(data.areas.find((a) => a.id === areaId), data)) return false
  const cleared = progressOf(save, areaId).cleared
  if (!idleModeOn(data)) return cleared
  const style = playStyleOf(s)
  if (
    specialArea(
      data.areas.find((a) => a.id === areaId),
      data,
    )
  )
    return false
  return style === 'idle' || cleared
}

/**
 * How much of the run plays itself: 'off'; 'fights' (both sides of a fight, the rest by hand: auto-mode as it was,
 * while the switch is off); 'full' (the autopilot: fights, cards, the way between areas; only catches wait).
 */
export type AutoLevel = 'off' | 'fights' | 'full'

export function autoLevel(save: SaveData, data: GameData, s: AutoSettings, run: AutoRun): AutoLevel {
  if (!s.autoMode || !autoAvailable(save, data, s, run.areaId)) return 'off'
  // An Elite Rebattle has its own page between fights: its fights may play themselves, never the rest.
  return idleModeOn(data) && !run.rebattle ? 'full' : 'fights'
}

// ---------------------------------------------------------------- the way between areas

/** Somewhere the autopilot may go now: open, not closed, its date come, and not held elsewhere by a run. */
function enterable(save: SaveData, data: GameData, area: Area, now: number | null | undefined): boolean {
  if (!isAreaUnlocked(save, area.id, data) || isAreaClosed(save, area.id, data)) return false
  if (now !== undefined && !areaOpenAt(data, area.id, now)) return false
  if (specialArea(area, data)) return false
  const held = portalLock(save, data) ?? nightmareLock(save, data) ?? timeRaceLock(save, data)
  return !held || held.id === area.id
}

/** The area's place in its region's main chain (secret areas have none). */
function chainOf(data: GameData, areaId: string): { chain: Area[]; idx: number } {
  const area = data.areas.find((a) => a.id === areaId)
  const chain = area ? linearAreas(data, regionOfArea(area)) : []
  return { chain, idx: chain.findIndex((a) => a.id === areaId) }
}

/**
 * Where a round lost in `lostId` sends the autopilot: the area before it in the main chain, for one round, then back.
 * Lost during a detour, the detour starts over one area further back (back from there, it moves on again). The first
 * area, or a secret one, has nowhere before it: the same area again, no detour.
 */
export function retreatFrom(
  save: SaveData,
  data: GameData,
  lostId: string,
  now?: number | null,
): { areaId: string; detour: IdleDetour | null } {
  const { chain, idx } = chainOf(data, lostId)
  const prev = idx > 0 ? chain[idx - 1] : undefined
  if (!prev || !enterable(save, data, prev, now)) return { areaId: lostId, detour: null }
  return {
    areaId: prev.id,
    detour: { from: lostId, to: prev.id, rounds: progressOf(save, prev.id).roundsDone ?? 0 },
  }
}

/**
 * Between encounters, where the autopilot should be instead of `hereId`: back from a detour whose round is done, or (Idle
 * only) on to the next area of the chain once this one is cleared and the next is open. Auto on explored areas never
 * moves: it plays the area the player chose. Null: stay.
 */
export function autoTravel(
  save: SaveData,
  data: GameData,
  style: PlayStyle,
  hereId: string,
  now?: number | null,
): { areaId: string; detour: IdleDetour | null } | null {
  const d = save.idle?.detour
  if (d && d.to === hereId) {
    if ((progressOf(save, hereId).roundsDone ?? 0) <= d.rounds) return null
    const back = data.areas.find((a) => a.id === d.from)
    return { areaId: back && enterable(save, data, back, now) ? back.id : hereId, detour: null }
  }
  // Auto-mode stays in the area the player put it in (the user's call, 2026-10-27); only Idle moves on.
  if (style !== 'idle' || !progressOf(save, hereId).cleared) return null
  const { chain, idx } = chainOf(data, hereId)
  const next = idx >= 0 ? chain[idx + 1] : undefined
  if (!next || !enterable(save, data, next, now)) return null
  return { areaId: next.id, detour: null }
}

// ---------------------------------------------------------------- Idle's catches

/** The one ball Idle never throws, whatever the catch: the player keeps it for the catch they choose. */
export const MASTER_BALL = 'master-ball'

/** Idle's throw: the ball (null: none, the catch is certain without one) and its chance, as the catch panel shows it. */
export interface IdleThrow {
  ball: string | null
  chance: number
}

/**
 * Whether Idle leaves this Pokémon be. The Pokédex has one entry per species, shiny or not, and keeps no shiny record,
 * so a shiny counts as owned only while a shiny of its species is in the Box: one traded or released away is new again.
 */
export function idleOwns(save: Pick<SaveData, 'pokedex' | 'box'>, dex: number, shiny = false): boolean {
  return shiny ? save.box.some((m) => m.dex === dex && m.shiny) : save.pokedex.includes(dex)
}

/**
 * The ball Idle throws at this K.O.'d Pokémon (the user's rule, 2026-10-23), or null: no throw, it is left behind.
 *
 * - **Owned** (`idleOwns`): no throw, not even for a stronger copy. A plain one is owned once its species is in the
 *   Pokédex (a regional form is a species of its own, with its own entry, as the catch and the Pokédex count it); a
 *   shiny only once a shiny of that species is in this region's Box (the user's rule: a shiny isn't the same Pokémon).
 * - **Not owned**: among the balls held (one at least), the Master Ball aside, the highest chance by the catch's own
 *   formula (`catchChance`: the d6 plus the ball's bonus against the species' catch value — nothing else changes a
 *   throw), and among the balls tied at that chance the cheapest by its Mart price (then the weaker, then by key, so
 *   the pick never depends on the bag's order). The chances are the formula's exact value: two balls tie only when it
 *   gives both the same number, as it does for equal bonuses or once both are certain, so no tolerance is needed.
 * - **No ball needed** (certain with none, as the panel's CATCH): no ball, whatever the bag holds.
 * - No ball held, or none with any chance: no throw (a ball spent on a sure miss is a ball lost).
 */
export function chooseIdleBall(
  save: Pick<SaveData, 'pokedex' | 'inventory' | 'box'>,
  data: GameData,
  dex: number,
  shiny = false,
): IdleThrow | null {
  if (idleOwns(save, dex, shiny)) return null
  const value = catchValueOf(data, dex)
  const bare = catchChance(value, 0)
  if (bare >= 1) return { ball: null, chance: bare }
  const balls = Object.entries(save.inventory)
    .filter(([k, n]) => k !== MASTER_BALL && n > 0 && isBallFor(data.items[k], false))
    .map(([k]) => {
      const item = data.items[k]!
      return { k, price: item.price, bonus: ballBonus(item), chance: catchChance(value, ballBonus(item)) }
    })
    .sort((a, b) => b.chance - a.chance || a.price - b.price || a.bonus - b.bonus || a.k.localeCompare(b.k))
  const best = balls[0]
  return best && best.chance > 0 ? { ball: best.k, chance: best.chance } : null
}

// ---------------------------------------------------------------- what to do next

/**
 * On auto, the fights that still offer the choice of who goes out: a trainer's and a gym leader's (a player's
 * feedback, 2026-10-29: on auto there was no time to pick a Pokémon against a trainer). Their send-out step (a double
 * battle's card) shows, and its button loads and goes by itself after a moment with the first able Pokémon; a Pokémon
 * tapped holds it for the player's own tap. A wild Pokémon goes straight in.
 */
export const autoOffersLead = (kind: string | null | undefined): boolean => kind === 'trainer' || kind === 'gym'

/** The cards the autopilot leaves on the table: Trick or Treat (the player plays it), and a trainer's (`autoOffersLead`). */
export const pilotShowsCard = (kind: string | null | undefined): boolean => kind === 'trick' || autoOffersLead(kind)

/** What the run stands at, as the screens see it. */
export interface AutoView {
  phase:
    'idle' | 'preview' | 'battle' | 'catch' | 'victory' | 'center' | 'casino' | 'trick' | 'wipe' | 'stalemate'
  areaId: string
  /** The kind of card on the table (the preview). */
  encounter?: string | null
  /** A caught Pokémon waits on "Add to team?". */
  pendingCatch?: boolean
  /** A pop-up is open (a rules pop-up, a sheet the player opened): it has the player's attention. */
  held?: boolean
  /**
   * The catch on the panel: the K.O.'d Pokémon (its species) and where its throw stands — none yet, a Bait offered,
   * kept by Capture Luck for another throw, or done (caught or fled).
   */
  catch?: { dex: number; shiny?: boolean; throw: 'none' | 'bait' | 'stays' | 'done' }
}

/**
 * The autopilot's next move. It never uses an item (a Bait included), never changes the team (a Center heals and that's
 * all; "Add to team?" is answered no) and never plays the Game Corner. Idle throws its own balls (chooseIdleBall);
 * under Auto on explored areas a catch waits for the player. Trick or Treat always does.
 */
export type AutopilotStep =
  /**
   * Nothing to do now: a fight playing, the player's choice, a pop-up, everyone resting; 'result': a throw's
   * result on the panel, which the battle screen closes once it has been seen.
   */
  | { do: 'wait'; why: 'fight' | 'player' | 'held' | 'resting' | 'closed' | 'result' }
  /** Idle: throw this ball (null: none, the catch is certain without one). */
  | { do: 'throw'; ball: string | null }
  /** Idle: no throw (owned, or no ball held that could catch it): on to the result card, as a catch not on offer. */
  | { do: 'pass'; why: 'owned' | 'noBall' }
  /** Idle: the Bait offered after a short throw is kept (no items): the throw stands as it fell. */
  | { do: 'keepBait' }
  /** Idle: Capture Luck kept it on the spot: back to the ball, for the rule to pick again from what is left. */
  | { do: 'retry' }
  /** The next encounter, or the gym or legendary waiting (Home's CONTINUE). */
  | { do: 'continue' }
  /** Take the card on the table: fight it (default lead), pick it up, walk into the Center or the Game Corner. */
  | { do: 'engage' }
  /** Close the result card (and its evolutions) and go back on the trail; Idle sends a catch waiting there to the Box. */
  | { do: 'close' }
  /** Out of the Center (healed, no swaps), the Game Corner (no spin) or a stalemate. */
  | { do: 'leave' }
  /** Go to another area (`detour`: the save's new detour; null clears it). */
  | { do: 'travel'; areaId: string; detour: IdleDetour | null }
  /** A full K.O.: the wipe card skipped, on to `areaId`. */
  | { do: 'retreat'; areaId: string; detour: IdleDetour | null }
  /** A detour left behind (the player went somewhere else): forget it. */
  | { do: 'forget' }

export function autopilotStep(
  save: SaveData,
  data: GameData,
  style: PlayStyle,
  v: AutoView,
  now?: number | null,
): AutopilotStep {
  switch (v.phase) {
    case 'battle':
      return { do: 'wait', why: 'fight' }
    case 'catch':
      return style === 'idle' && v.catch ? idleCatchStep(save, data, v.catch) : { do: 'wait', why: 'player' }
    case 'trick':
      return { do: 'wait', why: 'player' }
    case 'preview':
      // Trick or Treat is a catch of its own: the player plays it. A trainer's card is the page's (pilotShowsCard).
      return pilotShowsCard(v.encounter) ? { do: 'wait', why: 'player' } : { do: 'engage' }
    case 'victory':
      // Idle changes no team: "Add to team?" is answered as CONTINUE answers it, to the Box.
      return v.pendingCatch && style !== 'idle' ? { do: 'wait', why: 'player' } : { do: 'close' }
    case 'center':
    case 'casino':
    case 'stalemate':
      return { do: 'leave' }
    case 'wipe':
      // Idle falls back a step to level up; auto-mode tries again where it is.
      return {
        do: 'retreat',
        ...(style === 'idle' ? retreatFrom(save, data, v.areaId, now) : { areaId: v.areaId, detour: null }),
      }
    case 'idle': {
      if (v.held) return { do: 'wait', why: 'held' }
      const d = save.idle?.detour
      if (d && d.to !== v.areaId) return { do: 'forget' }
      const go = autoTravel(save, data, style, v.areaId, now)
      if (go && go.areaId !== v.areaId) return { do: 'travel', ...go }
      if (go) return { do: 'forget' }
      if (!hasAbleTeam(save) && !centersOn(save, data)) return { do: 'wait', why: 'resting' }
      // A lair with nothing left in it (every legendary caught) and nowhere open past it.
      if (isAreaClosed(save, v.areaId, data)) return { do: 'wait', why: 'closed' }
      return { do: 'continue' }
    }
  }
}

/** Idle at the catch panel: its own throw, never a Bait, the next throw by the same rule after Capture Luck. */
function idleCatchStep(save: SaveData, data: GameData, c: NonNullable<AutoView['catch']>): AutopilotStep {
  switch (c.throw) {
    case 'bait':
      return { do: 'keepBait' }
    case 'stays':
      return { do: 'retry' }
    case 'done':
      return { do: 'wait', why: 'result' }
    case 'none': {
      if (idleOwns(save, c.dex, c.shiny)) return { do: 'pass', why: 'owned' }
      const pick = chooseIdleBall(save, data, c.dex, c.shiny)
      return pick ? { do: 'throw', ball: pick.ball } : { do: 'pass', why: 'noBall' }
    }
  }
}

/** The save with its detour set (or cleared, null). */
export function withDetour(save: SaveData, detour: IdleDetour | null): SaveData {
  const cur = save.idle?.detour ?? null
  if (!cur && !detour) return save
  const { detour: _old, ...rest } = save.idle ?? {}
  return { ...save, idle: detour ? { ...rest, detour } : rest }
}
