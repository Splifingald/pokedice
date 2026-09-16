import type { HTMLAttributes, ReactNode } from 'react'
import { cx } from '@/theme/util'

type Variant = 'light' | 'dark' | 'dialogue'

const VARIANT: Record<Variant, string> = {
  light: 'pixel-panel',
  dark: 'pixel-panel-dark',
  dialogue: 'pixel-dialogue',
}

export function Panel({
  variant = 'light',
  title,
  className,
  children,
  ...rest
}: { variant?: Variant; title?: ReactNode } & Omit<HTMLAttributes<HTMLDivElement>, 'title'>) {
  return (
    <div className={cx(VARIANT[variant], 'relative p-3', className)} {...rest}>
      {title != null && (
        <div className="-mx-3 -mt-3 mb-2 flex items-center justify-between border-b-[3px] border-ink bg-ink px-3 py-1 text-panel">
          {title}
        </div>
      )}
      {children}
    </div>
  )
}
