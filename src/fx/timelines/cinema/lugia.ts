// Lugia's raid entrance (docs/53): the Whirl Islands at night. A storm on the open sea: heavy swells, rain, the
// islands' black rocks, lightning far off. Then the sea falls still: the waves flatten, the rain stops in mid-air, the
// moon breaks through and lays a silver road on the water. A whirlpool opens in the middle, light rising from the deep
// under it; the water bulges and bursts upward in a tower of spray, and Lugia rises out of it, wings spread, the sea
// pouring off them. The reveal's wind ring; it hovers over the whirlpool, the spray falling back.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  canvas,
  ease,
  ellipse,
  ellipseLine,
  glow,
  lerp,
  Particles,
  rect,
  rng,
  span,
  wash,
  type Canvas,
} from '../../pixel'
import { drawSprite, spriteSize } from '../../sprites'
import { screenFlash, screenShake, skippingNow, within, type Cue, type Timeline } from '../../timeline'
import { drawRays } from '../legend'
import { AFTER_REVEAL, burstRing, dGradient, inOrder, tri, type Cinema, type CinemaParams } from './kit'

const T_CALM = 1.5
const T_MOON = 2.1
const T_WHIRL = 2.6
const T_BURST = 3.75
const REVEAL = 4.6
const DUR = REVEAL + AFTER_REVEAL

const AURA = ['#ffffff', '#e0ecff', '#8ab0e0', '#2a4a78'] as const

type S = {
  r: ReturnType<typeof rng>
  rain: Particles
  fx: Particles
  sky: Canvas
  rocks: Canvas
  rays: Canvas
  shakes: [number, number, number][]
  frozen: boolean
}

