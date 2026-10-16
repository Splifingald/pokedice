// Darkrai's nightmare on the page (docs/30, docs/15 §29), hosting the pixel engine's scenes (src/fx/timelines/
// nightmare.ts, nightmareRaid.ts): the full moon on a loop, the screen's dream-like vignette with smoke curling at its
// edges and Darkrai's shadow passing over the page now and then, a piece of the page darkening as the shadow brushes it,
// the raid's night as the page's ground and its stage, and a shadow sweeping the stage when a raid bar breaks. Every
// piece honours the motion level (nightmareLevel): a calm OS or motion off shows a still frame (or nothing), the
// player's short setting a lighter version.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { rect, rng, bayer, cached, shade, type Canvas, type G } from '@/fx/pixel'
import { drawSprite, loadSprite, spriteFrame, spriteKey } from '@/fx/sprites'
import { H, W } from '@/fx/timeline'
import { drawStars, makeStars, moonLoop, nightmareLevel, nightSky, NM } from '@/fx/timelines/nightmare'
import { nightBattleStage, nightCardStage } from '@/fx/timelines/nightmareRaid'
import { useMotion, type MotionLevel } from '@/lib/motion'
import { cx } from '@/theme/util'
import { useBoxSize, useLoop, useUiGlitch } from './PortalFx'

/** Darkrai: the nightmare's shadow, and its prize. */
export const DARKRAI = 491

/** How the nightmare's lasting effects play here: full, short, or off (still: a calm OS too). */
export function useNightmareLevel(): MotionLevel {
  const { level, calm } = useMotion()
  return nightmareLevel(level, calm)
}

/** Darkrai's front sprite, loaded for its shadow: the key, ready or not (a shadow not loaded yet simply isn't drawn). */
function useDarkraiKey(shiny = false): string {
  useEffect(() => void loadSprite(DARKRAI, false, shiny), [shiny])
  return spriteKey(DARKRAI, false, shiny)
}

// ------------------------------------------------------------------ the moon

/**
 * The full moon filling its box (the rules' banner, the way in, the raid's page): the night, its stars twinkling, the
 * moon, the smoke banked below, Darkrai's shadow crossing the moon every 10 s. 2 CSS pixels per art pixel. `still`
 * holds one frame (motion off, a calm OS).
 */
