/**
 * pnpm discord:support          — post the week's Ko-fi update to #support-me (the DISCORD_SUPPORT_WEBHOOK webhook).
 * pnpm discord:support --dry    — print the message instead of posting it.
 * --force                       — post even while Support me is off in Admin → Config.
 *
 * GitHub Actions runs it every Monday morning (.github/workflows/discord-support.yml): the month's goal (Admin →
 * Config → Support me), what Ko-fi has brought this month, and what next month already holds from monthly members
 * (kofi_totals, migration 0071, fed by the Ko-fi webhook). Nothing is posted while Support me is off or has no link.
 */
import { donationEnabled, donationUrl } from '@/engine'
import { postWebhook, type DEmbed } from './api'
import { anonClient, liveData } from './content'
import { loadEnv } from './env'
import { COLORS, SITE } from './layout'

/** A kofi_totals row: one per currency Ko-fi has been paid in. */
export interface KofiTotals {
  currency: string
  this_month: number
  supporters: number
  next_month: number
}

export interface SupportMessageInput {
  url: string
  /** 0 = no target: the post says what came in, without a gauge. */
  goal: number
  currency: string
  totals: KofiTotals[]
  now: number
  site?: string
}

/** "€42" or "€42.50": whole amounts without cents. */
export function money(amount: number, currency: string): string {
  const whole = Math.round(amount * 100) % 100 === 0
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    }).format(amount)
  } catch {
    return `${amount.toFixed(whole ? 0 : 2)} ${currency}`
  }
}

/** Ten blocks, filled to the share reached (a sliver shows once anything came in). */
export function gauge(share: number): string {
  const n = share <= 0 ? 0 : Math.max(1, Math.min(10, Math.floor(share * 10)))
  return '▰'.repeat(n) + '▱'.repeat(10 - n)
}

const monthName = (ms: number, offset = 0) => {
  const d = new Date(ms)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1)).toLocaleString('en', { month: 'long', timeZone: 'UTC' })
}

/** The webhook message: this month against the goal, next month so far, and the Ko-fi link. */
export function supportMessage(input: SupportMessageInput) {
  const site = input.site ?? SITE
  const cur = input.currency.toUpperCase()
  const main = input.totals.find((t) => t.currency.toUpperCase() === cur) ?? { currency: cur, this_month: 0, supporters: 0, next_month: 0 }
  const others = input.totals.filter((t) => t !== main && (t.this_month > 0 || t.next_month > 0))
  const month = monthName(input.now)
  const next = monthName(input.now, 1)
  const thisMonth = Number(main.this_month)
  const lines: string[] = []
  if (input.goal > 0) {
    const share = thisMonth / input.goal
    lines.push(`**${month}: ${money(thisMonth, cur)} / ${money(input.goal, cur)}** (${Math.round(share * 100)}%)`, gauge(share))
  } else lines.push(`**${month}: ${money(thisMonth, cur)}**`)
  if (main.supporters > 0) lines.push(`Thanks to ${main.supporters} supporter${main.supporters === 1 ? '' : 's'} this month 💖`)
  lines.push(`**${next}:** ${money(Number(main.next_month), cur)} already lined up from monthly members.`)
  for (const t of others)
    lines.push(`Also in ${t.currency}: ${money(Number(t.this_month), t.currency)} this month, ${money(Number(t.next_month), t.currency)} for ${next}.`)
  lines.push('', `**[Support me on Ko-fi](${input.url})**`)

  const embed: DEmbed = {
    title: input.goal > 0 ? `Ko-fi goal for ${month}` : `Ko-fi in ${month}`,
    url: input.url,
    description: lines.join('\n'),
    color: COLORS.gold,
    footer: { text: 'Pokémon is a licence, so Pokédice is free forever. A donation gives nothing in the game, just my thanks!' },
    timestamp: new Date(input.now).toISOString(),
  }
  return {
    username: 'Pokédice',
    avatar_url: `${site}/characters/prof-oak.png`,
    embeds: [embed],
    allowed_mentions: { parse: [] },
  }
}

async function main() {
  const argv = process.argv.slice(2)
  const dry = argv.includes('--dry')
  const force = argv.includes('--force')
  const env = await loadEnv()

  const { data, source } = await liveData(env)
  const url = donationUrl(data)
  if (!url) {
    console.log('No Ko-fi link in Admin → Config → Support me: nothing posted.')
    return
  }
  if (!donationEnabled(data) && !force && !dry) {
    console.log('Support me is off in Admin → Config: nothing posted.')
    return
  }
  const client = anonClient(env)
  if (!client) throw new Error('No VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY: the Ko-fi totals live in Supabase.')
  const { data: rows, error } = await client.rpc('kofi_totals')
  if (error) throw new Error(`kofi_totals: ${error.message} (has supabase/migrations/0071_kofi.sql been run?)`)
  const cfg = data.config.donation
  const message = supportMessage({
    url,
    goal: Number(cfg.monthlyGoal) || 0,
    currency: cfg.currency || 'EUR',
    totals: (rows ?? []) as KofiTotals[],
    now: Date.now(),
    site: env.POKEDICE_SITE?.trim() || SITE,
  })
  console.log(`Goal ${cfg.monthlyGoal} ${cfg.currency}, from ${source}; totals: ${JSON.stringify(rows)}`)
  if (dry) {
    console.log(JSON.stringify(message, null, 2))
    return
  }
  const webhook = env.DISCORD_SUPPORT_WEBHOOK?.trim()
  if (!webhook) {
    console.log('No DISCORD_SUPPORT_WEBHOOK: nothing posted. `pnpm discord --apply` writes it to .env.discord (docs/23).')
    return
  }
  await postWebhook(webhook, message)
  console.log('✓ Posted.')
}

// Run as a script, not when a test imports supportMessage.
if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/discord/support-post.ts')) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
