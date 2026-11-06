import { PixelIcon } from '@/components/icons'
import { playStyleOf } from '@/engine'
import { useT } from '@/i18n/react'
import { useGame } from '@/store/game'

/**
 * Where the autopilot takes a card by itself (docs/36: a preview, the Pokémon Center, the Game Corner), this line stands
 * in for the card for the moment it takes. Idle catches by itself too; Auto on explored areas leaves catches to the
 * player, and says so.
 */
export function AutopilotNote({ idle }: { idle?: boolean }) {
  const { t } = useT()
  // The player's style unless told (the kitchen sink shows both).
  const idleStyle = useGame((s) => playStyleOf(s.settings) === 'idle')
  return (
    <p
      className="pixel-dialogue m-0 flex items-center gap-3 px-3 py-2.5 text-[20px] leading-[1.15]"
      role="status"
    >
      <PixelIcon name="dice" size={24} className="shrink-0" />
      <span>{t((idle ?? idleStyle) ? 'ui.idle.onTheWayIdle' : 'ui.idle.onTheWay')}</span>
    </p>
  )
}
