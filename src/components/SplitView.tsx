import type { ReactNode } from 'react'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { cx } from '@/theme/util'
import { SheetDock } from './Sheet'

/**
 * A list and its detail (docs/43 §2): from 1024 px the detail stands docked at the right of the list, as tall as the
 * screen and scrolling inside itself — the fight's panel's shape (docs/42) for the Team, the Mart, the Pokédex, Social
 * and Settings — so opening a Pokémon or an item never covers what it was picked from. A `Sheet` given as `detail`
 * draws itself in the pane there; on a phone it is the usual sheet over the page. `empty` fills the pane while nothing
 * is open (wide screens only).
 */
export function SplitView({
  main,
  detail,
  empty,
  className,
  paneClassName,
}: {
  main: ReactNode
  detail?: ReactNode
  empty?: ReactNode
  className?: string
  paneClassName?: string
}) {
  const wide = useMediaQuery('(min-width: 1024px)')
  if (!wide)
    return (
      <>
        <div className={cx('flex min-w-0 flex-col gap-3', className)}>{main}</div>
        {detail}
      </>
    )
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(380px,440px)] items-start gap-5">
      <div className={cx('flex min-w-0 flex-col gap-3', className)}>{main}</div>
      <aside
        className={cx(
          'pixel-panel sticky top-[calc(var(--top-bar,56px)+1rem)] flex max-h-[calc(100dvh-var(--top-bar,56px)-2rem)] min-h-[320px] flex-col overflow-hidden p-0',
          paneClassName,
        )}
      >
        <SheetDock.Provider value={true}>{detail}</SheetDock.Provider>
        {!detail && empty}
      </aside>
    </div>
  )
}
