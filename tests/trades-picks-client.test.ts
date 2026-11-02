// The trade board's picks, the game's side (docs/23 §2.1): what it asks trade_picks for, the board's own first 50
// when the database hasn't run 0108 yet, the candidates kept a minute, and NEW PICKS asking again past the ones shown.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG, newSave, picksLeft, picksToday, type TradeConfig } from '@/engine'
import { fetchPicks, PICK_CANDIDATES } from '@/lib/trades'
import { initialRun, useGame } from '@/store/game'
import { loadPicks, newPicks, useTrades } from '@/store/trades'
import { makeData, newId } from './fixtures'

const calls: { fn: string; args: Record<string, unknown> }[] = []
let answer: (fn: string) => { data: unknown; error: unknown } = () => ({ data: [], error: null })

vi.mock('@/lib/supabase', async (actual) => ({
  ...(await actual<typeof import('@/lib/supabase')>()),
  getSupabase: async () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args })
      return answer(fn)
    },
  }),
}))
vi.mock('@/store/sync', () => ({
  pushSaveNow: vi.fn(async () => true),
  syncSettled: vi.fn(() => true),
}))

const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'
const row = (id: string, dex: number, over: Record<string, unknown> = {}) => ({
  id,
  code: `CODE${dex}`,
  dex,
  level: 10,
  want: { kind: 'any' },
  ends_at: new Date(Date.now() + 3_600_000).toISOString(),
  poster: { has: '', forms: [], shiny: [], regions: ['kanto'] },
  ...over,
})
const ask = {
  has: '',
  forms: [],
  shiny: [],
  regions: ['kanto'],
  offer: { has: '', forms: [] },
  talented: null,
}

beforeEach(() => {
  calls.length = 0
  answer = () => ({ data: [], error: null })
})

describe('asking for the candidates', () => {
  it('sends what the game owns and the listings passed over (real ids only), and reads the rows', async () => {
    answer = () => ({ data: [row(A, 25), { nope: true }], error: null })
    const got = await fetchPicks(ask, [A, 'not-an-id'])
    expect(calls).toEqual([{ fn: 'trade_picks', args: { p_me: ask, p_skip: [A], p_limit: PICK_CANDIDATES } }])
    expect(got.map((l) => l.dex)).toEqual([25])
  })

  it('reads the board’s first 50 from a database before 0108, without your own', async () => {
    answer = (fn) =>
      fn === 'trade_picks'
        ? { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }
        : { data: [row(A, 25), row(B, 4, { is_me: true })], error: null }
    const got = await fetchPicks(ask)
    expect(calls.map((c) => c.fn)).toEqual(['trade_picks', 'trade_board'])
    expect(calls[1]!.args).toMatchObject({ p_sort: 'soon', p_dex: null, p_owner: null })
    expect(got.map((l) => l.id)).toEqual([A])
  })

  it('says any other failure', async () => {
    answer = () => ({ data: null, error: { code: 'PT429', message: 'friends_rate_limited' } })
    await expect(fetchPicks(ask)).rejects.toMatchObject({ code: 'PT429' })
  })
})

describe('the store', () => {
  const TRADE: TradeConfig = { ...DEFAULT_CONFIG.trade, access: 'all', minBadges: 0 }
  const data = makeData({ trade: TRADE })
  const NOW = Date.UTC(2026, 10, 1, 12)

  beforeEach(() => {
    useGame.setState({
      data,
      save: newSave(4, data, NOW, newId),
      run: initialRun(),
      auth: { status: 'signed_in', userId: 'u1', email: null },
    })
    useTrades.setState({ userId: 'u1', picks: null, picksKey: '', picksAt: 0, picksState: 'idle' })
  })
  afterEach(() => useGame.setState({ save: null, auth: { status: 'unknown', userId: null, email: null } }))

  it('keeps the candidates a minute for the same listings passed over', async () => {
    answer = () => ({ data: [row(A, 25)], error: null })
    await loadPicks(false, NOW)
    expect(useTrades.getState()).toMatchObject({ picksState: 'ready', picks: [{ id: A }] })
    await loadPicks(false, NOW + 30_000)
    expect(calls).toHaveLength(1)
    await loadPicks(false, NOW + 61_000)
    expect(calls).toHaveLength(2)
  })

  it('NEW PICKS passes over the ones shown, asks again, and stops when the day’s are used', async () => {
    await loadPicks(false, NOW)
    expect(await newPicks([A], NOW)).toBe(true)
    expect(picksToday(useGame.getState().save!, NOW)).toEqual({
      day: Math.floor(NOW / 86_400_000),
      rerolls: 1,
      skip: [A],
    })
    expect(calls.at(-1)!.args.p_skip).toEqual([A])
    expect(await newPicks([B], NOW)).toBe(true)
    expect(calls.at(-1)!.args.p_skip).toEqual([A, B])
    expect(picksLeft(useGame.getState().save!, data, NOW)).toBe(0)
    const before = calls.length
    expect(await newPicks([A], NOW)).toBe(false)
    expect(calls).toHaveLength(before)
  })
})
