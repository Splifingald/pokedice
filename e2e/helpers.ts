import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { compileGameData, newSave, type BundleRaw, type SaveData } from '../src/engine'

const load = (f: string) => JSON.parse(readFileSync(new URL(`../src/data/${f}`, import.meta.url), 'utf8'))

export function gameData() {
  const bundle: BundleRaw = {
    pokemon: load('pokemon.json'),
    typeChart: load('type-chart.json'),
    diceTypes: load('dice-types.json'),
    areas: load('areas.json'),
    trainers: load('trainers.json'),
    upgrades: load('upgrades.json'),
    items: load('items.json'),
    config: load('config.json'),
  }
  return compileGameData(bundle)
}

export function makeSave(starter: number, patch: Partial<SaveData> = {}): SaveData {
  let c = 0
  // Prof. Oak's leaderboard pop-up would cover every screen of a fresh save.
  return { ...newSave(starter, gameData(), Date.now(), () => `e2e-${++c}`), leaderboardVisited: true, ...patch }
}

export const SUPABASE = 'http://127.0.0.1:54399'
export const ADMIN = 'admin@example.com'

/** Intercept every call to the fake Supabase. Returns the list of "METHOD path" calls seen. */
export async function mockSupabase(page: Page): Promise<string[]> {
  const calls: string[] = []
  await page.route(`${SUPABASE}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    calls.push(`${req.method()} ${url.pathname}${url.search}`)
    if (url.pathname.startsWith('/auth/v1/authorize')) {
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>mock google consent</h1>' })
    }
    if (url.pathname === '/auth/v1/user') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fakeUser()) })
    }
    if (url.pathname === '/rest/v1/rpc/leaderboard') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(LEADERBOARD) })
    }
    if (req.method() === 'POST' || req.method() === 'PATCH') return route.fulfill({ status: 201, body: '' })
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  return calls
}

const mon = (dex: number, level: number) => ({ dex, level, shiny: false })
/** What the fake `leaderboard()` returns: a few trainers, one with a full team of six. */
export const LEADERBOARD = [
  { is_me: false, name: 'Blue', character: 'green', team: [mon(18, 61), mon(65, 59), mon(112, 61), mon(130, 61), mon(59, 63), mon(9, 65)], pokedex: 118, max_level: 65, progress: { 'route-1': { cleared: true, gyms: 0 } } },
  { is_me: true, name: 'Sam', character: 'red', team: [mon(6, 36), mon(25, 30)], pokedex: 42, max_level: 36, progress: {} },
  { is_me: false, name: 'Leaf', character: 'red', team: [mon(3, 12)], pokedex: 9, max_level: 12, progress: {} },
]

function b64url(o: unknown) {
  return Buffer.from(JSON.stringify(o)).toString('base64url')
}

function fakeUser() {
  return {
    id: '11111111-2222-4333-8444-555555555555',
    aud: 'authenticated',
    role: 'authenticated',
    email: ADMIN,
    app_metadata: { provider: 'google', providers: ['google'] },
    user_metadata: {},
    created_at: new Date().toISOString(),
  }
}

/** A stored supabase-js session, as if the Google redirect had already completed. */
export function fakeSession() {
  const exp = Math.floor(Date.now() / 1000) + 3600
  const token = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: fakeUser().id, email: ADMIN, role: 'authenticated', aud: 'authenticated', exp })}.sig`
  return {
    access_token: token,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: exp,
    refresh_token: 'e2e-refresh',
    user: fakeUser(),
  }
}

export const STORAGE_KEY = 'sb-127-auth-token'
export const FAST = JSON.stringify({ sfx: false, reducedMotion: true })
