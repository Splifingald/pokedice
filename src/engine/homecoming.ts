// A small world's Pokémon going home (docs/26 §1): when a world closes, every Pokémon in its team and Box goes to the
// region of its species (Gengar → Kanto, Dusknoir → Sinnoh) and waits there, locked, until an unlocked Pokémon of that
// region reaches its level. Until then it sits apart from the Box (`events.worldHome`): no team, Day Care, raids,
// Versus, trades, gifts or items, and no Pokédex entry; it can only be nicknamed or let go. The day it unlocks it
// arrives the way any Pokémon does (`placeInBox`): it joins, replaces a weaker plain copy in place or merges into a
// stronger one; a shiny is always its own. A region not started yet keeps its Pokémon waiting until it is.
// A Pokémon sent on from another region (docs/05) waits on the same list, under the same lock.
import { isReviving } from './fossils'
import { instanceMaxHp } from './progression'
import { KANTO, isWorldRegion, regionOf, regionOfSpecies, sendOnBlocked, sendTargets } from './regions'
import { placeInBox } from './trade'
import type { GameData, PokemonInstance, RegionId, SaveData, TradeOutcome, WorldHomer } from './types'

/** The region a species goes home to: its generation's (a form's own region), never a small world. */
export const speciesHome = (data: GameData, dex: number): RegionId => regionOfSpecies(data, dex) ?? KANTO

/** The region has been started: it is the one being played or it is parked in the save. */
const started = (save: SaveData, region: RegionId) => region === regionOf(save) || !!save.parked?.[region]

/** The Pokémon waiting to unlock, every region's (empty when none). */
export const worldHomers = (save: Pick<SaveData, 'events'>): WorldHomer[] => save.events?.worldHome ?? []

/** The ones waiting in this region (shown in its Box with their lock), highest level first. */
export const homersIn = (save: Pick<SaveData, 'events'>, region: RegionId): WorldHomer[] =>
  worldHomers(save)
    .filter((h) => h.region === region)
    .sort((a, b) => b.inst.level - a.inst.level || a.inst.dex - b.inst.dex)

/**
 * The level a locked Pokémon waits for there: the best of that region's own Pokémon, its team and Box and its Day Care
 * residents (the "Best Lv." that secret areas count), the waiting ones left out. 0 for a region not started.
 */
export function regionBestLevel(save: SaveData, data: GameData, region: RegionId): number {
  if (!started(save, region) || isWorldRegion(data, region)) return 0
  const box = region === regionOf(save) ? save.box : (save.parked?.[region]?.box ?? [])
  const residents = (save.dayCare?.residents ?? [])
    .filter((r) => (r.region ?? regionOf(save)) === region)
    .map((r) => r.inst)
  return [...box, ...residents].reduce((m, p) => Math.max(m, p.level), 0)
}

/** Whether this waiting Pokémon may arrive now: its region is started and has a Pokémon at its level. */
export const homerReady = (save: SaveData, data: GameData, h: WorldHomer): boolean =>
  started(save, h.region) && regionBestLevel(save, data, h.region) >= h.inst.level

const stronger = (a: PokemonInstance, b: PokemonInstance) =>
  a.level > b.level || (a.level === b.level && a.xp > b.xp)

/**
 * Plain copies of one species waiting for one region merge into the strongest, as they would in a Box; shinies and
 * fossils still reviving are always their own. Order is kept (the first of each pair that ties stays).
 */
function mergeHomers(list: WorldHomer[]): WorldHomer[] {
  const best = new Map<string, WorldHomer>()
  for (const h of list) {
    if (h.inst.shiny || isReviving(h.inst)) continue
    const key = `${h.region}:${h.inst.dex}`
    const cur = best.get(key)
    if (!cur || stronger(h.inst, cur.inst)) best.set(key, h)
  }
  return list.filter((h) => h.inst.shiny || isReviving(h.inst) || best.get(`${h.region}:${h.inst.dex}`) === h)
}

/** How many of a closing world's Pokémon went home to each region, for its closing pop-up. */
export type HomeCounts = Record<RegionId, number>

/**
 * A closing world's team and Box go home: each Pokémon (full HP, as it leaves) is put on its region's waiting list,
 * merged with the copies of its species already waiting there, then any whose region is ready arrives at once.
 * `counts` says how many went to each region (after the world's own duplicates merged).
 */
