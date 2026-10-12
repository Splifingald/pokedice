// Migration 0039 against a real Postgres (PGlite, in process): Extreme mode's world of its own. Each player can have a
// main and an Extreme save; friends are the same people in both, but everything shown of them, and every board, comes
// from the realm asked for. Supabase's own pieces (the auth schema, the anon / authenticated roles) are stood in for at
// the top, as in friends-sql.test.ts.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')

const U = {
  ash: '00000000-0000-4000-8000-000000000001', // main and Extreme
  misty: '00000000-0000-4000-8000-000000000002', // main only
  brock: '00000000-0000-4000-8000-000000000003', // Extreme only
}
const BOULDER = '10000000-0000-4000-8000-000000000001'
const LEAGUE = '20000000-0000-4000-8000-000000000001'

const save = (name: string, level = 55) => ({
  version: 1,
  player: { name, character: 'red' },
  box: [
    { id: 'a', dex: 4, level },
    { id: 'b', dex: 7, level },
    { id: 'c', dex: 1, level },
  ],
  team: ['a', 'b', 'c'],
  pokedex: [1, 4, 7],
  currentAreaId: 'route-1',
  areaProgress: { 'route-1': { cleared: true, gymsDefeated: [BOULDER] }, [LEAGUE]: { cleared: false, gymsDefeated: [] } },
})

let db: PGlite

async function as<T = Record<string, unknown>>(user: string | null, q: string, params: unknown[] = []): Promise<T[]> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? ''])
  return (await db.query<T>(q, params)).rows
}

async function putSave(user: string, realm: 'main' | 'extreme', data: unknown) {
  await db.query(
    `insert into saves (user_id, realm, data, updated_at) values ($1, $2, $3, now())
     on conflict (user_id, realm) do update set data = excluded.data, updated_at = excluded.updated_at`,
    [user, realm, JSON.stringify(data)],
  )
}

const names = (rows: { name: string }[]) => rows.map((r) => r.name).sort()

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
  ])
    await db.exec(sql(f))
  await db.exec(`
    insert into auth.users (id) values ${Object.values(U).map((u) => `('${u}')`).join(',')};
    insert into regions (id, name, order_index, dex_range, starters, league_area_id, next_region) values
      ('kanto', 'Kanto', 1, '[1,151]', '[1,4,7]', '${LEAGUE}', null);
    insert into trainers (id, name, team, role, badge) values ('${BOULDER}', 'Brock', '[]', 'leader', 'Boulder Badge');
    -- The wheel is off by default (0035): on for everyone here.
    insert into game_config (key, value) values ('events', '{"wheel": {"access": "all"}}');
  `)
  // Misty's main save is there before the migration: it must stay hers, as her main one.
  await db.query(`insert into saves (user_id, data) values ($1, $2)`, [U.misty, JSON.stringify(save('MISTY'))])
  await db.exec(sql('0039_extreme_realm.sql'))
  // Run twice: the migration must stay safe to run again.
  await db.exec(sql('0039_extreme_realm.sql'))

  await putSave(U.ash, 'main', save('ASH'))
  await putSave(U.ash, 'extreme', save('ASH-X'))
  await putSave(U.brock, 'extreme', save('BROCK-X'))
  await db.exec(`
    insert into friendships (user_a, user_b, added_by) values ('${U.ash}', '${U.misty}', '${U.ash}'), ('${U.ash}', '${U.brock}', '${U.ash}');
  `)
}, 60_000)

