// Migration 0129 against a real Postgres (PGlite, in process): churn by starter (docs/57 §3.1). The daily snapshot's
// starter lands in players.starter (a trigger, so player_ping and the guest merge stay as 0102 left them); the
// one-time backfill takes a signed-in player's from their main save and a guest's from a Kanto snapshot holding one
// Kanto starter only; analytics_churn counts by starter next to the areas. Supabase's own pieces are stood in for at
// the top, as in analytics-retention-sql.test.ts.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')
const FILE = '0129_churn_by_starter.sql'

const ADMIN = 'gregoire.ftn@gmail.com'
const U = {
  admin: '00000000-0000-4000-8000-0000000000aa',
  ash: '00000000-0000-4000-8000-000000000001',
  misty: '00000000-0000-4000-8000-000000000002',
  brock: '00000000-0000-4000-8000-000000000003',
  gary: '00000000-0000-4000-8000-000000000004',
}
const PALLET = '00000000-0000-4000-8000-00000000a001'
const NEW_BARK = '00000000-0000-4000-8000-00000000a002'

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

/** A player's row as the pings would have left it: first and last day `first`/`last` days from today. */
async function seed(
  player: string,
  s: { first: number; last?: number; days?: number; snapshot?: unknown; area?: string; user?: string },
) {
  await db.query(
    `insert into players (player, user_id, device_id, first_day, last_day, days, snapshot, last_area)
     values ($1, $2, $3, $4::date, $5::date, $6, $7::jsonb, $8)`,
    [
      player,
      s.user ?? null,
      player.startsWith('device:') ? player.slice(7) : 'dev',
      day(s.first),
      day(s.last ?? s.first),
      s.days ?? 1,
      s.snapshot == null ? null : JSON.stringify(s.snapshot),
      s.area ?? null,
    ],
  )
}
const starterOf = async (player: string) =>
  (await db.query<{ s: number | null }>(`select starter s from players where player = $1`, [player])).rows[0]
    ?.s
const ping = (device: string, snapshot: unknown) =>
  as(null, `select player_ping($1, $2::date, null, $3::jsonb)`, [device, today, JSON.stringify(snapshot)])

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
  // 0039's realm, alone: the rest of it needs the optional features' tables.
  await db.exec(`
    alter table saves add column realm text not null default 'main';
    alter table saves drop constraint saves_pkey;
    alter table saves add primary key (user_id, realm);
  `)
  await db.exec(
    `insert into auth.users (id) values ${Object.values(U)
      .map((u) => `('${u}')`)
      .join(', ')}`,
  )
  await db.exec(`
    insert into regions (id, name, order_index, dex_range, starters, league_area_id) values
      ('kanto', 'Kanto', 0, '[1, 151]', '[1, 4, 7]', '${PALLET}'),
      ('johto', 'Johto', 1, '[152, 251]', '[152, 155, 158]', '${NEW_BARK}');
    insert into areas (id, order_index, name, min_level, max_level, encounter_weights, region_id) values
      ('${PALLET}', 0, 'Pallet Town', 2, 4, '{}', 'kanto'),
      ('${NEW_BARK}', 1, 'New Bark Town', 2, 4, '{}', 'johto');
  `)
  today = (await db.query<{ d: string }>(`select (now() at time zone 'UTC')::date::text d`)).rows[0]!.d
})

beforeEach(async () => {
  await db.exec(`delete from player_days; delete from player_hours; delete from players; delete from saves;`)
})

describe('players.starter from the snapshot', () => {
  it('is set by the daily ping, and kept by a snapshot without one', async () => {
    await db.exec(sql(FILE))
    await ping('d1', { areaId: PALLET, dex: [4], starter: 4 })
    expect(await starterOf('device:d1')).toBe(4)
    // A build from before 0129: its snapshot has no starter.
    await db.query(`update players set snapshot = '{"areaId": "x"}' where player = 'device:d1'`)
    expect(await starterOf('device:d1')).toBe(4)
    // A new game on another starter.
    await ping('d1', { areaId: PALLET, dex: [7], starter: 7 })
    await db.query(`update players set snapshot = '{"starter": 7}' where player = 'device:d1'`)
    expect(await starterOf('device:d1')).toBe(7)
  })

  it("takes nothing that isn't a dex number", async () => {
    await db.exec(sql(FILE))
    for (const [i, bad] of [['1'], 'x', 0, 2001, 4.5, -1, null].entries()) {
      await ping(`b${i}`, { areaId: PALLET, dex: [], starter: bad })
      expect(await starterOf(`device:b${i}`)).toBeNull()
    }
  })

  it("follows a guest's snapshot into their account when they sign in", async () => {
    await db.exec(sql(FILE))
    await ping('d2', { areaId: PALLET, dex: [1], starter: 1 })
    await as(U.ash, `select player_ping('d2', $1::date, null, null)`, [today])
    expect(await starterOf('device:d2')).toBeUndefined()
    expect(await starterOf(U.ash)).toBe(1)
  })
})

