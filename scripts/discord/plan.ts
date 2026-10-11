// What the server setup would change (docs/22): the live server (a Snapshot) against the layout (layout.ts), phase by
// phase. Pure: every phase reads the snapshot and returns the calls to make. Each call carries its effect on the
// snapshot, so the next phase sees the server as it will be: after the real call when applying, after a pretend one
// when only planning. Running the phases again on the result finds nothing left to do (tests/discord.test.ts).
import type {
  DAutomodAction,
  DAutomodRule,
  DChannel,
  DEmbed,
  DForumTag,
  DGuild,
  DMessage,
  DOnboarding,
  DOverwrite,
  DRole,
  DWebhook,
  Method,
} from './api'
import { KNOWN, permNames } from './perms'
import type { CategorySpec, ChannelKind, ChannelSpec, Layout, OverwriteSpec, RoleKey, RoleSpec, Who } from './layout'

export interface Snapshot {
  guild: DGuild
  roles: DRole[]
  channels: DChannel[]
  botId: string
  /** The bot's own roles (its integration role, mostly), and the highest one's position: it can only edit and move
   * the roles below that. */
  botRoles: string[]
  botTop: number
  automod: DAutomodRule[]
  onboarding: DOnboarding | null
  /** The bot's own messages per channel id, oldest first, and each channel's webhooks: read just before their phase. */
  messages: Record<string, DMessage[]>
  /** How many of each channel's recent messages someone else wrote. */
  othersPosted: Record<string, number>
  webhooks: Record<string, DWebhook[]>
  /** Lines for .env.discord: webhook URLs and ping role ids. */
  env: Record<string, string>
}

export interface Action {
  label: string
  detail?: string[]
  method: Method
  path: string
  body: unknown
  /** Writes the call's result into the snapshot. `result` is undefined when only planning: the body stands in. */
  effect: (snap: Snapshot, result: unknown) => void
}

export interface PhaseResult {
  actions: Action[]
  notes: string[]
}

export interface PlanOptions {
  /** Move the channels the layout doesn't know into its read-only Archive category. */
  archiveUnmanaged: boolean
}

export type Phase = (snap: Snapshot, layout: Layout, opts: PlanOptions) => PhaseResult

const T = { text: 0, voice: 2, category: 4, announcement: 5, stage: 13, forum: 15 } as const
const KIND_TYPE: Record<ChannelKind, number> = { text: T.text, announcement: T.announcement, forum: T.forum, voice: T.voice }
/** Types an existing channel may have and still be this kind (text and announcement convert into each other). */
const COMPATIBLE: Record<ChannelKind, number[]> = {
  text: [T.text, T.announcement],
  announcement: [T.announcement, T.text],
  forum: [T.forum],
  voice: [T.voice, T.stage],
}

/** "🎲・Général" → "general": names compare without case, accents, emoji or separators. */
export const norm = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/** A name as Discord stores it: text, announcement and forum channel names are lowercase with dashes. */
const stored = (name: string, lower: boolean) => {
  const s = name.replace(/️/g, '')
  return lower ? s.toLowerCase().replace(/\s+/g, '-') : s
}

/** Whether a matched item already has the layout's exact name (the emoji included). */
const sameName = (have: string, want: string, lower = false) => stored(have, lower) === stored(want, lower)

/** Emoji compare without the variation selector Discord sometimes drops. */
const emojiKey = (e: string | null | undefined) => (e ?? '').replace(/️/g, '')

const isNew = (id: string) => id.startsWith('new:')
const g = (snap: Snapshot) => snap.guild.id

// ---------------------------------------------------------------------------------------------------------------------
// Matching: which existing role, category or channel each layout entry is.

interface Matchable {
  name: string
  aliases?: string[]
}

/**
 * Pairs each spec with an existing item: exact names first (so an alias never steals another entry's own channel), then
 * aliases, preferring `preferred(item)` and then the item listed first.
 */
function matchAll<S extends Matchable, I extends { id: string; name: string }>(
  specs: S[],
  items: I[],
  fits: (spec: S, item: I) => boolean,
  preferred: (spec: S, item: I) => boolean = () => false,
): Map<S, I> {
  const out = new Map<S, I>()
  const taken = new Set<string>()
  for (const pass of ['exact', 'alias'] as const) {
    for (const spec of specs) {
      if (out.has(spec)) continue
      const names = new Set(pass === 'exact' ? [norm(spec.name)] : (spec.aliases ?? []).map(norm))
      const found = items
        .filter((it) => !taken.has(it.id) && fits(spec, it) && names.has(norm(it.name)))
        .sort((a, b) => Number(preferred(spec, b)) - Number(preferred(spec, a)))[0]
      if (found) {
        out.set(spec, found)
        taken.add(found.id)
      }
    }
  }
  return out
}

/** The layout's roles as they stand on the server (missing ones are absent). */
export function matchRoles(snap: Snapshot, layout: Layout): Map<RoleKey, DRole> {
  const candidates = snap.roles.filter((r) => !r.managed && r.id !== g(snap))
  const m = matchAll(layout.roles, candidates, () => true)
  return new Map([...m].map(([spec, role]) => [spec.key, role]))
}

const allCategories = (layout: Layout) => [...layout.categories, layout.archive]

