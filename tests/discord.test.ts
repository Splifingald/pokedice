// The Discord tools (docs/23): the server setup's plan, the daily raid post and the patch notes.
import { describe, expect, it } from 'vitest'
import type { DChannel, DRole } from '../scripts/discord/api'
import { LAYOUT } from '../scripts/discord/layout'
import { P } from '../scripts/discord/perms'
import { blockers, contentPhase, fillMentions, matchChannels, matchRoles, planAll, rolesPhase, type Snapshot } from '../scripts/discord/plan'
import { raidMessage } from '../scripts/discord/raid-post'
import { DESCRIPTION_MAX, MESSAGE_MAX, noteMessages, parseNote, splitText } from '../scripts/discord/patch-notes'
import { raidOfDay } from '@/engine'
import { data } from './fixtures'

const UNKNOWN_BIT = 1n << 47n

/** A server as Discord makes it in French, after "Enable Community" created #rules and #moderator-only. */
function frenchServer(): Snapshot {
  const role = (id: string, name: string, position: number, permissions: bigint, managed = false): DRole => ({
    id,
    name,
    position,
    permissions: String(permissions),
    color: 0,
    hoist: false,
    mentionable: false,
    managed,
  })
  const ch = (id: string, name: string, type: number, position: number, parent_id: string | null, extra: Partial<DChannel> = {}): DChannel => ({
    id,
    name,
    type,
    position,
    parent_id,
    permission_overwrites: [],
    ...extra,
  })
  return {
    guild: {
      id: 'g',
      name: 'Pokédice',
      owner_id: 'owner',
      features: ['COMMUNITY'],
      roles: [],
      verification_level: 1,
      default_message_notifications: 0,
      explicit_content_filter: 2,
      system_channel_id: 'gen',
      system_channel_flags: 0,
      rules_channel_id: 'rules',
      public_updates_channel_id: 'modonly',
      safety_alerts_channel_id: null,
      description: null,
    },
    roles: [
      role('g', '@everyone', 0, P.VIEW_CHANNEL | P.SEND_MESSAGES | P.MENTION_EVERYONE | UNKNOWN_BIT),
      role('membre', 'Membre', 1, P.SEND_MESSAGES),
      role('bot', 'Pokédice', 2, P.ADMINISTRATOR, true),
      role('above', 'Admin', 3, P.ADMINISTRATOR),
    ],
    channels: [
      ch('cat-text', 'Salons textuels', 4, 0, null),
      ch('gen', 'général', 0, 0, 'cat-text'),
      ch('flood', '💬-flood', 0, 3, 'cat-text'),
      ch('fr', '🥖-french-only', 0, 4, 'cat-text'),
      ch('secret', 'secret', 0, 1, 'cat-text', { permission_overwrites: [{ id: 'g', type: 0, allow: '0', deny: String(P.VIEW_CHANNEL) }] }),
      ch('memes', 'memes', 0, 2, 'cat-text', { permission_overwrites: [{ id: 'someone', type: 1, allow: String(P.SEND_MESSAGES), deny: '0' }] }),
      ch('cat-voice', 'Salons vocaux', 4, 1, null),
      ch('vgen', 'Général', 2, 0, 'cat-voice'),
      ch('rules', 'rules', 0, 0, null),
      ch('modonly', 'moderator-only', 0, 1, null, { permission_overwrites: [{ id: 'g', type: 0, allow: '0', deny: String(P.VIEW_CHANNEL) }] }),
    ],
    botId: 'botuser',
    botRoles: ['bot'],
    botTop: 2,
    automod: [],
    onboarding: { prompts: [], default_channel_ids: [], enabled: false, mode: 0 },
    messages: {},
    othersPosted: {},
    webhooks: {},
    env: {},
  }
}

