// Migrations 0144 and 0146 against a real Postgres (PGlite, in process): players online (docs/70). No switch (the first
// version's row and function go); each player (the account, else the device) counts once, for 6 minutes; a hand-made
// device id counts as nobody. The list: each one's card (name, look, team) as sent, up to 30, the closest in badges to
// the caller (never shown), most badges first, the caller marked, friends marked. The invite: offered to an account the
// caller can ask (signed in, not a friend, both lists with room), "sent" once asked; a friend request the Friends page
// answers, or friends at once when they had asked. Supabase's own pieces (the auth schema, the roles) are stood in for
// at the top, as in area-versus-sql.test.ts.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')

const ASH = '00000000-0000-4000-8000-000000000001'
const MISTY = '00000000-0000-4000-8000-000000000002'
const BROCK = '00000000-0000-4000-8000-000000000003'

let db: PGlite

async function as(user: string | null) {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? ''])
  await db.query(`select set_config('request.jwt.claim.email', $1, false)`, [''])
}
/** A ping from a build before the list: the device id alone. */
async function ping(user: string | null, device: string | null = 'dev-1'): Promise<number | null> {
  await as(user)
  return (await db.query<{ n: number | null }>(`select online_ping($1) as n`, [device])).rows[0]!.n
}
const TEAM = [{ dex: 6, level: 52, shiny: true }, { dex: 25, level: 50 }]
/** A ping from this build: the device id and the card. */
async function card(
  user: string | null,
  device: string,
  name: string | null,
  badges: number | null,
  o: { look?: string; team?: unknown } = {},
) {
  await as(user)
  return (
    await db.query<{ n: number }>(`select online_ping($1, $2, $3, $4, $5::jsonb) as n`, [
      device,
      name,
      o.look ?? 'red',
      badges,
      JSON.stringify(o.team ?? TEAM),
    ])
  ).rows[0]!.n
}
interface Row {
  name: string
  look: string | null
  team: { dex: number; level: number; shiny?: boolean }[]
  me: boolean
  friend: boolean
  invite: 'yes' | 'sent' | null
  id: string | null
}
async function list(user: string | null, device = 'dev-1'): Promise<Row[]> {
  await as(user)
  return (await db.query<{ r: Row[] }>(`select online_players($1) as r`, [device])).rows[0]!.r
}
const row = async (user: string | null, name: string) => (await list(user)).find((p) => p.name === name)!
async function invite(user: string, to: string): Promise<string> {
  await as(user)
  return (await db.query<{ r: string }>(`select online_invite($1) as r`, [to])).rows[0]!.r
}
const rows = async () => (await db.query<{ n: number }>(`select count(*)::int as n from online_here`)).rows[0]!.n
const friends = async (a: string, b: string) =>
  (
    await db.query(`select 1 from friendships where user_a = least($1::uuid, $2::uuid) and user_b = greatest($1::uuid, $2::uuid)`, [
      a,
      b,
    ])
  ).rows.length > 0
const befriend = (a: string, b: string) =>
  db.query(`insert into friendships (user_a, user_b, added_by) values (least($1::uuid, $2::uuid), greatest($1::uuid, $2::uuid), $1)`, [
    a,
    b,
  ])

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
  // What friend requests stand on (0099), as in area-versus-sql.test.ts.
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
    '0099_area_versus.sql',
  ])
    await db.exec(sql(f))
  await db.exec(`insert into auth.users (id) values ('${ASH}'), ('${MISTY}'), ('${BROCK}')`)
  // The first version's switch, which running 0144 removes.
  await db.exec(`
    insert into game_config (key, value) values ('playersOnline', '{"access": "off"}');
    create function players_online_access() returns text language sql as $$ select 'off' $$;
  `)
  await db.exec(sql('0144_players_online.sql'))
  // Safe to run again.
  await db.exec(sql('0144_players_online.sql'))
  await db.exec(sql('0146_players_online_list.sql'))
  await db.exec(sql('0146_players_online_list.sql'))
})

afterAll(async () => {
  await db.close()
})

beforeEach(async () => {
  await db.exec(`delete from online_here; delete from friendships; delete from friend_requests; delete from friend_attempts;
    delete from game_config where key = 'maxFriends';`)
})

describe('players online', () => {
  it('has no switch: the first version’s row and function are gone', async () => {
    expect((await db.query(`select 1 from game_config where key = 'playersOnline'`)).rows).toHaveLength(0)
    expect((await db.query(`select 1 from pg_proc where proname = 'players_online_access'`)).rows).toHaveLength(0)
  })

  it('each account or device once, for 6 minutes', async () => {
    expect(await ping(ASH, 'dev-a')).toBe(1)
    expect(await ping(ASH, 'dev-b')).toBe(1) // the same account on another device
    expect(await ping(null, 'guest-1')).toBe(2)
    expect(await ping(null, 'guest-1')).toBe(2)
    expect(await ping(MISTY)).toBe(3)
    await db.exec(`update online_here set at = now() - interval '7 minutes' where who = 'device:guest-1'`)
    expect(await ping(MISTY)).toBe(2)
  })

  it('a hand-made device id is counted as nobody', async () => {
    expect(await ping(null, 'x'.repeat(200))).toBe(0)
    expect(await ping(null, '  ')).toBe(0)
    expect(await rows()).toBe(0)
  })
})

