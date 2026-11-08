// The developer's words in a message (docs/15 §23, src/lib/richText.ts): web addresses are links (blue, underlined,
// opening in a new tab), and a YouTube address on a line of its own is the video, played right there.
import { useT } from '@/i18n/react'
import { richBlocks, youtubeEmbed, type RichSegment } from '@/lib/richText'
import { cx } from '@/theme/util'

/** A link in a message: the theme's link blue, underlined, in a new tab, telling the page nothing about the game. */
export function TextLink({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="text-link underline [overflow-wrap:anywhere] decoration-2 underline-offset-2 hover:decoration-[3px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link"
    >
      {children}
    </a>
  )
}

function Words({ segments }: { segments: RichSegment[] }) {
  return (
    <>
      {segments.map((s, i) =>
        s.kind === 'link' ? (
          <TextLink key={i} href={s.href}>
            {s.text}
          </TextLink>
        ) : (
          s.text
        ),
      )}
    </>
  )
}

/**
 * A YouTube video in the message: 16:9, the panel's width, loaded only when it scrolls near (lazy) and played only
 * when the player taps it (no autoplay). From YouTube's no-cookie host.
 */
export function YouTubeEmbed({
  id,
  start = 0,
  className,
}: {
  id: string
  start?: number
  className?: string
}) {
  const { t } = useT()
  return (
    <div className={cx('relative aspect-video w-full overflow-hidden bg-night shadow-ring', className)}>
      <iframe
        src={youtubeEmbed(id, start)}
        title={t('ui.message.video')}
        loading="lazy"
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        className="absolute inset-0 h-full w-full border-0"
      />
    </div>
  )
}

/**
 * The words, as `<p>`s and videos: line breaks kept, addresses as links, a YouTube address alone on its line as the
 * video (`videos` false: it stays a link).
 */
export function RichText({
  text,
  className,
  videos = true,
}: {
  text: string
  /** The words' paragraphs' classes (size, leading). */
  className?: string
  videos?: boolean
}) {
  const blocks = richBlocks(text, { videos })
  return (
    <div className="flex flex-col gap-2">
      {blocks.map((b, i) =>
        b.kind === 'video' ? (
          <YouTubeEmbed key={i} id={b.id} start={b.start} />
        ) : (
          <p key={i} className={cx('copy whitespace-pre-wrap break-words', className)}>
            <Words segments={b.segments} />
          </p>
        ),
      )}
    </div>
  )
}
