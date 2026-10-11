// Plays a Pokémon's cry from its sheet (src/audio/cries.ts). Hidden while sound is off, and for a Pokémon Showdown has
// no cry for: a button that can't make a sound would only puzzle.
import { cryUrl, playCry } from '@/audio/cries'
import { useT } from '@/i18n/react'
import { soundOn } from '@/save/storage'
import { useGame } from '@/store/game'
import { PixelIcon } from './icons'
import { PixelButton } from './PixelButton'

export function CryButton({ dex, name, className }: { dex: number; name: string; className?: string }) {
  const { t } = useT()
  const on = useGame((s) => soundOn(s.settings))
  if (!on || !cryUrl(dex)) return null
  const label = t('ui.sheet.cry', { name })
  // `quiet`: the button's own click would talk over the cry.
  return (
    <PixelButton
      size="sm"
      quiet
      className={className}
      onClick={() => playCry(dex)}
      aria-label={label}
      title={label}
    >
      <PixelIcon name="sound" size={16} />
    </PixelButton>
  )
}
