// Mega raids (docs/40): after Kalos, an earlier region's raid Pokémon in its Mega or Primal form, a raid of its own in
// the same area. Locked until that raid is caught and Mega Evolution is earned in Kalos; a win gives its gem or orb,
// the only way to get it (never on a Mart's shelf), and nothing to catch. Only with the raid overhaul on.
import { describe, expect, it } from 'vitest'
import {
  applyMegaRaidWin,
  DEFAULT_CONFIG,
  gemShelf,
  getRegion,
  MEGA_RAIDS,
  megaRaidLock,
  newSave,
  progressRaidKey,
  progressRaidOf,
  progressRaids,
  progressRaidState,
  regionCaseOf,
  type GameData,
  type RegionId,
  type SaveData,
} from '@/engine'
import { makeData } from '../fixtures'

const D = DEFAULT_CONFIG
const gemsOn = {
  megaEvolution: { ...D.megaEvolution, gems: { ...D.megaEvolution.gems, access: 'all' as const } },
}
const off: GameData = makeData(gemsOn)
const on: GameData = makeData({ ...gemsOn, raidOverhaul: { access: 'all' } })

let n = 0
const newId = () => `id${++n}`
const cave = on.areas.find((a) => a.legendaryBoss?.some((b) => b.dex === 150 && b.raid))!
const MEWTWO = progressRaidKey(cave.id, 150)
const MEGA_X = progressRaidKey(cave.id, 10043)

/** A save with the first `badges` badges of `region` won (and its league beaten if `league`). */
function withBadges(save: SaveData, region: RegionId, badges: number, league = false): SaveData {
  const progress: Record<string, unknown> = { ...save.areaProgress }
  for (const b of regionCaseOf(on, region, [], false)!.badges.slice(0, badges)) {
    const p = (progress[b.areaId] ?? { gymsDefeated: [] }) as { gymsDefeated: string[] }
    progress[b.areaId] = { ...p, gymsDefeated: [...(p.gymsDefeated ?? []), b.trainerId] }
  }
  if (league) progress[getRegion(on, region)!.leagueAreaId] = { cleared: true, gymsDefeated: [] }
  const block = { ...save, areaProgress: progress as SaveData['areaProgress'] }
  if (region === (save.region ?? 'kanto')) return block
  return { ...save, parked: { ...save.parked, [region]: { ...block, region: undefined } as never } }
}
const start = (): SaveData => newSave(7, on, 1, newId)
const caught = (s: SaveData): SaveData => ({ ...s, events: { ...s.events, raidsDone: [MEWTWO] } })

describe('Mega raids', () => {
  it('one per Mega or Primal form of an earlier region’s raid Pokémon, only with the overhaul on', () => {
    expect(progressRaids(off).some((r) => r.mega)).toBe(false)
    const megas = progressRaids(on).filter((r) => r.mega)
    expect(megas.map((r) => r.dex).sort()).toEqual(Object.keys(MEGA_RAIDS).map(Number).sort())
    for (const r of megas) {
      expect(['kanto', 'johto', 'hoenn', 'sinnoh', 'unova']).toContain(r.region)
      expect(on.items[r.mega!.gem], r.mega!.gem).toBeTruthy()
    }
    expect(progressRaidOf(on, MEGA_X)).toMatchObject({
      dex: 10043,
      areaId: cave.id,
      mega: { base: 150, gem: 'mewtwonite-x' },
    })
    expect(progressRaidOf(off, MEGA_X)).toBeNull()
  })

  it('locked until its raid Pokémon is caught, then until Mega Evolution is earned in Kalos', () => {
    const raid = progressRaidOf(on, MEGA_X)!
    expect(megaRaidLock(start(), on, raid)).toBe('base')
    expect(progressRaidState(start(), on, raid)).toBe('locked')
    expect(megaRaidLock(caught(start()), on, raid)).toBe('kalos')
    const kalos = withBadges(caught(start()), 'kalos', 3)
    expect(megaRaidLock(kalos, on, raid)).toBeNull()
    expect(progressRaidState(kalos, on, raid)).toBe('open')
  })

  it('a win gives its gem, closes it and counts; nothing is caught', () => {
    const raid = progressRaidOf(on, MEGA_X)!
    const s = withBadges(caught(start()), 'kalos', 3)
    const won = applyMegaRaidWin(s, raid)
    expect(won.powers?.gems).toContain('mewtwonite-x')
    expect(won.events?.raidsDone).toContain(MEGA_X)
    expect(won.events?.raidsWon).toBe((s.events?.raidsWon ?? 0) + 1)
    expect(won.box).toEqual(s.box)
    expect(progressRaidState(won, on, raid)).toBe('done')
  })

  it('its gem is never on a Mart’s shelf with the overhaul on', () => {
    const kanto = withBadges(withBadges(start(), 'kalos', 3), 'kanto', 8, true)
    const shelfOff = gemShelf(kanto, off)!.map((r) => r.item.key)
    const shelfOn = gemShelf(kanto, on)!.map((r) => r.item.key)
    expect(shelfOff).toContain('mewtwonite-x')
    expect(shelfOn).not.toContain('mewtwonite-x')
    expect(shelfOn.some((k) => Object.values(MEGA_RAIDS).some((m) => m.gem === k))).toBe(false)
  })
})
