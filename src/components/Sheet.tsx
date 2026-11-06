import { AnimatePresence, motion } from 'framer-motion'
import { createContext, useContext, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useDialog } from '@/lib/useDialog'
import { useIsDesktop } from '@/lib/useMediaQuery'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'
import { CloseButton } from './Modal'

/**
 * Inside a `SplitView`'s docked pane on a wide screen (docs/43 §2): a sheet opened there is drawn in the pane, beside
 * the list it was opened from, rather than over the page — no scrim, no focus trap, nothing made inert.
 */
export const SheetDock = createContext(false)

/**
 * A sheet: on phones it rises from the bottom (a grab handle on top, ✕ in its corner, 90 % of the screen at most); on
 * wider screens it is a centred panel. A title, an optional line under it and `head` (filters, a search) stay put
 * while the body scrolls; `footer` is pinned to the bottom.
 */
export function Sheet({
  open,
  onClose,
  title,
  sub,
  titleExtra,
  head,
  footer,
  children,
  className,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  sub?: ReactNode
  /** Beside the title (a "Regions" switch). */
  titleExtra?: ReactNode
  /** Under the title, outside the scroll (a search, chips). */
  head?: ReactNode
  footer?: ReactNode
  children: ReactNode
  className?: string
  wide?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const desktop = useIsDesktop()
  const reduced = useGame((s) => s.settings.reducedMotion)
  const docked = useContext(SheetDock)
  useDialog(ref, open && !docked, onClose)
  if (docked)
    return open ? (
      <section aria-labelledby={titleId} className={cx('flex min-h-0 w-full min-w-0 flex-1 flex-col', className)}>
        <header className="flex shrink-0 items-start gap-2 px-3.5 pb-2 pt-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id={titleId} className="min-w-0 text-title leading-none">
                {title}
              </h2>
              {titleExtra}
            </div>
            {sub && <p className="mt-0.5 font-pixel-sm text-[17px] leading-tight text-muted">{sub}</p>}
          </div>
        </header>
        {head && <div className="flex shrink-0 flex-col gap-2 px-3.5 pb-2">{head}</div>}
        <div className="pixel-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-3.5 pb-4">{children}</div>
        {footer && (
          <div className="shrink-0 bg-panel px-3.5 py-2.5 shadow-[0_-2px_0_rgb(var(--c-lip))]">{footer}</div>
        )}
      </section>
    ) : null
  if (typeof document === 'undefined') return null
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className={cx(
            'fixed inset-0 z-[85] flex bg-night/55',
            desktop ? 'items-center justify-center p-4' : 'items-end',
          )}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.16 }}
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
              // min-w-0: a flex item, it would otherwise grow to its widest unbreakable line and run off a phone.
              'flex w-full min-w-0 flex-col bg-panel outline-none',
              desktop
                ? cx('pixel-panel max-h-[85vh]', wide ? 'max-w-3xl' : 'max-w-xl')
                : 'max-h-[90dvh] shadow-[0_-2px_0_rgb(var(--c-edge)),0_-6px_0_rgb(var(--c-edge)/0.13)]',
              className,
            )}
            style={desktop ? undefined : { paddingBottom: 'env(safe-area-inset-bottom)' }}
            initial={desktop ? { y: 12 } : { y: '40%', opacity: 0.4 }}
            animate={{ y: 0, opacity: 1 }}
            exit={desktop ? { y: 8, opacity: 0 } : { y: '30%', opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.22, ease: [0.2, 0.9, 0.3, 1] }}
          >
            {!desktop && <div className="mx-auto mb-0.5 mt-2 h-[5px] w-11 shrink-0 bg-shadow" aria-hidden />}
            <header className="flex shrink-0 items-start gap-2 px-3.5 pb-2 pt-1 md:pt-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 id={titleId} className="min-w-0 text-title leading-none">
                    {title}
                  </h2>
                  {titleExtra}
                </div>
                {sub && <p className="mt-0.5 font-pixel-sm text-[16px] leading-tight text-muted">{sub}</p>}
              </div>
              <CloseButton onClick={onClose} />
            </header>
            {head && <div className="flex shrink-0 flex-col gap-2 px-3.5 pb-2">{head}</div>}
            {/* Focusable, so a keyboard can scroll a body that holds no control. */}
            <div
              tabIndex={0}
              role="region"
              aria-labelledby={titleId}
              className="pixel-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-3.5 pb-4"
            >
              {children}
            </div>
            {footer && (
              <div className="shrink-0 bg-panel px-3.5 py-2.5 shadow-[0_-2px_0_rgb(var(--c-lip))]">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
