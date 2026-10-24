// Migration 0072 against a real Postgres (PGlite, in process): recurring live events (docs/20 §9). The server's
// live_run_at finds the same run as the engine's liveRuns at every moment (yearly, weekly, some weeks of the month, the
// last one, over midnight, a run ended early), and ug_live() answers with a recurring Underground's run, its own id.
// Supabase's own pieces (the auth schema, the roles) are stood in for at the top, as in underground-sql.test.ts.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveRuns, newLiveEvent, type LiveEvent } from '@/engine'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')
const ASH = '00000000-0000-4000-8000-000000000001'
const H = 3_600_000

let db: PGlite

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
    '0053_push.sql',
    '0063_underground.sql',
    '0070_underground_solo_sell.sql',
    '0072_live_recurring.sql',
  ])
    await db.exec(sql(f))
  // Safe to run again.
  await db.exec(sql('0072_live_recurring.sql'))
  await db.exec(`insert into auth.users (id) values ('${ASH}')`)
})

afterAll(async () => {
  await db.close()
})

/** The run the server finds on at `t`, or null. */
async function serverRun(e: LiveEvent, t: number): Promise<string | null> {
  const rows = (
    await db.query<{ run: string }>(`select run from live_run_at($1::jsonb, $2::timestamptz)`, [
      JSON.stringify(e),
      new Date(t).toISOString(),
    ])
  ).rows
  return rows[0]?.run ?? null
}
const engineRun = (e: LiveEvent, t: number) => liveRuns(e, t, t + 1)[0]?.id ?? null

const base = (over: Partial<LiveEvent>): LiveEvent => ({
  ...newLiveEvent('r', '2026-10-01T00:00:00.000Z', '2026-10-02T00:00:00.000Z'),
  ...over,
})

describe('live_run_at', () => {
  const rules: LiveEvent[] = [
    base({}),
    base({ repeat: { kind: 'yearly', month: 10, day: 31, time: '18:00', hours: 72 } }),
    base({ repeat: { kind: 'weekly', weekday: 6, weeks: [], time: '20:00', hours: 6 } }),
    base({ repeat: { kind: 'weekly', weekday: 6, weeks: [1, 3], time: '20:00', hours: 6 } }),
    base({ repeat: { kind: 'weekly', weekday: 5, weeks: [2, 'last'], time: '23:30', hours: 168 } }),
    base({
      repeat: { kind: 'weekly', weekday: 0, weeks: [], time: '09:15', hours: 3 },
      stops: { '2026-11-08': '2026-11-08T10:00:00.000Z' },
    }),
  ]

  it('finds the run the engine finds, at every moment of three months', async () => {
    const from = Date.parse('2026-10-01T00:00:00Z')
    const to = Date.parse('2027-01-01T00:00:00Z')
    for (const e of rules)
      for (let t = from; t < to; t += 5 * H + 7 * 60_000)
        expect([e.repeat?.kind, new Date(t).toISOString(), await serverRun(e, t)]).toEqual([
          e.repeat?.kind,
          new Date(t).toISOString(),
          engineRun(e, t),
        ])
  })

  it('a run’s first minute is in, its end is out', async () => {
    const e = rules[1]!
    expect(await serverRun(e, Date.parse('2026-10-31T17:59:59Z'))).toBeNull()
    expect(await serverRun(e, Date.parse('2026-10-31T18:00:00Z'))).toBe('r@2026-10-31')
    expect(await serverRun(e, Date.parse('2026-11-03T17:59:59Z'))).toBe('r@2026-10-31')
    expect(await serverRun(e, Date.parse('2026-11-03T18:00:00Z'))).toBeNull()
  })
})

describe('ug_live', () => {
  it('answers with a recurring Underground’s run on now', async () => {
    const start = new Date(Date.now() - H)
    const ev = base({
      id: 'ug1',
      type: 'underground',
      repeat: {
        kind: 'weekly',
        weekday: start.getUTCDay(),
        weeks: [],
        time: start.toISOString().slice(11, 16),
        hours: 4,
      },
    })
    await db.query(
      `insert into game_config (key, value) values ('liveEvents', $1::jsonb) on conflict (key) do update set value = excluded.value`,
      [JSON.stringify({ access: 'all', list: [ev] })],
    )
    await db.query(
      `update game_config set value = value || '{"access":"all"}'::jsonb where key = 'underground'`,
    )
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [ASH])
    const run = `ug1@${start.toISOString().slice(0, 10)}`
    expect((await db.query<{ r: string }>(`select ug_live() as r`)).rows[0]!.r).toBe(run)
    expect((await db.query<{ r: { event: string } }>(`select ug_team() as r`)).rows[0]!.r.event).toBe(run)
    // Ended early: no Underground now.
    await db.query(
      `update game_config set value = jsonb_set(value, '{list,0,stops}', $1::jsonb) where key = 'liveEvents'`,
      [JSON.stringify({ [start.toISOString().slice(0, 10)]: new Date(Date.now() - 60_000).toISOString() })],
    )
    expect((await db.query<{ r: string | null }>(`select ug_live() as r`)).rows[0]!.r).toBeNull()
  })
})
