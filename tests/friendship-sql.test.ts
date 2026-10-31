// Migration 0102 against a real Postgres (PGlite, in process): friendship streaks and the Friend Market (docs/57). A
// trade, a raid beside a friend's team and an Egg with a friend's Pokémon each move the pair's streak once a UTC day and
// pay both by its tier, within the day's cap; a missed day starts it again; strangers never count; the switch gates
// everything; the market prices, limits and hands back purchases until they're applied; removing a friend ends the
// streak. Supabase's own pieces (auth, the roles) are stood in for at the top, as in invites-sql.test.ts.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '@/engine'
import itemsJson from '@/data/items.json'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')
const FILE = '0102_friendship.sql'

const U = {
  ash: '00000000-0000-4000-8000-000000000001',
  misty: '00000000-0000-4000-8000-000000000002',
  brock: '00000000-0000-4000-8000-000000000003',
  gary: '00000000-0000-4000-8000-000000000004',
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
async function fails(user: string | null, q: string, params: unknown[] = []): Promise<string> {
  try {
    await as(user, q, params)
  } catch (e) {
    return (e as Error).message
  }
  return 'no error'
}

type Status = {
  day: string
  week: string
  shiny: number
  balance: number
  earned: number
  streaks: { friend: string; streak: number; best: number; lastDay: string; lastKind: string }[]
  today: { friend: string; kind: string; streak: number; coins: number }[]
  bought: Record<string, number>
  pending: { id: string; key: string; gifts: unknown }[]
}
const status = async (user: string) =>
  (await as<{ s: Status | null }>(user, `select friendship_status() s`))[0]!.s
const setAccess = (access: string) =>
  db.query(
    `update game_config set value = value || jsonb_build_object('access', $1::text) where key = 'friendship'`,
    [access],
  )
/** Moves the pair's last day back, as if `days` had gone by since. */
const age = (a: string, b: string, days: number) =>
  db.query(
    `update friendship_streaks set last_day = last_day - $3::int where user_a = least($1::uuid, $2::uuid) and user_b = greatest($1::uuid, $2::uuid)`,
    [a, b, days],
  )
const befriend = (a: string, b: string) =>
  db.query(
    `insert into friendships (user_a, user_b, added_by, a_seen, b_seen) values (least($1::uuid, $2::uuid), greatest($1::uuid, $2::uuid), $1, true, true) on conflict do nothing`,
    [a, b],
  )
const egg = async (user: string, friend: string) =>
  (await as<{ n: number }>(user, `select friendship_egg($1) n`, [friend]))[0]!.n
const wallet = (user: string, balance: number) =>
  db.query(
    `insert into friendship_wallets (user_id, balance) values ($1, $2) on conflict (user_id) do update set balance = excluded.balance`,
    [user, balance],
  )

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
  for (const u of Object.values(U))
    await db.query(
      `insert into player_cards (user_id, realm, name, avatar, region, updated_at) values ($1, 'main', 'T', 'red', 'kanto', now())`,
      [u],
    )
  await befriend(U.ash, U.misty)
  await befriend(U.ash, U.brock)
}, 120_000)

afterAll(async () => {
  await db?.close()
})

