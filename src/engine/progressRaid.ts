// Progression raids (docs/24, the user's design of 2026-10-12): every area boss but the mythicals is a raid, fought in
// its own area once the area is completed (like a gym leader once the rounds are done), and the only way to catch it.
// Unlimited tries; a catch closes it for good. Your team for a raid comes from the Box of that raid's region and stays
// on it: friends bring it to their own raid of that Pokémon. The fight itself is the day's raid's (engine/raidBattle.ts).
import { raidBosses, shinyLocked } from './encounters'
import { areaProgressAnywhere } from './events'
import { portalModeOf } from './portalMode'
import { nightmareModeOf } from './nightmareMode'
import { addRaidMon, type RaidMon } from './raid'
import { raidRules } from './raidCalendar'
import { inWorldRegion, isWorldRegion, regionOf, regionOfArea } from './regions'
import type { Area, BossDef, GameData, PokemonInstance, RegionId, SaveData } from './types'

/** One progression raid: an area's raid boss. */
export interface ProgressRaid {
  /** `areaId:dex`: what the save, the server and a friend's team for it are keyed by. */
  key: string
  dex: number
  areaId: string
  region: RegionId
  boss: BossDef
}

export const progressRaidKey = (areaId: string, dex: number): string => `${areaId}:${dex}`

const raidOf = (area: Area, boss: BossDef): ProgressRaid => ({
  key: progressRaidKey(area.id, boss.dex),
  dex: boss.dex,
  areaId: area.id,
  region: regionOfArea(area),
  boss,
})

/** An area's progression raids, in its own order (none while Raid Battles are off for the player). */
export const progressRaidsIn = (data: GameData, area: Area): ProgressRaid[] =>
  raidBosses(area, data).map((b) => raidOf(area, b))

/** Every progression raid of a region (or of the game), in area order. */
export function progressRaids(data: GameData, region?: RegionId): ProgressRaid[] {
  return data.areas
    .filter((a) => !region || regionOfArea(a) === region)
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .flatMap((a) => progressRaidsIn(data, a))
}

/**
 * Its colours: an always-shiny boss (the red Gyarados) stays shiny as a raid; legendaries never are (shinyLocked), but
 * in a small world, whose shiny raids are its prizes (docs/26 §2.5: Darkrai, Giratina).
 */
export const progressRaidShiny = (data: GameData, raid: ProgressRaid): boolean =>
  !!raid.boss.shiny && (!shinyLocked(data, raid.dex) || isWorldRegion(data, raid.region))

/** The progression raid a key names, if it is one (a stale link or a boss that isn't a raid any more: null). */
export function progressRaidOf(data: GameData, key: string): ProgressRaid | null {
  const at = key.lastIndexOf(':')
  const area = at > 0 ? data.areas.find((a) => a.id === key.slice(0, at)) : undefined
  const dex = Number(key.slice(at + 1))
  if (!area || !Number.isInteger(dex)) return null
  return progressRaidsIn(data, area).find((r) => r.dex === dex) ?? null
}

/**
 * A raid is fought where it belongs: a small world's (docs/21) from inside that world only, tied to it like the rest of
 * the world (its Box, its catch); a real region's from outside any world.
 */
export function progressRaidReachable(save: SaveData, data: GameData, raid: ProgressRaid): boolean {
  return inWorldRegion(save, data) ? raid.region === regionOf(save) : !isWorldRegion(data, raid.region)
}

/** A region's Pokédex: the live one when it's the region being played, else its parked one. */
function regionPokedex(save: SaveData, region: RegionId): readonly number[] {
  return region === regionOf(save) ? save.pokedex : (save.parked?.[region]?.pokedex ?? [])
}

/**
 * `locked`: its area isn't completed yet (in its region, played or parked). `open`: fight it. `done`: caught — in the
 * raid, or in its boss fight before raids (beaten there, and in that region's Pokédex): it counts, and the player can
 * still leave a team on it for their friends.
 */
