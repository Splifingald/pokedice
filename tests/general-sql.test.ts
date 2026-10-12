// Migration 0048 against a real Postgres (PGlite, in process): the General upgrades (docs/25). The two config rows and
// the two items as the game has them, inserted once; the card keeps "I am just rich" from the save; and every list of
// other trainers says who is golden only while the admin's switch is on for the caller. Then seed.sql's schema part,
// run again over it, still ends on these versions. Supabase's own pieces (the auth schema, the anon / authenticated
// roles) are stood in for at the top, as in trades-sql.test.ts.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '@/engine/defaults'
import itemsJson from '@/data/items.json'
import { regionsPrelude } from '../scripts/seed'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')

const ADMIN = 'gregoire.ftn@gmail.com' // is_admin() (0001)
const U = {
  ash: '00000000-0000-4000-8000-000000000001', // the one looking
  misty: '00000000-0000-4000-8000-000000000002', // bought it
  brock: '00000000-0000-4000-8000-000000000003', // an odd value in his save: not rich
  erika: '00000000-0000-4000-8000-000000000004', // bought it in her Extreme save only
}
const NAME: Record<string, string> = { ASH: U.ash, MISTY: U.misty, BROCK: U.brock, ERIKA: U.erika }
const T = { boulder: '10000000-0000-4000-8000-000000000001', cascade: '10000000-0000-4000-8000-000000000002' }
const LEAGUE = '20000000-0000-4000-8000-000000000001'
const RAID = '30000000-0000-4000-8000-000000000001:144' // a progression raid's key, areaId:dex

const save = (name: string, general?: unknown) => ({
  version: 1,
  player: { name, character: 'red' },
  box: [
    { id: 'a', dex: 4, level: 55 },
    { id: 'b', dex: 7, level: 55 },
    { id: 'c', dex: 1, level: 55 },
  ],
  team: ['a', 'b', 'c'],
  pokedex: [1, 4, 7],
  currentAreaId: 'route-1',
  areaProgress: { 'route-1': { cleared: true, gymsDefeated: [T.boulder, T.cascade] } },
  dayCare: { residents: [{ inst: { id: 'd', dex: 16, level: 10 }, since: 1 }] },
  ...(general !== undefined && { general }),
})

let db: PGlite

/** As a signed-in player; `email` makes them the admin (is_admin reads the JWT's). */
async function as<T = Record<string, unknown>>(
  user: string | null,
  q: string,
  params: unknown[] = [],
  email = '',
): Promise<T[]> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? ''])
  await db.query(`select set_config('request.jwt.claim.email', $1, false)`, [email])
  try {
    return (await db.query<T>(q, params)).rows
  } finally {
    await db.query(`select set_config('request.jwt.claim.email', '', false)`)
  }
}

async function putSave(user: string, data: unknown, realm = 'main') {
  await db.query(`select set_config('request.jwt.claim.sub', '', false)`)
  await db.query(
    `insert into saves (user_id, realm, data, updated_at) values ($1, $2, $3, now())
     on conflict (user_id, realm) do update set data = excluded.data, updated_at = excluded.updated_at`,
    [user, realm, JSON.stringify(data)],
  )
}
const card = async (user: string, realm = 'main') =>
  (
    await db.query<{ name: string; rich: boolean }>(
      'select name, rich from player_cards where user_id = $1 and realm = $2',
      [user, realm],
    )
  ).rows[0]
const setGeneral = (patch: Record<string, unknown>) =>
  db.query(`update game_config set value = value || $1::jsonb where key = 'general'`, [JSON.stringify(patch)])
const setTrade = (patch: Record<string, unknown>) =>
  db.query(`update game_config set value = value || $1::jsonb where key = 'trade'`, [JSON.stringify(patch)])

type Rich = Record<string, boolean>
const byId = (rows: { user_id: string; rich: boolean }[]): Rich =>
  Object.fromEntries(rows.map((r) => [r.user_id, r.rich]))

