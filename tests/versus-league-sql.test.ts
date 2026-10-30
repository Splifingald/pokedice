// Migration 0082 against a real Postgres (PGlite, in process): the weekly Versus league (docs/44). Offers, a match
// recorded as a leave before it's fought and replaced by its checked result, bots seated and hidden as bots from all
// but the admin, the global board (0091), the week's rewards as gift messages, deleting your data, and the bots' new
// teams every week (0092). Supabase's own pieces (the auth schema,
// the anon / authenticated roles) are stood in for at the top, as in friends-sql.test.ts.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { trophyChange, VERSUS_LEAGUE_DEFAULTS, weekBotTeams, type LeagueOutcome } from '@/engine'
import { botsSql, BEGIN, END } from '../scripts/versus-bots'
import { data } from './fixtures'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')
const ADMIN = 'gregoire.ftn@gmail.com'

const U = {
  ash: '00000000-0000-4000-8000-000000000001',
  misty: '00000000-0000-4000-8000-000000000002',
  brock: '00000000-0000-4000-8000-000000000003',
  admin: '00000000-0000-4000-8000-0000000000aa',
}

let db: PGlite

async function as<T = Record<string, unknown>>(
  user: string | null,
  q: string,
  params: unknown[] = [],
): Promise<T[]> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? ''])
  await db.query(`select set_config('request.jwt.claim.email', $1, false)`, [user === U.admin ? ADMIN : ''])
  try {
    return (await db.query<T>(q, params)).rows
  } finally {
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`)
    await db.query(`select set_config('request.jwt.claim.email', '', false)`)
  }
}
/** As the weekly job: signed in with the service role key. */
async function asJob<T = Record<string, unknown>>(q: string, params: unknown[] = []): Promise<T[]> {
  await db.query(`select set_config('request.jwt.claim.role', 'service_role', false)`)
  try {
    return (await db.query<T>(q, params)).rows
  } finally {
    await db.query(`select set_config('request.jwt.claim.role', '', false)`)
  }
}
async function fails(user: string | null, q: string, params: unknown[] = []): Promise<string> {
  try {
    await as(user, q, params)
  } catch (e) {
    return (e as Error).message
  }
  return 'no error'
}
const access = (a: string) =>
  db.query(
    `insert into game_config (key, value) values ('versusLeague', $1) on conflict (key) do update set value = excluded.value`,
    [JSON.stringify({ access: a })],
  )
const team = (dexes: number[]) => JSON.stringify(dexes.map((dex) => ({ dex, level: 50, shiny: false })))
const trophiesOf = async (user: string) =>
  (await db.query<{ t: number }>(`select trophies t from versus_league_members where user_id = $1`, [user]))
    .rows[0]?.t
const home = async (user: string, last = false) =>
  (await as<{ r: Home }>(user, 'select versus_league_home($1) r', [last]))[0]!.r
type Home = {
  joined: boolean
  trophies: number
  pending: number | null
  rows: { id: string; isMe: boolean; name: string; trophies: number; rank: number; bot: boolean | null }[]
}
type Choice = { slot: number; name: string; trophies: number; is_bot: boolean | null }
type AdminBoard = {
  week: string
  groups: {
    n: number
    members: {
      userId: string | null
      botId: number | null
      name: string
      trophies: number
      rank: number
      matches: number
      won: number
      lost: number
      leaves: number
      open: number
      faced: number
    }[]
  }[]
}

/** A match started on slot 1 and backdated, so a win isn't refused as too fast. */
async function startMatch(user: string): Promise<number> {
  await as(user, 'select * from versus_league_choices()')
  const [m] = await as<{ match_id: number }>(user, 'select * from versus_league_start(1)')
  await db.query(`update versus_league_matches set started_at = now() - interval '5 minutes' where id = $1`, [
    m!.match_id,
  ])
  return m!.match_id
}
const moves = (n: number) => JSON.stringify(Array.from({ length: n }, () => ({ t: 'ATTACK' })))

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
    '0044_trades.sql',
    '0045_progress_raids.sql',
    '0046_progress_raids_worlds.sql',
    '0047_trades_admin_read.sql',
    '0048_message_gifts.sql',
    '0049_general_upgrades.sql',
    '0053_push.sql',
    '0064_battle_powers.sql',
    '0082_versus_league.sql',
    '0086_versus_league_admin_board.sql',
    '0091_versus_league_global.sql',
    '0092_versus_bot_weeks.sql',
  ])
    await db.exec(sql(f))
  // Safe to run again.
  await db.exec(sql('0082_versus_league.sql'))
  await db.exec(sql('0086_versus_league_admin_board.sql'))
  await db.exec(sql('0091_versus_league_global.sql'))
  await db.exec(sql('0092_versus_bot_weeks.sql'))
  await db.exec(
    `insert into auth.users (id) values ${Object.values(U)
      .map((u) => `('${u}')`)
      .join(',')};`,
  )
  for (const [u, name, dexes] of [
    [U.ash, 'ASH', [25, 6, 9]],
    [U.misty, 'MISTY', [121, 131, 130]],
    [U.brock, 'BROCK', [95, 76, 141]],
  ] as const) {
    await db.query(`insert into versus_teams (user_id, realm, team) values ($1, 'main', $2)`, [
      u,
      team([...dexes]),
    ])
    await db.query(
      `insert into player_cards (user_id, realm, name, avatar, region, updated_at) values ($1, 'main', $2, 'red', 'kanto', now())`,
      [u, name],
    )
  }
})

describe('the rules, as the engine has them', () => {
  it('keeps the defaults the same as the engine', async () => {
    await access('off')
    const [{ cfg }] = (await db.query<{ cfg: unknown }>('select versus_league_cfg() cfg')).rows as [
      { cfg: unknown },
    ]
    expect(cfg).toEqual(VERSUS_LEAGUE_DEFAULTS)
  })

  it('counts trophies as trophyChange does', async () => {
    const cfg = JSON.stringify(VERSUS_LEAGUE_DEFAULTS)
    for (const outcome of ['won', 'lost', 'left'] as LeagueOutcome[])
      for (const before of [0, 99, 100, 250])
        for (const n of [1, 2, 3]) {
          const standing = outcome === 'won' ? { left: n, foeLeft: 0 } : { left: 0, foeLeft: n }
          const [row] = (
            await db.query<{ d: number }>('select versus_league_change($1, $2, $3, $4, $5) d', [
              outcome,
              standing.left,
              standing.foeLeft,
              before,
              cfg,
            ])
          ).rows
          expect(row!.d, `${outcome} ${n} from ${before}`).toBe(
            trophyChange(outcome, standing, before, VERSUS_LEAGUE_DEFAULTS),
          )
        }
  })

  it('weeks start on Monday, UTC', async () => {
    const [r] = (
      await db.query<{ a: string; b: string }>(
        `select versus_league_week('2026-10-25 23:59:59+00')::text a, versus_league_week('2026-10-26 00:00:00+00')::text b`,
      )
    ).rows
    expect(r).toEqual({ a: '2026-10-19', b: '2026-10-26' })
  })

  it('holds the bots scripts/versus-bots.ts writes', () => {
    const file = sql('0092_versus_bot_weeks.sql')
    expect(file.slice(file.indexOf(BEGIN), file.indexOf(END) + END.length)).toBe(botsSql(data))
  })

  it('has the Raid Ball, thrown in raids alone', async () => {
    const [r] = (await db.query<{ effect: unknown }>(`select effect from items where key = 'raid-ball'`)).rows
    expect(r!.effect).toEqual({ kind: 'ball', bonus: 5, raidOnly: true })
  })
})

describe('the league', () => {
  it('is closed while the switch is off', async () => {
    await access('off')
    expect(await fails(U.ash, 'select * from versus_league_choices()')).toContain('versus_league_off')
    expect(await fails(U.ash, 'select * from versus_league_start(1)')).toContain('versus_league_off')
    await access('admin')
    expect(await fails(U.ash, 'select * from versus_league_choices()')).toContain('versus_league_off')
    await access('all')
  })

  it('offers 3 opponents near your trophies, a bot where no player fits, kept until one is fought', async () => {
    const choices = await as<Choice>(U.ash, 'select * from versus_league_choices()')
    expect(choices.map((c) => c.slot)).toEqual([1, 2, 3])
    expect(choices.map((c) => c.name).sort()).toContain('MISTY')
    expect(choices.map((c) => c.name)).toContain('BROCK')
    // Nobody but the admin is told which one is a bot.
    expect(choices.every((c) => c.is_bot === null)).toBe(true)
    const again = await as<Choice>(U.ash, 'select * from versus_league_choices()')
    expect(again.map((c) => c.name)).toEqual(choices.map((c) => c.name))
  })

  it('records a match as a leave first, then its checked result', async () => {
    await db.query(`update versus_league_members set trophies = 0 where user_id = $1`, [U.ash])
    await as(U.ash, 'select * from versus_league_choices()')
    const [m] = await as<{ match_id: number; seed: number }>(U.ash, 'select * from versus_league_start(1)')
    expect(Number(m!.seed)).toBeGreaterThanOrEqual(0)
    // Joined; under 100 trophies, the leave costs nothing.
    expect(await trophiesOf(U.ash)).toBe(0)
    expect((await home(U.ash)).pending).toBe(Number(m!.match_id))
    // The offers went with the match.
    expect(
      (await db.query(`select 1 from versus_league_choices where user_id = $1`, [U.ash])).rows,
    ).toHaveLength(0)
    // A win this fast can't have been played.
    expect(
      await fails(U.ash, 'select * from versus_league_finish($1, $2, $3, $4, $5)', [
        m!.match_id,
        'won',
        3,
        0,
        moves(12),
      ]),
    ).toContain('versus_league_too_fast')
    await db.query(
      `update versus_league_matches set started_at = now() - interval '5 minutes' where id = $1`,
      [m!.match_id],
    )
    expect(
      await fails(U.ash, 'select * from versus_league_finish($1, $2, $3, $4, $5)', [
        m!.match_id,
        'won',
        3,
        0,
        '[{"t":"USE_ITEM","key":"potion"}]',
      ]),
    ).toContain('versus_league_item')
    expect(
      await fails(U.ash, 'select * from versus_league_finish($1, $2, $3, $4, $5)', [
        m!.match_id,
        'won',
        0,
        0,
        moves(3),
      ]),
    ).toContain('versus_league_bad_result')
    const [r] = await as<{ delta: number; trophies: number }>(
      U.ash,
      'select * from versus_league_finish($1, $2, $3, $4, $5)',
      [m!.match_id, 'won', 3, 0, moves(20)],
    )
    expect(r).toEqual({ delta: 10, trophies: 10 })
    expect(
      await fails(U.ash, 'select * from versus_league_finish($1, $2, $3, $4, $5)', [
        m!.match_id,
        'won',
        3,
        0,
        moves(20),
      ]),
    ).toContain('versus_league_done')
    // Nobody else's match.
    expect(
      await fails(U.misty, 'select * from versus_league_finish($1, $2, $3, $4, $5)', [
        m!.match_id,
        'won',
        3,
        0,
        moves(20),
      ]),
    ).toContain('versus_league_no_match')
  })

  it('takes trophies from 100 on: the opponent’s Pokémon left for a loss, the most for a leave', async () => {
    await db.query(`update versus_league_members set trophies = 120 where user_id = $1`, [U.ash])
    const lost = await startMatch(U.ash)
    expect(await trophiesOf(U.ash)).toBe(110)
    await as(U.ash, 'select * from versus_league_finish($1, $2, $3, $4, $5)', [lost, 'lost', 0, 1, moves(10)])
    expect(await trophiesOf(U.ash)).toBe(117)
    // Left unfinished: the leave stands.
    await startMatch(U.ash)
    expect(await trophiesOf(U.ash)).toBe(107)
    // Below 100 again: protected.
    await startMatch(U.ash)
    expect(await trophiesOf(U.ash)).toBe(97)
    const safe = await startMatch(U.ash)
    expect(await trophiesOf(U.ash)).toBe(97)
    await as(U.ash, 'select * from versus_league_finish($1, $2, $3, $4, $5)', [safe, 'lost', 0, 3, moves(10)])
    expect(await trophiesOf(U.ash)).toBe(97)
  })

  it('seats bots in groups with room, players to everyone but the admin', async () => {
    expect(await fails(U.ash, `select versus_league_admin('seat_bots')`)).toContain('not_admin')
    const [seated] = await as<{ n: number }>(U.admin, `select versus_league_admin('seat_bots') n`)
    expect(seated!.n).toBeGreaterThan(0)
    const mine = await home(U.ash)
    const bots = mine.rows.filter((r) => !r.isMe && !['MISTY', 'BROCK'].includes(r.name))
    expect(bots.length).toBe(VERSUS_LEAGUE_DEFAULTS.botsPerDay)
    expect(mine.rows.every((r) => r.bot === null)).toBe(true)
    // A bot's id looks like a player's.
    expect(bots.every((b) => /^[0-9a-f-]{36}$/.test(b.id))).toBe(true)
    // The admin, in the same group, sees them for what they are.
    await db.query(
      `insert into versus_league_members (week, group_id, user_id)
       select week, group_id, $2 from versus_league_members where user_id = $1`,
      [U.ash, U.admin],
    )
    const seen = (await home(U.admin)).rows
    expect(
      seen
        .filter((r) => r.bot)
        .map((r) => r.name)
        .sort(),
    ).toEqual(bots.map((b) => b.name).sort())
    expect(seen.filter((r) => r.bot === false)).toHaveLength(mine.rows.length - bots.length + 1)
    await db.query(`delete from versus_league_members where user_id = $1`, [U.admin])
    // The bots climb with the tick, never past where they're headed.
    await db.query(
      `update versus_league_members set joined_at = now() - interval '30 days' where bot_id is not null`,
    )
    await as(null, 'select versus_league_tick()')
    // Only the bots sent back 30 days: on a bot day (Wednesday to Friday) the tick seats fresh ones too, at 0.
    const climbed = (
      await db.query<{ t: number; target: number }>(
        `select trophies t, bot_target target from versus_league_members
         where bot_id is not null and joined_at < now() - interval '1 day'`,
      )
    ).rows
    expect(climbed.length).toBeGreaterThan(0)
    // Most of the way, after 30 days out of the 30 and the rest of this week; all of it by Sunday 22:00.
    expect(climbed.every((b) => b.t > b.target / 2 && b.t <= b.target)).toBe(true)
  })

  it('shows the admin every group of the week: players and bots told apart, ranked, with their matches', async () => {
    expect(await fails(U.ash, 'select versus_league_admin_board()')).toContain('not_admin')
    const board = (await as<{ b: AdminBoard }>(U.admin, 'select versus_league_admin_board() b'))[0]!.b
    const wk = (await db.query<{ w: string }>('select versus_league_week()::text w')).rows[0]!.w
    expect(board.week).toBe(wk)
    const seated = (
      await db.query<{ user_id: string | null; bot_id: number | null }>(
        `select user_id, bot_id from versus_league_members where week = $1::date`,
        [wk],
      )
    ).rows
    const members = board.groups.flatMap((g) => g.members)
    expect(members).toHaveLength(seated.length)
    expect(members.filter((m) => m.botId != null)).toHaveLength(seated.filter((r) => r.bot_id != null).length)
    expect(members.filter((m) => m.botId != null).length).toBeGreaterThan(0)
    expect(board.groups.map((g) => g.n)).toEqual([...board.groups.map((g) => g.n)].sort((a, b) => a - b))
    // Each group ranked as its board: ties share a rank.
    for (const g of board.groups)
      for (const m of g.members)
        expect(m.rank).toBe(1 + g.members.filter((o) => o.trophies > m.trophies).length)
    // Ash's matches this week, each one won, lost, left or still being fought.
    const ash = members.find((m) => m.userId === U.ash)!
    expect(ash.name).toBe('ASH')
    const [{ n }] = (
      await db.query<{ n: number }>(
        `select count(*)::int n from versus_league_matches where user_id = $1 and week = $2::date`,
        [U.ash, wk],
      )
    ).rows as [{ n: number }]
    expect(n).toBeGreaterThan(0)
    expect(ash.matches).toBe(n)
    expect(ash.won + ash.lost + ash.leaves + ash.open).toBe(n)
    // How often each was fought adds up to the week's matches.
    expect(members.reduce((sum, m) => sum + m.faced, 0)).toBeLessThanOrEqual(
      members.reduce((sum, m) => sum + m.matches, 0),
    )
    // Last week: its own groups (none were made here).
    const last = (await as<{ b: AdminBoard }>(U.admin, 'select versus_league_admin_board(true) b'))[0]!.b
    expect(last.groups).toEqual([])
  })

  it('ranks every player of every group on the global board: no bots, no banned players, its own switch', async () => {
    const wk = (await db.query<{ w: string }>('select versus_league_week()::text w')).rows[0]!.w
    await db.query(`select versus_league_join($1, $2::date)`, [U.misty, wk])
    // Brock in a group of his own: the board crosses groups.
    const [g] = (
      await db.query<{ id: number }>(
        `insert into versus_league_groups (week, n)
         values ($1::date, (select max(n) + 1 from versus_league_groups where week = $1::date)) returning id`,
        [wk],
      )
    ).rows
    await db.query(`insert into versus_league_members (week, group_id, user_id) values ($1::date, $2, $3)`, [
      wk,
      g!.id,
      U.brock,
    ])
    const set = (user: string, n: number) =>
      db.query(`update versus_league_members set trophies = $2 where user_id = $1`, [user, n])
    await set(U.ash, 150)
    await set(U.misty, 150)
    await set(U.brock, 40)
    const league = (cfg: object) =>
      db.query(
        `insert into game_config (key, value) values ('versusLeague', $1) on conflict (key) do update set value = excluded.value`,
        [JSON.stringify(cfg)],
      )
    type Global = { week: string; rows: { id: string; name: string; rank: number; isMe: boolean }[] }
    const global = async (user: string | null) =>
      (await as<{ r: Global }>(user, 'select versus_league_global() r'))[0]!.r

    // Off until its own switch is on, and only with the league open.
    expect(await fails(U.ash, 'select versus_league_global()')).toContain('versus_league_off')
    await league({ access: 'all', globalAccess: 'admin' })
    expect(await fails(U.ash, 'select versus_league_global()')).toContain('versus_league_off')
    expect((await global(U.admin)).week).toBe(wk)
    await league({ access: 'off', globalAccess: 'all' })
    expect(await fails(U.ash, 'select versus_league_global()')).toContain('versus_league_off')
    await league({ access: 'all', globalAccess: 'all' })

    // The bots seated this week are left out; ties share a rank.
    const bots = (
      await db.query(`select 1 from versus_league_members where week = $1::date and bot_id is not null`, [wk])
    ).rows
    expect(bots.length).toBeGreaterThan(0)
    const mine = await global(U.ash)
    expect(mine.week).toBe(wk)
    expect(mine.rows.map((r) => [r.name, r.rank, r.isMe])).toEqual([
      ['ASH', 1, true],
      ['MISTY', 1, false],
      ['BROCK', 3, false],
    ])
    expect(mine.rows.every((r) => !('bot' in r))).toBe(true)
    // Signed out, the same board, nobody's "you".
    expect((await global(null)).rows.map((r) => [r.name, r.isMe])).toEqual([
      ['ASH', false],
      ['MISTY', false],
      ['BROCK', false],
    ])
    // A player banned from the leaderboard is left out, but for themself.
    await db.query(`insert into leaderboard_bans (user_id) values ($1)`, [U.brock])
    expect((await global(U.ash)).rows.map((r) => r.name)).toEqual(['ASH', 'MISTY'])
    expect((await global(U.brock)).rows.map((r) => r.name)).toEqual(['ASH', 'MISTY', 'BROCK'])

    await db.query(`delete from leaderboard_bans where user_id = $1`, [U.brock])
    await db.query(`delete from versus_league_members where user_id in ($1, $2)`, [U.misty, U.brock])
    await db.query(`delete from versus_league_groups where id = $1`, [g!.id])
    await access('all')
  })

  it('sends the week’s rewards as gift messages: ₽ a trophy, the rank’s Raid Balls and Rare Candies', async () => {
    const wk = (await db.query<{ w: string }>('select versus_league_week()::text w')).rows[0]!.w
    // Ash first, Misty last of three players and no bots: ranks 1 and 3.
    await db.query(`delete from versus_league_members where bot_id is not null`)
    await db.query(`select versus_league_join($1, $2::date)`, [U.misty, wk])
    await db.query(`select versus_league_join($1, $2::date)`, [U.brock, wk])
    await db.query(`update versus_league_members set trophies = 500 where user_id = $1`, [U.ash])
    await db.query(`update versus_league_members set trophies = 0 where user_id = $1`, [U.misty])
    await db.query(`update versus_league_members set trophies = 40 where user_id = $1`, [U.brock])
    await db.query(`select versus_league_close_week($1::date)`, [wk])
    const msgs = (
      await db.query<{ user_id: string; title: string; reply: string; gifts: unknown; from_admin: boolean }>(
        `select user_id, title, reply, gifts, from_admin from feedback order by user_id`,
      )
    ).rows
    const ash = msgs.find((m) => m.user_id === U.ash)!
    expect(ash.from_admin).toBe(true)
    expect(ash.title).toBe('versus_league')
    expect(JSON.parse(ash.reply.replace('@versus_league:', ''))).toMatchObject({
      week: wk,
      rank: 1,
      trophies: 500,
    })
    expect(ash.gifts).toEqual([
      { kind: 'gold', amount: 500, region: 'current' },
      { kind: 'item', key: 'raid-ball', qty: 5, region: 'current' },
      { kind: 'item', key: 'rare-candy', qty: 10, region: 'current' },
    ])
    // Misty: 0 trophies, but 3rd.
    expect(msgs.find((m) => m.user_id === U.misty)!.gifts).toEqual([
      { kind: 'item', key: 'raid-ball', qty: 1, region: 'current' },
      { kind: 'item', key: 'rare-candy', qty: 3, region: 'current' },
    ])
    // Once only; and a closed week's matches can't be finished.
    await db.query(`select versus_league_close_week($1::date)`, [wk])
    expect((await db.query('select 1 from feedback')).rows).toHaveLength(3)
    const pending = (
      await db.query<{ id: number }>(`select id from versus_league_matches where finished_at is null limit 1`)
    ).rows[0]!
    expect(
      await fails(U.ash, 'select * from versus_league_finish($1, $2, $3, $4, $5)', [
        pending.id,
        'lost',
        0,
        1,
        moves(1),
      ]),
    ).toContain('versus_league_week_over')
  })

  it('never lets a player write a gift message themselves', async () => {
    expect(
      await fails(
        U.brock,
        `insert into feedback (user_id, device_id, title, message, from_admin, reply, gifts) values ($1, 'd', 't', 'm', true, 'x', '[{"kind":"gold","amount":5,"region":"current"}]')`,
        [U.brock],
      ),
    ).toBe('no error')
    const [row] = (
      await db.query<{ from_admin: boolean; gifts: unknown }>(
        `select from_admin, gifts from feedback where title = 't'`,
      )
    ).rows
    expect(row).toEqual({ from_admin: false, gifts: null })
  })

  it('deletes your league rows with your data', async () => {
    await as(U.ash, 'select delete_my_data()')
    for (const t of ['versus_league_members', 'versus_league_matches', 'versus_league_choices'])
      expect((await db.query(`select 1 from ${t} where user_id = $1`, [U.ash])).rows, t).toHaveLength(0)
  })
})

describe('the bots’ teams, a new set every week (0092)', () => {
  type BotSet = { week: string; set: string | null; tiers: number[]; due: boolean }
  const botSet = async () => (await asJob<{ s: BotSet }>('select versus_league_bot_set() s'))[0]!.s
  const put = (week: string, teams: unknown) =>
    asJob<{ n: number }>('select versus_league_put_bot_teams($1::date, $2::jsonb) n', [
      week,
      JSON.stringify(teams),
    ])
  let week = ''
  let teams: ReturnType<typeof weekBotTeams> = []

  beforeAll(async () => {
    week = (await db.query<{ w: string }>('select versus_league_week()::text w')).rows[0]!.w
    teams = weekBotTeams(data, week)
  })

  it('are made by the job or the admin alone', async () => {
    expect(await fails(U.misty, 'select versus_league_bot_set()')).toContain('not_admin')
    expect(await fails(U.misty, `select versus_league_put_bot_teams($1::date, '[]')`, [week])).toContain(
      'not_admin',
    )
    expect(await fails(null, 'select versus_league_bot_set()')).toContain('not_admin')
    expect((await as<{ s: BotSet }>(U.admin, 'select versus_league_bot_set() s'))[0]!.s.week).toBe(week)
  })

  it('come from the built-in set (80 from 500 trophies) until the week has its own, needed while the league is on', async () => {
    await access('all')
    expect(await botSet()).toMatchObject({ week, set: null, tiers: [40, 40, 40, 80], due: true })
    await access('off')
    expect((await botSet()).due).toBe(false)
    await access('all')
  })

  it('stores a week’s set once, whole and on a Monday', async () => {
    expect(await fails(null, `select versus_league_put_bot_teams('2026-10-27', '[]')`)).toContain('not_admin')
    const job = (q: string, params: unknown[]) =>
      asJob(q, params).then(
        () => 'no error',
        (e: Error) => e.message,
      )
    const q = 'select versus_league_put_bot_teams($1::date, $2::jsonb)'
    const day = new Date(Date.parse(week) + 86_400_000).toISOString().slice(0, 10)
    expect(await job(q, [day, JSON.stringify(teams)])).toContain('bad_week')
    expect(await job(q, [week, JSON.stringify(teams.filter((t) => t.tier < 3))])).toContain('bad_teams')
    expect(await job(q, [week, JSON.stringify([{ ...teams[0], team: [] }, ...teams])])).toContain('bad_teams')
    expect((await put(week, teams))[0]!.n).toBe(200)
    // Made already: kept as it is, so the bots seated with it keep their teams.
    expect((await put(week, teams.slice().reverse()))[0]!.n).toBe(0)
    expect(await botSet()).toMatchObject({ week, set: week, tiers: [40, 40, 40, 80], due: false })
  })

  it('give the bots seated and offered from then on their teams', async () => {
    const last = (await db.query<{ n: number }>('select max(id)::int n from versus_league_members')).rows[0]!
      .n
    const [seated] = await as<{ n: number }>(U.admin, `select versus_league_admin('seat_bots') n`)
    expect(seated!.n).toBeGreaterThan(0)
    const fresh = (
      await db.query<{ week: string | null }>(
        `select t.week::text week from versus_league_members m join versus_league_bot_teams t on t.id = m.bot_team
         where m.id > $1`,
        [last],
      )
    ).rows
    expect(fresh.length).toBe(seated!.n)
    expect(fresh.every((r) => r.week === week)).toBe(true)
    // Far above everyone, Misty is offered bots made for 500 trophies and more: their teams are the week's.
    await db.query(`delete from versus_league_members where user_id = $1`, [U.misty])
    await db.query(
      `insert into versus_league_members (week, group_id, user_id, trophies)
       select week, group_id, $1, 5000 from versus_league_members where week = $2::date limit 1`,
      [U.misty, week],
    )
    await db.query(`delete from versus_league_choices where user_id = $1`, [U.misty])
    const offered = await as<{ team: unknown }>(U.misty, 'select * from versus_league_choices()')
    const top = teams.filter((t) => t.tier === 3).map((t) => t.team)
    expect(offered).toHaveLength(3)
    for (const o of offered) expect(top).toContainEqual(o.team)
  })

  it('serve the next weeks until they have their own, and go a month on unless a bot was seated with them', async () => {
    const plus = async (days: number) =>
      (await db.query<{ d: string }>('select ($1::date + $2::int)::text d', [week, days])).rows[0]!.d
    const setOf = async (w: string) =>
      (await db.query<{ s: string | null }>('select versus_league_team_set($1::date)::text s', [w])).rows[0]!
        .s
    expect(await setOf(await plus(14))).toBe(week)
    expect(await setOf(await plus(-7))).toBeNull()
    const old = await plus(-35)
    expect((await put(old, teams))[0]!.n).toBe(200)
    await db.query(
      `update versus_league_members set bot_team = (select min(id) from versus_league_bot_teams where week = $1::date)
       where id = (select min(id) from versus_league_members where bot_id is not null)`,
      [old],
    )
    expect((await put(await plus(7), teams))[0]!.n).toBe(200)
    const left = (
      await db.query<{ w: string; n: number }>(
        `select week::text w, count(*)::int n from versus_league_bot_teams where week is not null group by week order by week`,
      )
    ).rows
    expect(left).toEqual([
      { w: old, n: 1 },
      { w: week, n: 200 },
      { w: await plus(7), n: 200 },
    ])
  })
})
