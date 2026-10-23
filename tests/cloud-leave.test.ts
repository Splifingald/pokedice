// Leaving the page sends the save at once (2026-10-23): a game added to the home screen keeps a save of its own, and
// what it played used to stay there — the upload tried as the page closed never left, and hiding it sent nothing.
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { newSave, type SaveData } from '@/engine'
import { cancelPush, KEEPALIVE_MAX_BYTES, PUSH_GAP_MS, pushKey } from '@/save/cloud'
import { readCloudMark } from '@/save/storage'
import { useGame } from '@/store/game'
import { data, newId } from './fixtures'

let client: SupabaseClient | null = null
vi.mock('@/lib/supabase', async (orig) => ({
  ...(await orig<typeof import('@/lib/supabase')>()),
  SUPABASE_URL: 'https://db.test',
  SUPABASE_ANON_KEY: 'anon',
  isSupabaseConfigured: false,
  getSupabase: async () => client,
}))
const { initAuth, uploadOnLeave } = await import('@/store/sync')

const USER = 'ash'
const T0 = Date.UTC(2026, 9, 23, 15, 0)
const base = newSave(4, data, T0 - 60_000, newId)
const iso = (ms: number) => new Date(ms).toISOString()

/** One `saves` row, read and updated (filtered on its stamp) through supabase-js; its updates counted. */
let row = { user_id: USER, realm: 'main', data: structuredClone(base) as unknown, updated_at: iso(base.updatedAt) }
const updates: SaveData[] = []
const fakeClient = {
  auth: {
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    getSession: async () => ({ data: { session: { access_token: 'tok', user: { id: USER, identities: [] } } } }),
  },
  from: () => ({
    select: (columns: string) => {
      const query = {
        eq: () => query,
        maybeSingle: async () => ({
          data: Object.fromEntries(columns.split(',').map((c) => [c.trim(), structuredClone(row[c.trim() as keyof typeof row])])),
          error: null,
        }),
      }
      return query
    },
    update: (patch: { data: SaveData; updated_at: string }) => {
      const query = {
        eq: () => query,
        gte: () => query,
        lt: () => query,
        select: async () => {
          updates.push(patch.data)
          row = { ...row, data: structuredClone(patch.data), updated_at: patch.updated_at }
          return { data: [{ updated_at: patch.updated_at }], error: null }
        },
      }
      return query
    },
  }),
} as unknown as SupabaseClient

const sent = vi.fn(async (_url: string, _init: RequestInit) => new Response(null, { status: 204 }))
const playOn = () => {
  const s = useGame.getState().save!
  useGame.setState({ save: { ...s, pokedex: [...s.pokedex, 100 + s.pokedex.length], updatedAt: Date.now() } })
}

beforeAll(async () => {
  const m = new Map<string, string>()
  ;(globalThis as { localStorage?: Storage }).localStorage = {
    get length() {
      return m.size
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  }
  vi.stubGlobal('fetch', sent)
  vi.useFakeTimers({ now: T0 })
  client = fakeClient
  useGame.setState({ save: base })
  await initAuth() // signed in, the cloud copy matched
})
afterAll(() => {
  cancelPush()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  useGame.setState({ save: null, auth: { status: 'unknown', userId: null, email: null } })
})

describe('leaving the page', () => {
  it('sends what was played at once, in one request that outlives the page, only over the copy last matched', () => {
    expect(useGame.getState().auth.status).toBe('signed_in')
    // Nothing played: nothing to send.
    uploadOnLeave()
    expect(sent).not.toHaveBeenCalled()

    playOn()
    const save = useGame.getState().save!
    uploadOnLeave()
    expect(sent).toHaveBeenCalledTimes(1)
    const [url, init] = sent.mock.calls[0]!
    expect(init).toMatchObject({ method: 'PATCH', keepalive: true })
    expect(init.headers).toMatchObject({ apikey: 'anon', Authorization: 'Bearer tok', Prefer: 'return=minimal' })
    expect(url).toBe(
      `https://db.test/rest/v1/saves?user_id=eq.ash&realm=eq.main` +
        `&updated_at=gte.${encodeURIComponent(iso(base.updatedAt))}&updated_at=lt.${encodeURIComponent(iso(base.updatedAt + 1))}`,
    )
    expect(JSON.parse(init.body as string)).toEqual({ data: JSON.parse(JSON.stringify(save)), updated_at: iso(save.updatedAt) })
    // Taken as written: a page hidden then closed sends it once.
    expect(readCloudMark()).toMatchObject({ at: save.updatedAt, key: pushKey(save), pushedAt: T0 })
    uploadOnLeave()
    expect(sent).toHaveBeenCalledTimes(1)
  })

  it('at most once per PUSH_GAP_MS: a phone hides the page all the time', async () => {
    playOn()
    uploadOnLeave()
    expect(sent).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(PUSH_GAP_MS)
    uploadOnLeave()
    expect(sent).toHaveBeenCalledTimes(2)
  })

  it('a save too big for such a request goes the usual way, which gets through while the page is only hidden', async () => {
    await vi.advanceTimersByTimeAsync(PUSH_GAP_MS)
    const s = useGame.getState().save!
    const box = [...s.box, ...Array.from({ length: 1500 }, (_, i) => ({ ...s.box[0]!, id: `m${i}` }))]
    useGame.setState({ save: { ...s, box, updatedAt: Date.now() } })
    expect(JSON.stringify(useGame.getState().save).length).toBeGreaterThan(KEEPALIVE_MAX_BYTES)
    uploadOnLeave()
    expect(sent).toHaveBeenCalledTimes(2)
    await vi.waitFor(() => expect(updates).toHaveLength(1))
    expect(updates[0]!.box).toHaveLength(useGame.getState().save!.box.length)
  })
})
