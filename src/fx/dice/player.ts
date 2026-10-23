// Plays the recorded dice throws on screen (docs/37). Loaded lazily with throws.json, the first time a die is thrown
// with the switch on. One requestAnimationFrame loop drives every die in the air; each draws on its own small canvas
// laid over the page, its art-pixel grid on the resting die's corner, and hands over to the resting die when it lands.
import { sfx } from '@/audio/sfx'
import {
  buildDieArt,
  clearBox,
  drawDie,
  emptyBox,
  type Box,
  type DieArt,
  type DieLook,
  type Frame,
} from './cube'
import {
  decodeThrows,
  newPose,
  planThrow,
  samplePlan,
  type Plan,
  type Pose,
  type ThrowFile,
  type ThrowLevel,
} from './solve'
import file from './throws.json'

const SET = decodeThrows(file as ThrowFile)

export interface ThrowRequest {
  /** The resting die's face, hidden while it flies: where it lands. */
  el: HTMLElement
  /** Its roll key: the same key always plays the same throw. */
  key: string
  /** The face it lands on: an index into `look.faces`. */
  face: number
  look: DieLook
  level: ThrowLevel
  /** When the die was asked to throw (performance.now()): the delay and the throw count from then. */
  startedAt: number
  /** Seconds before it's thrown (a tray's dice go one after another). */
  delay: number
  /** The battle's pace: every duration × pace. */
  pace: number
  /** Kitchen Sink: slow motion (¼). */
  speed?: number
  /** Kitchen Sink: hold the throw this many seconds in, instead of landing. */
  freeze?: number
  onLand: () => void
}

interface Flight {
  req: ThrowRequest
  plan: Plan
  art: DieArt
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  img: ImageData
  fb: Frame
  /** The resting die's corner in the canvas. */
  dx: number
  dy: number
  drawn: Box
  next: Box
  /** Where the canvas was put last (px), to move it only when the die moved. */
  left: number
  top: number
  rect: DOMRect | null
  /** Contacts already heard. */
  heard: number
}

const flights = new Set<Flight>()
/** Recordings in the air now: the dice of one roll each get their own. */
const taken = new Map<number, number>()
const pose: Pose = newPose()
let raf = 0
let lastLand = -Infinity

const even = (v: number) => Math.ceil(v / 2) * 2

// ---- Face art: drawn once per look --------------------------------------------------------------------------------

const arts = new Map<string, DieArt>()

let glyphCtx: CanvasRenderingContext2D | null = null
const glyphs = new Map<string, Uint8Array | null>()

/** A number in the pixel font, centred as Die.tsx centres it (line-height 1), cut to whole pixels. */
function glyph(text: string, px: number, size: number): Uint8Array | null {
  const id = `${text}|${px}|${size}`
  if (glyphs.has(id)) return glyphs.get(id)!
  glyphCtx ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  const g = glyphCtx
  if (!g) return null
  g.canvas.width = g.canvas.height = size
  g.clearRect(0, 0, size, size)
  g.font = `${px}px "Jersey 25", "Jersey 15", monospace`
  g.textAlign = 'center'
  g.textBaseline = 'alphabetic'
  const m = g.measureText(text)
  const asc = m.fontBoundingBoxAscent || px * 0.8
  const desc = m.fontBoundingBoxDescent || px * 0.2
  g.fillStyle = '#000'
  g.fillText(text, size / 2, size / 2 - (asc + desc) / 2 + asc)
  const d = g.getImageData(0, 0, size, size).data
  const mask = new Uint8Array(size * size)
  for (let i = 0; i < size * size; i++) mask[i] = d[i * 4 + 3]! > 110 ? 1 : 0
  // Before the font is in, the fallback's shape would be cached for good: keep it for this throw only.
  if (document.fonts?.check?.(`${px}px "Jersey 25"`) !== false) glyphs.set(id, mask)
  return mask
}

function artFor(look: DieLook): DieArt {
  const id = JSON.stringify(look)
  let art = arts.get(id)
  if (!art) {
    // A handful of looks are on screen at once; drop them all now and then rather than track which is old.
    if (arts.size > 48) arts.clear()
    art = buildDieArt(look, glyph)
    arts.set(id, art)
  }
  return art
}

// ---- The loop -----------------------------------------------------------------------------------------------------

function tick(now: number) {
  raf = 0
  // Read every die's place first, then draw: one layout pass a frame however many dice fly.
  for (const f of flights) f.rect = f.req.el.getBoundingClientRect()
  // A die that lands leaves the set mid-loop, which a Set allows.
  for (const f of flights) step(f, now)
  if (flights.size) raf = requestAnimationFrame(tick)
}

