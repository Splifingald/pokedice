// A Z-Move (docs/35), in three timelines. The power gathering: the stage dims, light of the attack's type rises off the
// attacker, a golden Z draws itself over it in three strokes and blazes. The strike: the type's own move, more powerful
// (each type its own Z variant, attacks.ts), with the Z's mark on its last hit — after a Flying, Ground or Water one,
// the attacker first comes back down out of the sky, up out of the ground or out of the water. And the going away for
// those three: it shoots up, sinks into the ground or dives. Short motion: flashes.
import { fxSound } from '@/audio/sfx'
import type { DieType } from '@/engine/types'
import { typeColor } from '@/theme/util'
import { ditherFill, ease, ellipse, lerp, line, span } from '../pixel'
import { drawSprite, spriteSize } from '../sprites'
import {
  H,
  screenFlash,
  screenShake,
  Stage,
  W,
  within,
  Z_GOLD,
  type Hud,
  type Side,
  type Timeline,
} from '../timeline'
import { attackTimeline } from './attacks'
import { burstRings } from './portal'

export interface ZMoveParams {
  own: string
  foe: string
  /** Who attacks. */
  side: Side
  /** The attack's type: the light's colour. */
  type: DieType
  short?: boolean
}

const GOLD = Z_GOLD
const GOLD_DEEP = '#c98a12'
/** When the Z blazes. */
const T_BLAZE = 0.95

/** The Z, drawn up to `prog` (0–1) along its three strokes, `k` its size in half-widths. */
function zSign(g: CanvasRenderingContext2D, cx: number, cy: number, k: number, prog: number, ink: string) {
  const pts: [number, number][] = [
    [cx - k, cy - k],
    [cx + k, cy - k],
    [cx - k, cy + k],
    [cx + k, cy + k],
  ]
  const n = pts.length - 1
  const upTo = prog * n
  for (let i = 0; i < n; i++) {
    const p = Math.max(0, Math.min(1, upTo - i))
    if (p <= 0) break
    const [x0, y0] = pts[i]!
    const [x1, y1] = pts[i + 1]!
    const x = lerp(x0, x1, p)
    const y = lerp(y0, y1, p)
    // A dark edge under a three-pixel stroke, so it reads over any sky.
    line(g, x0 + 1, y0 + 1, x + 1, y + 1, GOLD_DEEP, 3)
    line(g, x0, y0, x, y, ink, 3)
  }
}

