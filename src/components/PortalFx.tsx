// Distortion World's effects on the page (docs/28, docs/15 §27), hosting the pixel engine's portal scenes
// (src/fx/timelines/portal.ts, src/fx/glitch.ts): the portal looping on a canvas, the full-screen scenes' stage, the
// wild Pokémon's distortion (its aura under the sprite, its bursts over it), the screen's distortion, the UI's glitches
// (one element at a time, now and then), and a portal closing over the page. Every piece honours the motion level:
// They are the world's identity: a calm OS keeps them as in full, the player's short setting gives a lighter version,
// only motion `off` shows a still frame (or nothing) (distortionLevel).
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { fxSound } from '@/audio/sfx'
import { bayer, canvas, Particles, rect, rng, type Canvas, type G } from '@/fx/pixel'
import {
  DW,
  burstAt,
  drawAura,
  drawDistorted,
  emitMote,
  GLITCH_DUR,
  GLITCH_PERIOD,
  seeded,
} from '@/fx/glitch'
import { loadSprite, spriteFrame, spriteKey, stageSprite } from '@/fx/sprites'
import type { Timeline } from '@/fx/timeline'
import { closeTimeline, distortionLevel, fullStage, portalLoop, type PortalLoop } from '@/fx/timelines/portal'
import { useMotion, type MotionLevel } from '@/lib/motion'
import { cx } from '@/theme/util'
import { showdownView, SpriteImg } from './SpriteImg'
import { StageCanvas } from './StageCanvas'
import { artBox } from '@/lib/showdown'

/** How the world's lasting effects play here: full (a calm OS too), short, or off (still). */
function useDistortionLevel(): MotionLevel {
  const { level, calm } = useMotion()
  return distortionLevel(level, calm)
}

// ------------------------------------------------------------------ a looping canvas

/**
 * Runs a loop on a canvas: fixed 60 Hz steps, drawn 30 times a second (it is ambient), paused with the tab. `still`:
 * one frame, drawn once.
 */
