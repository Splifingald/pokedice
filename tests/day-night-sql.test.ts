// Day and night in Johto (docs/31) as a patch over live content: migration 0061 against a real Postgres (PGlite, in
// process), over Johto's pools as the seed writes them before it. The times land on the tagged species' rows, the
// switch goes in Off, a time the admin set stays, twice changes nothing. Then the same patch over an admin export, and
// the rows ↔ bundle mapping both ways.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { BUNDLE } from '@/config/bundle'
import { bundleToRows, rowsToBundle, type TableRows } from '@/config/mapping'
import type { BundleRaw } from '@/engine'
import { DAY_NIGHT_TAGS, dayNightSql, patchDayNight } from '../scripts/patch-day-night'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')
const FILE = '0061_day_night.sql'
const q = (v: string) => `'${v.replace(/'/g, "''")}'`

const AUTH = `create role anon; create role authenticated; create schema auth; create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;`

const johto = BUNDLE.areas.filter((a) => a.regionId === 'johto')
const ROUTE_29 = '522e114b-852b-543a-8d79-8cc34d598b13'

describe('0061: day and night', () => {
  let db: PGlite
  const times = async () =>
    (
      await db.query<{ a: string; d: number; t: string | null }>(
        'select area_id::text a, dex d, time_of_day t from area_wild_pool order by id',
      )
    ).rows
  const version = async () =>
    Number(
      (await db.query<{ v: string }>("select value #>> '{}' v from game_config where key = 'configVersion'"))
        .rows[0]!.v,
    )

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(AUTH)
    await db.exec(sql('0001_init.sql').replace('create extension if not exists pgcrypto;', ''))
    await db.exec(sql('0016_regions.sql'))
    const dexes = [...new Set(johto.flatMap((a) => a.wildPool.map((w) => w.dex)))]
    await db.exec(
      `insert into pokemon (dex, name, type1, base_hp, max_hp, speed, sprite_url, dice, rerolls, catch_value, evolutions, milestones) values ` +
        dexes.map((d) => `(${d}, 'p${d}', 'normal', 10, 100, 5, '', '[]', 1, 3, '[]', '[]')`).join(', '),
    )
    await db.exec(
      'insert into areas (id, order_index, region_id, name, min_level, max_level, encounter_weights) values ' +
        johto.map((a) => `(${q(a.id)}, ${a.orderIndex}, 'johto', ${q(a.name)}, 1, 5, '{}')`).join(', '),
    )
    // Johto's pools before 0061: no time anywhere.
    await db.exec(
      'insert into area_wild_pool (id, area_id, dex, weight, min_level, max_level) values ' +
        johto
          .flatMap((a) => a.wildPool.map((w) => `(${q(w.id)}, ${q(a.id)}, ${w.dex}, ${w.weight}, 1, 5)`))
          .join(', '),
    )
    await db.exec(`insert into game_config (key, value) values ('configVersion', '41')`)
    await db.exec(sql(FILE))
  })

  it('is what the patch script generates', () => {
    expect(sql(FILE)).toBe(dayNightSql())
  })

  it("gives the tagged species' rows their time, and no other row one", async () => {
    for (const r of await times()) expect(r.t, `${r.a} #${r.d}`).toBe(DAY_NIGHT_TAGS[r.a]?.[r.d] ?? null)
    expect(await version()).toBe(42)
  })

  it('puts the switch in Off', async () => {
    const row = (await db.query<{ v: unknown }>("select value v from game_config where key = 'dayNight'"))
      .rows[0]
    expect(row?.v).toEqual({ access: 'off' })
  })

  it('keeps a time or a switch the admin set, and changes nothing more the second time', async () => {
    await db.query(`update area_wild_pool set time_of_day = 'day' where area_id = $1 and dex = 163`, [
      ROUTE_29,
    ])
    await db.exec(`update game_config set value = '{"access": "all"}' where key = 'dayNight'`)
    const before = await times()
    await db.exec(sql(FILE))
    expect(await times()).toEqual(before)
    expect(before.find((r) => r.a === ROUTE_29 && r.d === 163)?.t).toBe('day')
    const row = (await db.query<{ v: unknown }>("select value v from game_config where key = 'dayNight'"))
      .rows[0]
    expect(row?.v).toEqual({ access: 'all' })
  })
})

describe('the patch over an admin export', () => {
  it('sets the times, keeps an admin time, adds the switch Off and bumps the content version', () => {
    const old: BundleRaw = {
      ...BUNDLE,
      areas: BUNDLE.areas.map((a) => ({
        ...a,
        wildPool: a.wildPool.map(({ time: _time, ...w }) =>
          a.id === ROUTE_29 && w.dex === 163 ? { ...w, time: 'day' as const } : w,
        ),
      })),
      config: { ...BUNDLE.config, configVersion: 7 },
    } as BundleRaw
    const patched = patchDayNight(old)
    const r29 = patched.areas.find((a) => a.id === ROUTE_29)!
    expect(r29.wildPool.find((w) => w.dex === 163)?.time).toBe('day')
    expect(r29.wildPool.find((w) => w.dex === 161)?.time).toBe('day')
    expect(r29.wildPool.find((w) => w.dex === 19)?.time).toBeUndefined()
    expect(patched.config.dayNight).toEqual({ access: 'off' })
    expect(Number(patched.config.configVersion)).toBe(8)
  })
})

describe('the rows ↔ bundle mapping', () => {
  it('carries a time both ways, and leaves the column out while no row has one', () => {
    const rows = bundleToRows(BUNDLE as BundleRaw)
    const r29 = rows.area_wild_pool.filter((w) => w.area_id === ROUTE_29)
    expect(r29.find((w) => w.dex === 163)?.time_of_day).toBe('night')
    expect(r29.find((w) => w.dex === 19)?.time_of_day).toBeNull()
    const back = rowsToBundle(rows as TableRows)
    expect(back.areas.find((a) => a.id === ROUTE_29)?.wildPool).toEqual(
      BUNDLE.areas.find((a) => a.id === ROUTE_29)?.wildPool,
    )
    const untimed = bundleToRows({
      ...BUNDLE,
      areas: BUNDLE.areas.map((a) => ({ ...a, wildPool: a.wildPool.map(({ time: _time, ...w }) => w) })),
    } as BundleRaw)
    expect(untimed.area_wild_pool.some((w) => 'time_of_day' in w)).toBe(false)
  })
})
