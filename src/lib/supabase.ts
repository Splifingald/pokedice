// Supabase is optional. The client is loaded lazily so it never weighs on first paint, and is null when the
// environment variables are missing — the game then simply runs offline.
import type { SupabaseClient } from '@supabase/supabase-js'
import { authStorage, makeAuthRoom } from '@/save/room'
import { guardRefresh } from './refreshGuard'

// `import.meta.env` is Vite's, and is undefined when a Node script imports this module (scripts/pull-remote.ts
// reaches `fetchAllRows` through it). Reading it defensively keeps that path working without a build step.
const env = import.meta.env ?? ({} as ImportMetaEnv)

export const SUPABASE_URL = env.VITE_SUPABASE_URL?.trim() || ''
export const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY?.trim() || ''
/** Cosmetic only — decides whether the Admin link renders. Postgres RLS (`is_admin()`) is the real gate. */
export const ADMIN_EMAIL = (env.VITE_ADMIN_EMAIL?.trim() || '').toLowerCase()

export const isSupabaseConfigured = !!(SUPABASE_URL && SUPABASE_ANON_KEY)

let clientPromise: Promise<SupabaseClient | null> | null = null

export function getSupabase(): Promise<SupabaseClient | null> {
  if (!isSupabaseConfigured) return Promise.resolve(null)
  clientPromise ??= import('@supabase/supabase-js')
    .then(({ createClient }) =>
      createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: 'pkce',
          // A full device would otherwise sign the player out for good (src/save/room.ts). Without localStorage at
          // all, supabase-js falls back to memory by itself.
          storage: makeAuthRoom() ? authStorage : undefined,
        },
        // Session refreshes back off while Auth answers with server errors (src/lib/refreshGuard.ts).
        global: { fetch: guardRefresh((...args) => fetch(...args)) },
      }),
    )
    .catch((err) => {
      console.warn('[supabase] failed to load client', err)
      return null
    })
  return clientPromise
}

export const isAdminEmail = (email: string | null | undefined) =>
  !!email && !!ADMIN_EMAIL && email.toLowerCase() === ADMIN_EMAIL
