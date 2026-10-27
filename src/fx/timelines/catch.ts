// The catch, in the battle scene: the worn-out foe on its platform, the throw, contact, the capture beam, the drop
// with two bounces, then the wobbles and "Gotcha!" or the break-free. Short motion (Settings → Animations: short):
// the throw and the drop, then the result at once — no wobbles to wait through. How many wobbles is the engine's
// (`catchShakes`): three for a catch, fewer for a miss the further it fell short, so the third never tells.
//
// A throw that fell short with a Bait in the bag (docs/25) plays in two parts: `hold` stops with the ball lying still
// after its wobbles while the player is asked; then `from: 'ground'` takes over from that very frame — the Bait tossed
// beside the ball and a last wobble or two, or straight to the break-free when it's kept. `stays` (Capture Luck): it
// breaks free but stays on its platform, for one more throw.
import { fxSound, type FxSound } from '@/audio/sfx'
import { catchShakes, type CatchRoll } from '@/engine'
import { haptic } from '@/lib/haptics'
import { cached, canvas, clamp, ease, lerp, line, rect, ring, rng, softEllipse, span, type G } from '../pixel'
import { ball, type BallKind } from '../scenes'
import { drawSprite } from '../sprites'
import { drawFlee, fleeDim, fleeStep } from './trick'
import {
  H,
  quad,
  screenFlash,
  skippingNow,
  Stage,
  STEP,
  W,
  within,
  type Cue,
  type Fighters,
  type Timeline,
} from '../timeline'
import type { Point } from '../scenes'

export interface CatchParams extends Fighters {
  ball: BallKind
  caught: boolean
  short?: boolean
  /** Where it starts: the throw, or the ball already lying in front of the Pokémon (after a `hold`). */
  from?: 'throw' | 'ground'
  /** Stop with the ball lying still after its wobbles, the result still open (a Bait may follow). */
  hold?: boolean
  /** From the ground: a Bait tossed beside the ball first. */
  bait?: boolean
  /** It breaks free but stays on its platform instead of fleeing. */
  stays?: boolean
  /**
   * The throw as the engine rolled it: how many times the ball wobbles is the engine's (`catchShakes`), 0–3 after the
   * throw, 0–2 more after a Bait. Left out, a catch wobbles 3 times (2 after a Bait) and a miss 2 (1).
   */
  roll?: Pick<CatchRoll, 'total' | 'need' | 'caught' | 'bait'>
  /**
   * A throw that can't miss: the screen jumps straight to the end (StageOverlay `instant`), so the throw, beam and
   * wobble sounds stay quiet instead of all firing in the same frame; only the "Gotcha!" plays.
   */
  instant?: boolean
  /**
   * Where the Pokémon floats or stands (its feet), in place of the foe's platform, and the line the ball lands on:
   * Trick or Treat's ghost at the stage's centre (docs/29). With `own` left empty no Pokémon of yours is drawn.
   */
  at?: Point
  ground?: number
  /** Not worn out (Trick or Treat): no grey, no sag, no dizzy stars before the ball hits. */
  awake?: boolean
  /** A ghost (Trick or Treat): broken free and fleeing, it rises and dithers away into wisps (trick.ts). */
  ghost?: boolean
}

/** The Bait on the ground: a little berry with its leaf, outlined like the balls. */
function drawBait(g: G, x: number, y: number) {
  const X = Math.round(x)
  const Y = Math.round(y)
  rect(g, X - 3, Y - 4, 7, 5, '#24304f')
  rect(g, X - 2, Y - 5, 5, 7, '#24304f')
  rect(g, X - 2, Y - 4, 5, 5, '#e8506a')
  rect(g, X - 1, Y - 3, 1, 1, '#ffd0d8')
  rect(g, X, Y - 7, 1, 2, '#3f8f3a')
  rect(g, X + 1, Y - 7, 2, 1, '#6fcf5a')
}

/** A heart over the Bait as the Pokémon notices it (and over a Treat being eaten). */
export function drawHeart(g: G, x: number, y: number) {
  const X = Math.round(x)
  const Y = Math.round(y)
  rect(g, X - 2, Y, 2, 1, '#ff6b8a')
  rect(g, X + 1, Y, 2, 1, '#ff6b8a')
  rect(g, X - 2, Y + 1, 5, 1, '#ff6b8a')
  rect(g, X - 1, Y + 2, 3, 1, '#ff6b8a')
  rect(g, X, Y + 3, 1, 1, '#ff6b8a')
}

