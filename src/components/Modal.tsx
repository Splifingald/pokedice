import { AnimatePresence, motion } from 'framer-motion'
import { useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { t } from '@/i18n'
import { useDialog } from '@/lib/useDialog'
import { cx } from '@/theme/util'
import { PixelIcon } from './icons'

export function Modal({
  open,
  onClose,
  title,
  children,
  className,
  dismissable = true,
  label,
}: {
  open: boolean
  onClose?: () => void
  title?: ReactNode
  children: ReactNode
  className?: string
  /** False for decisions that must be made (e.g. "Add to team?"). */
  dismissable?: boolean
  /** Accessible name when the modal has no visible title. */
  label?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useDialog(ref, open, dismissable ? onClose : undefined)

  if (typeof document === 'undefined') return null
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-ink/55 p-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && dismissable) onClose?.()
          }}
        >
          <motion.div
            ref={ref}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            aria-label={title ? undefined : (label ?? t('ui.modal.dialog'))}
            className={cx('pixel-panel pixel-scroll max-h-[90vh] w-full max-w-lg overflow-auto p-4 outline-none', className)}
            initial={{ scale: 0.9, y: 16 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 8 }}
          >
            {(title || (dismissable && onClose)) && (
              <div className="mb-3 flex items-start justify-between gap-3">
                <h2 id={titleId} className="text-title leading-none">
                  {title}
                </h2>
                {dismissable && onClose && <CloseButton onClick={onClose} />}
              </div>
            )}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

/** The ✕ in a dialog's corner: 44px, a flat ink ring. */
export function CloseButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      className={cx('flex h-11 w-11 shrink-0 items-center justify-center bg-panel shadow-ring', className)}
      onClick={onClick}
      aria-label={t('ui.common.close')}
    >
      <PixelIcon name="close" size={14} />
    </button>
  )
}
