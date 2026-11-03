// Ho-Oh's raid entrance (docs/53): the Bell Tower before dawn. A still violet sky, the last stars, the tower's tiers
// black against it, a lamp in each. Its bells ring, three times, gold rings of sound going out; the sun rises behind
// the tower and the sky warms; its rays fan out and a faint rainbow draws itself across the sky. Golden feathers drift
// down; a golden shape crosses the sun, circles the tower's top in a trail of sparks and swoops down before it, its
// wings flaring in sacred fire. The reveal's gold rings; it hovers before the tower, the sun up behind it.
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
  type G,
} from '../../pixel'
import { drawSprite, spriteSize } from '../../sprites'
import { screenFlash, screenShake, skippingNow, within, type Cue, type Timeline } from '../../timeline'
import { drawRays } from '../legend'
import {
  AFTER_REVEAL,
  burstRing,
  dGradient,
  dissolve,
  inOrder,
  tri,
  type Cinema,
  type CinemaParams,
} from './kit'

const BELLS = [0.7, 1.25, 1.8] as const
const T_SUN = 1.3
const T_BOW = 2.4
const T_FLY = 3.0
const T_FIRE = 4.05
const REVEAL = 4.55
const DUR = REVEAL + AFTER_REVEAL

const AURA = ['#ffffff', '#fff3a0', '#ff8a1e', '#a83a10'] as const
const BOW = ['#e0403a', '#ff8a1e', '#ffd23a', '#7ac74c', '#3a9af0', '#8a5ad0'] as const
// Ho-Oh's own colours (gold, flame, its green tail tips): the rainbow stays in the sky, the rest is sacred fire.
const GOLD = ['#fff3a0', '#ffd23a', '#ff8a1e', '#e0403a', '#7ac74c'] as const

type S = {
  r: ReturnType<typeof rng>
  fx: Particles
  feathers: Particles
  night: Canvas
  dawn: Canvas
  tower: Canvas
  rays: Canvas
  shakes: [number, number, number][]
}

