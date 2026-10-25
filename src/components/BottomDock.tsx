import type { ReactNode } from 'react'
import { cx } from '@/theme/util'

/**
 * A step's buttons (CONTINUE, NEXT, BACK, the attack, the throw): on phones they stay at the screen's foot whatever
 * sits above them, never in mid-page or under the fold (the rework, docs/15 §6). Inside a panel padded px-3; from
 * 1024px they sit in the flow again. Always rendered, empty or not: it carries the panel's bottom padding on phones.
 */
export function BottomDock({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        // No top padding: the panel's gap already sets it apart, and a 360×640 fight has no pixel to spare.
        'sticky bottom-0 z-20 -mx-3 mt-auto flex flex-col gap-2 bg-parchment px-3 pb-[calc(12px+env(safe-area-inset-bottom))]',
        'lg:static lg:mx-0 lg:bg-transparent lg:px-0 lg:pb-3 lg:pt-0',
        className,
      )}
    >
      {children}
    </div>
  )
}
