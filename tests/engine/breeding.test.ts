import { describe, expect, it } from 'vitest'
import {
  clockDueAt,
  compatible,
  createInstance,
  createRng,
  dayCareOf,
  nextCheckAt,
  newSave,
  pairs,
  processDayCare,
  rushEgg,
  sharedGroups,
  syncEggClocks,
  withdrawPokemon,
  type DayCareGuest,
  type DayCareState,
  type SaveData,
} from '@/engine'
import { data, newId } from '../fixtures'

const HOUR = 3_600_000
const cfg = data.config.dayCare
const T0 = 1_000 * HOUR
const rng = () => createRng(7)

/** An open Day Care (20 species caught) with these Pokémon of yours and these visitors; the gift already taken. */
function at(mine: number[], guests: number[] = [], dc: Partial<DayCareState> = {}): SaveData {
  const s = newSave(4, data, 0, newId)
  const guest = (dex: number, i: number): DayCareGuest => ({
    owner: i % 2 ? 'noor' : 'lea',
    ownerName: i % 2 ? 'Noor' : 'Lea',
    ownerAvatar: 'red',
    inst: `g${i}`,
    dex,
    level: 30,
    addedAt: 0,
  })
  return {
    ...s,
    gold: 1000,
    pokedex: Array.from({ length: cfg.unlockPokedex }, (_, i) => i + 1),
    dayCare: {
      residents: mine.map((dex, i) => ({ inst: createInstance(dex, 20, data, `r${i}`, 0), since: 0, region: 'kanto' })),
      guests: guests.map(guest),
      eggClaimed: true,
      ...dc,
    },
  }
}
const run = (s: SaveData, now: number) => processDayCare(s, data, now, rng())
const egg = (s: SaveData) => dayCareOf(s).egg
/** A save's clocks, to carry them over to another line-up (as when someone arrives or leaves). */
function clocksOf(s: SaveData): Partial<DayCareState> {
  const { breedAt, dittoAt } = dayCareOf(s)
  return { ...(breedAt != null && { breedAt }), ...(dittoAt != null && { dittoAt }) }
}

describe('Egg groups: who pairs with whom', () => {
  const table: [string, number, number, boolean][] = [
    ['Eevee × Jolteon (Field)', 133, 135, true],
    ['Eevee × Dratini (no shared group)', 133, 147, false],
    ['Dratini × Gyarados (Dragon)', 147, 130, true],
    ['Ditto × Snorlax', 132, 143, true],
    ['Ditto × Magnemite', 132, 81, true],
    ['Ditto × Pichu (babies are not legendary)', 132, 172, true],
    ['Ditto × Ditto', 132, 132, true],
    ['Ditto × Mewtwo (legendary)', 132, 150, false],
    ['Ditto × Celebi (mythical)', 132, 251, false],
    ['Manaphy × Ditto (mythical)', 490, 132, false],
    ['Manaphy × Lapras (genderless, though both Water 1)', 490, 131, false],
    ['Magnemite × Voltorb (genderless)', 81, 100, false],
    ['Tauros × Tauros (both male-only)', 128, 128, false],
    ['Tauros × Miltank (male × female, Field)', 128, 241, true],
    ['Chansey × Blissey (both female-only)', 113, 242, false],
    ['Pichu × Pikachu (Undiscovered)', 172, 25, false],
  ]
  for (const [name, a, b, ok] of table)
    it(name, () => {
      expect(compatible(data, a, b)).toBe(ok)
      expect(compatible(data, b, a)).toBe(ok)
    })

  it('names the groups a pair shares', () => {
    expect(sharedGroups(data, 133, 135)).toEqual(['Field'])
    expect(sharedGroups(data, 147, 130)).toEqual(['Dragon'])
    expect(sharedGroups(data, 132, 143)).toEqual([])
  })
})

describe('Pairs', () => {
  it('each of yours with everyone else, each pair once; a Ditto pair is slow', () => {
    const ps = pairs(at([133, 135], [132]), data)
    expect(ps.map((p) => [p.a.key, p.b.key, p.slow])).toEqual([
      ['r0', 'r1', false],
      ['r0', 'lea:g0', true],
      ['r1', 'lea:g0', true],
    ])
  })

  it('a visitor × visitor pair never counts: your Pokémon do the checking', () => {
    expect(pairs(at([147], [133, 135]), data)).toEqual([])
  })
})

