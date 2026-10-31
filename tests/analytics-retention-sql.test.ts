// Migration 0100 against a real Postgres (PGlite, in process): Admin → Analytics, sharper (docs/55). A guest who signs
// in on the same device becomes one player with their account (player_ping's merge, and the one-time backfill for the
// pairs already there); the hourly player_seen carries the area, its old one-argument call still works; retention on
// day 1, 3, 7 and 30 and churn by area, both admin-only; analytics_d1 unchanged. Supabase's own pieces (the auth
// schema, the anon / authenticated roles) are stood in for at the top, as in gifts-sql.test.ts.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')
const FILE = '0100_analytics_retention.sql'

const ADMIN = 'gregoire.ftn@gmail.com'
const U = {
  admin: '00000000-0000-4000-8000-0000000000aa',
  ash: '00000000-0000-4000-8000-000000000001',
  misty: '00000000-0000-4000-8000-000000000002',
  brock: '00000000-0000-4000-8000-000000000003',
}
const EMAIL: Record<string, string> = {
  [U.admin]: ADMIN,
  [U.ash]: 'ash@example.com',
  [U.misty]: 'misty@example.com',
  [U.brock]: 'brock@example.com',
}

let db: PGlite
/** The server's day (UTC), 'YYYY-MM-DD'. */
let today: string
/** The day `n` days from today ('YYYY-MM-DD'). */
const day = (n: number) => {
  const d = new Date(`${today}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Runs as a signed-in user (with their email), or as a guest. */
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

interface Seed {
  /** Days played, as offsets from today; the first is the first day. */
  days: number[]
  user?: string
  device?: string
  name?: string | null
  snapshot?: Record<string, unknown> | null
  area?: string | null
  hours?: number
}
/** A player as the daily pings would have left them: their days, their row, and `hours` recent hours. */
async function seed(player: string, s: Seed) {
  for (const n of s.days)
    await db.query(`insert into player_days (player, day) values ($1, $2::date)`, [player, day(n)])
  for (let h = 0; h < (s.hours ?? 0); h++)
    await db.query(
      `insert into player_hours (hour, player) values (date_trunc('hour', now(), 'UTC') - make_interval(hours => $2), $1)`,
      [player, h + 1],
    )
  const sorted = [...s.days].sort((a, b) => a - b)
  await db.query(
    `insert into players (player, user_id, device_id, name, first_day, last_day, days, snapshot, last_area, updated_at)
     values ($1, $2, $3, $4, $5::date, $6::date, $7, $8::jsonb, $9, now() - interval '1 day')`,
    [
      player,
      s.user ?? null,
      s.device ?? (player.startsWith('device:') ? player.slice(7) : null),
      s.name ?? null,
      day(sorted[0]!),
      day(sorted.at(-1)!),
      sorted.length,
      s.snapshot ? JSON.stringify(s.snapshot) : null,
      s.area ?? null,
    ],
  )
}

interface Row {
  player: string
  user_id: string | null
  device_id: string | null
  name: string | null
  email: string | null
  first_day: string
  last_day: string
  days: number
  last_area: string | null
  snapshot: Record<string, unknown> | null
}
const row = async (player: string) =>
  (
    await db.query<Row>(
      `select player, user_id::text, device_id, name, email, first_day::text, last_day::text, days, last_area, snapshot
       from players where player = $1`,
      [player],
    )
  ).rows[0]
const daysOf = async (player: string) =>
  (
    await db.query<{ d: string }>(`select day::text d from player_days where player = $1 order by day`, [
      player,
    ])
  ).rows.map((r) => r.d)
const hoursOf = async (player: string) =>
  (await db.query<{ n: number }>(`select count(*)::int n from player_hours where player = $1`, [player]))
    .rows[0]!.n
const ping = (user: string | null, device: string, name: string | null = null, snapshot: unknown = null) =>
  as(user, `select player_ping($1, $2::date, $3, $4::jsonb)`, [
    device,
    today,
    name,
    snapshot == null ? null : JSON.stringify(snapshot),
  ])

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
  await db.exec(sql(FILE))
  today = (await db.query<{ d: string }>(`select (now() at time zone 'UTC')::date::text d`)).rows[0]!.d
})

beforeEach(async () => {
  await db.exec(`delete from player_days; delete from player_hours; delete from players;`)
})

describe('players.last_area', () => {
  it("starts from the area of the latest snapshot, and a second run keeps what's newer", async () => {
    // A player from before 0100: their area is only in their snapshot.
    await db.exec(`insert into players (player, first_day, last_day, days, snapshot)
      values ('device:old', '2026-01-01', '2026-01-02', 2, '{"areaId": "route-1"}')`)
    await db.exec(sql(FILE))
    expect((await row('device:old'))!.last_area).toBe('route-1')
    await db.exec(`update players set last_area = 'route-9' where player = 'device:old'`)
    await db.exec(sql(FILE))
    expect((await row('device:old'))!.last_area).toBe('route-9')
  })
})

describe('player_ping: a guest who signs in is one player', () => {
  it("moves the device's guest days and hours to the account and keeps the guest's first day", async () => {
    await seed('device:dev-a', {
      days: [-5, -4, -1],
      name: 'Leaf',
      snapshot: { areaId: 'route-2' },
      hours: 2,
    })
    await ping(U.ash, 'dev-a', 'Ash', { areaId: 'route-3', badges: 1 })
    expect(await row('device:dev-a')).toBeUndefined()
    expect(await daysOf('device:dev-a')).toEqual([])
    expect(await hoursOf('device:dev-a')).toBe(0)
    expect(await row(U.ash)).toMatchObject({
      user_id: U.ash,
      device_id: 'dev-a',
      name: 'Ash',
      email: 'ash@example.com',
      first_day: day(-5),
      last_day: today,
      days: 4,
      last_area: 'route-3',
      snapshot: { areaId: 'route-3', badges: 1 },
    })
    expect(await daysOf(U.ash)).toEqual([day(-5), day(-4), day(-1), today])
    // The guest's two hours, and this one.
    expect(await hoursOf(U.ash)).toBe(3)
  })

  it("keeps the account's details, takes the guest's where it has none, and counts a shared day once", async () => {
    await seed(U.misty, { days: [-2, -1], user: U.misty, device: 'dev-old', name: 'Misty', area: 'cerulean' })
    await seed('device:dev-b', { days: [-10, -2], name: 'Guest Misty', snapshot: { areaId: 'route-4' } })
    // An Extreme save's ping: no name, no snapshot.
    await ping(U.misty, 'dev-b')
    expect(await row('device:dev-b')).toBeUndefined()
    expect(await row(U.misty)).toMatchObject({
      name: 'Misty',
      device_id: 'dev-b',
      first_day: day(-10),
      last_day: today,
      days: 4,
      last_area: 'cerulean',
      // The account had no snapshot: the guest's stands in.
      snapshot: { areaId: 'route-4' },
    })
    expect(await daysOf(U.misty)).toEqual([day(-10), day(-2), day(-1), today])
  })

  it("falls back to the guest's name when the account has none", async () => {
    await seed(U.brock, { days: [-1], user: U.brock, device: 'dev-old' })
    await seed('device:dev-c', { days: [-3], name: 'Gold' })
    await ping(U.brock, 'dev-c')
    expect(await row(U.brock)).toMatchObject({ name: 'Gold', first_day: day(-3), days: 3 })
  })

  it('changes nothing for a guest, or for an account on a device with no guest row', async () => {
    await seed('device:dev-d', { days: [-3] })
    await ping(null, 'dev-d', 'Leaf')
    expect(await row('device:dev-d')).toMatchObject({
      first_day: day(-3),
      days: 2,
      name: 'Leaf',
      user_id: null,
    })
    await ping(U.ash, 'dev-e', 'Ash')
    expect(await row(U.ash)).toMatchObject({ first_day: today, days: 1 })
    expect(await row('device:dev-d')).toBeDefined()
  })

  it('a second ping the same day finds nothing left to move', async () => {
    await seed('device:dev-a', { days: [-1] })
    await ping(U.ash, 'dev-a', 'Ash')
    await ping(U.ash, 'dev-a', 'Ash')
    expect(await row(U.ash)).toMatchObject({ first_day: day(-1), days: 2 })
  })

  it('is not callable by the players themselves', async () => {
    expect(
      (
        await db.query<{ ok: boolean }>(
          `select has_function_privilege('anon', 'analytics_merge_player(text, text)', 'execute')
              or has_function_privilege('authenticated', 'analytics_merge_player(text, text)', 'execute') ok`,
        )
      ).rows[0]!.ok,
    ).toBe(false)
  })
})

describe('the one-time backfill', () => {
  it("merges each account's latest device's guest row, the earliest account first on a shared device", async () => {
    await seed(U.ash, { days: [-3, 0], user: U.ash, device: 'shared', name: 'Ash' })
    await seed(U.misty, { days: [-1], user: U.misty, device: 'shared', name: 'Misty' })
    await seed('device:shared', { days: [-8, -3], name: 'Kid', hours: 1 })
    await seed('device:alone', { days: [-2] })
    await seed(U.brock, { days: [-1], user: U.brock, device: 'brock-phone' })
    await db.exec(sql(FILE))
    expect(await row('device:shared')).toBeUndefined()
    expect(await row(U.ash)).toMatchObject({ name: 'Ash', first_day: day(-8), last_day: today, days: 3 })
    expect(await hoursOf(U.ash)).toBe(1)
    expect(await row(U.misty)).toMatchObject({ first_day: day(-1), days: 1 })
    expect(await row('device:alone')).toMatchObject({ days: 1 })
    expect(await row(U.brock)).toMatchObject({ days: 1 })
    // Safe to run again: nothing left to merge.
    await db.exec(sql(FILE))
    expect(await row(U.ash)).toMatchObject({ first_day: day(-8), days: 3 })
    expect(await db.query(`select player from players order by player`)).toMatchObject({
      rows: [{ player: U.ash }, { player: U.misty }, { player: U.brock }, { player: 'device:alone' }],
    })
  })
})

describe('player_seen: the hour, and now the area', () => {
  it('records the area of the hour played; no area leaves it as it was', async () => {
    await seed('device:dev-a', { days: [0], area: 'route-1' })
    await as(null, `select player_seen($1, $2)`, ['dev-a', 'route-5'])
    expect((await row('device:dev-a'))!.last_area).toBe('route-5')
    expect(await hoursOf('device:dev-a')).toBe(1)
    // An Extreme save sends none.
    await as(null, `select player_seen($1, $2)`, ['dev-a', null])
    expect((await row('device:dev-a'))!.last_area).toBe('route-5')
    // Nonsense is ignored, not stored.
    await as(null, `select player_seen($1, $2)`, ['dev-a', 'x'.repeat(65)])
    expect((await row('device:dev-a'))!.last_area).toBe('route-5')
  })

  it("keeps the deployed build's one-argument call working, unambiguously", async () => {
    await seed('device:dev-a', { days: [0], area: 'route-1' })
    await as(null, `select player_seen($1)`, ['dev-a'])
    await as(null, `select player_seen('dev-a')`)
    await as(null, `select player_seen(p_device_id => 'dev-a')`)
    expect(await hoursOf('device:dev-a')).toBe(1)
    expect((await row('device:dev-a'))!.last_area).toBe('route-1')
    expect(await fails(null, `select player_seen('')`)).toContain('bad device id')
  })

  it("updates a signed-in player's row, and the daily ping's snapshot sets it too", async () => {
    await ping(U.ash, 'dev-a', 'Ash', { areaId: 'route-2' })
    expect((await row(U.ash))!.last_area).toBe('route-2')
    await as(U.ash, `select player_seen(p_device_id => $1, p_area_id => $2)`, ['dev-a', 'route-3'])
    expect((await row(U.ash))!.last_area).toBe('route-3')
    // The Extreme save's daily ping (no snapshot) leaves it.
    await ping(U.ash, 'dev-a')
    expect((await row(U.ash))!.last_area).toBe('route-3')
  })
})

describe('analytics_retention', () => {
  it('counts, per first day, the new players and those back on day 1, 3, 7 and 30', async () => {
    await seed('device:a', { days: [-40, -39, -37, -33, -10] }) // back on 1, 3, 7, and day 30
    await seed('device:b', { days: [-40, -38] }) // day 2 only: counts nowhere
    await seed('device:c', { days: [-40, -39] })
    await seed('device:d', { days: [-3, -2, 0] }) // back on day 1 and day 3
    await seed('device:e', { days: [-3] })
    const r = (await as<{ r: Record<string, number[]> }>(U.admin, `select analytics_retention() r`))[0]!.r
    expect(r).toEqual({ [day(-40)]: [3, 2, 1, 1, 1], [day(-3)]: [2, 1, 1, 0, 0] })
    // analytics_d1, still there for the deployed build, agrees on day 1.
    const d1 = (await as<{ r: Record<string, number[]> }>(U.admin, `select analytics_d1() r`))[0]!.r
    expect(d1).toEqual({ [day(-40)]: [3, 2], [day(-3)]: [2, 1] })
  })

  it('is empty with no players, and the admin’s only', async () => {
    expect((await as<{ r: unknown }>(U.admin, `select analytics_retention() r`))[0]!.r).toEqual({})
    expect(await fails(U.ash, `select analytics_retention()`)).toContain('admin only')
    expect(await fails(null, `select analytics_retention()`)).toContain('admin only')
  })
})

describe('analytics_churn', () => {
  const churn = async (days: number, since: string | null = null) =>
    (
      await as<{ r: { today: string; cutoff: string; areas: Record<string, unknown[]>; unknown: number[] } }>(
        U.admin,
        `select analytics_churn($1, $2::date) r`,
        [days, since],
      )
    )[0]!.r

  beforeEach(async () => {
    await seed('device:a', { days: [-20, -6], area: 'route-1' }) // churned
    await seed('device:b', { days: [-20, -19, -18, -3], area: 'route-1' }) // churned at 3 days, not at 4
    await seed('device:c', { days: [-5, 0], area: 'route-1' }) // active
    await seed('device:d', { days: [-4], snapshot: { areaId: 'route-2' } }) // churned: area from the snapshot
    await seed('device:e', { days: [-9] }) // churned, no area
    await seed('device:f', { days: [-1] }) // active, no area
  })

  it('counts per area the churned and the active, with their average days played', async () => {
    const c = await churn(3)
    expect(c.today).toBe(today)
    expect(c.cutoff).toBe(day(-3))
    expect(c.areas).toEqual({ 'route-1': [2, 1, 3, 2], 'route-2': [1, 0, 1, null] })
    expect(c.unknown).toEqual([1, 1])
    // Four days away: device:b is still active.
    expect((await churn(4)).areas['route-1']).toEqual([1, 2, 2, 3])
  })

  it('keeps to the players whose first day is on or after `since`', async () => {
    const c = await churn(3, day(-5))
    expect(c.areas).toEqual({ 'route-1': [0, 1, null, 2], 'route-2': [1, 0, 1, null] })
    expect(c.unknown).toEqual([0, 1])
  })

  it('takes 1 to 365 days, and is the admin’s only', async () => {
    expect(await fails(U.admin, `select analytics_churn(0)`)).toContain('bad days')
    expect(await fails(U.admin, `select analytics_churn(366)`)).toContain('bad days')
    expect(await fails(U.ash, `select analytics_churn(3)`)).toContain('admin only')
    expect(await fails(null, `select analytics_churn(3)`)).toContain('admin only')
  })
})