export function matchCategories(snap: Snapshot, layout: Layout): Map<string, DChannel> {
  const cats = snap.channels.filter((c) => c.type === T.category)
  const m = matchAll(allCategories(layout), cats, () => true)
  return new Map([...m].map(([spec, c]) => [spec.key, c]))
}

/** Every layout channel with its category's key. */
export function layoutChannels(layout: Layout): { spec: ChannelSpec; cat: CategorySpec }[] {
  return layout.categories.flatMap((cat) => cat.channels.map((spec) => ({ spec, cat })))
}

export function matchChannels(snap: Snapshot, layout: Layout): Map<string, DChannel> {
  const cats = matchCategories(snap, layout)
  const parentOf = new Map(layoutChannels(layout).map(({ spec, cat }) => [spec, cats.get(cat.key)?.id]))
  const m = matchAll(
    layoutChannels(layout).map((x) => x.spec),
    snap.channels.filter((c) => c.type !== T.category),
    (spec, ch) => COMPATIBLE[spec.kind].includes(ch.type),
    (spec, ch) => !!ch.parent_id && ch.parent_id === parentOf.get(spec),
  )
  return new Map([...m].map(([spec, c]) => [spec.key, c]))
}

/** The id an overwrite or a mention uses for `who`; a role not created yet has a stand-in. */
function whoId(snap: Snapshot, roles: Map<RoleKey, DRole>, who: Who): string {
  return who === 'everyone' ? g(snap) : (roles.get(who)?.id ?? `new:${who}`)
}

function channelIdOf(snap: Snapshot, layout: Layout, key: string): string {
  return matchChannels(snap, layout).get(key)?.id ?? `new:${key}`
}

// ---------------------------------------------------------------------------------------------------------------------
// Small helpers.

const bigintOf = (s: string | undefined) => BigInt(s || '0')

function permDiff(from: bigint, to: bigint): string {
  const added = permNames(to & ~from)
  const removed = permNames(from & ~to)
  return [...added.map((n) => `+${n}`), ...removed.map((n) => `-${n}`)].join(' ')
}

function upsert<I extends { id: string }>(list: I[], item: I): void {
  const i = list.findIndex((x) => x.id === item.id)
  if (i >= 0) list[i] = { ...list[i]!, ...item }
  else list.push(item)
}

/** The layout's overwrites for these specs, keeping the ones for roles and members the layout doesn't manage. */
function overwritesFor(
  snap: Snapshot,
  roles: Map<RoleKey, DRole>,
  layout: Layout,
  specs: OverwriteSpec[],
  existing: DOverwrite[] = [],
): DOverwrite[] {
  const managed = new Set<string>([g(snap), ...layout.roles.map((r) => whoId(snap, roles, r.key))])
  const merged = new Map<string, { allow: bigint; deny: bigint }>()
  for (const s of specs) {
    const id = whoId(snap, roles, s.who)
    const cur = merged.get(id) ?? { allow: 0n, deny: 0n }
    merged.set(id, { allow: cur.allow | (s.allow ?? 0n), deny: cur.deny | (s.deny ?? 0n) })
  }
  const ours: DOverwrite[] = [...merged]
    .filter(([, v]) => v.allow || v.deny)
    .map(([id, v]) => ({ id, type: 0, allow: String(v.allow), deny: String(v.deny) }))
  return [...ours, ...existing.filter((o) => !managed.has(o.id))]
}

const overwriteKey = (list: DOverwrite[] | undefined) =>
  (list ?? [])
    .filter((o) => o.allow !== '0' || o.deny !== '0')
    .map((o) => `${o.id}:${o.type}:${o.allow}:${o.deny}`)
    .sort()
    .join('|')

function tagsFor(spec: ChannelSpec, existing: DForumTag[] = []): DForumTag[] {
  const ours = (spec.tags ?? []).map((t): DForumTag => {
    const old = existing.find((e) => norm(e.name) === norm(t.name))
    return { ...(old?.id ? { id: old.id } : {}), name: t.name, moderated: !!t.moderated, emoji_id: null, emoji_name: t.emoji ?? null }
  })
  // The server's own tags stay, after the layout's.
  return [...ours, ...existing.filter((e) => !ours.some((t) => norm(t.name) === norm(e.name)))]
}

const tagsKey = (tags: DForumTag[] | undefined) =>
  (tags ?? []).map((t) => `${t.name}:${t.moderated}:${t.emoji_id ?? ''}:${emojiKey(t.emoji_name)}`).join('|')

// ---------------------------------------------------------------------------------------------------------------------
// Phases.

