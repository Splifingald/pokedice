// Double battles (docs/31): migration 0061 against a real Postgres (PGlite, in process), over the content as it was
// live before it (the bundle's areas, trainers and pools without the flag or the new pairs). It adds `trainers.duo`,
// flags the pairs, adds the new ones to their areas and the switch, Off; run again it changes nothing but the content
// version, and the admin's own edits since (a pair unticked, a team, the switch) stay. On an empty database (as
// seed.sql's schema part runs before the data) it adds the column and the switch only.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { BUNDLE } from '@/config/bundle'
import type { Area, Trainer } from '@/engine'
import {
  FLAGGED,
  NEW_DUOS,
  doubleBattlesSql,
  duoPoolEntry,
  duoTrainer,
} from '../scripts/patch-double-battles'
import { upsert } from '../scripts/seed'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')
const FILE = '0061_double_battles.sql'
const TATE = FLAGGED.find(([, name]) => name === 'Tate & Liza')![0]

const AUTH = `create role anon; create role authenticated; create schema auth; create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;`

async function schema(db: PGlite) {
  await db.exec(AUTH)
  await db.exec(sql('0001_init.sql').replace('create extension if not exists pgcrypto;', ''))
  await db.exec(sql('0016_regions.sql'))
  await db.exec('alter table areas add column if not exists rounds_to_clear int;')
  await db.exec('alter table areas add column if not exists scale_offsets jsonb;')
  await db.exec(`insert into game_config (key, value) values ('configVersion', '98')`)
}

/** The live content before 0061, written the way seed.sql wrote it then (no `duo` column). */
async function liveContent(db: PGlite) {
  const newIds = new Set(NEW_DUOS.map((d) => duoTrainer(d).id))
  const poolIds = new Set(NEW_DUOS.map((d) => duoPoolEntry(d).id))
  const areas = BUNDLE.areas as Area[]
  const trainers = (BUNDLE.trainers as Trainer[]).filter((t) => !newIds.has(t.id))
  await db.exec(
    upsert(
      'areas',
      [
        'id',
        'order_index',
        'region_id',
        'name',
        'banner_url',
        'rounds_to_clear',
        'min_level',
        'max_level',
        'encounter_weights',
        'backtrack_multiplier',
        'legendary_boss',
        'scales_to_team',
        'easy_mode',
        'hidden',
        'gyms',
      ],
      areas.map((a) => [
        a.id,
        a.orderIndex,
        a.regionId ?? 'kanto',
        a.name,
        a.bannerUrl,
        a.roundsToClear,
        a.minLevel,
        a.maxLevel,
        a.encounterWeights,
        a.backtrackMultiplier,
        a.legendaryBoss,
        a.scalesToTeam,
        a.easyMode,
        a.hidden,
        a.gyms,
      ]),
      ['id'],
    ),
  )
  await db.exec(
    upsert(
      'trainers',
      [
        'id',
        'name',
        'sprite_url',
        'team',
        'role',
        'badge',
        'upgrade_level',
        'battle_background',
        'rival_of',
        'items',
      ],
      trainers.map((t) => [
        t.id,
        t.name,
        t.spriteUrl,
        t.team,
        t.role,
        t.badge,
        t.upgradeLevel,
        t.battleBackground,
        t.rivalOf ?? null,
        t.items ?? [],
      ]),
      ['id'],
    ),
  )
  await db.exec(
    upsert(
      'area_trainer_pool',
      ['id', 'area_id', 'trainer_id', 'weight'],
      areas.flatMap((a) =>
        a.trainerPool.filter((p) => !poolIds.has(p.id)).map((p) => [p.id, a.id, p.trainerId, p.weight]),
      ),
      ['id'],
    ),
  )
}

const config = async (db: PGlite, key: string) =>
  (await db.query<{ v: unknown }>('select value v from game_config where key = $1', [key])).rows[0]?.v

