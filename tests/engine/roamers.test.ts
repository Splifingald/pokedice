// The roaming legendaries: no area of their own, gated on catching both tower legendaries, once each.
import { describe, expect, it } from 'vitest'
import { createRng, regionOfArea, rollRoamer, type Area, type EncounterContext } from '@/engine'
import { data } from '../fixtures'

const roamers = data.config.roamers
const johtoRoute = data.areas.find((a) => regionOfArea(a) === 'johto' && a.wildPool.length > 0)!
const kantoRoute = data.areas.find((a) => regionOfArea(a) === 'kanto' && a.wildPool.length > 0)!

const ctx = (area: Area, pokedex: number[]): EncounterContext => ({
  area,
  progress: { roundsDone: 0, cleared: false, bossDefeated: false, bossesDefeated: [], gymsDefeated: [] },
  data,
  teamAvgLevel: 40,
  teamHurt: false,
  isFirstInArea: false,
  pokedex,
})

/** How often a roamer turns up over many rolls, as a share. */
function rate(pokedex: number[], area = johtoRoute, n = 60_000): number {
  const rng = createRng(4242)
  let hits = 0
  for (let i = 0; i < n; i++) if (rollRoamer(ctx(area, pokedex), rng)) hits++
  return hits / n
}

describe('roaming legendaries', () => {
  it('is configured for Johto, on the two tower legendaries, at 2% each', () => {
    expect(roamers.regionId).toBe('johto')
    expect(roamers.requires).toEqual([249, 250])
    expect(roamers.dex).toEqual([243, 244, 245])
    expect(roamers.chance).toBe(0.02)
  })

  it('has no area of its own — no wild pool or boss anywhere holds one', () => {
    for (const area of data.areas) {
      for (const w of area.wildPool) expect(roamers.dex).not.toContain(w.dex)
      for (const b of area.legendaryBoss ?? []) expect(roamers.dex).not.toContain(b.dex)
    }
  })

  it('never appears before both Lugia and Ho-Oh are caught', () => {
    expect(rate([])).toBe(0)
    expect(rate([249])).toBe(0)
    expect(rate([250])).toBe(0)
  })

  it('appears only in its own region', () => {
    expect(rate([249, 250], kantoRoute)).toBe(0)
  })

  it('appears at about the configured rate once both are caught', () => {
    // Three roamers rolled independently at 2%: 1 − 0.98³ ≈ 5.9%.
    const expected = 1 - (1 - roamers.chance) ** roamers.dex.length
    expect(rate([249, 250])).toBeGreaterThan(expected * 0.9)
    expect(rate([249, 250])).toBeLessThan(expected * 1.1)
  })

  it('stops appearing once caught, one at a time', () => {
    const two = 1 - (1 - roamers.chance) ** 2
    const one = roamers.chance
    expect(rate([249, 250, 243])).toBeGreaterThan(two * 0.9)
    expect(rate([249, 250, 243])).toBeLessThan(two * 1.1)
    expect(rate([249, 250, 243, 244])).toBeGreaterThan(one * 0.85)
    expect(rate([249, 250, 243, 244])).toBeLessThan(one * 1.15)
    expect(rate([249, 250, 243, 244, 245])).toBe(0)
  })

  it('comes as a boss, so the legendary catch flow and the one-of-a-kind rule apply', () => {
    const rng = createRng(1)
    let found: ReturnType<typeof rollRoamer> = null
    for (let i = 0; i < 5000 && !found; i++) found = rollRoamer(ctx(johtoRoute, [249, 250]), rng)
    expect(found?.kind).toBe('boss')
    if (found?.kind === 'boss') {
      expect(roamers.dex).toContain(found.dex)
      expect(found.level).toBe(roamers.level)
    }
  })
})
