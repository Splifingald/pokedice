// Migration 0130 against a real Postgres (PGlite, in process): Friend Battles (docs/65) and the beta testers' access
// level. The switch (beta testers included), the admin's list, friend_status saying who's a tester; a challenge (friends,
// online, a team, one at a time), its answer, cancel and expiry; Classic's order step and Draft's coin, picks (in turn,
// no mirror, the time-out's pick) and order; the battle's moves (in sequence, each with its seed), the time-out move, a
// forfeit, the result (two claims agree, differ, or one alone), leaving, the head to head and the friendship streak; what
// each side may see; who may listen on which topic. Realtime is stood in for by a table of what was sent.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { FRIEND_BATTLES_DEFAULTS } from '@/engine'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')
const FILE = '0130_friend_battles.sql'
const ADMIN = 'gregoire.ftn@gmail.com'

const U = {
  ash: '00000000-0000-4000-8000-000000000001',
  misty: '00000000-0000-4000-8000-000000000002',
  brock: '00000000-0000-4000-8000-000000000003',
  gary: '00000000-0000-4000-8000-000000000004',
  admin: '00000000-0000-4000-8000-0000000000aa',
}

const NAMES: Record<string, string> = {
  [U.ash]: 'Ash',
  [U.misty]: 'Misty',
  [U.brock]: 'Brock',
  [U.gary]: 'Gary',
  [U.admin]: 'Prof',
}

let db: PGlite

async function as<T = Record<string, unknown>>(user: string | null, q: string, params: unknown[] = []): Promise<T[]> {
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
const one = async <T>(user: string | null, q: string, params: unknown[] = []) =>
  (await as<{ r: T }>(user, q, params))[0]!.r

const access = (a: string) =>
  db.query(`update game_config set value = jsonb_set(value, '{access}', to_jsonb($1::text)) where key = 'friendBattles'`, [a])
const befriend = (a: string, b: string) =>
  db.query(
    `insert into friendships (user_a, user_b, added_by, a_seen, b_seen) values (least($1::uuid, $2::uuid), greatest($1::uuid, $2::uuid), $1, true, true) on conflict do nothing`,
    [a, b],
  )
const here = (user: string) => as(user, 'select pvp_here()')
const mon = (id: string, dex: number, level: number, extra: Record<string, unknown> = {}) => ({ id, dex, level, ...extra })
/** A main save with these in its Box, and a Versus team of the first three. */
async function save(user: string, box: ReturnType<typeof mon>[], team = true) {
  await db.query(
    `insert into saves (user_id, realm, data, updated_at) values ($1, 'main', $2, now())
     on conflict (user_id, realm) do update set data = excluded.data`,
    [
      user,
      JSON.stringify({
        version: 1,
        player: { name: NAMES[user] ?? 'Trainer', character: 'red', avatar: 'red' },
        box,
        team: box.slice(0, 3).map((m) => m.id),
      }),
    ],
  )
  if (team)
    await db.query(
      `insert into versus_teams (user_id, realm, version, team) values ($1, 'main', 1, $2)
       on conflict (user_id, realm) do update set team = excluded.team`,
      [user, JSON.stringify(box.slice(0, 3).map((m) => ({ dex: m.dex, level: Math.min(50, m.level), shiny: false })))],
    )
}

type Match = {
  id: number
  state: string
  side: 'a' | 'b'
  firstPicker: 'a' | 'b' | null
  picks: { side: string; dex: number }[]
  cand: { dex: number; level: number }[] | null
  team: { dex: number }[] | null
  foeTeam: { dex: number }[] | null
  seq: number
  seed: number | null
  winner: string | null
  reason: string | null
  readyA: boolean
  readyB: boolean
}
const challenge = (from: string, to: string, mode = 'classic') =>
  one<Match>(from, 'select pvp_challenge($1, $2) r', [to, mode])
const answer = (user: string, id: number, accept = true) => one<Match>(user, 'select pvp_answer($1, $2) r', [id, accept])
const pick = (user: string, id: number, dex: number) => one<Match>(user, 'select pvp_pick($1, $2, false) r', [id, dex])
const order = (user: string, id: number, o: number[] | null = [0, 1, 2]) =>
  one<Match>(user, 'select pvp_order($1, $2::int[]) r', [id, o])
const move = (user: string, id: number, seq: number, m: unknown) =>
  one<{ seq: number; seed: number }>(user, 'select pvp_move($1, $2, $3) r', [id, seq, JSON.stringify(m)])
const state = (user: string, id: number, after = 0) =>
  one<{ match: Match; moves: { seq: number; side: string; move: { k: string }; seed: number }[] }>(
    user,
    'select pvp_state($1, $2) r',
    [id, after],
  )
const finish = (user: string, id: number, winner: string, hash: string) =>
  one<Match>(user, 'select pvp_finish($1, $2, $3) r', [id, winner, hash])
const lapse = (id: number, secs: number) =>
  db.query(`update pvp_matches set deadline = now() - make_interval(secs => $2) where id = $1`, [id, secs])
const sent = async () =>
  (await db.query<{ topic: string; event: string; payload: Record<string, unknown> }>(`select * from realtime.sent order by n`))
    .rows

/** A match through to its battle (Classic). */
async function toBattle(a = U.ash, b = U.misty) {
  const m = await challenge(a, b)
  await answer(b, m.id)
  await order(a, m.id)
  return order(b, m.id)
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
    create schema realtime;
    create table realtime.sent (n serial, topic text, event text, payload jsonb);
    create function realtime.send(payload jsonb, event text, topic text, private boolean) returns void
      language sql as $$ insert into realtime.sent (topic, event, payload) values (topic, event, payload) $$;
    create table realtime.messages (topic text, extension text);
    create function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic', true) $$;
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
    '0047_trades_admin_read.sql',
    '0049_general_upgrades.sql',
    '0107_friendship.sql',
    FILE,
  ])
    await db.exec(sql(f))
  // Safe to run again.
  await db.exec(sql(FILE))
  await db.exec(`insert into auth.users (id) values ${Object.values(U).map((u) => `('${u}')`).join(',')}`)
  for (const u of Object.values(U))
    await db.query(
      `insert into player_cards (user_id, realm, name, avatar, region, updated_at) values ($1, 'main', $2, 'red', 'kanto', now())`,
      [u, NAMES[u]],
    )
  await db.query(`insert into friend_codes (user_id, code) values ($1, 'K7QM4XD9')`, [U.misty])
  await befriend(U.ash, U.misty)
  await befriend(U.ash, U.brock)
  await befriend(U.ash, U.admin)
}, 120_000)

