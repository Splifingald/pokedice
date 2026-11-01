// Migration 0108 against a real Postgres (PGlite, in process), on every migration before it as the live database has
// them: what an edited save can no longer do to other players (docs/61). Unknown species don't trade, a Pokémon given
// in a trade never trades again from its old trainer, cards and teams hold only what the game has, the Extreme clock is
// the server's, a raid needs a fight, one League match at a time, a ban reaches everything shared, and the admin's
// suspicious list finds an edited save. Supabase's own pieces (auth, the roles) are stood in for at the top.
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')
const FILE = '0108_anti_cheat.sql'
// Run on the live database in another order (or needing Supabase's realtime): left out here, as 0108 reads none of them.
const SKIP = new Set([
  '0022_player_avatar.sql',
  '0023_leaderboard_inactive.sql',
  '0024_leaderboard_badge.sql',
  '0026_lighter_load.sql',
  '0029_force_reload.sql',
  '0031_leaderboard_cron.sql',
  '0052_haunted_hollow.sql',
])
const ADMIN = 'gregoire.ftn@gmail.com'

const U = {
  ash: '00000000-0000-4000-8000-000000000001',
  misty: '00000000-0000-4000-8000-000000000002',
  brock: '00000000-0000-4000-8000-000000000003',
  gary: '00000000-0000-4000-8000-000000000004',
  erika: '00000000-0000-4000-8000-000000000005',
  cheat: '00000000-0000-4000-8000-000000000006',
  admin: '00000000-0000-4000-8000-000000000007',
}
const T = { boulder: '10000000-0000-4000-8000-000000000001', cascade: '10000000-0000-4000-8000-000000000002' }
const AREA = '30000000-0000-4000-8000-000000000001'
const LEAGUE = '20000000-0000-4000-8000-000000000001'

let db: PGlite

async function as<R = Record<string, unknown>>(
  user: string | null,
  q: string,
  params: unknown[] = [],
  email = '',
): Promise<R[]> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? ''])
  await db.query(`select set_config('request.jwt.claim.email', $1, false)`, [email])
  return (await db.query<R>(q, params)).rows
}
async function fails(user: string | null, q: string, params: unknown[] = []): Promise<string> {
  try {
    await as(user, q, params)
  } catch (e) {
    return (e as Error).message
  }
  return 'no error'
}
const one = async <R>(q: string, params: unknown[] = []) => (await db.query<R>(q, params)).rows[0]!

type Mon = { id: string; dex: number; level: number; shiny?: boolean; [k: string]: unknown }
const mon = (id: string, dex: number, level: number, extra: Partial<Mon> = {}): Mon => ({
  id,
  dex,
  level,
  ...extra,
})
function save(o: {
  name: string
  box: Mon[]
  team?: string[]
  parked?: Record<string, unknown>
  extra?: object
}) {
  return {
    version: 1,
    player: { name: o.name, character: 'red' },
    box: o.box,
    team: o.team ?? [o.box[0]!.id],
    pokedex: o.box.map((m) => m.dex),
    region: 'kanto',
    currentAreaId: AREA,
    areaProgress: { [AREA]: { cleared: true, gymsDefeated: [T.boulder, T.cascade] } },
    ...(o.parked && { parked: o.parked }),
    ...o.extra,
  }
}
/** Writes a save as the server would hold it (the triggers run: the card, area versus), not as the player. */
async function putSave(user: string, data: unknown, realm = 'main', at = 'now()') {
  await as(null, `delete from saves where user_id = $1 and realm = $2`, [user, realm])
  await as(null, `insert into saves (user_id, realm, data, updated_at) values ($1, $2, $3, ${at})`, [
    user,
    realm,
    JSON.stringify(data),
  ])
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
  for (const f of readdirSync(MIG).sort()) {
    if (SKIP.has(f) || f >= FILE) continue
    const text = sql(f)
    await db.exec(f === '0001_init.sql' ? text.replace('create extension if not exists pgcrypto;', '') : text)
  }
  // Supabase grants every new function to anon and authenticated directly; PGlite only to public.
  await db.exec(`grant execute on function versus_league_close_week(date), versus_league_seat_bots(date),
    versus_league_join(uuid, date), player_powers(uuid, text) to anon, authenticated`)
  // Players' rows written before 0108, which it must take back.
  await db.exec(
    `insert into auth.users (id) values ${Object.values(U)
      .map((u) => `('${u}')`)
      .join(',')};`,
  )
  const species = (dex: number, form: unknown = null) =>
    `(${dex}, 'P${dex}', 'normal', 10, 100, 5, '', '[]', 1, '[]', '[]', ${form ? `'${JSON.stringify(form)}'` : 'null'})`
  await db.exec(`
    insert into pokemon (dex, name, type1, base_hp, max_hp, speed, sprite_url, dice, rerolls, evolutions, milestones, form) values
      ${[1, 4, 6, 7, 8, 9, 16, 25, 129, 150].map((d) => species(d)).join(',')},
      ${species(10034, { of: 6, kind: 'mega' })}
    on conflict (dex) do nothing;
    insert into regions (id, name, order_index, dex_range, starters, league_area_id, next_region) values
      ('kanto', 'Kanto', 1, '[1,151]', '[1,4,7]', '${LEAGUE}', null)
    on conflict (id) do nothing;
    insert into trainers (id, name, team, role, badge) values
      ('${T.boulder}', 'Brock', '[]', 'leader', 'Boulder Badge'),
      ('${T.cascade}', 'Misty', '[]', 'leader', 'Cascade Badge')
    on conflict (id) do nothing;
    insert into areas (id, order_index, name, min_level, max_level, encounter_weights, gyms) values
      ('${AREA}', 1, 'Pewter', 2, 5, '{}', '["${T.boulder}", "${T.cascade}"]');
    update game_config set value = value || '{"access": "all", "minBadges": 0}'::jsonb where key = 'trade';
    insert into versus_teams (user_id, realm, team) values ('${U.cheat}', 'main', '[{"dex": 25, "level": 50, "shiny": false}]');
  `)
  await db.exec(sql(FILE))
  // Safe to run again.
  await db.exec(sql(FILE))
}, 300_000)

