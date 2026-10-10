// Migration 0033 against a real Postgres (PGlite, in process): the leaderboard on player cards must return exactly the
// rows the old rebuild did, the cards must follow the saves, and every friends function must keep its rules. Supabase's
// own pieces (the auth schema, the anon / authenticated roles) are stood in for at the top.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')

const U = {
  ash: '00000000-0000-4000-8000-000000000001',
  misty: '00000000-0000-4000-8000-000000000002',
  brock: '00000000-0000-4000-8000-000000000003',
  gary: '00000000-0000-4000-8000-000000000004',
  erika: '00000000-0000-4000-8000-000000000005',
  luna: '00000000-0000-4000-8000-000000000006',
  zed: '00000000-0000-4000-8000-000000000007',
}
const T = {
  boulder: '10000000-0000-4000-8000-000000000001',
  cascade: '10000000-0000-4000-8000-000000000002',
  zephyr: '10000000-0000-4000-8000-000000000003',
  plain: '10000000-0000-4000-8000-000000000004',
}
const LEAGUE = { kanto: '20000000-0000-4000-8000-000000000001', johto: '20000000-0000-4000-8000-000000000002' }

const mon = (id: string, dex: number, level: number, shiny = false) => ({ id, dex, level, ...(shiny && { shiny: true }) })

function save(o: {
  name?: string
  character?: string
  avatar?: string
  region?: string
  gyms?: string[]
  team?: ReturnType<typeof mon>[]
  pokedex?: number[]
  dayCare?: { level: number; shiny?: boolean }[]
  parked?: Record<string, unknown>
  leagueCleared?: boolean
}) {
  const team = o.team ?? [mon('a', 25, 12)]
  return {
    version: 1,
    ...(o.region && { region: o.region }),
    player: { name: o.name ?? '', character: o.character ?? 'red', ...(o.avatar && { avatar: o.avatar }) },
    box: team,
    team: team.map((m) => m.id),
    pokedex: o.pokedex ?? [25],
    currentAreaId: 'route-1',
    areaProgress: {
      'route-1': { cleared: true, gymsDefeated: o.gyms ?? [] },
      [LEAGUE.kanto]: { cleared: !!o.leagueCleared, gymsDefeated: [] },
    },
    ...(o.dayCare && {
      dayCare: { residents: o.dayCare.map((r, i) => ({ inst: { id: `d${i}`, dex: 1, level: r.level, shiny: !!r.shiny } })) },
    }),
    ...(o.parked && { parked: o.parked }),
  }
}

let db: PGlite

async function as<T = Record<string, unknown>>(user: string | null, q: string, params: unknown[] = []): Promise<T[]> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? ''])
  return (await db.query<T>(q, params)).rows
}

async function putSave(user: string, data: unknown, hoursAgo = 0) {
  await db.query(
    `insert into saves (user_id, data, updated_at) values ($1, $2, now() - make_interval(hours => $3))
     on conflict (user_id) do update set data = excluded.data, updated_at = excluded.updated_at`,
    [user, JSON.stringify(data), hoursAgo],
  )
}

type BoardRow = { region: string; is_me: boolean | null; name: string; character: string; team: unknown; pokedex: number; max_level: number; shinies: number; progress: unknown }
const comparable = (rows: BoardRow[]) =>
  rows
    .map((r) => ({ region: r.region, is_me: !!r.is_me, name: r.name, character: r.character, team: r.team, pokedex: r.pokedex, max_level: r.max_level, shinies: r.shinies, progress: r.progress }))
    .sort((a, b) => `${a.name}|${a.region}`.localeCompare(`${b.name}|${b.region}`))

