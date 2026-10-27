import { motion } from 'framer-motion'
import { forwardRef, useEffect, useRef, type ComponentProps } from 'react'
import { PixelButton } from '@/components/PixelButton'
import { usePace } from '@/lib/pace'
import { useDialogOpen } from '@/lib/useDialog'
import { useAutoLevel } from '@/store/autopilot'
import { cx } from '@/theme/util'

/** How long a one-button step stays before it presses itself (times the battle pace). */
export const AUTO_STEP_MS = 1600

type Props = Omit<ComponentProps<typeof PixelButton>, 'onClick'> & {
  onClick: () => void
  /** Before it presses itself; the battle pace shortens it under auto-mode. */
  ms?: number
  /** Not yet (an animation still playing): no fill, no timer. */
  hold?: boolean
  /** On the page, not in a dialog itself: it waits while one covers it (the trainer menu, the bag…). */
  paused?: 'byDialogs'
}

/**
 * A step whose only way on is one button. It waits for the player's tap (the user's call, 2026-10-27: no button presses
 * itself any more), except while auto-mode or Idle mode plays the area: then it loads, as the autopilot's steps do, and
 * presses itself; a tap goes sooner. Never for a Pokémon Center, which waits for the Box.
 */
export const AutoButton = forwardRef<HTMLButtonElement, Props>(function AutoButton(
  { onClick, ms = AUTO_STEP_MS, hold: held = false, paused, className, children, ...rest },
  ref,
) {
  const covered = useDialogOpen()
  const auto = useAutoLevel() !== 'off'
  const hold = held || !auto || (paused === 'byDialogs' && covered)
  const pace = usePace()
  const wait = ms * pace
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const latest = useRef(onClick)
  latest.current = onClick
  useEffect(() => {
    if (hold) return
    timer.current = setTimeout(() => latest.current(), wait)
    return () => clearTimeout(timer.current)
  }, [hold, wait])
  // A tap goes now, and the timer won't press it a second time.
  const press = () => {
    clearTimeout(timer.current)
    onClick()
  }
  return (
    <PixelButton {...rest} ref={ref} onClick={press} className={cx('relative overflow-hidden', className)}>
      {children}
      {!hold && (
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-[5px] bg-black/20">
          <motion.span
            className="block h-full bg-gold-light"
            initial={{ width: 0 }}
            animate={{ width: '100%' }}
            transition={{ duration: wait / 1000, ease: 'linear' }}
          />
        </span>
      )}
    </PixelButton>
  )
})
