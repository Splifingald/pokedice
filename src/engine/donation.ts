// "Keep the game alive": Prof. Oak asks for help with the hosting costs once per region, when its 5th badge is won.
// The admin switches it on, sets the PayPal link and can reset it (bumping `round`), which shows it once more to
// everyone who has already seen it.
import { regionCases } from './regions'
import type { GameData, RegionId, SaveData } from './types'

/** Badges a region needs before its pop-up shows. */
export const DONATION_BADGES = 5

/** A web address the PayPal button may open (nothing else: no javascript: or data: links). */
export const isDonationUrl = (url: string): boolean => /^https?:\/\/\S+$/i.test(url.trim())

/** The PayPal link, when it is a web address the button may open; null otherwise. */
export function donationUrl(data: GameData): string | null {
  const url = String(data.config.donation.paypalUrl ?? '').trim()
  return isDonationUrl(url) ? url : null
}

/** Switched on in Admin with a usable link: only then does the pop-up (or the Settings button) exist. */
export const donationEnabled = (data: GameData): boolean => data.config.donation.enabled && !!donationUrl(data)

/** The regions shown already in the current round (an older round's list no longer counts). */
function seenRegions(save: SaveData, data: GameData): RegionId[] {
  const seen = save.donationSeen
  return seen && seen.round === data.config.donation.round ? seen.regions : []
}

/** Regions holding 5+ badges whose pop-up hasn't been shown this round. Empty while it is off or has no link. */
export function donationRegionsDue(save: SaveData, data: GameData): RegionId[] {
  if (!donationEnabled(data)) return []
  const seen = seenRegions(save, data)
  return regionCases(save, data)
    .filter((r) => r.earned >= DONATION_BADGES && !seen.includes(r.id))
    .map((r) => r.id)
}

export const donationDue = (save: SaveData, data: GameData): boolean => donationRegionsDue(save, data).length > 0

/** The pop-up was closed: every region due now counts as shown, until the admin's next reset. */
export function markDonationSeen(save: SaveData, data: GameData): SaveData {
  const due = donationRegionsDue(save, data)
  if (!due.length) return save
  return { ...save, donationSeen: { round: data.config.donation.round, regions: [...seenRegions(save, data), ...due] } }
}
