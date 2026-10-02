// leaderboard_region() (0029): one region, progress already counted, and a 5-minute cache in front of it.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { data } from './fixtures'

const rpc = vi.fn()
vi.mock('@/lib/supabase', () => ({ getSupabase: async () => ({ rpc }) }))

const { clearBoardCache, fetchLeaderboard, frontierArea, parseRegionBoard, splitLeaderboard } = await import('@/lib/leaderboard')
const { BOARD_CACHE_MS } = await import('@/lib/boardCache')
type Row = import('@/lib/leaderboard').LeaderboardRow

const main = data.areas.filter((a) => !a.hidden && (a.regionId ?? 'kanto') === 'kanto')
const base = { region: 'kanto', isMe: false, avatar: 'red', team: [], pokedex: 1, maxLevel: 5 } satisfies Omit<Row, 'name'>
const byMap = (name: string, n: number, gyms: number): Row => ({
  ...base,
  name,
  progress: Object.fromEntries(main.slice(0, n).map((a, i) => [a.id, { cleared: true, gyms: i === 0 ? gyms : 0 }])),
})
const byCount = (name: string, n: number, gyms: number): Row => ({ ...base, name, cleared: n, gyms })

describe('counted rows', () => {
  it('rank, score and finish exactly like the per-area map', () => {
    const shape = [
      ['Ash', 3, 0],
      ['Brock', 3, 2],
      ['Misty', 1, 0],
      ['Red', main.length, 4],
    ] as const
    for (const tab of ['progress', 'level', 'dex'] as const) {
      const a = splitLeaderboard(shape.map(([n, c, g]) => byMap(n, c, g)), tab, data, 'kanto')
      const b = splitLeaderboard(shape.map(([n, c, g]) => byCount(n, c, g)), tab, data, 'kanto')
      const view = (x: typeof a) => [x.board, x.hall].map((l) => l.map((r) => [r.name, r.rank, r.score]))
      expect(view(b)).toEqual(view(a))
    }
  })

  it('the frontier is the area after the cleared ones', () => {
    expect(frontierArea(byCount('New', 0, 0), data)).toBe(main[0]!.name)
    expect(frontierArea(byCount('Mid', 2, 0), data)).toBe(main[2]!.name)
    expect(frontierArea(byCount('Done', main.length, 0), data)).toBe('Hall of Fame')
  })

  it('parses defensively and stamps the region asked for', () => {
    const [r] = parseRegionBoard(
      [{ is_me: null, name: null, character: '../x', team: null, pokedex: null, max_level: 7, cleared: null, gyms: 3 }],
      'johto',
    )
    expect(r).toEqual({ region: 'johto', isMe: false, name: 'Trainer', avatar: 'red', team: [], pokedex: 0, maxLevel: 7, cleared: 0, gyms: 3 })
  })
})

describe('fetchLeaderboard', () => {
  const raw = [{ is_me: true, name: 'Me', character: 'red', team: [], pokedex: 2, max_level: 9, cleared: 1, gyms: 0 }]
  beforeEach(() => {
    clearBoardCache()
    rpc.mockReset()
  })

  it('asks for one region, then serves it from the cache for 5 minutes', async () => {
    rpc.mockResolvedValue({ data: raw, error: null })
    const first = await fetchLeaderboard('kanto', 'u1', 1_000)
    expect(rpc).toHaveBeenCalledWith('leaderboard_region', { p_region: 'kanto' })
    expect(await fetchLeaderboard('kanto', 'u1', 1_000 + BOARD_CACHE_MS - 1)).toBe(first)
    expect(rpc).toHaveBeenCalledTimes(1)
    // Expired, another region, or another player: downloaded again.
    await fetchLeaderboard('kanto', 'u1', 1_000 + BOARD_CACHE_MS)
    await fetchLeaderboard('johto', 'u1', 1_000 + BOARD_CACHE_MS)
    await fetchLeaderboard('johto', null, 1_000 + BOARD_CACHE_MS)
    expect(rpc).toHaveBeenCalledTimes(4)
  })

  it('falls back to leaderboard() on a database without 0029, keeping this region', async () => {
    rpc.mockImplementation(async (fn: string) =>
      fn === 'leaderboard_region'
        ? { data: null, error: { code: 'PGRST202', message: 'missing' } }
        : {
            data: [
              { region: 'kanto', is_me: false, name: 'K', character: 'red', team: [], pokedex: 1, max_level: 1, progress: {} },
              { region: 'johto', is_me: false, name: 'J', character: 'red', team: [], pokedex: 1, max_level: 1, progress: {} },
            ],
            error: null,
          },
    )
    const rows = await fetchLeaderboard('johto', null, 0)
    expect(rows?.map((r) => r.name)).toEqual(['J'])
  })

  it('other errors are not hidden, and are not cached', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '57014', message: 'timeout' } })
    await expect(fetchLeaderboard('kanto', null, 0)).rejects.toMatchObject({ code: '57014' })
    rpc.mockResolvedValueOnce({ data: raw, error: null })
    expect(await fetchLeaderboard('kanto', null, 1)).toHaveLength(1)
  })
})

describe('fetchVersusBoard', async () => {
  const { clearVersusCache, fetchVersusBoard, recordVersus } = await import('@/lib/versus')
  const entry = { user_id: 'u2', is_me: false, name: 'B', character: 'red', team: [], ids: null, version: 1, attack_wins: 0, defense_wins: 0, beaten: false }
  beforeEach(() => {
    clearVersusCache()
    rpc.mockReset()
    rpc.mockResolvedValue({ data: [entry], error: null })
  })

  it('reopened within 5 minutes comes from the cache; force always asks', async () => {
    await fetchVersusBoard('u1', { now: 0 })
    await fetchVersusBoard('u1', { now: 1_000 })
    expect(rpc).toHaveBeenCalledTimes(1)
    await fetchVersusBoard('u1', { now: 2_000, force: true })
    expect(rpc).toHaveBeenCalledTimes(2)
  })

  it('a recorded fight drops the cached board, so "beaten" and the scores are fresh', async () => {
    const [foe] = (await fetchVersusBoard('u1', { now: 0 }))!
    await recordVersus(foe!, 1, true)
    await fetchVersusBoard('u1', { now: 1 })
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(['versus_board', 'versus_record', 'versus_board'])
  })
})
