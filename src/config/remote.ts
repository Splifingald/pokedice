import type { SupabaseClient } from '@supabase/supabase-js'
import type { BundleRaw } from '@/engine/types'
import { getSupabase } from '@/lib/supabase'
import { isPlayableBundle, rowsToBundle, TABLES, type Row, type TableRows } from './mapping'

export async function fetchTable(client: SupabaseClient, table: string): Promise<Row[]> {
  const out: Row[] = []
  const page = 1000
  for (let from = 0; ; from += page) {
    const { data, error } = await client.from(table).select('*').range(from, from + page - 1)
    if (error) throw error
    out.push(...((data ?? []) as Row[]))
    if (!data || data.length < page) break
  }
  return out
}

/** Tables added after the first release: a database that hasn't run their migration yet still loads (read as empty). */
const OPTIONAL_TABLES = new Set<string>(['area_loot_pool'])

export async function fetchAllRows(client: SupabaseClient): Promise<TableRows> {
  const entries = await Promise.all(
    TABLES.map(
      async (t) => [t, await fetchTable(client, t).catch((err: unknown) => (OPTIONAL_TABLES.has(t) ? [] : Promise.reject(err)))] as const,
    ),
  )
  return Object.fromEntries(entries) as TableRows
}

/**
 * Background content check. Returns the remote bundle only when its configVersion differs from the one in memory
 * and it looks playable; any failure (offline, tables missing, RLS) quietly returns null.
 */
export async function fetchContentUpdate(currentVersion: number): Promise<BundleRaw | null> {
  try {
    const client = await getSupabase()
    if (!client) return null
    const { data, error } = await client.from('game_config').select('value').eq('key', 'configVersion').maybeSingle()
    if (error || !data) return null
    const remoteVersion = Number((data as { value: unknown }).value)
    if (!Number.isFinite(remoteVersion) || remoteVersion === currentVersion) return null
    const bundle = rowsToBundle(await fetchAllRows(client))
    return isPlayableBundle(bundle) ? bundle : null
  } catch (err) {
    console.info('[content] staying on the bundled content:', err)
    return null
  }
}
