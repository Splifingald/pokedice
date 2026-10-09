// Side menu → Contact the developer: a title and a message, sent to Admin → Messages; and My messages, every message
// the player sent with the developer's answer.
import { useEffect, useState, type FormEvent } from 'react'
import { getLang } from '@/i18n'
import { useT } from '@/i18n/react'
import {
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_TITLE_MAX,
  sendFeedback,
  unseenReplies,
  useInbox,
} from '@/lib/feedback'
import { pushToast } from '@/store/game'
import { cx } from '@/theme/util'
import { Modal } from './Modal'
import { PixelButton } from './PixelButton'

const when = (iso: string) =>
  new Date(iso).toLocaleString(getLang(), { dateStyle: 'medium', timeStyle: 'short' })

/** The developer's answer to a message, framed so it reads apart from what the player wrote. */
export function ReplyBox({ reply, at }: { reply: string; at: string | null }) {
  const { t } = useT()
  return (
    <div className="bg-[#fff4d6] p-2 shadow-ring">
      <p className="flex flex-wrap items-baseline justify-between gap-x-2 text-lg leading-none">
        <b>{t('ui.contact.answer')}</b>
        {at && <span className="text-base text-muted">{when(at)}</span>}
      </p>
      <p className="copy mt-1 whitespace-pre-wrap break-words text-lg leading-snug">{reply}</p>
    </div>
  )
}

/** Everything the player sent, newest first, each with its answer. Opening it marks the answers seen. */
function History() {
  const { t } = useT()
  const messages = useInbox((s) => s.messages)
  const loading = useInbox((s) => s.loading)
  const load = useInbox((s) => s.load)
  const markSeen = useInbox((s) => s.markSeen)

  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => {
    if (messages) markSeen(unseenReplies(messages).map((m) => m.id))
  }, [messages, markSeen])

  if (!messages)
    return (
      <p className="text-xl text-muted">{t(loading ? 'ui.common.loading' : 'ui.contact.historyFailed')}</p>
    )
  if (!messages.length) return <p className="text-xl text-muted">{t('ui.contact.historyEmpty')}</p>
  return (
    <ul className="flex flex-col gap-3">
      {messages.map((m) => (
        <li
          key={m.id}
          className="flex flex-col gap-1 border-b-2 border-ink/20 pb-3 last:border-b-0 last:pb-0"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-2">
            <p className="min-w-0 break-words text-xl leading-tight">{m.title}</p>
            <span className="text-base text-muted">{when(m.created_at)}</span>
          </div>
          <p className="copy whitespace-pre-wrap break-words text-lg leading-snug">{m.message}</p>
          {m.reply ? (
            <ReplyBox reply={m.reply} at={m.replied_at} />
          ) : (
            <p className="text-base text-muted">{t('ui.contact.noAnswer')}</p>
          )}
        </li>
      ))}
    </ul>
  )
}

/** Closing without sending keeps what was typed for next time; a sent message closes the form. */
export function ContactModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT()
  const [tab, setTab] = useState<'write' | 'history'>('write')
  const unseen = useInbox((s) => (s.messages ? unseenReplies(s.messages).length : 0))
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
      setError(t(err === 'rate_limited' ? 'ui.contact.rateLimited' : 'ui.contact.failed'))
      return
    }
    setTitle('')
    setMessage('')
    pushToast(t('ui.contact.sent'), 'good')
    void useInbox.getState().load()
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={t('ui.contact.title')}>
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
              <span className="bg-danger px-1 text-base leading-tight text-panel">{unseen}</span>
            )}
          </button>
        ))}
      </div>
      {tab === 'history' ? (
        <History />
      ) : (
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
          <p className="copy bg-[#fff4d6] p-2 text-lg leading-snug shadow-ring">
            {t('ui.contact.warning')}
          </p>
          <label className="flex flex-col gap-1 text-xl">
            {t('ui.contact.subject')}
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={FEEDBACK_TITLE_MAX}
              className="min-h-[44px] w-full bg-paper shadow-[inset_0_0_0_2px_#24304f,inset_0_3px_0_#dfe7f2] px-2 text-xl"
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
              className="copy w-full resize-y bg-paper shadow-[inset_0_0_0_2px_#24304f,inset_0_3px_0_#dfe7f2] p-2 text-lg leading-snug"
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
    </Modal>
  )
}
