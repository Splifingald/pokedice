// Route 1's set opening (docs/46): a new player's first rounds there are met in a set order, card by card, so the
// first steps teach the game the same way every time. The rounds after them are shuffled decks, as everywhere. The
// deal itself is encounters.ts's; this file says which round is set and how many cards it has.
import type { Encounter } from './encounters'
import { eventOpenTo } from './events'
import type { Area, AreaProgress, DeckCard, GameData, OpeningCard, SaveData } from './types'

/** Switched on for whoever is playing. */
export const openingOn = (data: GameData): boolean => eventOpenTo(data.config.openingRounds?.access, data)

/** The set round of this index in this area, while the switch is on for the player; null when there is none. */
export function openingRound(area: Area, data: GameData, index: number): OpeningCard[] | null {
  const cfg = data.config.openingRounds
  if (!openingOn(data) || cfg?.areaId !== area.id) return null
  const round = cfg.rounds?.[index]
  return round?.length ? round : null
}

/**
 * The set round the next deck dealt here is: the one after the rounds done, until the area is cleared. A wipe drops
 * the round in progress, so the same round is dealt again.
 */
export const openingRoundDue = (area: Area, progress: AreaProgress, data: GameData): number | null =>
  !progress.cleared && openingRound(area, data, progress.roundsDone ?? 0) ? (progress.roundsDone ?? 0) : null

/** A set round's deck: its cards' kinds, drawn from the end. Extreme mode's rule leaves its Centers out. */
export const openingDeck = (round: readonly OpeningCard[], noCenters = false): DeckCard[] =>
  round
    .map((c) => c.kind)
    .filter((k) => !noCenters || k !== 'center')
    .reverse()

/**
 * The set card a draw from a set round's deck is: the next of its cards that aren't Centers, counted from the ones
 * already turned over this round. Centers carry nothing, and the deal only ever moves a Center (never two in a row), so
 * the other cards keep their order.
 */
export function openingCardAt(
  round: readonly OpeningCard[],
  turnedOver: readonly DeckCard[],
): OpeningCard | null {
  const k = turnedOver.filter((c) => c !== 'center').length
  return round.filter((c) => c.kind !== 'center')[k] ?? null
}

/** A set trainer's prize for this K.O.: all of it with the last, nothing with the others; undefined for any other foe. */
export function trainerPrize(enc: Encounter | null | undefined, last: boolean): number | undefined {
  if (enc?.kind !== 'trainer' || enc.prize == null) return undefined
  return last ? Math.max(0, Math.round(enc.prize)) : 0
}

/**
 * The starter is on the team and K.O.: during the set opening, an easy area's extra Pokémon Center comes only then
 * (the user's rule, 2026-10-28), not for any other team member down. The starter is the Pokémon held longest.
 */
export function starterFainted(save: SaveData): boolean {
  const starter = save.box.reduce<SaveData['box'][number] | undefined>(
    (a, p) => (!a || p.caughtAt < a.caughtAt ? p : a),
    undefined,
  )
  return !!starter && save.team.includes(starter.id) && starter.currentHp <= 0
}
