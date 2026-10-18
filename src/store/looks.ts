// Trainer looks (docs/31): the save whose progress unlocks them (the main one, also while the Extreme save is played)
// and the player's actions on them. The rules are the engine's (engine/looks).
import {
  isExtreme,
  looksOn,
  markLooksRulesSeen,
  markLooksSeen,
  newLooks,
  wearLook,
  type SaveData,
} from '@/engine'
import { otherSave } from './extreme'
import { mutateSave, useGame } from './game'

/** Looks are earned in the main save and worn in both. */
export const looksProgress = (save: SaveData): SaveData => (isExtreme(save) ? (otherSave() ?? save) : save)

/**
 * The red dot: looks unlocked since the menu was last looked at. None in Extreme mode, where nothing unlocks (and
 * the main save keeps track of what has been seen).
 */
export function useNewLooks(): number {
  return useGame((s) =>
    s.save && looksOn(s.data) && !isExtreme(s.save)
      ? newLooks(s.save, looksProgress(s.save), s.data).length
      : 0,
  )
}

export function wear(id: string): void {
  const data = useGame.getState().data
  mutateSave((s) => wearLook(s, looksProgress(s), data, id))
}

/** The menu has been looked at: the NEW tags and the dot go. */
export function markSeen(): void {
  const data = useGame.getState().data
  mutateSave((s) => (isExtreme(s) ? null : markLooksSeen(s, s, data)))
}

export function markRulesSeen(): void {
  mutateSave(markLooksRulesSeen)
}
