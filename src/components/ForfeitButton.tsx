import { useState } from 'react'
import { rivalLossForgiven } from '@/engine'
import { useT } from '@/i18n/react'
import { useGame } from '@/store/game'
import { forfeit } from '@/store/run'
import { cx } from '@/theme/util'
import { PixelIcon } from './icons'
import { Modal } from './Modal'
import { PixelButton } from './PixelButton'

/**
 * Always the last thing in a "who's next?" menu: give up the fight, after a confirmation — the round is lost (a rival's
 * set meeting aside: docs/61 §5.4).
 */
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
  // A rival's set meeting with its switch on (docs/61 §5.4): giving up loses no round, the rival moves on.
  const rival = useGame((s) => {
    const enc = s.run.encounter
    return !onForfeit && enc?.kind === 'trainer' && rivalLossForgiven(s.data, enc.moment) ? enc.name : null
  })
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
        <p className="copy mb-4 text-lg">
          {rival ? t('ui.battle.forfeitBodyRival', { name: rival }) : t('ui.battle.forfeitBody')}
        </p>
        <div className="flex justify-end gap-2">
          <PixelButton onClick={() => setConfirm(false)}>{t('ui.common.cancel')}</PixelButton>
          <PixelButton
            variant="danger"
            onClick={() => {
              setConfirm(false)
              // A fight of its own (a Friend Battle, docs/65) gives up its way; else the run's fight.
              if (onForfeit) onForfeit()
              else forfeit()
            }}
          >
            <PixelIcon name="flag" size={14} /> {t('ui.battle.forfeit')}
          </PixelButton>
        </div>
      </Modal>
    </>
  )
}
