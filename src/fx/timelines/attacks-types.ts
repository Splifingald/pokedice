// The typed moves for every type attacks.ts doesn't draw itself: Tackle (Normal), a punch flurry and a big fist
// (Fighting), Gust and a wing slash (Flying), Sludge Bomb (Poison), a stomp and an eruption (Ground), Rock Slide
// (Rock), a swarm and X-Scissor (Bug), Shadow Ball (Ghost), Metal Claw (Steel), Ice Beam (Ice), a Dragon Breath
// spiral (Dragon), Dark Pulse and Crunch (Dark), Moonblast (Fairy). attacks.ts registers them in its TYPED map.
// Same rules as there: they speak of attacker and target, so the foe's move plays right to left, and `short` never
// reaches them (short motion is the generic hit).
import { fxSound } from '@/audio/sfx'
import {
  bayer,
  bolt,
  cached,
  disc,
  ease,
  ellipse,
  ellipseLine,
  glow,
  icon,
  lerp,
  line,
  px,
  ramp,
  rect,
  ring,
  rng,
  shade,
  softEllipse,
  span,
  wash,
  type Canvas,
  type G,
  type ParticleShape,
} from '@/fx/pixel'
import type { Point } from '@/fx/scenes'
import { dist, quad, screenFlash, Stage, within, type Timeline } from '@/fx/timeline'
import { attackCues, damagePop, statusTint, type AttackParams } from '@/fx/timelines/attacks'

// Colour ramps, bright to dark: a particle steps through one over its life, so each is that move's palette.
const NORMAL = ['#ffffff', '#fff6d8', '#e8dfb8', '#c8b88a', '#8a7c5a']
const FIGHT = ['#ffffff', '#ffd0a8', '#ff8a4a', '#d8402a', '#8a2018']
const FLY = ['#ffffff', '#e8f0ff', '#c4d0f8', '#9a8ce0', '#6a5cb0']
const POISON = ['#ffffff', '#f0b8f8', '#d070e0', '#a040b8', '#6a2080', '#3a1448']
const EARTH = ['#fff0c8', '#e8c878', '#c0a256', '#8a6a34', '#5a4020']
const ROCK = ['#e8dcb0', '#c8b070', '#9b892e', '#6a5a24', '#3a3018']
const BUG = ['#ffffff', '#e8f8a0', '#c0d840', '#8d9d16', '#56600c']
const GHOST = ['#ffffff', '#d8c0ff', '#a080e0', '#6a4aa0', '#3a2860', '#1a1030']
const STEEL = ['#ffffff', '#e8eef8', '#c4ccd8', '#9c9caf', '#6a6a80']
const SPARK = ['#ffffff', '#fff6a8', '#ffc040', '#e07020']
const ICE = ['#ffffff', '#e0fbff', '#b0f0f8', '#78d0e8', '#3a90c0']
const DRAGON = ['#ffffff', '#c0fff0', '#40e0c8', '#7a5af0', '#4a2ab0', '#24145a']
const DARK = ['#ffffff', '#c8b8c8', '#7a6070', '#4a3444', '#241820']
const FAIRY = ['#ffffff', '#fff0f8', '#ffc8e8', '#ff8ac8', '#e85aa8']
/** Dust and smoke puffs: a lit body and a shadow, never more (the smoke shape dithers itself out). */
const DUST = ['#d8c08a', '#b09868']

type St<X> = Stage & { prev: number } & X

/** A battle stage plus the time of the last step (for `edges`) and the timeline's own points. */
function stage<X extends object>(p: AttackParams, seed: number, make: (st: Stage) => X): St<X> {
  const st = new Stage(p, seed)
  return Object.assign(st, { prev: -1 }, make(st))
}

/**
 * One-off spawns: true on the first step at or past t0. It is checked before the hit-stop, so a burst spawned on
 * contact holds still through the stop (the impact frame), then flies.
 */
function edges(s: { prev: number }, t: number) {
  const p0 = s.prev
  s.prev = t
  return (t0: number) => p0 < t0 && t >= t0
}

interface Burst {
  n: number
  colors: readonly string[]
  speed?: readonly [number, number]
  life?: readonly [number, number]
  size?: readonly [number, number]
  size1?: number
  shapes?: readonly ParticleShape[]
  /** Angle range in radians; all around by default. */
  arc?: readonly [number, number]
  drag?: number
  ay?: number
  /** Extra speed along the attack (+x when you attack): debris carried on through the target. */
  push?: number
  /** Spawn spread around the point. */
  spread?: number
  core?: string
  /** Leaf-shaped particles' light and dark (feathers). */
  light?: string
  dark?: string
  /** Spin speed range for leaf-shaped particles. */
  spin?: number
}

/** A burst of particles from a point. */
function burst(s: Stage, at: Point, o: Burst) {
  const r = s.r
  for (let k = 0; k < o.n; k++) {
    const a = o.arc ? r.range(o.arc[0], o.arc[1]) : r() * Math.PI * 2
    const [v0, v1] = o.speed ?? [50, 120]
    const [l0, l1] = o.life ?? [0.25, 0.4]
    const [z0, z1] = o.size ?? [1, 2]
    const sd = o.spread ?? 0
    const sp = r.range(v0, v1)
    s.fx.add({
      x: at.x + r.range(-sd, sd),
      y: at.y + r.range(-sd, sd),
      vx: Math.cos(a) * sp + (o.push ?? 0) * s.dir,
      vy: Math.sin(a) * sp,
      drag: o.drag ?? 4,
      ay: o.ay ?? 0,
      life: r.range(l0, l1),
      size: r.int(z0, z1),
      ...(o.size1 != null ? { size1: o.size1 } : {}),
      shape: r.pick(o.shapes ?? ['sq']),
      colors: o.colors,
      ...(o.core ? { core: o.core } : {}),
      ...(o.light ? { light: o.light, dark: o.dark } : {}),
      ...(o.spin ? { angle: r() * 6, spin: r.range(-o.spin, o.spin) } : {}),
    })
  }
}

/** Dust puffs rolling out from a point on the ground. */
function dust(s: Stage, at: Point, n: number, spread: number) {
  const r = s.r
  for (let k = 0; k < n; k++)
    s.fx.add({
      x: at.x + r.range(-spread, spread),
      y: at.y - r.range(0, 3),
      vx: r.range(-30, 30),
      vy: -r.range(6, 20),
      drag: 2,
      life: r.range(0.6, 0.9),
      size: 2,
      size1: r.int(4, 6),
      shape: 'smoke',
      colors: DUST,
      density: 0.8,
    })
}

/** The classic impact star: four long arms, four short, in the type's colour with a white core. Turns every 3 frames. */
function impactStar(g: G, c: Point, R: number, t: number, cols: readonly string[]) {
  const turn = Math.floor(t * 20) % 2 ? Math.PI / 8 : 0
  for (const [w, col, k] of [
    [3, cols[cols.length - 2]!, 1],
    [1, cols[0]!, 0.8],
  ] as const)
    for (let i = 0; i < 8; i++) {
      const a = turn + (i * Math.PI) / 4
      const len = (i % 2 ? R * 0.5 : R) * k
      line(g, c.x, c.y, c.x + Math.cos(a) * len, c.y + Math.sin(a) * len, col, w)
    }
  disc(g, c.x, c.y, Math.max(1, Math.round(R / 5)), cols[1]!)
  px(g, Math.round(c.x), Math.round(c.y), cols[0]!)
}

/**
 * Parallel strokes (claws, a wing's edge, scissors) across a point: each drawn in along its length over `p`, one a
 * beat after the other, then dithered out over `q`. `ang` is for an attack going right; mirrored when it goes left.
 */
function strokes(
  g: G,
  c: Point,
  o: { ang: number; len: number; n: number; gap: number; dir: number; cols: readonly string[] },
  p: number,
  q: number,
) {
  const ux = Math.cos(o.ang) * o.dir
  const uy = Math.sin(o.ang)
  for (let j = 0; j < o.n; j++) {
    const off = (j - (o.n - 1) / 2) * o.gap
    const head = ease.outC(span(p, j * 0.15, j * 0.15 + 0.7))
    const steps = Math.ceil(o.len)
    for (let i = 0; i <= steps; i++) {
      const u = i / steps
      if (u > head) break
      const k = Math.sin(u * Math.PI)
      const x = Math.round(c.x + (u - 0.5) * o.len * ux - uy * off)
      const y = Math.round(c.y + (u - 0.5) * o.len * uy + ux * off)
      if (1 - q < bayer(x, y)) continue
      px(g, x, y, o.cols[0]!)
      if (k > 0.4) {
        px(g, x, y + 1, o.cols[1]!)
        px(g, x, y - 1, o.cols[1]!)
      }
      if (k > 0.75) px(g, x, y + 2, o.cols[2]!)
    }
  }
}

/** A beam between two points: its width ripples along its length, the ramp runs from the core out to its edge. */
function beam(
  g: G,
  a: Point,
  b: Point,
  from: number,
  to: number,
  t: number,
  cols: readonly string[],
  w0: number,
) {
  const len = dist(a, b)
  const ang = Math.atan2(b.y - a.y, b.x - a.x)
  const nx = -Math.sin(ang)
  const ny = Math.cos(ang)
  for (let s = Math.floor(from * len); s <= Math.ceil(to * len); s++) {
    const w = w0 + Math.sin(s * 0.5 - t * 40) * 0.7 + (s / len) * 0.8
    const cx = a.x + Math.cos(ang) * s
    const cy = a.y + Math.sin(ang) * s
    for (let o = -Math.ceil(w); o <= Math.ceil(w); o++) {
      const q = Math.abs(o) / w
      if (q > 1.05) continue
      px(g, Math.round(cx + nx * o), Math.round(cy + ny * o), ramp(cols, Math.min(0.99, q)))
    }
  }
}

/** A pointed shard rising from the ground at x: lit left face, shaded right, dark outline. h may grow over time. */
function spike(g: G, x: number, base: number, h: number, w: number, lean: number, cols: readonly string[]) {
  const H = Math.round(h)
  for (let yy = 0; yy <= H; yy++) {
    const k = yy / Math.max(1, H)
    const hw = (w / 2) * (1 - k)
    const cx = x + lean * k
    for (let xx = Math.floor(-hw); xx <= Math.ceil(hw); xx++) {
      const e = Math.abs(xx) > hw - 1 || yy === H
      const col = e ? cols[3]! : xx < -hw * 0.15 ? cols[0]! : xx < hw * 0.45 ? cols[1]! : cols[2]!
      px(g, Math.round(cx + xx), Math.round(base - yy), col)
    }
  }
}

/** A boulder as a pixel shader: a lumpy disc, outlined, lit from the top left, with a crack. */
function boulder(r: number, seed: number): Canvas {
  return cached(`boulder|${r}|${seed}`, () => {
    const c = r + 1
    return shade(2 * r + 3, 2 * r + 3, (x, y) => {
      const dx = x - c
      const dy = y - c
      const a = Math.atan2(dy, dx)
      const R = r * (1 + Math.sin(a * 3 + seed) * 0.1 + Math.sin(a * 7 + seed * 2) * 0.05)
      const d = Math.hypot(dx, dy) / R
      if (d > 1) return null
      if (d > 0.84) return '#3a3018'
      if (Math.abs(dx - dy * 0.5 - (seed % 3)) < 0.6 && dy > 0) return '#6a5a24'
      const l = (-dx * 0.6 - dy * 0.8) / R
      return l > 0.4 ? '#e8dcb0' : l > 0 ? '#c8b070' : l > -0.45 ? '#9b892e' : '#6a5a24'
    })
  })
}