/** @everyone's permissions, then the layout's roles: created, or brought in line (only the bits the layout knows). */
export const rolesPhase: Phase = (snap, layout) => {
  const actions: Action[] = []
  const notes: string[] = []
  const everyone = snap.roles.find((r) => r.id === g(snap))
  if (everyone) {
    const cur = bigintOf(everyone.permissions)
    const want = (cur & ~KNOWN) | layout.everyone
    if (cur !== want)
      actions.push({
        label: '~ role @everyone: permissions',
        detail: [permDiff(cur, want)],
        method: 'PATCH',
        path: `/guilds/${g(snap)}/roles/${everyone.id}`,
        body: { permissions: String(want) },
        effect: (s, res) => upsert(s.roles, (res as DRole) ?? { ...everyone, permissions: String(want) }),
      })
  }
  const matched = matchRoles(snap, layout)
  for (const spec of layout.roles) {
    const role = matched.get(spec.key)
    if (!role) {
      const body = { name: spec.name, permissions: String(spec.permissions), color: spec.color, hoist: spec.hoist, mentionable: spec.mentionable }
      actions.push({
        label: `+ role ${spec.name}`,
        method: 'POST',
        path: `/guilds/${g(snap)}/roles`,
        body,
        effect: (s, res) => {
          // A new role starts at position 1, tied with the others there; the role order phase sorts them out.
          s.roles.push((res as DRole) ?? { id: `new:${spec.key}`, ...body, position: 1, managed: false })
        },
      })
      continue
    }
    if (role.position >= snap.botTop) {
      notes.push(`Role "${role.name}" sits above the bot's role, so the bot can't change it. Drag the bot's role above it (Server Settings → Roles).`)
      continue
    }
    const patch = roleChanges(role, spec)
    if (Object.keys(patch.body).length)
      actions.push({
        label: `~ role ${role.name}${patch.body.name ? ` → ${spec.name}` : ''}: ${Object.keys(patch.body).join(', ')}`,
        detail: patch.detail,
        method: 'PATCH',
        path: `/guilds/${g(snap)}/roles/${role.id}`,
        body: patch.body,
        effect: (s, res) => upsert(s.roles, (res as DRole) ?? { ...role, ...patch.body }),
      })
  }
  return { actions, notes }
}

function roleChanges(role: DRole, spec: RoleSpec): { body: Partial<DRole>; detail: string[] } {
  const body: Partial<DRole> = {}
  const detail: string[] = []
  if (!sameName(role.name, spec.name)) body.name = spec.name
  const cur = bigintOf(role.permissions)
  const want = (cur & ~KNOWN) | spec.permissions
  if (cur !== want) {
    body.permissions = String(want)
    detail.push(permDiff(cur, want))
  }
  if (role.color !== spec.color) body.color = spec.color
  if (role.hoist !== spec.hoist) body.hoist = spec.hoist
  if (role.mentionable !== spec.mentionable) body.mentionable = spec.mentionable
  return { body, detail }
}

/** Staff roles right under the bot's, ping roles at the bottom; every other role keeps its place in between. */
export const roleOrderPhase: Phase = (snap, layout) => {
  const matched = matchRoles(snap, layout)
  const below = snap.roles
    .filter((r) => r.id !== g(snap) && r.position < snap.botTop)
    .sort((a, b) => b.position - a.position || a.id.localeCompare(b.id))
  // A layout role above the bot's stays where it is: the bot can't move it.
  const movable = (key: RoleKey) => {
    const r = matched.get(key)
    return r && r.position < snap.botTop ? r : undefined
  }
  const ours = new Set(layout.roles.map((r) => movable(r.key)?.id).filter(Boolean))
  const staff = layout.roles.filter((r) => r.permissions !== 0n).map((r) => movable(r.key))
  const pings = layout.roles.filter((r) => r.permissions === 0n).map((r) => movable(r.key))
  const order = [
    ...staff.filter((r): r is DRole => !!r),
    ...below.filter((r) => !ours.has(r.id)),
    ...pings.filter((r): r is DRole => !!r),
  ]
  // New roles all start at position 1, tied: renumber until every role has its own place.
  const tied = new Set(below.map((r) => r.position)).size !== below.length
  if (!tied && order.map((r) => r.id).join() === below.map((r) => r.id).join()) return { actions: [], notes: [] }
  // The whole list, the bot's role and any above it unchanged in order: there may be fewer free numbers below the bot
  // than roles to place there.
  const above = snap.roles
    .filter((r) => r.id !== g(snap) && r.position >= snap.botTop)
    .sort((a, b) => b.position - a.position || a.id.localeCompare(b.id))
  const all = [...above, ...order]
  const body = all.map((r, i) => ({ id: r.id, position: all.length - i }))
  return {
    actions: [
      {
        label: '~ role order',
        detail: [order.map((r) => r.name).join(' > ')],
        method: 'PATCH',
        path: `/guilds/${g(snap)}/roles`,
        body,
        effect: (s) => {
          for (const { id, position } of body) {
            const r = s.roles.find((x) => x.id === id)
            if (r) r.position = position
          }
          s.botTop = Math.max(0, ...s.roles.filter((r) => s.botRoles.includes(r.id)).map((r) => r.position))
        },
      },
    ],
    notes: [],
  }
}

/** The unmanaged channels `--archive-unmanaged` would move: everything that isn't a layout channel or category. */
function unmanagedChannels(snap: Snapshot, layout: Layout): DChannel[] {
  const ours = new Set([...matchChannels(snap, layout).values()].map((c) => c.id))
  return snap.channels.filter((c) => c.type !== T.category && !ours.has(c.id))
}

