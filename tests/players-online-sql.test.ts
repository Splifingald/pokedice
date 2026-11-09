// Migration 0144 against a real Postgres (PGlite, in process): players online (docs/70). No switch (the first
// version's row and function go); each player (the account, else the device) counts once, for 6 minutes; a hand-made
// device id counts as nobody. Supabase's own pieces (the auth schema, the roles) are stood in for at the top.
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
