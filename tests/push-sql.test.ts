// Migration 0053 against a real Postgres (PGlite, in process): push notifications (docs/27). The switch gates every
// call; a schedule replaces the owner's unsent notices and never resends a sent one; the sender gets each due notice
// once, for the subscriptions that want its topic; gone endpoints are dropped; deleting your data takes them too.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '@/engine'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')

const ASH = '00000000-0000-4000-8000-000000000001'
const MISTY = '00000000-0000-4000-8000-000000000002'
const ADMIN = '00000000-0000-4000-8000-000000000009'
const KEY = 'B'.repeat(87)
const AUTH = 'a'.repeat(22)

let db: PGlite

async function as<T = Record<string, unknown>>(
  user: string | null,
  q: string,
  params: unknown[] = [],
): Promise<T[]> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? ''])
  await db.query(`select set_config('request.jwt.claim.email', $1, false)`, [
    user === ADMIN ? 'gregoire.ftn@gmail.com' : '',
  ])
  return (await db.query<T>(q, params)).rows
}
async function fails(user: string | null, q: string, params: unknown[] = []): Promise<string> {
  try {
    await as(user, q, params)
  } catch (e) {
    return (e as Error).message
  }
  return 'no error'
}
const setAccess = (access: string) =>
  db.query(`update game_config set value = value || $1::jsonb where key = 'push'`, [
    JSON.stringify({ access }),
  ])

const subscribe = (
  user: string | null,
  endpoint: string,
  topics = ['egg', 'raid', 'live'],
  device = 'dev-1',
) =>
  as(user, `select push_subscribe($1, $2, $3, $4, 'android', 'fr', $5)`, [
    device,
    endpoint,
    KEY,
    AUTH,
    topics,
  ])
const schedule = (user: string | null, endpoint: string, notices: unknown[], device = 'dev-1') =>
  as<{ n: number }>(user, `select push_schedule($1, $2, $3::jsonb) as n`, [
    device,
    endpoint,
    JSON.stringify(notices),
  ])
