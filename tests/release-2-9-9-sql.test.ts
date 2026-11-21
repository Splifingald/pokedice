// Version 2.9.9's SQL file (supabase/releases/2026-11-21-version-2-9-9.sql) against a real Postgres (PGlite, in
// process): migrations 0149 to 0152 strung together in one transaction, on a database that has what they run after
// (the friendship tables, Snowglobe Valley's 0122). It runs whole, runs again, and lands each migration's work.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { BUNDLE } from '@/config/bundle'

const ROOT = path.join(__dirname, '..', 'supabase')
const sql = (file: string) => readFileSync(path.join(ROOT, 'migrations', file), 'utf8')
const RELEASE = readFileSync(path.join(ROOT, 'releases', '2026-11-21-version-2-9-9.sql'), 'utf8')
const MIGRATIONS = [
  '0149_heart_scales_weekly.sql',
  '0150_snowglobe_starters.sql',
  '0151_snowglobe_levels.sql',
  '0152_welcome_gift.sql',
]
let db: PGlite

const cfg = async (key: string) =>
  (await db.query<{ v: unknown }>(`select value v from game_config where key = $1`, [key])).rows[0]?.v
const one = async (q: string) => Object.values((await db.query<Record<string, unknown>>(q)).rows[0]!)[0]

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
  // Snowglobe Valley's content (0122), as on live: its species first, for the pools' references.
  await db.exec('alter table areas add column if not exists rounds_to_clear int;')
  const dexes = [...new Set(BUNDLE.pokemon.map((p) => p.dex))]
  await db.exec(
    `insert into pokemon (dex, name, type1, base_hp, max_hp, speed, sprite_url, dice, rerolls, catch_value, evolutions, milestones) values ` +
      dexes.map((d) => `(${d}, 'p${d}', 'ice', 10, 100, 5, '', '[]', 1, 3, '[]', '[]')`).join(', ') +
      ' on conflict do nothing',
  )
  await db.exec(`insert into game_config (key, value) values ('configVersion', '200'),
    ('smallWorlds', '{"access": "admin", "list": []}') on conflict (key) do update set value = excluded.value`)
  await db.exec(sql('0122_snowglobe_valley.sql'))
}, 120_000)

describe('version 2.9.9’s SQL file', () => {
  it('strings 0149 to 0152 together, in order, in one transaction', () => {
    expect(RELEASE.match(/^begin;$/gm)).toHaveLength(1)
    expect(RELEASE.match(/^commit;$/gm)).toHaveLength(1)
    const at = MIGRATIONS.map((f) => RELEASE.indexOf(`↓ supabase/migrations/${f}`))
    expect(at.every((i) => i > 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    for (const f of MIGRATIONS) {
      const body = sql(f)
        .replace(/^(begin|commit);\n/gm, '')
        .trim()
      expect(RELEASE, f).toContain(body)
    }
  })

  it('runs whole on a database that has what it runs after, and lands each migration’s work', async () => {
    const before = Number(await cfg('configVersion'))
    await db.exec(RELEASE)
    // 0149: the wallets' week.
    expect(
      await one(
        `select count(*)::int from information_schema.columns where table_name = 'friendship_wallets' and column_name = 'week'`,
      ),
    ).toBe(1)
    // 0150: the starters; 0151: Staravia in Holly Village, not Pinewood Forest.
    expect(await one(`select starters from regions where id = 'world-snowglobe-valley'`)).toEqual([
      10101, 215, 10103,
    ])
    expect(
      await one(`select count(*)::int from area_wild_pool where id = 'd5a787b9-2e2b-50bf-b69b-7c9396a9ce17'`),
    ).toBe(1)
    expect(
      await one(`select count(*)::int from area_wild_pool where id = '14c9460b-5def-53b4-bdb5-f854d138c6d9'`),
    ).toBe(0)
    // 0152: the starting gift's switch, Off, its function, Snowglobe Valley's gift.
    expect(await cfg('welcomeGift')).toEqual({ access: 'off' })
    expect(await one('select welcome_gift_open()')).toBe(false)
    const worlds = (await cfg('smallWorlds')) as {
      list: { id: string; welcomeGift?: unknown; starters?: number[] }[]
    }
    const sg = worlds.list.find((w) => w.id === 'snowglobe-valley-2026')!
    expect(sg.welcomeGift).toEqual({ gold: 10, items: { potion: 2, 'poke-ball': 5, 'ice-heal': 2 } })
    expect(sg.starters).toEqual([10101, 215, 10103])
    // 0150, 0151 and 0152 bump the content version (0149 is the server's, no content).
    expect(Number(await cfg('configVersion'))).toBe(before + 3)
  })

  it('runs again, changing nothing but the content version', async () => {
    const pools = await one('select count(*)::int from area_wild_pool')
    const before = Number(await cfg('configVersion'))
    await db.exec(RELEASE)
    expect(await one('select count(*)::int from area_wild_pool')).toBe(pools)
    expect(Number(await cfg('configVersion'))).toBe(before + 3)
  })
})