// ---------------------------------------------------------------- Normal: Tackle
function normalAnim(p: AttackParams): Timeline<St<{ T: Point; D: Point }>> {
  const CROUCH = 0.35
  const DASH = 0.85
  const HIT = 1.05
  const T_STATUS = HIT + 0.55
  /** The attacker's offset (x toward the target): crouch back, dash in, hold through the stop, bounce home. */
  const body = (s: { D: Point }, t: number) => {
    if (t < DASH) return { x: -5 * ease.outQ(span(t, CROUCH, DASH)), y: 0 }
    if (t < HIT) {
      const q = ease.inQ(span(t, DASH, HIT))
      return { x: lerp(-5, s.D.x, q), y: s.D.y * q }
    }
    const q = ease.outQ(span(t, HIT + 0.08, HIT + 0.45))
    return { x: lerp(s.D.x, 0, q), y: lerp(s.D.y, 0, q) - 5 * Math.sin(Math.PI * q) }
  }
  return {
    id: 'normal',
    dur: 3.2,
    setup() {
      const st = stage(p, 81, (st) => ({
        T: st.tgtAt(0.5, 0.55),
        // Not all the way: the attacker meets the target's front, it doesn't pass through it.
        D: { x: (st.tgt.at.x - st.atk.at.x) * st.dir * 0.7, y: (st.tgt.at.y - st.atk.at.y) * 0.7 },
      }))
      st.hit(HIT, { stop: 0.08, shake: 4, dur: 0.6, tint: '#c8b88a', screen: 3 })
      return st
    },
    step(s, t, dt) {
      const at = edges(s, t)
      if (at(HIT)) {
        burst(s, s.T, { n: 14, colors: NORMAL, shapes: ['star', 'sq'], speed: [60, 140], push: 30 })
        dust(s, s.tgt.at, 4, s.tgt.size.w * 0.3)
      }
      if (!s.step(t, dt)) return
      const r = s.r
      const b = body(s, t)
      if (within(t, CROUCH, DASH) && Math.floor(t * 60) % 6 === 0) dust(s, s.atk.at, 1, 8)
      if (within(t, DASH, HIT))
        for (let k = 0; k < 2; k++) {
          // Speed lines left behind the dash.
          const a = s.atk
          s.fx.add({
            x: a.at.x + b.x * s.dir + r.range(-a.size.w * 0.4, a.size.w * 0.4),
            y: a.at.y + b.y - r.range(4, a.size.h * 0.8),
            vx: -160 * s.dir,
            vy: -b.y * 2,
            life: 0.12,
            size: 1,
            shape: 'streak',
            trail: 0.05,
            colors: ['#ffffff', '#e8dfb8'],
          })
        }
    },
    draw(g, s, t) {
      s.begin(g, t)
      const b = body(s, t)
      const crouch = within(t, CROUCH, DASH) ? ease.outQ(span(t, CROUCH, DASH)) : 0
      const knock = 6 * ease.outQ(span(t, HIT, HIT + 0.12)) * (1 - ease.ioS(span(t, HIT + 0.5, HIT + 0.9)))
      s.drawBoth(
        g,
        t,
        { dx: Math.round(knock), tint: statusTint(p, t, T_STATUS) },
        {
          dx: Math.round(b.x),
          dy: Math.round(b.y),
          sx: 1 + 0.06 * crouch,
          sy: 1 - 0.08 * crouch,
          ghost: within(t, DASH, HIT)
            ? [
                { dx: -7 * s.dir, color: '#ffffff', a: 0.45 },
                { dx: -14 * s.dir, color: '#e8dfb8', a: 0.25 },
              ]
            : undefined,
        },
      )
      const q = span(t, HIT, HIT + 0.32)
      if (q > 0 && q < 1) {
        impactStar(
          g,
          s.T,
          Math.round(8 + 10 * ease.outBack(Math.min(1, q * 2.5))) * (q > 0.7 ? 0.6 : 1),
          t,
          NORMAL,
        )
        const R = Math.round(6 + 24 * ease.outC(q))
        g.drawImage(ring(R, 2, '#fff6d8', 1 - q), Math.round(s.T.x - R - 1), Math.round(s.T.y - R - 1))
      }
      s.fx.draw(g)
      damagePop(g, s, p, s.T.x, t, HIT + 0.04)
      s.end(g)
      if (within(t, HIT, HIT + 2 / 60)) screenFlash(g, '#fff6d8', 0.4)
    },
    cues: () =>
      attackCues(HIT, p.status ? T_STATUS : null, [
        [CROUCH, () => fxSound('impact.windup')],
        [HIT, () => fxSound('impact.hit')],
      ]),
  }
}

// ---------------------------------------------------------------- Fighting: a punch flurry, then a big fist
/** A gloved fist seen knuckles-on: four fingers over a thumb. */
const FIST = [
  '.kk.kk.kk.kk.',
  'kWWkWWkWWkWwk',
  'kWwkWwkWwkWwk',
  'kwwkwwkwwkwwk',
  'kwdkwdkwdkwdk',
  'kkkkkkkkkkkkk',
  'kWWWWWWwwwwdk',
  'kwwwwwwwwwddk',
  '.kddddddddddk',
  '..kkkkkkkkkk.',
]
const FIST_PAL = { k: '#3a1018', W: '#ffb8a0', w: '#e84a3a', d: '#a02018' }

function fightingAnim(p: AttackParams): Timeline<St<{ T: Point; F: Point; J: Point[] }>> {
  const JABS = [0.95, 1.1, 1.25, 1.4] as const
  const RAISE = 1.55
  const BIG = 1.9
  const T_STATUS = BIG + 0.5
  /** The big fist: appears up and back from the target, draws back (shaking), then drives in. */
  const bigAt = (s: { T: Point; dir: number }, t: number): Point => {
    const from = { x: s.T.x - 30 * s.dir, y: s.T.y - 18 }
    if (t < BIG - 0.08) {
      const back = ease.outQ(span(t, RAISE, BIG - 0.08)) * 6
      const shiver = Math.floor(t * 30) % 2
      return { x: from.x - back * s.dir + shiver, y: from.y - back * 0.6 }
    }
    const q = ease.inQ(span(t, BIG - 0.08, BIG))
    return { x: lerp(from.x - 6 * s.dir, s.T.x, q), y: lerp(from.y - 3.6, s.T.y, q) }
  }
  return {
    id: 'fighting',
    dur: 3.6,
    setup() {
      const st = stage(p, 93, (st) => {
        const T = st.tgtAt(0.5, 0.5)
        const r = st.r
        return {
          T,
          F: st.atkAt(0.82, 0.5),
          J: JABS.map(() => ({ x: T.x + r.range(-12, 12), y: T.y + r.range(-12, 8) })),
        }
      })
      JABS.forEach((t0, i) =>
        st.hit(t0, { stop: i ? 0.05 : 0.06, shake: 2, dur: 0.14, tint: '#d8402a', screen: i ? 0 : 1 }),
      )
      st.hit(BIG, { stop: 0.08, shake: 4, dur: 0.7, tint: '#d8402a', screen: 3 })
      return st
    },
    step(s, t, dt) {
      const at = edges(s, t)
      JABS.forEach((t0, i) => {
        if (at(t0)) burst(s, s.J[i]!, { n: 6, colors: FIGHT, shapes: ['sq', 'px'], speed: [40, 100] })
      })
      if (at(BIG)) {
        burst(s, s.T, {
          n: 18,
          colors: FIGHT,
          shapes: ['star', 'sq'],
          speed: [70, 160],
          push: 40,
          core: '#fff6d8',
        })
        dust(s, s.tgt.at, 3, s.tgt.size.w * 0.3)
      }
      if (!s.step(t, dt)) return
      const r = s.r
      // The wind-up: heat gathers in the fist.
      if (within(t, 0.35, 0.9) && Math.floor(t * 60) % 2 === 0) {
        const a = r() * Math.PI * 2
        s.fx.add({
          x: s.F.x + Math.cos(a) * 12,
          y: s.F.y + Math.sin(a) * 10,
          home: { x: s.F.x, y: s.F.y, k: 700 },
          life: 0.4,
          shape: 'px',
          colors: FIGHT.slice(1, 4),
        })
      }
    },
    draw(g, s, t) {
      s.begin(g, t)
      const pull = within(t, 0.35, 0.9) ? -4 * ease.outQ(span(t, 0.35, 0.9)) : 0
      // Jabbing: the attacker rocks forward on each punch.
      const jab = JABS.some((t0) => within(t, t0 - 0.04, t0 + 0.06)) ? 4 : within(t, 0.9, 1.5) ? 1 : 0
      const lunge = 6 * Math.sin(Math.PI * span(t, BIG - 0.1, BIG + 0.25))
      const knock = JABS.some((t0) => within(t, t0, t0 + 0.08)) ? 2 : 0
      const big = 7 * ease.outQ(span(t, BIG, BIG + 0.12)) * (1 - ease.ioS(span(t, BIG + 0.5, BIG + 0.9)))
      s.drawBoth(
        g,
        t,
        { dx: Math.round(knock + big), tint: statusTint(p, t, T_STATUS) },
        {
          dx: Math.round(pull + jab + lunge),
          outline: within(t, 0.35, 0.95) && Math.floor(t * 15) % 2 ? '#ff8a4a' : undefined,
        },
      )
      if (within(t, 0.35, 0.95)) {
        const R = Math.round(2 + 5 * ease.outQ(span(t, 0.35, 0.8)))
        g.drawImage(glow(R, '#ff8a4a', 1.2), Math.round(s.F.x - R), Math.round(s.F.y - R))
      }
      JABS.forEach((t0, i) => {
        if (!within(t, t0 - 0.05, t0 + 0.12)) return
        const J = s.J[i]!
        // Motion lines from where the punch came, then the fist itself on the target.
        for (let k = -1; k <= 1; k++)
          line(g, J.x - 14 * s.dir, J.y + k * 3, J.x - 6 * s.dir, J.y + k * 3, '#ffd0a8')
        g.drawImage(icon(FIST, FIST_PAL), Math.round(J.x - 6), Math.round(J.y - 5))
        if (t >= t0) impactStar(g, J, 6, t, FIGHT)
      })
      if (within(t, RAISE, BIG + 0.14)) {
        const B = bigAt(s, t)
        if (t < BIG) {
          const R = 7 + (Math.floor(t * 20) % 2)
          g.drawImage(glow(R + 6, '#ff8a4a', 1.3, 0.8), Math.round(B.x - R - 6), Math.round(B.y - R - 6))
        }
        if (within(t, BIG - 0.08, BIG))
          for (let k = -1; k <= 1; k++)
            line(g, B.x - 26 * s.dir, B.y - 8 + k * 6, B.x - 12 * s.dir, B.y - 4 + k * 6, '#ffd0a8')
        g.drawImage(icon(FIST, FIST_PAL, 2), Math.round(B.x - 13), Math.round(B.y - 10))
      }
      const q = span(t, BIG, BIG + 0.35)
      if (q > 0 && q < 1) {
        impactStar(g, s.T, Math.round(18 * ease.outBack(Math.min(1, q * 3))), t, FIGHT)
        const R = Math.round(8 + 26 * ease.outC(q))
        g.drawImage(ring(R, 3, '#ff8a4a', 1 - q), Math.round(s.T.x - R - 1), Math.round(s.T.y - R - 1))
      }
      s.fx.draw(g)
      damagePop(g, s, p, s.T.x, t, BIG + 0.04)
      s.end(g)
      if (within(t, BIG, BIG + 2 / 60)) screenFlash(g, '#ffe8d8', 0.45)
    },
    cues: () =>
      attackCues(BIG, p.status ? T_STATUS : null, [
        [0.35, () => fxSound('impact.windup')],
        ...JABS.map((t0) => [t0, () => fxSound('starter.land')] as const),
        [RAISE, () => fxSound('fire.inhale')],
        [BIG, () => fxSound('impact.hit')],
      ]),
  }
}

