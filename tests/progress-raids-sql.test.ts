// Migrations 0044 and 0045 against a real Postgres (PGlite, in process), on top of 0039: the progression raids (docs/24,
// a small world's too). The areas' raid content and the events row as the bundle has them, the admin's other settings
// kept, and a second run changing nothing; then the team left on a raid (from that raid's region's Box only), the
// friends who left one, the close counted once with the helpers' gifts, and Delete my data. Supabase's own pieces are
// stood in for at the top, as in friends-sql.test.ts.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import areasJson from '@/data/areas.json'
import { DEFAULT_CONFIG, type Area } from '@/engine'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')

const U = {
  ash: '00000000-0000-4000-8000-000000000001', // playing Kanto, Johto parked
  misty: '00000000-0000-4000-8000-000000000002', // playing Johto, Kanto parked
  brock: '00000000-0000-4000-8000-000000000003', // Kanto, no team left anywhere
  gary: '00000000-0000-4000-8000-000000000004', // not a friend
}
const bundled = areasJson as Area[]
const byName = (name: string) => bundled.find((a) => a.name === name)!
const SEAFOAM = byName('Seafoam Islands')
const FULLMOON = byName('Fullmoon Island')
const FARAWAY = byName('Faraway Island')
const ILEX = byName('Ilex Shrine')
const ARTICUNO = `${SEAFOAM.id}:144`

let db: PGlite

async function as<T = Record<string, unknown>>(
  user: string | null,
  q: string,
  params: unknown[] = [],
): Promise<T[]> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? ''])
  return (await db.query<T>(q, params)).rows
}
interface EventsRow {
  wheel: unknown
  raid: {
    access: string
    teamCap: number
    progress?: unknown
    calendar: { seed: number; anchors: unknown[] }
  }
}
const events = async () =>
  (await db.query<{ value: EventsRow }>(`select value from game_config where key = 'events'`)).rows[0]!.value
const bossesOf = async (id: string) =>
  (await db.query<{ b: unknown }>('select legendary_boss b from areas where id = $1', [id])).rows[0]!.b
const snapshot = async () => ({
  areas: (
    await db.query('select id, legendary_boss, rounds_to_clear, encounter_weights from areas order by id')
  ).rows,
  wild: (await db.query('select * from area_wild_pool order by id')).rows,
  events: await events(),
})
const setTeam = (user: string, key: string, region: string, ids: string[]) =>
  as<{ t: { dex: number; level: number; shiny: boolean }[] }>(
    user,
    'select raid_progress_set_team($1, $2, $3) t',
    [key, region, ids],
  )
