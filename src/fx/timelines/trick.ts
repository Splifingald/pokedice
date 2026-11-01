// Trick or Treat (docs/29) on the battle's stage, drawn with the game's pixel FX like every other scene: the ghost at the
// stage's centre, nobody of yours on it. The Trick Ball is the battle's own catch (catch.ts, `ball: 'trick'`, `ghost`);
// this module has the Treat and the ghost's flee, which the catch borrows.
//
// - The Treat: the ghost perks up (a stretch, a "!"-less hop: the anticipation), the Treat is tossed from your side in
//   a pixel arc, turning a quarter at a time, trailing gold twinkles; the ghost opens wide, catches it (a 4-frame
//   hit-stop, two warm silhouette frames), munches (three squash-and-stretch chomps, crumbs on the pumpkin ramp) and
//   hearts float up; then the gauge fills: a dithered glow behind it, a gold ring bursting out and "+" sparks rising
//   (the `fill` beat, when the screen fills its gauge).
// - The flee (too many Treats, or a miss into the flee zone): the ghost shivers, then rises in pixel steps while it
//   dithers away into purple wisps, and the area dims under it.
//
// Short motion: the toss, then the result at once (no chomps, no hearts; a flee is a short dither out). Animations
// off: the stage jumps to the end with every cue fired (StageCanvas). Calm: no screen flash (screenFlash).
import { fxSound } from '@/audio/sfx'
import { canvas, ease, glow, pattern, rect, ring, span, wash, type G } from '../pixel'
import type { Point } from '../scenes'
import { drawSprite, spriteFrame, type SpriteLook } from '../sprites'
import {
  H,
  quad,
  screenFlash,
  Stage,
  STEP,
  W,
  within,
  type Cue,
  type Fighters,
  type Timeline,
} from '../timeline'

/** The Treat's picture (30 × 30, the candy in its middle), loaded for the canvas by `loadItemSprite`. */
export const TREAT_URL = '/items/treat.png'
export const TREAT_KEY = `item|${TREAT_URL}`

const GOLD = ['#ffffff', '#ffe066', '#ffbe2e', '#ff8a3d']
const CRUMBS = ['#ffd9a8', '#ffa159', '#ff8425', '#c45a1a']
const HEARTS = ['#ffd0d8', '#ff9ab0', '#ff6b8a', '#e0436a']
const WISPS = ['#e8dcff', '#b8a0e8', '#8a6ad0', '#5b3a9e']

// ---------------------------------------------------------------- the flee, shared with the catch

/** How long the flee plays: the shiver, then the rise into wisps. */
export const FLEE_DUR = 1.15
const SHIVER = 0.25

/** The flee's particles: wisps peeling off the ghost as it rises. Call from the timeline's `step`, from `t0` on. */
export function fleeStep(s: Stage, t: number, t0: number, short = false) {
  const q = t - t0 - (short ? 0 : SHIVER)
  if (q < 0 || q > (short ? 0.35 : 0.8)) return
  const r = s.r
  const fs = s.fs
  const y = s.L.foe.y + fleeRise(t, t0, short)
  if (Math.floor(t * 60) % 2) return
  for (let i = 0; i < 3; i++)
    s.fx.add({
      x: s.L.foe.x + r.range(-fs.w * 0.45, fs.w * 0.45),
      y: y - r.range(0, fs.h),
      vx: r.range(-12, 12),
      vy: -r.range(18, 40),
      drag: 1.2,
      life: r.range(0.45, 0.8),
      size: r.int(1, 2),
      size1: 3,
      shape: 'smoke',
      colors: WISPS,
      density: 0.8,
    })
  s.fx.add({
    x: s.L.foe.x + r.range(-fs.w * 0.4, fs.w * 0.4),
    y: y - r.range(0, fs.h),
    vy: -r.range(30, 60),
    life: 0.5,
    shape: 'px',
    colors: ['#ffffff', '#e8dcff', '#b8a0e8'],
  })
}

/** How far up the ghost has risen (art pixels, negative), in whole-pixel steps. */
const fleeRise = (t: number, t0: number, short: boolean) =>
  -Math.round(
    (ease.inQ(span(t, t0 + (short ? 0 : SHIVER), t0 + (short ? 0.35 : FLEE_DUR - 0.15))) * 28) / 2,
  ) * 2

