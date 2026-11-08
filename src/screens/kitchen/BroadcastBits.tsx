// Kitchen sink: the developer's words with links and YouTube videos (RichText, docs/15 §23), and global messages
// (docs/69) — a developer's message to every player, popping up on Home under its own title: alone with a video and a
// gift, without a gift, its gift waiting (Extreme mode), two at once, and My messages' entry. Its opening is the
// gifts' own (GiftBits).
import { useState } from 'react'
import type { Gift, GiftsWait } from '@/engine'
import { MessageItem, ReplyBox } from '@/components/ContactModal'
import { PixelButton } from '@/components/PixelButton'
import { ReplyModal } from '@/components/ReplyPopup'
import { RichText, YouTubeEmbed } from '@/components/RichText'
import type { MyMessage } from '@/lib/feedback'

const at = new Date().toISOString()

const LINKS =
  'Version 3.0 is out! Read everything on https://example.com/patch-notes, and come say hi on www.discord.gg/pokedice.\nA link at the end of a sentence keeps its full stop out: https://example.com/faq.'
const VIDEO = 'Here is the new trailer:\n\nhttps://www.youtube.com/watch?v=JQKydm46JBI\n\nSee you on Route 1!'
const INLINE = 'Inside a sentence a YouTube address stays a link: https://youtu.be/JQKydm46JBI (no video).'

const GIFTS: Gift[] = [
  { kind: 'gold', amount: 1000, region: 'latest' },
  { kind: 'item', key: 'rare-candy', qty: 3, region: 'latest' },
]

/** A global message as my_feedback() returns it. */
const global = (
  id: number,
  title: string,
  reply: string,
  gifts: Gift[] | null,
  claimed = false,
): MyMessage => ({
  id,
  created_at: at,
  title,
  message: '',
  reply,
  replied_at: at,
  reply_seen: false,
  from_admin: true,
  gifts,
  gifts_claimed: claimed,
  broadcast: true,
})

const TRAILER = global(1, 'The 3.0 trailer is here!', VIDEO, GIFTS)
const NEWS = global(2, 'Server maintenance tonight', LINKS, null)
const OPENED = global(
  3,
  'A gift for 8 badges',
  'Well done, Champion! https://example.com/league',
  GIFTS,
  true,
)

type Open = null | 'alone' | 'plain' | 'extreme' | 'two'

export function BroadcastBits() {
  const [open, setOpen] = useState<Open>(null)
  const close = () => setOpen(null)
  const label = 'font-pixel-sm text-[16px] text-muted'
  const pop = (shown: MyMessage[], wait: GiftsWait | null) => (
    <ReplyModal
      open
      shown={shown}
      wait={wait}
      opens={wait ? 0 : shown.filter((m) => m.gifts && !m.gifts_claimed).length}
      onClose={close}
    />
  )
  return (
    <div className="grid w-full max-w-md gap-3">
      <p className={label}>
        The words: links (blue, underlined, a new tab) · a video alone on its line · a YouTube link in a
        sentence
      </p>
      <div className="bg-paper p-3 shadow-card">
        <RichText text={LINKS} className="text-lg leading-snug" />
      </div>
      <div className="bg-paper p-3 shadow-card">
        <RichText text={VIDEO} className="text-lg leading-snug" />
      </div>
      <div className="bg-paper p-3 shadow-card">
        <RichText text={INLINE} className="text-lg leading-snug" />
      </div>
      <p className={label}>In the developer’s message box (the pop-up’s and My messages’)</p>
      <ReplyBox reply={LINKS} at={at} fromDev />
      <p className={label}>The video on its own, starting at 1:30</p>
      <YouTubeEmbed id="JQKydm46JBI" start={90} />
      <p className={label}>Global messages’ pop-up (Home only)</p>
      <div className="flex flex-wrap gap-2">
        <PixelButton size="sm" onClick={() => setOpen('alone')}>
          Alone: video and gift
        </PixelButton>
        <PixelButton size="sm" onClick={() => setOpen('plain')}>
          …links, no gift
        </PixelButton>
        <PixelButton size="sm" onClick={() => setOpen('extreme')}>
          …the gift waiting (Extreme)
        </PixelButton>
        <PixelButton size="sm" onClick={() => setOpen('two')}>
          Two at once
        </PixelButton>
      </div>
      <p className={label}>My messages: a global message to open · opened · waiting in a small world</p>
      <ul className="m-0 flex list-none flex-col gap-3 bg-paper p-3 shadow-card">
        <MessageItem m={TRAILER} wait={null} onOpen={() => {}} />
        <MessageItem m={OPENED} wait={null} onOpen={() => {}} />
        <MessageItem m={NEWS} wait="world" onOpen={() => {}} />
      </ul>
      {open === 'alone' && pop([TRAILER], null)}
      {open === 'plain' && pop([NEWS], null)}
      {open === 'extreme' && pop([TRAILER], 'extreme')}
      {open === 'two' && pop([NEWS, TRAILER], null)}
    </div>
  )
}