export function zMoveTimeline(p: ZMoveParams): Timeline<Stage> {
  const aura = typeColor(p.type)
  const at = (s: Stage) => (p.side === 'own' ? s.L.own : s.L.foe)
  const other: Side = p.side === 'own' ? 'foe' : 'own'
  const keyOf = (side: Side) => (side === 'own' ? p.own : p.foe)
  if (p.short)
    return {
      id: 'zmove-short',
      dur: 0.6,
      setup: () => new Stage({ own: p.own, foe: p.foe }, 26),
      step: (s, t, dt) => void s.step(t, dt),
      draw(g, s, t) {
        s.begin(g, t)
        for (const side of ['foe', 'own'] as const) {
          const flash = side === p.side ? 1 - span(t, 0.1, 0.5) : 0
          drawSprite(
            g,
            keyOf(side),
            (side === 'own' ? s.L.own : s.L.foe).x,
            (side === 'own' ? s.L.own : s.L.foe).y,
            {
              flash,
              outline: side === p.side && t < 0.4 ? aura : undefined,
            },
          )
        }
        s.end(g)
      },
      cues: () => [[0.1, () => fxSound('z.blaze')]],
    }
  const DUR = T_BLAZE + 0.6
  return {
    id: 'zmove',
    dur: DUR,
    setup: () => {
      const s = new Stage({ own: p.own, foe: p.foe }, 26)
      s.screenShakes.push([T_BLAZE, 0.35, 2])
      return s
    },
    step(s, t, dt) {
      if (!s.step(t, dt) || t > T_BLAZE + 0.2 || s.r() > dt * 40) return
      // Light of the attack's type rises off the attacker as the power gathers.
      const L = at(s)
      const size = spriteSize(keyOf(p.side))
      s.fx.add({
        x: L.x + s.r.range(-size.w * 0.45, size.w * 0.45),
        y: L.y - s.r.range(0, size.h * 0.6),
        vy: -s.r.range(16, 34),
        life: s.r.range(0.4, 0.8),
        colors: ['#ffffff', aura, GOLD],
      })
    },
    draw(g, s, t) {
      s.begin(g, t)
      const dim = 0.5 * span(t, 0, 0.3) * (1 - span(t, T_BLAZE + 0.1, DUR))
      ditherFill(g, 0, 0, W, H, '#0b0f24', dim)
      const L = at(s)
      const size = spriteSize(keyOf(p.side))
      if (other === 'foe') drawSprite(g, p.foe, s.L.foe.x, s.L.foe.y)
      const c = { x: L.x, y: L.y - size.h / 2 }
      if (t >= T_BLAZE)
        burstRings(g, c, t, T_BLAZE, 64, [
          [0, GOLD],
          [0.1, aura],
          [0.2, '#ffffff'],
        ])
      // The attacker, outlined in its power, flashing white as the Z blazes.
      const glow = Math.floor(t * 12) % 2 ? aura : GOLD
      drawSprite(g, keyOf(p.side), L.x, L.y, {
        outline: t < T_BLAZE + 0.3 ? glow : undefined,
        flash: t >= T_BLAZE ? 1 - span(t, T_BLAZE, T_BLAZE + 0.25) : 0,
      })
      s.fx.draw(g)
      // The Z draws itself above the attacker in three strokes, then grows as it blazes and fades.
      const k =
        Math.max(8, Math.round(size.w * 0.28)) +
        (t >= T_BLAZE ? Math.round(10 * ease.outQ(span(t, T_BLAZE, DUR))) : 0)
      const zy = L.y - size.h - k - 4
      if (t < DUR - 0.15)
        zSign(g, L.x, Math.max(k + 2, zy), k, ease.outQ(span(t, 0.25, 0.85)), t >= T_BLAZE ? '#ffffff' : GOLD)
      if (other === 'own') drawSprite(g, p.own, s.L.own.x, s.L.own.y)
      if (within(t, T_BLAZE, T_BLAZE + 0.1)) screenFlash(g, '#ffffff', 0.7)
      s.end(g)
    },
    cues: () => [
      [0.1, () => fxSound('z.charge')],
      [T_BLAZE, () => fxSound('z.blaze')],
      [T_BLAZE, (hud) => hud.beat?.('zmove')],
    ],
  }
}

/** Where a Flying, Ground or Water Z-Move took the Pokémon (engine `ZAway`). */
export type ZAwayHow = 'fly' | 'dig' | 'dive'

const EARTH = ['#f2d7a0', '#c9955a', '#8a5a2e', '#4e3018']
const SPLASH = ['#ffffff', '#bfe9ff', '#5bb8f0', '#2a6fb8']
const WIND = ['#ffffff', '#e4f3ff', '#b7d8f0']

export interface ZAwayParams {
  own: string
  foe: string
  side: Side
  how: ZAwayHow
  short?: boolean
}