function useLoop(
  ref: RefObject<HTMLCanvasElement | null>,
  make: () => PortalLoop | null,
  still: boolean,
  deps: unknown[],
) {
  useEffect(() => {
    const cv = ref.current
    const loop = make()
    const g = cv?.getContext('2d')
    if (!cv || !g || !loop) return
    g.imageSmoothingEnabled = false
    let t = 0
    const draw = () => {
      g.imageSmoothingEnabled = false
      loop.draw(g, t)
    }
    draw()
    if (still) return
    let raf = 0
    let last = performance.now()
    let acc = 0
    let shown = 0
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      acc += dt
      while (acc >= 1 / 60) {
        acc -= 1 / 60
        t += 1 / 60
        loop.step(t, 1 / 60)
      }
      if (now - shown > 30) {
        shown = now
        draw()
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [still, ...deps])
}

/** A box's size in CSS pixels, kept up to date. */
function useBoxSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return size
}

/**
 * The portal on its own (by a distortion's boons), `size` CSS pixels square, at 2 CSS pixels per art pixel: its
 * dithered rings turning, motes pulled in, sparks on the rim. `still` holds it (motion off).
 */
export function PortalArt({
  size = 160,
  still,
  className,
}: {
  size?: number
  still?: boolean
  className?: string
}) {
  const level = useDistortionLevel()
  const hold = still ?? level === 'off'
  const ref = useRef<HTMLCanvasElement>(null)
  const art = Math.max(16, Math.round(size / 2))
  useLoop(ref, () => portalLoop(art, art, { scene: false, still: hold }), hold, [art])
  return (
    <canvas
      ref={ref}
      width={art}
      height={art}
      aria-hidden
      className={cx('pixelated block', className)}
      style={{ width: size, height: size, imageRendering: 'pixelated' }}
    />
  )
}

/**
 * The Distortion World filling its box (the way-in pop-up, the rules' banner): the void, its floating rocks drifting
 * upside-down, the portal turning in the middle. 2 CSS pixels per art pixel.
 */
export function PortalScene({ className, still }: { className?: string; still?: boolean }) {
  const level = useDistortionLevel()
  const hold = still ?? level === 'off'
  const box = useRef<HTMLDivElement>(null)
  const ref = useRef<HTMLCanvasElement>(null)
  const size = useBoxSize(box)
  const w = size ? Math.max(16, Math.ceil(size.w / 2)) : 0
  const h = size ? Math.max(16, Math.ceil(size.h / 2)) : 0
  useLoop(ref, () => (w && h ? portalLoop(w, h, { still: hold }) : null), hold, [w, h])
  return (
    <div ref={box} aria-hidden className={cx('absolute inset-0 overflow-hidden bg-[#07020d]', className)}>
      {w > 0 && (
        <canvas
          ref={ref}
          width={w}
          height={h}
          className="pixelated absolute left-0 top-0"
          style={{ width: w * 2, height: h * 2, imageRendering: 'pixelated' }}
        />
      )}
    </div>
  )
}

// ------------------------------------------------------------------ full-screen scenes

/** The stage size for a full-screen scene, measured once when it opens. */
export function useFullStage(words = 0) {
  const [size] = useState(() =>
    typeof window === 'undefined'
      ? { w: 240, h: 160, inset: 0 }
      : fullStage(window.innerWidth, window.innerHeight, words),
  )
  return size
}

// ------------------------------------------------------------------ the wild Pokémon's distortion

/** One clock for a distorted sprite's aura and bursts. */
const clock = () => performance.now() / 1000

/**
 * Draws a distorted Pokémon's layers on two canvases sharing one clock: `aura` (under the sprite: the dark glow and
 * its two-colour rim) and `over` (above it: the void's motes, and every 3.4 s a half-second burst during which the
 * page's sprite is hidden, `host` gets `data-glitching`, and the canvas draws it torn). The feet at `at`, in the
 * canvases' art pixels.
 */
function useDistortion({
  aura,
  over,
  host,
  sprite,
  at,
  active,
  level,
}: {
  aura: RefObject<HTMLCanvasElement | null>
  over: RefObject<HTMLCanvasElement | null>
  host: RefObject<HTMLElement | null>
  sprite: string
  at: { x: number; y: number } | null
  active: boolean
  /** distortionLevel's: off is still, short has no tear. */
  level: MotionLevel
}) {
  const ax = at?.x ?? 0
  const ay = at?.y ?? 0
  useEffect(() => {
    const a = aura.current?.getContext('2d')
    const o = over.current?.getContext('2d')
    const el = host.current
    if (!a || !o || !at) return
    a.imageSmoothingEnabled = false
    o.imageSmoothingEnabled = false
    const still = level === 'off'
    const short = level === 'short'
    const setGlitching = (on: boolean) => el?.toggleAttribute('data-glitching', on)
    const clear = (g: G) => g.clearRect(0, 0, g.canvas.width, g.canvas.height)
    if (!active) {
      clear(a)
      clear(o)
      setGlitching(false)
      return
    }
    const motes = new Particles()
    const r = rng(7)
    let raf = 0
    let last = clock()
    let shown = 0
    const t0 = clock()
    const frame = () => {
      const now = clock()
      const t = now - t0
      const dt = Math.min(0.1, now - last)
      last = now
      motes.update(dt)
      const fw = spriteFrame(sprite)?.width ?? 0
      if (!still && fw && r() < dt * 7) emitMote(motes, r, ax, ay, fw)
      // Ambient: about 20 frames a second is plenty, a burst's frames step every 0.12 s anyway.
      if (now - shown >= 0.045) {
        shown = now
        clear(a)
        drawAura(a, sprite, ax, ay, t, still)
        clear(o)
        motes.draw(o)
        const b = still ? null : burstAt(t, GLITCH_PERIOD, GLITCH_DUR, 7)
        const on = !!b && !!spriteFrame(sprite)
        setGlitching(on)
        if (b && on) drawDistorted(o, sprite, ax, ay, b, short)
      }
      raf = requestAnimationFrame(frame)
    }
    // The sprite on the canvas first (the page's own image is already there).
    let gone = false
    void loadSprite(...parseKey(sprite)).then(() => {
      if (gone) return
      if (still) {
        drawAura(a, sprite, ax, ay, 0, true)
        return
      }
      raf = requestAnimationFrame(frame)
    })
    return () => {
      gone = true
      cancelAnimationFrame(raf)
      setGlitching(false)
      clear(a)
      clear(o)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sprite, ax, ay, active, level])
}

/** A canvas sprite key back to what loadSprite takes. */
function parseKey(key: string): [number, boolean, boolean] {
  const m = /^(\d+)([bf])(s?)$/.exec(key)
  return m ? [Number(m[1]), m[2] === 'b', m[3] === 's'] : [0, false, false]
}

/**
 * The battle stage's distortion for a portal run's wild Pokémon: two stage-sized canvases (240 × 160 art pixels, like
 * the timelines'), `under` before the foe's sprite and `over` after it, so the aura sits behind it and the bursts on
 * top. `host` is the foe's sprite box (its image hides while a burst draws it).
 */
export function useStageDistortion(
  host: RefObject<HTMLElement | null>,
  sprite: string,
  at: { x: number; y: number },
  active: boolean,
) {
  const level = useDistortionLevel()
  const under = useRef<HTMLCanvasElement>(null)
  const over = useRef<HTMLCanvasElement>(null)
  useDistortion({ aura: under, over, host, sprite, at, active, level })
  return { under, over }
}

/**
 * A distorted Pokémon in a box (the encounter's preview, the kitchen sink): the page's animated sprite with the aura
 * under it and the bursts over it. `level` overrides the motion level (the kitchen sink shows each).
 */
export function GlitchSprite({
  dex,
  size,
  shiny = false,
  level: forced,
  className,
}: {
  dex: number
  size: number
  shiny?: boolean
  level?: MotionLevel
  className?: string
}) {
  const shown = useDistortionLevel()
  const level = forced ?? shown
  const host = useRef<HTMLDivElement>(null)
  const aura = useRef<HTMLCanvasElement>(null)
  const over = useRef<HTMLCanvasElement>(null)
  // The art's scale in the box, as SpriteImg places it: CSS pixels per canvas-sprite pixel.
  const s = stageSprite(dex, false, shiny)
  const sd = showdownView(dex, false, shiny)
  let per = size / 64 / Math.max(0.01, s.k)
  if (sd) {
    const [x0, y0, x1, y1] = artBox(sd.box)
    per = Math.min(size / 96, size / Math.max(x1 - x0 + 1, y1 - y0 + 1)) / s.k
  }
  const n = Math.max(16, Math.round(size / per))
  const fh = Math.round(s.artH * s.k)
  const key = spriteKey(dex, false, shiny)
  useDistortion({
    aura,
    over,
    host,
    sprite: key,
    at: { x: n / 2, y: Math.round(n / 2 + fh / 2) },
    active: true,
    level,
  })
  return (
    <div
      ref={host}
      className={cx('portal-glitch-host relative inline-block shrink-0', className)}
      style={{ width: size, height: size }}
    >
      <canvas
        ref={aura}
        width={n}
        height={n}
        aria-hidden
        className="pixelated pointer-events-none absolute inset-0 h-full w-full"
        style={{ imageRendering: 'pixelated' }}
      />
      <SpriteImg dex={dex} size={size} shiny={shiny} className="relative" />
      <canvas
        ref={over}
        width={n}
        height={n}
        aria-hidden
        className="pixelated pointer-events-none absolute inset-0 h-full w-full"
        style={{ imageRendering: 'pixelated' }}
      />
    </div>
  )
}

// ------------------------------------------------------------------ the UI's glitches

/** What may glitch: tagged pieces, and the page's panels, buttons, pictures, its header's title and the toasts. */
export const GLITCH_TARGETS =
  '[data-glitch], main .pixel-panel, main .pixel-btn, main [role=img], header h1, header [role=img], [aria-live] > *'

/**
 * Now and then (every `every` seconds, a random wait), one element of the page glitches for `dur` ms: torn sideways
 * and split into hard colour copies, the wild Pokémon's look (`.ui-glitch`; `short`: the copies only). Never inside a
 * pop-up (what the player is reading there stays put; the page behind it may glitch), never on what holds the focus,
 * never on something big or off screen, one at a time. Classes only: its words and accessible name stay as they are.
 */
export function useUiGlitch({
  enabled,
  short = false,
  root,
  selector = GLITCH_TARGETS,
  every = [5, 9],
  dur = 420,
}: {
  enabled: boolean
  short?: boolean
  /** Only inside this element (the kitchen sink's demo); else the whole page. */
  root?: RefObject<HTMLElement | null>
  selector?: string
  every?: readonly [number, number]
  dur?: number
}) {
  const [min, max] = every
  useEffect(() => {
    if (!enabled) return
    const cls = short ? 'ui-glitch-short' : 'ui-glitch'
    let timer = 0
    let current: Element | null = null
    const end = () => {
      current?.classList.remove(cls)
      current = null
    }
    const pick = (): Element | null => {
      const scope: ParentNode = root?.current ?? document
      const vw = window.innerWidth
      const vh = window.innerHeight
      const focus = document.activeElement
      const list = Array.from(scope.querySelectorAll(selector)).filter((el) => {
        if (el.closest('[role=dialog],[aria-modal]')) return false
        if (focus && focus !== document.body && el.contains(focus)) return false
        const r = el.getBoundingClientRect()
        if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw)
          return false
        return r.width * r.height <= vw * vh * 0.3
      })
      return list.length ? list[Math.floor(Math.random() * list.length)]! : null
    }
    const next = () => {
      timer = window.setTimeout(
        () => {
          const el = pick()
          if (el) {
            current = el
            el.classList.add(cls)
            timer = window.setTimeout(() => (end(), next()), dur)
          } else next()
        },
        (min + Math.random() * (max - min)) * 1000,
      )
    }
    next()
    return () => {
      clearTimeout(timer)
      end()
    }
  }, [enabled, short, root, selector, min, max, dur])
}

/** The SVG filters the UI's glitch tears with (once in the page). */
export function PortalFilters() {
  return (
    <svg width="0" height="0" aria-hidden className="absolute">
      <filter id="portal-warp-a" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="turbulence" baseFrequency="0.01 0.22" numOctaves="1" seed="3" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="9" xChannelSelector="R" yChannelSelector="G" />
      </filter>
      <filter id="portal-warp-b" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="turbulence" baseFrequency="0.02 0.35" numOctaves="1" seed="11" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="14" xChannelSelector="G" yChannelSelector="R" />
      </filter>
    </svg>
  )
}

// ------------------------------------------------------------------ the screen's distortion

/** CSS pixels per art pixel of the screen's distortion. */
const FX_PX = 3

/** The still frame: a dithered edge of the void, thickest at the corners, a few specks of its light. */
function edgeFrame(w: number, h: number): Canvas {
  const c = canvas(w, h)
  const img = c.g.createImageData(w, h)
  const d = img.data
  const deep = 9
  const cols = [
    [59, 20, 102],
    [107, 47, 196],
  ]
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const e = Math.min(x, y, w - 1 - x, h - 1 - y)
      if (e >= deep) continue
      const q = Math.pow(1 - e / deep, 1.6) * 0.62
      if (q <= bayer(x, y)) continue
      const [r, g, b] = cols[e < 2 ? 1 : 0]!
      const i = (y * w + x) * 4
      d[i] = r!
      d[i + 1] = g!
      d[i + 2] = b!
      d[i + 3] = 255
    }
  c.g.putImageData(img, 0, 0)
  const r = seeded(w * 5 + h)
  for (let i = 0; i < (w + h) / 6; i++) {
    const side = r.int(0, 3)
    const x = side === 0 ? r.int(0, 3) : side === 1 ? w - 1 - r.int(0, 3) : r.int(0, w)
    const y = side === 2 ? r.int(0, 3) : side === 3 ? h - 1 - r.int(0, 3) : r.int(0, h)
    rect(c.g, x, y, 1, 1, r() < 0.3 ? DW.pale : DW.lilac)
  }
  return c
}