export function MoonScene({ className, still }: { className?: string; still?: boolean }) {
  const level = useNightmareLevel()
  const hold = still ?? level === 'off'
  const box = useRef<HTMLDivElement>(null)
  const ref = useRef<HTMLCanvasElement>(null)
  const size = useBoxSize(box)
  const mon = useDarkraiKey()
  const w = size ? Math.max(16, Math.ceil(size.w / 2)) : 0
  const h = size ? Math.max(16, Math.ceil(size.h / 2)) : 0
  useLoop(ref, () => (w && h ? moonLoop(w, h, { still: hold, mon }) : null), hold, [w, h])
  return (
    <div ref={box} aria-hidden className={cx('absolute inset-0 overflow-hidden bg-[#03040c]', className)}>
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

// ------------------------------------------------------------------ the screen's vignette

/** CSS pixels per art pixel of the screen's vignette. */
const FX_PX = 3

/**
 * The dream's vignette: the night's black-blue thickening towards the edges, deepest in the top corners and lightest at
 * the bottom (where the action bar is), ordered-dithered. `deep` adds a little more (the vignette breathing). Cached.
 */
const vignette = (w: number, h: number, deep: boolean): Canvas =>
  cached(`nm-vignette|${w}|${h}|${deep}`, () =>
    shade(w, h, (x, y) => {
      const m = Math.min(w, h) * (deep ? 0.3 : 0.24)
      const d = Math.min(x / m, (w - 1 - x) / m, y / (m * 0.8), ((h - 1 - y) / m) * 1.8)
      const q = Math.pow(Math.max(0, 1 - d), 2.2) * 0.85
      if (bayer(x, y) >= q) return null
      return q > 0.55 ? NM.night : q > 0.3 ? NM.deep : NM.dark
    }),
  )

/** Smoke curling in from the left and right edges, a few art pixels deep, waving in steps. */
function edgeWisps(g: G, w: number, h: number, t: number) {
  const tt = Math.floor(t * 6) / 6
  for (let i = 0; i < 8; i++) {
    const left = i % 2 === 0
    const y0 = ((i + 0.5) / 8) * h
    for (let j = 0; j < 12; j++) {
      const q = j / 11
      const reach = (4 + 6 * Math.sin(tt * 0.9 + i * 1.7) ** 2) * (1 - q)
      const y = Math.round(y0 - q * 14 + Math.sin(tt * 1.4 + i + q * 4) * 3)
      const x = left ? 0 : w - Math.round(reach)
      rect(g, x, y, Math.max(1, Math.round(reach)), 2, q > 0.8 ? NM.smokeEdge : NM.smoke)
    }
  }
}

/**
 * The screen while the nightmare holds the player (over the page, under the pop-ups, catching no tap): the dream's
 * vignette breathing every 4 s, smoke curling at the edges, and every 12–18 s Darkrai's shadow passing over the page in
 * 1.4 s; now and then one piece of the page darkens as it brushes it (useUiGlitch with the shadow's look). `short`: no
 * breathing, the shadow every 25–35 s, the pieces' lighter look; motion off or a calm OS: the vignette alone, still.
 */
export function NightmareFx() {
  const level = useNightmareLevel()
  const moving = level !== 'off'
  const short = level === 'short'
  const ref = useRef<HTMLCanvasElement>(null)
  const mon = useDarkraiKey()
  useUiGlitch({
    enabled: moving,
    short,
    every: short ? [14, 22] : [8, 13],
    dur: short ? 300 : 500,
    classes: { full: 'ui-shadow', short: 'ui-shadow-short' },
  })
  useEffect(() => {
    const cv = ref.current
    const g = cv?.getContext('2d')
    if (!cv || !g) return
    let w = 0
    let h = 0
    const size = () => {
      w = Math.ceil(window.innerWidth / FX_PX)
      h = Math.ceil(window.innerHeight / FX_PX)
      cv.width = w
      cv.height = h
      cv.style.width = `${w * FX_PX}px`
      cv.style.height = `${h * FX_PX}px`
      g.imageSmoothingEnabled = false
    }
    size()
    window.addEventListener('resize', size)
    const r = rng((Date.now() & 0xffff) + 3)
    let raf = 0
    let shown = 0
    const t0 = performance.now()
    let nextPass = (short ? r.range(25, 35) : r.range(12, 18)) * 1000
    let pass: { at: number; y: number } | null = null
    const draw = (now: number) => {
      const t = (now - t0) / 1000
      g.clearRect(0, 0, w, h)
      g.drawImage(vignette(w, h, moving && !short && Math.floor(t / 2) % 2 === 1), 0, 0)
      if (!moving) return
      edgeWisps(g, w, h, short ? t * 0.5 : t)
      // Darkrai's shadow passing over the page: big, see-through, right to left, high up.
      if (!pass && now - t0 > nextPass) pass = { at: now, y: r.range(h * 0.25, h * 0.55) }
      if (pass) {
        const q = (now - pass.at) / 1400
        const f = spriteFrame(mon)
        if (q >= 1 || !f) {
          pass = null
          nextPass = now - t0 + (short ? r.range(25, 35) : r.range(12, 18)) * 1000
        } else {
          const k = Math.max(1, Math.round(Math.min(w, h) / f.height / 1.2))
          const x = Math.round(w + f.width * k - q * (w + f.width * k * 2))
          drawSprite(g, mon, x, Math.round(pass.y + f.height * k * 0.5), {
            sil: NM.smoke,
            sx: k,
            sy: k,
            alpha: 0.32,
          })
        }
      }
    }
    const frame = (now: number) => {
      // Ambient: about 15 frames a second is plenty for smoke and a passing shadow.
      if (now - shown > 66) {
        shown = now
        draw(now)
      }
      raf = requestAnimationFrame(frame)
    }
    draw(performance.now())
    if (moving) raf = requestAnimationFrame(frame)
    return () => {
      window.removeEventListener('resize', size)
      cancelAnimationFrame(raf)
    }
  }, [moving, short, mon])
  return (
    <div aria-hidden className="nm-fx">
      <canvas ref={ref} className="pixelated absolute left-0 top-0" style={{ imageRendering: 'pixelated' }} />
    </div>
  )
}

// ------------------------------------------------------------------ Darkrai's area raid

/**
 * The nightmare's stage (docs/15 §29), 240 × 160 art pixels filling its box (the battle's 3:2): the night, the full moon
 * behind the foe, smoke drifting up and rising off its rock, the rocks they stand on. `battle`: the fight's layout (the
 * nightmare's rounds, Darkrai's raid); `card`: the raid page's card. Motion off or a calm OS: one still frame.
 */
export function NightStageArt({ kind, className }: { kind: 'battle' | 'card'; className?: string }) {
  const level = useNightmareLevel()
  const still = level === 'off'
  const ref = useRef<HTMLCanvasElement>(null)
  useLoop(ref, () => (kind === 'battle' ? nightBattleStage(still) : nightCardStage(still)), still, [kind])
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

/** CSS pixels per art pixel of the page's night. */
const GROUND_PX = 3

/**
 * The page's ground while Darkrai's raid page or fight shows: the night sky and its stars twinkling, fixed behind the
 * page (still with short animations, a calm OS or motion off); the page's own ground (the world's colour) steps aside
 * meanwhile (`html[data-nm-page]`, nightmare.css).
 */
export function NightGround() {
  const level = useNightmareLevel()
  const still = level !== 'full'
  const ref = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState(() =>
    typeof window === 'undefined'
      ? { w: 130, h: 280 }
      : { w: Math.ceil(window.innerWidth / GROUND_PX), h: Math.ceil(window.innerHeight / GROUND_PX) },
  )
  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-nm-page', '')
    const resize = () =>
      setSize({ w: Math.ceil(window.innerWidth / GROUND_PX), h: Math.ceil(window.innerHeight / GROUND_PX) })
    window.addEventListener('resize', resize)
    return () => {
      root.removeAttribute('data-nm-page')
      window.removeEventListener('resize', resize)
    }
  }, [])
  useLoop(
    ref,
    () => {
      const stars = makeStars(rng(size.w * 5 + size.h), size.w, size.h)
      return {
        step() {},
        draw(g, t) {
          g.drawImage(nightSky(size.w, size.h), 0, 0)
          drawStars(g, stars, t, still)
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
      className="nm-ground pixelated"
      style={{ width: size.w * GROUND_PX, height: size.h * GROUND_PX, imageRendering: 'pixelated' }}
    />,
    document.body,
  )
}

/**
 * A shadow sweeping across the raid's stage when one of Darkrai's bars breaks (`id` changes): a dark wave rolling from
 * the right in four frames over 0.45 s, its edge lit lilac. Short animations: two frames, thinner; motion off or a calm
 * OS: nothing.
 */
export function StageShadow({ id }: { id: number | null }) {
  const level = useNightmareLevel()
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const g = ref.current?.getContext('2d')
    if (!g || id == null || level === 'off') return
    g.imageSmoothingEnabled = false
    const short = level === 'short'
    const frames = short ? 2 : 4
    let t0 = -1
    let raf = 0
    const frame = (now: number) => {
      if (t0 < 0) t0 = now
      g.clearRect(0, 0, W, H)
      const p = (now - t0) / (short ? 250 : 450)
      if (p >= 1) return
      const f = Math.floor(p * frames)
      const edge = Math.round(W - ((f + 1) / frames) * (W + 40))
      for (let y = 0; y < H; y++) {
        const wob = Math.round(Math.sin(y / 9 + f) * 6)
        const x0 = edge + wob
        for (let x = Math.max(0, x0); x < Math.min(W, x0 + 40); x++) {
          const q = 1 - (x - x0) / 40
          if (bayer(x, y) < q * (short ? 0.4 : 0.7)) rect(g, x, y, 1, 1, NM.smoke)
        }
        if (x0 >= 0 && x0 < W) rect(g, x0, y, 1, 1, NM.lilac)
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      g.clearRect(0, 0, W, H)
    }
  }, [id, level])
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

/**
 * A pop-up of Darkrai's raid coming out of the shadow as it opens: the shadow's look (`.ui-shadow`) once, on the panel,
 * then it stays put while it's read. Motion off or a calm OS: nothing; short: the lighter look.
 */
export function useShadowIn(open: boolean): string | undefined {
  const level = useNightmareLevel()
  const [on, setOn] = useState(false)
  useEffect(() => {
    if (!open || level === 'off') return
    setOn(true)
    const timer = setTimeout(() => setOn(false), 550)
    return () => clearTimeout(timer)
  }, [open, level])
  return on ? (level === 'short' ? 'ui-shadow-short' : 'ui-shadow') : undefined
}
