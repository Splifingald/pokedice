// The side quests' migrations (docs/61), 0108 to 0112, against a real Postgres (PGlite, in process), over the areas
// they touch as they were live before them: Snowpoint Temple's conditions, the roadblocks' areas and their wild rows, the
// disguises' areas, the four Safaris (Kanto's still holding Fuchsia's Gym) and the towns their trainers move to, Blue's
// two rows. Each migration does what the bundle has; run again, nothing moves but the content version.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { BUNDLE } from '@/config/bundle'
import type { Area, Trainer } from '@/engine'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')
const FILES = ['0108_regigigas_regis.sql', '0109_roadblocks.sql', '0110_disguises.sql', '0111_safaris.sql', '0112_set_moments.sql']

const AUTH = `create role anon; create role authenticated; create schema auth; create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;`

const areas = BUNDLE.areas as Area[]
const trainers = BUNDLE.trainers as Trainer[]
const byId = (id: string) => areas.find((a) => a.id === id)!

const TEMPLE = '10a7f721-2f52-58c4-bba1-728e2f88d763'
const ROADS: [string, number][] = [
  ['ff3f0086-1b99-559e-a646-e88006eec749', 143],
  ['61bfb445-9bdc-5e47-9c3a-f379bd33a06b', 185],
  ['e34791dd-2b08-51ef-9c9f-be18cea0524b', 352],
  ['77afa3c1-7785-5e6f-a3cc-f249ec9af432', 143],
]
const FUCHSIA = '2238f26a-2629-5f28-af07-e74cb41d5f7a'
const KANTO_SAFARI = '38fc3c59-6f8d-5aa8-a299-a5bb949254b2'
const HOENN_SAFARI = 'd5fe2203-9a4f-5874-99c6-005b01b42ece'
const MARSH = '132bb05f-9768-59fb-89de-b25ecb1acc45'
const FRIEND = 'cb642e3e-986b-5430-b507-7baf6cc0567b'
const PASTORIA = '67b3b539-dd5b-5c9a-96d4-60e4d8b8d188'
const KILOUDE = 'a3a909e6-bd11-52cd-8d21-bc6a6aa8992d'
const BLUE = ['8ac18ebf-ef70-5887-9076-1714e5870d7b', '82eb7a7a-2fa5-5a69-9e84-a56fb850da5d']

/** Every area a migration touches, and those its rows point at. */
const TOUCHED = [
  TEMPLE,
  ...ROADS.map(([id]) => id),
  ...new Set(areas.flatMap((a) => (a.lootPool.some((l) => l.disguise) ? [a.id] : []))),
  FUCHSIA,
  HOENN_SAFARI,
  MARSH,
  FRIEND,
  PASTORIA,
  KILOUDE,
  'e34791dd-2b08-51ef-9c9f-be18cea0524b',
]

const q = (v: unknown) => (v == null ? 'null' : typeof v === 'object' ? `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb` : typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : String(v))

async function schema(db: PGlite) {
  await db.exec(AUTH)
  await db.exec(sql('0001_init.sql').replace('create extension if not exists pgcrypto;', ''))
  await db.exec(sql('0016_regions.sql'))
  await db.exec(`alter table areas add column if not exists rounds_to_clear int;
    alter table areas add column if not exists scale_offsets jsonb;
    alter table areas add column if not exists mode jsonb;
    alter table trainers add column if not exists duo boolean not null default false;
    insert into game_config (key, value) values ('configVersion', '200');`)
}

