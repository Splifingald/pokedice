// A small world's secret area, played plainly (docs/64 §2.1, the user's call of 2026-11-21): its boss, beaten and not
// caught, is the challenge again, straight away, until caught; caught, the area closes for good. Evergreen Hill's shiny
// Delibird ("Cadoizo") was the case: it came back as one card of a whole new round, and the hill never closed.
import { describe, expect, it } from 'vitest'
import {
  areaForRound,
  challengeEncounter,
  createRng,
  deckAbilities,
  deckCounts,
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

  it('caught: the hill stays open and is played again, a plain Delibird at the end of each run (the user’s call, 2026-11-23)', () => {
    // Just caught: its run starts afresh from the rounds done (noteBossCaught's replayFrom).
    const s = onHill({ bossesDefeated: [DELIBIRD], bossesCaught: [DELIBIRD], replayFrom: 1 })
    expect(isAreaClosed(s, HILL.id, data)).toBe(false)
    expect(dueBoss(HILL, progress(s), 30, data)).toBeNull()
    // Its round played again: Delibird is due, a plain one (only the wild odds could make it shiny).
    const after = onHill({ bossesDefeated: [DELIBIRD], bossesCaught: [DELIBIRD], replayFrom: 1, roundsDone: 2 })
    expect(dueBoss(HILL, progress(after), 30, data)?.dex).toBe(DELIBIRD)
    const enc = challengeEncounter(HILL, progress(after), data, 30, null, createRng(1), 0)
    expect(enc).toMatchObject({ kind: 'boss', dex: DELIBIRD })
    expect((enc as { shiny?: boolean }).shiny).toBeUndefined()
  })

  it('a replay deals one Gift card, not three (the user’s call, 2026-11-23)', () => {
    const on = makeDataWith(
      { areas: h.areas, regions: [h.region] },
      { smallWorlds: { access: 'all', list: [world] }, giftCard: { ...data.config.giftCard, access: 'all' } },
    )
    const count = (s: SaveData) => deckCounts(areaForRound(HILL, progress(s), on).encounterWeights, deckAbilities(HILL, on)).gift
    expect(count(onHill({}, HILL.id, on))).toBe(3)
    expect(count(onHill({ bossesDefeated: [DELIBIRD], bossesCaught: [DELIBIRD] }, HILL.id, on))).toBe(1)
  })

  it('before its first fight, as before: due once the round is done, the hill open', () => {
    expect(dueBoss(HILL, progress(onHill({})), 30, data)?.dex).toBe(DELIBIRD)
    expect(dueBoss(HILL, progress(onHill({ roundsDone: 0, cleared: false })), 30, data)).toBeNull()
    expect(isAreaClosed(onHill({}), HILL.id, data)).toBe(false)
  })

  it('an area playing its own mode has its own way: the glade replays after its outro; off, a plain replay', () => {
    const on = dataWith('all')
    const stantler = GLADE.legendaryBoss![0]!.dex
    const s = onHill({ bossesDefeated: [stantler], bossesCaught: [stantler] }, GLADE.id, on)
    expect(isAreaClosed(s, GLADE.id, on)).toBe(false)
    // Its mode off, it is a plain secret area: caught, it is played again too.
    expect(isAreaClosed(s, GLADE.id, data)).toBe(false)
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