/** Each list of other trainers, as Ash (or the admin) sees it: who is golden there. */
const readers: Record<string, (email: string) => Promise<Rich>> = {
  leaderboard: async (email) =>
    Object.fromEntries(
      (
        await as<{ name: string; rich: boolean }>(U.ash, 'select name, rich from leaderboard()', [], email)
      ).map(
        (r) => [NAME[r.name.replace(/\d+$/, '')]!, r.rich], // MISTY2 is still Misty
      ),
    ),
  versus_board: async (email) => byId(await as(U.ash, 'select user_id, rich from versus_board()', [], email)),
  friend_list: async (email) => byId(await as(U.ash, 'select user_id, rich from friend_list()', [], email)),
  friend_profile: async (email) => {
    const out: Rich = {}
    for (const id of [U.misty, U.brock, U.erika])
      Object.assign(out, byId(await as(U.ash, 'select user_id, rich from friend_profile($1)', [id], email)))
    return out
  },
  friend_day_cares: async (email) =>
    byId(await as(U.ash, 'select owner as user_id, rich from friend_day_cares()', [], email)),
  raid_friend_teams: async (email) =>
    byId(await as(U.ash, 'select user_id, rich from raid_friend_teams()', [], email)),
  raid_progress_friend_teams: async (email) =>
    byId(await as(U.ash, 'select user_id, rich from raid_progress_friend_teams($1)', [RAID], email)),
  friend_status: async (email) => {
    const [row] = await as<{ unseen: { id: string; rich: boolean }[] }>(
      U.ash,
      'select unseen from friend_status()',
      [],
      email,
    )
    return Object.fromEntries(row!.unseen.map((u) => [u.id, u.rich]))
  },
  trade_row: async (email) =>
    Object.fromEntries(
      (await as<{ r: { owner: string; rich: boolean } }>(U.ash, 'select trade_board() r', [], email)).map(
        ({ r }) => [r.owner, r.rich],
      ),
    ),
  // Every trade Ash took is Misty's.
  trade_mine: async (email) =>
    Object.fromEntries(
      (await as<{ r: { role: string; withRich: boolean } }>(U.ash, 'select trade_mine() r', [], email))
        .filter(({ r }) => r.role === 'taker')
        .map(({ r }) => [U.misty, r.withRich]),
    ),
}

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
    '0045_progress_raids.sql',
    '0046_progress_raids_worlds.sql',
    '0047_trades_admin_read.sql',
    '0048_general_upgrades.sql',
  ])
    await db.exec(sql(f))
  // Safe to run again.
  await db.exec(sql('0048_general_upgrades.sql'))

  await db.exec(`
    insert into auth.users (id) values ${Object.values(U)
      .map((u) => `('${u}')`)
      .join(',')};
    insert into regions (id, name, order_index, dex_range, starters, league_area_id, next_region) values
      ('kanto', 'Kanto', 1, '[1,151]', '[1,4,7]', '${LEAGUE}', null);
    insert into trainers (id, name, team, role, badge) values
      ('${T.boulder}', 'Brock', '[]', 'leader', 'Boulder Badge'),
      ('${T.cascade}', 'Misty', '[]', 'leader', 'Cascade Badge');
    -- Ash hasn't opened his friend list since: all three are new to him (friend_status's unseen).
    insert into friendships (user_a, user_b, added_by) values
      ('${U.ash}', '${U.misty}', '${U.misty}'), ('${U.ash}', '${U.brock}', '${U.brock}'), ('${U.ash}', '${U.erika}', '${U.erika}');
  `)
  await putSave(U.ash, save('ASH'))
  await putSave(U.misty, save('MISTY', { luck: 3, rich: true }))
  await putSave(U.brock, save('BROCK', { rich: 'yes' }))
  await putSave(U.erika, save('ERIKA'))
  await putSave(U.erika, save('ERIKA-X', { rich: true }), 'extreme')
  // Their teams on Versus, the day's raid and a progression raid.
  const team = JSON.stringify([{ dex: 4, level: 50, shiny: false }])
  for (const u of [U.misty, U.brock]) {
    await db.query(
      `insert into versus_teams (user_id, realm, version, team, ids) values ($1, 'main', 1, $2, '[]')`,
      [u, team],
    )
    await db.query(`insert into raid_teams (user_id, realm, team, ids) values ($1, 'main', $2, '[]')`, [
      u,
      team,
    ])
    await db.query(
      `insert into raid_progress_teams (user_id, realm, raid_key, region, team, ids) values ($1, 'main', $2, 'kanto', $3, '[]')`,
      [u, RAID, team],
    )
  }
  // A trade Ash took from Misty (trade_mine), and listings by Misty and Brock still open (the board's trade_row).
  await setTrade({ access: 'all' })
  const post = async (user: string, inst: string) =>
    (
      await as<{ r: { code: string } }>(user, `select trade_post($1, '{"kind":"any"}', 'public', '{}') r`, [
        inst,
      ])
    )[0]!.r.code
  await as(U.ash, 'select trade_take($1, $2)', [await post(U.misty, 'a'), 'b'])
  await post(U.misty, 'b')
  await post(U.brock, 'a')
}, 60_000)

afterAll(async () => {
  await db?.close()
})

