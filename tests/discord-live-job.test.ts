// The #events posts' job (netlify/functions/discord-live.mts, docs/50 §2): each start posted once, within the minute,
// late Publishes still posted, the Monday calendar once, a refused post tried again, and only one small read while
// nothing is due.
import { describe, expect, it, vi } from 'vitest'
import { newLiveEvent, type GameData, type LiveEvent } from '@/engine'
import {
  LATE_MS,
  runLiveJob,
  startKey,
  startsToPost,
  weekKey,
  type LiveJobDeps,
} from '../netlify/discord/live'
import { makeData } from './fixtures'

const at = (iso: string) => Date.parse(iso)
const ev = (id: string, start: string, end: string, patch: Partial<LiveEvent> = {}): LiveEvent => ({
  ...newLiveEvent(id, start, end),
  ...patch,
})

/** The job's database and webhook, in memory. */
function harness(data: GameData, opts: { failPost?: number } = {}) {
  const keys = new Set<string>()
  const messages: unknown[] = []
  let failures = opts.failPost ?? 0
  const deps = {
    events: vi.fn(async () => data.config.liveEvents),
    posted: vi.fn(async (wanted: string[]) => new Set(wanted.filter((k) => keys.has(k)))),
    data: vi.fn(async () => data),
    claim: vi.fn(async (key: string) => (keys.has(key) ? false : (keys.add(key), true))),
    release: vi.fn(async (key: string) => void keys.delete(key)),
    post: vi.fn(async (m: unknown) => {
      if (failures-- > 0) throw new Error('Discord POST → 500')
      messages.push(m)
    }),
  } satisfies LiveJobDeps
  return { deps, keys, messages }
}

const SHOP = ev('shop', '2026-10-31T11:00:00.000Z', '2026-11-03T11:00:00.000Z', { type: 'shop' })
const withEvents = (access: 'off' | 'admin' | 'all', ...list: LiveEvent[]) =>
  makeData({ liveEvents: { access, list } })

describe('the #events job', () => {
  it('posts a start once, in the first minute it has begun', async () => {
    const { deps, messages } = harness(withEvents('all', SHOP))
    expect(await runLiveJob(deps, at('2026-10-31T10:59:00Z'))).toEqual({ posted: [], failed: [] })
    expect(deps.data).not.toHaveBeenCalled()

    const first = await runLiveJob(deps, at('2026-10-31T11:00:20Z'))
    expect(first.posted).toEqual([startKey(SHOP)])
    expect(messages).toHaveLength(1)
    expect(JSON.stringify(messages[0])).toContain('is live!')

    // The next minutes find it posted: one small read, no content load, no second post.
    deps.data.mockClear()
    expect((await runLiveJob(deps, at('2026-10-31T11:01:20Z'))).posted).toEqual([])
    expect(deps.data).not.toHaveBeenCalled()
    expect(messages).toHaveLength(1)
  })

  it('still posts an event Published late, up to two hours after its start, not after', async () => {
    expect(startsToPost(withEvents('all', SHOP), at('2026-10-31T12:30:00Z'))).toHaveLength(1)
    expect(startsToPost(withEvents('all', SHOP), at('2026-10-31T11:00:00Z') + LATE_MS + 1)).toEqual([])
  })

  it('never posts an event that is over', async () => {
    const short = ev('short', '2026-10-31T11:00:00Z', '2026-10-31T11:30:00Z')
    expect(startsToPost(withEvents('all', short), at('2026-10-31T11:45:00Z'))).toEqual([])
  })

  it('posts nothing while live events are Off or On for admin', async () => {
    for (const access of ['off', 'admin'] as const) {
      const { deps, messages } = harness(withEvents(access, SHOP))
      expect((await runLiveJob(deps, at('2026-10-31T11:00:20Z'))).skipped).toContain(access)
      expect(deps.posted).not.toHaveBeenCalled()
      expect(messages).toEqual([])
    }
  })

  it('skips a post another run has claimed meanwhile', async () => {
    const { deps, keys, messages } = harness(withEvents('all', SHOP))
    deps.posted.mockResolvedValueOnce(new Set())
    keys.add(startKey(SHOP))
    expect((await runLiveJob(deps, at('2026-10-31T11:00:20Z'))).posted).toEqual([])
    expect(messages).toEqual([])
  })

  it('releases a post Discord refused, so the next minute sends it', async () => {
    const { deps, keys, messages } = harness(withEvents('all', SHOP), { failPost: 1 })
    const failed = await runLiveJob(deps, at('2026-10-31T11:00:20Z'))
    expect(failed).toEqual({ posted: [], failed: [startKey(SHOP)] })
    expect(keys.has(startKey(SHOP))).toBe(false)
    expect((await runLiveJob(deps, at('2026-10-31T11:01:20Z'))).posted).toEqual([startKey(SHOP)])
    expect(messages).toHaveLength(1)
  })

  it('posts each run of a recurring event as its own start', async () => {
    const weekly = ev('fri', '2026-10-30T19:00:00Z', '2026-10-31T01:00:00Z', {
      type: 'cash',
      repeat: { kind: 'weekly', weekday: 5, weeks: [], time: '19:00', hours: 6 },
    })
    const { deps } = harness(withEvents('all', weekly))
    const one = await runLiveJob(deps, at('2026-11-06T19:00:30Z'))
    const two = await runLiveJob(deps, at('2026-11-13T19:00:30Z'))
    expect(one.posted).toHaveLength(1)
    expect(two.posted).toHaveLength(1)
    expect(one.posted[0]).not.toEqual(two.posted[0])
  })

  it('posts the week’s calendar once on Monday morning, from 07:23 UTC', async () => {
    expect(weekKey(at('2026-11-02T07:22:00Z'))).toBeNull()
    expect(weekKey(at('2026-11-02T07:23:00Z'))).toBe('week:2026-11-02')
    expect(weekKey(at('2026-11-02T08:23:00Z'))).toBeNull()
    expect(weekKey(at('2026-11-03T07:30:00Z'))).toBeNull()

    const tue = ev('tue', '2026-11-03T13:00:00Z', '2026-11-04T13:00:00Z', { type: 'cash' })
    const { deps, messages } = harness(withEvents('all', tue))
    expect((await runLiveJob(deps, at('2026-11-02T07:23:30Z'))).posted).toEqual(['week:2026-11-02'])
    expect((await runLiveJob(deps, at('2026-11-02T07:24:30Z'))).posted).toEqual([])
    expect(messages).toHaveLength(1)
  })

  it('posts no calendar for a week without an event, and stops asking', async () => {
    const { deps, messages } = harness(withEvents('all'))
    expect((await runLiveJob(deps, at('2026-11-02T07:23:30Z'))).posted).toEqual([])
    deps.data.mockClear()
    await runLiveJob(deps, at('2026-11-02T07:24:30Z'))
    expect(deps.data).not.toHaveBeenCalled()
    expect(messages).toEqual([])
  })
})
