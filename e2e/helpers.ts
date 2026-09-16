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
  return { ...newSave(starter, gameData(), Date.now(), () => `e2e-${++c}`), ...patch }
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
    if (req.method() === 'POST' || req.method() === 'PATCH') return route.fulfill({ status: 201, body: '' })
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  return calls
}

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
