// The Gift card (docs/61 §4.0) on the server: migration 0121 against a real Postgres (PGlite, in process). It writes the
// config row (Off, the game's own numbers), keeps an admin's row when run again, and gift_card_open() reads the switch
// for the caller as trick_or_treat_open() does: off, on for the admin only (their JWT), on for everyone. seed.sql
// carries it too.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, type GiftCardConfig } from '@/engine'

const ROOT = path.join(__dirname, '..', 'supabase')
const sql = (file: string) => readFileSync(path.join(ROOT, 'migrations', file), 'utf8')
const FILE = '0121_gift_card.sql'
const ADMIN_EMAIL = 'gregoire.ftn@gmail.com'
let db: PGlite

const cfg = async (key: string) =>
  (await db.query<{ v: unknown }>(`select value v from game_config where key = $1`, [key])).rows[0]?.v
const open = async () => (await db.query<{ ok: boolean }>('select gift_card_open() ok')).rows[0]!.ok
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
  await db.exec(`insert into game_config (key, value) values ('configVersion', '120')`)
  await db.exec(sql(FILE))
}, 60_000)

describe('0121: the Gift card', () => {
  it('writes the config row, Off, with the game’s own numbers', async () => {
    const row = (await cfg('giftCard')) as GiftCardConfig
    expect(row).toEqual(JSON.parse(JSON.stringify(DEFAULT_CONFIG.giftCard)))
    expect(row.access).toBe('off')
    expect(await cfg('configVersion')).toBe(121)
  })

  it('the server reads the switch for the caller: off, on for the admin only, on for everyone', async () => {
    const set = (access: string) =>
      db.exec(`update game_config set value = jsonb_set(value, '{access}', '"${access}"') where key = 'giftCard'`)
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
    await db.exec(`update game_config set value = '"all"'::jsonb where key = 'giftCard'`)
    expect(await open()).toBe(false)
  })

  it('runs again keeping the admin’s switch and numbers', async () => {
    const mine = { ...DEFAULT_CONFIG.giftCard, access: 'admin', breakChances: [10, 30, 50, 70], bossTaps: 3 }
    await db.exec(`update game_config set value = '${JSON.stringify(mine)}'::jsonb where key = 'giftCard'`)
    await db.exec(sql(FILE))
    const row = (await cfg('giftCard')) as GiftCardConfig
    expect([row.access, row.breakChances, row.bossTaps]).toEqual(['admin', [10, 30, 50, 70], 3])
    expect(await cfg('configVersion')).toBe(122)
  })

  it('is carried by seed.sql', () => {
    const seed = readFileSync(path.join(ROOT, 'seed.sql'), 'utf8')
    expect(seed).toContain(`-- ↓ supabase/migrations/${FILE}, inlined so this file stands alone.`)
    expect(seed).toContain('create or replace function gift_card_open()')
  })
})
