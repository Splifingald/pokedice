// Migrations 0035 and 0036 against a real Postgres (PGlite, in process): the clock anyone can read, the Fortune Wheel's
// one spin per UTC day with the prize drawn by the server, and Victory Road II / League II leaving the database.
// Supabase's own pieces (the auth schema, the anon / authenticated roles) are stood in for at the top, as in
// friends-sql.test.ts.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '@/engine'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')

const U = {
  ash: '00000000-0000-4000-8000-000000000001',
  misty: '00000000-0000-4000-8000-000000000002',
}

interface Spin {
  day: string
  prize: number
  reward: unknown
  fresh: boolean
}

let db: PGlite

async function as<T = Record<string, unknown>>(user: string | null, q: string, params: unknown[] = []): Promise<T[]> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? ''])
  return (await db.query<T>(q, params)).rows
}

const spin = async (user: string | null) => (await as<{ s: Spin }>(user, 'select wheel_spin() as s'))[0]!.s
const setEvents = (value: unknown) =>
  db.query(`insert into game_config (key, value) values ('events', $1) on conflict (key) do update set value = excluded.value`, [
    JSON.stringify(value),
  ])

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
  `)
  await db.exec(sql('0001_init.sql').replace('create extension if not exists pgcrypto;', ''))
  await db.exec(sql('0035_events.sql'))
  // Run twice: the migration must stay safe to run again.
  await db.exec(sql('0035_events.sql'))
  await db.exec(`insert into auth.users (id) values ${Object.values(U).map((u) => `('${u}')`).join(',')};`)
}, 60_000)

describe('0035: event_time', () => {
  it("gives the server's UTC time and day, signed in or not", async () => {
    const [{ t }] = (await as<{ t: { now: string; day: string } }>(null, 'select event_time() as t')) as [{ t: { now: string; day: string } }]
    expect(t.now).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/)
    expect(t.day).toBe(t.now.slice(0, 10))
  })
})

describe('0035: wheel_spin', () => {
  it("has the game's default prizes when the admin hasn't saved any", async () => {
    const [{ p }] = (await db.query<{ p: unknown }>('select wheel_prizes() as p')).rows as [{ p: unknown }]
    expect(p).toEqual(DEFAULT_CONFIG.events.wheel.prizes)
  })

  it('needs a signed-in player', async () => {
    await expect(spin(null)).rejects.toThrow(/events_signed_out/)
  })

  it('spins once a UTC day; a second call gives the same prize back, not fresh', async () => {
    const first = await spin(U.ash)
    expect(first.fresh).toBe(true)
    expect(first.day).toMatch(/^\d{4}-\d\d-\d\d$/)
    expect(first.reward).toEqual(DEFAULT_CONFIG.events.wheel.prizes[first.prize]!.reward)
    const again = await spin(U.ash)
    expect(again).toEqual({ ...first, fresh: false })
  })

  it("turns over at midnight UTC: yesterday's spin doesn't count today", async () => {
    await db.query(`update event_state set wheel_day = wheel_day - 1 where user_id = $1`, [U.ash])
    expect((await spin(U.ash)).fresh).toBe(true)
  })

  it("draws from the admin's prizes, never one without a chance", async () => {
    await setEvents({
      wheel: {
        prizes: [
          { reward: { kind: 'gold', amount: 10 }, count: 4, odds: 0 },
          { reward: { kind: 'item', key: 'master-ball', qty: 1 }, count: 1, odds: 5 },
          { reward: { kind: 'item', key: 'poke-ball', qty: 1 }, count: 0, odds: 50 },
        ],
      },
    })
    for (let i = 0; i < 12; i++) {
      await db.query('delete from event_state where user_id = $1', [U.misty])
      const s = await spin(U.misty)
      expect(s.prize).toBe(1)
      expect(s.reward).toEqual({ kind: 'item', key: 'master-ball', qty: 1 })
    }
  })

  it('refuses when the admin switched the wheel off, or left nothing to win', async () => {
    await db.query('delete from event_state where user_id = $1', [U.misty])
    await setEvents({ wheel: { enabled: false } })
    await expect(spin(U.misty)).rejects.toThrow(/events_wheel_off/)
    await setEvents({ wheel: { prizes: [{ reward: { kind: 'gold', amount: 10 }, count: 1, odds: 0 }] } })
    await expect(spin(U.misty)).rejects.toThrow(/events_wheel_empty/)
    await db.exec(`delete from game_config where key = 'events'`)
  })
})

describe('0036: Victory Road II and League II leave', () => {
  const ROAD2 = '35c40458-61da-5321-adda-6df33b930671'
  const LEAGUE = 'bbe7e459-a138-5106-bd01-fce7ff422e7f'
  const area = (id: string, order: number, name: string) =>
    db.query(
      `insert into areas (id, order_index, name, min_level, max_level, encounter_weights) values ($1, $2, $3, 1, 2, '{}')`,
      [id, order, name],
    )
  const trainer = (id: string, name: string) => db.query(`insert into trainers (id, name, team) values ($1, $2, '[]')`, [id, name])

  it('deletes those areas with their pools, and the trainers only they used; the rest stays', async () => {
    const del = sql('0036_remove_league_ii.sql')
    const gone = del.slice(del.indexOf('delete from trainers')).match(/'([0-9a-f-]{36})'/)![1]!
    await area(ROAD2, 9023, 'Victory Road II')
    await area(LEAGUE, 9022, 'Indigo Plateau')
    await trainer(gone, 'Cooltrainer')
    await trainer('11111111-1111-4111-8111-111111111111', 'Elite Four Lorelei')
    await db.query(`insert into area_trainer_pool (area_id, trainer_id) values ($1, $2)`, [ROAD2, gone])
    await db.exec(del)
    const ids = async (table: string) => (await db.query<{ id: string }>(`select id from ${table}`)).rows.map((r) => r.id)
    expect(await ids('areas')).toEqual([LEAGUE])
    expect(await ids('trainers')).toEqual(['11111111-1111-4111-8111-111111111111'])
    expect(await ids('area_trainer_pool')).toEqual([])
    // Safe to run again.
    await db.exec(del)
    expect(await ids('areas')).toEqual([LEAGUE])
  })
})
