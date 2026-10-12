// Trades, the game's side (docs/23 §1.6): what the database returns, read safely; its errors in a word; a link kept a
// week; and the check, which applies what changed while away exactly once and tells the server only once it's pushed.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createInstance,
  DEFAULT_CONFIG,
  listOut,
  newSave,
  tradesOf,
  tradesToWatch,
  type SaveData,
  type TradeConfig,
} from '@/engine'
import {
  clearTradeLink,
  fetchMine,
  markApplied,
  parseListing,
  parseMine,
  readTradeLink,
  saveTradeLink,
  tradeError,
  tradeUrl,
} from '@/lib/trades'
import { initialRun, useGame } from '@/store/game'
import { pushSaveNow, syncSettled } from '@/store/sync'
import { checkListings, checkTrades, HOME_EVERY_MS, useTrades } from '@/store/trades'
import { makeData, newId } from './fixtures'

vi.mock('@/lib/trades', async (actual) => ({
  ...(await actual<typeof import('@/lib/trades')>()),
  fetchMine: vi.fn(),
  markApplied: vi.fn(async () => {}),
}))
vi.mock('@/store/sync', () => ({
  pushSaveNow: vi.fn(async () => true),
  syncSettled: vi.fn(() => true),
}))

/** localStorage for the node test environment. */
function memoryStorage(): Storage {
  const m = new Map<string, string>()
  return {
    get length() {
      return m.size
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  }
}

beforeEach(() => {
  ;(globalThis as { localStorage?: Storage }).localStorage = memoryStorage()
})
afterEach(() => {
  delete (globalThis as { localStorage?: Storage }).localStorage
})

describe('reading what the database returns', () => {
  it('fills every gap in a listing', () => {
    const l = parseListing({
      id: 'a',
      code: 'K7QM4XD9',
      dex: 4,
      level: 12,
      want: { kind: 'species', dex: 7 },
      created_at: '2026-10-12T10:00:00Z',
      ends_at: '2026-10-15T10:00:00Z',
      poster: { has: 'AA==', forms: [10110], shiny: ['4'], regions: ['kanto'] },
    })!
    expect(l).toMatchObject({
      name: '',
      isMe: false,
      shiny: false,
      homeRegion: 'kanto',
      visibility: 'public',
      want: { kind: 'species', dex: 7 },
      poster: { has: 'AA==', forms: [10110], shiny: [4], regions: ['kanto'] },
    })
    expect(l.endsAt - l.createdAt).toBe(3 * 86_400_000)
    expect(parseListing({ id: 'a', code: 'X' })).toBeNull()
  })
  it('reads an unknown want as "anything" and drops rows without a Pokémon', () => {
    const rows = parseMine([
      { id: 'a', role: 'owner', status: 'open', mon: { id: 'p', dex: 25, level: 7 }, want: { kind: 'egg' } },
      { id: 'b', role: 'taker', status: 'taken', mon: null },
      { id: 'c', role: 'boss', status: 'weird', mon: { id: 'q', dex: 1, level: 300, shiny: true } },
    ])
    expect(rows.map((r) => r.id)).toEqual(['a', 'c'])
    expect(rows[0]!.want).toEqual({ kind: 'any' })
    expect(rows[1]).toMatchObject({ role: 'owner', status: 'expired', mon: { level: 100, shiny: true } })
  })
})

describe('what went wrong', () => {
  it('names the database’s reasons, the longest first', () => {
    expect(tradeError({ message: 'trades_poster_region' })).toBe('poster_region')
    expect(tradeError({ message: 'trades_region' })).toBe('region')
    expect(tradeError({ message: 'trades_daily_cap' })).toBe('daily_cap')
    expect(tradeError(new Error('trades_not_synced'))).toBe('not_synced')
  })
  it('tells a rate limit and a missing migration from the rest', () => {
    expect(tradeError({ code: 'PT429', message: 'save_rate_limited' })).toBe('rate_limited')
    expect(tradeError({ message: 'friends_rate_limited' })).toBe('rate_limited')
    expect(tradeError({ code: 'PGRST202', message: 'Could not find the function' })).toBe('not_set_up')
    expect(tradeError(new Error('Failed to fetch'))).toBe('failed')
  })
})

describe('a listing’s link', () => {
  it('is the site, /t/ and the code', () => {
    expect(tradeUrl('K7QM4XD9', 'https://poke-dice.netlify.app')).toBe(
      'https://poke-dice.netlify.app/t/K7QM4XD9',
    )
  })
  it('is kept a week, read the forgiving way', () => {
    const now = 1_000_000_000
    expect(saveTradeLink('k7qm-4xd9', now)).toBe('K7QM4XD9')
    expect(readTradeLink(now + 86_400_000)).toBe('K7QM4XD9')
    expect(readTradeLink(now + 8 * 86_400_000)).toBeNull()
    expect(saveTradeLink('nope', now)).toBeNull()
    saveTradeLink('K7QM4XD9', now)
    clearTradeLink()
    expect(readTradeLink(now)).toBeNull()
  })
})

describe('the check', () => {
  const TRADE: TradeConfig = { ...DEFAULT_CONFIG.trade, access: 'all', minBadges: 0 }
  const data = makeData({ trade: TRADE })
  const NOW = 2_000_000
  const mine = vi.mocked(fetchMine)
  const applied = vi.mocked(markApplied)

  /** A Kanto save (Charmander) with a Pidgey listed (T1), signed in and synced. */
  function setUp(): SaveData {
    const s = newSave(4, data, NOW, newId)
    const listed = createInstance(16, 12, data, 'listed', NOW)
    const save = listOut(
      { ...s, box: [...s.box, listed] },
      data,
      'listed',
      {
        id: 'T1',
        code: 'K7QM4XD9',
        endsAt: NOW + 1,
        want: { kind: 'species', dex: 7 },
        visibility: 'public',
      },
      NOW,
    )!
    useGame.setState({
      data,
      save,
      run: initialRun(),
      auth: { status: 'signed_in', userId: 'u1', email: null },
    })
    useTrades.setState({ userId: 'u1', returned: [], settled: [] })
    return save
  }
  const takenRow = {
    id: 'T1',
    code: 'K7QM4XD9',
    role: 'owner' as const,
    status: 'taken' as const,
    mon: createInstance(16, 12, data, 'listed', NOW),
    fromRegion: 'kanto',
    want: { kind: 'species' as const, dex: 7 },
    visibility: 'public' as const,
    createdAt: NOW,
    endsAt: NOW + 1,
    takerMon: createInstance(7, 30, data, 'given', NOW),
    with: 'Misty',
  }

  beforeEach(() => {
    vi.mocked(pushSaveNow).mockReset().mockResolvedValue(true)
    vi.mocked(syncSettled).mockReset().mockReturnValue(true)
    mine.mockReset()
    applied.mockReset().mockResolvedValue()
  })
  afterEach(() => useGame.setState({ save: null, auth: { status: 'unknown', userId: null, email: null } }))

  it('waits for the sign-in’s sync: the save could be about to give way to the cloud copy', async () => {
    setUp()
    vi.mocked(syncSettled).mockReturnValue(false)
    await checkTrades(true, NOW)
    expect(mine).not.toHaveBeenCalled()
  })

  it('applies a listing taken while away once, keeps its scene waiting in the save, then tells the server', async () => {
    setUp()
    mine.mockResolvedValue([takenRow])
    await checkTrades(true, NOW)
    const save = useGame.getState().save!
    expect(tradesOf(save).out).toHaveLength(0)
    expect(save.box.some((p) => p.dex === 7)).toBe(true)
    expect(tradesOf(save).done).toContain('T1')
    expect(tradesToWatch(save).map((e) => e.id)).toEqual(['T1'])
    expect(applied).toHaveBeenCalledWith(['T1'])

    // The server hadn't heard (a tab closed): the next check finds it in the save, and only says so again.
    await checkTrades(true, NOW + 1)
    expect(useGame.getState().save!.box.filter((p) => p.dex === 7)).toHaveLength(1)
    expect(tradesToWatch(useGame.getState().save!).map((e) => e.id)).toEqual(['T1'])
    expect(applied).toHaveBeenCalledTimes(2)
  })

  it('asks again back Home while a listing is out, at most once a minute; never without one', async () => {
    setUp()
    mine.mockResolvedValue([{ ...takenRow, status: 'open', takerMon: null, with: '' }])
    await checkTrades(true, NOW)
    expect(mine).toHaveBeenCalledTimes(1)
    await checkListings(NOW + HOME_EVERY_MS - 1)
    expect(mine).toHaveBeenCalledTimes(1)
    await checkListings(NOW + HOME_EVERY_MS)
    expect(mine).toHaveBeenCalledTimes(2)
    // Taken meanwhile: it lands, and its scene waits in the save.
    mine.mockResolvedValue([takenRow])
    await checkListings(NOW + 2 * HOME_EVERY_MS)
    expect(tradesToWatch(useGame.getState().save!).map((e) => e.id)).toEqual(['T1'])
    // Nothing listed any more: nothing to ask.
    await checkListings(NOW + 3 * HOME_EVERY_MS)
    expect(mine).toHaveBeenCalledTimes(3)
  })

  it('keeps it unapplied on the server when the save couldn’t be pushed', async () => {
    setUp()
    mine.mockResolvedValue([takenRow])
    vi.mocked(pushSaveNow).mockResolvedValue(false)
    await checkTrades(true, NOW)
    expect(tradesOf(useGame.getState().save!).done).toContain('T1')
    expect(applied).not.toHaveBeenCalled()
  })

  it('brings an ended listing back to the Box, with a toast', async () => {
    setUp()
    mine.mockResolvedValue([{ ...takenRow, status: 'expired', takerMon: null }])
    await checkTrades(true, NOW)
    expect(useGame.getState().save!.box.some((p) => p.id === 'listed')).toBe(true)
    expect(useTrades.getState().returned).toEqual([16])
  })

  it('stays quiet with the switch off for someone who never traded', async () => {
    useGame.setState({
      data: makeData({ trade: { ...TRADE, access: 'off' } }),
      save: newSave(4, data, NOW, newId),
      auth: { status: 'signed_in', userId: 'u1', email: null },
    })
    await checkTrades(true, NOW)
    expect(mine).not.toHaveBeenCalled()
  })
})