function step(f: Flight, now: number) {
  const { req, plan } = f
  const t = (now - req.startedAt) / 1000 - req.delay
  const tt = req.freeze ?? (t * (req.speed ?? 1)) / req.pace
  if (req.freeze == null && tt >= plan.duration) {
    land(f)
    return
  }
  const r = f.rect
  // Not laid out (a hidden tab, a closed panel): nothing to draw this frame.
  if (!r || !r.width) return
  const left = r.left - f.dx
  const top = r.top - f.dy
  if (left !== f.left || top !== f.top) {
    f.left = left
    f.top = top
    f.canvas.style.left = `${left}px`
    f.canvas.style.top = `${top}px`
  }
  clearBox(f.fb, f.drawn)
  emptyBox(f.next)
  if (tt >= 0) drawDie(f.fb, f.dx, f.dy, samplePlan(plan, tt, pose), f.art, plan.face, f.next)
  // Upload only what changed: last frame's die and this one's.
  const x0 = Math.max(0, Math.min(f.drawn.x0, f.next.x0)),
    y0 = Math.max(0, Math.min(f.drawn.y0, f.next.y0))
  const x1 = Math.min(f.fb.w, Math.max(f.drawn.x1, f.next.x1)),
    y1 = Math.min(f.fb.h, Math.max(f.drawn.y1, f.next.y1))
  if (x1 > x0 && y1 > y0) f.ctx.putImageData(f.img, 0, 0, x0, y0, x1 - x0, y1 - y0)
  const swap = f.drawn
  f.drawn = f.next
  f.next = swap
  // A click per bounce, never more than one every 40 ms across the tray, so a full tray rattles rather than buzzes.
  while (f.heard < plan.contacts.length && plan.contacts[f.heard]! <= tt) {
    f.heard++
    if (req.freeze == null && now - lastLand > 40) {
      lastLand = now
      sfx('land')
    }
  }
}

function release(f: Flight) {
  flights.delete(f)
  f.canvas.remove()
  const n = (taken.get(f.plan.index) ?? 1) - 1
  if (n > 0) taken.set(f.plan.index, n)
  else taken.delete(f.plan.index)
}

/** Down: the canvas goes and the resting die shows, in the same frame, so nothing blinks. */
function land(f: Flight) {
  release(f)
  f.req.onLand()
}

/**
 * Throws one die. Returns a cancel (the die went away, or was thrown again): the canvas goes, the die isn't told it
 * landed.
 */
export function throwDie(req: ThrowRequest): () => void {
  const plan = planThrow(SET, req.key, req.face, req.level, new Set(taken.keys()))
  taken.set(plan.index, (taken.get(plan.index) ?? 0) + 1)
  const S = req.look.size
  // The lane: a die to either side (it never strays into a neighbour's), three dice above to come in from, one below.
  const dx = even(S),
    dy = even(3 * S)
  const w = dx * 2 + S,
    h = dy + S + even(S)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.setAttribute('aria-hidden', 'true')
  // Over the page, under the top bar; inside a pop-up, over the pop-up.
  const inDialog = !!req.el.closest('[role="dialog"],[aria-modal="true"]')
  canvas.style.cssText =
    `position:fixed;left:0;top:0;width:${w}px;height:${h}px;pointer-events:none;` +
    `image-rendering:pixelated;z-index:${inDialog ? 100 : 35}`
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    req.onLand()
    return () => {}
  }
  const img = ctx.createImageData(w, h)
  const box = (): Box => ({ x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity })
  const f: Flight = {
    req,
    plan,
    art: artFor(req.look),
    canvas,
    ctx,
    img,
    fb: { buf: new Uint32Array(img.data.buffer), w, h },
    dx,
    dy,
    drawn: box(),
    next: box(),
    left: NaN,
    top: NaN,
    rect: null,
    heard: 0,
  }
  document.body.appendChild(canvas)
  flights.add(f)
  if (!raf) raf = requestAnimationFrame(tick)
  return () => {
    if (flights.has(f)) release(f)
  }
}

/** What a roll key would play, for the Kitchen Sink's debug line: the recording, its mirror, its raw top face. */
export function describeThrow(key: string, face: number, level: ThrowLevel) {
  const plan = planThrow(SET, key, face, level)
  return {
    index: plan.index,
    of: SET.throws.length,
    mirror: plan.mirror,
    raw: plan.rec?.up ?? null,
    seconds: plan.duration,
  }
}
