// Reloads don't cost the database a save: each device remembers the cloud copy it last matched (its stamp and pushKey),
// downloads the save only when something else wrote it, and uploads on its own at most once per PUSH_GAP_MS. On
// 2026-10-11 a few players reloading every few seconds downloaded and uploaded their whole save on every load.
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { newSave, type SaveData } from '@/engine'
import {
  cancelPush,
  cloudSaveAt,
  cloudUnchanged,
  PUSH_GAP_MS,
  pushCloudSave,
  pushGapLeft,
  pushKey,
  SaveConflictError,
} from '@/save/cloud'
import { readCloudMark, saveKeyOf, wipePlayerData, wipeSlot, writeCloudMark } from '@/save/storage'
import { commitSave, useGame } from '@/store/game'
import { adoptStoredSave, reconcile } from '@/store/sync'
import { data, newId } from './fixtures'

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

interface Row {
  user_id: string
  realm: string
  data: unknown
  updated_at: string
}

/** A stamp in microseconds, as Postgres keeps it (an ISO string with up to six decimals). */
const micros = (at: string) => {
  const [, frac = ''] = /\.(\d+)/.exec(at) ?? []
  return Date.parse(at.replace(/\.\d+/, '')) * 1000 + Number(frac.padEnd(6, '0').slice(0, 6))
}

/**
 * The `saves` table as PostgREST serves it: reads (by columns asked for) and writes are counted. A write is an insert
 * (refused when the row is there) or an update filtered on the row's stamp (no row taken when it moved). `refuse`
 * updates are turned away with 0040's HTTP 429 first.
 */
function fakeCloud(rows: Row[] = [], refuse = 0) {
  const reads: string[] = []
  const uploads: SaveData[] = []
  let tries = 0
  const find = (f: Record<string, unknown>) => rows.findIndex((r) => r.user_id === f.user_id && r.realm === (f.realm ?? 'main'))
  const client = {
    from: () => ({
      select: (columns: string) => {
        const filters: Record<string, unknown> = {}
        const query = {
          eq: (k: string, v: unknown) => ((filters[k] = v), query),
          maybeSingle: async () => {
            reads.push(columns)
            const row = rows[find(filters)]
            if (!row) return { data: null, error: null }
            const cols = columns.split(',').map((c) => c.trim()) as (keyof Row)[]
            return { data: Object.fromEntries(cols.map((c) => [c, structuredClone(row[c])])), error: null }
          },
        }
        return query
      },
      insert: (row: { user_id: string; realm?: string; data: SaveData; updated_at: string }) => ({
        select: async () => {
          const realm = row.realm ?? 'main'
          if (find({ user_id: row.user_id, realm }) >= 0) return { data: null, error: { code: '23505', message: 'duplicate key' } }
          uploads.push(row.data)
          rows.push({ user_id: row.user_id, realm, data: structuredClone(row.data), updated_at: row.updated_at })
          return { data: [{ updated_at: row.updated_at }], error: null }
        },
      }),
      update: (patch: { data: SaveData; updated_at: string }) => {
        const filters: Record<string, unknown> = {}
        let from = -Infinity
        let to = Infinity
        const query = {
          eq: (k: string, v: unknown) => ((filters[k] = v), query),
          gte: (_k: string, v: string) => ((from = micros(v)), query),
          lt: (_k: string, v: string) => ((to = micros(v)), query),
          select: async () => {
            tries++
            if (refuse > 0) {
              refuse--
              return { data: null, error: { code: 'PT429', message: 'save_rate_limited' } }
            }
            const i = find(filters)
            const at = i >= 0 ? micros(rows[i]!.updated_at) : NaN
            if (i < 0 || at < from || at >= to) return { data: [], error: null }
            uploads.push(patch.data)
            rows[i] = { ...rows[i]!, data: structuredClone(patch.data), updated_at: patch.updated_at }
            return { data: [{ updated_at: patch.updated_at }], error: null }
          },
        }
        return query
      },
    }),
  }
  const downloads = () => reads.filter((c) => c.includes('data')).length
  return { client: client as unknown as SupabaseClient, rows, reads, uploads, downloads, updates: () => tries }
}

