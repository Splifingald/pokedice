/**
 * pnpm discord:raid               — post today's raid to #daily-raid (the DISCORD_RAID_WEBHOOK webhook).
 * pnpm discord:raid --dry         — print the message instead of posting it.
 * --day 2026-12-25                — another UTC day's raid (to check the calendar).
 * --force                         — post even while raids aren't switched on for everyone in Admin → Events.
 *
 * GitHub Actions runs it every day just after midnight UTC (.github/workflows/discord-raid.yml). The raid comes from the
 * game's own calendar (engine/raidCalendar.ts) over the live content, so the post always names the raid players get.
 * Nothing is posted while Admin → Events has raids Off or On for admin.
 */
import { createClient } from '@supabase/supabase-js'
import { BUNDLE, withStatics } from '@/config/bundle'
import { isPlayableBundle, rowsToBundle } from '@/config/mapping'
import { fetchAllRows } from '@/config/remote'
import showdown from '@/data/showdown-sprites.json'
import { ballBonus, catchChance, catchValueOf, compileGameData, msToUtcMidnight, raidOfDay, regionOfArea, utcDay, type GameData, type RaidDay } from '@/engine'
// The map, not fx/areaArt: that one reaches the i18n sheet, which only Vite can load.
import { AREA_ART, ART_GEOMETRY } from '@/fx/areaArtMap'
import { showdownSpriteUrl, type ShowdownEntry } from '@/lib/showdown'
import { postWebhook, type DEmbed } from './api'
import { loadEnv } from './env'
import { COLORS, SITE } from './layout'

const KIND_LABEL: Record<RaidDay['kind'], string> = {
  special: 'Special raid',
  mythical: 'Mythical raid',
  legendary: 'Legendary raid',
  pseudo: 'Raid',
  filler: 'Raid',
}

/** The raid Pokémon's front sprite: Showdown's animated one when there is one, else the game's own picture. */
export function raidSprite(dex: number, shiny: boolean, site = SITE): string {
  const e = (showdown as unknown as Record<string, ShowdownEntry | undefined>)[String(dex)]
  const kind = e?.v[shiny ? 2 : 0]
  if (e && (kind === 'a' || kind === 'g')) return showdownSpriteUrl(e.id, shiny ? 'front-shiny' : 'front', kind)
  return `${site}/pokemon/${String(dex).padStart(3, '0')}_front${shiny ? '_shiny' : ''}.png`
}

export interface RaidMessageOptions {
  /** The role to ping: Raid Pings' id. */
  roleId?: string
  site?: string
}

/** The webhook message for one day's raid: what the raid card in the game shows, plus each ball's odds. */
export function raidMessage(data: GameData, raid: RaidDay, day: string, opts: RaidMessageOptions = {}) {
  const site = opts.site ?? SITE
  const cfg = data.config.events.raid
  const species = data.species[raid.dex]
  const name = species?.name ?? `#${raid.dex}`
  const area = data.areas.find((a) => a.id === raid.areaId)
  const region = area ? data.regions.find((r) => r.id === regionOfArea(area)) : undefined
  const value = catchValueOf(data, raid.dex)
  const balls = Object.values(data.items)
    .filter((it) => it.effect.kind === 'ball')
    .sort((a, b) => ballBonus(a) - ballBonus(b))
  const pct = (bonus: number) => `${Math.round(catchChance(value, bonus) * 100)}%`
  const odds = [`No ball ${pct(0)}`, ...balls.map((b) => `${b.name} ${pct(ballBonus(b))}`)].join(' · ')
  const start = Date.parse(`${day}T00:00:00Z`)
  const next = Math.round((start + msToUtcMidnight(start)) / 1000)
  const art = AREA_ART[raid.areaId]
  const picture = art && ART_GEOMETRY[art] ? `/area-art/${art}.png` : null

  const embed: DEmbed = {
    author: { name: KIND_LABEL[raid.kind] },
    title: raid.shiny ? `✨ Shiny ${name}` : name,
    url: site,
    description: [
      `Lv.${cfg.level} · ${cfg.bars} HP bars`,
      area ? `Its lair: **${area.name}**${region ? `, ${region.name}` : ''}` : '',
      `Team up with up to 2 friends. A new raid comes <t:${next}:R>.`,
    ]
      .filter(Boolean)
      .join('\n'),
    color: raid.shiny ? COLORS.gold : COLORS.red,
    fields: [
      { name: 'Catch value', value: String(value), inline: true },
      { name: 'Catch odds once its bars are broken', value: odds },
    ],
    thumbnail: { url: raidSprite(raid.dex, raid.shiny, site) },
    ...(picture ? { image: { url: `${site}${picture}` } } : {}),
    footer: { text: 'The same raid for every trainer · new raid every day at 00:00 UTC' },
    timestamp: new Date(start).toISOString(),
  }
  return {
    username: 'Pokédice Raids',
    avatar_url: `${site}/discord/raid.png`,
    content: `${opts.roleId ? `<@&${opts.roleId}> ` : ''}Today's raid is up: **${raid.shiny ? `Shiny ${name}` : name}**!`,
    embeds: [embed],
    allowed_mentions: { parse: [], roles: opts.roleId ? [opts.roleId] : [] },
  }
}

