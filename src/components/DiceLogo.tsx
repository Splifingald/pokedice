// The title's logo with the game feel on (docs/38 §9): POKÉDICE as eight pixel-art dice that form as in the trailer —
// thrown in, rolling right to left, landing crooked on their letters, a white flash, gold rings — then hold. The maths
// and the renderer (fx/dice/logo.ts, logoArt.ts) are a chunk of their own, fetched when the title shows it; this draws
// their frames on a canvas at whole device pixels per art pixel and plays the sounds once the page's audio is open.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { feelSound } from '@/audio/feel'
import { audioUnlocked, sfx } from '@/audio/sfx'
import type { LogoMode } from '@/fx/dice/logo'
import { ART_PX, LOGO_BOX, LOGO_PAD, type LogoLayout } from '@/fx/dice/logoSize'
import { useT } from '@/i18n/react'
import { useMotion } from '@/lib/motion'
import { BRAND } from '@/lib/pageMeta'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { cx } from '@/theme/util'

type Art = typeof import('@/fx/dice/logoArt')
let art: Promise<Art> | null = null
/** The logo's maths and renderer: one small chunk, fetched once. */
export function loadLogoArt(): Promise<Art> {
  art ??= import('@/fx/dice/logoArt').catch((e: unknown) => {
    art = null
    throw e
  })
  return art
}

/**
 * Device pixels per art pixel, a whole number so every pixel is the same size: 2 at 1×, 4 at 2×, 5 at 2.625× (an art
 * pixel 1.9 CSS px there rather than an uneven 2). `css`: CSS px per art pixel.
 */
