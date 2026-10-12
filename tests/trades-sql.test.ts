// Migration 0044 against a real Postgres (PGlite, in process): Trades (docs/23). Posting and taking read the Pokémon
// from the player's own cloud save and check every rule; two takers can't both win; the check on load returns what
// each side still has to apply; deleting your data leaves the other side's Pokémon owed. Supabase's own pieces (the
// auth schema, the anon / authenticated roles) are stood in for at the top, as in friends-sql.test.ts.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, encodeDexSet } from '@/engine'
import eggGroups from '@/data/egg-groups.json'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')

const U = {
  ash: '00000000-0000-4000-8000-000000000001',
  misty: '00000000-0000-4000-8000-000000000002',
  brock: '00000000-0000-4000-8000-000000000003',
  gary: '00000000-0000-4000-8000-000000000004', // one badge
  erika: '00000000-0000-4000-8000-000000000005',
}
const T = { boulder: '10000000-0000-4000-8000-000000000001', cascade: '10000000-0000-4000-8000-000000000002' }
const LEAGUE = {
  kanto: '20000000-0000-4000-8000-000000000001',
  johto: '20000000-0000-4000-8000-000000000002',
}

type Mon = { id: string; dex: number; level: number; shiny?: boolean; revivesAt?: number }
const mon = (id: string, dex: number, level: number, extra: Partial<Mon> = {}): Mon => ({
  id,
  dex,
  level,
  ...extra,
})

function save(o: { name: string; box: Mon[]; gyms?: string[]; parked?: Record<string, unknown> }) {
  return {
    version: 1,
    player: { name: o.name, character: 'red' },
    box: o.box,
    team: [o.box[0]!.id],
    pokedex: o.box.map((m) => m.dex),
    currentAreaId: 'route-1',
    areaProgress: { 'route-1': { cleared: true, gymsDefeated: o.gyms ?? [T.boulder, T.cascade] } },
    ...(o.parked && { parked: o.parked }),
  }
}

let db: PGlite

async function as<T = Record<string, unknown>>(
  user: string | null,
  q: string,
  params: unknown[] = [],
): Promise<T[]> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? ''])
  return (await db.query<T>(q, params)).rows
}
/** The value one call returns (a jsonb). */
async function call<T = Record<string, unknown>>(
  user: string | null,
  q: string,
  params: unknown[] = [],
): Promise<T> {
  const rows = await as<{ r: T }>(user, `select ${q} as r`, params)
  return rows[0]!.r
}
async function fails(user: string | null, q: string, params: unknown[] = []): Promise<string> {
  try {
    await call(user, q, params)
  } catch (e) {
    return (e as Error).message
  }
  return 'no error'
}

async function putSave(user: string, data: unknown) {
  await db.query(`select set_config('request.jwt.claim.sub', '', false)`)
  await db.query(
    `insert into saves (user_id, realm, data, updated_at) values ($1, 'main', $2, now())
     on conflict (user_id, realm) do update set data = excluded.data, updated_at = excluded.updated_at`,
    [user, JSON.stringify(data)],
  )
}
const setTrade = (patch: Record<string, unknown>) =>
  db.query(`update game_config set value = value || $1::jsonb where key = 'trade'`, [JSON.stringify(patch)])

const KANTO_ONLY = { regions: ['kanto'], ...encodeDexSet([]), shiny: [] as number[] }
const post = (user: string, inst: string, want: unknown, vis = 'public', poster: unknown = KANTO_ONLY) =>
  call<{ id: string; code: string; ends_at: string }>(user, `trade_post($1, $2::jsonb, $3, $4::jsonb)`, [
    inst,
    JSON.stringify(want),
    vis,
    JSON.stringify(poster),
  ])
