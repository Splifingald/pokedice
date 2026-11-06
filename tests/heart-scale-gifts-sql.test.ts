// Migration 0121 against a real Postgres (PGlite, in process): Heart Scales as a message gift (docs/15 §23, docs/60).
// Only a message to an account can carry them; opening the message pays them into that player's wallet, once, without
// touching the streaks' daily count; a malformed amount is refused. Supabase's own pieces (auth, the roles) are stood
// in for at the top, as in gifts-sql.test.ts.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')
const FILE = '0121_heart_scale_gifts.sql'

const ADMIN = 'gregoire.ftn@gmail.com'
const U = {
  admin: '00000000-0000-4000-8000-0000000000aa',
  ash: '00000000-0000-4000-8000-000000000001',
  misty: '00000000-0000-4000-8000-000000000002',
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

/** The admin writes to a player first, from their profile: an account, or a guest's device. */
const adminWrites = (o: { user?: string | null; device?: string; gifts: unknown }) =>
  as<{ id: number }>(
    U.admin,
    `insert into feedback (user_id, device_id, player_name, title, message, reply, gifts, from_admin)
     values ($1, $2, 'Ash', 'For you', '', 'Thanks!', $3::jsonb, true) returning id`,
    [o.user ?? null, o.device ?? '', JSON.stringify(o.gifts)],
  )
const claim = (user: string | null, ids: number[], device = 'dev-guest') =>
  as<{ id: number; gifts: unknown }>(user, `select * from feedback_claim_gifts($1::bigint[], $2)`, [
    ids,
    device,
  ])
const wallet = async (user: string) =>
  (
    await db.query<{ balance: number; earned: number; total: number }>(
      `select balance, earned, total from friendship_wallets where user_id = $1`,
      [user],
    )
  ).rows[0] ?? null
const scales = (amount: unknown) => [{ kind: 'heartScales', amount, region: 'latest' }]

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
    '0047_trades_admin_read.sql',
    '0048_message_gifts.sql',
    '0049_general_upgrades.sql',
    '0107_friendship.sql',
    FILE,
  ])
    await db.exec(sql(f))
  // Safe to run again.
  await db.exec(sql(FILE))
  await db.exec(
    `insert into auth.users (id) values ${Object.values(U)
      .map((u) => `('${u}')`)
      .join(',')}`,
  )
  await db.query(`update game_config set value = '{"access": "all"}'::jsonb where key = 'gifts'`)
})

afterAll(async () => {
  await db?.close()
})

describe('the check', () => {
  it('takes Heart Scales from 1 to 9,999, whole', async () => {
    const ok = async (g: unknown) =>
      (await as<{ ok: boolean }>(null, `select feedback_gifts_ok($1::jsonb) ok`, [JSON.stringify(g)]))[0]!.ok
    expect(await ok(scales(1))).toBe(true)
    expect(await ok(scales(9999))).toBe(true)
    expect(await ok(scales(0))).toBe(false)
    expect(await ok(scales(10000))).toBe(false)
    expect(await ok(scales(2.5))).toBe(false)
    expect(await ok(scales('20'))).toBe(false)
    // The gifts that were there before still pass.
    expect(await ok([{ kind: 'gold', amount: 500, region: 'latest' }])).toBe(true)
  })

  it('refuses them on a message to a guest’s device', async () => {
    const err = await fails(
      U.admin,
      `insert into feedback (device_id, player_name, title, message, reply, gifts, from_admin)
       values ('dev-guest', 'Guest', 'For you', '', 'Thanks!', $1::jsonb, true)`,
      [JSON.stringify(scales(20))],
    )
    expect(err).toMatch(/feedback_scales_need_account/)
    // Other gifts to a guest are as before.
    const [row] = await adminWrites({
      device: 'dev-guest',
      gifts: [{ kind: 'gold', amount: 5, region: 'latest' }],
    })
    expect(row!.id).toBeGreaterThan(0)
  })
})

describe('the claim', () => {
  it('pays them into the player’s wallet, once, beside the other gifts', async () => {
    const gifts = [{ kind: 'item', key: 'rare-candy', qty: 2, region: 'latest' }, ...scales(25), ...scales(5)]
    const [m] = await adminWrites({ user: U.ash, gifts })
    expect(await wallet(U.ash)).toBeNull()
    const got = await claim(U.ash, [m!.id])
    expect(got).toEqual([{ id: m!.id, gifts }])
    expect(await wallet(U.ash)).toEqual({ balance: 30, earned: 0, total: 0 })
    // A second claim (another tab) hands nothing over and pays nothing.
    expect(await claim(U.ash, [m!.id])).toEqual([])
    expect((await wallet(U.ash))!.balance).toBe(30)
  })

  it('adds to a wallet that has some, across several messages at once', async () => {
    const [a] = await adminWrites({ user: U.ash, gifts: scales(10) })
    const [b] = await adminWrites({ user: U.ash, gifts: scales(100) })
    await claim(U.ash, [a!.id, b!.id])
    expect((await wallet(U.ash))!.balance).toBe(140)
  })

  it('pays nobody for a message that isn’t theirs', async () => {
    const [m] = await adminWrites({ user: U.ash, gifts: scales(50) })
    expect(await claim(U.misty, [m!.id])).toEqual([])
    expect(await wallet(U.misty)).toBeNull()
    expect((await wallet(U.ash))!.balance).toBe(140)
  })

  it('pays nothing while gifts are off', async () => {
    const [m] = await adminWrites({ user: U.misty, gifts: scales(50) })
    await db.query(`update game_config set value = '{"access": "off"}'::jsonb where key = 'gifts'`)
    expect(await fails(U.misty, `select * from feedback_claim_gifts($1::bigint[], 'x')`, [[m!.id]])).toMatch(
      /gifts_off/,
    )
    expect(await wallet(U.misty)).toBeNull()
    await db.query(`update game_config set value = '{"access": "all"}'::jsonb where key = 'gifts'`)
    await claim(U.misty, [m!.id])
    expect((await wallet(U.misty))!.balance).toBe(50)
  })
})
