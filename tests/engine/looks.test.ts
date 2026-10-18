// Trainer looks (docs/31): every region's set, what unlocks each look (Pokémon caught in the region's Pokédex, an
// area reached, its League, its full Pokédex), the red dot's count, and a look not unlocked coming off while the
// admin's switch is on.
import { describe, expect, it } from 'vitest'
import {
  createInstance,
  getRegion,
  linearAreas,
  lookStates,
  LOOKS,
  looksOn,
  markLooksSeen,
  newLooks,
  newRegionBlock,
  newSave,
  regionSpecies,
  settleLook,
  startRegion,
  unlockedLooks,
  wearLook,
  type AreaProgress,
  type LookState,
  type SaveData,
} from '@/engine'
import { data as offData, makeData, newId } from '../fixtures'

const data = makeData({ looks: { access: 'all' } })

const kanto = (): SaveData => ({
  ...newSave(4, data, 1, newId),
  player: { name: 'Sam', character: 'red' },
})

const state = (save: SaveData, id: string): LookState => lookStates(save, data).find((s) => s.def.id === id)!

const cleared: AreaProgress = {
  roundsDone: 9,
  cleared: true,
  bossDefeated: true,
  bossesDefeated: [],
  gymsDefeated: [],
}

/** The first `n` areas of a region's chain cleared, so the next one is open. */
function clearChain(save: SaveData, region: string, n: number): SaveData {
  const progress = { ...save.areaProgress }
  for (const a of linearAreas(data, region).slice(0, n)) progress[a.id] = cleared
  return { ...save, areaProgress: progress }
}

const caught = (save: SaveData, region: string, n: number): SaveData => ({
  ...save,
  pokedex: [...regionSpecies(data, region)].slice(0, n),
})

describe('the sets', () => {
  it('are Red and Leaf, then 10 to 20 looks per region, 138 in all, each id once', () => {
    expect(LOOKS.slice(0, 2).map((l) => l.id)).toEqual(['red', 'green'])
    expect(LOOKS.length).toBe(138)
    expect(new Set(LOOKS.map((l) => l.id)).size).toBe(LOOKS.length)
    const per = Object.fromEntries(
      data.regions.map((r) => [r.id, LOOKS.filter((l) => l.region === r.id).length]),
    )
    expect(per).toMatchObject({
      kanto: 20,
      johto: 13,
      hoenn: 18,
      sinnoh: 14,
      unova: 20,
      kalos: 10,
      alola: 12,
      galar: 13,
      paldea: 16,
    })
  })

  it('give each region its Youngster at 10 caught, its heroes for the League and a reward for the full Pokédex', () => {
    for (const r of data.regions.filter((r) => LOOKS.some((l) => l.region === r.id))) {
      const own = LOOKS.filter((l) => l.region === r.id)
      expect(own.find((l) => l.id === `${r.id}/youngster`)?.unlock).toEqual({ kind: 'catch', count: 10 })
      expect(own.filter((l) => l.unlock.kind === 'champion').length).toBeGreaterThanOrEqual(1)
      expect(own.filter((l) => l.unlock.kind === 'complete').length).toBeGreaterThanOrEqual(1)
    }
  })

  it('only ask to reach areas of their own region', () => {
    for (const l of LOOKS) {
      if (l.unlock.kind !== 'reach') continue
      const id = l.unlock.areaId
      expect(data.areas.find((a) => a.id === id)?.regionId ?? 'kanto', l.id).toBe(l.region)
    }
  })

  it('leave out Gym Leaders, the Elite Four, Champions and villain teams', () => {
    const banned =
      /champion|elite|leader|rocket|grunt|giovanni|boss|lance|brock|misty|cynthia|steven|lysandre|guzma/
    expect(LOOKS.filter((l) => banned.test(l.id)).map((l) => l.id)).toEqual([])
  })
})

describe('the switch', () => {
  it('is off by default', () => {
    expect(looksOn(offData)).toBe(false)
    expect(looksOn(data)).toBe(true)
  })
})

