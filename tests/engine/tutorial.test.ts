import { describe, expect, it } from 'vitest'
import {
  applyVictory,
  createRng,
  DEFAULT_CONFIG,
  diceTutorialCost,
  diceTutorialDue,
  diceTutorialStep,
  diceTutorialTarget,
  emptyProgress,
  finishDiceTutorial,
  finishItemLesson,
  itemLessonItem,
  newSave,
  nextOneTimePopup,
  startDiceTutorial,
  type GameData,
  type SaveData,
} from '@/engine'
import { makeData, newId } from '../fixtures'

const on = makeData({ openingRounds: { ...DEFAULT_CONFIG.openingRounds, access: 'all' } })
const off = makeData()
const ROUTE1 = DEFAULT_CONFIG.openingRounds.areaId

/** Route 1's first round won, as the set opening plays it: two wild K.O.s, then Joey's Rattata for his ₽10. */
function winRoundOne(save: SaveData, d: GameData): SaveData {
  const ko = (s: SaveData, kind: 'wild' | 'trainer', dex: number, level: number, prize?: number) =>
    applyVictory(
      s,
      { areaId: ROUTE1, kind, enemyDex: dex, enemyLevel: level, fighterUid: s.team[0]!, prize },
      d,
      createRng(1),
      0,
      newId,
    ).save
  let s = ko(save, 'wild', 19, 2)
  s = ko(s, 'wild', 16, 2)
  s = ko(s, 'wild', 19, 3)
  s = ko(s, 'trainer', 19, 4, 10)
  return {
    ...s,
    areaProgress: {
      ...s.areaProgress,
      [ROUTE1]: { ...emptyProgress(), ...s.areaProgress[ROUTE1], roundsDone: 1 },
    },
  }
}

const at = (path: string, martTab?: string, upTab?: string) => ({ path, martTab, upTab })

describe('the dice tutorial (docs/46 §5)', () => {
  it("leaves exactly the starter's die at Lv.2 in the purse after Joey, for each Kanto starter", () => {
    for (const [starter, type] of [
      [1, 'grass'],
      [4, 'fire'],
      [7, 'water'],
    ] as const) {
      const save = winRoundOne(newSave(starter, on, 0, newId), on)
      expect(save.gold, `#${starter}`).toBe(10)
      expect(diceTutorialTarget(save, on)?.type).toBe(type)
      expect(diceTutorialCost(save, on)).toBe(10)
      expect(diceTutorialDue(save, on)).toBe(true)
    }
  })

  it('is not due before Joey, switched off, the die already upgraded, short of ₽, or once done', () => {
    const fresh = newSave(4, on, 0, newId)
    const won = winRoundOne(fresh, on)
    expect(diceTutorialDue({ ...fresh, gold: 10 }, on)).toBe(false)
    expect(diceTutorialDue(won, off)).toBe(false)
    expect(diceTutorialDue({ ...won, dieLevels: { ...won.dieLevels, fire: 2 } }, on)).toBe(false)
    expect(diceTutorialDue({ ...won, gold: 9 }, on)).toBe(false)
    expect(diceTutorialDue(finishDiceTutorial(won), on)).toBe(false)
  })

  it('once started, it stays due until finished, the die bought and the purse empty', () => {
    const started = startDiceTutorial(winRoundOne(newSave(4, on, 0, newId), on))
    const bought = { ...started, gold: 0, dieLevels: { ...started.dieLevels, fire: 2 } }
    expect(diceTutorialDue(bought, on)).toBe(true)
    expect(diceTutorialStep(bought, on, at('/shop', 'upgrades', 'dice'))).toBe('back')
    expect(diceTutorialDue(finishDiceTutorial(bought), on)).toBe(false)
    expect(startDiceTutorial(finishDiceTutorial(bought)).diceTutorial).toBe('done')
  })

  it('reads its step from the page: Home, its Mart tab, Upgrades, Dice Types, the die', () => {
    const save = winRoundOne(newSave(4, on, 0, newId), on)
    expect(diceTutorialStep(save, on, at('/area'))).toBe('toHome')
    expect(diceTutorialStep(save, on, at('/team'))).toBe('toHome')
    expect(diceTutorialStep(save, on, at('/home'))).toBe('toMart')
    expect(diceTutorialStep(save, on, at('/shop'))).toBe('toUpgrades')
    expect(diceTutorialStep(save, on, at('/shop', 'sell'))).toBe('toUpgrades')
    expect(diceTutorialStep(save, on, at('/shop', 'upgrades'))).toBe('toDice')
    expect(diceTutorialStep(save, on, at('/shop', 'upgrades', 'dice'))).toBe('buy')
  })

  it('takes the first turn among the one-time pop-ups, between fights only', () => {
    const save = winRoundOne(newSave(4, on, 0, newId), on)
    const ctx = { calm: true, path: '/shop', signedIn: false, now: null, awayReport: true }
    expect(nextOneTimePopup(save, on, ctx)).toBe('diceTutorial')
    expect(nextOneTimePopup(save, on, { ...ctx, calm: false })).toBeNull()
    expect(nextOneTimePopup(finishDiceTutorial(save), on, ctx)).toBe('away')
  })

  it("may start over the round's Pokémon Center right after Joey, and nothing else may", () => {
    const save = winRoundOne(newSave(4, on, 0, newId), on)
    const ctx = { calm: false, atCenter: true, path: '/area', signedIn: false, now: null, awayReport: true }
    expect(nextOneTimePopup(save, on, ctx)).toBe('diceTutorial')
    expect(nextOneTimePopup(finishDiceTutorial(save), on, ctx)).toBeNull()
    expect(nextOneTimePopup(save, on, { ...ctx, atCenter: false })).toBeNull()
  })
})

