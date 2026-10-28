import type { ReactNode } from 'react'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { cx } from '@/theme/util'

/**
 * An area's step outside a fight laid out as a fight is (docs/42, docs/43 §5.3): the page between encounters, the
 * Pokémon Center. Phones: the scene on top, edge to edge under the top bar, the panel under it and the action bar
 * pinned at the screen's foot. From 1024 px: the scene on the left, as tall as its picture, and the panel framed at its
 * right, exactly as tall, scrolling inside itself with the bar at its foot — the battle's own shape, so the steps of an
 * area never change layout under the player.
 */
export function StagePanel({
  scene,
  bar,
  stacked = false,
  children,
}: {
  /** The scene (null on a phone that folded it away: the Center's healing once played). */
  scene: ReactNode
  /** The step's buttons: pinned on phones, at the panel's foot on wide screens. */
  bar: ReactNode
  /**
   * The scene stays on top on every screen, the panel under it as the page (the Pokémon Center: its healing plays at
   * the top and goes; a wide screen gives the team and the Box its width, not a picture to look at).
   */
  stacked?: boolean
  children: ReactNode
}) {
  // Docked beside a scene from 1024 px; without one (a portal's or the nightmare's page) the panel is the page.
  const wide = useMediaQuery('(min-width: 1024px)') && scene != null && !stacked
  return (
    <div
      className={cx(
        // Phones: room at the bottom for the pinned bar.
        'flex flex-col gap-4 pb-[128px] md:pb-0',
        wide && 'grid grid-cols-[minmax(0,1fr)_400px] items-stretch gap-5',
      )}
    >
      {scene != null && <div className={cx('min-w-0', !wide && '-mx-3 -mt-4 md:m-0')}>{scene}</div>}
      <div className={cx('min-w-0', wide && 'relative')}>
        <div
          className={cx(
            'flex min-w-0 flex-col gap-4',
            wide && 'pixel-panel absolute inset-0 overflow-y-auto px-3 pt-3',
          )}
        >
          {children}
          <ActionBar wide={wide}>{bar}</ActionBar>
        </div>
      </div>
    </div>
  )
}

/** The step's bar: pinned above the home indicator on phones, sticky in the column from 768 px, at the panel's foot. */
function ActionBar({ wide, children }: { wide: boolean; children: ReactNode }) {
  return (
    <div
      className={cx(
        'z-30 border-t-[3px] border-edge',
        wide
          ? 'sticky bottom-0 -mx-3 mt-auto bg-panel px-3 pb-3 pt-2'
          : 'fixed inset-x-0 bg-parchment px-3 py-2 md:sticky md:inset-x-auto md:-mx-3',
      )}
      style={
        wide ? undefined : { bottom: 'var(--bottom-nav)', paddingBottom: 'calc(0.5rem + var(--bottom-safe))' }
      }
    >
      <div className="flex flex-col gap-1.5 md:mx-auto md:max-w-md">{children}</div>
    </div>
  )
}
