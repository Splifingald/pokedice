// The tutorial's pointing hand (docs/46 §5): a white glove drawn pixel by pixel, its finger on what to tap. It bobs
// toward it in 2-pixel steps; calm devices (no motion, the OS asking for less) get it still.
import { cx } from '@/theme/util'

// 16 × 17, the finger up. X: outline, W: glove, S: its shade, C: the cuff, D: the cuff's shade.
const ROWS = [
  '.....XX.........',
  '....XWWX........',
  '....XWWX........',
  '....XWSX........',
  '....XWSXXX.XX...',
  '....XWSXWSXWSXX.',
  '.XX.XWWXWSXWSXSX',
  'XWSXXWWWWWWWWXSX',
  'XWWSXWWWWWWWWWSX',
  '.XWWWWWWWWWWWWSX',
  '..XWWWWWWWWWWWSX',
  '..XWWWWWWWWWWSX.',
  '...XWWWWWWWWWSX.',
  '....XWWWWWWWSX..',
  '....XCCCCCCCDX..',
  '....XCCCCCCCDX..',
  '....XXXXXXXXXX..',
]
const W = ROWS[0]!.length
const H = ROWS.length
/** Where the finger's tip is, from the sprite's top left, in its own pixels (pointing up). */
export const HAND_TIP = { x: 5.5, y: 0 }

// A sprite keeps its colours in both themes: navy outline, white glove, the gold cuff.
const FILL: Record<string, string> = {
  X: 'fill-night',
  W: 'fill-white',
  S: 'fill-[#c9d4e6]',
  C: 'fill-gold',
  D: 'fill-[#d99a12]',
}

export function TutorialHand({
  scale = 4,
  down = false,
  still = false,
  className,
}: {
  /** Screen pixels per sprite pixel. */
  scale?: number
  /** Pointing down (the hand above its target) instead of up. */
  down?: boolean
  /** No bobbing. */
  still?: boolean
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cx(
        'pointer-events-none block',
        !still && (down ? 'guide-hand-bob-down' : 'guide-hand-bob'),
        className,
      )}
      style={{ width: W * scale, height: H * scale }}
    >
      <svg
        width={W * scale}
        height={H * scale}
        viewBox={`0 0 ${W} ${H}`}
        shapeRendering="crispEdges"
        style={down ? { transform: 'scaleY(-1)' } : undefined}
      >
        {ROWS.flatMap((row, y) =>
          [...row].map((c, x) =>
            FILL[c] ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} className={FILL[c]} /> : null,
          ),
        )}
      </svg>
    </span>
  )
}
