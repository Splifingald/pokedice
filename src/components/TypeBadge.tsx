import type { DieType } from '@/engine/types'
import { badgeColors, cx, typeColor } from '@/theme/util'

/** Type label. The fill is the type colour nudged until its text clears 4.5:1. */
export function TypeBadge({ type, size = 'md', className }: { type: DieType; size?: 'sm' | 'md'; className?: string }) {
  const { bg, fg } = badgeColors(typeColor(type))
  return (
    <span
      className={cx(
        'inline-flex items-center border-2 border-ink uppercase leading-none tracking-wider',
        size === 'sm' ? 'px-1 py-px text-sm' : 'px-1.5 py-0.5 text-base',
        className,
      )}
      style={{ background: bg, color: fg, borderRadius: 2, boxShadow: 'inset 0 -2px 0 rgba(0,0,0,0.18)' }}
    >
      {type}
    </span>
  )
}

export function TypeSwatch({ type, size = 14 }: { type: DieType; size?: number }) {
  return (
    <span
      className="inline-block border-2 border-ink align-middle"
      style={{ width: size, height: size, background: typeColor(type), borderRadius: 2 }}
      aria-hidden
    />
  )
}