const oldBoards: Record<string, BoardRow[]> = {}

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
  for (const f of ['0011_leaderboard.sql', '0016_regions.sql', '0018_versus.sql', '0032_leaderboard_shiny.sql'])
    await db.exec(sql(f))

  await db.exec(`
    insert into auth.users (id) values ${Object.values(U).map((u) => `('${u}')`).join(',')};
    insert into regions (id, name, order_index, dex_range, starters, league_area_id, next_region) values
      ('kanto', 'Kanto', 1, '[1,151]', '[1,4,7]', '${LEAGUE.kanto}', 'johto'),
      ('johto', 'Johto', 2, '[152,251]', '[152,155,158]', '${LEAGUE.johto}', null);
    insert into trainers (id, name, team, role, badge) values
      ('${T.boulder}', 'Brock', '[]', 'leader', 'Boulder Badge'),
      ('${T.cascade}', 'Misty', '[]', 'leader', 'Cascade Badge'),
      ('${T.zephyr}', 'Falkner', '[]', 'leader', 'Zephyr Badge'),
      ('${T.plain}', 'Youngster', '[]', 'trainer', null);
  `)
  await putSave(U.ash, save({
    name: 'ASH', avatar: 'kanto/youngster', gyms: [T.boulder, T.cascade, T.plain],
    team: [mon('p1', 4, 30, true), mon('p2', 7, 25)], pokedex: [1, 4, 4, 7], dayCare: [{ level: 40, shiny: true }],
    leagueCleared: true,
    parked: {
      johto: {
        box: [mon('j1', 155, 18)], team: ['j1'], pokedex: [155, 152],
        areaProgress: { 'route-29': { cleared: true, gymsDefeated: [T.zephyr] }, [LEAGUE.johto]: { cleared: true } },
      },
    },
  }))
  await putSave(U.misty, save({ name: 'MISTY', character: 'green', gyms: [T.cascade] }), 1)
  await putSave(U.brock, save({ name: 'BROCK', gyms: [T.plain] }), 2)
  await putSave(U.gary, save({ name: 'GARY', gyms: [T.boulder] }), 24 * 5)
  await putSave(U.erika, save({ name: 'ERIKA', gyms: [T.boulder] }), 3)
  await putSave(U.luna, save({ name: '  ', character: 'green', gyms: [T.boulder] }), 4)
  await db.exec(`insert into leaderboard_bans (user_id) values ('${U.erika}'); select leaderboard_rebuild();`)
  for (const who of ['ash', 'gary', 'anon'] as const)
    oldBoards[who] = await as<BoardRow>(who === 'anon' ? null : U[who], 'select * from leaderboard()')

  await db.exec(sql('0033_friends.sql'))
}, 60_000)

describe('0033: the leaderboard on player cards', () => {
  it('returns the same rows as the old rebuild, for any caller', async () => {
    expect(oldBoards.ash!.map((r) => `${r.name}:${r.region}`).sort()).toEqual(['ASH:johto', 'ASH:kanto', 'MISTY:kanto', 'Trainer:kanto'])
    expect(oldBoards.gary!).toHaveLength(5)
    expect(oldBoards.ash!.find((r) => r.name === 'Trainer')!.character).toBe('green')
    for (const who of ['ash', 'gary', 'anon'] as const) {
      const rows = await as<BoardRow & { is_friend: boolean }>(who === 'anon' ? null : U[who], 'select * from leaderboard()')
      expect(comparable(rows)).toEqual(comparable(oldBoards[who]!))
    }
  })

  it('keeps the rules: badge, 72 hours (but your own rows), bans, one row per region played', async () => {
    const names = (await as<BoardRow>(U.ash, 'select * from leaderboard()')).map((r) => `${r.name}:${r.region}`).sort()
    expect(names).toEqual(['ASH:johto', 'ASH:kanto', 'MISTY:kanto', 'Trainer:kanto'])
    expect((await as<BoardRow>(U.gary, 'select * from leaderboard()')).some((r) => r.name === 'GARY')).toBe(true)
  })

  it('retires the cache, its rebuild and its functions', async () => {
    const left = await db.query(`select to_regclass('public.leaderboard_cache') as cache,
      to_regprocedure('public.leaderboard_rebuild()') as rebuild, to_regprocedure('public.leaderboard_rows(timestamptz, uuid)') as rows_fn`)
    expect(left.rows[0]).toEqual({ cache: null, rebuild: null, rows_fn: null })
  })

  it('cards hold the badges, the crown, the Day Care and the shinies', async () => {
    const r = await db.query<{ region: string; badges: string[]; endgame: boolean; max_level: number; shinies: number; pokedex: number }>(
      `select region, badges, endgame, max_level, shinies, pokedex from player_card_regions where user_id = $1 order by region`, [U.ash])
    expect(r.rows).toEqual([
      { region: 'johto', badges: [T.zephyr], endgame: true, max_level: 18, shinies: 0, pokedex: 2 },
      { region: 'kanto', badges: [T.boulder, T.cascade].sort(), endgame: true, max_level: 40, shinies: 2, pokedex: 3 },
    ])
  })

  it('a save upload updates the card; an unreadable save is still saved', async () => {
    await putSave(U.misty, save({ name: 'MISTY2', gyms: [T.cascade] }))
    expect((await db.query(`select name from player_cards where user_id = $1`, [U.misty])).rows).toEqual([{ name: 'MISTY2' }])
    const broken = save({ name: 'BROKEN', gyms: [T.cascade] }) as Record<string, unknown>
    broken.box = [{ id: 'a', dex: 25, level: 'abc' }]
    await putSave(U.misty, broken)
    expect((await db.query(`select data->'player'->>'name' as n from saves where user_id = $1`, [U.misty])).rows).toEqual([{ n: 'BROKEN' }])
    expect((await db.query(`select name from player_cards where user_id = $1`, [U.misty])).rows).toEqual([{ name: 'MISTY2' }])
    await putSave(U.misty, save({ name: 'MISTY', character: 'green', gyms: [T.cascade] }), 1)
  })

  it('versus_board takes names and looks from the cards', async () => {
    await db.query(`insert into versus_teams (user_id, team) values ($1, '[{"dex":1,"level":50}]')`, [U.misty])
    const rows = await as<{ name: string; character: string }>(U.ash, 'select name, "character" from versus_board()')
    expect(rows).toEqual([{ name: 'MISTY', character: 'green' }])
  })
})

