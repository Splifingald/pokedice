// A boss's own entrance on the battle stage (docs/53): the scene is each legend's (Raikou's storm, Celebi's shrine…);
// what follows its reveal is the same for all, as legend.ts's entrance has it: the burst and rings in its colours, the
// letterbox and the name card, its place dissolving into the battle's own ground, the HUD's cues, your Pokémon sent out.
import { fxSound } from '@/audio/sfx'
import { ease, rect, rng, span, wash, type G, type Rng } from '../../pixel'
import { ball } from '../../scenes'
import { drawSprite, spriteSize } from '../../sprites'
import {
  H,
  quad,
  screenFlash,
  skippingNow as skippingSound,
  Stage,
  STEP,
  W,
  within,
  type Cue,
  type Timeline,
} from '../../timeline'
import { banner, type LegendParams } from '../legend'
import { burstRing, inOrder, type Cinema } from './kit'

export interface BossScene<X> {
  id: string
  /** When it shows itself (s): the name card and the rest follow it. */
  reveal: number
  seed: number
  /** Its light to dark colours: the outline after the reveal, the burst, the rings. */
  aura: readonly [string, string, string, string]
  /** Its flash on the reveal. */
  flash?: string
  /** The two rings of light bursting from it on the reveal; false: none (a scene whose own burst says it). */
  rings?: boolean
  setup(st: Stage, r: Rng): X
  step(s: Stage & X, t: number, dt: number): void
  /** The scene behind the legend; `k` how much of it is left (1 until it dissolves into the battle's ground). */
  back(g: G, s: Stage & X, t: number, k: number): void
  /** The legend before its reveal (a silhouette running, a light…). */
  before(g: G, s: Stage & X, t: number): void
  /** What stands in front of it (foreground, weather), at the same `k`. */
  front?(g: G, s: Stage & X, t: number, k: number): void
  /** The scene's sounds, by time. */
  sounds: readonly (readonly [number, () => void])[]
}

/** The timings after the reveal, as legend.ts has them (its card, the fade, the HUD, the send-out). */
export const after = (reveal: number) => {
  const banner = reveal + 0.35
  const out = reveal + 1.55
  const hud = out + 0.5
  const send = hud + 0.65
  const pop = send + 0.35
  return { banner, fade: reveal + 1.25, out, hud, send, pop, dur: pop + 1.6 }
}

export type BossCinema = Cinema & { makeBattle(p: LegendParams): Timeline<unknown> }

