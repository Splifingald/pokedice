// Migration 0157 against a real Postgres (PGlite, in process): the player cap (docs/74). The switch (Off counts, On for
// admin puts the admin's own game in line, On for everyone caps); the cap never exceeded; first come first served;
// the admin and the whitelist in over the cap, counted, never taking a waiting player's turn; a lower cap sends nobody
// out; a reload within the grace keeps its place; lost sessions freed; idle players to the back of the line only when
// someone waits; one place per player across tabs and devices; a guest signing in keeps their place; the heartbeat
// carries the players-online card; the gate (ccu_check_request). The time passing is played by moving the rows'
// stamps back. Supabase's own pieces (the auth schema, the roles) are stood in for at the top, as in
// players-online-sql.test.ts; so are `players` (0028) and `beta_testers` (0131), copied from their migrations, whose
// own chains are long.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')

const ADMIN_EMAIL = 'gregoire.ftn@gmail.com'
const ADMIN = '00000000-0000-4000-8000-0000000000aa'
const ASH = '00000000-0000-4000-8000-000000000001'
const MISTY = '00000000-0000-4000-8000-000000000002'
const BROCK = '00000000-0000-4000-8000-000000000003'

let db: PGlite

interface Answer {
  status: 'active' | 'queued' | 'gone'
  token?: string
  kind?: 'regular' | 'admin' | 'whitelist'
  position?: number
  queueLength?: number
  reason?: string | null
  online?: number
  heartbeatSeconds?: number
}
interface Stats {
  active: number
  regular: number
  admin: number
  whitelist: number
  queued: number
  idleQueued: number
  config: Record<string, unknown>
}