const notice = (key: string, topic: string, atMs: number) => ({
  key,
  topic,
  at: new Date(atMs).toISOString(),
  payload: { title: `T ${key}`, body: 'B', tag: key, url: '/home' },
})
const due = () =>
  as<{ notice: number; endpoint: string; payload: { tag: string } }>(null, `select * from push_due(100)`)

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$
      select jsonb_strip_nulls(jsonb_build_object('email', nullif(current_setting('request.jwt.claim.email', true), ''))) $$;
    grant usage on schema auth to anon, authenticated;
  `)
  await db.exec(sql('0001_init.sql').replace('create extension if not exists pgcrypto;', ''))
  for (const f of [
    '0011_leaderboard.sql',
    '0016_regions.sql',
    '0018_versus.sql',
    '0030_pokemon_forms.sql',
    '0032_leaderboard_shiny.sql',
    '0033_friends.sql',
    '0034_day_care.sql',
    '0035_events.sql',
    '0037_skip_unchanged_saves.sql',
    '0038_delete_my_data.sql',
    '0039_extreme_realm.sql',
    '0040_lighter_save_writes.sql',
    '0044_trades.sql',
    '0053_push.sql',
  ])
    await db.exec(sql(f))
  // Safe to run again.
  await db.exec(sql('0053_push.sql'))
  await db.exec(`insert into auth.users (id) values ('${ASH}'), ('${MISTY}'), ('${ADMIN}')`)
})

afterAll(async () => {
  await db.close()
})

beforeEach(async () => {
  await db.exec(`delete from push_notices; delete from push_subscriptions;`)
  await setAccess('all')
})

describe('the switch', () => {
  it('starts off, with the game defaults', async () => {
    const [row] = await as<{ value: Record<string, unknown> }>(
      null,
      `select value from game_config where key = 'push'`,
    )
    // beforeEach switched it on; the rest are the defaults.
    expect({ ...row!.value, access: 'off' }).toEqual(DEFAULT_CONFIG.push)
  })

  it('off: no subscription, no schedule, nothing sent', async () => {
    await subscribe(ASH, 'https://push.example/a')
    await schedule(ASH, 'https://push.example/a', [notice('egg:1', 'egg', Date.now() - 1000)])
    await setAccess('off')
    expect(
      await fails(
        MISTY,
        `select push_subscribe('d', 'https://push.example/m', $1, $2, 'ios', 'en', '{egg}')`,
        [KEY, AUTH],
      ),
    ).toContain('push_off')
    expect(await fails(ASH, `select push_schedule('d', 'https://push.example/a', '[]'::jsonb)`)).toContain(
      'push_off',
    )
    expect(await due()).toEqual([])
  })

  it('on for admin: only the admin subscribes, and only the admin is sent anything', async () => {
    await subscribe(ASH, 'https://push.example/a')
    await schedule(ASH, 'https://push.example/a', [notice('egg:1', 'egg', Date.now() - 1000)])
    await setAccess('admin')
    expect(
      await fails(
        MISTY,
        `select push_subscribe('d', 'https://push.example/m', $1, $2, 'ios', 'en', '{egg}')`,
        [KEY, AUTH],
      ),
    ).toContain('push_off')
    await subscribe(ADMIN, 'https://push.example/admin')
    await schedule(ADMIN, 'https://push.example/admin', [notice('egg:2', 'egg', Date.now() - 1000)])
    expect((await due()).map((r) => r.endpoint)).toEqual(['https://push.example/admin'])
  })
})

describe('subscribing', () => {
  it('refuses a broken subscription', async () => {
    expect(
      await fails(ASH, `select push_subscribe('d', 'http://push.example/a', $1, $2, 'ios', 'en', '{egg}')`, [
        KEY,
        AUTH,
      ]),
    ).toContain('push_bad_subscription')
    expect(
      await fails(
        ASH,
        `select push_subscribe('d', 'https://push.example/a', 'x', $1, 'ios', 'en', '{egg}')`,
        [AUTH],
      ),
    ).toContain('push_bad_subscription')
  })

  it('a guest is their device; signing in moves the endpoint to the player', async () => {
    await subscribe(null, 'https://push.example/a', ['egg', 'nonsense'])
    let [row] = await as<{ owner: string; topics: string[] }>(
      null,
      `select owner, topics from push_subscriptions`,
    )
    expect(row).toEqual({ owner: 'd:dev-1', topics: ['egg'] })
    await subscribe(ASH, 'https://push.example/a')
    ;[row] = await as<{ owner: string; topics: string[] }>(
      null,
      `select owner, topics from push_subscriptions`,
    )
    expect(row!.owner).toBe(`u:${ASH}`)
  })

  it('needs a device id when signed out', async () => {
    expect(
      await fails(null, `select push_subscribe('', 'https://push.example/a', $1, $2, 'ios', 'en', '{egg}')`, [
        KEY,
        AUTH,
      ]),
    ).toContain('push_no_owner')
  })

  it('keeps 10 browsers a player at most', async () => {
    for (let i = 0; i < 12; i++) await subscribe(ASH, `https://push.example/${i}`)
    const [row] = await as<{ n: number }>(null, `select count(*)::int n from push_subscriptions`)
    expect(row!.n).toBe(10)
  })

  it('unsubscribing by the endpoint', async () => {
    await subscribe(ASH, 'https://push.example/a')
    await as(null, `select push_unsubscribe('https://push.example/a')`)
    expect(await as(null, `select * from push_subscriptions`)).toEqual([])
  })
})