/** The Pokémon goes away: it shoots up off the top of the stage, sinks into the ground, or dives under the water. */
export function zAwayTimeline(p: ZAwayParams): Timeline<Stage> {
  const DUR = p.short ? 0.45 : 1.1
  const T_GO = p.short ? 0.05 : 0.3
  const keyOf = (side: Side) => (side === 'own' ? p.own : p.foe)
  return {
    id: p.short ? 'zaway-short' : `zaway-${p.how}`,
    dur: DUR,
    setup: () => new Stage({ own: p.own, foe: p.foe, by: p.side }, 77),
    step(s, t, dt) {
      if (!s.step(t, dt) || t < T_GO || s.r() > dt * 50) return
      const L = s.atk.at
      const w = s.atk.size.w
      const colors = p.how === 'fly' ? WIND : p.how === 'dig' ? EARTH : SPLASH
      s.fx.add({
        x: L.x + s.r.range(-w * 0.5, w * 0.5),
        y: L.y - s.r.range(0, 4),
        vx: s.r.range(-30, 30),
        vy: p.how === 'fly' ? s.r.range(10, 30) : -s.r.range(30, 70),
        ay: p.how === 'fly' ? 0 : 160,
        life: s.r.range(0.3, 0.6),
        colors,
      })
    },
    draw(g, s, t) {
      s.begin(g, t)
      const other: Side = p.side === 'own' ? 'foe' : 'own'
      const L = (side: Side) => (side === 'own' ? s.L.own : s.L.foe)
      const k = ease.inQ(span(t, T_GO, DUR - 0.1))
      const drawMine = () => {
        if (k >= 1) return
        const at = L(p.side)
        if (p.how === 'fly') {
          // Up and out of the top of the stage, with streaks of wind under it.
          const y = lerp(at.y, -10, k)
          drawSprite(g, keyOf(p.side), at.x, y, { sy: 1 + k * 0.3, sx: 1 - k * 0.2 })
          for (let i = 0; i < 4 && t > T_GO; i++)
            line(g, at.x - 8 + i * 5, y + 2, at.x - 8 + i * 5, y + 10 + i * 3, '#ffffff')
        } else
          drawSprite(g, keyOf(p.side), at.x, at.y, {
            sy: 1 - k,
            outline: p.how === 'dive' ? '#bfe9ff' : undefined,
          })
      }
      if (other === 'foe') drawSprite(g, p.foe, s.L.foe.x, s.L.foe.y)
      drawMine()
      if (other === 'own') drawSprite(g, p.own, s.L.own.x, s.L.own.y)
      // The hole, or the ring of water, it leaves at its feet.
      if (p.how !== 'fly' && t > T_GO) {
        const at = L(p.side)
        const r = Math.round(6 + 8 * ease.outQ(span(t, T_GO, DUR)))
        ellipse(g, at.x, at.y, r, Math.max(2, Math.round(r / 3)), p.how === 'dig' ? '#4e3018' : '#2a6fb8')
      }
      s.fx.draw(g)
      s.end(g)
    },
    cues: () => [
      [T_GO, () => fxSound(p.how === 'dive' ? 'water.jet' : p.how === 'dig' ? 'gift.land' : 'catch.throw')],
    ],
  }
}

export interface ZStrikeParams {
  own: string
  foe: string
  /** Who strikes. */
  side: Side
  type: DieType
  /** Shown as the damage number when the hit lands. */
  damage?: number | null
  /** Coming back from where a Flying, Ground or Water Z-Move took it. */
  from?: ZAwayHow
  short?: boolean
}

interface ZStrikeState {
  /** The comeback's stage, and the Z's own particles (the spray, the sparks of its mark). */
  back: Stage
  /** The type's move, as a Z-Move. */
  move: Stage
  /** When the move's last hit lands, on the strike's clock: the Z's mark. */
  fin: number
  prev: number
}

/**
 * A Z-Move's strike: (back first, from the sky, the ground or the water) the attack's own typed move, more powerful
 * (attacks.ts, `z`: more of it, bigger, harder, on a dimmed field with the attacker outlined in gold), and on its last
 * hit the Z's mark — a golden Z blazing on the target, rings of white, gold and the type's light, sparks, a white
 * flash. Short motion: the one hit, with the mark. The HP drains on the move's contact cue.
 */
