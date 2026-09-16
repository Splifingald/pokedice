import { cx, hpColor } from '@/theme/util'

/** HP bar with an eased drain and a lagging damage trail. Colour: green > 50 % > yellow > 20 % > red. */
export function HpBar({
  hp,
  max,
  showNumbers = true,
  className,
  height = 10,
}: {
  hp: number
  max: number
  showNumbers?: boolean
  className?: string
  height?: number
}) {
  const pct = max > 0 ? Math.max(0, Math.min(1, hp / max)) : 0
  return (
    <div className={cx('flex items-center gap-2', className)}>
      <span className="text-sm leading-none text-ink">HP</span>
      <div
        className="relative flex-1 overflow-hidden border-2 border-ink bg-ink"
        style={{ height, borderRadius: 2 }}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={hp}
        aria-label="HP"
      >
        <div
          className="absolute inset-y-0 left-0 bg-danger/80"
          style={{ width: `${pct * 100}%`, transition: 'width 900ms cubic-bezier(.2,.8,.2,1) 250ms' }}
        />
        <div
          className="absolute inset-y-0 left-0"
          style={{
            width: `${pct * 100}%`,
            background: hpColor(pct),
            boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.35)',
            transition: 'width 600ms cubic-bezier(.2,.8,.2,1), background-color 300ms',
          }}
        />
      </div>
      {showNumbers && (
        <span className="min-w-[4.5ch] text-right font-mono text-sm tabular-nums leading-none">
          {Math.max(0, Math.round(hp))}/{max}
        </span>
      )}
    </div>
  )
}
