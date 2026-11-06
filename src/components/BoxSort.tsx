// How the Box is ordered, and the controls that pick it. Shared so the Team screen and the Pokémon Center's PC order
// the same Pokémon the same way — two lists of the same Box that disagreed would just be confusing.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { GameData, PokemonInstance, PokeType } from '@/engine'
import { useT } from '@/i18n/react'
import { typeName } from '@/lib/format'
import { useIsDesktop } from '@/lib/useMediaQuery'
import { cx } from '@/theme/util'
import { PixelButton } from './PixelButton'
import { Seg } from './Segmented'
import { Sheet } from './Sheet'
import { TypeSwatch } from './TypeBadge'
import { ARROW } from './TypeSelect'

export type BoxSort = 'dex' | 'level' | 'type' | 'newest'

const SORTS: { id: BoxSort; label: string }[] = [
  { id: 'dex', label: 'ui.team.sortDex' },
  { id: 'level', label: 'ui.team.sortLevel' },
  { id: 'type', label: 'ui.team.sortType' },
  { id: 'newest', label: 'ui.team.sortNewest' },
]

/**
 * A sorted copy — the caller's array is never touched. Every order falls back until nothing is left to chance, so
 * two Pokémon of the same species read the same way wherever they appear: lowest number first within a type, and
 * the strongest first within a species. Only "newest" stops at one key, since no two catches share an instant.
 */
export function sortBox(box: readonly PokemonInstance[], sort: BoxSort, data: GameData): PokemonInstance[] {
  const type1 = (p: PokemonInstance) => data.species[p.dex]?.type1 ?? ''
  return [...box].sort((a, b) =>
    sort === 'level'
      ? b.level - a.level || a.dex - b.dex
      : sort === 'type'
        ? type1(a).localeCompare(type1(b)) || a.dex - b.dex || b.level - a.level
        : sort === 'newest'
          ? b.caughtAt - a.caughtAt
          : a.dex - b.dex || b.level - a.level,
  )
}

/** The picker. Nothing to choose between with one Pokémon, so the caller hides it below two. */
export function BoxSortPicker({ sort, onChange }: { sort: BoxSort; onChange: (s: BoxSort) => void }) {
  const { t } = useT()
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('ui.team.sortBox')}>
      <span className="text-lg text-muted">{t('ui.team.sort')}</span>
      {SORTS.map((s) => (
        <button
          key={s.id}
          type="button"
          aria-pressed={sort === s.id}
          onClick={() => onChange(s.id)}
          className={cx('pixel-btn min-h-[44px] min-w-[44px] px-2 text-lg md:min-h-[32px] md:min-w-0', sort === s.id ? 'bg-gold' : 'bg-panel')}
        >
          {t(s.label)}
        </button>
      ))}
    </div>
  )
}

/**
 * The Box's one "Sort & filter" control (docs/43 §5.4): a button beside the search that opens the order and the type
 * together — a bottom sheet on phones, a panel under the button from 768 px — instead of a segmented bar and a type
 * dropdown on rows of their own. A pick applies at once (one tap); the button carries how many are set, so a narrowed
 * Box never hides why.
 */
