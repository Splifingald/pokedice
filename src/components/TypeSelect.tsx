import type { PokeType } from '@/engine'
import { useT } from '@/i18n/react'
import { typeName } from '@/lib/format'
import { cx, typeColor } from '@/theme/util'

/** The dropdown's own arrow, drawn on the pixel grid like everything else. */
const ARROW =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 6 4' shape-rendering='crispEdges'%3E%3Cpath d='M0 0h6v1H5v1H4v1H3v1H3V3H2V2H1V1H0z' fill='%2324304f'/%3E%3C/svg%3E\")"

/**
 * Narrows a list of Pokémon to one type (the Team's Box, Versus's picks): one dropdown, not a row of eighteen chips;
 * the picked type's colour sits beside it. `types` are the ones the list holds.
 */
export function TypeSelect({
  value,
  onChange,
  types,
  className,
}: {
  value: PokeType | 'all'
  onChange: (type: PokeType | 'all') => void
  types: readonly PokeType[]
  className?: string
}) {
  const { t } = useT()
  return (
    <label className={cx('flex items-center gap-2', className)}>
      <span className="sr-only">{t('ui.team.filterType')}</span>
      <i
        className="h-4 w-4 shrink-0 shadow-ring-thin"
        style={{ background: value === 'all' ? 'transparent' : typeColor(value) }}
        aria-hidden
      />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as PokeType | 'all')}
        className="h-11 min-w-0 flex-1 appearance-none rounded-none bg-paper bg-[length:12px] bg-[right_12px_center] bg-no-repeat px-3 pr-9 font-pixel text-[20px] text-ink shadow-field sm:max-w-[260px] md:h-10"
        style={{ backgroundImage: ARROW }}
      >
        <option value="all">{t('ui.team.allTypes')}</option>
        {types.map((ty) => (
          <option key={ty} value={ty}>
            {typeName(ty)}
          </option>
        ))}
      </select>
    </label>
  )
}
