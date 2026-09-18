import { describe, expect, it } from 'vitest'
import {
  createInstance,
  createRng,
  dayCareOf,
  dayCareXp,
  depositError,
  depositPokemon,
  eggOdds,
  eggSpecies,
  hatchEgg,
  hatchLevel,
  isDayCareOpen,
  newSave,
  nextDayCareTick,
  residentNow,
  withdrawPokemon,
  type SaveData,
} from '@/engine'
import { data, newId } from '../fixtures'

const MIN = 60_000
const cfg = data.config.dayCare
const withMons = (levels: number[]): SaveData => {
  const s = newSave(4, data, 0, newId)
  const extra = levels.slice(1).map((lv, i) => createInstance(16 + i * 3, lv, data, `m${i}`, 0))
  const box = [{ ...s.box[0]!, level: levels[0]! }, ...extra]
  return { ...s, box, team: box.slice(0, 3).map((p) => p.id), gold: 1000 }
}

describe('Day Care', () => {
  it('opens once enough species are in the Pokédex', () => {
    const s = newSave(4, data, 0, newId)
    expect(isDayCareOpen(s, data)).toBe(false)
    expect(isDayCareOpen({ ...s, pokedex: Array.from({ length: cfg.unlockPokedex }, (_, i) => i + 1) }, data)).toBe(true)
  })

  it('takes Pokémon out of the team and the Box, 2 at most, never the last team member', () => {
    const s = withMons([10, 12, 14, 16])
    const [a, b, c] = s.box
    const one = depositPokemon(s, a!.id, data, 0)!
    expect(one.box.map((p) => p.id)).not.toContain(a!.id)
    expect(one.team).not.toContain(a!.id)
    expect(dayCareOf(one).residents.map((r) => r.inst.id)).toEqual([a!.id])
    const two = depositPokemon(one, b!.id, data, 0)!
    expect(depositError(two, c!.id, data)).toBe('full')

    const lonely = { ...s, box: [a!], team: [a!.id] }
    expect(depositError(lonely, a!.id, data)).toBe('last')
  })

  it('gains 1 XP every 30 minutes, up to 500 per stay', () => {
    const res = { inst: createInstance(4, 10, data, 'x', 0), since: 0 }
    expect(dayCareXp(res, 29 * MIN, data)).toBe(0)
    expect(dayCareXp(res, 30 * MIN, data)).toBe(1)
    expect(dayCareXp(res, 95 * MIN, data)).toBe(3)
    expect(dayCareXp(res, 10_000 * 30 * MIN, data)).toBe(500)
    expect(nextDayCareTick(res, 40 * MIN, data)).toBe(20 * MIN)
    expect(nextDayCareTick(res, 10_000 * 30 * MIN, data)).toBeNull()
  })

  it('levels up with Day Care XP but never evolves; it evolves on its next level-up in battle', () => {
    // Charmander evolves at 16: 500 XP from Lv.14 takes it well past that.
    const res = { inst: createInstance(4, 14, data, 'x', 0), since: 0 }
    const later = 10_000 * 30 * MIN
    const now = residentNow(res, later, data)
    expect(now.level).toBeGreaterThan(16)
    expect(now.dex).toBe(4)

    const s = { ...withMons([14, 20]), dayCare: { residents: [res], eggClaimed: true } }
    const back = withdrawPokemon(s, 'x', data, later)!
    expect(back.inst.dex).toBe(4)
    expect(back.xpGained).toBe(500)
    expect(back.levelsGained).toBe(now.level - 14)
    expect(dayCareOf(back.save).residents).toHaveLength(0)
    expect(back.save.box.some((p) => p.id === 'x')).toBe(true)
  })

  it('hatches only first forms of evolving lines, never starters, favouring species not owned', () => {
    const pool = eggSpecies(data).map((s) => s.dex)
    expect(pool).toContain(16) // Pidgey
    expect(pool).not.toContain(17) // Pidgeotto: evolved form
    expect(pool).not.toContain(128) // Tauros: never evolves
    expect(pool).not.toContain(4) // starter
    expect(pool).not.toContain(150) // legendary

    const s = withMons([10, 10, 10])
    const odds = eggOdds({ ...s, pokedex: [16] }, data)
    expect(odds.find((o) => o.species.dex === 16)!.weight).toBe(1)
    expect(odds.find((o) => o.species.dex === 19)!.weight).toBe(cfg.unownedWeight)
  })

  it('hatches at the 3rd-highest owned level minus 2, never below 5', () => {
    expect(hatchLevel(withMons([40, 30, 25, 10]), data)).toBe(23)
    expect(hatchLevel(withMons([8, 7, 6]), data)).toBe(5)
    expect(hatchLevel(withMons([30, 20]), data)).toBe(18) // fewer than 3: the lowest one
  })

  it('gives one free Egg, then sells them', () => {
    const s = withMons([30, 30, 30])
    const free = hatchEgg(s, data, createRng(1), 0, newId, { free: true })!
    expect(free.paid).toBe(0)
    expect(free.inst.level).toBe(28)
    expect(free.save.box).toHaveLength(4)
    expect(free.joinedTeam).toBe(false) // team of 3 is full → Box
    expect(free.save.pokedex).toContain(free.inst.dex)
    expect(hatchEgg(free.save, data, createRng(1), 0, newId, { free: true })).toBeNull()

    const bought = hatchEgg(free.save, data, createRng(2), 0, newId, { free: false })!
    expect(bought.paid).toBe(cfg.eggPrice)
    expect(bought.save.gold).toBe(free.save.gold - cfg.eggPrice)
    expect(hatchEgg({ ...free.save, gold: cfg.eggPrice - 1 }, data, createRng(2), 0, newId, { free: false })).toBeNull()
  })
})

describe('Day Care in the save file', () => {
  it('keeps residents through a save round-trip, and never lets one also sit in the Box', async () => {
    const { parseSave } = await import('@/save/schema')
    const s = withMons([10, 12])
    const left = depositPokemon(s, s.box[1]!.id, data, 5)!
    const back = parseSave(JSON.parse(JSON.stringify(left)))
    expect(back.ok && back.save.dayCare?.residents.map((r) => r.inst.id)).toEqual([s.box[1]!.id])

    const clash = { ...left, box: [...left.box, left.dayCare!.residents[0]!.inst] }
    const fixed = parseSave(JSON.parse(JSON.stringify(clash)))
    expect(fixed.ok && fixed.save.dayCare?.residents).toEqual([])
  })
})
