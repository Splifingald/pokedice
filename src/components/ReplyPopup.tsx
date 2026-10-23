// The developer answered, or wrote first: when the player opens the game (signs in, or comes back to the tab a while
// later), answers they haven't seen yet pop up, between fights, on their turn in the one-time pop-ups' queue
// (engine/popups.ts: after Prof. Oak's tutorials). A message carrying a gift (docs/15 §23) shows it under the words, and
// pops up until it's opened: closing the message opens it (the rules first, the first time). Closing marks the answers
// seen; they stay in Contact the developer → My messages.
import { useEffect } from 'react'
import { giftsWait, parseGifts } from '@/engine'
import { useT } from '@/i18n/react'
import { unopenedGifts, unseenReplies, useInbox, type MyMessage } from '@/lib/feedback'
import { isSupabaseConfigured } from '@/lib/supabase'
import { requestGifts, useGiftMoment } from '@/store/gifts'
import { useGame } from '@/store/game'
import { useCloudSync } from '@/store/sync'
import { GiftPresent } from './Gifts'
import { Modal } from './Modal'
import { PixelButton } from './PixelButton'
import { ReplyBox } from './ContactModal'
import { useMyTurn, useOnScreen } from './popupTurn'

/** Coming back to the tab asks again, at most this often. */
const AGAIN_MS = 5 * 60_000
let lastLoad = 0

/** What pops up: the answers not seen yet, and the messages whose gift isn't opened (where gifts open), oldest first. */
function toShow(messages: MyMessage[], later: readonly number[], giftsHere: boolean): MyMessage[] {
  const unseen = unseenReplies(messages)
  // Gifts not opened yet pop up again until they are, where they can open (and not put off this visit).
  const gifted = giftsHere ? unopenedGifts(messages).filter((m) => !later.includes(m.id)) : []
  return [...unseen, ...gifted.filter((g) => !unseen.some((u) => u.id === g.id))].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  )
}

/** Something is waiting to pop up: the queue's `replies` (engine/popups.ts). */
export function useRepliesWaiting(): boolean {
  const messages = useInbox((s) => s.messages)
  const later = useInbox((s) => s.later)
  const giftsHere = useGame((s) => !!s.save && giftsWait(s.save, s.data) === null)
  return !!messages && toShow(messages, later, giftsHere).length > 0
}

export function ReplyPopup() {
  const { t, tPlural } = useT()
  const status = useGame((s) => s.auth.status)
  const userId = useGame((s) => s.auth.userId)
  const messages = useInbox((s) => s.messages)
  const later = useInbox((s) => s.later)
  const load = useInbox((s) => s.load)
  const markSeen = useInbox((s) => s.markSeen)
  const turn = useMyTurn('replies')
  const wait = useGame((s) => (s.save ? giftsWait(s.save, s.data) : 'off'))
  // A signed-in player's gifts wait for the sign-in's sync, so the cloud copy can't replace what they went into.
  const synced = useCloudSync((s) => s.settled)
  const syncWait = status === 'signed_in' && !synced
  const giftsBusy = useGiftMoment((s) => s.busy || !!s.rulesFor || !!s.opening)

  // Once we know who is playing, and again whenever that changes (signing in brings the account's messages).
  useEffect(() => {
    if (!isSupabaseConfigured || status === 'unknown') return
    lastLoad = Date.now()
    void load()
  }, [status, userId, load])
  // Back to the tab a while later: a message (or a gift) may have come meanwhile.
  useEffect(() => {
    if (!isSupabaseConfigured) return
    const onShow = () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastLoad < AGAIN_MS) return
      lastLoad = Date.now()
      void useInbox.getState().load()
    }
    document.addEventListener('visibilitychange', onShow)
    return () => document.removeEventListener('visibilitychange', onShow)
  }, [])

  const giftsHere = wait === null
  const unseen = messages ? unseenReplies(messages) : []
  const shown = messages ? toShow(messages, later, giftsHere) : []
  const giftOf = (m: MyMessage) => (wait === 'off' || m.gifts_claimed ? [] : parseGifts(m.gifts))
  const toOpen = giftsHere ? shown.filter((m) => giftOf(m).length > 0) : []
  const open = shown.length > 0 && turn && !giftsBusy && !(toOpen.length > 0 && syncWait)
  useOnScreen('replies', open)
  const fromDev = shown.length > 0 && shown.every((m) => m.from_admin)

  const close = () => {
    markSeen(unseen.map((m) => m.id))
    requestGifts(toOpen.map((m) => m.id))
  }

  return (
    <Modal open={open} onClose={close} title={t(fromDev ? 'ui.contact.newsTitle' : 'ui.contact.replyTitle')}>
      <div className="flex flex-col gap-3">
        <p className="text-xl leading-snug">
          {t(fromDev ? 'ui.contact.newsIntro' : 'ui.contact.replyIntro')}
        </p>
        <ul className="flex flex-col gap-3">
          {shown.map((m) => {
            const gifts = giftOf(m)
            return (
              <li key={m.id} className="flex flex-col gap-1">
                <p className="break-words text-xl leading-tight">{m.title}</p>
                {m.reply && <ReplyBox reply={m.reply} at={m.replied_at} fromDev={m.from_admin} />}
                {gifts.length > 0 && <GiftPresent count={gifts.length} wait={wait} className="mt-1" />}
              </li>
            )
          })}
        </ul>
        <div className="flex justify-end">
          <PixelButton variant="primary" onClick={close}>
            {toOpen.length ? tPlural('ui.gift.open', toOpen.length) : t('ui.common.ok')}
          </PixelButton>
        </div>
      </div>
    </Modal>
  )
}
