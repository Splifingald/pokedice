// Favourites (docs/67, Ash's suggestion): a heart on a Pokémon, put on in its sheet or in the raid team picker, so the
// ones the player wants to raid with come first there. The engine keeps the list (`toggleFavourite`).
import { isFavourite, toggleFavourite, type PokemonInstance } from '@/engine'
import { PixelIcon } from '@/components/icons'
import { useT } from '@/i18n/react'
import { mutateSave, useGame } from '@/store/game'
import { cx } from '@/theme/util'

/** The heart itself: red when on, a grey outline of it when off (never colour alone: the button says pressed). */
export function HeartGlyph({ on, size = 18 }: { on: boolean; size?: number }) {
  return on ? (
    <PixelIcon name="heart" size={size} />
  ) : (
    <PixelIcon name="heart" size={size} color="rgb(var(--c-muted))" />
  )
}

/** Whether this Pokémon wears the heart, and the toggle; null without a Pokémon. */
export function useFavourite(id: string | undefined): { on: boolean; toggle: () => void } | null {
  const on = useGame((s) => !!id && !!s.save && isFavourite(s.save, id))
  if (!id) return null
  return { on, toggle: () => mutateSave((s) => toggleFavourite(s, id)) }
}

/**
 * The Pokémon sheet's toggle: the heart and "Favourite", pressed when on, and the one line that says what it does
 * (its rule, explained where it happens: docs/15 §20). Nothing for an Egg or a fossil still reviving.
 */
export function FavouriteToggle({ inst }: { inst: PokemonInstance }) {
  const fav = useFavourite(inst.id)
  if (!fav || inst.revivesAt != null) return null
  return <FavouriteRow on={fav.on} onToggle={fav.toggle} />
}

/** The toggle and its line, as drawn (the kitchen sink shows both states). */
export function FavouriteRow({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  const { t } = useT()
  return (
    <div className="flex items-center gap-2.5">
      <button
        type="button"
        aria-pressed={on}
        onClick={onToggle}
        className={cx(
          'flex min-h-[44px] shrink-0 items-center gap-1.5 px-3 text-[20px] leading-none',
          on ? 'bg-rose shadow-[inset_0_0_0_2px_rgb(var(--c-edge))]' : 'bg-paper shadow-ring-line',
        )}
      >
        <HeartGlyph on={on} />
        {t('ui.fav.button')}
      </button>
      <p className="m-0 font-pixel-sm text-[16px] leading-tight text-muted">{t('ui.fav.note')}</p>
    </div>
  )
}

/** A card's corner heart (the raid team picker): its own button beside the card's, 36 px square. */
export function FavouriteHeart({
  on,
  onToggle,
  label,
  className,
}: {
  on: boolean
  onToggle: () => void
  label: string
  className?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      title={label}
      onClick={onToggle}
      className={cx('grid h-9 w-9 place-items-center', className)}
    >
      <HeartGlyph on={on} size={16} />
    </button>
  )
}