afterAll(async () => {
  await db?.close()
})

beforeEach(async () => {
  await db.exec(`delete from pvp_matches; delete from pvp_records; delete from pvp_here; delete from beta_testers;
    delete from realtime.sent; delete from friendship_streaks;`)
  await access('all')
  for (const u of [U.ash, U.misty, U.brock, U.admin])
    await save(u, [mon('1', 6, 60), mon('2', 9, 55), mon('3', 3, 52), mon('4', 94, 70), mon('5', 130, 50)])
  for (const u of [U.ash, U.misty, U.brock, U.admin]) await here(u)
})

describe('the switch and the beta testers', () => {
  it('starts Off, with the engine’s numbers', async () => {
    const cfg = (await db.query<{ c: Record<string, unknown> }>(`select friend_battles_cfg() c`)).rows[0]!.c
    expect({ ...cfg, access: 'off' }).toEqual({ ...FRIEND_BATTLES_DEFAULTS })
    await access('off')
    expect(await fails(U.ash, 'select pvp_challenge($1, $2)', [U.misty, 'classic'])).toContain('pvp_off')
    expect(await one(U.ash, 'select pvp_home() r')).toBeNull()
  })

  it('"beta" opens it to the admin and the testers only', async () => {
    await access('beta')
    expect(await fails(U.ash, 'select pvp_challenge($1, $2)', [U.misty, 'classic'])).toContain('pvp_off')
    await as(U.admin, 'select beta_tester_add($1)', [U.ash])
    // The friend must be able to play too: Misty isn't a tester, so pvp_here doesn't count her.
    await db.query(`delete from pvp_here where user_id = $1`, [U.misty])
    await here(U.misty)
    expect(await fails(U.ash, 'select pvp_challenge($1, $2)', [U.misty, 'classic'])).toContain('pvp_offline')
    expect((await challenge(U.admin, U.ash)).state).toBe('invited')
    for (const [a, open] of [
      ['off', false],
      ['admin', false],
      ['beta', true],
      ['all', true],
    ] as const)
      expect(await one(U.ash, 'select access_open($1) r', [a])).toBe(open)
  })

  it('the admin keeps the list: by id, friend ID or name; an unknown or shared name is refused', async () => {
    expect(await fails(U.ash, 'select beta_tester_add($1)', [U.misty])).toContain('admin only')
    const added = await one<{ id: string; name: string }>(U.admin, 'select beta_tester_add($1) r', ['K7QM-4XD9'])
    expect(added).toMatchObject({ id: U.misty, name: 'Misty' })
    expect((await one<{ id: string }>(U.admin, 'select beta_tester_add($1) r', ['brock'])).id).toBe(U.brock)
    expect(await fails(U.admin, 'select beta_tester_add($1)', ['Nobody'])).toContain('beta_not_found')
    await db.query(`update player_cards set name = 'Misty' where user_id = $1`, [U.gary])
    expect(await fails(U.admin, 'select beta_tester_add($1)', ['misty'])).toContain('beta_ambiguous')
    await db.query(`update player_cards set name = 'Gary' where user_id = $1`, [U.gary])
    const list = await one<{ id: string }[]>(U.admin, 'select beta_testers_list() r')
    expect(list.map((t) => t.id).sort()).toEqual([U.misty, U.brock].sort())
    expect(await one(U.admin, 'select beta_tester_remove($1) r', [U.brock])).toBe(true)
    expect((await one<unknown[]>(U.admin, 'select beta_testers_list() r')).length).toBe(1)
  })

  it('friend_status says who is a tester', async () => {
    const status = async (u: string) => (await as<{ beta: boolean }>(u, `select * from friend_status('main')`))[0]!.beta
    expect(await status(U.misty)).toBe(false)
    await as(U.admin, 'select beta_tester_add($1)', [U.misty])
    expect(await status(U.misty)).toBe(true)
  })
})

