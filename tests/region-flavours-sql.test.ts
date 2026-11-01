// The region flavours' migrations (docs/62), 0114 to 0119, against a real Postgres (PGlite, in process), over the areas
// they touch as they were before them: the five Titans' areas with no boss, Vast Poni Canyon's gyms without Totem
// Kommo-o, no Castform form, the six areas of the type trials without them. Each migration does what the bundle has; run again, nothing moves but the content version.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { BUNDLE } from '@/config/bundle'
import { TRIALS, type Area, type Trainer } from '@/engine'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')
const FILES = ['0114_weather.sql', '0115_hordes.sql', '0116_trials.sql', '0117_titans.sql', '0118_castform_forms.sql', '0119_type_trials.sql']

const AUTH = `create role anon; create role authenticated; create schema auth; create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;`

const areas = BUNDLE.areas as Area[]
const trainers = BUNDLE.trainers as Trainer[]
const byId = (id: string) => areas.find((a) => a.id === id)!
const TITAN_AREAS = areas.filter((a) => a.legendaryBoss?.some((b) => b.titan))
const CANYON = 'e7ae24d0-80a4-51d7-a9cb-c0df82d25286'
const KOMMO_O = '7278511c-319e-5fc1-a053-0be766cb70fd'
const HAPU = 'c6106307-fd9e-50e1-aa2c-8edd1069cb8f'
/** The six trials of their own for the types Alola's don't give (0119): their areas and their Totems' gym rows. */
const TYPE_TRIALS = TRIALS.filter((t) => t.own && t.trainerId !== KOMMO_O)

const q = (v: unknown) =>
  v == null
    ? 'null'
    : typeof v === 'object'
      ? `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`
      : typeof v === 'string'
        ? `'${v.replace(/'/g, "''")}'`
        : String(v)

async function setUp(db: PGlite) {
  await db.exec(AUTH)
  await db.exec(sql('0001_init.sql').replace('create extension if not exists pgcrypto;', ''))
  await db.exec(sql('0016_regions.sql'))
  await db.exec(`alter table areas add column if not exists rounds_to_clear int;
    alter table areas add column if not exists scale_offsets jsonb;
    alter table areas add column if not exists mode jsonb;
    alter table trainers add column if not exists duo boolean not null default false;
    alter table pokemon add column if not exists form jsonb;
    insert into game_config (key, value) values ('configVersion', '300');`)
  // As they were before: no Titan, no Kommo-o.
  const rows = [...TITAN_AREAS, byId(CANYON), ...TYPE_TRIALS.map((t) => byId(t.areaId))].map((a) => {
    const bosses = (a.legendaryBoss ?? []).filter((b) => !b.titan)
    const gyms = a.gyms.filter((g) => g !== KOMMO_O && !TYPE_TRIALS.some((t) => t.trainerId === g))
    return `(${q(a.id)}, ${a.orderIndex}, ${q(a.regionId)}, ${q(a.name)}, ${a.minLevel}, ${a.maxLevel}, ${q(a.encounterWeights)}, ${a.backtrackMultiplier}, ${q(bosses.length ? bosses : null)}, ${q(gyms)})`
  })
  await db.exec(
    `insert into areas (id, order_index, region_id, name, min_level, max_level, encounter_weights, backtrack_multiplier, legendary_boss, gyms) values ${rows.join(',')};`,
  )
  const hapu = trainers.find((t) => t.id === HAPU)!
  await db.exec(`insert into trainers (id, name, sprite_url, team, role) values (${q(hapu.id)}, ${q(hapu.name)}, ${q(hapu.spriteUrl)}, ${q(hapu.team)}, 'leader');`)
}

const one = async <T,>(db: PGlite, text: string, params: unknown[] = []) => (await db.query<T>(text, params)).rows[0]

describe('the region flavours’ migrations (0114–0119)', () => {
  let db: PGlite
  beforeAll(async () => {
    db = new PGlite()
    await setUp(db)
    for (const f of FILES) await db.exec(sql(f))
  }, 60_000)

  it('0114: the weather’s switches Off, and the server’s check knows the five flavours', async () => {
    for (const key of ['hoennWeather', 'galarWeather', 'hordes', 'trials', 'titans']) {
      expect((await one<{ v: { access: string } }>(db, 'select value v from game_config where key = $1', [key]))!.v).toEqual({ access: 'off' })
      expect((await one<{ v: boolean }>(db, 'select side_quest_open($1) v', [key]))!.v).toBe(false)
      await db.query(`update game_config set value = '{"access":"all"}' where key = $1`, [key])
      expect((await one<{ v: boolean }>(db, 'select side_quest_open($1) v', [key]))!.v).toBe(true)
      await db.query(`update game_config set value = '{"access":"off"}' where key = $1`, [key])
    }
    expect((await one<{ v: boolean }>(db, "select side_quest_open('configVersion') v"))!.v).toBe(false)
  })

  it('0116: Totem Kommo-o, a gym of Vast Poni Canyon before Hapu, as the bundle has it', async () => {
    const t = await one<{ name: string; team: unknown }>(db, 'select name, team from trainers where id = $1', [KOMMO_O])
    expect(t).toEqual({ name: 'Totem Kommo-o', team: [{ dex: 784, level: 45 }] })
    const a = await one<{ g: string[] }>(db, 'select gyms g from areas where id = $1', [CANYON])
    expect(a!.g).toEqual(byId(CANYON).gyms)
  })

  it('0117: each Titan its area’s boss, as the bundle has it', async () => {
    for (const area of TITAN_AREAS) {
      const r = await one<{ b: unknown }>(db, 'select legendary_boss b from areas where id = $1', [area.id])
      expect(r!.b, area.name).toEqual(area.legendaryBoss)
    }
  })

  it('0118: Castform’s three weather forms, as the bundle has them', async () => {
    const species = BUNDLE.pokemon as { dex: number; type1: string; form?: unknown }[]
    for (const dex of [10013, 10014, 10015]) {
      const r = await one<{ type1: string; form: unknown }>(db, 'select type1, form from pokemon where dex = $1', [dex])
      const own = species.find((p) => p.dex === dex)!
      expect(r, String(dex)).toEqual({ type1: own.type1, form: own.form })
    }
  })

  it('0119: the six type trials’ Totems, each the gym of its area, as the bundle has them', async () => {
    expect(TYPE_TRIALS).toHaveLength(6)
    for (const tr of TYPE_TRIALS) {
      const t = await one<{ name: string; team: unknown }>(db, 'select name, team from trainers where id = $1', [tr.trainerId])
      const own = trainers.find((x) => x.id === tr.trainerId)!
      expect(t, own.name).toEqual({ name: own.name, team: own.team })
      const a = await one<{ g: string[] }>(db, 'select gyms g from areas where id = $1', [tr.areaId])
      expect(a!.g, own.name).toEqual(byId(tr.areaId).gyms)
    }
  })

  it('run again, nothing moves but the content version', async () => {
    const snap = async () => [
      ...(await db.query('select id, gyms, legendary_boss from areas order by id')).rows,
      ...(await db.query('select dex, form from pokemon order by dex')).rows,
    ]
    const before = await snap()
    const v0 = (await one<{ v: number }>(db, "select (value #>> '{}')::int v from game_config where key = 'configVersion'"))!.v
    for (const f of FILES) await db.exec(sql(f))
    expect(await snap()).toEqual(before)
    const v1 = (await one<{ v: number }>(db, "select (value #>> '{}')::int v from game_config where key = 'configVersion'"))!.v
    expect(v1).toBe(v0 + FILES.length)
  })
})
