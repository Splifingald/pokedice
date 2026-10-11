/**
 * pnpm discord                     — compare the Discord server with scripts/discord/layout.ts and list every change
 *                                    it would make. Reads only.
 * pnpm discord --apply             — make those changes, then check the server matches.
 * --archive-unmanaged              — also move the channels the layout doesn't know into a read-only Archive category.
 *
 * Needs DISCORD_BOT_TOKEN and DISCORD_GUILD_ID in .env.discord (docs/23-DISCORD-SERVER.md). Each run keeps a copy of
 * the server as it found it in scripts/.cache/discord/, and --apply writes the webhook URLs and ping role ids the
 * posters need back into .env.discord. Nothing is ever deleted.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { DiscordError, discordClient, type DAutomodRule, type DChannel, type DGuild, type DMessage, type DOnboarding, type Discord, type DWebhook } from './api'
import { loadEnv, ROOT, writeDiscordEnv } from './env'
import { LAYOUT, type Layout } from './layout'
import { blockers, matchChannels, PHASES, type PlanOptions, type Snapshot } from './plan'

const isNew = (id: string) => id.startsWith('new:')

async function snapshot(api: Discord, guildId: string): Promise<Snapshot> {
  const me = await api.get<{ id: string }>('/users/@me')
  const guild = await api.get<DGuild & { approximate_member_count?: number }>(`/guilds/${guildId}?with_counts=true`)
  const channels = await api.get<DChannel[]>(`/guilds/${guildId}/channels`)
  const member = await api.get<{ roles: string[] }>(`/guilds/${guildId}/members/${me.id}`)
  const automod = await api.get<DAutomodRule[]>(`/guilds/${guildId}/auto-moderation/rules`).catch(() => [])
  const onboarding = await api.get<DOnboarding>(`/guilds/${guildId}/onboarding`).catch(() => null)
  const botTop = Math.max(0, ...guild.roles.filter((r) => member.roles.includes(r.id)).map((r) => r.position))
  return {
    guild,
    roles: guild.roles,
    channels,
    botId: me.id,
    botRoles: member.roles,
    botTop,
    automod,
    onboarding,
    messages: {},
    othersPosted: {},
    webhooks: {},
    env: {},
  }
}

/** The bot's own posts and the webhooks, in the channels the last phase works on (channels not made yet have none). */
async function readContent(api: Discord, snap: Snapshot, layout: Layout): Promise<void> {
  const chans = matchChannels(snap, layout)
  for (const m of layout.messages) {
    const c = chans.get(m.channel)
    if (!c || isNew(c.id)) continue
    const recent = await api.get<DMessage[]>(`/channels/${c.id}/messages?limit=50`)
    snap.messages[c.id] = recent.filter((x) => x.author.id === snap.botId).reverse()
    snap.othersPosted[c.id] = recent.filter((x) => x.author.id !== snap.botId).length
  }
  for (const w of layout.webhooks) {
    const c = chans.get(w.channel)
    if (!c || isNew(c.id)) continue
    snap.webhooks[c.id] = await api.get<DWebhook[]>(`/channels/${c.id}/webhooks`)
  }
}

/** Runs every phase. Applying makes each call; planning only plays its effect on the snapshot. Returns the count. */
async function runPhases(api: Discord, snap: Snapshot, opts: PlanOptions, apply: boolean, quiet = false): Promise<{ changes: number; failed: number }> {
  let changes = 0
  let failed = 0
  for (const phase of PHASES) {
    if (phase.name === 'Posts and webhooks') await readContent(api, snap, LAYOUT)
    const { actions, notes } = phase.run(snap, LAYOUT, opts)
    if (!quiet && (actions.length || notes.length)) console.log(`\n${phase.name}`)
    for (const note of notes) if (!quiet) console.log(`  !  ${note}`)
    for (const a of actions) {
      changes++
      if (!quiet) {
        console.log(`  ${a.label}`)
        for (const d of a.detail ?? []) if (d) console.log(`       ${d}`)
      }
      if (!apply) {
        a.effect(snap, undefined)
        continue
      }
      try {
        const res = await api.send(a.method, a.path, a.body)
        a.effect(snap, res ?? undefined)
      } catch (err) {
        failed++
        console.log(`     ✗ ${err instanceof DiscordError ? `${err.status} ${JSON.stringify(err.body)}` : String(err)}`)
      }
    }
  }
  return { changes, failed }
}

