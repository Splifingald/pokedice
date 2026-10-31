// Migration 0099 against a real Postgres (PGlite, in process): real-player battles in areas (docs/54). The writer keeps
// a save's team for the area it stands in while that area is its newest one (main game only, the region being played,
// an area dealing the card); the offer picks one, never yours, the least met first; meets open friend requests, which
// are sent once, answered, crossed, expired and capped; the fill; deleting your data; the switch, checked everywhere.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AREA_VERSUS_DEFAULTS } from '@/engine'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')
const ADMIN = 'gregoire.ftn@gmail.com'

const U = {
  ash: '00000000-0000-4000-8000-000000000001',
  misty: '00000000-0000-4000-8000-000000000002',
  brock: '00000000-0000-4000-8000-000000000003',
  gary: '00000000-0000-4000-8000-000000000004',
  admin: '00000000-0000-4000-8000-0000000000aa',
}
/** Route 3 deals the card, Route 4 too (after it in the chain), Pewter has a gym and doesn't, Cerulean Cave is secret. */
const A = {
  route3: '30000000-0000-4000-8000-000000000003',
  route4: '30000000-0000-4000-8000-000000000004',
  pewter: '30000000-0000-4000-8000-000000000002',
  cave: '30000000-0000-4000-8000-000000000009',
  johto: '30000000-0000-4000-8000-000000000020',
}

let db: PGlite

