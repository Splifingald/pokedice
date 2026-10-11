// The two plates on the battle stage: the foe's (name, level, types, HP as a bar only, statuses, a trainer's party)
// at the top left, yours (level, HP with numbers, statuses) at the bottom right. MEGA / G-MAX once a form changes.
import type { ReactNode } from 'react'
import type { Battler } from '@/engine'
import { Chip } from '@/components/Chip'
import { HpBar } from '@/components/HpBar'
import { PixelIcon } from '@/components/icons'
import { StatusIcons } from '@/components/StatusIcons'
import { TypeBadge } from '@/components/TypeBadge'
import { useT } from '@/i18n/react'
import { cx } from '@/theme/util'

function FormTag({ b }: { b: Battler }) {
  const { t } = useT()
  if (b.gmax) return <Chip tone="red">{t('ui.battle.gmax')}</Chip>
  if (b.mega) return <Chip tone="gold">{t('ui.battle.mega')}</Chip>
  return null
}

function PlateBox({
  onClick,
  open,
  label,
  className,
  children,
}: {
  onClick?: () => void
  open?: boolean
  label: string
  className: string
  children: ReactNode
}) {
  const Box = onClick ? 'button' : 'div'
  return (
    <Box
      {...(onClick ? { type: 'button' as const, onClick, 'aria-expanded': !!open } : { role: 'group' })}
      aria-label={label}
      className={cx('pixel-plate absolute grid w-[56%] gap-1 px-2 pb-[7px] pt-1.5 text-left', className)}
    >
      {children}
    </Box>
  )
}

/** The foe: the HP is a bar and words for screen readers, never its exact numbers. */
export function FoePlate({
  b,
  hp,
  party,
  onClick,
  open,
}: {
  b: Battler
  hp: number
  /** A trainer's team: how many, and which one is out (earlier ones are spent). */
  party?: { count: number; index: number } | null
  onClick?: () => void
  open?: boolean
}) {
  const { t } = useT()
  return (
    <PlateBox
      onClick={onClick}
      open={open}
      label={
        onClick
          ? t('ui.types.tap', { name: b.name })
          : t('ui.battle.foePlate', { name: b.name, level: t('ui.common.level.short', { n: b.level }) })
      }
      className="left-1.5 top-1.5"
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <b className="min-w-0 truncate text-[20px] font-normal leading-none">{b.name}</b>
        {b.shiny && <PixelIcon name="star" size={12} title={t('ui.mon.shiny')} className="shrink-0" />}
        <span className="shrink-0 font-pixel-sm text-[15px] leading-none">
          {t('ui.common.level.short', { n: b.level })}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1">
          <FormTag b={b} />
          {party && party.count > 1 && (
            <span
              className="flex gap-[3px]"
              aria-label={t('ui.battle.partyLeft', { left: party.count - party.index, total: party.count })}
            >
              {Array.from({ length: party.count }, (_, i) => (
                <i
                  key={i}
                  className={cx('h-2 w-2 shadow-ring-thin', i < party.index ? 'bg-shadow' : 'bg-crimson')}
                />
              ))}
            </span>
          )}
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-1">
        {b.types.map((ty) => (
          <TypeBadge key={ty} type={ty} size="sm" />
        ))}
        <StatusIcons status={b.status} />
        <HpBar
          hp={hp}
          max={b.maxHp}
          showNumbers={false}
          approximate
          compact
          height={8}
          className="min-w-[64px] flex-1"
        />
      </span>
    </PlateBox>
  )
}

/** Yours: level, HP with numbers, statuses. */
export function OwnPlate({
  b,
  hp,
  onClick,
  open,
}: {
  b: Battler
  hp: number
  onClick?: () => void
  open?: boolean
}) {
  const { t } = useT()
  return (
    <PlateBox
      onClick={onClick}
      open={open}
      label={
        onClick
          ? t('ui.types.tap', { name: b.name })
          : t('ui.battle.ownPlate', { name: b.name, level: t('ui.common.level.short', { n: b.level }) })
      }
      className="bottom-1.5 right-1.5"
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <b className="min-w-0 truncate text-[18px] font-normal leading-none">{b.name}</b>
        <span className="shrink-0 font-pixel-sm text-[15px] leading-none">
          {t('ui.common.level.short', { n: b.level })}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1">
          <FormTag b={b} />
        </span>
      </span>
      <HpBar hp={hp} max={b.maxHp} compact height={8} />
      {(b.status.burn || b.status.poison || b.status.frozen || b.status.paralyze || b.status.confused) && (
        <StatusIcons status={b.status} />
      )}
    </PlateBox>
  )
}
