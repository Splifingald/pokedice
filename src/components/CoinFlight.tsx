// Rewards flying to the top bar (docs/38 F5f): a few pixel coins leave the result card's gold and land in the top
// bar's gold counter one after another, the way a match-3 sends its coins home; each lands with a tick, the last bumps
// the counter. Never under calm or with animations off (the caller checks), and only when the counter is on screen
// to land in.
import { useEffect, useLayoutEffect, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { feelSound } from '@/audio/feel'
import { bumpGold } from './GoldPill'
import { PixelIcon } from './icons'

/** The top bar's gold counter wears this attribute (Hud.tsx): where the coins land. */
export const HUD_GOLD_ATTR = 'data-hud-gold'

/** Stepped like the pixel motion: 20 frames a second, a coin's flight 12 of them, the next one 2 frames behind. */
const STEP_MS = 50
const FLIGHT = 12
const GAP = 2
const COIN = 16

type Pt = { x: number; y: number }
const centre = (el: Element | null | undefined): Pt | null => {
  const r = el?.getBoundingClientRect()
  return r && r.width > 0 && r.height > 0 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null
}
const snap = (v: number) => Math.round(v / 2) * 2

/**
 * `coins` coins from `from` to the top bar's gold (or `to`), then `onLanded`. `frame` holds them still on one frame
 * (the kitchen sink); nothing is drawn when either end is off screen.
 */
export function CoinFlight({
  from,
  to,
  coins = 6,
  onLanded,
  frame,
}: {
  from: RefObject<HTMLElement | null>
  to?: RefObject<HTMLElement | null>
  coins?: number
  onLanded?: () => void
  frame?: number
}) {
  const [ends, setEnds] = useState<{ a: Pt; b: Pt } | null>(null)
  const [f, setF] = useState(0)
  const total = (coins - 1) * GAP + FLIGHT
  useLayoutEffect(() => {
    const a = centre(from.current)
    const b = centre(to ? to.current : document.querySelector(`[${HUD_GOLD_ATTR}]`))
    setEnds(a && b ? { a, b } : null)
  }, [from, to])
  useEffect(() => {
    if (!ends || frame != null || f > total) return
    const timer = window.setTimeout(() => {
      const next = f + 1
      // A coin home: a tick; the last one bumps the counter.
      if (next - FLIGHT >= 0 && (next - FLIGHT) % GAP === 0 && (next - FLIGHT) / GAP < coins)
        feelSound('coin.tick')
      if (next > total) {
        bumpGold()
        onLanded?.()
      }
      setF(next)
    }, STEP_MS)
    return () => window.clearTimeout(timer)
  }, [ends, f, frame, total, coins, onLanded])
  const at = frame ?? f
  if (!ends || at > total) return null
  const { a, b } = ends
  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[90]" aria-hidden>
      {Array.from({ length: coins }, (_, i) => {
        const local = at - i * GAP
        if (local < 0 || local >= FLIGHT) return null
        // Up and over in an arc, speeding up into the counter; every other coin swings the other way.
        const q = (local / FLIGHT) ** 1.4
        const c = { x: a.x + (b.x - a.x) * 0.3 + (i % 2 ? -36 : 36), y: Math.min(a.y, b.y) - 48 }
        const x = (1 - q) ** 2 * a.x + 2 * (1 - q) * q * c.x + q * q * b.x
        const y = (1 - q) ** 2 * a.y + 2 * (1 - q) * q * c.y + q * q * b.y
        return (
          <span key={i} className="absolute" style={{ left: snap(x - COIN / 2), top: snap(y - COIN / 2) }}>
            <PixelIcon name="coin" size={COIN} />
          </span>
        )
      })}
    </div>,
    document.body,
  )
}
