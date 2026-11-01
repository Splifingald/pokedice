// Tracks in the Snow (docs/61 §4.1): migration 0122 against a real Postgres (PGlite, in process). The switch goes in
// Off and the content version goes up; tracks_open() reads it for the caller (everyone, the admin only, an odd value
// off); run again, an admin's switch is kept. Moonlit Glade's mode comes with 0120's content, and seed.sql carries
// 0122, inlined.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, DEFAULT_TRACKS } from '@/engine'
import { snowglobe } from '../scripts/content-snowglobe-valley'

const ROOT = path.join(__dirname, '..', 'supabase')
const sql = (file: string) => readFileSync(path.join(ROOT, 'migrations', file), 'utf8')
const FILE = '0122_tracks_in_the_snow.sql'
const ADMIN_EMAIL = 'gregoire.ftn@gmail.com'

describe('0122: Tracks in the Snow', () => {
  let db: PGlite
  const value = async (key: string) =>
    (await db.query<{ v: unknown }>('select value v from game_config where key = $1', [key])).rows[0]?.v
  const open = async () => (await db.query<{ ok: boolean }>('select tracks_open() ok')).rows[0]!.ok
  const asJwt = (email: string) =>
    db.exec(
      `create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{"email": "${email}"}'::jsonb $$;`,
    )
  const setSwitch = (v: string) =>
    db.query(`update game_config set value = $1::jsonb where key = 'tracks'`, [v])

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;`)
    await db.exec(sql('0001_init.sql').replace('create extension if not exists pgcrypto;', ''))
    await db.exec(`insert into game_config (key, value) values ('configVersion', '120')`)
    await db.exec(sql(FILE))
  }, 60_000)

  it('puts the switch in Off, as the game defaults it, and bumps the content version', async () => {
    expect(await value('tracks')).toEqual({ access: 'off' })
    expect(DEFAULT_CONFIG.tracks).toEqual({ access: 'off' })
    expect(await value('configVersion')).toBe(121)
  })

  it('tracks_open(): off for everyone while Off; On for everyone opens it; On for admin only for the admin', async () => {
    expect(await open()).toBe(false)
    await setSwitch('{"access": "all"}')
    expect(await open()).toBe(true)
    await setSwitch('{"access": "admin"}')
    expect(await open()).toBe(false)
    await asJwt(ADMIN_EMAIL)
    expect(await open()).toBe(true)
    await asJwt('someone@example.com')
    expect(await open()).toBe(false)
    // An odd value is off, never an error.
    await setSwitch('"on"')
    expect(await open()).toBe(false)
    await db.exec(`delete from game_config where key = 'tracks'`)
    expect(await open()).toBe(false)
  })

  it('players may ask it (anon and signed in), nothing else', async () => {
    const grants = await db.query<{ grantee: string }>(
      `select grantee from information_schema.routine_privileges where routine_name = 'tracks_open' order by grantee`,
    )
    const who = grants.rows.map((r) => r.grantee)
    expect(who).toContain('anon')
    expect(who).toContain('authenticated')
    expect(who).not.toContain('PUBLIC')
  })

  it("runs again keeping the admin's switch, the content version up once more", async () => {
    await db.exec(
      `insert into game_config (key, value) values ('tracks', '{"access": "all"}') on conflict (key) do update set value = excluded.value`,
    )
    const before = (await value('configVersion')) as number
    await db.exec(sql(FILE))
    expect(await value('tracks')).toEqual({ access: 'all' })
    expect(await value('configVersion')).toBe(before + 1)
  })

  it('Moonlit Glade carries its mode in 0120’s content', () => {
    const glade = snowglobe().areas.find((a) => a.name === 'Moonlit Glade')!
    expect(glade.mode).toEqual(DEFAULT_TRACKS)
    const row = sql('0120_snowglobe_valley.sql')
      .split('\n')
      .find((l) => l.includes(`'${glade.id}'`) && l.includes("'Moonlit Glade'"))!
    expect(row).toContain(`'${JSON.stringify(DEFAULT_TRACKS)}'::jsonb`)
  })

  it('is inlined in seed.sql', () => {
    const seed = readFileSync(path.join(ROOT, 'seed.sql'), 'utf8')
    const body = sql(FILE).replace(/^(begin|commit);\n/gm, '')
    expect(seed).toContain(`-- ↓ supabase/migrations/${FILE}, inlined so this file stands alone.\n${body}`)
  })
})
