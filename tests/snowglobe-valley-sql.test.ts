// Snowglobe Valley's migration against a real Postgres (PGlite, in process): 0122 lands the content (docs/64) as its
// script builds it, the world joins `smallWorlds` beside Haunted Hollow with the admin's switch kept, and running it
// again changes nothing but the content version.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { BUNDLE } from '@/config/bundle'
import { REGION_ID, WORLD_ID, snowglobe, snowglobeSql } from '../scripts/content-snowglobe-valley'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')
const FILE = '0122_snowglobe_valley.sql'
const h = snowglobe()
let db: PGlite

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
  await db.exec(`insert into game_config (key, value) values
    ('smallWorlds', '{"access": "everyone", "list": [{"id": "haunted-hollow-2026", "regionId": "world-haunted-hollow"}]}'),
    ('configVersion', '120')`)
})

const count = async (q: string) => Number((await db.query<{ n: number }>(q)).rows[0]!.n)
const cfg = async (key: string) =>
  (await db.query<{ v: unknown }>(`select value v from game_config where key = $1`, [key])).rows[0]!.v

describe('0122: Snowglobe Valley', () => {
  it('is what the content script writes today', () => {
    expect(sql(FILE)).toBe(snowglobeSql())
  })

  it('writes its region, areas, pools and trainers', async () => {
    await db.exec(sql(FILE))
    expect(
      await count(`select count(*)::int n from regions where id = '${REGION_ID}' and enabled = false`),
    ).toBe(1)
    expect(await count(`select count(*)::int n from areas where region_id = '${REGION_ID}'`)).toBe(
      h.areas.length,
    )
    expect(await count(`select count(*)::int n from trainers`)).toBe(h.trainers.length)
    expect(await count('select count(*)::int n from area_wild_pool')).toBe(
      h.areas.reduce((n, a) => n + a.wildPool.length, 0),
    )
    const decks = await db.query<{ id: string; w: unknown; u: unknown; b: unknown }>(
      `select id, encounter_weights w, unlock_conditions u, legendary_boss b from areas where region_id = '${REGION_ID}' order by id`,
    )
    expect(decks.rows).toEqual(
      [...h.areas]
        .sort((x, y) => (x.id < y.id ? -1 : 1))
        .map((a) => ({ id: a.id, w: a.encounterWeights, u: a.unlockConditions, b: a.legendaryBoss })),
    )
  })

  it('adds the world after Haunted Hollow, keeps the switch, and bumps the content version', async () => {
    const worlds = (await cfg('smallWorlds')) as { access: string; list: { id: string }[] }
    expect(worlds.access).toBe('everyone')
    expect(worlds.list.map((w) => w.id)).toEqual(['haunted-hollow-2026', WORLD_ID])
    expect(worlds.list[1]).toEqual(JSON.parse(JSON.stringify(h.world)))
    expect(await cfg('configVersion')).toBe(121)
  })

  it('runs again without duplicating anything', async () => {
    await db.exec(sql(FILE))
    const worlds = (await cfg('smallWorlds')) as { list: { id: string }[] }
    expect(worlds.list.map((w) => w.id)).toEqual(['haunted-hollow-2026', WORLD_ID])
    expect(await count('select count(*)::int n from areas')).toBe(h.areas.length)
    expect(await count('select count(*)::int n from area_wild_pool')).toBe(
      h.areas.reduce((n, a) => n + a.wildPool.length, 0),
    )
    expect(await cfg('configVersion')).toBe(122)
  })
})
