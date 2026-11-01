// Migration 0103 against a real Postgres (PGlite, in process): welcome-back gifts (docs/58). The switch (and the gifts'
// switch) gate the claim; days away come from the days the server recorded (player_days), never the device; only the
// highest tier is given, as a developer's message with gifts (0048's, opened through feedback_claim_gifts); the same
// day answers the same and sends nothing more; the cooldown; a guest who signs in on the same device; a player can't
// forge such a message. The engine's rule (engine/welcomeBack.ts) gives the same answer in every case. Supabase's own
// pieces (the auth schema, the anon / authenticated roles) are stood in for at the top, as in gifts-sql.test.ts.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  DEFAULT_CONFIG,
  welcomeBackCooldown,
  welcomeBackNote,
  welcomeBackOutcome,
  welcomeBackTiers,
} from '@/engine'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')

const ADMIN = 'gregoire.ftn@gmail.com'
const U = {
  admin: '00000000-0000-4000-8000-0000000000aa',
  ash: '00000000-0000-4000-8000-000000000001',
  misty: '00000000-0000-4000-8000-000000000002',
  brock: '00000000-0000-4000-8000-000000000003',
  erika: '00000000-0000-4000-8000-000000000004',
  dawn: '00000000-0000-4000-8000-000000000005',
}

let db: PGlite

