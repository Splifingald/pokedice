import { useMemo } from 'react'
import { areaTypeProfile, type Area } from '@/engine'
import { useT } from '@/i18n/react'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'
import { TypeBadge } from './TypeBadge'

/** The main types of the foes in an area, as badges only (the name is for screen readers and on hover). */
export function AreaTypes({ area, className }: { area: Area; className?: string }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const profile = useMemo(() => areaTypeProfile(area, data), [area, data])
  if (!profile.main.length) return null
  return (
    <div
      className={cx('flex flex-wrap items-center justify-end gap-1', className)}
      role="group"
      aria-label={t('ui.areaTypes.label')}
      title={t('ui.areaTypes.label')}
    >
      {profile.main.map((type) => (
        <span key={type} title={t('ui.areaTypes.share', { pct: Math.round((profile.shares[type] ?? 0) * 100) })}>
          <TypeBadge type={type} size="sm" />
        </span>
      ))}
    </div>
  )
}