// ---------------------------------------------------------------- Flying: Gust, then a wing slash from above
function flyingAnim(p: AttackParams): Timeline<St<{ G0: Point; T: Point }>> {
  const GUSTS = [0.85, 1.0, 1.15] as const
  const FLIGHT = 0.36
  const SLASH = 1.75
  const T_STATUS = SLASH + 0.45
  return {
    id: 'flying',
    dur: 3.6,
    setup() {
      const st = stage(p, 105, (st) => ({ G0: st.atkAt(0.85, 0.4), T: st.tgtAt(0.5, 0.5) }))
      GUSTS.forEach((t0) =>
        st.hit(t0 + FLIGHT, { stop: 0, shake: 1, dur: 0.2, tint: '#c4d0f8', flash: false }),
      )
      st.hit(SLASH, { stop: 0.08, shake: 3, dur: 0.6, tint: '#9a8ce0', screen: 2 })
      return st
    },
    step(s, t, dt) {
      const at = edges(s, t)
      if (at(SLASH))
        burst(s, s.T, {
          n: 10,
          colors: ['#e8f0ff'],
          shapes: ['leaf'],
          speed: [30, 80],
          life: [0.9, 1.4],
          drag: 2,
          ay: 30,
          push: 20,
          light: '#ffffff',
          dark: '#9a8ce0',
          spin: 6,
        })
      if (!s.step(t, dt)) return
      const r = s.r
      // Feathers shed while it beats its wings.
      if (within(t, 0.3, 0.85) && Math.floor(t * 60) % 8 === 0)
        s.fx.add({
          x: s.atk.at.x + r.range(-s.atk.size.w * 0.4, s.atk.size.w * 0.4),
          y: s.atk.at.y - s.atk.size.h * r.range(0.3, 0.8),
          vx: r.range(-15, 15),
          vy: r.range(-10, 10),
          ay: 25,
          life: 0.9,
          shape: 'leaf',
          angle: r() * 6,
          spin: r.range(-5, 5),
          colors: ['#e8f0ff'],
          light: '#ffffff',
          dark: '#9a8ce0',
        })
      if (within(t, GUSTS[0], GUSTS[2] + FLIGHT))
        for (let k = 0; k < 2; k++) {
          const u = r()
          s.fx.add({
            x: lerp(s.G0.x, s.T.x, u) + r.range(-6, 6),
            y: lerp(s.G0.y, s.T.y, u) + r.range(-10, 10),
            vx: 220 * s.dir,
            vy: (s.T.y - s.G0.y) * 0.8,
            life: 0.12,
            shape: 'streak',
            trail: 0.04,
            colors: FLY.slice(1, 4),
          })
        }
    },
    draw(g, s, t) {
      s.begin(g, t)
      const rise = -5 * ease.outQ(span(t, 0.3, 0.7)) * (1 - ease.ioS(span(t, 1.4, 1.75)))
      const flap = within(t, 0.3, 1.4) && Math.floor(t * 15) % 2 ? 0.94 : 1
      const sway = within(t, GUSTS[0] + FLIGHT, GUSTS[2] + FLIGHT + 0.2) ? 2 + (Math.floor(t * 20) % 2) : 0
      const knock =
        5 * ease.outQ(span(t, SLASH, SLASH + 0.12)) * (1 - ease.ioS(span(t, SLASH + 0.4, SLASH + 0.8)))
      s.drawBoth(
        g,
        t,
        { dx: sway + Math.round(knock), tint: statusTint(p, t, T_STATUS) },
        { dy: Math.round(rise), sy: flap },
      )
      // Each gust: three nested crescents opening toward the target.
      GUSTS.forEach((t0) => {
        const q = span(t, t0, t0 + FLIGHT)
        if (q <= 0 || q >= 1) return
        const x = lerp(s.G0.x, s.T.x, q)
        const y = lerp(s.G0.y, s.T.y, q)
        const a0 = s.dir > 0 ? -1.1 : Math.PI - 1.1
        for (let k = 0; k < 3; k++) {
          const R = 6 + k * 3 + 6 * q
          // Two pixels thick: a one-pixel arc vanishes against the sky.
          for (const o of [0, 1])
            ellipseLine(g, x - (k * 3 + o) * s.dir, y, R, R * 1.3, FLY[k * 2]!, a0, a0 + 2.2)
        }
      })
      // The wing comes down: a glint above the target, then three feather-edge strokes.
      if (within(t, SLASH - 0.25, SLASH)) {
        const R = 1 + Math.round(3 * span(t, SLASH - 0.25, SLASH - 0.1))
        const gx = Math.round(s.T.x - 16 * s.dir)
        const gy = Math.round(s.T.y - 24)
        line(g, gx - R, gy, gx + R, gy, '#ffffff')
        line(g, gx, gy - R, gx, gy + R, '#ffffff')
      }
      if (within(t, SLASH, SLASH + 0.42))
        strokes(
          g,
          s.T,
          { ang: 0.95, len: 48, n: 3, gap: 6, dir: s.dir, cols: ['#ffffff', '#c4d0f8', '#9a8ce0'] },
          span(t, SLASH, SLASH + 0.12),
          span(t, SLASH + 0.14, SLASH + 0.42),
        )
      s.fx.draw(g)
      damagePop(g, s, p, s.T.x, t, SLASH + 0.04)
      s.end(g)
      if (within(t, SLASH, SLASH + 2 / 60)) screenFlash(g, '#f0f4ff', 0.4)
    },
    cues: () =>
      attackCues(SLASH, p.status ? T_STATUS : null, [
        [0.3, () => fxSound('impact.windup')],
        ...GUSTS.map((t0) => [t0, () => fxSound('catch.throw')] as const),
        [SLASH, () => fxSound('leaf.slash')],
      ]),
  }
}

// ---------------------------------------------------------------- Poison: Sludge Bomb
interface Blob {
  to: Point
  r: number
}

function poisonAnim(p: AttackParams): Timeline<St<{ M: Point; T: Point; blobs: Blob[] }>> {
  const N = 4
  const LAUNCH = 0.9
  const GAP = 0.13
  const FLIGHT = 0.42
  const arrive = (i: number) => LAUNCH + i * GAP + FLIGHT
  const LAST = arrive(N - 1)
  const T_STATUS = LAST + 0.5
  const blobAt = (s: { M: Point; blobs: Blob[] }, i: number, t: number): Point | null => {
    const q = span(t, LAUNCH + i * GAP, arrive(i))
    if (q <= 0 || q >= 1) return null
    const B = s.blobs[i]!
    const c = { x: (s.M.x + B.to.x) / 2, y: Math.min(s.M.y, B.to.y) - 32 - i * 3 }
    return quad(s.M, c, B.to, q)
  }
  return {
    id: 'poison',
    dur: 3.6,
    setup() {
      const st = stage(p, 117, (st) => {
        const T = st.tgtAt(0.5, 0.5)
        const r = st.r
        return {
          M: st.atkAt(0.8, 0.32),
          T,
          blobs: Array.from({ length: N }, (_, i) => ({
            to: i === N - 1 ? T : { x: T.x + r.range(-10, 10), y: T.y + r.range(-10, 8) },
            r: i === N - 1 ? 6 : 4,
          })),
        }
      })
      for (let i = 0; i < N; i++) {
        const last = i === N - 1
        st.hit(arrive(i), {
          stop: i === 0 || last ? 0.07 : 0,
          shake: last ? 3 : 2,
          dur: last ? 0.7 : 0.15,
          tint: '#a040b8',
          screen: i === 0 ? 2 : 0,
          flash: i === 0 || last,
        })
      }
      return st
    },
    step(s, t, dt) {
      const at = edges(s, t)
      for (let i = 0; i < N; i++)
        if (at(arrive(i)))
          burst(s, s.blobs[i]!.to, {
            n: i === N - 1 ? 14 : 7,
            colors: POISON.slice(1),
            shapes: ['drop', 'sq'],
            speed: [40, 110],
            arc: [-Math.PI * 0.95, -Math.PI * 0.05],
            drag: 0.5,
            ay: 320,
            life: [0.35, 0.6],
          })
      if (!s.step(t, dt)) return
      const r = s.r
      // The wind-up: bubbles boil up around the attacker.
      if (within(t, 0.3, 0.9) && Math.floor(t * 60) % 4 === 0)
        s.fx.add({
          x: s.atk.at.x + r.range(-s.atk.size.w * 0.4, s.atk.size.w * 0.4),
          y: s.atk.at.y - r.range(2, s.atk.size.h * 0.6),
          vy: -r.range(15, 30),
          life: 0.6,
          size: r.int(1, 3),
          shape: 'bubble',
          colors: POISON.slice(1, 4),
          core: '#ffffff',
        })
      for (let i = 0; i < N; i++) {
        const b = blobAt(s, i, t)
        if (b && Math.floor(t * 60) % 3 === 0)
          s.fx.add({
            x: b.x,
            y: b.y + 2,
            vy: 30,
            ay: 200,
            life: 0.3,
            shape: 'drop',
            colors: POISON.slice(2, 5),
          })
      }
      if (within(t, arrive(0) + 0.1, 3.1) && Math.floor(t * 60) % 5 === 0) {
        const fs = s.tgt.size
        s.fx.add({
          x: s.tgt.at.x + r.range(-fs.w * 0.35, fs.w * 0.35),
          y: s.tgt.at.y - r.range(4, fs.h * 0.8),
          vx: r.range(-4, 4),
          vy: -r.range(12, 24),
          life: r.range(0.6, 1.0),
          size: r.int(1, 3),
          shape: 'bubble',
          colors: POISON.slice(1, 5),
          core: '#ffffff',
        })
      }
    },
    draw(g, s, t) {
      s.begin(g, t)
      // A puddle of sludge spreads under the target once the first blob lands.
      const pud = ease.outQ(span(t, arrive(0), LAST + 0.2)) * (1 - span(t, 2.8, 3.4))
      if (pud > 0) softEllipse(g, s.tgt.at.x, s.tgt.at.y, Math.round(8 + 14 * pud), 4, '#8a3aa0', 0.8 * pud)
      const shiver = within(t, 0.3, 0.9) ? (Math.floor(t * 30) % 2 ? 1 : -1) : 0
      s.drawBoth(
        g,
        t,
        {
          tint:
            statusTint(p, t, T_STATUS) ??
            (t > LAST && t < 3.0 && Math.floor(t * 8) % 2 ? { color: '#a040b8', a: 0.25 } : null),
        },
        {
          dx: shiver,
          tint: within(t, 0.3, 0.9) && Math.floor(t * 12) % 2 ? { color: '#a040b8', a: 0.3 } : null,
        },
      )
      if (within(t, 0.4, LAUNCH + (N - 1) * GAP)) {
        const R = Math.round(2 + 4 * ease.outQ(span(t, 0.4, LAUNCH)))
        g.drawImage(glow(R, '#d070e0', 1.2), Math.round(s.M.x - R), Math.round(s.M.y - R))
      }
      for (let i = 0; i < N; i++) {
        const b = blobAt(s, i, t)
        if (!b) continue
        const R = s.blobs[i]!.r
        ellipse(g, b.x, b.y, R + 1, R, '#3a1448')
        ellipse(g, b.x, b.y, R, R - 1, '#a040b8')
        ellipse(g, b.x - 1, b.y - 1, R - 2, R - 2, '#d070e0')
        px(g, Math.round(b.x - R + 1), Math.round(b.y - R + 1), '#ffffff')
      }
      s.fx.draw(g)
      damagePop(g, s, p, s.T.x, t, arrive(0) + 0.04)
      s.end(g)
      if (within(t, arrive(0), arrive(0) + 2 / 60)) screenFlash(g, '#f0d8f8', 0.35)
    },
    cues: () =>
      attackCues(arrive(0), p.status ? T_STATUS : null, [
        [0.3, () => fxSound('water.charge')],
        ...Array.from({ length: N }, (_, i) => [LAUNCH + i * GAP, () => fxSound('leaf.chip', i)] as const),
        ...Array.from({ length: N }, (_, i) => [arrive(i), () => fxSound('fire.hit')] as const),
      ]),
  }
}

