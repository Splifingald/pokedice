import type { DieType } from '@/engine/types'
import { typeName } from '@/lib/format'
import { useT } from '@/i18n/react'
import { badgeColors, cx, typeColor } from '@/theme/util'

/** Type label: the type mixed into white, its name in a dark shade of it, a ring, clipped corners (badgeColors). */
export function TypeBadge({ type, size = 'md', className }: { type: DieType; size?: 'sm' | 'md'; className?: string }) {
  useT()
  const { bg, fg, ring } = badgeColors(typeColor(type))
  return (
    <span
      className={cx(
        'pixel-corners inline-flex items-center whitespace-nowrap font-pixel-sm uppercase leading-none tracking-[0.04em]',
        size === 'sm' ? 'h-4 px-1 text-[13px]' : 'h-5 px-1.5 pb-px text-[15px]',
        className,
      )}
      style={{ background: bg, color: fg, boxShadow: `inset 0 0 0 2px ${ring}` }}
    >
      {typeName(type)}
    </span>
  )
}

export function TypeSwatch({ type, size = 14 }: { type: DieType; size?: number }) {
  return (
    <span
      className="pixel-corners inline-block align-middle shadow-ring"
      style={{ width: size, height: size, background: typeColor(type) }}
      aria-hidden
    />
  )
}
