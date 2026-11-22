// The player cap (docs/74): at most `cap` players in the game at once, the rest waiting in line. The server decides
// who is in (migration 0157); the game reads the settings only to show the rules' numbers.
import { DEFAULT_CONFIG } from './defaults'
import { eventOpenTo } from './events'
import type { GameData, PlayerCapConfig } from './types'

/** The settings as stored over the defaults (a row from before a key keeps the default's). */
export const playerCapOf = (data: GameData): PlayerCapConfig => ({
  ...DEFAULT_CONFIG.ccu,
  ...data.config.ccu,
})

/** Whether the line can be met by this player: On for everyone, or On for admin and this is the admin. */
export const playerCapOn = (data: GameData): boolean => eventOpenTo(playerCapOf(data).access, data)