export const categoriesPhase: Phase = (snap, layout, opts) => {
  const actions: Action[] = []
  const roles = matchRoles(snap, layout)
  const matched = matchCategories(snap, layout)
  const archiveNeeded = opts.archiveUnmanaged && unmanagedChannels(snap, layout).some((c) => c.parent_id !== matched.get('archive')?.id)
  for (const spec of allCategories(layout)) {
    if (spec === layout.archive && !archiveNeeded && !matched.get('archive')) continue
    const cat = matched.get(spec.key)
    const overwrites = overwritesFor(snap, roles, layout, spec.overwrites, cat?.permission_overwrites)
    if (!cat) {
      const body = { name: spec.name, type: T.category, permission_overwrites: overwrites }
      actions.push({
        label: `+ category ${spec.name}`,
        method: 'POST',
        path: `/guilds/${g(snap)}/channels`,
        body,
        effect: (s, res) => s.channels.push((res as DChannel) ?? { id: `new:${spec.key}`, position: 999, ...body }),
      })
      continue
    }
    const body: Partial<DChannel> = {}
    if (!sameName(cat.name, spec.name)) body.name = spec.name
    if (overwriteKey(cat.permission_overwrites) !== overwriteKey(overwrites)) body.permission_overwrites = overwrites
    if (Object.keys(body).length)
      actions.push({
        label: `~ category ${cat.name}${body.name ? ` → ${spec.name}` : ''}: ${Object.keys(body).join(', ').replace('permission_overwrites', 'permissions')}`,
        method: 'PATCH',
        path: `/channels/${cat.id}`,
        body,
        effect: (s, res) => upsert(s.channels, (res as DChannel) ?? { ...cat, ...body }),
      })
  }
  return { actions, notes: [] }
}

/** What a channel should look like, field by field, in the shape Discord takes. */
function channelBody(snap: Snapshot, layout: Layout, spec: ChannelSpec, cat: CategorySpec, existing?: DChannel): Partial<DChannel> {
  const roles = matchRoles(snap, layout)
  const parent = matchCategories(snap, layout).get(cat.key)?.id ?? `new:${cat.key}`
  const body: Partial<DChannel> = {
    name: spec.name,
    type: KIND_TYPE[spec.kind],
    parent_id: parent,
    permission_overwrites: overwritesFor(snap, roles, layout, spec.overwrites ?? cat.overwrites, existing?.permission_overwrites),
  }
  if (spec.kind !== 'voice') body.topic = spec.topic ?? ''
  if (spec.kind === 'text' || spec.kind === 'forum') body.rate_limit_per_user = spec.slowmode ?? 0
  if (spec.kind === 'voice') body.user_limit = spec.userLimit ?? 0
  if (spec.kind === 'forum') {
    body.available_tags = tagsFor(spec, existing?.available_tags)
    body.default_reaction_emoji = spec.defaultReaction ? { emoji_id: null, emoji_name: spec.defaultReaction } : null
    body.default_sort_order = spec.sort === 'created' ? 1 : 0
    body.default_forum_layout = spec.forumLayout === 'gallery' ? 2 : 1
  }
  return body
}

/** The fields of `want` that differ from the channel as it is. */
function channelChanges(ch: DChannel, want: Partial<DChannel>): Partial<DChannel> {
  const out: Partial<DChannel> = {}
  if (want.name !== undefined && !sameName(ch.name, want.name, want.type !== T.voice)) out.name = want.name
  if (want.type !== undefined && ch.type !== want.type && !(want.type === T.voice && ch.type === T.stage)) out.type = want.type
  if (want.parent_id !== undefined && (ch.parent_id ?? null) !== want.parent_id) out.parent_id = want.parent_id
  if (want.topic !== undefined && (ch.topic ?? '') !== want.topic) out.topic = want.topic
  if (want.rate_limit_per_user !== undefined && (ch.rate_limit_per_user ?? 0) !== want.rate_limit_per_user)
    out.rate_limit_per_user = want.rate_limit_per_user
  if (want.user_limit !== undefined && (ch.user_limit ?? 0) !== want.user_limit) out.user_limit = want.user_limit
  if (want.permission_overwrites && overwriteKey(ch.permission_overwrites) !== overwriteKey(want.permission_overwrites))
    out.permission_overwrites = want.permission_overwrites
  if (want.available_tags && tagsKey(ch.available_tags) !== tagsKey(want.available_tags)) out.available_tags = want.available_tags
  if (
    want.default_reaction_emoji !== undefined &&
    emojiKey(ch.default_reaction_emoji?.emoji_name) !== emojiKey(want.default_reaction_emoji?.emoji_name)
  )
    out.default_reaction_emoji = want.default_reaction_emoji
  if (want.default_sort_order !== undefined && (ch.default_sort_order ?? 0) !== want.default_sort_order)
    out.default_sort_order = want.default_sort_order
  if (want.default_forum_layout !== undefined && (ch.default_forum_layout ?? 0) !== want.default_forum_layout)
    out.default_forum_layout = want.default_forum_layout
  return out
}

const FIELD_LABEL: Record<string, string> = {
  permission_overwrites: 'permissions',
  parent_id: 'category',
  rate_limit_per_user: 'slowmode',
  user_limit: 'user limit',
  available_tags: 'tags',
  default_reaction_emoji: 'default reaction',
  default_sort_order: 'sort',
  default_forum_layout: 'layout',
}

const sigil = (spec: ChannelSpec) => (spec.kind === 'voice' ? '' : '#')

