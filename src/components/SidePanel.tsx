import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '@/i18n/react'
import { cx } from '@/theme/util'
import { PixelIcon } from './icons'

/**
 * A drawer sliding in from the right, under `Modal`'s z-index so a dialog opened from inside it
 * (the profile, the guide) lands on top. Same conventions as `Modal`: portal, Escape, focus back
 * where it came from, click-outside to close.
 */
export function SidePanel({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  /** Pinned to the bottom of the drawer, under the scrolling body. */
  footer?: ReactNode
}) {
  const { t } = useT()
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      prev?.focus?.()
    }
  }, [open, onClose])

  if (typeof document === 'undefined') return null
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] flex justify-end bg-ink/60"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose()
          }}
        >
          <motion.div
            ref={ref}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className={cx(
              'flex h-full w-full max-w-[20rem] flex-col border-l-[3px] border-ink bg-parchment outline-none',
              'shadow-[-3px_0_0_#6b6480]',
            )}
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.18 }}
          >
            <div className="flex items-center justify-between gap-2 border-b-[3px] border-ink bg-ink px-3 py-2 text-panel">
              <h2 id={titleId} className="min-w-0 truncate text-3xl leading-none">
                {title}
              </h2>
              <button
                type="button"
                className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center md:h-9 md:w-9"
                onClick={onClose}
                aria-label={t('ui.common.close')}
              >
                <PixelIcon name="close" size={16} color="#f7f2e0" />
              </button>
            </div>
            <div className="pixel-scroll flex-1 overflow-y-auto p-3">{children}</div>
            {footer && <div className="border-t-[3px] border-ink bg-panel p-3">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