afterAll(async () => {
  await db?.close()
})

describe('0108: internal functions', () => {
  it('takes the League’s internal functions back from players', async () => {
    for (const fn of [
      'versus_league_close_week(date)',
      'versus_league_seat_bots(date)',
      'versus_league_join(uuid, date)',
      'player_powers(uuid, text)',
    ]) {
      for (const role of ['anon', 'authenticated']) {
        const r = await one<{ ok: boolean }>(`select has_function_privilege($1, $2, 'execute') ok`, [
          role,
          fn,
        ])
        expect(r.ok, `${role} ${fn}`).toBe(false)
      }
    }
  })

  it('no longer lets a player delete their save row directly', async () => {
    const r = await one<{ ok: boolean }>(`select has_table_privilege('authenticated', 'saves', 'delete') ok`)
    expect(r.ok).toBe(false)
  })
})

describe('0108: names', () => {
  it('drops invisible characters and stacked accents, keeps real names', async () => {
    const clean = async (s: string) => (await one<{ n: string }>(`select name_clean($1) n`, [s])).n
    expect(await clean('Ash')).toBe('Ash')
    expect(await clean('Élodie')).toBe('Élodie')
    expect(await clean('サトシ')).toBe('サトシ')
    expect(await clean('A‮evil​')).toBe('Aevil')
    // "Zalgo": a pile of accents on one letter keeps the first (q has no letter with an accent built in).
    expect(await clean('q́̂̃̄̅o')).toBe('q́o')
    expect(await clean('  a   b  ')).toBe('a b')
    expect(await clean('​​')).toBe('Trainer')
    expect(await clean('ABCDEFGHIJKLMNOP')).toBe('ABCDEFGHIJKL')
  })
})