/**
 * One frame (f of 4) of a tear across the screen: bands of broken scanlines in the void's lilac and teal, blocks of the
 * void displaced along them with red and lilac edges, a few stray pixel blocks. `short`: one thin band.
 */
function drawTear(g: G, w: number, h: number, n: number, f: number, short: boolean) {
  const r = seeded(n * 7 + f * 13)
  const bands = short ? 1 : r.int(2, 3)
  for (let i = 0; i < bands; i++) {
    const y = r.int(4, h - 8)
    const bh = short ? 2 : r.int(2, 5)
    const off = r.int(-4, 4)
    for (let yy = y; yy < y + bh; yy += 2) {
      let x = r.int(-20, 0)
      while (x < w) {
        const len = r.int(8, 40)
        if (r() < 0.6) rect(g, x + off, yy, len, 1, r() < 0.5 ? DW.lilac : DW.teal)
        x += len + r.int(4, 30)
      }
    }
    if (short) continue
    for (let k = 0; k < r.int(1, 3); k++) {
      const bx = r.int(0, w - 12)
      const bw = r.int(10, 36)
      const dx = r.int(-6, 6)
      rect(g, bx + dx, y, bw, bh, DW.deep)
      rect(g, bx + dx, y, bw, 1, DW.lilac)
      rect(g, bx + dx, y + bh - 1, bw, 1, DW.red)
      rect(g, bx, y - 1, bw, 1, DW.teal)
    }
  }
  if (short) return
  for (let k = 0; k < r.int(2, 5); k++) {
    const s = r.int(2, 6)
    const x = r.int(0, w - s)
    const y = r.int(0, h - s)
    rect(g, x, y, s, s, r() < 0.5 ? DW.violet : DW.deep)
    rect(g, x, y, s, 1, DW.pale)
  }
}

