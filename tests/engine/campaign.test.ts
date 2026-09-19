import { describe, expect, it } from 'vitest'
import { linearAreas, mergeAreaReports, runCampaign, runCampaignSync, type CampaignOptions } from '@/engine'
import { data, makeData } from '../fixtures'

// Fewer AI samples keep these runs quick; the loop is what's under test, not the AI.
const fast = makeData({ ai: { samples: 20, rerollGainThreshold: 0.08 } })
const base: CampaignOptions = { encounters: 80, seed: 3, starterDex: 4, spend: true, multiExp: true }

describe('campaign simulator', () => {
  it('plays a new game along the chain, reproducibly', () => {
    const a = runCampaignSync(fast, base)
    expect(runCampaignSync(fast, base)).toEqual(a)
    expect(a.timeline).toHaveLength(80)
    expect(a.areas[0]!.areaId).toBe(linearAreas(fast)[0]!.id)
    expect(a.areas.reduce((s, r) => s + r.encounters, 0)).toBe(80)
    for (const r of a.areas) {
      expect(r.turns).toHaveLength(r.fights)
      expect(r.wins + r.wipes + r.stalemates).toBe(r.fights)
      expect(Object.values(r.kinds).reduce((s, n) => s + n, 0)).toBe(r.encounters)
    }
    expect(a.end.team.length).toBeGreaterThanOrEqual(1)
    expect(a.end.dex).toBeGreaterThanOrEqual(1)
  })

  it('reports progress as it goes', () => {
    const gen = runCampaign(fast, { ...base, encounters: 20 })
    const seen: number[] = []
    let step = gen.next()
    while (!step.done) {
      seen.push(step.value)
      step = gen.next()
    }
    expect(seen.length).toBeGreaterThan(1)
    expect(seen.every((v, i) => v > 0 && v <= 1 && (i === 0 || v >= seen[i - 1]!))).toBe(true)
    expect(step.value.timeline).toHaveLength(20)
  })

  it('area test: stays in the chosen area with the given team and tracks', () => {
    const forest = fast.areas.find((a) => a.name === 'Viridian Forest')!
    const r = runCampaignSync(fast, { ...base, encounters: 40, areaId: forest.id, team: [{ dex: 6, level: 30 }], track: 3, spend: false })
    expect(r.areas.map((a) => a.areaId)).toEqual([forest.id])
    expect(r.end.team[0]).toMatchObject({ dex: 6 })
    expect(r.end.comboLevels.pair).toBe(3)
    expect(r.areas[0]!.wins).toBeGreaterThan(0)
    expect(r.areas[0]!.toClear).not.toBeNull() // a Lv.30 Charizard clears the Forest, Brock included
  })

  it('merges several runs per area', () => {
    const runs = [1, 2].map((seed) => runCampaignSync(fast, { ...base, encounters: 30, seed }).areas)
    const merged = mergeAreaReports(runs)
    const first = merged[0]!
    expect(first.visits).toBe(2)
    expect(first.encounters).toBe(runs[0]![0]!.encounters + runs[1]![0]!.encounters)
    expect(first.turns).toHaveLength(runs[0]![0]!.turns.length + runs[1]![0]!.turns.length)
  })
})

describe('a mutual knock-out', () => {
  it('ends a trainer gauntlet instead of sending out nobody', () => {
    // Kanto on these seeds used to throw "No able Pokémon to send out": the last team member fainted as it won the
    // gauntlet's second battle, and the third started with nobody standing.
    for (const [starterDex, seed] of [[1, 6], [7, 1], [7, 4]] as const) {
      expect(() =>
        runCampaignSync(data, { encounters: 900, seed, starterDex, spend: true, multiExp: true, regionId: 'kanto' }),
      ).not.toThrow()
    }
  })

  it('runs every region on every starter without throwing', () => {
    for (const region of data.regions) {
      for (const starterDex of region.starters) {
        expect(() =>
          runCampaignSync(data, { encounters: 200, seed: 3, starterDex, spend: true, multiExp: true, regionId: region.id }),
        ).not.toThrow()
      }
    }
  })
})
