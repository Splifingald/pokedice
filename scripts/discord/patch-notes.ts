/**
 * pnpm discord:patch-notes patch-notes/2026-10-20-version-2.md       — post these notes to #patch-notes; a French one
 *                                                                      (…-version-2.fr.md) to #🥖-français.
 * --dry                                                              — print the messages instead.
 * --wait-deploy <commit>                                             — first wait (15 min at most) until the live site
 *                                                                      serves that commit, so the post never runs ahead
 *                                                                      of the update.
 *
 * GitHub Actions runs it for every note a push to main adds (.github/workflows/discord-patch-notes.yml). How to write a
 * note, and its French twin: patch-notes/README.md.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { postWebhook, type DEmbed, type WebhookFile } from './api'
import { existsSync } from 'node:fs'
import { loadEnv, ROOT } from './env'
import type { PostLang } from './french'
import { COLORS, SITE } from './layout'

/** `…-version-2.fr.md` is the French twin of `…-version-2.md`: it goes to #🥖-français. */
export const noteLang = (file: string): PostLang => (file.endsWith('.fr.md') ? 'fr' : 'en')
export const frenchTwin = (file: string): string => file.replace(/\.md$/, '.fr.md')

/** The post's own words, per language. */
const NOTE_WORDS = {
  en: { author: 'Patch notes', update: 'New update:', play: 'Play:' },
  fr: { author: 'Notes de mise à jour', update: 'Nouvelle mise à jour :', play: 'Jouer :' },
} satisfies Record<PostLang, unknown>

/** Discord's limits: an embed's description, and every embed of one message together. */
export const DESCRIPTION_MAX = 4096
export const MESSAGE_MAX = 6000

export interface PatchNote {
  title: string
  body: string
  /** The first picture in the note (`![…](url)`), shown big under the text. */
  image?: string
  /** A video instead (`![…](/patch-notes/….mp4)`, a path on the site): sent with the last message, played there. */
  video?: string
  /** From the file name's yyyy-mm-dd. */
  date?: string
}

