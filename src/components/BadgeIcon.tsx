import { useT } from '@/i18n/react'
import { slug } from '@/i18n/names'

const BADGE_COLORS: Record<string, [string, string]> = {
  'Boulder Badge': ['#9c9caf', '#c8c8d8'],
  'Cascade Badge': ['#547acc', '#9fb8e8'],
  'Thunder Badge': ['#e8b44a', '#fbeeb0'],
  'Rainbow Badge': ['#68a941', '#d685ad'],
  'Soul Badge': ['#d44873', '#f0a0c0'],
  'Marsh Badge': ['#c0a256', '#e8d890'],
  'Volcano Badge': ['#c2452d', '#e8905a'],
  'Earth Badge': ['#4aa84a', '#a0d890'],
}

/** A gym badge in pixel form — grey outline until it's earned. */
export function BadgeIcon({ badge, earned, size = 24 }: { badge: string; earned: boolean; size?: number }) {
  const { t } = useT()
  const [fill, light] = BADGE_COLORS[badge] ?? ['#e8b44a', '#fbeeb0']
  const name = t(`badge.${slug(badge)}`)
  const label = earned ? name : t('ui.profile.badgeLocked', { badge: name })
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 10 10"
      shapeRendering="crispEdges"
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      <polygon points="3,0 7,0 10,3 10,7 7,10 3,10 0,7 0,3" fill="#2a2438" />
      <polygon points="3.5,1 6.5,1 9,3.5 9,6.5 6.5,9 3.5,9 1,6.5 1,3.5" fill={earned ? fill : '#e8e0c8'} />
      {earned ? (
        <>
          <rect x={3} y={2} width={2} height={2} fill={light} />
          <rect x={4} y={4} width={2} height={2} fill="#2a2438" opacity={0.25} />
        </>
      ) : (
        <rect x={4} y={4} width={2} height={2} fill="#9c9caf" />
      )}
    </svg>
  )
}
