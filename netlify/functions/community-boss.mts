// The Community Boss's end (docs/71 §4.3): a Netlify scheduled function, every 5 minutes. Every Community Boss that has
// ended and isn't settled yet is settled by the server (migration 0147's boss_settle_due): the gauges broken, and each
// participant's message with their rewards. Netlify runs scheduled functions on the published site only, not on Deploy
// Previews (the admin's "Send the rewards" does the same by hand). Its settings, in Netlify → Site configuration →
// Environment variables (there already for the push sender):
//   VITE_SUPABASE_URL            the project's URL (the game's build reads the same one)
//   SUPABASE_SERVICE_ROLE_KEY    Supabase → Project Settings → API → service_role (never in the game's code)
// Missing either, it does nothing and says which.
import { createClient } from '@supabase/supabase-js'

export const config = { schedule: '*/5 * * * *' }

export default async function handler(): Promise<Response> {
  const env = process.env
  const url = env.VITE_SUPABASE_URL ?? env.SUPABASE_URL
  const missing = (
    [
      ['VITE_SUPABASE_URL', url],
      ['SUPABASE_SERVICE_ROLE_KEY', env.SUPABASE_SERVICE_ROLE_KEY],
    ] as const
  )
    .filter(([, v]) => !v)
    .map(([k]) => k)
  if (missing.length) {
    console.warn(`[community-boss] not configured: ${missing.join(', ')}`)
    return new Response(null, { status: 204 })
  }
  const db = createClient(url!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data, error } = await db.rpc('boss_settle_due')
  // A database without 0147 has no such function: nothing to settle.
  if (error) console.warn(`[community-boss] boss_settle_due: ${error.message}`)
  else if (Number(data) > 0) console.log(`[community-boss] settled ${data}`)
  return new Response(null, { status: 204 })
}