export const channelsPhase: Phase = (snap, layout) => {
  const actions: Action[] = []
  const notes: string[] = []
  const matched = matchChannels(snap, layout)
  for (const { spec, cat } of layoutChannels(layout)) {
    const ch = matched.get(spec.key)
    if (!ch) {
      const body = channelBody(snap, layout, spec, cat)
      const names = [spec.name, ...(spec.aliases ?? [])].map(norm)
      const clash = snap.channels.find((c) => c.type !== T.category && names.includes(norm(c.name)))
      if (clash)
        notes.push(
          `#${clash.name} is a ${typeName(clash.type)} channel and the layout wants a ${spec.kind}: Discord can't convert it, so a new ` +
            `${spec.kind} is made next to it. Move the old one away with --archive-unmanaged once you no longer need it.`,
        )
      actions.push({
        label: `+ ${spec.kind} ${sigil(spec)}${spec.name} in ${cat.name}`,
        method: 'POST',
        path: `/guilds/${g(snap)}/channels`,
        body,
        effect: (s, res) => s.channels.push((res as DChannel) ?? ({ id: `new:${spec.key}`, position: 999, ...body } as DChannel)),
      })
      continue
    }
    const changes = channelChanges(ch, channelBody(snap, layout, spec, cat, ch))
    if (!Object.keys(changes).length) continue
    actions.push({
      label: `~ ${sigil(spec)}${ch.name}${changes.name ? ` → ${spec.name}` : ''}: ${Object.keys(changes)
        .map((k) => FIELD_LABEL[k] ?? k)
        .join(', ')}`,
      detail: changes.type !== undefined ? [`converted to ${typeName(changes.type)}`] : undefined,
      method: 'PATCH',
      path: `/channels/${ch.id}`,
      body: changes,
      effect: (s, res) => upsert(s.channels, (res as DChannel) ?? { ...ch, ...changes }),
    })
  }
  return { actions, notes }
}

function typeName(type: number): string {
  return Object.entries(T).find(([, v]) => v === type)?.[0] ?? `type ${type}`
}

/** With --archive-unmanaged: every channel the layout doesn't know goes to Archive, read-only but never less private. */
export const archivePhase: Phase = (snap, layout, opts) => {
  if (!opts.archiveUnmanaged) return { actions: [], notes: [] }
  const archive = matchCategories(snap, layout).get('archive')
  const archiveId = archive?.id ?? 'new:archive'
  const everyoneDeny = layout.archive.overwrites
    .filter((o) => o.who === 'everyone')
    .reduce((acc, o) => acc | (o.deny ?? 0n), 0n)
  const actions: Action[] = []
  for (const ch of unmanagedChannels(snap, layout)) {
    if (ch.parent_id === archiveId) continue
    // Read-only on top of whatever it had: a private channel stays private.
    const old = ch.permission_overwrites?.find((o) => o.id === g(snap))
    const everyone: DOverwrite = {
      id: g(snap),
      type: 0,
      allow: String(bigintOf(old?.allow) & ~everyoneDeny),
      deny: String(bigintOf(old?.deny) | everyoneDeny),
    }
    const overwrites = [everyone, ...(ch.permission_overwrites ?? []).filter((o) => o.id !== g(snap))]
    const body = { parent_id: archiveId, permission_overwrites: overwrites }
    actions.push({
      label: `> ${ch.type === T.voice ? '🔊 ' : '#'}${ch.name} → Archive (read-only)`,
      method: 'PATCH',
      path: `/channels/${ch.id}`,
      body,
      effect: (s, res) => upsert(s.channels, (res as DChannel) ?? { ...ch, ...body }),
    })
  }
  return { actions, notes: [] }
}

/** Categories in the layout's order (the user's own after them, Archive last); channels likewise inside each. */
export const orderPhase: Phase = (snap, layout) => {
  const cats = matchCategories(snap, layout)
  const chans = matchChannels(snap, layout)
  const byPos = (a: DChannel, b: DChannel) => a.position - b.position || a.id.localeCompare(b.id)
  const allCats = snap.channels.filter((c) => c.type === T.category).sort(byPos)
  const ourCats = layout.categories.map((c) => cats.get(c.key)).filter((c): c is DChannel => !!c)
  const archive = cats.get('archive')
  const catOrder = [...ourCats, ...allCats.filter((c) => !ourCats.includes(c) && c !== archive), ...(archive ? [archive] : [])]

  const moves: { id: string; position: number; name: string }[] = []
  const queue = (list: DChannel[], current: DChannel[]) => {
    if (list.map((c) => c.id).join() === current.map((c) => c.id).join()) return
    list.forEach((c, i) => {
      if (c.position !== i) moves.push({ id: c.id, position: i, name: c.name })
    })
  }
  queue(catOrder, allCats)
  for (const cat of catOrder) {
    const inside = snap.channels.filter((c) => c.type !== T.category && c.parent_id === cat.id).sort(byPos)
    const spec = allCategories(layout).find((s) => cats.get(s.key) === cat)
    const ours = (spec?.channels ?? []).map((c) => chans.get(c.key)).filter((c): c is DChannel => !!c && c.parent_id === cat.id)
    queue([...ours, ...inside.filter((c) => !ours.includes(c))], inside)
  }
  if (!moves.length) return { actions: [], notes: [] }
  const body = moves.map(({ id, position }) => ({ id, position }))
  return {
    actions: [
      {
        label: `~ channel order (${moves.length} moved)`,
        method: 'PATCH',
        path: `/guilds/${g(snap)}/channels`,
        body,
        effect: (s) => {
          for (const { id, position } of body) {
            const c = s.channels.find((x) => x.id === id)
            if (c) c.position = position
          }
        },
      },
    ],
    notes: [],
  }
}

