import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { H, Player, setCalm, W, type Hud, type Timeline } from '@/fx/timeline'
import { useMotion } from '@/lib/motion'
import { cx } from '@/theme/util'

export interface StageHandle {
  replay(): void
  play(): void
  pause(): void
  step(): void
  skip(): void
  setSpeed(k: number): void
}

/** Sprites still loading after this long don't hold a timeline back (offline, a slow CDN). */
const READY_WAIT = 1500

/**
 * A 240×160 pixel stage that plays one timeline (src/fx). It waits for `ready` (the sprites it draws), then plays —
 * or, when animations are off, jumps straight to the end with every cue fired, so the screen around it still learns
 * what happened. `hud` receives the cues; it is read live, so changing it doesn't restart the timeline.
 */
export const StageCanvas = forwardRef<
  StageHandle,
  {
    timeline: Timeline<unknown> | null
    hud?: Hud
    ready?: Promise<unknown>
    autoPlay?: boolean
    onEnd?: () => void
    onTick?: (t: number) => void
    /** What the stage shows, for screen readers (the canvas is an image). */
    label: string
    className?: string
  }
>(function StageCanvas({ timeline, hud, ready, autoPlay = true, onEnd, onTick, label, className }, ref) {
  const cv = useRef<HTMLCanvasElement>(null)
  const player = useRef<Player<unknown> | null>(null)
  const hudRef = useRef<Hud>({})
  hudRef.current = hud ?? {}
  const endRef = useRef(onEnd)
  endRef.current = onEnd
  const tickRef = useRef(onTick)
  tickRef.current = onTick
  const { level, calm } = useMotion()

  useEffect(() => setCalm(calm), [calm])

  useEffect(() => {
    if (!cv.current) return
    // The hud passed to the player forwards to whatever the latest render gave us.
    const live: Hud = new Proxy({} as Hud, { get: (_, k: keyof Hud) => hudRef.current[k] })
    const p = new Player<unknown>(cv.current, live)
    p.onEnd = () => endRef.current?.()
    p.onTick = (t) => tickRef.current?.(t)
    player.current = p
    return () => {
      p.stop()
      player.current = null
    }
  }, [])

  useEffect(() => {
    const p = player.current
    if (!p || !timeline) return
    let gone = false
    const start = () => {
      if (gone) return
      p.load(timeline)
      if (level === 'off') p.skip()
      else if (autoPlay) p.play()
    }
    if (ready) void Promise.race([ready, new Promise((r) => setTimeout(r, READY_WAIT))]).then(start)
    else start()
    return () => {
      gone = true
      p.stop()
    }
    // A new timeline object is a new animation; the level is read when it starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeline, ready])

  useImperativeHandle(ref, () => ({
    replay: () => {
      player.current?.reset()
      player.current?.play()
    },
    play: () => player.current?.play(),
    pause: () => player.current?.pause(),
    step: () => player.current?.stepFrame(),
    skip: () => player.current?.skip(),
    setSpeed: (k) => {
      if (player.current) player.current.speed = k
    },
  }))

  return (
    <canvas
      ref={cv}
      width={W}
      height={H}
      role="img"
      aria-label={label}
      className={cx('pixelated block aspect-[3/2] w-full', className)}
      style={{ imageRendering: 'pixelated' }}
    />
  )
})
