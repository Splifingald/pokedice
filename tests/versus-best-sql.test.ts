// Migration 0097 against a real Postgres (PGlite, in process): the most trophies a player has ever held in the Versus
// league (docs/44 §10), for the trainer card. The weeks fought before it ran get their high mark from their matches; a
// trigger keeps it from then on, whatever moves the trophies; and versus_league_best() tells it to the player and their
// friends alone, while the league is open. Supabase's own pieces are stood in for at the top, as in
// versus-league-sql.test.ts.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { parseLeagueBest } from '@/lib/versusLeague'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')

const U = {
  ash: '00000000-0000-4000-8000-000000000001',
  misty: '00000000-0000-4000-8000-000000000002',
  brock: '00000000-0000-4000-8000-000000000003',
}
const LAST_WEEK = '2026-10-19'

let db: PGlite

async function as<T = Record<string, unknown>>(
  user: string | null,
  q: string,
  params: unknown[] = [],
): Promise<T[]> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? ''])
  try {
    return (await db.query<T>(q, params)).rows
  } finally {
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`)
  }
}
const access = (a: string) =>
  db.query(
    `insert into game_config (key, value) values ('versusLeague', $1) on conflict (key) do update set value = excluded.value`,
    [JSON.stringify({ access: a })],
  )
const best = async (user: string | null, of?: string) =>
  (await as<{ b: number | null }>(user, 'select versus_league_best($1) b', [of ?? null]))[0]!.b
const row = async (user: string, week?: string) =>
  (
    await db.query<{ trophies: number; best: number }>(
      `select trophies, best from versus_league_members
       where user_id = $1 and week = coalesce($2::date, versus_league_week())`,
      [user, week ?? null],
    )
  ).rows[0]
const team = (dexes: number[]) => JSON.stringify(dexes.map((dex) => ({ dex, level: 50, shiny: false })))
const moves = (n: number) => JSON.stringify(Array.from({ length: n }, () => ({ t: 'ATTACK' })))

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
    '0019_feedback.sql',
    '0025_feedback_replies.sql',
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
    '0048_message_gifts.sql',
    '0049_general_upgrades.sql',
    '0053_push.sql',
    '0064_battle_powers.sql',
    '0082_versus_league.sql',
    '0092_versus_bot_weeks.sql',
  ])
    await db.exec(sql(f))
  await db.exec(
    `insert into auth.users (id) values ${Object.values(U)
      .map((u) => `('${u}')`)
      .join(',')};`,
  )
  for (const [u, dexes] of [
    [U.ash, [25, 6, 9]],
    [U.misty, [121, 131, 130]],
    [U.brock, [95, 76, 141]],
  ] as const)
    await db.query(`insert into versus_teams (user_id, realm, team) values ($1, 'main', $2)`, [
      u,
      team([...dexes]),
    ])
  await db.query(`insert into friendships (user_a, user_b, added_by) values ($1, $2, $1)`, [U.ash, U.misty])
  await access('all')

  // Last week, fought before 0097: Ash climbed to 120 and fell back to 104; Misty's match is still a leave.
  await db.query(`select versus_league_join($1, $2::date)`, [U.ash, LAST_WEEK])
  await db.query(`select versus_league_join($1, $2::date)`, [U.misty, LAST_WEEK])
  await db.query(`update versus_league_members set trophies = 104 where user_id = $1`, [U.ash])
  await db.query(`update versus_league_members set trophies = 30 where user_id = $1`, [U.misty])
  const match = (user: string, before: number, delta: number, finished: boolean) =>
    db.query(
      `insert into versus_league_matches (week, user_id, team, foe_name, foe_team, foe_powers, seed, trophies_before,
                                          delta, outcome, finished_at)
       values ($1::date, $2, '[]', 'BLUE', '[]', '{}', 1, $3, $4, $5, $6)`,
      [
        LAST_WEEK,
        user,
        before,
        delta,
        delta > 0 ? 'won' : 'lost',
        finished ? new Date().toISOString() : null,
      ],
    )
  await match(U.ash, 100, 10, true)
  await match(U.ash, 110, 10, true)
  await match(U.ash, 120, -10, true)
  await match(U.ash, 110, -6, true)
  await match(U.misty, 42, 0, false)

  await db.exec(sql('0097_versus_best_trophies.sql'))
  // Safe to run again.
  await db.exec(sql('0097_versus_best_trophies.sql'))
})

describe('the high mark of a week', () => {
  it('comes from the matches for the weeks fought before it ran', async () => {
    expect(await row(U.ash, LAST_WEEK)).toEqual({ trophies: 104, best: 120 })
    // A match still a leave: the trophies it started from.
    expect(await row(U.misty, LAST_WEEK)).toEqual({ trophies: 30, best: 42 })
  })

  it('rises with a match won and stays when a loss takes trophies away', async () => {
    await as(U.ash, 'select * from versus_league_choices()')
    const [m] = await as<{ match_id: number }>(U.ash, 'select * from versus_league_start(1)')
    await db.query(
      `update versus_league_matches set started_at = now() - interval '5 minutes' where id = $1`,
      [m!.match_id],
    )
    await as(U.ash, 'select * from versus_league_finish($1, $2, $3, $4, $5)', [
      m!.match_id,
      'won',
      3,
      0,
      moves(10),
    ])
    expect(await row(U.ash)).toEqual({ trophies: 10, best: 10 })
    await db.query(
      `update versus_league_members set trophies = 4 where user_id = $1 and week = versus_league_week()`,
      [U.ash],
    )
    expect(await row(U.ash)).toEqual({ trophies: 4, best: 10 })
  })

  it('never goes below the trophies, even written lower', async () => {
    await db.query(
      `update versus_league_members set best = 0 where user_id = $1 and week = versus_league_week()`,
      [U.ash],
    )
    expect((await row(U.ash))!.best).toBe(4)
  })
})

describe('versus_league_best', () => {
  it('is the best of every week, this one included', async () => {
    expect(await best(U.ash)).toBe(120)
    await db.query(
      `update versus_league_members set trophies = 133 where user_id = $1 and week = versus_league_week()`,
      [U.ash],
    )
    expect(await best(U.ash)).toBe(133)
  })

  it('is 0 for a player who never fought', async () => {
    expect(await best(U.brock)).toBe(0)
  })

  it("tells a friend's, and nobody else's", async () => {
    expect(await best(U.misty, U.ash)).toBe(133)
    expect(await best(U.ash, U.misty)).toBe(42)
    expect(await best(U.brock, U.ash)).toBeNull()
    expect(await best(null, U.ash)).toBeNull()
    expect(await best(null)).toBeNull()
  })

  it('says nothing while the league is closed', async () => {
    await access('off')
    expect(await best(U.ash)).toBeNull()
    await access('admin')
    expect(await best(U.ash)).toBeNull()
    await access('all')
  })

  it('is read as a count, or nothing', () => {
    expect(parseLeagueBest(133)).toBe(133)
    expect(parseLeagueBest('42')).toBe(42)
    expect(parseLeagueBest(null)).toBeNull()
    expect(parseLeagueBest('nope')).toBeNull()
  })
})
