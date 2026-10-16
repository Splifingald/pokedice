// Distortion World's portal run (docs/28) as a patch over live content: migration 0057 against a real Postgres (PGlite,
// in process). First over Haunted Hollow as 0052 and 0055 left it, plus the admin's own edits: only the count and the
// mode land, twice changes nothing, an admin's own count stays. Then the server's checks on the area's raid (on top of
// the raids' own migrations): with the switch off it's as before; on, it stays shut until the cloud save says the run is
// won, and its teams go up to the area's cap. Last, the same patch over an admin export.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { BUNDLE } from '@/config/bundle'
import { DEFAULT_PORTAL_RUN, type BundleRaw } from '@/engine'
import { REGION_ID, withHaunted } from '../scripts/content-haunted-hollow'
import { distortionArea, hhDistortionSql, patchHhDistortion } from '../scripts/patch-hh-distortion'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')
const DW = distortionArea()
const FILE = '0057_hh_distortion_world.sql'

const AUTH = `create role anon; create role authenticated; create schema auth; create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;`

async function speciesInto(db: PGlite) {
  const dexes = [...new Set(BUNDLE.pokemon.map((p) => p.dex))]
  await db.exec(
    `insert into pokemon (dex, name, type1, base_hp, max_hp, speed, sprite_url, dice, rerolls, catch_value, evolutions, milestones) values ` +
      dexes.map((d) => `(${d}, 'p${d}', 'ghost', 10, 100, 5, '', '[]', 1, 3, '[]', '[]')`).join(', ') +
      ' on conflict (dex) do nothing',
  )
}

describe('0057: the content patch', () => {
  let db: PGlite
  const area = async () =>
    (
      await db.query<{ u: unknown; m: unknown; e: number }>(
        'select unlock_conditions u, mode m, enemy_upgrade_level e from areas where id = $1',
        [DW.id],
      )
    ).rows[0]!

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(AUTH)
    await db.exec(sql('0001_init.sql').replace('create extension if not exists pgcrypto;', ''))
    await db.exec(sql('0016_regions.sql'))
    await db.exec('alter table areas add column if not exists rounds_to_clear int;')
    await speciesInto(db)
    await db.exec(`insert into game_config (key, value) values ('configVersion', '98')`)
    await db.exec(sql('0052_haunted_hollow.sql'))
    await db.exec(sql('0055_hh_new_species.sql'))
    // The admin's own edit since: its foes one level harder.
    await db.query('update areas set enemy_upgrade_level = 9 where id = $1', [DW.id])
    await db.exec(sql(FILE))
  }, 60_000)

  it('is what the patch script generates', () => {
    expect(sql(FILE)).toBe(hhDistortionSql())
  })

  it('opens Distortion World at 100 and gives it its portal run, the admin’s edits kept', async () => {
    const a = await area()
    expect(a.u).toEqual([{ kind: 'pokedex', count: 100 }])
    expect(a.m).toEqual(DEFAULT_PORTAL_RUN)
    expect(a.e).toBe(9)
    const sw = (await db.query<{ v: unknown }>(`select value v from game_config where key = 'portalRun'`))
      .rows[0]!.v
    expect(sw).toEqual({ access: 'off' })
  })

  it('runs again changing nothing but the content version; an admin’s own count and mode stay', async () => {
    await db.query(
      `update areas set unlock_conditions = '[{"kind":"pokedex","count":110}]', mode = jsonb_set(mode, '{portals}', '7') where id = $1`,
      [DW.id],
    )
    await db.exec(`update game_config set value = '{"access":"all"}' where key = 'portalRun'`)
    await db.exec(sql(FILE))
    const a = await area()
    expect(a.u).toEqual([{ kind: 'pokedex', count: 110 }])
    expect((a.m as { portals: number }).portals).toBe(7)
    const v = (await db.query<{ v: unknown }>(`select value v from game_config where key = 'configVersion'`))
      .rows[0]!.v
    expect(v).toBe(98 + 4)
    const sw = (await db.query<{ v: unknown }>(`select value v from game_config where key = 'portalRun'`))
      .rows[0]!.v
    expect(sw).toEqual({ access: 'all' })
  })
})