describe('The checks', () => {
  it('nothing before the interval, then one Egg from the pair', () => {
    const s = run(at([133, 135]), T0).save
    expect(dayCareOf(s).breedAt).toBe(T0)
    expect(egg(run(s, T0 + cfg.breedHours * HOUR - 1).save)).toBeUndefined()
    const laid = run(s, T0 + cfg.breedHours * HOUR)
    expect(laid.laid).toBe(true)
    expect(egg(laid.save)).toEqual({ at: T0 + cfg.breedHours * HOUR, parents: [{ dex: 133 }, { dex: 135 }] })
  })

  it('no pair, no clock: nothing is checked, and a clock left running stops', () => {
    for (const s of [at([133, 147]), at([])]) {
      expect(run(s, T0).save).toBe(s)
      expect(run(s, T0 + 10 * cfg.breedDittoHours * HOUR).save).toBe(s)
    }
    // A save from before the rule: both clocks ran with nobody to pair. They stop, and nothing is laid.
    const old = run(at([133, 147], [], { breedAt: T0 - 50 * HOUR, dittoAt: T0 - 50 * HOUR }), T0)
    expect(old.laid).toBeUndefined()
    expect(dayCareOf(old.save)).not.toHaveProperty('breedAt')
    expect(dayCareOf(old.save)).not.toHaveProperty('dittoAt')
  })

  it('the clock starts when two here can pair, not before', () => {
    // Eevee alone for two days: no clock.
    const alone = run(at([133]), T0).save
    expect(dayCareOf(alone).breedAt).toBeUndefined()
    // Jolteon arrives: the Egg-group clock starts there, and a whole interval passes before the first check.
    const arrive = T0 + 48 * HOUR
    const both = syncEggClocks(at([133, 135], [], clocksOf(alone)), data, arrive)
    expect(dayCareOf(both)).toMatchObject({ breedAt: arrive })
    expect(dayCareOf(both).dittoAt).toBeUndefined()
    expect(egg(run(both, arrive + cfg.breedHours * HOUR - 1).save)).toBeUndefined()
    expect(run(both, arrive + cfg.breedHours * HOUR).laid).toBe(true)
  })

  it('starts over when the pair breaks up', () => {
    const s = run(at([133, 135]), T0).save
    // Jolteon goes home an hour before the check: the clock stops and forgets.
    const split = T0 + cfg.breedHours * HOUR - HOUR
    const alone = syncEggClocks(withdrawPokemon(s, 'r1', data, split)!.save, data, split)
    expect(dayCareOf(alone)).not.toHaveProperty('breedAt')
    expect(run(alone, T0 + 3 * cfg.breedHours * HOUR).laid).toBeUndefined()
    // Back two hours later: a whole interval from then.
    const back = split + 2 * HOUR
    const again = syncEggClocks(at([133, 135], [], clocksOf(alone)), data, back)
    expect(dayCareOf(again).breedAt).toBe(back)
    expect(run(again, back + cfg.breedHours * HOUR - 1).laid).toBeUndefined()
    expect(run(again, back + cfg.breedHours * HOUR).laid).toBe(true)
  })

  it('keeps running while one of its pairs stays; each clock follows its own pairs', () => {
    // Eevee, Jolteon and a friend's Vaporeon: Field pairs. Jolteon leaves, Eevee × Vaporeon keeps the clock going.
    const s = run(at([133, 135], [134]), T0).save
    const left = withdrawPokemon(s, 'r1', data, T0 + HOUR)!.save
    expect(syncEggClocks(left, data, T0 + HOUR)).toBe(left)
    expect(dayCareOf(left).breedAt).toBe(T0)
    // A friend's Ditto starts the Ditto clock only; sent back, that clock stops and the other runs on.
    const ditto = syncEggClocks(at([133, 135], [132], clocksOf(s)), data, T0 + 2 * HOUR)
    expect(dayCareOf(ditto)).toMatchObject({ breedAt: T0, dittoAt: T0 + 2 * HOUR })
    const gone = syncEggClocks(at([133, 135], [], clocksOf(ditto)), data, T0 + 3 * HOUR)
    expect(dayCareOf(gone).breedAt).toBe(T0)
    expect(dayCareOf(gone)).not.toHaveProperty('dittoAt')
  })

  it('a waiting Egg blocks the next one', () => {
    const s = run(at([133, 135]), T0).save
    const first = run(s, T0 + cfg.breedHours * HOUR).save
    const second = run(first, T0 + 2 * cfg.breedHours * HOUR)
    expect(second.laid).toBeUndefined()
    expect(egg(second.save)).toEqual(egg(first))
    expect(dayCareOf(second.save).breedAt).toBe(T0 + 2 * cfg.breedHours * HOUR)
  })

  it("Ditto's pairs only on the slow clock, plain pairs only on the other", () => {
    const ditto = run(at([132, 143]), T0).save
    expect(egg(run(ditto, T0 + cfg.breedHours * HOUR).save)).toBeUndefined()
    expect(egg(run(ditto, T0 + cfg.breedDittoHours * HOUR).save)?.parents).toEqual([{ dex: 132 }, { dex: 143 }])

    // With both kinds here, the clock that is due picks among its own pairs: the Ditto one, a pair with the Ditto.
    const both = run(at([133, 135], [132], { breedAt: T0, dittoAt: T0 - cfg.breedDittoHours * HOUR + 1 }), T0).save
    const when = run(both, T0 + 1)
    expect(when.laid).toBe(true)
    expect(egg(when.save)?.parents?.[1]).toEqual({ dex: 132, owner: 'Lea' })
    expect(dayCareOf(when.save)).toMatchObject({ breedAt: T0, dittoAt: T0 + 1 })
  })

  it('three days away leave one Egg, not six', () => {
    const s = run(at([133, 135]), T0).save
    const back = run(s, T0 + 72 * HOUR)
    expect(back.laid).toBe(true)
    expect(dayCareOf(back.save).breedAt).toBe(T0 + 72 * HOUR)
    const { egg: _hatched, ...rest } = dayCareOf(back.save)
    expect(run({ ...back.save, dayCare: rest }, T0 + 72 * HOUR).laid).toBeUndefined()
  })

  it('is idempotent: twice at the same time changes nothing', () => {
    const once = run(at([133, 135]), T0 + 5 * HOUR).save
    expect(run(once, T0 + 5 * HOUR).save).toBe(once)
    const laid = run(once, T0 + 30 * HOUR).save
    expect(run(laid, T0 + 30 * HOUR).save).toBe(laid)
  })

  it('a visitor pair names its owner, for "Ditto (Noor)"', () => {
    const s = run(at([143], [133, 132]), T0).save
    expect(egg(run(s, T0 + cfg.breedDittoHours * HOUR).save)?.parents).toEqual([{ dex: 143 }, { dex: 132, owner: 'Noor' }])
  })

  it('nothing runs while the Day Care is shut', () => {
    const shut = { ...at([133, 135]), pokedex: [4] }
    expect(run(shut, T0).save).toBe(shut)
  })

  it('counts down to the sooner clock that has pairs, and to nothing without any', () => {
    const s = at([133, 135], [132], { breedAt: T0, dittoAt: T0 - 20 * HOUR })
    expect(nextCheckAt(s, data, T0)).toBe(T0 - 20 * HOUR + cfg.breedDittoHours * HOUR)
    const plain = at([133, 135], [], { breedAt: T0 })
    expect(clockDueAt(plain, data, 'breed', T0)).toBe(T0 + cfg.breedHours * HOUR)
    expect(clockDueAt(plain, data, 'ditto', T0)).toBeNull()
    const none = at([133, 147], [], { breedAt: T0, dittoAt: T0 - 20 * HOUR })
    expect(nextCheckAt(none, data, T0)).toBeNull()
    expect(nextCheckAt(at([]), data, T0)).toBeNull()
  })
})

