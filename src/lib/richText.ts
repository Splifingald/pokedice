// The developer's words in a message (docs/15 §23): plain text where a web address becomes a link the player can tap,
// and a YouTube address on a line of its own becomes the video, played in the message. Only http(s) addresses are
// links, so nothing typed can run as a script; a video is rebuilt from its id alone (never the address as written), on
// YouTube's no-cookie host.

/** A run of words, or a link: what it shows and where it goes. */
export type RichSegment = { kind: 'text'; text: string } | { kind: 'link'; text: string; href: string }

/** A block of the message: words and links (line breaks kept), or a YouTube video. */
export type RichBlock =
  { kind: 'text'; segments: RichSegment[] } | { kind: 'video'; id: string; start: number; url: string }

/** A web address: http(s)://… or www.…, up to the first space or quote-like character. */
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi

/** What usually ends a sentence rather than an address: left off the link ("see https://x.com."). */
const TRAILING = '.,;:!?…\'"»)]}'

const count = (s: string, ch: string) => s.split(ch).length - 1

/** The address without the sentence's punctuation after it; a ")" stays when the address opened it ("Foo_(bar)"). */
function trimEnd(url: string): string {
  let out = url
  while (out && TRAILING.includes(out.at(-1)!)) {
    if (out.endsWith(')') && count(out, '(') >= count(out, ')')) break
    out = out.slice(0, -1)
  }
  return out
}

/** The address to open: www.… gets https://; anything that isn't http(s) isn't a link. */
export function safeHref(raw: string): string | null {
  const href = /^www\./i.test(raw) ? `https://${raw}` : raw
  try {
    const u = new URL(href)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    if (!u.hostname.includes('.')) return null
    return u.href
  } catch {
    return null
  }
}

/** Words with their addresses made links. */
export function linkify(text: string): RichSegment[] {
  const out: RichSegment[] = []
  let at = 0
  for (const m of text.matchAll(URL_RE)) {
    const raw = trimEnd(m[0])
    const href = safeHref(raw)
    if (!href) continue
    const start = m.index ?? 0
    if (start > at) out.push({ kind: 'text', text: text.slice(at, start) })
    out.push({ kind: 'link', text: raw, href })
    at = start + raw.length
  }
  if (at < text.length) out.push({ kind: 'text', text: text.slice(at) })
  return out
}

const YT_ID = /^[A-Za-z0-9_-]{11}$/

/** Seconds from YouTube's `t` / `start`: 90, 90s, 1m30s, 1h2m3s. */
function seconds(v: string | null): number {
  if (!v) return 0
  if (/^\d+s?$/.test(v)) return parseInt(v, 10)
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(v)
  if (!m || !m[0]) return 0
  return (Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)) * 60 + Number(m[3] ?? 0)
}

/**
 * The video a YouTube address points to, and where it starts: youtube.com/watch?v=…, youtu.be/…, /shorts/…, /embed/…,
 * /live/… (www., m. and music. too, and youtube-nocookie.com). Null for anything else.
 */
export function youtubeVideo(raw: string): { id: string; start: number } | null {
  const href = safeHref(raw)
  if (!href) return null
  const u = new URL(href)
  const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, '')
  let id: string | null = null
  if (host === 'youtu.be') id = u.pathname.split('/')[1] ?? null
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const [, first, second] = u.pathname.split('/')
    if (first === 'watch') id = u.searchParams.get('v')
    else if (first === 'shorts' || first === 'embed' || first === 'live' || first === 'v') id = second ?? null
  }
  if (!id || !YT_ID.test(id)) return null
  return { id, start: seconds(u.searchParams.get('t') ?? u.searchParams.get('start')) }
}

/** The player for a video: YouTube's no-cookie host, from the id alone. */
export const youtubeEmbed = (id: string, start = 0) =>
  `https://www.youtube-nocookie.com/embed/${id}${start > 0 ? `?start=${start}` : ''}`

/**
 * The message as blocks: a YouTube address alone on its line becomes its video (`videos`: false keeps it a link, as in
 * a short preview); every other line stays words, its addresses links. Line breaks are kept inside the words.
 */
export function richBlocks(text: string, { videos = true }: { videos?: boolean } = {}): RichBlock[] {
  const blocks: RichBlock[] = []
  let words: string[] = []
  const flush = () => {
    if (!words.length) return
    // The blank line between the words and a video is the video's room, not more words.
    const joined = words.join('\n').replace(/^\n+|\n+$/g, '')
    if (joined) blocks.push({ kind: 'text', segments: linkify(joined) })
    words = []
  }
  for (const line of text.split(/\r?\n/)) {
    const alone = line.trim()
    const video = videos && /^\S+$/.test(alone) ? youtubeVideo(alone) : null
    if (video) {
      flush()
      blocks.push({ kind: 'video', ...video, url: safeHref(alone)! })
    } else words.push(line)
  }
  flush()
  return blocks
}
