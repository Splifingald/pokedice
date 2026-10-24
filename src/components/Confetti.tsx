import { motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { gameFeelOn } from '@/engine'
import { useGame } from '@/store/game'

const COLORS = ['#ffbe2e', '#f2553f', '#547acc', '#34c97a', '#d44873', '#fbfdff']

/** The pixel confetti's colour ramp (docs/15 §8: particles step through a fixed ramp), hot to cooling. */
const RAMP = ['#ffffff', '#ffe066', '#ffbe2e', '#f2553f', '#b8352a']
/** 12 frames a second, stepped like the rest of the pixel motion; 14 frames in all. */
const FRAME_MS = 83
const FRAMES = 14
/** A piece: 2 × 2 art pixels (4 CSS px), on the 2 px grid. */
const PIECE = 4
const snap = (v: number) => Math.round(v / 2) * 2

/**
 * A burst of pixel confetti from the middle of its (positioned) box — a level-up, an evolution. Skipped entirely with
 * reduced motion. `count` pieces fly out to about `spread` pixels, then fall. With the Game feel switch on (docs/38
 * F5e) it is drawn on the pixel grid instead: square pieces stepping frame by frame through a fixed colour ramp, no
 * rotation, no fade (each piece drops out on its own frame). `pixel` picks the look whatever the switch, and `frame`
 * holds it still on one frame (the kitchen sink).
 */
export function Confetti({
  count = 20,
  spread = 34,
  size = 10,
  pixel,
  frame,
}: {
  count?: number
  spread?: number
  size?: number
  pixel?: boolean
  frame?: number
}) {
  const reduced = useGame((s) => s.settings.reducedMotion)
  const feel = useGame((s) => gameFeelOn(s.data))
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
  if (pixel ?? feel) return <PixelConfetti bits={bits} spread={spread} frame={frame} />
  return (
    <span className="pointer-events-none absolute inset-0 overflow-visible" aria-hidden>
      {bits.map((b, i) => (
        <motion.span
          key={i}
          className="absolute left-1/2 top-1/2"
          style={{ width: size, height: size, background: b.color, boxShadow: '0 0 0 1px #24304f' }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
          animate={{ x: b.x, y: [0, b.y, b.y + spread * 0.8], opacity: [1, 1, 0], rotate: b.rot }}
          transition={{ duration: 1.3, ease: 'easeOut' }}
        />
      ))}
    </span>
  )
}

function PixelConfetti({
  bits,
  spread,
  frame,
}: {
  bits: { x: number; y: number }[]
  spread: number
  frame?: number
}) {
  const [f, setF] = useState(0)
  useEffect(() => {
    if (frame != null || f >= FRAMES) return
    const timer = window.setTimeout(() => setF(f + 1), FRAME_MS)
    return () => window.clearTimeout(timer)
  }, [f, frame])
  const at = frame ?? f
  if (at >= FRAMES) return null
  const k = at / (FRAMES - 1)
  // Out fast, then falling: the burst is over by a third of the way, gravity has the rest.
  const out = 1 - (1 - Math.min(1, k * 2.4)) ** 3
  return (
    <span className="pointer-events-none absolute inset-0 overflow-visible" aria-hidden>
      {bits.map((b, i) => {
        // Each piece goes out on a frame of its own near the end, never all at once.
        if (at > FRAMES - 1 - (i % 4)) return null
        const color = RAMP[Math.min(RAMP.length - 1, (i % 2) + Math.floor(k * 4))]
        return (
          <span
            key={i}
            className="absolute left-1/2 top-1/2"
            style={{
              width: PIECE,
              height: PIECE,
              background: color,
              transform: `translate(${snap(b.x * out - PIECE / 2)}px, ${snap(b.y * out + spread * 0.9 * k * k - PIECE / 2)}px)`,
            }}
          />
        )
      })}
    </span>
  )
}