// ---------------------------------------------------------------- Ground: a stomp, a crack, the earth erupts
interface Pillar {
  dx: number
  h: number
  w: number
  lean: number
  t0: number
}

function groundAnim(
  p: AttackParams,
): Timeline<St<{ T: Point; crack: [number, number][]; pillars: Pillar[] }>> {
  const HOP = 0.65
  const STOMP = 0.9
  const ERUPT = 1.3
  const T_STATUS = ERUPT + 0.6
  return {
    id: 'ground',
    dur: 3.6,
    setup() {
      const st = stage(p, 129, (st) => {
        const r = st.r
        const fw = st.tgt.size.w
        const a = st.atk.at
        const b = st.tgt.at
        return {
          T: st.tgtAt(0.5, 0.5),
          crack: bolt(rng(7), a.x, a.y, b.x, b.y, 0.1, 4),
          pillars: [-0.42, -0.2, 0, 0.22, 0.4].map((k, i) => ({
            dx: k * fw * 1.1 + r.range(-2, 2),
            h: (i === 2 ? 34 : 20) + r.range(0, 8) - Math.abs(k) * 10,
            w: i === 2 ? 15 : r.range(9, 12),
            lean: k * 8,
            t0: ERUPT + Math.abs(i - 2) * 0.04,
          })),
        }
      })
      st.screenShakes.push([STOMP, 0.25, 2])
      st.hit(ERUPT, { stop: 0.08, shake: 4, dur: 0.75, tint: '#c0a256', screen: 4 })
      return st
    },
    step(s, t, dt) {
      const at = edges(s, t)
      if (at(STOMP)) dust(s, s.atk.at, 5, s.atk.size.w * 0.35)
      if (at(ERUPT)) {
        burst(s, s.tgt.at, {
          n: 16,
          colors: EARTH,
          shapes: ['sq', 'sq', 'px'],
          speed: [80, 170],
          arc: [-Math.PI * 0.85, -Math.PI * 0.15],
          drag: 0.5,
          ay: 360,
          size: [1, 3],
          life: [0.5, 0.8],
          spread: 10,
        })
        dust(s, s.tgt.at, 10, s.tgt.size.w * 0.5)
      }
      if (!s.step(t, dt)) return
      // The crack runs: grit kicks up where its tip is.
      const q = span(t, STOMP, ERUPT)
      if (q > 0 && q < 1 && Math.floor(t * 60) % 2 === 0) {
        const tip = s.crack[Math.floor(q * (s.crack.length - 1))]!
        burst(
          s,
          { x: tip[0], y: tip[1] },
          {
            n: 2,
            colors: EARTH.slice(1),
            speed: [20, 50],
            arc: [-Math.PI * 0.9, -Math.PI * 0.1],
            ay: 200,
            drag: 1,
            life: [0.2, 0.3],
            size: [1, 1],
          },
        )
      }
      if (within(t, 2.1, 2.4) && Math.floor(t * 60) % 6 === 0) dust(s, s.tgt.at, 1, s.tgt.size.w * 0.4)
    },
    draw(g, s, t) {
      s.begin(g, t)
      // The crack in the ground: drawn in from the attacker's feet, open until the earth settles.
      const cq = span(t, STOMP, ERUPT)
      const fade = 1 - span(t, 2.5, 3.0)
      if (cq > 0 && fade > 0) {
        const n = Math.max(2, Math.ceil(cq * s.crack.length))
        const pts = s.crack.slice(0, n)
        for (let i = 1; i < pts.length; i++) {
          const [x0, y0] = pts[i - 1]!
          const [x1, y1] = pts[i]!
          if (fade < 1 && 1 - fade > bayer(Math.round(x0), Math.round(y0))) continue
          line(g, x0, y0 + 1, x1, y1 + 1, '#e8c878')
          line(g, x0, y0, x1, y1, '#5a4020')
        }
      }
      const crouch = within(t, 0.3, HOP) ? ease.outQ(span(t, 0.3, HOP)) : 0
      const hop = -8 * Math.sin(Math.PI * span(t, HOP, STOMP))
      const landing = within(t, STOMP, STOMP + 0.1) ? 1 : 0
      const lift =
        t < ERUPT + 0.3
          ? -7 * ease.outQ(span(t, ERUPT, ERUPT + 0.1))
          : -7 * (1 - ease.outBounce(span(t, ERUPT + 0.3, ERUPT + 0.7)))
      s.drawBoth(
        g,
        t,
        { dy: Math.round(lift), tint: statusTint(p, t, T_STATUS) },
        {
          dy: Math.round(hop),
          sx: 1 + 0.06 * (crouch + landing),
          sy: 1 - 0.08 * (crouch + landing),
        },
      )
      // Earth pillars burst up at the target's feet, hold, then sink back.
      for (const P of s.pillars) {
        const grow = ease.outBack(span(t, P.t0, P.t0 + 0.12))
        const sink = ease.inQ(span(t, 2.1, 2.45))
        const h = P.h * grow * (1 - sink)
        if (h >= 1) spike(g, s.tgt.at.x + P.dx, s.tgt.at.y + 2, h, P.w, P.lean, EARTH.slice(1))
      }
      s.fx.draw(g)
      damagePop(g, s, p, s.T.x, t, ERUPT + 0.04)
      s.end(g)
      if (within(t, ERUPT, ERUPT + 2 / 60)) screenFlash(g, '#fff0c8', 0.35)
    },
    cues: () =>
      attackCues(ERUPT, p.status ? T_STATUS : null, [
        [0.3, () => fxSound('impact.windup')],
        [STOMP, () => fxSound('gmax.step')],
        [ERUPT, () => fxSound('catch.break')],
        [ERUPT + 0.02, () => fxSound('gmax.step')],
      ]),
  }
}

// ---------------------------------------------------------------- Rock: Rock Slide
interface Stone {
  to: Point
  r: number
  seed: number
  land: number
  /** The last one: the biggest, and it sits a beat on the target before it crumbles. */
  big: boolean
}

function rockAnim(p: AttackParams): Timeline<St<{ T: Point; stones: Stone[] }>> {
  const LANDS = [1.2, 1.36, 1.52, 1.72] as const
  const FALL = 0.34
  const LAST = LANDS[3]
  const T_STATUS = LAST + 0.5
  return {
    id: 'rock',
    dur: 3.6,
    setup() {
      const st = stage(p, 141, (st) => {
        const T = st.tgtAt(0.5, 0.5)
        const r = st.r
        return {
          T,
          stones: LANDS.map((land, i) => {
            const last = i === LANDS.length - 1
            return {
              to: last
                ? { x: T.x, y: T.y - 2 }
                : { x: T.x + (i - 1) * 11 + r.range(-3, 3), y: T.y + r.range(-8, 6) },
              // Sized to the target: a pebble on a Snorlax doesn't read as a rock slide.
              r: last ? Math.round(Math.min(14, Math.max(9, st.tgt.size.w * 0.2))) : r.int(6, 9),
              seed: i * 3 + 1,
              land,
              big: last,
            }
          }),
        }
      })
      LANDS.forEach((t0, i) => {
        const last = i === LANDS.length - 1
        st.hit(t0, {
          stop: i === 0 || last ? 0.08 : 0.05,
          shake: last ? 4 : 2,
          dur: last ? 0.7 : 0.15,
          tint: '#9b892e',
          screen: last ? 4 : 2,
        })
      })
      return st
    },
    step(s, t, dt) {
      const at = edges(s, t)
      for (const S of s.stones)
        if (at(S.land)) {
          burst(s, S.to, {
            n: S.big ? 16 : 9,
            colors: ROCK,
            shapes: ['sq', 'sq', 'px'],
            speed: [60, 140],
            arc: [-Math.PI * 0.95, -Math.PI * 0.05],
            drag: 0.6,
            ay: 340,
            size: [1, 3],
            life: [0.45, 0.7],
          })
          dust(s, { x: S.to.x, y: s.tgt.at.y }, S.big ? 5 : 2, 10)
        }
      if (!s.step(t, dt)) return
      const r = s.r
      // The wind-up: pebbles lift off the ground around the attacker.
      if (within(t, 0.3, 0.95) && Math.floor(t * 60) % 4 === 0)
        s.fx.add({
          x: s.atk.at.x + r.range(-s.atk.size.w * 0.5, s.atk.size.w * 0.5),
          y: s.atk.at.y - r.range(0, 4),
          vy: -r.range(30, 60),
          drag: 3,
          life: 0.55,
          size: r.int(1, 2),
          shape: 'sq',
          colors: ROCK.slice(0, 4),
        })
    },
    draw(g, s, t) {
      s.begin(g, t)
      // Each boulder's shadow grows on the ground before it lands: the player sees where it will fall.
      for (const S of s.stones) {
        const q = span(t, S.land - FALL, S.land)
        if (q > 0 && q < 1)
          softEllipse(g, S.to.x, s.tgt.at.y, Math.round(2 + S.r * q), 2, '#00000066', 0.5 * q)
      }
      const shake = within(t, 0.3, 0.95) ? (Math.floor(t * 30) % 2 ? 1 : -1) : 0
      s.drawBoth(
        g,
        t,
        { dy: within(t, LAST, LAST + 0.1) ? 2 : 0, tint: statusTint(p, t, T_STATUS) },
        {
          dx: shake,
          tint: within(t, 0.3, 0.95) && Math.floor(t * 12) % 2 ? { color: '#9b892e', a: 0.3 } : null,
        },
      )
      for (const S of s.stones) {
        const q = span(t, S.land - FALL, S.land)
        // A boulder falls from off the top of the stage; the big one sits a beat on the target, then crumbles.
        if (q <= 0 || t > S.land + (S.big ? 0.16 : 0.03)) continue
        const y = lerp(-S.r * 2, S.to.y, ease.inQ(q))
        const x = S.to.x - 6 * s.dir * (1 - q)
        if (q < 1) line(g, x, y - S.r - 8, x, y - S.r - 2, '#e8dcb0')
        g.drawImage(boulder(S.r, S.seed), Math.round(x - S.r - 1), Math.round(y - S.r - 1))
      }
      s.fx.draw(g)
      damagePop(g, s, p, s.T.x, t, LANDS[0] + 0.04)
      s.end(g)
      if (within(t, LAST, LAST + 2 / 60)) screenFlash(g, '#fff6d8', 0.35)
    },
    cues: () =>
      attackCues(LANDS[0], p.status ? T_STATUS : null, [
        [0.3, () => fxSound('impact.windup')],
        ...LANDS.map((t0) => [t0, () => fxSound('gmax.step')] as const),
        [LAST, () => fxSound('catch.break')],
      ]),
  }
}