/** The content as it was before 0108: undone from the bundle by hand, area by area. */
async function before(db: PGlite) {
  const kantoSafari = byId(KANTO_SAFARI)
  const dexes = new Set<number>()
  const rows: string[] = []
  const wild: string[] = []
  const trainerPool: string[] = []
  for (const id of new Set(TOUCHED)) {
    const a = byId(id)
    let name = a.name
    let hidden = a.hidden
    let unlock = a.unlockConditions
    let rounds = a.roundsToClear
    let weights: Record<string, number> = { ...a.encounterWeights }
    let bosses = a.legendaryBoss
    let mode: unknown = a.mode ?? null
    let pool = a.wildPool
    if (id === TEMPLE) unlock = (unlock ?? []).filter((c) => c.kind !== 'caught')
    const road = ROADS.find(([r]) => r === id)
    if (road) {
      bosses = (bosses ?? []).filter((b) => !b.roadblock)
      if (!bosses.length) bosses = null
      const n = ROADS.indexOf(road)
      pool = [...pool, { id: `00000000-0000-4000-8000-${String(n * 1000 + road[1]).padStart(12, '0')}`, dex: road[1], weight: 2, minLevel: 30, maxLevel: 30 }]
    }
    if (id === FUCHSIA) {
      name = 'Safari Zone'
      weights = { item: 2, wild: 5, center: 1, trainer: 0 }
      rounds = 2
      pool = kantoSafari.wildPool
    }
    if (id === HOENN_SAFARI || id === MARSH || id === FRIEND) {
      mode = null
      if (id !== FRIEND) {
        hidden = false
        unlock = null
        rounds = 2
      }
      weights = { ...weights, center: 1, trainer: 2 }
    }
    if (id === FRIEND) pool = pool.filter((w) => ![1, 4, 7].includes(w.dex))
    rows.push(
      `(${q(a.id)}, ${a.orderIndex}, ${q(a.regionId ?? 'kanto')}, ${q(name)}, ${q(a.bannerUrl)}, ${q(rounds)}, ${a.minLevel}, ${a.maxLevel}, ${q(weights)}, ${a.backtrackMultiplier}, ${q(bosses)}, ${a.scalesToTeam}, ${a.easyMode}, ${q(a.enemyUpgradeLevel)}, ${q(a.battleBackground)}, ${hidden}, ${q(unlock)}, ${q(a.gyms)}, ${q(mode)})`,
    )
    for (const w of pool) {
      dexes.add(w.dex)
      wild.push(`(${q(w.id)}, ${q(a.id)}, ${w.dex}, ${w.weight}, ${w.minLevel}, ${w.maxLevel})`)
    }
    // The Great Marsh's and the Friend Safari's trainers, back where they were.
    const moved = id === PASTORIA ? MARSH : id === KILOUDE ? FRIEND : null
    for (const e of a.trainerPool) {
      const from = moved && byId(moved) && (e.trainerId && trainers.find((t) => t.id === e.trainerId)?.name.match(/Ranger|Ace Trainer Margaux|Veteran Lucien|Pokémon Ranger Elsa/)) ? moved : a.id
      trainerPool.push(`(${q(e.id)}, ${q(from)}, ${q(e.trainerId)}, ${e.weight})`)
    }
  }
  const species = (BUNDLE.pokemon as { dex: number; name: string; type1: string }[]).filter((p) => dexes.has(p.dex) || [1, 4, 7, 100, 101, 590, 591, 129].includes(p.dex))
  await db.exec(
    `insert into pokemon (dex, name, type1, base_hp, max_hp, speed, sprite_url, dice, rerolls) values ${species
      .map((p) => `(${p.dex}, ${q(p.name)}, ${q(p.type1)}, 50, 50, 5, '', '[]'::jsonb, 1)`)
      .join(',')};`,
  )
  await db.exec(
    `insert into areas (id, order_index, region_id, name, banner_url, rounds_to_clear, min_level, max_level, encounter_weights, backtrack_multiplier, legendary_boss, scales_to_team, easy_mode, enemy_upgrade_level, battle_background, hidden, unlock_conditions, gyms, mode) values ${rows.join(',')};`,
  )
  const used = new Set(areas.flatMap((a) => (new Set(TOUCHED).has(a.id) ? a.trainerPool.map((e) => e.trainerId) : [])))
  const ts = trainers.filter((t) => used.has(t.id) || BLUE.includes(t.id))
  await db.exec(
    `insert into trainers (id, name, sprite_url, team, role, rival_of) values ${ts
      .map((t) => `(${q(t.id)}, ${q(t.name)}, ${q(t.spriteUrl)}, ${q(t.team)}, ${q(t.role)}, ${BLUE.includes(t.id) ? 'null' : q(t.rivalOf ?? null)})`)
      .join(',')};`,
  )
  await db.exec(`insert into area_wild_pool (id, area_id, dex, weight, min_level, max_level) values ${wild.join(',')};`)
  if (trainerPool.length) await db.exec(`insert into area_trainer_pool (id, area_id, trainer_id, weight) values ${trainerPool.join(',')};`)
}

const one = async <T,>(db: PGlite, text: string, params: unknown[] = []) => (await db.query<T>(text, params)).rows[0]
const all = async <T,>(db: PGlite, text: string, params: unknown[] = []) => (await db.query<T>(text, params)).rows