const USER = 'ash'
const T0 = Date.UTC(2026, 9, 11, 13, 0)
const base = newSave(4, data, T0 - 60_000, newId)
const row = (save: SaveData, user = USER): Row => ({
  user_id: user,
  realm: 'main',
  data: structuredClone(save),
  updated_at: new Date(save.updatedAt).toISOString(),
})
/** The same save, played on: one more species, a later stamp. */
const played = (s: SaveData, by = 1): SaveData => ({ ...s, pokedex: [...s.pokedex, 100 + s.pokedex.length], updatedAt: s.updatedAt + by * 1000 })
const playOn = (by = 1) => useGame.setState({ save: played(useGame.getState().save!, by) })

beforeEach(() => {
  ;(globalThis as { localStorage?: Storage }).localStorage = memoryStorage()
  vi.useFakeTimers({ now: T0 })
})
afterEach(() => {
  cancelPush()
  vi.useRealTimers()
  useGame.setState({ save: null })
  delete (globalThis as { localStorage?: Storage }).localStorage
})

describe('loading the game with a save already in the cloud', () => {
  it('the first load reads the save and remembers the copy', async () => {
    const cloud = fakeCloud([row(base)])
    useGame.setState({ save: base })
    expect(await reconcile(cloud.client, USER)).toBe('same')
    expect(cloud.downloads()).toBe(1)
    expect(cloud.uploads).toHaveLength(0)
    expect(readCloudMark()).toMatchObject({ user: USER, at: base.updatedAt, key: pushKey(base) })
  })

  it('a reload with nothing new reads only the stamp: no download, no upload', async () => {
    const cloud = fakeCloud([row(base)])
    useGame.setState({ save: base })
    await reconcile(cloud.client, USER)
    for (let i = 0; i < 5; i++) expect(await reconcile(cloud.client, USER)).toBe('same')
    expect(cloud.downloads()).toBe(1)
    expect(cloud.reads.slice(1)).toEqual(Array(5).fill('updated_at'))
    expect(cloud.uploads).toHaveLength(0)
  })

  it('a newer save on the device goes up at once when the device has not uploaded lately', async () => {
    const cloud = fakeCloud([row(base)])
    useGame.setState({ save: base })
    await reconcile(cloud.client, USER)
    playOn()
    await reconcile(cloud.client, USER)
    expect(cloud.downloads()).toBe(1)
    expect(cloud.uploads).toHaveLength(1)
    expect(cloud.rows[0]!.data).toEqual(useGame.getState().save)
    expect(readCloudMark()).toMatchObject({ at: useGame.getState().save!.updatedAt, pushedAt: T0 })
  })

  it('reloading every few seconds uploads once per PUSH_GAP_MS, and what waits goes up after the gap', async () => {
    const cloud = fakeCloud([row(base)])
    useGame.setState({ save: base })
    await reconcile(cloud.client, USER)
    // A minute of reloads, one every 5 s, playing a little in between.
    for (let i = 0; i < 12; i++) {
      playOn()
      await reconcile(cloud.client, USER)
      await vi.advanceTimersByTimeAsync(5_000)
    }
    expect(cloud.uploads).toHaveLength(1)
    expect(cloud.downloads()).toBe(1)
    // The page stays open: the save waiting since the last load goes up once the gap is over.
    await vi.advanceTimersByTimeAsync(PUSH_GAP_MS)
    expect(cloud.uploads).toHaveLength(2)
    expect(cloud.rows[0]!.data).toEqual(useGame.getState().save)
  })

  it('a reload after the gap uploads what the page closed on', async () => {
    const cloud = fakeCloud([row(base)])
    useGame.setState({ save: base })
    await reconcile(cloud.client, USER)
    playOn()
    await reconcile(cloud.client, USER) // uploads
    playOn()
    await reconcile(cloud.client, USER) // within the gap: waits
    cancelPush() // the page closed before the gap was over
    expect(cloud.uploads).toHaveLength(1)
    vi.setSystemTime(T0 + PUSH_GAP_MS)
    playOn()
    await reconcile(cloud.client, USER)
    expect(cloud.uploads).toHaveLength(2)
    expect(cloud.rows[0]!.data).toEqual(useGame.getState().save)
  })

  it('an upload the database refuses as too frequent (0040, HTTP 429) waits for the gap; the sync carries on', async () => {
    const cloud = fakeCloud([row(base)], 1)
    useGame.setState({ save: base })
    await reconcile(cloud.client, USER)
    playOn()
    expect(await reconcile(cloud.client, USER)).toBe('same')
    expect(cloud.uploads).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(PUSH_GAP_MS)
    expect(cloud.uploads).toHaveLength(1)
    expect(cloud.rows[0]!.data).toEqual(useGame.getState().save)
  })

  it('any other failure still fails the sync, as before', async () => {
    const cloud = fakeCloud([row(base)])
    useGame.setState({ save: base })
    await reconcile(cloud.client, USER)
    playOn()
    const down = { select: async () => ({ data: null, error: { code: '500', message: 'down' } }) }
    const broken = { from: () => ({ ...cloud.client.from('saves'), update: () => ({ eq: () => ({ eq: () => ({ gte: () => ({ lt: () => down }) }) }) }) }) }
    await expect(reconcile(broken as unknown as SupabaseClient, USER)).rejects.toMatchObject({ code: '500' })
  })

  it('SYNC ONLINE uploads at once, gap or not', async () => {
    const cloud = fakeCloud([row(base)])
    useGame.setState({ save: base })
    await reconcile(cloud.client, USER)
    playOn()
    await reconcile(cloud.client, USER)
    playOn()
    await reconcile(cloud.client, USER, true)
    expect(cloud.uploads).toHaveLength(2)
  })
})

