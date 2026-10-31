/**
 * pnpm discord:live-week          — post this week's live events calendar to #events (DISCORD_EVENTS_WEBHOOK).
 * pnpm discord:live-week --dry    — print the message instead of posting it.
 * --at 2026-12-21T07:23:00Z       — run as if it were then (to check another week).
 * --force                         — post even while live events aren't switched on for everyone in Admin → Events.
 *
 * GitHub Actions runs it every Monday morning (.github/workflows/discord-live-week.yml). The week is Monday 00:00 to
 * Sunday 24:00 UTC: a calendar of its days with a bar per event, then each event in a line (what it does, when, in
 * every reader's own time zone), and the first one after the week (docs/50). A week without an event posts nothing.
 * Each start is posted on its own by live-event-post.ts. Nothing is posted while live events are Off or On for admin.
 * With DISCORD_FRENCH_WEBHOOK, the calendar goes to #🥖-français too, in French (french.ts).
 */
import { liveEvents, liveRuns, liveState, type GameData, type LiveEvent } from '@/engine'
import { postWebhook, type DEmbed } from './api'
import { liveData } from './content'
import { loadEnv } from './env'
import { frenchData, type PostLang } from './french'
import { COLORS, SITE } from './layout'
import { liveBanner, liveLine, liveName, repeatLabel, TYPE_EMOJI } from './live-event-post'

const DAY = 86_400_000
/** How far after the week the "Next up" line looks. */
const NEXT_WEEKS = 4
/** The calendar's rows and list's lines: past this, "+N more" (Discord cuts a description at 4096 characters). */
export const WEEK_MAX = 12
/** The calendar's name column, so a row fits a phone: 13 + 7 days × 2 = 27 characters. */
const NAME_WIDTH = 12

/** This week, Monday 00:00 UTC to the next Monday, around `now`. */
export function weekOf(now: number): { from: number; to: number } {
  const midnight = Math.floor(now / DAY) * DAY
  const from = midnight - ((new Date(midnight).getUTCDay() + 6) % 7) * DAY
  return { from, to: from + 7 * DAY }
}

/** The runs on at some point this week and not over at `now`, soonest first. */
export function weekRuns(data: GameData, now: number): LiveEvent[] {
  const { from, to } = weekOf(now)
  return liveEvents(data)
    .flatMap((e) => liveRuns(e, from, to))
    .filter((e) => liveState(e, now) !== 'ended')
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || a.id.localeCompare(b.id))
}

/** The first run starting after this week (up to four weeks on), for "Next up". */
export function nextAfterWeek(data: GameData, now: number): LiveEvent | null {
  const { to } = weekOf(now)
  return (
    liveEvents(data)
      .flatMap((e) => liveRuns(e, to, to + NEXT_WEEKS * 7 * DAY))
      .filter((e) => Date.parse(e.start) >= to)
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0] ?? null
  )
}

// A code block keeps the columns straight, but emoji there are two characters wide on some phones: names go in bare.
const plain = (s: string) =>
  s
    .replace(/\p{Extended_Pictographic}|️|‍/gu, '')
    .replace(/\s+/g, ' ')
    .trim()

const fit = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s.padEnd(n))

/**
 * The week as a little chart: a column per day (UTC), a row per event, a bar on the days it is on.
 *   ` M T W T F S S`
 *   `Shiny Parade ██████· · · · `
 */
export function weekChart(runs: LiveEvent[], from: number, lang: PostLang = 'en'): string {
  const head = `${' '.repeat(NAME_WIDTH + 1)}${lang === 'fr' ? 'L M M J V S D ' : 'M T W T F S S '}`
  const rows = runs.slice(0, WEEK_MAX).map((e) => {
    const s = Date.parse(e.start)
    const end = Date.parse(e.end)
    const days = Array.from({ length: 7 }, (_, i) =>
      s < from + (i + 1) * DAY && end > from + i * DAY ? '██' : '· ',
    ).join('')
    return `${fit(plain(liveName(e, lang)) || e.type, NAME_WIDTH)} ${days}`
  })
  return ['```', head, ...rows, '```'].join('\n')
}

const DATE = (ms: number, lang: PostLang = 'en') =>
  new Date(ms).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })

/** The calendar's words, per language. */
const WEEK_WORDS = {
  en: {
    onNow: (end: number) => `🟢 **On now**, ends <t:${end}:R>`,
    badges: (n: number) => `🏅 ${n}+ badge${n === 1 ? '' : 's'}`,
    more: (n: number) => `…and ${n} more in the game.`,
    next: 'Next up:',
    playNow: 'Play now',
    author: '🗓️ Live events calendar',
    title: (from: string, to: string) => `This week: ${from} – ${to}`,
    footer:
      'Times are in your own time zone; the calendar’s days are UTC. Each event gets its own post when it starts.',
    content: (n: number) => `**${n} live event${n === 1 ? '' : 's'} this week!**`,
    username: 'Pokédice Events',
  },
  fr: {
    onNow: (end: number) => `🟢 **En cours**, fin <t:${end}:R>`,
    badges: (n: number) => `🏅 ${n} badge${n === 1 ? '' : 's'} ou plus`,
    more: (n: number) => `…et ${n} autres dans le jeu.`,
    next: 'Ensuite :',
    playNow: 'Jouer',
    author: '🗓️ Calendrier des événements',
    title: (from: string, to: string) => `Cette semaine : ${from} – ${to}`,
    footer:
      'Les heures sont dans ton fuseau horaire ; les jours du calendrier sont en UTC. Chaque événement a son propre message quand il commence.',
    content: (n: number) => `**${n} événement${n === 1 ? '' : 's'} cette semaine !**`,
    username: 'Pokédice Événements',
  },
} satisfies Record<PostLang, unknown>