export function bossCinema<X>(spec: BossScene<X>): BossCinema {
  const T = after(spec.reveal)
  const R = spec.reveal
  const A = spec.aura
  const makeBattle = (p: LegendParams): Timeline<Stage & X> => ({
    id: spec.id,
    dur: T.dur,
    setup() {
      const st = new Stage({ ...p, by: 'own' }, spec.seed)
      return Object.assign(st, spec.setup(st, rng(spec.seed)))
    },
    step(s, t, dt) {
      s.step(t, dt)
      spec.step(s, t, dt)
      const r = s.r
      const fz = spriteSize(p.foe)
      if (t >= R && t < R + STEP * 1.5)
        for (let k = 0; k < 40; k++) {
          const a = r() * Math.PI * 2
          const v = r.range(40, 140)
          s.fx.add({
            x: s.L.foe.x,
            y: s.L.foe.y - fz.h / 2,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v,
            drag: 2.5,
            life: r.range(0.5, 0.9),
            size: r.int(1, 2),
            shape: r() < 0.6 ? 'star' : 'sq',
            colors: [...A],
          })
        }
      if (t >= T.pop && t < T.pop + STEP * 1.5)
        for (let k = 0; k < 12; k++) {
          const a = r() * Math.PI * 2
          s.fx.add({
            x: s.L.own.x,
            y: s.L.own.y - 50,
            vx: Math.cos(a) * 70,
            vy: Math.sin(a) * 50,
            drag: 4,
            life: 0.4,
            size: 1,
            shape: 'plus',
            colors: ['#ffffff', '#ffd0d8'],
          })
        }
    },
    draw(g, s, t) {
      g.drawImage(s.bg.cv, 0, 0)
      s.bg.dyn(g, t)
      const k = 1 - span(t, T.fade, T.out)
      spec.back(g, s, t, k)
      const fz = spriteSize(p.foe)
      if (t < R) spec.before(g, s, t)
      else
        drawSprite(g, p.foe, s.L.foe.x, s.L.foe.y + Math.round(Math.sin((t - R) * 2.5) * 1.5) - 1, {
          flash: Math.max(0, 1 - span(t, R + 0.05, R + 0.4)),
          outline: t < T.out ? (Math.floor(t * 8) % 2 ? A[1] : A[2]) : undefined,
        })
      const cy = s.L.foe.y - fz.h / 2
      if (spec.rings !== false) {
        burstRing(g, s.L.foe.x, cy, span(t, R, R + 0.5), 100, 2, A[0])
        burstRing(g, s.L.foe.x, cy, span(t, R + 0.1, R + 0.6), 120, 2, A[2])
      }
      if (t >= T.send && t < T.pop) {
        const q = span(t, T.send, T.pop)
        const b = quad(
          { x: -8, y: H + 8 },
          { x: s.L.own.x - 10, y: H * 0.35 },
          { x: s.L.own.x, y: s.L.own.y - 50 },
          ease.outQ(q),
        )
        const im = ball('poke', -q * 12)
        g.drawImage(im, Math.round(b.x - im.width / 2), Math.round(b.y - im.height / 2))
      }
      if (t >= T.pop) {
        const kk = ease.outBack(span(t, T.pop, T.pop + 0.22), 2.2)
        s.drawAttacker(g, { sx: kk, sy: kk, flash: 1 - span(t, T.pop + 0.1, T.pop + 0.45) })
      }
      s.fx.draw(g)
      spec.front?.(g, s, t, k)
      if (within(t, R, R + 0.3)) screenFlash(g, spec.flash ?? '#ffffff', 0.75 * (1 - span(t, R, R + 0.3)))
      if (t < 0.5) wash(g, '#000000', 1 - span(t, 0, 0.5), 8)
      const bars = Math.round(
        16 * (ease.outC(span(t, T.banner - 0.15, T.banner + 0.1)) - ease.inC(span(t, T.out, T.out + 0.4))),
      )
      if (bars > 0) {
        rect(g, 0, 0, W, bars, '#05030a')
        rect(g, 0, H - bars, W, bars, '#05030a')
      }
      if (p.name && within(t, T.banner, T.out + 0.3))
        banner(
          g,
          t,
          { ...p, look: { ...p.look, aura: A } },
          span(t, T.banner, T.banner + 0.28),
          span(t, T.out - 0.05, T.out + 0.25),
          T.banner + 0.4,
        )
    },
    cues: () =>
      inOrder([
        ...spec.sounds.map(([at, f]) => [at, () => void (!skippingSound() && f())] as const),
        [T.hud, (hud) => (hud.show?.('foe', true), hud.beat?.('appeared'))],
        [T.send, (hud) => hud.beat?.('sendOut')],
        [T.pop, (hud) => (hud.show?.('own', true), fxSound('ball.pop'))],
      ] satisfies Cue<Stage & X>[]),
  })
  const cinema: BossCinema = {
    reveal: R,
    dur: T.dur,
    // On a stage of its own (the FX lab): the scene with no card and nobody sent out.
    make: (p) =>
      makeBattle({
        own: '',
        foe: p.mon,
        look: { aura: A, fx: 'psy', night: '#000000' },
        name: '',
        level: '',
        types: '',
      }) as Timeline<unknown>,
    makeBattle: (p) => makeBattle(p) as Timeline<unknown>,
  }
  return cinema
}