describe('0048: the switches and the items', () => {
  it('keeps the game’s defaults, off', async () => {
    const rows = await as<{ key: string; value: unknown }>(
      null,
      `select key, value from game_config where key in ('general', 'itemSwitches') order by key`,
    )
    expect(rows).toEqual([
      { key: 'general', value: DEFAULT_CONFIG.general },
      { key: 'itemSwitches', value: DEFAULT_CONFIG.itemSwitches },
    ])
    expect(DEFAULT_CONFIG.general.access).toBe('off')
  })

  it('adds the Link Cable and the Bait as items.json has them', async () => {
    const rows = await as<Record<string, unknown>>(
      null,
      `select key, name, description, sprite_url, price, effect, in_shop, shop_badges, shop_area
       from items where key in ('link-cable', 'bait') order by key`,
    )
    const json = (itemsJson as { key: string; [k: string]: unknown }[])
      .filter((i) => i.key === 'link-cable' || i.key === 'bait')
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((i) => ({
        key: i.key,
        name: i.name,
        description: i.description,
        sprite_url: i.spriteUrl,
        price: i.price,
        effect: i.effect,
        in_shop: i.inShop,
        shop_badges: i.shopBadges,
        shop_area: i.shopArea ?? null,
      }))
    expect(json).toHaveLength(2)
    expect(rows).toEqual(json)
  })

  it('run again, keeps the admin’s values and items', async () => {
    await setGeneral({ access: 'admin', richCost: 5 })
    await db.query(
      `update game_config set value = '{"link-cable": "all", "bait": "admin"}' where key = 'itemSwitches'`,
    )
    await db.query(`update items set price = 1 where key = 'bait'`)
    await db.exec(sql('0048_general_upgrades.sql'))
    const cfg = await as<{ key: string; value: Record<string, unknown> }>(
      null,
      `select key, value from game_config where key in ('general', 'itemSwitches') order by key`,
    )
    expect(cfg[0]!.value).toMatchObject({ access: 'admin', richCost: 5 })
    expect(cfg[1]!.value).toEqual({ 'link-cable': 'all', bait: 'admin' })
    const [bait] = await as<{ price: number }>(null, `select price from items where key = 'bait'`)
    expect(bait!.price).toBe(1)
    await db.query(`update game_config set value = $1 where key = 'general'`, [
      JSON.stringify(DEFAULT_CONFIG.general),
    ])
    await db.query(`update game_config set value = $1 where key = 'itemSwitches'`, [
      JSON.stringify(DEFAULT_CONFIG.itemSwitches),
    ])
    await db.query(`update items set price = 150 where key = 'bait'`)
  })
})

describe('0048: the card keeps the flag', () => {
  it('from the save, a JSON true only', async () => {
    expect(await card(U.misty)).toEqual({ name: 'MISTY', rich: true })
    expect(await card(U.brock)).toEqual({ name: 'BROCK', rich: false })
    expect(await card(U.ash)).toEqual({ name: 'ASH', rich: false })
    expect(await card(U.erika)).toEqual({ name: 'ERIKA', rich: false })
    expect(await card(U.erika, 'extreme')).toEqual({ name: 'ERIKA-X', rich: true })
  })

  it('never loses the card to an odd value', async () => {
    for (const [i, general] of [
      { rich: 2 },
      { rich: 'abc' },
      { rich: null },
      { rich: [true] },
      'rich',
      [1, 2],
      null,
    ].entries()) {
      await putSave(U.brock, save(`BROCK${i}`, general))
      expect(await card(U.brock)).toEqual({ name: `BROCK${i}`, rich: false })
    }
    await putSave(U.brock, save('BROCK', { rich: true }))
    expect((await card(U.brock))!.rich).toBe(true)
    await putSave(U.brock, save('BROCK', { rich: false }))
    expect(await card(U.brock)).toEqual({ name: 'BROCK', rich: false })
  })
})