/** Darken toward the edges in four stepped bands: the vignette keeps the pixel grid. */
export function vignette(g: G, a: number) {
  const k = Math.round(a * 20)
  const c = cached(`vig|${k}`, () => {
    const v = canvas(W, H)
    const img = v.g.createImageData(W, H)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const d = Math.hypot((x - W / 2) / (W / 2), (y - H / 2) / (H / 2))
        const band = Math.floor(clamp((d - 0.8) / 0.5) * 3) / 3
        const i = (y * W + x) * 4
        img.data[i] = 11
        img.data[i + 1] = 8
        img.data[i + 2] = 20
        img.data[i + 3] = Math.round(band * (k / 20) * 1.6 * 255)
      }
    v.g.putImageData(img, 0, 0)
    return v
  })
  g.drawImage(c, 0, 0)
}

type S = Stage & { CP: Point; ground: number; start: Point; ctrl: Point }

export function catchTimeline(p: CatchParams): Timeline<S> {
  const kind = p.ball
  const caught = kind === 'master' || p.caught
  const sound = (name: FxSound) => {
    if (!p.instant) fxSound(name)
  }
  const T_THROW = 0.8
  const T_HIT = 1.35
  const T_OPEN = 1.43
  const T_ABS = 1.55
  const T_CLOSE = 1.98
  const T_DROP = 2.05
  // The ball lies still after its two bounces.
  const T_SETTLE = T_DROP + 0.6
  // Everything below runs on the whole catch's clock; a part that starts on the ground starts it at T_SETTLE.
  const ground = p.from === 'ground'
  const O = ground ? T_SETTLE : 0
  // The Bait: tossed, landing beside the ball, the heart over it.
  const B0 = O + 0.25
  const B1 = B0 + 0.55
  const BAIT = ground && !!p.bait
  // The wobbles: the engine's count (a miss used to stop at two, a catch at three, which gave it away).
  const shakes = p.roll ? catchShakes(p.roll) : null
  const throwWobbles = Math.max(0, Math.min(3, shakes?.throw ?? (caught && !p.hold ? 3 : 2)))
  // After a hold, the ball has already wobbled (none in short motion): the vignette carries on from there.
  const PRIOR = ground && !p.short ? throwWobbles : 0
  // Short: the result as soon as the ball has settled.
  const T_ROLL = p.short ? T_DROP + 0.6 : 2.75
  let WOB: number[]
  let T_END: number
  if (!ground) {
    WOB = p.short ? [] : [4.1, 4.95, 5.8].slice(0, throwWobbles)
    // A beat after the last wobble (none: after the ball has lain still a moment), a miss a little longer.
    const last = WOB.length ? WOB[WOB.length - 1]! : 2.9
    T_END = p.hold ? Infinity : p.short ? T_DROP + 0.7 : last + (caught ? 0.65 : 0.75)
  } else {
    const start = BAIT ? B1 + 0.45 : O + 0.25
    const n = Math.max(0, Math.min(2, shakes?.bait ?? (caught ? 2 : 1)))
    WOB = p.short || !BAIT ? [] : [start, start + 0.85].slice(0, n)
    T_END = WOB.length ? WOB[WOB.length - 1]! + 0.65 : start + 0.1
  }
  const T_FLEE = T_END + 0.7
  const ghostFlees = !!p.ghost && !caught && !p.stays
  // A hold ends once the last wobble has settled (in short motion, once the ball has).
  const T_HOLD = WOB.length ? WOB[WOB.length - 1]! + 0.6 : T_SETTLE + 0.1
  const dur = (p.hold ? T_HOLD : T_END + (caught ? 1.55 : p.stays ? 1.4 : 2.2)) - O

  const ballPos = (s: S, t: number): { x: number; y: number; a: number } | null => {
    if (t < T_THROW) return null
    if (t < T_HIT) {
      const q = span(t, T_THROW, T_HIT)
      return { ...quad(s.start, s.ctrl, s.CP, ease.outQ(q)), a: -q * 14 }
    }
    if (t < T_DROP)
      return {
        x: s.CP.x,
        y: s.CP.y - 2 * ease.outQ(span(t, T_OPEN, T_ABS)) + 2 * span(t, T_CLOSE, T_DROP),
        a: 0,
      }
    // Fall and two bounces.
    const tt = t - T_DROP
    const fall = 0.26
    const b1 = 0.22
    const b2 = 0.12
    let y: number
    if (tt < fall) y = lerp(s.CP.y, s.ground, ease.inQ(tt / fall))
    else if (tt < fall + b1) y = s.ground - 9 * Math.sin(Math.PI * ((tt - fall) / b1))
    else if (tt < fall + b1 + b2) y = s.ground - 3 * Math.sin(Math.PI * ((tt - fall - b1) / b2))
    else y = s.ground
    return { x: s.CP.x, y, a: 0 }
  }
  const wobble = (t: number) => {
    for (const w of WOB) {
      const q = span(t, w, w + 0.42)
      if (q > 0 && q < 1) return 0.55 * Math.sin(q * Math.PI * 2) * Math.pow(1 - q, 0.6) * (q < 0.5 ? 1 : 0.8)
    }
    return 0
  }
  const fleeX = (t: number) => (p.stays ? 0 : 70 * ease.inQ(span(t, T_FLEE + 0.05, T_FLEE + 0.7)))
  // Where the Bait is: thrown in an arc from your side, a bounce, then lying beside the ball. Eaten once the Pokémon is out.
  const baitPos = (s: S, t: number): Point | null => {
    if (!BAIT || t < B0 || (!caught && t >= T_END + 0.15)) return null
    const land = { x: s.CP.x - 15, y: s.ground + 6 }
    if (t < B1)
      return quad({ x: -8, y: H + 4 }, { x: W * 0.3, y: s.ground - 40 }, land, ease.outQ(span(t, B0, B1)))
    const hop = t < B1 + 0.18 ? Math.round(3 * Math.sin(Math.PI * span(t, B1, B1 + 0.18))) : 0
    return { x: land.x, y: land.y - hop }
  }
  // The foe's little hops once it has stayed (Capture Luck).
  const stayHop = (t: number) =>
    p.stays && within(t, T_END + 0.55, T_END + 1.05)
      ? -Math.round(Math.abs(Math.sin((t - T_END - 0.55) * 2 * Math.PI)) * 3)
      : 0

  return {
    id: 'catch',
    dur,
    setup() {
      // The catch is always yours: you throw at the foe.
      const st = new Stage({ ...p, by: 'own' }, 71)
      if (p.at) st.L = { ...st.L, foe: p.at }
      st.stops.push([T_HIT, T_HIT + 0.08])
      return Object.assign(st, {
        CP: st.tgtAt(0.5, 0.45),
        ground: p.ground ?? st.L.foe.y - 6,
        start: { x: -10, y: H + 6 },
        ctrl: { x: W * 0.36, y: 6 },
      })
    },
    step(s, t0, dt) {
      const t = t0 + O
      if (!s.step(t, dt)) return
      const r = s.r
      const bp = ballPos(s, t)
      // The Raid Ball (docs/44) flies in a trail of raid-pink and gold sparks.
      if (bp && kind === 'raid' && t >= T_THROW && t < T_HIT)
        for (let i = 0; i < 2; i++)
          s.fx.add({
            x: bp.x + r.range(-3, 3),
            y: bp.y + r.range(-3, 3),
            vx: r.range(-12, 12),
            vy: r.range(-12, 12),
            drag: 2,
            life: 0.35,
            size: 1,
            shape: i ? 'plus' : 'sq',
            colors: ['#fff6c2', '#ffd23f', '#ff5fae', '#e8336b'],
          })
      if (bp && within(t, T_ABS, T_CLOSE - 0.05)) {
        const k = 1 - span(t, T_ABS, T_CLOSE)
        const fs = s.fs
        for (let i = 0; i < 4; i++)
          s.fx.add({
            x: s.L.foe.x + r.range(-fs.w / 2, fs.w / 2) * k,
            y: s.L.foe.y - r.range(0, fs.h) * k,
            home: { x: bp.x, y: bp.y, k: 1600 },
            life: 0.4,
            size: 1,
            shape: 'streak',
            trail: 0.02,
            colors: ['#ffffff', '#ff9aa8', '#ff3b5c'],
          })
      }
      if (bp)
        for (const c of [T_DROP + 0.26, T_DROP + 0.48, T_DROP + 0.6])
          if (t >= c && t < c + STEP * 1.5)
            for (const d of [-1, 1])
              for (let i = 0; i < 3; i++)
                s.under.add({
                  x: bp.x + d * r.range(3, 6),
                  y: s.ground + 5,
                  vx: d * r.range(15, 35),
                  vy: -r.range(5, 18),
                  drag: 3,
                  life: 0.45,
                  size: 1,
                  size1: 3,
                  shape: 'smoke',
                  colors: ['#d9cdb4', '#b8ab92'],
                  density: 1,
                })
      if (bp && caught && t >= T_END && t < T_END + STEP * 1.5)
        for (let k = 0; k < 10; k++) {
          const a = r() * Math.PI * 2
          s.fx.add({
            x: bp.x,
            y: bp.y,
            vx: Math.cos(a) * 50,
            vy: Math.sin(a) * 40,
            drag: 3,
            life: 0.5,
            size: 1,
            shape: 'plus',
            colors: ['#ffffff', '#ffe066'],
          })
        }
      if (bp && !caught && t >= T_END + 0.15 && t < T_END + 0.15 + STEP * 1.5)
        for (let k = 0; k < 18; k++) {
          const a = r() * Math.PI * 2
          const sp = r.range(40, 110)
          s.fx.add({
            x: bp.x,
            y: bp.y,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp,
            drag: 3,
            life: 0.45,
            size: 1,
            shape: 'sq',
            colors: ['#ffffff', '#ff9aa8', '#ff3b5c'],
          })
        }
      if (ghostFlees) fleeStep(s, t, T_FLEE, p.short)
      else if (!caught && !p.stays && within(t, T_FLEE, T_FLEE + 0.7) && Math.floor(t * 60) % 3 === 0)
        s.under.add({
          x: s.L.foe.x + fleeX(t) - 8,
          y: s.L.foe.y,
          vx: -20,
          vy: -6,
          drag: 2,
          life: 0.4,
          size: 1,
          size1: 3,
          shape: 'smoke',
          colors: ['#d9cdb4', '#b8ab92'],
        })
    },
    draw(g, s, t0) {
      const t = t0 + O
      s.begin(g, t)
      const bp = ballPos(s, t)
      // Foe: worn out, absorbed, or back out and fleeing.
      const back = !caught && t >= T_END + 0.15
      const fs = s.fs
      if (t < T_ABS) {
        s.drawTarget(g, t, {
          dy: p.awake ? 0 : 3,
          tint:
            t < T_OPEN
              ? p.awake
                ? null
                : { color: '#6b6480', a: 0.22 }
              : { color: '#ff3b5c', a: span(t, T_OPEN, T_OPEN + 0.08) },
          flash: within(t, T_HIT, T_HIT + 0.07) ? 1 : 0,
        })
      } else if (t < T_CLOSE && bp) {
        const k = 1 - ease.inC(span(t, T_ABS, T_CLOSE - 0.04))
        if (k > 0.02) {
          const y = lerp(bp.y + fs.h * k * 0.5, s.L.foe.y + 3, k)
          drawSprite(g, s.foe, lerp(bp.x, s.L.foe.x, k), y, {
            sx: k,
            sy: k,
            sil: Math.floor(t * 30) % 2 ? '#ff3b5c' : '#ffffff',
          })
        }
      } else if (back && ghostFlees && t >= T_FLEE) {
        drawFlee(g, s, t, T_FLEE, p.short)
      } else if (back) {
        const k = ease.outBack(span(t, T_END + 0.15, T_END + 0.4), 2)
        const hop = p.stays
          ? stayHop(t)
          : t > T_FLEE
            ? -Math.round(Math.abs(Math.sin((t - T_FLEE) * 10)) * 4)
            : 0
        const alpha = p.stays ? 1 : 1 - span(t, T_FLEE + 0.4, T_FLEE + 0.75)
        if (alpha > 0)
          drawSprite(g, s.foe, s.L.foe.x + fleeX(t), s.L.foe.y + hop, {
            sx: k,
            sy: k,
            flash: 1 - span(t, T_END + 0.25, T_END + 0.6),
            alpha,
          })
      }
      s.under.draw(g)
      // The Bait, and the heart that says the Pokémon has seen it.
      const bt = baitPos(s, t)
      if (bt) {
        drawBait(g, bt.x, bt.y)
        const q = span(t, B1, B1 + 0.7)
        if (q > 0 && q < 1 && !(q > 0.7 && Math.floor(t * 20) % 2))
          drawHeart(g, bt.x, bt.y - 12 - Math.round(q * 6))
      }
      // Stayed: a "!" over its head.
      if (p.stays && back && within(t, T_END + 0.45, T_END + 1.3)) {
        const top = s.L.foe.y - fs.h - 6 + stayHop(t)
        rect(g, Math.round(s.L.foe.x) - 1, top - 6, 2, 5, '#ffe066')
        rect(g, Math.round(s.L.foe.x) - 1, top, 2, 2, '#ffe066')
      }
      if (p.own) s.drawAttacker(g)
      // Dizzy stars while worn out.
      if (t < T_HIT && !p.awake) {
        const top = s.L.foe.y - fs.h + 2
        for (let k = 0; k < 3; k++) {
          const a = t * 3.2 + (k * Math.PI * 2) / 3
          const x = Math.round(s.L.foe.x + Math.cos(a) * 11)
          const y = Math.round(top + Math.sin(a) * 3)
          rect(g, x - 1, y, 3, 1, '#ffe066')
          rect(g, x, y - 1, 1, 3, '#ffe066')
        }
      }
      // The ball.
      if (bp && !(back && t > T_END + 0.15)) {
        // Ghost trail while it flies.
        if (t < T_HIT)
          for (const lag of [0.05, 0.025]) {
            const q = ballPos(s, t - lag)
            if (q) rect(g, Math.round(q.x) - 1, Math.round(q.y) - 1, 2, 2, '#ffffff')
          }
        let open = 0
        if (within(t, T_OPEN, T_CLOSE)) open = ease.outBack(span(t, T_OPEN, T_OPEN + 0.08))
        if (within(t, T_CLOSE, T_CLOSE + 0.05)) open = 1 - span(t, T_CLOSE, T_CLOSE + 0.05)
        const wob = wobble(t)
        const rattling = !caught && within(t, T_END - 0.05, T_END + 0.15)
        const glowing = WOB.some((w) => within(t, w, w + 0.42)) || rattling
        const done = caught && t >= T_END
        const btn = done
          ? within(t, T_END, T_END + 0.12)
            ? '#ffffff'
            : '#7a7090'
          : glowing
            ? Math.floor(t * 20) % 2
              ? '#ff3b5c'
              : '#ff8a9a'
            : '#ffffff'
        const im = ball(kind, bp.a + wob, { open, button: btn, dim: done ? 1 : 0 })
        const rx = rattling ? (Math.floor(t * 60) % 2 ? 2 : -2) : Math.round(wob * 4)
        if (t > T_DROP) softEllipse(g, bp.x, s.ground + 6, 6, 2, '#00000066', 0.6)
        g.drawImage(im, Math.round(bp.x - im.width / 2 + rx), Math.round(bp.y - im.height / 2))
        if (open > 0.3) {
          // The capture beam: red lines from the ball's mouth to the silhouette, flickering.
          const rr = rng(Math.floor(t * 30))
          for (let k = 0; k < 4; k++) {
            const tx = s.L.foe.x + rr.range(-fs.w * 0.35, fs.w * 0.35)
            const ty = s.L.foe.y - rr.range(4, fs.h * 0.9)
            line(g, bp.x, bp.y - 3, tx, ty, k % 2 ? '#ff3b5c' : '#ffd0d8')
          }
        }
      }
      // Close flash ring.
      const cp = span(t, T_CLOSE, T_CLOSE + 0.18)
      if (cp > 0 && cp < 1) {
        const R = Math.round(3 + 10 * ease.outC(cp))
        g.drawImage(ring(R, 2, '#ffffff', 1 - cp), Math.round(s.CP.x - R - 1), Math.round(s.CP.y - R - 1))
      }
      // Burst: two halves flying apart.
      if (back && t < T_END + 0.9) {
        const q = t - (T_END + 0.15)
        const im = ball(kind, q * 8, {})
        const half = Math.floor(im.height / 2)
        const bx = s.CP.x
        const by = s.ground
        if (Math.floor(q * 20) % 2 || q < 0.4) {
          g.drawImage(
            im,
            0,
            0,
            im.width,
            half,
            Math.round(bx - im.width / 2 - 45 * q),
            Math.round(by - im.height / 2 - 90 * q + 200 * q * q),
            im.width,
            half,
          )
          g.drawImage(
            im,
            0,
            half,
            im.width,
            im.height - half,
            Math.round(bx - im.width / 2 + 40 * q),
            Math.round(by - 70 * q + 200 * q * q),
            im.width,
            im.height - half,
          )
        }
      }
      // Gotcha stars: a fan of three.
      if (bp && caught && t >= T_END) {
        const q = span(t, T_END, T_END + 0.5)
        if (q < 1 && !(q > 0.7 && Math.floor(t * 20) % 2))
          for (const a of [-2.1, -1.57, -1.05]) {
            const d = 16 * ease.outBack(q, 2)
            const x = Math.round(bp.x + Math.cos(a) * d)
            const y = Math.round(bp.y + Math.sin(a) * d)
            rect(g, x - 2, y, 5, 1, '#ffe066')
            rect(g, x, y - 2, 1, 5, '#ffe066')
            rect(g, x - 1, y - 1, 3, 3, '#ffe066')
            rect(g, x, y, 1, 1, '#ffffff')
          }
      }
      s.fx.draw(g)
      s.end(g)
      // Wobble tension: the edges darken a little more with each wobble.
      const v =
        (PRIOR + WOB.filter((w) => t > w).length) *
        0.09 *
        (t < T_END + 0.2 ? 1 : 1 - span(t, T_END + 0.2, T_END + 0.6))
      if (v > 0) vignette(g, v)
      if (ghostFlees) fleeDim(g, t, T_FLEE)
      if (!caught && within(t, T_END + 0.15, T_END + 0.15 + 2 / 60)) screenFlash(g, '#ffffff', 0.55)
    },
    cues: () => {
      const c: Cue<S>[] = ground
        ? []
        : [
            [T_THROW, () => sound('catch.throw')],
            [T_OPEN, () => sound('catch.open')],
            [T_ABS, (hud) => hud.show?.('foe', false)],
            [T_CLOSE, () => sound('catch.close')],
            // The host rolls the catch die under the ball now; the wobbles keep the suspense.
            [T_ROLL, (hud) => hud.beat?.('roll')],
          ]
      if (BAIT)
        c.push([B0, () => fxSound('catch.throw')], [B1, (hud) => (fxSound('catch.bait'), hud.beat?.('bait'))])
      // A buzz with each wobble (never all at once when skipped to the end), a longer one for the catch.
      for (const w of WOB)
        c.push(
          [w, () => (sound('catch.wobble'), !p.instant && !skippingNow() && haptic('wobble'))],
          [w + 0.4, () => sound('catch.settle')],
        )
      if (p.hold) c.push([T_HOLD - 0.05, (hud) => hud.beat?.('hold')])
      else if (caught)
        c.push([T_END, (hud) => (fxSound('catch.gotcha'), haptic('catch'), hud.catchResult?.(true))])
      else {
        c.push(
          [T_END + 0.15, () => fxSound('catch.break')],
          [T_END + 0.2, (hud) => (hud.show?.('foe', true), hud.catchResult?.(false))],
        )
        if (p.stays) c.push([T_END + 0.55, (hud) => (fxSound('catch.stay'), hud.beat?.('stays'))])
        else c.push([T_FLEE + 0.45, (hud) => hud.show?.('foe', false)])
      }
      // On the part's own clock.
      return c.map(([at, fn]) => [at - O, fn] as Cue<S>).sort((a, b) => a[0] - b[0])
    },
  }
}