describe('the item tutorial (docs/46 §7)', () => {
  /** A new player past the reroll lesson, with `items` in the Bag. */
  const player = (items: Record<string, number>) => ({
    ...newSave(4, on, 0, newId),
    rerollLesson: 'done' as const,
    inventory: items,
  })
  const mon = (hp: number, maxHp = 40) => ({ hp, maxHp })

  it('points to a potion below half HP, when it would waste at most 5 HP', () => {
    const save = player({ potion: 1 })
    expect(itemLessonItem(save, on, mon(19))).toBe('potion') // 21 missing
    expect(itemLessonItem(save, on, mon(14, 29))).toBe('potion') // 15 missing: 5 wasted
    expect(itemLessonItem(save, on, mon(13, 27))).toBeNull() // 14 missing: 6 wasted
    expect(itemLessonItem(save, on, mon(20))).toBeNull() // half HP is not below half
    expect(itemLessonItem(save, on, mon(0))).toBeNull()
  })

  it('takes the smallest heal that fits: a Super Potion only with 45 HP missing', () => {
    expect(itemLessonItem(player({ 'super-potion': 1 }), on, mon(10))).toBeNull() // 30 missing
    expect(itemLessonItem(player({ 'super-potion': 1 }), on, mon(20, 65))).toBe('super-potion')
    expect(itemLessonItem(player({ potion: 2, 'super-potion': 1 }), on, mon(20, 65))).toBe('potion')
    expect(itemLessonItem(player({ potion: 0 }), on, mon(5))).toBeNull()
  })

  it('once only, for players who began with the tutorials, the set opening on, heal items allowed', () => {
    const save = player({ potion: 1 })
    expect(itemLessonItem(finishItemLesson(save), on, mon(5))).toBeNull()
    expect(itemLessonItem({ ...save, rerollLesson: undefined }, on, mon(5))).toBeNull()
    expect(itemLessonItem({ ...save, rerollLesson: undefined, diceTutorial: 'done' }, on, mon(5))).toBe(
      'potion',
    )
    expect(itemLessonItem(save, off, mon(5))).toBeNull()
    expect(itemLessonItem(save, on, mon(5), true)).toBeNull()
  })
})
