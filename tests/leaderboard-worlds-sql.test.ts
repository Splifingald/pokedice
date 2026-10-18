// Migration 0066 against a real Postgres (PGlite, in process): a small world has no gyms, so its board holds every
// trainer who has cleared one of its areas, badge or not, while a real region still needs its badge. Supabase's own
// pieces are stood in for at the top, as in leaderboard-cross-region-sql.test.ts.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseLeaderboard, splitLeaderboard } from '@/lib/leaderboard'
import { data } from './fixtures'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')

const WORLD = 'world-test'
const U = {
  ash: '00000000-0000-4000-8000-000000000001', // in the world, an area cleared there, a Kanto badge
  misty: '00000000-0000-4000-8000-000000000002', // in the world, nothing cleared there yet
  gary: '00000000-0000-4000-8000-000000000003', // in the world, an area cleared there, no badge anywhere
  brock: '00000000-0000-4000-8000-000000000004', // an area cleared in Kanto, no badge: not on Kanto's board
}
const BOULDER = '10000000-0000-4000-8000-000000000001'

/** A region's block of a save: route 1 cleared or not, with a badge from `gym` if one is given. */
const block = (cleared: boolean, gym?: string) => ({
  box: [{ id: 'a', dex: 4, level: 20 }],
  team: ['a'],
  pokedex: [4],
  areaProgress: { 'route-1': { cleared, gymsDefeated: gym ? [gym] : [] } },
})
const save = (name: string, region: string, live: object, parked: Record<string, object>) => ({
  version: 1,
  player: { name, character: 'red' },
  region,
  ...live,
  parked,
})

let db: PGlite

async function board(user: string | null) {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? ''])
  return (await db.query<Record<string, unknown>>('select * from leaderboard()')).rows
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
    grant usage on schema auth to anon, authenticated;
  `)
  await db.exec(sql('0001_init.sql').replace('create extension if not exists pgcrypto;', ''))
  for (const f of [
    '0011_leaderboard.sql',
    '0016_regions.sql',
    '0018_versus.sql',
    '0030_pokemon_forms.sql',
    '0032_leaderboard_shiny.sql',
    '0033_friends.sql',
    '0034_day_care.sql',
    '0035_events.sql',
    '0037_skip_unchanged_saves.sql',
    '0038_delete_my_data.sql',
    '0039_extreme_realm.sql',
    '0040_lighter_save_writes.sql',
    '0044_trades.sql',
    '0045_progress_raids.sql',
    '0046_progress_raids_worlds.sql',
    '0047_trades_admin_read.sql',
    '0049_general_upgrades.sql',
    '0054_leaderboard_cross_region.sql',
    '0066_leaderboard_worlds.sql',
  ])
    await db.exec(sql(f))
  // Safe to run again.
  await db.exec(sql('0066_leaderboard_worlds.sql'))
  await db.exec(`
    insert into auth.users (id) values ${Object.values(U)
      .map((u) => `('${u}')`)
      .join(',')};
    insert into trainers (id, name, team, role, badge) values ('${BOULDER}', 'Brock', '[]', 'leader', 'Boulder Badge');
    insert into game_config (key, value) values
      ('smallWorlds', '{"access":"everyone","list":[{"id":"w","regionId":"${WORLD}"}]}');
  `)
  const put = (user: string, s: object) =>
    db.query(`insert into saves (user_id, realm, data, updated_at) values ($1, 'main', $2, now())`, [
      user,
      JSON.stringify(s),
    ])
  await put(U.ash, save('ASH', WORLD, block(true), { kanto: block(true, BOULDER) }))
  await put(U.misty, save('MISTY', WORLD, block(false), { kanto: block(true, BOULDER) }))
  await put(U.gary, save('GARY', WORLD, block(true), { kanto: block(false) }))
  await put(U.brock, save('BROCK', 'kanto', block(true), {}))
}, 60_000)

afterAll(async () => {
  await db?.close()
})

const sorted = (rows: unknown[][]) => rows.sort((a, b) => `${a[0]}${a[1]}`.localeCompare(`${b[0]}${b[1]}`))

describe('0066: the small worlds on the leaderboard', () => {
  it('boards a world for whoever cleared one of its areas, badge or not; a real region still needs its badge', async () => {
    const rows = (await board(null)).map((r) => [r.name, r.region, r.lead])
    expect(sorted(rows)).toEqual([
      ['ASH', 'kanto', false],
      ['ASH', WORLD, true],
      ['GARY', WORLD, true],
      // Nothing cleared in the world yet: her lead is the region she holds a badge in.
      ['MISTY', 'kanto', true],
    ])
  })

  it("the world's board ranks them", async () => {
    const rows = parseLeaderboard((await board(U.gary)) as unknown as Parameters<typeof parseLeaderboard>[0])
    const names = splitLeaderboard(rows, 'level', data, WORLD).board.map((r) => [r.name, r.isMe])
    expect(names.sort()).toEqual([
      ['ASH', false],
      ['GARY', true],
    ])
  })

  it('leaves a world taken off the list out', async () => {
    await db.exec(
      `update game_config set value = '{"access":"everyone","list":[]}' where key = 'smallWorlds'`,
    )
    try {
      const rows = (await board(null)).map((r) => [r.name, r.region])
      expect(sorted(rows)).toEqual([
        ['ASH', 'kanto'],
        ['MISTY', 'kanto'],
      ])
    } finally {
      await db.exec(
        `update game_config set value = '{"access":"everyone","list":[{"id":"w","regionId":"${WORLD}"}]}'
         where key = 'smallWorlds'`,
      )
    }
  })

  it('keeps the grants it had', async () => {
    const [row] = (
      await db.query<{ a: boolean; u: boolean }>(
        `select has_function_privilege('anon', 'leaderboard(text)', 'execute') a,
                has_function_privilege('authenticated', 'leaderboard(text)', 'execute') u`,
      )
    ).rows
    expect(row).toEqual({ a: true, u: true })
  })
})
