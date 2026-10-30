// The content players get, for the jobs that run away from the game (the Discord posters, the bots' weekly teams): the
// live tables when they read as playable, else the bundled copy.
import type { SupabaseClient } from '@supabase/supabase-js'
import { compileGameData, type GameData } from '@/engine'
import { BUNDLE, withStatics } from './bundle'
import { isPlayableBundle, rowsToBundle } from './mapping'
import { fetchAllRows } from './remote'

export async function liveContent(
  client: SupabaseClient | null,
): Promise<{ data: GameData; source: string }> {
  if (client) {
    try {
      const raw = rowsToBundle(await fetchAllRows(client))
      if (isPlayableBundle(raw)) return { data: compileGameData(withStatics(raw)), source: 'Supabase' }
      console.warn('! The live content is not playable: using the bundled content.')
    } catch (err) {
      console.warn(
        `! Could not read Supabase (${err instanceof Error ? err.message : String(err)}): using the bundled content.`,
      )
    }
  }
  return { data: compileGameData(BUNDLE), source: 'the bundle' }
}