describe('0108: trades', () => {
  beforeAll(async () => {
    await putSave(U.ash, save({ name: 'ASH', box: [mon('a0', 1, 30), mon('a1', 4, 12), mon('a2', 7, 5)] }))
    await putSave(
      U.misty,
      save({ name: 'MISTY', box: [mon('m0', 7, 40), mon('m1', 8, 34), mon('m2', 129, 9)] }),
    )
    await putSave(
      U.cheat,
      save({
        name: 'CHEAT',
        box: [
          mon('c0', 1, 5),
          mon('c1', 99999, 5),
          mon('c2', 16, 5000, { junk: 'x'.repeat(500), shiny: true }),
        ],
      }),
    )
  })
  const post = (user: string, inst: string) =>
    as<{ r: { id: string; code: string } }>(
      user,
      `select trade_post($1, '{"kind": "any"}', 'public', $2) r`,
      [inst, JSON.stringify({ regions: ['kanto'], has: '', forms: [], shiny: [] })],
    ).then((r) => r[0]!.r)
  const take = (user: string, code: string, inst: string) =>
    as<{ r: unknown }>(user, `select trade_take($1, $2) r`, [code, inst]).then((r) => r[0]!.r)

  it('refuses a species the game doesn’t have, on either side', async () => {
    expect(await one<{ u: boolean }>(`select trade_untradable(99999) u`)).toEqual({ u: true })
    expect(await one<{ u: boolean }>(`select trade_untradable(16) u`)).toEqual({ u: false })
    expect(await fails(U.cheat, `select trade_post('c1', '{"kind": "any"}', 'public', '{}')`)).toContain(
      'trades_untradable',
    )
    const l = await post(U.misty, 'm2')
    expect(await fails(U.cheat, `select trade_take($1, 'c1')`, [l.code])).toContain('trades_untradable')
    await as(U.misty, `select trade_cancel($1)`, [l.id])
  })

  it('keeps a clean copy: known fields only, the level within 1–100', async () => {
    const l = await post(U.cheat, 'c2')
    const row = await one<{ mon: Mon; level: number }>(
      `select mon, level from trade_listings where id = $1`,
      [l.id],
    )
    expect(row.level).toBe(100)
    expect(row.mon).toEqual({ id: 'c2', dex: 16, level: 100, shiny: true })
    await as(U.cheat, `select trade_cancel($1)`, [l.id])
  })

  it('never trades again a Pokémon given in a trade, even from a save rolled back', async () => {
    const l = await post(U.ash, 'a1')
    await take(U.misty, l.code, 'm1')
    const gone = await db.query(`select user_id, inst_id from trade_gone order by user_id`)
    expect(gone.rows).toEqual([
      { user_id: U.ash, inst_id: 'a1' },
      { user_id: U.misty, inst_id: 'm1' },
    ])
    // Both saves still hold what they gave (the save from before the trade).
    expect(await fails(U.ash, `select trade_post('a1', '{"kind": "any"}', 'public', '{}')`)).toContain(
      'trades_listed',
    )
    const l2 = await post(U.ash, 'a2')
    expect(await fails(U.misty, `select trade_take($1, 'm1')`, [l2.code])).toContain('trades_listed')
    await as(U.ash, `select trade_cancel($1)`, [l2.id])
  })
})

describe('0108: boards', () => {
  it('a card holds only what the game has, on the server’s clock', async () => {
    await putSave(
      U.gary,
      save({
        name: 'GA‮RY​',
        box: [mon('g0', 25, 999), mon('g1', 150, 50), mon('g2', 10034, 50), mon('g3', 99999, 50)],
        team: ['g0', 'g1', 'g2', 'g3'],
        parked: { 'fake-region': { box: [mon('f0', 1, 5)], team: ['f0'], pokedex: [1], areaProgress: {} } },
        extra: {
          pokedex: Array.from({ length: 2000 }, (_, i) => i + 1),
          areaProgress: {
            [AREA]: { cleared: true, gymsDefeated: [T.boulder, T.cascade, 'x', 'y', 'z'] },
            'no-such-area': { cleared: true, gymsDefeated: ['a', 'b'] },
          },
        },
      }),
      'main',
      `'2099-01-01'`,
    )
    const card = await one<{ name: string; future: boolean }>(
      `select name, updated_at > now() + interval '1 minute' future from player_cards where user_id = $1`,
      [U.gary],
    )
    expect(card).toEqual({ name: 'GARY', future: false })
    const regions = await db.query<{
      region: string
      max_level: number
      pokedex: number
      team: Mon[]
      progress: object
    }>(`select region, max_level, pokedex, team, progress from player_card_regions where user_id = $1`, [
      U.gary,
    ])
    expect(regions.rows.map((r) => r.region)).toEqual(['kanto'])
    const k = regions.rows[0]!
    expect(k.max_level).toBe(100)
    // Every Kanto number up to 151 and every form: here the 10 species of the test and its 1 form.
    expect(k.pokedex).toBe(11)
    expect(k.team.map((m) => m.dex)).toEqual([25, 150])
    expect(k.team[0]!.level).toBe(100)
    expect(k.progress).toEqual({ [AREA]: { cleared: true, gyms: 2 } })
  })
})

