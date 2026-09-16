import { useMemo } from 'react'
import { areaTypeProfile, type Area } from '@/engine'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'
import { TypeBadge } from './TypeBadge'

/**
 * "Encounter types" of the foes in an area, and the "Recommended types" that hit them hardest — team-building help.
 * The recommendation can be switched off for everyone (game_config.showRecommendedTypes).
 */
export function AreaTypes({ area, className }: { area: Area; className?: string }) {
  const data = useGame((s) => s.data)
  const profile = useMemo(() => areaTypeProfile(area, data), [area, data])
  const recommended = data.config.showRecommendedTypes ? profile.strong : []
  if (!profile.main.length && !recommended.length) return null
  return (
    <div className={cx('flex flex-wrap items-center gap-x-4 gap-y-1 text-base', className)}>
      <span className="flex flex-wrap items-center gap-1">
        <span className="text-muted">Encounter types</span>
        {profile.main.length ? (
          profile.main.map((t) => (
            <span key={t} title={`${Math.round((profile.shares[t] ?? 0) * 100)} % of foes`}>
              <TypeBadge type={t} size="sm" />
            </span>
          ))
        ) : (
          <span>all kinds</span>
        )}
      </span>
      {recommended.length > 0 && (
        <span className="flex flex-wrap items-center gap-1">
          <span className="text-muted">Recommended types</span>
          {recommended.map((t) => (
            <TypeBadge key={t} type={t} size="sm" />
          ))}
        </span>
      )}
    </div>
  )
}