/** `# Title` first, then Markdown. Headings become bold lines: embeds don't draw headings. */
export function parseNote(text: string, file = '', site = SITE): PatchNote {
  const lines = text.replace(/\r\n/g, '\n').trim().split('\n')
  const first = lines[0] ?? ''
  const title = /^#\s+/.test(first) ? first.replace(/^#\s+/, '').trim() : path.basename(file, '.md')
  let image: string | undefined
  let video: string | undefined
  const body = (/^#\s+/.test(first) ? lines.slice(1) : lines)
    .filter((l) => {
      const m = /^\s*!\[[^\]]*\]\(([^)\s]+)\)\s*$/.exec(l)
      if (!m) return true
      if (VIDEO.test(m[1]!)) video ??= m[1]
      else image ??= m[1]!.startsWith('/') ? `${site}${m[1]}` : m[1]
      return false
    })
    .map((l) => l.replace(/^#{2,6}\s+(.+?)\s*#*\s*$/, '**$1**'))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  const date = /(\d{4}-\d{2}-\d{2})/.exec(path.basename(file))?.[1]
  return { title, body, ...(image ? { image } : {}), ...(video ? { video } : {}), ...(date ? { date } : {}) }
}

/** A video by its extension: Discord plays these inline. */
export const VIDEO = /\.(mp4|webm|mov)$/i
/** Discord's limit on a webhook's file, kept under with a margin. */
export const VIDEO_MAX = 10 * 1024 * 1024

/** The note's video, read from public/ (a path on the site is a file there); null without one. */
export async function noteVideo(note: PatchNote): Promise<WebhookFile | null> {
  if (!note.video) return null
  if (!note.video.startsWith('/')) throw new Error(`${note.video}: a video is a path on the site, under public/`)
  const data = await readFile(path.join(ROOT, 'public', note.video))
  if (data.byteLength > VIDEO_MAX)
    throw new Error(`${note.video} is ${(data.byteLength / 1e6).toFixed(1)} MB: Discord takes 10 MB at most`)
  const ext = path.extname(note.video).slice(1).toLowerCase()
  return {
    name: path.basename(note.video),
    data,
    type: ext === 'mov' ? 'video/quicktime' : `video/${ext}`,
  }
}

/** Cuts text into pieces of at most `max` characters: between paragraphs, else between lines, else anywhere. */
export function splitText(text: string, max = DESCRIPTION_MAX - 96): string[] {
  const out: string[] = []
  let cur = ''
  const push = (piece: string, sep: string) => {
    if (!cur) cur = piece
    else if (cur.length + sep.length + piece.length <= max) cur += sep + piece
    else {
      out.push(cur)
      cur = piece
    }
  }
  for (const para of text.split('\n\n')) {
    if (para.length <= max) {
      push(para, '\n\n')
      continue
    }
    for (const line of para.split('\n')) {
      if (line.length <= max) push(line, '\n')
      else for (let i = 0; i < line.length; i += max) push(line.slice(i, i + max), '')
    }
  }
  if (cur) out.push(cur)
  return out
}

const embedSize = (e: DEmbed) => (e.title?.length ?? 0) + (e.description?.length ?? 0) + (e.footer?.text.length ?? 0) + (e.author?.name.length ?? 0)

/** The note as webhook messages: one embed per piece, as many to a message as Discord allows. */
export function noteMessages(
  note: PatchNote,
  opts: { roleId?: string; site?: string; now?: Date; lang?: PostLang } = {},
) {
  const site = opts.site ?? SITE
  const w = NOTE_WORDS[opts.lang ?? 'en']
  const pieces = splitText(note.body || '…')
  const embeds: DEmbed[] = pieces.map((description, i) => ({
    ...(i === 0 ? { author: { name: w.author }, title: note.title, url: site } : {}),
    description,
    color: COLORS.green,
  }))
  const last = embeds[embeds.length - 1]!
  if (note.image) last.image = { url: note.image }
  last.footer = { text: `${w.play} ${site.replace('https://', '')}` }
  last.timestamp = (opts.now ?? new Date()).toISOString()

  const messages: { embeds: DEmbed[] }[] = []
  for (const e of embeds) {
    const cur = messages[messages.length - 1]
    if (cur && cur.embeds.length < 10 && cur.embeds.reduce((n, x) => n + embedSize(x), 0) + embedSize(e) <= MESSAGE_MAX) cur.embeds.push(e)
    else messages.push({ embeds: [e] })
  }
  return messages.map((m, i) => ({
    username: 'Pokédice',
    avatar_url: `${site}/characters/prof-oak.png`,
    ...(i === 0 ? { content: `${opts.roleId ? `<@&${opts.roleId}> ` : ''}${w.update} **${note.title}**` } : {}),
    embeds: m.embeds,
    allowed_mentions: { parse: [], roles: opts.roleId ? [opts.roleId] : [] },
  }))
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Waits until the live site's /version.json names this commit (the build id starts with its first 7 characters). */
async function waitForDeploy(site: string, commit: string, timeoutMs = 15 * 60_000): Promise<boolean> {
  const short = commit.slice(0, 7)
  const end = Date.now() + timeoutMs
  for (;;) {
    try {
      const res = await fetch(`${site}/version.json?t=${Date.now()}`, { cache: 'no-store' })
      const { build } = (await res.json()) as { build?: string }
      if (build?.startsWith(short)) return true
      console.log(`  live build ${build ?? '?'}, waiting for ${short}…`)
    } catch {
      console.log('  /version.json unreachable, waiting…')
    }
    if (Date.now() > end) return false
    await sleep(20_000)
  }
}

async function main() {
  const argv = process.argv.slice(2)
  const dry = argv.includes('--dry')
  const wait = argv.includes('--wait-deploy') ? argv[argv.indexOf('--wait-deploy') + 1] : undefined
  const files = argv.filter((a, i) => a.endsWith('.md') && argv[i - 1] !== '--wait-deploy').sort()
  if (!files.length) {
    console.log('No note to post.')
    return
  }
  const env = await loadEnv()
  const site = env.POKEDICE_SITE?.trim() || SITE
  const webhooks: Record<PostLang, string | undefined> = {
    en: env.DISCORD_PATCH_WEBHOOK?.trim() || undefined,
    fr: env.DISCORD_FRENCH_WEBHOOK?.trim() || undefined,
  }
  const envName: Record<PostLang, string> = { en: 'DISCORD_PATCH_WEBHOOK', fr: 'DISCORD_FRENCH_WEBHOOK' }
  if (!dry && !files.some((f) => webhooks[noteLang(f)])) {
    console.log(
      `No ${[...new Set(files.map((f) => envName[noteLang(f)]))].join(' nor ')}: nothing posted. \`pnpm discord --apply\` writes them to .env.discord (docs/23).`,
    )
    return
  }
  // Every update is posted in French too (CLAUDE.md): say so loudly when a note comes without its twin.
  for (const f of files)
    if (noteLang(f) === 'en' && !existsSync(path.resolve(ROOT, frenchTwin(f))))
      console.log(`! ${f} has no French version (${frenchTwin(f)}): nothing goes to #français for it.`)
  if (wait && !dry) {
    console.log(`Waiting for ${site} to serve ${wait.slice(0, 7)}…`)
    if (!(await waitForDeploy(site, wait))) console.log('! Not live after 15 minutes (a later push may have replaced it): posting anyway.')
  }
  for (const file of files) {
    const lang = noteLang(file)
    const note = parseNote(await readFile(path.resolve(ROOT, file), 'utf8'), file, site)
    // No ping in French: the Patch Notes Pings role is the English channel's.
    const roleId = lang === 'en' ? env.DISCORD_PATCH_ROLE?.trim() || undefined : undefined
    const messages = noteMessages(note, { roleId, site, lang })
    const video = await noteVideo(note)
    console.log(
      `${file}: "${note.title}", ${messages.length} message(s)${lang === 'fr' ? ', in #français' : ''}` +
        `${video ? `, with ${video.name} (${(video.data.byteLength / 1e6).toFixed(1)} MB)` : ''}.`,
    )
    if (dry) {
      console.log(JSON.stringify(messages, null, 2))
      continue
    }
    const webhook = webhooks[lang]
    if (!webhook) {
      console.log(`  No ${envName[lang]}: not posted.`)
      continue
    }
    // The video goes with the last message, under its embed.
    for (const [i, m] of messages.entries())
      await postWebhook(webhook, m, i === messages.length - 1 ? (video ?? undefined) : undefined)
    console.log('✓ Posted.')
  }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/discord/patch-notes.ts')) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
