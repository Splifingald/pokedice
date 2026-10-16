// Small worlds' preview on Home (docs/21 §9): from `previewHours` before the start until the start, greyed, with a
// countdown and a gauge that fills over the window, red in the last hour and blinking in the last five minutes. The
// engine decides all of it; these pin the boundaries.
import { describe, expect, it } from 'vitest'
import {
  enterWorld,
  inPreviewWindow,
  newSave,
  newSmallWorld,
  normaliseWorld,
  PREVIEW_HOURS,
  PREVIEW_HOURS_MAX,
  previewFill,
  previewLeft,
  previewPhase,
  previewState,
  previewWindow,
  worldFor,
  worldPreviewFor,
  worldPreviewOn,
  type EventAccess,
  type GameData,
  type Region,
  type SaveData,
  type SmallWorld,
} from '@/engine'
import { BUNDLE } from '@/config/bundle'
import { makeDataWith, newId } from '../fixtures'

const T0 = Date.parse('2026-11-01T18:00:00.000Z')
const MIN = 60_000
const H = 60 * MIN
const DAY = 24 * H
const iso = (ms: number) => new Date(ms).toISOString()

const REGION: Region = {
  id: 'world-preview',
  name: 'Mirage Island',
  orderIndex: 99,
  dexRange: [99999, 99999],
  starters: [63],
  starterLevel: 5,
  leagueAreaId: 'wp-a1',
  nextRegion: null,
  enabled: false,
}
const route1 = BUNDLE.areas.find((a) => a.name === 'Route 1' && (a.regionId ?? 'kanto') === 'kanto')!
const AREA = {
  ...route1,
  id: 'wp-a1',
  name: 'Mirage Marsh',
  regionId: REGION.id,
  orderIndex: 9001,
  legendaryBoss: null,
  gyms: [],
  hidden: false,
  unlockConditions: null,
}

const WORLD: SmallWorld = {
  ...newSmallWorld('mirage-preview', REGION.id, iso(T0), iso(T0 + 10 * DAY)),
  minBadges: 0,
  starters: [63, 92, 79],
}

function previewData(
  world: Partial<SmallWorld> = {},
  {
    access = 'all',
    preview = 'all',
    admin = false,
  }: { access?: EventAccess; preview?: EventAccess; admin?: boolean } = {},
): GameData {
  const d = makeDataWith(
    { regions: [REGION], areas: [AREA] },
    { smallWorlds: { access, previewAccess: preview, list: [{ ...WORLD, ...world }] } },
  )
  return admin ? { ...d, viewer: { admin: true } } : d
}
const data = previewData()
const kanto = (): SaveData => newSave(4, data, 0, newId)

describe('the preview window', () => {
  it('is 48 hours unless the admin sets it, whole hours from 0 to two weeks', () => {
    expect(PREVIEW_HOURS).toBe(48)
    expect(WORLD.previewHours).toBe(48)
    expect(previewWindow(WORLD)).toBe(48 * H)
    // A world saved before the preview existed gets the default.
    const { previewHours: _, ...old } = WORLD
    expect(normaliseWorld(old).previewHours).toBe(48)
    expect(normaliseWorld({ ...WORLD, previewHours: 12.7 }).previewHours).toBe(12)
    expect(normaliseWorld({ ...WORLD, previewHours: -3 }).previewHours).toBe(0)
    expect(normaliseWorld({ ...WORLD, previewHours: 9999 }).previewHours).toBe(PREVIEW_HOURS_MAX)
    expect(previewWindow({ previewHours: 0 })).toBe(0)
  })

  it('opens exactly N hours before the start and ends at the start', () => {
    expect(inPreviewWindow(WORLD, T0 - 48 * H - 1)).toBe(false)
    expect(inPreviewWindow(WORLD, T0 - 48 * H)).toBe(true)
    expect(inPreviewWindow(WORLD, T0 - 1)).toBe(true)
    expect(inPreviewWindow(WORLD, T0)).toBe(false)
    expect(inPreviewWindow(WORLD, T0 + DAY)).toBe(false)
  })

  it('follows the admin’s hours, and 0 means no preview', () => {
    const w6 = { ...WORLD, previewHours: 6 }
    expect(inPreviewWindow(w6, T0 - 6 * H - 1)).toBe(false)
    expect(inPreviewWindow(w6, T0 - 6 * H)).toBe(true)
    expect(inPreviewWindow({ ...WORLD, previewHours: 0 }, T0 - MIN)).toBe(false)
  })

  it('never previews a world with bad dates', () => {
    expect(inPreviewWindow({ ...WORLD, end: WORLD.start }, T0 - H)).toBe(false)
    expect(inPreviewWindow({ ...WORLD, start: 'soon' }, T0 - H)).toBe(false)
  })
})