/**
 * The screen's recurring distortion while a run is under way (over the page, under the pop-ups, catching no tap): a
 * dithered edge of the void; every 6–10 s (`short`: 12–18 s) a tear of half a second, four frames of scanlines and
 * displaced blocks, the page's colours shifted to the void's violet for three of them (`short`: no shift); and now and
 * then one piece of the page glitches (useUiGlitch). Motion off: the edge alone, still (a calm OS keeps it all).
 */
export function DistortionFx() {
  const level = useDistortionLevel()
  const moving = level !== 'off'
  const short = level === 'short'
  const ref = useRef<HTMLCanvasElement>(null)
  const tint = useRef<HTMLDivElement>(null)
  useUiGlitch({ enabled: moving, short })
  useEffect(() => {
    const cv = ref.current
    const g = cv?.getContext('2d')
    if (!cv || !g) return
    let edge: Canvas | null = null
    let w = 0
    let h = 0
    const still = () => {
      g.clearRect(0, 0, w, h)
      if (edge) g.drawImage(edge, 0, 0)
    }
    const size = () => {
      w = Math.ceil(window.innerWidth / FX_PX)
      h = Math.ceil(window.innerHeight / FX_PX)
      cv.width = w
      cv.height = h
      cv.style.width = `${w * FX_PX}px`
      cv.style.height = `${h * FX_PX}px`
      g.imageSmoothingEnabled = false
      edge = edgeFrame(w, h)
      still()
    }
    size()
    window.addEventListener('resize', size)
    let timer = 0
    let raf = 0
    const r = rng((Date.now() & 0xffff) + 1)
    const setTint = (on: boolean) => tint.current && (tint.current.style.opacity = on ? '0.35' : '0')
    const burst = () => {
      const t0 = performance.now()
      const n = r.int(1, 1e6)
      const frame = (now: number) => {
        const p = (now - t0) / 450
        if (p >= 1) {
          still()
          setTint(false)
          schedule()
          return
        }
        const f = Math.floor(p * 4)
        still()
        drawTear(g, w, h, n, f, short)
        setTint(!short && f < 3)
        raf = requestAnimationFrame(frame)
      }
      raf = requestAnimationFrame(frame)
    }
    const schedule = () => {
      timer = window.setTimeout(burst, (short ? r.range(12, 18) : r.range(6, 10)) * 1000)
    }
    if (moving) schedule()
    return () => {
      window.removeEventListener('resize', size)
      clearTimeout(timer)
      cancelAnimationFrame(raf)
      setTint(false)
    }
  }, [moving, short])
  return (
    <>
      {/* Its own fixed layer, not inside the canvas's: a blend only reaches the page from the page's stacking level. */}
      <div ref={tint} aria-hidden className="portal-fx-tint" style={{ opacity: 0 }} />
      <div aria-hidden className="portal-fx">
        <PortalFilters />
        <canvas
          ref={ref}
          className="pixelated absolute left-0 top-0"
          style={{ imageRendering: 'pixelated' }}
        />
      </div>
    </>
  )
}

