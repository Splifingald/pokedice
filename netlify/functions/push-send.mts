// The push sender (docs/27-PUSH-NOTIFICATIONS.md): a Netlify scheduled function, every 5 minutes. It signs in to
// Supabase with the service role (push_due and push_report are the sender's alone) and signs each push with the VAPID
// keys. Its settings, in Netlify → Site configuration → Environment variables:
//   VITE_SUPABASE_URL            the project's URL (the game's build reads the same one)
//   SUPABASE_SERVICE_ROLE_KEY    Supabase → Project Settings → API → service_role (never in the game's code)
//   VITE_VAPID_PUBLIC_KEY        the VAPID public key (the game's build reads it to subscribe)
//   VAPID_PRIVATE_KEY            its private half
//   VAPID_SUBJECT                a mailto: or https: contact for the push services (optional)
// Missing any of them, it does nothing and says which.
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { sendDue, type DueRow } from '../push/send'

export const config = { schedule: '*/5 * * * *' }

/** A push the browser has missed for this long isn't worth showing any more. */
const TTL_SECONDS = 6 * 3600
const PUSH_TIMEOUT_MS = 5000

export default async function handler(): Promise<Response> {
  const env = process.env
  const url = env.VITE_SUPABASE_URL ?? env.SUPABASE_URL
  const missing = (
    [
      ['VITE_SUPABASE_URL', url],
      ['SUPABASE_SERVICE_ROLE_KEY', env.SUPABASE_SERVICE_ROLE_KEY],
      ['VITE_VAPID_PUBLIC_KEY', env.VITE_VAPID_PUBLIC_KEY],
      ['VAPID_PRIVATE_KEY', env.VAPID_PRIVATE_KEY],
    ] as const
  )
    .filter(([, v]) => !v)
    .map(([k]) => k)
  if (missing.length) {
    console.warn(`[push-send] not configured: ${missing.join(', ')}`)
    return new Response(null, { status: 204 })
  }
  webpush.setVapidDetails(
    env.VAPID_SUBJECT || 'mailto:pokedice@example.com',
    env.VITE_VAPID_PUBLIC_KEY!,
    env.VAPID_PRIVATE_KEY!,
  )
  const db = createClient(url!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const result = await sendDue({
    due: async () => {
      const { data, error } = await db.rpc('push_due', { p_limit: 500 })
      if (error) throw new Error(`push_due: ${error.message}`)
      return (data ?? []) as DueRow[]
    },
    // A push service that never answers must not hold up the run (Netlify stops it after about 30 s, and every notice it
    // claimed would be lost): 5 s each at most (docs/63).
    push: (sub, body) =>
      webpush.sendNotification(sub, body, { TTL: TTL_SECONDS, urgency: 'normal', timeout: PUSH_TIMEOUT_MS }),
    report: async (ok, gone) => {
      const { error } = await db.rpc('push_report', { p_ok: ok, p_gone: gone })
      if (error) console.warn(`[push-send] push_report: ${error.message}`)
    },
  })
  if (result.sent || result.gone || result.failed) console.log('[push-send]', result)
  return new Response(null, { status: 204 })
}