/** The database's UTC day, moved by `n` days: 'YYYY-MM-DD'. */
let utcToday = ''
const day = (n = 0) => {
  const d = new Date(`${utcToday}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

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

const setAccess = (access: string) =>
  db.query(
    `update game_config set value = value || jsonb_build_object('access', $1::text) where key = 'welcomeBack'`,
    [access],
  )
const setGifts = (access: string) =>
  db.query(`update game_config set value = jsonb_build_object('access', $1::text) where key = 'gifts'`, [
    access,
  ])

/** The days a player played, by their key (an account's id, or 'device:<id>'), as player_ping records them. */
const played = (player: string, ...days: number[]) =>
  db.query(
    `insert into player_days (player, day) select $1, d::date from unnest($2::text[]) d on conflict do nothing`,
    [player, days.map(day)],
  )

type Answer = { day: string; days: number; minDays: number; messageId: number | null; fresh: boolean } | null
const claim = async (user: string | null, device: string, d = day()) =>
  (await as<{ a: Answer }>(user, `select welcome_back_claim($1, $2::date) a`, [device, d]))[0]!.a

type Msg = {
  id: number
  title: string
  reply: string | null
  from_admin: boolean
  gifts: unknown
  gifts_claimed: boolean
}
const inbox = (user: string | null, device: string) =>
  as<Msg>(user, `select * from my_feedback($1)`, [device])

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
    '0019_feedback.sql',
    '0025_feedback_replies.sql',
    '0028_analytics_minimal.sql',
    '0048_message_gifts.sql',
    '0103_welcome_back.sql',
  ])
    await db.exec(sql(f))
  // Safe to run again.
  await db.exec(sql('0103_welcome_back.sql'))
  await db.exec(
    `insert into auth.users (id) values ${Object.values(U)
      .map((u) => `('${u}')`)
      .join(',')}`,
  )
  utcToday = (await db.query<{ d: string }>(`select ((now() at time zone 'UTC')::date)::text d`)).rows[0]!.d
})

afterAll(async () => {
  await db?.close()
})

describe('the switch and the tiers', () => {
  it('ships off, with the game’s defaults, and the server reads the same tiers and cooldown', async () => {
    const [row] = await as<{ value: unknown }>(
      null,
      `select value from game_config where key = 'welcomeBack'`,
    )
    expect(row!.value).toEqual(DEFAULT_CONFIG.welcomeBack)
    const [cfg] = await as<{ c: unknown }>(null, 'select welcome_back_cfg() c')
    expect(cfg!.c).toEqual(DEFAULT_CONFIG.welcomeBack)
    const tiers = await as<{ min_days: number; gifts: unknown }>(null, 'select * from welcome_back_tiers()')
    expect(tiers.map((t) => ({ minDays: t.min_days, gifts: t.gifts }))).toEqual(
      welcomeBackTiers(DEFAULT_CONFIG.welcomeBack),
    )
    const [cool] = await as<{ c: number }>(null, 'select welcome_back_cooldown() c')
    expect(cool!.c).toBe(welcomeBackCooldown(DEFAULT_CONFIG.welcomeBack))
  })

  it('cleans the admin’s tiers as the engine does: odd days, repeats and bad gifts left out', async () => {
    const odd = {
      cooldownDays: 0.4,
      tiers: [
        { minDays: 10, gifts: [{ kind: 'gold', amount: 50, region: 'latest' }] },
        { minDays: 2, gifts: [{ kind: 'item', key: 'potion', qty: 2, region: 'latest' }] },
        { minDays: 10, gifts: [{ kind: 'gold', amount: 99, region: 'latest' }] },
        { minDays: 0, gifts: [{ kind: 'gold', amount: 1, region: 'latest' }] },
        { minDays: 400, gifts: [{ kind: 'gold', amount: 1, region: 'latest' }] },
        { minDays: 5, gifts: [{ kind: 'item', key: 'potion', qty: 0, region: 'latest' }] },
        { minDays: 6, gifts: [] },
        { minDays: '4', gifts: [{ kind: 'gold', amount: 1, region: 'latest' }] },
      ],
    }
    await db.query(`update game_config set value = value || $1::jsonb where key = 'welcomeBack'`, [
      JSON.stringify(odd),
    ])
    const tiers = await as<{ min_days: number; gifts: unknown }>(null, 'select * from welcome_back_tiers()')
    expect(tiers.map((t) => ({ minDays: t.min_days, gifts: t.gifts }))).toEqual(
      welcomeBackTiers(odd as never),
    )
    expect(tiers.map((t) => t.min_days)).toEqual([2, 10])
    const [cool] = await as<{ c: number }>(null, 'select welcome_back_cooldown() c')
    expect(cool!.c).toBe(welcomeBackCooldown(odd as never))
    expect(cool!.c).toBe(1)
    await db.query(`update game_config set value = $1::jsonb where key = 'welcomeBack'`, [
      JSON.stringify(DEFAULT_CONFIG.welcomeBack),
    ])
  })

  it('Off refuses everyone; On for admin only the admin; and the gifts must be on', async () => {
    await played('device:dev-off', -5)
    await played(U.ash, -5)
    await setGifts('all')
    expect(await fails(null, `select welcome_back_claim('dev-off', $1::date)`, [day()])).toContain(
      'welcome_back_off',
    )
    expect(await fails(U.admin, `select welcome_back_claim('dev-adm', $1::date)`, [day()])).toContain(
      'welcome_back_off',
    )
    await setAccess('admin')
    expect(await fails(U.ash, `select welcome_back_claim('dev-ash', $1::date)`, [day()])).toContain(
      'welcome_back_off',
    )
    expect(await fails(null, `select welcome_back_claim('dev-off', $1::date)`, [day()])).toContain(
      'welcome_back_off',
    )
    expect(await claim(U.admin, 'dev-adm')).toBeNull() // no history: nothing, but allowed
    await setAccess('all')
    await setGifts('off')
    expect(await fails(null, `select welcome_back_claim('dev-off', $1::date)`, [day()])).toContain(
      'gifts_off',
    )
    await setGifts('all')
    // Nothing was recorded while it was refused.
    const [n] = await as<{ n: number }>(null, 'select count(*)::int n from welcome_back_claims')
    expect(n!.n).toBe(0)
  })

  it('checks the device id and the day (within a day of UTC, as player_ping)', async () => {
    expect(await fails(null, `select welcome_back_claim('', $1::date)`, [day()])).toContain('bad device id')
    expect(await fails(null, `select welcome_back_claim($1, $2::date)`, ['x'.repeat(65), day()])).toContain(
      'bad device id',
    )
    expect(await fails(null, `select welcome_back_claim('dev-x', $1::date)`, [day(2)])).toContain('bad day')
    expect(await fails(null, `select welcome_back_claim('dev-x', $1::date)`, [day(-2)])).toContain('bad day')
  })
})

describe('days away, the tiers and the message', () => {
  it('nothing for a brand-new player, one who played only today, or back the next day', async () => {
    expect(await claim(null, 'dev-new')).toBeNull()
    await played('device:dev-today', 0)
    expect(await claim(null, 'dev-today')).toBeNull()
    await played('device:dev-daily', -3, -2, -1, 0)
    expect(await claim(null, 'dev-daily')).toBeNull()
    expect(await inbox(null, 'dev-daily')).toEqual([])
  })

  it('the highest tier reached only: 3 → the first, 9 → the 7-day one, 40 → the 14-day one', async () => {
    const cases: [string, number, number][] = [
      ['dev-3', -3, 3],
      ['dev-9', -9, 7],
      ['dev-40', -40, 14],
    ]
    for (const [dev, last, tier] of cases) {
      await played(`device:${dev}`, last - 5, last)
      const a = await claim(null, dev)
      expect(a).toMatchObject({ day: day(), days: -last, minDays: tier, fresh: true })
      const [m] = await inbox(null, dev)
      const expected = welcomeBackTiers(DEFAULT_CONFIG.welcomeBack).find((t) => t.minDays === tier)!
      expect(m).toMatchObject({
        id: a!.messageId,
        title: 'welcome_back',
        from_admin: true,
        gifts_claimed: false,
      })
      expect(m!.gifts).toEqual(expected.gifts)
      expect(welcomeBackNote(m!.reply)).toEqual({ days: -last, minDays: tier, from: 3, cooldown: 14 })
    }
    // In the admin's inbox it is read already (nothing to answer), and it names the device.
    const rows = await as<{ read: boolean; user_id: string | null; device_id: string }>(
      U.admin,
      `select read, user_id, device_id from feedback where title = 'welcome_back' order by id`,
    )
    expect(rows.every((r) => r.read && r.user_id === null && r.device_id.startsWith('dev-'))).toBe(true)
  })

  it('opens like any developer’s gift: once, by the player it is for', async () => {
    const [m] = await inbox(null, 'dev-9')
    expect(
      await as(null, `select * from feedback_claim_gifts($1::bigint[], 'dev-other')`, [[m!.id]]),
    ).toEqual([])
    const got = await as<{ id: number; gifts: unknown }>(
      null,
      `select * from feedback_claim_gifts($1::bigint[], 'dev-9')`,
      [[m!.id]],
    )
    expect(got).toHaveLength(1)
    expect(await as(null, `select * from feedback_claim_gifts($1::bigint[], 'dev-9')`, [[m!.id]])).toEqual([])
  })

  it('asked again the same day: the same answer, no second message (opened or not)', async () => {
    const again = await claim(null, 'dev-9')
    expect(again).toMatchObject({ day: day(), days: 9, minDays: 7, fresh: false })
    expect(await inbox(null, 'dev-9')).toHaveLength(1)
    const third = await claim(null, 'dev-3')
    expect(third).toMatchObject({ days: 3, minDays: 3, fresh: false })
    expect(await inbox(null, 'dev-3')).toHaveLength(1)
  })

  it('a day played after the day asked (the clock or zone moved back) gives nothing', async () => {
    await played('device:dev-clock', -10, 1)
    expect(await claim(null, 'dev-clock')).toBeNull()
  })
})

describe('the cooldown', () => {
  it('nothing until cooldownDays have passed since the last one, then the next return counts', async () => {
    await played('device:dev-cool', -20)
    expect(await claim(null, 'dev-cool')).toMatchObject({ days: 20, minDays: 14, fresh: true })
    // Thirteen days later (the claim moved back in time), away again since 5 days: still cooling down.
    await db.query(`update welcome_back_claims set day = day - 13 where player = 'device:dev-cool'`)
    await db.query(`delete from player_days where player = 'device:dev-cool'`)
    await played('device:dev-cool', -13, -5)
    expect(await claim(null, 'dev-cool')).toBeNull()
    // Fourteen: the 3-day tier.
    await db.query(`update welcome_back_claims set day = day - 1 where player = 'device:dev-cool'`)
    expect(await claim(null, 'dev-cool')).toMatchObject({ days: 5, minDays: 3, fresh: true })
    expect(await inbox(null, 'dev-cool')).toHaveLength(2)
  })

  it('follows the admin’s cooldownDays', async () => {
    await db.query(`update game_config set value = value || '{"cooldownDays": 3}' where key = 'welcomeBack'`)
    await played('device:dev-short', -4)
    expect(await claim(null, 'dev-short')).toMatchObject({ minDays: 3, fresh: true })
    await db.query(`update welcome_back_claims set day = day - 3 where player = 'device:dev-short'`)
    await played('device:dev-short', -3)
    // Three days since the last, away three: a new one.
    expect(await claim(null, 'dev-short')).toMatchObject({ days: 3, fresh: true })
    await db.query(`update game_config set value = value || '{"cooldownDays": 14}' where key = 'welcomeBack'`)
  })
})

describe('guests and accounts', () => {
  it('a signed-in player: their account’s days, the message to their account, seen on every device', async () => {
    await played(U.misty, -8)
    const a = await claim(U.misty, 'phone')
    expect(a).toMatchObject({ days: 8, minDays: 7, fresh: true })
    const [row] = await as<{ user_id: string; device_id: string }>(
      U.admin,
      'select user_id, device_id from feedback where id = $1',
      [a!.messageId],
    )
    expect(row).toEqual({ user_id: U.misty, device_id: 'phone' })
    expect(await inbox(U.misty, 'tablet')).toHaveLength(1)
    // The same return, from the tablet: the same answer, nothing more.
    expect(await claim(U.misty, 'tablet')).toMatchObject({ messageId: a!.messageId, fresh: false })
    expect(await inbox(U.misty, 'tablet')).toHaveLength(1)
    // Not someone else's.
    expect(await inbox(U.brock, 'tablet')).toEqual([])
  })

  it('a guest who signs in on that device: no second gift for the same return, on any device; the message follows', async () => {
    await played('device:dev-guest', -6, 0)
    const g = await claim(null, 'dev-guest')
    expect(g).toMatchObject({ days: 6, minDays: 3, fresh: true })
    // Signed in now (a new account), same device, same day: 0102's ping moves the guest's days into the account.
    await db.query(`update player_days set player = $1 where player = 'device:dev-guest'`, [U.brock])
    const s = await claim(U.brock, 'dev-guest')
    expect(s).toMatchObject({ messageId: g!.messageId, fresh: false })
    // The claim moved into the account, and the message with it: seen from the account's other devices too.
    const rows = await as<{ player: string }>(
      U.admin,
      `select player from welcome_back_claims where player in ($1, 'device:dev-guest')`,
      [U.brock],
    )
    expect(rows).toEqual([{ player: U.brock }])
    expect((await inbox(U.brock, 'dev-guest')).map((m) => m.id)).toEqual([g!.messageId])
    expect((await inbox(U.brock, 'brock-phone')).map((m) => m.id)).toEqual([g!.messageId])
    // The same return asked from that other device: the same answer, no second gift.
    expect(await claim(U.brock, 'brock-phone')).toMatchObject({ messageId: g!.messageId, fresh: false })
    // A later day within the cooldown: still nothing.
    await db.query(`update welcome_back_claims set day = day - 5 where player = $1`, [U.brock])
    expect(await claim(U.brock, 'brock-phone')).toBeNull()
    expect(await inbox(U.brock, 'brock-phone')).toHaveLength(1)
  })

  it('a guest’s claim kept as the account’s only when it is the later one', async () => {
    // The account's own last welcome back was a week ago; its device's guest got one 20 days ago: the account's stays.
    await db.query(
      `insert into welcome_back_claims (player, day, days, min_days) values ($1, $2::date, 9, 7), ('device:dawn-tab', $3::date, 4, 3)`,
      [U.dawn, day(-7), day(-20)],
    )
    expect(await claim(U.dawn, 'dawn-tab')).toBeNull()
    const rows = await as<{ player: string; day: string }>(
      U.admin,
      `select player, day::text from welcome_back_claims where player in ($1, 'device:dawn-tab')`,
      [U.dawn],
    )
    expect(rows).toEqual([{ player: U.dawn, day: day(-7) }])
    await db.query(`delete from welcome_back_claims where player = $1`, [U.dawn])
  })

  it('a guest’s history counts for the account signing in on that device; days played anywhere end an absence', async () => {
    // A new account on a device whose guest played 12 days ago: a 7-day gift, sent to the account.
    await played('device:dev-old', -12)
    const a = await claim(U.erika, 'dev-old')
    expect(a).toMatchObject({ days: 12, minDays: 7, fresh: true })
    // An account that played yesterday on its phone isn't away, however long ago its tablet's guest played.
    await played(U.dawn, -1)
    await played('device:dev-tab', -30)
    expect(await claim(U.dawn, 'dev-tab')).toBeNull()
  })
})

describe('only the server writes it', () => {
  it('a player’s own insert never passes as the developer’s, whatever it sets; the claim does from their call', async () => {
    await played('device:dev-real', -4)
    // The API's own login, as a player's calls come in: neither the session nor the role is the database's.
    await db.exec('set session authorization authenticated')
    try {
      await db.query(`select set_config('pokedice.system_message', 'on', false)`)
      await as(
        U.misty,
        `insert into feedback (device_id, title, message, reply, gifts, from_admin)
         values ('forged', 'welcome_back', 'hi', '@welcome_back:{"days":99}', '[{"kind":"gold","amount":999999,"region":"latest"}]', true)`,
      )
      await db.query(`select set_config('pokedice.system_message', '', false)`)
      // The claim, called the same way: its message goes in.
      const a = await claim(null, 'dev-real')
      expect(a).toMatchObject({ days: 4, minDays: 3, fresh: true })
      await db.exec('set session authorization postgres')
      const [forged] = await as<{
        from_admin: boolean
        gifts: unknown
        reply: string | null
        user_id: string
      }>(U.admin, `select from_admin, gifts, reply, user_id from feedback where device_id = 'forged'`)
      expect(forged).toEqual({ from_admin: false, gifts: null, reply: null, user_id: U.misty })
      const [real] = await as<{ from_admin: boolean; gifts: unknown[] }>(
        U.admin,
        'select from_admin, gifts from feedback where id = $1',
        [a!.messageId],
      )
      expect(real!.from_admin).toBe(true)
      expect(real!.gifts).toHaveLength(4)
    } finally {
      await db.exec('set session authorization postgres')
    }
  })

  it('players can’t read the claims', async () => {
    await db.exec('set session authorization authenticated')
    try {
      expect(await fails(U.ash, 'select * from welcome_back_claims')).toContain('permission denied')
      expect(await fails(U.ash, 'select welcome_back_tiers()')).toContain('permission denied')
    } finally {
      await db.exec('set session authorization postgres')
    }
  })
})

describe('the engine’s rule is the server’s', () => {
  // Each: the days played and the last claim (days from today), then what both say.
  const cases: { played: number[]; claim: number | null }[] = [
    { played: [], claim: null },
    { played: [0], claim: null },
    { played: [-1], claim: null },
    { played: [-2], claim: null },
    { played: [-3], claim: null },
    { played: [-6, -30], claim: null },
    { played: [-7], claim: null },
    { played: [-13], claim: null },
    { played: [-14, 0], claim: null },
    { played: [-100], claim: null },
    { played: [-10, 1], claim: null },
    { played: [-9], claim: -13 },
    { played: [-9], claim: -14 },
    { played: [-20], claim: 0 },
  ]
  it.each(cases.map((c, i) => [i, c] as const))('case %i', async (i, c) => {
    const dev = `dev-parity-${i}`
    await played(`device:${dev}`, ...c.played)
    if (c.claim != null)
      await db.query(
        `insert into welcome_back_claims (player, day, days, min_days) values ($1, $2::date, 3, 3)`,
        [`device:${dev}`, day(c.claim)],
      )
    const server = await claim(null, dev)
    const engine = welcomeBackOutcome(
      { today: day(), played: c.played.map(day), lastClaim: c.claim == null ? null : day(c.claim) },
      welcomeBackTiers(DEFAULT_CONFIG.welcomeBack),
      welcomeBackCooldown(DEFAULT_CONFIG.welcomeBack),
    )
    if (engine.kind === 'send')
      expect(server).toMatchObject({ days: engine.days, minDays: engine.tier.minDays, fresh: true })
    else if (engine.kind === 'same') expect(server).toMatchObject({ fresh: false })
    else expect(server).toBeNull()
  })
})
