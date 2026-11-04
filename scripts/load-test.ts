/**
 * pnpm load-test — how many players at once the server holds (docs/66 §3).
 *
 *   pnpm load-test setup [--accounts 20]   makes the test accounts (loadtest-NN@pokedice-load.test) and their saves
 *   pnpm load-test run [options]           plays the game's requests for more and more players, step by step
 *   pnpm load-test cleanup                 deletes the test accounts and everything they wrote
 *
 * `run` sends what that many players send per hour of play (scripts/load-test/plan.ts: MIX), at random moments, each
 * from one of the test accounts, and measures every answer. It goes up step by step (--start, ×--factor, up to --max,
 * --step seconds each) and stops at the first step whose p95 goes over --p95 ms or whose errors go over --errors. The
 * last step that held is the answer: players playing at the same moment.
 *
 * Settings, from .env.local or the environment:
 *   LOAD_TEST_SUPABASE_URL / LOAD_TEST_ANON_KEY   the project to test (default: the game's VITE_SUPABASE_URL / _ANON_KEY)
 *   LOAD_TEST_SERVICE_KEY                         setup and cleanup only (or SUPABASE_SERVICE_ROLE_KEY)
 * Against the live game it asks for --production, keeps --max at 3000 or under, and should run at a quiet hour: it
 * does slow the game down for real players while it pushes, until it stops.
 */
import { randomBytes } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { BUNDLE } from '../src/config/bundle'
import { TABLES } from '../src/config/mapping'
import { compileGameData, newSave } from '../src/engine'
import { loadEnv } from './discord/env'
import {
  DEFAULT_LIMITS,
  MIX,
  nextGapMs,
  ratePerSecond,
  steps,
  summarize,
  verdict,
  type RequestKind,
  type Sample,
  type StepStats,
} from './load-test/plan'

const DOMAIN = 'pokedice-load.test'
const emailOf = (i: number) => `loadtest-${String(i + 1).padStart(2, '0')}@${DOMAIN}`
const PRODUCTION_MAX = 3000

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const num = (name: string, fallback: number) => {
  const v = Number(flag(name))
  return Number.isFinite(v) && v > 0 ? v : fallback
}

async function settings() {
  const env = await loadEnv()
  const live = env.VITE_SUPABASE_URL?.trim() ?? ''
  const url = env.LOAD_TEST_SUPABASE_URL?.trim() || live
  const anon = env.LOAD_TEST_ANON_KEY?.trim() || env.VITE_SUPABASE_ANON_KEY?.trim() || ''
  const service = env.LOAD_TEST_SERVICE_KEY?.trim() || env.SUPABASE_SERVICE_ROLE_KEY?.trim() || ''
  if (!url || !anon)
    throw new Error('No project: set LOAD_TEST_SUPABASE_URL and LOAD_TEST_ANON_KEY (or the VITE_ pair).')
  const production = !!live && new URL(url).host === new URL(live).host
  if (production && !process.argv.includes('--production'))
    throw new Error(`${url} is the live game. Add --production to test it (at a quiet hour).`)
  return { url, anon, service, production }
}

const admin = (url: string, service: string) => {
  if (!service) throw new Error('Set LOAD_TEST_SERVICE_KEY (the project’s service role / secret key).')
  return createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
}

/** The test accounts that exist, by email. */
async function listAccounts(db: SupabaseClient): Promise<{ id: string; email: string }[]> {
  const out: { id: string; email: string }[] = []
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    for (const u of data.users) if (u.email?.endsWith(`@${DOMAIN}`)) out.push({ id: u.id, email: u.email })
    if (data.users.length < 1000) return out
  }
}

/** A new game's save, its Box filled up to the size of a played one (~80 kB of JSON, the live average). */
let gameData: ReturnType<typeof compileGameData> | null = null
function testSave(i: number, now: number) {
  const data = (gameData ??= compileGameData(BUNDLE))
  let n = 0
  const id = () => `lt${i}-${n++}`
  const save = newSave(1, data, now, id, { name: `LOADTEST ${i + 1}`, character: 'red' })
  const first = save.box[0]!
  const box = Array.from({ length: 220 }, (_, k) => ({ ...first, id: id(), dex: (k % 151) + 1 }))
  return { ...save, box: [first, ...box] }
}