describe('the list', () => {
  it('each card as sent (badges never shown), most badges first, the caller marked', async () => {
    await card(ASH, 'a', 'Ash', 8, { look: 'kanto/youngster' })
    await card(null, 'g1', '  ', 3, { team: [] })
    await card(MISTY, 'm', 'Misty the water queen', 5, { look: 'not a look!' })
    const r = await list(null, 'g1')
    expect(r.map((p) => [p.name, p.look, p.me])).toEqual([
      ['Ash', 'kanto/youngster', false],
      ['Misty the wa', null, false],
      ['Trainer', 'red', true],
    ])
    expect(r[0]!.team).toEqual(TEAM)
    expect(r[2]!.team).toEqual([])
    expect(r[0]).not.toHaveProperty('badges')
    // A guest asks: nobody to invite, and no account leaves the server.
    expect(r.every((p) => p.invite === null && p.id === null)).toBe(true)
    expect(JSON.stringify(r)).not.toContain(ASH)
  })

  it('the team rebuilt from what is checked: six at most, numbers only, nothing else carried', async () => {
    await card(null, 'g1', 'A', 1, { team: [{ dex: 10013, level: 30, shiny: 'yes', hack: 1 }, { dex: 'x', level: 2 }] })
    await card(null, 'g2', 'B', 1, { team: Array.from({ length: 7 }, () => ({ dex: 1, level: 1 })) })
    await card(null, 'g3', 'C', 1, { team: { dex: 1 } })
    const r = await list(null, 'g1')
    expect(r.find((p) => p.name === 'A')!.team).toEqual([{ dex: 10013, level: 30 }])
    expect(r.find((p) => p.name === 'B')!.team).toEqual([])
    expect(r.find((p) => p.name === 'C')!.team).toEqual([])
  })

  it('an older build’s ping is counted but not listed; odd badges are no card', async () => {
    expect(await ping(ASH)).toBe(1)
    await card(null, 'g1', 'Gold', 1000)
    expect(await card(MISTY, 'm', 'Misty', 2)).toBe(3)
    expect((await list(MISTY)).map((p) => p.name)).toEqual(['Misty'])
  })

  it('more than 30: the closest in badges to the caller', async () => {
    for (let i = 0; i < 40; i++) await card(null, `g${i}`, `P${i}`, i)
    const r = await list(null, 'g20')
    expect(r).toHaveLength(30)
    const badges = r.map((p) => Number(p.name.slice(1)))
    expect(Math.max(...badges.map((b) => Math.abs(b - 20)))).toBeLessThanOrEqual(15)
    expect(badges).toEqual([...badges].sort((a, b) => b - a))
    expect(r.find((p) => p.me)?.name).toBe('P20')
  })

  it('a caller with no card yet is taken as 0 badges; only the last 6 minutes', async () => {
    for (let i = 0; i < 35; i++) await card(null, `g${i}`, `P${i}`, i)
    await db.exec(`update online_here set at = now() - interval '7 minutes' where who = 'device:g0'`)
    const r = await list(null, 'stranger')
    expect(r.map((p) => p.name)).toEqual(Array.from({ length: 30 }, (_, i) => `P${30 - i}`))
  })
})

describe('the invite', () => {
  beforeEach(async () => {
    await card(ASH, 'a', 'Ash', 8)
    await card(MISTY, 'm', 'Misty', 5)
    await card(BROCK, 'b', 'Brock', 3)
    await card(null, 'g1', 'Gold', 4)
  })

  it('offered to accounts only, never to yourself or a guest; a friend is marked instead', async () => {
    await befriend(ASH, BROCK)
    const r = await list(ASH)
    const by = (n: string) => r.find((p) => p.name === n)!
    expect(by('Misty')).toMatchObject({ invite: 'yes', id: MISTY, friend: false })
    expect(by('Brock')).toMatchObject({ invite: null, id: null, friend: true })
    expect(by('Gold')).toMatchObject({ invite: null, id: null, friend: false })
    expect(by('Ash')).toMatchObject({ invite: null, me: true })
  })

  it('a request the Friends page answers; "sent" once asked, as many times as it is asked', async () => {
    expect(await invite(ASH, MISTY)).toBe('sent')
    expect((await row(ASH, 'Misty')).invite).toBe('sent')
    expect(await invite(ASH, MISTY)).toBe('pending')
    await as(MISTY)
    const reqs = (await db.query<{ r: { id: string; via: string; area: string | null }[] }>(`select friend_requests() as r`)).rows[0]!.r
    expect(reqs).toEqual([expect.objectContaining({ id: ASH, via: 'online', area: null })])
    expect(await friends(ASH, MISTY)).toBe(false)
  })

  it('friends at once when they had asked', async () => {
    expect(await invite(MISTY, ASH)).toBe('sent')
    expect(await invite(ASH, MISTY)).toBe('added')
    expect(await friends(ASH, MISTY)).toBe(true)
    expect((await row(ASH, 'Misty')).friend).toBe(true)
    expect(await invite(ASH, MISTY)).toBe('already')
  })

  it('a full list on either side: no button, and the server says so', async () => {
    await db.exec(`insert into game_config (key, value) values ('maxFriends', '1')`)
    await befriend(MISTY, BROCK)
    expect((await row(ASH, 'Misty')).invite).toBeNull()
    expect(await invite(ASH, MISTY)).toBe('friend_full')
    await db.exec(`delete from friendships`)
    await befriend(ASH, BROCK)
    expect((await list(ASH)).every((p) => p.invite === null)).toBe(true)
    expect(await invite(ASH, MISTY)).toBe('full')
  })

  it('only the players online can be asked, and only signed in', async () => {
    await db.exec(`update online_here set at = now() - interval '7 minutes' where who = '${MISTY}'`)
    expect(await invite(ASH, MISTY)).toBe('offline')
    expect(await invite(ASH, ASH)).toBe('self')
    await as(null)
    await expect(db.query(`select online_invite($1)`, [MISTY])).rejects.toThrow(/friends_signed_out/)
  })
})
