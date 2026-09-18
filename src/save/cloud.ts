// Cloud backup of the same save blob. Never blocks the UI. The newest `updatedAt` wins — unless it has less progress
// than the other save, and then the player chooses (see decideSync).
import type { SupabaseClient } from '@supabase/supabase-js'
import { ownedPokemon } from '@/engine/run'
import type { SaveData } from '@/engine/types'
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

/** How far a save got, compared in order: areas cleared, gym battles won, species caught, total levels. */
function progressTuple(s: SaveData): number[] {
  const areas = Object.values(s.areaProgress)
  return [
    areas.filter((p) => p.cleared).length,
    areas.reduce((n, p) => n + (p.gymsDefeated?.length ?? 0), 0),
    new Set(s.pokedex).size,
    ownedPokemon(s).reduce((n, p) => n + p.level, 0),
  ]
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
  const newer = cloudNewer ? cloud : local
  const older = cloudNewer ? local : cloud
  if (compareProgress(older, newer) > 0) return 'ask'
  return cloudNewer ? 'cloud' : 'local'
}

/** Same game state, ignoring bookkeeping (timestamps, settings, regen clock). */
export function sameSave(a: SaveData, b: SaveData): boolean {
  const strip = (s: SaveData) => JSON.stringify({ ...s, updatedAt: 0, lastRegenTick: 0, settings: null })
  return strip(a) === strip(b)
}
