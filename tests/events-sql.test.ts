// Migrations 0035 and 0036 against a real Postgres (PGlite, in process): the clock anyone can read, the Fortune Wheel's
// one spin per UTC day with the prize drawn by the server, and Victory Road II / League II leaving the database.
// Supabase's own pieces (the auth schema, the anon / authenticated roles) are stood in for at the top, as in
// friends-sql.test.ts.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '@/engine'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')

// wheel_spin()'s own default prizes (0035). The game has drawn its spins on the device since the wheel took tickets
// (2026-10-25); the function stays in the database for older builds, and these tests keep it working as it was.
const OLD_PRIZES = [
  { reward: { kind: 'gold', amount: 10 }, count: 4, odds: 12.5 },
  { reward: { kind: 'item', key: 'poke-ball', qty: 1 }, count: 2, odds: 12.5 },
  { reward: { kind: 'item', key: 'great-ball', qty: 1 }, count: 1, odds: 12.5 },
  { reward: { kind: 'item', key: 'ultra-ball', qty: 1 }, count: 1, odds: 10 },
  { reward: { kind: 'item', key: 'master-ball', qty: 1 }, count: 1, odds: 2.5 },
]

const U = {
  ash: '00000000-0000-4000-8000-000000000001',
  misty: '00000000-0000-4000-8000-000000000002',
  brock: '00000000-0000-4000-8000-000000000003',
  gary: '00000000-0000-4000-8000-000000000004',
  erika: '00000000-0000-4000-8000-000000000005',
}

interface Spin {
  day: string
  prize: number
  reward: unknown
  fresh: boolean
}

let db: PGlite

async function as<T = Record<string, unknown>>(user: string | null, q: string, params: unknown[] = []): Promise<T[]> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? ''])
  return (await db.query<T>(q, params)).rows
}

