// Migration 0061 against a real Postgres (PGlite, in process): a trade says who it was with (trade_take, trade_mine),
// and the other trainer's card opens for a trade partner, who can then be added as a friend without a code; nobody
// else, and not while Trades is off. Supabase's own pieces (the auth schema, the anon / authenticated roles) are stood
// in for at the top, as in general-sql.test.ts.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')

const U = {
  ash: '00000000-0000-4000-8000-000000000001', // took Misty's listing
  misty: '00000000-0000-4000-8000-000000000002', // her listing was taken
  brock: '00000000-0000-4000-8000-000000000003', // never traded with either
}
const T = { boulder: '10000000-0000-4000-8000-000000000001', cascade: '10000000-0000-4000-8000-000000000002' }
const LEAGUE = '20000000-0000-4000-8000-000000000001'

const save = (name: string) => ({
  version: 1,
  player: { name, character: 'red' },
  box: [
    { id: 'a', dex: 4, level: 20 },
    { id: 'b', dex: 7, level: 20 },
    { id: 'c', dex: 1, level: 20 },
  ],
  team: ['a', 'b', 'c'],
  pokedex: [1, 4, 7],
  currentAreaId: 'route-1',
  areaProgress: { 'route-1': { cleared: true, gymsDefeated: [T.boulder, T.cascade] } },
})

let db: PGlite

async function as<T = Record<string, unknown>>(
  user: string | null,
  q: string,
  params: unknown[] = [],
): Promise<T[]> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? ''])
  return (await db.query<T>(q, params)).rows
}
const setTrade = (patch: Record<string, unknown>) =>
  db.query(`update game_config set value = value || $1::jsonb where key = 'trade'`, [JSON.stringify(patch)])
const profile = (me: string, them: string) =>
  as<{ user_id: string; name: string; since: string | null }>(
    me,
    'select user_id, name, since from friend_profile($1)',
    [them],
  )
const addPartner = async (me: string, them: string) =>
  (
    await as<{ status: string; user_id: string | null; name: string | null }>(
      me,
      'select * from friend_add_partner($1)',
      [them],
    )
  )[0]!

let took: Record<string, unknown>

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$
      select jsonb_strip_nulls(jsonb_build_object('email', nullif(current_setting('request.jwt.claim.email', true), ''))) $$;
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
    '0061_trade_partners.sql',
  ])
    await db.exec(sql(f))
  // Safe to run again.
  await db.exec(sql('0061_trade_partners.sql'))

  await db.exec(`
    insert into auth.users (id) values ${Object.values(U)
      .map((u) => `('${u}')`)
      .join(',')};
    insert into regions (id, name, order_index, dex_range, starters, league_area_id, next_region) values
      ('kanto', 'Kanto', 1, '[1,151]', '[1,4,7]', '${LEAGUE}', null);
    insert into trainers (id, name, team, role, badge) values
      ('${T.boulder}', 'Brock', '[]', 'leader', 'Boulder Badge'),
      ('${T.cascade}', 'Misty', '[]', 'leader', 'Cascade Badge');
  `)
  for (const [u, name] of [
    [U.ash, 'ASH'],
    [U.misty, 'MISTY'],
    [U.brock, 'BROCK'],
  ] as const) {
    await db.query(`insert into saves (user_id, realm, data, updated_at) values ($1, 'main', $2, now())`, [
      u,
      JSON.stringify(save(name)),
    ])
  }
  await setTrade({ access: 'all' })
  const [{ r: listing }] = (await as<{ r: { code: string } }>(
    U.misty,
    `select trade_post('a', '{"kind":"any"}', 'public', '{"regions":["kanto"]}') r`,
  )) as [{ r: { code: string } }]
  took = (
    await as<{ r: Record<string, unknown> }>(U.ash, 'select trade_take($1, $2) r', [listing.code, 'b'])
  )[0]!.r
}, 60_000)

afterAll(async () => {
  await db?.close()
})

describe('0061: who the trade was with', () => {
  it('trade_take says the poster', () => {
    expect(took).toMatchObject({ with: 'MISTY', withId: U.misty })
  })

  it('trade_mine says the other side, both ways', async () => {
    const mine = async (u: string) =>
      (await as<{ r: { with: string; withId: string } }>(u, 'select trade_mine() r'))[0]!.r
    expect(await mine(U.misty)).toMatchObject({ with: 'ASH', withId: U.ash })
    expect(await mine(U.ash)).toMatchObject({ with: 'MISTY', withId: U.misty })
  })
})

describe('0061: a trade partner’s card, and adding them', () => {
  it('opens for a trade partner, not a friend yet; not for anyone else', async () => {
    expect(await profile(U.ash, U.misty)).toEqual([{ user_id: U.misty, name: 'MISTY', since: null }])
    expect(await profile(U.misty, U.ash)).toEqual([{ user_id: U.ash, name: 'ASH', since: null }])
    expect(await profile(U.ash, U.brock)).toEqual([])
  })

  it('stays shut while Trades is off for the caller', async () => {
    await setTrade({ access: 'admin' })
    expect(await profile(U.ash, U.misty)).toEqual([])
    expect((await addPartner(U.ash, U.misty)).status).toBe('not_found')
    await setTrade({ access: 'all' })
  })

  it('adds nobody but a trade partner', async () => {
    expect((await addPartner(U.ash, U.brock)).status).toBe('not_found')
    expect((await addPartner(U.ash, U.ash)).status).toBe('self')
    expect(await as(null, 'select * from friendships')).toEqual([])
  })

  it('adds a trade partner at once: friends both ways, the other side told', async () => {
    expect(await addPartner(U.ash, U.misty)).toMatchObject({
      status: 'added',
      user_id: U.misty,
      name: 'MISTY',
    })
    expect((await addPartner(U.misty, U.ash)).status).toBe('already')
    // Misty hasn't seen her new friend yet: friend_status brings the toast.
    const [st] = await as<{ unseen: { id: string }[] }>(U.misty, 'select unseen from friend_status()')
    expect(st!.unseen.map((u) => u.id)).toEqual([U.ash])
    const [card] = await profile(U.ash, U.misty)
    expect(card!.since).not.toBeNull()
  })

  it('is for signed-in players only', async () => {
    const grants = await as<{ grantee: string }>(
      null,
      `select grantee from information_schema.routine_privileges
       where routine_name = 'friend_add_partner' and privilege_type = 'EXECUTE' order by grantee`,
    )
    expect(grants.map((g) => g.grantee)).not.toContain('anon')
    expect(grants.map((g) => g.grantee)).not.toContain('PUBLIC')
  })
})