export function sendWorldHome(
  save: SaveData,
  data: GameData,
  box: readonly PokemonInstance[],
  worldId: string,
): { save: SaveData; counts: HomeCounts } {
  const leaving = mergeHomers(
    box
      .filter((p) => !!data.species[p.dex])
      .map((p) => ({
        inst: { ...p, currentHp: instanceMaxHp(p, data) },
        region: speciesHome(data, p.dex),
        worldId,
      })),
  )
  if (!leaving.length) return { save, counts: {} }
  const counts: HomeCounts = {}
  for (const h of leaving) counts[h.region] = (counts[h.region] ?? 0) + 1
  const worldHome = mergeHomers([...worldHomers(save), ...leaving])
  const sent: SaveData = { ...save, events: { ...save.events, worldHome } }
  return { save: releaseWorldHome(sent, data).save, counts }
}

/** One waiting Pokémon that arrived: in which region, and what became of it there. */
export interface HomerArrival {
  inst: PokemonInstance
  region: RegionId
  outcome: TradeOutcome
}

/**
 * The waiting Pokémon whose region now has one at their level arrive in its Box, by the usual rule (`placeInBox`): it
 * joins (and the team, with room), replaces a weaker plain copy in place, or merges into a stronger one; its Pokédex
 * entry comes with it. The rest keep waiting. Run whenever levels may have moved (load, a fight, a region started).
 */
export function releaseWorldHome(
  save: SaveData,
  data: GameData,
): { save: SaveData; arrived: HomerArrival[] } {
  const waiting = worldHomers(save)
  if (!waiting.length) return { save, arrived: [] }
  let next = save
  const arrived: HomerArrival[] = []
  const still: WorldHomer[] = []
  // The highest first: one arriving never raises its region's best (it's at that level or below), so one pass is enough.
  for (const h of [...waiting].sort((a, b) => b.inst.level - a.inst.level)) {
    if (!data.species[h.inst.dex] || !homerReady(next, data, h)) {
      still.push(h)
      continue
    }
    const placed = placeInBox(next, data, h.region, h.inst)
    next = placed.save
    arrived.push({ inst: h.inst, region: placed.region, outcome: placed.outcome })
  }
  if (!arrived.length) return { save, arrived }
  const kept = waiting.filter((h) => still.includes(h))
  const { worldHome: _all, ...events } = next.events ?? {}
  return { save: { ...next, events: kept.length ? { ...events, worldHome: kept } : events }, arrived }
}

/** Whether a Pokémon sent to this region now would wait there, locked: nothing there is at its level yet. */
export const sendArrivesLocked = (
  save: SaveData,
  data: GameData,
  inst: PokemonInstance,
  targetId: RegionId,
): boolean => regionBestLevel(save, data, targetId) < inst.level

/**
 * Moves one Pokémon out of the live region and onto another started region's waiting list, then lets it in at once
 * if a Pokémon there is already at its level (`releaseWorldHome`, the usual arrival). Otherwise it waits, locked, like
 * a small world's Pokémon: a Lv.100 Charizard can't be sent to flatten a region still being played. It leaves the team
 * behind it — and if it was the whole team, the Box promotes a replacement, because a region with nobody in its team
 * cannot be played. The region it leaves keeps it in its own Pokédex: it was caught there, and that count never drops.
 */
export function sendPokemonOn(
  save: SaveData,
  data: GameData,
  instId: string,
  targetId: RegionId,
): SaveData | null {
  const target = sendTargets(save, data).find((r) => r.id === targetId)
  if (!target) return null
  const inst = save.box.find((p) => p.id === instId)
  if (!inst || sendOnBlocked(save, data, inst, target)) return null

  const box = save.box.filter((p) => p.id !== instId)
  let team = save.team.filter((id) => id !== instId)
  if (!team.length) {
    const heir = box.find((p) => !isReviving(p))
    if (!heir) return null
    team = [heir.id]
  }
  const homer: WorldHomer = { inst, region: target.id, from: regionOf(save) }
  const sent: SaveData = {
    ...save,
    box,
    team,
    events: { ...save.events, worldHome: [...worldHomers(save), homer] },
  }
  return releaseWorldHome(sent, data).save
}

/** Lets a waiting Pokémon go (its sheet's Release). Null when it isn't waiting. */
export function releaseHomer(save: SaveData, instId: string): SaveData | null {
  const waiting = worldHomers(save)
  if (!waiting.some((h) => h.inst.id === instId)) return null
  const kept = waiting.filter((h) => h.inst.id !== instId)
  const { worldHome: _all, ...events } = save.events ?? {}
  return { ...save, events: kept.length ? { ...events, worldHome: kept } : events }
}
