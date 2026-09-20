import { motion } from 'framer-motion'
import { useMemo } from 'react'
import { useGame } from '@/store/game'

const COLORS = ['#e8b44a', '#c2452d', '#547acc', '#4aa84a', '#d44873', '#f7f2e0']

/**
 * A burst of pixel confetti from the middle of its (positioned) box — a level-up, an evolution. Skipped entirely with
 * reduced motion. `count` pieces fly out to about `spread` pixels, then fall.
 */
export function Confetti({ count = 20, spread = 34, size = 10 }: { count?: number; spread?: number; size?: number }) {
  const reduced = useGame((s) => s.settings.reducedMotion)
  const bits = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const a = (i / count) * Math.PI * 2 + Math.random() * 0.4
        const r = spread + Math.random() * spread * 0.9
        return { x: Math.cos(a) * r, y: Math.sin(a) * r - spread * 0.4, rot: Math.random() * 360, color: COLORS[i % COLORS.length]! }
      }),
    [count, spread],
  )
  if (reduced) return null
  return (
    <span className="pointer-events-none absolute inset-0 overflow-visible" aria-hidden>
      {bits.map((b, i) => (
        <motion.span
          key={i}
          className="absolute left-1/2 top-1/2"
          style={{ width: size, height: size, background: b.color, boxShadow: '0 0 0 1px #2a2438' }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
          animate={{ x: b.x, y: [0, b.y, b.y + spread * 0.8], opacity: [1, 1, 0], rotate: b.rot }}
          transition={{ duration: 1.3, ease: 'easeOut' }}
        />
      ))}
    </span>
  )
}
