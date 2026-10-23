import { PixelIcon } from '@/components/icons'
import { useT } from '@/i18n/react'

/**
 * Where the autopilot takes a card by itself (docs/36: a preview, the Pokémon Center, the Game Corner), this line stands
 * in for the card for the moment it takes.
 */
export function AutopilotNote() {
  const { t } = useT()
  return (
    <p
      className="pixel-dialogue m-0 flex items-center gap-3 px-3 py-2.5 text-[20px] leading-[1.15]"
      role="status"
    >
      <PixelIcon name="dice" size={24} className="shrink-0" />
      <span>{t('ui.idle.onTheWay')}</span>
    </p>
  )
}