describe('a cloud copy written elsewhere', () => {
  it('another device played on: the save is downloaded and loaded, as before', async () => {
    const cloud = fakeCloud([row(base)])
    useGame.setState({ save: base })
    await reconcile(cloud.client, USER)
    const elsewhere = played(base, 30)
    cloud.rows[0] = row(elsewhere)
    expect(await reconcile(cloud.client, USER)).toBe('loaded')
    expect(cloud.downloads()).toBe(2)
    expect(useGame.getState().save!.pokedex).toEqual(elsewhere.pokedex)
    expect(readCloudMark()?.at).toBe(elsewhere.updatedAt)
    // …and the next reload trusts it again.
    await reconcile(cloud.client, USER)
    expect(cloud.downloads()).toBe(2)
  })

  it('a stale device opened after the cloud moved on takes the cloud copy, newer stamp or not', async () => {
    const cloud = fakeCloud([row(base)])
    useGame.setState({ save: base })
    await reconcile(cloud.client, USER)
    const further = played(played(base, 1), 2)
    cloud.rows[0] = row(further)
    // This device fiddles (newer stamp, less progress than the cloud).
    useGame.setState({ save: { ...base, updatedAt: base.updatedAt + 60_000 } })
    expect(await reconcile(cloud.client, USER)).toBe('loaded')
    expect(cloud.uploads).toHaveLength(0)
    expect(useGame.getState().save!.pokedex).toEqual(further.pokedex)
  })

  it('this device got further than a copy stamped later: it goes up, stamped now', async () => {
    const cloud = fakeCloud([row(base)])
    useGame.setState({ save: base })
    await reconcile(cloud.client, USER)
    // Another device only touched it (a later stamp, nothing more); this one caught something meanwhile.
    cloud.rows[0] = row({ ...base, updatedAt: T0 + 30_000 })
    useGame.setState({ save: { ...played(base), updatedAt: T0 - 1000 } })
    expect(await reconcile(cloud.client, USER)).toBe('pushed')
    expect(cloud.uploads.at(-1)!.pokedex).toEqual(played(base).pokedex)
    expect(cloud.uploads.at(-1)!.updatedAt).toBeGreaterThan(T0 + 30_000)
  })

  it('a look granted in the cloud copy by SQL (docs/31 §7) stays, whichever copy wins', async () => {
    const LOOK = 'events/halloween-2026-pokemaniac'
    const grant = (s: SaveData): SaveData => ({ ...s, looks: { earned: [LOOK] }, updatedAt: T0 + 30_000 })
    // This device played further meanwhile: its copy wins the compare and goes up, the grant in it.
    const cloud = fakeCloud([row(base)])
    useGame.setState({ save: base })
    await reconcile(cloud.client, USER)
    cloud.rows[0] = row(grant(base))
    useGame.setState({ save: { ...played(base), updatedAt: T0 - 1000 } })
    expect(await reconcile(cloud.client, USER)).toBe('pushed')
    expect(useGame.getState().save!.looks?.earned).toEqual([LOOK])
    expect(cloud.uploads.at(-1)!.looks?.earned).toEqual([LOOK])
    expect(cloud.uploads.at(-1)!.pokedex).toEqual(played(base).pokedex)
    // An idle device: the grant comes down.
    const idle = fakeCloud([row(base)])
    useGame.setState({ save: base })
    await reconcile(idle.client, USER)
    idle.rows[0] = row(grant(base))
    await reconcile(idle.client, USER)
    expect(useGame.getState().save!.looks?.earned).toEqual([LOOK])
  })

  it('another player signs in on the device: their save is read in full', async () => {
    const cloud = fakeCloud([row(base), row(played(base), 'misty')])
    useGame.setState({ save: base })
    await reconcile(cloud.client, USER)
    await reconcile(cloud.client, 'misty')
    expect(cloud.downloads()).toBe(2)
  })

  it('the cloud copy was deleted: the save is read again and goes back up', async () => {
    const cloud = fakeCloud([row(base)])
    useGame.setState({ save: base })
    await reconcile(cloud.client, USER)
    cloud.rows.length = 0
    expect(await reconcile(cloud.client, USER)).toBe('pushed')
    expect(cloud.uploads).toHaveLength(1)
  })
})

