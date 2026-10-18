// Migration 0063 against a real Postgres (PGlite, in process): the Underground's teams (docs/34 §3). Its row lands
// with the game's defaults, off; nothing answers outside a running Underground event or with a switch off; friends
// only, three seats with a colour each, dealt at random; orbs a wall owes go to whoever holds their colour, once; a
// full team can sell; an ended event's teams go; deleting your data takes your seat. Supabase's own pieces (the auth
// schema, the roles) are stood in for at the top, as in trades-sql.test.ts.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '@/engine'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')

const U = {
  ash: '00000000-0000-4000-8000-000000000001',
  misty: '00000000-0000-4000-8000-000000000002',
  brock: '00000000-0000-4000-8000-000000000003',
  gary: '00000000-0000-4000-8000-000000000004', // nobody's friend
  erika: '00000000-0000-4000-8000-000000000005',
}
const ADMIN = '00000000-0000-4000-8000-000000000009'

let db: PGlite

async function as<T = Record<string, unknown>>(
  user: string | null,
  q: string,
  params: unknown[] = [],
): Promise<T[]> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? ''])
  await db.query(`select set_config('request.jwt.claim.email', $1, false)`, [
    user === ADMIN ? 'gregoire.ftn@gmail.com' : '',
  ])
  return (await db.query<T>(q, params)).rows
}
async function call<T = Record<string, unknown>>(
  user: string | null,
  q: string,
  params: unknown[] = [],
): Promise<T> {
  return (await as<{ r: T }>(user, `select ${q} as r`, params))[0]!.r
}
async function fails(user: string | null, q: string, params: unknown[] = []): Promise<string> {
  try {
    await call(user, q, params)
  } catch (e) {
    return (e as Error).message
  }
  return 'no error'
}

interface Team {
  event: string
  team: string | null
  me: string | null
  seats: { colour: string; id: string; name: string }[]
  invites: { team: string; from: string; name: string }[]
  sent: { id: string; name: string }[]
}
const team = (u: string) => call<Team>(u, 'ug_team()')
const invite = (u: string, friend: string) => call<Team>(u, 'ug_invite($1)', [friend])
const answer = (u: string, t: string, yes = true) => call<Team>(u, 'ug_answer($1, $2)', [t, yes])

const iso = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString()
async function setEvent(o: { live?: boolean; access?: string; id?: string } = {}) {
  const ev = {
    id: o.id ?? 'ug1',
    type: 'underground',
    start: o.live === false ? iso(-48) : iso(-1),
    end: o.live === false ? iso(-24) : iso(24),
  }
  await db.query(
    `insert into game_config (key, value) values ('liveEvents', $1::jsonb)
     on conflict (key) do update set value = excluded.value`,
    [JSON.stringify({ access: 'all', list: [ev] })],
  )
  await db.query(`update game_config set value = value || $1::jsonb where key = 'underground'`, [
    JSON.stringify({ access: o.access ?? 'all' }),
  ])
}

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
    '0053_push.sql',
    '0063_underground.sql',
  ])
    await db.exec(sql(f))
  // Safe to run again.
  await db.exec(sql('0063_underground.sql'))
  const ids = [...Object.values(U), ADMIN]
  await db.exec(`insert into auth.users (id) values ${ids.map((u) => `('${u}')`).join(',')}`)
  // Ash, Misty, Brock and Erika are all friends; Gary is nobody's.
  const pairs = [
    [U.ash, U.misty],
    [U.ash, U.brock],
    [U.ash, U.erika],
    [U.misty, U.brock],
    [U.misty, U.erika],
    [U.brock, U.erika],
  ]
  for (const [a, b] of pairs)
    await db.query(
      `insert into friendships (user_a, user_b, added_by) values (least($1::uuid, $2::uuid), greatest($1::uuid, $2::uuid), $1)`,
      [a, b],
    )
  for (const [name, id] of Object.entries(U))
    await db.query(
      `insert into player_cards (user_id, realm, name, avatar, region, updated_at) values ($1, 'main', $2, 'red', 'kanto', now())`,
      [id, name[0]!.toUpperCase() + name.slice(1)],
    )
})

afterAll(async () => {
  await db.close()
})

beforeEach(async () => {
  await db.exec(`delete from ug_orbs; delete from ug_teams;`)
  await setEvent()
})

describe('the switch and the event', () => {
  it('lands off, with the game’s defaults', async () => {
    const [row] = await as<{ value: Record<string, unknown> }>(
      null,
      `select value from game_config where key = 'underground'`,
    )
    expect({ ...row!.value, access: 'off' }).toEqual(DEFAULT_CONFIG.underground)
  })

  it('answers only during an Underground event, with both switches on, to a signed-in player', async () => {
    expect((await team(U.ash)).event).toBe('ug1')
    expect(await fails(null, 'ug_team()')).toMatch(/signed_out/)
    await setEvent({ access: 'off' })
    expect(await fails(U.ash, 'ug_team()')).toMatch(/ug_closed/)
    await setEvent({ access: 'admin' })
    expect(await fails(U.ash, 'ug_team()')).toMatch(/ug_closed/)
    expect((await team(ADMIN)).event).toBe('ug1')
    await setEvent({ live: false })
    expect(await fails(U.ash, 'ug_team()')).toMatch(/ug_closed/)
  })
})

