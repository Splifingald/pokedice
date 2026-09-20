import type { Area, AreaProgress } from '@/engine'
import { useT } from '@/i18n/react'
import { cx } from '@/theme/util'

/**
 * ROUNDS done / needed to clear the area, one segment per round (hidden in secret areas, which never clear). A round
 * counts once its last card is dealt with; a wipe loses the round in progress, never one already done.
 */
export function RoundsCounter({
  area,
  progress,
  labelClassName,
  className,
}: {
  area: Area
  progress: AreaProgress
  labelClassName?: string
  className?: string
}) {
  const { t } = useT()
  const need = area.roundsToClear
  if (need == null) return null
  const done = Math.min(progress.roundsDone ?? 0, need)
  const complete = done >= need
  return (
    <div
      className={cx('flex items-center gap-2', className)}
      role="img"
      aria-label={complete ? t('ui.rounds.allDone', { n: need }) : t('ui.rounds.progress', { done, need })}
    >
      <span className={cx('text-sm leading-none', labelClassName)} aria-hidden>
        {t('ui.rounds.label')}
      </span>
      <ol className="flex min-w-0 flex-1 gap-[3px]" aria-hidden>
        {Array.from({ length: need }, (_, i) => (
          <li
            key={i}
            className={cx('h-3 min-w-0 flex-1 border-2 border-ink', i < done ? 'bg-gold' : 'bg-[#3e3552]')}
            style={{ borderRadius: 2 }}
          />
        ))}
      </ol>
      <span className="min-w-[6ch] text-right font-mono text-xs tabular-nums leading-none" aria-hidden>
        {complete ? `${need}/${need} ✓` : `${done}/${need}`}
      </span>
    </div>
  )
}