describe('the side quests’ migrations (0108–0112)', () => {
  let db: PGlite
  beforeAll(async () => {
    db = new PGlite()
    await schema(db)
    await before(db)
    for (const f of FILES) await db.exec(sql(f))
  }, 60_000)

  it('0108: Snowpoint Temple waits for the three Regis', async () => {
    const r = await one<{ u: unknown[] }>(db, 'select unlock_conditions u from areas where id = $1', [TEMPLE])
    expect(r!.u).toContainEqual({ kind: 'caught', dex: [377, 378, 379] })
  })

  it('0109: each roadblock is its area’s boss and out of its wild pool', async () => {
    for (const [id, dex] of ROADS) {
      const a = await one<{ b: { dex: number; roadblock: string }[] }>(db, 'select legendary_boss b from areas where id = $1', [id])
      expect(a!.b.some((b) => b.dex === dex && !!b.roadblock), id).toBe(true)
      const w = await all(db, 'select 1 from area_wild_pool where area_id = $1 and dex = $2', [id, dex])
      expect(w, id).toHaveLength(0)
    }
  })

  it('0110: the disguises and the server’s switch for the side quests', async () => {
    const n = await one<{ n: number }>(db, 'select count(*)::int n from area_loot_pool where disguise is not null')
    expect(n!.n).toBe(areas.flatMap((a) => a.lootPool.filter((l) => l.disguise)).length)
    expect((await one<{ v: boolean }>(db, "select side_quest_open('disguises') v"))!.v).toBe(false)
    await db.exec(`update game_config set value = '{"access":"all"}' where key = 'disguises'`)
    expect((await one<{ v: boolean }>(db, "select side_quest_open('disguises') v"))!.v).toBe(true)
    expect((await one<{ v: boolean }>(db, "select side_quest_open('configVersion') v"))!.v).toBe(false)
    await db.exec(`update game_config set value = '{"access":"off"}' where key = 'disguises'`)
  })

  it('0111: Kanto’s area is Fuchsia City, its Safari a secret area of its own; the others secret too', async () => {
    const f = await one<{ name: string; w: Record<string, number>; r: number }>(db, 'select name, encounter_weights w, rounds_to_clear r from areas where id = $1', [FUCHSIA])
    expect(f).toMatchObject({ name: 'Fuchsia City', r: 1 })
    expect(f!.w.trainer).toBe(5)
    expect(await all(db, 'select 1 from area_wild_pool where area_id = $1', [FUCHSIA])).toHaveLength(0)
    const k = await one<{ hidden: boolean; mode: unknown; u: unknown }>(db, 'select hidden, mode, unlock_conditions u from areas where id = $1', [KANTO_SAFARI])
    expect(k).toMatchObject({ hidden: true, mode: { kind: 'safari' }, u: [{ kind: 'area', areaId: FUCHSIA }] })
    expect((await all(db, 'select 1 from area_wild_pool where area_id = $1', [KANTO_SAFARI])).length).toBe(byId(KANTO_SAFARI).wildPool.length)
    for (const id of [HOENN_SAFARI, MARSH, FRIEND]) {
      const a = await one<{ hidden: boolean; mode: unknown; r: number | null; w: Record<string, number> }>(db, 'select hidden, mode, rounds_to_clear r, encounter_weights w from areas where id = $1', [id])
      expect(a, id).toMatchObject({ hidden: true, mode: { kind: 'safari' }, r: null })
      expect(a!.w.center, id).toBe(0)
      expect(a!.w.trainer, id).toBe(0)
    }
    expect(await all(db, 'select 1 from area_trainer_pool where area_id = $1', [MARSH])).toHaveLength(0)
    expect((await one<{ v: { roundPrice: number } }>(db, "select value v from game_config where key = 'safari'"))!.v.roundPrice).toBe(100)
  })

  it('0112: the rivals’ trainers, Blue’s versions, the Kanto starters in the Friend Safari, the switches Off', async () => {
    const n = await one<{ n: number }>(db, "select count(*)::int n from trainers where name in ('Silver', 'May', 'Wally') or (name = 'Rival Blue' and id <> all($1::uuid[]))", [BLUE])
    expect(n!.n).toBeGreaterThanOrEqual(15 + 15 + 2 + 16)
    expect((await one<{ r: number }>(db, 'select rival_of r from trainers where id = $1', [BLUE[0]]))!.r).toBe(4)
    expect((await one<{ r: number }>(db, 'select rival_of r from trainers where id = $1', [BLUE[1]]))!.r).toBe(1)
    expect(await all(db, 'select dex from area_wild_pool where area_id = $1 and dex in (1, 4, 7)', [FRIEND])).toHaveLength(3)
    for (const k of ['rivals', 'giftMoments'])
      expect((await one<{ v: { access: string } }>(db, 'select value v from game_config where key = $1', [k]))!.v.access).toBe('off')
  })

  it('run again, changes nothing but the content version', async () => {
    const snap = async () =>
      JSON.stringify([
        await all(db, 'select * from areas order by id'),
        await all(db, 'select * from area_wild_pool order by id'),
        await all(db, 'select * from area_trainer_pool order by id'),
        await all(db, 'select * from area_loot_pool order by id'),
        await all(db, 'select * from trainers order by id'),
        await all(db, "select * from game_config where key <> 'configVersion' order by key"),
      ])
    const a = await snap()
    const v0 = (await one<{ v: number }>(db, "select (value #>> '{}')::int v from game_config where key = 'configVersion'"))!.v
    for (const f of FILES) await db.exec(sql(f))
    expect(await snap()).toBe(a)
    const v1 = (await one<{ v: number }>(db, "select (value #>> '{}')::int v from game_config where key = 'configVersion'"))!.v
    expect(v1).toBe(v0 + FILES.length)
  }, 60_000)
})
