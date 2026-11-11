// Migration 0148 against a real Postgres (PGlite, in process): the new address's hand-over (docs/72). The drop checks
// the switch for the caller (off: refused, for the admin: the admin only, for everyone: anyone, signed in or not) and
// the size; the take answers once, then the row is gone; a row an hour old is gone too. Players never read the table.
// The switch's check (access_open, 0131) and Supabase's own pieces are stood in for at the top.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')

const ADMIN = 'admin@example.com'
let db: PGlite

async function as(email: string | null) {
  await db.query(`select set_config('request.jwt.claim.email', $1, false)`, [email ?? ''])
}
const setAccess = (access: string) =>
  db.query(`update game_config set value = jsonb_build_object('access', $1::text) where key = 'siteMove'`, [
    access,
  ])
async function drop(payload: string): Promise<string> {
  return (await db.query<{ code: string }>(`select site_move_drop($1) as code`, [payload])).rows[0]!.code
}
async function take(code: string): Promise<string | null> {
  return (await db.query<{ p: string | null }>(`select site_move_take($1::uuid) as p`, [code])).rows[0]!.p
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$
      select jsonb_strip_nulls(jsonb_build_object('email', nullif(current_setting('request.jwt.claim.email', true), ''))) $$;
    create table game_config (key text primary key, value jsonb not null);
    create function is_admin() returns boolean language sql stable as $$
      select coalesce(auth.jwt() ->> 'email', '') = '${ADMIN}' $$;
    create function is_beta_tester() returns boolean language sql stable as $$ select false $$;
    create function access_open(p_access text) returns boolean language sql stable as $$
      select coalesce(p_access, 'off') = 'all' or (p_access = 'admin' and is_admin()) or (p_access = 'beta' and is_beta_tester()) $$;
  `)
  await db.exec(sql('0148_site_move.sql'))
})
afterAll(() => db.close())
beforeEach(async () => {
  await db.exec(`delete from site_moves`)
  await as(null)
})

describe('the switch', () => {
  it('ships off, and bumps the config version', async () => {
    const rows = (
      await db.query<{ key: string; value: unknown }>(`select key, value from game_config order by key`)
    ).rows
    expect(rows).toEqual([
      { key: 'configVersion', value: 1 },
      { key: 'siteMove', value: { access: 'off' } },
    ])
  })

  it('refuses every drop while off', async () => {
    await setAccess('off')
    await as(ADMIN)
    await expect(drop('g:abc')).rejects.toThrow('site_move_closed')
  })

  it('on for the admin: the admin only', async () => {
    await setAccess('admin')
    await expect(drop('g:abc')).rejects.toThrow('site_move_closed')
    await as('someone@example.com')
    await expect(drop('g:abc')).rejects.toThrow('site_move_closed')
    await as(ADMIN)
    expect(await drop('g:abc')).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('on for everyone: a player who never signed in too', async () => {
    await setAccess('all')
    expect(await drop('g:abc')).toMatch(/^[0-9a-f-]{36}$/)
  })
})

describe('the hand-over', () => {
  beforeEach(() => setAccess('all'))

  it('answers once, then the save is gone from the server', async () => {
    const code = await drop('g:the-save')
    expect(await take(code)).toBe('g:the-save')
    expect(await take(code)).toBeNull()
  })

  it('answers nothing for a code it never gave', async () => {
    await drop('g:the-save')
    expect(await take('00000000-0000-4000-8000-000000000000')).toBeNull()
  })

  it('lets a save untaken for an hour go', async () => {
    const code = await drop('g:old')
    await db.query(`update site_moves set created_at = now() - interval '61 minutes'`)
    expect(await take(code)).toBeNull()
    // The next drop clears it out.
    await drop('g:new')
    expect((await db.query(`select 1 from site_moves`)).rows).toHaveLength(1)
  })

  it('refuses an empty payload and a hand-made huge one', async () => {
    await expect(drop('')).rejects.toThrow('site_move_size')
    await expect(drop('x'.repeat(8_000_001))).rejects.toThrow('site_move_size')
  })

  it('keeps the table to the functions', async () => {
    const grants = await db.query(
      `select privilege_type from information_schema.role_table_grants where table_name = 'site_moves' and grantee in ('anon', 'authenticated')`,
    )
    expect(grants.rows).toEqual([])
  })
})
