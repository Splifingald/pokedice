// Play styles and the autopilot (docs/36): Classic, Auto on explored areas, Idle. Which areas play themselves, and
// what the game does next while one does — every decision here, the screens only carry it out and pace it.
import { eventOpenTo } from './events'
import { centersOn } from './extreme'
import { linearAreas } from './data'
import { nightmareModeOf } from './nightmareMode'
import { nightmareLock } from './nightmare'
import { portalModeOf } from './portalMode'
import { portalLock } from './portal'
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
 * The player's style. Settings from before the styles have none: their auto-mode switch lived in cleared areas, which
 * is "Auto on explored areas", so that is what they keep (on or off as it was).
 */
export const playStyleOf = (s: AutoSettings): PlayStyle =>
  isPlayStyle(s.playStyle) ? s.playStyle : 'explored'

/**
 * The settings a style picks: Idle starts playing at once; the other two start with auto off (Explored waits for the
 * player to switch it on in a cleared area, Classic has none).
 */
export const settingsForStyle = (style: PlayStyle): Required<AutoSettings> => ({
  playStyle: style,
  autoMode: style === 'idle',
})

/** The styles a new game asks about, in order: none while the switch is off (a new game starts as it always did). */
export const playStylesOffered = (data: GameData): PlayStyle[] => (idleModeOn(data) ? [...PLAY_STYLES] : [])

/** A new game asks first only when there is a choice to make. */
export const newGameAsksStyle = (data: GameData): boolean => playStylesOffered(data).length > 1

/** The rules pop-up (docs/15 §20) is due: switched on for the player, never shown (a new game's question shows them). */
export const idleRulesDue = (save: SaveData, data: GameData): boolean =>
  idleModeOn(data) && !save.idle?.rulesSeen

export function markIdleRulesSeen(save: SaveData): SaveData {
  return save.idle?.rulesSeen ? save : { ...save, idle: { ...save.idle, rulesSeen: true } }
}

/** What a run is: its area, and whether it is an Elite Rebattle (fights only, never on auto). */
export interface AutoRun {
  areaId: string | null
  rebattle?: unknown
}

/** A portal run's or the nightmare's area (docs/28, docs/30): their own steps, so never the autopilot's. */
const specialArea = (area: Area | undefined, data: GameData): boolean =>
  !!area && (!!portalModeOf(area, data) || !!nightmareModeOf(area, data))

/**
 * Where the auto switch is offered (the area's header, a battle's extras). Off: cleared areas, as auto-mode always was.
 * On: Classic nowhere, Explored in cleared areas, Idle everywhere but the special areas.
 */
export function autoAvailable(
  save: SaveData,
  data: GameData,
  s: AutoSettings,
  areaId: string | null,
): boolean {
  if (!areaId) return false
  const cleared = progressOf(save, areaId).cleared
  if (!idleModeOn(data)) return cleared
  const style = playStyleOf(s)
  if (style === 'classic') return false
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
  const held = portalLock(save, data) ?? nightmareLock(save, data)
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
 * Between encounters, where the autopilot should be instead of `hereId`: back from a detour whose round is done, or on
 * to the next area of the chain once this one is cleared and the next is open (Explored: only into a cleared one, as
 * it plays nowhere else). Null: stay.
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
  if (!progressOf(save, hereId).cleared) return null
  const { chain, idx } = chainOf(data, hereId)
  const next = idx >= 0 ? chain[idx + 1] : undefined
  if (!next || !enterable(save, data, next, now)) return null
  if (style === 'explored' && !progressOf(save, next.id).cleared) return null
  return { areaId: next.id, detour: null }
}

// ---------------------------------------------------------------- what to do next

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
  /** The next encounter needs energy the player hasn't got (the run's outOfEnergy). */
  noEnergy?: boolean
}

/**
 * The autopilot's next move. It never uses an item, never changes the team (a Center heals and that's all) and never
 * plays the Game Corner; a catch — the ball, the Bait, adding it to the team — and Trick or Treat wait for the player.
 */
export type AutopilotStep =
  /** Nothing to do now: a fight playing, the player's choice, a pop-up, no energy, everyone resting. */
  | { do: 'wait'; why: 'fight' | 'player' | 'held' | 'energy' | 'resting' | 'closed' }
  /** The next encounter, or the gym or legendary waiting (Home's CONTINUE). */
  | { do: 'continue' }
  /** Take the card on the table: fight it (default lead), pick it up, walk into the Center or the Game Corner. */
  | { do: 'engage' }
  /** Close the result card (and its evolutions) and go back on the trail. */
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
    case 'trick':
      return { do: 'wait', why: 'player' }
    case 'preview':
      // Trick or Treat is a catch of its own: the player plays it.
      return v.encounter === 'trick' ? { do: 'wait', why: 'player' } : { do: 'engage' }
    case 'victory':
      return v.pendingCatch ? { do: 'wait', why: 'player' } : { do: 'close' }
    case 'center':
    case 'casino':
    case 'stalemate':
      return { do: 'leave' }
    case 'wipe':
      return { do: 'retreat', ...retreatFrom(save, data, v.areaId, now) }
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
      if (v.noEnergy) return { do: 'wait', why: 'energy' }
      return { do: 'continue' }
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