describe('a challenge', () => {
  it('needs a friend, online, a team on both sides, and nobody busy', async () => {
    expect(await fails(U.misty, 'select pvp_challenge($1, $2)', [U.brock, 'classic'])).toContain('pvp_not_friends')
    await db.query(`update pvp_here set at = now() - interval '5 minutes' where user_id = $1`, [U.misty])
    expect(await fails(U.ash, 'select pvp_challenge($1, $2)', [U.misty, 'classic'])).toContain('pvp_offline')
    await here(U.misty)
    await db.query(`delete from versus_teams where user_id = $1`, [U.misty])
    expect(await fails(U.ash, 'select pvp_challenge($1, $2)', [U.misty, 'classic'])).toContain('pvp_friend_no_team')
    // Draft needs three Pokémon at Lv.50, not a registered team.
    expect((await challenge(U.ash, U.misty, 'draft')).state).toBe('invited')
    expect(await fails(U.ash, 'select pvp_challenge($1, $2)', [U.brock, 'classic'])).toContain('pvp_busy')
    expect(await fails(U.brock, 'select pvp_challenge($1, $2)', [U.ash, 'classic'])).toContain('pvp_friend_busy')
  })

  it('reaches the friend’s inbox; a no, a cancel and an expiry each end it', async () => {
    const m = await challenge(U.ash, U.misty)
    expect((await sent()).some((s) => s.topic === `pvp-inbox:${U.misty}` && s.event === 'challenge')).toBe(true)
    expect(await fails(U.ash, 'select pvp_answer($1, true)', [m.id])).toContain('pvp_not_yours')
    expect((await answer(U.misty, m.id, false)).state).toBe('declined')

    const c = await challenge(U.ash, U.misty)
    expect((await one<Match>(U.ash, 'select pvp_cancel($1) r', [c.id])).state).toBe('cancelled')
    expect(await fails(U.misty, 'select pvp_answer($1, true)', [c.id])).toContain('pvp_gone')

    const e = await challenge(U.ash, U.misty)
    await lapse(e.id, 1)
    expect(await fails(U.misty, 'select pvp_answer($1, true)', [e.id])).toContain('pvp_expired')
    // An expired challenge doesn't keep anyone busy.
    expect((await challenge(U.ash, U.misty)).state).toBe('invited')
  })
})

