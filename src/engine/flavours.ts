// The region flavours (docs/62): what they share — each one's rules seen once (docs/15 §20), and the weather's turn in
// the one-time pop-ups' queue. Each flavour's own rules are in its module (weather.ts, hordes.ts, trials.ts,
// titans.ts).
import { weatherAt, weatherConfigOf } from './weather'
import type { FlavourKey, GameData, SaveData } from './types'

/** The flavour's rules have been shown to this save. */
export const flavourSeen = (save: SaveData, key: FlavourKey): boolean => !!save.flavours?.seen?.includes(key)

export function markFlavourSeen(save: SaveData, key: FlavourKey): SaveData {
  if (flavourSeen(save, key)) return save
  return { ...save, flavours: { ...save.flavours, seen: [...(save.flavours?.seen ?? []), key] } }
}

/**
 * The weather's rules are due: the player is in an area with weather now (Hoenn's or Galar's, each its own) and hasn't
 * seen that region's yet.
 */
export function weatherRulesDue(save: SaveData, data: GameData, now: number): boolean {
  const area = data.areas.find((a) => a.id === save.currentAreaId)
  if (!area || !weatherAt(area, data, { now, round: save.areaProgress[area.id]?.roundsDone ?? 0, save })) return false
  const of = weatherConfigOf(area, data)
  return !!of && !flavourSeen(save, of.key)
}
