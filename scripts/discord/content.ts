// The content the Discord posters read: the live tables players get when they read as playable, else the bundled copy.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { liveContent } from '@/config/live'
import type { GameData } from '@/engine'

/** A client with the public (anon) key, as the site has; null without the pair. */
export function anonClient(env: Record<string, string | undefined>): SupabaseClient | null {
  const url = env.VITE_SUPABASE_URL?.trim()
  const key = env.VITE_SUPABASE_ANON_KEY?.trim()
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null
}

/** The content players get: the live tables when they read as playable, else the bundled copy. */
export async function liveData(
  env: Record<string, string | undefined>,
): Promise<{ data: GameData; source: string }> {
  const client = anonClient(env)
  if (!client)
    console.warn(
      '! No VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY: using the bundled content, not the live one.',
    )
  return liveContent(client)
}
