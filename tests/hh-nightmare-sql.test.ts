// Newmoon Island's nightmare (docs/30) as a patch over live content: migration 0059 against a real Postgres (PGlite, in
// process). First over Haunted Hollow as 0052 to 0058 left it, plus the admin's own edits: only the mode lands, twice
// changes nothing, an admin's own mode stays. Then the server's checks on the area's raid (on top of the raids' own
// migrations and 0057's): with the switch off it's as before; on, it stays shut until the cloud save says the
// nightmare is over, and its teams go up to the area's cap; Distortion World's checks still hold. Last, the same patch
// over an admin export.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { BUNDLE } from '@/config/bundle'
import { DEFAULT_NIGHTMARE, type BundleRaw } from '@/engine'
import { REGION_ID, withHaunted } from '../scripts/content-haunted-hollow'
import { distortionArea } from '../scripts/patch-hh-distortion'
import { hhNightmareSql, newmoonArea, patchHhNightmare } from '../scripts/patch-hh-nightmare'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')
const NM = newmoonArea()
const DW = distortionArea()
const FILE = '0059_hh_nightmare.sql'

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

describe('0059: the content patch', () => {
  let db: PGlite
  const area = async () =>
    (
      await db.query<{ m: unknown; e: number }>(
        'select mode m, enemy_upgrade_level e from areas where id = $1',
        [NM.id],
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
    await db.exec(sql('0057_hh_distortion_world.sql'))
    // The admin's own edit since: its foes one level harder.
    await db.query('update areas set enemy_upgrade_level = 8 where id = $1', [NM.id])
    await db.exec(sql(FILE))
  }, 60_000)

  it('is what the patch script generates', () => {
    expect(sql(FILE)).toBe(hhNightmareSql())
  })

  it('gives Newmoon Island its nightmare, the admin’s edits kept, the switch Off; Distortion World untouched', async () => {
    const a = await area()
    expect(a.m).toEqual(DEFAULT_NIGHTMARE)
    expect(a.e).toBe(8)
    const sw = (await db.query<{ v: unknown }>(`select value v from game_config where key = 'nightmare'`))
      .rows[0]!.v
    expect(sw).toEqual({ access: 'off' })
    const dw = (await db.query<{ m: { kind: string } }>('select mode m from areas where id = $1', [DW.id]))
      .rows[0]!
    expect(dw.m.kind).toBe('portal')
  })

  it('runs again changing nothing but the content version; an admin’s own mode and switch stay', async () => {
    await db.query(`update areas set mode = jsonb_set(mode, '{strikePercent}', '15') where id = $1`, [NM.id])
    await db.exec(`update game_config set value = '{"access":"all"}' where key = 'nightmare'`)
    await db.exec(sql(FILE))
    expect(((await area()).m as { strikePercent: number }).strikePercent).toBe(15)
    const v = (await db.query<{ v: unknown }>(`select value v from game_config where key = 'configVersion'`))
      .rows[0]!.v
    expect(v).toBe(98 + 5)
    const sw = (await db.query<{ v: unknown }>(`select value v from game_config where key = 'nightmare'`))
      .rows[0]!.v
    expect(sw).toEqual({ access: 'all' })
  })
})