describe('The gift', () => {
  it('waits as soon as the Day Care is open, for a save that never had it', () => {
    const s = run(at([], [], { eggClaimed: false }), T0)
    expect(egg(s.save)).toEqual({ at: T0, gift: true })
    expect(s.laid).toBeUndefined()
  })

  it('never comes twice', () => {
    expect(egg(run(at([]), T0).save)).toBeUndefined()
  })
})

describe('Egg now', () => {
  it('is refused with an Egg waiting, without a pair, or short of ₽, and nothing changes', () => {
    expect(rushEgg(at([133, 135], [], { egg: { at: 0 } }), data, T0, rng())).toEqual({ refused: 'egg' })
    expect(rushEgg(at([133, 147]), data, T0, rng())).toEqual({ refused: 'pair' })
    const poor = { ...at([133, 135]), gold: cfg.rushPrice - 1 }
    expect(rushEgg(poor, data, T0, rng())).toEqual({ refused: 'gold' })
  })

  it('takes the ₽ and runs the next check now: that clock restarts, the other one is untouched', () => {
    const s = at([133, 135], [132], { breedAt: T0, dittoAt: T0 - 20 * HOUR })
    const r = rushEgg(s, data, T0 + HOUR, rng())
    if (!('save' in r)) throw new Error(r.refused)
    const dc = dayCareOf(r.save)
    expect(r.save.gold).toBe(s.gold - cfg.rushPrice)
    expect(dc.dittoAt).toBe(T0 + HOUR)
    expect(dc.breedAt).toBe(T0)
    expect(dc.egg?.at).toBe(T0 + HOUR)
    expect(dc.egg?.parents?.[1]).toEqual({ dex: 132, owner: 'Lea' })

    const plain = rushEgg(at([133, 135], [], { breedAt: T0, dittoAt: T0 }), data, T0 + HOUR, rng())
    if (!('save' in plain)) throw new Error(plain.refused)
    expect(dayCareOf(plain.save)).toMatchObject({ breedAt: T0 + HOUR, dittoAt: T0 })
  })
})
