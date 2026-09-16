// Supabase is optional. The client is loaded lazily so it never weighs on first paint, and is null when the
// environment variables are missing — the game then simply runs offline.
import type { SupabaseClient } from '@supabase/supabase-js'

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.trim() || ''
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || ''
/** Cosmetic only — decides whether the Admin link renders. Postgres RLS (`is_admin()`) is the real gate. */
export const ADMIN_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL?.trim() || '').toLowerCase()

export const isSupabaseConfigured = !!(SUPABASE_URL && SUPABASE_ANON_KEY)

let clientPromise: Promise<SupabaseClient | null> | null = null

export function getSupabase(): Promise<SupabaseClient | null> {
  if (!isSupabaseConfigured) return Promise.resolve(null)
  clientPromise ??= import('@supabase/supabase-js')
    .then(({ createClient }) =>
      createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
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