/** Verification, content filter, notifications, and which channels Discord uses for rules, updates and alerts. */
export const guildPhase: Phase = (snap, layout) => {
  const want = layout.guild
  const id = (key: string) => channelIdOf(snap, layout, key)
  const target: Partial<DGuild> = {
    verification_level: want.verificationLevel,
    explicit_content_filter: want.explicitContentFilter,
    default_message_notifications: want.defaultNotifications,
    system_channel_id: id(want.systemChannel),
    system_channel_flags: want.systemChannelFlags,
    rules_channel_id: id(want.rulesChannel),
    public_updates_channel_id: id(want.updatesChannel),
    safety_alerts_channel_id: id(want.safetyChannel),
    description: want.description,
  }
  const body: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(target)) if ((snap.guild as unknown as Record<string, unknown>)[k] !== v) body[k] = v
  if (!Object.keys(body).length) return { actions: [], notes: [] }
  return {
    actions: [
      {
        label: `~ server settings: ${Object.keys(body)
          .map((k) => k.replace(/_id$/, '').replace(/_/g, ' '))
          .join(', ')}`,
        method: 'PATCH',
        path: `/guilds/${g(snap)}`,
        body,
        effect: (s, res) => {
          s.guild = { ...s.guild, ...((res as DGuild | undefined) ?? body) }
        },
      },
    ],
    notes: [],
  }
}

const sorted = (v: unknown) => (Array.isArray(v) ? [...(v as unknown[])].sort() : v)

const automodActionsKey = (a: DAutomodAction[]) =>
  a
    .map((x) => `${x.type}:${x.metadata?.channel_id ?? ''}:${x.metadata?.duration_seconds ?? ''}`)
    .sort()
    .join('|')

/** A snowflake older than the server's own: made by Discord before the server existed. */
function olderThanServer(id: string, guildId: string): boolean {
  try {
    return BigInt(id) < BigInt(guildId)
  } catch {
    return false
  }
}

function automodSame(rule: DAutomodRule, spec: Layout['automod'][number], actions: DAutomodAction[], exempt: string[]): boolean {
  const metaSame = Object.entries(spec.metadata ?? {}).every(
    ([k, v]) => JSON.stringify(sorted(rule.trigger_metadata[k])) === JSON.stringify(sorted(v)),
  )
  return (
    rule.enabled &&
    metaSame &&
    automodActionsKey(rule.actions) === automodActionsKey(actions) &&
    [...rule.exempt_roles].sort().join() === exempt.join()
  )
}

export const automodPhase: Phase = (snap, layout) => {
  const actions: Action[] = []
  const notes: string[] = []
  const roles = matchRoles(snap, layout)
  const alerts = channelIdOf(snap, layout, layout.automodAlerts)
  const exempt = layout.automodExempt.map((k) => whoId(snap, roles, k)).sort()
  for (const spec of layout.automod) {
    // Discord allows one spam, one mention-spam and one preset rule per server: those match by kind, keywords by name.
    const rule =
      spec.trigger === 1
        ? snap.automod.find((r) => r.trigger_type === 1 && norm(r.name) === norm(spec.name))
        : snap.automod.find((r) => r.trigger_type === spec.trigger)
    const ruleActions: DAutomodAction[] = [
      { type: 1, metadata: {} },
      { type: 2, metadata: { channel_id: alerts } },
      ...(spec.timeoutSeconds ? [{ type: 3, metadata: { duration_seconds: spec.timeoutSeconds } }] : []),
    ]
    const body = {
      name: spec.name,
      event_type: 1,
      trigger_type: spec.trigger,
      trigger_metadata: spec.metadata ?? {},
      actions: ruleActions,
      enabled: true,
      exempt_roles: exempt,
    }
    if (rule && olderThanServer(rule.id, g(snap))) {
      // Older than the server: one of Discord's own rules (Community's "Block Mention Spam"), which bots can't edit.
      if (!automodSame(rule, spec, ruleActions, exempt))
        notes.push(`"${rule.name}" is Discord's own rule, which a bot can't change: adjust it by hand in Server Settings → AutoMod if you like.`)
      continue
    }
    if (!rule) {
      actions.push({
        label: `+ AutoMod rule "${spec.name}"`,
        method: 'POST',
        path: `/guilds/${g(snap)}/auto-moderation/rules`,
        body,
        effect: (s, res) => s.automod.push((res as DAutomodRule) ?? { id: `new:automod-${spec.trigger}`, exempt_channels: [], ...body }),
      })
      continue
    }
    if (automodSame(rule, spec, ruleActions, exempt)) continue
    const { event_type: _e, trigger_type: _t, ...patch } = body
    actions.push({
      label: `~ AutoMod rule "${rule.name}"`,
      method: 'PATCH',
      path: `/guilds/${g(snap)}/auto-moderation/rules/${rule.id}`,
      body: { ...patch, name: rule.name, trigger_metadata: { ...rule.trigger_metadata, ...(spec.metadata ?? {}) } },
      effect: (s, res) =>
        upsert(
          s.automod,
          (res as DAutomodRule) ?? { ...rule, ...patch, name: rule.name, trigger_metadata: { ...rule.trigger_metadata, ...(spec.metadata ?? {}) } },
        ),
    })
  }
  return { actions, notes }
}

/** A snowflake-shaped id for a new onboarding prompt or option (Discord wants the client to pick them). */
let idCounter = 0n
function newSnowflake(): string {
  idCounter++
  return String(((BigInt(Date.now()) - 1420070400000n) << 22n) | (idCounter & 0xfffn))
}

