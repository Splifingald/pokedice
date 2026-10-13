// Migration 0049 against a real Postgres (PGlite, in process): friend invite rewards (docs/15 §24). A new player who
// opened an invite link counts for its owner once they win their first badge (in the main game); a player with a badge,
// one invited before, a stranger or a cycle doesn't; the switch gates everything; each tier is claimed once; deleting
// your data takes your gauge. Supabase's own pieces (the auth schema, the anon / authenticated roles) are stood in for
// at the top, as in friends-sql.test.ts.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '@/engine'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')

const ADMIN = 'gregoire.ftn@gmail.com'
const U = {
  admin: '00000000-0000-4000-8000-0000000000aa',
  ash: '00000000-0000-4000-8000-000000000001',
  misty: '00000000-0000-4000-8000-000000000002',
  brock: '00000000-0000-4000-8000-000000000003',
  gary: '00000000-0000-4000-8000-000000000004',
  erika: '00000000-0000-4000-8000-000000000005',
  dawn: '00000000-0000-4000-8000-000000000006',
}
const CODE = { ash: 'ASH00001', gary: 'GARY0001', erika: 'ERKA0001', admin: 'ADM00001' }
const T = { boulder: '10000000-0000-4000-8000-000000000001' }
const LEAGUE = '20000000-0000-4000-8000-000000000001'

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

/** A main (or Extreme) save uploaded, with the gyms beaten on Route 1: the trigger writes its card. */
async function putSave(user: string, gyms: string[], realm = 'main') {
  await as(
    null,
    `insert into saves (user_id, realm, data, updated_at) values ($1, $2, $3, now())
     on conflict (user_id, realm) do update set data = excluded.data, updated_at = excluded.updated_at`,
    [
      user,
      realm,
      JSON.stringify({
        version: 1,
        player: { name: user.slice(-2) === '02' ? 'MISTY' : 'TRAINER', character: 'red' },
        box: [{ id: 'm0', dex: 7, level: 12 }],
        team: ['m0'],
        pokedex: [7],
        currentAreaId: 'route-1',
        areaProgress: { 'route-1': { cleared: gyms.length > 0, gymsDefeated: gyms } },
      }),
    ],
  )
}

const setInvites = (patch: Record<string, unknown>) =>
  db.query(`update game_config set value = value || $1::jsonb where key = 'inviteRewards'`, [
    JSON.stringify(patch),
  ])
const befriend = (user: string, code: string) => as(user, `select * from friend_add($1)`, [code])
const record = async (user: string, code: string, badges = 0) =>
  (await as<{ s: string }>(user, `select invite_record($1, $2) s`, [code, badges]))[0]!.s
type Status = {
  count: number
  pending: number
  claimed: number[]
  latest: { name: string; avatar: string } | null
}
const status = async (user: string) =>
  (await as<{ s: Status | null }>(user, `select invite_status() s`))[0]!.s
const claim = (user: string) =>
  as<{ friends: number; gifts: unknown }>(user, `select * from invite_rewards_claim()`)

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
    '0019_feedback.sql',
    '0025_feedback_replies.sql',
    '0030_pokemon_forms.sql',
    '0032_leaderboard_shiny.sql',
    '0033_friends.sql',
    '0034_day_care.sql',
    '0035_events.sql',
    '0037_skip_unchanged_saves.sql',
    '0038_delete_my_data.sql',
    '0039_extreme_realm.sql',
    '0040_lighter_save_writes.sql',
    '0048_message_gifts.sql',
    '0049_invite_rewards.sql',
  ])
    await db.exec(sql(f))
  // Safe to run again.
  await db.exec(sql('0049_invite_rewards.sql'))
  await db.exec(`
    insert into auth.users (id) values ${Object.values(U)
      .map((u) => `('${u}')`)
      .join(',')};
    insert into regions (id, name, order_index, dex_range, starters, league_area_id, next_region) values
      ('kanto', 'Kanto', 1, '[1,151]', '[1,4,7]', '${LEAGUE}', null);
    insert into trainers (id, name, team, role, badge) values ('${T.boulder}', 'Brock', '[]', 'leader', 'Boulder Badge');
    insert into friend_codes (user_id, code) values
      ('${U.ash}', '${CODE.ash}'), ('${U.gary}', '${CODE.gary}'), ('${U.erika}', '${CODE.erika}'),
      ('${U.admin}', '${CODE.admin}');
  `)
  // Ash has played for a while; Brock too (his badge is on his card already).
  await putSave(U.ash, [T.boulder])
  await putSave(U.brock, [T.boulder])
})

afterAll(async () => {
  await db?.close()
})

