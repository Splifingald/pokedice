// Migration 0143 against a real Postgres (PGlite, in process): global messages (docs/69). The switch gates the claim;
// each player gets their copy of every running message whose badge range takes their count, once; a signed-in player
// is counted on their trainer card when the server has one; a stopped message reaches no one new; a guest's copies
// follow them into their account; the copies are developer's messages whose gifts open once (0048); only the claim
// writes one; the admin's numbers; and the engine's range rule (engine/broadcasts.ts) gives the same answers.
// Supabase's own pieces (the auth schema, the anon / authenticated roles) are stood in for at the top, as in
// welcome-back-sql.test.ts.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { broadcastReaches } from '@/engine'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')

const ADMIN = 'gregoire.ftn@gmail.com'
const U = {
  admin: '00000000-0000-4000-8000-0000000000aa',
  ash: '00000000-0000-4000-8000-000000000001',
  misty: '00000000-0000-4000-8000-000000000002',
  brock: '00000000-0000-4000-8000-000000000003',
}

let db: PGlite

async function as<T = Record<string, unknown>>(
  user: string | null,
  q: string,
  params: unknown[] = [],
): Promise<T[]> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? ''])
  await db.query(`select set_config('request.jwt.claim.email', $1, false)`, [user === U.admin ? ADMIN : ''])
  return (await db.query<T>(q, params)).rows
}
async function fails(user: string | null, q: string, params: unknown[] = []): Promise<string> {
  try {
    await as(user, q, params)
  } catch (e) {
    return (e as Error).message
  }
  return 'no error'
}

const GOLD = [{ kind: 'gold', amount: 500, region: 'latest' }]

/** A message, as the admin writes it in Admin › Messages. */
async function post(
  title: string,
  min = 0,
  max: number | null = null,
  gifts: unknown = null,
): Promise<number> {
  const [row] = await as<{ id: number }>(
    U.admin,
    `insert into broadcasts (title, body, min_badges, max_badges, gifts) values ($1, $2, $3, $4, $5) returning id`,
    [
      title,
      `Words of ${title}\nhttps://youtu.be/dQw4w9WgXcQ`,
      min,
      max,
      gifts == null ? null : JSON.stringify(gifts),
    ],
  )
  return Number(row!.id)
}

const claim = async (user: string | null, device: string, badges: number) =>
  Number((await as<{ n: number }>(user, `select broadcast_claim($1, $2) n`, [device, badges]))[0]!.n)

type Msg = {
  id: number
  title: string
  reply: string | null
  from_admin: boolean
  gifts: unknown
  gifts_claimed: boolean
  broadcast: boolean
}
const inbox = (user: string | null, device: string) =>
  as<Msg>(user, `select * from my_feedback($1)`, [device])
const titles = async (user: string | null, device: string) =>
  (await inbox(user, device))
    .filter((m) => m.broadcast)
    .map((m) => m.title)
    .sort()

/** A signed-in player's trainer card (0033 / 0039): the badges the server holds for them, region by region. */
const card = (user: string, ...badges: number[]) =>
  db.query(
    `insert into player_card_regions (user_id, realm, region, badges)
     select $1, 'main', 'r' || i, array_fill('b'::text, array[n]) from unnest($2::int[]) with ordinality as t(n, i)`,
    [user, badges],
  )

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
    '0019_feedback.sql',
    '0025_feedback_replies.sql',
    '0028_analytics_minimal.sql',
    '0048_message_gifts.sql',
    '0103_welcome_back.sql',
  ])
    await db.exec(sql(f))
  // A database that ran this file's first version, which had a switch: its row and its function.
  await db.exec(`
    insert into game_config (key, value) values ('broadcasts', '{"access": "off"}');
    create function broadcasts_open() returns boolean language sql as $$ select false $$;
  `)
  await db.exec(sql('0143_broadcasts.sql'))
  // Safe to run again.
  await db.exec(sql('0143_broadcasts.sql'))
  // The trainer cards' badges (0033's table, with 0039's realm), as much of it as the claim reads.
  await db.exec(`
    create table player_card_regions (user_id uuid, realm text not null default 'main', region text, badges text[] not null,
      primary key (user_id, realm, region));
  `)
  await db.exec(
    `insert into auth.users (id) values ${Object.values(U)
      .map((u) => `('${u}')`)
      .join(',')}`,
  )
  await db.query(`update game_config set value = '{"access":"all"}' where key = 'gifts'`)
})

afterAll(async () => {
  await db?.close()
})