/** Channels & Roles: the questions new members answer, and the channels everyone sees from day one. */
export const onboardingPhase: Phase = (snap, layout) => {
  if (!snap.guild.features.includes('COMMUNITY')) return { actions: [], notes: [] }
  const roles = matchRoles(snap, layout)
  const chans = matchChannels(snap, layout)
  const cur = snap.onboarding
  const chanId = (key: string) => chans.get(key)?.id ?? `new:${key}`
  const prompts = layout.onboarding.map((p) => {
    const old = cur?.prompts.find((x) => norm(x.title) === norm(p.title))
    return {
      id: old?.id ?? newSnowflake(),
      type: 0,
      title: p.title,
      single_select: false,
      required: false,
      in_onboarding: true,
      options: p.options.map((o) => {
        const oldOpt = old?.options.find((x) => norm(x.title) === norm(o.title))
        return {
          id: oldOpt?.id ?? newSnowflake(),
          title: o.title,
          description: o.description ?? null,
          emoji_id: null,
          emoji_name: o.emoji ?? null,
          role_ids: (o.roles ?? []).map((k) => whoId(snap, roles, k)),
          channel_ids: (o.channels ?? []).map(chanId),
        }
      }),
    }
  })
  // The user's own questions stay, after the layout's.
  const theirs = (cur?.prompts ?? [])
    .filter((p) => !layout.onboarding.some((l) => norm(l.title) === norm(p.title)))
    .map((p) => ({
      ...p,
      options: p.options.map(({ emoji, ...o }) => ({ ...o, emoji_id: emoji?.id ?? null, emoji_name: emoji?.name ?? null })),
    }))
  const ourIds = new Set([...chans.values()].map((c) => c.id))
  const defaults = [
    ...layoutChannels(layout)
      .filter(({ spec }) => spec.onboardingDefault !== false)
      .map(({ spec }) => chanId(spec.key)),
    ...(cur?.default_channel_ids ?? []).filter((id) => !ourIds.has(id) && snap.channels.some((c) => c.id === id)),
  ]
  const body = { prompts: [...prompts, ...theirs], default_channel_ids: defaults, enabled: true, mode: 0 }

  const key = (o: { prompts: { title: string; options: { title: string; role_ids: string[]; channel_ids: string[]; emoji_name?: string | null; emoji?: { name: string | null } | null; description: string | null }[] }[]; default_channel_ids: string[]; enabled: boolean; mode: number }) =>
    JSON.stringify({
      p: o.prompts.map((p) => [
        p.title,
        p.options.map((x) => [x.title, x.description ?? '', emojiKey(x.emoji_name ?? x.emoji?.name), [...x.role_ids].sort(), [...x.channel_ids].sort()]),
      ]),
      d: [...o.default_channel_ids].sort(),
      e: o.enabled,
      m: o.mode,
    })
  if (cur && key(cur) === key(body)) return { actions: [], notes: [] }
  return {
    actions: [
      {
        label: `~ Channels & Roles: ${prompts.length} questions, ${defaults.length} default channels`,
        detail: prompts.map((p) => `${p.title} ${p.options.map((o) => o.title).join(' / ')}`),
        method: 'PUT',
        path: `/guilds/${g(snap)}/onboarding`,
        body,
        effect: (s, res) => {
          s.onboarding =
            (res as DOnboarding | undefined) ??
            ({
              ...body,
              prompts: body.prompts.map((p) => ({
                ...p,
                options: p.options.map(({ emoji_id, emoji_name, ...o }) => ({ ...o, emoji: { id: emoji_id, name: emoji_name } })),
              })),
            } as DOnboarding)
        },
      },
    ],
    notes: [],
  }
}

/** `{#key}` → a channel mention, `{@&key}` → a role mention; plain names while planning things not made yet. */
export function fillMentions(text: string, snap: Snapshot, layout: Layout): string {
  const roles = matchRoles(snap, layout)
  const chans = matchChannels(snap, layout)
  return text
    .replace(/\{#(\w+)\}/g, (_, k: string) => {
      const c = chans.get(k)
      const spec = layoutChannels(layout).find((x) => x.spec.key === k)?.spec
      return c && !isNew(c.id) ? `<#${c.id}>` : `#${spec?.name ?? k}`
    })
    .replace(/\{@&(\w+)\}/g, (_, k: string) => {
      const r = roles.get(k as RoleKey)
      return r && !isNew(r.id) ? `<@&${r.id}>` : `@${layout.roles.find((x) => x.key === k)?.name ?? k}`
    })
}

function renderEmbeds(spec: Layout['messages'][number], snap: Snapshot, layout: Layout): DEmbed[] {
  return spec.embeds.map((e) => ({
    title: e.title,
    description: fillMentions(e.description, snap, layout),
    color: e.color,
    ...(e.fields ? { fields: e.fields.map((f) => ({ name: f.name, value: fillMentions(f.value, snap, layout), inline: !!f.inline })) } : {}),
    ...(e.footer ? { footer: { text: e.footer } } : {}),
  }))
}

const embedKey = (e: DEmbed) =>
  JSON.stringify([e.title ?? '', e.description ?? '', e.color ?? 0, (e.fields ?? []).map((f) => [f.name, f.value, !!f.inline]), e.footer?.text ?? ''])

