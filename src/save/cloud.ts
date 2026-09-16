// Cloud backup of the same save blob. Never blocks the UI; newest `updatedAt` wins silently.
import type { SupabaseClient } from '@supabase/supabase-js'
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