describe('no switch (the user’s call, 2026-11-08)', () => {
  it('reaches every player at once, and a run of the first version (with a switch) is cleaned up', async () => {
    await post('Hello')
    expect(await claim(null, 'dev-any', 3)).toBe(1)
    expect(await claim(U.ash, 'dev-ash', 3)).toBe(1)
    const [row] = await as<{ n: number }>(
      null,
      `select count(*)::int n from game_config where key = 'broadcasts'`,
    )
    expect(row!.n).toBe(0)
    const [fn] = await as<{ f: string | null }>(null, `select to_regproc('broadcasts_open')::text f`)
    expect(fn!.f).toBeNull()
    await as(U.admin, 'delete from broadcasts')
  })

  it('refuses a missing or oversized device id', async () => {
    expect(await fails(null, `select broadcast_claim('', 3)`)).toContain('bad device id')
    expect(await fails(null, `select broadcast_claim($1, 3)`, ['x'.repeat(65)])).toContain('bad device id')
  })
})

describe('who gets it', () => {
  it('each message whose badge range takes the count, once, as a developer’s message on Home', async () => {
    await post('Everyone')
    await post('From 2 to 5', 2, 5)
    await post('From 5', 5)
    await post('Up to 2', 0, 2, GOLD)
    expect(await claim(null, 'dev-3', 3)).toBe(2)
    expect(await titles(null, 'dev-3')).toEqual(['Everyone', 'From 2 to 5'])
    const [m] = (await inbox(null, 'dev-3')).filter((x) => x.title === 'Everyone')
    expect(m).toMatchObject({
      from_admin: true,
      broadcast: true,
      reply: 'Words of Everyone\nhttps://youtu.be/dQw4w9WgXcQ',
      gifts: null,
    })
    // Asked again: nothing more.
    expect(await claim(null, 'dev-3', 3)).toBe(0)
    // A new badge brings what it reaches now (the one it outgrew stays out).
    expect(await claim(null, 'dev-3', 5)).toBe(1)
    expect(await titles(null, 'dev-3')).toEqual(['Everyone', 'From 2 to 5', 'From 5'])
    // Another player, at the start, gets the ones for beginners.
    expect(await claim(null, 'dev-0', 0)).toBe(2)
    expect(await titles(null, 'dev-0')).toEqual(['Everyone', 'Up to 2'])
    // An odd count from the game is held to 0–999.
    expect(await claim(null, 'dev-neg', -4)).toBe(2)
    expect(await claim(null, 'dev-big', 100000)).toBe(2)
    expect(await titles(null, 'dev-big')).toEqual(['Everyone', 'From 5'])
  })

  it('the engine and the SQL agree on the range, ends included', async () => {
    const ranges: [number, number | null][] = [
      [0, null],
      [3, null],
      [0, 0],
      [2, 4],
      [8, 8],
    ]
    await as(U.admin, 'delete from broadcasts')
    const ids = []
    for (const [min, max] of ranges) ids.push(await post(`range ${min}-${max}`, min, max))
    for (const badges of [0, 1, 2, 3, 4, 5, 8, 9, 40]) {
      const device = `dev-agree-${badges}`
      await claim(null, device, badges)
      const got = await titles(null, device)
      const want = ranges
        .filter(([min, max]) => broadcastReaches({ minBadges: min, maxBadges: max }, badges))
        .map(([min, max]) => `range ${min}-${max}`)
        .sort()
      expect(got, `${badges} badges`).toEqual(want)
    }
  })

  it('a stopped message reaches no one new; its copies stay; deleting it takes them away', async () => {
    await as(U.admin, 'delete from broadcasts')
    const id = await post('Soon stopped')
    expect(await claim(null, 'dev-early', 1)).toBe(1)
    await as(U.admin, 'update broadcasts set active = false where id = $1', [id])
    expect(await claim(null, 'dev-late', 1)).toBe(0)
    expect(await titles(null, 'dev-early')).toEqual(['Soon stopped'])
    await as(U.admin, 'delete from broadcasts where id = $1', [id])
    expect(await titles(null, 'dev-early')).toEqual([])
  })

  it('the admin’s form is held to its limits: the range, the words, no Heart Scales', async () => {
    const bad = async (q: string, params: unknown[]) => fails(U.admin, q, params)
    const ins = `insert into broadcasts (title, body, min_badges, max_badges, gifts) values ($1, $2, $3, $4, $5)`
    expect(await bad(ins, ['T', 'B', 5, 4, null])).toContain('broadcasts_badges')
    expect(await bad(ins, ['T', 'B', -1, null, null])).toContain('broadcasts_badges')
    expect(await bad(ins, ['T', 'B', 0, 1000, null])).toContain('broadcasts_badges')
    expect(await bad(ins, [' ', 'B', 0, null, null])).toContain('broadcasts_title_len')
    expect(await bad(ins, ['T', 'x'.repeat(4001), 0, null, null])).toContain('broadcasts_body_len')
    expect(
      await bad(ins, [
        'T',
        'B',
        0,
        null,
        JSON.stringify([{ kind: 'heartScales', amount: 5, region: 'latest' }]),
      ]),
    ).toContain('broadcasts_gifts_ok')
    expect(
      await bad(ins, [
        'T',
        'B',
        0,
        null,
        JSON.stringify([{ kind: 'item', key: 'potion', qty: 0, region: 'latest' }]),
      ]),
    ).toContain('broadcasts_gifts_ok')
  })
})

