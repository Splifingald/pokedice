// Raid Battles, the day's raid and what a catch does (docs/18 §3, the shared calendar of 2026-10-11): every UTC day has
// one raid, the same for every player (engine/raidCalendar.ts). Anyone with raids open can fight it; a caught raid
// Pokémon joins its home region's Box once its area there is completed, and waits locked until then.
import { areaProgressAnywhere } from './events'
import { createInstance } from './progression'
import { raidOfDay, raidRegion, raidRules, type RaidKindOf } from './raidCalendar'
import { regionOf, worldRegionOf } from './regions'
import type { GameData, PokemonInstance, RaidLock, SaveData, TodayRaid } from './types'

/** Every Pokémon the player has, in any region (Box, team) or at the Day Care. A small world's stay in it. */
function everyInstance(save: SaveData): PokemonInstance[] {
  const world = worldRegionOf(save)
  return [
    ...(regionOf(save) === world ? [] : save.box),
    ...Object.entries(save.parked ?? {}).flatMap(([id, b]) => (id === world ? [] : (b?.box ?? []))),
    ...(save.dayCare?.residents.map((r) => r.inst) ?? []),
  ]
}

/** The raid of this UTC day, from the calendar, as the save keeps it (not caught yet, no tries). */
export function calendarRaid(data: GameData, day: string): TodayRaid | null {
  const r = raidOfDay(data, day)
  return r ? { day, dex: r.dex, shiny: r.shiny, areaId: r.areaId, caught: false, tries: 0 } : null
}

/** The raid stored for this UTC day, if it's today's. */
export const todayRaid = (save: SaveData, day: string): TodayRaid | null => {
  const r = save.events?.raid
  return r && r.day === day ? r : null
}

/** Today's raid is set (a new day replaces yesterday's). */
export function setTodayRaid(save: SaveData, raid: TodayRaid): SaveData {
  return { ...save, events: { ...save.events, raid } }
}

/** A raid Pokémon's area isn't completed yet (in its region, played or not): a catch would wait for it. */
export const raidLocked = (save: SaveData, data: GameData, areaId: string): boolean =>
  !areaProgressAnywhere(save, data, areaId)?.cleared

// ---------------------------------------------------------------------------------------------------------------------
// Fighting it: the team you bring, the tries, and where a caught raid Pokémon goes.

/** A Pokémon fighting in a raid: a clone of one of yours at the raid's team cap at most, full HP. */
export interface RaidMon {
  /** The instance it's cloned from. */
  id: string
  dex: number
  level: number
  shiny: boolean
  nickname?: string
}

/**
 * Your raid team: the three you registered (from any region's Box), or until then the three highest-level Pokémon you
 * have. Each fights as a clone at the raid's team cap at most.
 */
export function raidTeam(save: SaveData, data: GameData): RaidMon[] {
  const cap = data.config.events.raid.teamCap
  const every = everyInstance(save).filter((p) => p.revivesAt == null && !!data.species[p.dex])
  const chosen = (save.events?.raidTeam ?? []).flatMap((id) => every.filter((p) => p.id === id).slice(0, 1))
  const team = chosen.length ? chosen : [...every].sort((a, b) => b.level - a.level).slice(0, 3)
  return team.slice(0, 3).map((p) => ({
    id: p.id,
    dex: p.dex,
    level: Math.min(p.level, cap),
    shiny: !!p.shiny,
    ...(p.nickname && { nickname: p.nickname }),
  }))
}

/** Another try at today's raid (counted when it starts). */
export function countRaidTry(save: SaveData, day: string): SaveData {
  const raid = todayRaid(save, day)
  return raid ? { ...save, events: { ...save.events, raid: { ...raid, tries: raid.tries + 1 } } } : save
}

/** The region a raid Pokémon belongs to: its area's. */
export const raidHomeRegion = (data: GameData, raid: Pick<TodayRaid, 'areaId'>): string => raidRegion(data, raid.areaId)

/**
 * A Pokémon joins a region's Box as a new Pokémon, whatever copies you have: the live save's when it's the region
 * being played (the team takes it if there's room), else that region's parked Box and Pokédex. Null when that region
 * isn't started (neither live nor parked). A raid's catch and a small world's mythical both go home this way.
 */