const take = (user: string, code: string, inst: string) =>
  call<{ id: string; listed: Mon; given: Mon; with: string }>(user, `trade_take($1, $2)`, [code, inst])

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
    grant usage on schema auth to anon, authenticated;
  `)
  await db.exec(sql('0001_init.sql').replace('create extension if not exists pgcrypto;', ''))
  for (const f of [
    '0011_leaderboard.sql',
    '0016_regions.sql',
    '0018_versus.sql',
    '0030_pokemon_forms.sql',
    '0032_leaderboard_shiny.sql',
    '0033_friends.sql',
    '0034_day_care.sql',
    '0035_events.sql',
    '0037_skip_unchanged_saves.sql',
    '0038_delete_my_data.sql',
    '0039_extreme_realm.sql',
    '0040_lighter_save_writes.sql',
    '0044_trades.sql',
    '0047_trades_admin_read.sql',
  ])
    await db.exec(sql(f))
  // Safe to run again.
  await db.exec(sql('0044_trades.sql'))
  await db.exec(sql('0047_trades_admin_read.sql'))
  const species = (dex: number, form: unknown = null) =>
    `(${dex}, 'P${dex}', 'normal', 10, 100, 5, '', '[]', 1, '[]', '[]', ${form ? `'${JSON.stringify(form)}'` : 'null'})`
  await db.exec(`
    insert into auth.users (id) values ${Object.values(U)
      .map((u) => `('${u}')`)
      .join(',')};
    insert into regions (id, name, order_index, dex_range, starters, league_area_id, next_region) values
      ('kanto', 'Kanto', 1, '[1,151]', '[1,4,7]', '${LEAGUE.kanto}', 'johto'),
      ('johto', 'Johto', 2, '[152,251]', '[152,155,158]', '${LEAGUE.johto}', null),
      ('alola', 'Alola', 7, '[722,809]', '[722,725,728]', '${LEAGUE.johto}', null);
    insert into trainers (id, name, team, role, badge) values
      ('${T.boulder}', 'Brock', '[]', 'leader', 'Boulder Badge'),
      ('${T.cascade}', 'Misty', '[]', 'leader', 'Cascade Badge');
    insert into pokemon (dex, name, type1, base_hp, max_hp, speed, sprite_url, dice, rerolls, evolutions, milestones, form) values
      ${[4, 7, 8, 16, 25, 129, 150, 158, 161, 793].map((d) => species(d)).join(',')},
      ${species(10091, { of: 19, kind: 'regional', region: 'alola' })},
      ${species(10034, { of: 6, kind: 'mega' })};
    insert into friendships (user_a, user_b, added_by) values ('${U.ash}', '${U.erika}', '${U.ash}');
  `)
  await putSave(
    U.ash,
    save({
      name: 'ASH',
      box: [
        mon('a0', 1, 30),
        mon('a1', 4, 12),
        mon('a2', 150, 70),
        mon('a3', 138, 5, { revivesAt: 9e12 }),
        mon('a4', 793, 40),
        mon('a5', 129, 9, { shiny: true }),
        mon('a6', 16, 8),
        mon('a7', 19, 3),
        mon('a8', 7, 5),
      ],
    }),
  )
  await putSave(
    U.misty,
    save({ name: 'MISTY', box: [mon('m0', 7, 40), mon('m1', 8, 34), mon('m2', 25, 22), mon('m3', 129, 41)] }),
  )
  await putSave(
    U.brock,
    save({
      name: 'BROCK',
      box: [mon('b0', 74, 20), mon('b1', 8, 30), mon('b2', 25, 10, { shiny: true })],
      parked: {
        johto: {
          box: [mon('j0', 161, 9), mon('j1', 158, 18)],
          team: ['j0'],
          pokedex: [161, 158],
          areaProgress: {},
        },
      },
    }),
  )
  await putSave(U.gary, save({ name: 'GARY', box: [mon('g0', 4, 10), mon('g1', 8, 20)], gyms: [T.boulder] }))
  await putSave(U.erika, save({ name: 'ERIKA', box: [mon('e0', 43, 10), mon('e1', 8, 25)] }))
})

describe('the switch and the numbers', () => {
  it('keeps the game’s defaults, off', async () => {
    const [row] = await as<{ value: unknown }>(null, `select value from game_config where key = 'trade'`)
    expect(row!.value).toEqual(DEFAULT_CONFIG.trade)
  })
  it('knows the same legendaries and mythicals as the game', () => {
    const list = Object.entries(eggGroups as Record<string, { l?: number }>)
      .filter(([, e]) => e.l === 1)
      .map(([d]) => Number(d))
      .sort((a, b) => a - b)
    const inSql = sql('0044_trades.sql')
      .match(/p_dex = any \('\{([\d,\s]+)\}'::int\[\]\)/)![1]!
      .split(',')
      .map((x) => Number(x.trim()))
    expect(inSql).toEqual(list)
  })
  it('refuses everything while off, and on for admin is not for players', async () => {
    expect(await fails(U.ash, `trade_post($1, '{"kind":"any"}', 'public', '{}')`, ['a1'])).toContain(
      'trades_off',
    )
    await setTrade({ access: 'admin' })
    expect(await fails(U.ash, `trade_post($1, '{"kind":"any"}', 'public', '{}')`, ['a1'])).toContain(
      'trades_off',
    )
    expect(await as(U.ash, `select * from trade_board()`)).toEqual([])
    await setTrade({ access: 'all' })
  })
})

describe('posting', () => {
  it('reads the Pokémon from the cloud save and checks the rules', async () => {
    expect(await fails(U.ash, `trade_post('nope', '{"kind":"any"}', 'public', '{}')`)).toContain(
      'trades_not_found',
    )
    expect(await fails(U.ash, `trade_post('a2', '{"kind":"any"}', 'public', '{}')`)).toContain(
      'trades_untradable',
    ) // Mewtwo
    expect(await fails(U.ash, `trade_post('a4', '{"kind":"any"}', 'public', '{}')`)).toContain(
      'trades_untradable',
    ) // Nihilego
    expect(await fails(U.ash, `trade_post('a3', '{"kind":"any"}', 'public', '{}')`)).toContain(
      'trades_reviving',
    )
    expect(await fails(U.ash, `trade_post('a1', '{"kind":"species","dex":158}', 'public', '{}')`)).toContain(
      'trades_bad_want',
    ) // Johto not started
    expect(await fails(U.ash, `trade_post('a1', '{"kind":"species","dex":150}', 'public', '{}')`)).toContain(
      'trades_bad_want',
    )
    expect(await fails(U.ash, `trade_post('a1', '{"kind":"any"}', 'everyone', '{}')`)).toContain(
      'trades_bad_want',
    )
    expect(await fails(U.gary, `trade_post('g0', '{"kind":"any"}', 'public', '{}')`)).toContain(
      'trades_badges',
    ) // one badge
  })
  it('posts a listing and gives its code, once per Pokémon', async () => {
    const l = await post(U.ash, 'a1', { kind: 'species', dex: 8 })
    expect(l.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/)
    expect(await fails(U.ash, `trade_post('a1', '{"kind":"any"}', 'public', '{}')`)).toContain(
      'trades_listed',
    )
  })
  it('stops at the open-listing cap', async () => {
    await setTrade({ maxListings: 2 })
    await post(U.ash, 'a6', { kind: 'any' }, 'private')
    expect(await fails(U.ash, `trade_post('a8', '{"kind":"any"}', 'public', '{}')`)).toContain('trades_full')
    await setTrade({ maxListings: 4 })
  })
})

describe('the board and a link', () => {
  it('shows public and friends’ listings, never a private one', async () => {
    await post(U.ash, 'a7', { kind: 'notOwned' }, 'friends', { ...KANTO_ONLY, ...encodeDexSet([1, 4, 16]) })
    const misty = await as<{ trade_board: { dex: number; is_me: boolean } }>(
      U.misty,
      `select * from trade_board()`,
    )
    expect(misty.map((r) => r.trade_board.dex)).toEqual([4]) // not the private Pidgey, not the friends-only Rattata
    const erika = await as<{ trade_board: { dex: number; is_friend: boolean } }>(
      U.erika,
      `select * from trade_board()`,
    )
    expect(erika.map((r) => r.trade_board.dex).sort((a, b) => a - b)).toEqual([4, 19])
    const mine = await as<{ trade_board: { is_me: boolean } }>(U.ash, `select * from trade_board()`)
    expect(mine.every((r) => r.trade_board.is_me)).toBe(true)
    // One trainer's, for a friend's card: Erika sees Ash's public and friends-only listings, Misty only the public.
    const card = (who: string | null) =>
      as<{ trade_board: { dex: number } }>(who, `select * from trade_board(p_owner => '${U.ash}')`)
    expect((await card(U.erika)).map((r) => r.trade_board.dex).sort((a, b) => a - b)).toEqual([4, 19])
    expect((await card(U.misty)).map((r) => r.trade_board.dex)).toEqual([4])
    expect(await as(U.erika, `select * from trade_board(p_owner => '${U.misty}')`)).toEqual([])
  })
  it('gives guests the four newest public listings', async () => {
    const guest = await as<{ trade_board: { dex: number; visibility: string } }>(
      null,
      `select * from trade_board()`,
    )
    expect(guest.every((r) => r.trade_board.visibility === 'public')).toBe(true)
  })
  it('finds a private listing by its link, guests too', async () => {
    const [row] = await as<{ code: string }>(null, `select code from trade_listings where dex = 16`)
    const view = await call<{ dex: number; visibility: string }>(null, `trade_view($1)`, [
      row!.code.toLowerCase(),
    ])
    expect(view).toMatchObject({ dex: 16, visibility: 'private' })
  })
})

describe('taking', () => {
  const codeOf = async (dex: number) =>
    (
      await as<{ code: string }>(null, `select code from trade_listings where dex = $1 and status = 'open'`, [
        dex,
      ])
    )[0]!.code
  it('checks the want against the taker’s cloud save', async () => {
    const code = await codeOf(4)
    expect(await fails(U.misty, `trade_take($1, 'm2')`, [code])).toContain('trades_no_match') // Pikachu, not Wartortle
    expect(await fails(U.ash, `trade_take($1, 'a8')`, [code])).toContain('trades_own')
  })
  it('one wins; the next taker finds it gone', async () => {
    const code = await codeOf(4)
    const t = await take(U.misty, code, 'm1')
    expect(t.listed).toMatchObject({ id: 'a1', dex: 4, level: 12 })
    expect(t.given).toMatchObject({ id: 'm1', dex: 8, level: 34 })
    expect(t.with).toBe('ASH')
    expect(await fails(U.brock, `trade_take($1, 'b1')`, [code])).toContain('trades_gone')
  })
  it('a Pokémon given and not applied yet can’t go again', async () => {
    const l = await post(U.erika, 'e0', { kind: 'any' }, 'public', KANTO_ONLY)
    expect(await fails(U.misty, `trade_take($1, 'm1')`, [l.code])).toContain('trades_listed')
  })
  it('friends only means friends', async () => {
    const code = await codeOf(19)
    expect(await fails(U.misty, `trade_take($1, 'm2')`, [code])).toContain('trades_friends_only')
  })
  it('any I don’t own: not one the poster has, unless it’s a shiny they don’t', async () => {
    // Ash's snapshot owns Bulbasaur, Charmander and Pidgey; Erika is his friend.
    await putSave(
      U.erika,
      save({
        name: 'ERIKA',
        box: [mon('e0', 43, 10), mon('e1', 8, 25), mon('e2', 16, 9), mon('e3', 4, 9, { shiny: true })],
      }),
    )
    const code = await codeOf(19)
    expect(await fails(U.erika, `trade_take($1, 'e2')`, [code])).toContain('trades_no_match') // a Pidgey
    const t = await take(U.erika, code, 'e3') // a shiny Charmander: he has no shiny one
    expect(t.listed.dex).toBe(19)
  })
  it('needs the listed Pokémon’s home region started, and the poster to be able to receive', async () => {
    const l = await post(U.brock, 'j1', { kind: 'any' }, 'public', {
      regions: ['kanto', 'johto'],
      ...encodeDexSet([]),
      shiny: [],
    })
    expect(await fails(U.misty, `trade_take($1, 'm2')`, [l.code])).toContain('trades_region')
    const k = await post(U.misty, 'm2', { kind: 'any' }, 'public', KANTO_ONLY)
    expect(await fails(U.brock, `trade_take($1, 'j0')`, [k.code])).toContain('trades_poster_region') // Sentret to a Kanto-only poster
  })
  it('stops at the daily cap', async () => {
    await setTrade({ tradesPerDay: 1 })
    const k = await codeOf(43) // Erika's Bellsprout
    expect(await fails(U.misty, `trade_take($1, 'm3')`, [k])).toContain('trades_daily_cap') // Misty took one today
    await setTrade({ tradesPerDay: 5 })
  })
})

describe('the check on load, applying once', () => {
  it('returns what each side still has to apply', async () => {
    const ash = await as<{
      trade_mine: { role: string; status: string; mon: Mon; taker_mon: Mon | null; with: string }
    }>(U.ash, `select * from trade_mine()`)
    const taken = ash.map((r) => r.trade_mine).filter((r) => r.status === 'taken')
    expect(taken.map((r) => r.mon.dex).sort((a, b) => a - b)).toEqual([4, 19])
    expect(taken.find((r) => r.mon.dex === 4)).toMatchObject({
      role: 'owner',
      taker_mon: { id: 'm1' },
      with: 'MISTY',
    })
    const misty = await as<{ trade_mine: { role: string; mon: Mon } }>(U.misty, `select * from trade_mine()`)
    expect(misty.map((r) => r.trade_mine).find((r) => r.role === 'taker')!.mon.id).toBe('a1')
  })
  it('stops returning them once applied', async () => {
    const ids = (await as<{ id: string }>(null, `select id from trade_listings where status = 'taken'`)).map(
      (r) => r.id,
    )
    await as(U.ash, `select trade_applied($1::uuid[])`, [ids])
    await as(U.misty, `select trade_applied($1::uuid[])`, [ids])
    const ash = await as<{ trade_mine: { status: string } }>(U.ash, `select * from trade_mine()`)
    expect(ash.every((r) => r.trade_mine.status !== 'taken')).toBe(true)
  })
  it('ends a listing past its day and gives it back', async () => {
    await db.query(`update trade_listings set ends_at = now() - interval '1 minute' where dex = 16`)
    const ash = await as<{ trade_mine: { status: string; mon: Mon } }>(U.ash, `select * from trade_mine()`)
    expect(ash.map((r) => r.trade_mine).find((r) => r.mon.dex === 16)!.status).toBe('expired')
  })
  it('cancels an open listing; too late says taken', async () => {
    const [open] = await as<{ id: string }>(
      null,
      `select id from trade_listings where owner = $1 and status = 'open'`,
      [U.misty],
    )
    expect(await call(U.misty, `trade_cancel($1)`, [open!.id])).toBe('cancelled')
    const [done] = await as<{ id: string }>(null, `select id from trade_listings where dex = 4`)
    expect(await call(U.ash, `trade_cancel($1)`, [done!.id])).toBe('taken')
  })
  it('only the admin removes a listing', async () => {
    const [open] = await as<{ id: string }>(
      null,
      `select id from trade_listings where status = 'open' limit 1`,
    )
    expect(await fails(U.ash, `trade_remove($1)`, [open!.id])).toContain('trades_admin_only')
  })
  // As the API's roles, not the test's superuser: Admin → Trades reads the table itself (0047).
  it('only the admin reads the listings', async () => {
    const open = `select id from trade_listings where status = 'open'`
    const asRole = async (role: string, user: string | null, email = '') => {
      await db.query(`select set_config('request.jwt.claim.email', $1, false)`, [email])
      await db.exec(`set role ${role}`)
      try {
        return await as(user, open)
      } finally {
        await db.exec('reset role')
        await db.query(`select set_config('request.jwt.claim.email', '', false)`)
      }
    }
    const all = await as(null, open)
    expect(all.length).toBeGreaterThan(0)
    expect(await asRole('authenticated', U.ash, 'gregoire.ftn@gmail.com')).toEqual(all)
    expect(await asRole('authenticated', U.ash, 'ash@example.com')).toEqual([])
    await expect(asRole('anon', null)).rejects.toThrow(/permission denied/)
    await db.exec('set role authenticated')
    try {
      await expect(db.query(`update trade_listings set status = 'removed'`)).rejects.toThrow(
        /permission denied/,
      )
    } finally {
      await db.exec('reset role')
    }
  })
})

describe('deleting your data', () => {
  it('takes your open listings and leaves the other side’s Pokémon owed, without your name', async () => {
    const l = await post(U.erika, 'e1', { kind: 'any' }, 'public', KANTO_ONLY)
    await take(U.brock, l.code, 'b0')
    await as(U.erika, `select delete_my_data()`)
    const rows = await as<{ owner: string | null; owner_name: string | null; status: string; taker: string }>(
      null,
      `select owner, owner_name, status, taker from trade_listings where taker = $1`,
      [U.brock],
    )
    expect(rows[0]).toMatchObject({ owner: null, owner_name: null, status: 'taken' })
    expect(await as(null, `select 1 from trade_listings where owner = $1`, [U.erika])).toEqual([])
    const brock = await as<{ trade_mine: { role: string; with: string } }>(
      U.brock,
      `select * from trade_mine()`,
    )
    expect(brock.map((r) => r.trade_mine).find((r) => r.role === 'taker')!.with).toBe('')
  })
})

describe('the snapshot’s bitset', () => {
  it('reads the same in the game and on the server', async () => {
    const set = [1, 7, 8, 9, 151, 255, 256, 1025, 2047, 10091]
    const snap = encodeDexSet(set)
    for (const d of [...set, 2, 150, 1024, 10092]) {
      const has = await call<boolean>(null, `trade_has($1::jsonb, $2)`, [JSON.stringify(snap), d])
      expect(has, `dex ${d}`).toBe(set.includes(d))
    }
  })
  it('finds a form’s home region', async () => {
    expect(await call(null, `trade_home_region(10091)`)).toBe('alola')
    expect(await call(null, `trade_home_region(158)`)).toBe('johto')
    expect(await call(null, `trade_untradable(10034)`)).toBe(true) // a Mega form
  })
})

describe('small worlds (docs/21)', () => {
  const world = { id: 'isle', regionId: 'w-isle', closed: false }
  const erika = () =>
    save({
      name: 'ERIKA',
      box: [mon('e0', 43, 10), mon('e1', 8, 25)],
    })
  afterAll(() => putSave(U.erika, erika()))

  it('lists nothing from a world’s Box, parked or not', async () => {
    await putSave(U.erika, {
      ...erika(),
      parked: { 'w-isle': { box: [mon('w1', 25, 12), mon('w2', 7, 9)], team: ['w1'], pokedex: [25, 7] } },
      events: { world },
    })
    expect(await fails(U.erika, `trade_post('w1', '{"kind":"any"}', 'public', '{}')`)).toContain(
      'trades_world',
    )
    // Its region isn't one the player has started, for asking or receiving.
    expect(
      await call<string[]>(null, `trade_started((select data from saves where user_id = $1))`, [U.erika]),
    ).toEqual(['kanto'])
  })

  it('lets nobody trade from inside one, even with a Pokémon from home', async () => {
    const home = erika()
    await putSave(U.erika, {
      ...home,
      region: 'w-isle',
      box: [mon('w1', 25, 12), mon('w2', 7, 9)],
      team: ['w1'],
      parked: { kanto: { box: home.box, team: home.team, pokedex: home.pokedex } },
      events: { world },
    })
    expect(await fails(U.erika, `trade_post('e1', '{"kind":"any"}', 'public', '{}')`)).toContain(
      'trades_world',
    )
    const [open] = await as<{ code: string }>(
      null,
      `select code from trade_listings where status = 'open' limit 1`,
    )
    expect(await fails(U.erika, `trade_take($1, 'e1')`, [open!.code])).toContain('trades_world')
  })

  it('knows a world from the admin’s list too', async () => {
    await db.query(
      `insert into game_config (key, value) values ('smallWorlds', $1)
       on conflict (key) do update set value = excluded.value`,
      [JSON.stringify({ access: 'all', list: [{ id: 'reef', regionId: 'w-reef' }] })],
    )
    expect(await call<boolean>(null, `trade_world('{}'::jsonb, 'w-reef')`)).toBe(true)
    expect(await call<boolean>(null, `trade_world('{}'::jsonb, 'kanto')`)).toBe(false)
  })
})
