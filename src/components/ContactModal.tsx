// Side menu → Contact the developer: a title and a message, sent to Admin → Messages; and My messages, every message
// the player sent with the developer's answer, what the developer wrote first, and the gifts they carry (docs/15 §23),
// also opened on its own from the menu's Inbox row.
import { useEffect, useState, type FormEvent } from 'react'
import { getLang } from '@/i18n'
import { useT } from '@/i18n/react'
import { offlineOr } from '@/lib/online'
import { LEAGUE_REWARD_TITLE, leagueRewardNote } from '@/lib/versusLeague'
import { giftsWait, parseGifts, WELCOME_BACK_TITLE, welcomeBackNote, type GiftsWait } from '@/engine'
import {
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_TITLE_MAX,
  sendFeedback,
  unopenedGifts,
  unseenReplies,
  useInbox,
  type MyMessage,
} from '@/lib/feedback'
import { requestGifts, useGiftMoment } from '@/store/gifts'
import { pushToast, useGame } from '@/store/game'
import { useCloudSync } from '@/store/sync'
import { cx } from '@/theme/util'
import { GiftOpened, GiftPresent, GiftRulesModal } from './Gifts'
import { Sheet } from './Sheet'
import { PixelButton } from './PixelButton'
import { InfoButton } from './RulesModal'
import { useWelcomeWords } from './WelcomeBack'

const when = (iso: string) =>
  new Date(iso).toLocaleString(getLang(), { dateStyle: 'medium', timeStyle: 'short' })

/**
 * The developer's answer to a message, framed so it reads apart from what the player wrote; or, `fromDev`, the message
 * the developer wrote first.
 */
export function ReplyBox({ reply, at, fromDev }: { reply: string; at: string | null; fromDev?: boolean }) {
  const { t } = useT()
  const welcomeWords = useWelcomeWords()
  // The weekly league's rewards (docs/44) and a welcome back (docs/58): the server sends their numbers, the game says
  // them in the player's language.
  const league = leagueRewardNote(reply)
  const welcome = welcomeBackNote(reply)
  const words = league
    ? t('ui.league.reward.body', {
        rank: league.rank,
        size: league.size,
        trophies: league.trophies,
        week: league.week,
      })
    : welcome
      ? welcomeWords(welcome)
      : reply
  return (
    <div className="bg-gold-pale p-2 shadow-ring">
      <p className="flex flex-wrap items-baseline justify-between gap-x-2 text-lg leading-none">
        <b>{t(league ? 'ui.league.title' : fromDev ? 'ui.contact.fromDev' : 'ui.contact.answer')}</b>
        {at && <span className="text-base text-muted">{when(at)}</span>}
      </p>
      <p className="copy mt-1 whitespace-pre-wrap break-words text-lg leading-snug">{words}</p>
    </div>
  )
}

/** A message's title; the weekly league's reward (docs/44) and a welcome back (docs/58) have their own, in the player's language. */
export const messageTitle = (t: (k: string) => string, title: string) =>
  title === LEAGUE_REWARD_TITLE
    ? t('ui.league.reward.title')
    : title === WELCOME_BACK_TITLE
      ? t('ui.welcome.title')
      : title

/**
 * Everything the player sent, newest first, each with its answer, and what the developer wrote first; the gifts any of
 * them carries (opened: what it held; not yet: OPEN IT, or why it waits), and the gifts' INFO. Opening it marks the
 * answers seen.
 */
function History({ onClose }: { onClose: () => void }) {
  const { t } = useT()
  const messages = useInbox((s) => s.messages)
  const loading = useInbox((s) => s.loading)
  const load = useInbox((s) => s.load)
  const markSeen = useInbox((s) => s.markSeen)
  const wait = useGame((s) => (s.save ? giftsWait(s.save, s.data) : 'off'))
  // Asking the server, or a signed-in player's sync not settled yet: OPEN IT waits.
  const busy = useGiftMoment((s) => s.busy)
  const signedIn = useGame((s) => s.auth.status === 'signed_in')
  const synced = useCloudSync((s) => s.settled)
  const syncWait = signedIn && !synced
  const [rules, setRules] = useState(false)

  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => {
    if (messages) markSeen(unseenReplies(messages).map((m) => m.id))
  }, [messages, markSeen])

  if (!messages)
    return (
      <p className="text-xl text-muted">
        {loading ? t('ui.common.loading') : offlineOr(t('ui.contact.historyFailed'))}
      </p>
    )
  const info = wait !== 'off' && (
    <>
      <InfoButton name={t('ui.gift.infoName')} onClick={() => setRules(true)} />
      <GiftRulesModal open={rules} onClose={() => setRules(false)} />
    </>
  )
  if (!messages.length)
    return (
      <div className="flex flex-col gap-3">
        <p className="text-xl text-muted">{t('ui.contact.historyEmpty')}</p>
        {info}
      </div>
    )
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {messages.map((m) => (
          <MessageItem
            key={m.id}
            m={m}
            wait={wait}
            busy={busy || syncWait}
            onOpen={() => {
              // The opening takes the whole screen: the form goes first.
              onClose()
              requestGifts([m.id])
            }}
          />
        ))}
      </ul>
      {info}
    </div>
  )
}

