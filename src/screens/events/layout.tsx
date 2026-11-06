// The events' pages share one shape (docs/43 §5.11): the thing on top (the wheel, the boss, the wall), what to do with
// it at the foot. On a phone the stage, then the panel, then the dock pinned over the tab bar with the one red action;
// from 1024 px the stage takes the left of the screen and the panel stands docked at its right, the dock at its foot —
// the fight's shape (docs/42 §2), so a PC page is a layout, not a phone column in empty space.
import type { ReactNode } from 'react'
import { cx } from '@/theme/util'

/**
 * A page's buttons. Phones: pinned right above the tab bar (`--bottom-nav`), the page scrolling behind it, so the red
 * action is always under the thumb; it is a direct child of the page's column, which spans the page, or sticky would
 * stop at its parent's edge. From 1024 px: in the flow, at the panel's foot.
 */
export function EventDock({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        'sticky z-20 -mx-3 flex flex-col gap-2 border-t-2 border-edge bg-parchment px-3 pb-2 pt-2',
        // Down onto the page's bottom padding, so it doesn't float up off the tab bar at the end of the scroll.
        'max-md:mb-[calc(var(--bottom-nav)-6rem)] md:max-lg:-mb-10',
        'lg:static lg:mx-0 lg:border-0 lg:bg-transparent',
        className,
      )}
      style={{ bottom: 'var(--bottom-nav)' }}
    >
      {children}
    </div>
  )
}

/**
 * Stage and panel. `head` (the event's banner) spans the top; `stage` is the visual; `panel` what a player reads to act;
 * `dock` the actions. Phones stack them, the dock pinned; from 1024 px the stage is left (sticky) and the panel and its
 * dock right, in one frame. One tree for both (CSS grid, no media query in React), so a canvas on the stage (the wheel)
 * is never mounted twice when the window crosses 1024 px.
 */
export function StagePanel({
  head,
  stage,
  panel,
  dock,
  stageClassName,
  panelClassName,
}: {
  head?: ReactNode
  stage: ReactNode
  panel?: ReactNode
  dock?: ReactNode
  stageClassName?: string
  panelClassName?: string
}) {
  const sticky = 'lg:sticky lg:top-[calc(var(--top-bar,56px)+1rem)]'
  return (
    <div className="flex min-h-full flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)] lg:grid-rows-[auto_auto_1fr] lg:items-start lg:gap-x-5 lg:gap-y-0">
      {head && <div className="lg:col-span-2 lg:mb-4">{head}</div>}
      <div className={cx('min-w-0 lg:col-start-1 lg:row-span-2 lg:row-start-2', sticky, stageClassName)}>
        {stage}
      </div>
      {/* The docked panel's frame, under the panel and its dock (wide screens only). */}
      <div
        aria-hidden
        className="pixel-panel hidden self-stretch lg:col-start-2 lg:row-span-2 lg:row-start-2 lg:block"
      />
      {panel && (
        <div
          className={cx('flex min-w-0 flex-col gap-3 lg:col-start-2 lg:row-start-2 lg:p-3', panelClassName)}
        >
          {panel}
        </div>
      )}
      {dock && (
        <EventDock className="mt-auto lg:col-start-2 lg:row-start-3 lg:self-end lg:px-3 lg:pb-3 lg:pt-3">
          {dock}
        </EventDock>
      )}
    </div>
  )
}