describe('scheduling and sending', () => {
  it('only through one of your own subscriptions', async () => {
    await subscribe(ASH, 'https://push.example/a')
    expect(await fails(MISTY, `select push_schedule('d', 'https://push.example/a', '[]'::jsonb)`)).toContain(
      'push_not_subscribed',
    )
  })

  it('checks every notice', async () => {
    await subscribe(ASH, 'https://push.example/a')
    const far = Date.now() + 40 * 86_400_000
    for (const bad of [
      [notice('raid:x', 'raid', far)],
      [notice('x', 'weather', Date.now())],
      [{ ...notice('x', 'egg', Date.now()), payload: { body: 'x'.repeat(4000) } }],
      Array.from({ length: 17 }, (_, i) => notice(`k${i}`, 'egg', Date.now())),
    ])
      expect(
        await fails(ASH, `select push_schedule('d', 'https://push.example/a', $1::jsonb)`, [
          JSON.stringify(bad),
        ]),
      ).toContain('push_bad_notices')
  })

  it('replaces the unsent list, sends each due notice once, never twice under the same key', async () => {
    const now = Date.now()
    await subscribe(ASH, 'https://push.example/a')
    await subscribe(ASH, 'https://push.example/b', ['raid'], 'dev-2')
    const [n] = await schedule(ASH, 'https://push.example/a', [
      notice('egg:1', 'egg', now - 1000),
      notice('raid:d1', 'raid', now - 1000),
      notice('live:x', 'live', now + 3_600_000),
    ])
    expect(n!.n).toBe(3)
    // The phone wants raids only; the computer everything.
    const sent = await due()
    expect(sent.map((r) => `${r.payload.tag}@${r.endpoint.slice(-1)}`).sort()).toEqual([
      'egg:1@a',
      'raid:d1@a',
      'raid:d1@b',
    ])
    expect(await due()).toEqual([])
    // A new plan: the Egg is still in it (sent: not again), the live event is gone, a raid is new.
    await schedule(ASH, 'https://push.example/a', [
      notice('egg:1', 'egg', now - 1000),
      notice('raid:d2', 'raid', now - 500),
    ])
    expect((await due()).map((r) => r.payload.tag)).toEqual(['raid:d2', 'raid:d2'])
    const rows = await as<{ key: string }>(null, `select key from push_notices where sent_at is null`)
    expect(rows).toEqual([])
  })

  it('drops notices over six hours late', async () => {
    await subscribe(ASH, 'https://push.example/a')
    await schedule(ASH, 'https://push.example/a', [notice('egg:old', 'egg', Date.now() - 7 * 3_600_000)])
    expect(await due()).toEqual([])
    expect(await as(null, `select * from push_notices`)).toEqual([])
  })

  it('push_report drops gone endpoints and notes the run', async () => {
    await subscribe(ASH, 'https://push.example/a')
    await subscribe(ASH, 'https://push.example/b', undefined, 'dev-2')
    await as(null, `select push_report('{https://push.example/a}', '{https://push.example/b}')`)
    const subs = await as<{ endpoint: string; sent: boolean }>(
      null,
      `select endpoint, last_sent_at is not null sent from push_subscriptions`,
    )
    expect(subs).toEqual([{ endpoint: 'https://push.example/a', sent: true }])
    const [run] = await as<{ sent: number; gone: number }>(null, `select sent, gone from push_runs`)
    expect(run).toEqual({ sent: 1, gone: 1 })
  })

  it('the sender calls are not the players’', async () => {
    const [row] = await as<{ ok: boolean }>(
      null,
      `select has_function_privilege('anon', 'push_due(int)', 'execute') or has_function_privilege('authenticated', 'push_report(text[], text[])', 'execute') ok`,
    )
    expect(row!.ok).toBe(false)
  })
})

describe('the admin and deleting your data', () => {
  it('push_stats is the admin’s', async () => {
    await subscribe(ASH, 'https://push.example/a')
    expect(await fails(ASH, `select push_stats()`)).toContain('admin_only')
    const [row] = await as<{ s: { subscriptions: number; platforms: Record<string, number> } }>(
      ADMIN,
      `select push_stats() s`,
    )
    expect(row!.s.subscriptions).toBe(1)
    expect(row!.s.platforms).toEqual({ android: 1 })
  })

  it('delete_my_data takes the subscriptions and notices', async () => {
    await subscribe(ASH, 'https://push.example/a')
    await subscribe(MISTY, 'https://push.example/m')
    await schedule(ASH, 'https://push.example/a', [notice('egg:1', 'egg', Date.now() + 60_000)])
    await as(ASH, `select delete_my_data()`)
    const subs = await as<{ owner: string }>(null, `select owner from push_subscriptions`)
    expect(subs).toEqual([{ owner: `u:${MISTY}` }])
    expect(await as(null, `select * from push_notices`)).toEqual([])
  })
})
