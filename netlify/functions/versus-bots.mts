// The Versus league bots' weekly teams (docs/44 §9): a Netlify scheduled function, every hour. When this week has no
// set of its own yet and the league isn't Off, it draws one with the engine over the live content and stores it
// (migration 0092's versus_league_bot_set and versus_league_put_bot_teams, the service role's and the admin's alone).
// Netlify runs scheduled functions on the published site only, not on Deploy Previews. Its settings, in Netlify → Site
// configuration → Environment variables (there already for the push sender):
//   VITE_SUPABASE_URL            the project's URL (the game's build reads the same one)
//   SUPABASE_SERVICE_ROLE_KEY    Supabase → Project Settings → API → service_role (never in the game's code)
// Missing either, it does nothing and says which.
import { createClient } from '@supabase/supabase-js'
import { liveContent } from '@/config/live'
import { makeWeekBotTeams } from '../versus/bots'

// Hourly, so a week has its set within the hour of Monday 00:00 UTC; until then it uses last week's.
export const config = { schedule: '13 * * * *' }

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
    console.warn(`[versus-bots] not configured: ${missing.join(', ')}`)
    return new Response(null, { status: 204 })
  }
  const db = createClient(url!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const result = await makeWeekBotTeams(
    {
      due: async (week) => {
        const { data, error } = await db.rpc('versus_league_bot_set', { p_week: week })
        if (error) throw new Error(`versus_league_bot_set: ${error.message}`)
        return (data as { due?: boolean } | null)?.due === true
      },
      data: async () => (await liveContent(db)).data,
      put: async (week, teams) => {
        const { data, error } = await db.rpc('versus_league_put_bot_teams', { p_week: week, p_teams: teams })
        if (error) throw new Error(`versus_league_put_bot_teams: ${error.message}`)
        return Number(data) || 0
      },
    },
    Date.now(),
  )
  if (result.made) console.log('[versus-bots]', result)
  return new Response(null, { status: 204 })
}