describe('accounts and guests', () => {
  it('a signed-in player is counted on their trainer card when the server has one, else on the game’s word', async () => {
    await as(U.admin, 'delete from broadcasts')
    await post('Beginners', 0, 1)
    await post('Veterans', 10)
    await card(U.ash, 1, 0)
    // The game says 99; the card holds 1.
    expect(await claim(U.ash, 'dev-ash', 99)).toBe(1)
    expect(await titles(U.ash, 'dev-ash')).toEqual(['Beginners'])
    // No card yet: the game's word.
    expect(await claim(U.misty, 'dev-misty', 12)).toBe(1)
    expect(await titles(U.misty, 'dev-misty')).toEqual(['Veterans'])
  })

  it('a guest’s copies follow them into their account, and the account never gets a second one', async () => {
    await as(U.admin, 'delete from broadcasts')
    await post('Shared', 0, null, GOLD)
    await post('Only on the tablet')
    // Brock had it on his phone already, signed in.
    await as(U.admin, 'update broadcasts set active = false where title = $1', ['Only on the tablet'])
    expect(await claim(U.brock, 'dev-phone', 2)).toBe(1)
    await as(U.admin, 'update broadcasts set active = true where title = $1', ['Only on the tablet'])
    // As a guest on his tablet, both.
    expect(await claim(null, 'dev-tablet', 2)).toBe(2)
    // He signs in on the tablet: the tablet's "Shared" goes (his account has it), "Only on the tablet" joins the account.
    expect(await claim(U.brock, 'dev-tablet', 2)).toBe(0)
    expect(await titles(U.brock, 'dev-tablet')).toEqual(['Only on the tablet', 'Shared'])
    expect(await titles(U.brock, 'dev-phone')).toEqual(['Only on the tablet', 'Shared'])
    // And the tablet's guest has nothing left of his.
    expect(await titles(null, 'dev-tablet')).toEqual([])
  })

  it('its gift opens once, through the messages’ own opening', async () => {
    await as(U.admin, 'delete from broadcasts')
    await post('Gift for all', 0, null, GOLD)
    expect(await claim(null, 'dev-gift', 4)).toBe(1)
    const [m] = await inbox(null, 'dev-gift')
    expect(m!.gifts).toEqual(GOLD)
    const first = await as<{ id: number }>(null, `select * from feedback_claim_gifts($1, 'dev-gift')`, [
      [m!.id],
    ])
    expect(first).toHaveLength(1)
    const again = await as<{ id: number }>(null, `select * from feedback_claim_gifts($1, 'dev-gift')`, [
      [m!.id],
    ])
    expect(again).toHaveLength(0)
  })
})

describe('only the server writes a copy', () => {
  it('a player’s own message never carries one, and nobody but the admin reads the messages or their numbers', async () => {
    await as(U.admin, 'delete from broadcasts')
    const id = await post('Real')
    await db.exec('set session authorization authenticated')
    try {
      await as(
        U.misty,
        `insert into feedback (device_id, title, message, broadcast_id) values ('forged', 'Hi', 'hi', $1)`,
        [id],
      )
      expect(await as(U.misty, 'select * from broadcasts')).toEqual([])
      expect(await fails(U.misty, `insert into broadcasts (title, body) values ('x', 'y')`)).toContain(
        'row-level security',
      )
      expect(await as(U.misty, 'select * from broadcast_stats()')).toEqual([])
      // The forged one doesn't stop the real copy from coming.
      expect(await claim(U.misty, 'forged', 1)).toBe(1)
    } finally {
      await db.exec('set session authorization postgres')
    }
    const rows = await as<{ title: string; broadcast_id: number | null }>(
      U.admin,
      `select title, broadcast_id from feedback where device_id = 'forged' order by id`,
    )
    expect(rows).toEqual([
      { title: 'Hi', broadcast_id: null },
      { title: 'Real', broadcast_id: id },
    ])
  })

  it('the admin’s numbers: copies, seen, gifts opened', async () => {
    await as(U.admin, 'delete from broadcasts')
    const id = await post('Counted', 0, null, GOLD)
    await claim(null, 'dev-s1', 1)
    await claim(null, 'dev-s2', 1)
    const [m] = await inbox(null, 'dev-s1')
    await as(null, `select feedback_reply_seen($1, 'dev-s1')`, [[m!.id]])
    await as(null, `select * from feedback_claim_gifts($1, 'dev-s1')`, [[m!.id]])
    const [s] = await as<{ id: number; sent: number; seen: number; opened: number }>(
      U.admin,
      'select id, sent::int, seen::int, opened::int from broadcast_stats()',
    )
    expect(s).toEqual({ id, sent: 2, seen: 1, opened: 1 })
  })
})