describe('0108: Extreme speedrun', () => {
  const run = (o: object) =>
    save({ name: 'ERIKA', box: [mon('e0', 1, 5)], extra: { extreme: { runs: { kanto: o } } } })
  const best = async () =>
    (
      await one<{ b: number | null }>(
        `select best_ms b from player_card_regions where user_id = $1 and realm = 'extreme' and region = 'kanto'`,
        [U.erika],
      )
    ).b

  it('gives no time to a run first seen already won', async () => {
    await putSave(U.erika, run({ id: 'r1', startedAt: 1, finishedAt: 2 }), 'extreme')
    expect(await best()).toBeNull()
  })

  it('keeps no time under the floor, then the time the server watched', async () => {
    await putSave(U.erika, run({ id: 'r2', startedAt: 1 }), 'extreme')
    await as(null, `update saves set data = $2 where user_id = $1 and realm = 'extreme'`, [
      U.erika,
      JSON.stringify(run({ id: 'r2', startedAt: 1, finishedAt: 2 })),
    ])
    expect(await best()).toBeNull()
    await putSave(U.erika, run({ id: 'r3', startedAt: 1 }), 'extreme')
    await db.query(
      `update player_card_regions set run_seen = now() - interval '2 hours' where user_id = $1 and realm = 'extreme'`,
      [U.erika],
    )
    // The save claims a 1 ms run, and a stamp from long ago: the server's clock decides.
    await as(
      null,
      `update saves set data = $2, updated_at = now() - interval '3 hours' where user_id = $1 and realm = 'extreme'`,
      [U.erika, JSON.stringify(run({ id: 'r3', startedAt: 1, finishedAt: 2 }))],
    )
    const b = await best()
    expect(b).toBeGreaterThanOrEqual(2 * 3_600_000 - 1000)
    expect(b).toBeLessThan(2 * 3_600_000 + 60_000)
  })
})

describe('0108: raids', () => {
  beforeAll(async () => {
    await putSave(U.brock, save({ name: 'BROCK', box: [mon('b0', 25, 30), mon('b1', 8, 20)] }))
  })

  it('counts the day’s raid only after a fight', async () => {
    await db.query(
      `insert into event_state (user_id, realm, raid) values ($1, 'main', jsonb_build_object('day', to_char((now() at time zone 'UTC')::date, 'YYYY-MM-DD'), 'dex', 150))
       on conflict (user_id, realm) do update set raid = excluded.raid`,
      [U.brock],
    )
    expect(await fails(U.brock, `select raid_close()`)).toContain('events_no_fight')
    await as(U.brock, `select raid_set_team(array['b0'])`)
    expect(await fails(U.brock, `select raid_close()`)).toContain('events_no_fight')
    await db.query(`update raid_teams set updated_at = now() - interval '1 minute' where user_id = $1`, [
      U.brock,
    ])
    const r = await as<{ r: { raidsWon: number } }>(U.brock, `select raid_close() r`)
    expect(r[0]!.r.raidsWon).toBe(1)
  })

  it('counts a progression raid only after a fight, 20 a day at most', async () => {
    // The raid's boss as the area would name it.
    await db.exec(`create or replace function raid_progress_dex(p_key text) returns int language sql stable as $$
      select case when p_key like 'k%' then 150 end $$`)
    expect(await fails(U.brock, `select raid_progress_close('k1')`)).toContain('events_no_fight')
    for (let i = 1; i <= 21; i++)
      await db.query(
        `insert into raid_progress_teams (user_id, realm, raid_key, region, team, ids, updated_at)
         values ($1, 'main', $2, 'kanto', '[{"dex": 25, "level": 30, "shiny": false}]', '["b0"]', now() - interval '1 minute')`,
        [U.brock, `k${i}`],
      )
    for (let i = 1; i <= 20; i++) await as(U.brock, `select raid_progress_close($1)`, [`k${i}`])
    expect(await fails(U.brock, `select raid_progress_close('k21')`)).toContain('events_too_many')
    // One already counted still answers as before.
    const again = await as<{ r: { gifts: number } }>(U.brock, `select raid_progress_close('k1') r`)
    expect(again[0]!.r.gifts).toBe(0)
  })
})