export function BoxFilter<S extends BoxSort>({
  sort,
  onSort,
  sorts,
  type,
  onType,
  types,
  shown,
}: {
  sort: S
  onSort: (s: S) => void
  /** The orders offered, the first the default. */
  sorts: readonly S[]
  type: PokeType | 'all'
  onType: (t: PokeType | 'all') => void
  /** The types the Box holds. */
  types: readonly PokeType[]
  /** How many the Box shows with these (the sheet's SHOW button). */
  shown: number
}) {
  const { t } = useT()
  const wide = useIsDesktop()
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const set = (sort !== sorts[0] ? 1 : 0) + (type !== 'all' ? 1 : 0)
  const close = (refocus = true) => {
    setOpen(false)
    if (refocus) button.current?.focus()
  }
  // The panel (wide screens): focus on its first choice, a press outside closes it.
  useEffect(() => {
    if (!open || !wide) return
    panel.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus()
    const away = (e: globalThis.PointerEvent) => {
      const n = e.target as Node
      if (!panel.current?.contains(n) && !button.current?.contains(n)) setOpen(false)
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open, wide])

  const reset = set > 0 && (
    <button
      type="button"
      className="min-h-[44px] shrink-0 px-2 text-[20px] underline md:min-h-[36px]"
      onClick={() => {
        onSort(sorts[0]!)
        onType('all')
      }}
    >
      {t('ui.team.clearFilters')}
    </button>
  )
  const body = (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <h3 className="text-[20px] leading-none">{t('ui.team.sort')}</h3>
        <Seg
          label={t('ui.team.sortBox')}
          value={sort}
          onChange={onSort}
          options={sorts.map((id) => ({ id, label: t(SORTS.find((s) => s.id === id)!.label) }))}
        />
      </div>
      {types.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <h3 className="text-[20px] leading-none">{t('ui.team.sortType')}</h3>
          <TypeGrid value={type} onChange={onType} types={types} />
        </div>
      )}
    </div>
  )
  return (
    <div className="relative shrink-0">
      <button
        ref={button}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={set ? t('ui.team.sortFilterSet', { n: set }) : t('ui.team.sortFilter')}
        onClick={() => (open ? close() : setOpen(true))}
        className={cx(
          'flex h-11 items-center gap-2 whitespace-nowrap px-3 text-[20px] leading-none text-ink shadow-field md:h-10',
          open ? 'bg-well' : 'bg-paper',
        )}
      >
        <span>{t('ui.team.sortFilter')}</span>
        {set > 0 ? (
          <span className="light-scope bg-gold px-[5px] pb-[2px] pt-px font-pixel-sm text-tag leading-none text-ink shadow-ring-thin">
            {set}
          </span>
        ) : (
          <span className="h-2 w-3 bg-[length:12px_8px] bg-no-repeat dark:invert" style={{ backgroundImage: ARROW }} aria-hidden />
        )}
      </button>
      {wide ? (
        open && (
          <div
            ref={panel}
            role="dialog"
            aria-label={t('ui.team.sortFilter')}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation()
                close()
              }
            }}
            className="pixel-panel absolute right-0 top-full z-40 mt-2 flex w-[min(440px,calc(100vw-2rem))] flex-col gap-3 bg-panel p-3"
          >
            {body}
            {reset && <div className="flex justify-end">{reset}</div>}
          </div>
        )
      ) : (
        <Sheet
          open={open}
          onClose={() => close()}
          title={t('ui.team.sortFilter')}
          footer={
            <div className="flex items-center gap-2">
              {reset}
              <PixelButton variant="primary" size="lg" className="min-w-0 flex-1" onClick={() => close()}>
                {t('ui.team.showN', { n: shown })}
              </PixelButton>
            </div>
          }
        >
          {body}
        </Sheet>
      )}
    </div>
  )
}

/** "All types" and the Box's types: a radio group of swatched names (never colour alone), three to a row on a phone. */
function TypeGrid({
  value,
  onChange,
  types,
}: {
  value: PokeType | 'all'
  onChange: (t: PokeType | 'all') => void
  types: readonly PokeType[]
}) {
  const { t } = useT()
  const all: (PokeType | 'all')[] = ['all', ...types]
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step =
      e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const group = e.currentTarget
    const next = all[(all.indexOf(value) + step + all.length) % all.length]!
    onChange(next)
    // Focus follows the choice, as the arrow keys promise.
    requestAnimationFrame(() => group.querySelector<HTMLElement>(`[data-id="${next}"]`)?.focus())
  }
  return (
    <div
      role="radiogroup"
      aria-label={t('ui.team.filterType')}
      onKeyDown={onKeyDown}
      className="grid grid-cols-3 gap-1.5 sm:grid-cols-4"
    >
      {all.map((ty) => {
        const on = ty === value
        return (
          <button
            key={ty}
            type="button"
            role="radio"
            data-id={ty}
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(ty)}
            className={cx(
              'flex min-h-[44px] min-w-0 items-center gap-1.5 px-2 text-left text-[18px] leading-none md:min-h-[38px]',
              ty === 'all' && 'col-span-3 sm:col-span-4',
              on ? 'bg-ink text-panel shadow-ring' : 'bg-paper text-ink shadow-ring-line',
            )}
          >
            {ty !== 'all' && <TypeSwatch type={ty} />}
            <span className="min-w-0 truncate">{ty === 'all' ? t('ui.team.allTypes') : typeName(ty)}</span>
          </button>
        )
      })}
    </div>
  )
}
