// Migration 0088 against a real Postgres (PGlite, in process): an old page's plain upsert can no longer write over a
// save, while every write the game makes today goes through as before — a player's first insert, the update over the
// copy it last matched, an Extreme save's first insert beside the main one. Supabase's own pieces are stood in for at
// the top, as in save-writes-sql.test.ts.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')

const ASH = '00000000-0000-4000-8000-000000000001'
const MISTY = '00000000-0000-4000-8000-000000000002'

let db: PGlite

async function as(user: string, q: string, params: unknown[] = []) {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user])
  return (await db.query(q, params)).rows
}

const save = (tag: string, extra: object = {}) => ({ version: 1, player: { name: tag, character: 'red' }, box: [], ...extra })

/** The game today, a first upload: an insert, only when it knows of no row (src/save/cloud.ts pushCloudSave). */
const insert = (user: string, data: unknown, realm = 'main') =>
  as(user, `insert into saves (user_id, data, updated_at, realm) values ($1, $2, now(), $3) returning updated_at`, [
    user,
    JSON.stringify(data),
    realm,
  ])

/** The game today, every later upload: an update of the row it last matched. */
const update = (user: string, data: unknown, realm = 'main') =>
  as(user, `update saves set data = $2, updated_at = now() where user_id = $1 and realm = $3 returning updated_at`, [
    user,
    JSON.stringify(data),
    realm,
  ])

/** A page from before 2026-10-22: supabase-js `upsert(row)`, as PostgREST runs it. */
const oldUpsert = (user: string, data: unknown, realm = 'main') =>
  as(
    user,
    `insert into saves (user_id, data, updated_at, realm) values ($1, $2, now(), $3)
     on conflict (user_id, realm) do update set data = excluded.data, updated_at = excluded.updated_at`,
    [user, JSON.stringify(data), realm],
  )

const stored = async (user: string, realm = 'main') =>
  (await db.query<{ data: { player: { name: string } } }>(`select data from saves where user_id = $1 and realm = $2`, [user, realm]))
    .rows[0]?.data.player.name

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
  `)
  await db.exec(sql('0001_init.sql').replace('create extension if not exists pgcrypto;', ''))
  for (const f of [
    '0011_leaderboard.sql',
    '0016_regions.sql',
    '0018_versus.sql',
    '0032_leaderboard_shiny.sql',
    '0033_friends.sql',
    '0034_day_care.sql',
    '0035_events.sql',
    '0037_skip_unchanged_saves.sql',
    '0038_delete_my_data.sql',
    '0039_extreme_realm.sql',
    '0040_lighter_save_writes.sql',
    '0088_saves_no_overwrite.sql',
    // Run twice: the migration must stay safe to run again.
    '0088_saves_no_overwrite.sql',
  ])
    await db.exec(sql(f))
  await db.exec(`insert into auth.users (id) values ('${ASH}'), ('${MISTY}')`)
}, 60_000)

describe('0088: an upload never writes over a save it was not based on', () => {
  it('a player’s first upload inserts their save, and the next ones update it', async () => {
    await insert(ASH, save('first'))
    expect(await stored(ASH)).toBe('first')
    await update(ASH, save('played on'))
    expect(await stored(ASH)).toBe('played on')
  })

  it('an old page’s plain upsert is refused as a duplicate, and the save stays as it was', async () => {
    await expect(oldUpsert(ASH, save('stripped'))).rejects.toMatchObject({ code: '23505' })
    expect(await stored(ASH)).toBe('played on')
  })

  it('an insert over an existing save fails as it always did (the game reads 23505 as "compare again")', async () => {
    await expect(insert(ASH, save('second device'))).rejects.toMatchObject({ code: '23505' })
    expect(await stored(ASH)).toBe('played on')
  })

  it('an Extreme save’s first upload still goes in beside the main one, and is guarded the same way', async () => {
    await insert(ASH, save('extreme', { mode: 'extreme' }), 'extreme')
    expect(await stored(ASH, 'extreme')).toBe('extreme')
    await expect(oldUpsert(ASH, save('old extreme'), 'extreme')).rejects.toMatchObject({ code: '23505' })
    expect(await stored(ASH, 'extreme')).toBe('extreme')
    expect(await stored(ASH)).toBe('played on')
  })

  it('an old page’s upsert for a player with no save yet still creates it', async () => {
    await oldUpsert(MISTY, save('misty'))
    expect(await stored(MISTY)).toBe('misty')
  })
})
