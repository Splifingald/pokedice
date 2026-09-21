// Cloud backup of the same save blob. Never blocks the UI. The newest `updatedAt` wins — unless it has less progress
// than the other save, and then the player chooses (see decideSync). Progress is measured across every region a save
// holds, not just the one it was last played in.
import type { SupabaseClient } from '@supabase/supabase-js'
import { liveBlock } from '@/engine/regions'
import type { RegionSave, SaveData } from '@/engine/types'
import { parseSave } from './schema'

export async function pullCloudSave(client: SupabaseClient, userId: string): Promise<SaveData | null> {
  const { data, error } = await client.from('saves').select('data').eq('user_id', userId).maybeSingle()
  if (error) throw error
  if (!data) return null
  const res = parseSave((data as { data: unknown }).data)
  return res.ok ? res.save : null
}

export async function pushCloudSave(client: SupabaseClient, userId: string, save: SaveData): Promise<void> {
  const { error } = await client
    .from('saves')
    .upsert({ user_id: userId, data: save, updated_at: new Date(save.updatedAt).toISOString() })
  if (error) throw error
}

export type SyncWinner = 'local' | 'cloud' | 'none'

export function pickNewest(local: SaveData | null, cloud: SaveData | null): { winner: SyncWinner; save: SaveData | null } {
  if (!local && !cloud) return { winner: 'none', save: null }
  if (!cloud) return { winner: 'local', save: local }
  if (!local) return { winner: 'cloud', save: cloud }
  return cloud.updatedAt > local.updatedAt ? { winner: 'cloud', save: cloud } : { winner: 'local', save: local }
}

let pushTimer: ReturnType<typeof setTimeout> | null = null

/** Debounced (2 s) push after any save mutation. */
export function schedulePush(run: () => Promise<void>, delay = 2000) {
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTimer = null
    run().catch((err) => console.warn('[cloud] push failed', err))
  }, delay)
}

/**
 * Every region the save holds: the live one, lifted out of the top level, and each parked block. Regions are
 * separate runs, so anything that measures a whole save has to walk all of them — reading `save.areaProgress` alone
 * sees only wherever the player happens to be standing.
 */
const regionBlocks = (s: SaveData): RegionSave[] => [liveBlock(s), ...Object.values(s.parked ?? {}).filter((b): b is RegionSave => !!b)]

/**
 * How far a save got across every region it holds, compared in order: areas cleared, gym battles won, species
 * caught, total levels.
 *
 * Areas, gyms and levels add up, because clearing Johto is work done on top of Kanto, not instead of it. Species are
 * the union: the regions' Pokédexes overlap — Johto's routes are full of Gen 1 — and catching the same Pikachu twice
 * is not twice the progress. The other three axes already carry the extra region's weight.
 *
 * Before this walked the parked blocks, a save deep into Johto compared as if Kanto had never happened: a freshly
 * started Johto, with one starter and no areas, lost to a stale device sitting in a finished Kanto.
 */
export function progressTotals(s: SaveData) {
  const species = new Set<number>()
  let cleared = 0
  let gyms = 0
  let levels = 0
  for (const block of regionBlocks(s)) {
    for (const p of Object.values(block.areaProgress)) {
      if (p.cleared) cleared++
      gyms += p.gymsDefeated?.length ?? 0
    }
    for (const dex of block.pokedex) species.add(dex)
    for (const p of block.box) levels += p.level
    for (const r of block.dayCare?.residents ?? []) levels += r.inst.level
  }
  return { regions: regionBlocks(s).length, cleared, gyms, species: species.size, levels }
}

function progressTuple(s: SaveData): number[] {
  const t = progressTotals(s)
  return [t.cleared, t.gyms, t.species, t.levels]
}

/** > 0 when `a` got further than `b`, < 0 when it's behind, 0 when they're level. */
export function compareProgress(a: SaveData, b: SaveData): number {
  const x = progressTuple(a)
  const y = progressTuple(b)
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i]! - y[i]!
  return 0
}

export type SyncDecision = 'none' | 'local' | 'cloud' | 'ask'

/**
 * The first sync after signing in. The newest save wins — unless it has less progress than the other one (a stale
 * device was opened and touched): then the player is asked, instead of silently overwriting real progress.
 */
export function decideSync(local: SaveData | null, cloud: SaveData | null): SyncDecision {
  if (!local && !cloud) return 'none'
  if (!cloud) return 'local'
  if (!local) return 'cloud'
  const cloudNewer = cloud.updatedAt > local.updatedAt
  // An admin edit (e.g. a Pokémon taken away) is applied as is, without asking.
  if (cloudNewer && (cloud.adminEditAt ?? 0) > local.updatedAt) return 'cloud'
  const newer = cloudNewer ? cloud : local
  const older = cloudNewer ? local : cloud
  if (compareProgress(older, newer) > 0) return 'ask'
  return cloudNewer ? 'cloud' : 'local'
}

/** Same game state, ignoring bookkeeping (timestamps, settings; `lastRegenTick` from saves made before regen was removed). */
export function sameSave(a: SaveData, b: SaveData): boolean {
  const strip = (s: SaveData) => JSON.stringify({ ...s, updatedAt: 0, lastRegenTick: 0, settings: null })
  return strip(a) === strip(b)
}
