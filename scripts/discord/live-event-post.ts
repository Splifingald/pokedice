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
 * live-week-post.ts. Nothing is posted while Admin → Events has live events Off or On for admin. With
 * DISCORD_FRENCH_WEBHOOK, each post goes to #🥖-français too, in French (french.ts).
 */
import {
  freeKitRules,
  kitPrice,
  liveById,
  liveEvents,
  livePrice,
  liveRuns,
  liveStartsBetween,
  liveTypeOn,
  liveState,
  ugCfg,
  type GameData,
  type LiveEvent,
  type LiveRepeat,
} from '@/engine'
import { postWebhook, type DEmbed } from './api'
import { liveData } from './content'
import { loadEnv } from './env'
import { frenchData, frenchTypeName, type PostLang } from './french'
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
  calendar: 'Gift Calendar',
}

export const TYPE_EMOJI: Record<LiveEvent['type'], string> = {
  shiny: '✨',
  shop: '🛒',
  cash: '💰',
  underground: '⛏️',
  calendar: '🎁',
}

/** Each type's colour on Discord, so the channel reads at a glance. */
const TYPE_COLOR: Record<LiveEvent['type'], number> = {
  shiny: COLORS.gold,
  shop: COLORS.sky,
  cash: COLORS.green,
  underground: COLORS.ink,
  calendar: COLORS.red,
}

/** A type's name in the post's language: the game's own French name in French. */
export const typeName = (type: LiveEvent['type'], lang: PostLang = 'en'): string =>
  lang === 'fr' ? frenchTypeName(type, TYPE_NAME[type]) : TYPE_NAME[type]

/** The name players see: the admin's title in the post's language, else the English one, else the type's. */
export const liveName = (e: LiveEvent, lang: PostLang = 'en'): string =>
  (lang === 'fr' ? e.title.fr?.trim() : '') || e.title.en?.trim() || typeName(e.type, lang)

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
export const someNames = (names: string[], max = 3, lang: PostLang = 'en') =>
  names.length > max
    ? `${names.slice(0, max).join(', ')} +${names.length - max} ${lang === 'fr' ? 'autres' : 'more'}`
    : names.join(', ')

/** "₽1,200", "₽1 200" in French (the game's own way, src/lib/format.ts). */
export const pokedollars = (n: number, lang: PostLang = 'en') => `₽${Math.round(n).toLocaleString(lang)}`

const regionName = (data: GameData, id: string | null, lang: PostLang = 'en') =>
  data.regions.find((r) => r.id === id)?.name ?? id ?? (lang === 'fr' ? 'une région' : 'one region')

/** Where a Shiny Parade runs, every area named up to `max`. */
function shinyPlace(data: GameData, e: LiveEvent, max: number, lang: PostLang = 'en'): string {
  const s = e.shiny
  const fr = lang === 'fr'
  if (s.scope === 'all') return fr ? 'partout' : 'everywhere'
  if (s.scope === 'region') return `${fr ? 'à' : 'in'} ${regionName(data, s.regionId, lang)}`
  const areas = someNames(
    s.areaIds.map((id) => data.areas.find((a) => a.id === id)?.name ?? id),
    max,
    lang,
  )
  return fr ? `ici : ${areas}` : `in ${areas}`
}

/** "+50%"; "+50 %" in French. */
const cashBonus = (e: LiveEvent, lang: PostLang) =>
  `+${Math.round((e.cash.multiplier - 1) * 100)}${lang === 'fr' ? ' %' : '%'}`

/** What it does, in one line, with its numbers. */
export function liveLine(data: GameData, e: LiveEvent, lang: PostLang = 'en'): string {
  if (lang === 'fr') {
    if (e.type === 'cash') return `${cashBonus(e, lang)} sur chaque ₽ gagné.`
    if (e.type === 'underground') return 'Creuse les Souterrains pour des orbes, des fossiles et des plaques.'
    if (e.type === 'calendar')
      return `Un cadeau par jour pendant ${e.calendar.days.length} jours : ouvre la porte du jour !`
    if (e.type === 'shop') {
      const names = e.shop.items.map((r) => data.items[r.key]?.name).filter((n): n is string => !!n)
      return names.length
        ? `Prix spéciaux et objets rares en boutique : ${someNames(names, 3, lang)}.`
        : 'Prix spéciaux en boutique.'
    }
    return `Les Pokémon sauvages ont ${e.shiny.multiplier}× plus de chances d’être chromatiques, ${shinyPlace(data, e, 3, lang)}.`
  }
  if (e.type === 'cash') return `${cashBonus(e, lang)} on every ₽ you earn.`
  if (e.type === 'underground') return 'Dig for orbs, fossils and plates in the Underground.'
  if (e.type === 'calendar') return `A gift a day for ${e.calendar.days.length} days: open today’s door!`
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
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
const MOIS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
]
const SEMAINES: Record<string, string> = { '1': '1er', '2': '2e', '3': '3e', '4': '4e', last: 'dernier' }

