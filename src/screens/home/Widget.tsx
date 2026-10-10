import type { ReactNode } from 'react'
import { cx } from '@/theme/util'

/** A widget's frame: a framed panel, a small header row, and whatever it shows. */
export function Widget({
  title,
  tag,
  label,
  onClick,
  children,
  className,
}: {
  title: string
  tag?: ReactNode
  label: string
  onClick: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cx('pixel-panel flex min-w-0 flex-col gap-[5px] px-2.5 pb-2.5 pt-2 text-left', className)}
    >
      <span className="flex w-full items-center gap-1.5 text-[19px] leading-none text-ink">
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {tag}
      </span>
      {children}
    </button>
  )
}
