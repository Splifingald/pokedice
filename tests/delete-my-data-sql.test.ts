// Migration 0037 against a real Postgres (PGlite, in process): Settings → Delete all my data deletes every row the game
// keeps about the caller, and nobody else's. Supabase's own pieces (the auth schema, the anon / authenticated roles)
// are stood in for at the top, as in friends-sql.test.ts.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')

const U = {
  ash: '00000000-0000-4000-8000-000000000001',
  misty: '00000000-0000-4000-8000-000000000002',
}

const save = (name: string) => ({
  version: 1,
  player: { name, character: 'red' },
  box: [{ id: 'a', dex: 25, level: 12 }],
  team: ['a'],
  pokedex: [25],
  currentAreaId: 'route-1',
  areaProgress: { 'route-1': { cleared: true, gymsDefeated: [] } },
})

let db: PGlite

async function as<T = Record<string, unknown>>(user: string | null, q: string, params: unknown[] = []): Promise<T[]> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? ''])
  return (await db.query<T>(q, params)).rows
}

/** Every row each table holds about `user`. */
async function rowsOf(user: string) {
  const count = async (q: string) => Number((await db.query<{ n: number }>(q, [user])).rows[0]!.n)
  return {
    saves: await count('select count(*) n from saves where user_id = $1'),
    cards: await count('select count(*) n from player_cards where user_id = $1'),
    cardRegions: await count('select count(*) n from player_card_regions where user_id = $1'),
    friendCode: await count('select count(*) n from friend_codes where user_id = $1'),
    friendships: await count('select count(*) n from friendships where user_a = $1 or user_b = $1'),
    friendAttempts: await count('select count(*) n from friend_attempts where actor = $1::text'),
    versusTeam: await count('select count(*) n from versus_teams where user_id = $1'),
    versusFights: await count('select count(*) n from versus_battles where attacker_id = $1 or defender_id = $1'),
    eventState: await count('select count(*) n from event_state where user_id = $1'),
    raidTeam: await count('select count(*) n from raid_teams where user_id = $1'),
    raidGifts: await count('select count(*) n from raid_gifts where helper_id = $1 or raider_id = $1'),
  }
}

/** A player with something in every table, and a friendship, a fight and a raid gift with the other one. */
async function fill(user: string, other: string, code: string) {
  await db.query('insert into saves (user_id, data) values ($1, $2)', [user, JSON.stringify(save(user === U.ash ? 'Ash' : 'Misty'))])
  await db.query('insert into friend_codes (user_id, code) values ($1, $2)', [user, code])
  await db.query('insert into friend_attempts (actor) values ($1::text)', [user])
  await db.query(`insert into versus_teams (user_id, team) values ($1, '[{"dex":1,"level":50}]')`, [user])
  await db.query('insert into versus_battles (attacker_id, defender_id, defender_version, seed, won) values ($1, $2, 1, 7, true)', [user, other])
  await db.query('insert into event_state (user_id) values ($1)', [user])
  await db.query(`insert into raid_teams (user_id, team) values ($1, '[{"dex":1,"level":30}]')`, [user])
  await db.query(`insert into raid_gifts (helper_id, raider_id, raider_name, dex, item_key) values ($1, $2, 'x', 150, 'rare-candy')`, [user, other])
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
    '0037_delete_my_data.sql',
  ])
    await db.exec(sql(f))
  // Run twice: the migration must stay safe to run again.
  await db.exec(sql('0037_delete_my_data.sql'))
  await db.exec(`insert into auth.users (id) values ('${U.ash}'), ('${U.misty}')`)
  await fill(U.ash, U.misty, 'AAAAAAAA')
  await fill(U.misty, U.ash, 'BBBBBBBB')
  await db.query('insert into friendships (user_a, user_b, added_by) values ($1, $2, $1)', [U.ash, U.misty])
  await db.query('insert into leaderboard_bans (user_id) values ($1)', [U.ash])
}, 60_000)

describe('0037: delete_my_data', () => {
  it('needs a signed-in player', async () => {
    await expect(as(null, 'select delete_my_data()')).rejects.toThrow(/signed_out/)
  })

  it("deletes every row about the caller, the ones shared with others too, and keeps the other player's own", async () => {
    // The save made the trainer card, through the trigger on saves.
    expect(await rowsOf(U.ash)).toEqual({
      saves: 1,
      cards: 1,
      cardRegions: 1,
      friendCode: 1,
      friendships: 1,
      friendAttempts: 1,
      versusTeam: 1,
      versusFights: 2,
      eventState: 1,
      raidTeam: 1,
      raidGifts: 2,
    })

    await as(U.ash, 'select delete_my_data()')

    expect(Object.values(await rowsOf(U.ash)).every((n) => n === 0)).toBe(true)
    // Misty keeps everything of her own; what she shared with Ash (the friendship, their fights, the gifts) is gone.
    expect(await rowsOf(U.misty)).toEqual({
      saves: 1,
      cards: 1,
      cardRegions: 1,
      friendCode: 1,
      friendships: 0,
      friendAttempts: 1,
      versusTeam: 1,
      versusFights: 0,
      eventState: 1,
      raidTeam: 1,
      raidGifts: 0,
    })
  })

  it("keeps the account, and the admin's ban", async () => {
    expect((await db.query('select 1 from auth.users where id = $1', [U.ash])).rows).toHaveLength(1)
    expect((await db.query('select 1 from leaderboard_bans where user_id = $1', [U.ash])).rows).toHaveLength(1)
  })

  it('is open to signed-in players only', async () => {
    const grants = await db.query<{ anon: boolean; authed: boolean }>(
      `select has_function_privilege('anon', 'delete_my_data()', 'execute') anon,
              has_function_privilege('authenticated', 'delete_my_data()', 'execute') authed`,
    )
    expect(grants.rows[0]).toEqual({ anon: false, authed: true })
  })
})
