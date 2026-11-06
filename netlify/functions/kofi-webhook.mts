// Ko-fi's webhook (docs/23 §11): each payment lands in kofi_payments, for the weekly #support-me post on Discord.
// Ko-fi → Settings → API → Webhook URL: https://<the site>/.netlify/functions/kofi-webhook. Its settings, in Netlify →
// Site configuration → Environment variables:
//   VITE_SUPABASE_URL            the project's URL (the game's build reads the same one)
//   SUPABASE_SERVICE_ROLE_KEY    Supabase → Project Settings → API → service_role (never in the game's code)
//   KOFI_VERIFICATION_TOKEN      Ko-fi → Settings → API → Verification Token
// Ko-fi retries a payment until it gets a 200, so a failed write answers 500; a payment seen twice is kept once.
import { createClient } from '@supabase/supabase-js'
import { parseKofi } from '../kofi/payment'

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 })
  const env = process.env
  const url = env.VITE_SUPABASE_URL ?? env.SUPABASE_URL
  if (!url || !env.SUPABASE_SERVICE_ROLE_KEY || !env.KOFI_VERIFICATION_TOKEN) {
    console.warn('[kofi-webhook] not configured: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and KOFI_VERIFICATION_TOKEN')
    return new Response('not configured', { status: 503 })
  }
  const parsed = parseKofi(await req.text(), env.KOFI_VERIFICATION_TOKEN)
  if (!parsed.ok) {
    console.warn(`[kofi-webhook] refused: ${parsed.error}`)
    return new Response(parsed.error, { status: parsed.status })
  }
  const db = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const { error } = await db
    .from('kofi_payments')
    .upsert(parsed.row, { onConflict: 'transaction_id', ignoreDuplicates: true })
  if (error) {
    console.error(`[kofi-webhook] ${error.message}`)
    return new Response('not saved', { status: 500 })
  }
  console.log(`[kofi-webhook] ${parsed.row.kind} ${parsed.row.amount} ${parsed.row.currency}`)
  return new Response('ok')
}