export const hoohCinema: Cinema = {
  reveal: REVEAL,
  dur: DUR,
  make(p: CinemaParams): Timeline<S> {
    const w = p.w ?? 240
    const h = p.h ?? 160
    const cx = Math.round(w / 2)
    const ground = Math.round(h * 0.78)
    const feet = Math.round(h * 0.62)
    const sz = spriteSize(p.mon)
    const tw = Math.max(26, Math.min(48, Math.round(w * 0.16)))
    const tiers = 5
    const tierH = Math.round(Math.min(26, (ground - h * 0.2) / tiers))
    const top = ground - tierH * tiers
    const many = p.short ? 0.4 : 1
    const quiet = (f: () => void) => () => void (!skippingNow() && f())
    /** Where it flies: across the sun, round the tower's top, down before it. */
    const fly = (t: number) => {
      const q = span(t, T_FLY, T_FIRE)
      if (q < 0.45) {
        const k = q / 0.45
        return {
          x: lerp(w + 30, cx - tw * 1.8, k),
          y: lerp(top + 6, top + 16, k) - Math.sin(k * Math.PI) * 14,
          s: 0.5,
          front: true,
        }
      }
      if (q < 0.8) {
        const a = Math.PI + ((q - 0.45) / 0.35) * Math.PI * 1.2
        return {
          x: cx + Math.cos(a) * tw * 1.8,
          y: top - 8 + Math.sin(a) * 10,
          s: 0.55,
          front: Math.sin(a) > 0,
        }
      }
      const k = ease.inQ((q - 0.8) / 0.2)
      const a = Math.PI * 2.2
      return {
        x: lerp(cx + Math.cos(a) * tw * 1.8, cx, k),
        y: lerp(top - 8 + Math.sin(a) * 10, feet, k),
        s: lerp(0.55, 1, k),
        front: true,
      }
    }
    return {
      id: 'cinema-hooh',
      dur: DUR,
      setup() {
        const r = rng(250)
        const night = dGradient(w, ground, ['#06061a', '#140f34', '#2a1a4a', '#4a2448'])
        for (let i = 0; i < 40; i++)
          rect(night.g, r.range(0, w), r.range(0, ground * 0.6), 1, 1, r() < 0.2 ? '#ffffff' : '#8a7ab8')
        const dawn = dGradient(w, ground, ['#3a3a8a', '#8a4a8a', '#e07a5a', '#ffbe6a'])
        // The tower: tiers of black roofs with upturned eaves, a lamp in each, the gold finial on top.
        const tower = canvas(w, h)
        const g = tower.g
        for (let x = 0; x < w; x++) {
          const y = Math.round(ground - 8 - Math.sin(x / 33) * 5 - Math.sin(x / 11 + 1) * 2)
          rect(g, x, y, 1, h - y, '#120a14')
        }
        for (let i = 0; i < tiers; i++) {
          const yb = ground - i * tierH
          const half = Math.round(tw * (1 - i * 0.12))
          rect(g, cx - half + 4, yb - tierH + 6, (half - 4) * 2, tierH - 6, '#1a0e16')
          rect(g, cx - 2, yb - tierH + 9, 4, 4, '#ffbe2e')
          // The roof: wide, its corners turned up.
          const ry = yb - tierH + 4
          tri(g, cx - half - 8, ry + 2, cx + half + 8, ry + 2, cx, ry - 5, '#0c0610')
          rect(g, cx - half - 8, ry + 2, (half + 8) * 2, 2, '#0c0610')
          rect(g, cx - half - 10, ry - 1, 3, 3, '#0c0610')
          rect(g, cx + half + 7, ry - 1, 3, 3, '#0c0610')
          // A bell at each corner.
          rect(g, cx - half - 7, ry + 4, 2, 3, '#8a6a20')
          rect(g, cx + half + 5, ry + 4, 2, 3, '#8a6a20')
        }
        rect(g, cx - 1, top - 14, 2, 12, '#c8a050')
        ellipse(g, cx, top - 15, 2, 2, '#ffd23a')
        return {
          r,
          fx: new Particles(),
          feathers: new Particles(),
          night,
          dawn,
          tower,
          rays: canvas(w, h),
          shakes: p.short ? [] : [[REVEAL, 0.6, 3]],
        }
      },
      step(s, t, dt) {
        const r = s.r
        s.fx.update(dt)
        s.feathers.update(dt)
        if (t > T_BOW && r() < 0.1 * many)
          s.feathers.add({
            x: r.range(0, w),
            y: -4,
            vx: r.range(-8, 8),
            vy: r.range(10, 18),
            life: 9,
            size: 2,
            shape: 'leaf',
            spin: r.range(-2, 2),
            ...((c) => ({ colors: [c], light: '#fff6c8', dark: c }))(GOLD[Math.floor(r() * GOLD.length)]!),
          })
        // The trail of colours behind it as it flies.
        if (t > T_FLY && t < REVEAL) {
          const at = fly(t)
          for (let i = 0; i < 2; i++)
            s.fx.add({
              x: at.x + r.range(-6, 6),
              y: at.y - sz.h * at.s * 0.5 + r.range(-6, 6),
              vy: r.range(4, 12),
              life: 0.8,
              size: r.int(1, 2),
              shape: 'star',
              colors: [GOLD[Math.floor(r() * 3)]!, '#ffffff'],
            })
        }
        // Sacred fire on its wings.
        if (t > T_FIRE && t < REVEAL + 2 && r() < 0.9 * many)
          for (let i = 0; i < 2; i++)
            s.fx.add({
              x: cx + r.range(-sz.w * 0.5, sz.w * 0.5),
              y: feet - r.range(sz.h * 0.3, sz.h),
              vx: r.range(-10, 10),
              vy: -r.range(20, 50),
              life: 0.5,
              size: 2,
              size1: 0,
              shape: 'sq',
              colors: ['#fff6c8', '#ffd23a', '#ff8a1e', '#e0403a', '#8a5ad0'],
            })
        if (within(t, REVEAL, REVEAL + dt))
          for (let k = 0; k < 60 * many; k++) {
            const a = r() * Math.PI * 2
            const v = r.range(60, 180)
            s.fx.add({
              x: cx,
              y: feet - 30,
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v,
              drag: 2.5,
              life: r.range(0.5, 1),
              size: r.int(1, 2),
              shape: 'star',
              colors: [GOLD[k % 4]!, '#ffffff'],
            })
          }
      },
      draw(g, s, t) {
        const sh = screenShake(t, s.shakes)
        g.fillStyle = '#06061a'
        g.fillRect(0, 0, w, h)
        g.save()
        g.translate(sh.x, sh.y)
        g.drawImage(s.night, 0, 0)
        dissolve(g, s.dawn, ease.ioS(span(t, T_SUN, T_SUN + 1.6)))
        // The sun rising behind the tower, its rays fanning out.
        const sq = ease.outC(span(t, T_SUN, T_SUN + 2))
        const R = Math.round(Math.min(w, h) * 0.12)
        // Beside the tower, not behind it: the sun is seen coming up.
        const sx = Math.round(Math.min(w - R - 4, cx + tw * 1.7))
        const sy = Math.round(lerp(ground + R, ground - R * 1.6, sq))
        if (sq > 0) {
          g.drawImage(glow(R * 3, '#ffd23a', 1.3, 0.5 * sq), sx - R * 3, sy - R * 3)
          ellipse(g, sx, sy, R, R, '#fff3c8')
          ellipse(g, sx, sy, R - 3, R - 3, '#ffffff')
        }
        if (t > T_BOW - 0.3) {
          const k = span(t, T_BOW - 0.3, T_BOW + 0.4) * (t > REVEAL ? 0.35 : 0.5)
          drawRays(s.rays, { x: sx, y: sy }, t * 0.5, '#ffe08a', k)
          g.drawImage(s.rays, 0, 0)
        }
        // The rainbow drawing itself across the sky, left to right: thin and see-through, a hint behind the sun's
        // rays, fading once Ho-Oh is there so it doesn't fight it.
        const bq = span(t, T_BOW, T_BOW + 1.2)
        const fade = 1 - span(t, REVEAL, REVEAL + 1.2) * 0.6
        if (bq > 0) {
          const RX = Math.round(w * 0.62)
          const RY = Math.round(ground * 0.62)
          const end = Math.PI + Math.PI * ease.ioS(bq)
          g.save()
          g.globalAlpha = (Math.round(0.45 * fade * 8) / 8) * Math.min(1, bq * 3)
          BOW.forEach((c, i) => ellipseLine(g, cx, ground, RX - i, RY - i, c, Math.PI, end))
          g.restore()
        }
        // Behind the tower when it circles behind it.
        const at = t > T_FLY && t < REVEAL ? fly(t) : null
        if (at && !at.front) drawFlyer(g, p.mon, at, t)
        g.drawImage(s.tower, 0, 0)
        // The bells' rings of sound.
        BELLS.forEach((b) =>
          burstRing(g, cx, top + tierH, span(t, b, b + 0.9), Math.max(w, h) * 0.6, 2, '#ffd23a'),
        )
        // Feathers drifting, lamplight, then the flyer in front.
        s.feathers.draw(g)
        if (at && at.front) drawFlyer(g, p.mon, at, t)
        if (t >= REVEAL) {
          const bob = Math.round(Math.sin((t - REVEAL) * 2) * 2)
          drawSprite(g, p.mon, cx, feet + bob, {
            flash: Math.max(0, 1 - span(t, REVEAL + 0.05, REVEAL + 0.45)),
            outline: Math.floor(t * 8) % 2 ? AURA[1] : AURA[2],
          })
        }
        ;['#fff6c8', '#ffd23a', '#ff8a1e'].forEach((c, i) =>
          burstRing(
            g,
            cx,
            feet - 30,
            span(t, REVEAL + i * 0.08, REVEAL + i * 0.08 + 0.6),
            Math.max(w, h) * 0.75,
            2,
            c,
          ),
        )
        s.fx.draw(g)
        g.restore()
        // Night's dark lifting with the sun.
        if (t < T_SUN + 1) wash(g, '#02020a', 0.35 * (1 - span(t, 0.2, T_SUN + 1)), 8)
        if (within(t, REVEAL, REVEAL + 0.35))
          screenFlash(g, '#fff6c8', 0.9 * (1 - span(t, REVEAL, REVEAL + 0.35)))
        if (t < 0.5) wash(g, '#000000', 1 - span(t, 0, 0.5), 8)
      },
      cues: () =>
        inOrder([
          ...BELLS.map(
            (b, i) =>
              [
                b,
                quiet(() => {
                  tone(523 - i * 44, 1.4, { type: 'sine', vol: 0.06 })
                  tone(1046 - i * 88, 0.9, { type: 'triangle', vol: 0.025 })
                }),
              ] as const,
          ),
          [T_SUN, quiet(() => tone(392, 2, { type: 'sine', vol: 0.03, slide: 200 }))],
          [
            T_BOW,
            quiet(() =>
              [1047, 1175, 1319, 1568, 1760, 2093].forEach((f, i) =>
                tone(f, 0.25, { type: 'triangle', vol: 0.025, at: i * 0.12 }),
              ),
            ),
          ],
          [T_FLY, quiet(() => hiss(0.8, { freq: 600, slide: 1400, vol: 0.06 }))],
          [3.6, quiet(() => fxSound('legend.heart'))],
          [T_FIRE, quiet(() => fxSound('fire.stream'))],
          [REVEAL, (hud) => (quiet(() => fxSound('legend.roar'))(), hud.beat?.('roar'))],
        ] satisfies Cue<S>[]),
    }
  },
}

/** It, flying: a golden shape at its distance's size, outlined in fire once it comes down. */
function drawFlyer(g: G, mon: string, at: { x: number; y: number; s: number }, t: number) {
  drawSprite(g, mon, Math.round(at.x), Math.round(at.y), {
    sx: at.s,
    sy: at.s,
    sil: t > T_FIRE ? '#a85a10' : '#c8901e',
    outline: t > T_FIRE ? (Math.floor(t * 14) % 2 ? '#ffd23a' : '#ff8a1e') : '#fff3a0',
  })
}