// ------------------------------------------------------------------ a portal closing

const closers = new Set<() => void>()

/** A boon was picked: the portal closes over the page (PortalCloseFx), or its sound alone where none is shown. */
export function playPortalClose() {
  if (!closers.size) fxSound('portal.close')
  closers.forEach((f) => f())
}

/**
 * A portal closing over the page, in the middle of the screen (it catches no tap): the collapse, the flash and the
 * seal ring (closeTimeline, its `portal.close` cue). Once per pick; motion off, the sound alone.
 */
export function PortalCloseFx() {
  const { level } = useMotion()
  const [n, setN] = useState(0)
  const [on, setOn] = useState(false)
  useEffect(() => {
    const f = () => {
      setN((x) => x + 1)
      setOn(true)
    }
    closers.add(f)
    return () => void closers.delete(f)
  }, [])
  // A new scene per pick; the level is read when it starts.
  const timeline = useMemo<Timeline<unknown> | null>(
    () => (n ? closeTimeline({ clear: true, short: level === 'short' }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [n],
  )
  if (!on || !timeline) return null
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[60] grid place-items-center">
      <StageCanvas
        key={n}
        timeline={timeline}
        onEnd={() => setOn(false)}
        label=""
        className="w-[min(86vw,480px)]"
      />
    </div>
  )
}