describe('0033: friends', () => {
  let ashCode = ''

  it('a friend ID is made once, 8 Crockford characters', async () => {
    ashCode = (await as<{ c: string }>(U.ash, 'select friend_code() as c'))[0]!.c
    expect(ashCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/)
    expect((await as<{ c: string }>(U.ash, 'select friend_code() as c'))[0]!.c).toBe(ashCode)
    await expect(as(null, 'select friend_code()')).rejects.toThrow(/friends_signed_out/)
  })

  it('looks a code up, typed the forgiving way, even signed out', async () => {
    const typed = `${ashCode.slice(0, 4).toLowerCase()} - ${ashCode.slice(4)}`.replace(/0/g, 'o').replace(/1/g, 'l')
    const rows = await as(null, 'select * from friend_lookup($1, $2)', [typed, 'device-1'])
    expect(rows).toEqual([{ name: 'ASH', avatar: 'kanto/youngster', region: 'kanto', max_level: 40 }])
    expect(await as(U.misty, 'select * from friend_lookup($1)', ['ZZZZZZZZ'])).toEqual([])
  })

  it('adds at once, both ways, and says why when it can not', async () => {
    const add = (who: string, code: string) => as<{ status: string; name: string | null }>(who, 'select status, name from friend_add($1)', [code])
    expect(await add(U.misty, ashCode)).toEqual([{ status: 'added', name: 'ASH' }])
    expect(await add(U.misty, ashCode)).toEqual([{ status: 'already', name: 'ASH' }])
    expect(await add(U.ash, ashCode)).toEqual([{ status: 'self', name: null }])
    expect(await add(U.ash, '00000000')).toEqual([{ status: 'not_found', name: null }])
    const misty = await as<{ id: string; seen: boolean }>(U.misty, 'select id, seen from friend_ids_of(auth.uid())')
    expect(misty).toEqual([{ id: U.ash, seen: true }])
  })

  it('the other side learns it from friend_status, until they open their list', async () => {
    const [st] = await as<{ ids: string[]; unseen: { id: string; name: string }[] }>(U.ash, 'select * from friend_status()')
    expect(st!.ids).toEqual([U.misty])
    expect(st!.unseen).toEqual([{ id: U.misty, name: 'MISTY', avatar: 'green' }])
    const list = await as<{ name: string; is_new: boolean; max_level: number }>(U.ash, 'select name, is_new, max_level from friend_list()')
    expect(list).toEqual([{ name: 'MISTY', is_new: true, max_level: 12 }])
    await as(U.ash, 'select friend_seen()')
    expect((await as<{ unseen: unknown[] }>(U.ash, 'select unseen from friend_status()'))[0]!.unseen).toEqual([])
  })

  it('marks friends on the board, with their id and nobody else’s', async () => {
    const rows = await as<{ name: string; is_friend: boolean; friend_id: string | null }>(
      U.ash, 'select name, is_friend, friend_id from leaderboard() order by name, region')
    expect(rows.filter((r) => r.is_friend).map((r) => [r.name, r.friend_id])).toEqual([['MISTY', U.misty]])
    expect(rows.filter((r) => !r.is_friend).every((r) => r.friend_id === null)).toBe(true)
    expect((await as<{ is_friend: boolean }>(null, 'select is_friend from leaderboard()')).every((r) => !r.is_friend)).toBe(true)
  })

  it('opens a profile for friends only', async () => {
    const [p] = await as<{ name: string; regions: { region: string; badges: string[] }[]; versus: { attackWins: number } | null }>(
      U.misty, 'select * from friend_profile($1)', [U.ash])
    expect(p!.name).toBe('ASH')
    expect(p!.regions.map((r) => r.region).sort()).toEqual(['johto', 'kanto'])
    const [m] = await as<{ versus: { team: unknown; attackWins: number; defenseWins: number } }>(U.ash, 'select versus from friend_profile($1)', [U.misty])
    expect(m!.versus).toEqual({ team: [{ dex: 1, level: 50 }], attackWins: 0, defenseWins: 0 })
    expect(await as(U.brock, 'select * from friend_profile($1)', [U.ash])).toEqual([])
  })

  it('removing a friend removes it for both', async () => {
    await as(U.ash, 'select friend_remove($1)', [U.misty])
    expect(await as(U.misty, 'select * from friend_list()')).toEqual([])
    expect(await as(U.ash, 'select * from friend_list()')).toEqual([])
  })

  it('caps friends at maxFriends, on both sides', async () => {
    await db.exec(`insert into game_config (key, value) values ('maxFriends', '1')`)
    const garyCode = (await as<{ c: string }>(U.gary, 'select friend_code() as c'))[0]!.c
    const lunaCode = (await as<{ c: string }>(U.luna, 'select friend_code() as c'))[0]!.c
    expect((await as<{ status: string }>(U.brock, 'select status from friend_add($1)', [garyCode]))[0]!.status).toBe('added')
    expect((await as<{ status: string }>(U.brock, 'select status from friend_add($1)', [lunaCode]))[0]!.status).toBe('full')
    expect((await as<{ status: string }>(U.ash, 'select status from friend_add($1)', [garyCode]))[0]!.status).toBe('friend_full')
    await db.exec(`delete from game_config where key = 'maxFriends'`)
  })

  it('a reset ID waits an hour, then old links stop working', async () => {
    await expect(as(U.ash, 'select friend_code_reset()')).rejects.toThrow(/friends_reset_too_soon/)
    await db.query(`update friend_codes set created_at = now() - interval '2 hours' where user_id = $1`, [U.ash])
    const fresh = (await as<{ c: string }>(U.ash, 'select friend_code_reset() as c'))[0]!.c
    expect(fresh).not.toBe(ashCode)
    expect((await as<{ status: string }>(U.erika, 'select status from friend_add($1)', [ashCode]))[0]!.status).toBe('not_found')
  })

  it('rate limits lookups and adds', async () => {
    for (let i = 0; i < 20; i++) await as(U.zed, 'select * from friend_lookup($1)', ['ZZZZZZZZ'])
    await expect(as(U.zed, 'select * from friend_lookup($1)', ['ZZZZZZZZ'])).rejects.toThrow(/friends_rate_limited/)
  })

  it('players can not read the tables, only call the functions', async () => {
    await db.exec('set role authenticated')
    try {
      await expect(db.query('select * from friendships')).rejects.toThrow(/permission denied/)
      await expect(db.query('select * from player_cards')).rejects.toThrow(/permission denied/)
      await expect(db.query(`select player_card_write(gen_random_uuid(), '{}', now())`)).rejects.toThrow(/permission denied/)
    } finally {
      await db.exec('reset role')
    }
  })

  it('is safe to run again', async () => {
    await db.exec(sql('0033_friends.sql'))
    expect((await as<{ n: number }>(U.ash, 'select count(*)::int as n from leaderboard()'))[0]!.n).toBe(4)
  })
})
