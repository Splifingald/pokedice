// Migration 0146 against a real Postgres (PGlite, in process): the Community Boss (docs/71 §4). The affinity from the
// type chart (an immunity counts ×¼), placing (signed in, while it runs, a level the trainer card allows), a slot's
// damage over time (one hit every 9 s) and after a swap or a take-back, the cached numbers and the caller's own, the
// arena's field (own, friends, others, at most 20), and settling once at the end: the gauges broken and each
// participant's message with their rewards. Time is moved by writing the placements' times, as nothing runs on its own.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')

const ADMIN = 'gregoire.ftn@gmail.com'
const U = {
  admin: '00000000-0000-4000-8000-0000000000aa',
  ash: '00000000-0000-4000-8000-000000000001',
  misty: '00000000-0000-4000-8000-000000000002',
  brock: '00000000-0000-4000-8000-000000000003',
}
const EVENT = 'steelix'

let db: PGlite

async function as<T = Record<string, unknown>>(
  user: string | null,
  q: string,
  params: unknown[] = [],
): Promise<T[]> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? ''])
  await db.query(`select set_config('request.jwt.claim.email', $1, false)`, [user === U.admin ? ADMIN : ''])
  return (await db.query<T>(q, params)).rows
}
async function fails(user: string | null, q: string, params: unknown[] = []): Promise<string> {
  try {
    await as(user, q, params)
  } catch (e) {
    return (e as Error).message
  }
  return 'no error'
}

/** The Community Boss as the admin scheduled it: Steelix, three gauges (1,000, 2,000, 5,000 HP), each its reward. */
async function schedule(startMinsAgo: number, endInMins: number) {
  const event = {
    id: EVENT,
    type: 'boss',
    start: new Date(Date.now() - startMinsAgo * 60_000).toISOString(),
    end: new Date(Date.now() + endInMins * 60_000).toISOString(),
    boss: {
      dex: 208,
      shiny: false,
      gauges: [
        { hp: 1000, color: 'green', reward: { kind: 'item', key: 'rare-candy', qty: 3 } },
        { hp: 2000, color: 'yellow', reward: { kind: 'pokemon', dex: 4, level: 30, talent: true, qty: 2 } },
        { hp: 5000, color: 'red', reward: { kind: 'gold', amount: 5000 } },
      ],
    },
  }
  await db.query(
    `insert into game_config (key, value) values ('liveEvents', $1)
     on conflict (key) do update set value = excluded.value`,
    [JSON.stringify({ access: 'all', list: [event] })],
  )
}

const place = (user: string, slot: number, inst: string, dex: number, level: number) =>
  as<{ r: { hit: number; affinity: number } }>(user, `select boss_place($1, $2, $3, $4, $5, false) r`, [
    EVENT,
    slot,
    inst,
    dex,
    level,
  ]).then((rows) => rows[0]!.r)

/** Moves every placement of this player back by `secs` (as if placed that long ago). */
const age = (user: string, secs: number) =>
  db.query(`update boss_slots set placed_at = placed_at - ($2 || ' seconds')::interval where user_id = $1`, [
    user,
    String(secs),
  ])

