import { cx } from '@/theme/util'

/** Segmented area gauge. `max === null` renders an endless gauge. `mark` draws a red tick (the round's start). */
export function Gauge({
  value,
  max,
  label = 'EXPLORATION',
  className,
  labelClassName,
  segments = 12,
  color = '#e8b44a',
  name = 'Exploration',
  mark,
  markText,
}: {
  value: number
  max: number | null
  label?: string
  className?: string
  /** e.g. a fixed width, to line the bar up with the round gauge below it. */
  labelClassName?: string
  segments?: number
  color?: string
  /** Accessible name of the meter (the visible label may be empty or a delta like "+12"). */
  name?: string
  /** A point on the gauge to mark, e.g. where a wipe would bring it back. */
  mark?: number | null
  /** What the mark means, for screen readers and the hover title. */
  markText?: string
}) {
  const pct = max ? Math.min(1, value / max) : 1
  const lit = max ? Math.floor(pct * segments + 1e-9) : segments
  const showMark = max != null && mark != null && mark < value
  return (
    <div className={cx('flex items-center gap-2', className)}>
      <span className={cx('text-sm leading-none', labelClassName)}>{label}</span>
      <div
        className="relative flex flex-1 gap-[2px] border-2 border-ink bg-ink p-[2px]"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={max ?? undefined}
        aria-valuenow={value}
        aria-valuetext={`${max ? `${Math.min(value, max)} of ${max}` : `${value}, no limit`}${showMark && markText ? `; ${markText}` : ''}`}
        aria-label={name}
        style={{ borderRadius: 2 }}
      >
        {showMark && (
          <span
            aria-hidden
            title={markText}
            className="pointer-events-none absolute -bottom-[5px] -top-[5px] z-10 w-[3px] border-x border-ink bg-danger"
            style={{ left: `calc(${Math.min(1, mark / max) * 100}% - 1.5px)` }}
          />
        )}
        {Array.from({ length: segments }, (_, i) => (
          <div
            key={i}
            className="h-2 flex-1"
            style={{
              background: i < lit ? (max ? color : `repeating-linear-gradient(90deg, ${color} 0 3px, #d44873 3px 6px)`) : '#3e3552',
              transition: `background-color 200ms ${i * 30}ms`,
            }}
          />
        ))}
      </div>
      <span className="min-w-[6ch] text-right font-mono text-xs tabular-nums leading-none">
        {max ? `${Math.min(value, max)}/${max}` : `${value} ∞`}
      </span>
    </div>
  )
}
