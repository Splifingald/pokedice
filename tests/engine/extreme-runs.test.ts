// Extreme mode as a speedrun (docs/48): the regions open by the main save's Leagues, one run per region on a real-time
// timer, restarts that keep the best time, and a race with no online features.
import { describe, expect, it } from 'vitest'
import {
  beginRun,
  DEFAULT_CONFIG,
  eventOn,
  extremeOpen,
  extremeRegions,
  getRegion,
  isDayCareOpen,
  newSave,
  offeredRegion,
  openRun,
  progressOf,
  raceData,
  regionOf,
  runOf,
  runState,
  runTime,
  runsWon,
  sendTargets,
  settleRuns,
  versusUnlocked,
  type GameData,
  type RegionId,
  type SaveData,
} from '@/engine'
import { parseSave } from '@/save/schema'
import { makeData, newId } from '../fixtures'

const ON = makeData({ extreme: { ...DEFAULT_CONFIG.extreme, access: 'all' } })
const H = 3_600_000

/** A save whose League of `region` is beaten (its block live or parked). */
function leagueWon(save: SaveData, data: GameData, region: RegionId): SaveData {
  const r = getRegion(data, region)!
  const won = { ...progressOf(save, r.leagueAreaId), cleared: true }
  if (regionOf(save) === region)
    return { ...save, areaProgress: { ...save.areaProgress, [r.leagueAreaId]: won } }
  const block = save.parked?.[region] ?? {
    gold: 0,
    pokedex: [],
    box: [],
    team: [],
    inventory: {},
    comboLevels: save.comboLevels,
    dieLevels: save.dieLevels,
    currentAreaId: r.leagueAreaId,
    areaProgress: {},
  }
  return {
    ...save,
    parked: {
      ...save.parked,
      [region]: { ...block, areaProgress: { ...block.areaProgress, [r.leagueAreaId]: won } },
    },
  }
}

const main = () => newSave(4, ON, 0, newId)
const starter = (region: RegionId) => getRegion(ON, region)!.starters[0]!

describe('which regions open', () => {
  it("Kanto's League opens Extreme mode, and each League its region's run", () => {
    expect(DEFAULT_CONFIG.extreme.unlockRegion).toBe('kanto')
    const fresh = main()
    expect(extremeOpen(fresh, ON)).toBe(false)
    expect(extremeRegions(fresh, ON)).toEqual([])
    const kanto = leagueWon(fresh, ON, 'kanto')
    expect(extremeOpen(kanto, ON)).toBe(true)
    expect(extremeRegions(kanto, ON).map((r) => r.id)).toEqual(['kanto'])
    const both = leagueWon(kanto, ON, 'johto')
    expect(extremeRegions(both, ON).map((r) => r.id)).toEqual(['kanto', 'johto'])
  })

  it('nothing while Extreme mode is off, nor from an Extreme save', () => {
    const kanto = leagueWon(main(), ON, 'kanto')
    expect(extremeRegions(kanto, makeData())).toEqual([])
    expect(extremeRegions({ ...kanto, mode: 'extreme' }, ON)).toEqual([])
  })
})

