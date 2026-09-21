// How the Box is ordered, and the row of buttons that picks it. Shared so the Team screen and the Pokémon Center's
// PC order the same Pokémon the same way — two lists of the same Box that disagreed would just be confusing.
import type { GameData, PokemonInstance } from '@/engine'
import { useT } from '@/i18n/react'
import { cx } from '@/theme/util'

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
          className={cx('pixel-btn min-h-[44px] px-2 text-lg md:min-h-[32px]', sort === s.id ? 'bg-gold' : 'bg-panel')}
        >
          {t(s.label)}
        </button>
      ))}
    </div>
  )
}
