import type { SupabaseClient } from '@supabase/supabase-js'
import type { BundleRaw } from '@/engine/types'
import { getSupabase, SUPABASE_URL } from '@/lib/supabase'
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

/** The public bucket Admin → Publish uploads each version's content to (migration 0030). */
export const CONTENT_BUCKET = 'content'
export const contentFileName = (version: number) => `v${version}.json`
/** Where a published version's file is served from: the Storage CDN, not the database. */
export const contentFileUrl = (version: number, base = SUPABASE_URL) =>
  `${base}/storage/v1/object/public/${CONTENT_BUCKET}/${contentFileName(version)}`

/**
 * The file Admin → Publish uploaded for `version`, or null when there is none (published before 0030, or the upload
 * failed) or it isn't that version's playable content. Never throws.
 */
export async function fetchContentFile(version: number, get: typeof fetch = fetch): Promise<BundleRaw | null> {
  try {
    const res = await get(contentFileUrl(version))
    if (!res.ok) return null
    const bundle = (await res.json()) as BundleRaw
    if (Number(bundle?.config?.configVersion) !== version || !isPlayableBundle(bundle)) return null
    return bundle
  } catch {
    return null
  }
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
    // Downloaded on an earlier visit: no need to read every table again.
    const cached = await readCachedContent(remoteVersion)
    if (cached && isPlayableBundle(cached)) return cached
    // The published file first (one CDN download); every table through the API only when there is none.
    const bundle = (await fetchContentFile(remoteVersion)) ?? rowsToBundle(await fetchAllRows(client))
    if (!isPlayableBundle(bundle)) return null
    void writeCachedContent(remoteVersion, bundle)
    return bundle
  } catch (err) {
    console.info('[content] staying on the bundled content:', err)
    return null
  }
}