describe('the switch and the tiers', () => {
  it('ships off, with the game’s default tiers', async () => {
    const [row] = await as<{ value: unknown }>(
      null,
      `select value from game_config where key = 'inviteRewards'`,
    )
    expect(row!.value).toEqual(DEFAULT_CONFIG.inviteRewards)
  })

  it('off: no invite counts, no gauge, nothing to claim', async () => {
    await befriend(U.misty, CODE.ash)
    expect(await record(U.misty, CODE.ash)).toBe('off')
    expect(await status(U.ash)).toBeNull()
    expect(await fails(U.ash, `select * from invite_rewards_claim()`)).toContain('invites_off')
    expect(await fails(null, `select invite_record('${CODE.ash}', 0)`)).toContain('invites_signed_out')
  })

  it('reads the admin’s tiers, leaving out the malformed ones', async () => {
    await setInvites({
      tiers: [
        { friends: 2, gifts: [{ kind: 'gold', amount: 500, region: 'latest' }] },
        { friends: 'x', gifts: [{ kind: 'gold', amount: 1, region: 'latest' }] },
        { friends: 3, gifts: [{ kind: 'gold', amount: 0, region: 'latest' }] },
        { friends: 4, gifts: [] },
        { friends: 100, gifts: [{ kind: 'gold', amount: 1, region: 'latest' }] },
      ],
    })
    const rows = await as<{ friends: number }>(null, `select friends from invite_tiers()`)
    expect(rows.map((r) => r.friends)).toEqual([2])
    // A row without tiers keeps the default ones.
    await db.query(`update game_config set value = '{"access": "off"}' where key = 'inviteRewards'`)
    const back = await as<{ friends: number }>(null, `select friends from invite_tiers() order by friends`)
    expect(back.map((r) => r.friends)).toEqual([1, 2, 3, 4])
  })
})

describe('who counts', () => {
  it('a new player who opened the link counts once, when the switch is on', async () => {
    await setInvites({ access: 'all' })
    expect(await record(U.misty, CODE.ash)).toBe('counted')
    expect(await record(U.misty, CODE.ash)).toBe('already')
    expect(await status(U.ash)).toEqual({ count: 0, pending: 1, claimed: [], latest: null })
  })

  it('not a player with a badge (on their card, or in the game that calls), a stranger, or yourself', async () => {
    await befriend(U.brock, CODE.ash)
    expect(await record(U.brock, CODE.ash)).toBe('not_new')
    await befriend(U.dawn, CODE.gary)
    expect(await record(U.dawn, CODE.gary, 1)).toBe('not_new')
    expect(await record(U.dawn, CODE.ash)).toBe('not_friends')
    expect(await record(U.gary, CODE.gary)).toBe('not_found')
    expect(await record(U.gary, 'ZZZZZZZZ')).toBe('not_found')
  })

  it('two new players can’t each count for the other', async () => {
    await befriend(U.erika, CODE.gary)
    expect(await record(U.erika, CODE.gary)).toBe('counted')
    expect(await record(U.gary, CODE.erika)).toBe('not_new')
  })

  it('the first badge counts when the main save brings it, not before, not an Extreme one', async () => {
    await putSave(U.misty, [])
    expect((await status(U.ash))!.count).toBe(0)
    await putSave(U.erika, [T.boulder], 'extreme')
    expect(await status(U.gary)).toMatchObject({ count: 0, pending: 1 })
    await putSave(U.misty, [T.boulder])
    expect(await status(U.ash)).toEqual({
      count: 1,
      pending: 0,
      claimed: [],
      latest: { name: 'MISTY', avatar: 'red' },
    })
    // Once counted, it stays counted.
    await putSave(U.misty, [])
    expect((await status(U.ash))!.count).toBe(1)
  })
})

describe('claiming', () => {
  it('hands each tier reached over once, with its gifts', async () => {
    const got = await claim(U.ash)
    expect(got).toEqual([{ friends: 1, gifts: DEFAULT_CONFIG.inviteRewards.tiers[0]!.gifts }])
    expect(await claim(U.ash)).toEqual([])
    expect((await status(U.ash))!.claimed).toEqual([1])
    // Nobody of Gary's has a badge yet: nothing for him.
    expect(await claim(U.gary)).toEqual([])
  })

  it('on for the admin only: the admin sees and claims, players don’t (their invites still count)', async () => {
    await setInvites({ access: 'admin' })
    expect(await status(U.ash)).toBeNull()
    expect(await fails(U.ash, `select * from invite_rewards_claim()`)).toContain('invites_off')
    expect(await status(U.admin)).toEqual({ count: 0, pending: 0, claimed: [], latest: null })
    await befriend(U.dawn, CODE.admin)
    expect(await record(U.dawn, CODE.admin)).toBe('counted')
    expect((await status(U.admin))!.pending).toBe(1)
    await setInvites({ access: 'all' })
  })
})

describe('deleting your data', () => {
  it('an invited player’s deletion leaves their inviter’s count; an inviter’s takes their gauge', async () => {
    await as(U.misty, `select delete_my_data()`)
    expect((await status(U.ash))!.count).toBe(1)
    // Misty was invited once: not again.
    await befriend(U.misty, CODE.gary)
    expect(await record(U.misty, CODE.gary)).toBe('already')
    await as(U.ash, `select delete_my_data()`)
    expect(await status(U.ash)).toEqual({ count: 0, pending: 0, claimed: [], latest: null })
  })
})