describe('0108: teams others meet', () => {
  it('refuses a Versus or raid team with a battle form or a species the game doesn’t have', async () => {
    await putSave(
      U.misty,
      save({
        name: 'MISTY',
        box: [
          mon('m0', 7, 50),
          mon('m3', 10034, 60),
          mon('m4', 99999, 60),
          mon('m5', 9, 50),
          mon('m6', 25, 50),
        ],
      }),
    )
    expect(await fails(U.misty, `select versus_set_team(array['m0', 'm3', 'm5'])`)).toContain(
      'versus_not_eligible',
    )
    expect(await fails(U.misty, `select raid_set_team(array['m4'])`)).toContain('events_not_eligible')
    const v = await as<{ v: number }>(U.misty, `select versus_set_team(array['m0', 'm5', 'm6']) v`)
    expect(v[0]!.v).toBe(1)
  })

  it('skips an area versus team with an unknown species, quietly', async () => {
    await db.query(
      `insert into area_versus_teams (user_id, area_id, region, name, avatar, team, levels, played_at)
       values ($1, 'x', 'kanto', 'N', 'red', '[{"dex": 99999, "level": 5}]', '{}', now())`,
      [U.misty],
    )
    const n = await one<{ n: number }>(`select count(*)::int n from area_versus_teams where user_id = $1`, [
      U.misty,
    ])
    expect(n.n).toBe(0)
  })

  it('lets a Versus team change 30 times a day', async () => {
    for (let i = 0; i < 30; i++)
      await db.query(`update versus_teams set version = version + 1 where user_id = $1`, [U.misty])
    expect(
      await fails(null, `update versus_teams set version = version + 1 where user_id = $1`, [U.misty]),
    ).toContain('versus_too_many')
  })

  it('records at most 200 Versus fights an hour', async () => {
    await db.query(
      `insert into versus_battles (realm, attacker_id, defender_id, defender_version, seed, won)
       select 'main', $1, $2, g, 1, false from generate_series(1, 200) g`,
      [U.ash, U.misty],
    )
    expect(
      await fails(
        null,
        `insert into versus_battles (realm, attacker_id, defender_id, defender_version, seed, won) values ('main', $1, $2, 999, 1, false)`,
        [U.ash, U.misty],
      ),
    ).toContain('versus_too_many')
  })
})

describe('0108: the Versus League', () => {
  beforeAll(async () => {
    await db.query(
      `update game_config set value = value || '{"access": "all"}'::jsonb where key = 'versusLeague'`,
    )
    await db.query(
      `insert into game_config (key, value) values ('versusLeague', '{"access": "all"}') on conflict (key) do nothing`,
    )
    for (const u of [U.ash, U.brock])
      await db.query(
        `insert into versus_teams (user_id, realm, team) values ($1, 'main', '[{"dex": 25, "level": 50}, {"dex": 6, "level": 50}, {"dex": 9, "level": 50}]')
         on conflict (user_id, realm) do nothing`,
        [u],
      )
  })
  const start = async (user: string) => {
    await as(user, 'select * from versus_league_choices()')
    const [m] = await as<{ match_id: number }>(user, 'select * from versus_league_start(1)')
    return m!.match_id
  }

  it('raises the minimum win time to 30 s', async () => {
    const cfg = await one<{ v: number }>(`select (versus_league_cfg() ->> 'minWinSeconds')::int v`)
    expect(cfg.v).toBe(30)
  })

  it('ends the unfinished match when the next one starts', async () => {
    const first = await start(U.ash)
    const second = await start(U.ash)
    const rows = await db.query<{ id: number; outcome: string | null; done: boolean }>(
      `select id, outcome, finished_at is not null done from versus_league_matches where user_id = $1 order by id`,
      [U.ash],
    )
    expect(rows.rows.find((r) => r.id === first)).toMatchObject({ outcome: 'left', done: true })
    expect(rows.rows.find((r) => r.id === second)).toMatchObject({ done: false })
    expect(
      await fails(U.ash, `select * from versus_league_finish($1, 'won', 3, 0, '[]')`, [first]),
    ).toContain('versus_league_done')
  })

  it('refuses a win with no attack in its log', async () => {
    const id = await start(U.brock)
    await db.query(
      `update versus_league_matches set started_at = now() - interval '5 minutes' where id = $1`,
      [id],
    )
    expect(
      await fails(U.brock, `select * from versus_league_finish($1, 'won', 3, 0, '[{"t": "PASS"}]')`, [id]),
    ).toContain('versus_league_bad_result')
    const ok = await as<{ delta: number }>(
      U.brock,
      `select * from versus_league_finish($1, 'won', 3, 0, '[{"t": "ATTACK"}]')`,
      [id],
    )
    expect(ok[0]!.delta).toBeGreaterThan(0)
  })
})