describe('Classic', () => {
  it('takes both Versus teams; each sets its order, and the battle opens with its seed', async () => {
    const m = await challenge(U.ash, U.misty)
    const a = await answer(U.misty, m.id)
    expect(a.state).toBe('order')
    expect(a.team?.map((t) => t.dex)).toEqual([6, 9, 3])
    // The other's order stays hidden until the battle.
    expect(a.foeTeam).toBeNull()
    expect(await fails(U.misty, 'select pvp_order($1, $2::int[])', [m.id, [0, 0, 1]])).toContain('pvp_bad_order')
    await order(U.misty, m.id, [2, 0, 1])
    const b = await order(U.ash, m.id)
    expect(b.state).toBe('battle')
    expect(b.foeTeam?.map((t) => t.dex)).toEqual([3, 6, 9])
    const seed = (await db.query<{ s: number }>(`select pvp_seed(secret, 0) s from pvp_matches where id = $1`, [m.id])).rows[0]!.s
    expect(b.seed).toBe(seed)
    expect(JSON.stringify(b)).not.toContain('secret')
  })

  it('an order not given in time is kept as it stands', async () => {
    const m = await challenge(U.ash, U.misty)
    await answer(U.misty, m.id)
    await order(U.ash, m.id)
    await lapse(m.id, 1)
    expect((await one<Match>(U.ash, 'select pvp_timeout($1) r', [m.id])).state).toBe('battle')
  })
})

describe('Draft', () => {
  it('tosses the coin, then takes picks in turn, never a species already taken, and opens the order step', async () => {
    const m = await challenge(U.ash, U.misty, 'draft')
    const d = await answer(U.misty, m.id)
    expect(d.state).toBe('draft')
    expect(d.cand?.map((c) => c.dex)).toEqual([94, 6, 9, 3, 130])
    const first = d.firstPicker === 'a' ? U.ash : U.misty
    const second = first === U.ash ? U.misty : U.ash
    expect(await fails(second, 'select pvp_pick($1, 94, false)', [m.id])).toContain('pvp_not_your_pick')
    await pick(first, m.id, 94)
    expect(await fails(second, 'select pvp_pick($1, 94, false)', [m.id])).toContain('pvp_bad_pick')
    await pick(second, m.id, 130)
    expect(await fails(first, 'select pvp_pick($1, 999, false)', [m.id])).toContain('pvp_bad_pick')
    await pick(first, m.id, 6)
    await pick(second, m.id, 9)
    // The time-out's pick: the highest level left that the rules allow.
    await lapse(m.id, 1)
    const t = await one<Match>(U.ash, 'select pvp_timeout($1) r', [m.id])
    expect(t.picks.at(-1)).toMatchObject({ side: d.firstPicker, dex: 3 })
    // Only taken species left for the second picker: the mirror is allowed then.
    const o = await pick(second, m.id, 94)
    expect(o.state).toBe('order')
    expect(o.team?.length).toBe(3)
  })
})