/** One event of the list: its name and what it does, then when (each reader's own time), how it comes back, who. */
export function weekLine(data: GameData, e: LiveEvent, now: number, lang: PostLang = 'en'): string {
  const w = WEEK_WORDS[lang]
  const start = Math.round(Date.parse(e.start) / 1000)
  const end = Math.round(Date.parse(e.end) / 1000)
  const rule = e.ruleId ? liveEvents(data).find((x) => x.id === e.ruleId) : null
  const when = liveState(e, now) === 'live' ? w.onNow(end) : `<t:${start}:f> → <t:${end}:f>`
  const extra = [
    rule?.repeat ? `🔁 ${repeatLabel(rule.repeat, lang)}` : '',
    e.minBadges > 0 ? w.badges(e.minBadges) : '',
  ].filter(Boolean)
  return [
    `${TYPE_EMOJI[e.type]} **${liveName(e, lang)}**${lang === 'fr' ? ' :' : ':'} ${liveLine(data, e, lang)}`,
    [when, ...extra].join(' · '),
  ].join('\n')
}

/** The webhook message for the week, or null when no event is on this week. */
export function weekMessage(data: GameData, now: number, opts: { site?: string; lang?: PostLang } = {}) {
  const site = opts.site ?? SITE
  const lang = opts.lang ?? 'en'
  const w = WEEK_WORDS[lang]
  const { from, to } = weekOf(now)
  const runs = weekRuns(data, now)
  if (!runs.length) return null
  const next = nextAfterWeek(data, now)
  const more = runs.length - WEEK_MAX
  const description = [
    weekChart(runs, from, lang),
    runs
      .slice(0, WEEK_MAX)
      .map((e) => weekLine(data, e, now, lang))
      .join('\n\n'),
    more > 0 ? w.more(more) : '',
    next
      ? `**${w.next}** ${TYPE_EMOJI[next.type]} ${liveName(next, lang)}, <t:${Math.round(Date.parse(next.start) / 1000)}:R>`
      : '',
    `**[${w.playNow}](${site})**`,
  ]
    .filter(Boolean)
    .join('\n\n')
  // The first event's picture, or the next one's that has a picture.
  const banner = runs.map((e) => liveBanner(e.banner, site)).find(Boolean)
  const embed: DEmbed = {
    author: { name: w.author },
    title: w.title(DATE(from, lang), DATE(to - DAY, lang)),
    url: site,
    description,
    color: COLORS.sky,
    ...(banner ? { image: { url: banner } } : {}),
    footer: { text: w.footer },
  }
  return {
    username: w.username,
    avatar_url: `${site}/characters/prof-oak.png`,
    content: w.content(runs.length),
    embeds: [embed],
    allowed_mentions: { parse: [] },
  }
}

async function main() {
  const argv = process.argv.slice(2)
  const dry = argv.includes('--dry')
  const force = argv.includes('--force')
  const atArg = argv.includes('--at') ? Date.parse(argv[argv.indexOf('--at') + 1] ?? '') : NaN
  const now = Number.isFinite(atArg) ? atArg : Date.now()
  const env = await loadEnv()
  const site = env.POKEDICE_SITE?.trim() || SITE

  const { data, source } = await liveData(env)
  const access = data.config.liveEvents?.access
  if (access !== 'all' && !force && !dry) {
    console.log(
      `Live events are "${access ?? 'off'}" in Admin → Events, not on for everyone: nothing posted.`,
    )
    return
  }
  const message = weekMessage(data, now, { site })
  if (!message) {
    console.log(
      `No live event this week (${new Date(weekOf(now).from).toISOString().slice(0, 10)}), from ${source}: nothing posted.`,
    )
    return
  }
  const french = weekMessage(frenchData(data), now, { site, lang: 'fr' })!
  if (dry) {
    console.log(JSON.stringify(message, null, 2))
    console.log(JSON.stringify(french, null, 2))
    return
  }
  const webhook = env.DISCORD_EVENTS_WEBHOOK?.trim()
  const frenchWebhook = env.DISCORD_FRENCH_WEBHOOK?.trim()
  if (webhook) {
    await postWebhook(webhook, message)
    console.log('✓ Posted.')
  } else
    console.log(
      'No DISCORD_EVENTS_WEBHOOK: nothing posted in #events. `pnpm discord --apply` writes it to .env.discord (docs/23).',
    )
  if (frenchWebhook) {
    await postWebhook(frenchWebhook, french)
    console.log('✓ Posted in French.')
  } else console.log('No DISCORD_FRENCH_WEBHOOK: no French post in #français.')
}

// Run as a script, not when a test imports weekMessage.
if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/discord/live-week-post.ts')) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
