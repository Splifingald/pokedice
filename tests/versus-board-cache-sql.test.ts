// Migration 0136 against a real Postgres (PGlite, in process): the Versus board built at most once every 15 minutes
// (docs/66 §2). The other players' wins, powers and rich flag come from the cache until it is 15 minutes old; the teams,
// the caller's own row and "beaten" stay live; the switches still apply per caller; players can't touch the cache. Then
// seed.sql's schema part, run again over it, still ends on this version. Supabase's own pieces are stood in for, as in
// powers-sql.test.ts.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '@/engine/defaults'
import { regionsPrelude } from '../scripts/seed'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')
const FILE = '0136_versus_board_cache.sql'

const ADMIN = 'gregoire.ftn@gmail.com' // is_admin() (0001)
const U = {
  ash: '00000000-0000-4000-8000-000000000001',
  misty: '00000000-0000-4000-8000-000000000002',
  brock: '00000000-0000-4000-8000-000000000003',
  gary: '00000000-0000-4000-8000-000000000004', // joins Versus after the board was built
}
const TEAM = JSON.stringify([{ dex: 448, level: 50, shiny: false }])

let db: PGlite

type Row = {
  user_id: string
  is_me: boolean
  team: { dex: number }[]
  version: number
  attack_wins: number
  defense_wins: number
  beaten: boolean
  rich: boolean
  powers: { gems: string[]; gmax: boolean; z: boolean }
}

async function board(user: string | null, email = '', realm = 'main'): Promise<Record<string, Row>> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? ''])
  await db.query(`select set_config('request.jwt.claim.email', $1, false)`, [email])
  try {
    const rows = (await db.query<Row>('select * from versus_board($1)', [realm])).rows
    return Object.fromEntries(rows.map((r) => [r.user_id, r]))
  } finally {
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`)
    await db.query(`select set_config('request.jwt.claim.email', '', false)`)
  }
}

const win = (attacker: string, defender: string, won = true, version = 1) =>
  db.query(
    `insert into versus_battles (attacker_id, defender_id, defender_version, seed, won, realm) values ($1, $2, $3, 1, $4, 'main')`,
    [attacker, defender, version, won],
  )
const putSave = (user: string, powers: unknown) =>
  db.query(
    `insert into saves (user_id, realm, data, updated_at) values ($1, 'main', $2, now())
     on conflict (user_id, realm) do update set data = excluded.data, updated_at = excluded.updated_at`,
    [user, JSON.stringify({ version: 1, box: [], powers })],
  )
const joinVersus = (user: string) =>
  db.query(`insert into versus_teams (user_id, realm, version, team, ids) values ($1, 'main', 1, $2, '[]')`, [
    user,
    TEAM,
  ])
/** The cache, as if built 16 minutes ago. */
const age = () => db.exec(`update versus_board_cache set built_at = now() - interval '16 minutes'`)

async function switches(mega: string) {
  await db.query(
    `insert into game_config (key, value) values ('megaEvolution', $1) on conflict (key) do update set value = excluded.value`,
    [
      JSON.stringify({
        ...DEFAULT_CONFIG.megaEvolution,
        gems: { ...DEFAULT_CONFIG.megaEvolution.gems, access: mega },
      }),
    ],
  )
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
    '0064_battle_powers.sql',
    FILE,
  ])
    await db.exec(sql(f))
  // Safe to run again.
  await db.exec(sql(FILE))

  await db.exec(
    `insert into auth.users (id) values ${Object.values(U)
      .map((u) => `('${u}')`)
      .join(',')};`,
  )
  await putSave(U.misty, { gems: ['lucarionite'], earned: [] })
  for (const u of [U.ash, U.misty, U.brock]) await joinVersus(u)
}, 60_000)

afterAll(async () => {
  await db?.close()
})

describe('0136: the Versus board from a cache', () => {
  it('first call builds it: the same numbers as before', async () => {
    await win(U.misty, U.brock)
    await win(U.ash, U.brock, false)
    const b = await board(U.ash)
    expect(Object.keys(b).sort()).toEqual([U.ash, U.misty, U.brock].sort())
    expect(b[U.misty]).toMatchObject({ is_me: false, attack_wins: 1, defense_wins: 0, beaten: false })
    expect(b[U.brock]).toMatchObject({ attack_wins: 0, defense_wins: 1 })
    expect(b[U.ash]).toMatchObject({ is_me: true })
    const n = (await db.query<{ n: number }>('select count(*)::int n from versus_board_cache')).rows[0]!.n
    expect(n).toBe(1)
  })

  it('the others’ wins come from the cache for 15 minutes; your own row is always live', async () => {
    await win(U.misty, U.ash)
    await win(U.ash, U.misty)
    // Ash looks: Misty's second win isn't counted yet, but Ash's own win is, and "beaten" is live.
    let b = await board(U.ash)
    expect(b[U.misty]!.attack_wins).toBe(1)
    expect(b[U.ash]!.attack_wins).toBe(1)
    expect(b[U.misty]!.beaten).toBe(true)
    // Misty sees her own two wins at once.
    expect((await board(U.misty))[U.misty]!.attack_wins).toBe(2)
    await age()
    b = await board(U.ash)
    expect(b[U.misty]!.attack_wins).toBe(2)
  })

  it('teams stay live: a new team shows at once, counted live; a changed team shows its new version', async () => {
    await joinVersus(U.gary)
    await win(U.gary, U.brock)
    await db.exec(
      `update versus_teams set version = 2, team = '[{"dex":25,"level":60,"shiny":true}]' where user_id = '${U.brock}'`,
    )
    const b = await board(U.ash)
    expect(b[U.gary]).toMatchObject({ attack_wins: 1, defense_wins: 0 })
    expect(b[U.brock]).toMatchObject({ version: 2, team: [{ dex: 25, level: 60, shiny: true }] })
  })

  it('the switches still apply per caller, from the cached powers', async () => {
    await age()
    await switches('admin')
    expect((await board(U.ash))[U.misty]!.powers).toEqual({ gems: [], gmax: false, z: false })
    expect((await board(U.ash, ADMIN))[U.misty]!.powers).toEqual({
      gems: ['lucarionite'],
      gmax: false,
      z: false,
    })
    await switches('off')
  })

  it('a made-up realm leaves no row', async () => {
    expect(await board(U.ash, '', 'no-such-realm')).toEqual({})
    const realms = (await db.query<{ realm: string }>('select realm from versus_board_cache')).rows
    expect(realms.map((r) => r.realm)).toEqual(['main'])
  })

  it('players can’t read the cache or build it', async () => {
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`)
      try {
        await expect(db.query('select * from versus_board_cache')).rejects.toThrow(/permission denied/)
        await expect(db.query(`select versus_board_stats('main')`)).rejects.toThrow(/permission denied/)
      } finally {
        await db.exec('reset role')
      }
    }
  })

  it('seed.sql’s schema part, run again over it, ends on this version', async () => {
    await db.exec((await regionsPrelude()).replace(/^(begin|commit);$/gm, ''))
    const def = (
      await db.query<{ d: string }>(`select pg_get_functiondef('versus_board(text)'::regprocedure) d`)
    ).rows[0]!.d
    expect(def).toContain('versus_board_stats')
  }, 60_000)
})