describe('a run', () => {
  it('a first run is a new Extreme save in that region alone, its timer from the start', () => {
    const player = { name: 'Sam', character: 'red' as const }
    const x = beginRun(null, ON, 'johto', starter('johto'), 1000, newId, player)!
    expect(x.mode).toBe('extreme')
    expect(regionOf(x)).toBe('johto')
    expect(x.parked ?? {}).toEqual({})
    expect(x.box[0]!.dex).toBe(starter('johto'))
    expect(x.player).toEqual(player)
    expect(runOf(x, 'johto')).toMatchObject({ startedAt: 1000 })
    expect(runState(x, 'johto')).toBe('running')
    expect(runState(x, 'kanto')).toBe('none')
    expect(runTime(runOf(x, 'johto')!, 1000 + 2 * H)).toBe(2 * H)
  })

  it('a second region joins the save; the first is parked as it was, and can be played again', () => {
    const k = beginRun(null, ON, 'kanto', starter('kanto'), 0, newId)!
    const both = beginRun(k, ON, 'johto', starter('johto'), 50, newId)!
    expect(regionOf(both)).toBe('johto')
    expect(both.parked?.kanto?.box[0]!.dex).toBe(starter('kanto'))
    expect(runOf(both, 'kanto')!.startedAt).toBe(0)
    const back = openRun(both, 'kanto')!
    expect(regionOf(back)).toBe('kanto')
    expect(openRun(back, 'hoenn')).toBeNull()
  })

  it('winning the League stops the timer and keeps the best time', () => {
    const x = beginRun(null, ON, 'kanto', starter('kanto'), 0, newId)!
    expect(settleRuns(x, ON, 5 * H)).toBe(x)
    const won = settleRuns(leagueWon(x, ON, 'kanto'), ON, 5 * H)
    expect(runOf(won, 'kanto')).toMatchObject({ finishedAt: 5 * H, best: 5 * H })
    expect(runState(won, 'kanto')).toBe('won')
    expect(runsWon(x, won)).toEqual(['kanto'])
    // Time stands still from there.
    expect(runTime(runOf(won, 'kanto')!, 99 * H)).toBe(5 * H)
    expect(settleRuns(won, ON, 9 * H)).toBe(won)
    // The real time unknown: nothing moves.
    expect(settleRuns(leagueWon(x, ON, 'kanto'), ON, null).extreme?.runs?.kanto?.finishedAt).toBeUndefined()
  })

  it('a restart wipes the run and starts the timer again; the best time stays until beaten', () => {
    const x = beginRun(null, ON, 'kanto', starter('kanto'), 0, newId)!
    const won = settleRuns(leagueWon(x, ON, 'kanto'), ON, 5 * H)
    const again = beginRun(won, ON, 'kanto', 7, 10 * H, newId)!
    const run = runOf(again, 'kanto')!
    expect(run).toMatchObject({ startedAt: 10 * H, best: 5 * H })
    expect(run.finishedAt).toBeUndefined()
    expect(run.id).not.toBe(runOf(won, 'kanto')!.id)
    expect(again.box).toHaveLength(1)
    expect(again.box[0]!.dex).toBe(7)
    expect(progressOf(again, getRegion(ON, 'kanto')!.leagueAreaId).cleared).toBe(false)
    // Slower this time: the best stays. Faster: it's the new best.
    expect(runOf(settleRuns(leagueWon(again, ON, 'kanto'), ON, 16 * H), 'kanto')!.best).toBe(5 * H)
    expect(runOf(settleRuns(leagueWon(again, ON, 'kanto'), ON, 13 * H), 'kanto')!.best).toBe(3 * H)
  })

  it('a region played before the runs gets one, its timer from now; its League already won, no time', () => {
    const old: SaveData = { ...newSave(4, ON, 0, newId), mode: 'extreme' }
    const settled = settleRuns(old, ON, 7 * H)
    expect(runOf(settled, 'kanto')).toMatchObject({ startedAt: 7 * H })
    expect(runOf(settled, 'kanto')!.untimed).toBeUndefined()
    const done = settleRuns(leagueWon(old, ON, 'kanto'), ON, 7 * H)
    expect(runOf(done, 'kanto')).toMatchObject({ startedAt: 7 * H, finishedAt: 7 * H, untimed: true })
    expect(runOf(done, 'kanto')!.best).toBeUndefined()
  })

  it('the save keeps its runs through a reload', () => {
    const x = settleRuns(
      leagueWon(beginRun(null, ON, 'kanto', starter('kanto'), 0, newId)!, ON, 'kanto'),
      ON,
      5 * H,
    )
    const parsed = parseSave(JSON.parse(JSON.stringify(x)))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.save.extreme?.runs?.kanto).toEqual(x.extreme!.runs!.kanto)
  })
})

describe('a pure race', () => {
  it('no region offer and nothing sent between runs', () => {
    const k = settleRuns(
      leagueWon(beginRun(null, ON, 'kanto', starter('kanto'), 0, newId)!, ON, 'kanto'),
      ON,
      H,
    )
    expect(offeredRegion(k, ON)).toBeNull()
    expect(offeredRegion(leagueWon(main(), ON, 'kanto'), ON)?.id).toBe('johto')
    const both = beginRun(k, ON, 'johto', starter('johto'), 2 * H, newId)!
    expect(sendTargets(both, ON)).toEqual([])
  })

  it('no Day Care and no Versus in Extreme', () => {
    const x = beginRun(null, ON, 'kanto', starter('kanto'), 0, newId)!
    const many = { ...x, pokedex: Array.from({ length: 400 }, (_, i) => i + 1) }
    expect(isDayCareOpen({ ...many, mode: undefined }, ON)).toBe(true)
    expect(isDayCareOpen(many, ON)).toBe(false)
    const strong = { ...x, box: [1, 4, 7].map((dex, i) => ({ ...x.box[0]!, id: `s${i}`, dex, level: 60 })) }
    expect(versusUnlocked({ ...strong, mode: undefined }, ON)).toBe(true)
    expect(versusUnlocked(strong, ON)).toBe(false)
  })

  it("the page's data has the special events and the live events off", () => {
    const all = makeData({ extreme: { ...DEFAULT_CONFIG.extreme, access: 'all' } })
    expect(eventOn(all, 'wheel')).toBe(true)
    const race = raceData(all)
    expect(eventOn(race, 'wheel')).toBe(false)
    expect(eventOn(race, 'raid')).toBe(false)
    expect(race.config.liveEvents.access).toBe('off')
    expect(raceData(race)).toBe(race)
    // Extreme mode itself stays on.
    expect(race.config.extreme.access).toBe('all')
  })
})
