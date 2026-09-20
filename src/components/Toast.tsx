import { AnimatePresence, motion } from 'framer-motion'
import { useT } from '@/i18n/react'
import { dismissToast, useGame } from '@/store/game'

const TONE = {
  info: 'bg-panel text-ink',
  good: 'bg-hp-green text-ink',
  bad: 'bg-danger text-panel',
}

export function ToastStack() {
  const { t } = useT()
  const toasts = useGame((s) => s.toasts)
  return (
    <section
      className="pointer-events-none fixed inset-x-0 bottom-3 z-[100] flex flex-col items-center gap-2 px-3"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label={t('ui.toast.stack')}
      aria-live="polite"
    >
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.button
            key={toast.id}
            type="button"
            layout
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 10, opacity: 0 }}
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
