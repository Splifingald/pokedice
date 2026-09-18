// Admin cheats on a player's cloud save: give or take away a Pokémon. The edit is stamped `adminEditAt`, so the next
// time the player opens the game the cloud save wins the sync even if it has less progress (see decideSync).
import type { SupabaseClient } from '@supabase/supabase-js'
import { createInstance } from '@/engine/progression'
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

/** Removes a Pokémon wherever it is (team, Box or Day Care). Its Pokédex entry stays. Never the last one in the Box. */
export function adminRemovePokemon(save: SaveData, uid: string, now: number): SaveData {
  if (save.box.length === 1 && save.box[0]!.id === uid) throw new Error('A save needs at least one Pokémon in the Box')
  const box = save.box.filter((p) => p.id !== uid)
  let team = save.team.filter((id) => id !== uid)
  if (!team.length) team = [box[0]!.id]
  const dayCare = save.dayCare && { ...save.dayCare, residents: save.dayCare.residents.filter((r) => r.inst.id !== uid) }
  return stamp({ ...save, box, team, ...(dayCare && { dayCare }) }, now)
}
