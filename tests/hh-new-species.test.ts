// Haunted Hollow's new species and Mart prices (docs/26 §2.8), as a patch over live content: migration 0055 against a
// real Postgres (PGlite, in process) that ran 0052 and then had the admin's own edits, and the same patch over an
// admin export. Only this change lands; the admin's dates, switch, other lines and own pool rows stay.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import type { BundleRaw, SmallWorld } from '@/engine'
import { BUNDLE } from '@/config/bundle'
import { REGION_ID, WORLD_ID, haunted, withHaunted } from '../scripts/content-haunted-hollow'
import {
  NEW_PRICES,
  NEW_SPECIES,
  hhNewSpeciesSql,
  newWildRows,
  patchHhNewSpecies,
} from '../scripts/patch-hh-new-species'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')
const rows = newWildRows()
const [joltik, riolu] = rows
let db: PGlite

const cfg = async (key: string) =>
  (await db.query<{ v: unknown }>(`select value v from game_config where key = $1`, [key])).rows[0]!.v
const hh = async () =>
  ((await cfg('smallWorlds')) as { list: SmallWorld[] }).list.find((w) => w.id === WORLD_ID)!
const count = async (q: string) => Number((await db.query<{ n: number }>(q)).rows[0]!.n)

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
      dexes.map((d) => `(${d}, 'p${d}', 'ghost', 10, 100, 5, '', '[]', 1, 3, '[]', '[]')`).join(', '),
  )
  await db.exec(`insert into game_config (key, value) values
    ('smallWorlds', '{"access": "admin", "list": [{"id": "older-world", "regionId": "world-old"}]}'),
    ('configVersion', '98')`)
  // Live as it is: 0052, then the admin's own edits (its dates, a price of their own, Riolu already put in by hand).
  await db.exec(sql('0052_haunted_hollow.sql'))
  await db.exec(`update game_config set value = jsonb_set(value, '{list}', (
      select jsonb_agg(case when w ->> 'id' = '${WORLD_ID}'
        then jsonb_set(jsonb_set(w, '{start}', '"2026-10-11T12:00:00.000Z"'), '{shop,0,price}', '25') else w end)
      from jsonb_array_elements(value -> 'list') w)) where key = 'smallWorlds';
    insert into area_wild_pool (area_id, dex, weight, min_level, max_level)
      values ('${riolu!.areaId}', ${riolu!.entry.dex}, 9, 22, 23);`)
  await db.exec(sql('0055_hh_new_species.sql'))
})

describe('0055: Haunted Hollow’s new species and prices', () => {
  it('is what the patch script generates', () => {
    expect(sql('0055_hh_new_species.sql')).toBe(hhNewSpeciesSql())
  })

  it('adds each species to its area once, an admin’s own row for it kept', async () => {
    for (const { areaId, entry } of rows) {
      expect(
        await count(
          `select count(*)::int n from area_wild_pool where area_id = '${areaId}' and dex = ${entry.dex}`,
        ),
      ).toBe(1)
    }
    const j = (
      await db.query<{ w: number; lo: number; hi: number }>(
        `select weight w, min_level lo, max_level hi from area_wild_pool where id = '${joltik!.entry.id}'`,
      )
    ).rows[0]
    expect(j).toEqual({ w: joltik!.entry.weight, lo: joltik!.entry.minLevel, hi: joltik!.entry.maxLevel })
    expect(await count(`select count(*)::int n from area_wild_pool where id = '${riolu!.entry.id}'`)).toBe(0)
    expect(
      await count(
        `select count(*)::int n from area_wild_pool where area_id = '${riolu!.areaId}' and weight = 9`,
      ),
    ).toBe(1)
  })

  it('reprices the Link Cable and the Master Ball only, the limit and the admin’s other edits kept', async () => {
    const w = await hh()
    const line = (key: string) => w.shop.find((s) => s.key === key)
    expect(line('link-cable')).toEqual({ key: 'link-cable', price: 300, limit: null })
    expect(line('master-ball')).toEqual({ key: 'master-ball', price: 999, limit: 1 })
    expect(line('poke-ball')?.price).toBe(25)
    expect(w.start).toBe('2026-10-11T12:00:00.000Z')
    expect(w.shop.map((s) => s.key)).toEqual(haunted().world.shop.map((s) => s.key))
    const all = (await cfg('smallWorlds')) as { access: string; list: { id: string }[] }
    expect(all.access).toBe('admin')
    expect(all.list.map((x) => x.id)).toEqual(['older-world', WORLD_ID])
    expect(await cfg('configVersion')).toBe(100)
  })

  it('runs again without changing anything but the content version', async () => {
    const pools = async () => (await db.query('select * from area_wild_pool order by id')).rows
    const before = { pools: await pools(), world: await hh() }
    await db.exec(sql('0055_hh_new_species.sql'))
    expect(await pools()).toEqual(before.pools)
    expect(await hh()).toEqual(before.world)
    expect(await cfg('configVersion')).toBe(101)
  })
})

describe('the same patch over an admin export', () => {
  const fresh = withHaunted(BUNDLE)
  const worldOf = (b: BundleRaw) =>
    (b.config as { smallWorlds: { list: SmallWorld[] } }).smallWorlds.list.find((w) => w.id === WORLD_ID)!
  /** The export as it was before this change: no new species, the old prices, an admin's own start date. */
  const live: BundleRaw = {
    ...fresh,
    areas: fresh.areas.map((a) => ({
      ...a,
      wildPool: a.wildPool.filter((w) => !rows.some((r) => r.entry.id === w.id)),
    })),
    config: {
      ...fresh.config,
      smallWorlds: {
        access: 'admin',
        list: [
          {
            ...worldOf(fresh),
            start: '2026-10-11T12:00:00.000Z',
            shop: worldOf(fresh).shop.map((s) =>
              s.key === 'master-ball'
                ? { ...s, price: 5000 }
                : s.key === 'link-cable'
                  ? { ...s, price: 1000 }
                  : s,
            ),
          },
        ],
      },
    },
  }

  it('gives what the content script builds, the admin’s edits kept', () => {
    const out = patchHhNewSpecies(live)
    expect(out.areas.filter((a) => a.regionId === REGION_ID)).toEqual(
      fresh.areas.filter((a) => a.regionId === REGION_ID),
    )
    expect(worldOf(out)).toEqual({ ...worldOf(fresh), start: '2026-10-11T12:00:00.000Z' })
    expect(out.config.configVersion).toBe(Number(live.config.configVersion) + 1)
    expect(Object.keys(NEW_PRICES).map((k) => worldOf(out).shop.find((s) => s.key === k)?.price)).toEqual([
      300, 999,
    ])
  })

  it('adds nothing twice, and refuses an export without the world', () => {
    const twice = patchHhNewSpecies(patchHhNewSpecies(live))
    expect(twice.areas).toEqual(patchHhNewSpecies(live).areas)
    expect(NEW_SPECIES).toHaveLength(4)
    expect(() => patchHhNewSpecies(BUNDLE)).toThrow(/no Haunted Hollow/)
  })
})
