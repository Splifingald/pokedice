/**
 * pnpm discord:live               — post the live events starting this hour to #events (DISCORD_EVENTS_WEBHOOK).
 * pnpm discord:live --dry         — print what this hour would post (waiting for nothing) instead of posting it.
 * --at 2026-12-24T18:07:00Z       — run as if it were then (to check the schedule).
 * --force                         — post even while live events aren't switched on for everyone in Admin → Events.
 *
 * GitHub Actions runs it every hour at :07 (.github/workflows/discord-live.yml). Each run owns the hour from its
 * scheduled :07 to the next one, takes the events that start in it, waits for each start and posts it: what it does in
 * full (every shop item and price, every shiny area, the kits), when it ends, its banner (docs/50). A run GitHub starts
 * a few minutes late posts at once what already started in its hour, so each event is posted once. The week ahead is
 * live-week-post.ts. Nothing is posted while Admin → Events has live events Off or On for admin.
 */
import {
  freeKitRules,
  kitPrice,
  liveById,
  liveEvents,
  livePrice,
  liveRuns,
  liveStartsBetween,
  liveState,
  ugCfg,
  type GameData,
  type LiveEvent,
  type LiveRepeat,
} from '@/engine'
import { postWebhook, type DEmbed } from './api'
import { liveData } from './content'
import { loadEnv } from './env'
import { COLORS, SITE } from './layout'

/** How long before its start an event is posted: at the start itself (the Monday calendar gives the notice). */
export const LIVE_LEAD_MS = 0
const HOUR = 3600_000
/** The minute past each hour the workflow is scheduled at (its cron). */
export const CRON_MINUTE = 7

export const TYPE_NAME: Record<LiveEvent['type'], string> = {
  shiny: 'Shiny Parade',
  shop: 'Special Shop',
  cash: 'Cash Flow',
  underground: 'The Underground',
}

export const TYPE_EMOJI: Record<LiveEvent['type'], string> = {
  shiny: '✨',
  shop: '🛒',
  cash: '💰',
  underground: '⛏️',
}

/** Each type's colour on Discord, so the channel reads at a glance. */
const TYPE_COLOR: Record<LiveEvent['type'], number> = {
  shiny: COLORS.gold,
  shop: COLORS.sky,
  cash: COLORS.green,
  underground: COLORS.ink,
}

/** The name players see: the admin's English title, else the type's. */
export const liveName = (e: LiveEvent): string => e.title.en?.trim() || TYPE_NAME[e.type]

/**
 * The events this run posts, soonest first, each with when to post it: those whose start (minus the lead) falls in the
 * run's hour (from the latest scheduled :07 to the next). A moment already gone (a late run) is posted at once, as
 * long as the event isn't over. A recurring event's runs are each posted, as their own event.
 */
export function dueLiveEvents(
  data: GameData,
  now: number,
  lead = LIVE_LEAD_MS,
): { event: LiveEvent; postAt: number }[] {
  const offset = CRON_MINUTE * 60_000
  const slot = Math.floor((now - offset) / HOUR) * HOUR + offset
  return liveStartsBetween(data, slot + lead, slot + lead + HOUR)
    .map((event) => ({ event, postAt: Date.parse(event.start) - lead }))
    .filter(({ event }) => liveState(event, now) !== 'ended')
}

/** Up to `max` names, then "+2 more". */
export const someNames = (names: string[], max = 3) =>
  names.length > max ? `${names.slice(0, max).join(', ')} +${names.length - max} more` : names.join(', ')

/** "₽1,200". */
export const pokedollars = (n: number) => `₽${Math.round(n).toLocaleString('en')}`

const regionName = (data: GameData, id: string | null) =>
  data.regions.find((r) => r.id === id)?.name ?? id ?? 'one region'

/** Where a Shiny Parade runs, every area named up to `max`. */
function shinyPlace(data: GameData, e: LiveEvent, max: number): string {
  const s = e.shiny
  if (s.scope === 'all') return 'everywhere'
  if (s.scope === 'region') return `in ${regionName(data, s.regionId)}`
  return `in ${someNames(
    s.areaIds.map((id) => data.areas.find((a) => a.id === id)?.name ?? id),
    max,
  )}`
}

