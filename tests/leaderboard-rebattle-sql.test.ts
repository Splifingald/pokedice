// Migration 0076 against a real Postgres (PGlite, in process): the card writer keeps each region's Elite Rebattle tiers
// cleared on its League's progress entry, so leaderboard() carries them and the Progression board ranks on them.
// Supabase's own pieces are stood in for at the top, as in leaderboard-worlds-sql.test.ts.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { leagueArea } from '@/engine'
import { parseLeaderboard, splitLeaderboard } from '@/lib/leaderboard'
import { data } from './fixtures'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')

const LEAGUE = leagueArea(data, 'kanto')!.id
const MAIN = data.areas.filter((a) => !a.hidden && (a.regionId ?? 'kanto') === 'kanto')
const U = {
  ash: '00000000-0000-4000-8000-000000000001', // Kanto cleared, two rebattle tiers
  misty: '00000000-0000-4000-8000-000000000002', // Kanto cleared, no rebattle yet
  gary: '00000000-0000-4000-8000-000000000003', // Kanto cleared, every tier: the Hall of Fame
  brock: '00000000-0000-4000-8000-000000000004', // a garbled rebattle count: the card is still written
}
const BOULDER = '10000000-0000-4000-8000-000000000001'

/** Kanto's block of a save: every main area cleared, a badge on the first. */
const block = () => ({
  box: [{ id: 'a', dex: 4, level: 20 }],
  team: ['a'],
  pokedex: [4],
  areaProgress: Object.fromEntries(
    MAIN.map((a, i) => [a.id, { cleared: true, gymsDefeated: i === 0 ? [BOULDER] : [] }]),
  ),
})
const save = (name: string, rebattle: unknown) => ({
  version: 1,
  player: { name, character: 'red' },
  region: 'kanto',
  ...block(),
  events: rebattle === undefined ? {} : { rebattle: { kanto: { done: rebattle, step: 1, paid: [] } } },
})

let db: PGlite

async function board(user: string | null) {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? ''])
  return (await db.query<Record<string, unknown>>('select * from leaderboard()')).rows
}

const put = (user: string, s: object) =>
  db.query(
    `insert into saves (user_id, realm, data, updated_at) values ($1, 'main', $2, now())
     on conflict (user_id, realm) do update set data = excluded.data, updated_at = excluded.updated_at`,
    [user, JSON.stringify(s)],
  )

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
  await db.exec(`
    insert into auth.users (id) values ${Object.values(U)
      .map((u) => `('${u}')`)
      .join(',')};
    insert into trainers (id, name, team, role, badge) values ('${BOULDER}', 'Brock', '[]', 'leader', 'Boulder Badge');
    insert into regions (id, name, order_index, dex_range, starters, league_area_id)
      values ('kanto', 'Kanto', 0, '[1, 151]', '[1, 4, 7]', '${LEAGUE}')
      on conflict (id) do update set league_area_id = excluded.league_area_id;
  `)
  // Ash's card is written before 0076: the migration's own pass writes it again.
  await put(U.ash, save('ASH', 2))
  await db.exec(sql('0076_leaderboard_rebattle.sql'))
  // Safe to run again.
  await db.exec(sql('0076_leaderboard_rebattle.sql'))
  await put(U.misty, save('MISTY', undefined))
  await put(U.gary, save('GARY', 4))
  await put(U.brock, save('BROCK', 'lots'))
}, 60_000)

afterAll(async () => {
  await db?.close()
})

const leagueOf = (rows: Record<string, unknown>[], name: string) =>
  (rows.find((r) => r.name === name)!.progress as Record<string, Record<string, unknown>>)[LEAGUE]

describe('0076: the Elite Rebattle on the Progression board', () => {
  it("keeps the tiers cleared on the League's entry, only above 0, and nowhere else", async () => {
    const rows = await board(null)
    expect(leagueOf(rows, 'ASH')).toEqual({ cleared: true, gyms: 0, rebattle: 2 })
    expect(leagueOf(rows, 'GARY')).toEqual({ cleared: true, gyms: 0, rebattle: 4 })
    expect(leagueOf(rows, 'MISTY')).toEqual({ cleared: true, gyms: 0 })
    // Not a number: no tiers, but the card is still there.
    expect(leagueOf(rows, 'BROCK')).toEqual({ cleared: true, gyms: 0 })
    const other = Object.entries(rows.find((r) => r.name === 'ASH')!.progress as object).filter(
      ([id]) => id !== LEAGUE,
    )
    expect(other.every(([, p]) => !('rebattle' in p))).toBe(true)
  })

  it('a tier won on the next upload moves the card', async () => {
    await put(U.misty, save('MISTY', 1))
    expect(leagueOf(await board(null), 'MISTY')).toEqual({ cleared: true, gyms: 0, rebattle: 1 })
  })

  it('the Progression board ranks them, and only every tier cleared is the Hall of Fame', async () => {
    const rows = parseLeaderboard((await board(U.ash)) as unknown as Parameters<typeof parseLeaderboard>[0])
    const { board: ranked, hall } = splitLeaderboard(rows, 'progress', data, 'kanto')
    expect(ranked.map((r) => [r.name, r.rank, r.score])).toEqual([
      ['ASH', 1, 'Elite Rebattle · Gold'],
      ['MISTY', 2, 'Elite Rebattle · Silver'],
      ['BROCK', 3, 'Elite Rebattle · Bronze'],
    ])
    expect(hall.map((r) => r.name)).toEqual(['GARY'])
  })
})
