import type { CSSProperties, ReactNode } from 'react'
import { cx } from '@/theme/util'

/**
 * An area's step outside a fight laid out as a fight is (docs/42, docs/43 §5.3): the page between encounters, a find,
 * the Pokémon Center. The scene on top and the panel under it on every screen (the user's rule, 2026-10-28: even on
 * PC). Phones: the scene edge to edge under the top bar, the action bar pinned at the screen's foot. From 1024 px: a
 * 3:2 scene as wide as the window's height allows with `room` left under it, centred, the panel and its bar under it at
 * its width — the battle's own middle column, so the steps of an area never change layout under the player.
 */
export function StagePanel({
  scene,
  bar,
  room = '17rem',
  children,
}: {
  /** The scene (null on a phone that folded it away: the Center's healing once played). */
  scene: ReactNode
  /** The step's buttons: pinned on phones, at the panel's foot on wider screens. */
  bar: ReactNode
  /**
   * The height a wide screen keeps for the panel under a 3:2 scene. Null when the scene is no 3:2 picture (the Pokémon
   * Center: its sign and its healing): the page's width then, for the team and the Box.
   */
  room?: string | null
  children: ReactNode
}) {
  const fit = room != null && scene != null
  return (
    <div
      className={cx(
        // Phones: room at the bottom for the pinned bar.
        'flex flex-col gap-4 pb-[128px] md:pb-0',
        fit && 'lg:mx-auto lg:w-full lg:max-w-[var(--stage-w)]',
      )}
      style={
        fit
          ? ({
              '--stage-w': `max(480px, calc((100dvh - var(--top-bar, 56px) - 3rem - ${room}) * 1.5))`,
            } as CSSProperties)
          : undefined
      }
    >
      {scene != null && <div className="-mx-3 -mt-4 min-w-0 md:m-0">{scene}</div>}
      <div className="flex min-w-0 flex-col gap-4">
        {children}
        {/* A step with nothing to press but its own content (a boon Center's choice) has no bar. */}
        {bar != null && <ActionBar>{bar}</ActionBar>}
      </div>
    </div>
  )
}

/** The step's bar: pinned above the home indicator on phones, sticky at the foot of the column from 768 px. */
function ActionBar({ children }: { children: ReactNode }) {
  return (
    <div
      className="fixed inset-x-0 z-30 border-t-[3px] border-edge bg-parchment px-3 py-2 md:sticky md:inset-x-auto md:-mx-3"
      style={{ bottom: 'var(--bottom-nav)', paddingBottom: 'calc(0.5rem + var(--bottom-safe))' }}
    >
      <div className="flex flex-col gap-1.5 md:mx-auto md:max-w-md">{children}</div>
    </div>
  )
}
