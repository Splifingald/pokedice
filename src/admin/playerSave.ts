// Admin cheats on a player's cloud save: give or take away a Pokémon. The edit is stamped `adminEditAt`, so the next
// time the player opens the game the cloud save wins the sync even if it has less progress (see decideSync).
import type { SupabaseClient } from '@supabase/supabase-js'
import { createInstance } from '@/engine/progression'
import { getRegion, newRegionBlock, regionOf, startRegion, switchRegion } from '@/engine/regions'
import { progressOf } from '@/engine/run'
import type { GameData, SaveData } from '@/engine/types'
import { parseSave } from '@/save/schema'

export async function fetchPlayerSave(client: SupabaseClient, userId: string): Promise<SaveData | null> {
  const { data, error } = await client.from('saves').select('data').eq('user_id', userId).maybeSingle()
  if (error) throw error
  if (!data) return null
  const res = parseSave((data as { data: unknown }).data)
  if (!res.ok) throw new Error(`Unreadable save: ${res.error}`)
  return res.save
}

export async function pushPlayerSave(client: SupabaseClient, userId: string, save: SaveData): Promise<void> {
  const { error } = await client
    .from('saves')
    .update({ data: save, updated_at: new Date(save.updatedAt).toISOString() })
    .eq('user_id', userId)
  if (error) throw error
}

const stamp = (save: SaveData, now: number): SaveData => ({ ...save, updatedAt: now, adminEditAt: now })

/** A fresh Pokémon at full HP: it joins the team if there's room, else waits in the Box. */
export function adminAddPokemon(
  save: SaveData,
  mon: { dex: number; level: number; shiny: boolean },
  data: GameData,
  now: number,
  id: string,
): SaveData {
  const inst = createInstance(mon.dex, mon.level, data, id, now)
  if (mon.shiny) inst.shiny = true
  return stamp(
    {
      ...save,
      box: [...save.box, inst],
      team: save.team.length < data.config.maxTeamSize ? [...save.team, inst.id] : save.team,
      pokedex: save.pokedex.includes(mon.dex) ? save.pokedex : [...save.pokedex, mon.dex],
    },
    now,
  )
}

// ---------------------------------------------------------------- regions
//
// The cheats below are how a region gets tested without playing twenty hours to reach it. Each one is a plain save
// edit, so it goes through the same parse and settle as anything else when the player next loads.

/** Marks a region's league beaten: every round done and every gym in its league area won. */
export function adminCompleteLeague(save: SaveData, data: GameData, now: number, regionId = regionOf(save)): SaveData {
  const region = getRegion(data, regionId)
  const area = data.areas.find((a) => a.id === region?.leagueAreaId)
  if (!region || !area) throw new Error(`No league area for ${regionId}`)
  const progress = {
    ...progressOf(save, area.id),
    roundsDone: Math.max(area.roundsToClear ?? 1, progressOf(save, area.id).roundsDone ?? 0),
    roundCounted: true,
    cleared: true,
    bossDefeated: true,
    bossesDefeated: (area.legendaryBoss ?? []).map((b) => b.dex),
    gymsDefeated: [...area.gyms],
  }
  const write = (p: typeof progress) =>
    regionId === regionOf(save)
      ? { ...save, areaProgress: { ...save.areaProgress, [area.id]: p } }
      : {
          ...save,
          parked: {
            ...save.parked,
            [regionId]: { ...save.parked![regionId]!, areaProgress: { ...save.parked![regionId]!.areaProgress, [area.id]: p } },
          },
        }
  if (regionId !== regionOf(save) && !save.parked?.[regionId]) throw new Error(`${regionId} has not been started`)
  return stamp(write(progress), now)
}

/** Starts a region on a starter (the first of its own, unless told otherwise) and moves the player into it. */
export function adminStartRegion(
  save: SaveData,
  data: GameData,
  now: number,
  regionId: string,
  newId: () => string,
  starterDex?: number,
): SaveData {
  const region = getRegion(data, regionId)
  if (!region) throw new Error(`Unknown region ${regionId}`)
  if (regionOf(save) === regionId) return save
  if (save.parked?.[regionId]) return stamp(switchRegion(save, regionId), now)
  const dex = starterDex ?? region.starters[0]
  if (!dex) throw new Error(`${regionId} has no starters`)
  return stamp(startRegion(save, region, newRegionBlock(region, dex, data, now, newId, createInstance)), now)
}

/** Moves between regions already started. */
export function adminSwitchRegion(save: SaveData, now: number, regionId: string): SaveData {
  if (!save.parked?.[regionId]) throw new Error(`${regionId} has not been started`)
  return stamp(switchRegion(save, regionId), now)
}


/** Puts an item in the bag — the stones and fossils included, so those paths are testable in any region. */
export function adminGiveItem(save: SaveData, data: GameData, now: number, key: string, qty: number): SaveData {
  if (!data.items[key]) throw new Error(`Unknown item ${key}`)
  const have = save.inventory[key] ?? 0
  return stamp({ ...save, inventory: { ...save.inventory, [key]: Math.max(0, have + qty) } }, now)
}

/**
 * Opens the roamer gate by marking what the config requires as caught — the fastest way to see Raikou, Entei and
 * Suicune without hunting two tower legendaries first.
 */
export function adminStartRoamers(save: SaveData, data: GameData, now: number): SaveData {
  const need = data.config.roamers?.requires ?? []
  if (!need.length) throw new Error('No roamers are configured')
  return stamp({ ...save, pokedex: [...new Set([...save.pokedex, ...need])] }, now)
}

/** Removes a Pokémon wherever it is (team, Box or Day Care). Its Pokédex entry stays. Never the last one in the Box. */
export function adminRemovePokemon(save: SaveData, uid: string, now: number): SaveData {
  if (save.box.length === 1 && save.box[0]!.id === uid) throw new Error('A save needs at least one Pokémon in the Box')
  const box = save.box.filter((p) => p.id !== uid)
  let team = save.team.filter((id) => id !== uid)
  if (!team.length) team = [box[0]!.id]
  const dayCare = save.dayCare && { ...save.dayCare, residents: save.dayCare.residents.filter((r) => r.inst.id !== uid) }
  return stamp({ ...save, box, team, ...(dayCare && { dayCare }) }, now)
}
