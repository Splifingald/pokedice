// Ko-fi (docs/23 §11): migration 0071 against a real Postgres (PGlite, in process) — the PayPal link becomes the Ko-fi
// one, the payments stay the webhook's, and kofi_totals counts the month and the memberships renewing — and the
// webhook's parser. seed.sql carries the migration, inlined.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '@/engine'
import { parseKofi } from '../netlify/kofi/payment'

const ROOT = path.join(__dirname, '..', 'supabase')
const FILE = '0071_kofi.sql'
const sql = readFileSync(path.join(ROOT, 'migrations', FILE), 'utf8')
const ADMIN = '00000000-0000-4000-8000-000000000009'
const ASH = '00000000-0000-4000-8000-000000000001'

describe('0071: Ko-fi', () => {
  let db: PGlite
  const value = async (key: string) =>
    (await db.query<{ v: unknown }>('select value v from game_config where key = $1', [key])).rows[0]?.v
  const pay = (id: string, amount: number, paidAt: string, opts: { sub?: string; currency?: string } = {}) =>
    db.query(
      `insert into kofi_payments (transaction_id, kind, amount, currency, paid_at, subscription, supporter)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [id, opts.sub ? 'Subscription' : 'Donation', amount, opts.currency ?? 'EUR', paidAt, !!opts.sub, opts.sub ?? null],
    )
  const totals = async (now: string) =>
    (
      await db.query<{ currency: string; this_month: string; supporters: number; next_month: string }>(
        'select * from kofi_totals($1)',
        [now],
      )
    ).rows.map((r) => ({ ...r, this_month: Number(r.this_month), next_month: Number(r.next_month) }))
  const as = async (user: string | null, q: string) => {
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? ''])
    await db.query(`set role ${user ? 'authenticated' : 'anon'}`)
    try {
      return (await db.query(q)).rows
    } finally {
      await db.query('reset role')
    }
  }

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      create role anon; create role authenticated;
      create table game_config (key text primary key, value jsonb not null);
      grant select on game_config to anon, authenticated;
      create function is_admin() returns boolean language sql stable as $$
        select current_setting('request.jwt.claim.sub', true) = '${ADMIN}' $$;
      insert into game_config (key, value) values
        ('configVersion', '41'),
        ('donation', '{"round": 1, "enabled": true, "paypalUrl": "https://paypal.me/GregoireFontaine"}');
    `)
    await db.exec(sql)
  })
  beforeEach(() => db.exec('delete from kofi_payments'))

  it('swaps the PayPal link for Ko-fi, with the game default goal and currency, and bumps the content version', async () => {
    expect(await value('donation')).toEqual({
      round: 1,
      enabled: true,
      kofiUrl: 'https://ko-fi.com/gregoirefontaine',
      monthlyGoal: DEFAULT_CONFIG.donation.monthlyGoal,
      currency: DEFAULT_CONFIG.donation.currency,
    })
    expect(await value('configVersion')).toBe(42)
  })

  it("keeps the admin's own link, goal and currency when run again", async () => {
    await db.exec(`update game_config set value = value || '{"kofiUrl": "https://ko-fi.com/other", "monthlyGoal": 80, "currency": "USD"}' where key = 'donation'`)
    await db.exec(sql)
    expect(await value('donation')).toMatchObject({ kofiUrl: 'https://ko-fi.com/other', monthlyGoal: 80, currency: 'USD' })
  })

  it("counts this month's payments, and next month's memberships that renew", async () => {
    await pay('a', 5, '2026-10-02T10:00:00Z')
    await pay('b', 3, '2026-10-20T10:00:00Z', { sub: 'misty' })
    await pay('c', 3, '2026-09-20T10:00:00Z', { sub: 'misty' })
    // Paid in September only: renews on 25 October, inside 35 days, so next month counts it.
    await pay('d', 10, '2026-09-25T10:00:00Z', { sub: 'brock' })
    // Its last month was in August: cancelled.
    await pay('e', 7, '2026-08-01T10:00:00Z', { sub: 'gary' })
    await pay('f', 4, '2026-10-21T10:00:00Z', { currency: 'USD' })
    expect(await totals('2026-10-23T08:00:00Z')).toEqual([
      { currency: 'EUR', this_month: 8, supporters: 2, next_month: 13 },
      { currency: 'USD', this_month: 4, supporters: 1, next_month: 0 },
    ])
  })

  it('reads nothing before any payment', async () => {
    expect(await totals('2026-10-23T08:00:00Z')).toEqual([])
  })

  it('lets anyone read the totals, only the admin the payments', async () => {
    await pay('a', 5, '2026-10-02T10:00:00Z')
    expect(await as(null, 'select count(*)::int n from kofi_totals()')).toEqual([{ n: 1 }])
    await expect(as(null, 'select * from kofi_payments')).rejects.toThrow(/permission denied/)
    expect(await as(ASH, 'select * from kofi_payments')).toEqual([])
    expect(await as(ADMIN, 'select transaction_id from kofi_payments')).toEqual([{ transaction_id: 'a' }])
    await expect(as(ADMIN, `insert into kofi_payments (transaction_id, kind, amount, currency, paid_at) values ('x', 'Donation', 1, 'EUR', now())`)).rejects.toThrow(/permission denied/)
  })
})

describe("Ko-fi's webhook", () => {
  const body = (data: Record<string, unknown>) => new URLSearchParams({ data: JSON.stringify(data) }).toString()
  const payment = {
    verification_token: 'tok',
    kofi_transaction_id: 'tx-1',
    timestamp: '2026-10-23T08:00:00Z',
    type: 'Subscription',
    amount: '3.00',
    currency: 'eur',
    email: ' Ash@Example.com ',
    is_subscription_payment: true,
    tier_name: 'Pokéfan',
  }

  it('keeps the payment, the e-mail only as a hash', () => {
    const r = parseKofi(body(payment), 'tok')
    expect(r).toEqual({
      ok: true,
      row: {
        transaction_id: 'tx-1',
        kind: 'Subscription',
        amount: 3,
        currency: 'EUR',
        paid_at: '2026-10-23T08:00:00.000Z',
        subscription: true,
        supporter: expect.stringMatching(/^[0-9a-f]{64}$/),
        tier: 'Pokéfan',
      },
    })
    const again = parseKofi(body({ ...payment, email: 'ash@example.com' }), 'tok')
    expect(again.ok && r.ok && again.row.supporter === r.row.supporter).toBe(true)
  })

  it('refuses a wrong token and a body without data', () => {
    expect(parseKofi(body(payment), 'other')).toMatchObject({ ok: false, status: 401 })
    expect(parseKofi(body(payment), '')).toMatchObject({ ok: false, status: 401 })
    expect(parseKofi('data=nope', 'tok')).toMatchObject({ ok: false, status: 400 })
    expect(parseKofi(body({ ...payment, amount: 'x' }), 'tok')).toMatchObject({ ok: false, status: 400 })
  })
})
