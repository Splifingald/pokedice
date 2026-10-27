import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { feelSound } from '@/audio/feel'
import { gameFeelOn } from '@/engine'
import { useMotion } from '@/lib/motion'
import { useGame } from '@/store/game'

/** The bars across the stage, and the steps each takes to clear it: pixel-art moves in steps, never a glide. */
const BARS = 8
const STEPS = 6
const stepped = (p: number) => (p >= 1 ? 1 : Math.floor(p * STEPS) / STEPS)

/**
 * The way into a fight (docs/42): the stage opens behind ink bars that pull away to alternate sides, a step at a time,
 * with a rush of air, so each new encounter lands as one. Game feel only; quicker under short motion; none when the
 * screen should be calm. It covers the stage while the foe's intro starts under it, so no fight waits for it.
 */
export function EncounterSwipe() {
  const { level, calm } = useMotion()
  const feel = useGame((s) => gameFeelOn(s.data))
  // Decided once, as the fight's stage first draws: a setting changed mid-fight doesn't bring it back.
  const [on, setOn] = useState(() => feel && level !== 'off' && !calm)
  const ms = level === 'short' ? 280 : 480
  useEffect(() => {
    if (!on) return
    feelSound('encounter.swipe')
    const t = setTimeout(() => setOn(false), ms + 60)
    return () => clearTimeout(t)
    // Once, on the stage's first draw.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  if (!on) return null
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-40 flex flex-col overflow-hidden">
      {Array.from({ length: BARS }, (_, i) => (
        <motion.div
          key={i}
          className="-my-px flex-1 bg-night"
          initial={{ x: '0%' }}
          animate={{ x: i % 2 ? '101%' : '-101%' }}
          // The middle bars go first, the edges last: the scene opens from its centre line.
          transition={{
            duration: (ms * 0.7) / 1000,
            delay: ((Math.abs(i - (BARS - 1) / 2) - 0.5) * ms * 0.08) / 1000,
            ease: stepped,
          }}
        />
      ))}
    </div>
  )
}
