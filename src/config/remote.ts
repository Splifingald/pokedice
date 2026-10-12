import type { SupabaseClient } from '@supabase/supabase-js'
import type { BundleRaw } from '@/engine/types'
import { getSupabase } from '@/lib/supabase'
import { readCachedContent, writeCachedContent } from './contentCache'
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
  return (await checkContentVersion(currentVersion))?.bundle ?? null
}

/**
 * The same check, saying whether it got an answer: `{ bundle: null }` when the content in memory is the latest,
 * `{ bundle }` when a newer one was fetched, null when it couldn't tell (offline, an error, an unplayable bundle). Only
 * an answer lets the game act on what the content *doesn't* hold (a small world the admin deleted, docs/21).
 */
export async function checkContentVersion(currentVersion: number): Promise<{ bundle: BundleRaw | null } | null> {
  try {
    const client = await getSupabase()
    if (!client) return null
    const { data, error } = await client.from('game_config').select('value').eq('key', 'configVersion').maybeSingle()
    if (error || !data) return null
    const remoteVersion = Number((data as { value: unknown }).value)
    if (!Number.isFinite(remoteVersion)) return null
    if (remoteVersion === currentVersion) return { bundle: null }
    // Downloaded on an earlier visit: no need to read every table again.
    const cached = await readCachedContent(remoteVersion)
    if (cached && isPlayableBundle(cached)) return { bundle: cached }
    const bundle = rowsToBundle(await fetchAllRows(client))
    if (!isPlayableBundle(bundle)) return null
    void writeCachedContent(remoteVersion, bundle)
    return { bundle }
  } catch (err) {
    console.info('[content] staying on the bundled content:', err)
    return null
  }
}