function usePixelScale() {
  const read = () => (typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1)
  const [dpr, setDpr] = useState(read)
  useEffect(() => {
    // A zoom or a move to another screen changes the ratio; both send a resize.
    const on = () => setDpr(read())
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  const k = Math.max(1, Math.round(ART_PX * dpr))
  return { dpr, k, css: k / dpr }
}

export interface DiceLogoProps {
  className?: string
  /** Kitchen Sink: how it forms whatever the motion settings say. */
  mode?: LogoMode
  /** Kitchen Sink: one row or two whatever the width. */
  layout?: LogoLayout
  /** Kitchen Sink: this moment (s) held, silent. */
  freeze?: number
  /** Kitchen Sink: a new value throws it again. */
  replay?: number
  /** Kitchen Sink: no <h1> (the page has its own), and the canvas's whole height kept in the layout. */
  sample?: boolean
}

export function DiceLogo({
  className,
  mode: askedMode,
  layout: askedLayout,
  freeze,
  replay = 0,
  sample = false,
}: DiceLogoProps) {
  const { t } = useT()
  const { level, calm } = useMotion()
  const wide = useMediaQuery('(min-width: 768px)')
  const layout: LogoLayout = askedLayout ?? (wide ? 'wide' : 'tall')
  const mode: LogoMode =
    askedMode ?? (level === 'off' ? 'rest' : level === 'full' ? 'throw' : calm ? 'calm' : 'drop')
  const { dpr, k, css } = usePixelScale()
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const tagline = useRef<HTMLParagraphElement>(null)
  const [width, setWidth] = useState(0)
  const [mod, setMod] = useState<Art | null>(null)
  const [taps, setTaps] = useState(0)
  // The throw's clock and the last moment drawn, kept across a resize so a throw under way carries on.
  const clock = useRef({ key: '', start: 0, prev: -1, lastLand: -Infinity })

  useLayoutEffect(() => {
    const el = wrap.current
    if (!el) return
    const measure = () => setWidth(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    let live = true
    loadLogoArt()
      .then((m) => live && setMod(m))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  const box = LOGO_BOX[layout]
  const boxW = box.x1 - box.x0
  const boxH = box.y1 - box.y0
  // The canvas in art pixels: the page's width (whole art pixels, never wider than the page), the box and its pads.
  const W = Math.max(boxW, Math.floor((width * dpr) / k))
  const H = LOGO_PAD.top + boxH + LOGO_PAD.bottom
  // The logo's origin in the canvas: the box in the middle.
  const ox = Math.round(W / 2 - (box.x0 + box.x1) / 2)
  const oy = LOGO_PAD.top - box.y0
  const throwKey = `${mode}|${replay}|${taps}`

  useEffect(() => {
    const c = canvas.current
    if (!mod || !c || !width) return
    const off = document.createElement('canvas')
    off.width = W
    off.height = H
    const octx = off.getContext('2d')
    const vctx = c.getContext('2d')
    if (!octx || !vctx) return
    c.width = W * k
    c.height = H * k
    const img = octx.createImageData(W, H)
    const fb = { buf: new Uint32Array(img.data.buffer), w: W, h: H }
    const cues = mod.logoCues(mode, layout)
    const run = clock.current
    if (run.key !== throwKey) {
      run.key = throwKey
      run.start = performance.now()
      run.prev = -1
    }
    let raf = 0
    let shown = -1
    const play = (cue: (typeof cues)[number]['cue'], now: number) => {
      // Never before a tap has opened the page's audio: the title loads before any.
      if (!audioUnlocked()) return
      if (cue === 'rattle') sfx('rattle')
      else if (cue === 'chime') feelSound('title.chime')
      else if (now - run.lastLand > 40) {
        // A click per bounce, never more than one every 40 ms, so eight dice rattle rather than buzz (fx/dice/player).
        run.lastLand = now
        sfx('land')
      }
    }
    const draw = (now: number) => {
      raf = 0
      const time = freeze ?? (now - run.start) / 1000
      const f = mod.logoFrame(time, mode, layout, W - ox)
      mod.drawLogo(fb, f, ox, oy)
      octx.putImageData(img, 0, 0)
      vctx.imageSmoothingEnabled = false
      vctx.clearRect(0, 0, c.width, c.height)
      vctx.drawImage(off, 0, 0, W * k, H * k)
      if (tagline.current && f.tagline !== shown) {
        shown = f.tagline
        tagline.current.style.opacity = String(f.tagline)
      }
      // A tab hidden mid-throw comes back past its sounds: they don't all play at once.
      if (freeze == null && time - run.prev < 0.25)
        for (const q of cues) if (q.t > run.prev && q.t <= time) play(q.cue, now)
      run.prev = time
      if (freeze == null && !f.done) raf = requestAnimationFrame(draw)
    }
    draw(performance.now())
    return () => cancelAnimationFrame(raf)
  }, [mod, width, W, H, k, ox, oy, mode, layout, freeze, throwKey])

  const throwAgain = () => {
    // The throw's rattle is its tap's sound; the other ways in start silent, so they get the button's blip.
    if (mode !== 'throw') sfx('button')
    setTaps((n) => n + 1)
  }

  // On the title the canvas reaches over the page around the logo; a sample keeps its whole height.
  const top = sample ? LOGO_PAD.top * css : 0
  const logo = { left: (ox + box.x0) * css, top, width: boxW * css, height: boxH * css }
  const Heading = sample ? 'div' : 'h1'
  return (
    <div className={cx('flex flex-col items-center', className)}>
      <div ref={wrap} className="relative w-full" style={{ height: (sample ? H : boxH) * css }}>
        <Heading className="absolute m-0" style={logo}>
          <canvas
            ref={canvas}
            role="img"
            aria-label={BRAND}
            className="pointer-events-none absolute max-w-none"
            style={{
              left: -(ox + box.x0) * css,
              top: -LOGO_PAD.top * css,
              width: W * css,
              height: H * css,
              imageRendering: 'pixelated',
            }}
          />
        </Heading>
        <button
          type="button"
          aria-label={t('ui.title.throwAgain')}
          onClick={throwAgain}
          className="absolute cursor-pointer border-0 bg-transparent p-0"
          style={logo}
        />
      </div>
      <p
        ref={tagline}
        className="m-0 mt-3 font-pixel-sm text-[22px] leading-none tracking-[0.08em] text-muted"
        style={{ opacity: mode === 'rest' ? 1 : 0 }}
      >
        {t('ui.title.tagline')}
      </p>
    </div>
  )
}
