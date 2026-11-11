// Hatching Day (docs/71 §2): the Day Care's Egg clocks run × its speed (Flame Body's ×2 on top), an Egg cracked while
// it runs is shiny at the Day Care's odds × its shiny number, two add up as Cash Flows do, and its switch gates it.
import { describe, expect, it } from 'vitest'
import {
  createInstance,
  createRng,
  dayCareOf,
  hatchShiny,
  hatchSpeed,
  liveProblems,
  livesFor,
  newLiveEvent,
  newSave,
  nextCheckAt,
  nextCheckProgress,
  normaliseLiveEvent,
  processDayCare,
  rollHatchling,
  type GameData,
  type LiveEvent,
  type SaveData,
} from '@/engine'
import { data, makeData, newId } from '../fixtures'

const HOUR = 3_600_000
const T0 = 1_000 * HOUR
const breed = data.config.dayCare.breedHours * HOUR

const event = (patch: Partial<LiveEvent> = {}): LiveEvent => ({
  ...newLiveEvent('hd', new Date(T0 - HOUR).toISOString(), new Date(T0 + 72 * HOUR).toISOString()),
  type: 'hatch',
  minBadges: 0,
  ...patch,
})
const HD = event()
const cash = (): LiveEvent => ({ ...event({ id: 'cf' }), type: 'cash' })

/** An open Day Care with these two of yours (their clock last checked at T0), the gift already taken. */
function at(mine: [number, number], d: GameData = data, talent = false): SaveData {
  const s = newSave(4, d, 0, newId)
  return {
    ...s,
    pokedex: Array.from({ length: d.config.dayCare.unlockPokedex }, (_, i) => i + 1),
    dayCare: {
      residents: mine.map((dex, i) => ({
        inst: { ...createInstance(dex, 20, d, `r${i}`, 0), ...(talent && i === 0 && { talent: true }) },
        since: 0,
        region: 'kanto',
      })),
      guests: [],
      eggClaimed: true,
      breedAt: T0,
    },
  }
}
// Eevee × Jolteon share the Field group: the plain clock.
const EEVEES: [number, number] = [133, 135]

describe('Hatching Day: its numbers', () => {
  it('×1 without one, its own numbers with one, and other live events change nothing', () => {
    expect(hatchSpeed(null)).toBe(1)
    expect(hatchShiny([])).toBe(1)
    expect(hatchSpeed([HD, cash()])).toBe(3)
    expect(hatchShiny([HD, cash()])).toBe(4)
  })

  it('two at once add their bonuses: ×3 and ×3 make ×5, ×4 and ×4 make ×7', () => {
    const two = [HD, event({ id: 'hd2' })]
    expect(hatchSpeed(two)).toBe(5)
    expect(hatchShiny(two)).toBe(7)
  })

  it('an old row gets the defaults, ×3 and ×4', () => {
    const { hatch: _gone, ...old } = HD
    expect(normaliseLiveEvent(old).hatch).toEqual({ speed: 3, shiny: 4 })
  })

  it('the admin can’t save one that changes nothing, or goes below ×1', () => {
    expect(liveProblems([], HD, data, T0)).toEqual([])
    expect(liveProblems([], event({ hatch: { speed: 1, shiny: 1 } }), data, T0)).toContain(
      'Hatching Day changes nothing: raise the speed or the shiny odds.',
    )
    expect(liveProblems([], event({ hatch: { speed: 0.5, shiny: 4 } }), data, T0)).toContain(
      'Hatching Day’s Egg speed is below ×1.',
    )
  })
})

describe('Hatching Day: the Egg clocks', () => {
  it('the next check comes ×3 sooner while it runs', () => {
    const s = at(EEVEES)
    expect(nextCheckAt(s, data, T0)).toBe(T0 + breed)
    expect(nextCheckAt(s, data, T0, [HD])).toBe(T0 + breed / 3)
  })

  it('a pair leaves its Egg at a third of the interval, and not before', () => {
    const s = at(EEVEES)
    const rng = () => createRng(7)
    expect(processDayCare(s, data, T0 + breed / 3 - 1, rng(), [HD]).laid).toBeUndefined()
    const laid = processDayCare(s, data, T0 + breed / 3, rng(), [HD])
    expect(laid.laid).toBe(true)
    expect(dayCareOf(laid.save).egg?.at).toBe(T0 + breed / 3)
    // Without it, nothing yet.
    expect(processDayCare(s, data, T0 + breed / 3, rng()).laid).toBeUndefined()
  })

  it('Home’s gauge to the next check runs on the faster interval', () => {
    const s = at(EEVEES)
    expect(nextCheckProgress(s, data, T0 + breed / 6, [HD])?.done).toBeCloseTo(0.5)
    expect(nextCheckProgress(s, data, T0 + breed / 6)?.done).toBeCloseTo(1 / 6)
  })

  it('Flame Body’s ×2 multiplies with it: ×6', () => {
    const d = makeData({
      hiddenTalents: { access: 'all', wildChance: 0.05, evolveChance: 0.3, families: {} },
    })
    // Magmar (Flame Body) × Electabuzz share the Human-Like group.
    const s = at([126, 125], d, true)
    const dBreed = d.config.dayCare.breedHours * HOUR
    expect(nextCheckAt(s, d, T0)).toBe(T0 + dBreed / 2)
    expect(nextCheckAt(s, d, T0, [HD])).toBe(T0 + dBreed / 6)
  })
})

describe('Hatching Day: shinier Eggs', () => {
  // A quarter of Eggs shiny, ×4 while it runs: every one.
  const d = makeData({ dayCare: { ...data.config.dayCare, shinyChance: 0.25 } })
  const withEgg = (): SaveData => {
    const s = at(EEVEES, d)
    return { ...s, dayCare: { ...dayCareOf(s), egg: { at: T0, parents: [{ dex: 133 }, { dex: 135 }] } } }
  }
  const shinies = (live: LiveEvent[]) =>
    Array.from(
      { length: 60 },
      (_, seed) => rollHatchling(withEgg(), d, createRng(seed), live)?.shiny === true,
    ).filter(Boolean).length

  it('an Egg cracked while it runs rolls the Day Care’s odds × its number (at most every one)', () => {
    expect(shinies([HD])).toBe(60)
    const plain = shinies([])
    expect(plain).toBeGreaterThan(0)
    expect(plain).toBeLessThan(40)
  })
})

describe("Hatching Day: no switch of its own (the user's call, 2026-11-11)", () => {
  const save = newSave(4, data, 0, newId)

  it('scheduled, it runs between its dates', () => {
    const d = makeData({ liveEvents: { access: 'all', list: [HD] } })
    expect(livesFor(save, d, T0).map((e) => e.id)).toEqual(['hd'])
    expect(livesFor(save, d, T0 + 80 * HOUR)).toEqual([])
  })
})
