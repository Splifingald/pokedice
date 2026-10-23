/**
 * pnpm discord:live               — post the live events starting in two hours to #events (DISCORD_EVENTS_WEBHOOK).
 * pnpm discord:live --dry         — print what this hour would post (waiting for nothing) instead of posting it.
 * --at 2026-12-24T18:07:00Z       — run as if it were then (to check the schedule).
 * --force                         — post even while live events aren't switched on for everyone in Admin → Events.
 *
 * GitHub Actions runs it every hour at :07 (.github/workflows/discord-live.yml). Each run owns the hour from its
 * scheduled :07 to the next one, takes the events whose "two hours before" falls in it, waits for that moment and posts
 * each. A run GitHub starts late (it often does, by a few minutes) still owns its own hour, so each event is posted
 * once, on time. Nothing is posted while Admin → Events has live events Off or On for admin.
 */
import { liveEvents, liveState, type GameData, type LiveEvent } from '@/engine'
import { postWebhook, type DEmbed } from './api'
import { liveData } from './content'
import { loadEnv } from './env'
import { COLORS, SITE } from './layout'

/** How long before its start an event is announced. */
export const LIVE_LEAD_MS = 2 * 3600_000
const HOUR = 3600_000
/** The minute past each hour the workflow is scheduled at (its cron). */
export const CRON_MINUTE = 7

const TYPE_NAME: Record<LiveEvent['type'], string> = {
  shiny: 'Shiny Parade',
  shop: 'Special Shop',
  cash: 'Cash Flow',
  underground: 'The Underground',
}

/**
 * The events this run announces, soonest first, each with when to post it: those whose start minus the lead falls in
 * the run's hour (from the latest scheduled :07 to the next). A moment already gone (a late run) is posted at once.
 */
export function dueLiveEvents(data: GameData, now: number, lead = LIVE_LEAD_MS): { event: LiveEvent; postAt: number }[] {
  const offset = CRON_MINUTE * 60_000
  const slot = Math.floor((now - offset) / HOUR) * HOUR + offset
  return liveEvents(data)
    .map((event) => ({ event, postAt: Date.parse(event.start) - lead }))
    .filter(({ event, postAt }) => liveState(event, now) === 'scheduled' && postAt >= slot && postAt < slot + HOUR)
    .sort((a, b) => a.postAt - b.postAt)
}

/** Up to three names, then "+2 more". */
const someNames = (names: string[]) => (names.length > 3 ? `${names.slice(0, 3).join(', ')} +${names.length - 3} more` : names.join(', '))

/** What it does, in one line, with its numbers. */
export function liveLine(data: GameData, e: LiveEvent): string {
  if (e.type === 'cash') return `+${Math.round((e.cash.multiplier - 1) * 100)}% on every ₽ you earn.`
  if (e.type === 'underground') return 'Dig for orbs, fossils and plates in the Underground.'
  if (e.type === 'shop') {
    const names = e.shop.items.map((r) => data.items[r.key]?.name).filter((n): n is string => !!n)
    return names.length ? `Special prices and rare items in the shop: ${someNames(names)}.` : 'Special prices in the shop.'
  }
  const s = e.shiny
  const place =
    s.scope === 'all'
      ? 'everywhere'
      : s.scope === 'region'
        ? `in ${data.regions.find((r) => r.id === s.regionId)?.name ?? s.regionId ?? 'one region'}`
        : `in ${someNames(s.areaIds.map((id) => data.areas.find((a) => a.id === id)?.name ?? id))}`
  return `Wild Pokémon are ${s.multiplier}× more likely to be shiny, ${place}.`
}

/** The event's picture as a full URL: an area picture's key, a site path or a web address. */
export function liveBanner(banner: string, site = SITE): string | null {
  if (!banner) return null
  if (/^https?:\/\//i.test(banner)) return banner
  return `${site}${banner.includes('/') ? (banner.startsWith('/') ? banner : `/${banner}`) : `/area-art/${banner}.png`}`
}

/** The webhook message: short, the name, what it does, when it runs, its picture. */
export function liveMessage(data: GameData, e: LiveEvent, opts: { roleId?: string; site?: string } = {}) {
  const site = opts.site ?? SITE
  const name = e.title.en?.trim() || TYPE_NAME[e.type]
  const start = Math.round(Date.parse(e.start) / 1000)
  const end = Math.round(Date.parse(e.end) / 1000)
  const banner = liveBanner(e.banner, site)
  const embed: DEmbed = {
    author: { name: `Live event · ${TYPE_NAME[e.type]}` },
    title: name,
    url: site,
    description: [
      liveLine(data, e),
      `<t:${start}:f> → <t:${end}:f>`,
      e.minBadges > 0 ? `For trainers with ${e.minBadges}+ badge${e.minBadges === 1 ? '' : 's'}.` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    color: COLORS.sky,
    ...(banner ? { image: { url: banner } } : {}),
  }
  return {
    username: 'Pokédice Events',
    avatar_url: `${site}/characters/prof-oak.png`,
    content: `${opts.roleId ? `<@&${opts.roleId}> ` : ''}**${name}** starts <t:${start}:R>!`,
    embeds: [embed],
    allowed_mentions: { parse: [], roles: opts.roleId ? [opts.roleId] : [] },
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const argv = process.argv.slice(2)
  const dry = argv.includes('--dry')
  const force = argv.includes('--force')
  const atArg = argv.includes('--at') ? Date.parse(argv[argv.indexOf('--at') + 1] ?? '') : NaN
  const now = Number.isFinite(atArg) ? atArg : Date.now()
  const env = await loadEnv()
  const site = env.POKEDICE_SITE?.trim() || SITE
  const roleId = env.DISCORD_EVENT_ROLE?.trim() || undefined

  const first = await liveData(env)
  const source = first.source
  let data = first.data
  const access = data.config.liveEvents?.access
  if (access !== 'all' && !force && !dry) {
    console.log(`Live events are "${access ?? 'off'}" in Admin → Events, not on for everyone: nothing posted.`)
    return
  }
  const due = dueLiveEvents(data, now)
  if (!due.length) {
    console.log(`No live event starts two hours after this hour (${new Date(now).toISOString()}), from ${source}.`)
    return
  }
  const webhook = env.DISCORD_EVENTS_WEBHOOK?.trim()
  if (!webhook && !dry) {
    console.log('No DISCORD_EVENTS_WEBHOOK: nothing posted. `pnpm discord --apply` writes it to .env.discord (docs/23).')
    return
  }
  for (const { event, postAt } of due) {
    if (dry) {
      console.log(`${event.id}: would post at ${new Date(postAt).toISOString()}.`)
      console.log(JSON.stringify(liveMessage(data, event, { roleId, site }), null, 2))
      continue
    }
    const wait = postAt - Date.now()
    if (wait > 0) {
      console.log(`${event.id}: waiting ${Math.round(wait / 60_000)} min, until two hours before it starts.`)
      await sleep(wait)
      // The admin may have moved or removed it meanwhile: post what players will get.
      ;({ data } = await liveData(env))
    }
    const fresh = liveEvents(data).find((e) => e.id === event.id)
    if (!fresh || fresh.start !== event.start || liveState(fresh, Date.now()) !== 'scheduled') {
      console.log(`${event.id}: moved or removed meanwhile, nothing posted.`)
      continue
    }
    await postWebhook(webhook!, liveMessage(data, fresh, { roleId, site }))
    console.log(`✓ ${event.id} posted.`)
  }
}

// Run as a script, not when a test imports liveMessage.
if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/discord/live-event-post.ts')) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