type State = {
  total: number
  participants: number
  lastHour: number
  me: { damage: number; rank: number; slots: { slot: number; dex: number; hit: number }[] } | null
  field: { name: string; dex: number; own?: boolean; friend?: boolean }[]
  top: { name: string; damage: number; me: boolean }[]
}
const state = async (user: string | null) => {
  // The cache is a minute's: forget it so each call reads now.
  await db.query(`delete from boss_cache`)
  return (await as<{ s: State }>(user, `select boss_state($1) s`, [EVENT]))[0]!.s
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
      select jsonb_strip_nulls(jsonb_build_object('email', nullif(current_setting('request.jwt.claim.email', true), ''),
        'role', nullif(current_setting('request.jwt.claim.role', true), ''))) $$;
    grant usage on schema auth to anon, authenticated;
  `)
  await db.exec(sql('0001_init.sql').replace('create extension if not exists pgcrypto;', ''))
  for (const f of [
    '0019_feedback.sql',
    '0025_feedback_replies.sql',
    '0028_analytics_minimal.sql',
    '0048_message_gifts.sql',
    '0103_welcome_back.sql',
  ])
    await db.exec(sql(f))
  // The trainer cards and friendships (0033 / 0039), as much as the boss reads.
  await db.exec(`
    create table player_cards (user_id uuid primary key, name text not null);
    create table player_card_regions (user_id uuid, realm text not null default 'main', region text, max_level int not null,
      primary key (user_id, realm, region));
    create table friendships (user_a uuid, user_b uuid, primary key (user_a, user_b));
  `)
  await db.exec(sql('0146_community_boss.sql'))
  // Safe to run again.
  await db.exec(sql('0146_community_boss.sql'))
  await db.exec(`
    insert into auth.users (id) values ${Object.values(U)
      .map((u) => `('${u}')`)
      .join(',')};
    insert into player_cards values ('${U.ash}', 'Ash'), ('${U.misty}', 'Misty'), ('${U.brock}', 'Brock');
    insert into player_card_regions (user_id, region, max_level) values ('${U.ash}', 'kanto', 60), ('${U.misty}', 'kanto', 50);
    insert into friendships values ('${U.ash}', '${U.misty}');
    insert into pokemon (dex, name, type1, type2, base_hp, max_hp, speed, sprite_url, dice, rerolls) values
      (4, 'Charmander', 'fire', null, 1, 1, 1, '', '[]', 1),
      (7, 'Squirtle', 'water', null, 1, 1, 1, '', '[]', 1),
      (25, 'Pikachu', 'electric', null, 1, 1, 1, '', '[]', 1),
      (74, 'Geodude', 'rock', 'ground', 1, 1, 1, '', '[]', 1),
      (208, 'Steelix', 'steel', 'ground', 1, 1, 1, '', '[]', 1);
    insert into type_chart (attacking, defending, multiplier) values
      ('fire', 'steel', 2), ('water', 'ground', 2), ('electric', 'ground', 0), ('rock', 'steel', 0.5),
      ('ground', 'steel', 2);
    update game_config set value = '{"access":"all"}' where key = 'gifts';
  `)
})

beforeEach(async () => {
  await db.exec(`delete from boss_slots; delete from boss_cache; delete from boss_cache_users; delete from boss_results;
    delete from feedback;`)
  await schedule(60, 120)
})

afterAll(async () => {
  await db?.close()
})

describe('the hit', () => {
  it('the best type against both of the boss’s; an immunity counts ×¼', async () => {
    const aff = async (dex: number) =>
      Number((await as<{ a: number }>(null, `select boss_affinity($1, 208) a`, [dex]))[0]!.a)
    expect(await aff(4)).toBe(2) // Fire on Steel / Ground: ×2 × ×1
    expect(await aff(7)).toBe(2) // Water: ×1 × ×2
    expect(await aff(25)).toBe(0.25) // Electric on Ground: immune, ×¼
    expect(await aff(74)).toBe(2) // Geodude's Ground on Steel: ×2 (its Rock would be ×½)
  })

  it('placing: the level × the affinity, at least 1', async () => {
    expect(await place(U.ash, 0, 'a1', 4, 50)).toMatchObject({ hit: 100, affinity: 2 })
    expect(await place(U.ash, 1, 'a2', 25, 3)).toMatchObject({ hit: 1, affinity: 0.25 })
  })
})

describe('placing', () => {
  it('signed in, while it runs, a slot 0–2, a level the trainer card allows', async () => {
    expect(await fails(null, `select boss_place($1, 0, 'x', 4, 5, false)`, [EVENT])).toMatch(/not_signed_in/)
    expect(await fails(U.ash, `select boss_place($1, 3, 'x', 4, 5, false)`, [EVENT])).toMatch(/bad_slot/)
    // Ash's best is Lv.60 on his card.
    expect(await fails(U.ash, `select boss_place($1, 0, 'x', 4, 61, false)`, [EVENT])).toMatch(/bad_level/)
    expect(await fails(U.ash, `select boss_place($1, 0, 'x', 9999, 5, false)`, [EVENT])).toMatch(/bad_dex/)
    await schedule(-10, 60)
    expect(await fails(U.ash, `select boss_place($1, 0, 'x', 4, 5, false)`, [EVENT])).toMatch(/not_running/)
  })
})

describe('the damage', () => {
  it('one hit every 9 s from its placing; a swap keeps what the old one dealt; taking back stops it', async () => {
    await place(U.ash, 0, 'a1', 4, 50) // 100 a hit
    await age(U.ash, 90) // 10 hits
    expect((await state(U.ash)).me?.damage).toBe(1000)
    // Swapped for Squirtle Lv.40 (80 a hit): Charmander's 1,000 stay, Squirtle starts from now.
    await place(U.ash, 0, 'a2', 7, 40)
    await db.query(`update boss_slots set placed_at = placed_at - interval '45 seconds' where inst_id = 'a2'`)
    expect((await state(U.ash)).me?.damage).toBe(1000 + 5 * 80)
    await as(U.ash, `select boss_take_back($1, 0)`, [EVENT])
    await db.query(`update boss_slots set placed_at = placed_at - interval '90 seconds' where inst_id = 'a2'`)
    // Taken back now: its 5 hits until then, not after (its placing moved back, its taking back didn't).
    const s = await state(U.ash)
    expect(s.me?.slots).toEqual([])
    expect(s.me?.damage).toBe(1000 + 15 * 80)
  })

  it('one Pokémon hits from one slot: placed again elsewhere, its first slot stops', async () => {
    await place(U.ash, 0, 'a1', 4, 50)
    await place(U.ash, 1, 'a1', 4, 50)
    expect((await state(U.ash)).me?.slots.map((x) => x.slot)).toEqual([1])
  })
})

describe('the page’s numbers', () => {
  it('the community’s total, its trainers, the top and the caller’s rank', async () => {
    await place(U.ash, 0, 'a1', 4, 50)
    await place(U.misty, 0, 'm1', 7, 50)
    await place(U.brock, 0, 'b1', 25, 40)
    await age(U.ash, 90)
    await age(U.misty, 45)
    const s = await state(U.brock)
    expect(s.participants).toBe(3)
    expect(s.total).toBe(1000 + 500)
    expect(s.top.map((x) => [x.name, x.damage])).toEqual([
      ['Ash', 1000],
      ['Misty', 500],
      ['Brock', 0],
    ])
    expect(s.top.find((x) => x.me)?.name).toBe('Brock')
    expect(s.me?.rank).toBe(3)
  })

  it('the arena: the caller’s own, then friends’, then others; at most 20', async () => {
    await place(U.ash, 0, 'a1', 4, 50)
    await place(U.ash, 1, 'a2', 7, 50)
    await place(U.misty, 0, 'm1', 7, 50)
    await place(U.brock, 0, 'b1', 74, 40)
    const s = await state(U.ash)
    expect(s.field.map((x) => [x.name, !!x.own, !!x.friend])).toEqual([
      ['Ash', true, false],
      ['Ash', true, false],
      ['Misty', false, true],
      ['Brock', false, false],
    ])
    // A guest sees everyone, as others.
    expect((await state(null)).field).toHaveLength(4)
  })
})

describe('the end', () => {
  it('settles once: the gauges the total broke, each participant’s message with those rewards', async () => {
    await place(U.ash, 0, 'a1', 4, 50) // 100 a hit
    await place(U.misty, 0, 'm1', 7, 50)
    await age(U.ash, 9 * 25) // 2,500
    await age(U.misty, 9 * 6) // 600 → 3,100: gauges 1 (1,000) and 2 (3,000 in all) broken, not 3
    expect(await fails(U.admin, `select boss_settle($1)`, [EVENT])).toMatch(/not_ended/)
    // It ends now: what each dealt until then counts.
    await schedule(120, 0)
    await db.query(
      `update game_config set value = jsonb_set(value, '{list,0,end}', to_jsonb(now()::text)) where key = 'liveEvents'`,
    )
    expect(await fails(U.ash, `select boss_settle($1)`, [EVENT])).toMatch(/not_admin/)
    const r = (
      await as<{ r: { broken: number; sent: number; total: number } }>(U.admin, `select boss_settle($1) r`, [
        EVENT,
      ])
    )[0]!.r
    expect(r).toMatchObject({ broken: 2, sent: 2, total: 3100 })
    const msgs = await as<{ user_id: string; gifts: { kind: string; talent?: boolean }[] }>(
      U.admin,
      `select user_id, gifts from feedback order by user_id`,
    )
    expect(msgs.map((m) => m.user_id)).toEqual([U.ash, U.misty])
    expect(msgs[0]!.gifts.map((g) => g.kind)).toEqual(['item', 'pokemon', 'pokemon'])
    expect(msgs[0]!.gifts[1]!.talent).toBe(true)
    // Again: nothing more is sent.
    const again = (await as<{ r: { again: boolean } }>(U.admin, `select boss_settle($1) r`, [EVENT]))[0]!.r
    expect(again.again).toBe(true)
    expect((await as(U.admin, `select * from feedback`)).length).toBe(2)
    // The players see it among their messages, gifts and all (0048).
    const inbox = await as<{ title: string; gifts: unknown[] }>(U.ash, `select * from my_feedback('dev-ash')`)
    expect(inbox[0]?.title).toBe('Community Boss: Steelix')
    expect(inbox[0]?.gifts).toHaveLength(3)
  })

  it('the scheduled function settles every ended one it hasn’t yet', async () => {
    await place(U.ash, 0, 'a1', 4, 50)
    await age(U.ash, 9 * 12)
    await schedule(120, 0)
    await db.query(
      `update game_config set value = jsonb_set(value, '{list,0,end}', to_jsonb(now()::text)) where key = 'liveEvents'`,
    )
    await db.query(`select set_config('request.jwt.claim.role', 'service_role', false)`)
    const n = (await as<{ n: number }>(null, `select boss_settle_due() n`))[0]!.n
    await db.query(`select set_config('request.jwt.claim.role', '', false)`)
    expect(n).toBe(1)
    expect((await as(U.admin, `select * from boss_results`)).length).toBe(1)
  })
})
