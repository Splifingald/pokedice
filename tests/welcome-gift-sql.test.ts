// A small world's starting gift (docs/64 §4.7) on the server: migration 0152 against a real Postgres (PGlite, in
// process). It writes the switch (Off), keeps an admin's when run again, and welcome_gift_open() reads it for the caller
// as gift_card_open() does: off, on for the admin only (their JWT), on for everyone. seed.sql carries it too.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'

const ROOT = path.join(__dirname, '..', 'supabase')
const sql = (file: string) => readFileSync(path.join(ROOT, 'migrations', file), 'utf8')
const FILE = '0152_welcome_gift.sql'
const ADMIN_EMAIL = 'gregoire.ftn@gmail.com'
let db: PGlite

const cfg = async (key: string) =>
  (await db.query<{ v: unknown }>(`select value v from game_config where key = $1`, [key])).rows[0]?.v
const open = async () => (await db.query<{ ok: boolean }>('select welcome_gift_open() ok')).rows[0]!.ok
const asJwt = (email: string) =>
  db.exec(
    `create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{"email": "${email}"}'::jsonb $$;`,
  )

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;`)
  await db.exec(sql('0001_init.sql').replace('create extension if not exists pgcrypto;', ''))
  await db.exec(`insert into game_config (key, value) values ('configVersion', '120'),
    ('smallWorlds', '{"access": "all", "list": [{"id": "other-2026", "regionId": "world-other"}, {"id": "snowglobe-valley-2026", "regionId": "world-snowglobe-valley", "starters": [10101]}]}')`)
  await db.exec(sql(FILE))
}, 60_000)

describe('0152: the starting gift', () => {
  it('writes the switch, Off, and Snowglobe Valley’s gift in its world entry (the others as they were)', async () => {
    expect(await cfg('welcomeGift')).toEqual({ access: 'off' })
    const worlds = (await cfg('smallWorlds')) as { list: Record<string, unknown>[] }
    expect(worlds.list).toEqual([
      { id: 'other-2026', regionId: 'world-other' },
      {
        id: 'snowglobe-valley-2026',
        regionId: 'world-snowglobe-valley',
        starters: [10101],
        welcomeGift: { gold: 10, items: { potion: 2, 'poke-ball': 5, 'ice-heal': 2 } },
      },
    ])
    expect(await cfg('configVersion')).toBe(121)
  })

  it('the server reads the switch for the caller: off, on for the admin only, on for everyone', async () => {
    const set = (access: string) =>
      db.exec(
        `update game_config set value = jsonb_set(value, '{access}', '"${access}"') where key = 'welcomeGift'`,
      )
    expect(await open()).toBe(false)
    await set('admin')
    expect(await open()).toBe(false)
    await asJwt(ADMIN_EMAIL)
    expect(await open()).toBe(true)
    await asJwt('someone@example.com')
    expect(await open()).toBe(false)
    await set('all')
    expect(await open()).toBe(true)
    await set('nonsense')
    expect(await open()).toBe(false)
    // A row that isn't an object: off, never an error.
    await db.exec(`update game_config set value = '"all"'::jsonb where key = 'welcomeGift'`)
    expect(await open()).toBe(false)
  })

  it('runs again keeping the admin’s switch', async () => {
    await db.exec(`update game_config set value = '{"access":"admin"}'::jsonb where key = 'welcomeGift'`)
    await db.exec(sql(FILE))
    expect(await cfg('welcomeGift')).toEqual({ access: 'admin' })
    expect(await cfg('configVersion')).toBe(122)
  })

  it('is carried by seed.sql', () => {
    const seed = readFileSync(path.join(ROOT, 'seed.sql'), 'utf8')
    expect(seed).toContain(`-- ↓ supabase/migrations/${FILE}, inlined so this file stands alone.`)
    expect(seed).toContain('create or replace function welcome_gift_open()')
  })
})
