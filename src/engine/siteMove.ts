// The new address (docs/72): the game moves from poke-dice.netlify.app to pokedice.graf.quest. A browser keeps a save
// per address, so the old one hands the save over (src/lib/siteMove.ts) and the new one says so once (this pop-up).
import { eventOpenTo } from './events'
import type { GameData } from './types'

/** Whether the old address sends this player to the new one, their save with them. */
export const siteMoveOn = (data: GameData): boolean => eventOpenTo(data.config.siteMove?.access, data)