describe('0057: the raid’s checks', () => {
  let db: PGlite
  const ME = '00000000-0000-4000-8000-0000000000aa'
  const KEY = `${DW.id}:487`
  const as = async <T>(q: string, params: unknown[] = []) => {
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [ME])
    return (await db.query<T>(q, params)).rows
  }
  const save = (won: boolean, parked: boolean) => {
    const block = {
      box: [{ id: 'g', dex: 94, level: 90 }],
      team: ['g'],
      pokedex: [94],
      areaProgress: {
        [DW.id]: { cleared: false, portal: { active: false, closed: won ? 10 : 3, deck: [], won } },
      },
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
  const setTeam = () =>
    as<{ t: { level: number }[] }>('select raid_progress_set_team($1, $2, $3) t', [KEY, REGION_ID, ['g']])
  const close = () => as<{ r: { raidsWon: number } }>('select raid_progress_close($1) r', [KEY])
  const access = (a: string) =>
    db.query(`update game_config set value = $1 where key = 'portalRun'`, [JSON.stringify({ access: a })])

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
    await speciesInto(db)
    await db.exec(`insert into auth.users (id) values ('${ME}')`)
    await db.exec(`insert into game_config (key, value) values ('events', '{"raid": {"access": "all", "teamCap": 50}}')
      on conflict (key) do update set value = excluded.value`)
    await db.exec(sql('0052_haunted_hollow.sql'))
    await db.exec(sql('0045_progress_raids.sql'))
    await db.exec(sql('0046_progress_raids_worlds.sql'))
    await db.exec(sql(FILE))
    await putSave(save(false, false))
  }, 60_000)

  it('switched off: the raid is as before (the progression cap, no portal asked)', async () => {
    const [{ t }] = (await setTeam()) as [{ t: { level: number }[] }]
    expect(t[0]!.level).toBe(50)
  })

  it('switched on: shut until the run is won', async () => {
    await access('all')
    await expect(setTeam()).rejects.toThrow(/events_raid_locked/)
    await expect(close()).rejects.toThrow(/events_raid_locked/)
  })

  it('won (the world parked or played): teams up to the area’s cap, and the close counts once', async () => {
    await putSave(save(true, true))
    const [{ t }] = (await setTeam()) as [{ t: { level: number }[] }]
    expect(t[0]!.level).toBe(90)
    await putSave(save(true, false))
    expect((await close())[0]!.r.raidsWon).toBe(1)
    expect((await close())[0]!.r.raidsWon).toBe(1)
  })

  it('on for the admin only: a player is as before', async () => {
    await access('admin')
    await putSave(save(false, false))
    const [{ t }] = (await setTeam()) as [{ t: { level: number }[] }]
    expect(t[0]!.level).toBe(50)
  })
})

describe('the export patch', () => {
  // An export holding 0052's Distortion World (119, no mode), with an admin edit of its own.
  const live = (): BundleRaw => {
    const b = withHaunted(BUNDLE as BundleRaw)
    return {
      ...b,
      areas: b.areas.map((a) =>
        a.id === DW.id
          ? {
              ...a,
              unlockConditions: [{ kind: 'pokedex', count: 119 }],
              mode: undefined,
              enemyUpgradeLevel: 9,
            }
          : a,
      ),
    }
  }

  it('sets the count and the mode only, and the switch Off', () => {
    const before = live()
    const out = patchHhDistortion(before)
    const dw = out.areas.find((a) => a.id === DW.id)!
    expect(dw.unlockConditions).toEqual([{ kind: 'pokedex', count: 100 }])
    expect(dw.mode).toEqual(DEFAULT_PORTAL_RUN)
    expect(dw.enemyUpgradeLevel).toBe(9)
    expect(out.areas.filter((a) => a.id !== DW.id)).toEqual(before.areas.filter((a) => a.id !== DW.id))
    expect((out.config as { portalRun?: unknown }).portalRun).toEqual({ access: 'off' })
    expect(Number((out.config as { configVersion: number }).configVersion)).toBe(
      Number((before.config as { configVersion: number }).configVersion) + 1,
    )
  })

  it('leaves an admin’s own count, mode and switch', () => {
    const b = live()
    const own = {
      ...b,
      areas: b.areas.map((a) =>
        a.id === DW.id
          ? {
              ...a,
              unlockConditions: [{ kind: 'pokedex' as const, count: 90 }],
              mode: { ...DEFAULT_PORTAL_RUN, portals: 5 },
            }
          : a,
      ),
      config: { ...b.config, portalRun: { access: 'admin' } },
    }
    const dw = patchHhDistortion(own).areas.find((a) => a.id === DW.id)!
    expect(dw.unlockConditions).toEqual([{ kind: 'pokedex', count: 90 }])
    expect(dw.mode?.kind === 'portal' && dw.mode.portals).toBe(5)
    expect((patchHhDistortion(own).config as { portalRun: unknown }).portalRun).toEqual({ access: 'admin' })
  })
})
