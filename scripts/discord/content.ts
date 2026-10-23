// The content the Discord posters read: the live tables players get when they read as playable, else the bundled copy.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { BUNDLE, withStatics } from '@/config/bundle'
import { isPlayableBundle, rowsToBundle } from '@/config/mapping'
import { fetchAllRows } from '@/config/remote'
import { compileGameData, type GameData } from '@/engine'

/** A client with the public (anon) key, as the site has; null without the pair. */
export function anonClient(env: Record<string, string | undefined>): SupabaseClient | null {
  const url = env.VITE_SUPABASE_URL?.trim()
  const key = env.VITE_SUPABASE_ANON_KEY?.trim()
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null
}

/** The content players get: the live tables when they read as playable, else the bundled copy. */
export async function liveData(env: Record<string, string | undefined>): Promise<{ data: GameData; source: string }> {
  const client = anonClient(env)
  if (client) {
    try {
      const raw = rowsToBundle(await fetchAllRows(client))
      if (isPlayableBundle(raw)) return { data: compileGameData(withStatics(raw)), source: 'Supabase' }
      console.warn('! The live content is not playable: using the bundled content.')
    } catch (err) {
      console.warn(`! Could not read Supabase (${err instanceof Error ? err.message : String(err)}): using the bundled content.`)
    }
  } else console.warn('! No VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY: using the bundled content, not the live one.')
  return { data: compileGameData(BUNDLE), source: 'the bundle' }
}
