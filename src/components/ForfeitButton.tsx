import { useState } from 'react'
import { useT } from '@/i18n/react'
import { forfeit } from '@/store/run'
import { cx } from '@/theme/util'
import { PixelIcon } from './icons'
import { Modal } from './Modal'
import { PixelButton } from './PixelButton'

/** Always the last thing in a "who's next?" menu: give up the fight, after a confirmation — the round is lost. */
export function ForfeitButton({ className, onForfeit }: { className?: string; onForfeit?: () => void }) {
  const { t } = useT()
  const [confirm, setConfirm] = useState(false)
  return (
    <>
      <PixelButton size="sm" variant="ghost" className={cx('w-full', className)} onClick={() => setConfirm(true)}>
        <PixelIcon name="flag" size={14} /> {t('ui.battle.forfeit')}
      </PixelButton>
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
