import { useT } from '@/i18n/react'
import { usePace } from '@/lib/pace'
import { cx, hpColor, mixOklab, typeColor } from '@/theme/util'

/**
 * HP bar: a track with an ink edge and clipped corners, the fill (a lighter top row over the HP colour) and a pale red
 * trail. On a hit the fill drains over 700 ms; the trail waits 280 ms, then follows over 900 ms. Colour: green > 50 %
 * > yellow > 20 % > red.
 */
export function HpBar({
  hp,
  max,
  showNumbers = true,
  className,
  height = 10,
  collapsible = false,
  approximate = false,
  compact = false,
}: {
  hp: number
  max: number
  showNumbers?: boolean
  className?: string
  height?: number
  /**
   * Drop the bar and keep "HP 20/35" when the component is too narrow for the bar to say anything. Only for spots
   * with a set width (it uses a CSS container query, which can't size itself to its content).
   */
  collapsible?: boolean
  /** A foe's bar: screen readers get "high / half / low", never the exact HP. */
  approximate?: boolean
  /** Narrow cards (the Team's): no "HP" word in front, smaller numbers. */
  compact?: boolean
}) {
  const { t } = useT()
  const pace = usePace()
  const pct = max > 0 ? Math.max(0, Math.min(1, hp / max)) : 0
  const collapse = collapsible && showNumbers
  const color = hpColor(pct)
  return (
    <div className={cx('flex items-center', compact ? 'gap-1' : 'gap-2', collapse && 'hp-collapsible justify-between', className)}>
      {!compact && <span className="font-pixel-sm text-sm leading-none text-muted">{t('ui.mon.hp')}</span>}
      <div
        className="hp-track pixel-corners relative flex-1 overflow-hidden bg-line shadow-ring"
        style={{ height: Math.max(8, height) }}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={approximate ? 100 : max}
        aria-valuenow={approximate ? Math.ceil(pct * 4) * 25 : hp}
        aria-valuetext={
          approximate ? t(pct > 0.5 ? 'ui.mon.hpHigh' : pct > 0.2 ? 'ui.mon.hpHalf' : pct > 0 ? 'ui.mon.hpLow' : 'ui.mon.hpNone') : undefined
        }
        aria-label={t('ui.mon.hpLong')}
      >
        <div
          className="absolute bottom-[2px] left-[2px] top-[2px] bg-hp-trail"
          style={{
            width: `calc(${pct * 100}% - ${pct * 4}px)`,
            transition: `width ${900 * pace}ms cubic-bezier(.2,.8,.2,1) ${280 * pace}ms`,
          }}
        />
        <div
          className="absolute bottom-[2px] left-[2px] top-[2px]"
          style={{
            width: `calc(${pct * 100}% - ${pct * 4}px)`,
            background: `linear-gradient(${color} 0 0) 0 2px / 100% 100% no-repeat, ${mixOklab(color, 0.55, '#ffffff')}`,
            transition: `width ${700 * pace}ms cubic-bezier(.2,.8,.2,1), background-color ${300 * pace}ms`,
          }}
        />
      </div>
      {showNumbers && (
        <span className={cx('text-right font-mono tabular-nums leading-none', compact ? 'text-[16px]' : 'min-w-[4.5ch] text-[16px]')}>
          {Math.max(0, Math.round(hp))}/{max}
        </span>
      )}
    </div>
  )
}

const XP_BLUE = typeColor('water')
/** The XP fill: the HP bar's lighter top row over the blue. */
const XP_FILL = `linear-gradient(${XP_BLUE} 0 0) 0 2px / 100% 100% no-repeat, ${mixOklab(XP_BLUE, 0.55, '#ffffff')}`

/**
 * An XP gauge in the HP bar's shape (the user's call, 2026-11-03: one shape for both): clipped corners, the ink edge,
 * the fill 2px inside with its lighter top row, but blue on the dark track. `white`: the level-up's flash frames.
 * `animate`: the fill glides to a new width (off while the result card plays its own steps).
 */
export function XpGauge({
  pct,
  height = 8,
  white = false,
  animate = true,
  className,
  ...aria
}: {
  pct: number
  height?: number
  white?: boolean
  animate?: boolean
  className?: string
  role?: string
  'aria-label'?: string
  'aria-hidden'?: boolean
}) {
  const k = Math.max(0, Math.min(1, pct))
  return (
    <div
      className={cx('pixel-corners relative overflow-hidden bg-night shadow-ring', className)}
      style={{ height: Math.max(8, height) }}
      {...aria}
    >
      <div
        className={cx('absolute bottom-[2px] left-[2px] top-[2px]', white && 'bg-white')}
        style={{
          width: `calc(${k * 100}% - ${k * 4}px)`,
          background: white ? undefined : XP_FILL,
          transition: animate ? 'width 700ms ease-out' : 'none',
        }}
      />
    </div>
  )
}
