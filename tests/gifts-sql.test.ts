// Migration 0048 against a real Postgres (PGlite, in process): gifts with the developer's messages (docs/15 §23). Only
// the admin can attach a gift or write to a player first; a player's own message never carries one; the switch hides
// and locks them; each gift is claimed once, by the player it's for. Supabase's own pieces (the auth schema, the anon /
// authenticated roles) are stood in for at the top, as in friends-sql.test.ts.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '@/engine'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')

const ADMIN = 'gregoire.ftn@gmail.com'
const U = {
  admin: '00000000-0000-4000-8000-0000000000aa',
  ash: '00000000-0000-4000-8000-000000000001',
  misty: '00000000-0000-4000-8000-000000000002',
}
const GIFTS = [
  { kind: 'item', key: 'rare-candy', qty: 5, region: 'latest' },
  { kind: 'pokemon', dex: 25, level: 20, shiny: true, region: 'kanto' },
]

let db: PGlite

/** Runs as a signed-in user (with their email for the admin), or as a guest. */
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
const setAccess = (access: string) =>
  db.query(`update game_config set value = jsonb_build_object('access', $1::text) where key = 'gifts'`, [
    access,
  ])

type Row = {
  id: number
  gifts: unknown
  gifts_claimed: boolean
  reply: string | null
  from_admin: boolean
  reply_seen: boolean
}
const mine = (user: string | null, device = 'dev-guest') =>
  as<Row>(user, `select * from my_feedback($1)`, [device])
const claim = (user: string | null, ids: number[], device = 'dev-guest') =>
  as<{ id: number; gifts: unknown }>(user, `select * from feedback_claim_gifts($1::bigint[], $2)`, [
    ids,
    device,
  ])

/** The admin writes to a player first, from their profile. */
const adminWrites = (o: { user?: string | null; device?: string; gifts?: unknown; reply?: string }) =>
  as<{ id: number }>(
    U.admin,
    `insert into feedback (user_id, device_id, player_name, title, message, reply, gifts, from_admin)
     values ($1, $2, 'Ash', 'A gift for you', '', $3, $4::jsonb, true) returning id`,
    [
      o.user ?? null,
      o.device ?? '',
      o.reply ?? 'Thanks for the bug report!',
      o.gifts === undefined ? null : JSON.stringify(o.gifts),
    ],
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
  for (const f of ['0019_feedback.sql', '0025_feedback_replies.sql', '0048_message_gifts.sql'])
    await db.exec(sql(f))
  // Safe to run again.
  await db.exec(sql('0048_message_gifts.sql'))
  await db.exec(
    `insert into auth.users (id) values ${Object.values(U)
      .map((u) => `('${u}')`)
      .join(',')}`,
  )
})

describe('the switch', () => {
  it('ships off, as the game’s default', async () => {
    const [row] = await as<{ value: unknown }>(null, `select value from game_config where key = 'gifts'`)
    expect(row!.value).toEqual(DEFAULT_CONFIG.gifts)
  })
  it('is on for the admin alone at "admin", for everyone at "all"', async () => {
    const open = async (u: string | null) => (await as<{ o: boolean }>(u, 'select gifts_open() o'))[0]!.o
    expect(await open(U.ash)).toBe(false)
    await setAccess('admin')
    expect([await open(U.admin), await open(U.ash)]).toEqual([true, false])
    await setAccess('all')
    expect([await open(U.admin), await open(U.ash), await open(null)]).toEqual([true, true, true])
  })
})