describe('a device left open on an old save (2026-10-22)', () => {
  it('writes only over the copy it last matched, and never beside a row it did not know of', async () => {
    const cloud = fakeCloud([row(base)])
    const next = played(base)
    await expect(pushCloudSave(cloud.client, USER, next, base.updatedAt)).resolves.toBe(next.updatedAt)
    // The row moved on since: nothing written.
    await expect(pushCloudSave(cloud.client, USER, played(base, 5), base.updatedAt)).rejects.toBeInstanceOf(SaveConflictError)
    await expect(pushCloudSave(cloud.client, USER, played(base, 5), null)).rejects.toBeInstanceOf(SaveConflictError)
    expect(cloud.uploads).toEqual([next])
    expect(cloud.rows[0]!.data).toEqual(next)
  })

  it('matches a stamp the database keeps with microseconds', async () => {
    const cloud = fakeCloud([{ ...row(base), updated_at: '2026-10-11T12:59:00.000734+00:00' }])
    await expect(pushCloudSave(cloud.client, USER, played(base), base.updatedAt)).resolves.toBe(played(base).updatedAt)
  })

  it('its waiting upload, refused because another device played since, compares again: the further copy loads', async () => {
    const cloud = fakeCloud([row(base)])
    useGame.setState({ save: base })
    await reconcile(cloud.client, USER)
    playOn()
    await reconcile(cloud.client, USER) // uploads
    playOn()
    await reconcile(cloud.client, USER) // within the gap: waits
    // Meanwhile the phone plays on much further, and uploads.
    const phone = played(played(played(base, 2), 3), 4)
    cloud.rows[0] = row({ ...phone, pokedex: [...phone.pokedex, 200, 201, 202] })
    // This page's save is stamped later (an automatic change, the offline pay): it used to go up over the phone's.
    useGame.setState({ save: { ...useGame.getState().save!, updatedAt: Date.now() } })
    await vi.advanceTimersByTimeAsync(PUSH_GAP_MS)
    expect(cloud.uploads).toHaveLength(1)
    expect(useGame.getState().save!.pokedex).toContain(202)
    expect((cloud.rows[0]!.data as SaveData).pokedex).toContain(202)
    expect(readCloudMark()?.at).toBe(phone.updatedAt)
  })

  it('refused in the middle of a fight, it waits for the fight to end, sending nothing meanwhile', async () => {
    const cloud = fakeCloud([row(base)])
    useGame.setState({ save: base })
    await reconcile(cloud.client, USER)
    playOn()
    await reconcile(cloud.client, USER)
    playOn()
    await reconcile(cloud.client, USER) // within the gap: waits
    const phone = played(played(played(base, 2), 3), 4)
    cloud.rows[0] = row(phone)
    const run = useGame.getState().run
    useGame.setState({ run: { ...run, phase: 'battle' } })
    await vi.advanceTimersByTimeAsync(PUSH_GAP_MS)
    const tried = cloud.updates()
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(cloud.updates()).toBe(tried)
    expect(useGame.getState().save!.pokedex).not.toEqual(phone.pokedex)
    useGame.setState({ run })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(useGame.getState().save!.pokedex).toEqual(phone.pokedex)
    expect(cloud.uploads).toHaveLength(1)
  })

  it('…and goes up over it once compared, when this device got further', async () => {
    const cloud = fakeCloud([row(base)])
    useGame.setState({ save: base })
    await reconcile(cloud.client, USER)
    playOn()
    await reconcile(cloud.client, USER)
    playOn(2)
    playOn(3)
    await reconcile(cloud.client, USER) // within the gap: waits
    cloud.rows[0] = row({ ...base, gold: base.gold + 50, updatedAt: base.updatedAt + 90_000 })
    await vi.advanceTimersByTimeAsync(PUSH_GAP_MS)
    expect(cloud.uploads).toHaveLength(2)
    expect((cloud.rows[0]!.data as SaveData).pokedex).toEqual(useGame.getState().save!.pokedex)
    expect(useGame.getState().save!.updatedAt).toBeGreaterThan(base.updatedAt + 90_000)
  })
})

