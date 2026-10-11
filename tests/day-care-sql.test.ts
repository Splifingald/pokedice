// Migration 0034 against a real Postgres (PGlite, in process): each Day Care resident counts on its own region's card,
// the card carries the residents for the friend picker, and friend_day_cares() shows friends only. Supabase's own
// pieces (the auth schema, the anon / authenticated roles) are stood in for at the top, as in friends-sql.test.ts.
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
}
const LEAGUE = { kanto: '20000000-0000-4000-8000-000000000001', johto: '20000000-0000-4000-8000-000000000002' }

const mon = (id: string, dex: number, level: number, shiny = false) => ({ id, dex, level, xp: 3, ...(shiny && { shiny: true }) })
const resident = (inst: ReturnType<typeof mon>, since: number, region?: string) => ({ inst, since, ...(region && { region }) })

function save(o: { name: string; region?: string; residents?: ReturnType<typeof resident>[]; parked?: Record<string, unknown> }) {
  const team = [mon('a', 25, 12)]
  return {
    version: 1,
    ...(o.region && { region: o.region }),
    player: { name: o.name, character: 'red' },
    box: team,
    team: team.map((m) => m.id),
    pokedex: [25],
    currentAreaId: 'route-1',
    areaProgress: {},
    ...(o.residents && { dayCare: { residents: o.residents, guests: [], eggClaimed: true } }),
    ...(o.parked && { parked: o.parked }),
  }
}

const johtoBlock = { box: [mon('j1', 155, 18)], team: ['j1'], pokedex: [155], areaProgress: {} }

let db: PGlite

async function as<T = Record<string, unknown>>(user: string | null, q: string, params: unknown[] = []): Promise<T[]> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? ''])
  return (await db.query<T>(q, params)).rows
}

async function putSave(user: string, data: unknown) {
  await db.query(
    `insert into saves (user_id, data, updated_at) values ($1, $2, now())
     on conflict (user_id) do update set data = excluded.data, updated_at = excluded.updated_at`,
    [user, JSON.stringify(data)],
  )
}

const regionsOf = async (user: string) =>
  (
    await db.query<{ region: string; max_level: number; shinies: number }>(
      'select region, max_level, shinies from player_card_regions where user_id = $1 order by region',
      [user],
    )
  ).rows

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
  for (const f of ['0011_leaderboard.sql', '0016_regions.sql', '0018_versus.sql', '0032_leaderboard_shiny.sql']) await db.exec(sql(f))
  await db.exec(`
    insert into auth.users (id) values ${Object.values(U).map((u) => `('${u}')`).join(',')};
    insert into regions (id, name, order_index, dex_range, starters, league_area_id, next_region) values
      ('kanto', 'Kanto', 1, '[1,151]', '[1,4,7]', '${LEAGUE.kanto}', 'johto'),
      ('johto', 'Johto', 2, '[152,251]', '[152,155,158]', '${LEAGUE.johto}', null);
  `)
  // A v1 card for Misty before 0034: a parked region with its own Day Care, pushed by an older client.
  await db.exec(sql('0033_friends.sql'))
  await putSave(
    U.misty,
    save({
      name: 'MISTY',
      residents: [resident(mon('m1', 120, 33), 50)],
      parked: { johto: { ...johtoBlock, dayCare: { residents: [resident(mon('m2', 158, 44, true), 10)] } } },
    }),
  )
  await db.exec(sql('0034_day_care.sql'))
}, 60_000)

describe('0034: one Day Care on the cards', () => {
  it('counts each resident for its own region, untagged ones for the live region', async () => {
    await putSave(
      U.ash,
      save({
        name: 'ASH',
        region: 'johto',
        residents: [
          resident(mon('k1', 4, 40, true), 100, 'kanto'),
          resident(mon('j2', 161, 30), 200, 'johto'),
          resident(mon('x1', 163, 25, true), 300),
        ],
        parked: { kanto: { box: [mon('k0', 1, 10)], team: ['k0'], pokedex: [1], areaProgress: {} } },
      }),
    )
    expect(await regionsOf(U.ash)).toEqual([
      { region: 'johto', max_level: 30, shinies: 1 },
      { region: 'kanto', max_level: 40, shinies: 1 },
    ])
  })

  it('still counts a parked Day Care pushed by an older client, for its region', async () => {
    expect(await regionsOf(U.misty)).toEqual([
      { region: 'johto', max_level: 44, shinies: 1 },
      { region: 'kanto', max_level: 33, shinies: 0 },
    ])
  })

  it('carries the residents for the friend picker: the oldest first, at most the slots', async () => {
    const [card] = (await db.query<{ day_care: unknown }>('select day_care from player_cards where user_id = $1', [U.ash])).rows
    expect(card!.day_care).toEqual([
      { inst: 'k1', dex: 4, level: 40, xp: 3, since: 100, shiny: true },
      { inst: 'j2', dex: 161, level: 30, xp: 3, since: 200, shiny: false },
    ])
    await db.exec(`insert into game_config (key, value) values ('dayCare', '{"slots": 1}')`)
    await putSave(U.ash, save({ name: 'ASH', residents: [resident(mon('b', 7, 9), 900), resident(mon('a', 1, 9), 800)] }))
    const [one] = (await db.query<{ day_care: { inst: string }[] }>('select day_care from player_cards where user_id = $1', [U.ash])).rows
    expect(one!.day_care.map((m) => m.inst)).toEqual(['a'])
    await db.exec(`delete from game_config where key = 'dayCare'`)
  })

  it('friend_day_cares: friends only, those with a Pokémon there', async () => {
    const code = (who: string) => as<{ c: string }>(who, 'select friend_code() as c').then((r) => r[0]!.c)
    await as(U.misty, 'select friend_add($1)', [await code(U.ash)])
    await putSave(U.brock, save({ name: 'BROCK', residents: [resident(mon('b1', 74, 20), 5)] }))
    const rows = await as<{ owner: string; name: string; day_care: { dex: number }[] }>(U.ash, 'select * from friend_day_cares()')
    expect(rows.map((r) => [r.owner, r.name, r.day_care.map((m) => m.dex)])).toEqual([[U.misty, 'MISTY', [120]]])
    // A friend with nobody at the Day Care isn't listed.
    expect(await as(U.misty, 'select * from friend_day_cares()')).toHaveLength(1)
    await putSave(U.ash, save({ name: 'ASH' }))
    expect(await as(U.misty, 'select * from friend_day_cares()')).toEqual([])
    expect(await as(null, 'select * from friend_day_cares()')).toEqual([])
  })

  it('players can call friend_day_cares, never read the cards', async () => {
    await db.exec('set role authenticated')
    try {
      await expect(db.query('select day_care from player_cards')).rejects.toThrow(/permission denied/)
      await db.query('select * from friend_day_cares()')
    } finally {
      await db.exec('reset role')
    }
    await db.exec('set role anon')
    try {
      await expect(db.query('select * from friend_day_cares()')).rejects.toThrow(/permission denied/)
    } finally {
      await db.exec('reset role')
    }
  })

  it('is safe to run again, after 0033 again too (as seed.sql does)', async () => {
    await db.exec(sql('0033_friends.sql'))
    await db.exec(sql('0034_day_care.sql'))
    await db.exec(sql('0034_day_care.sql'))
    expect(await regionsOf(U.misty)).toEqual([
      { region: 'johto', max_level: 44, shinies: 1 },
      { region: 'kanto', max_level: 33, shinies: 0 },
    ])
  })
})