export const lugiaCinema: Cinema = {
  reveal: REVEAL,
  dur: DUR,
  make(p: CinemaParams): Timeline<S> {
    const w = p.w ?? 240
    const h = p.h ?? 160
    const cx = Math.round(w / 2)
    const sea = Math.round(h * 0.6)
    const feet = Math.round(h * 0.56)
    const moon = { x: Math.round(w * 0.28), y: Math.round(h * 0.13) }
    const many = p.short ? 0.4 : 1
    const sz = spriteSize(p.mon)
    const quiet = (f: () => void) => () => void (!skippingNow() && f())
    return {
      id: 'cinema-lugia',
      dur: DUR,
      setup() {
        const r = rng(249)
        const sky = dGradient(w, sea, ['#03050c', '#081226', '#0e1e3a', '#16304e'])
        // The moon (hidden behind cloud until it breaks through: drawn live), stars.
        for (let i = 0; i < 40; i++)
          rect(sky.g, r.range(0, w), r.range(0, sea * 0.6), 1, 1, r() < 0.2 ? '#ffffff' : '#6a88b8')
        // The Whirl Islands: black rocks rising from the sea, both sides.
        const rocks = canvas(w, h)
        for (const side of [-1, 1])
          for (let k = 0; k < 3; k++) {
            const x = Math.round(cx + side * (w * 0.3 + k * w * 0.16))
            const top = sea - Math.round(h * (0.16 - k * 0.04))
            const half = Math.round(w * 0.08 + k * 6)
            tri(rocks.g, x - half, sea + 1, x + half, sea + 1, x + side * 4, top, k ? '#0a1424' : '#060c18')
            tri(rocks.g, x - side * half, sea + 1, x + side * 4, top, x, sea + 1, k ? '#14223a' : '#0c1628')
          }
        return {
          r,
          rain: new Particles(),
          fx: new Particles(),
          sky,
          rocks,
          rays: canvas(w, h),
          frozen: false,
          shakes: p.short
            ? []
            : [
                [T_BURST, 0.8, 4],
                [REVEAL, 0.6, 3],
              ],
        }
      },
      step(s, t, dt) {
        const r = s.r
        // The rain: falling, then held still in the air while the sea is calm, then gone.
        if (t < T_CALM) {
          s.rain.update(dt)
          for (let i = 0; i < 3; i++)
            if (r() < many)
              s.rain.add({
                x: r.range(0, w + 60),
                y: -6,
                vx: -60,
                vy: r.range(240, 300),
                life: 2,
                size: 1,
                shape: 'streak',
                trail: 0.03,
                colors: ['#5a7aa8', '#8aa8d8'],
              })
        } else if (t > T_WHIRL + 0.4) s.rain.update(dt * 2)
        if (t > T_WHIRL + 0.4 && !s.frozen) {
          s.frozen = true
          for (const d of s.rain.list) d.life = d.age + 0.3
        }
        s.fx.update(dt)
        // Light rising from the deep under the whirlpool.
        if (t > T_WHIRL && t < T_BURST && r() < 0.6 * many)
          s.fx.add({
            x: cx + r.range(-30, 30),
            y: sea + r.range(4, h - sea),
            vy: -r.range(10, 30),
            life: 0.8,
            size: 1,
            shape: 'px',
            colors: ['#ffffff', '#c8e0ff', '#8ab0e0'],
          })
        // The burst: the sea thrown up, then pouring back.
        if (within(t, T_BURST, T_BURST + dt))
          for (let i = 0; i < 140 * many; i++) {
            const a = -Math.PI / 2 + r.range(-0.5, 0.5)
            const v = r.range(100, 300)
            s.fx.add({
              x: cx + r.range(-16, 16),
              y: sea,
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v,
              ay: 260,
              life: r.range(1, 1.8),
              size: r.int(1, 2),
              shape: r() < 0.5 ? 'drop' : 'sq',
              colors: ['#ffffff', '#c8e0ff', '#8ab0e0', '#3a6aa8'],
            })
          }
        // The sea pouring off its wings as it rises.
        if (t > T_BURST && t < REVEAL + 1 && r() < 0.9 * many)
          s.fx.add({
            x: cx + r.range(-sz.w * 0.55, sz.w * 0.55),
            y: lerp(sea + 20, feet, ease.outC(span(t, T_BURST, REVEAL))) - r.range(sz.h * 0.3, sz.h * 0.8),
            vy: r.range(0, 30),
            ay: 300,
            life: 1,
            size: 1,
            shape: 'drop',
            colors: ['#ffffff', '#c8e0ff', '#8ab0e0'],
          })
        if (within(t, REVEAL, REVEAL + dt))
          for (let k = 0; k < 50 * many; k++) {
            const a = r() * Math.PI * 2
            const v = r.range(60, 180)
            s.fx.add({
              x: cx,
              y: feet - 30,
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v * 0.6,
              drag: 2.5,
              life: r.range(0.5, 1),
              size: r.int(1, 2),
              shape: r() < 0.5 ? 'star' : 'oval',
              colors: [...AURA],
            })
          }
      },
      draw(g, s, t) {
        const sh = screenShake(t, s.shakes)
        g.fillStyle = '#03050c'
        g.fillRect(0, 0, w, h)
        g.save()
        g.translate(sh.x, sh.y)
        g.drawImage(s.sky, 0, 0)
        // Clouds racing in the storm, parting for the moon once it is calm.
        const part = span(t, T_MOON, T_MOON + 0.8)
        if (part < 1) {
          const cov = 1 - part
          for (let i = 0; i < 14; i++) {
            const x = ((i * 53 + t * (t < T_CALM ? 40 : 6)) % (w + 80)) - 40
            const y = 6 + ((i * 17) % Math.round(sea * 0.5))
            if (cov * 14 > i) ellipse(g, x, y, 26 + (i % 4) * 6, 7, i % 2 ? '#0c162a' : '#121e36')
          }
        }
        if (part > 0) {
          const gr = Math.round(18 + 10 * part)
          g.drawImage(glow(gr, '#c8e0ff', 1.4, 0.55 * part), moon.x - gr, moon.y - gr)
          ellipse(g, moon.x, moon.y, 8, 8, '#f0f6ff')
          ellipse(g, moon.x + 3, moon.y - 2, 2, 2, '#d0e0f4')
        }
        // Lightning far off, while the storm lasts.
        for (const at of [0.55, 1.2])
          if (within(t, at, at + 0.1)) {
            const b = rng(Math.round(at * 10))
            let x = w * (at < 1 ? 0.8 : 0.15)
            for (let y = 0; y < sea - 10; y += 4) {
              const nx = x + b.range(-4, 4)
              rect(g, Math.round(nx), y, 1, 4, '#e0e8ff')
              x = nx
            }
          }
        g.drawImage(s.rocks, 0, 0)
        // The sea: swells while it storms, flat as glass once calm; the moon's road; the whirlpool.
        const calm = ease.ioS(span(t, T_CALM, T_CALM + 0.6))
        const swell = (1 - calm) * 5
        for (let y = sea; y < h; y++) {
          const d = (y - sea) / (h - sea)
          rect(g, 0, y, w, 1, y % 3 ? '#0c1c34' : d < 0.3 ? '#16304e' : '#0a1628')
        }
        for (let row = 0; row < 12; row++) {
          const y = sea + 2 + Math.round((row / 12) ** 1.4 * (h - sea - 2))
          const len = 4 + row
          for (let x = (row * 17 + Math.round(t * 20 * (1 - calm))) % (len * 3); x < w; x += len * 3) {
            const yy = y + Math.round(Math.sin(x / 9 + t * 4 + row) * swell * (0.4 + row / 12))
            rect(g, x, yy, len, 1, calm > 0.5 ? '#2a4a70' : '#3a5a88')
          }
        }
        rect(g, 0, sea, w, 1, '#3a5a88')
        if (part > 0)
          for (let y = sea + 1; y < h; y += 2) {
            const wob = Math.round(Math.sin(y * 1.3 + t * 3) * 2)
            rect(
              g,
              moon.x - 4 + wob - Math.round((y - sea) * 0.1),
              y,
              8 + Math.round((y - sea) * 0.2),
              1,
              part > 0.6 ? '#c8e0ff' : '#5a7aa8',
            )
          }
        const wq = span(t, T_WHIRL, T_BURST) * (1 - span(t, REVEAL + 0.6, REVEAL + 2))
        if (wq > 0) {
          const R = Math.round(Math.min(w * 0.42, 70) * Math.min(1, wq * 1.6))
          g.drawImage(
            glow(Math.round(R * 0.7), '#8ab0e0', 1.2, 0.6 * wq),
            cx - Math.round(R * 0.7),
            sea + 10 - Math.round(R * 0.7),
          )
          for (let k = 0; k < 5; k++) {
            const rr = Math.round(R * (1 - k * 0.18))
            const a0 = t * (3 + k) + k
            if (rr > 2)
              ellipseLine(
                g,
                cx,
                sea + 10,
                rr,
                Math.max(1, Math.round(rr * 0.16)),
                k % 2 ? '#c8e0ff' : '#5a7aa8',
                a0,
                a0 + Math.PI * 1.3,
              )
          }
        }
        s.rain.draw(g)
        // The calm is a held breath: everything a little darker until it bursts.
        if (t > T_CALM && t < T_BURST) wash(g, '#02040a', 0.25 * span(t, T_CALM, T_CALM + 0.5), 8)
        // The tower of water, and Lugia rising in it.
        if (t > T_BURST - 0.25 && t < REVEAL + 0.4) {
          const up = ease.outC(span(t, T_BURST - 0.25, T_BURST + 0.2))
          const fade = 1 - span(t, REVEAL - 0.2, REVEAL + 0.4)
          const top = Math.round(lerp(sea, -10, up))
          for (let y = top; y < sea + 4; y++) {
            const half = Math.round((10 + Math.sin(y / 5 + t * 30) * 2 + (sea - y) * 0.06) * fade)
            if (half <= 0) continue
            rect(g, cx - half, y, half * 2, 1, (y + Math.floor(t * 40)) % 5 ? '#c8e0ff' : '#ffffff')
            rect(g, cx - half, y, 1, 1, '#8ab0e0')
            rect(g, cx + half - 1, y, 1, 1, '#8ab0e0')
          }
        }
        if (t >= T_BURST && t < REVEAL) {
          const y = Math.round(lerp(sea + sz.h, feet, ease.outC(span(t, T_BURST, REVEAL - 0.1))))
          drawSprite(g, p.mon, cx, y, { sil: '#0a1428', outline: Math.floor(t * 12) % 3 ? AURA[1] : AURA[0] })
        }
        if (t >= REVEAL) {
          const k = span(t, REVEAL, REVEAL + 0.4) * lerp(0.6, 0.25, span(t, REVEAL + 0.4, REVEAL + 1.4))
          drawRays(s.rays, { x: cx, y: feet - 30 }, t, AURA[2], k)
          g.drawImage(s.rays, 0, 0)
          const bob = Math.round(Math.sin((t - REVEAL) * 1.8) * 2)
          drawSprite(g, p.mon, cx, feet + bob, {
            flash: Math.max(0, 1 - span(t, REVEAL + 0.05, REVEAL + 0.45)),
            outline: Math.floor(t * 8) % 2 ? AURA[1] : AURA[2],
          })
        }
        for (const [d, c] of [
          [0, AURA[0]],
          [0.1, AURA[1]],
          [0.22, AURA[2]],
        ] as const)
          burstRing(g, cx, feet - 30, span(t, REVEAL + d, REVEAL + d + 0.6), Math.max(w, h) * 0.75, 3, c)
        s.fx.draw(g)
        g.restore()
        for (const at of [0.55, 1.2]) if (within(t, at, at + 0.1)) screenFlash(g, '#c8d8ff', 0.25)
        if (within(t, T_BURST, T_BURST + 0.2))
          screenFlash(g, '#e0ecff', 0.6 * (1 - span(t, T_BURST, T_BURST + 0.2)))
        if (within(t, REVEAL, REVEAL + 0.35))
          screenFlash(g, '#ffffff', 0.9 * (1 - span(t, REVEAL, REVEAL + 0.35)))
        if (t < 0.5) wash(g, '#000000', 1 - span(t, 0, 0.5), 8)
      },
      cues: () =>
        inOrder([
          [0.02, quiet(() => hiss(1.6, { freq: 1600, type: 'highpass', vol: 0.03 }))],
          [0.05, quiet(() => hiss(1.5, { freq: 220, type: 'lowpass', vol: 0.07 }))],
          [0.65, quiet(() => hiss(1, { freq: 140, type: 'lowpass', vol: 0.07 }))],
          [T_CALM, quiet(() => tone(659, 1.4, { type: 'sine', vol: 0.025 }))],
          [T_MOON, quiet(() => tone(988, 1.2, { type: 'sine', vol: 0.02 }))],
          [T_WHIRL, quiet(() => hiss(1.2, { freq: 300, slide: 900, vol: 0.07 }))],
          [3.15, quiet(() => fxSound('legend.heart'))],
          [3.45, quiet(() => fxSound('legend.heart'))],
          [T_BURST, quiet(() => (fxSound('water.jet'), hiss(1, { freq: 250, type: 'lowpass', vol: 0.14 })))],
          [REVEAL, (hud) => (quiet(() => fxSound('legend.roar'))(), hud.beat?.('roar'))],
        ] satisfies Cue<S>[]),
    }
  },
}