describe('played last, not changed last (2026-10-22)', () => {
  it("a change the game makes on its own leaves when the player last played; the player's own moves it", () => {
    const legacy = { ...base, updatedAt: T0 - 5000 }
    commitSave(legacy, { auto: true })
    // A save from before playedAt: last played no later than its stamp so far.
    expect(useGame.getState().save).toMatchObject({ updatedAt: T0, playedAt: T0 - 5000 })
    vi.setSystemTime(T0 + 1000)
    commitSave({ ...useGame.getState().save!, gold: 1 }, { auto: true })
    expect(useGame.getState().save).toMatchObject({ updatedAt: T0 + 1000, playedAt: T0 - 5000 })
    commitSave({ ...useGame.getState().save!, gold: 2 })
    expect(useGame.getState().save).toMatchObject({ updatedAt: T0 + 1000, playedAt: T0 + 1000 })
    // A save taken in as it is (the cloud's, another tab's) keeps its own.
    commitSave({ ...base, playedAt: 7 }, { keepTimestamp: true })
    expect(useGame.getState().save?.playedAt).toBe(7)
  })

  it('a stale device whose offline pay came in at load takes the copy played since, level on progress', async () => {
    const cloud = fakeCloud([row(base)])
    useGame.setState({ save: base })
    await reconcile(cloud.client, USER)
    // The phone played on (₽, levels: no progress) and uploaded; the PC was closed.
    vi.setSystemTime(T0 + 3_600_000)
    const phone = { ...base, gold: base.gold + 900, updatedAt: Date.now(), playedAt: Date.now() }
    cloud.rows[0] = row(phone)
    // The PC opens the next morning; its offline pay commits before the sync compares.
    vi.setSystemTime(T0 + 86_400_000)
    commitSave({ ...base, gold: base.gold + 40 }, { auto: true })
    expect(useGame.getState().save!.updatedAt).toBeGreaterThan(phone.updatedAt)
    expect(await reconcile(cloud.client, USER)).toBe('loaded')
    expect(useGame.getState().save!.gold).toBe(phone.gold)
    expect(cloud.uploads).toHaveLength(0)
  })

  it('when the player last played is no reason to upload', () => {
    expect(pushKey({ ...base, playedAt: 123 })).toBe(pushKey(base))
  })
})

