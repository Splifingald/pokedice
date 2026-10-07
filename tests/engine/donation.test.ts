// "Keep the game alive": the donation pop-up's trigger (5th badge, once per region) and the admin's reset.
import { describe, expect, it } from 'vitest'
import {
  badgeCase,
  createInstance,
  donationDue,
  donationRegionsDue,
  donationUrl,
  markDonationSeen,
  newRegionBlock,
  newSave,
  regionOf,
  startRegion,
  type DonationConfig,
  type GameData,
  type SaveData,
} from '@/engine'
import { parseSave } from '@/save/schema'
import { makeData, newId } from '../fixtures'

const on = (patch: Partial<DonationConfig> = {}): GameData =>
  makeData({ donation: { enabled: true, paypalUrl: 'https://paypal.me/pokedice', round: 0, ...patch } })

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

describe('donation pop-up', () => {
  const data = on()
  const fresh = newSave(4, data, 1000, newId)

  it('is off by default', () => {
    const d = makeData()
    expect(d.config.donation.enabled).toBe(false)
    expect(donationDue(withBadges(newSave(4, d, 1000, newId), d, 8), d)).toBe(false)
  })

  it('fires with the 5th badge of a region, not before', () => {
    expect(donationDue(withBadges(fresh, data, 4), data)).toBe(false)
    expect(donationRegionsDue(withBadges(fresh, data, 5), data)).toEqual(['kanto'])
  })

  it('stays hidden without a web link to open', () => {
    const save = withBadges(fresh, data, 5)
    for (const paypalUrl of ['', '   ', 'paypal.me/x', 'javascript:alert(1)']) {
      expect(donationUrl(on({ paypalUrl }))).toBeNull()
      expect(donationDue(save, on({ paypalUrl }))).toBe(false)
    }
    expect(donationUrl(on({ paypalUrl: ' https://www.paypal.com/donate?id=1 ' }))).toBe('https://www.paypal.com/donate?id=1')
  })

  it('shows once per region', () => {
    const seen = markDonationSeen(withBadges(fresh, data, 5), data)
    expect(seen.donationSeen).toEqual({ round: 0, regions: ['kanto'] })
    expect(donationDue(withBadges(seen, data, 8), data)).toBe(false)
    // Nothing due: the save is left as it is.
    expect(markDonationSeen(seen, data)).toBe(seen)
  })

  it('fires again with the next region’s 5th badge', () => {
    const seen = markDonationSeen(withBadges(fresh, data, 8), data)
    const johto = inJohto(seen, data)
    expect(regionOf(johto)).toBe('johto')
    expect(donationDue(withBadges(johto, data, 4), data)).toBe(false)
    const due = withBadges(johto, data, 5)
    expect(donationRegionsDue(due, data)).toEqual(['johto'])
    expect(markDonationSeen(due, data).donationSeen).toEqual({ round: 0, regions: ['kanto', 'johto'] })
  })

  it('the admin’s reset shows it once more to everyone who qualifies', () => {
    const seen = markDonationSeen(withBadges(inJohto(withBadges(fresh, data, 8), data), data, 5), data)
    const reset = on({ round: 1 })
    // A parked region's badges count too.
    expect(donationRegionsDue(seen, reset)).toEqual(['kanto', 'johto'])
    const again = markDonationSeen(seen, reset)
    expect(again.donationSeen).toEqual({ round: 1, regions: ['kanto', 'johto'] })
    expect(donationDue(again, reset)).toBe(false)
  })

  it('what was seen survives a save round-trip', () => {
    const seen = markDonationSeen(withBadges(fresh, data, 5), data)
    const parsed = parseSave(JSON.parse(JSON.stringify(seen)))
    expect(parsed.ok && parsed.save.donationSeen).toEqual({ round: 0, regions: ['kanto'] })
  })
})
