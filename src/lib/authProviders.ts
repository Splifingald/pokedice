// Which ways in this deployment's Supabase has switched on: Auth's public settings (`/auth/v1/settings`), kept a day in
// this browser so it costs about one request per player per day. Until it answers — or when it can't — the game assumes
// Google only, which is how it worked before Discord (docs/17).
import { create } from 'zustand'
import type { AuthProvider } from '@/store/game'
import { isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase'

export type AuthProviders = Record<AuthProvider, boolean>

export const AUTH_PROVIDERS: AuthProvider[] = ['google', 'discord']

const KEY = 'pokedice.authProviders'
const DAY_MS = 24 * 3_600_000
const FALLBACK: AuthProviders = { google: true, discord: false }

export const useAuthProviders = create<AuthProviders>(() => ({ ...FALLBACK }))

/** Auth's settings → the providers the game offers. Google stays on unless Auth says it is off. */
export function parseAuthSettings(settings: unknown): AuthProviders {
  const external = ((settings as { external?: Record<string, unknown> } | null)?.external ?? {}) as Record<string, unknown>
  return { google: external.google !== false, discord: external.discord === true }
}

function readCache(now: number): AuthProviders | null {
  try {
    const cached = JSON.parse(localStorage.getItem(KEY) ?? 'null') as (AuthProviders & { at: number }) | null
    if (cached && now - cached.at < DAY_MS && now >= cached.at) return { google: !!cached.google, discord: !!cached.discord }
  } catch {
    /* storage blocked or garbled: ask again */
  }
  return null
}

let started = false

/** Once per page: from the day's cache, else one request. */
export async function loadAuthProviders(now = Date.now()): Promise<void> {
  if (started || !isSupabaseConfigured) return
  started = true
  const cached = readCache(now)
  if (cached) {
    useAuthProviders.setState(cached)
    return
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_ANON_KEY } })
    if (!res.ok) return
    const providers = parseAuthSettings(await res.json())
    useAuthProviders.setState(providers)
    try {
      localStorage.setItem(KEY, JSON.stringify({ at: now, ...providers }))
    } catch {
      /* private mode: ask again next time */
    }
  } catch {
    /* offline: Google only, as before */
  }
}

/** For tests: forget the page's first load. */
export function resetAuthProvidersForTest() {
  started = false
  useAuthProviders.setState({ ...FALLBACK })
}
