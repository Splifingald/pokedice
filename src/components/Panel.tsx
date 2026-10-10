import type { HTMLAttributes, ReactNode } from 'react'
import { cx } from '@/theme/util'
import { PixelIcon, type IconName } from './icons'

type Variant = 'light' | 'dark' | 'dialogue'

const VARIANT: Record<Variant, string> = {
  light: 'pixel-panel',
  dark: 'pixel-panel-dark',
  dialogue: 'pixel-dialogue',
}

export function Panel({
  variant = 'light',
  title,
  icon,
  className,
  children,
  ...rest
}: { variant?: Variant; title?: ReactNode; icon?: IconName } & Omit<HTMLAttributes<HTMLDivElement>, 'title'>) {
  return (
    <div className={cx(VARIANT[variant], 'relative p-3', className)} {...rest}>
      {title != null && (
        <div className="-mx-1 mb-2 flex items-center justify-between gap-2 px-1 pb-1.5 text-[24px] leading-none shadow-[0_2px_0_rgb(var(--c-lip))]">
          {icon ? (
            <span className="flex min-w-0 items-center gap-2">
              <PixelIcon name={icon} size={20} />
              {title}
            </span>
          ) : (
            title
          )}
        </div>
      )}
      {children}
    </div>
  )
}