// ---------------------------------------------------------------- Bug: a swarm, then X-Scissor
function bugAnim(p: AttackParams): Timeline<St<{ M: Point; T: Point; C: Point[] }>> {
  const N = 16
  const OUT = 0.6
  const FLIGHT = 0.45
  const X1 = 1.65
  const X2 = 1.8
  const T_STATUS = X2 + 0.45
  /** Where bug i is at t: out of the attacker, buzzing round the target, then scattering up and away. */
  const bugAt = (s: { M: Point; T: Point }, i: number, t: number): Point | null => {
    const t0 = OUT + i * 0.03
    if (t < t0 || t > X1 + 0.3) return null
    const a = t * 7 + (i * Math.PI * 2) / N
    const orbit = { x: s.T.x + Math.cos(a) * (14 + (i % 3) * 4), y: s.T.y + Math.sin(a) * 9 + (i % 4) - 2 }
    const q = ease.outQ(span(t, t0, t0 + FLIGHT))
    const wob = Math.sin(t * 40 + i) * 2 * (1 - q)
    const pt = { x: lerp(s.M.x, orbit.x, q), y: lerp(s.M.y, orbit.y, q) + wob }
    const go = ease.inQ(span(t, X1 - 0.1, X1 + 0.3))
    return { x: pt.x + Math.cos(a) * 60 * go, y: pt.y - 50 * go }
  }
  return {
    id: 'bug',
    dur: 3.6,
    setup() {
      const st = stage(p, 153, (st) => ({
        M: st.atkAt(0.8, 0.4),
        T: st.tgtAt(0.5, 0.5),
        C: [st.atkAt(0.75, 0.3), st.atkAt(0.85, 0.6)],
      }))
      st.hit(OUT + FLIGHT, { stop: 0, shake: 1, dur: 0.5, tint: '#c0d840', flash: false })
      st.hit(X1, { stop: 0.05, shake: 2, dur: 0.15, tint: '#8d9d16' })
      st.hit(X2, { stop: 0.08, shake: 4, dur: 0.6, tint: '#8d9d16', screen: 3 })
      return st
    },
    step(s, t, dt) {
      const at = edges(s, t)
      if (at(X1)) burst(s, s.T, { n: 6, colors: BUG, shapes: ['sq', 'px'], speed: [50, 110] })
      if (at(X2))
        burst(s, s.T, {
          n: 16,
          colors: BUG,
          shapes: ['star', 'sq'],
          speed: [60, 150],
          push: 30,
          core: '#ffffff',
        })
      if (!s.step(t, dt)) return
      const r = s.r
      if (within(t, 0.3, 0.8) && Math.floor(t * 60) % 4 === 0)
        for (const C of s.C)
          s.fx.add({
            x: C.x + r.range(-4, 4),
            y: C.y + r.range(-4, 4),
            life: 0.2,
            size: r.int(1, 2),
            shape: 'plus',
            colors: BUG.slice(0, 3),
          })
    },
    draw(g, s, t) {
      s.begin(g, t)
      const shiver = within(t, 0.3, 0.8) ? (Math.floor(t * 30) % 2 ? 1 : -1) : 0
      const lunge = 8 * Math.sin(Math.PI * span(t, X1 - 0.15, X2 + 0.15))
      const knock = 5 * ease.outQ(span(t, X2, X2 + 0.12)) * (1 - ease.ioS(span(t, X2 + 0.4, X2 + 0.8)))
      const swarmed = within(t, OUT + FLIGHT, X1) && Math.floor(t * 20) % 2 ? 1 : 0
      s.drawBoth(
        g,
        t,
        { dx: Math.round(knock) + swarmed, tint: statusTint(p, t, T_STATUS) },
        { dx: Math.round(shiver + lunge) },
      )
      for (const C of s.C)
        if (within(t, 0.3, X2)) {
          const R = 2 + (Math.floor(t * 10) % 2)
          g.drawImage(glow(R + 2, '#c0d840', 1.2), Math.round(C.x - R - 2), Math.round(C.y - R - 2))
        }
      // The swarm: a dark body each, its wings a flicker of light.
      const wing = Math.floor(t * 30) % 2 ? '#ffffff' : '#e8f8a0'
      for (let i = 0; i < N; i++) {
        const b = bugAt(s, i, t)
        if (!b) continue
        const x = Math.round(b.x)
        const y = Math.round(b.y)
        rect(g, x - 1, y, 3, 2, '#3a4008')
        px(g, x + 1, y, '#8d9d16')
        // Wings up on one frame, down the next: the buzz.
        if ((i + Math.floor(t * 30)) % 2) {
          px(g, x - 1, y - 1, wing)
          px(g, x + 1, y - 1, wing)
        } else {
          px(g, x - 2, y, wing)
          px(g, x + 2, y, wing)
        }
      }
      const cols = ['#ffffff', '#e8f8a0', '#8d9d16']
      if (within(t, X1, X1 + 0.42))
        strokes(
          g,
          s.T,
          { ang: 0.8, len: 46, n: 2, gap: 2, dir: s.dir, cols },
          span(t, X1, X1 + 0.1),
          span(t, X2 + 0.1, X1 + 0.42),
        )
      if (within(t, X2, X2 + 0.42))
        strokes(
          g,
          s.T,
          { ang: Math.PI - 0.8, len: 46, n: 2, gap: 2, dir: s.dir, cols },
          span(t, X2, X2 + 0.1),
          span(t, X2 + 0.14, X2 + 0.42),
        )
      s.fx.draw(g)
      damagePop(g, s, p, s.T.x, t, X1 + 0.04)
      s.end(g)
      if (within(t, X2, X2 + 2 / 60)) screenFlash(g, '#f4ffd8', 0.4)
    },
    cues: () =>
      attackCues(X1, p.status ? T_STATUS : null, [
        [0.3, () => fxSound('thunder.charge')],
        [X1, () => fxSound('leaf.slash')],
        [X2, () => fxSound('leaf.slash')],
        [X2 + 0.02, () => fxSound('impact.hit')],
      ]),
  }
}

// ---------------------------------------------------------------- Ghost: Shadow Ball
function ghostAnim(p: AttackParams): Timeline<St<{ B: Point; T: Point }>> {
  const FORM = 0.5
  const LAUNCH = 1.1
  const HIT = 1.5
  const T_STATUS = HIT + 0.7
  const ballAt = (s: { B: Point; T: Point }, t: number): Point => {
    if (t < LAUNCH) return { x: s.B.x, y: s.B.y + Math.round(Math.sin(t * 6)) }
    const q = ease.inQ(span(t, LAUNCH, HIT))
    const wob = Math.sin(q * Math.PI * 3) * 5 * (1 - q)
    return { x: lerp(s.B.x, s.T.x, q), y: lerp(s.B.y, s.T.y, q) + wob }
  }
  return {
    id: 'ghost',
    dur: 3.8,
    setup() {
      const st = stage(p, 165, (st) => ({ B: st.atkAt(0.9, 0.3, 8, -8), T: st.tgtAt(0.5, 0.5) }))
      st.hit(HIT, { stop: 0.08, shake: 3, dur: 0.75, tint: '#6a4aa0', screen: 2 })
      return st
    },
    step(s, t, dt) {
      const at = edges(s, t)
      if (at(HIT)) {
        burst(s, s.T, { n: 12, colors: GHOST, shapes: ['star', 'sq'], speed: [50, 130], core: '#ffffff' })
        burst(s, s.T, {
          n: 8,
          colors: ['#3a2860', '#1a1030'],
          shapes: ['smoke'],
          speed: [30, 70],
          size: [2, 3],
          size1: 6,
          drag: 3,
          life: [0.6, 0.9],
        })
      }
      if (!s.step(t, dt)) return
      const r = s.r
      // Wisps spiral in and knot into the ball.
      if (within(t, 0.3, LAUNCH - 0.1) && Math.floor(t * 60) % 2 === 0) {
        const a = r() * Math.PI * 2
        const d = r.range(16, 24)
        s.fx.add({
          x: s.B.x + Math.cos(a) * d,
          y: s.B.y + Math.sin(a) * d,
          home: { x: s.B.x, y: s.B.y, k: 600 },
          vx: -Math.sin(a) * 50,
          vy: Math.cos(a) * 50,
          life: 0.6,
          size: 1,
          shape: 'disc',
          colors: GHOST.slice(2),
        })
      }
      if (within(t, LAUNCH, HIT) && Math.floor(t * 60) % 2 === 0) {
        const b = ballAt(s, t)
        s.fx.add({
          x: b.x + r.range(-2, 2),
          y: b.y + r.range(-2, 2),
          vy: -r.range(5, 15),
          life: 0.5,
          size: 2,
          size1: 4,
          shape: 'smoke',
          colors: ['#3a2860', '#1a1030'],
          density: 0.7,
        })
      }
    },
    draw(g, s, t) {
      // The light goes: a stepped dim the sprites sit in, lifted again once the ball has burst.
      const dim = 0.45 * ease.outQ(span(t, 0.3, 0.8)) * (1 - span(t, HIT + 0.6, HIT + 1.2))
      s.begin(g, t)
      wash(g, '#140a24', dim)
      const shadow = dim > 0.05 ? { color: '#140a24', a: dim * 0.5 } : null
      const haunted = within(t, HIT, HIT + 0.9)
      s.drawBoth(
        g,
        t,
        {
          ghost: haunted
            ? [
                { dx: -3, color: '#6a4aa0', a: 0.5 },
                { dx: 3, color: '#3a2860', a: 0.5 },
              ]
            : undefined,
          tint: statusTint(p, t, T_STATUS) ?? shadow,
        },
        { outline: within(t, 0.3, LAUNCH) && Math.floor(t * 15) % 2 ? '#a080e0' : undefined, tint: shadow },
      )
      if (within(t, FORM - 0.2, HIT)) {
        const b = ballAt(s, t)
        const R = Math.round(1 + 6 * ease.outBack(span(t, FORM - 0.2, LAUNCH - 0.1)))
        g.drawImage(glow(R + 4, '#6a4aa0', 1.3, 0.9), Math.round(b.x - R - 4), Math.round(b.y - R - 4))
        disc(g, b.x, b.y, R, '#1a1030')
        if (R > 2) {
          ellipseLine(g, Math.round(b.x), Math.round(b.y), R, R, '#a080e0')
          // A swirl of light inside the dark.
          const a = t * 14
          px(g, Math.round(b.x + Math.cos(a) * (R - 2)), Math.round(b.y + Math.sin(a) * (R - 2)), '#d8c0ff')
          px(g, Math.round(b.x - Math.cos(a) * (R - 3)), Math.round(b.y - Math.sin(a) * (R - 3)), '#6a4aa0')
        }
      }
      const q = span(t, HIT, HIT + 0.4)
      if (q > 0 && q < 1) {
        const R = Math.round(6 + 26 * ease.outC(q))
        g.drawImage(ring(R, 3, '#3a2860', 1 - q), Math.round(s.T.x - R - 1), Math.round(s.T.y - R - 1))
        if (R > 8)
          g.drawImage(ring(R - 4, 1, '#a080e0', 1 - q), Math.round(s.T.x - R + 3), Math.round(s.T.y - R + 3))
      }
      // A lick of darkness: tendrils climb the target from its feet, then thin out.
      const lq = span(t, HIT + 0.15, HIT + 0.45)
      const lf = span(t, HIT + 0.6, HIT + 1.0)
      if (lq > 0 && lf < 1) {
        const fs = s.tgt.size
        for (let k = 0; k < 3; k++) {
          const bx = s.tgt.at.x + (k - 1) * fs.w * 0.28
          const h = fs.h * (0.55 + 0.2 * (k % 2)) * ease.outC(lq)
          for (let yy = 0; yy < h; yy++) {
            const x = Math.round(bx + Math.sin(yy * 0.22 + t * 9 + k * 2) * 3 * (yy / h))
            const y = Math.round(s.tgt.at.y - yy)
            if (lf > 0 && lf > bayer(x, y)) continue
            const w = yy < h - 3 ? 2 : 1
            px(g, x, y, '#1a1030')
            if (w > 1) px(g, x + 1, y, '#3a2860')
            if (yy % 5 === 0) px(g, x - 1, y, '#6a4aa0')
          }
        }
      }
      s.fx.draw(g)
      damagePop(g, s, p, s.T.x, t, HIT + 0.04)
      s.end(g)
      if (within(t, HIT, HIT + 2 / 60)) screenFlash(g, '#d8c0ff', 0.35)
    },
    cues: () =>
      attackCues(HIT, p.status ? T_STATUS : null, [
        [0.3, () => fxSound('psychic.focus')],
        [LAUNCH, () => fxSound('catch.throw')],
        [HIT, () => fxSound('psychic.slam')],
      ]),
  }
}