const spin = async (user: string | null) => (await as<{ s: Spin }>(user, 'select wheel_spin() as s'))[0]!.s
/** The same, signed in with this email (the admin's is in 0001's is_admin()). */
async function spinAs(user: string, email: string) {
  await db.query(`select set_config('request.jwt.claim.email', $1, false)`, [email])
  try {
    return await spin(user)
  } finally {
    await db.query(`select set_config('request.jwt.claim.email', '', false)`)
  }
}
const setEvents = (value: unknown) =>
  db.query(`insert into game_config (key, value) values ('events', $1) on conflict (key) do update set value = excluded.value`, [
    JSON.stringify(value),
  ])

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$
      select jsonb_strip_nulls(jsonb_build_object('email', nullif(current_setting('request.jwt.claim.email', true), ''))) $$;
  `)
  await db.exec(sql('0001_init.sql').replace('create extension if not exists pgcrypto;', ''))
  // What 0035 builds on: the leaderboard (0011, 0016, 0032), Versus (0018) and friends (0033).
  for (const f of ['0011_leaderboard.sql', '0016_regions.sql', '0018_versus.sql', '0032_leaderboard_shiny.sql', '0033_friends.sql'])
    await db.exec(sql(f))
  await db.exec(sql('0035_events.sql'))
  // Run twice: the migration must stay safe to run again.
  await db.exec(sql('0035_events.sql'))
  await db.exec(`insert into auth.users (id) values ${Object.values(U).map((u) => `('${u}')`).join(',')};`)
}, 60_000)

describe('0035: event_time', () => {
  it("gives the server's UTC time and day, signed in or not", async () => {
    const [{ t }] = (await as<{ t: { now: string; day: string } }>(null, 'select event_time() as t')) as [{ t: { now: string; day: string } }]
    expect(t.now).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/)
    expect(t.day).toBe(t.now.slice(0, 10))
  })
})

describe('0035: wheel_spin', () => {
  it('is off until the admin switches it on: for the admin alone, then for everyone', async () => {
    await db.query(`delete from game_config where key = 'events'`)
    await expect(spin(U.ash)).rejects.toThrow(/events_wheel_off/)
    await setEvents({ wheel: { access: 'admin' } })
    await expect(spin(U.ash)).rejects.toThrow(/events_wheel_off/)
    expect((await spinAs(U.ash, 'gregoire.ftn@gmail.com')).fresh).toBe(true)
    await db.query('delete from event_state where user_id = $1', [U.ash])
    // On for everyone: the tests below spin as players.
    await setEvents({ wheel: { access: 'all' } })
  })

  it('has its default prizes when the admin hasn’t saved any', async () => {
    const [{ p }] = (await db.query<{ p: unknown }>('select wheel_prizes() as p')).rows as [{ p: unknown }]
    expect(p).toEqual(OLD_PRIZES)
  })

  it('needs a signed-in player', async () => {
    await expect(spin(null)).rejects.toThrow(/events_signed_out/)
  })

  it('spins once a UTC day; a second call gives the same prize back, not fresh', async () => {
    const first = await spin(U.ash)
    expect(first.fresh).toBe(true)
    expect(first.day).toMatch(/^\d{4}-\d\d-\d\d$/)
    expect(first.reward).toEqual(OLD_PRIZES[first.prize]!.reward)
    const again = await spin(U.ash)
    expect(again).toEqual({ ...first, fresh: false })
  })

  it("turns over at midnight UTC: yesterday's spin doesn't count today", async () => {
    await db.query(`update event_state set wheel_day = wheel_day - 1 where user_id = $1`, [U.ash])
    expect((await spin(U.ash)).fresh).toBe(true)
  })

  it("draws from the admin's prizes, never one without a chance", async () => {
    await setEvents({
      wheel: {
        access: 'all',
        prizes: [
          { reward: { kind: 'gold', amount: 10 }, count: 4, odds: 0 },
          { reward: { kind: 'item', key: 'master-ball', qty: 1 }, count: 1, odds: 5 },
          { reward: { kind: 'item', key: 'poke-ball', qty: 1 }, count: 0, odds: 50 },
        ],
      },
    })
    for (let i = 0; i < 12; i++) {
      await db.query('delete from event_state where user_id = $1', [U.misty])
      const s = await spin(U.misty)
      expect(s.prize).toBe(1)
      expect(s.reward).toEqual({ kind: 'item', key: 'master-ball', qty: 1 })
    }
  })

  it('refuses when the admin switched the wheel off, or left nothing to win', async () => {
    await db.query('delete from event_state where user_id = $1', [U.misty])
    await setEvents({ wheel: { access: 'off' } })
    await expect(spin(U.misty)).rejects.toThrow(/events_wheel_off/)
    await setEvents({ wheel: { access: 'all', prizes: [{ reward: { kind: 'gold', amount: 10 }, count: 1, odds: 0 }] } })
    await expect(spin(U.misty)).rejects.toThrow(/events_wheel_empty/)
    await db.exec(`delete from game_config where key = 'events'`)
  })
})

describe('0035: raid_today', () => {
  const today = () => new Date().toISOString().slice(0, 10)
  const ask = async (user: string | null, candidates: unknown) =>
    (await as<{ r: Record<string, unknown> }>(user, 'select raid_today($1) as r', [JSON.stringify(candidates)]))[0]!.r
  const pool = { kind: 'pool', fallbackShiny: 0.3, list: [{ dex: 151, shiny: false, areaId: 'faraway' }, { dex: 251, shiny: false, areaId: 'ilex' }] }

  it('picks one of the candidates and keeps it all day, whatever a later call sends', async () => {
    const first = await ask(U.ash, pool)
    expect(first).toMatchObject({ day: today(), shiny: false, caught: false })
    expect([151, 251]).toContain(first.dex)
    expect(await ask(U.ash, { kind: 'pool', list: [{ dex: 385, shiny: false, areaId: 'birth' }] })).toEqual(first)
  })

  it('a new day picks again; a shiny candidate stays shiny', async () => {
    await db.query(`update event_state set raid = jsonb_set(raid, '{day}', '"2000-01-01"') where user_id = $1`, [U.ash])
    const next = await ask(U.ash, { kind: 'shiny', list: [{ dex: 151, shiny: true, areaId: 'faraway' }] })
    expect(next).toMatchObject({ day: today(), dex: 151, shiny: true, areaId: 'faraway' })
  })

  it('needs a signed-in player and a candidate', async () => {
    await expect(ask(null, pool)).rejects.toThrow(/events_signed_out/)
    await expect(ask(U.misty, { kind: 'pool', list: [] })).rejects.toThrow(/events_no_raid/)
  })
})

describe('0035: raid_close', () => {
  const close = async (user: string | null) =>
    (await as<{ r: { raidsWon: number; gifts: number } }>(user, 'select raid_close() as r'))[0]!.r
  const pool = { kind: 'pool', fallbackShiny: 0, list: [{ dex: 151, shiny: false, areaId: 'faraway' }] }

  it('closes today’s raid once and counts it', async () => {
    await as(U.brock, 'select raid_today($1)', [JSON.stringify(pool)])
    expect(await close(U.brock)).toEqual({ raidsWon: 1, gifts: 0 })
    // Caught already: the same count, nothing more.
    expect(await close(U.brock)).toEqual({ raidsWon: 1, gifts: 0 })
    const row = await db.query<{ raid: { caught: boolean } }>('select raid from event_state where user_id = $1', [U.brock])
    expect(row.rows[0]!.raid.caught).toBe(true)
  })

  it('a new day’s raid counts again', async () => {
    await db.query(`update event_state set raid = jsonb_set(raid, '{day}', '"2000-01-01"') where user_id = $1`, [U.brock])
    await as(U.brock, 'select raid_today($1)', [JSON.stringify(pool)])
    expect(await close(U.brock)).toEqual({ raidsWon: 2, gifts: 0 })
  })

  it('needs a signed-in player with a raid today', async () => {
    await expect(close(null)).rejects.toThrow(/events_signed_out/)
    await db.query(`update event_state set raid = jsonb_set(raid, '{day}', '"2000-01-01"') where user_id = $1`, [U.brock])
    await expect(close(U.brock)).rejects.toThrow(/events_no_raid/)
  })
})

describe('0036: Victory Road II and League II leave', () => {
  const ROAD2 = '35c40458-61da-5321-adda-6df33b930671'
  const LEAGUE = 'bbe7e459-a138-5106-bd01-fce7ff422e7f'
  const area = (id: string, order: number, name: string) =>
    db.query(
      `insert into areas (id, order_index, name, min_level, max_level, encounter_weights) values ($1, $2, $3, 1, 2, '{}')`,
      [id, order, name],
    )
  const trainer = (id: string, name: string) => db.query(`insert into trainers (id, name, team) values ($1, $2, '[]')`, [id, name])

  it('deletes those areas with their pools, and the trainers only they used; the rest stays', async () => {
    const del = sql('0036_remove_league_ii.sql')
    const gone = del.slice(del.indexOf('delete from trainers')).match(/'([0-9a-f-]{36})'/)![1]!
    await area(ROAD2, 9023, 'Victory Road II')
    await area(LEAGUE, 9022, 'Indigo Plateau')
    await trainer(gone, 'Cooltrainer')
    await trainer('11111111-1111-4111-8111-111111111111', 'Elite Four Lorelei')
    await db.query(`insert into area_trainer_pool (area_id, trainer_id) values ($1, $2)`, [ROAD2, gone])
    await db.exec(del)
    const ids = async (table: string) => (await db.query<{ id: string }>(`select id from ${table}`)).rows.map((r) => r.id)
    expect(await ids('areas')).toEqual([LEAGUE])
    expect(await ids('trainers')).toEqual(['11111111-1111-4111-8111-111111111111'])
    expect(await ids('area_trainer_pool')).toEqual([])
    // Safe to run again.
    await db.exec(del)
    expect(await ids('areas')).toEqual([LEAGUE])
  })
})

describe('0035: raiding with friends', () => {
  const mon = (id: string, dex: number, level: number, extra: Record<string, unknown> = {}) => ({ id, dex, level, ...extra })
  const pool = { kind: 'pool', fallbackShiny: 0, list: [{ dex: 151, shiny: false, areaId: 'faraway' }] }
  const friends = (a: string, b: string) =>
    db.query('insert into friendships (user_a, user_b, added_by) values ($1, $2, $1) on conflict do nothing', [a < b ? a : b, a < b ? b : a])
  const saveOf = (user: string, data: unknown) =>
    db.query('insert into saves (user_id, data) values ($1, $2) on conflict (user_id) do update set data = excluded.data', [
      user,
      JSON.stringify(data),
    ])
  const setTeam = async (user: string, ids: string[]) =>
    (await as<{ t: { dex: number; level: number; shiny: boolean }[] }>(user, 'select raid_set_team($1) as t', [ids]))[0]!.t
  const closeWith = async (user: string, helpers: string[]) =>
    (await as<{ r: { raidsWon: number; gifts: number } }>(user, 'select raid_close($1) as r', [helpers]))[0]!.r
  const claim = (user: string) => as<{ id: number; raider_name: string; dex: number; item_key: string }>(user, 'select * from raid_gifts_claim()')
  const newDay = (user: string) => db.query(`update event_state set raid = jsonb_set(raid, '{day}', '"2000-01-01"') where user_id = $1`, [user])

  beforeAll(async () => {
    await saveOf(U.gary, {
      region: 'kanto',
      player: { name: 'Gary', character: 'green' },
      box: [mon('g1', 9, 70), mon('g2', 65, 40, { shiny: true }), mon('g3', 59, 55), mon('egg', 142, 1, { revivesAt: 9 })],
      parked: { johto: { box: [mon('j1', 248, 60)] } },
    })
    await saveOf(U.erika, { region: 'kanto', player: { name: 'Erika' }, box: [mon('e1', 45, 50)] })
    await saveOf(U.misty, { region: 'kanto', player: { name: 'Misty' }, box: [mon('m1', 121, 50)] })
    await friends(U.ash, U.gary)
    await friends(U.ash, U.erika)
  })

  it('a raid team comes from the cloud save, any region, capped at the raid team cap', async () => {
    expect(await setTeam(U.gary, ['g1', 'j1', 'g2'])).toEqual([
      { dex: 9, level: 50, shiny: false },
      { dex: 248, level: 50, shiny: false },
      { dex: 65, level: 40, shiny: true },
    ])
    await expect(setTeam(U.gary, ['g1', 'nope'])).rejects.toThrow(/events_not_eligible/)
    await expect(setTeam(U.gary, ['egg'])).rejects.toThrow(/events_not_eligible/)
    await expect(setTeam(U.gary, ['g1', 'g1'])).rejects.toThrow(/events_team_size/)
    await expect(setTeam(U.gary, ['g1', 'g2', 'g3', 'j1'])).rejects.toThrow(/events_team_size/)
    await expect(setTeam(U.ash, ['g1'])).rejects.toThrow(/events_no_save/)
    expect(await setTeam(U.erika, ['e1'])).toEqual([{ dex: 45, level: 50, shiny: false }])
    expect(await setTeam(U.misty, ['m1'])).toHaveLength(1)
  })

  it('your friends’ raid teams, never a stranger’s', async () => {
    const rows = await as<{ user_id: string; name: string; avatar: string; team: unknown[]; helped: number }>(
      U.ash,
      'select * from raid_friend_teams()',
    )
    expect(rows.map((r) => r.name).sort()).toEqual(['Erika', 'Gary'])
    expect(rows.find((r) => r.name === 'Gary')).toMatchObject({ avatar: 'green', helped: 0 })
  })

  it('a catch gives each friend who helped a gift, a stranger none; the helper claims it once', async () => {
    await newDay(U.ash)
    await as(U.ash, 'select raid_today($1)', [JSON.stringify(pool)])
    // Misty isn't Ash's friend; Ash can't help himself; Gary twice is Gary once.
    expect(await closeWith(U.ash, [U.gary, U.erika, U.misty, U.ash, U.gary])).toMatchObject({ gifts: 2 })
    const gifts = await claim(U.gary)
    expect(gifts).toHaveLength(1)
    expect(gifts[0]).toMatchObject({ raider_name: 'Trainer', dex: 151 })
    expect(DEFAULT_CONFIG.events.raid.gifts.map((g) => g.key)).toContain(gifts[0]!.item_key)
    expect(await claim(U.gary)).toEqual([])
    expect(await claim(U.misty)).toEqual([])
    const helped = await as<{ name: string; helped: number }>(U.ash, 'select name, helped from raid_friend_teams()')
    expect(helped.find((r) => r.name === 'Gary')!.helped).toBe(1)
  })

  it('a helper gets helperDailyCap gifts a day at most, whoever they help', async () => {
    await setEvents({ ...DEFAULT_CONFIG.events, raid: { ...DEFAULT_CONFIG.events.raid, helperDailyCap: 2 } })
    // Gary got one today already; one more fits, then none.
    await newDay(U.ash)
    await as(U.ash, 'select raid_today($1)', [JSON.stringify(pool)])
    expect((await closeWith(U.ash, [U.gary])).gifts).toBe(1)
    await friends(U.brock, U.gary)
    await newDay(U.brock)
    await as(U.brock, 'select raid_today($1)', [JSON.stringify(pool)])
    expect((await closeWith(U.brock, [U.gary])).gifts).toBe(0)
    expect(await claim(U.gary)).toHaveLength(1)
    await db.query(`delete from game_config where key = 'events'`)
  })

  it('the leaderboard carries each player’s raids won', async () => {
    const won = (await db.query<{ n: number }>('select raids_won as n from event_state where user_id = $1', [U.ash])).rows[0]!.n
    // Ash's card, with a badge in Kanto: their row says how many raids they won.
    await db.query(
      `insert into player_cards (user_id, name, avatar, region, updated_at) values ($1, 'Ash', 'red', 'kanto', now())
       on conflict (user_id) do nothing`,
      [U.ash],
    )
    await db.query(
      `insert into player_card_regions (user_id, region, team, pokedex, max_level, shinies, progress, badges, endgame)
       values ($1, 'kanto', '[]', 1, 5, 0, '{}', '{boulder}', false) on conflict do nothing`,
      [U.ash],
    )
    const rows = await as<{ is_me: boolean; raids_won: number }>(U.ash, 'select is_me, raids_won from leaderboard()')
    expect(rows.find((r) => r.is_me)?.raids_won).toBe(won)
    expect(won).toBeGreaterThan(0)
  })
})