async function main() {
  const argv = process.argv.slice(2)
  const apply = argv.includes('--apply')
  const opts: PlanOptions = { archiveUnmanaged: argv.includes('--archive-unmanaged') }
  const env = await loadEnv()
  const token = env.DISCORD_BOT_TOKEN?.trim()
  const guildId = env.DISCORD_GUILD_ID?.trim()
  if (!token || !guildId) {
    console.error('Put DISCORD_BOT_TOKEN and DISCORD_GUILD_ID in .env.discord first (docs/23-DISCORD-SERVER.md, steps 1 and 2).')
    process.exit(1)
  }
  const api = discordClient(token)

  let snap: Snapshot
  try {
    snap = await snapshot(api, guildId)
  } catch (err) {
    if (err instanceof DiscordError && err.status === 401) console.error('Discord refused the token: copy it again (Developer Portal → Bot → Reset Token).')
    else if (err instanceof DiscordError && (err.status === 403 || err.status === 404)) {
      const me = await api.get<{ id: string }>('/users/@me').catch(() => null)
      console.error(`The bot isn't in server ${guildId}, or that isn't the server's id.`)
      if (me)
        console.error(
          `Invite it: https://discord.com/oauth2/authorize?client_id=${me.id}&scope=bot&permissions=8&guild_id=${guildId}&disable_guild_select=true`,
        )
    } else console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  }

  const cache = path.join(ROOT, 'scripts/.cache/discord')
  await mkdir(cache, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  await writeFile(path.join(cache, `server-${stamp}.json`), JSON.stringify(snap, null, 2))

  const members = (snap.guild as { approximate_member_count?: number }).approximate_member_count
  const botRole = snap.roles.find((r) => snap.botRoles.includes(r.id) && r.position === snap.botTop)
  console.log(
    `${snap.guild.name}${members ? ` · ${members} members` : ''} · Community ${snap.guild.features.includes('COMMUNITY') ? 'on' : 'off'} · ` +
      `bot role "${botRole?.name ?? '?'}" at ${snap.botTop} of ${Math.max(...snap.roles.map((r) => r.position))}`,
  )

  const blocked = blockers(snap)
  for (const b of blocked) console.log(`\n✗ ${b}`)
  if (apply && blocked.length) {
    console.error('\nNothing was changed: fix the above first, then run again.')
    process.exit(1)
  }

  const { changes, failed } = await runPhases(api, snap, opts, apply)

  if (!apply) {
    console.log(
      changes
        ? `\n${changes} change(s). Nothing was changed: run \`pnpm discord --apply${opts.archiveUnmanaged ? ' --archive-unmanaged' : ''}\` to make them.`
        : '\n✓ The server already matches the layout.',
    )
    return
  }

  // Check: plan again against the server as it now is.
  const after = await snapshot(api, guildId)
  const left = await runPhases(api, after, opts, false, true)
  const written = await writeDiscordEnv({ ...snap.env, ...after.env })
  console.log(`\n${changes - failed} of ${changes} change(s) made.${failed ? ` ${failed} failed (above).` : ''}`)
  if (written.length) console.log(`.env.discord updated: ${written.join(', ')}.`)
  console.log(left.changes ? `! ${left.changes} difference(s) remain: run \`pnpm discord\` to see them.` : '✓ The server matches the layout.')
  if (failed) process.exit(1)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
