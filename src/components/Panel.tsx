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
        <div className="-mx-1 mb-2 flex items-center justify-between gap-2 px-1 pb-1.5 text-[24px] leading-none shadow-[0_2px_0_#dfe7f2]">
          {title}
        </div>
      )}
      {children}
    </div>
  )
}