describe('the one-time backfill', () => {
  it("takes a signed-in player's from their main save, live or parked", async () => {
    await seed(U.ash, { first: -9, user: U.ash })
    await seed(U.misty, { first: -9, user: U.misty })
    await seed(U.brock, { first: -9, user: U.brock })
    await seed(U.gary, { first: -9, user: U.gary })
    await db.query(
      `insert into saves (user_id, realm, data) values
        ($1, 'main', '{"region": "kanto", "pokedex": [7, 16, 19]}'),
        ($2, 'main', '{"region": "johto", "pokedex": [155], "parked": {"kanto": {"pokedex": [1, 10]}}}'),
        ($3, 'main', '{"pokedex": [4]}'),
        ($3, 'extreme', '{"pokedex": [7]}'),
        ($4, 'extreme', '{"pokedex": [7]}')`,
      [U.ash, U.misty, U.brock, U.gary],
    )
    await db.exec(sql(FILE))
    expect(await starterOf(U.ash)).toBe(7)
    expect(await starterOf(U.misty)).toBe(1)
    expect(await starterOf(U.brock)).toBe(4)
    // An Extreme run isn't the game's start.
    expect(await starterOf(U.gary)).toBeNull()
  })

  it("takes a guest's from a Kanto snapshot holding one Kanto starter only", async () => {
    await seed('device:g1', { first: -9, snapshot: { areaId: PALLET, dex: [4, 16, 19] } })
    await seed('device:g2', { first: -9, snapshot: { areaId: PALLET, dex: [1, 4, 16] } })
    await seed('device:g3', { first: -9, snapshot: { areaId: NEW_BARK, dex: [155, 7] } })
    await seed('device:g4', { first: -9, snapshot: { areaId: PALLET, dex: [16] } })
    await seed('device:g5', { first: -9 })
    await db.exec(sql(FILE))
    expect(await starterOf('device:g1')).toBe(4)
    expect(await starterOf('device:g2')).toBeNull()
    expect(await starterOf('device:g3')).toBeNull()
    expect(await starterOf('device:g4')).toBeNull()
    expect(await starterOf('device:g5')).toBeNull()
  })

  it('keeps a starter already known when run again', async () => {
    await seed(U.ash, { first: -9, user: U.ash, snapshot: { starter: 1 } })
    await db.query(`insert into saves (user_id, data) values ($1, '{"pokedex": [7]}')`, [U.ash])
    await db.exec(sql(FILE))
    await db.exec(sql(FILE))
    expect(await starterOf(U.ash)).toBe(1)
  })
})

describe('analytics_churn', () => {
  interface Raw {
    areas: Record<string, unknown[]>
    unknown: number[]
    starters: Record<string, unknown[]>
    noStarter: number[]
  }
  const churn = async (days: number, since: string | null = null) =>
    (await as<{ r: Raw }>(U.admin, `select analytics_churn($1, $2::date) r`, [days, since]))[0]!.r

  beforeEach(async () => {
    await db.exec(sql(FILE))
    await seed('device:a', { first: -20, last: -6, days: 2, area: 'route-1', snapshot: { starter: 4 } }) // churned
    await seed('device:b', { first: -20, last: -3, days: 4, area: 'route-1', snapshot: { starter: 4 } }) // churned
    await seed('device:c', { first: -5, last: 0, days: 2, area: 'route-1', snapshot: { starter: 4 } }) // active
    await seed('device:d', { first: -4, days: 1, snapshot: { areaId: 'route-2', starter: 1 } }) // churned
    await seed('device:e', { first: -9, days: 1 }) // churned, nothing known
    await seed('device:f', { first: -1, days: 1 }) // active, nothing known
  })

  it('counts per starter the churned and the active, next to the areas', async () => {
    const c = await churn(3)
    expect(c.starters).toEqual({ '4': [2, 1, 3, 2], '1': [1, 0, 1, null] })
    expect(c.noStarter).toEqual([1, 1])
    expect(c.areas).toEqual({ 'route-1': [2, 1, 3, 2], 'route-2': [1, 0, 1, null] })
    expect(c.unknown).toEqual([1, 1])
  })

  it('keeps to the players whose first day is on or after `since`', async () => {
    const c = await churn(3, day(-5))
    expect(c.starters).toEqual({ '4': [0, 1, null, 2], '1': [1, 0, 1, null] })
    expect(c.noStarter).toEqual([0, 1])
  })

  it('is empty with no players, and the admin’s only', async () => {
    await db.exec(`delete from players`)
    const c = await churn(3)
    expect(c.starters).toEqual({})
    expect(c.noStarter).toEqual([0, 0])
    await expect(as(U.ash, `select analytics_churn(3)`)).rejects.toThrow('admin only')
  })
})
