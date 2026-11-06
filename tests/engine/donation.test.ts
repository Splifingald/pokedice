// "Support me": the donation pop-up's trigger (the user's rule, 2026-11-06): after the third session, 5 minutes into
// one, at least 1 badge, once a day, and the sessions themselves (a new one after 30 minutes away).
import { describe, expect, it } from 'vitest'
import {
  badgeCase,
  createInstance,
  donationEnabled,
  donationUrl,
  newRegionBlock,
  newSave,
  SESSION_GAP_MS,
  startRegion,
  SUPPORT_SESSION_DELAY_MS,
  supportPopupDue,
  touchSession,
  type DonationConfig,
  type GameData,
  type SaveData,
  type SupportSession,
} from '@/engine'
import { makeData, newId } from '../fixtures'

const on = (patch: Partial<DonationConfig> = {}): GameData =>
  makeData({ donation: { enabled: true, kofiUrl: 'https://ko-fi.com/pokedice', monthlyGoal: 0, currency: 'EUR', startMonth: '', raisedBefore: 0, round: 0, ...patch } })

/** The first `n` badges of the live region, won. */
function withBadges(save: SaveData, data: GameData, n: number): SaveData {
  const areaProgress = { ...save.areaProgress }
  for (const b of badgeCase(save, data).slice(0, n)) {
    const p = areaProgress[b.areaId] ?? { roundsDone: 0, cleared: false, bossDefeated: false, bossesDefeated: [], gymsDefeated: [] }
    areaProgress[b.areaId] = { ...p, gymsDefeated: [...p.gymsDefeated, b.trainerId] }
  }
  return { ...save, areaProgress }
}

/** Kanto's league won and Johto started: Kanto is parked with everything it had. */
function inJohto(save: SaveData, data: GameData): SaveData {
  const kanto = data.regions.find((r) => r.id === 'kanto')!
  const johto = data.regions.find((r) => r.id === 'johto')!
  const league = { roundsDone: 9, cleared: true, bossDefeated: true, bossesDefeated: [], gymsDefeated: [] }
  const won = { ...save, areaProgress: { ...save.areaProgress, [kanto.leagueAreaId]: league } }
  return startRegion(won, johto, newRegionBlock(johto, 152, data, 1, newId, createInstance))
}

const MIN = 60_000
const TODAY = '2026-11-06'
/** The 4th session, started at 0. */
const fourth: SupportSession = { count: 4, startedAt: 0, lastSeen: 0, shownDay: null }

describe('donation pop-up', () => {
  const data = on()
  const fresh = newSave(4, data, 1000, newId)
  const one = withBadges(fresh, data, 1)
  const due = (save: SaveData, d = data, session: SupportSession | null = fourth, now = 5 * MIN, today = TODAY) =>
    supportPopupDue(save, d, session, now, today)

  it('is off by default', () => {
    const d = makeData()
    expect(d.config.donation.enabled).toBe(false)
    expect(due(withBadges(newSave(4, d, 1000, newId), d, 8), d)).toBe(false)
  })

  it('exists (for the Settings button too) only when switched on with a link', () => {
    expect(donationEnabled(data)).toBe(true)
    expect(donationEnabled(makeData())).toBe(false)
    expect(donationEnabled(on({ enabled: false }))).toBe(false)
    expect(donationEnabled(on({ kofiUrl: '' }))).toBe(false)
  })

  it('stays hidden without a web link to open', () => {
    for (const kofiUrl of ['', '   ', 'ko-fi.com/x', 'javascript:alert(1)']) {
      expect(donationUrl(on({ kofiUrl }))).toBeNull()
      expect(due(one, on({ kofiUrl }))).toBe(false)
    }
    expect(donationUrl(on({ kofiUrl: ' https://ko-fi.com/pokedice?ref=1 ' }))).toBe('https://ko-fi.com/pokedice?ref=1')
  })

  it('needs a badge won', () => {
    expect(due(fresh)).toBe(false)
    expect(due(one)).toBe(true)
  })

  it('counts a parked region’s badges too', () => {
    expect(due(inJohto(fresh, data))).toBe(false)
    expect(due(inJohto(one, data))).toBe(true)
  })

  it('opens after the third session, not during it', () => {
    expect(due(one, data, { ...fourth, count: 3 })).toBe(false)
    expect(due(one, data, fourth)).toBe(true)
    expect(due(one, data, null)).toBe(false)
  })

  it('waits 5 minutes into the session', () => {
    expect(due(one, data, fourth, SUPPORT_SESSION_DELAY_MS - 1)).toBe(false)
    expect(due(one, data, fourth, SUPPORT_SESSION_DELAY_MS)).toBe(true)
  })

  it('opens once a day', () => {
    const shown = { ...fourth, shownDay: TODAY }
    expect(due(one, data, shown)).toBe(false)
    expect(due(one, data, shown, 5 * MIN, '2026-11-07')).toBe(true)
  })
})

describe('sessions', () => {
  it('the first visit is the first session', () => {
    expect(touchSession(null, 100)).toEqual({ count: 1, startedAt: 100, lastSeen: 100, shownDay: null })
  })

  it('a reload or a short break carries the session on', () => {
    const s = touchSession(null, 0)
    const later = touchSession(s, SESSION_GAP_MS)
    expect(later).toEqual({ ...s, lastSeen: SESSION_GAP_MS })
  })

  it('half an hour away starts the next one, keeping the day it last showed', () => {
    const s = { ...touchSession(null, 0), shownDay: TODAY }
    const next = touchSession(s, SESSION_GAP_MS + 1)
    expect(next).toEqual({ count: 2, startedAt: SESSION_GAP_MS + 1, lastSeen: SESSION_GAP_MS + 1, shownDay: TODAY })
  })

  it('a clock moved back starts a new one rather than never reaching its 5 minutes', () => {
    const s = touchSession(null, 10 * MIN)
    expect(touchSession(s, 0)).toMatchObject({ count: 2, startedAt: 0 })
  })
})