describe('General upgrades across devices and tabs (lost on 2026-10-16)', () => {
  // Rematches pay ₽ and upgrades spend them, and neither is progress: the two copies tie on areas and the Pokédex.
  const bought = (s: SaveData, general: SaveData['general'], by = 1): SaveData => ({
    ...s,
    gold: s.gold + 100,
    general,
    updatedAt: s.updatedAt + by * 1000,
  })

  it('an idle device opened the next morning takes the copy where the upgrades were bought', async () => {
    const cloud = fakeCloud([row(base)])
    useGame.setState({ save: base })
    await reconcile(cloud.client, USER)
    // The phone did the Kanto rematches and bought levels; this PC never saw it.
    const phone = bought(base, { luck: 2, offline: 4, rulesSeen: true }, 30)
    cloud.rows[0] = row(phone)
    expect(await reconcile(cloud.client, USER)).toBe('loaded')
    expect(useGame.getState().save!.general).toMatchObject({ luck: 2, offline: 4 })
    expect(useGame.getState().save!.gold).toBe(phone.gold)
    expect(cloud.uploads).toHaveLength(0)
  })

  it('a level only this device bought survives the cloud copy winning, and goes up with it', async () => {
    const cloud = fakeCloud([row(base)])
    useGame.setState({ save: base })
    await reconcile(cloud.client, USER)
    cloud.rows[0] = row(played(played(base, 1), 2))
    useGame.setState({ save: bought(base, { offline: 3 }, 1) })
    expect(await reconcile(cloud.client, USER)).toBe('loaded')
    expect(useGame.getState().save!.general?.offline).toBe(3)
    expect(useGame.getState().save!.pokedex).toEqual(played(played(base, 1), 2).pokedex)
    expect(cloud.uploads).toHaveLength(1)
    expect((cloud.rows[0]!.data as SaveData).general?.offline).toBe(3)
  })

  it('a level bought while the sync downloads is not undone by the copy read before', async () => {
    const cloud = fakeCloud([row(base)])
    useGame.setState({ save: base })
    await reconcile(cloud.client, USER)
    cloud.rows[0] = row({ ...base, updatedAt: base.updatedAt + 500 })
    const slow = {
      from: () => {
        const q = cloud.client.from('saves')
        return {
          ...q,
          select: (columns: string) => {
            // The player buys a level while the cloud copy is on its way.
            if (columns.includes('data')) useGame.setState({ save: bought(base, { luck: 1 }, 5) })
            return q.select(columns)
          },
        }
      },
    } as unknown as SupabaseClient
    await reconcile(slow, USER)
    expect(useGame.getState().save!.general?.luck).toBe(1)
    expect((cloud.rows[0]!.data as SaveData).general?.luck).toBe(1)
  })

  it('an old tab takes in the newer save another tab stored, keeping what either bought', () => {
    useGame.setState({ save: bought(base, { rulesSeen: true }, 1) })
    const other = bought(base, { offline: 5 }, 60)
    expect(adoptStoredSave(JSON.stringify(other))).toBe(true)
    expect(useGame.getState().save!.gold).toBe(other.gold)
    expect(useGame.getState().save!.general).toMatchObject({ offline: 5, rulesSeen: true })
    // It added what only this tab had, so it's stamped past the other tab's: that tab takes it in turn.
    expect(useGame.getState().save!.updatedAt).toBeGreaterThan(other.updatedAt)
    // An older one, or this tab's own, changes nothing.
    expect(adoptStoredSave(JSON.stringify(base))).toBe(false)
    expect(adoptStoredSave(JSON.stringify(useGame.getState().save))).toBe(false)
    expect(adoptStoredSave('not a save')).toBe(false)
  })

  it('reads the stored save itself when no value is handed over (the tab coming back)', () => {
    useGame.setState({ save: base })
    const other = bought(base, { luck: 3 }, 60)
    localStorage.setItem(saveKeyOf(), JSON.stringify(other))
    expect(adoptStoredSave()).toBe(true)
    expect(useGame.getState().save!.general?.luck).toBe(3)
    // Nothing added: the other tab's own stamp, so it isn't news to that tab.
    expect(useGame.getState().save!.updatedAt).toBe(other.updatedAt)
  })
})

describe('the mark kept on the device', () => {
  const mark = { user: USER, at: 1000, key: 'k', pushedAt: T0 }

  it('counts the gap from the last upload, for the same player only', () => {
    expect(pushGapLeft(mark, USER, T0)).toBe(PUSH_GAP_MS)
    expect(pushGapLeft(mark, USER, T0 + PUSH_GAP_MS - 1)).toBe(1)
    expect(pushGapLeft(mark, USER, T0 + PUSH_GAP_MS)).toBe(0)
    expect(pushGapLeft(mark, 'misty', T0)).toBe(0)
    expect(pushGapLeft(null, USER, T0)).toBe(0)
  })

  it('never waits longer than the gap, whatever the clock did', () => {
    expect(pushGapLeft({ ...mark, pushedAt: T0 + 86_400_000 }, USER, T0)).toBe(PUSH_GAP_MS)
  })

  it('trusts the cloud copy only for the same player and stamp', () => {
    expect(cloudUnchanged(mark, USER, 1000)).toBe(true)
    expect(cloudUnchanged(mark, USER, 1001)).toBe(false)
    expect(cloudUnchanged(mark, USER, null)).toBe(false)
    expect(cloudUnchanged(mark, 'misty', 1000)).toBe(false)
    expect(cloudUnchanged({ ...mark, at: null }, USER, null)).toBe(false)
  })

  it('reads a stamp with microseconds', async () => {
    const cloud = fakeCloud([{ ...row(base), updated_at: '2026-10-11T13:41:03.561234+00:00' }])
    expect(await cloudSaveAt(cloud.client, USER)).toBe(Date.UTC(2026, 9, 11, 13, 41, 3, 561))
  })

  it('goes with the save: deleting it or all player data forgets it', () => {
    writeCloudMark('main', mark)
    writeCloudMark('extreme', mark)
    wipeSlot('extreme')
    expect(readCloudMark('extreme')).toBeNull()
    expect(readCloudMark('main')).toEqual(mark)
    wipePlayerData()
    expect(readCloudMark('main')).toBeNull()
  })

  it('a fingerprint, not the save: a few bytes on the device', () => {
    expect(pushKey(base)).toMatch(/^[0-9a-f]{16}$/)
  })
})
