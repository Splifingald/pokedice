// Migration 0052 against a real Postgres (PGlite, in process): Haunted Hollow's content (docs/26) lands as its bundle
// says, the world joins `smallWorlds` with the admin's switch and other worlds kept, and running it again changes
// nothing but the content version.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { BUNDLE } from '@/config/bundle'
import { haunted, hauntedSql, WORLD_ID } from '../scripts/content-haunted-hollow'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')
const h = haunted()
let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;`)
  await db.exec(sql('0001_init.sql').replace('create extension if not exists pgcrypto;', ''))
  await db.exec(sql('0016_regions.sql'))
  await db.exec('alter table areas add column if not exists rounds_to_clear int;')
  // The species its pools name.
  const dexes = [...new Set(BUNDLE.pokemon.map((p) => p.dex))]
  await db.exec(
    `insert into pokemon (dex, name, type1, base_hp, max_hp, speed, sprite_url, dice, rerolls, catch_value, evolutions, milestones) values ` +
      dexes.map((d) => `(${d}, 'p${d}', 'ghost', 10, 100, 5, '', '[]', 1, 3, '[]', '[]')`).join(', '),
  )
  await db.exec(`insert into game_config (key, value) values
    ('smallWorlds', '{"access": "admin", "list": [{"id": "older-world", "regionId": "world-old"}]}'),
    ('configVersion', '98')`)
})

describe('0052: Haunted Hollow', () => {
  it('is what the script generates', () => {
    expect(sql('0052_haunted_hollow.sql')).toBe(hauntedSql())
  })

  it('writes its region, areas, pools and trainers', async () => {
    await db.exec(sql('0052_haunted_hollow.sql'))
    const count = async (q: string) => Number((await db.query<{ n: number }>(q)).rows[0]!.n)
    expect(
      await count(
        `select count(*)::int n from regions where id = 'world-haunted-hollow' and enabled = false`,
      ),
    ).toBe(1)
    expect(await count(`select count(*)::int n from areas where region_id = 'world-haunted-hollow'`)).toBe(
      h.areas.length,
    )
    expect(
      await count(
        `select count(*)::int n from trainers where id in (${h.trainers.map((t) => `'${t.id}'`).join(',')})`,
      ),
    ).toBe(h.trainers.length)
    expect(await count('select count(*)::int n from area_wild_pool')).toBe(
      h.areas.reduce((n, a) => n + a.wildPool.length, 0),
    )
    const elite = (
      await db.query<{ r: number }>(`select rounds_to_clear r from areas where name = 'Shadow Elite'`)
    ).rows[0]!
    expect(elite.r).toBe(0)
  })

  it('adds the world, keeps the switch and the other worlds, and bumps the content version', async () => {
    const cfg = async (key: string) =>
      (await db.query<{ v: unknown }>(`select value v from game_config where key = $1`, [key])).rows[0]!.v
    const worlds = (await cfg('smallWorlds')) as { access: string; list: { id: string }[] }
    expect(worlds.access).toBe('admin')
    expect(worlds.list.map((w) => w.id)).toEqual(['older-world', WORLD_ID])
    expect(worlds.list[1]).toEqual(JSON.parse(JSON.stringify(h.world)))
    expect(await cfg('configVersion')).toBe(99)
  })

  it('runs again without duplicating anything', async () => {
    await db.exec(sql('0052_haunted_hollow.sql'))
    const worlds = (
      await db.query<{ v: { list: { id: string }[] } }>(
        `select value v from game_config where key = 'smallWorlds'`,
      )
    ).rows[0]!.v
    expect(worlds.list.map((w) => w.id)).toEqual(['older-world', WORLD_ID])
    expect(Number((await db.query<{ n: number }>('select count(*)::int n from areas')).rows[0]!.n)).toBe(
      h.areas.length,
    )
  })
})