describe('who can write a gift', () => {
  it('a player’s own message never carries one, nor passes as the admin’s', async () => {
    const [m] = await as<{ id: number }>(
      U.ash,
      `insert into feedback (device_id, title, message, reply, gifts, from_admin, user_id)
       values ('dev-ash', 'Hi', 'Free stuff?', 'yes', $1::jsonb, true, $2) returning id`,
      [JSON.stringify(GIFTS), U.misty],
    )
    const [row] = await as<Record<string, unknown>>(null, 'select * from feedback where id = $1', [m!.id])
    expect(row).toMatchObject({ gifts: null, from_admin: false, reply: null, user_id: U.ash, read: false })
  })

  it('the admin answers with a gift: the answer pops up again, with it', async () => {
    const [m] = await as<{ id: number }>(
      U.ash,
      `insert into feedback (device_id, title, message) values ('dev-ash', 'Lost my Pikachu', 'After the update') returning id`,
    )
    await as(U.admin, `update feedback set reply = 'Here it is', gifts = $2::jsonb where id = $1`, [
      m!.id,
      JSON.stringify(GIFTS),
    ])
    const got = (await mine(U.ash, 'dev-ash')).find((r) => r.id === m!.id)!
    expect(got).toMatchObject({
      reply: 'Here it is',
      gifts: GIFTS,
      gifts_claimed: false,
      from_admin: false,
      reply_seen: false,
    })
  })

  it('refuses a gift without words, and gifts that break the rules', async () => {
    const [m] = await as<{ id: number }>(
      U.ash,
      `insert into feedback (device_id, title, message) values ('d', 'x', 'y') returning id`,
    )
    expect(
      await fails(U.admin, `update feedback set gifts = $2::jsonb where id = $1`, [
        m!.id,
        JSON.stringify(GIFTS),
      ]),
    ).toMatch(/feedback_gifts_need_reply/)
    const bad = [
      [],
      [{ kind: 'item', key: 'rare-candy', qty: 0, region: 'latest' }],
      [{ kind: 'item', key: 'rare-candy', qty: 1000, region: 'latest' }],
      [{ kind: 'item', key: 'rare-candy', qty: 2.5, region: 'latest' }],
      [{ kind: 'item', key: 'rare candy; drop', qty: 1, region: 'latest' }],
      [{ kind: 'pokemon', dex: 25, level: 101, region: 'kanto' }],
      [{ kind: 'pokemon', dex: '25', level: 5, region: 'kanto' }],
      [{ kind: 'pokemon', dex: 25, level: 5, shiny: 'yes', region: 'kanto' }],
      [{ kind: 'pokemon', dex: 25, level: 5 }],
      [{ kind: 'gold', amount: 100, region: 'kanto' }],
      Array.from({ length: 21 }, () => GIFTS[0]),
    ]
    for (const g of bad)
      expect(
        await fails(U.admin, `update feedback set reply = 'ok', gifts = $2::jsonb where id = $1`, [
          m!.id,
          JSON.stringify(g),
        ]),
        JSON.stringify(g),
      ).toMatch(/feedback_gifts_ok/)
  })

  it('the admin writes to a player first: theirs alone, read already, counting toward no limit', async () => {
    const [m] = await adminWrites({ user: U.misty, gifts: GIFTS })
    const [row] = await as<Record<string, unknown>>(null, 'select * from feedback where id = $1', [m!.id])
    expect(row).toMatchObject({
      user_id: U.misty,
      from_admin: true,
      read: true,
      reply: 'Thanks for the bug report!',
    })
    expect(row!.replied_at).not.toBeNull()
    expect((await mine(U.misty)).map((r) => r.id)).toContain(m!.id)
    expect((await mine(U.ash, 'dev-ash')).map((r) => r.id)).not.toContain(m!.id)
    // Three of the admin's in a row don't stop Misty writing.
    await adminWrites({ user: U.misty })
    await adminWrites({ user: U.misty })
    expect(
      await fails(
        U.misty,
        `insert into feedback (device_id, title, message) values ('dev-misty', 'Thanks!', 'Got it')`,
      ),
    ).toBe('no error')
  })

  it('needs a player and words', async () => {
    expect(
      await fails(
        U.admin,
        `insert into feedback (device_id, title, message, reply, from_admin) values ('', 't', '', 'hi', true)`,
      ),
    ).toMatch(/feedback_no_player/)
    expect(
      await fails(
        U.admin,
        `insert into feedback (user_id, device_id, title, message, reply, from_admin) values ($1, '', 't', '', '  ', true)`,
        [U.ash],
      ),
    ).toMatch(/feedback_admin_reply/)
  })
})

describe('opening a gift', () => {
  it('a guest’s gift is found and opened by their device, once', async () => {
    const [m] = await adminWrites({ device: 'dev-leaf', gifts: GIFTS })
    expect((await mine(null, 'dev-other')).map((r) => r.id)).not.toContain(m!.id)
    expect(await claim(null, [m!.id], 'dev-other')).toEqual([])
    expect(await claim(null, [m!.id], 'dev-leaf')).toEqual([{ id: m!.id, gifts: GIFTS }])
    expect(await claim(null, [m!.id], 'dev-leaf')).toEqual([])
    expect((await mine(null, 'dev-leaf')).find((r) => r.id === m!.id)).toMatchObject({ gifts_claimed: true })
  })

  it('a signed-in player’s, by their account only', async () => {
    const [m] = await adminWrites({ user: U.ash, gifts: GIFTS })
    expect(await claim(U.misty, [m!.id])).toEqual([])
    expect(await claim(null, [m!.id], '')).toEqual([])
    expect(await claim(U.ash, [m!.id])).toEqual([{ id: m!.id, gifts: GIFTS }])
  })

  it('an opened gift can’t be changed or opened again', async () => {
    const [m] = await adminWrites({ user: U.ash, gifts: GIFTS })
    await claim(U.ash, [m!.id])
    await as(U.admin, `update feedback set gifts = $2::jsonb, gifts_claimed_at = null where id = $1`, [
      m!.id,
      JSON.stringify([{ kind: 'item', key: 'master-ball', qty: 99, region: 'latest' }]),
    ])
    const [row] = await as<{ gifts: unknown; gifts_claimed_at: string | null }>(
      null,
      'select gifts, gifts_claimed_at from feedback where id = $1',
      [m!.id],
    )
    expect(row!.gifts).toEqual(GIFTS)
    expect(row!.gifts_claimed_at).not.toBeNull()
    expect(await claim(U.ash, [m!.id])).toEqual([])
  })

  it('off, the gifts hide and wait on their rows', async () => {
    const [m] = await adminWrites({ user: U.ash, gifts: GIFTS })
    await setAccess('off')
    expect((await mine(U.ash)).find((r) => r.id === m!.id)).toMatchObject({
      gifts: null,
      gifts_claimed: false,
    })
    expect(await fails(U.ash, `select * from feedback_claim_gifts($1::bigint[], '')`, [[m!.id]])).toMatch(
      /gifts_off/,
    )
    await setAccess('admin')
    expect(await fails(U.ash, `select * from feedback_claim_gifts($1::bigint[], '')`, [[m!.id]])).toMatch(
      /gifts_off/,
    )
    await setAccess('all')
    expect(await claim(U.ash, [m!.id])).toEqual([{ id: m!.id, gifts: GIFTS }])
  })

  it('a player still sees and marks their answers seen as before', async () => {
    const [m] = await adminWrites({ user: U.ash })
    await as(U.ash, `select feedback_reply_seen($1::bigint[], '')`, [[m!.id]])
    expect((await mine(U.ash)).find((r) => r.id === m!.id)).toMatchObject({ reply_seen: true, gifts: null })
  })
})
