// Small worlds' preview (docs/21 §9): for `previewHours` before a world starts (48 unless the admin says otherwise),
// Home shows it greyed, in the very slot its square will take, with a countdown and a gauge over that window. This
// module decides when the preview shows, the time left, how full the gauge is and its phase (normal, red in the last
// hour, blinking in the last five minutes); the screen only draws them. Its own switch (`smallWorlds.previewAccess`,
// Off by default) comes on top of the worlds' own.
import { eventOpenTo } from './events'
import { isExtreme } from './extreme'
import { badgesHeld } from './liveEvents'
import { getRegion } from './regions'
import type { GameData, SaveData, SmallWorld } from './types'
import { inWorld, worldsOn, worldState } from './worlds'
import { smallWorlds } from './worldList'

export { PREVIEW_HOURS, PREVIEW_HOURS_MAX } from './worldList'

const MINUTE = 60_000
const HOUR = 60 * MINUTE

/** The gauge turns red for the last hour before the start (that hour included). */
export const PREVIEW_RED_MS = HOUR
/** …and blinks for the last five minutes (included). */
export const PREVIEW_BLINK_MS = 5 * MINUTE

/** How the gauge looks: the world's colour, red in the last hour, blinking red in the last five minutes. */
export type PreviewPhase = 'normal' | 'red' | 'blink'

type Timed = Pick<SmallWorld, 'start' | 'end' | 'previewHours'>

/** The preview's length (ms): the admin's hours, none for 0 (or a value that isn't a number). */
export function previewWindow(w: Pick<SmallWorld, 'previewHours'>): number {
  const h = w.previewHours
  return Number.isFinite(h) && h > 0 ? h * HOUR : 0
}

/**
 * The world is in its preview at `now`: from `previewHours` before its start (that moment included) until its start
 * (excluded: from then on it is live, and its own square takes the slot). A world with bad dates never previews.
 */
export function inPreviewWindow(w: Timed, now: number): boolean {
  const len = previewWindow(w)
  if (!len || worldState(w, now) !== 'scheduled') return false
  return now >= Date.parse(w.start) - len
}

/** Time left before the start (ms), never below 0. */
export const previewLeft = (w: Pick<SmallWorld, 'start'>, now: number): number =>
  Math.max(0, Date.parse(w.start) - now)

/**
 * How full the gauge is (0 → 1): empty when the preview opens, full at the start. It fills toward the moment the world
 * opens, as the Day Care's and the wheel's gauges fill toward theirs; once live, the world's own square drains.
 */
export function previewFill(w: Timed, now: number): number {
  const len = previewWindow(w)
  if (!len) return 0
  return Math.min(1, Math.max(0, 1 - previewLeft(w, now) / len))
}

/** The gauge's phase: red from one hour before the start, blinking from five minutes before (both included). */
export function previewPhase(w: Pick<SmallWorld, 'start'>, now: number): PreviewPhase {
  const left = previewLeft(w, now)
  return left <= PREVIEW_BLINK_MS ? 'blink' : left <= PREVIEW_RED_MS ? 'red' : 'normal'
}

/** The preview is switched on for whoever is playing (and so are the worlds themselves). */
export const worldPreviewOn = (data: GameData): boolean =>
  worldsOn(data) && eventOpenTo(data.config.smallWorlds?.previewAccess, data)

/**
 * The world this player sees previewed at `now`: in its window, both switches on for them, its region known, from its
 * badge count, in the main save and outside any world (Home inside a world shows only the world's own squares). The
 * soonest one if several are; null while the time is unknown. These are the live square's own rules, so the preview
 * sits exactly where the world's square will be and is replaced by it at the start.
 */
export function worldPreviewFor(save: SaveData, data: GameData, now: number | null): SmallWorld | null {
  if (now == null || isExtreme(save) || !worldPreviewOn(data) || inWorld(save, data)) return null
  const badges = badgesHeld(save, data)
  return (
    smallWorlds(data)
      .filter((w) => inPreviewWindow(w, now) && !!getRegion(data, w.regionId) && badges >= w.minBadges)
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0] ?? null
  )
}

/** Everything the preview square shows at `now`. */
export function previewState(w: Timed, now: number): { left: number; fill: number; phase: PreviewPhase } {
  return { left: previewLeft(w, now), fill: previewFill(w, now), phase: previewPhase(w, now) }
}
