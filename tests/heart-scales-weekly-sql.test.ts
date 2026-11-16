// Migration 0149 against a real Postgres (PGlite, in process): Heart Scales last a week (docs/60). Wallets there when it
// runs keep their balance this week; a wallet from an earlier week reads 0 and empties the moment it pays or charges
// (a streak day, a Friend Market purchase, a message's Heart Scales), its total and today's count kept.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')
const FILE = '0149_heart_scales_weekly.sql'

const U = {
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
  return (await db.query<T>(q, params)).rows
}
const balance = async (user: string) =>
  (await as<{ s: { balance: number } }>(user, `select friendship_status() s`))[0]!.s.balance
const wallet = async (user: string) =>
  (
    await db.query<{ balance: number; week: string; total: number }>(
      `select balance, week::text, total from friendship_wallets where user_id = $1`,
      [user],
    )
  ).rows[0]
/** Sends the wallet back `weeks` weeks, as if they had gone by since it was last paid or charged. */
const age = (user: string, weeks: number) =>
  db.query(`update friendship_wallets set week = week - 7 * $2::int where user_id = $1`, [user, weeks])
const thisWeek = async () => (await db.query<{ w: string }>(`select friendship_week()::text w`)).rows[0]!.w

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
    grant usage on schema auth to anon, authenticated;
    create schema realtime;
    create function realtime.send(payload jsonb, event text, topic text, private boolean) returns void
      language sql as $$ select null $$;
    create table realtime.messages (topic text, extension text);
    create function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic', true) $$;
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
    '0121_heart_scale_gifts.sql',
    '0131_friend_battles.sql',
    '0132_battle_tickets.sql',
  ])
    await db.exec(sql(f))
  await db.exec(
    `insert into auth.users (id) values ${Object.values(U)
      .map((u) => `('${u}')`)
      .join(',')}`,
  )
  // A wallet from before the migration: it keeps its Heart Scales this week.
  await db.query(`insert into friendship_wallets (user_id, balance, total) values ($1, 120, 120)`, [U.brock])
  await db.exec(sql(FILE))
  // Safe to run again.
  await db.exec(sql(FILE))
  for (const u of Object.values(U))
    await db.query(
      `insert into player_cards (user_id, realm, name, avatar, region, updated_at) values ($1, 'main', 'T', 'red', 'kanto', now())`,
      [u],
    )
  await db.query(
    `insert into friendships (user_a, user_b, added_by, a_seen, b_seen) values ($1, $2, $1, true, true)`,
    [U.ash, U.misty],
  )
  await db.query(`update player_cards set day_care = '[{"inst":"m1","dex":25}]' where user_id = $1`, [
    U.misty,
  ])
  await db.query(
    `update game_config set value = '{"access": "all"}'::jsonb where key in ('friendship', 'gifts')`,
  )
}, 120_000)

afterAll(async () => {
  await db?.close()
})

describe('0149: Heart Scales last a week', () => {
  it('a wallet there before keeps its Heart Scales this week', async () => {
    expect(await wallet(U.brock)).toEqual({ balance: 120, week: await thisWeek(), total: 120 })
    expect(await balance(U.brock)).toBe(120)
  })

  it('a wallet from an earlier week reads 0, then a streak day pays into an emptied one', async () => {
    await db.query(
      `insert into friendship_wallets (user_id, balance, total, week) values ($1, 200, 200, $2)`,
      [U.ash, '2020-01-06'],
    )
    expect(await balance(U.ash)).toBe(0)
    expect((await as<{ n: number }>(U.ash, `select friendship_egg($1) n`, [U.misty]))[0]!.n).toBe(1)
    expect(await wallet(U.ash)).toEqual({ balance: 3, week: await thisWeek(), total: 203 })
    expect(await balance(U.misty)).toBe(3)
  })

  it('a purchase can’t spend last week’s Heart Scales', async () => {
    await db.query(`update friendship_wallets set balance = 100 where user_id = $1`, [U.ash])
    await age(U.ash, 1)
    const err = await as(U.ash, `select friend_market_buy('rare-candy', 1)`).catch((e: Error) => e.message)
    expect(err).toMatch(/friendship_too_poor/)
    // The refusal rolls back, the emptying with it: the status still reads 0.
    expect(await balance(U.ash)).toBe(0)
    // This week's are spent as before.
    await db.query(
      `update friendship_wallets set balance = 30, week = friendship_week() where user_id = $1`,
      [U.ash],
    )
    const [r] = await as<{ r: { balance: number } }>(U.ash, `select friend_market_buy('rare-candy', 2) r`)
    expect(r!.r.balance).toBe(0)
  })

  it('a message’s Heart Scales go into this week’s wallet, an older one emptied first', async () => {
    // As the admin's message would hold them (its triggers, the admin's check, are 0048's, not this one's).
    const give = async (user: string, amount: number) =>
      (
        await db.query<{ id: number }>(
          `insert into feedback (user_id, device_id, player_name, title, message, reply, gifts, from_admin)
           values ($1, '', 'T', 'For you', 'Hi', 'Thanks!', $2::jsonb, true) returning id`,
          [user, JSON.stringify([{ kind: 'heartScales', amount, region: 'latest' }])],
        )
      ).rows[0]!.id
    await db.query(`set session_replication_role = replica`)
    await db.query(`update friendship_wallets set balance = 80 where user_id = $1`, [U.misty])
    await age(U.misty, 2)
    const first = await give(U.misty, 25)
    const second = await give(U.misty, 5)
    await db.query(`set session_replication_role = origin`)
    await as(U.misty, `select * from feedback_claim_gifts($1::bigint[], '')`, [[first]])
    expect(await wallet(U.misty)).toMatchObject({ balance: 25, week: await thisWeek() })
    await as(U.misty, `select * from feedback_claim_gifts($1::bigint[], '')`, [[second]])
    expect((await wallet(U.misty))!.balance).toBe(30)
  })
})