describe('0039: two saves, two worlds', () => {
  it('keeps a save per realm, the old ones as main, and a card for each', async () => {
    const rows = await db.query<{ user_id: string; realm: string }>('select user_id, realm from saves order by user_id, realm')
    expect(rows.rows).toEqual([
      { user_id: U.ash, realm: 'extreme' },
      { user_id: U.ash, realm: 'main' },
      { user_id: U.misty, realm: 'main' },
      { user_id: U.brock, realm: 'extreme' },
    ])
    const cards = await db.query<{ name: string; realm: string }>(
      `select name, realm from player_cards where user_id = $1 order by realm`,
      [U.ash],
    )
    expect(cards.rows).toEqual([
      { name: 'ASH-X', realm: 'extreme' },
      { name: 'ASH', realm: 'main' },
    ])
    await expect(db.query(`insert into saves (user_id, realm, data) values ($1, 'hard', '{}')`, [U.misty])).rejects.toThrow()
  })

  it('a leaderboard per realm; the old call is the main one', async () => {
    expect(names(await as(U.ash, 'select * from leaderboard()'))).toEqual(['ASH', 'MISTY'])
    expect(names(await as(U.ash, `select * from leaderboard('main')`))).toEqual(['ASH', 'MISTY'])
    expect(names(await as(U.ash, `select * from leaderboard('extreme')`))).toEqual(['ASH-X', 'BROCK-X'])
  })

  it('the same friends in both worlds, each seen in the realm asked for', async () => {
    type Row = { user_id: string; name: string; in_realm: boolean; max_level: number }
    const main = await as<Row>(U.ash, `select * from friend_list('main')`)
    const extreme = await as<Row>(U.ash, `select * from friend_list('extreme')`)
    const pick = (rows: Row[]) =>
      Object.fromEntries(rows.map((r) => [r.user_id, { name: r.name, in: r.in_realm, lv: r.max_level }]))
    // Misty has no Extreme save: listed there with her main name and look, and nothing else.
    expect(pick(extreme)).toEqual({ [U.misty]: { name: 'MISTY', in: false, lv: 0 }, [U.brock]: { name: 'BROCK-X', in: true, lv: 55 } })
    expect(pick(main)).toEqual({ [U.misty]: { name: 'MISTY', in: true, lv: 55 }, [U.brock]: { name: 'Trainer', in: false, lv: 0 } })

    const [mistyX] = await as<{ in_realm: boolean; regions: unknown[] }>(U.ash, `select * from friend_profile($1, 'extreme')`, [U.misty])
    expect(mistyX).toMatchObject({ in_realm: false, regions: [] })
    const [brockX] = await as<{ name: string; regions: unknown[] }>(U.ash, `select * from friend_profile($1, 'extreme')`, [U.brock])
    expect(brockX!.name).toBe('BROCK-X')
    expect(brockX!.regions).toHaveLength(1)
  })

  it('Versus teams and fights stay in their world', async () => {
    expect(await as(U.ash, `select versus_set_team(array['a','b','c'], 'extreme') v`)).toEqual([{ v: 1 }])
    expect(await as(U.brock, `select versus_set_team(array['a','b','c'], 'extreme') v`)).toEqual([{ v: 1 }])
    // Brock has no main save, so no main team.
    await expect(as(U.brock, `select versus_set_team(array['a','b','c'])`)).rejects.toThrow(/versus_no_save/)
    expect(await as(U.misty, `select * from versus_board('extreme')`)).toHaveLength(2)
    expect(await as(U.misty, 'select * from versus_board()')).toHaveLength(0)

    await as(U.ash, `select versus_record($1, 1, 7, true, 'extreme')`, [U.brock])
    await expect(as(U.ash, `select versus_record($1, 1, 7, true, 'extreme')`, [U.brock])).rejects.toThrow(/versus_already_won/)
    // In the main world Brock has no team at all.
    await expect(as(U.ash, `select versus_record($1, 1, 7, true)`, [U.brock])).rejects.toThrow(/versus_no_team/)
  })

  it('one Fortune Wheel spin a day in each world', async () => {
    const spin = async (realm: string) => (await as<{ s: { fresh: boolean } }>(U.ash, `select wheel_spin('${realm}') s`))[0]!.s
    expect((await spin('main')).fresh).toBe(true)
    expect((await spin('extreme')).fresh).toBe(true)
    expect((await spin('extreme')).fresh).toBe(false)
  })

  it('raid teams, helpers and gifts are per world', async () => {
    await as(U.brock, `select raid_set_team(array['a'], 'extreme')`)
    expect(await as(U.ash, `select user_id from raid_friend_teams('extreme')`)).toEqual([{ user_id: U.brock }])
    expect(await as(U.ash, 'select user_id from raid_friend_teams()')).toEqual([])
  })

  it("re-running seed.sql's schema part (0016, 0033–0035, 0039, then 0040) ends on the realm versions only", async () => {
    for (const f of [
      '0016_regions.sql',
      '0033_friends.sql',
      '0034_day_care.sql',
      '0035_events.sql',
      '0039_extreme_realm.sql',
      '0040_lighter_save_writes.sql',
    ])
      await db.exec(sql(f))
    const overloads = await db.query<{ proname: string; n: number }>(
      `select proname, count(*)::int n from pg_proc
       where proname in ('leaderboard', 'friend_list', 'friend_status', 'wheel_spin', 'raid_close', 'player_card_write', 'versus_board',
                         'friend_profile', 'friend_day_cares', 'raid_friend_teams')
       group by proname order by proname`,
    )
    expect(overloads.rows).toHaveLength(10)
    expect(overloads.rows.every((r) => r.n === 1)).toBe(true)
    expect(names(await as(U.ash, `select * from leaderboard('extreme')`))).toEqual(['ASH-X', 'BROCK-X'])
    // The card trigger writes each save's own realm again.
    await putSave(U.brock, 'extreme', save('BROCK-X2'))
    expect(names(await as(U.ash, `select * from leaderboard('extreme')`))).toEqual(['ASH-X', 'BROCK-X2'])
    expect(names(await as(U.ash, 'select * from leaderboard()'))).toEqual(['ASH', 'MISTY'])
  })

  it('Delete my Extreme save takes that world only; Delete all my data takes everything', async () => {
    await as(U.ash, `select delete_my_data('extreme')`)
    const left = await db.query<{ realm: string }>('select realm from saves where user_id = $1', [U.ash])
    expect(left.rows).toEqual([{ realm: 'main' }])
    expect(await as(U.ash, `select * from leaderboard('extreme')`)).toHaveLength(1) // Brock's
    expect((await db.query('select 1 from versus_teams where user_id = $1', [U.ash])).rows).toHaveLength(0)
    expect((await db.query('select 1 from friendships where user_a = $1 or user_b = $1', [U.ash])).rows).toHaveLength(2)
    await expect(as(U.ash, `select delete_my_data('hard')`)).rejects.toThrow(/bad_realm/)

    await as(U.ash, 'select delete_my_data()')
    expect((await db.query('select 1 from saves where user_id = $1', [U.ash])).rows).toHaveLength(0)
    expect((await db.query('select 1 from friendships where user_a = $1 or user_b = $1', [U.ash])).rows).toHaveLength(0)
  })
})