describe('0061 over the live content', () => {
  let db: PGlite
  const duoIds = async () =>
    (await db.query<{ id: string }>('select id from trainers where duo order by id')).rows.map((r) => r.id)

  beforeAll(async () => {
    db = new PGlite()
    await schema(db)
    await liveContent(db)
    await db.exec(sql(FILE))
  }, 60_000)

  it('is what the patch script generates', () => {
    expect(sql(FILE)).toBe(doubleBattlesSql())
  })

  it('flags the pairs and adds the new ones, each in its area’s pool', async () => {
    const want = [...FLAGGED.map(([id]) => id), ...NEW_DUOS.map((d) => duoTrainer(d).id)].sort()
    expect(await duoIds()).toEqual(want)
    for (const d of NEW_DUOS) {
      const t = duoTrainer(d)
      const [row] = (
        await db.query<{ name: string; team: unknown; role: string; items: unknown }>(
          'select name, team, role, items from trainers where id = $1',
          [t.id],
        )
      ).rows
      expect(row).toEqual({ name: t.name, team: t.team, role: 'trainer', items: [] })
      const e = duoPoolEntry(d)
      const pool = (
        await db.query<{ area_id: string; weight: number }>(
          'select area_id, weight from area_trainer_pool where trainer_id = $1',
          [t.id],
        )
      ).rows
      expect(pool).toEqual([
        {
          area_id: (BUNDLE.areas as Area[]).find((a) => a.trainerPool.some((p) => p.id === e.id))!.id,
          weight: 10,
        },
      ])
    }
  })

  it('adds the switch, Off, and bumps the content version', async () => {
    expect(await config(db, 'doubleBattles')).toEqual({
      access: 'off',
      regions: ['hoenn', 'sinnoh', 'unova', 'kalos', 'alola', 'galar', 'paldea'],
      wildChance: 10,
    })
    expect(await config(db, 'configVersion')).toBe(99)
  })

  it('runs again changing nothing but the content version; the admin’s own edits stay', async () => {
    const d = NEW_DUOS[0]!
    const own = [
      { dex: 25, level: 9 },
      { dex: 26, level: 9 },
    ]
    await db.query('update trainers set duo = false where id = $1', [TATE])
    await db.query('update trainers set team = $1 where id = $2', [JSON.stringify(own), duoTrainer(d).id])
    await db.exec(
      `update game_config set value = '{"access":"all","regions":["hoenn"],"wildChance":5}' where key = 'doubleBattles'`,
    )
    const pools = async () =>
      (await db.query<{ n: number }>('select count(*)::int n from area_trainer_pool')).rows[0]!.n
    const n = await pools()
    await db.exec(sql(FILE))
    expect(await duoIds()).not.toContain(TATE)
    const [row] = (
      await db.query<{ team: unknown }>('select team from trainers where id = $1', [duoTrainer(d).id])
    ).rows
    expect(row!.team).toEqual(own)
    expect(await pools()).toBe(n)
    expect(await config(db, 'doubleBattles')).toEqual({ access: 'all', regions: ['hoenn'], wildChance: 5 })
    expect(await config(db, 'configVersion')).toBe(100)
  })
})

describe('0061 on an empty database (seed.sql’s schema part, before its data)', () => {
  it('adds the column and the switch, and no trainer', async () => {
    const db = new PGlite()
    await schema(db)
    await db.exec(sql(FILE))
    await db.exec(sql(FILE))
    expect((await db.query<{ n: number }>('select count(*)::int n from trainers')).rows[0]!.n).toBe(0)
    const col = await db.query(
      `select 1 from information_schema.columns where table_name = 'trainers' and column_name = 'duo'`,
    )
    expect(col.rows.length).toBe(1)
    expect(((await config(db, 'doubleBattles')) as { access: string }).access).toBe('off')
    expect(await config(db, 'configVersion')).toBe(100)
  }, 60_000)
})