// ---------------------------------------------------------------- Steel: Metal Claw
function steelAnim(p: AttackParams): Timeline<St<{ T: Point; top: Point }>> {
  const LUNGE = 1.0
  const CLAW1 = 1.15
  const CLAW2 = 1.45
  const T_STATUS = CLAW2 + 0.45
  const GLINTS = [0.55, 0.8] as const
  const claw = (ang: number, dir: number) => ({
    ang,
    len: 40,
    n: 3,
    gap: 6,
    dir,
    cols: [STEEL[0]!, STEEL[3]!, STEEL[4]!],
  })
  return {
    id: 'steel',
    dur: 3.4,
    setup() {
      const st = stage(p, 177, (st) => ({ T: st.tgtAt(0.5, 0.5), top: st.atkAt(0.6, 0.15) }))
      st.hit(CLAW1, { stop: 0.06, shake: 3, dur: 0.25, tint: '#9c9caf', screen: 1 })
      st.hit(CLAW2, { stop: 0.08, shake: 4, dur: 0.6, tint: '#9c9caf', screen: 3 })
      return st
    },
    step(s, t, dt) {
      const at = edges(s, t)
      // Metal on metal: sparks, falling.
      for (const t0 of [CLAW1, CLAW2])
        if (at(t0))
          burst(s, s.T, {
            n: t0 === CLAW2 ? 20 : 14,
            colors: SPARK,
            shapes: ['px', 'plus', 'sq'],
            speed: [50, 120],
            drag: 1.5,
            ay: 260,
            size: [1, 1],
            life: [0.3, 0.5],
            push: 30,
          })
      for (const t0 of GLINTS)
        if (at(t0))
          s.fx.add({
            x: s.top.x + s.r.range(-4, 4),
            y: s.top.y,
            life: 0.25,
            size: 1,
            size1: 4,
            shape: 'star',
            colors: ['#ffffff'],
          })
      s.step(t, dt)
    },
    draw(g, s, t) {
      s.begin(g, t)
      const lunge = 10 * ease.inQ(span(t, LUNGE, CLAW1)) * (1 - ease.outQ(span(t, CLAW2 + 0.1, CLAW2 + 0.4)))
      const knock =
        5 * ease.outQ(span(t, CLAW2, CLAW2 + 0.12)) * (1 - ease.ioS(span(t, CLAW2 + 0.4, CLAW2 + 0.8)))
      // The sheen: a silver coat flickering on, a steady shine just before the strike.
      const sheen = within(t, 0.3, CLAW2) ? (Math.floor(t * 12) % 2 || t > LUNGE ? 0.45 : 0.2) : 0
      s.drawBoth(
        g,
        t,
        { dx: Math.round(knock), tint: statusTint(p, t, T_STATUS) },
        {
          dx: Math.round(-3 * ease.outQ(span(t, 0.3, LUNGE)) * (1 - span(t, LUNGE, CLAW1)) + lunge),
          tint: sheen ? { color: '#e8eef8', a: sheen } : null,
          outline: within(t, 0.7, LUNGE) && Math.floor(t * 15) % 2 ? '#ffffff' : undefined,
        },
      )
      if (within(t, CLAW1, CLAW1 + 0.4))
        strokes(g, s.T, claw(1.15, s.dir), span(t, CLAW1, CLAW1 + 0.09), span(t, CLAW1 + 0.12, CLAW1 + 0.4))
      if (within(t, CLAW2, CLAW2 + 0.42))
        strokes(g, s.T, claw(-1.15, s.dir), span(t, CLAW2, CLAW2 + 0.09), span(t, CLAW2 + 0.14, CLAW2 + 0.42))
      // The clang: a hard silver ring.
      const q = span(t, CLAW2, CLAW2 + 0.3)
      if (q > 0 && q < 1) {
        const R = Math.round(6 + 22 * ease.outC(q))
        g.drawImage(ring(R, 2, '#c4ccd8', 1 - q), Math.round(s.T.x - R - 1), Math.round(s.T.y - R - 1))
      }
      s.fx.draw(g)
      damagePop(g, s, p, s.T.x, t, CLAW1 + 0.04)
      s.end(g)
      if (within(t, CLAW2, CLAW2 + 2 / 60)) screenFlash(g, '#ffffff', 0.4)
    },
    cues: () =>
      attackCues(CLAW1, p.status ? T_STATUS : null, [
        [0.3, () => fxSound('impact.windup')],
        ...GLINTS.map((t0) => [t0, () => fxSound('evolve.touch')] as const),
        [CLAW1, () => fxSound('leaf.slash')],
        [CLAW2, () => fxSound('leaf.slash')],
        [CLAW2 + 0.02, () => fxSound('mega.key')],
      ]),
  }
}

// ---------------------------------------------------------------- Ice: Ice Beam
interface Shard {
  x: number
  base: number
  h: number
  w: number
  lean: number
  t0: number
}

