import { motion } from 'framer-motion'
import { useState, type ReactNode } from 'react'
import { Confetti } from '@/components/Confetti'
import { useMotion } from '@/lib/motion'
import { usePace } from '@/lib/pace'
import { cx } from '@/theme/util'

/** Each keyframe held until the next: pixel motion steps, it never glides (docs/15 §8). */
const held = (p: number) => (p < 1 ? 0 : 1)

/**
 * A result's moment landing (docs/43 §5.3, the game feel): the card stamps down in held steps instead of just appearing.
 * Its weight follows what it is worth — `big` (a badge, the Champion, an area cleared, a medal): from twice its size in
 * three steps, two white frames, a ring of light stepping out and the pixel confetti; `small` (a catch, a secret area):
 * one step down, no flash. Short motion keeps one step; a calm screen (the OS's reduced motion) or animations off show
 * the card at rest. Never blocks: the result goes on as it plays, and its sound is the card's own (docs/38 F5d).
 */
export function Stamp({
  weight,
  children,
  className,
  replay = 0,
}: {
  weight: 'big' | 'small'
  children: ReactNode
  className?: string
  /** Kitchen sink: a new value plays it again. */
  replay?: number
}) {
  const { level, calm } = useMotion()
  const pace = usePace()
  // Decided as it first appears: a setting changed later doesn't play it again.
  const [play] = useState(() => level !== 'off' && !calm)
  if (!play) return <div className={className}>{children}</div>
  const big = weight === 'big' && level === 'full'
  const scale = big ? [2, 1.45, 1.12, 1] : level === 'full' ? [1.25, 1] : [1.12, 1]
  const dur = (big ? 0.36 : 0.16) * pace
  return (
    <div className={cx('relative', className)}>
      <motion.div
        key={replay}
        style={{ transformOrigin: '50% 60%' }}
        initial={{ scale: scale[0] }}
        animate={{ scale }}
        transition={{ duration: dur, times: scale.map((_, i) => i / (scale.length - 1)), ease: held }}
      >
        {children}
        {big && (
          // Two white frames as it lands (a frame is 60 ms; one flash, far under three a second).
          <motion.span
            key={`flash-${replay}`}
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-white"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0, 0.9, 0.9, 0] }}
            transition={{ duration: dur + 0.12 * pace, times: [0, 0.62, 0.63, 0.9, 1], ease: held }}
          />
        )}
      </motion.div>
      {big && (
        <>
          {/* A ring of light stepping out from the card, three steps, then gone. */}
          <motion.span
            key={`ring-${replay}`}
            aria-hidden
            className="pointer-events-none absolute inset-0 shadow-[0_0_0_3px_#ffe36b,0_0_0_6px_#24304f]"
            initial={{ opacity: 0, scale: 1 }}
            animate={{ opacity: [0, 1, 1, 1, 0], scale: [1, 1, 1.06, 1.12, 1.16] }}
            transition={{ duration: dur + 0.28 * pace, times: [0, 0.5, 0.65, 0.8, 1], ease: held }}
          />
          <span aria-hidden className="pointer-events-none absolute inset-0">
            <Confetti key={`confetti-${replay}`} count={24} spread={70} />
          </span>
        </>
      )}
    </div>
  )
}