describe('the countdown, the gauge and its phase', () => {
  it('counts down to the start, never below 0', () => {
    expect(previewLeft(WORLD, T0 - 48 * H)).toBe(48 * H)
    expect(previewLeft(WORLD, T0 - 90 * MIN)).toBe(90 * MIN)
    expect(previewLeft(WORLD, T0)).toBe(0)
    expect(previewLeft(WORLD, T0 + H)).toBe(0)
  })

  it('fills from empty at N hours to full at the start', () => {
    expect(previewFill(WORLD, T0 - 48 * H)).toBe(0)
    expect(previewFill(WORLD, T0 - 24 * H)).toBe(0.5)
    expect(previewFill(WORLD, T0 - 12 * H)).toBe(0.75)
    expect(previewFill(WORLD, T0)).toBe(1)
    // Outside the window it stays within 0–1.
    expect(previewFill(WORLD, T0 - 100 * H)).toBe(0)
    expect(previewFill({ ...WORLD, previewHours: 0 }, T0 - H)).toBe(0)
  })

  it('is the world’s colour, red from the last hour, blinking from the last five minutes (both included)', () => {
    expect(previewPhase(WORLD, T0 - 48 * H)).toBe('normal')
    expect(previewPhase(WORLD, T0 - H - 1)).toBe('normal')
    expect(previewPhase(WORLD, T0 - H)).toBe('red')
    expect(previewPhase(WORLD, T0 - 5 * MIN - 1)).toBe('red')
    expect(previewPhase(WORLD, T0 - 5 * MIN)).toBe('blink')
    expect(previewPhase(WORLD, T0 - 1)).toBe('blink')
    expect(previewState(WORLD, T0 - H)).toEqual({ left: H, fill: 1 - 1 / 48, phase: 'red' })
  })
})

describe('who sees it', () => {
  it('shows the world in its window, then hands over to the live square at the start', () => {
    const s = kanto()
    expect(worldPreviewFor(s, data, null)).toBeNull()
    expect(worldPreviewFor(s, data, T0 - 48 * H - 1)).toBeNull()
    expect(worldPreviewFor(s, data, T0 - 48 * H)?.id).toBe(WORLD.id)
    expect(worldPreviewFor(s, data, T0 - 1)?.id).toBe(WORLD.id)
    expect(worldFor(s, data, T0 - 1)).toBeNull()
    // The start: the preview is gone and the world is live, at the same instant.
    expect(worldPreviewFor(s, data, T0)).toBeNull()
    expect(worldFor(s, data, T0)?.id).toBe(WORLD.id)
  })

  it('follows its own switch, Off by default, on top of the worlds’ own', () => {
    const s = kanto()
    const at = T0 - H
    const unset = makeDataWith(
      { regions: [REGION], areas: [AREA] },
      { smallWorlds: { access: 'all', list: [WORLD] } },
    )
    expect(worldPreviewOn(unset)).toBe(false)
    expect(worldPreviewFor(s, unset, at)).toBeNull()
    expect(worldPreviewFor(s, previewData({}, { preview: 'off' }), at)).toBeNull()
    expect(worldPreviewFor(s, previewData({}, { preview: 'admin' }), at)).toBeNull()
    expect(worldPreviewFor(s, previewData({}, { preview: 'admin', admin: true }), at)?.id).toBe(WORLD.id)
    // A preview of a world the player couldn't enter would be a promise the game can't keep.
    expect(worldPreviewFor(s, previewData({}, { access: 'off' }), at)).toBeNull()
    expect(worldPreviewFor(s, previewData({}, { access: 'admin', preview: 'all' }), at)).toBeNull()
  })

  it('follows the live square’s rules: its badges, the main save, outside a world, its region known', () => {
    const s = kanto()
    const at = T0 - H
    expect(worldPreviewFor(s, previewData({ minBadges: 1 }), at)).toBeNull()
    expect(worldPreviewFor({ ...s, mode: 'extreme' }, data, at)).toBeNull()
    expect(worldPreviewFor(s, previewData({ regionId: 'nowhere' }), at)).toBeNull()
    const other: SmallWorld = { ...WORLD, id: 'other', start: iso(T0 - 20 * DAY), end: iso(T0 - 5 * H) }
    const both = makeDataWith(
      { regions: [REGION], areas: [AREA] },
      { smallWorlds: { access: 'all', previewAccess: 'all', list: [other, WORLD] } },
    )
    const inside = enterWorld(s, both, { ...other, end: iso(T0 + DAY) }, 63, T0 - 6 * H, newId)
    expect(inside).not.toBeNull()
    expect(worldPreviewFor(inside!, both, at)).toBeNull()
  })

  it('picks the soonest world when two are in their windows', () => {
    const later: SmallWorld = {
      ...WORLD,
      id: 'later',
      start: iso(T0 + 11 * DAY),
      end: iso(T0 + 20 * DAY),
      previewHours: PREVIEW_HOURS_MAX,
    }
    const d = makeDataWith(
      { regions: [REGION], areas: [AREA] },
      { smallWorlds: { access: 'all', previewAccess: 'all', list: [later, WORLD] } },
    )
    expect(worldPreviewFor(kanto(), d, T0 - H)?.id).toBe(WORLD.id)
    // While the first runs, the next one previews (its own square comes after the live one).
    expect(worldPreviewFor(kanto(), d, T0 + 2 * DAY)?.id).toBe('later')
  })
})