/** The welcome and rules posts (the bot's own messages, edited in place), the posters' webhooks, the ids to keep. */
export const contentPhase: Phase = (snap, layout) => {
  const actions: Action[] = []
  const notes: string[] = []
  const chans = matchChannels(snap, layout)
  for (const spec of layout.messages) {
    const ch = chans.get(spec.channel)
    const channelId = ch?.id ?? `new:${spec.channel}`
    const mine = snap.messages[channelId] ?? []
    const want = renderEmbeds(spec, snap, layout)
    const old = mine[0]
    if (!old && spec.onlyIfEmpty && (snap.othersPosted[channelId] ?? 0) > 0) {
      notes.push(`#${ch?.name ?? spec.channel} already has posts of yours: the layout's "${want[0]?.title}" post is left out. Delete yours and run again to post it.`)
      continue
    }
    if (old && old.embeds.length === want.length && old.embeds.every((e, i) => embedKey(e) === embedKey(want[i]!))) continue
    const body = { content: '', embeds: want, allowed_mentions: { parse: [] } }
    actions.push(
      old
        ? {
            label: `~ post in #${ch?.name ?? spec.channel}: ${want.map((e) => e.title).join(', ')}`,
            method: 'PATCH',
            path: `/channels/${channelId}/messages/${old.id}`,
            body,
            effect: (s, res) => {
              s.messages[channelId] = [(res as DMessage) ?? { ...old, embeds: want }, ...mine.slice(1)]
            },
          }
        : {
            label: `+ post in #${ch?.name ?? spec.channel}: ${want.map((e) => e.title).join(', ')}`,
            method: 'POST',
            path: `/channels/${channelId}/messages`,
            body,
            effect: (s, res) => {
              s.messages[channelId] = [(res as DMessage) ?? { id: `new:msg-${spec.channel}`, author: { id: s.botId }, content: '', embeds: want }]
            },
          },
    )
  }
  for (const spec of layout.webhooks) {
    const ch = chans.get(spec.channel)
    const channelId = ch?.id ?? `new:${spec.channel}`
    const hook = (snap.webhooks[channelId] ?? []).find((w) => w.type === 1 && w.name === spec.name)
    if (hook) {
      const url = hook.url ?? (hook.token ? `https://discord.com/api/webhooks/${hook.id}/${hook.token}` : undefined)
      if (url && snap.env[spec.env] !== url) snap.env[spec.env] = url
      continue
    }
    actions.push({
      label: `+ webhook "${spec.name}" in #${ch?.name ?? spec.channel} (its URL goes to .env.discord as ${spec.env})`,
      method: 'POST',
      path: `/channels/${channelId}/webhooks`,
      body: { name: spec.name },
      effect: (s, res) => {
        const w = (res as DWebhook | undefined) ?? { id: `new:hook-${spec.channel}`, type: 1, name: spec.name, channel_id: channelId }
        s.webhooks[channelId] = [...(s.webhooks[channelId] ?? []), w]
        if (w.url ?? w.token) s.env[spec.env] = w.url ?? `https://discord.com/api/webhooks/${w.id}/${w.token}`
      },
    })
  }
  const roles = matchRoles(snap, layout)
  for (const [key, env] of Object.entries(layout.roleEnv) as [RoleKey, string][]) {
    const id = roles.get(key)?.id
    if (id && !isNew(id)) snap.env[env] = id
  }
  return { actions, notes }
}

/** Every phase, in the order they run: each needs what the ones before it made (roles before overwrites, …). */
export const PHASES: { name: string; run: Phase }[] = [
  { name: 'Roles', run: rolesPhase },
  { name: 'Role order', run: roleOrderPhase },
  { name: 'Categories', run: categoriesPhase },
  { name: 'Channels', run: channelsPhase },
  { name: 'Archive', run: archivePhase },
  { name: 'Order', run: orderPhase },
  { name: 'Server settings', run: guildPhase },
  { name: 'AutoMod', run: automodPhase },
  { name: 'Channels & Roles', run: onboardingPhase },
  { name: 'Posts and webhooks', run: contentPhase },
]

/** Plans every phase on the snapshot, playing each call's effect, and returns all the calls (the tests' entry point). */
export function planAll(snap: Snapshot, layout: Layout, opts: PlanOptions = { archiveUnmanaged: false }): Action[] {
  const all: Action[] = []
  for (const phase of PHASES) {
    for (const a of phase.run(snap, layout, opts).actions) {
      a.effect(snap, undefined)
      all.push(a)
    }
  }
  return all
}

/** Things to fix by hand before anything can be applied. */
export function blockers(snap: Snapshot): string[] {
  const out: string[] = []
  if (!snap.guild.features.includes('COMMUNITY'))
    out.push(
      'Community is off. Forums, announcement channels and Channels & Roles need it: Server Settings → Enable Community ' +
        '(docs/22, step 3). Let Discord create its #rules and #moderator-only channels; the setup adopts them.',
    )
  const botPerms = snap.roles
    .filter((r) => r.id === g(snap) || snap.botRoles.includes(r.id))
    .reduce((acc, r) => acc | bigintOf(r.permissions), 0n)
  if (!(botPerms & (1n << 3n)))
    out.push("The bot isn't an Administrator. Invite it with the link in docs/22 (step 2), or give its role Administrator.")
  return out
}