async function setup() {
  const { url, service } = await settings()
  const db = admin(url, service)
  const want = num('accounts', 20)
  const have = new Set((await listAccounts(db)).map((a) => a.email))
  for (let i = 0; i < want; i++) {
    const email = emailOf(i)
    if (have.has(email)) continue
    const { data, error } = await db.auth.admin.createUser({
      email,
      email_confirm: true,
      password: randomBytes(24).toString('hex'),
      app_metadata: { load_test: true },
    })
    if (error) throw error
    const now = Date.now()
    const { error: saveError } = await db
      .from('saves')
      .insert({ user_id: data.user.id, data: testSave(i, now), updated_at: new Date(now).toISOString() })
    if (saveError) throw saveError
    console.log(`+ ${email}`)
  }
  console.log(`✓ ${want} test accounts ready`)
}

async function cleanup() {
  const { url, service } = await settings()
  const db = admin(url, service)
  const accounts = await listAccounts(db)
  // Their saves, cards, Versus teams… go with them (on delete cascade).
  for (const a of accounts) {
    const { error } = await db.auth.admin.deleteUser(a.id)
    if (error) throw error
  }
  console.log(`✓ ${accounts.length} test accounts deleted`)
}

interface Player {
  id: string
  client: SupabaseClient
  save: ReturnType<typeof testSave>
  device: string
}

/** Signs each test account in (a magic link verified on the spot: no email is sent) and reads its save. */
async function signIn(url: string, anon: string, service: string): Promise<Player[]> {
  const db = admin(url, service)
  const accounts = await listAccounts(db)
  if (!accounts.length) throw new Error('No test accounts: run `pnpm load-test setup` first.')
  return Promise.all(
    accounts.map(async (a, i) => {
      const { data: link, error } = await db.auth.admin.generateLink({ type: 'magiclink', email: a.email })
      if (error) throw error
      const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
      const { error: otpError } = await client.auth.verifyOtp({
        token_hash: link.properties.hashed_token,
        type: 'magiclink',
      })
      if (otpError) throw otpError
      const { data: row } = await client.from('saves').select('data').eq('user_id', a.id).maybeSingle()
      const save = (row?.data as Player['save'] | undefined) ?? testSave(i, Date.now())
      return { id: a.id, client, save, device: `loadtest-${i}` }
    }),
  )
}

/** One request of a kind, as the game sends it. Resolves when the answer is in; throws on an error. */
async function send(kind: RequestKind, p: Player): Promise<void> {
  const c = p.client
  const check = <T extends { error: unknown }>(r: T) => {
    if (r.error) throw r.error
    return r
  }
  switch (kind) {
    case 'event_time':
      return void check(await c.rpc('event_time'))
    case 'friend_status':
      return void check(await c.rpc('friend_status', {}))
    case 'invite_status':
      return void check(await c.rpc('invite_status'))
    case 'my_feedback':
      return void check(await c.rpc('my_feedback', { p_device_id: p.device }))
    case 'trade_mine':
      return void check(await c.rpc('trade_mine'))
    case 'app_signals':
      return void check(await c.from('app_signals').select('at').eq('id', 'reload').maybeSingle())
    case 'config_version':
      return void check(await c.from('game_config').select('value').eq('key', 'configVersion').maybeSingle())
    case 'save_stamp':
      return void check(
        await c.from('saves').select('updated_at').eq('user_id', p.id).eq('realm', 'main').maybeSingle(),
      )
    case 'save_write': {
      // A change, as a real upload carries one: an unchanged save is skipped by the database (0037).
      const now = Date.now()
      p.save = { ...p.save, updatedAt: now, gold: (p.save.gold ?? 0) + 1 }
      return void check(
        await c
          .from('saves')
          .update({ data: p.save, updated_at: new Date(now).toISOString() })
          .eq('user_id', p.id)
          .eq('realm', 'main'),
      )
    }
    case 'versus_board':
      return void check(await c.rpc('versus_board', {}))
    case 'leaderboard':
      return void check(await c.rpc('leaderboard', {}))
    case 'content':
      // As src/config/remote.ts reads it: every table, 1000 rows a page.
      await Promise.all(
        TABLES.map(async (t) => {
          for (let from = 0; ; from += 1000) {
            const { data } = check(
              await c
                .from(t)
                .select('*')
                .range(from, from + 999),
            )
            if (!data || data.length < 1000) break
          }
        }),
      )
  }
}