describe('Discord server setup', () => {
  it("adopts what is there, under the layout's exact names (emoji included)", () => {
    const snap = frenchServer()
    planAll(snap, LAYOUT)
    const chans = matchChannels(snap, LAYOUT)
    expect(chans.get('general')?.id).toBe('gen')
    expect(chans.get('general')?.name).toBe('🎲-general')
    expect(chans.get('lounge')).toMatchObject({ id: 'vgen', name: '🎧 Lounge' })
    expect(chans.get('rules')?.id).toBe('rules')
    expect(chans.get('modUpdates')).toMatchObject({ id: 'modonly', name: '📬-mod-updates' })
    // Moved under the layout's categories.
    const cat = (key: string) => snap.channels.find((c) => c.type === 4 && c.name === LAYOUT.categories.find((x) => x.key === key)!.name)!.id
    expect(chans.get('rules')?.parent_id).toBe(cat('start'))
    expect(chans.get('general')?.parent_id).toBe(cat('game'))
    expect(chans.get('help')?.type).toBe(15)
    expect(chans.get('dailyRaid')?.type).toBe(5)
  })

  it("adopts the server's own channels through aliases, then leaves the names alone", () => {
    const snap = frenchServer()
    const actions = planAll(snap, LAYOUT)
    const chans = matchChannels(snap, LAYOUT)
    expect(chans.get('offTopic')).toMatchObject({ id: 'flood', name: '💬-off-topic' })
    expect(chans.get('fr')).toMatchObject({ id: 'fr', name: '🥖-français' })
    expect(actions.some((a) => a.path === '/channels/rules' && (a.body as { name?: string }).name)).toBe(true)
    // Second run: names now equal the layout's, nothing renamed again.
    expect(planAll(snap, LAYOUT).filter((a) => (a.body as { name?: string } | null)?.name)).toEqual([])
  })

  it('makes the missing roles, orders them, and keeps the permission bits it does not know', () => {
    const snap = frenchServer()
    const actions = planAll(snap, LAYOUT)
    // "Admin" is the server's admin role: adopted as the Professor, not doubled.
    expect(actions.filter((a) => a.label.startsWith('+ role')).map((a) => a.label)).toEqual([
      '+ role Gym Leader',
      '+ role Raid Pings',
      '+ role Patch Notes Pings',
      '+ role Event Pings',
    ])
    expect(matchRoles(snap, LAYOUT).get('professor')?.id).toBe('above')
    const everyone = BigInt(snap.roles.find((r) => r.id === 'g')!.permissions)
    expect(everyone & UNKNOWN_BIT).toBe(UNKNOWN_BIT)
    expect(everyone & P.MENTION_EVERYONE).toBe(0n)
    // Under the bot: staff, then the server's own roles, then the ping roles.
    const below = snap.roles.filter((r) => r.id !== 'g' && r.position < snap.botTop).sort((a, b) => b.position - a.position)
    expect(below.map((r) => r.name)).toEqual(['Gym Leader', 'Membre', 'Raid Pings', 'Patch Notes Pings', 'Event Pings'])
  })

  it('never edits a role above the bot, and says how to fix it', () => {
    const snap = frenchServer()
    const { actions, notes } = rolesPhase(snap, LAYOUT, { archiveUnmanaged: false })
    expect(actions.some((a) => a.path.endsWith('/roles/above'))).toBe(false)
    expect(notes).toEqual([expect.stringContaining('"Admin" sits above the bot')])
  })

  it('finds nothing left to do on a second run', () => {
    const snap = frenchServer()
    expect(planAll(snap, LAYOUT).length).toBeGreaterThan(20)
    expect(planAll(snap, LAYOUT).map((a) => a.label)).toEqual([])
    expect(planAll(snap, LAYOUT, { archiveUnmanaged: true }).length).toBeGreaterThan(0)
    expect(planAll(snap, LAYOUT, { archiveUnmanaged: true }).map((a) => a.label)).toEqual([])
  })

  it('archives the rest read-only, and a private channel stays private', () => {
    const snap = frenchServer()
    planAll(snap, LAYOUT, { archiveUnmanaged: true })
    const archive = snap.channels.find((c) => c.type === 4 && c.name === 'Archive')!
    const secret = snap.channels.find((c) => c.id === 'secret')!
    const memes = snap.channels.find((c) => c.id === 'memes')!
    expect(secret.parent_id).toBe(archive.id)
    expect(memes.parent_id).toBe(archive.id)
    const everyoneDeny = (c: DChannel) => BigInt(c.permission_overwrites!.find((o) => o.id === 'g')!.deny)
    expect(everyoneDeny(secret) & P.VIEW_CHANNEL).toBe(P.VIEW_CHANNEL)
    expect(everyoneDeny(memes) & P.SEND_MESSAGES).toBe(P.SEND_MESSAGES)
    expect(memes.permission_overwrites!.find((o) => o.id === 'someone')).toBeTruthy()
    // Nothing is ever deleted.
    expect(frenchServer().channels.every((c) => snap.channels.some((x) => x.id === c.id))).toBe(true)
  })

  it('keeps overwrites for members and roles the layout does not manage', () => {
    const snap = frenchServer()
    snap.channels.find((c) => c.id === 'gen')!.permission_overwrites = [{ id: 'membre', type: 0, allow: String(P.ATTACH_FILES), deny: '0' }]
    planAll(snap, LAYOUT)
    expect(snap.channels.find((c) => c.id === 'gen')!.permission_overwrites).toContainEqual({ id: 'membre', type: 0, allow: String(P.ATTACH_FILES), deny: '0' })
  })

  it('asks for Community and an administrator bot before applying', () => {
    const snap = frenchServer()
    expect(blockers(snap)).toEqual([])
    snap.guild.features = []
    snap.roles.find((r) => r.id === 'bot')!.permissions = String(P.MANAGE_CHANNELS)
    expect(blockers(snap)).toHaveLength(2)
  })

  it('leaves the rules post out while the rules channel has posts of yours', () => {
    const snap = frenchServer()
    snap.othersPosted.rules = 1
    const { actions, notes } = contentPhase(snap, LAYOUT, { archiveUnmanaged: false })
    expect(actions.some((a) => a.path === '/channels/rules/messages')).toBe(false)
    expect(notes).toEqual([expect.stringContaining('already has posts of yours')])
    snap.othersPosted.rules = 0
    expect(contentPhase(snap, LAYOUT, { archiveUnmanaged: false }).actions.some((a) => a.path === '/channels/rules/messages')).toBe(true)
  })

  it('writes mentions with real ids, and names for what is not made yet', () => {
    const snap = frenchServer()
    expect(fillMentions('{#general} {#help}', snap, LAYOUT)).toBe('<#gen> #🙋-help')
  })

  it('sets up Channels & Roles with the ping roles and the French channel', () => {
    const snap = frenchServer()
    planAll(snap, LAYOUT)
    const roles = matchRoles(snap, LAYOUT)
    const chans = matchChannels(snap, LAYOUT)
    const [pings, langs] = snap.onboarding!.prompts
    expect(pings!.options.map((o) => o.role_ids[0])).toEqual([roles.get('raidPings')!.id, roles.get('patchPings')!.id, roles.get('eventPings')!.id])
    expect(langs!.options.map((o) => o.channel_ids[0])).toEqual([chans.get('fr')!.id])
    expect(snap.onboarding!.default_channel_ids).not.toContain(chans.get('fr')!.id)
    expect(snap.onboarding!.default_channel_ids).toContain(chans.get('general')!.id)
  })
})