describe('the battle', () => {
  it('takes moves in sequence, each with its seed, sent to both', async () => {
    const m = await toBattle()
    expect(await fails(U.ash, 'select pvp_move($1, 2, $2)', [m.id, '{"k":"attack"}'])).toContain('pvp_seq 0')
    const r = await move(U.ash, m.id, 1, { k: 'reroll', mask: [true, false, true] })
    const seed = (await db.query<{ s: number }>(`select pvp_seed(secret, 1) s from pvp_matches where id = $1`, [m.id])).rows[0]!.s
    expect(r).toEqual({ seq: 1, seed })
    expect(await fails(U.misty, 'select pvp_move($1, 2, $2)', [m.id, '{"k":"heal"}'])).toContain('pvp_bad_move')
    await move(U.misty, m.id, 2, { k: 'attack' })
    const s = await state(U.misty, m.id, 1)
    expect(s.moves).toEqual([{ seq: 2, side: 'b', move: { k: 'attack' }, seed: expect.any(Number) }])
    expect((await sent()).filter((x) => x.topic === `pvp:${m.id}` && x.event === 'move').length).toBe(2)
  })

  it('a deadline passed: the waiting game files a time-out move', async () => {
    const m = await toBattle()
    expect((await one<Match>(U.ash, 'select pvp_timeout($1, 0) r', [m.id])).seq).toBe(0)
    await lapse(m.id, 1)
    const t = await one<Match>(U.ash, 'select pvp_timeout($1, 0) r', [m.id])
    expect(t.seq).toBe(1)
    expect((await state(U.ash, m.id)).moves[0]).toMatchObject({ side: 'b', move: { k: 'timeout' } })
  })

  it('two equal results settle it, with the head to head and the friendship streak', async () => {
    await db.query(`update game_config set value = jsonb_set(value, '{access}', '"all"') where key = 'friendship'`)
    const m = await toBattle()
    expect((await finish(U.ash, m.id, 'a', 'abc')).state).toBe('battle')
    const done = await finish(U.misty, m.id, 'a', 'abc')
    expect(done).toMatchObject({ state: 'done', winner: 'a' })
    const home = await one<{ records: { id: string; wins: number; losses: number }[]; history: { result: string }[] }>(
      U.misty,
      'select pvp_home() r',
    )
    expect(home.records[0]).toMatchObject({ id: U.ash, wins: 0, losses: 1 })
    expect(home.history[0]!.result).toBe('loss')
    const streak = await db.query(`select streak, last_kind from friendship_streaks`)
    expect(streak.rows[0]).toMatchObject({ streak: 1, last_kind: 'battle' })
  })

  it('two different results void it; one alone settles it after 30 seconds', async () => {
    const m = await toBattle()
    await finish(U.ash, m.id, 'a', 'abc')
    expect((await finish(U.misty, m.id, 'b', 'abc')).state).toBe('void')

    const n = await toBattle()
    await finish(U.ash, n.id, 'a', 'abc')
    await db.query(`update pvp_matches set claims = jsonb_set(claims, '{a,at}', to_jsonb(0)) where id = $1`, [n.id])
    expect((await finish(U.ash, n.id, 'a', 'abc')).state).toBe('done')
  })

  it('a forfeit is final at once; a player gone past the grace loses', async () => {
    const m = await toBattle()
    await move(U.misty, m.id, 1, { k: 'forfeit' })
    expect((await state(U.ash, m.id)).match).toMatchObject({ state: 'done', winner: 'a', reason: 'forfeit' })

    const n = await toBattle()
    expect((await one<Match>(U.ash, 'select pvp_claim($1) r', [n.id])).state).toBe('battle')
    await db.query(`update pvp_matches set seen_b = now() - interval '2 minutes' where id = $1`, [n.id])
    expect(await one<Match>(U.ash, 'select pvp_claim($1) r', [n.id])).toMatchObject({ state: 'done', winner: 'a', reason: 'left' })
  })

  it('only its two players may read it or listen to it', async () => {
    const m = await toBattle()
    expect(await fails(U.brock, 'select pvp_state($1)', [m.id])).toContain('pvp_not_found')
    expect(await one(U.ash, 'select pvp_can_listen($1) r', [`pvp:${m.id}`])).toBe(true)
    expect(await one(U.brock, 'select pvp_can_listen($1) r', [`pvp:${m.id}`])).toBe(false)
    expect(await one(U.brock, 'select pvp_can_listen($1) r', [`pvp-inbox:${U.brock}`])).toBe(true)
    expect(await one(U.brock, 'select pvp_can_listen($1) r', [`pvp-inbox:${U.ash}`])).toBe(false)
  })

  it('the sweep expires challenges and voids matches left by both', async () => {
    const m = await toBattle()
    await lapse(m.id, 700)
    await db.query('select pvp_sweep()')
    expect((await state(U.ash, m.id)).match.state).toBe('void')
  })
})
