// Cross-generation evolutions wait for their generation.
//
// Kanto is full of Pokémon that gained an evolution in a later game: Golbat into Crobat, Chansey into Blissey, Eevee
// into Umbreon, Onix into Steelix. Those branches sit on the Kanto species rows — same Pokémon — so before this gate a
// level-30 Golbat in a first playthrough turned into a Gen 2 Pokémon, spoiling a region the player had not been
// offered and putting a #169 in a Pokédex that ends at #151.
import { describe, expect, it } from 'vitest'
import {
  createInstance,
  createRng,
  evolutionGate,
  gainXp,
  newSave,
  regionOfSpecies,
  startRegion,
  stoneEvolution,
  getRegion,
  newRegionBlock,
  type SaveData,
} from '@/engine'
import { data, newId } from '../fixtures'

const GOLBAT = 42
const CROBAT = 169
const HAUNTER = 93 // a Kanto branch: must never be held back
const GENGAR = 94
const EEVEE = 133
const UMBREON = 197 // moon-stone, and the moon-stone IS in Kanto — so only the region gate stops it
const VAPOREON = 134

/** A Kanto save, as any first playthrough is. */
const kanto = (): SaveData => newSave(GOLBAT, data, 1, newId)

/** The same player once Johto is open. */
function withJohto(): SaveData {
  const save = kanto()
  const johto = getRegion(data, 'johto')!
  return startRegion(save, johto, newRegionBlock(johto, johto.starters[0]!, data, 1, newId, createInstance))
}

describe('the evolution gate', () => {
  it('knows which generation a species is from', () => {
    expect(regionOfSpecies(data, GOLBAT)).toBe('kanto')
    expect(regionOfSpecies(data, CROBAT)).toBe('johto')
    expect(regionOfSpecies(data, 252)).toBe('hoenn')
    // Nothing outside the ranges, but if content ever runs ahead of the regions table it must not become unobtainable.
    expect(regionOfSpecies(data, 9999)).toBe(null)
    expect(evolutionGate(kanto(), data)(9999)).toBe(true)
  })

  it('allows a region its own generation and refuses the ones it has not reached', () => {
    const allowed = evolutionGate(kanto(), data)
    expect(allowed(GENGAR)).toBe(true)
    expect(allowed(CROBAT)).toBe(false)
    expect(allowed(242)).toBe(false) // Blissey
    expect(allowed(UMBREON)).toBe(false)
  })

  it('opens the later generation once its region is unlocked', () => {
    const allowed = evolutionGate(withJohto(), data)
    expect(allowed(CROBAT)).toBe(true)
    expect(allowed(UMBREON)).toBe(true)
    expect(allowed(GENGAR)).toBe(true)
    expect(allowed(252)).toBe(false) // Hoenn is still ahead
  })
})

describe('levelling up in Kanto', () => {
  /** Level a Pokémon to well past its evolution level and report what it became. */
  const raise = (dex: number, save: SaveData, to = 40): number => {
    let inst = createInstance(dex, 5, data, newId(), 1)
    const rng = createRng(7)
    const allowDex = evolutionGate(save, data)
    for (let i = 0; i < 400 && inst.level < to; i++) {
      inst = gainXp(inst, 5000, data, rng, { owned: save.pokedex, allowDex }).inst
    }
    return inst.dex
  }

  it('does not turn a Golbat into a Crobat', () => {
    expect(raise(GOLBAT, kanto())).toBe(GOLBAT)
  })

  it('does turn it into a Crobat once Johto is open', () => {
    expect(raise(GOLBAT, withJohto())).toBe(CROBAT)
  })

  it('leaves every Kanto evolution exactly as it was', () => {
    // Zubat still becomes Golbat, Charmander still reaches Charizard: the gate is about generations, not levels.
    expect(raise(41, kanto())).toBe(GOLBAT)
    expect(raise(4, kanto())).toBe(6)
    expect(raise(10, kanto())).toBe(12)
    expect(raise(113, kanto())).toBe(113) // Chansey holds, its only branch being Blissey
  })

  it('holds the Day Care back too, not just battle XP', () => {
    // The Day Care levels without evolving, so the gate has nothing to do there — but the next battle level-up must
    // still respect it, which is the same `allowDex` path.
    const held = gainXp(createInstance(GOLBAT, 35, data, newId(), 1), 0, data, createRng(1), {
      allowDex: evolutionGate(kanto(), data),
    })
    expect(held.inst.dex).toBe(GOLBAT)
    expect(held.events.some((e) => e.kind === 'evolve')).toBe(false)
  })
})

describe('stones in Kanto', () => {
  it('refuses a stone whose only branch is a later generation, even when the stone is a Kanto item', () => {
    const eevee = createInstance(EEVEE, 20, data, newId(), 1)
    // The Moon Stone is Kanto's own (Clefairy, Nidorina), so nothing but the region gate stops Umbreon.
    expect(stoneEvolution(eevee, 'moon-stone', data)).toBe(UMBREON) // ungated: the old behaviour
    expect(stoneEvolution(eevee, 'moon-stone', data, evolutionGate(kanto(), data))).toBe(null)
    expect(stoneEvolution(eevee, 'moon-stone', data, evolutionGate(withJohto(), data))).toBe(UMBREON)
  })

  it('still works for the stones Kanto is meant to have', () => {
    const eevee = createInstance(EEVEE, 20, data, newId(), 1)
    expect(stoneEvolution(eevee, 'water-stone', data, evolutionGate(kanto(), data))).toBe(VAPOREON)
    const gloom = createInstance(44, 20, data, newId(), 1)
    expect(stoneEvolution(gloom, 'leaf-stone', data, evolutionGate(kanto(), data))).toBe(45)
    // …and not for the one that leads to Bellossom, which is Johto's.
    expect(stoneEvolution(gloom, 'sun-stone', data, evolutionGate(kanto(), data))).toBe(null)
  })

  it('leaves Haunter alone — a Kanto trade evolution is not a cross-region one', () => {
    const haunter = createInstance(HAUNTER, 30, data, newId(), 1)
    const viaLevel = gainXp(haunter, 100000, data, createRng(3), { allowDex: evolutionGate(kanto(), data) })
    expect([HAUNTER, GENGAR]).toContain(viaLevel.inst.dex)
  })
})

describe('the Kanto Pokédex', () => {
  it('cannot be polluted by an evolution, because no Kanto branch leaves Gen 1 while Kanto is alone', () => {
    const allowed = evolutionGate(kanto(), data)
    const leaks: string[] = []
    for (const s of data.speciesList) {
      if (s.dex > 151) continue
      for (const e of s.evolutions) if (e.toDex > 151 && allowed(e.toDex)) leaks.push(`${s.name} → #${e.toDex}`)
    }
    expect(leaks).toEqual([])
  })

  it('still lets every Kanto evolution through, so the 151 stays completable', () => {
    const allowed = evolutionGate(kanto(), data)
    for (const s of data.speciesList) {
      if (s.dex > 151) continue
      for (const e of s.evolutions) if (e.toDex <= 151) expect(allowed(e.toDex), `${s.name} → #${e.toDex}`).toBe(true)
    }
  })
})