function iceAnim(p: AttackParams): Timeline<St<{ M: Point; T: Point; shards: Shard[] }>> {
  const ON = 0.95
  const OFF = 1.85
  const HEAD = 0.1
  const HIT = ON + HEAD
  const SHATTER = 2.45
  const T_STATUS = SHATTER + 0.3
  return {
    id: 'ice',
    dur: 3.8,
    setup() {
      const st = stage(p, 189, (st) => {
        const r = st.r
        const fs = st.tgt.size
        const at = st.tgt.at
        return {
          M: st.atkAt(0.8, 0.3),
          T: st.tgtAt(0.45, 0.48),
          // Crystals on the ground round its feet and a few up its body, each forming in turn.
          shards: Array.from({ length: 8 }, (_, k): Shard => {
            const ground = k < 5
            // Sized to the target, so a big Pokémon is still encased.
            const z = Math.min(1.6, Math.max(0.9, fs.h / 45))
            return {
              x: at.x + (ground ? (k - 2) * fs.w * 0.24 : r.range(-fs.w * 0.3, fs.w * 0.3)),
              base: ground ? at.y + 1 : at.y - r.range(fs.h * 0.2, fs.h * 0.6),
              h: (ground ? r.range(12, 20) : r.range(7, 11)) * z,
              w: (ground ? r.range(7, 10) : r.range(5, 7)) * z,
              lean: r.range(-4, 4),
              t0: HIT + 0.1 + k * 0.09,
            }
          }),
        }
      })
      st.hit(HIT, { stop: 0.08, shake: 2, dur: 0.9, tint: '#78d0e8', screen: 2 })
      st.hit(SHATTER, { stop: 0.05, shake: 3, dur: 0.3, tint: '#b0f0f8', screen: 1 })
      return st
    },
    step(s, t, dt) {
      const at = edges(s, t)
      if (at(SHATTER))
        for (const S of s.shards)
          burst(
            s,
            { x: S.x, y: S.base - S.h / 2 },
            {
              // Starting pale blue, not white: they spawn inside the hit's white frames.
              n: 7,
              colors: ICE.slice(2),
              shapes: ['flake', 'sq', 'flake'],
              speed: [60, 130],
              arc: [-Math.PI * 0.95, -Math.PI * 0.05],
              drag: 1,
              ay: 220,
              size: [2, 3],
              life: [0.45, 0.7],
            },
          )
      if (!s.step(t, dt)) return
      const r = s.r
      // Cold gathers: frost motes drawn into the mouth.
      if (within(t, 0.35, ON) && Math.floor(t * 60) % 2 === 0) {
        const a = r() * Math.PI * 2
        const d = r.range(14, 22)
        s.fx.add({
          x: s.M.x + Math.cos(a) * d,
          y: s.M.y + Math.sin(a) * d,
          home: { x: s.M.x, y: s.M.y, k: 800 },
          life: 0.5,
          size: 2,
          shape: 'flake',
          colors: ICE.slice(0, 3),
        })
      }
      // Glitter along the beam.
      if (within(t, ON, OFF) && Math.floor(t * 60) % 2 === 0) {
        const u = r()
        s.fx.add({
          x: lerp(s.M.x, s.T.x, u) + r.range(-3, 3),
          y: lerp(s.M.y, s.T.y, u) + r.range(-3, 3),
          vy: r.range(-10, 10),
          life: 0.35,
          size: r.int(1, 3),
          size1: 1,
          shape: 'flake',
          colors: ICE.slice(0, 3),
        })
      }
      if (within(t, HIT, OFF) && Math.floor(t * 60) % 3 === 0)
        burst(s, s.T, {
          n: 2,
          colors: ICE,
          shapes: ['flake', 'px'],
          speed: [40, 90],
          push: 30,
          life: [0.3, 0.45],
        })
    },
    draw(g, s, t) {
      s.begin(g, t)
      softEllipse(g, s.tgt.at.x, s.tgt.at.y, Math.round(20 * ease.outQ(span(t, HIT, OFF))), 4, '#e0fbff', 0.5)
      const frozen = within(t, HIT + 0.2, SHATTER) ? { color: '#b0f0f8', a: 0.3 } : null
      const recoil = within(t, ON, OFF) ? -2 + (Math.floor(t * 30) % 2) : 0
      s.drawBoth(
        g,
        t,
        { tint: statusTint(p, t, T_STATUS) ?? frozen },
        {
          dx: recoil,
          dy: -recoil * 0.5,
          tint: within(t, 0.35, ON) && Math.floor(t * 12) % 2 ? { color: '#b0f0f8', a: 0.35 } : null,
        },
      )
      if (within(t, 0.35, OFF)) {
        const R = Math.round(2 + 5 * ease.outQ(span(t, 0.35, ON)))
        g.drawImage(glow(R, '#b0f0f8', 1.2), Math.round(s.M.x - R), Math.round(s.M.y - R))
      }
      if (within(t, ON, OFF + 0.12))
        beam(
          g,
          s.M,
          s.T,
          ease.inQ(span(t, OFF, OFF + 0.12)),
          ease.outQ(span(t, ON, HIT)),
          t,
          ICE.slice(0, 4),
          2.2,
        )
      // The crystals: each grows from its base, holds, and is gone when the ice shatters.
      if (t < SHATTER)
        for (const S of s.shards) {
          const h = S.h * ease.outBack(span(t, S.t0, S.t0 + 0.14))
          if (h >= 1) spike(g, S.x, S.base, h, S.w, S.lean, ICE.slice(1))
        }
      s.fx.draw(g)
      damagePop(g, s, p, s.T.x + 6 * s.dir, t, HIT + 0.04)
      s.end(g)
      if (within(t, HIT, HIT + 2 / 60)) screenFlash(g, '#e0fbff', 0.4)
    },
    cues: () =>
      attackCues(HIT, p.status ? T_STATUS : null, [
        [0.35, () => fxSound('water.charge')],
        [ON, () => fxSound('mega.beam')],
        [HIT + 0.1, () => fxSound('evolve.touch')],
        [SHATTER, () => fxSound('legend.shatter')],
      ]),
  }
}

// ---------------------------------------------------------------- Dragon: a Dragon Breath spiral
function dragonAnim(p: AttackParams): Timeline<St<{ M: Point; T: Point }>> {
  const ON = 0.95
  const OFF = 1.9
  const HEAD = 0.12
  const HIT = ON + HEAD
  const FINISH = 2.0
  const T_STATUS = FINISH + 0.4
  return {
    id: 'dragon',
    dur: 4.0,
    setup() {
      const st = stage(p, 201, (st) => ({ M: st.atkAt(0.82, 0.28), T: st.tgtAt(0.5, 0.5) }))
      st.hit(HIT, { stop: 0.08, shake: 2, dur: 0.85, tint: '#40e0c8', screen: 2 })
      st.hit(FINISH, { stop: 0.06, shake: 3, dur: 0.5, tint: '#7a5af0', screen: 2 })
      return st
    },
    step(s, t, dt) {
      const at = edges(s, t)
      if (at(FINISH))
        burst(s, s.T, { n: 16, colors: DRAGON, shapes: ['star', 'disc'], speed: [60, 140], core: '#ffffff' })
      if (!s.step(t, dt)) return
      const r = s.r
      // Energy spirals into the mouth: tangential speed and homing make a whirl, not a straight pull.
      if (within(t, 0.3, ON))
        for (let k = 0; k < 2; k++) {
          const a = r() * Math.PI * 2
          const d = r.range(14, 22)
          s.fx.add({
            x: s.M.x + Math.cos(a) * d,
            y: s.M.y + Math.sin(a) * d,
            home: { x: s.M.x, y: s.M.y, k: 700 },
            vx: -Math.sin(a) * 60,
            vy: Math.cos(a) * 60,
            life: 0.5,
            shape: 'px',
            colors: k ? DRAGON.slice(1, 3) : DRAGON.slice(3, 5),
          })
        }
      // Flames peel off the spiral.
      if (within(t, ON, OFF))
        for (let k = 0; k < 2; k++) {
          const u = r() * ease.outQ(span(t, ON, HIT))
          s.fx.add({
            x: lerp(s.M.x, s.T.x, u) + r.range(-5, 5),
            y: lerp(s.M.y, s.T.y, u) + r.range(-5, 5),
            vx: r.range(-20, 20),
            vy: -r.range(10, 40),
            life: r.range(0.25, 0.4),
            size: 2,
            size1: 0,
            shape: 'disc',
            colors: DRAGON.slice(1),
          })
        }
    },
    draw(g, s, t) {
      s.begin(g, t)
      const rear = within(t, 0.3, OFF) ? ease.outQ(span(t, 0.3, ON)) * (1 - span(t, OFF - 0.2, OFF)) : 0
      const pushed = within(t, HIT, OFF + 0.3)
        ? Math.round(3 * ease.outQ(span(t, HIT, HIT + 0.2)) * (1 - span(t, OFF, OFF + 0.3)))
        : 0
      s.drawBoth(
        g,
        t,
        { dx: pushed, tint: statusTint(p, t, T_STATUS) },
        {
          dx: Math.round(-3 * rear),
          dy: Math.round(-3 * rear),
          outline: within(t, 0.3, ON) && Math.floor(t * 15) % 2 ? '#40e0c8' : undefined,
        },
      )
      if (within(t, 0.3, OFF)) {
        const R = Math.round(2 + 5 * ease.outQ(span(t, 0.3, ON)))
        g.drawImage(glow(R, '#7a5af0', 1.2), Math.round(s.M.x - R), Math.round(s.M.y - R))
        const r2 = Math.max(1, R - 3)
        g.drawImage(glow(r2, '#c0fff0', 1), Math.round(s.M.x - r2), Math.round(s.M.y - r2))
      }
      // The breath: a thin core and two strands twisting round it, the one behind drawn darker.
      if (within(t, ON, OFF + 0.15)) {
        const head = ease.outQ(span(t, ON, HIT))
        const tail = ease.inQ(span(t, OFF, OFF + 0.15))
        const len = dist(s.M, s.T)
        const ang = Math.atan2(s.T.y - s.M.y, s.T.x - s.M.x)
        const nx = -Math.sin(ang)
        const ny = Math.cos(ang)
        for (let d = Math.floor(tail * len); d <= head * len; d++) {
          const cx = s.M.x + Math.cos(ang) * d
          const cy = s.M.y + Math.sin(ang) * d
          px(g, Math.round(cx), Math.round(cy), '#c0fff0')
          const ph = d * 0.22 - t * 26
          const R = 3 + 7 * (d / len)
          for (const [k, front, back] of [
            [1, '#40e0c8', '#2a8a80'],
            [-1, '#7a5af0', '#4a2ab0'],
          ] as const) {
            const o = Math.sin(ph) * R * k
            const col = Math.cos(ph) * k > 0 ? front : back
            const x = Math.round(cx + nx * o)
            const y = Math.round(cy + ny * o)
            rect(g, x, y, 2, 2, col)
          }
        }
      }
      // The vortex round the target: sparks orbiting, climbing its body.
      if (within(t, HIT, FINISH)) {
        const fs = s.tgt.size
        for (let k = 0; k < 12; k++) {
          const a = t * 10 + (k * Math.PI * 2) / 12
          const climb = ((k / 12 + (t - HIT) * 0.8) % 1) * fs.h * 0.9
          const x = Math.round(s.tgt.at.x + Math.cos(a) * fs.w * 0.45)
          const y = Math.round(s.tgt.at.y - climb + Math.sin(a) * 4)
          px(g, x, y, Math.sin(a) > 0 ? (k % 2 ? '#40e0c8' : '#7a5af0') : '#24145a')
          if (Math.sin(a) > 0.5) px(g, x, y - 1, '#ffffff')
        }
      }
      const q = span(t, FINISH, FINISH + 0.35)
      if (q > 0 && q < 1) {
        const R = Math.round(6 + 26 * ease.outC(q))
        g.drawImage(ring(R, 3, '#7a5af0', 1 - q), Math.round(s.T.x - R - 1), Math.round(s.T.y - R - 1))
        if (R > 8)
          g.drawImage(ring(R - 4, 1, '#40e0c8', 1 - q), Math.round(s.T.x - R + 3), Math.round(s.T.y - R + 3))
      }
      s.fx.draw(g)
      damagePop(g, s, p, s.T.x, t, HIT + 0.04)
      s.end(g)
      if (within(t, HIT, HIT + 2 / 60)) screenFlash(g, '#d8fff8', 0.4)
    },
    cues: () =>
      attackCues(HIT, p.status ? T_STATUS : null, [
        [0.3, () => fxSound('legend.pulse')],
        [ON, () => fxSound('fire.stream')],
        [FINISH, () => fxSound('psychic.slam')],
      ]),
  }
}

// ---------------------------------------------------------------- Dark: Dark Pulse, then Crunch
/** One jaw as a pixel map: four fangs hanging from a gum, outlined. The lower jaw is the same, upside down. */
function jaw(lower: boolean): Canvas {
  return cached(`jaw|${lower}`, () => {
    const W = 38
    const H = 12
    const inside = (x: number, y: number) => {
      if (x < 1 || x > W - 2 || y < 0 || y > H - 1) return false
      if (y < 3) return true
      const u = ((x - 1) % 9) / 8
      return y - 3 < 8 * (1 - Math.abs(u - 0.5) * 2)
    }
    return shade(W, H, (x, yy) => {
      const y = lower ? H - 1 - yy : yy
      if (!inside(x, y)) {
        const edge = inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1)
        return edge ? '#241820' : null
      }
      if (y < 2) return '#7a2a3a'
      if (y === 2) return '#241820'
      const u = ((x - 1) % 9) / 8
      return u < 0.4 ? '#ffffff' : u < 0.65 ? '#e8e0e8' : '#a898a8'
    })
  })
}

