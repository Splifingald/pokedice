// The Gift card (docs/64 §4.0): its odds by level, Delibird's help, the levels' rewards as they land in an area (its
// balls, ₽ by its level, its Mart's evolution items), a broken gift's wild Pokémon, the card in the deck in place of the
// item card (only while switched on), and a boss's present (Evergreen Hill's Delibird, §4.2).
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CONFIG,
  applyGiftOpen,
  bossInPresent,
  compileGameData,
  createRng,
  deckAbilities,
  deckCounts,
  drawGiftRewards,
  emptyProgress,
  giftBalls,
  giftBreakChance,
  giftCardRulesDue,
  giftDealable,
  giftEvolutionItems,
  giftReachOdds,
  giftRewardAt,
  giftTop,
  growGift,
  hasGiftHelper,
  markGiftCardRulesSeen,
  newSave,
  nextEncounter,
  openGift,
  rollGiftWild,
  startBossPresent,
  startGift,
  type Area,
  type EncounterContext,
  type GameData,
  type GiftCardConfig,
  type GiftState,
  type Rng,
} from '@/engine'
import { BUNDLE } from '@/config/bundle'
import { snowglobe, withSnowglobe } from '../../scripts/content-snowglobe-valley'

const CFG = DEFAULT_CONFIG.giftCard
const base = compileGameData(BUNDLE)
const route = base.areas.find((a) => a.name === 'Route 1')!

/** Route 1 with a Gift card, the switch as asked. */
function world(access: GiftCardConfig['access'] = 'all', admin = false): { data: GameData; area: Area } {
  const area: Area = { ...route, encounterWeights: { ...route.encounterWeights, item: 1, gift: 1 } }
  const data = {
    ...base,
    areas: base.areas.map((a) => (a.id === route.id ? area : a)),
    config: { ...base.config, giftCard: { ...CFG, access } },
    ...(admin && { viewer: { admin: true } }),
  } as GameData
  return { data, area }
}

/** An rng whose `next` returns these values in turn (a tap breaks when next × 100 < its chance). */
const fixed = (values: number[]): Rng => {
  let i = 0
  const next = () => values[i++ % values.length]!
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(l: readonly T[]) => l[Math.floor(next() * l.length)]!,
    weighted: <T>(l: readonly T[], w: (x: T) => number) => l.find((x) => w(x) > 0),
    getState: () => 0,
  } as unknown as Rng
}

const gift = (level: number, helper = false, top = giftTop(CFG, helper)): GiftState => ({
  level,
  top,
  helper,
  rewards: [],
  taps: 0,
  end: null,
})

describe('the odds', () => {
  it('breaks a tap 20 / 40 / 60 / 80 % of the time from levels 1 to 4; level 5 is the top', () => {
    expect([1, 2, 3, 4].map((l) => giftBreakChance(CFG, l, false))).toEqual([20, 40, 60, 80])
    expect(giftTop(CFG, false)).toBe(5)
    expect(giftBreakChance(CFG, 5, false)).toBeNull()
  })

  it('with a Delibird: every level 20 % safer (level 1 safe), and level 6 on top', () => {
    expect([1, 2, 3, 4, 5].map((l) => giftBreakChance(CFG, l, true))).toEqual([0, 20, 40, 60, 80])
    expect(giftTop(CFG, true)).toBe(6)
    expect(giftBreakChance(CFG, 6, true)).toBeNull()
  })

  it('always tapping reaches level 5 3.8 % of the time; with a Delibird 19.2 %, and level 6 3.8 %', () => {
    const plain = giftReachOdds(CFG, false)
    expect(plain).toHaveLength(5)
    expect(plain[4]).toBeCloseTo(0.0384, 4)
    const helped = giftReachOdds(CFG, true)
    expect(helped).toHaveLength(6)
    expect(helped[4]).toBeCloseTo(0.192, 4)
    expect(helped[5]).toBeCloseTo(0.0384, 4)
  })

  it('a Monte Carlo of the engine’s own taps lands on the same odds', () => {
    const rng = createRng(7)
    const runs = 40000
    let five = 0
    for (let i = 0; i < runs; i++) {
      let s = gift(1)
      for (let step = growGift(s, CFG, rng); step && !step.broke; step = growGift(s, CFG, rng)) s = step.state
      if (s.level === 5 && !s.end) five++
    }
    expect(five / runs).toBeGreaterThan(0.034)
    expect(five / runs).toBeLessThan(0.043)
  })

  it('a tap grows it a level or breaks it, as its chance says; at the top it does nothing', () => {
    const grown = growGift(gift(2), CFG, fixed([0.5]))!
    expect(grown).toMatchObject({ from: 2, to: 3, chance: 40, broke: false, burst: false })
    expect(grown.state).toMatchObject({ level: 3, taps: 1, end: null })
    const broken = growGift(gift(2), CFG, fixed([0.39]))!
    expect(broken).toMatchObject({ from: 2, to: 2, chance: 40, broke: true })
    expect(broken.state.end).toBe('broken')
    expect(growGift(broken.state, CFG, fixed([0.9]))).toBeNull()
    expect(growGift(gift(5), CFG, fixed([0.99]))).toBeNull()
    // Level 1 with a Delibird never breaks.
    expect(growGift(gift(1, true), CFG, fixed([0]))!.broke).toBe(false)
  })

  it('cleans an odd admin value', () => {
    const odd = { ...CFG, breakChances: [150, -5, 'x' as unknown as number] }
    expect([1, 2, 3].map((l) => giftBreakChance(odd, l, false))).toEqual([100, 0, 100])
    expect(giftTop(odd, false)).toBe(4)
  })
})

