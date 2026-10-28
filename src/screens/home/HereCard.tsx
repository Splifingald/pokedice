import { type Area } from '@/engine'
import { useT } from '@/i18n/react'
import { PixelIcon } from '@/components/icons'
import { MiniSprite } from '@/components/SpriteImg'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'
import { areaSpecies } from './areas'

/**
 * PC's column beside the scene (docs/43 §5.2): under PLAY, the Pokémon met in the area — what is still to catch in
 * colour, what's caught faded with its ball — so the room a wide screen has says what the next CONTINUE may bring. A
 * tap opens the area's details. Phones keep it in the Areas sheet: their column is the dock's.
 */
export function HereCard({ area, onOpen }: { area: Area; onOpen: () => void }) {
  const { t } = useT()
  const save = useGame((s) => s.save)!
  const species = areaSpecies(area)
  if (!species.length) return null
  const caught = species.filter((d) => save.pokedex.includes(d)).length
  const left = species.length - caught
  // The ones still to catch first: they're the reason to play here.
  const shown = [...species].sort(
    (a, b) => Number(save.pokedex.includes(a)) - Number(save.pokedex.includes(b)) || a - b,
  )
  const what = left ? t('ui.home.toCatch', { n: left }) : t('ui.home.allCaught')
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-label={t('ui.home.hereLabel', {
        what: `${t('ui.map.speciesCaught', { caught, total: species.length })}, ${what}`,
      })}
      className="pixel-panel grid gap-2 px-3 pb-3 pt-2.5 text-left"
    >
      <span className="flex items-baseline gap-2">
        <span className="text-[22px] leading-none">{t('ui.common.pokemon')}</span>
        <span className={cx('font-pixel-sm text-[16px] leading-none', left ? 'text-danger' : 'text-good')}>
          {what}
        </span>
        <span className="ml-auto inline-flex items-center gap-1 font-pixel-sm text-[16px] leading-none tabular-nums">
          <PixelIcon name="ball" size={12} />
          {caught}/{species.length}
        </span>
      </span>
      <span className="flex flex-wrap gap-1" aria-hidden>
        {shown.slice(0, 12).map((d) => {
          const got = save.pokedex.includes(d)
          return (
            <span
              key={d}
              className={cx(
                'relative grid h-12 w-12 place-items-center bg-well shadow-ring-line',
                got && 'opacity-60',
              )}
            >
              <MiniSprite dex={d} size={32} />
              {got && <PixelIcon name="ball" size={12} className="absolute bottom-0.5 right-0.5" />}
            </span>
          )
        })}
      </span>
    </button>
  )
}
