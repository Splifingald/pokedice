// Distortion World's effects on the page (docs/28, docs/15 §27), hosting the pixel engine's portal scenes
// (src/fx/timelines/portal.ts, src/fx/glitch.ts): the portal looping on a canvas, the full-screen scenes' stage, the
// wild Pokémon's distortion (on its own animated sprite, the motes over it), the screen's tears, the UI's glitches
// (one element at a time, now and then), and a portal closing over the page. Every piece honours the motion level:
// They are the world's identity: a calm OS keeps them as in full, the player's short setting gives a lighter version,
// only motion `off` shows a still frame (or nothing) (distortionLevel).
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { fxSound } from '@/audio/sfx'
import { Particles, rect, rng, type G } from '@/fx/pixel'
import {
  DW,
  burstAt,
  burstCss,
  burstFrame,
  emitMote,
  GLITCH_DUR,
  GLITCH_PERIOD,
  restCss,
  seeded,
  tearPrimitives,
} from '@/fx/glitch'
import { loadSprite, spriteFrame, spriteKey, stageSprite } from '@/fx/sprites'
import { H, W, type Timeline } from '@/fx/timeline'
import {
  closeTimeline,
  distortionLevel,
  drawRocks,
  fullStage,
  makeRocks,
  portalLoop,
  voidBackdrop,
  type PortalLoop,
} from '@/fx/timelines/portal'
import { raidBattleStage, raidCardStage } from '@/fx/timelines/portalRaid'
import { createPortal } from 'react-dom'
import { useMotion, type MotionLevel } from '@/lib/motion'
import { cx } from '@/theme/util'
import { showdownView, SpriteImg } from './SpriteImg'
import { StageCanvas } from './StageCanvas'
import { artBox } from '@/lib/showdown'
import { useShowdownDown } from '@/lib/showdownReach'

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
export function useLoop(
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
export function useBoxSize(ref: RefObject<HTMLElement | null>) {
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

/** One clock for a distorted sprite's motes and bursts. */
const clock = () => performance.now() / 1000

/** A canvas sprite key back to what loadSprite takes. */
function parseKey(key: string): [number, boolean, boolean] {
  const m = /^(\d+)([bf])(s?)$/.exec(key)
  return m ? [Number(m[1]), m[2] === 'b', m[3] === 's'] : [0, false, false]
}

const SVG_NS = 'http://www.w3.org/2000/svg'
let tearIds = 0

/**
 * A distorted Pokémon (docs/15 §27), drawn on the page's own animated sprite (the `img` inside `host`) so that nothing
 * lags behind it (the user, 2026-10-15: the layer behind the sprite didn't move with it): a faint rim of its shape
 * (restCss) between bursts, and every 5 s a burst of about a third of a second whose torn bands (an SVG filter of its
 * own, tearPrimitives), colour copies and tint are CSS filters on that same image (burstCss); `host` gets
 * `data-glitching` meanwhile. Only the void's motes rising off it are drawn on `over`, feet at `at` in its art pixels.
 * `px`: CSS pixels per art pixel.
 */
function useDistortion({
  over,
  host,
  sprite,
  at,
  px,
  active,
  level,
}: {
  over: RefObject<HTMLCanvasElement | null>
  host: RefObject<HTMLElement | null>
  sprite: string
  at: { x: number; y: number } | null
  px: number
  active: boolean
  /** distortionLevel's: off is still (the rim alone), short has no tear. */
  level: MotionLevel
}) {
  const ax = at?.x ?? 0
  const ay = at?.y ?? 0
  useEffect(() => {
    const o = over.current?.getContext('2d')
    const el = host.current
    if (!o || !el || !at) return
    o.imageSmoothingEnabled = false
    const still = level === 'off'
    const short = level === 'short'
    const clear = () => o.clearRect(0, 0, o.canvas.width, o.canvas.height)
    const setGlitch = (css: string | null) => {
      el.toggleAttribute('data-glitching', !!css)
      if (css) el.style.setProperty('--glitch', css)
      else el.style.removeProperty('--glitch')
    }
    const reset = () => {
      setGlitch(null)
      el.style.removeProperty('--glitch-rest')
      clear()
    }
    if (!active) return reset()
    el.style.setProperty('--glitch-rest', restCss(px))
    if (still) return reset
    // Its canvas frame tells the motes how wide it is.
    void loadSprite(...parseKey(sprite))
    // The tear's own filter, rewritten for each frame of a burst.
    const svg = document.createElementNS(SVG_NS, 'svg')
    svg.setAttribute('width', '0')
    svg.setAttribute('height', '0')
    svg.setAttribute('aria-hidden', 'true')
    svg.style.position = 'absolute'
    const filter = document.createElementNS(SVG_NS, 'filter')
    const id = `portal-tear-${++tearIds}`
    filter.id = id
    filter.setAttribute('color-interpolation-filters', 'sRGB')
    svg.appendChild(filter)
    document.body.appendChild(svg)
    const motes = new Particles()
    const r = rng(7)
    let raf = 0
    let last = clock()
    let shown = 0
    let drawn = ''
    const t0 = clock()
    const frame = () => {
      const now = clock()
      const t = now - t0
      const dt = Math.min(0.1, now - last)
      last = now
      motes.update(dt)
      const fw = spriteFrame(sprite)?.width ?? 0
      if (fw && r() < dt * 4) emitMote(motes, r, ax, ay, fw)
      // Ambient: about 20 frames a second is plenty, a burst's frames step every ~0.09 s anyway.
      if (now - shown >= 0.045) {
        shown = now
        clear()
        motes.draw(o)
        const b = burstAt(t, GLITCH_PERIOD, GLITCH_DUR, 7)
        const f = b ? burstFrame(b, short) : null
        const tag = b && f ? `${b.n}:${f.f}` : ''
        if (tag !== drawn) {
          drawn = tag
          const img = el.querySelector('img')
          if (f && img) {
            const tear = f.bands.length > 0
            if (tear) filter.innerHTML = tearPrimitives(f.bands, img.offsetWidth, img.offsetHeight, px)
            setGlitch(burstCss(f, px, tear ? `url(#${id})` : null))
          } else setGlitch(null)
        }
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      svg.remove()
      reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sprite, ax, ay, px, active, level])
}

/**
 * The battle stage's distortion for a portal run's wild Pokémon: its look on the foe's own sprite (`host`, its box),
 * and a stage-sized canvas (240 × 160 art pixels, like the timelines') over it for the motes. `scale`: CSS pixels per
 * stage pixel.
 */
export function useStageDistortion(
  host: RefObject<HTMLElement | null>,
  sprite: string,
  at: { x: number; y: number },
  scale: number,
  active: boolean,
) {
  const level = useDistortionLevel()
  const over = useRef<HTMLCanvasElement>(null)
  useDistortion({ over, host, sprite, at, px: scale, active, level })
  return { over }
}

/**
 * A distorted Pokémon in a box (the encounter's preview, the kitchen sink): the page's animated sprite wearing the
 * look, the motes on a canvas over it. `level` overrides the motion level (the kitchen sink shows each).
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
  const over = useRef<HTMLCanvasElement>(null)
  // Showdown down (src/lib/showdownReach.ts): SpriteImg shows the local sprite, so the scale follows it.
  useShowdownDown()
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
    over,
    host,
    sprite: key,
    at: { x: n / 2, y: Math.round(n / 2 + fh / 2) },
    px: per,
    active: true,
    level,
  })
  return (
    <div
      ref={host}
      className={cx('portal-glitch-host relative inline-block shrink-0', className)}
      style={{ width: size, height: size }}
    >
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
  dur = 350,
  classes,
}: {
  enabled: boolean
  short?: boolean
  /** Only inside this element (the kitchen sink's demo); else the whole page. */
  root?: RefObject<HTMLElement | null>
  selector?: string
  every?: readonly [number, number]
  dur?: number
  /** The look it plays: the glitch's by default; the nightmare's shadow passing over (docs/30) brings its own. */
  classes?: { full: string; short: string }
}) {
  const [min, max] = every
  const full = classes?.full ?? 'ui-glitch'
  const shortCls = classes?.short ?? 'ui-glitch-short'
  useEffect(() => {
    if (!enabled) return
    const cls = short ? shortCls : full
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
  }, [enabled, short, root, selector, min, max, dur, full, shortCls])
}

/** The SVG filters the UI's glitch tears with (once in the page). */
export function PortalFilters() {
  return (
    <svg width="0" height="0" aria-hidden className="absolute">
      <filter id="portal-warp-a" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="turbulence" baseFrequency="0.01 0.22" numOctaves="1" seed="3" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="6" xChannelSelector="R" yChannelSelector="G" />
      </filter>
      <filter id="portal-warp-b" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="turbulence" baseFrequency="0.02 0.35" numOctaves="1" seed="11" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="9" xChannelSelector="G" yChannelSelector="R" />
      </filter>
    </svg>
  )
}

// ------------------------------------------------------------------ the screen's distortion

/** CSS pixels per art pixel of the screen's distortion. */
const FX_PX = 3

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
 * The screen's recurring distortion while a run is under way (over the page, under the pop-ups, catching no tap): every
 * 6–10 s (`short`: 12–18 s) a tear of half a second, four frames of scanlines and displaced blocks, the page's colours
 * shifted to the void's violet for three of them (`short`: no shift); and now and then one piece of the page glitches
 * (useUiGlitch). Nothing in between (no frame round the screen since 2026-10-15). Motion off: nothing (a calm OS keeps
 * it all).
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
    let w = 0
    let h = 0
    // Between tears the screen is left as it is: no frame round it (the user, 2026-10-15: "too much").
    const still = () => g.clearRect(0, 0, w, h)
    const size = () => {
      w = Math.ceil(window.innerWidth / FX_PX)
      h = Math.ceil(window.innerHeight / FX_PX)
      cv.width = w
      cv.height = h
      cv.style.width = `${w * FX_PX}px`
      cv.style.height = `${h * FX_PX}px`
      g.imageSmoothingEnabled = false
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

// ------------------------------------------------------------------ Giratina's area raid

/**
 * Giratina's raid stage (docs/15 §27): the Distortion World behind the raid's own sprites, 240 × 160 art pixels filling
 * its box (the battle's 3:2): the void, the portal turning far behind, rocks drifting, the islands they stand on.
 * `battle`: the fight's layout; `card`: the raid page's card (the portal right behind the raid Pokémon). Motion off:
 * one still frame.
 */
export function RaidStageArt({ kind, className }: { kind: 'battle' | 'card'; className?: string }) {
  const level = useDistortionLevel()
  const still = level === 'off'
  const ref = useRef<HTMLCanvasElement>(null)
  useLoop(ref, () => (kind === 'battle' ? raidBattleStage(still) : raidCardStage(still)), still, [kind])
  return (
    <canvas
      ref={ref}
      width={W}
      height={H}
      aria-hidden
      className={cx('pixelated absolute inset-0 h-full w-full', className)}
      style={{ imageRendering: 'pixelated' }}
    />
  )
}

/** CSS pixels per art pixel of the page's void. */
const GROUND_PX = 3

/**
 * The page's ground while Giratina's raid page or fight shows (docs/15 §27): the void's dithered violet night and its
 * far islands, rocks drifting upside-down (still with short animations or motion off), fixed behind the page; the
 * page's own ground (the world's colour) steps aside meanwhile (`html[data-dw-page]`, portal.css).
 */
export function DistortionGround() {
  const level = useDistortionLevel()
  const still = level !== 'full'
  const ref = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState(() =>
    typeof window === 'undefined'
      ? { w: 130, h: 280 }
      : { w: Math.ceil(window.innerWidth / GROUND_PX), h: Math.ceil(window.innerHeight / GROUND_PX) },
  )
  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-dw-page', '')
    const resize = () =>
      setSize({ w: Math.ceil(window.innerWidth / GROUND_PX), h: Math.ceil(window.innerHeight / GROUND_PX) })
    window.addEventListener('resize', resize)
    return () => {
      root.removeAttribute('data-dw-page')
      window.removeEventListener('resize', resize)
    }
  }, [])
  useLoop(
    ref,
    () => {
      const rocks = makeRocks(rng(size.w * 7 + size.h), size.w, size.h, Math.max(4, Math.round((size.w * size.h) / 4000)))
      return {
        step() {},
        draw(g, t) {
          g.drawImage(voidBackdrop(size.w, size.h), 0, 0)
          drawRocks(g, rocks, t * 0.6, size.w, still)
        },
      }
    },
    still,
    [size.w, size.h],
  )
  if (typeof document === 'undefined') return null
  return createPortal(
    <canvas
      ref={ref}
      width={size.w}
      height={size.h}
      aria-hidden
      className="dw-ground pixelated"
      style={{ width: size.w * GROUND_PX, height: size.h * GROUND_PX, imageRendering: 'pixelated' }}
    />,
    document.body,
  )
}

/**
 * A tear across the raid's stage when one of the raid Pokémon's bars breaks (`id` changes): four frames over 0.45 s of
 * broken scanlines and displaced blocks of the void, the stage shifted violet for three of them (not when calm: no
 * flashing). Short animations: one thin band; motion off: nothing.
 */
export function StageTear({ id }: { id: number | null }) {
  const level = useDistortionLevel()
  const { calm } = useMotion()
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const g = ref.current?.getContext('2d')
    if (!g || id == null || level === 'off') return
    g.imageSmoothingEnabled = false
    const short = level === 'short'
    // Timed from its first frame, so a busy page still shows all four.
    let t0 = -1
    let raf = 0
    const frame = (now: number) => {
      if (t0 < 0) t0 = now
      g.clearRect(0, 0, W, H)
      const p = (now - t0) / 450
      if (p >= 1) return
      const f = Math.floor(p * 4)
      // One violet shift over its first three frames, as the screen's tears: never a flicker.
      if (!short && !calm && f < 3) {
        g.globalAlpha = 0.25
        g.fillStyle = DW.violet
        g.fillRect(0, 0, W, H)
        g.globalAlpha = 1
      }
      drawTear(g, W, H, id * 31 + 5, f, short)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      g.clearRect(0, 0, W, H)
    }
  }, [id, level, calm])
  return (
    <canvas
      ref={ref}
      width={W}
      height={H}
      aria-hidden
      className="pixelated pointer-events-none absolute inset-0 z-[3] h-full w-full"
      style={{ imageRendering: 'pixelated' }}
    />
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
