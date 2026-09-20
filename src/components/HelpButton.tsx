import { lazy, Suspense, useState } from 'react'
import { useT } from '@/i18n/react'
import { Modal } from './Modal'
import { PixelButton } from './PixelButton'

const HelpContent = lazy(() => import('@/screens/Help').then((m) => ({ default: m.HelpContent })))

/** "?" — opens the rules and the type chart in a modal (Settings → How to play). */
export function HelpButton({ size = 'sm', label = false }: { size?: 'sm' | 'md' | 'lg'; label?: boolean }) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  return (
    <>
      <PixelButton
        size={size}
        variant="secondary"
        onClick={() => setOpen(true)}
        aria-label={t('ui.settings.howToPlay')}
        title={t('ui.settings.howToPlay')}
      >
        ?{label && <span>{t('ui.settings.howToPlay')}</span>}
      </PixelButton>
      <Modal open={open} onClose={() => setOpen(false)} title={t('ui.settings.howToPlay')} className="max-w-3xl">
        <Suspense fallback={<p className="text-xl">{t('ui.common.loading')}</p>}>
          <HelpContent />
        </Suspense>
      </Modal>
    </>
  )
}