describe('0102: friendship', () => {
  it('keeps the game’s defaults, off', async () => {
    const [row] = (await db.query<{ v: unknown }>(`select friendship_cfg() v`)).rows
    expect(row!.v).toEqual(DEFAULT_CONFIG.friendship)
    expect(
      (await db.query<{ v: unknown }>(`select value v from game_config where key = 'friendship'`)).rows[0]!.v,
    ).toEqual({
      access: 'off',
    })
  })

  it('adds the Friend Ball as items.json has it', async () => {
    const [row] = (
      await db.query<Record<string, unknown>>(
        `select key, name, description, sprite_url, price, effect, in_shop, shop_badges from items where key = 'friend-ball'`,
      )
    ).rows
    const json = itemsJson.find((i) => i.key === 'friend-ball')!
    expect(row).toEqual({
      key: json.key,
      name: json.name,
      description: json.description,
      sprite_url: json.spriteUrl,
      price: json.price,
      effect: json.effect,
      in_shop: json.inShop,
      shop_badges: json.shopBadges,
    })
  })

  it('off: no status, nothing counted, nothing sold', async () => {
    expect(await status(U.ash)).toBeNull()
    expect(await egg(U.ash, U.misty)).toBe(0)
    expect(await fails(U.ash, `select friend_market_buy('rare-candy', 1)`)).toMatch(/friendship_off/)
  })

  it('pays a streak by its tier, once a day, both friends', async () => {
    await setAccess('all')
    expect(await egg(U.ash, U.misty)).toBe(0) // Misty has nobody at her Day Care
    await db.query(`update player_cards set day_care = '[{"inst":"m1","dex":25}]' where user_id = $1`, [
      U.misty,
    ])
    expect(await egg(U.ash, U.misty)).toBe(1)
    expect(await egg(U.ash, U.misty)).toBe(0) // already today
    const ash = (await status(U.ash))!
    expect(ash.balance).toBe(3)
    expect(ash.streaks).toEqual([
      expect.objectContaining({ friend: U.misty, streak: 1, best: 1, lastKind: 'egg' }),
    ])
    expect(ash.today).toEqual([{ friend: U.misty, kind: 'egg', streak: 1, coins: 3 }])
    expect((await status(U.misty))!.balance).toBe(3)

    // Day 4 pays 4, day 8 pays 5.
    for (let d = 2; d <= 8; d++) {
      await age(U.ash, U.misty, 1)
      await db.query(`update friendship_wallets set day = day - 1`)
      expect(await egg(U.ash, U.misty)).toBe(d)
    }
    const after = (await status(U.ash))!
    expect(after.balance).toBe(3 * 3 + 4 * 4 + 5)
  })

  it('a missed day starts the streak again; strangers never count', async () => {
    await age(U.ash, U.misty, 2)
    expect(await egg(U.ash, U.misty)).toBe(1)
    expect((await status(U.ash))!.streaks[0]!.best).toBe(8)
    await db.query(`update player_cards set day_care = '[{"inst":"g1","dex":1}]' where user_id = $1`, [
      U.gary,
    ])
    expect(await egg(U.ash, U.gary)).toBe(0)
  })

  it('a raid beside a friend’s team counts, only with their team there', async () => {
    expect((await as<{ n: number }>(U.brock, `select friendship_raid($1) n`, [[U.ash]]))[0]!.n).toBe(0)
    await db.query(`insert into raid_teams (user_id, realm, team) values ($1, 'main', '[]')`, [U.ash])
    expect(
      (await as<{ n: number }>(U.brock, `select friendship_raid($1) n`, [[U.ash, U.gary, U.brock]]))[0]!.n,
    ).toBe(1)
    const brock = (await status(U.brock))!
    expect(brock.streaks).toEqual([expect.objectContaining({ friend: U.ash, streak: 1, lastKind: 'raid' })])
  })

  it('a trade taken between friends counts; with a stranger it does not', async () => {
    await befriend(U.misty, U.brock)
    const listing = async (owner: string) =>
      (
        await db.query<{ id: string }>(
          `insert into trade_listings (code, owner, from_region, home_region, mon, dex, level, want, poster, visibility, ends_at)
           values (substr(md5(random()::text), 1, 8), $1, 'kanto', 'kanto', '{}', 25, 5, '{}', '{}', 'public', now() + interval '1 day')
           returning id`,
          [owner],
        )
      ).rows[0]!.id
    const take = (id: string, taker: string) =>
      db.query(`update trade_listings set status = 'taken', taker = $2, taken_at = now() where id = $1`, [
        id,
        taker,
      ])
    await take(await listing(U.misty), U.brock)
    expect((await status(U.misty))!.streaks.find((s) => s.friend === U.brock)).toMatchObject({
      streak: 1,
      lastKind: 'trade',
    })
    const before = (await status(U.gary))?.balance ?? 0
    await take(await listing(U.gary), U.misty)
    expect((await status(U.gary))!.balance).toBe(before)
  })

  it('stops at the daily cap', async () => {
    await wallet(U.gary, 0)
    await db.query(
      `update friendship_wallets set earned = 49, day = (now() at time zone 'UTC')::date where user_id = $1`,
      [U.gary],
    )
    await befriend(U.gary, U.ash)
    await db.query(`update player_cards set day_care = '[{"inst":"a1","dex":4}]' where user_id = $1`, [U.ash])
    const before = (await status(U.gary))!.balance
    expect(await egg(U.gary, U.ash)).toBe(1)
    const g = (await status(U.gary))!
    expect(g.balance).toBe(before + 1)
    expect(g.earned).toBe(50)
  })

  it('the market: prices, weekly limits, the shiny of the week, purchases handed back until applied', async () => {
    await wallet(U.ash, 300)
    const buy = async (key: string, qty = 1) =>
      (
        await as<{ r: { id: string; gifts: unknown[]; balance: number } }>(
          U.ash,
          `select friend_market_buy($1, $2) r`,
          [key, qty],
        )
      )[0]!.r
    const candy = await buy('rare-candy', 5)
    expect(candy.balance).toBe(300 - 75)
    expect(candy.gifts).toEqual([{ kind: 'item', key: 'rare-candy', qty: 5, region: 'latest' }])
    expect(await fails(U.ash, `select friend_market_buy('rare-candy', 6)`)).toMatch(/friendship_limit/)
    expect(await fails(U.ash, `select friend_market_buy('master-ball', 1)`)).toMatch(/friendship_not_sold/)
    const s0 = (await status(U.ash))!
    const shiny = await buy('shiny')
    expect(shiny.gifts).toEqual([
      { kind: 'pokemon', dex: s0.shiny, level: 15, shiny: true, region: 'latest' },
    ])
    expect(DEFAULT_CONFIG.friendship.shiny.pool).toContain(s0.shiny)
    expect(await fails(U.ash, `select friend_market_buy('shiny', 1)`)).toMatch(/friendship_limit/)
    expect(await fails(U.ash, `select friend_market_buy('talent-candy', 2)`)).toMatch(/friendship_too_poor/)
    const s = (await status(U.ash))!
    expect(s.bought).toEqual({ 'rare-candy': 5, shiny: 1 })
    expect(s.pending.map((p) => p.id)).toEqual([candy.id, shiny.id])
    await as(U.ash, `select friend_market_applied($1)`, [[candy.id, shiny.id]])
    expect((await status(U.ash))!.pending).toEqual([])
    // Another player can't mark Ash's as applied, nor see them.
    expect((await status(U.misty))!.pending).toEqual([])
  })

  it('the shiny of the week turns through the pool, a species a week, as the engine counts', async () => {
    const pick = async (d: string) =>
      (await db.query<{ s: number }>(`select friendship_shiny($1::date) s`, [d])).rows[0]!.s
    const pool = DEFAULT_CONFIG.friendship.shiny.pool
    expect(await pick('1970-01-05')).toBe(pool[0])
    expect(await pick('1970-01-12')).toBe(pool[1])
    expect((await db.query<{ w: string }>(`select friendship_week('2026-11-01')::text w`)).rows[0]!.w).toBe(
      '2026-10-26',
    )
  })

  it('removing a friend ends the streak; deleting the main save takes the wallet', async () => {
    await as(U.ash, `select friend_remove($1)`, [U.misty])
    expect((await status(U.ash))!.streaks.some((s) => s.friend === U.misty)).toBe(false)
    expect(
      (
        await db.query(
          `select 1 from friendship_streaks where user_a = least($1::uuid, $2::uuid) and user_b = greatest($1::uuid, $2::uuid)`,
          [U.ash, U.misty],
        )
      ).rows,
    ).toEqual([])
    await db.query(`insert into saves (user_id, realm, data, updated_at) values ($1, 'main', '{}', now())`, [
      U.gary,
    ])
    await db.query(`delete from saves where user_id = $1`, [U.gary])
    expect((await db.query(`select 1 from friendship_wallets where user_id = $1`, [U.gary])).rows).toEqual([])
  })

  it('on for admin: only the admin is counted and served', async () => {
    await setAccess('admin')
    expect(await status(U.ash)).toBeNull()
  })
})
