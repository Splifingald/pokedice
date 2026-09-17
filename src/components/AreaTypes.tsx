import { useMemo } from 'react'
import { areaTypeProfile, type Area } from '@/engine'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'
import { TypeBadge } from './TypeBadge'

/** The main types of the foes in an area, as badges only (the name is for screen readers and on hover). */
export function AreaTypes({ area, className }: { area: Area; className?: string }) {
  const data = useGame((s) => s.data)
  const profile = useMemo(() => areaTypeProfile(area, data), [area, data])
  if (!profile.main.length) return null
  return (
    <div className={cx('flex flex-wrap items-center justify-end gap-1', className)} role="group" aria-label="Encounter types" title="Encounter types">
      {profile.main.map((t) => (
        <span key={t} title={`${Math.round((profile.shares[t] ?? 0) * 100)} % of foes`}>
          <TypeBadge type={t} size="sm" />
        </span>
      ))}
    </div>
  )
}
