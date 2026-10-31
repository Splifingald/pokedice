// The live events' posts in Discord's #events (docs/50): a Netlify scheduled function, every minute. Each event is
// posted as it starts, the week's calendar on Monday mornings; netlify/discord/live.ts decides what is due. Netlify
// runs scheduled functions on the published site only, not on Deploy Previews. Its settings, in Netlify → Site
// configuration → Environment variables:
//   VITE_SUPABASE_URL            the project's URL (there already for the push sender)
//   SUPABASE_SERVICE_ROLE_KEY    Supabase → Project Settings → API → service_role (there already)
//   DISCORD_EVENTS_WEBHOOK       #events → Edit Channel → Integrations → Webhooks → Pokédice Events → Copy Webhook URL
//   DISCORD_EVENT_ROLE           optional: the Event Pings role's id, pinged by each start
// Missing one of the first three, it does nothing and says which.
import { createClient } from '@supabase/supabase-js'
import { liveContent } from '@/config/live'
import { postWebhook } from '../../scripts/discord/api'
import { runLiveJob } from '../discord/live'

export const config = { schedule: '* * * * *' }

export default async function handler(): Promise<Response> {
  const env = process.env
  const url = env.VITE_SUPABASE_URL ?? env.SUPABASE_URL
  const webhook = env.DISCORD_EVENTS_WEBHOOK?.trim()
  const missing = (
    [
      ['VITE_SUPABASE_URL', url],
      ['SUPABASE_SERVICE_ROLE_KEY', env.SUPABASE_SERVICE_ROLE_KEY],
      ['DISCORD_EVENTS_WEBHOOK', webhook],
    ] as const
  )
    .filter(([, v]) => !v)
    .map(([k]) => k)
  if (missing.length) {
    console.warn(`[discord-live] not configured: ${missing.join(', ')}`)
    return new Response(null, { status: 204 })
  }
  const db = createClient(url!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const result = await runLiveJob(
    {
      events: async () => {
        const { data, error } = await db
          .from('game_config')
          .select('value')
          .eq('key', 'liveEvents')
          .maybeSingle()
        if (error) throw new Error(`game_config: ${error.message}`)
        return data?.value
      },
      posted: async (keys) => {
        const { data, error } = await db.from('discord_live_posts').select('key').in('key', keys)
        if (error) throw new Error(`discord_live_posts: ${error.message}`)
        return new Set((data ?? []).map((r: { key: string }) => r.key))
      },
      data: async () => (await liveContent(db)).data,
      claim: async (key) => {
        const { data, error } = await db
          .from('discord_live_posts')
          .upsert({ key }, { onConflict: 'key', ignoreDuplicates: true })
          .select('key')
        if (error) throw new Error(`discord_live_posts: ${error.message}`)
        return (data ?? []).length > 0
      },
      release: async (key) => {
        const { error } = await db.from('discord_live_posts').delete().eq('key', key)
        if (error) console.warn(`[discord-live] could not release ${key}: ${error.message}`)
      },
      post: async (message) => {
        await postWebhook(webhook!, message)
      },
      roleId: env.DISCORD_EVENT_ROLE?.trim() || undefined,
      site: env.POKEDICE_SITE?.trim() || undefined,
    },
    Date.now(),
  )
  if (result.posted.length || result.failed.length) console.log('[discord-live]', result)
  return new Response(null, { status: 204 })
}