function darkAnim(p: AttackParams): Timeline<St<{ A: Point; T: Point }>> {
  const RINGS = [0.8, 0.92, 1.04, 1.16] as const
  const TRAVEL = 0.4
  const OPEN = 1.4
  const BITE = 1.68
  const T_STATUS = BITE + 0.45
  return {
    id: 'dark',
    dur: 3.6,
    setup() {
      const st = stage(p, 213, (st) => ({ A: st.atkAt(0.6, 0.45), T: st.tgtAt(0.5, 0.5) }))
      st.hit(RINGS[0] + TRAVEL, { stop: 0.05, shake: 2, dur: 0.4, tint: '#4a3444', screen: 1 })
      st.hit(BITE, { stop: 0.08, shake: 4, dur: 0.6, tint: '#7a6070', screen: 3 })
      return st
    },
    step(s, t, dt) {
      const at = edges(s, t)
      if (at(BITE)) {
        burst(s, s.T, {
          n: 14,
          colors: DARK,
          shapes: ['sq', 'star'],
          speed: [60, 150],
          push: 30,
          core: '#ffffff',
        })
        burst(s, s.T, { n: 6, colors: ['#4a3444', '#241820'], shapes: ['smoke'], speed: [20, 50], size1: 5 })
      }
      if (!s.step(t, dt)) return
      const r = s.r
      if (within(t, 0.3, 0.8) && Math.floor(t * 60) % 3 === 0)
        s.fx.add({
          x: s.atk.at.x + r.range(-s.atk.size.w * 0.4, s.atk.size.w * 0.4),
          y: s.atk.at.y - r.range(2, s.atk.size.h * 0.7),
          vy: -r.range(15, 30),
          life: 0.5,
          size: 2,
          size1: 4,
          shape: 'smoke',
          colors: ['#4a3444', '#241820'],
          density: 0.7,
        })
    },
    draw(g, s, t) {
      const dim = 0.45 * ease.outQ(span(t, 0.3, 0.8)) * (1 - span(t, BITE + 0.4, BITE + 1.0))
      s.begin(g, t)
      wash(g, '#100810', dim)
      const shadow = dim > 0.05 ? { color: '#100810', a: dim * 0.5 } : null
      const lunge = 4 * Math.sin(Math.PI * span(t, BITE - 0.15, BITE + 0.2))
      const knock = RINGS.some((t0) => within(t, t0 + TRAVEL, t0 + TRAVEL + 0.06)) ? 2 : 0
      const big = 5 * ease.outQ(span(t, BITE, BITE + 0.12)) * (1 - ease.ioS(span(t, BITE + 0.4, BITE + 0.8)))
      s.drawBoth(
        g,
        t,
        { dx: knock + Math.round(big), tint: statusTint(p, t, T_STATUS) ?? shadow },
        {
          dx: Math.round(lunge),
          outline: within(t, 0.3, RINGS[3]) && Math.floor(t * 15) % 2 ? '#7a6070' : undefined,
          tint: shadow,
        },
      )
      // The pulse: dark rings with a pale rim, swelling as they cross to the target.
      RINGS.forEach((t0) => {
        const q = span(t, t0, t0 + TRAVEL)
        if (q <= 0 || q >= 1) return
        const x = lerp(s.A.x, s.T.x, q)
        const y = lerp(s.A.y, s.T.y, q)
        const R = Math.round(5 + 11 * q)
        g.drawImage(ring(R, 3, '#241820'), Math.round(x - R - 1), Math.round(y - R - 1))
        g.drawImage(ring(R, 1, '#c8b8c8', 0.8), Math.round(x - R - 1), Math.round(y - R - 1))
      })
      // Crunch: the jaws open wide over the target (the wind-up), then snap shut.
      if (within(t, OPEN, BITE + 0.2)) {
        const open =
          t < BITE - 0.07
            ? 10 + 6 * ease.outQ(span(t, OPEN, BITE - 0.07))
            : 16 * (1 - span(t, BITE - 0.07, BITE))
        const shiver = t < BITE - 0.07 && Math.floor(t * 30) % 2 ? 1 : 0
        const x = Math.round(s.T.x - 19 + shiver)
        g.drawImage(jaw(false), x, Math.round(s.T.y - 11 - open))
        g.drawImage(jaw(true), x, Math.round(s.T.y - 1 + open))
      }
      const q = span(t, BITE, BITE + 0.3)
      if (q > 0 && q < 1) impactStar(g, s.T, Math.round(14 * ease.outBack(Math.min(1, q * 3))), t, DARK)
      s.fx.draw(g)
      damagePop(g, s, p, s.T.x, t, RINGS[0] + TRAVEL + 0.04)
      s.end(g)
      if (within(t, BITE, BITE + 2 / 60)) screenFlash(g, '#ffffff', 0.3)
    },
    cues: () =>
      attackCues(RINGS[0] + TRAVEL, p.status ? T_STATUS : null, [
        [0.3, () => fxSound('legend.pulse')],
        ...RINGS.map((t0) => [t0, () => fxSound('catch.throw')] as const),
        [OPEN, () => fxSound('impact.windup')],
        [BITE, () => fxSound('catch.break')],
      ]),
  }
}

// ---------------------------------------------------------------- Fairy: Moonblast
function fairyAnim(p: AttackParams): Timeline<St<{ Mo: Point; T: Point }>> {
  const FORM = 0.35
  const LAUNCH = 1.05
  const HIT = 1.4
  const T_STATUS = HIT + 0.6
  const moonAt = (s: { Mo: Point; T: Point }, t: number): Point => {
    if (t < LAUNCH) return { x: s.Mo.x, y: s.Mo.y + Math.round(Math.sin(t * 5)) }
    const q = ease.inQ(span(t, LAUNCH, HIT))
    return { x: lerp(s.Mo.x, s.T.x, q), y: lerp(s.Mo.y, s.T.y, q) }
  }
  return {
    id: 'fairy',
    dur: 3.8,
    setup() {
      // The moon rises over the attacker, kept on the stage for a tall sprite.
      const st = stage(p, 225, (st) => {
        const top = st.atkAt(0.5, 0)
        return { Mo: { x: top.x, y: Math.max(14, top.y - 14) }, T: st.tgtAt(0.5, 0.5) }
      })
      st.hit(HIT, { stop: 0.08, shake: 3, dur: 0.65, tint: '#ff8ac8', screen: 2 })
      return st
    },
    step(s, t, dt) {
      const at = edges(s, t)
      if (at(HIT)) {
        burst(s, s.T, {
          n: 8,
          colors: FAIRY.slice(2),
          shapes: ['heart'],
          speed: [50, 110],
          drag: 3,
          life: [0.6, 0.9],
        })
        burst(s, s.T, {
          n: 14,
          colors: FAIRY,
          shapes: ['star', 'px'],
          speed: [60, 150],
          size: [1, 3],
          core: '#ffffff',
        })
      }
      if (!s.step(t, dt)) return
      const r = s.r
      // Sparkles drift in to feed the moon.
      if (within(t, FORM, LAUNCH - 0.1) && Math.floor(t * 60) % 3 === 0) {
        const a = r() * Math.PI * 2
        const d = r.range(16, 26)
        s.fx.add({
          x: s.Mo.x + Math.cos(a) * d,
          y: s.Mo.y + Math.sin(a) * d,
          home: { x: s.Mo.x, y: s.Mo.y, k: 500 },
          life: 0.6,
          size: 2,
          shape: 'star',
          colors: FAIRY.slice(0, 4),
        })
      }
      if (within(t, LAUNCH, HIT) && Math.floor(t * 60) % 2 === 0) {
        const m = moonAt(s, t)
        s.fx.add({
          x: m.x + r.range(-4, 4),
          y: m.y + r.range(-4, 4),
          life: 0.35,
          size: r.int(1, 2),
          shape: 'star',
          colors: FAIRY.slice(0, 4),
        })
      }
      // Hearts float off the target afterwards.
      if (within(t, HIT + 0.2, 3.0) && Math.floor(t * 60) % 9 === 0) {
        const fs = s.tgt.size
        s.fx.add({
          x: s.tgt.at.x + r.range(-fs.w * 0.4, fs.w * 0.4),
          y: s.tgt.at.y - r.range(fs.h * 0.3, fs.h * 0.9),
          vx: r.range(-6, 6),
          vy: -r.range(14, 24),
          life: 0.9,
          shape: r() < 0.5 ? 'heart' : 'star',
          size: 1,
          colors: FAIRY.slice(1),
        })
      }
    },
    draw(g, s, t) {
      // Night falls for the moon: a stepped violet dim, lifted once it has burst.
      const dim = 0.35 * ease.outQ(span(t, 0.3, 0.8)) * (1 - span(t, HIT + 0.3, HIT + 0.9))
      s.begin(g, t)
      wash(g, '#2a1a4a', dim)
      s.drawBoth(
        g,
        t,
        { tint: statusTint(p, t, T_STATUS) },
        { tint: within(t, FORM, LAUNCH) && Math.floor(t * 12) % 2 ? { color: '#ffc8e8', a: 0.35 } : null },
      )
      if (within(t, FORM, HIT)) {
        const m = moonAt(s, t)
        const R = Math.round(1 + 8 * ease.outBack(span(t, FORM, LAUNCH - 0.15)))
        g.drawImage(glow(R + 6, '#ff8ac8', 1.4, 0.8), Math.round(m.x - R - 6), Math.round(m.y - R - 6))
        disc(g, m.x, m.y, R, '#ffc8e8')
        if (R > 2) {
          disc(g, m.x - 1, m.y - 1, R - 1, '#fff0f8')
          // Two craters, so it reads as a moon and not a ball.
          px(g, Math.round(m.x + R * 0.3), Math.round(m.y), '#ffc8e8')
          px(g, Math.round(m.x - R * 0.3), Math.round(m.y + R * 0.4), '#ffc8e8')
        }
      }
      const q = span(t, HIT, HIT + 0.4)
      if (q > 0 && q < 1) {
        const R = Math.round(6 + 28 * ease.outC(q))
        g.drawImage(ring(R, 3, '#ff8ac8', 1 - q), Math.round(s.T.x - R - 1), Math.round(s.T.y - R - 1))
        if (R > 8)
          g.drawImage(ring(R - 5, 1, '#ffffff', 1 - q), Math.round(s.T.x - R + 4), Math.round(s.T.y - R + 4))
      }
      s.fx.draw(g)
      damagePop(g, s, p, s.T.x, t, HIT + 0.04)
      s.end(g)
      if (within(t, HIT, HIT + 2 / 60)) screenFlash(g, '#fff0f8', 0.45)
    },
    cues: () =>
      attackCues(HIT, p.status ? T_STATUS : null, [
        [0.3, () => fxSound('psychic.focus')],
        [LAUNCH, () => fxSound('mega.orb')],
        [HIT, () => fxSound('evolve.burst')],
      ]),
  }
}

/**
 * The typed moves this file draws, by die type; attacks.ts merges them into its TYPED map. A function, not a const:
 * the two files import each other, and a hoisted function is ready whichever of them loads first.
 */
export function moreTyped() {
  return {
    normal: normalAnim,
    fighting: fightingAnim,
    flying: flyingAnim,
    poison: poisonAnim,
    ground: groundAnim,
    rock: rockAnim,
    bug: bugAnim,
    ghost: ghostAnim,
    steel: steelAnim,
    ice: iceAnim,
    dragon: dragonAnim,
    dark: darkAnim,
    fairy: fairyAnim,
  }
}
