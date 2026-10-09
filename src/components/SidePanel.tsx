import { AnimatePresence, motion } from 'framer-motion'
import { useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '@/i18n/react'
import { useDialog } from '@/lib/useDialog'
import { cx } from '@/theme/util'
import { CloseButton } from './Modal'

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
  useT()
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useDialog(ref, open, onClose)

  if (typeof document === 'undefined') return null
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] flex justify-end bg-ink/55"
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
              'flex h-full w-full max-w-[24rem] flex-col bg-parchment outline-none',
              'shadow-[-2px_0_0_#24304f,-6px_0_0_#24304f22]',
            )}
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.18 }}
          >
            <div className="flex items-center justify-between gap-2 bg-panel px-3 py-2 shadow-[0_2px_0_#24304f]">
              <h2 id={titleId} className="min-w-0 truncate text-title leading-none">
                {title}
              </h2>
              <CloseButton onClick={onClose} />
            </div>
            <div className="pixel-scroll flex-1 overflow-y-auto p-3">{children}</div>
            {footer && <div className="bg-panel p-3 shadow-[0_-2px_0_#24304f]">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