describe('the daily raid post', () => {
  const day = '2026-10-11'
  const raid = raidOfDay(data, day)!

  it("names the game's raid of the day in a small card: level, bars and catch value only", () => {
    const msg = raidMessage(data, raid, day, { roleId: '42' })
    const e = msg.embeds[0]!
    expect(e.author!.name).toBe("Today's raid")
    expect(e.title).toContain(data.species[raid.dex]!.name)
    expect(e.description).toBe(`Lv.${data.config.events.raid.level} · ${data.config.events.raid.bars} HP bars`)
    expect(e.fields!.map((f) => f.name)).toEqual(['Catch value'])
    expect(e.image).toBeUndefined()
    expect(msg.content).toBe('<@&42>')
    expect(msg.allowed_mentions.roles).toEqual(['42'])
  })

  it('has no text above the card without a role, and a shiny raid says so', () => {
    const msg = raidMessage(data, { ...raid, shiny: true }, day)
    expect('content' in msg).toBe(false)
    expect(msg.allowed_mentions.roles).toEqual([])
    expect(msg.embeds[0]!.title).toMatch(/^✨ Shiny /)
    expect(msg.embeds[0]!.thumbnail!.url).toMatch(/shiny/)
  })
})

describe('patch notes', () => {
  it('takes the title from the first line and turns headings into bold lines', () => {
    const note = parseNote('# Version 2\n\nHello\n\n## New\n- Raids\n\n![](/area-art/x.png)\n', 'patch-notes/2026-10-20-version-2.md')
    expect(note).toEqual({ title: 'Version 2', body: 'Hello\n\n**New**\n- Raids', image: 'https://poke-dice.netlify.app/area-art/x.png', date: '2026-10-20' })
  })

  it('cuts long notes within Discord limits, pinging once', () => {
    const para = 'Lorem ipsum dolor sit amet. '.repeat(40)
    const body = Array.from({ length: 30 }, () => para).join('\n\n')
    for (const piece of splitText(body)) expect(piece.length).toBeLessThanOrEqual(DESCRIPTION_MAX)
    const msgs = noteMessages({ title: 'Big', body }, { roleId: '7' })
    expect(msgs.length).toBeGreaterThan(1)
    for (const m of msgs) {
      expect(m.embeds.length).toBeLessThanOrEqual(10)
      expect(m.embeds.reduce((n, e) => n + (e.title?.length ?? 0) + (e.description?.length ?? 0) + (e.footer?.text.length ?? 0) + (e.author?.name.length ?? 0), 0)).toBeLessThanOrEqual(MESSAGE_MAX)
    }
    expect(msgs[0]!.content).toBe('<@&7> New update: **Big**')
    expect(msgs.slice(1).every((m) => !('content' in m))).toBe(true)
    expect(msgs.flatMap((m) => m.embeds).map((e) => e.description).join('\n\n')).toBe(body)
  })
})
