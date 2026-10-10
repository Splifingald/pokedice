// Raid Battles, the day's raid (docs/18 §3, docs/19 §6.1–6.2): every UTC day one raid Pokémon, picked from the
// player's raid pool (the mythicals whose areas they've cleared) while one is still to catch, then those mythicals'
// shinies, then a powerful Pokémon of a region they've reached (30 % shiny). Never a species raided in the last 72 h,
// unless nothing else is left. The pick is stored with the day, so a reload never changes it.
import { daysBetween } from './eventTime'
import { areaProgressAnywhere } from './events'
import { createInstance } from './progression'
import { regionOf, regionOfArea } from './regions'
import { createRng } from './rng'
import type { GameData, RaidPoolEntry, SaveData, TodayRaid } from './types'

/** Every region the player has started: the live one and the parked ones. */
const startedRegions = (save: SaveData): string[] => [regionOf(save), ...Object.keys(save.parked ?? {})]

/** Every Pokémon the player has, in any region (Box, team) or at the Day Care. */
function everyInstance(save: SaveData) {
  return [
    ...save.box,
    ...Object.values(save.parked ?? {}).flatMap((b) => b?.box ?? []),
    ...(save.dayCare?.residents.map((r) => r.inst) ?? []),
  ]
}

/** The species is in a Pokédex, any region's. */
export function ownedAnywhere(save: SaveData, dex: number): boolean {
  return save.pokedex.includes(dex) || Object.values(save.parked ?? {}).some((b) => b?.pokedex.includes(dex))
}

/** A shiny of the species is in a Box (or at the Day Care), any region's. */
export const shinyOwned = (save: SaveData, dex: number): boolean => everyInstance(save).some((p) => p.dex === dex && p.shiny)

/**
 * The raid pool: the pool mythicals whose area the player has cleared (any region). One already caught counts too, so
 * a save from before the raids keeps what it had.
 */
export function raidPool(save: SaveData, data: GameData): RaidPoolEntry[] {
  return data.config.events.raid.pool.filter(
    (p) => !!areaProgressAnywhere(save, data, p.areaId)?.cleared || ownedAnywhere(save, p.dex) || !!save.events?.raidPool?.includes(p.dex),
  )
}

/** The pool entry whose area this is (its raid unlocks when the area clears), if any. */
export const raidUnlockedBy = (data: GameData, areaId: string): RaidPoolEntry[] =>
  data.config.events.raid.pool.filter((p) => p.areaId === areaId)

export interface RaidCandidate {
  dex: number
  shiny: boolean
  /** The area the raid is fought in front of: the one that unlocked it, or where a fallback species lives. */
  areaId: string
}

/** Where a fallback species is fought: an area of its region where it lives, else that region's League. */
function fallbackArea(data: GameData, dex: number, regionId: string): string | null {
  const inRegion = data.areas.filter((a) => regionOfArea(a) === regionId)
  const home = inRegion.find((a) => a.wildPool.some((w) => w.dex === dex && w.weight > 0))
  return home?.id ?? data.regions.find((r) => r.id === regionId)?.leagueAreaId ?? inRegion[0]?.id ?? null
}

/**
 * Today's candidates, in the order the rules ask for them: the pool's mythicals not caught yet; once every pool species
 * is caught, the pool's shinies not owned; otherwise the fallback species of the regions reached. Species raided within
 * the repeat window are left out while anything else is left (a fallback pick rolls its shiny in pickRaid).
 */
export function raidCandidates(
  save: SaveData,
  data: GameData,
  day: string,
): { kind: 'pool' | 'shiny' | 'fallback'; list: RaidCandidate[] } {
  const cfg = data.config.events.raid
  const recent = new Set(
    (save.events?.raidHistory ?? [])
      .filter((h) => h.day !== day && daysBetween(h.day, day) * 24 < cfg.repeatHours)
      .map((h) => h.dex),
  )
  const fresh = <T extends { dex: number }>(xs: T[]) => {
    const kept = xs.filter((x) => !recent.has(x.dex))
    return kept.length ? kept : xs
  }
  const pool = raidPool(save, data)
  const toCatch = pool.filter((p) => !ownedAnywhere(save, p.dex))
  if (toCatch.length) return { kind: 'pool', list: fresh(toCatch).map((p) => ({ dex: p.dex, shiny: false, areaId: p.areaId })) }
  const allCaught = cfg.pool.every((p) => ownedAnywhere(save, p.dex))
  const shinies = pool.filter((p) => !shinyOwned(save, p.dex))
  if (allCaught && shinies.length) return { kind: 'shiny', list: fresh(shinies).map((p) => ({ dex: p.dex, shiny: true, areaId: p.areaId })) }
  const reached = new Set(startedRegions(save))
  const fallback = cfg.fallback
    .filter((f) => reached.has(f.regionId) && data.species[f.dex])
    .flatMap((f) => {
      const areaId = fallbackArea(data, f.dex, f.regionId)
      return areaId ? [{ dex: f.dex, shiny: false, areaId }] : []
    })
  return { kind: 'fallback', list: fresh(fallback) }
}

