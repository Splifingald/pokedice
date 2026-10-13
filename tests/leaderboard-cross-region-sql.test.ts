// Migration 0053 against a real Postgres (PGlite, in process): leaderboard() keeps one row per boarded region, marks
// one per trainer as their lead (the region they play now, else the first boarded one), and sends the shinies they own
// over every region. Supabase's own pieces are stood in for at the top, as in general-sql.test.ts.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseLeaderboard, splitLeaderboard } from '@/lib/leaderboard'
import { data } from './fixtures'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')

const U = {
  ash: '00000000-0000-4000-8000-000000000001', // plays Johto, boarded in Kanto and Johto
  misty: '00000000-0000-4000-8000-000000000002', // plays Johto, boarded in Kanto only
  brock: '00000000-0000-4000-8000-000000000003', // Kanto only
}
const T = { boulder: '10000000-0000-4000-8000-000000000001', zephyr: '10000000-0000-4000-8000-000000000002' }

/** A region's block of a save: `shinies` of its Box shiny, a badge from `gym` if one is given. */
const block = (shinies: number, gym?: string) => ({
  box: [
    { id: 'a', dex: 4, level: 20, shiny: shinies > 0 },
    { id: 'b', dex: 7, level: 20, shiny: shinies > 1 },
    { id: 'c', dex: 1, level: 20, shiny: shinies > 2 },
  ],
  team: ['a'],
  pokedex: [1, 4, 7],
  areaProgress: gym ? { 'route-1': { cleared: true, gymsDefeated: [gym] } } : {},
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
    '0053_leaderboard_cross_region.sql',
  ])
    await db.exec(sql(f))
  // Safe to run again.
  await db.exec(sql('0053_leaderboard_cross_region.sql'))
  await db.exec(`
    insert into auth.users (id) values ${Object.values(U)
      .map((u) => `('${u}')`)
      .join(',')};
    insert into trainers (id, name, team, role, badge) values
      ('${T.boulder}', 'Brock', '[]', 'leader', 'Boulder Badge'),
      ('${T.zephyr}', 'Falkner', '[]', 'leader', 'Zephyr Badge');
  `)
  const put = (user: string, s: object) =>
    db.query(`insert into saves (user_id, realm, data, updated_at) values ($1, 'main', $2, now())`, [
      user,
      JSON.stringify(s),
    ])
  await put(U.ash, save('ASH', 'johto', block(1, T.zephyr), { kanto: block(2, T.boulder) }))
  // Misty's Johto has no badge yet: she isn't on its board, but her shinies there still count.
  await put(U.misty, save('MISTY', 'johto', block(3), { kanto: block(1, T.boulder) }))
  await put(U.brock, save('BROCK', 'kanto', block(2, T.boulder), {}))
  await db.exec(`insert into event_state (user_id, realm, raids_won) values ('${U.ash}', 'main', 4)`)
}, 60_000)

afterAll(async () => {
  await db?.close()
})

describe('0053: the cross-region boards', () => {
  it('keeps one row per boarded region, one of them the lead, with the shinies of every region', async () => {
    const rows = (await board(null)).map((r) => [
      r.name,
      r.region,
      r.lead,
      r.shinies,
      r.shinies_all,
      r.raids_won,
    ])
    expect(rows.sort((a, b) => `${a[0]}${a[1]}`.localeCompare(`${b[0]}${b[1]}`))).toEqual([
      ['ASH', 'johto', true, 1, 3, 4],
      ['ASH', 'kanto', false, 2, 3, 4],
      ['BROCK', 'kanto', true, 2, 2, 0],
      // Johto, the region she plays, isn't boarded: her lead is the region she is on a board in.
      ['MISTY', 'kanto', true, 1, 4, 0],
    ])
  })

  it('ranks each trainer once on Shiny and Raids, and per region on the others', async () => {
    const rows = parseLeaderboard((await board(U.ash)) as unknown as Parameters<typeof parseLeaderboard>[0])
    const names = (tab: 'shiny' | 'raids' | 'level', region: string) =>
      splitLeaderboard(rows, tab, data, region).board.map((r) => [r.name, r.rank, r.isMe])
    // The same board from Kanto and from Johto.
    for (const region of ['kanto', 'johto']) {
      expect(names('shiny', region)).toEqual([
        ['MISTY', 1, false],
        ['ASH', 2, true],
        ['BROCK', 3, false],
      ])
      expect(names('raids', region).map(([n]) => n)).toEqual(['ASH', 'BROCK', 'MISTY'])
    }
    expect(names('level', 'kanto')).toHaveLength(3)
    expect(names('level', 'johto')).toEqual([['ASH', 1, true]])
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
