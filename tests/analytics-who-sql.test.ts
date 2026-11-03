// Migration 0135 against a real Postgres (PGlite, in process): Admin → Analytics by who plays (docs/57 §1.1). Retention
// sends the guests' own five numbers after everyone's, players per hour the guests' total, and churn counts only the
// players asked for; the deployed build's calls keep their answers. Supabase's own pieces are stood in for at the top,
// as in analytics-starter-sql.test.ts.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')

const ADMIN = 'gregoire.ftn@gmail.com'
const U = {
  admin: '00000000-0000-4000-8000-0000000000aa',
  ash: '00000000-0000-4000-8000-000000000001',
  misty: '00000000-0000-4000-8000-000000000002',
}

let db: PGlite
let today: string
const day = (n: number) => {
  const d = new Date(`${today}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

async function as<T = Record<string, unknown>>(user: string | null, q: string, params: unknown[] = []) {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? ''])
  await db.query(`select set_config('request.jwt.claim.email', $1, false)`, [user === U.admin ? ADMIN : ''])
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

/** A player as the pings would have left them: their days (offsets from today, the first one first) and area. */
async function seed(
  player: string,
  days: number[],
  s: { area?: string; starter?: number; hours?: number } = {},
) {
  for (const n of days)
    await db.query(`insert into player_days (player, day) values ($1, $2::date)`, [player, day(n)])
  for (let h = 0; h < (s.hours ?? 0); h++)
    await db.query(
      `insert into player_hours (hour, player) values (date_trunc('hour', now(), 'UTC') - make_interval(hours => $2), $1)`,
      [player, h],
    )
  const guest = player.startsWith('device:')
  await db.query(
    `insert into players (player, user_id, device_id, first_day, last_day, days, last_area, starter)
     values ($1, $2, $3, $4::date, $5::date, $6, $7, $8)`,
    [
      player,
      guest ? null : player,
      guest ? player.slice(7) : 'dev',
      day(days[0]!),
      day(days.at(-1)!),
      days.length,
      s.area ?? null,
      s.starter ?? null,
    ],
  )
}

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
  await db.exec(sql('0016_regions.sql'))
  await db.exec(sql('0028_analytics_minimal.sql'))
  await db.exec(sql('0042_player_hours.sql'))
  await db.exec(sql('0102_analytics_retention.sql'))
  // 0039's realm, alone, for 0129's backfill: the rest of it needs the optional features' tables.
  await db.exec(`
    alter table saves add column realm text not null default 'main';
    alter table saves drop constraint saves_pkey;
    alter table saves add primary key (user_id, realm);
  `)
  await db.exec(sql('0129_churn_by_starter.sql'))
  await db.exec(
    `insert into auth.users (id) values ${Object.values(U)
      .map((u) => `('${u}')`)
      .join(', ')}`,
  )
  await db.exec(sql('0135_analytics_logged_in.sql'))
  // Safe to run again.
  await db.exec(sql('0135_analytics_logged_in.sql'))
  today = (await db.query<{ d: string }>(`select (now() at time zone 'UTC')::date::text d`)).rows[0]!.d
})

beforeEach(async () => {
  await db.exec(`delete from player_days; delete from player_hours; delete from players;`)
})

describe('analytics_retention: the guests after everyone', () => {
  it('sends, per first day, everyone’s five numbers and then the guests’ own five', async () => {
    await seed(U.ash, [-40, -39, -37, -33, -10]) // back on 1, 3, 7 and 30
    await seed('device:a', [-40, -39]) // back on day 1
    await seed('device:b', [-40, -38]) // day 2 only: counts nowhere
    await seed(U.misty, [-3, -2, 0]) // back on day 1 and day 3
    const r = (await as<{ r: Record<string, number[]> }>(U.admin, `select analytics_retention() r`))[0]!.r
    expect(r).toEqual({
      [day(-40)]: [3, 2, 1, 1, 1, 2, 1, 0, 0, 0],
      [day(-3)]: [1, 1, 1, 0, 0, 0, 0, 0, 0, 0],
    })
  })

  it('is still the admin’s only', async () => {
    expect(await fails(U.ash, `select analytics_retention()`)).toContain('admin only')
    expect(await fails(null, `select analytics_retention()`)).toContain('admin only')
  })
})

describe('analytics_hourly: the guests’ total', () => {
  it('counts the different guests over the 24 hours next to everyone', async () => {
    await seed(U.ash, [0], { hours: 3 })
    await seed('device:a', [0], { hours: 2 })
    await seed('device:b', [0], { hours: 1 })
    const r = (
      await as<{ r: { total: number; guests: number; hours: [string, number, number][] } }>(
        U.admin,
        `select analytics_hourly() r`,
      )
    )[0]!.r
    expect(r.total).toBe(3)
    expect(r.guests).toBe(2)
    // The hour in progress: everyone, two of them guests.
    expect(r.hours.at(-1)!.slice(1)).toEqual([3, 2])
    expect(await fails(U.ash, `select analytics_hourly()`)).toContain('admin only')
  })
})

describe('analytics_churn: for some players', () => {
  const churn = async (who: string | null, since: string | null = null) =>
    (
      await as<{
        r: { areas: Record<string, unknown[]>; unknown: number[]; starters: Record<string, unknown[]> }
      }>(
        U.admin,
        who == null ? `select analytics_churn(3, $1::date) r` : `select analytics_churn(3, $1::date, $2) r`,
        who == null ? [since] : [since, who],
      )
    )[0]!.r

  beforeEach(async () => {
    await seed(U.ash, [-20, -6], { area: 'route-1', starter: 1 }) // churned
    await seed(U.misty, [-5, 0], { area: 'route-1', starter: 4 }) // active
    await seed('device:a', [-9, -8, -7], { area: 'route-1', starter: 1 }) // churned
    await seed('device:b', [-1], { starter: 7 }) // active, no area
  })

  it('counts everyone, the logged-in ones or the guests', async () => {
    const all = await churn('all')
    expect(all.areas).toEqual({ 'route-1': [2, 1, 2.5, 2] })
    expect(all.unknown).toEqual([0, 1])
    expect(all.starters).toEqual({ '1': [2, 0, 2.5, null], '4': [0, 1, null, 2], '7': [0, 1, null, 1] })

    const loggedIn = await churn('logged_in')
    expect(loggedIn.areas).toEqual({ 'route-1': [1, 1, 2, 2] })
    expect(loggedIn.unknown).toEqual([0, 0])
    expect(loggedIn.starters).toEqual({ '1': [1, 0, 2, null], '4': [0, 1, null, 2] })

    const guests = await churn('guests')
    expect(guests.areas).toEqual({ 'route-1': [1, 0, 3, null] })
    expect(guests.unknown).toEqual([0, 1])
    expect(guests.starters).toEqual({ '1': [1, 0, 3, null], '7': [0, 1, null, 1] })
  })

  it('keeps to the time frame as before', async () => {
    expect((await churn('guests', day(-5))).areas).toEqual({})
    expect((await churn('logged_in', day(-5))).areas).toEqual({ 'route-1': [0, 1, null, 2] })
  })

  it("answers the deployed build's two-argument call for everyone", async () => {
    expect(await churn(null)).toEqual(await churn('all'))
    expect((await as<{ r: { areas: unknown } }>(U.admin, `select analytics_churn(3) r`))[0]!.r.areas).toEqual(
      {
        'route-1': [2, 1, 2.5, 2],
      },
    )
  })

  it('takes only all, logged_in or guests, and is the admin’s only', async () => {
    expect(await fails(U.admin, `select analytics_churn(3, null, 'nobody')`)).toContain('bad who')
    expect(await fails(U.admin, `select analytics_churn(3, null, null)`)).toContain('bad who')
    expect(await fails(U.ash, `select analytics_churn(3, null, 'guests')`)).toContain('admin only')
    expect(await fails(null, `select analytics_churn(3, null, 'all')`)).toContain('admin only')
  })
})
