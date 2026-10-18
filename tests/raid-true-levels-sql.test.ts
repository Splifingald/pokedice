// Migration 0061 against a real Postgres (PGlite, in process), on top of the raids' migrations and 0060: the teams
// registered for friends keep each Pokémon's own level (the user's rule, 2026-10-18: a raid's team cap holds back only
// the HP, which the game caps in the fight). The day's raid's and a progression raid's alike, a nightmare raid's
// checks kept.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { BUNDLE } from '@/config/bundle'
import { REGION_ID } from '../scripts/content-haunted-hollow'
import { newmoonArea } from '../scripts/patch-hh-nightmare'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')
const NM = newmoonArea()
const FILE = '0061_raid_true_levels.sql'

const AUTH = `create role anon; create role authenticated; create schema auth; create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;`

describe('0061: raid teams at their own levels', () => {
  let db: PGlite
  const ME = '00000000-0000-4000-8000-0000000000aa'
  const KEY = `${NM.id}:491`
  const as = async <T>(q: string, params: unknown[] = []) => {
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [ME])
    return (await db.query<T>(q, params)).rows
  }
  const putSave = (won: boolean) =>
    db.query(
      `insert into saves (user_id, realm, data, updated_at) values ($1, 'main', $2, now())
       on conflict (user_id, realm) do update set data = excluded.data`,
      [
        ME,
        JSON.stringify({
          version: 1,
          region: REGION_ID,
          box: [
            { id: 'g', dex: 94, level: 95 },
            { id: 'h', dex: 93, level: 30, shiny: true },
          ],
          team: ['g', 'h'],
          pokedex: [94, 93],
          areaProgress: {
            [NM.id]: { cleared: false, nightmare: { active: false, round: won ? 7 : 3, won } },
          },
          parked: {},
        }),
      ],
    )
  type Team = { t: { dex: number; level: number; shiny: boolean }[] }
  const setTeam = () => as<Team>('select raid_set_team($1) t', [['g', 'h']])
  const setProgressTeam = () =>
    as<Team>('select raid_progress_set_team($1, $2, $3) t', [KEY, REGION_ID, ['g', 'h']])
  const access = (a: string) =>
    db.query(`update game_config set value = $1 where key = 'nightmare'`, [JSON.stringify({ access: a })])

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(AUTH)
    await db.exec(sql('0001_init.sql').replace('create extension if not exists pgcrypto;', ''))
    for (const f of [
      '0011_leaderboard.sql',
      '0016_regions.sql',
      '0018_versus.sql',
      '0032_leaderboard_shiny.sql',
      '0033_friends.sql',
      '0034_day_care.sql',
      '0035_events.sql',
      '0037_skip_unchanged_saves.sql',
      '0030_pokemon_forms.sql',
      '0038_delete_my_data.sql',
      '0039_extreme_realm.sql',
    ])
      await db.exec(sql(f))
    await db.exec('alter table areas add column if not exists rounds_to_clear int;')
    const dexes = [...new Set(BUNDLE.pokemon.map((p) => p.dex))]
    await db.exec(
      `insert into pokemon (dex, name, type1, base_hp, max_hp, speed, sprite_url, dice, rerolls, catch_value, evolutions, milestones) values ` +
        dexes.map((d) => `(${d}, 'p${d}', 'ghost', 10, 100, 5, '', '[]', 1, 3, '[]', '[]')`).join(', ') +
        ' on conflict (dex) do nothing',
    )
    await db.exec(`insert into auth.users (id) values ('${ME}')`)
    await db.exec(`insert into game_config (key, value) values ('events', '{"raid": {"access": "all", "teamCap": 50}}')
      on conflict (key) do update set value = excluded.value`)
    for (const f of [
      '0045_progress_raids.sql',
      '0046_progress_raids_worlds.sql',
      '0052_haunted_hollow.sql',
      '0057_hh_distortion_world.sql',
      '0060_hh_nightmare.sql',
    ])
      await db.exec(sql(f))
    await putSave(false)
  }, 60_000)

  it('before it: both teams capped (Lv.50)', async () => {
    expect((await setTeam())[0]!.t.map((m) => m.level)).toEqual([50, 30])
    expect((await setProgressTeam())[0]!.t.map((m) => m.level)).toEqual([50, 30])
  })

  it('the day’s raid’s team: its own levels, twice the same', async () => {
    await db.exec(sql(FILE))
    await db.exec(sql(FILE))
    expect((await setTeam())[0]!.t).toEqual([
      { dex: 94, level: 95, shiny: false },
      { dex: 93, level: 30, shiny: true },
    ])
    const [{ team }] = (await db.query<{ team: { level: number }[] }>('select team from raid_teams'))
      .rows as [{ team: { level: number }[] }]
    expect(team.map((m) => m.level)).toEqual([95, 30])
  })

  it('a progression raid’s team: its own levels too', async () => {
    expect((await setProgressTeam())[0]!.t.map((m) => m.level)).toEqual([95, 30])
  })

  it('a nightmare raid still shut until the nightmare is over, then its own levels (not its cap of 70)', async () => {
    await access('all')
    await expect(setProgressTeam()).rejects.toThrow(/events_raid_locked/)
    await putSave(true)
    expect((await setProgressTeam())[0]!.t.map((m) => m.level)).toEqual([95, 30])
  })

  it('the checks stay: signed out, a team of none, a Pokémon not in the save', async () => {
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`)
    await expect(db.query('select raid_set_team($1)', [['g']])).rejects.toThrow(/events_signed_out/)
    await expect(as('select raid_set_team($1)', [[]])).rejects.toThrow(/events_team_size/)
    await expect(as('select raid_set_team($1)', [['nobody']])).rejects.toThrow(/events_not_eligible/)
  })
})