describe('0059: the raid’s checks', () => {
  let db: PGlite
  const ME = '00000000-0000-4000-8000-0000000000aa'
  const KEY = `${NM.id}:491`
  const DW_KEY = `${DW.id}:487`
  const as = async <T>(q: string, params: unknown[] = []) => {
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [ME])
    return (await db.query<T>(q, params)).rows
  }
  const save = (won: boolean, parked: boolean, portalWon = false) => {
    const block = {
      box: [{ id: 'g', dex: 94, level: 95 }],
      team: ['g'],
      pokedex: [94],
      areaProgress: {
        [NM.id]: { cleared: false, nightmare: { active: false, round: won ? 7 : 3, won } },
        [DW.id]: {
          cleared: false,
          portal: { active: false, closed: portalWon ? 10 : 0, deck: [], won: portalWon },
        },
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
  const setTeam = (key = KEY) =>
    as<{ t: { level: number }[] }>('select raid_progress_set_team($1, $2, $3) t', [key, REGION_ID, ['g']])
  const close = () => as<{ r: { raidsWon: number } }>('select raid_progress_close($1) r', [KEY])
  const access = (key: string, a: string) =>
    db.query(`update game_config set value = $1 where key = $2`, [JSON.stringify({ access: a }), key])

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
    // In the order they ran live: 0045 before 0052 (0045 takes the raid off every mythical it finds, and Darkrai is
    // one: Haunted Hollow's came after it, a raid of its own).
    await db.exec(sql('0045_progress_raids.sql'))
    await db.exec(sql('0046_progress_raids_worlds.sql'))
    await db.exec(sql('0052_haunted_hollow.sql'))
    await db.exec(sql('0057_hh_distortion_world.sql'))
    await db.exec(sql(FILE))
    await putSave(save(false, false))
  }, 60_000)

  it('switched off: the raid is as before (the progression cap, no nightmare asked)', async () => {
    const [{ t }] = (await setTeam()) as [{ t: { level: number }[] }]
    expect(t[0]!.level).toBe(50)
  })

  it('switched on: shut until the nightmare is over', async () => {
    await access('nightmare', 'all')
    await expect(setTeam()).rejects.toThrow(/events_raid_locked/)
    await expect(close()).rejects.toThrow(/events_raid_locked/)
  })

  it('over (the world parked or played): teams up to the area’s cap, and the close counts once', async () => {
    await putSave(save(true, true))
    const [{ t }] = (await setTeam()) as [{ t: { level: number }[] }]
    expect(t[0]!.level).toBe(70)
    await putSave(save(true, false))
    expect((await close())[0]!.r.raidsWon).toBe(1)
    expect((await close())[0]!.r.raidsWon).toBe(1)
  })

  it('Distortion World’s raid keeps 0057’s checks: shut until its run is won, whatever the nightmare says', async () => {
    await access('portalRun', 'all')
    await putSave(save(true, false, false))
    await expect(setTeam(DW_KEY)).rejects.toThrow(/events_raid_locked/)
    await putSave(save(true, false, true))
    const [{ t }] = (await setTeam(DW_KEY)) as [{ t: { level: number }[] }]
    expect(t[0]!.level).toBe(95)
  })

  it('on for the admin only: a player is as before', async () => {
    await access('nightmare', 'admin')
    await putSave(save(false, false))
    const [{ t }] = (await setTeam()) as [{ t: { level: number }[] }]
    expect(t[0]!.level).toBe(50)
  })
})

describe('the export patch', () => {
  // An export holding 0052's Newmoon Island (no mode), with an admin edit of its own.
  const live = (): BundleRaw => {
    const b = withHaunted(BUNDLE as BundleRaw)
    return {
      ...b,
      areas: b.areas.map((a) => (a.id === NM.id ? { ...a, mode: undefined, enemyUpgradeLevel: 8 } : a)),
    }
  }

  it('sets the mode only, and the switch Off', () => {
    const before = live()
    const out = patchHhNightmare(before)
    const nm = out.areas.find((a) => a.id === NM.id)!
    expect(nm.mode).toEqual(DEFAULT_NIGHTMARE)
    expect(nm.enemyUpgradeLevel).toBe(8)
    expect(out.areas.filter((a) => a.id !== NM.id)).toEqual(before.areas.filter((a) => a.id !== NM.id))
    expect((out.config as { nightmare?: unknown }).nightmare).toEqual({ access: 'off' })
    expect(Number((out.config as { configVersion: number }).configVersion)).toBe(
      Number((before.config as { configVersion: number }).configVersion) + 1,
    )
  })

  it('leaves an admin’s own mode and switch', () => {
    const b = live()
    const own: BundleRaw = {
      ...b,
      areas: b.areas.map((a) =>
        a.id === NM.id ? { ...a, mode: { ...DEFAULT_NIGHTMARE, strikePercent: 20 } } : a,
      ),
      config: { ...b.config, nightmare: { access: 'admin' } },
    }
    const nm = patchHhNightmare(own).areas.find((a) => a.id === NM.id)!
    expect(nm.mode?.kind === 'nightmare' && nm.mode.strikePercent).toBe(20)
    expect((patchHhNightmare(own).config as { nightmare: unknown }).nightmare).toEqual({ access: 'admin' })
  })

  it('refuses an export without Haunted Hollow', () => {
    expect(() => patchHhNightmare(BUNDLE as BundleRaw)).toThrow(/no Haunted Hollow/)
  })
})
