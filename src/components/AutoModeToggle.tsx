import { idleModeOn, playStyleOf } from '@/engine'
import { useT } from '@/i18n/react'
import { setSettings, useGame } from '@/store/game'
import { PixelIcon } from './icons'
import { OakTip, useOneTimeTip } from './OakTip'
import { PixelButton } from './PixelButton'

// Professor Oak explains auto-mode the first time a cleared area offers it (per device).
const AUTO_TIP_KEY = 'pokedice.tip.auto'

/**
 * Where the play style offers it (a cleared area; with Idle, any: docs/36): the run plays itself while it's on. Off by
 * default (Idle starts on); the choice is saved.
 */
export function AutoModeToggle() {
  const on = useGame((s) => !!s.settings.autoMode)
  // Idle mode's switch says IDLE; Prof. Oak's tip is auto-mode's (Idle has its rules pop-up).
  const idle = useGame((s) => idleModeOn(s.data) && playStyleOf(s.settings) === 'idle')
  const [tip, closeTip] = useOneTimeTip(AUTO_TIP_KEY)
  return (
    <AutoModeButton
      on={on}
      idle={idle}
      tip={tip && !idle}
      onCloseTip={closeTip}
      onToggle={() => setSettings({ autoMode: !on })}
    />
  )
}

/** The switch itself, every state on /kitchen-sink: AUTO-MODE or IDLE, on or off, with Prof. Oak's tip or not. */
export function AutoModeButton({
  on,
  idle = false,
  tip = false,
  onCloseTip,
  onToggle,
}: {
  on: boolean
  idle?: boolean
  tip?: boolean
  onCloseTip?: () => void
  onToggle: () => void
}) {
  const { t } = useT()
  const state = t(on ? 'ui.common.on' : 'ui.common.off')
  // Its own column: the tip takes the full width above the button, never squeezed beside it in a row.
  return (
    <div className="flex w-full flex-col items-end gap-2">
      {tip && <OakTip onClose={() => onCloseTip?.()}>{t('ui.area.autoTip')}</OakTip>}
      <PixelButton size="sm" variant={on ? 'success' : 'ghost'} aria-pressed={on} onClick={onToggle}>
        <PixelIcon name="dice" size={16} />
        {idle ? t('ui.idle.toggle', { state }) : t('ui.area.autoMode', { state })}
      </PixelButton>
    </div>
  )
}