describe('Delibird', () => {
  const { data } = world()
  const save = newSave(1, data, 0, () => 'starter')
  it('helps when the save owns one, in the team or the Box', () => {
    expect(hasGiftHelper(save, CFG)).toBe(false)
    const withDelibird = { ...save, box: [...save.box, { ...save.box[0]!, id: 'd', dex: 225 }] }
    expect(hasGiftHelper(withDelibird, CFG)).toBe(true)
    const g = startGift(withDelibird, route, data, createRng(1))
    expect(g).toMatchObject({ level: 1, top: 6, helper: true })
    expect(g.rewards).toHaveLength(6)
    expect(startGift(save, route, data, createRng(1))).toMatchObject({ top: 5, helper: false })
  })
})

describe('the rewards', () => {
  const sg = compileGameData(withSnowglobe(BUNDLE))
  const sgArea = (name: string) =>
    sg.areas.find((a) => a.id === snowglobe().areas.find((x) => x.name === name)!.id)!
  const trail = sgArea('Snowy Trail')
  const pond = sgArea('Frozen Pond')

  it('gives the area’s own ball, and the one above it', () => {
    // Snowy Trail finds only Poké Balls; Frozen Pond Great Balls too.
    expect(giftBalls(trail, sg)).toEqual({ ball: 'poke-ball', better: 'great-ball' })
    expect(giftBalls(pond, sg)).toEqual({ ball: 'great-ball', better: 'ultra-ball' })
    const ultra = { ...pond, lootPool: [...pond.lootPool, { ...pond.lootPool[0]!, itemKey: 'ultra-ball' }] }
    expect(giftBalls(ultra, sg)).toEqual({ ball: 'ultra-ball', better: 'ultra-ball' })
  })

  it('gives an evolution item the world’s Mart sells', () => {
    expect(giftEvolutionItems(trail, sg).sort()).toEqual(
      ['dawn-stone', 'ice-stone', 'peat-block', 'razor-claw', 'water-stone'].sort(),
    )
  })

  it('draws one option per level: balls, then better balls or Super Potions, … 3 Rare Candies, then a Revive too', () => {
    const level = trail.minLevel
    const seen = new Map<number, Set<string>>()
    for (let seed = 1; seed < 200; seed++) {
      const r = drawGiftRewards(CFG, 6, trail, sg, createRng(seed))
      expect(r).toHaveLength(6)
      r.forEach((items, i) => {
        const set = seen.get(i + 1) ?? new Set<string>()
        set.add(items.map((x) => `${x.qty} ${x.key}`).join(' + '))
        seen.set(i + 1, set)
      })
    }
    expect([...seen.get(1)!]).toEqual(['2 poke-ball'])
    expect([...seen.get(2)!].sort()).toEqual(['2 super-potion', '3 great-ball'])
    expect([...seen.get(3)!].sort()).toEqual([`${15 * level} money`, '2 hyper-potion'].sort())
    const four = [...seen.get(4)!]
    expect(four).toContain('1 revive')
    expect(
      four.filter((x) => x !== '1 revive').every((x) => giftEvolutionItems(trail, sg).includes(x.slice(2))),
    ).toBe(true)
    expect([...seen.get(5)!]).toEqual(['3 rare-candy'])
    expect([...seen.get(6)!]).toEqual(['3 rare-candy + 1 revive'])
  })

  it('OPEN puts the level’s reward in the bag and the ₽ in the purse', () => {
    const save = newSave(1, sg, 0, () => 'starter')
    const s: GiftState = {
      ...gift(3),
      rewards: [
        [],
        [],
        [
          { key: 'money', qty: 105 },
          { key: 'hyper-potion', qty: 2 },
        ],
      ],
    }
    expect(giftRewardAt(s)).toEqual(s.rewards[2])
    const opened = openGift(s)!
    expect(opened.end).toBe('opened')
    expect(openGift(opened)).toBeNull()
    const res = applyGiftOpen(save, sg, trail.id, opened, 0, () => 'x')
    expect(res.items).toEqual(s.rewards[2])
    expect(res.save.gold).toBe(save.gold + 105)
    expect(res.save.inventory['hyper-potion'] ?? 0).toBe((save.inventory['hyper-potion'] ?? 0) + 2)
    // Not opened: nothing.
    expect(applyGiftOpen(save, sg, trail.id, s, 0, () => 'x').save).toBe(save)
  })
})

