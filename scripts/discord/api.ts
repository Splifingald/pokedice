// Discord's REST API (v10), the little of it the server setup and the two posters need: the bot token in, JSON out,
// rate limits waited out. No dependency: the setup makes a few dozen calls, the posters one each.

const API = 'https://discord.com/api/v10'
const USER_AGENT = 'DiscordBot (https://github.com/Splifingald/pokedice, 1.0)'

export class DiscordError extends Error {
  constructor(
    readonly status: number,
    readonly method: string,
    readonly path: string,
    readonly body: unknown,
  ) {
    super(`Discord ${method} ${path} → ${status}: ${JSON.stringify(body)}`)
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** One request, retried while Discord answers 429 (it says how long to wait), the body parsed when there is one. */
async function request<T>(url: string, init: RequestInit & { headers: Record<string, string> }): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init)
    if (res.status === 429 && attempt < 6) {
      const info = (await res.json().catch(() => ({}))) as { retry_after?: number }
      await sleep(Math.ceil((info.retry_after ?? 1) * 1000) + 100)
      continue
    }
    const text = await res.text()
    let body: unknown = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = text
    }
    if (!res.ok) throw new DiscordError(res.status, init.method ?? 'GET', url.replace(/\/webhooks\/\d+\/[\w-]+/, '/webhooks/…'), body)
    // The bucket is empty: wait for it to refill rather than run into a 429 on the next call.
    if (res.headers.get('x-ratelimit-remaining') === '0')
      await sleep(Number(res.headers.get('x-ratelimit-reset-after') ?? 0) * 1000)
    return body as T
  }
}

export type Method = 'POST' | 'PATCH' | 'PUT' | 'DELETE'

export interface Discord {
  get<T>(path: string): Promise<T>
  send<T>(method: Method, path: string, body?: unknown): Promise<T>
}

/** A client acting as the bot. Every change it makes shows in the server's audit log with `reason`. */
export function discordClient(token: string, reason = 'Pokédice server setup'): Discord {
  const call = <T>(method: string, path: string, body?: unknown) =>
    request<T>(API + path, {
      method,
      headers: {
        Authorization: `Bot ${token}`,
        'User-Agent': USER_AGENT,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(method !== 'GET' ? { 'X-Audit-Log-Reason': encodeURIComponent(reason) } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  return { get: (path) => call('GET', path), send: (method, path, body) => call(method, path, body) }
}

/** Posts a message through a webhook URL (no bot needed) and returns the message Discord stored. */
export function postWebhook(url: string, payload: unknown): Promise<{ id: string; channel_id: string }> {
  const u = new URL(url)
  u.searchParams.set('wait', 'true')
  return request(u.toString(), {
    method: 'POST',
    headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

// ---------------------------------------------------------------------------------------------------------------------
// The shapes Discord sends back, cut down to the fields read here.

export interface DRole {
  id: string
  name: string
  permissions: string
  color: number
  hoist: boolean
  mentionable: boolean
  position: number
  managed: boolean
}

/** A channel's permission overwrite: `type` 0 for a role, 1 for a member. */
export interface DOverwrite {
  id: string
  type: 0 | 1
  allow: string
  deny: string
}

export interface DForumTag {
  id?: string
  name: string
  moderated: boolean
  emoji_id: string | null
  emoji_name: string | null
}

export interface DChannel {
  id: string
  type: number
  name: string
  position: number
  parent_id?: string | null
  topic?: string | null
  permission_overwrites?: DOverwrite[]
  rate_limit_per_user?: number
  user_limit?: number
  available_tags?: DForumTag[]
  default_reaction_emoji?: { emoji_id: string | null; emoji_name: string | null } | null
  default_sort_order?: number | null
  default_forum_layout?: number
}

export interface DGuild {
  id: string
  name: string
  owner_id: string
  features: string[]
  roles: DRole[]
  verification_level: number
  default_message_notifications: number
  explicit_content_filter: number
  system_channel_id: string | null
  system_channel_flags: number
  rules_channel_id: string | null
  public_updates_channel_id: string | null
  safety_alerts_channel_id: string | null
  description: string | null
}

export interface DAutomodAction {
  type: number
  metadata?: { channel_id?: string; duration_seconds?: number; custom_message?: string }
}

export interface DAutomodRule {
  id: string
  name: string
  event_type: number
  trigger_type: number
  trigger_metadata: Record<string, unknown>
  actions: DAutomodAction[]
  enabled: boolean
  exempt_roles: string[]
  exempt_channels: string[]
}

export interface DOnboardingOption {
  id: string
  title: string
  description: string | null
  emoji?: { id: string | null; name: string | null } | null
  role_ids: string[]
  channel_ids: string[]
}

export interface DOnboardingPrompt {
  id: string
  type: number
  title: string
  single_select: boolean
  required: boolean
  in_onboarding: boolean
  options: DOnboardingOption[]
}

export interface DOnboarding {
  prompts: DOnboardingPrompt[]
  default_channel_ids: string[]
  enabled: boolean
  mode: number
}

export interface DEmbed {
  title?: string
  url?: string
  description?: string
  color?: number
  fields?: { name: string; value: string; inline?: boolean }[]
  footer?: { text: string; icon_url?: string }
  author?: { name: string; url?: string; icon_url?: string }
  thumbnail?: { url: string }
  image?: { url: string }
  timestamp?: string
}

export interface DMessage {
  id: string
  author: { id: string }
  content: string
  embeds: DEmbed[]
}

export interface DWebhook {
  id: string
  type: number
  name: string | null
  channel_id: string
  token?: string
  url?: string
}
