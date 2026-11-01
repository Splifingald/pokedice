// The Stairway of Plates' own switch (docs/61 §4.5) on the server: migration 0125 against a real Postgres (PGlite, in
// process), over the portal run's 0057, the raids' own migrations and Snowglobe Valley's 0120. The switch lands Off
// (an admin's own stays) and twice changes nothing but the content version. Then the raids' checks: the Hall of
// Origin's raid (a 'plates' portal area) answers to `platesRun` alone, and a portal area in Distortion World's look to
// `portalRun` alone, so either opens without the other.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { BUNDLE } from '@/config/bundle'
import { DEFAULT_PORTAL_RUN } from '@/engine'
import { REGION_ID, snowglobe } from '../scripts/content-snowglobe-valley'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')
const FILE = '0125_plates_run.sql'
const HO = snowglobe().areas.find((a) => a.name === 'Hall of Origin')!
// Spear Pillar stands in for a portal area in Distortion World's look (no skin), in the same world.
const SP = snowglobe().areas.find((a) => a.name === 'Spear Pillar')!

const AUTH = `create role anon; create role authenticated; create schema auth; create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;`

async function speciesInto(db: PGlite) {
  const dexes = [...new Set(BUNDLE.pokemon.map((p) => p.dex))]
  await db.exec(
    `insert into pokemon (dex, name, type1, base_hp, max_hp, speed, sprite_url, dice, rerolls, catch_value, evolutions, milestones) values ` +
      dexes.map((d) => `(${d}, 'p${d}', 'ice', 10, 100, 5, '', '[]', 1, 3, '[]', '[]')`).join(', ') +
      ' on conflict (dex) do nothing',
  )
}

/** A fresh database with the raids' migrations, the special areas' checks (0057, 0060) and Snowglobe Valley (0120). */
async function database(): Promise<PGlite> {
  const db = new PGlite()
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
  await speciesInto(db)
  await db.exec(`insert into game_config (key, value) values ('configVersion', '120'),
    ('events', '{"raid": {"access": "all", "teamCap": 50}}')
    on conflict (key) do update set value = excluded.value`)
  await db.exec(sql('0045_progress_raids.sql'))
  await db.exec(sql('0046_progress_raids_worlds.sql'))
  await db.exec(sql('0057_hh_distortion_world.sql'))
  await db.exec(sql('0060_hh_nightmare.sql'))
  await db.exec(sql('0120_snowglobe_valley.sql'))
  await db.query('update areas set mode = $2 where id = $1', [SP.id, JSON.stringify(DEFAULT_PORTAL_RUN)])
  return db
}

const cfg = async (db: PGlite, key: string) =>
  (await db.query<{ v: unknown }>(`select value v from game_config where key = $1`, [key])).rows[0]?.v

describe('0125: the Stairway of Plates’ switch', () => {
  let db: PGlite

  beforeAll(async () => {
    db = await database()
    await db.exec(sql(FILE))
  }, 60_000)

  it('lands Off, the Hall of Origin still dressed as the Stairway', async () => {
    expect(await cfg(db, 'platesRun')).toEqual({ access: 'off' })
    const mode = (await db.query<{ m: { skin?: string } }>('select mode m from areas where id = $1', [HO.id]))
      .rows[0]!.m
    expect(mode.skin).toBe('plates')
  })

  it('runs again changing nothing but the content version; an admin’s own switch stays', async () => {
    const before = Number(await cfg(db, 'configVersion'))
    await db.exec(`update game_config set value = '{"access":"admin"}' where key = 'platesRun'`)
    await db.exec(sql(FILE))
    expect(await cfg(db, 'platesRun')).toEqual({ access: 'admin' })
    expect(Number(await cfg(db, 'configVersion'))).toBe(before + 1)
  })

  it('is inlined in seed.sql', () => {
    const seed = readFileSync(path.join(MIG, '..', 'seed.sql'), 'utf8')
    const body = sql(FILE).replace(/^(begin|commit);\n/gm, '')
    expect(seed).toContain(`-- ↓ supabase/migrations/${FILE}, inlined so this file stands alone.\n${body}`)
  })
})

describe('0125: each portal raid on its own switch', () => {
  let db: PGlite
  const ME = '00000000-0000-4000-8000-0000000000cc'
  const ARCEUS = `${HO.id}:493`
  const DIALGA = `${SP.id}:483`
  const as = async <T>(q: string, params: unknown[] = []) => {
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [ME])
    return (await db.query<T>(q, params)).rows
  }
  /** A cloud save in Snowglobe Valley whose portal runs are won (or not) in both areas. */
  const save = (won: boolean) => ({
    version: 1,
    region: REGION_ID,
    box: [{ id: 'g', dex: 181, level: 95 }],
    team: ['g'],
    pokedex: [181],
    areaProgress: Object.fromEntries(
      [HO.id, SP.id].map((id) => [
        id,
        { cleared: false, portal: { active: false, closed: 3, deck: [], won } },
      ]),
    ),
    parked: {},
  })
  const putSave = (data: unknown) =>
    db.query(
      `insert into saves (user_id, realm, data, updated_at) values ($1, 'main', $2, now())
       on conflict (user_id, realm) do update set data = excluded.data`,
      [ME, JSON.stringify(data)],
    )
  const setTeam = async (key: string) =>
    (
      await as<{ t: { level: number }[] }>('select raid_progress_set_team($1, $2, $3) t', [
        key,
        REGION_ID,
        ['g'],
      ])
    )[0]!.t
  const access = (key: string, a: string) =>
    db.query(`update game_config set value = $2 where key = $1`, [key, JSON.stringify({ access: a })])

  beforeAll(async () => {
    db = await database()
    await db.exec(sql(FILE))
    await db.exec(`insert into auth.users (id) values ('${ME}')`)
    await putSave(save(false))
  }, 60_000)

  it('both switches off: both raids are as before (no run asked)', async () => {
    expect((await setTeam(ARCEUS))[0]!.level).toBe(50)
    expect((await setTeam(DIALGA))[0]!.level).toBe(50)
  })

  it('`portalRun` on: Distortion World’s look shuts until won, the Stairway stays as before', async () => {
    await access('portalRun', 'all')
    await expect(setTeam(DIALGA)).rejects.toThrow(/events_raid_locked/)
    expect((await setTeam(ARCEUS))[0]!.level).toBe(50)
  })

  it('`platesRun` on alone: the Stairway shuts until won, the other as before', async () => {
    await access('portalRun', 'off')
    await access('platesRun', 'all')
    await expect(setTeam(ARCEUS)).rejects.toThrow(/events_raid_locked/)
    await expect(as('select raid_progress_close($1)', [ARCEUS])).rejects.toThrow(/events_raid_locked/)
    expect((await setTeam(DIALGA))[0]!.level).toBe(50)
  })

  it('the climb won: Arceus’s raid takes teams up to the Hall’s own cap', async () => {
    await putSave(save(true))
    expect((await setTeam(ARCEUS))[0]!.level).toBe(90)
  })

  it('`platesRun` on for the admin only: a player is as before', async () => {
    await access('platesRun', 'admin')
    await putSave(save(false))
    expect((await setTeam(ARCEUS))[0]!.level).toBe(50)
  })
})