/** A number from a string (the day and who's playing), so a guest's pick is the same all day. */
function seedOf(text: string): number {
  let h = 2166136261
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return h >>> 0
}

/** Picks today's raid from the candidates: one at random, a fallback one shiny at `fallbackShiny`. Null when none. */
export function pickRaid(save: SaveData, data: GameData, day: string, who: string): TodayRaid | null {
  const { kind, list } = raidCandidates(save, data, day)
  if (!list.length) return null
  const rng = createRng(seedOf(`${who}:${day}`))
  const c = rng.pick(list)
  const shiny = kind === 'shiny' || (kind === 'fallback' && rng.next() < data.config.events.raid.fallbackShiny)
  return { day, dex: c.dex, shiny, areaId: c.areaId, caught: false, tries: 0 }
}

/** The raid stored for this UTC day, if it's today's. */
export const todayRaid = (save: SaveData, day: string): TodayRaid | null => {
  const r = save.events?.raid
  return r && r.day === day ? r : null
}

/** Today's raid is set: stored, and remembered in the history the repeat window reads (a week of it is kept). */
export function setTodayRaid(save: SaveData, raid: TodayRaid): SaveData {
  const history = [...(save.events?.raidHistory ?? []).filter((h) => h.day !== raid.day && daysBetween(h.day, raid.day) < 7), { day: raid.day, dex: raid.dex }]
  return { ...save, events: { ...save.events, raid, raidHistory: history } }
}

// ---------------------------------------------------------------------------------------------------------------------
// Fighting it (phase 5): the team you bring, the tries, and where a caught raid Pokémon goes.

/** A Pokémon fighting in a raid: a clone of one of yours at the raid's team cap at most, full HP. */
export interface RaidMon {
  /** The instance it's cloned from. */
  id: string
  dex: number
  level: number
  shiny: boolean
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
  return team.slice(0, 3).map((p) => ({ id: p.id, dex: p.dex, level: Math.min(p.level, cap), shiny: !!p.shiny }))
}

/** Another try at today's raid (counted when it starts). */
export function countRaidTry(save: SaveData, day: string): SaveData {
  const raid = todayRaid(save, day)
  return raid ? { ...save, events: { ...save.events, raid: { ...raid, tries: raid.tries + 1 } } } : save
}

/** The region a raid Pokémon belongs to: its lair's (or, for a fallback raid, the region of the area it's fought in). */
export function raidHomeRegion(data: GameData, raid: Pick<TodayRaid, 'areaId'>): string {
  const area = data.areas.find((a) => a.id === raid.areaId)
  return area ? regionOfArea(area) : (data.regions[0]?.id ?? 'kanto')
}

/**
 * Today's raid Pokémon is caught: the raid closes for the day, the count of raids won goes up, and the Pokémon joins
 * its home region's Box (D3) as a new Pokémon, whatever copies you have: the live save's when it's the region being
 * played (the team takes it if there's room), else that region's parked Box and Pokédex.
 */
export function applyRaidCatch(
  save: SaveData,
  data: GameData,
  raid: TodayRaid,
  now: number,
  newId: () => string,
): { save: SaveData; region: string; instId: string; live: boolean } {
  const level = data.config.events.raid.level
  const inst = createInstance(raid.dex, level, data, newId(), now)
  if (raid.shiny) inst.shiny = true
  const home = raidHomeRegion(data, raid)
  const block = home === regionOf(save) ? null : save.parked?.[home]
  const events = { ...save.events, raid: { ...raid, caught: true }, raidsWon: (save.events?.raidsWon ?? 0) + 1 }
  if (!block) {
    const joined = save.team.length < data.config.maxTeamSize
    return {
      save: {
        ...save,
        events,
        box: [...save.box, inst],
        pokedex: save.pokedex.includes(raid.dex) ? save.pokedex : [...save.pokedex, raid.dex],
        team: joined ? [...save.team, inst.id] : save.team,
      },
      region: regionOf(save),
      instId: inst.id,
      live: true,
    }
  }
  return {
    save: {
      ...save,
      events,
      parked: {
        ...save.parked,
        [home]: { ...block, box: [...block.box, inst], pokedex: block.pokedex.includes(raid.dex) ? block.pokedex : [...block.pokedex, raid.dex] },
      },
    },
    region: home,
    instId: inst.id,
    live: false,
  }
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