/** What it does, in one line, with its numbers. */
export function liveLine(data: GameData, e: LiveEvent): string {
  if (e.type === 'cash') return `+${Math.round((e.cash.multiplier - 1) * 100)}% on every ₽ you earn.`
  if (e.type === 'underground') return 'Dig for orbs, fossils and plates in the Underground.'
  if (e.type === 'shop') {
    const names = e.shop.items.map((r) => data.items[r.key]?.name).filter((n): n is string => !!n)
    return names.length
      ? `Special prices and rare items in the shop: ${someNames(names)}.`
      : 'Special prices in the shop.'
  }
  return `Wild Pokémon are ${e.shiny.multiplier}× more likely to be shiny, ${shinyPlace(data, e, 3)}.`
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
const WEEK_NAMES: Record<string, string> = { '1': '1st', '2': '2nd', '3': '3rd', '4': '4th', last: 'last' }

/** "every Friday", "the 1st and last Friday of each month", "every year on 24 December" (as Admin → Events says it). */
export function repeatLabel(r: LiveRepeat): string {
  if (r.kind === 'yearly') return `every year on ${r.day} ${MONTHS[r.month - 1] ?? '?'}`
  const day = WEEKDAYS[r.weekday] ?? '?'
  if (!r.weeks.length) return `every ${day}`
  const weeks = r.weeks
    .map((w) => WEEK_NAMES[String(w)]!)
    .join(', ')
    .replace(/, ([^,]*)$/, ' and $1')
  return `the ${weeks} ${day} of each month`
}

/** The recurring event a run belongs to, as the admin's list holds it. */
const ruleOf = (data: GameData, e: LiveEvent) =>
  e.ruleId ? liveEvents(data).find((x) => x.id === e.ruleId) : null

/** Everything the event changes, one line each: every shop item with its price, every shiny area, the kits. */
export function liveDetails(data: GameData, e: LiveEvent): string[] {
  if (e.type === 'cash')
    return [
      `💰 **+${Math.round((e.cash.multiplier - 1) * 100)}%** on every ₽ you earn: trainers, raids, the wheel… (selling doesn't count).`,
    ]
  if (e.type === 'shiny')
    return [
      `✨ Wild Pokémon are **${e.shiny.multiplier}×** more likely to be shiny, ${shinyPlace(data, e, 12)}.`,
    ]
  if (e.type === 'underground') {
    const cfg = ugCfg(data)
    const free = freeKitRules(cfg)
    const limit = Number(cfg.kits?.limit) > 0 ? ` · ${cfg.kits.limit} per trainer` : ''
    return [
      '⛏️ The Underground opens: dig the walls for orbs, fossils and plates.',
      `🧰 Explorakits in the Mart: ${pokedollars(kitPrice(cfg))} each${limit}.`,
      ...(free.amount > 0
        ? [
            `🎁 ${free.amount} free kit${free.amount === 1 ? '' : 's'} every ${Math.round(((free.everyMs * free.amount) / HOUR) * 10) / 10} h (up to ${free.cap} waiting).`,
          ]
        : []),
    ]
  }
  const rows = e.shop.items.filter((r) => data.items[r.key])
  if (!rows.length) return ['🛒 Special prices in the shop.']
  const MAX = 12
  const lines = rows.slice(0, MAX).map((r) => {
    const item = data.items[r.key]!
    const where =
      r.regions === 'all' || !r.regions.length
        ? ''
        : ` · in ${r.regions.map((id) => regionName(data, id)).join(', ')}`
    return `• **${item.name}** ${pokedollars(livePrice(r, item))}${r.limit ? ` · ${r.limit} per trainer` : ''}${where}`
  })
  if (rows.length > MAX) lines.push(`…and ${rows.length - MAX} more in the shop.`)
  return ['🛒 In the Special Shop:', ...lines]
}

/** A picture as a full URL: an area picture's key, a site path or a web address. */
export function liveBanner(banner: string, site = SITE): string | null {
  if (!banner) return null
  if (/^https?:\/\//i.test(banner)) return banner
  return `${site}${banner.includes('/') ? (banner.startsWith('/') ? banner : `/${banner}`) : `/area-art/${banner}.png`}`
}

/** The other events on at that moment: their bonuses add up with this one's. */
export function liveAlongside(data: GameData, e: LiveEvent, at = Date.parse(e.start)): LiveEvent[] {
  return liveEvents(data)
    .flatMap((x) => liveRuns(x, at, at + 1))
    .filter((x) => x.id !== e.id)
}

/** The webhook message for an event that starts: its name, everything it does, how long it lasts, its banner. */
export function liveMessage(data: GameData, e: LiveEvent, opts: { roleId?: string; site?: string } = {}) {
  const site = opts.site ?? SITE
  const name = liveName(e)
  const start = Math.round(Date.parse(e.start) / 1000)
  const end = Math.round(Date.parse(e.end) / 1000)
  const banner = liveBanner(e.banner, site)
  const rule = ruleOf(data, e)
  const alongside = liveAlongside(data, e)
  const firstItem =
    e.type === 'shop' ? e.shop.items.map((r) => data.items[r.key]?.spriteUrl).find(Boolean) : null
  const fields: NonNullable<DEmbed['fields']> = [
    { name: 'Ends', value: `<t:${end}:R>\n<t:${end}:f>`, inline: true },
    ...(e.minBadges > 0
      ? [
          {
            name: 'Who',
            value: `Trainers with ${e.minBadges}+ badge${e.minBadges === 1 ? '' : 's'}`,
            inline: true,
          },
        ]
      : []),
    ...(rule?.repeat ? [{ name: 'Comes back', value: repeatLabel(rule.repeat), inline: true }] : []),
    ...(alongside.length
      ? [
          {
            name: 'Also on',
            value: `${someNames(alongside.map((x) => `${TYPE_EMOJI[x.type]} ${liveName(x)}`))}: the bonuses add up.`,
          },
        ]
      : []),
  ]
  const embed: DEmbed = {
    author: { name: `${TYPE_EMOJI[e.type]} Live event · ${TYPE_NAME[e.type]}` },
    title: name,
    url: site,
    description: [...liveDetails(data, e), '', `**[Play now](${site})**`].join('\n'),
    color: TYPE_COLOR[e.type],
    fields,
    ...(firstItem ? { thumbnail: { url: liveBanner(firstItem, site)! } } : {}),
    ...(banner ? { image: { url: banner } } : {}),
    footer: { text: 'Started' },
    timestamp: new Date(start * 1000).toISOString(),
  }
  return {
    username: 'Pokédice Events',
    avatar_url: `${site}/characters/prof-oak.png`,
    content: `${opts.roleId ? `<@&${opts.roleId}> ` : ''}${TYPE_EMOJI[e.type]} **${name}** is live! Ends <t:${end}:R>.`,
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
    console.log(
      `Live events are "${access ?? 'off'}" in Admin → Events, not on for everyone: nothing posted.`,
    )
    return
  }
  const due = dueLiveEvents(data, now)
  if (!due.length) {
    console.log(`No live event starts this hour (${new Date(now).toISOString()}), from ${source}.`)
    return
  }
  const webhook = env.DISCORD_EVENTS_WEBHOOK?.trim()
  if (!webhook && !dry) {
    console.log(
      'No DISCORD_EVENTS_WEBHOOK: nothing posted. `pnpm discord --apply` writes it to .env.discord (docs/23).',
    )
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
      console.log(`${event.id}: waiting ${Math.round(wait / 60_000)} min, until it starts.`)
      await sleep(wait)
      // The admin may have moved or removed it meanwhile: post what players will get.
      ;({ data } = await liveData(env))
    }
    const fresh = liveById(data, event.id)
    if (!fresh || fresh.start !== event.start || liveState(fresh, Date.now()) === 'ended') {
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
