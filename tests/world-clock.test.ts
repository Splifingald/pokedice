// The small world's clock (docs/21), the store's side: at its end it closes and sends whoever is inside back home;
// switched off it sends them out and keeps their place; mid-fight it waits. What it does wakes the store's listeners —
// itself among them — and that must settle, not loop.
import { afterEach, describe, expect, it } from 'vitest'
import {
  emptyProgress,
  enterWorld,
  heldWorld,
  newSave,
  newSmallWorld,
  regionOf,
  type Area,
  type GameData,
  type Region,
  type SaveData,
  type SmallWorld,
} from '@/engine'
import { BUNDLE } from '@/config/bundle'
import { anchorClock } from '@/store/clock'
import { initialRun, useGame } from '@/store/game'
import { useServerTime } from '@/store/serverTime'
import { settleWorlds } from '@/store/worlds'
import { makeDataWith, newId } from './fixtures'

const T0 = Date.parse('2026-11-01T18:00:00.000Z')
const DAY = 24 * 3_600_000

const REGION: Region = {
  id: 'world-clock',
  name: 'Clock Island',
  orderIndex: 99,
  dexRange: [99999, 99999],
  starters: [63],
  starterLevel: 5,
  leagueAreaId: 'wc-a1',
  nextRegion: null,
  enabled: false,
}
const route1 = BUNDLE.areas.find((a) => a.name === 'Route 1' && (a.regionId ?? 'kanto') === 'kanto')!
const AREA: Area = { ...route1, id: 'wc-a1', name: 'Clock Marsh', regionId: REGION.id, orderIndex: 9001, gyms: [] }
const WORLD: SmallWorld = {
  ...newSmallWorld('clock', REGION.id, new Date(T0).toISOString(), new Date(T0 + 10 * DAY).toISOString()),
  minBadges: 0,
  starters: [63],
}

const dataWith = (access: 'off' | 'all'): GameData =>
  makeDataWith({ regions: [REGION], areas: [AREA] }, { smallWorlds: { access, list: [WORLD] } })

/**
 * Inside the world, a run going in its area, the content known to be the latest, the server's clock at `now` — read
 * through the device's clock (`offset`) and carried on the page's own steady one (`trusted`, the same unless a test
 * moves the device's clock between two readings).
 */
function inside(data: GameData, now: number, trusted = now): SaveData {
  const kanto = newSave(4, data, 0, newId)
  const save = enterWorld(kanto, data, WORLD, 63, T0 + DAY, newId)!
  useGame.setState({
    data,
    save: { ...save, areaProgress: { [AREA.id]: emptyProgress() } },
    contentChecked: true,
    battle: null,
    run: { ...initialRun(), areaId: AREA.id },
  })
  useServerTime.setState({ offset: now - Date.now() })
  anchorClock(trusted, performance.now())
  return save
}

// The clock listens to the store the way startWorldClock has it: every change of save or run wakes it.
let stop: (() => void) | null = null
const listen = () => (stop = useGame.subscribe((s, prev) => (s.save !== prev.save || s.run !== prev.run) && settleWorlds()))
afterEach(() => {
  stop?.()
  stop = null
  useServerTime.setState({ offset: null })
})

describe("the small world's clock", () => {
  it('closes the world at its end: back in Kanto, its block gone, the run reset', () => {
    inside(dataWith('all'), T0 + 11 * DAY)
    listen()
    settleWorlds()
    const { save, run } = useGame.getState()
    expect(regionOf(save!)).toBe('kanto')
    expect(save!.parked?.[REGION.id]).toBeUndefined()
    expect(save!.events?.world).toMatchObject({ id: 'clock', closed: true })
    expect(heldWorld(save!)).toBeNull()
    expect(run.areaId).toBeNull()
  })

  it("never closes it on the device's clock moved past its end between two readings (2026-10-25)", () => {
    // The device says the world is over; the page's own clock since the server's last reading says it isn't.
    inside(dataWith('all'), T0 + 11 * DAY, T0 + 2 * DAY)
    listen()
    settleWorlds()
    const { save } = useGame.getState()
    expect(regionOf(save!)).toBe(REGION.id)
    expect(heldWorld(save!)).toMatchObject({ id: 'clock' })
    expect(save!.parked?.kanto).toBeDefined()
  })

  it('sends the player out of a world switched off, and keeps their place', () => {
    inside(dataWith('off'), T0 + 2 * DAY)
    listen()
    settleWorlds()
    const { save } = useGame.getState()
    expect(regionOf(save!)).toBe('kanto')
    expect(save!.parked?.[REGION.id]?.box[0]?.dex).toBe(63)
    expect(heldWorld(save!)).toMatchObject({ id: 'clock' })
  })

  it('waits for the end of a fight', () => {
    inside(dataWith('all'), T0 + 11 * DAY)
    useGame.setState({ run: { ...useGame.getState().run, phase: 'battle' } })
    settleWorlds()
    expect(regionOf(useGame.getState().save!)).toBe(REGION.id)
  })
})
