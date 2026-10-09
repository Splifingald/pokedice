// Daybreak's pixel frames: every panel, dialogue box and button is a 14×14 pixel drawing used as a 9-slice
// `border-image`, so its corners are drawn, never rounded. Drawn once at startup at 2 × devicePixelRatio (crisp on any
// screen) and handed to CSS as `--fr-*` variables; src/styles/pixel.css applies them.
//
// The drawings leave their middle transparent: the element's own background-color fills it. That keeps a `bg-gold`
// (a selected tab) working on any frame, and gives contrast checkers a real background to measure text against.
import { PALETTE } from './colors'

/** Half a frame drawing, in art pixels: the 9-slice cut. The drawing is 2S + 2 wide. */
export const FRAME_SLICE = 6
/** CSS pixels per art pixel: the game's pixel scale. */
export const ART_PX = 2

export interface FrameSpec {
  /** Corner profile: how many pixels each row, from the corner, is cut in by. */
  prof: number[]
  out: string
  /** One row under the top edge. */
  hi?: string
  /** The bottom lip: `loRows` rows over the bottom edge. */
  lo?: string
  loRows?: number
  /** A second ring two pixels inside the outline (the dialogue box). */
  inner?: string
  /** Drawn under the shape, every other pixel when dithered. */
  shadow?: { dx: number; dy: number; color: string; dither?: boolean }
  /** A dotted outline: disabled. */
  dots?: boolean
}

const SHADOW = { dx: 0, dy: 2, color: '#24304f66', dither: true }

/** Translucent highlight and lip: they suit whatever background-color the element has. */
const HI = 'rgba(255,255,255,0.75)'
const LO = 'rgba(36,48,79,0.1)'
const LO_BTN = 'rgba(36,48,79,0.16)'

export const FRAME_SPECS = {
  panel: { prof: [3, 1, 1], out: PALETTE.ink, hi: HI, lo: LO, shadow: SHADOW },
  dialog: { prof: [3, 1, 1], out: PALETTE.ink, inner: '#cfe0f4', shadow: SHADOW },
  btn: { prof: [2, 1], out: PALETTE.ink, hi: HI, lo: LO_BTN, loRows: 2, shadow: SHADOW },
  primary: { prof: [2, 1], out: '#6e1d16', hi: '#ff9a85', lo: PALETTE.danger, loRows: 2, shadow: SHADOW },
  // The same action at a small size: white under 24px needs the deeper red to stay readable (5.3:1).
  deep: { prof: [2, 1], out: '#5a1610', hi: '#e8705c', lo: '#9e2a1f', loRows: 2, shadow: SHADOW },
  // Something new to open (a new region, an Egg to take): the one gold button on a screen.
  gold: { prof: [2, 1], out: '#6b4300', hi: '#fff0b8', lo: '#e08e00', loRows: 2, shadow: SHADOW },
  green: { prof: [2, 1], out: '#14502f', hi: '#a6f0c6', lo: '#1f9e5a', loRows: 2, shadow: SHADOW },
  dark: {
    prof: [3, 1, 1],
    out: '#121a33',
    hi: 'rgba(255,255,255,0.14)',
    lo: 'rgba(0,0,0,0.28)',
    shadow: SHADOW,
  },
  off: { prof: [2, 1], out: '#a9b5cc', dots: true },
} satisfies Record<string, FrameSpec>

export type FrameName = keyof typeof FRAME_SPECS

/**
 * One frame as a grid of colours (null = transparent), (2S + 2) square. `press`: the same shape without its shadow;
 * a pressed element moves down onto where the shadow was (pixel.css), so its background moves with it.
 */
export function frameArt(sp: FrameSpec, press = false): (string | null)[][] {
  const N = 2 * FRAME_SLICE + 2
  const sh = sp.shadow ?? { dx: 0, dy: 0, color: '' }
  const x0 = 0
  const y0 = 0
  const x1 = N - 1 - sh.dx
  const y1 = N - 1 - sh.dy
  const P = sp.prof
  const inside = (x: number, y: number) => {
    if (x < x0 || x > x1 || y < y0 || y > y1) return false
    const t = y - y0
    const b = y1 - y
    const l = x - x0
    const r = x1 - x
    if (t < P.length && (l < P[t]! || r < P[t]!)) return false
    if (b < P.length && (l < P[b]! || r < P[b]!)) return false
    return true
  }
  const edge = (x: number, y: number, d: number) =>
    !inside(x - d, y) || !inside(x + d, y) || !inside(x, y - d) || !inside(x, y + d)
  const grid: (string | null)[][] = []
  for (let y = 0; y < N; y++) {
    const row: (string | null)[] = []
    for (let x = 0; x < N; x++) {
      let c: string | null = null
      if (inside(x, y)) {
        if (edge(x, y, 1)) c = sp.dots && (x + y) % 2 ? null : sp.out
        else if (sp.inner && edge(x, y, 3) && !edge(x, y, 2)) c = sp.inner
        else if (sp.hi && !inside(x, y - 2)) c = sp.hi
        else if (sp.lo) for (let r = 1; r <= (sp.loRows ?? 1); r++) if (!inside(x, y + 1 + r)) c = sp.lo
      } else if (!press && sp.shadow && inside(x - sh.dx, y - sh.dy) && (!sh.dither || (x + y) % 2 === 0)) {
        c = sh.color
      }
      row.push(c)
    }
    grid.push(row)
  }
  return grid
}

/** Daybreak's ground: a pale sky with a dot every few pixels, as an 8×8 tile. */
export function textureArt(): string[][] {
  return Array.from({ length: 8 }, (_, y) =>
    Array.from({ length: 8 }, (_, x) => ((x + y) % 8 === 0 && x % 4 === 0 ? '#dde7f3' : PALETTE.parchment)),
  )
}

function toDataUrl(grid: (string | null)[][], k: number): string {
  const c = document.createElement('canvas')
  c.width = grid[0]!.length * k
  c.height = grid.length * k
  const g = c.getContext('2d')
  if (!g) return ''
  grid.forEach((row, y) =>
    row.forEach((col, x) => {
      if (!col) return
      g.fillStyle = col
      g.fillRect(x * k, y * k, k, k)
    }),
  )
  return c.toDataURL()
}

/** The CSS that hands every frame to the stylesheet, drawn `k` device pixels to an art pixel. */
export function frameCss(k: number): string {
  const vars = [`--fr-s:${FRAME_SLICE * k}`, `--tex:url(${toDataUrl(textureArt(), k)})`]
  for (const [name, spec] of Object.entries(FRAME_SPECS) as [FrameName, FrameSpec][]) {
    vars.push(`--fr-${name}:url(${toDataUrl(frameArt(spec), k)})`)
    if (spec.shadow) vars.push(`--fr-${name}-down:url(${toDataUrl(frameArt(spec, true), k)})`)
  }
  return `:root{${vars.join(';')}}`
}

/**
 * Puts the frames on the page, and redraws them when the pixel ratio changes (zoom, another screen), so their pixels
 * stay whole device pixels. Call once, before the first render.
 */
export function installFrames() {
  if (typeof document === 'undefined') return
  const style = document.createElement('style')
  style.id = 'pd-frames'
  document.head.appendChild(style)
  const draw = () => {
    const dpr = window.devicePixelRatio || 1
    style.textContent = frameCss(Math.max(1, Math.round(ART_PX * dpr)))
    // A media query that stops matching when the ratio changes: redraw then, and watch the new ratio.
    window.matchMedia?.(`(resolution: ${dpr}dppx)`).addEventListener?.('change', draw, { once: true })
  }
  draw()
}
