// Migrations 0144 and 0146 against a real Postgres (PGlite, in process): players online (docs/70). No switch (the first
// version's row and function go); each player (the account, else the device) counts once, for 6 minutes; a hand-made
// device id counts as nobody. The list: each one's card (name, look, badges) as sent, up to 30, the closest in badges
// to the caller, most badges first, the caller marked, no ids. Supabase's own pieces (the auth schema, the roles) are
// stood in for at the top.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')

const ASH = '00000000-0000-4000-8000-000000000001'
const MISTY = '00000000-0000-4000-8000-000000000002'
const ADMIN = '00000000-0000-4000-8000-000000000009'

let db: PGlite

async function ping(user: string | null, device: string | null = 'dev-1'): Promise<number | null> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? ''])
  await db.query(`select set_config('request.jwt.claim.email', $1, false)`, [
    user === ADMIN ? 'gregoire.ftn@gmail.com' : '',
  ])
  return (await db.query<{ n: number | null }>(`select online_ping($1) as n`, [device])).rows[0]!.n
}
async function as(user: string | null) {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? ''])
  await db.query(`select set_config('request.jwt.claim.email', $1, false)`, [''])
}
/** A ping from this build: the device id and the card. */
async function card(user: string | null, device: string, name: string | null, badges: number | null, look = 'red') {
  await as(user)
  return (await db.query<{ n: number }>(`select online_ping($1, $2, $3, $4) as n`, [device, name, look, badges])).rows[0]!.n
}
interface Row {
  name: string
  look: string | null
  badges: number
  me: boolean
}
async function list(user: string | null, device = 'dev-1'): Promise<Row[]> {
  await as(user)
  return (await db.query<{ r: Row[] }>(`select online_players($1) as r`, [device])).rows[0]!.r
}
const rows = async () => (await db.query<{ n: number }>(`select count(*)::int as n from online_here`)).rows[0]!.n

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
  // The first version's switch, which running this one removes.
  await db.exec(`
    insert into game_config (key, value) values ('playersOnline', '{"access": "off"}');
    create function players_online_access() returns text language sql as $$ select 'off' $$;
  `)
  await db.exec(sql('0144_players_online.sql'))
  // Safe to run again.
  await db.exec(sql('0144_players_online.sql'))
  await db.exec(sql('0146_players_online_list.sql'))
  await db.exec(sql('0146_players_online_list.sql'))
})

afterAll(async () => {
  await db.close()
})

beforeEach(async () => {
  await db.exec(`delete from online_here`)
})

describe('players online', () => {
  it('has no switch: the first version’s row and function are gone', async () => {
    expect((await db.query(`select 1 from game_config where key = 'playersOnline'`)).rows).toHaveLength(0)
    expect((await db.query(`select 1 from pg_proc where proname = 'players_online_access'`)).rows).toHaveLength(0)
  })

  it('each account or device once, for 6 minutes', async () => {
    expect(await ping(ASH, 'dev-a')).toBe(1)
    expect(await ping(ASH, 'dev-b')).toBe(1) // the same account on another device
    expect(await ping(null, 'guest-1')).toBe(2)
    expect(await ping(null, 'guest-1')).toBe(2)
    expect(await ping(MISTY)).toBe(3)
    await db.exec(`update online_here set at = now() - interval '7 minutes' where who = 'device:guest-1'`)
    expect(await ping(MISTY)).toBe(2)
  })

  it('a hand-made device id is counted as nobody', async () => {
    expect(await ping(null, 'x'.repeat(200))).toBe(0)
    expect(await ping(null, '  ')).toBe(0)
    expect(await rows()).toBe(0)
  })
})

describe('the list', () => {
  it('each card as sent, most badges first, the caller marked, no ids', async () => {
    await card(ASH, 'a', 'Ash', 8, 'kanto/youngster')
    await card(null, 'g1', '  ', 3)
    await card(MISTY, 'm', 'Misty the water queen', 5, 'not a look!')
    const r = await list(null, 'g1')
    expect(r).toEqual([
      { name: 'Ash', look: 'kanto/youngster', badges: 8, me: false },
      { name: 'Misty the wa', look: null, badges: 5, me: false },
      { name: 'Trainer', look: 'red', badges: 3, me: true },
    ])
    expect(JSON.stringify(r)).not.toContain(ASH)
  })

  it('an older build’s ping is counted but not listed; odd badges are no card', async () => {
    expect(await ping(ASH)).toBe(1)
    await card(null, 'g1', 'Gold', 1000)
    expect(await card(MISTY, 'm', 'Misty', 2)).toBe(3)
    expect((await list(MISTY)).map((p) => p.name)).toEqual(['Misty'])
  })

  it('more than 30: the closest in badges to the caller', async () => {
    for (let i = 0; i < 40; i++) await card(null, `g${i}`, `P${i}`, i)
    const r = await list(null, 'g20')
    expect(r).toHaveLength(30)
    const badges = r.map((p) => p.badges)
    expect(Math.max(...badges.map((b) => Math.abs(b - 20)))).toBeLessThanOrEqual(15)
    expect(badges).toEqual([...badges].sort((a, b) => b - a))
    expect(r.find((p) => p.me)?.badges).toBe(20)
  })

  it('a caller with no card yet is taken as 0 badges; only the last 6 minutes', async () => {
    for (let i = 0; i < 35; i++) await card(null, `g${i}`, `P${i}`, i)
    await db.exec(`update online_here set at = now() - interval '7 minutes' where who = 'device:g0'`)
    const r = await list(null, 'stranger')
    expect(r.map((p) => p.badges)).toEqual(Array.from({ length: 30 }, (_, i) => 30 - i))
  })
})
