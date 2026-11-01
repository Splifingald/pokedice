// The region flavours in the game (docs/62): what the engine says about the place the player is in, once the server
// has confirmed the feature's switch (side_quest_open, migration 0115). A guest's switch can only be "On for everyone".
import { progressOf, weatherAt, weatherConfigOf, type Area, type GameData, type SaveData, type Weather } from '@/engine'
import { useGame } from './game'
import { useNow } from './hooks'
import { serverNow, useServerNow } from './serverTime'
import { sideQuestKnown } from './sideQuests'

/** The weather in this area now (docs/62 §2): Hoenn's fixed weather or Galar's of the day; null with none. */
export function weatherHere(save: SaveData | null, data: GameData, area: Area | null | undefined): Weather | null {
  if (!area) return null
  const w = weatherAt(area, data, { now: serverNow() ?? Date.now(), round: save ? progressOf(save, area.id).roundsDone : 0, save })
  const of = w ? weatherConfigOf(area, data) : null
  return w && of && sideQuestKnown(of.key, true) ? w : null
}

/** Re-read twice a minute: Galar's day turns over within 30 s. */
const TICK_MS = 30_000

/** The weather in an area as the screens show it (its chip, its fights), following the clock. */
export function useWeatherHere(areaId: string | null | undefined): Weather | null {
  const area = useGame((s) => (areaId ? s.data.areas.find((a) => a.id === areaId) : undefined))
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  useNow(TICK_MS)
  useServerNow(TICK_MS)
  return weatherHere(save, data, area)
}