/** Plays `players` players for `seconds`, and gives back every answer's time. */
async function playStep(roster: Player[], players: number, seconds: number): Promise<Sample[]> {
  const samples: Sample[] = []
  const pending: Promise<void>[] = []
  const end = Date.now() + seconds * 1000
  const loops = MIX.map(async ({ kind, perHour }) => {
    for (;;) {
      await new Promise((r) => setTimeout(r, nextGapMs(perHour, players, Math.random())))
      if (Date.now() >= end) return
      const p = roster[Math.floor(Math.random() * roster.length)]!
      const t0 = performance.now()
      pending.push(
        send(kind, p).then(
          () => void samples.push({ kind, ms: performance.now() - t0, ok: true }),
          (err) => {
            samples.push({ kind, ms: performance.now() - t0, ok: false })
            if (samples.filter((s) => !s.ok).length <= 3) console.warn(`  ! ${kind}:`, err?.message ?? err)
          },
        ),
      )
    }
  })
  await Promise.all(loops)
  await Promise.all(pending)
  return samples
}

const row = (s: StepStats, v: string) =>
  [
    String(s.players).padStart(6),
    s.perSecond.toFixed(1).padStart(7),
    String(Math.round(s.p50)).padStart(6),
    String(Math.round(s.p95)).padStart(6),
    String(Math.round(s.p99)).padStart(6),
    `${(s.errorRate * 100).toFixed(1)}%`.padStart(7),
    `  ${v}${s.slowest ? `  (slowest: ${s.slowest.kind} p95 ${Math.round(s.slowest.p95)} ms)` : ''}`,
  ].join('')

async function run() {
  const { url, anon, service, production } = await settings()
  let max = num('max', 1000)
  if (production && max > PRODUCTION_MAX) {
    console.warn(`--max ${max} lowered to ${PRODUCTION_MAX} on the live game.`)
    max = PRODUCTION_MAX
  }
  const plan = steps(num('start', 50), num('factor', 1.5), max)
  const seconds = num('step', 60)
  const limits = {
    p95Ms: num('p95', DEFAULT_LIMITS.p95Ms),
    errorRate: num('errors', DEFAULT_LIMITS.errorRate),
  }
  console.log(`Target ${url}${production ? ' (LIVE GAME)' : ''}`)
  console.log(
    `Steps ${plan.join(' → ')} players, ${seconds} s each; stops at p95 > ${limits.p95Ms} ms or errors > ${limits.errorRate * 100} %`,
  )
  console.log(
    `(${ratePerSecond(1).toFixed(4)} requests/s per player; ${ratePerSecond(max).toFixed(1)}/s at the top)\n`,
  )
  const roster = await signIn(url, anon, service)
  console.log(`${roster.length} test accounts signed in\n`)
  console.log('players  req/s   p50    p95    p99  errors')
  let held: StepStats | null = null
  for (const players of plan) {
    const s = summarize(players, await playStep(roster, players, seconds), seconds)
    const v = verdict(s, limits)
    console.log(row(s, v === 'ok' ? 'ok' : v === 'slow' ? 'TOO SLOW' : 'TOO MANY ERRORS'))
    if (v !== 'ok') break
    held = s
  }
  console.log(
    held
      ? `\n→ Held ${held.players} players at once (p95 ${Math.round(held.p95)} ms).` +
          (held.players === max ? ' That was --max: raise it to look further.' : '')
      : '\n→ The first step already failed: start lower (--start).',
  )
  console.log('Then: `pnpm load-test cleanup` once you are done with the test accounts.')
}

const command = process.argv[2]
const commands: Record<string, () => Promise<void>> = { setup, run, cleanup }
if (!command || !commands[command]) {
  console.error('Usage: pnpm load-test <setup|run|cleanup> [options] — see scripts/load-test.ts')
  process.exit(1)
}
commands[command]!().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
