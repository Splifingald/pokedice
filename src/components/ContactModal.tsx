// Side menu → Contact the developer: a title and a message, sent to Admin → Messages.
import { useState, type FormEvent } from 'react'
import { useT } from '@/i18n/react'
import { FEEDBACK_MESSAGE_MAX, FEEDBACK_TITLE_MAX, sendFeedback } from '@/lib/feedback'
import { pushToast } from '@/store/game'
import { Modal } from './Modal'
import { PixelButton } from './PixelButton'

/** Closing without sending keeps what was typed for next time; a sent message closes the form. */
export function ContactModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT()
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
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={t('ui.contact.title')}>
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
        <p className="copy border-2 border-ink bg-gold/30 p-2 text-lg leading-snug">
          {t('ui.contact.warning')}
        </p>
        <label className="flex flex-col gap-1 text-xl">
          {t('ui.contact.subject')}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={FEEDBACK_TITLE_MAX}
            className="min-h-[44px] w-full border-[3px] border-ink bg-panel px-2 text-xl"
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
            className="copy w-full resize-y border-[3px] border-ink bg-panel p-2 text-lg leading-snug"
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
    </Modal>
  )
}
