// Migration 0130 against a real Postgres (PGlite, in process): playtime (docs/57 §3.2). The game's two calls carry the
// seconds played (new overloads; the deployed ones keep working), a call's seconds are bounded, a guest who signs in
// brings theirs to the account, and analytics_playtime adds them up for the admin only.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')
const FILE = '0130_analytics_playtime.sql'

const ADMIN = 'gregoire.ftn@gmail.com'
const U = {
  admin: '00000000-0000-4000-8000-0000000000aa',
  ash: '00000000-0000-4000-8000-000000000001',
}
const EMAIL: Record<string, string> = { [U.admin]: ADMIN, [U.ash]: 'ash@example.com' }

let db: PGlite
let today: string

async function as<T = Record<string, unknown>>(
  user: string | null,
  q: string,
  params: unknown[] = [],
): Promise<T[]> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? ''])
  await db.query(`select set_config('request.jwt.claim.email', $1, false)`, [user ? (EMAIL[user] ?? '') : ''])
  try {
    return (await db.query<T>(q, params)).rows
  } finally {
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`)
    await db.query(`select set_config('request.jwt.claim.email', '', false)`)
  }
}
async function fails(user: string | null, q: string, params: unknown[] = []): Promise<string> {
  try {
    await as(user, q, params)
  } catch (e) {
    return (e as Error).message
  }
  return 'no error'
}

const ping = (user: string | null, device: string, seconds?: number) =>
  seconds === undefined
    ? as(user, `select player_ping($1, $2::date, null, null)`, [device, today])
    : as(user, `select player_ping($1, $2::date, null, null, $3)`, [device, today, seconds])
const seen = (user: string | null, device: string, seconds: number) =>
  as(user, `select player_seen(p_device_id => $1, p_area_id => null, p_seconds => $2)`, [device, seconds])
const played = async (player: string) =>
  (
    await db.query<{ s: number; since: string | null }>(
      `select play_seconds::int s, play_since::text since from players where player = $1`,
      [player],
    )
  ).rows[0]

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
  await db.exec(sql('0028_analytics_minimal.sql'))
  await db.exec(sql('0042_player_hours.sql'))
  await db.exec(
    `insert into auth.users (id) values ${Object.values(U)
      .map((u) => `('${u}')`)
      .join(', ')}`,
  )
  await db.exec(sql('0102_analytics_retention.sql'))
  await db.exec(sql(FILE))
  today = (await db.query<{ d: string }>(`select (now() at time zone 'UTC')::date::text d`)).rows[0]!.d
})

beforeEach(async () => {
  await db.exec(`delete from player_days; delete from player_hours; delete from players;`)
})

describe('the game sends the seconds with its calls', () => {
  it('adds them up from the daily and the hourly call, and notes when the first came', async () => {
    await ping(null, 'dev-a', 600)
    const first = await played('device:dev-a')
    expect(first!.s).toBe(600)
    expect(first!.since).not.toBeNull()
    await seen(null, 'dev-a', 1200)
    await seen(null, 'dev-a', 30)
    expect(await played('device:dev-a')).toEqual({ s: 1830, since: first!.since })
    // The hour is still counted, as the deployed call does.
    const hours = await db.query<{ n: number }>(
      `select count(*)::int n from player_hours where player = 'device:dev-a'`,
    )
    expect(hours.rows[0]!.n).toBe(1)
  })

  it('keeps the deployed calls working, with no seconds', async () => {
    await ping(null, 'dev-a')
    await as(null, `select player_seen($1, $2)`, ['dev-a', 'route-1'])
    await as(null, `select player_seen($1)`, ['dev-a'])
    expect(await played('device:dev-a')).toEqual({ s: 0, since: null })
  })

  it('drops a call claiming more than 2 hours, or none', async () => {
    await ping(null, 'dev-a', 7201)
    await seen(null, 'dev-a', -5)
    await seen(null, 'dev-a', 0)
    expect((await played('device:dev-a'))!.s).toBe(0)
    await seen(null, 'dev-a', 7200)
    expect((await played('device:dev-a'))!.s).toBe(7200)
  })

  it("still checks the call's device", async () => {
    expect(await fails(null, `select player_seen('', null, 10)`)).toContain('bad device id')
  })

  it("can't be called by a player to add time anywhere", async () => {
    const r = await db.query<{ ok: boolean }>(
      `select has_function_privilege('anon', 'analytics_add_playtime(text, int)', 'execute')
          or has_function_privilege('authenticated', 'analytics_add_playtime(text, int)', 'execute') ok`,
    )
    expect(r.rows[0]!.ok).toBe(false)
  })
})

describe('a guest who signs in', () => {
  it('brings their playtime to the account, and the account keeps its own', async () => {
    await ping(null, 'dev-a', 900)
    await ping(U.ash, 'dev-b', 300)
    await ping(U.ash, 'dev-a', 60)
    expect(await played('device:dev-a')).toBeUndefined()
    expect((await played(U.ash))!.s).toBe(1260)
  })
})

describe('analytics_playtime', () => {
  it('gives every player with time or a recent hour, and the total', async () => {
    await ping(null, 'dev-a', 900)
    await ping(U.ash, 'dev-b', 300)
    // A player from before 0130: an hour played in, no seconds.
    await ping(null, 'dev-c')
    // Hours older than 7 days don't count.
    await db.exec(`insert into player_hours (hour, player) values
      (date_trunc('hour', now(), 'UTC') - interval '2 hours', 'device:dev-a'),
      (date_trunc('hour', now(), 'UTC') - interval '8 days', 'device:dev-a')`)
    const [r] = await as<{ p: { since: string; total: number; rows: Record<string, [number, number]> } }>(
      U.admin,
      `select analytics_playtime() p`,
    )
    expect(r!.p.total).toBe(1200)
    expect(r!.p.since).not.toBeNull()
    expect(r!.p.rows).toEqual({ 'device:dev-a': [900, 2], [U.ash]: [300, 1], 'device:dev-c': [0, 1] })
  })

  it('answers with nothing counted yet', async () => {
    const [r] = await as<{ p: unknown }>(U.admin, `select analytics_playtime() p`)
    expect(r!.p).toEqual({ since: null, total: 0, rows: {} })
  })

  it('is for the admin only', async () => {
    expect(await fails(U.ash, `select analytics_playtime()`)).toContain('admin only')
    expect(await fails(null, `select analytics_playtime()`)).toContain('admin only')
  })
})

describe('the migration', () => {
  it('is safe to run again, and keeps the seconds', async () => {
    await ping(null, 'dev-a', 120)
    await db.exec(sql(FILE))
    expect((await played('device:dev-a'))!.s).toBe(120)
  })
})