const close = async (user: string, key: string, helpers: string[] = [], realm = 'main') =>
  (
    await as<{ r: { raidsWon: number; gifts: number } }>(user, 'select raid_progress_close($1, $2, $3) r', [
      key,
      helpers,
      realm,
    ])
  )[0]!.r

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
  `)
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
    '0038_delete_my_data.sql',
    '0039_extreme_realm.sql',
  ])
    await db.exec(sql(f))

  // The four areas as the live database had them before: Articuno and Cresselia plain bosses, Cresselia's island with
  // nothing to meet and no rounds, Mew's island without Mew, and Celebi's shrine with Celebi marked a raid by hand.
  const dexes = new Set([
    144,
    151,
    251,
    488,
    ...[FULLMOON, FARAWAY].flatMap((a) => a.wildPool.map((w) => w.dex)),
  ])
  for (const dex of dexes)
    await db.query(
      `insert into pokemon (dex, name, type1, base_hp, max_hp, speed, sprite_url, dice, rerolls) values ($1, $2, 'normal', 1, 1, 1, '', '[]', 0)`,
      [dex, `#${dex}`],
    )
  const put = (a: Area, bosses: unknown, rounds: number | null, weights: Record<string, number>) =>
    db.query(
      `insert into areas (id, order_index, region_id, name, rounds_to_clear, min_level, max_level, encounter_weights, legendary_boss)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        a.id,
        a.orderIndex,
        a.regionId ?? 'kanto',
        a.name,
        rounds,
        a.minLevel,
        a.maxLevel,
        JSON.stringify(weights),
        bosses == null ? null : JSON.stringify(bosses),
      ],
    )
  await put(SEAFOAM, [{ dex: 144, level: 50, teamAvgThreshold: 50 }], 1, {
    wild: 6,
    trainer: 0,
    center: 1,
    item: 1,
  })
  await put(FULLMOON, [{ dex: 488, level: 55, teamAvgThreshold: 0 }], null, {
    wild: 0,
    trainer: 0,
    center: 3,
    item: 0,
  })
  await put(FARAWAY, null, 1, { wild: 0, trainer: 0, center: 2, item: 0 })
  await put(ILEX, [{ dex: 251, level: 50, raid: true }], 1, { wild: 8, trainer: 0, center: 1, item: 0 })
  await db.query(`insert into game_config (key, value) values ('events', $1)`, [
    JSON.stringify({
      wheel: { access: 'all' },
      raid: {
        access: 'admin',
        teamCap: 50,
        helperDailyCap: 5,
        calendar: {
          seed: 7,
          anchors: [
            { date: '02-27', dex: 25, shiny: true },
            { date: '04-22', dex: 251, shiny: false },
            { date: '10-31', dex: 491, shiny: false },
          ],
        },
      },
    }),
  ])

  await db.exec(
    `insert into auth.users (id) values ${Object.values(U)
      .map((u) => `('${u}')`)
      .join(',')};`,
  )
  const save = (name: string, region: string, box: unknown[], parked: Record<string, unknown[]>) => ({
    version: 1,
    player: { name, character: 'red' },
    region,
    box,
    team: [],
    pokedex: [],
    areaProgress: {},
    parked: Object.fromEntries(
      Object.entries(parked).map(([r, b]) => [r, { box: b, team: [], pokedex: [], areaProgress: {} }]),
    ),
  })
  const putSave = (user: string, data: unknown, realm = 'main') =>
    db.query(`insert into saves (user_id, realm, data, updated_at) values ($1, $2, $3, now())`, [
      user,
      realm,
      JSON.stringify(data),
    ])
  await putSave(
    U.ash,
    save(
      'ASH',
      'kanto',
      [
        { id: 'a', dex: 4, level: 70 },
        { id: 'b', dex: 7, level: 35, shiny: true },
        { id: 'r', dex: 1, level: 60, revivesAt: 99 },
      ],
      { johto: [{ id: 'j', dex: 152, level: 60 }] },
    ),
  )
  await putSave(U.ash, save('ASH-X', 'kanto', [{ id: 'a', dex: 4, level: 20 }], {}), 'extreme')
  await putSave(
    U.misty,
    save('MISTY', 'johto', [{ id: 'm', dex: 158, level: 40 }], { kanto: [{ id: 'k', dex: 25, level: 80 }] }),
  )
  await putSave(U.brock, save('BROCK', 'kanto', [{ id: 'o', dex: 95, level: 50 }], {}))
  await putSave(U.gary, save('GARY', 'kanto', [{ id: 'g', dex: 9, level: 50 }], {}))
  await db.exec(`
    insert into friendships (user_a, user_b, added_by) values
      ('${U.ash}', '${U.misty}', '${U.ash}'), ('${U.ash}', '${U.brock}', '${U.ash}');
  `)

  await db.exec(sql('0044_progress_raids.sql'))
  // 0045 after it, twice: it must stay safe to run again.
  await db.exec(sql('0045_progress_raids_worlds.sql'))
  await db.exec(sql('0045_progress_raids_worlds.sql'))
}, 60_000)

describe('0044: the content', () => {
  it('makes every boss but the mythicals a raid, keeping its numbers', async () => {
    expect(await bossesOf(SEAFOAM.id)).toEqual([{ dex: 144, level: 50, teamAvgThreshold: 50, raid: true }])
    expect(await bossesOf(FULLMOON.id)).toEqual([{ dex: 488, level: 55, teamAvgThreshold: 0, raid: true }])
    // A mythical is never a raid, even marked one by hand.
    expect(await bossesOf(ILEX.id)).toEqual([{ dex: 251, level: 50 }])
  })

  it('brings the mythicals back as their lairs’ bosses, as the bundle has them', async () => {
    expect(await bossesOf(FARAWAY.id)).toEqual(FARAWAY.legendaryBoss)
  })

  it('makes a raid’s area completable: a round, and wild Pokémon to meet in it', async () => {
    const lair = (
      await db.query<{ r: number; w: Record<string, number> }>(
        'select rounds_to_clear r, encounter_weights w from areas where id = $1',
        [FULLMOON.id],
      )
    ).rows[0]!
    expect(lair.r).toBe(1)
    expect(lair.w).toMatchObject({ wild: 8, center: 1 })
    const wild = await db.query<{ dex: number }>(
      'select dex from area_wild_pool where area_id = $1 order by weight desc',
      [FULLMOON.id],
    )
    expect(wild.rows.map((r) => r.dex)).toEqual(FULLMOON.wildPool.map((w) => w.dex))
    // Areas the database hasn't got are skipped, not failed on.
    const areas = (await db.query<{ n: number }>('select count(distinct area_id)::int n from area_wild_pool'))
      .rows[0]!.n
    expect(areas).toBe(2)
  })

  it('turns the mythicals’ fixed dates shiny, adds the progression numbers, and keeps the admin’s other settings', async () => {
    const value = await events()
    expect(value.raid.calendar.anchors).toEqual([
      { date: '02-27', dex: 25, shiny: true },
      { date: '04-22', dex: 251, shiny: true },
      { date: '10-31', dex: 491, shiny: true },
    ])
    expect(value.raid.progress).toEqual(DEFAULT_CONFIG.events.raid.progress)
    expect(value.raid).toMatchObject({ access: 'admin', teamCap: 50, calendar: { seed: 7 } })
    expect(value.wheel).toEqual({ access: 'all' })
  })

  it('changes nothing when run again, and keeps progression numbers the admin set', async () => {
    await db.query(
      `update game_config set value = jsonb_set(value, '{raid,progress,teamCap}', '40') where key = 'events'`,
    )
    const before = await snapshot()
    await db.exec(sql('0044_progress_raids.sql'))
    await db.exec(sql('0045_progress_raids_worlds.sql'))
    expect(await snapshot()).toEqual(before)
    await db.query(
      `update game_config set value = jsonb_set(value, '{raid,progress,teamCap}', '50') where key = 'events'`,
    )
  })
})

describe('0044: the team left on a raid', () => {
  it('needs a signed-in player and a raid that exists', async () => {
    await expect(setTeam(null as never, ARTICUNO, 'kanto', ['a'])).rejects.toThrow(/events_signed_out/)
    await expect(setTeam(U.ash, `${FARAWAY.id}:151`, 'kanto', ['a'])).rejects.toThrow(/events_bad_raid/)
    await expect(setTeam(U.ash, `${SEAFOAM.id}:145`, 'kanto', ['a'])).rejects.toThrow(/events_bad_raid/)
    await expect(setTeam(U.ash, 'nope', 'kanto', ['a'])).rejects.toThrow(/events_bad_raid/)
    await expect(setTeam(U.ash, ARTICUNO, 'kanto', ['a', 'a'])).rejects.toThrow(/events_team_size/)
  })

  it('comes from that region’s Box only, none resting, at the raid’s cap at most', async () => {
    expect((await setTeam(U.ash, ARTICUNO, 'kanto', ['b', 'a']))[0]!.t).toEqual([
      { dex: 7, level: 35, shiny: true },
      { dex: 4, level: 50, shiny: false },
    ])
    // Johto's Box, parked, and a Pokémon resting after an Extreme K.O. are not Kanto's raid team.
    await expect(setTeam(U.ash, ARTICUNO, 'kanto', ['j'])).rejects.toThrow(/events_not_eligible/)
    await expect(setTeam(U.ash, ARTICUNO, 'kanto', ['r'])).rejects.toThrow(/events_not_eligible/)
    // Playing Johto, Misty leaves her parked Kanto Box's Pikachu.
    expect((await setTeam(U.misty, ARTICUNO, 'kanto', ['k']))[0]!.t).toEqual([
      { dex: 25, level: 50, shiny: false },
    ])
    await expect(setTeam(U.misty, ARTICUNO, 'kanto', ['m'])).rejects.toThrow(/events_not_eligible/)
  })

  it('reads the raid Pokémon’s own team cap, then the progression default', async () => {
    await db.query(
      `update game_config set value = jsonb_set(value, '{raid,progress,perMon}', '{"144": {"teamCap": 30}}') where key = 'events'`,
    )
    expect((await setTeam(U.ash, ARTICUNO, 'kanto', ['a']))[0]!.t).toEqual([
      { dex: 4, level: 30, shiny: false },
    ])
    await db.query(
      `update game_config set value = jsonb_set(value, '{raid,progress,perMon}', '{}') where key = 'events'`,
    )
    await db.query(
      `update game_config set value = jsonb_set(value, '{raid,progress,teamCap}', '45') where key = 'events'`,
    )
    expect((await setTeam(U.ash, ARTICUNO, 'kanto', ['b', 'a']))[0]!.t.map((m) => m.level)).toEqual([35, 45])
    await db.query(
      `update game_config set value = jsonb_set(value, '{raid,progress,teamCap}', '50') where key = 'events'`,
    )
  })

  it('shows your friends who left a team on this raid, and no one else', async () => {
    type Row = { user_id: string; name: string; team: { dex: number }[]; helped: number }
    const rows = await as<Row>(U.ash, 'select * from raid_progress_friend_teams($1)', [ARTICUNO])
    expect(rows.map((r) => [r.name, r.team.map((m) => m.dex), r.helped])).toEqual([['MISTY', [25], 0]])
    expect(await as(U.ash, 'select * from raid_progress_friend_teams($1)', [`${FULLMOON.id}:488`])).toEqual(
      [],
    )
    expect(await as(U.ash, `select * from raid_progress_friend_teams($1, 'extreme')`, [ARTICUNO])).toEqual([])
    // Gary isn't Ash's friend: Ash's team is nothing to him.
    expect(await as(U.gary, 'select * from raid_progress_friend_teams($1)', [ARTICUNO])).toEqual([])
  })
})

describe('0045: a small world’s raids', () => {
  // A world whose region the admin named with a dash, and an area of it with a raid; Brock is playing it.
  const WORLD_AREA = '30000000-0000-4000-8000-000000000001'
  const KEY = `${WORLD_AREA}:144`

  it('take the team from the Box of the raid’s own region, whatever the caller says', async () => {
    await db.query(
      `insert into areas (id, order_index, region_id, name, rounds_to_clear, min_level, max_level, encounter_weights, legendary_boss)
       values ($1, 99999, 'halloween-26', 'Haunted Hollow', 1, 40, 50, '{"wild": 8}', '[{"dex": 144, "level": 50, "raid": true}]')`,
      [WORLD_AREA],
    )
    await db.query(`update saves set data = $2 where user_id = $1 and realm = 'main'`, [
      U.brock,
      JSON.stringify({
        player: { name: 'BROCK', character: 'red' },
        region: 'halloween-26',
        box: [{ id: 'w', dex: 9, level: 70 }],
        team: ['w'],
        pokedex: [9],
        areaProgress: {},
        parked: {
          kanto: { box: [{ id: 'o', dex: 95, level: 50 }], team: [], pokedex: [], areaProgress: {} },
        },
      }),
    ])
    expect((await setTeam(U.brock, KEY, 'kanto', ['w']))[0]!.t).toEqual([{ dex: 9, level: 50, shiny: false }])
    const row = await db.query<{ region: string }>(
      'select region from raid_progress_teams where user_id = $1 and raid_key = $2',
      [U.brock, KEY],
    )
    expect(row.rows).toEqual([{ region: 'halloween-26' }])
    // Kanto's Box, parked while Brock plays the world, is not this raid's.
    await expect(setTeam(U.brock, KEY, 'halloween-26', ['o'])).rejects.toThrow(/events_not_eligible/)
    // And a Kanto raid takes Kanto's, parked or not.
    expect((await setTeam(U.brock, ARTICUNO, 'halloween-26', ['o']))[0]!.t).toEqual([
      { dex: 95, level: 50, shiny: false },
    ])
    // Brock leaves no team on Articuno for the tests below: only Misty helps there.
    await db.query('delete from raid_progress_teams where user_id = $1 and raid_key = $2', [
      U.brock,
      ARTICUNO,
    ])
  })
})

describe('0044: a raid caught', () => {
  it('counts once, one more raid won, a gift for each friend who left a team on it', async () => {
    const first = await close(U.ash, ARTICUNO, [U.misty, U.brock, U.ash, U.gary])
    // Brock left no team on it, Gary isn't a friend, Ash is the raider.
    expect(first).toEqual({ raidsWon: 1, gifts: 1 })
    const gifts = await db.query<{ helper_id: string; dex: number; raider_name: string }>(
      'select helper_id, dex, raider_name from raid_gifts',
    )
    expect(gifts.rows).toEqual([{ helper_id: U.misty, dex: 144, raider_name: 'ASH' }])
    expect(await close(U.ash, ARTICUNO, [U.misty])).toEqual({ raidsWon: 1, gifts: 0 })
    const helped = await as<{ helped: number }>(U.ash, 'select helped from raid_progress_friend_teams($1)', [
      ARTICUNO,
    ])
    expect(helped).toEqual([{ helped: 1 }])
  })

  it('refuses a raid that doesn’t exist, and counts each world apart', async () => {
    await expect(close(U.ash, `${FARAWAY.id}:151`)).rejects.toThrow(/events_bad_raid/)
    expect(await close(U.ash, ARTICUNO, [], 'extreme')).toEqual({ raidsWon: 1, gifts: 0 })
    expect(await close(U.ash, `${FULLMOON.id}:488`)).toEqual({ raidsWon: 2, gifts: 0 })
  })

  it('leaves the day’s raid as it was: its close still gives the helpers with a raid team their gift', async () => {
    await as(U.brock, `select raid_set_team(array['o'])`)
    const today = new Date().toISOString().slice(0, 10)
    await db.query(`update event_state set raid = $2 where user_id = $1 and realm = 'main'`, [
      U.ash,
      JSON.stringify({ day: today, dex: 151, shiny: true, areaId: FARAWAY.id, caught: false }),
    ])
    const r = (
      await as<{ r: { raidsWon: number; gifts: number } }>(U.ash, 'select raid_close($1) r', [
        [U.brock, U.misty],
      ])
    )[0]!.r
    expect(r).toEqual({ raidsWon: 3, gifts: 1 })
  })

  it('keeps the gift draw out of the game’s reach', async () => {
    const can = async (fn: string) =>
      (
        await db.query<{ ok: boolean }>(`select has_function_privilege('authenticated', $1, 'execute') ok`, [
          fn,
        ])
      ).rows[0]!.ok
    expect(await can('raid_give_gifts(uuid, uuid[], int, text, text)')).toBe(false)
    expect(await can('raid_progress_close(text, uuid[], text)')).toBe(true)
    expect(await can('raid_progress_set_team(text, text, text[], text)')).toBe(true)
  })
})

describe('0044: Delete my data', () => {
  it('takes the teams left and the raids caught, in the world asked for', async () => {
    const rows = async (table: string) =>
      (
        await db.query<{ realm: string }>(`select realm from ${table} where user_id = $1 order by realm`, [
          U.ash,
        ])
      ).rows
    expect((await rows('raid_progress_done')).map((r) => r.realm)).toEqual(['extreme', 'main', 'main'])
    await as(U.ash, `select delete_my_data('extreme')`)
    expect((await rows('raid_progress_done')).map((r) => r.realm)).toEqual(['main', 'main'])
    expect(await rows('raid_progress_teams')).toHaveLength(1)
    await as(U.ash, 'select delete_my_data()')
    expect(await rows('raid_progress_done')).toEqual([])
    expect(await rows('raid_progress_teams')).toEqual([])
    // Misty's team stays hers.
    expect(
      (await db.query('select 1 from raid_progress_teams where user_id = $1', [U.misty])).rows,
    ).toHaveLength(1)
  })
})
