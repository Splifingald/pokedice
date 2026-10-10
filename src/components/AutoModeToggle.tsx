import { useT } from '@/i18n/react'
import { setSettings, useGame } from '@/store/game'
import { PixelIcon } from './icons'
import { OakTip, useOneTimeTip } from './OakTip'
import { PixelButton } from './PixelButton'

// Professor Oak explains auto-mode the first time a cleared area offers it (per device).
const AUTO_TIP_KEY = 'pokedice.tip.auto'

/** Cleared areas only: fights play themselves on both sides while it's on. Off by default; the choice is saved. */
export function AutoModeToggle() {
  const { t } = useT()
  const on = useGame((s) => !!s.settings.autoMode)
  const [tip, closeTip] = useOneTimeTip(AUTO_TIP_KEY)
  return (
    <>
      {tip && <OakTip onClose={closeTip}>{t('ui.area.autoTip')}</OakTip>}
      <PixelButton
        size="sm"
        variant={on ? 'success' : 'ghost'}
        aria-pressed={on}
        onClick={() => setSettings({ autoMode: !on })}
      >
        <PixelIcon name="dice" size={16} />
        {t('ui.area.autoMode', { state: t(on ? 'ui.common.on' : 'ui.common.off') })}
      </PixelButton>
    </>
  )
}
