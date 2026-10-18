// Migration 0061 against a real Postgres (PGlite, in process): the battle powers (docs/31). The 95 Mega Gems as
// items.json has them; each power's switch as the server reads it; and the Versus board shows each player's gems and
// powers only while the switch is on for the caller, from the save of the board's realm. Then seed.sql's schema part,
// run again over it, still ends on these versions. Supabase's own pieces are stood in for, as in general-sql.test.ts.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '@/engine/defaults'
import itemsJson from '@/data/items.json'
import { regionsPrelude } from '../scripts/seed'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')

const ADMIN = 'gregoire.ftn@gmail.com' // is_admin() (0001)
const U = {
  ash: '00000000-0000-4000-8000-000000000001', // the one looking
  misty: '00000000-0000-4000-8000-000000000002', // two gems, Gigantamax's and Z-Moves' badges
  brock: '00000000-0000-4000-8000-000000000003', // odd values in his save: nothing
}

const save = (name: string, powers?: unknown) => ({
  version: 1,
  player: { name, character: 'red' },
  box: [],
  team: [],
  pokedex: [],
  currentAreaId: 'route-1',
  areaProgress: {},
  ...(powers !== undefined && { powers }),
})

let db: PGlite

async function as<T = Record<string, unknown>>(
  user: string | null,
  q: string,
  params: unknown[] = [],
  email = '',
): Promise<T[]> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? ''])
  await db.query(`select set_config('request.jwt.claim.email', $1, false)`, [email])
  try {
    return (await db.query<T>(q, params)).rows
  } finally {
    await db.query(`select set_config('request.jwt.claim.email', '', false)`)
  }
}

async function putSave(user: string, data: unknown, realm = 'main') {
  await db.query(`select set_config('request.jwt.claim.sub', '', false)`)
  await db.query(
    `insert into saves (user_id, realm, data, updated_at) values ($1, $2, $3, now())
     on conflict (user_id, realm) do update set data = excluded.data, updated_at = excluded.updated_at`,
    [user, realm, JSON.stringify(data)],
  )
}

/** Writes the three switches into their rows, as the admin's Config does. */
async function switches(mega: string, gmax: string, z: string) {
  const rows: [string, unknown][] = [
    [
      'megaEvolution',
      { ...DEFAULT_CONFIG.megaEvolution, gems: { ...DEFAULT_CONFIG.megaEvolution.gems, access: mega } },
    ],
    [
      'gigantamax',
      { ...DEFAULT_CONFIG.gigantamax, boost: { ...DEFAULT_CONFIG.gigantamax.boost, access: gmax } },
    ],
    ['zMove', { ...DEFAULT_CONFIG.zMove, access: z }],
  ]
  for (const [key, value] of rows)
    await db.query(
      `insert into game_config (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value`,
      [key, JSON.stringify(value)],
    )
}

type Powers = { gems: string[]; gmax: boolean; z: boolean }
const board = async (email = '') =>
  Object.fromEntries(
    (
      await as<{ user_id: string; powers: Powers }>(
        U.ash,
        'select user_id, powers from versus_board()',
        [],
        email,
      )
    ).map((r) => [r.user_id, r.powers]),
  )
const NONE: Powers = { gems: [], gmax: false, z: false }

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
    '0045_progress_raids.sql',
    '0046_progress_raids_worlds.sql',
    '0047_trades_admin_read.sql',
    '0049_general_upgrades.sql',
    '0061_battle_powers.sql',
  ])
    await db.exec(sql(f))
  // Safe to run again.
  await db.exec(sql('0061_battle_powers.sql'))

  await db.exec(
    `insert into auth.users (id) values ${Object.values(U)
      .map((u) => `('${u}')`)
      .join(',')};`,
  )
  await putSave(U.ash, save('ASH'))
  await putSave(U.misty, save('MISTY', { gems: ['lucarionite', 'gengarite'], earned: ['mega', 'gmax', 'z'] }))
  await putSave(U.brock, save('BROCK', { gems: 'lucarionite', earned: { gmax: true } }))
  // Misty's Extreme save holds another gem: the main board reads her main save.
  await putSave(U.misty, save('MISTY-X', { gems: ['garchompite'], earned: [] }), 'extreme')
  const team = JSON.stringify([{ dex: 448, level: 50, shiny: false }])
  for (const u of [U.misty, U.brock])
    await db.query(
      `insert into versus_teams (user_id, realm, version, team, ids) values ($1, 'main', 1, $2, '[]')`,
      [u, team],
    )
}, 60_000)

afterAll(async () => {
  await db?.close()
})

describe('0061: the gems', () => {
  it('adds the 95 Mega Gems as items.json has them', async () => {
    const rows = await as<Record<string, unknown>>(
      null,
      `select key, name, description, sprite_url, price, effect, in_shop, shop_badges
       from items where effect ->> 'kind' = 'megaGem' order by key`,
    )
    const json = (itemsJson as { key: string; effect: { kind: string }; [k: string]: unknown }[])
      .filter((i) => i.effect.kind === 'megaGem')
      .sort((a, b) => (a.key < b.key ? -1 : 1))
      .map((i) => ({
        key: i.key,
        name: i.name,
        description: i.description,
        sprite_url: i.spriteUrl,
        price: i.price,
        effect: i.effect,
        in_shop: i.inShop,
        shop_badges: i.shopBadges,
      }))
    expect(json).toHaveLength(95)
    expect(rows).toEqual(json)
  })
})

describe('0061: the switches and the Versus board', () => {
  it('with no row, every power is off: the game’s defaults', async () => {
    expect(DEFAULT_CONFIG.megaEvolution.gems.access).toBe('off')
    expect(DEFAULT_CONFIG.gigantamax.boost.access).toBe('off')
    expect(DEFAULT_CONFIG.zMove.access).toBe('off')
    const [r] = await as<{ m: boolean; g: boolean; z: boolean }>(
      U.ash,
      `select power_open('mega') m, power_open('gmax') g, power_open('z') z`,
    )
    expect(r).toEqual({ m: false, g: false, z: false })
    expect(await board()).toEqual({ [U.misty]: NONE, [U.brock]: NONE })
  })

  it('on for everyone: the gems and the badges from the main save; odd values give nothing', async () => {
    await switches('all', 'all', 'all')
    expect(await board()).toEqual({
      [U.misty]: { gems: ['lucarionite', 'gengarite'], gmax: true, z: true },
      [U.brock]: NONE,
    })
  })

  it('on for the admin: only the admin sees them', async () => {
    await switches('admin', 'off', 'admin')
    expect((await board())[U.misty]).toEqual(NONE)
    expect((await board(ADMIN))[U.misty]).toEqual({
      gems: ['lucarionite', 'gengarite'],
      gmax: false,
      z: true,
    })
    await switches('off', 'off', 'off')
  })

  it('seed.sql’s schema part, run again over it, ends on these versions', async () => {
    await db.exec((await regionsPrelude()).replace(/^(begin|commit);$/gm, ''))
    await switches('all', 'all', 'all')
    expect((await board())[U.misty]).toEqual({ gems: ['lucarionite', 'gengarite'], gmax: true, z: true })
    await switches('off', 'off', 'off')
  }, 60_000)
})
