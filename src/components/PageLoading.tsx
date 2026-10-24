// The wait while a page loads (a route split out of the main bundle, docs/15 §11): a Poké Ball drawn in code, wobbling
// in pixel steps as it does before a catch; still under calm (docs/15 §8). "Loading…" stays for screen readers.
import { useT } from '@/i18n/react'
import { useMotion } from '@/lib/motion'
import { cx } from '@/theme/util'
import { PixelIcon } from './icons'

/** `still`: as calm draws it, whatever the setting (the kitchen sink). */
export function PageLoading({ className, still }: { className?: string; still?: boolean }) {
  const { t } = useT()
  const { calm } = useMotion()
  return (
    <div role="status" className={cx('flex min-h-[40vh] items-center justify-center p-6', className)}>
      <span className={cx('inline-block', !calm && !still && 'loading-ball')} aria-hidden="true">
        <PixelIcon name="ball" size={48} />
      </span>
      <span className="sr-only">{t('ui.common.loading')}</span>
    </div>
  )
}
