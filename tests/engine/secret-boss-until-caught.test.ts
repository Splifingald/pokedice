// A small world's secret area, played plainly (docs/64 §2.1, the user's call of 2026-11-21): its boss, beaten and not
// caught, is the challenge again, straight away, until caught; caught, the area closes for good. Evergreen Hill's shiny
// Delibird ("Cadoizo") was the case: it came back as one card of a whole new round, and the hill never closed.
import { describe, expect, it } from 'vitest'
import {
  dueBoss,
  emptyProgress,
  enterWorld,
  isAreaClosed,
  newSave,
  progressRaidKey,
  worldSecrets,
  type AreaProgress,
  type SaveData,
  type SmallWorld,
} from '@/engine'
import { snowglobe } from '../../scripts/content-snowglobe-valley'
import { makeDataWith, newId } from '../fixtures'

const h = snowglobe()
const HILL = h.areas.find((a) => a.name === 'Evergreen Hill')!
const GLADE = h.areas.find((a) => a.name === 'Moonlit Glade')!
const DELIBIRD = 225
const NOW = Date.parse('2026-12-26T12:00:00.000Z')
const world: SmallWorld = { ...h.world, minBadges: 0, previewHours: 48 }
const dataWith = (tracks: 'off' | 'all') =>
  makeDataWith(
    { areas: h.areas, regions: [h.region] },
    { smallWorlds: { access: 'all', list: [world] }, tracks: { access: tracks } },
  )
const data = dataWith('off')

/** Inside the world, with this progress on Evergreen Hill (its round done). */
function onHill(patch: Partial<AreaProgress>, areaId = HILL.id, d = data): SaveData {
  const s = enterWorld(newSave(4, d, 0, newId), d, world, 10103, NOW, newId)!
  const p: AreaProgress = { ...emptyProgress(), roundsDone: 1, cleared: true, ...patch }
  return { ...s, currentAreaId: areaId, areaProgress: { ...s.areaProgress, [areaId]: p } }
}
const progress = (s: SaveData, id = HILL.id) => s.areaProgress[id]!

describe('a small world’s secret area: its boss until caught', () => {
  it('beaten and not caught: the shiny Delibird is the challenge again, every time', () => {
    const s = onHill({ bossesDefeated: [DELIBIRD] })
    expect(dueBoss(HILL, progress(s), 30, data)?.dex).toBe(DELIBIRD)
    expect(isAreaClosed(s, HILL.id, data)).toBe(false)
  })

  it('caught: no challenge any more, and the hill closes for good', () => {
    const s = onHill({ bossesDefeated: [DELIBIRD], bossesCaught: [DELIBIRD] })
    expect(dueBoss(HILL, progress(s), 30, data)).toBeNull()
    expect(isAreaClosed(s, HILL.id, data)).toBe(true)
  })

  it('before its first fight, as before: due once the round is done, the hill open', () => {
    expect(dueBoss(HILL, progress(onHill({})), 30, data)?.dex).toBe(DELIBIRD)
    expect(dueBoss(HILL, progress(onHill({ roundsDone: 0, cleared: false })), 30, data)).toBeNull()
    expect(isAreaClosed(onHill({}), HILL.id, data)).toBe(false)
  })

  it('an area playing its own mode closes its own way: the glade waits for its outro (docs/64 §4.1)', () => {
    const on = dataWith('all')
    const stantler = GLADE.legendaryBoss![0]!.dex
    const s = onHill({ bossesDefeated: [stantler], bossesCaught: [stantler] }, GLADE.id, on)
    expect(isAreaClosed(s, GLADE.id, on)).toBe(false)
    // Its mode off, it is a plain secret area: caught, closed.
    expect(isAreaClosed(s, GLADE.id, data)).toBe(true)
  })
})

describe('a secret area’s prizes on Home (the user’s call, 2026-11-22)', () => {
  const PILLAR = h.areas.find((a) => a.name === 'Spear Pillar')!
  it('Spear Pillar shows both shiny Dialga and Palkia, caught only once both are', () => {
    const s = onHill({})
    const row = worldSecrets(s, data, world).find((x) => x.area.id === PILLAR.id)!
    expect(row.bosses.map((b) => b.dex)).toEqual([483, 484])
    expect(row.boss?.dex).toBe(483)
    expect(row.caught).toBe(false)
    const one = { ...s, events: { ...s.events, raidsDone: [progressRaidKey(PILLAR.id, 484)] } }
    expect(worldSecrets(one, data, world).find((x) => x.area.id === PILLAR.id)!.caught).toBe(false)
    const both = { ...s, events: { ...s.events, raidsDone: [483, 484].map((d) => progressRaidKey(PILLAR.id, d)) } }
    expect(worldSecrets(both, data, world).find((x) => x.area.id === PILLAR.id)!.caught).toBe(true)
  })

  it('an area with one prize keeps it alone (Evergreen Hill’s Delibird)', () => {
    const row = worldSecrets(onHill({}), data, world).find((x) => x.area.id === HILL.id)!
    expect(row.bosses.map((b) => b.dex)).toEqual([DELIBIRD])
  })
})
