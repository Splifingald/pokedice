// Ko-fi's webhook (docs/23 §11): Ko-fi POSTs each payment as a form with one field, `data`, holding the JSON. The
// token Ko-fi shows under Settings → API proves it's Ko-fi. Pure (the hash aside), so tests read it without a server.
import { createHash, timingSafeEqual } from 'node:crypto'

/** A kofi_payments row (supabase/migrations/0071_kofi.sql). */
export interface KofiRow {
  transaction_id: string
  kind: string
  amount: number
  currency: string
  paid_at: string
  subscription: boolean
  supporter: string | null
  tier: string | null
}

export type KofiParse = { ok: true; row: KofiRow } | { ok: false; status: 400 | 401; error: string }

const sameToken = (a: string, b: string): boolean => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/** The webhook's body (form-encoded) → the row to keep, once its token matches. */
export function parseKofi(body: string, token: string): KofiParse {
  const raw = new URLSearchParams(body).get('data')
  let d: Record<string, unknown>
  try {
    d = JSON.parse(raw ?? '') as Record<string, unknown>
  } catch {
    return { ok: false, status: 400, error: 'no data' }
  }
  if (!d || typeof d !== 'object') return { ok: false, status: 400, error: 'no data' }
  if (!token || !sameToken(String(d.verification_token ?? ''), token)) return { ok: false, status: 401, error: 'bad token' }
  const id = String(d.kofi_transaction_id ?? d.message_id ?? '').trim()
  const amount = Number(d.amount)
  const paid = Date.parse(String(d.timestamp ?? ''))
  if (!id || !Number.isFinite(amount) || amount < 0 || !Number.isFinite(paid))
    return { ok: false, status: 400, error: 'missing transaction, amount or time' }
  const email = String(d.email ?? '').trim().toLowerCase()
  return {
    ok: true,
    row: {
      transaction_id: id,
      kind: String(d.type ?? 'Donation'),
      amount: Math.round(amount * 100) / 100,
      currency: String(d.currency ?? '').trim().toUpperCase() || 'EUR',
      paid_at: new Date(paid).toISOString(),
      subscription: d.is_subscription_payment === true,
      supporter: email ? createHash('sha256').update(email).digest('hex') : null,
      tier: typeof d.tier_name === 'string' && d.tier_name ? d.tier_name : null,
    },
  }
}
