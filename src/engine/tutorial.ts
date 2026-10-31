// The dice tutorial (docs/46 §5): right after Youngster Joey, Route 1's set opening ends its first round with ₽10 in
// the player's purse, the price of their starter's type die at Lv.2. A pointing hand walks them to it, step by step,
// once: the money in the top bar (the Mart), its Upgrades, the Dice view, the die, then back to the area. It follows the
// set opening's switch: it is that opening's last step.
import { nextDieCost } from './economy'
import { openingOn } from './opening'
import { progressOf } from './run'
import type { GameData, PokeType, SaveData } from './types'

export type DiceTutorialStep = 'toHome' | 'toMart' | 'toUpgrades' | 'toDice' | 'buy' | 'back'

/** The starter: the Pokémon held longest (as `starterFainted` reads it). */
const starterOf = (save: SaveData) =>
  save.box.reduce<SaveData['box'][number] | undefined>(
    (a, p) => (!a || p.caughtAt < a.caughtAt ? p : a),
    undefined,
  )

/** The starter and the die the tutorial upgrades: its first type's. Null without a starter. */
export function diceTutorialTarget(
  save: SaveData,
  data: GameData,
): { uid: string; dex: number; type: PokeType } | null {
  const starter = starterOf(save)
  const type = starter && data.species[starter.dex]?.type1
  return starter && type ? { uid: starter.id, dex: starter.dex, type } : null
}

/** Its die's price at Lv.2 (₽10 in the bundled tables, what Joey pays). */
export const diceTutorialCost = (save: SaveData, data: GameData): number | null => {
  const target = diceTutorialTarget(save, data)
  return target ? nextDieCost(target.type, 1, data) : null
}

/**
 * The tutorial is on screen for the player, now or from the next calm moment: started and not finished; or, the first
 * time, once the set opening's first round is won (Joey beaten) while the die is still Lv.1 and the purse holds its
 * price. Never once done, nor with the set opening switched off.
 */
export function diceTutorialDue(save: SaveData, data: GameData): boolean {
  const state = save.diceTutorial
  if (state === 'done' || !openingOn(data)) return false
  if (state === 'started') return true
  const target = diceTutorialTarget(save, data)
  const cost = diceTutorialCost(save, data)
  const area = data.config.openingRounds.areaId
  return (
    !!target &&
    cost != null &&
    (save.dieLevels[target.type] ?? 1) === 1 &&
    save.gold >= cost &&
    (progressOf(save, area).roundsDone ?? 0) >= 1
  )
}

/** Where the page is, as the step reads it: its path and the Mart's tab and Upgrades' view in its address. */
export interface TutorialPlace {
  path: string
  martTab?: string | null
  upTab?: string | null
}

/**
 * The step for the page the player is on: the die bought → back to the area; else on the Mart's Upgrades, Dice view →
 * buy it; Upgrades → open Dice; the Mart → open Upgrades; Home → its Mart tab; anywhere else → Home first (the Mart is
 * reached as it always will be, from Home's tab, not the top bar's money: the user's call, 2026-10-31).
 */
export function diceTutorialStep(save: SaveData, data: GameData, at: TutorialPlace): DiceTutorialStep {
  const target = diceTutorialTarget(save, data)
  if (!target || (save.dieLevels[target.type] ?? 1) > 1) return 'back'
  if (at.path === '/home') return 'toMart'
  if (at.path !== '/shop') return 'toHome'
  if (at.martTab !== 'upgrades') return 'toUpgrades'
  return at.upTab === 'dice' ? 'buy' : 'toDice'
}

/** The tutorial has shown: it comes back until finished, the die bought or not. */
export const startDiceTutorial = (save: SaveData): SaveData =>
  save.diceTutorial ? save : { ...save, diceTutorial: 'started' }

/** BACK TO the area: done, for good. */
export const finishDiceTutorial = (save: SaveData): SaveData =>
  save.diceTutorial === 'done' ? save : { ...save, diceTutorial: 'done' }

/**
 * The reroll lesson (docs/46 §6) rigs this fight: a new player's first fights on the set opening's area, its first round
 * not won yet, until the lesson has played once (its ATTACK pressed). A player past the dice tutorial never gets it.
 * Follows the set opening's switch, as the dice tutorial does.
 */
export function rerollLessonDue(save: SaveData, data: GameData, areaId: string | null | undefined): boolean {
  const area = data.config.openingRounds?.areaId
  return (
    !save.rerollLesson &&
    !save.diceTutorial &&
    openingOn(data) &&
    !!areaId &&
    areaId === area &&
    (progressOf(save, area).roundsDone ?? 0) === 0
  )
}

/** The lesson has played: never again. */
export const finishRerollLesson = (save: SaveData): SaveData =>
  save.rerollLesson ? save : { ...save, rerollLesson: 'done' }