describe('what unlocks a look', () => {
  it('a new game: Red and Leaf, and Kanto started with nothing else yet; other regions not started', () => {
    const save = kanto()
    expect([...unlockedLooks(save, data)].sort()).toEqual(['green', 'red'].sort())
    // The starter is the first Pokémon caught.
    expect(state(save, 'kanto/youngster')).toMatchObject({ open: false, started: true, have: 1, need: 10 })
    expect(state(save, 'johto/youngster')).toMatchObject({ open: false, started: false })
  })

  it("Pokémon caught in the region's own Pokédex", () => {
    const save = caught(kanto(), 'kanto', 10)
    expect(state(save, 'kanto/youngster')).toMatchObject({ open: true, have: 10, need: 10 })
    expect(state(save, 'kanto/lass')).toMatchObject({ open: false, have: 10, need: 20 })
    // Another region's species don't count for Kanto.
    const johtoOnly = {
      ...kanto(),
      pokedex: [...regionSpecies(data, 'johto')].filter((d) => d > 151).slice(0, 30),
    }
    expect(state(johtoOnly, 'kanto/youngster').have).toBe(0)
  })

  it('an area reached: open as soon as the area before it is cleared; how many areas away until then', () => {
    const chain = linearAreas(data, 'kanto')
    const forest = chain.findIndex((a) => a.name === 'Viridian Forest')
    expect(state(kanto(), 'kanto/bug-catcher')).toMatchObject({ open: false, areasAway: forest })
    expect(state(clearChain(kanto(), 'kanto', forest - 1), 'kanto/bug-catcher')).toMatchObject({
      areasAway: 1,
    })
    expect(state(clearChain(kanto(), 'kanto', forest), 'kanto/bug-catcher').open).toBe(true)
  })

  it("the region's League: its two heroes", () => {
    const league = getRegion(data, 'kanto')!.leagueAreaId
    const save = { ...kanto(), areaProgress: { [league]: cleared } }
    expect(state(save, 'kanto/chase').open).toBe(true)
    expect(state(save, 'kanto/elaine').open).toBe(true)
  })

  it('the whole Pokédex page of the region', () => {
    const all = regionSpecies(data, 'kanto').size
    expect(state(caught(kanto(), 'kanto', all - 1), 'kanto/red-gen1')).toMatchObject({
      open: false,
      need: all,
    })
    expect(state(caught(kanto(), 'kanto', all), 'kanto/red-gen1').open).toBe(true)
  })

  it("a parked region's progress still counts, and a region started shows its goals", () => {
    const johto = getRegion(data, 'johto')!
    const before = caught(kanto(), 'kanto', 20)
    const save = startRegion(
      before,
      johto,
      newRegionBlock(johto, johto.starters[0]!, data, 1, newId, createInstance),
    )
    expect(save.region).toBe('johto')
    expect(state(save, 'kanto/lass').open).toBe(true)
    expect(state(save, 'johto/youngster')).toMatchObject({ started: true, open: false })
  })
})

describe('the red dot', () => {
  it('counts looks unlocked and not seen yet, never Red or Leaf, and none while the switch is off', () => {
    const save = caught(kanto(), 'kanto', 20)
    expect(newLooks(save, save, data).sort()).toEqual(['kanto/lass', 'kanto/youngster'])
    expect(newLooks(save, save, offData)).toEqual([])
    const seen = markLooksSeen(save, save, data)!
    expect(newLooks(seen, seen, data)).toEqual([])
    expect(markLooksSeen(seen, seen, data)).toBeNull()
  })
})

describe('wearing a look', () => {
  it('only one that is unlocked', () => {
    const save = caught(kanto(), 'kanto', 10)
    expect(wearLook(save, save, data, 'kanto/lass')).toBeNull()
    expect(wearLook(save, save, data, 'kanto/youngster')?.player?.avatar).toBe('kanto/youngster')
    expect(wearLook(save, save, data, 'green')?.player?.avatar).toBe('green')
  })

  it("comes off while the switch is on when it isn't unlocked: back to the character", () => {
    const hiker = { ...kanto(), player: { name: 'Sam', character: 'green' as const, avatar: 'kanto/hiker' } }
    expect(settleLook(hiker, hiker, data).player).toEqual({ name: 'Sam', character: 'green' })
    // Off, the old free list stays as it was.
    expect(settleLook(hiker, hiker, offData)).toBe(hiker)
    // Unlocked, it stays on.
    const young = {
      ...caught(kanto(), 'kanto', 10),
      player: { name: 'Sam', character: 'red' as const, avatar: 'kanto/youngster' },
    }
    expect(settleLook(young, young, data)).toBe(young)
  })

  it("in the Extreme save, the main save's progress decides", () => {
    const main = caught(kanto(), 'kanto', 10)
    const extreme = {
      ...kanto(),
      mode: 'extreme' as const,
      player: { name: 'Sam', character: 'red' as const, avatar: 'kanto/youngster' },
    }
    expect(settleLook(extreme, main, data)).toBe(extreme)
    expect(settleLook(extreme, extreme, data).player?.avatar).toBeUndefined()
  })
})
