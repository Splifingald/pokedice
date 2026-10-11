/**
 * pnpm discord:patch-notes patch-notes/2026-10-20-version-2.md       — post these notes to #patch-notes.
 * --dry                                                              — print the messages instead.
 * --wait-deploy <commit>                                             — first wait (15 min at most) until the live site
 *                                                                      serves that commit, so the post never runs ahead
 *                                                                      of the update.
 *
 * GitHub Actions runs it for every note a push to main adds (.github/workflows/discord-patch-notes.yml). How to write a
 * note: patch-notes/README.md.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { postWebhook, type DEmbed } from './api'
import { loadEnv, ROOT } from './env'
import { COLORS, SITE } from './layout'

/** Discord's limits: an embed's description, and every embed of one message together. */
export const DESCRIPTION_MAX = 4096
export const MESSAGE_MAX = 6000

export interface PatchNote {
  title: string
  body: string
  /** The first picture in the note (`![…](url)`), shown big under the text. */
  image?: string
  /** From the file name's yyyy-mm-dd. */
  date?: string
}

/** `# Title` first, then Markdown. Headings become bold lines: embeds don't draw headings. */
export function parseNote(text: string, file = '', site = SITE): PatchNote {
  const lines = text.replace(/\r\n/g, '\n').trim().split('\n')
  const first = lines[0] ?? ''
  const title = /^#\s+/.test(first) ? first.replace(/^#\s+/, '').trim() : path.basename(file, '.md')
  let image: string | undefined
  const body = (/^#\s+/.test(first) ? lines.slice(1) : lines)
    .filter((l) => {
      const m = /^\s*!\[[^\]]*\]\(([^)\s]+)\)\s*$/.exec(l)
      if (!m) return true
      image ??= m[1]!.startsWith('/') ? `${site}${m[1]}` : m[1]
      return false
    })
    .map((l) => l.replace(/^#{2,6}\s+(.+?)\s*#*\s*$/, '**$1**'))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  const date = /(\d{4}-\d{2}-\d{2})/.exec(path.basename(file))?.[1]
  return { title, body, ...(image ? { image } : {}), ...(date ? { date } : {}) }
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
export function noteMessages(note: PatchNote, opts: { roleId?: string; site?: string; now?: Date } = {}) {
  const site = opts.site ?? SITE
  const pieces = splitText(note.body || '…')
  const embeds: DEmbed[] = pieces.map((description, i) => ({
    ...(i === 0 ? { author: { name: 'Patch notes' }, title: note.title, url: site } : {}),
    description,
    color: COLORS.green,
  }))
  const last = embeds[embeds.length - 1]!
  if (note.image) last.image = { url: note.image }
  last.footer = { text: `Play: ${site.replace('https://', '')}` }
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
    ...(i === 0 ? { content: `${opts.roleId ? `<@&${opts.roleId}> ` : ''}New update: **${note.title}**` } : {}),
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
  const webhook = env.DISCORD_PATCH_WEBHOOK?.trim()
  if (!dry && !webhook) {
    console.log('No DISCORD_PATCH_WEBHOOK: nothing posted. `pnpm discord --apply` writes it to .env.discord (docs/23).')
    return
  }
  if (wait && !dry) {
    console.log(`Waiting for ${site} to serve ${wait.slice(0, 7)}…`)
    if (!(await waitForDeploy(site, wait))) console.log('! Not live after 15 minutes (a later push may have replaced it): posting anyway.')
  }
  for (const file of files) {
    const note = parseNote(await readFile(path.resolve(ROOT, file), 'utf8'), file, site)
    const messages = noteMessages(note, { roleId: env.DISCORD_PATCH_ROLE?.trim() || undefined, site })
    console.log(`${file}: "${note.title}", ${messages.length} message(s).`)
    if (dry) {
      console.log(JSON.stringify(messages, null, 2))
      continue
    }
    for (const m of messages) await postWebhook(webhook!, m)
    console.log('✓ Posted.')
  }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/discord/patch-notes.ts')) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
