// Migration 0144 against a real Postgres (PGlite, in process): players online (docs/70). Its row lands Off; Off, a
// ping writes nothing and answers nothing; On for admin, every game is counted but only the admin gets the number; On
// for everyone, each player (the account, else the device) counts once, for 6 minutes. Supabase's own pieces (the
// auth schema, the roles) and 0131's access_open are stood in for at the top.
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
let landed: unknown

async function ping(user: string | null, device: string | null = 'dev-1'): Promise<number | null> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? ''])
  await db.query(`select set_config('request.jwt.claim.email', $1, false)`, [
    user === ADMIN ? 'gregoire.ftn@gmail.com' : '',
  ])
  return (await db.query<{ n: number | null }>(`select online_ping($1) as n`, [device])).rows[0]!.n
}
const setAccess = (access: string) =>
  db.query(`update game_config set value = jsonb_build_object('access', $1::text) where key = 'playersOnline'`, [access])
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
  // 0131's switch reader, without the beta testers' list.
  await db.exec(`
    create function access_open(p_access text) returns boolean language sql stable as $$
      select coalesce(p_access, 'off') = 'all' or (p_access in ('admin', 'beta') and is_admin()) $$;
  `)
  await db.exec(sql('0144_players_online.sql'))
  // Safe to run again.
  await db.exec(sql('0144_players_online.sql'))
  landed = (await db.query<{ value: unknown }>(`select value from game_config where key = 'playersOnline'`)).rows[0]!.value
})

afterAll(async () => {
  await db.close()
})

beforeEach(async () => {
  await db.exec(`delete from online_here`)
  await setAccess('all')
})

describe('players online', () => {
  it('lands Off', () => {
    expect(landed).toEqual({ access: 'off' })
  })

  it('Off: writes nothing and answers nothing', async () => {
    await setAccess('off')
    expect(await ping(ASH)).toBeNull()
    expect(await ping(ADMIN)).toBeNull()
    expect(await rows()).toBe(0)
  })

  it('On for admin: every game counted, only the admin told', async () => {
    await setAccess('admin')
    expect(await ping(ASH)).toBeNull()
    expect(await ping(null, 'guest-1')).toBeNull()
    expect(await ping(ADMIN)).toBe(3)
  })

  it('On for everyone: each account or device once, for 6 minutes', async () => {
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
