// Migration 0090 against a real Postgres (PGlite, in process), on top of Versus (0018) and the realms (0039): a Versus
// team keeps each Pokémon's own level (the user's rule, 2026-10-29: Lv.50 holds back only the HP, which the game caps
// in the fight), still Lv.50 or more, still built from the cloud save.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')
const FILE = '0090_versus_true_levels.sql'

const AUTH = `create role anon; create role authenticated; create schema auth; create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;`

describe('0090: Versus teams at their own levels', () => {
  let db: PGlite
  const ME = '00000000-0000-4000-8000-0000000000aa'
  const as = async <T>(q: string, params: unknown[] = []) => {
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [ME])
    return (await db.query<T>(q, params)).rows
  }
  const setTeam = (ids: string[]) => as<{ v: number }>('select versus_set_team($1) v', [ids])
  const team = async () =>
    (
      await db.query<{ team: { dex: number; level: number; shiny: boolean }[] }>(
        'select team from versus_teams',
      )
    ).rows[0]!.team

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
    await db.exec(`insert into auth.users (id) values ('${ME}')`)
    await db.query(`insert into saves (user_id, realm, data, updated_at) values ($1, 'main', $2, now())`, [
      ME,
      JSON.stringify({
        version: 1,
        region: 'kanto',
        box: [
          { id: 'a', dex: 149, level: 88 },
          { id: 'b', dex: 6, level: 50, shiny: true },
          { id: 'c', dex: 25, level: 49 },
        ],
        parked: { johto: { box: [{ id: 'd', dex: 248, level: 100 }] } },
      }),
    ])
  }, 60_000)

  it('before it: the team capped at Lv.50', async () => {
    await setTeam(['a', 'b', 'd'])
    expect((await team()).map((m) => m.level)).toEqual([50, 50, 50])
  })

  it('after it: each Pokémon at its own level, twice the same; a change of levels is a new version', async () => {
    await db.exec(sql(FILE))
    await db.exec(sql(FILE))
    const [{ v }] = (await setTeam(['a', 'b', 'd'])) as [{ v: number }]
    expect(v).toBe(2)
    expect(await team()).toEqual([
      { dex: 149, level: 88, shiny: false },
      { dex: 6, level: 50, shiny: true },
      { dex: 248, level: 100, shiny: false },
    ])
    // The same again changes nothing.
    expect(((await setTeam(['a', 'b', 'd'])) as [{ v: number }])[0].v).toBe(2)
  })

  it('the checks stay: under Lv.50, signed out, a team of two', async () => {
    await expect(setTeam(['a', 'b', 'c'])).rejects.toThrow(/versus_not_eligible/)
    await expect(setTeam(['a', 'b'])).rejects.toThrow(/versus_team_size/)
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`)
    await expect(db.query('select versus_set_team($1)', [['a', 'b', 'd']])).rejects.toThrow(
      /versus_signed_out/,
    )
  })
})
