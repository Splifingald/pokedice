import { useEffect, useState, type ReactNode } from 'react'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'

/** Dialogue-box narration with a typewriter reveal (click to finish) and the blinking ▼. */
export function Dialogue({
  text,
  children,
  speed = 22,
  className,
  onDone,
  showCursor = true,
}: {
  text?: string
  children?: ReactNode
  speed?: number
  className?: string
  onDone?: () => void
  showCursor?: boolean
}) {
  const reduced = useGame((s) => s.settings.reducedMotion)
  const [state, setState] = useState({ text: text ?? '', n: 0 })
  const n = state.text === (text ?? '') ? state.n : 0
  const full = !text || reduced || n >= text.length

  useEffect(() => {
    if (!text || reduced || n >= text.length) {
      if (text) onDone?.()
      return
    }
    const t = setTimeout(() => setState({ text, n: n + 1 }), speed)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, n, reduced, speed])

  return (
    <div
      className={cx('pixel-dialogue relative min-h-[3.5em] px-4 py-3 text-2xl leading-snug', className)}
      onClick={() => text && setState({ text, n: text.length })}
    >
      {text ? (full ? text : text.slice(0, n)) : children}
      {showCursor && full && <span className="blink absolute bottom-1 right-2 text-lg">▼</span>}
    </div>
  )
}
