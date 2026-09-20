import { useEffect, useRef, useState } from 'react'
import { getLang, t } from '@/i18n'
import { useT } from '@/i18n/react'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'

/** Count-up number (instant with reduced motion). */
export function useCountUp(target: number, ms = 600): number {
  const reduced = useGame((s) => s.settings.reducedMotion)
  const [shown, setShown] = useState(target)
  const from = useRef(target)
  useEffect(() => {
    if (reduced || typeof requestAnimationFrame === 'undefined') {
      from.current = target
      setShown(target)
      return
    }
    const start = performance.now()
    const a = from.current
    let raf = 0
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms)
      const v = Math.round(a + (target - a) * (1 - (1 - k) ** 3))
      setShown(v)
      if (k < 1) raf = requestAnimationFrame(step)
      else from.current = target
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, ms, reduced])
  return shown
}

export function GoldPill({ amount, className }: { amount: number; className?: string }) {
  useT()
  const shown = useCountUp(amount)
  return (
    <span
      className={cx('inline-flex items-center gap-1.5 border-2 border-ink bg-ink px-2 py-0.5 text-gold', className)}
      style={{ borderRadius: 2 }}
      role="img"
      aria-label={t('ui.mon.pokedollars', { amount })}
    >
      <span aria-hidden className="text-lg leading-none">
        ₽
      </span>
      <span className="font-mono text-sm tabular-nums leading-none">{shown.toLocaleString(getLang())}</span>
    </span>
  )
}
