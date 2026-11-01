// The race of time and space (docs/64 §4.4) on the server: migration 0126 against a real Postgres (PGlite, in process),
// over Snowglobe Valley's 0122 and the raids' own migrations. Spear Pillar gets its race only where it has none (an
// admin's own stays), the switch lands Off, and twice changes nothing but the content version. Then the raid's checks:
// switched off, Dialga's and Palkia's raids are as before; on, each stays shut (teams, close) until the cloud save says
// the race was won at that legend's gate, the world played or parked; the nightmare's and the portal run's checks stay.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { BUNDLE } from '@/config/bundle'
import { DEFAULT_TIME_RACE } from '@/engine'
import { REGION_ID, snowglobe } from '../scripts/content-snowglobe-valley'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')
const FILE = '0126_time_race.sql'
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

/** A fresh database with the raids' migrations, the special areas' checks (0057, 0060) and Snowglobe Valley (0122). */
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
  // 0122 as live will have it before the race is generated into it: Spear Pillar with no mode yet.
  await db.exec(sql('0122_snowglobe_valley.sql'))
  await db.query('update areas set mode = null where id = $1', [SP.id])
  return db
}

const cfg = async (db: PGlite, key: string) =>
  (await db.query<{ v: unknown }>(`select value v from game_config where key = $1`, [key])).rows[0]?.v

describe('0126: the race on Spear Pillar and its switch', () => {
  let db: PGlite
  const mode = async () =>
    (await db.query<{ m: unknown }>('select mode m from areas where id = $1', [SP.id])).rows[0]!.m

  beforeAll(async () => {
    db = await database()
    await db.exec(sql(FILE))
  }, 60_000)

  it('gives Spear Pillar its race with the engine’s numbers, and the switch Off', async () => {
    expect(await mode()).toEqual(DEFAULT_TIME_RACE)
    expect(await cfg(db, 'timeRace')).toEqual({ access: 'off' })
  })

  it('runs again changing nothing but the content version; an admin’s own race and switch stay', async () => {
    const before = Number(await cfg(db, 'configVersion'))
    await db.query(`update areas set mode = jsonb_set(mode, '{seconds}', '900') where id = $1`, [SP.id])
    await db.exec(`update game_config set value = '{"access":"admin"}' where key = 'timeRace'`)
    await db.exec(sql(FILE))
    expect((await mode()) as { seconds: number }).toMatchObject({ seconds: 900 })
    expect(await cfg(db, 'timeRace')).toEqual({ access: 'admin' })
    expect(Number(await cfg(db, 'configVersion'))).toBe(before + 1)
  })

  it('is inlined in seed.sql (its Spear Pillar patch a no-op there: the bundle has no Snowglobe Valley)', () => {
    const seed = readFileSync(path.join(MIG, '..', 'seed.sql'), 'utf8')
    const body = sql(FILE).replace(/^(begin|commit);\n/gm, '')
    expect(seed).toContain(`-- ↓ supabase/migrations/${FILE}, inlined so this file stands alone.\n${body}`)
  })
})

describe('0126: the raids’ checks', () => {
  let db: PGlite
  const ME = '00000000-0000-4000-8000-0000000000bb'
  const DIALGA = `${SP.id}:483`
  const PALKIA = `${SP.id}:484`
  const as = async <T>(q: string, params: unknown[] = []) => {
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [ME])
    return (await db.query<T>(q, params)).rows
  }
  /** A cloud save whose race opened these legends' raids, the world played (or parked). */
  const save = (won: number[], parked = false) => {
    const block = {
      box: [{ id: 'g', dex: 181, level: 72 }],
      team: ['g'],
      pokedex: [181],
      areaProgress: { [SP.id]: { cleared: false, timeRace: { active: false, fights: 0, path: [], won } } },
    }
    return parked
      ? {
          version: 1,
          region: 'kanto',
          box: [],
          team: [],
          pokedex: [],
          areaProgress: {},
          parked: { [REGION_ID]: block },
        }
      : { version: 1, region: REGION_ID, ...block, parked: {} }
  }
  const putSave = (data: unknown) =>
    db.query(
      `insert into saves (user_id, realm, data, updated_at) values ($1, 'main', $2, now())
       on conflict (user_id, realm) do update set data = excluded.data`,
      [ME, JSON.stringify(data)],
    )
  const setTeam = (key: string) =>
    as<{ t: { level: number }[] }>('select raid_progress_set_team($1, $2, $3) t', [key, REGION_ID, ['g']])
  const close = (key: string) => as<{ r: { raidsWon: number } }>('select raid_progress_close($1) r', [key])
  const access = (a: string) =>
    db.query(`update game_config set value = $1 where key = 'timeRace'`, [JSON.stringify({ access: a })])

  beforeAll(async () => {
    db = await database()
    await db.exec(sql(FILE))
    await db.exec(`insert into auth.users (id) values ('${ME}')`)
    await putSave(save([]))
  }, 60_000)

  it('switched off: both raids are as before (no race asked)', async () => {
    expect((await setTeam(DIALGA))[0]!.t).toHaveLength(1)
    expect((await setTeam(PALKIA))[0]!.t).toHaveLength(1)
  })

  it('switched on: both shut until a race is won', async () => {
    await access('all')
    await expect(setTeam(DIALGA)).rejects.toThrow(/events_raid_locked/)
    await expect(setTeam(PALKIA)).rejects.toThrow(/events_raid_locked/)
    await expect(close(DIALGA)).rejects.toThrow(/events_raid_locked/)
  })

  it('won at the Water gate (the world parked or played): only Palkia’s opens, and its close counts once', async () => {
    await putSave(save([484], true))
    expect((await setTeam(PALKIA))[0]!.t).toHaveLength(1)
    await expect(setTeam(DIALGA)).rejects.toThrow(/events_raid_locked/)
    await putSave(save([484]))
    expect((await close(PALKIA))[0]!.r.raidsWon).toBe(1)
    expect((await close(PALKIA))[0]!.r.raidsWon).toBe(1)
    await expect(close(DIALGA)).rejects.toThrow(/events_raid_locked/)
  })

  it('the replay won at the Steel gate: Dialga’s opens too', async () => {
    await putSave(save([484, 483]))
    expect((await setTeam(DIALGA))[0]!.t).toHaveLength(1)
    expect((await close(DIALGA))[0]!.r.raidsWon).toBe(2)
  })

  it('on for the admin only: a player is as before', async () => {
    await access('admin')
    await putSave(save([]))
    expect((await setTeam(DIALGA))[0]!.t).toHaveLength(1)
  })

  it('keeps the nightmare’s and the portal run’s checks', async () => {
    const fn = (
      await db.query<{ src: string }>(
        `select prosrc src from pg_proc where proname = 'raid_progress_special_locked'`,
      )
    ).rows[0]!.src
    expect(fn).toMatch(/raid_progress_portal_won/)
    expect(fn).toMatch(/raid_progress_nightmare_won/)
    expect(fn).toMatch(/raid_progress_time_race_won/)
  })
})