/** "every Friday", "the 1st and last Friday of each month", "every year on 24 December" (as Admin → Events says it). */
export function repeatLabel(r: LiveRepeat, lang: PostLang = 'en'): string {
  if (lang === 'fr') {
    if (r.kind === 'yearly')
      return `chaque année le ${r.day === 1 ? '1er' : r.day} ${MOIS[r.month - 1] ?? '?'}`
    const jour = JOURS[r.weekday] ?? '?'
    if (!r.weeks.length) return `chaque ${jour}`
    const semaines = r.weeks
      .map((w) => `le ${SEMAINES[String(w)]!}`)
      .join(', ')
      .replace(/, ([^,]*)$/, ' et $1')
    return `${semaines} ${jour} de chaque mois`
  }
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
export function liveDetails(data: GameData, e: LiveEvent, lang: PostLang = 'en'): string[] {
  if (lang === 'fr') return liveDetailsFr(data, e)
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
  if (e.type === 'calendar')
    return [
      `🎁 A door opens every day for ${e.calendar.days.length} days, each with a gift: items, ₽ or Pokémon.`,
      '📅 Missed a day? Its door still opens the next day, then it’s gone.',
    ]
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

/** liveDetails in French, line for line. */
function liveDetailsFr(data: GameData, e: LiveEvent): string[] {
  if (e.type === 'cash')
    return [`💰 **${cashBonus(e, 'fr')}** sur chaque ₽ gagné : Dresseurs, raids, la roue… (hors ventes).`]
  if (e.type === 'shiny')
    return [
      `✨ Les Pokémon sauvages ont **${e.shiny.multiplier}×** plus de chances d’être chromatiques, ${shinyPlace(data, e, 12, 'fr')}.`,
    ]
  if (e.type === 'underground') {
    const cfg = ugCfg(data)
    const free = freeKitRules(cfg)
    const limit = Number(cfg.kits?.limit) > 0 ? ` · ${cfg.kits.limit} par Dresseur` : ''
    return [
      '⛏️ Les Souterrains ouvrent : creuse les parois pour des orbes, des fossiles et des plaques.',
      `🧰 Explorakits au Poké Market : ${pokedollars(kitPrice(cfg), 'fr')} l’unité${limit}.`,
      ...(free.amount > 0
        ? [
            `🎁 ${free.amount} kit${free.amount === 1 ? '' : 's'} gratuit${free.amount === 1 ? '' : 's'} toutes les ${String(Math.round(((free.everyMs * free.amount) / HOUR) * 10) / 10).replace('.', ',')} h (jusqu’à ${free.cap} en attente).`,
          ]
        : []),
    ]
  }
  if (e.type === 'calendar')
    return [
      `🎁 Une porte s’ouvre chaque jour pendant ${e.calendar.days.length} jours, chacune avec un cadeau : objets, ₽ ou Pokémon.`,
      '📅 Un jour manqué ? Sa porte s’ouvre encore le lendemain, puis c’est fini.',
    ]
  const rows = e.shop.items.filter((r) => data.items[r.key])
  if (!rows.length) return ['🛒 Prix spéciaux en boutique.']
  const MAX = 12
  const lines = rows.slice(0, MAX).map((r) => {
    const item = data.items[r.key]!
    const where =
      r.regions === 'all' || !r.regions.length
        ? ''
        : ` · à ${r.regions.map((id) => regionName(data, id, 'fr')).join(', ')}`
    return `• **${item.name}** ${pokedollars(livePrice(r, item), 'fr')}${r.limit ? ` · ${r.limit} par Dresseur` : ''}${where}`
  })
  if (rows.length > MAX) lines.push(`…et ${rows.length - MAX} autres en boutique.`)
  return ['🛒 Dans la Boutique spéciale :', ...lines]
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
    .filter((x) => liveTypeOn(data, x))
    .flatMap((x) => liveRuns(x, at, at + 1))
    .filter((x) => x.id !== e.id)
}

/** The start post's words, per language. */
const LIVE_WORDS = {
  en: {
    ends: 'Ends',
    who: 'Who',
    trainers: (n: number) => `Trainers with ${n}+ badge${n === 1 ? '' : 's'}`,
    comesBack: 'Comes back',
    alsoOn: 'Also on',
    addUp: ': the bonuses add up.',
    liveEvent: 'Live event',
    playNow: 'Play now',
    started: 'Started',
    username: 'Pokédice Events',
    isLive: (end: number) => `is live! Ends <t:${end}:R>.`,
  },
  fr: {
    ends: 'Fin',
    who: 'Pour qui',
    trainers: (n: number) => `Dresseurs avec ${n} badge${n === 1 ? '' : 's'} ou plus`,
    comesBack: 'Revient',
    alsoOn: 'Aussi en cours',
    addUp: ' : les bonus s’additionnent.',
    liveEvent: 'Événement',
    playNow: 'Jouer',
    started: 'Début',
    username: 'Pokédice Événements',
    isLive: (end: number) => `: c’est parti ! Fin <t:${end}:R>.`,
  },
} satisfies Record<PostLang, unknown>

/** The webhook message for an event that starts: its name, everything it does, how long it lasts, its banner. */
export function liveMessage(
  data: GameData,
  e: LiveEvent,
  opts: { roleId?: string; site?: string; lang?: PostLang } = {},
) {
  const site = opts.site ?? SITE
  const lang = opts.lang ?? 'en'
  const w = LIVE_WORDS[lang]
  const name = liveName(e, lang)
  const start = Math.round(Date.parse(e.start) / 1000)
  const end = Math.round(Date.parse(e.end) / 1000)
  const banner = liveBanner(e.banner, site)
  const rule = ruleOf(data, e)
  const alongside = liveAlongside(data, e)
  const firstItem =
    e.type === 'shop' ? e.shop.items.map((r) => data.items[r.key]?.spriteUrl).find(Boolean) : null
  const fields: NonNullable<DEmbed['fields']> = [
    { name: w.ends, value: `<t:${end}:R>\n<t:${end}:f>`, inline: true },
    ...(e.minBadges > 0 ? [{ name: w.who, value: w.trainers(e.minBadges), inline: true }] : []),
    ...(rule?.repeat ? [{ name: w.comesBack, value: repeatLabel(rule.repeat, lang), inline: true }] : []),
    ...(alongside.length
      ? [
          {
            name: w.alsoOn,
            value: `${someNames(
              alongside.map((x) => `${TYPE_EMOJI[x.type]} ${liveName(x, lang)}`),
              3,
              lang,
            )}${w.addUp}`,
          },
        ]
      : []),
  ]
  const embed: DEmbed = {
    author: { name: `${TYPE_EMOJI[e.type]} ${w.liveEvent} · ${typeName(e.type, lang)}` },
    title: name,
    url: site,
    description: [...liveDetails(data, e, lang), '', `**[${w.playNow}](${site})**`].join('\n'),
    color: TYPE_COLOR[e.type],
    fields,
    ...(firstItem ? { thumbnail: { url: liveBanner(firstItem, site)! } } : {}),
    ...(banner ? { image: { url: banner } } : {}),
    footer: { text: w.started },
    timestamp: new Date(start * 1000).toISOString(),
  }
  return {
    username: w.username,
    avatar_url: `${site}/characters/prof-oak.png`,
    content: `${opts.roleId ? `<@&${opts.roleId}> ` : ''}${TYPE_EMOJI[e.type]} **${name}** ${w.isLive(end)}`,
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
  const frenchWebhook = env.DISCORD_FRENCH_WEBHOOK?.trim()
  if (!webhook && !frenchWebhook && !dry) {
    console.log(
      'No DISCORD_EVENTS_WEBHOOK nor DISCORD_FRENCH_WEBHOOK: nothing posted. `pnpm discord --apply` writes them to .env.discord (docs/23).',
    )
    return
  }
  if (!frenchWebhook) console.log('No DISCORD_FRENCH_WEBHOOK: no French post in #français.')
  for (const { event, postAt } of due) {
    if (dry) {
      console.log(`${event.id}: would post at ${new Date(postAt).toISOString()}.`)
      console.log(JSON.stringify(liveMessage(data, event, { roleId, site }), null, 2))
      console.log(JSON.stringify(liveMessage(frenchData(data), event, { site, lang: 'fr' }), null, 2))
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
    if (webhook) {
      await postWebhook(webhook, liveMessage(data, fresh, { roleId, site }))
      console.log(`✓ ${event.id} posted.`)
    }
    // No ping in French: the Event Pings role is the English channel's.
    if (frenchWebhook) {
      await postWebhook(frenchWebhook, liveMessage(frenchData(data), fresh, { site, lang: 'fr' }))
      console.log(`✓ ${event.id} posted in French.`)
    }
  }
}

// Run as a script, not when a test imports liveMessage.
if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/discord/live-event-post.ts')) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
