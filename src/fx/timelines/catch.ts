// The catch, in the battle scene: the worn-out foe on its platform, the throw, contact, the capture beam, the drop
// with two bounces, then the wobbles and "Gotcha!" or the break-free. Short motion (Settings → Animations: short):
// the throw and the drop, then the result at once — no wobbles to wait through.
import { fxSound } from '@/audio/sfx'
import { cached, canvas, clamp, ease, lerp, line, rect, ring, rng, softEllipse, span, type G } from '../pixel'
import { ball, type BallKind } from '../scenes'
import { drawSprite } from '../sprites'
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
import type { Point } from '../scenes'

export interface CatchParams extends Fighters {
  ball: BallKind
  caught: boolean
  short?: boolean
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
  const T_THROW = 0.8
  const T_HIT = 1.35
  const T_OPEN = 1.43
  const T_ABS = 1.55
  const T_CLOSE = 1.98
  const T_DROP = 2.05
  // Short: the result as soon as the ball has settled.
  const T_ROLL = p.short ? T_DROP + 0.6 : 2.75
  const WOB = p.short ? [] : caught ? [4.1, 4.95, 5.8] : [4.1, 4.95]
  const T_END = p.short ? T_DROP + 0.7 : caught ? 6.45 : 5.7
  const T_FLEE = T_END + 0.7
  const dur = T_END + (caught ? 1.55 : 2.2)

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
  const fleeX = (t: number) => 70 * ease.inQ(span(t, T_FLEE + 0.05, T_FLEE + 0.7))

  return {
    id: 'catch',
    dur,
    setup() {
      // The catch is always yours: you throw at the foe.
      const st = new Stage({ ...p, by: 'own' }, 71)
      st.stops.push([T_HIT, T_HIT + 0.08])
      return Object.assign(st, {
        CP: st.tgtAt(0.5, 0.45),
        ground: st.L.foe.y - 6,
        start: { x: -10, y: H + 6 },
        ctrl: { x: W * 0.36, y: 6 },
      })
    },
    step(s, t, dt) {
      if (!s.step(t, dt)) return
      const r = s.r
      const bp = ballPos(s, t)
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
      if (!caught && within(t, T_FLEE, T_FLEE + 0.7) && Math.floor(t * 60) % 3 === 0)
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
    draw(g, s, t) {
      s.begin(g, t)
      const bp = ballPos(s, t)
      // Foe: worn out, absorbed, or back out and fleeing.
      const back = !caught && t >= T_END + 0.15
      const fs = s.fs
      if (t < T_ABS) {
        s.drawTarget(g, t, {
          dy: 3,
          tint:
            t < T_OPEN
              ? { color: '#6b6480', a: 0.22 }
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
      } else if (back) {
        const k = ease.outBack(span(t, T_END + 0.15, T_END + 0.4), 2)
        const hop = t > T_FLEE ? -Math.round(Math.abs(Math.sin((t - T_FLEE) * 10)) * 4) : 0
        const alpha = 1 - span(t, T_FLEE + 0.4, T_FLEE + 0.75)
        if (alpha > 0)
          drawSprite(g, s.foe, s.L.foe.x + fleeX(t), s.L.foe.y + hop, {
            sx: k,
            sy: k,
            flash: 1 - span(t, T_END + 0.25, T_END + 0.6),
            alpha,
          })
      }
      s.under.draw(g)
      s.drawAttacker(g)
      // Dizzy stars while worn out.
      if (t < T_HIT) {
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
        WOB.filter((w) => t > w).length * 0.09 * (t < T_END + 0.2 ? 1 : 1 - span(t, T_END + 0.2, T_END + 0.6))
      if (v > 0) vignette(g, v)
      if (!caught && within(t, T_END + 0.15, T_END + 0.15 + 2 / 60)) screenFlash(g, '#ffffff', 0.55)
    },
    cues: () => {
      const c: Cue<S>[] = [
        [T_THROW, () => fxSound('catch.throw')],
        [T_OPEN, () => fxSound('catch.open')],
        [T_ABS, (hud) => hud.show?.('foe', false)],
        [T_CLOSE, () => fxSound('catch.close')],
        // The host rolls the catch die under the ball now; the wobbles keep the suspense.
        [T_ROLL, (hud) => hud.beat?.('roll')],
      ]
      for (const w of WOB)
        c.push([w, () => fxSound('catch.wobble')], [w + 0.4, () => fxSound('catch.settle')])
      if (caught) c.push([T_END, (hud) => (fxSound('catch.gotcha'), hud.catchResult?.(true))])
      else
        c.push(
          [T_END + 0.15, () => fxSound('catch.break')],
          [T_END + 0.2, (hud) => (hud.show?.('foe', true), hud.catchResult?.(false))],
          [T_FLEE + 0.45, (hud) => hud.show?.('foe', false)],
        )
      return c.sort((a, b) => a[0] - b[0])
    },
  }
}
