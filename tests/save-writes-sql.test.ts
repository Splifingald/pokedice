// Migration 0040 against a real Postgres (PGlite, in process): the player card, now built from the save unpacked once,
// must come out exactly as 0039's did; an upload must leave the regions it didn't change alone; and a player's own
// uploads draw on a budget of 10 that refills one a minute (HTTP 429 beyond it). Supabase's own pieces are stood in for
// at the top, as in friends-sql.test.ts.
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
}
const T = {
  boulder: '10000000-0000-4000-8000-000000000001',
  zephyr: '10000000-0000-4000-8000-000000000002',
  plain: '10000000-0000-4000-8000-000000000003',
}
const LEAGUE = { kanto: '20000000-0000-4000-8000-000000000001', johto: '20000000-0000-4000-8000-000000000002' }

const mon = (id: string, dex: number, level: number, shiny = false) => ({ id, dex, level, ...(shiny && { shiny: true }) })
const block = (prefix: string, levels: number[], gyms: string[] = [], leagueCleared = false, league = LEAGUE.kanto) => ({
  box: levels.map((lv, i) => mon(`${prefix}${i}`, 10 + i, lv, i === 2)),
  team: levels.slice(0, 3).map((_, i) => `${prefix}${i}`),
  pokedex: levels.map((_, i) => 10 + i).concat(10),
  currentAreaId: `${prefix}-route`,
  areaProgress: {
    [`${prefix}-route`]: { cleared: true, gymsDefeated: gyms },
    [`${prefix}-cave`]: { cleared: false },
    [league]: { cleared: leagueCleared, gymsDefeated: [] },
  },
})
const resident = (id: string, level: number, since: number, region?: string, shiny = false) => ({
  since,
  ...(region && { region }),
  inst: { id, dex: 1, level, xp: 10, shiny },
})

/** Saves that walk every branch of the card: regions parked and live, Day Care residents tagged or not, badges. */
const SAVES: Record<string, unknown> = {
  [U.ash]: {
    version: 1,
    region: 'johto',
    player: { name: '  Ash Ketchum the Great  ', character: 'red', avatar: 'ash-hat' },
    ...block('j', [30, 31, 45], [T.zephyr, T.plain], false, LEAGUE.johto),
    dayCare: { residents: [resident('d1', 60, 5, 'kanto', true), resident('d2', 20, 2), resident('d3', 9, 9, 'johto')] },
    parked: { kanto: { ...block('k', [50, 52, 55, 12], [T.boulder], true), dayCare: { residents: [resident('pk', 70, 1)] } } },
  },
  [U.misty]: { version: 1, player: { name: '', character: 'green' }, ...block('m', [5]) },
  [U.brock]: { version: 1, region: 'kanto', player: {}, ...block('b', [7, 8]), parked: { johto: null } },
}

let db: PGlite

async function as(user: string | null, q: string, params: unknown[] = []) {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? ''])
  return (await db.query(q, params)).rows
}

/** An upload as PostgREST makes it: the player's own upsert. */
const upload = (user: string, data: unknown, by: string | null = user) =>
  as(
    by,
    `insert into saves (user_id, data, updated_at) values ($1, $2, now())
     on conflict (user_id, realm) do update set data = excluded.data, updated_at = excluded.updated_at`,
    [user, JSON.stringify(data)],
  )

type Rows = Record<string, unknown>[]
const cards = async (): Promise<{ cards: Rows; regions: Rows }> => ({
  cards: (await db.query(`select user_id, realm, name, avatar, region, area_id, updated_at, day_care from player_cards order by 1, 2`)).rows as Rows,
  regions: (
    await db.query<Record<string, unknown>>(
      `select user_id, realm, region, team, pokedex, max_level, shinies, progress, badges, endgame
       from player_card_regions order by 1, 2, 3`,
    )
  ).rows,
})

const xmins = async (user: string) =>
  Object.fromEntries(
    (await db.query<{ region: string; x: string }>(`select region, xmin::text x from player_card_regions where user_id = $1`, [user])).rows.map(
      (r) => [r.region, r.x],
    ),
  )

let before0040: Awaited<ReturnType<typeof cards>>

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
  await db.exec(`
    insert into auth.users (id) values ${Object.values(U).map((u) => `('${u}')`).join(',')};
    insert into regions (id, name, order_index, dex_range, starters, league_area_id, next_region) values
      ('kanto', 'Kanto', 1, '[1,151]', '[1,4,7]', '${LEAGUE.kanto}', 'johto'),
      ('johto', 'Johto', 2, '[152,251]', '[152,155,158]', '${LEAGUE.johto}', null);
    insert into trainers (id, name, team, role, badge) values
      ('${T.boulder}', 'Brock', '[]', 'leader', 'Boulder Badge'),
      ('${T.zephyr}', 'Falkner', '[]', 'leader', 'Zephyr Badge'),
      ('${T.plain}', 'Youngster', '[]', 'trainer', null);
    insert into game_config (key, value) values ('dayCare', '{"slots": 2}');
  `)
  // The cards as 0039 builds them, from the SQL editor (no player signed in).
  for (const [user, data] of Object.entries(SAVES)) await upload(user, data, null)
  before0040 = await cards()
  await db.exec(sql('0040_lighter_save_writes.sql'))
  // Run twice: the migration must stay safe to run again.
  await db.exec(sql('0040_lighter_save_writes.sql'))
}, 60_000)