export function zStrikeTimeline(p: ZStrikeParams): Timeline<ZStrikeState> {
  const aura = p.type === 'base' ? GOLD : typeColor(p.type)
  const T_BACK = p.from ? 0.5 : 0
  const move = attackTimeline({
    own: p.own,
    foe: p.foe,
    by: p.side,
    type: p.type,
    damage: p.damage,
    short: p.short,
    // Short motion stays a flash: the one hit, undimmed, with the Z's mark on it.
    z: p.short ? undefined : aura,
  }) as Timeline<Stage>
  const local = (t: number) => t - T_BACK
  return {
    id: `z-${move.id}${p.from ? `-${p.from}` : ''}`,
    dur: T_BACK + move.dur,
    setup() {
      const back = new Stage({ own: p.own, foe: p.foe, by: p.side, z: p.short ? undefined : aura }, 91)
      const s = move.setup()
      // Already dark from the comeback: the move's dim doesn't come down again.
      if (T_BACK) s.zIn = 0
      return { back, move: s, fin: T_BACK + (s.hits.length ? s.lastHit : 0.5), prev: -1 }
    },
    step(z, t, dt) {
      const p0 = z.prev
      z.prev = t
      const at = (t0: number) => p0 < t0 && t >= t0
      const fx = z.back
      const r = fx.r
      // Spawned before the hit-stop check, so the sparks hold still through the stop and then fly.
      if (at(z.fin)) {
        const c = z.move.tgtC
        for (let i = 0; i < (p.short ? 12 : 30); i++) {
          const a = r.range(0, Math.PI * 2)
          const v = r.range(40, 130)
          fx.fx.add({
            x: c.x,
            y: c.y,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v,
            drag: 2,
            life: r.range(0.4, 0.8),
            colors: ['#ffffff', GOLD, aura],
          })
        }
      }
      // The comeback's spray: dirt or water thrown up where it bursts out.
      if (p.from && p.from !== 'fly' && at(T_BACK * 0.4)) {
        const L = fx.atk.at
        for (let i = 0; i < 16; i++)
          fx.fx.add({
            x: L.x + r.range(-10, 10),
            y: L.y,
            vx: r.range(-40, 40),
            vy: -r.range(60, 120),
            ay: 220,
            life: r.range(0.4, 0.7),
            colors: p.from === 'dig' ? EARTH : SPLASH,
          })
      }
      if (t < T_BACK) {
        fx.step(t, dt)
        return
      }
      move.step(z.move, local(t), dt)
      if (!z.move.stopped(local(t))) fx.fx.update(dt)
    },
    draw(g, z, t) {
      if (t < T_BACK) {
        // The comeback: down out of the sky, or up out of the ground or the water, outlined in its power.
        const s = z.back
        s.begin(g, t)
        const k = ease.outQ(span(t, 0, T_BACK))
        const A = s.atk.at
        s.drawBoth(g, t, {}, p.from === 'fly' ? { dy: Math.round(lerp(-A.y - 10, 0, k)) } : { sy: k })
        s.end(g)
      } else move.draw(g, z.move, local(t))
      // The Z's mark on the last hit, shaken with the stage.
      const sh = screenShake(local(t), z.move.screenShakes)
      g.save()
      g.translate(sh.x, sh.y)
      const c = z.move.tgtC
      if (t >= z.fin)
        burstRings(g, c, t, z.fin, p.short ? 40 : 90, [
          [0, '#ffffff'],
          [0.08, GOLD],
          [0.16, aura],
        ])
      const q = span(t, z.fin, z.fin + 0.5)
      // Blinking out over its last frames, never a fade.
      if (q > 0 && q < 1 && (q < 0.7 || Math.floor(t * 30) % 2)) {
        const k = Math.round(lerp(6, p.short ? 10 : 16, ease.outQ(q)))
        zSign(g, c.x, c.y, k, 1, q < 0.15 ? '#ffffff' : GOLD)
      }
      z.back.fx.draw(g)
      g.restore()
      if (within(t, z.fin, z.fin + 0.1)) screenFlash(g, '#ffffff', 0.7)
    },
    cues: (z) =>
      [
        ...(p.from
          ? [
              [
                0.05,
                () =>
                  fxSound(p.from === 'dive' ? 'water.jet' : p.from === 'dig' ? 'gift.land' : 'catch.throw'),
              ] as const,
            ]
          : []),
        ...move.cues(z.move).map(([t0, fire]) => [t0 + T_BACK, (hud: Hud) => fire(hud, z.move)] as const),
        [z.fin, () => fxSound('z.blaze')] as const,
      ].sort((a, b) => a[0] - b[0]),
  }
}