describe('the card in the deck', () => {
  const ctx = (data: GameData, area: Area, deck: EncounterContext['progress']['deck']): EncounterContext => ({
    area,
    progress: { ...emptyProgress(), deck },
    data,
    teamAvgLevel: 5,
    teamHurt: false,
    isFirstInArea: false,
    pokedex: [],
  })

  it('takes the item card’s place only while switched on for the player', () => {
    for (const [access, admin, on] of [
      ['off', true, false],
      ['admin', false, false],
      ['admin', true, true],
      ['all', false, true],
    ] as const) {
      const { data, area } = world(access, admin)
      expect(giftDealable(data, area)).toBe(on)
      expect(deckCounts(area.encounterWeights, deckAbilities(area, data))).toMatchObject(
        on ? { item: 0, gift: 1 } : { item: 1, gift: 0 },
      )
    }
    // An area that counts no gift keeps its item card.
    const { data } = world('all')
    expect(giftDealable(data, base.areas[1]!)).toBe(false)
  })

  it('switched on, its card is a present; switched off, the item card as before and a gift left in a deck is discarded', () => {
    const on = world('all')
    expect(nextEncounter(ctx(on.data, on.area, ['wild', 'gift']), createRng(2)).encounter).toEqual({
      kind: 'gift',
    })
    const off = world('off')
    const roll = nextEncounter(ctx(off.data, off.area, ['wild', 'gift']), createRng(3))
    expect(roll.encounter.kind).toBe('wild')
    expect(roll.drawn).toEqual(['gift', 'wild'])
    expect(nextEncounter(ctx(off.data, off.area, ['wild', 'item']), createRng(3)).encounter.kind).toBe('item')
  })

  it('a broken gift brings a wild Pokémon of the area’s own pool, catchable as any', () => {
    const { data, area } = world('all')
    const dexes = new Set(area.wildPool.map((w) => w.dex))
    for (let seed = 1; seed < 40; seed++) {
      const enc = rollGiftWild(ctx(data, area, []), createRng(seed))!
      expect(enc.kind).toBe('wild')
      if (enc.kind !== 'wild') continue
      expect(dexes.has(enc.dex)).toBe(true)
      expect(enc.isNew).toBe(true)
      const entry = area.wildPool.find((w) => w.dex === enc.dex)!
      expect(enc.level).toBeGreaterThanOrEqual(Math.min(entry.minLevel, area.minLevel) - 5)
    }
    expect(rollGiftWild(ctx(data, { ...area, wildPool: [] }, []), createRng(1))).toBeNull()
  })
})

describe('a boss’s present (Evergreen Hill’s Delibird)', () => {
  it('only grows, and bursts on its last tap', () => {
    let s = startBossPresent(CFG, { dex: 225, level: 40, shiny: true })
    expect(s).toMatchObject({ level: 1, top: 5, boss: { dex: 225, level: 40, shiny: true }, end: null })
    expect(openGift(s)).toBeNull()
    const levels: number[] = []
    for (let i = 0; i < 4; i++) {
      // Whatever the dice: it never breaks before its last tap.
      const step = growGift(s, CFG, fixed([0]))!
      expect(step).toMatchObject({ broke: false, burst: false, chance: null })
      s = step.state
      levels.push(s.level)
    }
    expect(levels).toEqual([2, 3, 4, 5])
    const last = growGift(s, CFG, fixed([0.99]))!
    expect(last).toMatchObject({ burst: true, broke: false })
    expect(last.state.end).toBe('burst')
    expect(growGift(last.state, CFG, fixed([0]))).toBeNull()
  })

  it('comes out of a present only while the Gift card is on', () => {
    const boss = { dex: 225, level: 40, present: true }
    expect(bossInPresent(world('all').data, boss)).toBe(true)
    expect(bossInPresent(world('off').data, boss)).toBe(false)
    expect(bossInPresent(world('all').data, { ...boss, present: false })).toBe(false)
  })
})

describe('its rules', () => {
  it('are due the first time, while switched on', () => {
    const { data } = world('all')
    const save = newSave(1, data, 0, () => 'starter')
    expect(giftCardRulesDue(save, data)).toBe(true)
    expect(giftCardRulesDue(markGiftCardRulesSeen(save), data)).toBe(false)
    expect(giftCardRulesDue(save, world('off').data)).toBe(false)
  })
})