describe('0040: the card, unpacked once', () => {
  it('rebuilt from the stored saves, every card comes out exactly as 0039 built it', async () => {
    await db.exec('select player_card_write(user_id, data, updated_at, realm) from saves')
    expect(await cards()).toEqual(before0040)
    // Built from nothing too, not only over rows already there.
    await db.exec('delete from player_cards')
    expect((await cards()).regions).toEqual([])
    await db.exec('select player_card_write(user_id, data, updated_at, realm) from saves')
    expect(await cards()).toEqual(before0040)
  })

  it('reads what 0039 read: the badges, the league, the Day Care in its own region', async () => {
    const ash = before0040.regions.filter((r) => r.user_id === U.ash)
    expect(ash).toMatchObject([
      { region: 'johto', badges: [T.zephyr], endgame: false, max_level: 45 },
      { region: 'kanto', badges: [T.boulder], endgame: true, max_level: 70 },
    ])
  })

  it('an upload rewrites only the regions it changed, and drops the ones the save no longer holds', async () => {
    const ash = SAVES[U.ash] as Record<string, unknown>
    const was = await xmins(U.ash)
    // A level up in Johto, the region being played.
    await upload(U.ash, { ...ash, box: [...(ash.box as object[]), mon('j9', 99, 46)] })
    const now = await xmins(U.ash)
    expect(now.kanto).toBe(was.kanto)
    expect(now.johto).not.toBe(was.johto)
    // An upload that changes nothing on the card (only the save's stamp) rewrites no region.
    await upload(U.ash, { ...ash, box: [...(ash.box as object[]), mon('j9', 99, 46)], updatedAt: 5 })
    expect(await xmins(U.ash)).toEqual(now)
    // Kanto gone from the save: gone from the card.
    await upload(U.ash, { ...ash, parked: {} }, null)
    expect(Object.keys(await xmins(U.ash))).toEqual(['johto'])
  })
})

describe('0040: a budget for a player’s own uploads', () => {
  const at = (n: number) => ({ ...(SAVES[U.misty] as object), tick: n })
  /** Time passes for the budget. Triggers off: 0037 drops an update that leaves the save itself as it was. */
  const rewind = (interval: string) =>
    db.exec(`
      set session_replication_role = replica;
      update saves set written_at = written_at - interval '${interval}' where user_id = '${U.gary}';
      set session_replication_role = origin;
    `)

  it('ten in a row pass; the eleventh is refused with HTTP 429 (PT429), and nothing of it is written', async () => {
    for (let i = 0; i < 11; i++) await upload(U.gary, at(i)) // the first creates the row: free
    await expect(upload(U.gary, at(99))).rejects.toMatchObject({ code: 'PT429' })
    const [row] = await as(null, `select data ->> 'tick' tick from saves where user_id = $1`, [U.gary])
    expect(row).toEqual({ tick: '10' })
  })

  it('an upload that changes nothing is dropped before it, at no cost', async () => {
    await expect(upload(U.gary, at(10))).resolves.toBeDefined()
  })

  it('one more a minute later, and the budget refills to 10 at most', async () => {
    await rewind('1 minute')
    await upload(U.gary, at(11))
    await expect(upload(U.gary, at(12))).rejects.toMatchObject({ code: 'PT429' })
    await rewind('1 day')
    for (let i = 0; i < 10; i++) await upload(U.gary, at(20 + i))
    await expect(upload(U.gary, at(99))).rejects.toMatchObject({ code: 'PT429' })
  })

  it('a client can’t raise its own budget', async () => {
    const write = (budget: number) =>
      as(
        U.gary,
        `insert into saves (user_id, data, updated_at, write_budget, written_at) values ($1, $2, now(), $3, now() - interval '1 year')
         on conflict (user_id, realm) do update set data = excluded.data, write_budget = excluded.write_budget, written_at = excluded.written_at`,
        [U.gary, JSON.stringify(at(500)), budget],
      )
    await expect(write(1e9)).rejects.toMatchObject({ code: 'PT429' })
  })

  it('the admin and the SQL editor are not counted', async () => {
    await as(null, `update saves set data = $2 where user_id = $1`, [U.gary, JSON.stringify(at(600))])
    await upload(U.gary, at(601), U.ash) // another signed-in user (the admin's page edits someone else's save)
    const [row] = await as(null, `select data ->> 'tick' tick from saves where user_id = $1`, [U.gary])
    expect(row).toEqual({ tick: '601' })
  })
})
