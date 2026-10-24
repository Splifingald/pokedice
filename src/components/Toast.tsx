import { AnimatePresence, motion, type MotionProps } from 'framer-motion'
import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '@/i18n/react'
import { useIsDesktop } from '@/lib/useMediaQuery'
import { dismissToast, holdToast, useGame, type Toast } from '@/store/game'
import { cx } from '@/theme/util'
import { CloseButton } from './Modal'

const TONE = {
  info: 'bg-panel text-ink',
  good: 'bg-hp-green text-ink',
  bad: 'bg-crimson text-white',
}

/**
 * One toast (docs/15 §7). A tap on it closes it; an error has its ✕ instead (it stays until closed). While a finger or
 * the pointer is on it, or the focus in it, its countdown waits (`holdToast`).
 */
export function ToastCard({ toast, motionProps }: { toast: Toast; motionProps?: MotionProps }) {
  const held = useRef({ pointer: false, focus: false })
  const hold = (what: 'pointer' | 'focus', on: boolean) => {
    held.current[what] = on
    holdToast(toast.id, held.current.pointer || held.current.focus)
  }
  const handlers = {
    onPointerEnter: () => hold('pointer', true),
    onPointerLeave: () => hold('pointer', false),
    onPointerCancel: () => hold('pointer', false),
    onFocus: () => hold('focus', true),
    onBlur: () => hold('focus', false),
  }
  if (toast.tone === 'bad')
    return (
      <motion.div
        {...motionProps}
        {...handlers}
        className={cx(
          'pixel-panel pointer-events-auto flex max-w-md items-center gap-2 py-1 pl-4 pr-1 text-xl',
          TONE.bad,
        )}
      >
        <span className="min-w-0 flex-1">{toast.text}</span>
        <CloseButton onClick={() => dismissToast(toast.id)} />
      </motion.div>
    )
  return (
    <motion.button
      type="button"
      {...motionProps}
      {...handlers}
      onClick={() => dismissToast(toast.id)}
      className={`pixel-btn pointer-events-auto max-w-md px-4 py-1.5 text-xl ${TONE[toast.tone]}`}
    >
      {toast.text}
    </motion.button>
  )
}

/**
 * Desktop: bottom of the screen. Phones: just under the top bar — the bottom there is the tab bar, the battle tray and
 * the sticky CONTINUE / LEAVE buttons, and a toast on top of them swallowed the tap meant for them. On <body>, beside
 * the dialogs rather than in the page: a dialog makes the page inert (lib/inert.ts), and the toasts stay readable.
 */
export function ToastStack() {
  const { t } = useT()
  const toasts = useGame((s) => s.toasts)
  const desktop = useIsDesktop()
  const from = desktop ? 30 : -30
  if (typeof document === 'undefined') return null
  return createPortal(
    <section
      // Stays live under a dialog (lib/inert.ts STAY_LIVE).
      data-stay-live=""
      className={cx(
        'pointer-events-none fixed inset-x-0 z-[100] flex flex-col items-center gap-2 px-3',
        desktop ? 'bottom-3' : 'top-[calc(3.5rem+3px+0.5rem)]',
      )}
      style={desktop ? { paddingBottom: 'env(safe-area-inset-bottom)' } : undefined}
      aria-label={t('ui.toast.stack')}
      aria-live="polite"
    >
      <AnimatePresence>
        {toasts.map((toast) => (
          <ToastCard
            key={toast.id}
            toast={toast}
            motionProps={{
              layout: true,
              initial: { y: from, opacity: 0 },
              animate: { y: 0, opacity: 1 },
              exit: { y: from / 3, opacity: 0 },
            }}
          />
        ))}
      </AnimatePresence>
    </section>,
    document.body,
  )
}
