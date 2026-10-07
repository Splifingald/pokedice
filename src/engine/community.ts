// The community Discord: a button in the player menu, there only once the admin has set the invite link.
import { isDonationUrl } from './donation'
import type { GameData } from './types'

/** The Discord invite, when it is a web address the button may open; null otherwise (no button). */
export function discordUrl(data: GameData): string | null {
  const url = String(data.config.discordUrl ?? '').trim()
  return isDonationUrl(url) ? url : null
}