/** How much of the ghost is left (1 → 0), in dither steps. */
const fleeLeft = (t: number, t0: number, short: boolean) =>
  1 - span(t, t0 + (short ? 0 : SHIVER + 0.15), t0 + (short ? 0.35 : FLEE_DUR - 0.1))

const ditherScratch = { c: null as ReturnType<typeof canvas> | null }

/** A sprite drawn with only `left` (0..1) of its pixels, by ordered dither: a ghost fading the pixel-art way. */
function drawDithered(g: G, key: string, x: number, y: number, look: SpriteLook, left: number) {
  if (left >= 1) return drawSprite(g, key, x, y, look)
  if (left <= 0) return
  const c = (ditherScratch.c ??= canvas(W, H))
  c.g.clearRect(0, 0, W, H)
  drawSprite(c.g, key, x, y, look)
  c.g.globalCompositeOperation = 'destination-out'
  c.g.fillStyle = pattern(c.g, '#000000', Math.round((1 - left) * 16))
  c.g.fillRect(0, 0, W, H)
  c.g.globalCompositeOperation = 'source-over'
  g.drawImage(c, 0, 0)
}

/** The ghost fleeing at t (from `t0`): a shiver, then rising and dithering away. Draw between `begin` and `end`. */
export function drawFlee(g: G, s: Stage, t: number, t0: number, short = false) {
  const left = fleeLeft(t, t0, short)
  if (left <= 0) return
  // The shiver: one pixel left and right, every other frame.
  const dx = !short && t < t0 + SHIVER ? (Math.floor(t * 30) % 2 ? 1 : -1) : 0
  const look: SpriteLook = {
    tint: { color: '#8a6ad0', a: 0.35 * span(t, t0, t0 + 0.3) },
  }
  drawDithered(g, s.foe, s.L.foe.x + dx, s.L.foe.y + fleeRise(t, t0, short), look, left)
}

/** The area dims as the ghost leaves, in stepped washes; it stays dim (the night it vanished into). Draw after `end`. */
export function fleeDim(g: G, t: number, t0: number) {
  wash(g, '#0b0814', 0.32 * span(t, t0 + 0.1, t0 + 0.7), 4)
}

// ---------------------------------------------------------------- the Treat

export interface TreatParams extends Fighters {
  /** Where the ghost floats (its feet). */
  at: Point
  /** Too many Treats: it flees once it has eaten. */
  fled: boolean
  short?: boolean
  /** What is tossed, as `loadItemSprite` keys it: the Treat by default, the Safari's Bait (docs/61 §4). */
  treatKey?: string
  /** A wild Pokémon, not a ghost (the Safari): fleeing, it runs off the stage instead of fading into wisps. */
  runs?: boolean
}

/** How far a running Pokémon has gone (art pixels, to the right), in whole steps, with a hop every few frames. */
const runAway = (t: number, t0: number, short: boolean): { dx: number; dy: number } => {
  const q = span(t, t0 + (short ? 0 : SHIVER), t0 + (short ? 0.35 : FLEE_DUR - 0.1))
  const dx = Math.round((ease.inQ(q) * W * 0.75) / 4) * 4
  const dy = q > 0 && q < 1 ? -(Math.floor(t * 12) % 2) * 3 : 0
  return { dx, dy }
}

/** The dust it kicks up as it runs. Call from the timeline's `step`, from `t0` on. */
function runStep(s: Stage, t: number, t0: number, short: boolean) {
  const { dx } = runAway(t, t0, short)
  if (dx <= 0 || Math.floor(t * 60) % 3) return
  const r = s.r
  s.fx.add({
    x: s.L.foe.x + dx - s.fs.w * 0.3,
    y: s.L.foe.y - 1,
    vx: -r.range(10, 30),
    vy: -r.range(4, 14),
    drag: 2,
    life: 0.4,
    size: r.int(1, 2),
    size1: 3,
    shape: 'smoke',
    colors: ['#f2e6c8', '#d8c49a', '#b39b6e'],
    density: 0.7,
  })
}

/** A wild Pokémon running off (the Safari's flee): a shiver, then away to the right in hops. */
function drawRun(g: G, s: Stage, t: number, t0: number, short: boolean) {
  const shiver = !short && t < t0 + SHIVER ? (Math.floor(t * 30) % 2 ? 1 : -1) : 0
  const { dx, dy } = runAway(t, t0, short)
  if (dx > W) return
  drawSprite(g, s.foe, s.L.foe.x + dx + shiver, s.L.foe.y + dy, {})
}

