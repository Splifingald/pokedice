// Kitchen sink: welcome-back gifts (docs/56) — a developer's message the server writes when a player comes back after
// days away, so its states are the messages' own: the pop-up (alone, with the player's name and without, the gift
// waiting in Extreme mode, beside another message from the developer), its words for each tier and a single day, My
// messages' entry (to open, opening, opened, waiting) with its INFO, the rules, and the opening, the gifts' own.
import { useState } from 'react'
import {
  DEFAULT_CONFIG,
  welcomeBackReply,
  type Gift,
  type GiftLanded,
  type GiftsWait,
  type WelcomeBackNote,
} from '@/engine'
import { MessageItem, ReplyBox } from '@/components/ContactModal'
import { GiftMoment } from '@/components/Gifts'
import { PixelButton } from '@/components/PixelButton'
import { ReplyModal } from '@/components/ReplyPopup'
import { WelcomeBackInfo, WelcomeBackRulesModal } from '@/components/WelcomeBack'
import type { MyMessage } from '@/lib/feedback'

const TIERS = DEFAULT_CONFIG.welcomeBack.tiers
const at = new Date().toISOString()

const note = (days: number, minDays: number, o: Partial<WelcomeBackNote> = {}): WelcomeBackNote => ({
  days,
  minDays,
  from: 3,
  cooldown: 14,
  ...o,
})

/** A welcome back as my_feedback() returns it. */
const welcome = (id: number, n: WelcomeBackNote, gifts: Gift[], claimed = false): MyMessage => ({
  id,
  created_at: at,
  title: 'welcome_back',
  message: '',
  reply: welcomeBackReply(n),
  replied_at: at,
  reply_seen: false,
  from_admin: true,
  gifts,
  gifts_claimed: claimed,
})

const THREE = welcome(1, note(4, 3), TIERS[0]!.gifts)
const SEVEN = welcome(2, note(9, 7), TIERS[1]!.gifts)
const FOURTEEN = welcome(3, note(40, 14), TIERS[2]!.gifts)
const OPENED = welcome(4, note(16, 14), TIERS[2]!.gifts, true)
const DEV: MyMessage = {
  id: 5,
  created_at: at,
  title: 'Thanks for the bug report',
  message: '',
  reply: 'Fixed in the next update — here is a little something.',
  replied_at: at,
  reply_seen: false,
  from_admin: true,
  gifts: [{ kind: 'item', key: 'rare-candy', qty: 2, region: 'latest' }],
  gifts_claimed: false,
}

const SEVEN_LANDED: GiftLanded[] = TIERS[1]!.gifts.map((gift) => ({ gift, region: 'kanto', moved: false }))

type Open = null | 'alone' | 'extreme' | 'mixed' | 'rules' | 'moment'

export function WelcomeBackBits() {
  const [open, setOpen] = useState<Open>(null)
  const close = () => setOpen(null)
  const label = 'font-pixel-sm text-[16px] text-muted'
  const pop = (shown: MyMessage[], wait: GiftsWait | null) => (
    <ReplyModal
      open
      shown={shown}
      wait={wait}
      opens={wait ? 0 : shown.length}
      onClose={() => setOpen(wait ? null : 'moment')}
    />
  )
  return (
    <div className="grid w-full max-w-md gap-3">
      <div className="flex flex-wrap gap-2">
        <PixelButton size="sm" onClick={() => setOpen('alone')}>
          The pop-up: 9 days away
        </PixelButton>
        <PixelButton size="sm" onClick={() => setOpen('extreme')}>
          …the gift waiting (Extreme)
        </PixelButton>
        <PixelButton size="sm" onClick={() => setOpen('mixed')}>
          …with another message
        </PixelButton>
        <PixelButton size="sm" onClick={() => setOpen('moment')}>
          Open: the 7-day gift
        </PixelButton>
        <PixelButton size="sm" onClick={() => setOpen('rules')}>
          The rules (INFO)
        </PixelButton>
      </div>
      <p className={label}>
        The words, in the player’s language: 3+ days · 7+ · 14+ · one day (the admin’s 1-day tier)
      </p>
      <ReplyBox reply={THREE.reply!} at={at} fromDev />
      <ReplyBox reply={SEVEN.reply!} at={at} fromDev />
      <ReplyBox reply={FOURTEEN.reply!} at={at} fromDev />
      <ReplyBox reply={welcomeBackReply(note(1, 1, { from: 1, cooldown: 1 }))} at={at} fromDev />
      <p className={label}>
        My messages: to open · asking the server · opened · waiting in Extreme mode · in a small world
      </p>
      <ul className="m-0 flex list-none flex-col gap-3 bg-paper p-3 shadow-card">
        <MessageItem m={SEVEN} wait={null} onOpen={() => setOpen('moment')} />
        <MessageItem m={THREE} wait={null} busy onOpen={() => {}} />
        <MessageItem m={OPENED} wait={null} onOpen={() => {}} />
        <MessageItem m={FOURTEEN} wait="extreme" onOpen={() => {}} />
        <MessageItem m={THREE} wait="world" onOpen={() => {}} />
      </ul>
      <p className={label}>INFO on its own</p>
      <WelcomeBackInfo className="justify-self-end" />
      {open === 'alone' && pop([SEVEN], null)}
      {open === 'extreme' && pop([FOURTEEN], 'extreme')}
      {open === 'mixed' && pop([SEVEN, DEV], null)}
      <WelcomeBackRulesModal open={open === 'rules'} onClose={close} />
      {open === 'moment' && <GiftMoment landed={SEVEN_LANDED} onDone={close} />}
    </div>
  )
}
