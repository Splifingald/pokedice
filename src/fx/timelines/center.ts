// The Pokémon Center: a Poké Ball per team member (nothing else on the machine) drops into the healing machine, the six-beat jingle lights them in turn
// (each note spikes the heart monitor), they flash together, the team is healed, Chansey hops, the balls lift out.
// Short motion: the balls are already in place, one flash, healed.
import { fxSound } from '@/audio/sfx'
import { ease, ellipse, glow, lerp, Particles, px, rect, rng, span, wash, type Rng } from '../pixel'
import { ball, center, CENTER, SLOTS } from '../scenes'
import { drawSprite } from '../sprites'
import { H, screenFlash, STEP, W, within, type Cue, type Timeline } from '../timeline'

export interface CenterParams {
  /** How many balls go on the machine (the team's size, 1–3). */
  balls: number
  /** Chansey's front sprite key, behind the counter. */
  nurse: string
  short?: boolean
}


interface S {
  r: Rng
  fx: Particles
}

export function centerTimeline(p: CenterParams): Timeline<S> {
  const n = Math.max(1, Math.min(SLOTS.length, p.balls))
  const slots = SLOTS.slice(0, n)
  const short = !!p.short
  const PLACE = (i: number) => (short ? 0 : 0.7 + i * 0.3)
  // Six beats, or a single flash when short.
  const NOTES = short ? [0.45] : [2.1, 2.35, 2.6, 2.85, 3.2, 3.55]
  const LAST = NOTES[NOTES.length - 1]!
  const T_HEAL = LAST + 0.1
  const T_JOY = LAST + 0.35
  const LIFT = (i: number) => (short ? 1.0 + i * 0.08 : 4.7 + i * 0.15)
  const dur = short ? 1.6 : 6.4
  const seat = (k: number) => k % n
  return {
    id: 'center',
    dur,
    setup: () => ({ r: rng(5), fx: new Particles() }),
    step(s, t, dt) {
      s.fx.update(dt)
      const r = s.r
      NOTES.forEach((tn, i) => {
        if (t >= tn && t < tn + STEP * 1.5) {
          const [x, y] = slots[seat(i)]!
          s.fx.add({
            x: x + 2,
            y: y - 6,
            vx: r.range(-6, 6),
            vy: -26,
            life: 1.1,
            shape: 'note',
            colors: [CENTER.light, CENTER.light, '#ffffff'],
          })
        }
      })
      if (t >= LAST && t < LAST + STEP * 1.5)
        for (let k = 0; k < 14; k++)
          s.fx.add({
            x: r.range(90, 150),
            y: r.range(80, 96),
            vx: r.range(-12, 12),
            vy: -r.range(20, 45),
            drag: 0.6,
            life: r.range(1.0, 1.6),
            shape: k % 3 ? 'heart' : 'cross',
            colors: k % 3 ? ['#ff7aa0', '#ff9ab8'] : ['#4ad07a'],
          })
      if (!short)
        slots.forEach(([x, y], i) => {
          if (t >= PLACE(i) + 0.22 && t < PLACE(i) + 0.22 + STEP * 1.5)
            s.fx.add({ x, y: y - 3, life: 0.2, size: 3, size1: 1, shape: 'star', colors: ['#ffffff'] })
        })
    },
    draw(g, s, t) {
      const P = CENTER
      const bg = center(W, H)
      g.drawImage(bg, 0, 0)
      // Heart monitor: a scrolling trace that spikes on each note.
      for (let x = 35; x < 69; x++) {
        const ts = t - (69 - x) * 0.012
        let v = 0
        for (const tn of NOTES) {
          const d = ts - tn
          if (d > 0 && d < 0.08) v = Math.max(v, Math.round(Math.sin((d / 0.08) * Math.PI * 2) * 7))
        }
        const beat = ts > 0.3 ? Math.round(Math.max(0, Math.sin(ts * 7.5) - 0.92) * 30) : 0
        px(g, x, 33 - v - beat, P.light)
      }
      if (t > T_JOY) {
        // Done: a heart on the monitor.
        const m = ['.x.x.', 'xxxxx', 'xxxxx', '.xxx.', '..x..']
        for (let r = 0; r < 5; r++)
          for (let q = 0; q < 5; q++) if (m[r]![q] === 'x') px(g, 62 + q, 24 + r, '#ff7aa0')
      }
      // Chansey behind the counter, hopping when it's done.
      const hop =
        t > T_JOY && t < T_JOY + 0.5 ? -Math.round(Math.abs(Math.sin((t - T_JOY) * Math.PI * 4)) * 4) : 0
      drawSprite(g, p.nurse, 194, 106 + hop)
      g.drawImage(bg, 0, 100, W, H - 100, 0, 100, W, H - 100)
      if (within(t, LAST, LAST + 0.7)) {
        // The heal bloom sits behind the balls, so the balls stay crisp on top of it.
        const q = span(t, LAST, LAST + 0.7)
        g.drawImage(glow(40, '#ffe0ec', 1.5, 0.8 * (1 - q)), 120 - 40, 92 - 40)
      }
      // Light bar on top of the machine.
      const pulse = NOTES.some((tn) => within(t, tn, tn + 0.12)) || within(t, LAST, LAST + 0.5)
      rect(
        g,
        106,
        77,
        28,
        3,
        pulse ? '#ffffff' : t > NOTES[0]! - 0.1 && t < T_HEAL + 0.2 ? P.light : P.machine[0],
      )
      // The balls.
      slots.forEach(([x, y], i) => {
        const t0 = PLACE(i)
        if (t < t0) return
        const lift = span(t, LIFT(i), LIFT(i) + 0.3)
        if (lift >= 1) return
        if (lift > 0.5 && Math.floor(t * 30) % 2) return
        const drop = short ? 1 : ease.outBounce(span(t, t0, t0 + 0.25))
        const by = lerp(y - 30, y - 2, drop) - 26 * ease.inQ(lift)
        const lit = short || t > t0 + 0.22
        if (lit && lift === 0) ellipse(g, x, y + 1, 5, 2, P.light)
        const k = NOTES.findIndex((tn) => within(t, tn, tn + 0.15))
        const flash = (k >= 0 && seat(k) === i) || within(t, LAST, LAST + 0.3)
        const im = ball('poke', 0, { R: 5, button: flash ? '#ffffff' : lit ? P.light : '#ffffff' })
        if (flash) g.drawImage(glow(9, '#ffffff', 1.6, 0.85), x - 9, Math.round(by - 9))
        g.drawImage(im, Math.round(x - im.width / 2), Math.round(by - im.height / 2))
        if (flash && k >= 0 && seat(k) === i) rect(g, x - 1, Math.round(by) - 1, 2, 2, '#ffffff')
      })
      s.fx.draw(g)
      if (!short && t < 0.5) wash(g, '#ffffff', 1 - span(t, 0, 0.5))
      if (within(t, LAST, LAST + 2 / 60)) screenFlash(g, '#ffe6f0', 0.5)
    },
    cues: () => {
      const c: Cue<S>[] = [
        [T_HEAL, (hud) => hud.heal?.()],
        [T_JOY, (hud) => hud.beat?.('healed')],
      ]
      if (!short) slots.forEach((_, i) => c.push([PLACE(i) + 0.22, () => fxSound('center.place', i)]))
      NOTES.forEach((tn, i) => c.push([tn, () => fxSound('center.note', short ? 5 : i)]))
      return c.sort((a, b) => a[0] - b[0])
    },
  }
}