type S = Stage & { MP: Point; start: Point; ctrl: Point }

export function treatTimeline(p: TreatParams): Timeline<S> {
  const short = !!p.short
  // The ghost perks up first (anticipation), then the toss.
  const T_TOSS = short ? 0.05 : 0.3
  const T_LAND = T_TOSS + 0.6
  const CHOMPS = short ? [] : [T_LAND + 0.1, T_LAND + 0.3, T_LAND + 0.5]
  const T_FILL = short ? T_LAND + 0.05 : T_LAND + 0.8
  const T_FLEE = short ? T_FILL : T_FILL + 0.55
  const dur = p.fled ? T_FLEE + (short ? 0.45 : FLEE_DUR + 0.2) : T_FILL + (short ? 0.25 : 0.75)

  const treatPos = (s: S, t: number): Point | null => {
    if (t < T_TOSS || t >= T_LAND) return null
    return quad(s.start, s.ctrl, s.MP, ease.outQ(span(t, T_TOSS, T_LAND)))
  }
  // The ghost's body: the perk-up, the wide mouth just before the catch, then the chomps (each: squash, stretch, rest).
  const body = (t: number): SpriteLook => {
    if (!short && t < T_TOSS) {
      const f = Math.floor(t * 30)
      return f >= 2 && f < 6 ? { sx: 0.94, sy: 1.08, dy: -2 } : {}
    }
    if (!short && within(t, T_LAND - 0.12, T_LAND)) return { sx: 0.95, sy: 1.1 }
    for (const c of CHOMPS) {
      const f = Math.floor((t - c) * 60)
      if (f >= 0 && f < 12) return f < 4 ? { sx: 1.14, sy: 0.86 } : f < 8 ? { sx: 0.92, sy: 1.1, dy: -2 } : {}
    }
    return {}
  }

  return {
    id: 'treat',
    dur,
    setup() {
      const st = new Stage({ ...p, by: 'own' }, 37)
      st.L = { ...st.L, foe: p.at }
      // The catch: a short hit-stop as the Treat lands.
      if (!short) st.stops.push([T_LAND, T_LAND + 4 * STEP])
      return Object.assign(st, {
        // The mouth, roughly: a little above the middle of the sprite.
        MP: st.tgtAt(0.5, 0.42),
        start: { x: -8, y: H + 4 },
        ctrl: { x: W * 0.3, y: 6 },
      })
    },
    step(s, t, dt) {
      if (!s.step(t, dt)) return
      const r = s.r
      const at = s.passed(t)
      // Twinkles behind the Treat as it flies.
      const tp = treatPos(s, t)
      if (tp && Math.floor(t * 60) % 3 === 0)
        s.under.add({
          x: tp.x + r.range(-3, 3),
          y: tp.y + r.range(-3, 3),
          vx: r.range(-8, 8),
          vy: r.range(-4, 10),
          life: 0.4,
          size: r.int(1, 2),
          size1: 0,
          shape: 'star',
          colors: GOLD,
        })
      // The catch: a pop of gold.
      if (at(T_LAND))
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2
          s.fx.add({
            x: s.MP.x,
            y: s.MP.y,
            vx: Math.cos(a) * 55,
            vy: Math.sin(a) * 45,
            drag: 4,
            life: 0.35,
            shape: 'plus',
            size: 1,
            colors: GOLD,
          })
        }
      // Crumbs at each chomp, and a heart now and then.
      for (const c of CHOMPS)
        if (at(c)) {
          for (let i = 0; i < 6; i++)
            s.fx.add({
              x: s.MP.x + r.range(-4, 4),
              y: s.MP.y + r.range(-1, 3),
              vx: r.range(-45, 45),
              vy: -r.range(25, 60),
              ay: 180,
              drag: 1.2,
              life: r.range(0.4, 0.6),
              size: r.int(1, 2),
              shape: 'sq',
              colors: CRUMBS,
            })
          s.fx.add({
            x: s.L.foe.x + r.range(-10, 10),
            y: s.L.foe.y - s.fs.h + 2,
            vx: r.range(-6, 6),
            vy: -22,
            life: 0.9,
            shape: 'heart',
            colors: HEARTS,
          })
        }
      // The gauge fills: "+" sparks rise around the ghost.
      if (!short && at(T_FILL))
        for (let i = 0; i < 10; i++)
          s.fx.add({
            x: s.L.foe.x + r.range(-s.fs.w * 0.6, s.fs.w * 0.6),
            y: s.L.foe.y - r.range(0, s.fs.h),
            vy: -r.range(20, 45),
            drag: 1,
            life: r.range(0.5, 0.8),
            delay: r.range(0, 0.15),
            shape: 'plus',
            size: r.int(1, 2),
            colors: GOLD,
          })
      if (p.fled) (p.runs ? runStep : fleeStep)(s, t, T_FLEE, short)
    },
    draw(g, s, t) {
      s.begin(g, t)
      const fs = s.fs
      const cx = s.L.foe.x
      const cy = s.L.foe.y - fs.h / 2
      // The gauge filling: a dithered warm glow behind the ghost, three steps up and down.
      const fq = span(t, T_FILL, T_FILL + 0.5)
      if (!short && fq > 0 && fq < 1) {
        const R = Math.round(fs.w * 0.5 + 6 + Math.round(Math.sin(fq * Math.PI) * 3) * 3)
        g.drawImage(glow(R, '#ffbe2e', 1.4, 0.75), Math.round(cx - R), Math.round(cy - R))
      }
      s.under.draw(g)
      // The ghost: perking up, catching, munching; or, too full, fleeing.
      if (!p.fled || t < T_FLEE) {
        const look = body(t)
        // Two warm silhouette frames as it catches the Treat.
        const f = Math.floor((t - T_LAND) * 60)
        const warm = !short && f >= 0 && (f < 2 || (f >= 4 && f < 6))
        s.drawTarget(g, t, warm ? { ...look, tint: { color: '#ffe066', a: 0.85 } } : look)
      } else if (p.runs) drawRun(g, s, t, T_FLEE, short)
      else drawFlee(g, s, t, T_FLEE, short)
      // The Treat in the air, a quarter turn at a time (pixel-exact), a short white trail behind it.
      const tp = treatPos(s, t)
      const art = spriteFrame(p.treatKey ?? TREAT_KEY)
      if (tp) {
        for (const lag of [0.05, 0.025]) {
          const q = treatPos(s, t - lag)
          if (q) rect(g, Math.round(q.x) - 1, Math.round(q.y) - 1, 2, 2, '#ffffff')
        }
        if (art) {
          g.save()
          g.translate(Math.round(tp.x), Math.round(tp.y))
          g.rotate((Math.floor(span(t, T_TOSS, T_LAND) * 4) * Math.PI) / 2)
          g.drawImage(art, -art.width / 2, -art.height / 2)
          g.restore()
        } else rect(g, Math.round(tp.x) - 4, Math.round(tp.y) - 4, 8, 8, '#ff8425')
      }
      // The gauge filling: a gold ring bursting out from the ghost.
      if (!short && fq > 0 && fq < 0.6) {
        const k = fq / 0.6
        const R = Math.round(8 + 30 * ease.outC(k))
        g.drawImage(ring(R, 2, '#ffe066', 1 - k), Math.round(cx - R - 1), Math.round(cy - R - 1))
      }
      s.fx.draw(g)
      s.end(g)
      // A ghost vanishes into the night; a wild Pokémon just runs off, the day stays bright.
      if (p.fled && !p.runs) fleeDim(g, t, T_FLEE)
      // A soft warm flash as the gauge fills (none when calm).
      if (!short && within(t, T_FILL, T_FILL + 2 * STEP)) screenFlash(g, '#ffe066', 0.25)
    },
    cues: () => {
      const c: Cue<S>[] = [
        [T_TOSS, () => fxSound('trick.toss')],
        [T_LAND, (hud) => (fxSound('trick.munch'), hud.beat?.('ate'))],
        [T_FILL, (hud) => (fxSound('trick.fill'), hud.beat?.('fill'))],
      ]
      if (p.fled)
        c.push([
          T_FLEE,
          (hud) => (fxSound(p.runs ? 'catch.break' : 'trick.flee'), hud.beat?.('fled'), hud.show?.('foe', false)),
        ])
      return c.sort((a, b) => a[0] - b[0])
    },
  }
}