/**
 * One message in My messages: its title and time, what the player wrote, the answer (or the developer's own words),
 * its gift — what it held once opened, else the wrapped gift with OPEN IT or why it waits — and, under a welcome back
 * (docs/58), INFO for its rules.
 */
export function MessageItem({
  m,
  wait,
  busy,
  onOpen,
}: {
  m: MyMessage
  wait: GiftsWait | null
  busy?: boolean
  onOpen: () => void
}) {
  const { t } = useT()
  const gifts = wait === 'off' ? [] : parseGifts(m.gifts)
  return (
    <li className="flex flex-col gap-1 border-b-2 border-edge/20 pb-3 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <p className="min-w-0 break-words text-xl leading-tight">{messageTitle(t, m.title)}</p>
        <span className="text-base text-muted">{when(m.created_at)}</span>
      </div>
      {!m.from_admin && <p className="copy whitespace-pre-wrap break-words text-lg leading-snug">{m.message}</p>}
      {m.reply ? (
        <ReplyBox reply={m.reply} at={m.replied_at} fromDev={m.from_admin} />
      ) : (
        <p className="text-base text-muted">{t('ui.contact.noAnswer')}</p>
      )}
      {gifts.length > 0 &&
        (m.gifts_claimed ? (
          <GiftOpened gifts={gifts} />
        ) : (
          <GiftPresent count={gifts.length} wait={wait} busy={busy} onOpen={onOpen} />
        ))}
    </li>
  )
}

/** Answers not seen yet and gifts not opened: the count on the Inbox row and on My messages' tab. */
export function useInboxUnseen(): number {
  return useInbox((s) => (s.messages ? unseenReplies(s.messages).length + unopenedGifts(s.messages).length : 0))
}

/**
 * The trainer menu's Inbox (docs/38 U6b): My messages on its own, the developer's answers, what they wrote first and
 * the gifts, without going through Contact the developer (whose My messages tab is the same view).
 */
export function InboxModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT()
  return (
    <Sheet open={open} onClose={onClose} title={t('ui.contact.historyTab')}>
      <History onClose={onClose} />
    </Sheet>
  )
}

/** Closing without sending keeps what was typed for next time; a sent message closes the form. */
export function ContactModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT()
  const [tab, setTab] = useState<'write' | 'history'>('write')
  // New answers, and gifts waiting to be opened.
  const unseen = useInboxUnseen()
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ready = !!title.trim() && !!message.trim() && !sending

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!ready) return
    setSending(true)
    setError(null)
    const err = await sendFeedback(title, message)
    setSending(false)
    if (err) {
      setError(err === 'rate_limited' ? t('ui.contact.rateLimited') : offlineOr(t('ui.contact.failed')))
      return
    }
    setTitle('')
    setMessage('')
    pushToast(t('ui.contact.sent'), 'good')
    void useInbox.getState().load()
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('ui.contact.title')}>
      <div className="mb-3 flex gap-1" role="group" aria-label={t('ui.contact.title')}>
        {(
          [
            { id: 'write', label: t('ui.contact.newTab') },
            { id: 'history', label: t('ui.contact.historyTab') },
          ] as const
        ).map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={tab === f.id}
            onClick={() => setTab(f.id)}
            className={cx(
              'pixel-btn flex min-h-[40px] flex-1 items-center justify-center gap-2 px-2 text-xl leading-none',
              tab === f.id ? 'bg-gold' : 'bg-panel',
            )}
          >
            {f.label}
            {f.id === 'history' && unseen > 0 && (
              <span className="bg-crimson px-1 text-base leading-tight text-white">{unseen}</span>
            )}
          </button>
        ))}
      </div>
      {tab === 'history' ? (
        <History onClose={onClose} />
      ) : (
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
          <p className="copy bg-gold-pale p-2 text-lg leading-snug shadow-ring">
            {t('ui.contact.warning')}
          </p>
          <label className="flex flex-col gap-1 text-xl">
            {t('ui.contact.subject')}
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={FEEDBACK_TITLE_MAX}
              className="min-h-[44px] w-full bg-paper shadow-field px-2 text-xl"
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-xl">
            {t('ui.contact.message')}
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={FEEDBACK_MESSAGE_MAX}
              rows={7}
              className="copy w-full resize-y bg-paper shadow-field p-2 text-lg leading-snug"
              required
            />
          </label>
          {error && (
            <p role="alert" className="text-lg text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <PixelButton onClick={onClose}>{t('ui.common.cancel')}</PixelButton>
            <PixelButton type="submit" variant="primary" disabled={!ready}>
              {t(sending ? 'ui.contact.sending' : 'ui.contact.send')}
            </PixelButton>
          </div>
        </form>
      )}
    </Sheet>
  )
}
