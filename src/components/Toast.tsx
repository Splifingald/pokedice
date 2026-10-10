import { AnimatePresence, motion } from 'framer-motion'
import { useT } from '@/i18n/react'
import { useIsDesktop } from '@/lib/useMediaQuery'
import { dismissToast, useGame } from '@/store/game'
import { cx } from '@/theme/util'

const TONE = {
  info: 'bg-panel text-ink',
  good: 'bg-hp-green text-ink',
  bad: 'bg-crimson text-white',
}

/**
 * Desktop: bottom of the screen. Phones: just under the top bar — the bottom there is the tab bar, the battle tray and
 * the sticky CONTINUE / LEAVE buttons, and a toast on top of them swallowed the tap meant for them.
 */
export function ToastStack() {
  const { t } = useT()
  const toasts = useGame((s) => s.toasts)
  const desktop = useIsDesktop()
  const from = desktop ? 30 : -30
  return (
    <section
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
          <motion.button
            key={toast.id}
            type="button"
            layout
            initial={{ y: from, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: from / 3, opacity: 0 }}
            onClick={() => dismissToast(toast.id)}
            className={`pixel-btn pointer-events-auto max-w-md px-4 py-1.5 text-xl ${TONE[toast.tone]}`}
          >
            {toast.text}
          </motion.button>
        ))}
      </AnimatePresence>
    </section>
  )
}
