import { useState } from 'react'
import { useT } from '@/i18n/react'
import { forfeit } from '@/store/run'
import { cx } from '@/theme/util'
import { PixelIcon } from './icons'
import { Modal } from './Modal'
import { PixelButton } from './PixelButton'

/** Always the last thing in a "who's next?" menu: give up the fight, after a confirmation — the round is lost. */
export function ForfeitButton({
  className,
  onForfeit,
  flag = false,
}: {
  className?: string
  onForfeit?: () => void
  /** The flag alone, its name for screen readers and on hover: at the side of a GO! row (docs/43 §5.3). */
  flag?: boolean
}) {
  const { t } = useT()
  const [confirm, setConfirm] = useState(false)
  return (
    <>
      {flag ? (
        <PixelButton
          size="lg"
          variant="ghost"
          className={cx('!min-w-[56px] px-2', className)}
          aria-label={t('ui.battle.forfeit')}
          title={t('ui.battle.forfeit')}
          onClick={() => setConfirm(true)}
        >
          <PixelIcon name="flag" size={22} />
        </PixelButton>
      ) : (
        <PixelButton
          size="sm"
          variant="ghost"
          className={cx('w-full', className)}
          onClick={() => setConfirm(true)}
        >
          <PixelIcon name="flag" size={14} /> {t('ui.battle.forfeit')}
        </PixelButton>
      )}
      <Modal open={confirm} onClose={() => setConfirm(false)} title={t('ui.battle.forfeitTitle')}>
        <p className="copy mb-4 text-lg">{t('ui.battle.forfeitBody')}</p>
        <div className="flex justify-end gap-2">
          <PixelButton onClick={() => setConfirm(false)}>{t('ui.common.cancel')}</PixelButton>
          <PixelButton
            variant="danger"
            onClick={() => {
              setConfirm(false)
              onForfeit?.()
              forfeit()
            }}
          >
            <PixelIcon name="flag" size={14} /> {t('ui.battle.forfeit')}
          </PixelButton>
        </div>
      </Modal>
    </>
  )
}