export function addToRegion(save: SaveData, data: GameData, region: string, inst: PokemonInstance): { save: SaveData; live: boolean } | null {
  if (region === regionOf(save)) {
    const joined = save.team.length < data.config.maxTeamSize
    return {
      save: {
        ...save,
        box: [...save.box, inst],
        pokedex: save.pokedex.includes(inst.dex) ? save.pokedex : [...save.pokedex, inst.dex],
        team: joined ? [...save.team, inst.id] : save.team,
      },
      live: true,
    }
  }
  const block = save.parked?.[region]
  if (!block) return null
  return {
    save: {
      ...save,
      parked: {
        ...save.parked,
        [region]: { ...block, box: [...block.box, inst], pokedex: block.pokedex.includes(inst.dex) ? block.pokedex : [...block.pokedex, inst.dex] },
      },
    },
    live: false,
  }
}

/**
 * A raid Pokémon joins its region's Box (or, that region not started, the one being played), the day's raid's and a
 * progression raid's (docs/24) alike.
 */
export function addRaidMon(
  save: SaveData,
  data: GameData,
  lock: Omit<RaidLock, 'day'>,
  now: number,
  newId: () => string,
  kind: RaidKindOf = 'daily',
) {
  // At the level it was fought at (its own, Admin → Raids, or the default: the day's raid's or a progression raid's).
  const inst = createInstance(lock.dex, raidRules(data, lock.dex, kind, lock.areaId).level, data, newId(), now)
  if (lock.shiny) inst.shiny = true
  const home = raidRegion(data, lock.areaId)
  const res = addToRegion(save, data, home, inst) ?? addToRegion(save, data, regionOf(save), inst)!
  return { save: res.save, region: res.live ? regionOf(save) : home, instId: inst.id, live: res.live }
}

/**
 * Today's raid Pokémon is caught: the raid closes for the day and the count of raids won goes up. With its area
 * completed it joins its region's Box now; otherwise it waits, locked, until that area is completed.
 */
export function applyRaidCatch(
  save: SaveData,
  data: GameData,
  raid: TodayRaid,
  now: number,
  newId: () => string,
): { save: SaveData; region: string; instId: string | null; live: boolean; locked: boolean } {
  const events = { ...save.events, raid: { ...raid, caught: true }, raidsWon: (save.events?.raidsWon ?? 0) + 1 }
  const region = raidRegion(data, raid.areaId)
  if (raidLocked(save, data, raid.areaId)) {
    const lock: RaidLock = { dex: raid.dex, shiny: raid.shiny, areaId: raid.areaId, day: raid.day }
    return {
      save: { ...save, events: { ...events, raidLocked: [...(save.events?.raidLocked ?? []), lock] } },
      region,
      instId: null,
      live: false,
      locked: true,
    }
  }
  const res = addRaidMon({ ...save, events }, data, raid, now, newId)
  return { ...res, locked: false }
}

/** Locked raid catches whose area is now completed join their region's Box. `released` says which, for a message. */
export function releaseRaidLocks(
  save: SaveData,
  data: GameData,
  now: number,
  newId: () => string,
): { save: SaveData; released: (RaidLock & { region: string })[] } {
  const locks = save.events?.raidLocked
  if (!locks?.length) return { save, released: [] }
  let next = save
  const released: (RaidLock & { region: string })[] = []
  const still: RaidLock[] = []
  for (const lock of locks) {
    if (!data.species[lock.dex] || raidLocked(next, data, lock.areaId)) {
      still.push(lock)
      continue
    }
    const res = addRaidMon(next, data, lock, now, newId)
    next = res.save
    released.push({ ...lock, region: res.region })
  }
  if (!released.length) return { save, released }
  const { raidLocked: _all, ...events } = next.events ?? {}
  return { save: { ...next, events: still.length ? { ...events, raidLocked: still } : events }, released }
}

/** Gifts from friends' raids (one of each key): into the live region's bag. Unknown items are skipped. */
export function addRaidGifts(save: SaveData, data: GameData, keys: string[]): SaveData {
  const inventory = { ...save.inventory }
  for (const k of keys) if (data.items[k]) inventory[k] = (inventory[k] ?? 0) + 1
  return { ...save, inventory }
}

/** Saves your raid team: up to three instance ids, in order (any region's Box). */
export function setRaidTeamIds(save: SaveData, ids: string[]): SaveData {
  return { ...save, events: { ...save.events, raidTeam: [...new Set(ids)].slice(0, 3) } }
}
