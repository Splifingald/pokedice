// Crown Shrine's whiteout (docs/64 §4.3): migration 0125 against a real Postgres (PGlite, in process). Over Snowglobe
// Valley as an older 0122 (no mode) left it, Crown Shrine gets its whiteout, the switch goes in Off and the content
// version goes up; run again, nothing changes but the version, an admin's own mode and switch stay. whiteout_open()
// reads the switch as nightmare_open() does. seed.sql carries the same file, inlined.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { BUNDLE } from '@/config/bundle'
import { DEFAULT_CONFIG, DEFAULT_WHITEOUT } from '@/engine'
import { snowglobe } from '../scripts/content-snowglobe-valley'

const ROOT = path.join(__dirname, '..', 'supabase')
const sql = (file: string) => readFileSync(path.join(ROOT, 'migrations', file), 'utf8')
const FILE = '0125_whiteout.sql'
const CS = snowglobe().areas.find((a) => a.name === 'Crown Shrine')!

describe('0125: the whiteout', () => {
  let db: PGlite
  const value = async (key: string) =>
    (await db.query<{ v: unknown }>('select value v from game_config where key = $1', [key])).rows[0]?.v
  const mode = async () =>
    (await db.query<{ m: unknown }>('select mode m from areas where id = $1', [CS.id])).rows[0]?.m
  const open = async () => (await db.query<{ o: boolean }>('select whiteout_open() o')).rows[0]!.o
  /** Signed in as the admin or not: is_admin() (0001) reads the JWT's email. */
  const as = async (admin: boolean) =>
    db.exec(
      `create or replace function auth.jwt() returns jsonb language sql stable as $$ select '${
        admin ? '{"email": "gregoire.ftn@gmail.com"}' : '{}'
      }'::jsonb $$;`,
    )

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;`)
    await db.exec(sql('0001_init.sql').replace('create extension if not exists pgcrypto;', ''))
    await db.exec(sql('0016_regions.sql'))
    await db.exec('alter table areas add column if not exists rounds_to_clear int;')
    const dexes = [...new Set(BUNDLE.pokemon.map((p) => p.dex))]
    await db.exec(
      `insert into pokemon (dex, name, type1, base_hp, max_hp, speed, sprite_url, dice, rerolls, catch_value, evolutions, milestones) values ` +
        dexes.map((d) => `(${d}, 'p${d}', 'ice', 10, 100, 5, '', '[]', 1, 3, '[]', '[]')`).join(', '),
    )
    await db.exec(`insert into game_config (key, value) values ('configVersion', '122')`)
    await db.exec(sql('0122_snowglobe_valley.sql'))
    // As an 0122 generated before Crown Shrine had its mode.
    await db.query('update areas set mode = null where id = $1', [CS.id])
    await db.exec(sql(FILE))
  }, 60_000)

  it('gives Crown Shrine its whiteout, as the game has it, and the switch Off, as the game defaults it', async () => {
    expect(await mode()).toEqual(DEFAULT_WHITEOUT)
    expect(CS.mode).toEqual(DEFAULT_WHITEOUT)
    expect(await value('whiteout')).toEqual({ access: 'off' })
    expect(DEFAULT_CONFIG.whiteout).toEqual({ access: 'off' })
    expect(await value('configVersion')).toBe(124)
  })

  it('reads the switch: off for everyone, on for the admin alone, then for everyone', async () => {
    await as(true)
    expect(await open()).toBe(false)
    await db.exec(`update game_config set value = '{"access": "admin"}' where key = 'whiteout'`)
    expect(await open()).toBe(true)
    await as(false)
    expect(await open()).toBe(false)
    await db.exec(`update game_config set value = '{"access": "all"}' where key = 'whiteout'`)
    expect(await open()).toBe(true)
    await db.exec(`update game_config set value = '"odd"' where key = 'whiteout'`)
    expect(await open()).toBe(false)
  })

  it("runs again changing nothing but the content version; the admin's mode and switch stay", async () => {
    await db.exec(`update game_config set value = '{"access": "all"}' where key = 'whiteout'`)
    await db.query(`update areas set mode = jsonb_set(mode, '{bonfirePercent}', '30') where id = $1`, [CS.id])
    const before = Number(await value('configVersion'))
    await db.exec(sql(FILE))
    expect(await value('whiteout')).toEqual({ access: 'all' })
    expect(((await mode()) as { bonfirePercent: number }).bonfirePercent).toBe(30)
    expect(await value('configVersion')).toBe(before + 1)
  })

  it('is inlined in seed.sql', () => {
    const seed = readFileSync(path.join(ROOT, 'seed.sql'), 'utf8')
    const body = sql(FILE).replace(/^(begin|commit);\n/gm, '')
    expect(seed).toContain(`-- ↓ supabase/migrations/${FILE}, inlined so this file stands alone.\n${body}`)
  })
})
