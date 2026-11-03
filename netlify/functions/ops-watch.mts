// The server watch (docs/66 §4): a Netlify scheduled function, every 5 minutes. It reads the database's CPU, memory,
// disk and connections from Supabase's metrics, posts on Discord when one stays high (and when it is back to normal),
// a summary of each day's peaks, and can grow the database one size when CPU or memory stays critical. The decisions
// are netlify/ops/watch.ts's. Netlify runs scheduled functions on the published site only. Its settings, in Netlify →
// Site configuration → Environment variables:
//   VITE_SUPABASE_URL            the project's URL (there already)
//   SUPABASE_SERVICE_ROLE_KEY    there already: the watch's memory (ops_watch_state, migration 0137)
//   SUPABASE_METRICS_KEY         Supabase → Project Settings → API Keys → a secret key (sb_secret_…), for the metrics
//   DISCORD_OPS_WEBHOOK          a private channel's webhook (Edit Channel → Integrations → Webhooks → Copy URL)
//   DISCORD_OPS_PING             optional: your Discord user id, pinged when something is critical
//   OPS_AUTOSCALE                optional: `upgrade` to grow the database itself; otherwise it only says it would
//   OPS_AUTOSCALE_MAX            optional: the largest size it may reach (default ci_small)
//   SUPABASE_ACCESS_TOKEN        only with `upgrade`: a personal access token (Account → Access Tokens)
// Missing one of the first four, it does nothing and says which.
import { createClient } from '@supabase/supabase-js'
import { postWebhook } from '../../scripts/discord/api'
import { evaluate, nextSize, parseMetrics, readingsOf, type WatchState } from '../ops/watch'

export const config = { schedule: '*/5 * * * *' }

const TAG = '[ops-watch]'

/** The project's current compute size and the call that grows it (Supabase Management API). */
async function computeSize(ref: string, token: string): Promise<string | null> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/billing/addons`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`addons ${res.status}`)
  const body = (await res.json()) as { selected_addons?: { type?: string; variant?: { id?: string } }[] }
  return body.selected_addons?.find((a) => a.type === 'compute_instance')?.variant?.id ?? 'ci_micro'
}

async function growTo(ref: string, token: string, size: string): Promise<void> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/billing/addons`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ addon_type: 'compute_instance', addon_variant: size }),
  })
  if (!res.ok) throw new Error(`upgrade ${res.status}: ${(await res.text()).slice(0, 200)}`)
}

export default async function handler(): Promise<Response> {
  const env = process.env
  const url = env.VITE_SUPABASE_URL ?? env.SUPABASE_URL
  const webhook = env.DISCORD_OPS_WEBHOOK?.trim()
  const missing = (
    [
      ['VITE_SUPABASE_URL', url],
      ['SUPABASE_SERVICE_ROLE_KEY', env.SUPABASE_SERVICE_ROLE_KEY],
      ['SUPABASE_METRICS_KEY', env.SUPABASE_METRICS_KEY],
      ['DISCORD_OPS_WEBHOOK', webhook],
    ] as const
  )
    .filter(([, v]) => !v)
    .map(([k]) => k)
  if (missing.length) {
    console.warn(`${TAG} not configured: ${missing.join(', ')}`)
    return new Response(null, { status: 204 })
  }
  const ref = new URL(url!).host.split('.')[0]!
  const post = (content: string) =>
    postWebhook(webhook!, { content, allowed_mentions: { users: [] as string[] } })
  const db = createClient(url!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

  const { data: row, error: readError } = await db
    .from('ops_watch_state')
    .select('state')
    .eq('id', 'main')
    .maybeSingle()
  if (readError) {
    console.warn(`${TAG} ops_watch_state: ${readError.message}`)
    return new Response(null, { status: 204 })
  }
  const prev = (row?.state ?? {}) as WatchState

  let text: string
  try {
    const res = await fetch(`${url!.replace(/\/$/, '')}/customer/v1/privileged/metrics`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`service_role:${env.SUPABASE_METRICS_KEY}`).toString('base64')}`,
      },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    text = await res.text()
  } catch (err) {
    // The metrics not answering is worth saying once an hour: the database may be down or restarting.
    const now = Date.now()
    if (now - ((prev as { unreachableAt?: number }).unreachableAt ?? 0) >= 60 * 60_000) {
      await post(
        `⚠️ Server watch: Supabase's metrics don't answer (${err instanceof Error ? err.message : err}).`,
      )
      await db
        .from('ops_watch_state')
        .upsert({ id: 'main', state: { ...prev, unreachableAt: now }, updated_at: new Date().toISOString() })
    }
    return new Response(null, { status: 204 })
  }

  const now = Date.now()
  const { readings, cpu } = readingsOf(
    parseMetrics(text),
    prev.cpu ?? null,
    Number(env.OPS_MAX_CONNECTIONS) || 60,
  )
  const result = evaluate(readings, prev, now)
  const state: WatchState = { ...result.state, cpu }
  const messages = [...result.messages]

  if (result.upgrade) {
    const max = env.OPS_AUTOSCALE_MAX?.trim() || 'ci_small'
    const token = env.SUPABASE_ACCESS_TOKEN?.trim()
    try {
      const current = token ? await computeSize(ref, token) : null
      const next = nextSize(current, max)
      if (!next)
        messages.push(
          `🔴 The database is at its largest allowed size (${current ?? '?'}; OPS_AUTOSCALE_MAX=${max}).`,
        )
      else if (env.OPS_AUTOSCALE?.trim() === 'upgrade' && token) {
        await post(`⏫ Growing the database ${current} → ${next}: about 2 minutes of downtime.`)
        await growTo(ref, token, next)
        messages.push(
          `✅ Upgrade to ${next} asked. Supabase → Settings → Compute and Disk shows its progress.`,
        )
      } else
        messages.push(
          `💡 CPU or memory has been critical for 15 min: growing the database to ${next} would help ` +
            '(Supabase → Settings → Compute and Disk, about 2 minutes of downtime).',
        )
      state.lastUpgradeAt = now
    } catch (err) {
      messages.push(`❌ Could not grow the database: ${err instanceof Error ? err.message : err}`)
    }
  }

  const ping = env.DISCORD_OPS_PING?.trim()
  for (const [i, m] of messages.entries()) {
    const content = i === 0 && result.critical && ping ? `<@${ping}> ${m}` : m
    await postWebhook(webhook!, { content, allowed_mentions: { users: ping ? [ping] : [] } }).catch((err) =>
      console.warn(`${TAG} post failed`, err),
    )
  }
  const { error: writeError } = await db
    .from('ops_watch_state')
    .upsert({ id: 'main', state, updated_at: new Date(now).toISOString() })
  if (writeError) console.warn(`${TAG} ops_watch_state: ${writeError.message}`)
  if (messages.length) console.log(TAG, readings, messages)
  return new Response(null, { status: 204 })
}
