// Migration 0094 against a real Postgres (PGlite, in process): hidden talents (docs/51). The switch's row, Off; the
// Versus team snapshot carries a Pokémon's talent while the switch is open, read from the cloud save; a trade listing
// says whether its Pokémon carries it, may ask for a species "with its hidden talent" while the switch is open, and is
// then only taken with such a Pokémon.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, encodeDexSet } from '@/engine'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')
const FILE = '0094_hidden_talents.sql'

const AUTH = `create role anon; create role authenticated; create schema auth; create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;`

const ASH = '00000000-0000-4000-8000-000000000001'
const MISTY = '00000000-0000-4000-8000-000000000002'
const GYMS = ['10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002']

function save(box: Record<string, unknown>[]) {
  return {
    version: 1,
    region: 'kanto',
    player: { name: 'T', character: 'red' },
    box,
    team: [box[0]!.id],
    pokedex: box.map((m) => m.dex),
    currentAreaId: 'route-1',
    areaProgress: { 'route-1': { cleared: true, gymsDefeated: GYMS } },
  }
}

describe('0094: hidden talents', () => {
  let db: PGlite
  const as = async <T>(user: string, q: string, params: unknown[] = []) => {
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user])
    return (await db.query<T>(q, params)).rows
  }
  const one = async <T>(user: string, q: string, params: unknown[] = []) =>
    (await as<{ r: T }>(user, `select ${q} as r`, params))[0]!.r
  const setAccess = (access: string) =>
    db.query(
      `update game_config set value = jsonb_set(value, '{access}', to_jsonb($1::text)) where key = 'hiddenTalents'`,
      [access],
    )

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(AUTH)
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
      '0065_raid_true_levels.sql',
      '0090_versus_true_levels.sql',
      FILE,
    ])
      await db.exec(sql(f))
    // Safe to run again.
    await db.exec(sql(FILE))
    await db.exec(`
      insert into auth.users (id) values ('${ASH}'), ('${MISTY}');
      insert into regions (id, name, order_index, dex_range, starters, league_area_id, next_region) values
        ('kanto', 'Kanto', 1, '[1,151]', '[1,4,7]', '${GYMS[0]}', null) on conflict do nothing;
      insert into trainers (id, name, team, role, badge) values
        ('${GYMS[0]}', 'Brock', '[]', 'leader', 'Boulder Badge'), ('${GYMS[1]}', 'Misty', '[]', 'leader', 'Cascade Badge')
        on conflict do nothing;
      insert into game_config (key, value) values ('trade', '{"access": "all"}') on conflict (key) do update set value = excluded.value;
    `)
    for (const dex of [19, 20, 25, 149, 6])
      await db.exec(`insert into pokemon (dex, name, type1, base_hp, max_hp, speed, sprite_url, dice, rerolls, evolutions, milestones)
        values (${dex}, 'P${dex}', 'normal', 10, 100, 50, '', '[]', 1, '[]', '[]') on conflict do nothing`)
    const put = (user: string, box: Record<string, unknown>[]) =>
      db.query(
        `insert into saves (user_id, realm, data, updated_at) values ($1, 'main', $2, now())
        on conflict (user_id, realm) do update set data = excluded.data`,
        [user, JSON.stringify(save(box))],
      )
    await put(ASH, [
      { id: 'a1', dex: 149, level: 60, talent: true },
      { id: 'a2', dex: 6, level: 55 },
      { id: 'a3', dex: 25, level: 50 },
      { id: 'a4', dex: 19, level: 10, talent: true },
    ])
    await put(MISTY, [
      { id: 'm1', dex: 20, level: 30 },
      { id: 'm2', dex: 19, level: 9 },
      { id: 'm3', dex: 19, level: 12, talent: true },
    ])
  }, 120_000)

  it('keeps the game’s defaults, off', async () => {
    const [row] = (
      await db.query<{ value: unknown }>(`select value from game_config where key = 'hiddenTalents'`)
    ).rows
    expect(row!.value).toEqual(DEFAULT_CONFIG.hiddenTalents)
  })

  it('the Versus snapshot carries a talent only while the switch is open', async () => {
    const team = async () =>
      (await db.query<{ team: unknown[] }>(`select team from versus_teams`)).rows[0]!.team
    await as(ASH, `select versus_set_team($1)`, [['a1', 'a2', 'a3']])
    expect(await team()).toEqual([
      { dex: 149, level: 60, shiny: false },
      { dex: 6, level: 55, shiny: false },
      { dex: 25, level: 50, shiny: false },
    ])
    await setAccess('all')
    await as(ASH, `select versus_set_team($1)`, [['a1', 'a2', 'a3']])
    expect((await team())[0]).toEqual({ dex: 149, level: 60, shiny: false, talent: true })
  })

  it('a listing asks for a species with its talent, and only one that carries it is taken', async () => {
    const poster = { regions: ['kanto'], ...encodeDexSet([]), shiny: [] }
    const listed = await one<{ code: string }>(ASH, `trade_post($1, $2::jsonb, 'public', $3::jsonb)`, [
      'a4',
      JSON.stringify({ kind: 'species', dex: 19, talent: true }),
      JSON.stringify(poster),
    ])
    const row = await one<{ talent: boolean; want: unknown }>(MISTY, `trade_view($1)`, [listed.code])
    expect(row.talent).toBe(true)
    expect(row.want).toEqual({ kind: 'species', dex: 19, talent: true })
    await expect(as(MISTY, `select trade_take($1, $2)`, [listed.code, 'm2'])).rejects.toThrow(
      /trades_no_match/,
    )
    const taken = await one<{ listed: { talent?: boolean }; given: { talent?: boolean } }>(
      MISTY,
      `trade_take($1, $2)`,
      [listed.code, 'm3'],
    )
    expect(taken.listed.talent).toBe(true)
    expect(taken.given.talent).toBe(true)
  })

  it('refuses to ask for a talent while the switch is off', async () => {
    await setAccess('off')
    await expect(
      as(ASH, `select trade_post($1, $2::jsonb, 'public', $3::jsonb)`, [
        'a2',
        JSON.stringify({ kind: 'species', dex: 19, talent: true }),
        JSON.stringify({ regions: ['kanto'], ...encodeDexSet([]), shiny: [] }),
      ]),
    ).rejects.toThrow(/trades_bad_want/)
  })
})