async function as(user: string | null) {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? ''])
  await db.query(`select set_config('request.jwt.claim.email', $1, false)`, [
    user === ADMIN ? ADMIN_EMAIL : '',
  ])
  await db.query(`select set_config('request.jwt.claim.role', $1, false)`, [''])
}
async function join(user: string | null, device: string, previous: string | null = null): Promise<Answer> {
  await as(user)
  return (await db.query<{ r: Answer }>(`select ccu_join($1, $2) as r`, [device, previous])).rows[0]!.r
}
async function beat(
  user: string | null,
  token: string,
  input = false,
  card: unknown = null,
): Promise<Answer> {
  await as(user)
  // The line moves at most every 2 seconds: each beat here is a moment later than the last.
  await db.exec(`update ccu_state set ticked_at = now() - interval '1 minute'`)
  return (
    await db.query<{ r: Answer }>(`select ccu_heartbeat($1, $2, $3::jsonb) as r`, [
      token,
      input,
      card == null ? null : JSON.stringify(card),
    ])
  ).rows[0]!.r
}
async function leave(token: string) {
  await db.query(`select ccu_leave($1)`, [token])
}
async function stats(): Promise<Stats> {
  await as(ADMIN)
  return (await db.query<{ r: Stats }>(`select ccu_admin_stats() as r`)).rows[0]!.r
}
async function setCfg(cfg: Record<string, unknown>) {
  await as(ADMIN)
  return (
    await db.query<{ r: Record<string, unknown> }>(`select ccu_admin_config($1::jsonb) as r`, [
      JSON.stringify(cfg),
    ])
  ).rows[0]!.r
}
/** Moves a session's stamps back, as time passing would. */
async function age(token: string, column: 'last_seen' | 'last_input' | 'left_at', seconds: number) {
  await db.query(`update ccu_sessions set ${column} = now() - make_interval(secs => $2) where token = $1`, [
    token,
    seconds,
  ])
}
async function errorOf(p: Promise<unknown>): Promise<string> {
  try {
    await p
    return ''
  } catch (err) {
    return (err as Error).message
  }
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$
      select jsonb_strip_nulls(jsonb_build_object(
        'email', nullif(current_setting('request.jwt.claim.email', true), ''),
        'role', nullif(current_setting('request.jwt.claim.role', true), ''))) $$;
    grant usage on schema auth to anon, authenticated;
  `)
  await db.exec(sql('0001_init.sql').replace('create extension if not exists pgcrypto;', ''))
  // What online_ping (0144, 0146) stands on, as in players-online-sql.test.ts.
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
    '0144_players_online.sql',
    '0146_players_online_list.sql',
  ])
    await db.exec(sql(f))
  // 0028's players and 0131's beta_testers, as their migrations make them.
  await db.exec(`
    create table if not exists players (
      player text primary key, user_id uuid references auth.users(id) on delete set null, device_id text, name text,
      email text, first_day date not null, last_day date not null, days int not null default 1, snapshot jsonb,
      updated_at timestamptz not null default now()
    );
    create table if not exists beta_testers (
      user_id uuid primary key references auth.users(id) on delete cascade,
      added_at timestamptz not null default now(),
      note text
    );
  `)
  await db.exec(`insert into auth.users (id) values ('${ADMIN}'), ('${ASH}'), ('${MISTY}'), ('${BROCK}')`)
  await db.exec(sql('0157_player_cap.sql'))
  // Safe to run again.
  await db.exec(sql('0157_player_cap.sql'))
})

afterAll(async () => {
  await db.close()
})

beforeEach(async () => {
  await db.exec(`delete from ccu_sessions; delete from beta_testers; delete from online_here; delete from players;
    update game_config set value = ccu_defaults() where key = 'ccu';`)
})

describe('the switch and the settings', () => {
  it('ships Off: everyone gets in and is counted, nobody waits', async () => {
    const cfg = (
      await db.query<{ v: Record<string, unknown> }>(`select value as v from game_config where key = 'ccu'`)
    ).rows[0]!.v
    expect(cfg).toMatchObject({
      access: 'off',
      cap: 30,
      enforceWrites: false,
      idleMinutes: 10,
      heartbeatSeconds: 30,
    })
    await setCfg({ cap: 1 })
    for (let i = 0; i < 4; i++) expect((await join(null, `g${i}`)).status).toBe('active')
    expect(await stats()).toMatchObject({ active: 4, regular: 4, queued: 0 })
  })

  it('keeps every number in its range, a heartbeat well inside the stale time', async () => {
    const cfg = await setCfg({
      cap: -5,
      access: 'nope',
      heartbeatSeconds: 120,
      staleSeconds: 40,
      idleMinutes: 0,
      junk: 1,
    })
    expect(cfg).toMatchObject({
      cap: 0,
      access: 'off',
      heartbeatSeconds: 120,
      staleSeconds: 250,
      idleMinutes: 1,
    })
    expect(cfg).not.toHaveProperty('junk')
    // Only the keys given change.
    expect(await setCfg({ cap: 12 })).toMatchObject({ cap: 12, heartbeatSeconds: 120 })
  })

  it('leaves the settings and the counts to the admin', async () => {
    await as(ASH)
    for (const call of [
      `select ccu_admin_stats()`,
      `select ccu_admin_config('{"cap": 1000}'::jsonb)`,
      `select ccu_admin_players()`,
      `select ccu_whitelist()`,
      `select ccu_whitelist_set('${ASH}', 'me')`,
      `select ccu_whitelist_remove('${ASH}')`,
    ])
      expect(await errorOf(db.query(call))).toMatch(/admin only/)
  })
})

describe('the cap, On for everyone', () => {
  beforeEach(async () => {
    await setCfg({ access: 'all', cap: 2 })
  })

  it('never lets more in than the cap, and lines the rest up first come first served', async () => {
    const a = await join(null, 'a')
    const b = await join(null, 'b')
    const c = await join(null, 'c')
    const d = await join(null, 'd')
    expect([a.status, b.status, c.status, d.status]).toEqual(['active', 'active', 'queued', 'queued'])
    expect([c.position, d.position, d.queueLength]).toEqual([1, 2, 2])
    for (let i = 0; i < 20; i++) await join(null, `more-${i}`)
    expect(await stats()).toMatchObject({ active: 2, queued: 22 })
    // A place frees (the page closed, past the grace): the first in line gets it, by their own heartbeat or another's.
    await leave(a.token!)
    await age(a.token!, 'left_at', 61)
    expect(await beat(null, d.token!)).toMatchObject({ status: 'queued', position: 1 })
    expect(await beat(null, c.token!)).toMatchObject({ status: 'active' })
    expect(await stats()).toMatchObject({ active: 2, queued: 21 })
  })

  it('lets the admin and the whitelist in over the cap, counted, without taking a waiting turn', async () => {
    await db.exec(`insert into beta_testers (user_id) values ('${MISTY}')`)
    await join(null, 'a')
    await join(null, 'b')
    const c = await join(null, 'c')
    expect(c).toMatchObject({ status: 'queued', position: 1 })
    expect(await join(ADMIN, 'admin-pc')).toMatchObject({ status: 'active', kind: 'admin' })
    expect(await join(MISTY, 'misty-phone')).toMatchObject({ status: 'active', kind: 'whitelist' })
    expect(await stats()).toMatchObject({ active: 4, regular: 2, admin: 1, whitelist: 1, queued: 1 })
    expect(await beat(null, c.token!)).toMatchObject({ status: 'queued', position: 1 })
    // An account that isn't on the list waits like a guest.
    expect(await join(ASH, 'ash-pc')).toMatchObject({ status: 'queued', kind: 'regular', position: 2 })
  })

  it('sends nobody out when the cap goes down: it only stops letting players in until enough have left', async () => {
    await setCfg({ cap: 4 })
    const ins = await Promise.all(['a', 'b', 'c', 'd'].map((d) => join(null, d)))
    for (const i of ins) expect(i.status).toBe('active')
    await setCfg({ cap: 2 })
    for (const i of ins) expect(await beat(null, i.token!)).toMatchObject({ status: 'active' })
    const e = await join(null, 'e')
    expect(e.status).toBe('queued')
    // One leaves: 3 in, still over 2, so the line waits.
    await leave(ins[0]!.token!)
    await age(ins[0]!.token!, 'left_at', 61)
    expect(await beat(null, e.token!)).toMatchObject({ status: 'queued', position: 1 })
    await leave(ins[1]!.token!)
    await age(ins[1]!.token!, 'left_at', 61)
    await leave(ins[2]!.token!)
    await age(ins[2]!.token!, 'left_at', 61)
    expect(await beat(null, e.token!)).toMatchObject({ status: 'active' })
  })

  it('lets a higher cap in at once, from the admin panel', async () => {
    await join(null, 'a')
    await join(null, 'b')
    const c = await join(null, 'c')
    await setCfg({ cap: 3 })
    expect((await stats()).active).toBe(3)
    expect((await beat(null, c.token!)).status).toBe('active')
  })

  it('keeps the place of a page reloaded within the grace, in the game or in line', async () => {
    const a = await join(null, 'a')
    await join(null, 'b')
    const c = await join(null, 'c')
    const d = await join(null, 'd')
    // The reload: the page says it's leaving, the new one comes back with the token it kept.
    await leave(a.token!)
    await age(a.token!, 'left_at', 30)
    expect(await join(null, 'a', a.token!)).toMatchObject({ status: 'active', token: a.token })
    await leave(c.token!)
    await age(c.token!, 'left_at', 30)
    expect(await join(null, 'c', c.token!)).toMatchObject({ status: 'queued', token: c.token, position: 1 })
    // Past the grace, the place is gone: back at the end of the line.
    await leave(a.token!)
    await age(a.token!, 'left_at', 61)
    // Its place went to the first in line (c); d is next.
    const back = await join(null, 'a', a.token!)
    expect(back.token).not.toBe(a.token)
    expect(back).toMatchObject({ status: 'queued', position: 2 })
    expect(await beat(null, c.token!)).toMatchObject({ status: 'active' })
    expect(await beat(null, d.token!)).toMatchObject({ position: 1 })
  })

  it('frees the place of a game not heard from in 90 seconds', async () => {
    const a = await join(null, 'a')
    await join(null, 'b')
    const c = await join(null, 'c')
    await age(a.token!, 'last_seen', 89)
    expect(await beat(null, c.token!)).toMatchObject({ status: 'queued' })
    await age(a.token!, 'last_seen', 91)
    expect(await beat(null, c.token!)).toMatchObject({ status: 'active' })
    expect(await beat(null, a.token!)).toEqual({ status: 'gone' })
    // Its game joins again, at the end of the line.
    expect(await join(null, 'a', a.token!)).toMatchObject({ status: 'queued', position: 1 })
  })

  it('sends a regular player idle for 10 minutes to the back of the line, only when someone waits', async () => {
    await db.exec(`insert into beta_testers (user_id) values ('${MISTY}')`)
    await setCfg({ cap: 3 })
    const a = await join(null, 'a')
    const b = await join(null, 'b')
    const m = await join(MISTY, 'misty')
    for (const s of [a, m]) await age(s.token!, 'last_input', 11 * 60)
    // Nobody waits: idle or not, they stay.
    expect(await beat(null, a.token!)).toMatchObject({ status: 'active' })
    // Someone comes: the idle regular player goes to the back of the line, and the newcomer gets the place. The
    // whitelisted one, idle too, stays; so does b, who played.
    expect(await join(null, 'c')).toMatchObject({ status: 'active' })
    expect(await beat(null, a.token!)).toMatchObject({ status: 'queued', reason: 'idle', position: 1 })
    expect(await beat(MISTY, m.token!)).toMatchObject({ status: 'active' })
    expect(await beat(null, b.token!, true)).toMatchObject({ status: 'active' })
    // Nobody else idle: the next one waits behind a.
    const d = await join(null, 'd')
    expect(d).toMatchObject({ status: 'queued', position: 2 })
    expect(await stats()).toMatchObject({ active: 3, queued: 2, idleQueued: 1 })
    // Input counts: a player who taps isn't idle.
    await age(b.token!, 'last_input', 11 * 60)
    expect(await beat(null, b.token!, true)).toMatchObject({ status: 'active' })
  })

  it('gives every tab and device of one player a single place', async () => {
    const tab1 = await join(null, 'same-device')
    const tab2 = await join(null, 'same-device')
    expect(tab2.token).toBe(tab1.token)
    const phone = await join(ASH, 'phone')
    const pc = await join(ASH, 'pc')
    expect(pc.token).toBe(phone.token)
    expect((await stats()).active).toBe(2)
    // One tab closing doesn't free the place while the other still beats.
    await leave(tab1.token!)
    await age(tab1.token!, 'left_at', 30)
    expect(await beat(null, tab2.token!)).toMatchObject({ status: 'active' })
    const left = await db.query(`select left_at from ccu_sessions where token = $1`, [tab1.token])
    expect(left.rows).toEqual([{ left_at: null }])
  })

  it('carries a guest’s place to the account they sign in to, and lets a whitelisted one in at once', async () => {
    await join(null, 'a')
    await join(null, 'b')
    const guest = await join(null, 'misty-guest')
    const other = await join(null, 'other')
    expect(guest.position).toBe(1)
    // Signing in as a regular account: the same place in line.
    await db.exec(`update auth.users set id = id`)
    expect(await join(ASH, 'misty-guest', guest.token!)).toMatchObject({
      status: 'queued',
      token: guest.token,
      position: 1,
    })
    // Its old token now beats as nobody: the game joins again, under the new name.
    expect(await beat(null, guest.token!)).toEqual({ status: 'gone' })
    // Whitelisted by the admin while waiting: in at the next heartbeat, past the cap.
    await as(ADMIN)
    await db.query(`select ccu_whitelist_set($1, 'tester')`, [ASH])
    expect(await beat(ASH, guest.token!)).toMatchObject({ status: 'active', kind: 'whitelist' })
    expect(await beat(null, other.token!)).toMatchObject({ status: 'queued', position: 1 })
    // A whitelisted account signing in from the line: straight in.
    await db.exec(`insert into beta_testers (user_id) values ('${MISTY}')`)
    const g2 = await join(null, 'misty-2')
    expect(g2.status).toBe('queued')
    expect(await join(MISTY, 'misty-2', g2.token!)).toMatchObject({
      status: 'active',
      kind: 'whitelist',
      token: g2.token,
    })
  })

  it('gives a player who signs out on one device a place of their own, the account’s staying with its other devices', async () => {
    await setCfg({ cap: 3 })
    const pc = await join(ASH, 'pc')
    const phone = await join(ASH, 'phone')
    // The phone signs out: its heartbeat on the account's token says 'gone', and it joins as a guest.
    expect(await beat(null, phone.token!)).toEqual({ status: 'gone' })
    const guest = await join(null, 'phone', phone.token!)
    expect(guest.token).not.toBe(pc.token)
    expect(await beat(ASH, pc.token!)).toMatchObject({ status: 'active', token: pc.token })
    expect((await stats()).active).toBe(2)
  })

  it('refuses a hand-made device id', async () => {
    expect(await errorOf(join(null, 'x'.repeat(100)))).toMatch(/ccu_no_device/)
    expect(await errorOf(join(null, ''))).toMatch(/ccu_no_device/)
  })
})

describe('On for admin', () => {
  it('puts the admin’s own game in line as a regular player, everyone else in', async () => {
    await setCfg({ access: 'admin', cap: 1 })
    await join(null, 'a')
    await join(null, 'b')
    const admin = await join(ADMIN, 'admin-pc')
    expect(admin).toMatchObject({ status: 'queued', position: 1, kind: 'admin' })
    await setCfg({ cap: 3 })
    expect(await beat(ADMIN, admin.token!)).toMatchObject({ status: 'active' })
  })
})

describe('the heartbeat carries the players-online card', () => {
  it('stamps online_here and answers the count', async () => {
    const a = await join(ASH, 'ash-pc')
    const r = await beat(ASH, a.token!, true, {
      name: 'Ash',
      look: 'red',
      badges: 8,
      team: [{ dex: 25, level: 30 }],
    })
    expect(r.online).toBe(1)
    const row = (
      await db.query<{ who: string; name: string; badges: number }>(
        `select who, name, badges from online_here`,
      )
    ).rows
    expect(row).toEqual([{ who: ASH, name: 'Ash', badges: 8 }])
    // Without a card, nothing is stamped and no count comes back.
    expect(await beat(ASH, a.token!)).not.toHaveProperty('online')
  })
})

describe('the whitelist editor', () => {
  it('adds with a note, lists with names and e-mails, removes, and offers the signed-in players', async () => {
    await db.exec(`insert into players (player, user_id, name, email, first_day, last_day) values
      ('${ASH}', '${ASH}', 'Ash', 'ash@example.com', '2026-11-01', '2026-11-20'),
      ('${MISTY}', '${MISTY}', 'Misty', 'misty@example.com', '2026-11-01', '2026-11-21'),
      ('device:guest', null, 'Guest', null, '2026-11-01', '2026-11-22')`)
    await as(ADMIN)
    const players = (
      await db.query<{ r: { id: string; name: string; email: string }[] }>(`select ccu_admin_players() as r`)
    ).rows[0]!.r
    expect(players.map((p) => p.name)).toEqual(['Misty', 'Ash'])
    await db.query(`select ccu_whitelist_set($1, 'streamer')`, [ASH])
    await db.query(`select ccu_whitelist_set($1, 'mod')`, [ASH])
    const list = (await db.query<{ r: unknown[] }>(`select ccu_whitelist() as r`)).rows[0]!.r
    expect(list).toEqual([
      expect.objectContaining({ id: ASH, name: 'Ash', email: 'ash@example.com', note: 'mod' }),
    ])
    expect(
      await errorOf(db.query(`select ccu_whitelist_set('00000000-0000-4000-8000-0000000000ff', null)`)),
    ).toMatch(/ccu_no_account/)
    // Off the list: a regular player from now on, never sent out for it.
    await setCfg({ access: 'all', cap: 0 })
    const a = await join(ASH, 'ash')
    expect(a.status).toBe('active')
    await as(ADMIN)
    await db.query(`select ccu_whitelist_remove($1)`, [ASH])
    expect(await beat(ASH, a.token!)).toMatchObject({ status: 'active', kind: 'regular' })
    await as(ADMIN)
    expect((await db.query<{ r: unknown[] }>(`select ccu_whitelist() as r`)).rows[0]!.r).toEqual([])
  })
})

describe('the gate (PostgREST pre-request)', () => {
  async function request(o: {
    user?: string | null
    role?: string
    path: string
    method?: string
    token?: string | null
  }) {
    await as(o.user ?? null)
    await db.query(`select set_config('request.jwt.claim.role', $1, false)`, [o.role ?? ''])
    await db.query(`select set_config('request.path', $1, false)`, [o.path])
    await db.query(`select set_config('request.method', $1, false)`, [o.method ?? 'POST'])
    await db.query(`select set_config('request.headers', $1, false)`, [
      JSON.stringify(o.token ? { 'x-ccu-token': o.token } : {}),
    ])
    return errorOf(db.query(`select ccu_check_request()`))
  }

  it('lets everything through while enforceWrites is off', async () => {
    expect(await request({ path: '/rpc/versus_record' })).toBe('')
    expect(await request({ path: '/saves', method: 'PATCH' })).toBe('')
  })

  it('needs an active place for the game’s calls once it is on', async () => {
    await setCfg({ access: 'all', cap: 1, enforceWrites: true })
    const a = await join(null, 'a')
    const b = await join(null, 'b')
    expect(b.status).toBe('queued')
    // No token, a waiting one, a made-up one: refused.
    expect(await request({ path: '/rpc/versus_record' })).toMatch(/ccu_required/)
    expect(await request({ path: '/rpc/online_ping', token: b.token! })).toMatch(/ccu_required/)
    expect(await request({ path: '/rpc/trade_post', token: 'nope' })).toMatch(/ccu_required/)
    expect(await request({ path: '/saves', method: 'PATCH' })).toMatch(/ccu_required/)
    expect(await request({ path: '/saves', method: 'GET' })).toMatch(/ccu_required/)
    expect(await request({ path: '/feedback', method: 'POST' })).toMatch(/ccu_required/)
    // In the game: through.
    expect(await request({ path: '/rpc/versus_record', token: a.token! })).toBe('')
    expect(await request({ path: '/saves', method: 'PATCH', token: a.token! })).toBe('')
    // Never gated: the cap's own calls, the clock, content reads, the admin, the service role.
    for (const fn of [
      'ccu_join',
      'ccu_heartbeat',
      'ccu_leave',
      'event_time',
      'delete_my_data',
      'push_unsubscribe',
    ])
      expect(await request({ path: `/rpc/${fn}` })).toBe('')
    expect(await request({ path: '/pokemon', method: 'GET' })).toBe('')
    expect(await request({ path: '/game_config', method: 'GET' })).toBe('')
    expect(await request({ path: '/rpc/versus_record', user: ADMIN })).toBe('')
    expect(await request({ path: '/saves', method: 'PATCH', role: 'service_role' })).toBe('')
    // A lost session loses the right too.
    await age(a.token!, 'last_seen', 91)
    expect(await request({ path: '/rpc/versus_record', token: a.token! })).toMatch(/ccu_required/)
  })

  it('answers with HTTP 428 in PostgREST’s format', async () => {
    await setCfg({ enforceWrites: true })
    await as(null)
    await db.query(`select set_config('request.path', '/rpc/versus_record', false)`)
    await db.query(`select set_config('request.headers', '{}', false)`)
    try {
      await db.query(`select ccu_check_request()`)
      expect.unreachable()
    } catch (err) {
      const e = err as { code?: string; message: string; detail?: string }
      expect(e.code).toBe('PGRST')
      expect(JSON.parse(e.message)).toMatchObject({ code: 'ccu_required' })
      expect(JSON.parse(e.detail!)).toMatchObject({ status: 428 })
    }
  })
})
