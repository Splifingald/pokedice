// Migration 0087 against a real Postgres (PGlite, in process): Extreme mode's runs on the cards, timed by the server
// as well as by the save, and extreme_board() with its ranking (src/lib/extremeBoard.ts). Supabase's own pieces are
// stood in for at the top, as in leaderboard-rebattle-sql.test.ts.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { leagueArea } from '@/engine'
import { parseExtremeBoard, rankExtremeBoard } from '@/lib/extremeBoard'
import { data } from './fixtures'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')

const LEAGUE = leagueArea(data, 'kanto')!.id
const U = {
  ash: '00000000-0000-4000-8000-000000000001',
  misty: '00000000-0000-4000-8000-000000000002',
  gary: '00000000-0000-4000-8000-000000000003',
  brock: '00000000-0000-4000-8000-000000000004',
}
const BOULDER = '10000000-0000-4000-8000-000000000001'
const H = 3_600_000

/** An Extreme save holding Kanto's run: its League won or not, the run's start and end the save claims. */
function save(name: string, run: object, won: boolean, badge = true) {
  return {
    version: 1,
    mode: 'extreme',
    player: { name, character: 'red' },
    region: 'kanto',
    box: [{ id: 'a', dex: 4, level: 20 }],
    team: ['a'],
    pokedex: [4],
    areaProgress: {
      [LEAGUE]: { cleared: won, gymsDefeated: badge ? [BOULDER] : [] },
    },
    extreme: { runs: { kanto: run } },
  }
}

let db: PGlite

const put = (user: string, s: object, realm = 'extreme', ago = 0) =>
  db.query(
    `insert into saves (user_id, realm, data, updated_at) values ($1, $2, $3, now() - make_interval(secs => $4))
     on conflict (user_id, realm) do update set data = excluded.data, updated_at = excluded.updated_at`,
    [user, realm, JSON.stringify(s), ago / 1000],
  )

async function board(user: string | null) {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? ''])
  return parseExtremeBoard(
    (await db.query('select * from extreme_board()')).rows as Parameters<typeof parseExtremeBoard>[0],
  )
}
const card = async (user: string) =>
  (
    await db.query<Record<string, unknown>>(
      `select run_id, best_ms::float8 as best, run_won is not null as won from player_card_regions
       where user_id = $1 and realm = 'extreme' and region = 'kanto'`,
      [user],
    )
  ).rows[0]

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
    '0078_leaderboard_rebattle.sql',
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
    insert into game_config (key, value) values ('extreme', '{"access": "all", "unlockRegion": "johto"}')
      on conflict (key) do update set value = excluded.value;
  `)
  await db.exec(sql('0087_extreme_speedrun.sql'))
  // Safe to run again.
  await db.exec(sql('0087_extreme_speedrun.sql'))
}, 60_000)

afterAll(async () => {
  await db?.close()
})

describe('0087: Extreme mode as a speedrun', () => {
  it('moves the unlock from Johto to Kanto', async () => {
    const v = (
      await db.query<{ v: { unlockRegion: string } }>(`select value v from game_config where key = 'extreme'`)
    ).rows[0]!.v
    expect(v.unlockRegion).toBe('kanto')
  })

  it('a run going is on the board; its League won, its time is the best', async () => {
    await put(U.ash, save('ASH', { id: 'r1', startedAt: 0 }, false))
    expect(await card(U.ash)).toMatchObject({ run_id: 'r1', best: null, won: false })
    let rows = await board(U.ash)
    expect(rows.find((r) => r.name === 'ASH')).toMatchObject({
      running: true,
      bestMs: null,
      badges: 1,
      isMe: true,
    })

    await put(U.ash, save('ASH', { id: 'r1', startedAt: 0, finishedAt: 5 * H, best: 5 * H }, true))
    expect(await card(U.ash)).toMatchObject({ run_id: 'r1', best: 5 * H, won: true })
    // The same run uploaded again changes nothing.
    await put(U.ash, save('ASH', { id: 'r1', startedAt: 0, finishedAt: 4 * H }, true))
    expect((await card(U.ash))!.best).toBe(5 * H)

    // A restart: the run starts over on the server too; the best time stays.
    await put(U.ash, save('ASH', { id: 'r2', startedAt: 10 * H, best: 5 * H }, false))
    expect(await card(U.ash)).toMatchObject({ run_id: 'r2', best: 5 * H, won: false })
    rows = await board(null)
    expect(rows.find((r) => r.name === 'ASH')).toMatchObject({ running: true, bestMs: 5 * H })
  })

  it("a save can't claim a faster run than the server watched go by", async () => {
    // First seen two hours ago; it claims to have taken a minute.
    await put(U.misty, save('MISTY', { id: 'm1', startedAt: 0 }, false), 'extreme', 2 * H)
    await put(U.misty, save('MISTY', { id: 'm1', startedAt: 0, finishedAt: 60_000 }, true))
    const best = (await card(U.misty))!.best as number
    expect(best).toBeGreaterThanOrEqual(2 * H - 5_000)
    expect(best).toBeLessThan(2 * H + 60_000)
  })

  it('a League won before the runs (untimed) has no time', async () => {
    await put(U.gary, save('GARY', { id: 'g1', startedAt: 0, finishedAt: 0, untimed: true }, true))
    expect(await card(U.gary)).toMatchObject({ best: null, won: true })
    expect((await board(null)).some((r) => r.name === 'GARY')).toBe(false)
  })

  it('a main save writes no run', async () => {
    await put(U.brock, save('BROCK', { id: 'b1', startedAt: 0, finishedAt: H }, true), 'main')
    const row = (
      await db.query(`select run_id from player_card_regions where user_id = $1 and realm = 'main'`, [
        U.brock,
      ])
    ).rows[0] as { run_id: string | null }
    expect(row.run_id).toBeNull()
    expect((await board(null)).some((r) => r.name === 'BROCK')).toBe(false)
  })

  it('ranks the best times first, then the runs going by badges', async () => {
    await put(U.brock, save('BROCK', { id: 'b2', startedAt: 0 }, false, false))
    const ranked = rankExtremeBoard(await board(null), 'kanto')
    expect(ranked.map((r) => [r.name, r.rank])).toEqual([
      ['MISTY', 1],
      ['ASH', 2],
      ['BROCK', 3],
    ])
  })

  it('is inlined in seed.sql', () => {
    const seed = readFileSync(path.join(MIG, '..', 'seed.sql'), 'utf8')
    expect(seed).toContain(
      '-- ↓ supabase/migrations/0087_extreme_speedrun.sql, inlined so this file stands alone.',
    )
  })
})