export type ProgressRaidState = 'locked' | 'open' | 'done'

export function progressRaidState(save: SaveData, data: GameData, raid: ProgressRaid): ProgressRaidState {
  const progress = areaProgressAnywhere(save, data, raid.areaId)
  if (save.events?.raidsDone?.includes(raid.key)) return 'done'
  // A portal area's raid (docs/28) opens once its run is won, never with the area's rounds.
  if (portalModeOf(data.areas.find((a) => a.id === raid.areaId), data)) return progress?.portal?.won ? 'open' : 'locked'
  // So does a nightmare area's (docs/30), once the player has woken up from it.
  if (nightmareModeOf(data.areas.find((a) => a.id === raid.areaId), data))
    return progress?.nightmare?.won ? 'open' : 'locked'
  if (progress?.bossesDefeated.includes(raid.dex) && regionPokedex(save, raid.region).includes(raid.dex))
    return 'done'
  return progress?.cleared ? 'open' : 'locked'
}

/** The area's next raid to fight, if any: Home's CONTINUE offers it like a gym leader's challenge. */
export function openRaidIn(save: SaveData, data: GameData, area: Area): ProgressRaid | null {
  return progressRaidsIn(data, area).find((r) => progressRaidState(save, data, r) === 'open') ?? null
}

/** A region's Pokémon able to fight: its team and Box (the live save's or the parked one's), none resting (Extreme). */
export function regionBox(save: SaveData, region: RegionId): PokemonInstance[] {
  const box = region === regionOf(save) ? save.box : (save.parked?.[region]?.box ?? [])
  return box.filter((p) => p.revivesAt == null)
}

/**
 * Your team for a progression raid: the three left on it (`events.raidTeams`), or until then that region's three
 * highest levels. Only that region's Box, each fighting as a copy with its own dice and rerolls, its HP at the
 * raid's team cap at most.
 */
export function progressRaidTeam(save: SaveData, data: GameData, raid: ProgressRaid): RaidMon[] {
  const box = regionBox(save, raid.region).filter((p) => !!data.species[p.dex])
  const chosen = (save.events?.raidTeams?.[raid.key] ?? []).flatMap((id) =>
    box.filter((p) => p.id === id).slice(0, 1),
  )
  const team = chosen.length ? chosen : [...box].sort((a, b) => b.level - a.level).slice(0, 3)
  return team
    .slice(0, 3)
    .map((p) => ({ id: p.id, dex: p.dex, level: p.level, shiny: !!p.shiny }))
}

/** Leaves a team on a progression raid: up to three ids from its region's Box. */
export function setProgressRaidTeam(save: SaveData, key: string, ids: string[]): SaveData {
  return {
    ...save,
    events: {
      ...save.events,
      raidTeams: { ...save.events?.raidTeams, [key]: [...new Set(ids)].slice(0, 3) },
    },
  }
}

/**
 * A progression raid's Pokémon is caught: it joins its region's Box at once (its area is completed, or the raid
 * wouldn't be open), the raid closes for good, and the count of raids won goes up.
 */
export function applyProgressRaidCatch(
  save: SaveData,
  data: GameData,
  raid: ProgressRaid,
  now: number,
  newId: () => string,
): { save: SaveData; region: string; instId: string; live: boolean } {
  const done = [...new Set([...(save.events?.raidsDone ?? []), raid.key])]
  const events = { ...save.events, raidsDone: done, raidsWon: (save.events?.raidsWon ?? 0) + 1 }
  const res = addRaidMon(
    { ...save, events },
    data,
    { dex: raid.dex, shiny: progressRaidShiny(data, raid), areaId: raid.areaId },
    now,
    newId,
    'progress',
  )
  return { save: res.save, region: res.region, instId: res.instId, live: res.live }
}

/** A progression raid's numbers (its own, then the progression default, then the raid's). */
export const progressRaidRules = (data: GameData, raid: ProgressRaid) => raidRules(data, raid.dex, 'progress', raid.areaId)