describe('0048: golden names, as the switch shows them to the caller', () => {
  // Misty bought it; Erika in her Extreme save (any save counts); Brock never did; Ash is the one looking.
  const golden = (open: boolean) => ({ [U.misty]: open, [U.erika]: open, [U.brock]: false })
  const check = async (name: string, email: string, open: boolean) => {
    const seen = await readers[name]!(email)
    expect(seen[U.misty], `${name}: Misty is listed`).toBe(open)
    for (const [id, rich] of Object.entries(seen))
      expect(rich, `${name}: ${id}`).toBe(golden(open)[id] ?? false)
  }

  for (const name of Object.keys(readers)) {
    it(name, async () => {
      try {
        await check(name, '', false) // off: the default
        await check(name, ADMIN, false)
        await setGeneral({ access: 'admin' })
        await check(name, '', false) // on for the admin only, and Ash isn't
        await check(name, ADMIN, true)
        await setGeneral({ access: 'all' })
        await check(name, '', true)
        await setGeneral({ access: 'nonsense' })
        await check(name, ADMIN, false)
      } finally {
        await setGeneral({ access: 'off' })
      }
    })
  }

  it('trade_take: the poster’s name, golden only while on', async () => {
    const post = async () =>
      (
        await as<{ r: { code: string } }>(
          U.misty,
          `select trade_post('c', '{"kind":"any"}', 'public', '{}') r`,
        )
      )[0]!.r.code
    // Ash gives a Pokémon he hasn't given yet each time (he gave 'b' before these).
    const take = async (code: string, inst: string) =>
      (
        await as<{ r: { with: string; withRich: boolean } }>(U.ash, 'select trade_take($1, $2) r', [
          code,
          inst,
        ])
      )[0]!.r
    expect(await take(await post(), 'c')).toMatchObject({ with: 'MISTY', withRich: false })
    await setGeneral({ access: 'all' })
    try {
      expect(await take(await post(), 'a')).toMatchObject({ with: 'MISTY', withRich: true })
      // The other side: Misty sees Ash, who isn't golden (and no one yet, on her listing still open).
      const mine = await as<{ r: { role: string; withRich: boolean } }>(U.misty, 'select trade_mine() r')
      expect(mine.length).toBeGreaterThan(2)
      expect(mine.map(({ r }) => [r.role, r.withRich]).filter(([, rich]) => rich !== false)).toEqual([])
    } finally {
      await setGeneral({ access: 'off' })
    }
  })

  it('players can’t call the helpers themselves', async () => {
    for (const fn of ['general_cfg()', 'general_open()', 'player_rich(uuid)']) {
      const [row] = await as<{ ok: boolean }>(
        null,
        `select has_function_privilege('authenticated', $1, 'execute') ok`,
        [fn],
      )
      expect(row!.ok, fn).toBe(false)
    }
  })
})

describe('0048 and seed.sql', () => {
  const FNS = [
    'friend_day_cares',
    'friend_list',
    'friend_profile',
    'friend_status',
    'general_cfg',
    'general_open',
    'leaderboard',
    'player_card_write',
    'player_rich',
    'raid_friend_teams',
    'raid_progress_friend_teams',
    'trade_mine',
    'trade_row',
    'trade_take',
    'versus_board',
  ]
  // The grants each of the seven had before 0048 made it again (0039, 0045).
  const GRANTS: [string, boolean, boolean][] = [
    ['leaderboard(text)', true, true],
    ['versus_board(text)', true, true],
    ['friend_list(text)', false, true],
    ['friend_profile(uuid, text)', false, true],
    ['friend_day_cares(text)', false, true],
    ['raid_friend_teams(text)', false, true],
    ['raid_progress_friend_teams(text, text)', false, true],
  ]
  const grants = async () => {
    const out: [string, boolean, boolean][] = []
    for (const [fn] of GRANTS) {
      const [row] = await as<{ a: boolean; u: boolean }>(
        null,
        `select has_function_privilege('anon', $1, 'execute') a, has_function_privilege('authenticated', $1, 'execute') u`,
        [fn],
      )
      out.push([fn, row!.a, row!.u])
    }
    return out
  }

  it('keeps the grants the seven had', async () => {
    expect(await grants()).toEqual(GRANTS)
  })

  it("re-running seed.sql's schema part (0016 … 0048, as it inlines them) ends on these versions, one of each", async () => {
    // As seed.sql runs it: one transaction (scripts/seed.ts buildSql). Twice, as the admin re-runs it.
    for (let run = 0; run < 2; run++) {
      await db.exec(`begin;\n${await regionsPrelude()}\ncommit;`)
      const overloads = await db.query<{ proname: string; n: number }>(
        `select proname, count(*)::int n from pg_proc where proname = any ($1) group by proname order by proname`,
        [FNS],
      )
      expect(overloads.rows).toEqual(FNS.map((proname) => ({ proname, n: 1 })))
      expect(await grants()).toEqual(GRANTS)
    }
    // The card writer is 0048's (0040's would leave the flag as it was), and the lists say who is golden.
    await putSave(U.misty, save('MISTY2'))
    expect(await card(U.misty)).toEqual({ name: 'MISTY2', rich: false })
    await putSave(U.misty, save('MISTY2', { rich: true }))
    expect(await card(U.misty)).toEqual({ name: 'MISTY2', rich: true })
    await setGeneral({ access: 'all' })
    try {
      for (const name of Object.keys(readers)) expect((await readers[name]!(''))[U.misty], name).toBe(true)
    } finally {
      await setGeneral({ access: 'off' })
    }
  })
})