async function as<T = Record<string, unknown>>(
  user: string | null,
  q: string,
  params: unknown[] = [],
): Promise<T[]> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? ''])
  await db.query(`select set_config('request.jwt.claim.email', $1, false)`, [user === U.admin ? ADMIN : ''])
  try {
    return (await db.query<T>(q, params)).rows
  } finally {
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`)
    await db.query(`select set_config('request.jwt.claim.email', '', false)`)
  }
}
async function fails(user: string | null, q: string, params: unknown[] = []): Promise<string> {
  try {
    await as(user, q, params)
  } catch (e) {
    return (e as Error).message
  }
  return 'no error'
}
const access = (a: string) =>
  db.query(
    `update game_config set value = jsonb_set(value, '{access}', to_jsonb($1::text)) where key = 'areaVersus'`,
    [a],
  )

const mon = (id: string, dex: number, level: number, extra: Record<string, unknown> = {}) => ({
  id,
  dex,
  level,
  ...extra,
})

function save(o: {
  area?: string
  cleared?: boolean
  region?: string
  name?: string
  team?: ReturnType<typeof mon>[]
  mode?: string
  rich?: boolean
}) {
  const team = o.team ?? [mon('a', 25, 18), mon('b', 16, 15, { shiny: true, talent: true })]
  return {
    version: 1,
    ...(o.region && { region: o.region }),
    ...(o.mode && { mode: o.mode }),
    player: { name: o.name ?? 'Ash', character: 'red', avatar: 'kanto/lass' },
    box: [...team, mon('z', 150, 70)],
    team: team.map((m) => m.id),
    comboLevels: { pair: 3, triple: 2 },
    dieLevels: { fire: 4 },
    currentAreaId: o.area ?? A.route3,
    areaProgress: { [o.area ?? A.route3]: { cleared: !!o.cleared, gymsDefeated: [] } },
    ...(o.rich && { general: { rich: true } }),
  }
}
async function upload(user: string, data: unknown, realm = 'main', at = 'now()') {
  await db.query(
    `insert into saves (user_id, realm, data, updated_at) values ($1, $2, $3, ${at})
     on conflict (user_id, realm) do update set data = excluded.data, updated_at = excluded.updated_at`,
    [user, realm, JSON.stringify(data)],
  )
}
type Foe = {
  id: string
  name: string
  avatar: string
  rich: boolean
  friend: boolean
  team: { dex: number }[]
  levels: Record<string, unknown>
}
const offer = async (user: string | null, area = A.route3, skip: string[] = []) =>
  (await as<{ o: Foe | null }>(user, 'select area_versus_offer($1, $2::uuid[]) o', [area, skip]))[0]!.o
const met = (user: string, foe: string, outcome = 'won', area = A.route3) =>
  as(user, 'select area_versus_met($1, $2, $3)', [foe, area, outcome])
const send = async (user: string, to: string) =>
  (await as<{ s: string }>(user, 'select friend_request_send($1, $2) s', [to, A.route3]))[0]!.s
const requests = async (user: string) =>
  (await as<{ r: { id: string; name: string; area: string }[] }>(user, 'select friend_requests() r'))[0]!.r
const answer = async (user: string, from: string, accept: boolean) =>
  (await as<{ s: string }>(user, 'select friend_request_answer($1, $2) s', [from, accept]))[0]!.s
const friends = async (a: string, b: string) =>
  (
    await db.query(
      `select 1 from friendships where user_a = least($1::uuid, $2::uuid) and user_b = greatest($1::uuid, $2::uuid)`,
      [a, b],
    )
  ).rows.length > 0
const pool = async () =>
  (
    await db.query<{ user_id: string; area_id: string }>(
      `select user_id, area_id from area_versus_teams order by user_id, area_id`,
    )
  ).rows

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$
      select jsonb_strip_nulls(jsonb_build_object('email', nullif(current_setting('request.jwt.claim.email', true), ''),
        'role', nullif(current_setting('request.jwt.claim.role', true), ''))) $$;
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
  ])
    await db.exec(sql(f))
  await db.exec(
    `insert into auth.users (id) values ${Object.values(U)
      .map((u) => `('${u}')`)
      .join(', ')}`,
  )
  const area = (
    id: string,
    order: number,
    name: string,
    weights: Record<string, number>,
    region = 'kanto',
    gyms = '[]',
  ) =>
    db.query(
      `insert into areas (id, order_index, name, min_level, max_level, encounter_weights, region_id, gyms)
       values ($1, $2, $3, 5, 20, $4, $5, $6::jsonb)`,
      [id, order, name, JSON.stringify(weights), region, gyms],
    )
  const deck = { wild: 7, trainer: 2, center: 1, item: 1, casino: 0 }
  await area(A.pewter, 2, 'Pewter City', deck, 'kanto', '["brock"]')
  await area(A.route3, 3, 'Route 3', deck)
  await area(A.route4, 4, 'Route 4', { ...deck, versus: 2 })
  await area(A.cave, 30, 'Cerulean Cave', deck)
  await area(A.johto, 40, 'Route 29', deck, 'johto')
  // The generated block only knows the real areas: these get their cards by hand, as Admin › Areas would.
  await db.exec(sql('0099_area_versus.sql'))
  await db.query(
    `update areas set encounter_weights = encounter_weights || '{"versus": 1}' where id in ($1::uuid, $2::uuid, $3::uuid)`,
    [A.route3, A.cave, A.johto],
  )
  // Safe to run again: an area that has its number keeps it.
  await db.exec(sql('0099_area_versus.sql'))
})

beforeEach(async () => {
  await db.exec(`delete from area_versus_teams; delete from area_versus_meets; delete from friend_requests; delete from friendships;
    delete from friend_attempts; delete from saves;`)
  await access('all')
})

describe('the switch and the numbers', () => {
  it('starts Off, with the engine’s defaults', async () => {
    const row = (await db.query<{ v: Record<string, unknown> }>(`select area_versus_cfg() v`)).rows[0]!.v
    expect({ ...row, access: 'off' }).toEqual({ ...AREA_VERSUS_DEFAULTS })
    await access('off')
    expect(await offer(U.ash)).toBeNull()
    expect(await fails(U.ash, `select area_versus_met($1, $2, 'won')`, [U.misty, A.route3])).toContain(
      'area_versus_off',
    )
    expect(await fails(U.ash, `select friend_request_send($1)`, [U.misty])).toContain('area_versus_off')
  })

  it('is on for the admin alone with "admin"', async () => {
    await upload(U.misty, save({ name: 'Misty' }))
    await access('admin')
    expect(await offer(U.ash)).toBeNull()
    expect((await offer(U.admin))?.name).toBe('Misty')
  })

  it('keeps an area’s own number when run again', async () => {
    const w = (
      await db.query<{ w: { versus: number } }>(`select encounter_weights w from areas where id = $1`, [
        A.route4,
      ])
    ).rows[0]!.w
    expect(w.versus).toBe(2)
  })
})

describe('the writer', () => {
  it('keeps the team of a save standing in its newest area, from the save', async () => {
    await upload(U.misty, save({ name: 'Misty', rich: true }))
    const row = (await db.query<Record<string, unknown>>(`select * from area_versus_teams`)).rows[0]!
    expect(row).toMatchObject({
      user_id: U.misty,
      area_id: A.route3,
      region: 'kanto',
      name: 'Misty',
      avatar: 'kanto/lass',
      rich: true,
      team: [
        { dex: 25, level: 18, shiny: false, talent: false },
        { dex: 16, level: 15, shiny: true, talent: true },
      ],
      levels: { combo: { pair: 3, triple: 2 }, dice: { fire: 4 } },
    })
  })

  it('updates it while they stay, and keeps it once they move on', async () => {
    await upload(U.misty, save({}))
    await upload(U.misty, save({ team: [mon('a', 26, 22)] }))
    await upload(U.misty, save({ area: A.route4, team: [mon('a', 26, 30)] }))
    const rows = (
      await db.query<{ area_id: string; team: { dex: number; level: number }[] }>(
        `select area_id, team from area_versus_teams order by area_id`,
      )
    ).rows
    expect(rows.map((r) => [r.area_id, r.team[0]!.level])).toEqual([
      [A.route3, 22],
      [A.route4, 30],
    ])
  })

  it('leaves out a cleared area, a gym’s area, another region, Extreme mode and an empty team', async () => {
    await upload(U.misty, save({ cleared: true }))
    await upload(U.brock, save({ area: A.pewter }))
    await upload(U.gary, save({ area: A.johto, region: 'kanto' }))
    await upload(U.ash, save({}), 'extreme')
    await upload(U.admin, save({ team: [] }))
    expect(await pool()).toEqual([])
    await upload(U.ash, save({ mode: 'extreme' }))
    expect(await pool()).toEqual([])
  })

  it('takes a secret area while it isn’t cleared, and Johto in Johto', async () => {
    await upload(U.misty, save({ area: A.cave }))
    await upload(U.gary, save({ area: A.johto, region: 'johto' }))
    expect(await pool()).toEqual([
      { user_id: U.misty, area_id: A.cave },
      { user_id: U.gary, area_id: A.johto },
    ])
  })

  it('never lets an older save take a newer team’s place', async () => {
    await upload(U.misty, save({ team: [mon('a', 26, 22)] }))
    await db.query(`select area_versus_write($1, $2, now() - interval '1 day')`, [
      U.misty,
      JSON.stringify(save({})),
    ])
    const t = (await db.query<{ team: { dex: number }[] }>(`select team from area_versus_teams`)).rows[0]!
      .team
    expect(t[0]!.dex).toBe(26)
  })

  it('never fails the upload', async () => {
    await upload(U.misty, { ...save({}), team: 'odd', box: 7 })
    expect((await db.query(`select 1 from saves where user_id = $1`, [U.misty])).rows).toHaveLength(1)
  })
})

describe('the offer', () => {
  it('never offers your own team, nor a banned player’s, nor an old one', async () => {
    await upload(U.ash, save({ name: 'Ash' }))
    expect(await offer(U.ash)).toBeNull()
    await upload(U.misty, save({ name: 'Misty' }))
    await db.query(`insert into leaderboard_bans (user_id) values ($1)`, [U.misty])
    expect(await offer(U.ash)).toBeNull()
    await db.query(`delete from leaderboard_bans`)
    await db.query(`update area_versus_teams set played_at = now() - interval '15 days' where user_id = $1`, [
      U.misty,
    ])
    expect(await offer(U.ash)).toBeNull()
  })

  it('says who, their team and upgrades, and whether they’re a friend; readable signed out', async () => {
    await upload(U.misty, save({ name: 'Misty' }))
    const o = (await offer(null))!
    expect(o).toMatchObject({ id: U.misty, name: 'Misty', friend: false, levels: { dice: { fire: 4 } } })
    expect(o.team.map((m) => m.dex)).toEqual([25, 16])
    await db.query(`insert into friendships (user_a, user_b, added_by) values ($1, $2, $1)`, [U.ash, U.misty])
    expect((await offer(U.ash))!.friend).toBe(true)
  })

  it('puts the players not met first, then the least lately met, the skipped last', async () => {
    await upload(U.misty, save({ name: 'Misty' }))
    await upload(U.brock, save({ name: 'Brock' }))
    await met(U.ash, U.misty)
    for (let i = 0; i < 5; i++) expect((await offer(U.ash))!.name).toBe('Brock')
    await met(U.ash, U.brock, 'skipped')
    for (let i = 0; i < 5; i++) expect((await offer(U.ash))!.name).toBe('Misty')
    for (let i = 0; i < 5; i++) expect((await offer(U.ash, A.route3, [U.misty]))!.name).toBe('Brock')
    // With nobody else, the same one again.
    await db.query(`delete from area_versus_teams where user_id = $1`, [U.brock])
    expect((await offer(U.ash, A.route3, [U.misty]))!.name).toBe('Misty')
  })
})

describe('friend requests', () => {
  beforeEach(async () => {
    await upload(U.misty, save({ name: 'Misty' }))
    await upload(U.ash, save({ name: 'Ash', area: A.route4 }))
  })

  it('only to a player whose team you met, signed in', async () => {
    expect(await send(U.ash, U.misty)).toBe('not_met')
    expect(await fails(null, `select friend_request_send($1)`, [U.misty])).toContain('friends_signed_out')
    expect(await fails(null, `select area_versus_met($1, $2, 'won')`, [U.misty, A.route3])).toContain(
      'friends_signed_out',
    )
    // A meet with no team of theirs there is no meet.
    await met(U.ash, U.misty, 'won', A.route4)
    expect(await send(U.ash, U.misty)).toBe('not_met')
    await met(U.ash, U.misty)
    expect(await send(U.ash, U.misty)).toBe('sent')
    expect(await send(U.ash, U.misty)).toBe('pending')
    expect(await send(U.ash, U.ash)).toBe('self')
  })

  it('shows up for them, and ACCEPT makes friends; the asker is told as for a new friend', async () => {
    await met(U.ash, U.misty)
    await send(U.ash, U.misty)
    await db.query(
      `insert into player_cards (user_id, realm, name, avatar, region, updated_at) values ($1, 'main', 'Ash', 'red', 'kanto', now())
      on conflict do nothing`,
      [U.ash],
    )
    const list = await requests(U.misty)
    expect(list).toMatchObject([{ id: U.ash, name: 'Ash', area: A.route3 }])
    expect(await requests(U.ash)).toEqual([])
    expect(await answer(U.misty, U.ash, true)).toBe('added')
    expect(await friends(U.ash, U.misty)).toBe(true)
    expect(await requests(U.misty)).toEqual([])
    const seen = (
      await db.query<{ a_seen: boolean; b_seen: boolean }>(`select a_seen, b_seen from friendships`)
    ).rows[0]!
    // Ash (the smaller id) asked: he hasn't seen it yet; Misty accepted it.
    expect(seen).toEqual({ a_seen: false, b_seen: true })
    expect(await send(U.ash, U.misty)).toBe('already')
  })

  it('NO drops it; an answer to nothing is gone', async () => {
    await met(U.ash, U.misty)
    await send(U.ash, U.misty)
    expect(await answer(U.misty, U.ash, false)).toBe('declined')
    expect(await friends(U.ash, U.misty)).toBe(false)
    expect(await answer(U.misty, U.ash, true)).toBe('gone')
  })

  it('crossed requests make friends at once', async () => {
    await upload(U.ash, save({ name: 'Ash' }))
    await met(U.ash, U.misty)
    await met(U.misty, U.ash)
    expect(await send(U.misty, U.ash)).toBe('sent')
    expect(await send(U.ash, U.misty)).toBe('added')
    expect(await friends(U.ash, U.misty)).toBe(true)
    expect(await requests(U.ash)).toEqual([])
  })

  it('goes after the request days', async () => {
    await met(U.ash, U.misty)
    await send(U.ash, U.misty)
    await db.query(`update friend_requests set created_at = now() - interval '31 days'`)
    expect(await requests(U.misty)).toEqual([])
    expect(await answer(U.misty, U.ash, true)).toBe('gone')
  })

  it('keeps to the friend cap', async () => {
    await db.query(
      `insert into game_config (key, value) values ('maxFriends', '1') on conflict (key) do update set value = '1'`,
    )
    await db.query(`insert into friendships (user_a, user_b, added_by) values ($1, $2, $1)`, [
      U.misty,
      U.brock,
    ])
    await met(U.ash, U.misty)
    await send(U.ash, U.misty)
    expect(await answer(U.misty, U.ash, true)).toBe('full')
    await db.query(`delete from game_config where key = 'maxFriends'`)
  })

  it('a hidden list while the switch is off', async () => {
    await met(U.ash, U.misty)
    await send(U.ash, U.misty)
    await access('off')
    expect(await requests(U.misty)).toEqual([])
  })
})

describe('the fill and your data', () => {
  it('fills the pool from the recent saves, the admin’s alone', async () => {
    await upload(U.misty, save({ name: 'Misty' }))
    await upload(U.brock, save({ name: 'Brock' }), 'main', `now() - interval '20 days'`)
    await db.exec(`delete from area_versus_teams`)
    expect(await fails(U.ash, `select area_versus_fill()`)).toContain('admin_only')
    const n = (await as<{ n: number }>(U.admin, `select area_versus_fill() n`))[0]!.n
    expect(n).toBe(1)
    expect(await pool()).toEqual([{ user_id: U.misty, area_id: A.route3 }])
  })

  it('deleting your data takes your teams, meets and requests', async () => {
    await upload(U.misty, save({ name: 'Misty' }))
    await upload(U.ash, save({ name: 'Ash', area: A.route4 }))
    await met(U.ash, U.misty)
    await send(U.ash, U.misty)
    await as(U.misty, `select delete_my_data()`)
    expect(await pool()).toEqual([{ user_id: U.ash, area_id: A.route4 }])
    expect((await db.query(`select 1 from area_versus_meets`)).rows).toHaveLength(0)
    expect((await db.query(`select 1 from friend_requests`)).rows).toHaveLength(0)
  })
})