describe('teams', () => {
  it('a first invitation makes the team and seats its maker; friends only', async () => {
    expect(await fails(U.ash, 'ug_invite($1)', [U.gary])).toMatch(/ug_not_friends/)
    const t = await invite(U.ash, U.misty)
    expect(t.team).toBeTruthy()
    expect(t.seats).toHaveLength(1)
    expect(['red', 'blue', 'green']).toContain(t.me)
    expect(t.sent).toEqual([{ id: U.misty, name: 'Misty' }])
    const m = await team(U.misty)
    expect(m.team).toBeNull()
    expect(m.invites).toEqual([expect.objectContaining({ team: t.team, from: U.ash, name: 'Ash' })])
  })

  it('three seats, three colours; joining another team leaves the old one', async () => {
    const t = (await invite(U.ash, U.misty)).team!
    await invite(U.ash, U.brock)
    await answer(U.misty, t)
    const full = await answer(U.brock, t)
    expect(full.seats.map((s) => s.colour).sort()).toEqual(['blue', 'green', 'red'])
    expect(await call(U.ash, 'ug_can_sell()')).toBe(true)
    expect(await fails(U.ash, 'ug_invite($1)', [U.erika])).toMatch(/ug_team_full/)
    // Erika makes her own team and Misty moves to it.
    const e = (await invite(U.erika, U.misty)).team!
    const moved = await answer(U.misty, e)
    expect(moved.team).toBe(e)
    expect((await team(U.ash)).seats).toHaveLength(2)
    expect(await call(U.ash, 'ug_can_sell()')).toBe(false)
  })

  it('an invitation can be turned down or taken back; the last to leave closes the team', async () => {
    const t = (await invite(U.ash, U.misty)).team!
    expect((await answer(U.misty, t, false)).team).toBeNull()
    expect(await fails(U.misty, 'ug_answer($1, true)', [t])).toMatch(/ug_no_invite/)
    await invite(U.ash, U.brock)
    expect((await call<Team>(U.ash, 'ug_cancel($1)', [U.brock])).sent).toEqual([])
    expect((await team(U.brock)).invites).toEqual([])
    expect((await call<Team>(U.ash, 'ug_leave()')).team).toBeNull()
    expect(await as(null, 'select * from ug_teams')).toEqual([])
  })
})

describe('orbs between teammates', () => {
  async function fullTeam() {
    const t = (await invite(U.ash, U.misty)).team!
    await invite(U.ash, U.brock)
    await answer(U.misty, t)
    const seats = (await answer(U.brock, t)).seats
    return Object.fromEntries(seats.map((s) => [s.id, s.colour])) as Record<string, string>
  }

  it('each orb goes to whoever holds its colour, once per wall; never back to its digger', async () => {
    const colour = await fullTeam()
    const orbs = [
      { colour: colour[U.misty], size: 's' },
      { colour: colour[U.brock], size: 'l' },
      { colour: colour[U.ash], size: 'm' },
    ]
    expect(await call(U.ash, 'ug_send($1, $2::jsonb)', ['ug1:1', JSON.stringify(orbs)])).toBe(2)
    expect(await call(U.ash, 'ug_send($1, $2::jsonb)', ['ug1:1', JSON.stringify(orbs)])).toBe(0)
    const inbox = await call<{ id: string; from: string; orbs: { colour: string; size: string }[] }[]>(
      U.misty,
      'ug_inbox()',
    )
    expect(inbox).toEqual([
      { id: expect.any(String), from: 'Ash', orbs: [{ colour: colour[U.misty], size: 's' }] },
    ])
    expect(await call(U.ash, 'ug_inbox()')).toEqual([])
    await as(U.misty, 'select ug_applied($1::uuid[])', [[inbox[0]!.id]])
    expect(await call(U.misty, 'ug_inbox()')).toEqual([])
  })

  it('refuses a wall owing more than it can hold, or orbs that aren’t orbs; solo sends nothing', async () => {
    const colour = await fullTeam()
    const five = Array.from({ length: 5 }, () => ({ colour: colour[U.misty], size: 's' }))
    expect(await fails(U.ash, 'ug_send($1, $2::jsonb)', ['w', JSON.stringify(five)])).toMatch(/ug_bad_orbs/)
    expect(
      await fails(U.ash, 'ug_send($1, $2::jsonb)', ['w', JSON.stringify([{ colour: 'pink', size: 's' }])]),
    ).toMatch(/ug_bad_orbs/)
    expect(
      await call(U.erika, 'ug_send($1, $2::jsonb)', ['w', JSON.stringify([{ colour: 'red', size: 's' }])]),
    ).toBe(0)
  })
})

describe('the end of the event, and deleting your data', () => {
  it('a new event starts with no teams: the old ones break up', async () => {
    await invite(U.ash, U.misty)
    await setEvent({ id: 'ug2' })
    const t = await team(U.ash)
    expect(t.event).toBe('ug2')
    expect(t.team).toBeNull()
    expect(await as(null, 'select * from ug_teams')).toEqual([])
  })

  it('delete_my_data takes the seat, the invitations and the orbs owed', async () => {
    const t = (await invite(U.ash, U.misty)).team!
    await answer(U.misty, t)
    await as(U.misty, 'select delete_my_data()')
    expect((await team(U.ash)).seats.map((s) => s.id)).toEqual([U.ash])
    expect(await as(null, `select * from ug_members where user_id = '${U.misty}'`)).toEqual([])
  })
})