describe('0108: a ban reaches everything shared', () => {
  it('took the teams of a player banned before, and takes them at the ban', async () => {
    await db.query(`insert into leaderboard_bans (user_id) values ($1) on conflict do nothing`, [U.cheat])
    const t = await one<{ n: number }>(`select count(*)::int n from versus_teams where user_id = $1`, [
      U.cheat,
    ])
    expect(t.n).toBe(0)
    expect(await fails(U.cheat, `select versus_set_team(array['c0', 'c1', 'c2'])`)).toContain(
      'versus_not_eligible',
    )
    expect(await fails(U.cheat, `select trade_post('c0', '{"kind": "any"}', 'public', '{}')`)).toContain(
      'trades_off',
    )
  })
})

describe('0108: push and guests', () => {
  it('takes only the browsers’ push services as endpoints', async () => {
    const add = (endpoint: string) =>
      db.query(
        `insert into push_subscriptions (endpoint, owner, p256dh, auth) values ($1, 'd:x', 'k', 'a')`,
        [endpoint],
      )
    await expect(add('https://evil.example/hang')).rejects.toThrow('push_bad_subscription')
    await add('https://fcm.googleapis.com/fcm/send/abc')
    await add('https://web.push.apple.com/abc')
  })

  it('keeps no notice already overdue', async () => {
    await db.query(
      `insert into push_notices (owner, key, topic, due_at, payload) values
        ('d:x', 'old', 'egg', now() - interval '5 hours', '{}'), ('d:x', 'soon', 'egg', now() + interval '1 hour', '{}')`,
    )
    const keys = await db.query<{ key: string }>(`select key from push_notices where owner = 'd:x'`)
    expect(keys.rows.map((r) => r.key)).toEqual(['soon'])
  })

  it('takes at most 20 guest messages every 10 minutes', async () => {
    for (let i = 0; i < 20; i++)
      await as(null, `insert into feedback (device_id, title, message) values ($1, 'Hi', 'Hello')`, [
        `dev-${i}`,
      ])
    expect(
      await fails(
        null,
        `insert into feedback (device_id, title, message, from_admin) values ('dev-x', 'Hi', 'Hello', true)`,
      ),
    ).toContain('feedback_rate_limited')
  })

  it('leaves out new guests past 3,000 in a day, never known ones', async () => {
    await db.query(
      `insert into players (player, device_id, first_day, last_day, days)
       select 'device:g' || g, 'g' || g, (now() at time zone 'UTC')::date, (now() at time zone 'UTC')::date, 1
       from generate_series(1, 3000) g`,
    )
    await as(null, `select player_ping('newcomer', (now() at time zone 'UTC')::date)`)
    await as(null, `select player_ping('g1', (now() at time zone 'UTC')::date)`)
    const n = await one<{ n: number; d: number }>(
      `select (select count(*)::int from players where player = 'device:newcomer') n,
              (select count(*)::int from player_days where player = 'device:newcomer') d`,
    )
    expect(n).toEqual({ n: 0, d: 0 })
  })
})

describe('0108: the admin’s suspicious list', () => {
  it('is the admin’s only', async () => {
    expect(await fails(U.ash, `select admin_suspicious()`)).toContain('admin only')
  })

  it('finds an edited save and a Pokémon still held after its trade', async () => {
    await putSave(
      U.admin,
      save({
        name: 'RICH',
        box: Array.from({ length: 400 }, (_, i) => mon(`r${i}`, 25, 100, { shiny: true })),
        extra: { gold: 10_000_000, inventory: { 'rare-candy': 999_999 } },
      }),
    )
    const rows = (
      await as<{ r: { user_id: string; reasons: string[] }[] }>(
        U.admin,
        `select admin_suspicious() r`,
        [],
        ADMIN,
      )
    )[0]!.r
    const rich = rows.find((r) => r.user_id === U.admin)
    expect(rich?.reasons).toEqual(expect.arrayContaining(['box', 'shinies', 'levels', 'gold', 'items']))
    // Ash's save still holds a1, given to Misty.
    expect(rows.find((r) => r.user_id === U.ash)?.reasons).toContain('trade')
    expect(rows.find((r) => r.user_id === U.brock)).toBeUndefined()
  })
})