/** The content players get: the live tables when they read as playable, else the bundled copy. */
async function liveData(env: Record<string, string | undefined>): Promise<{ data: GameData; source: string }> {
  const url = env.VITE_SUPABASE_URL?.trim()
  const key = env.VITE_SUPABASE_ANON_KEY?.trim()
  if (url && key) {
    try {
      const client = createClient(url, key, { auth: { persistSession: false } })
      const raw = rowsToBundle(await fetchAllRows(client))
      if (isPlayableBundle(raw)) return { data: compileGameData(withStatics(raw)), source: 'Supabase' }
      console.warn('! The live content is not playable: using the bundled content.')
    } catch (err) {
      console.warn(`! Could not read Supabase (${err instanceof Error ? err.message : String(err)}): using the bundled content.`)
    }
  } else console.warn('! No VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY: using the bundled content, not the live one.')
  return { data: compileGameData(BUNDLE), source: 'the bundle' }
}

async function main() {
  const argv = process.argv.slice(2)
  const dry = argv.includes('--dry')
  const force = argv.includes('--force')
  const dayArg = argv[argv.indexOf('--day') + 1]
  const day = argv.includes('--day') && dayArg && /^\d{4}-\d{2}-\d{2}$/.test(dayArg) ? dayArg : utcDay(Date.now())
  const env = await loadEnv()

  const { data, source } = await liveData(env)
  const access = data.config.events.raid.access
  if (access !== 'all' && !force && !dry) {
    console.log(`Raids are "${access ?? 'off'}" in Admin → Events, not on for everyone: nothing posted.`)
    return
  }
  const raid = raidOfDay(data, day)
  if (!raid) {
    console.log(`No raid on ${day} (an empty raid pool?): nothing posted.`)
    return
  }
  const message = raidMessage(data, raid, day, { roleId: env.DISCORD_RAID_ROLE?.trim() || undefined, site: env.POKEDICE_SITE?.trim() || SITE })
  console.log(`${day}: ${raid.shiny ? 'shiny ' : ''}#${raid.dex} ${data.species[raid.dex]?.name} (${raid.kind}), from ${source}.`)
  if (dry) {
    console.log(JSON.stringify(message, null, 2))
    return
  }
  const webhook = env.DISCORD_RAID_WEBHOOK?.trim()
  if (!webhook) {
    console.log('No DISCORD_RAID_WEBHOOK: nothing posted. `pnpm discord --apply` writes it to .env.discord (docs/23).')
    return
  }
  await postWebhook(webhook, message)
  console.log('✓ Posted.')
}

// Run as a script, not when a test imports raidMessage.
if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/discord/raid-post.ts')) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
