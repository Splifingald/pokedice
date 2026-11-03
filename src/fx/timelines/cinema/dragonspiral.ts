// Reshiram's and Zekrom's raid entrances (docs/53): Dragonspiral Tower, Icirrus's ancient tower, its dragon's ridge
// winding round it to the broken top; snowy pines and peaks round its foot. One place, two opposite ideas.
//
// Reshiram, truth: a cold night, snow falling on the tower. A white ember kindles on its top; a ring of light starts to
// turn over it (the turbine tail) and spins up, whining, drawing the falling snow in and round; the heat comes, the
// snow on the ground melts back from the tower, the night burns away into a white-gold sky. The turbine flares into a
// sphere of white fire that bursts in a dome of flame, and Reshiram comes down out of it before the tower.
//
// Zekrom, ideals: a black storm with no rain, the clouds coiling slowly round the top. Blue current climbs the tower's
// ridge turn by turn; a ring of blue light (the generator tail) spins up on top, arcs jumping to the clouds, sparks
// drifting upward. Black lightning — bolts of darkness edged in blue — strikes the top three times; a sphere of
// plasma gathers in front of the tower with a dark shape coiled inside, and bursts.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  bayer,
  bolt,
  canvas,
  ease,
  ellipse,
  ellipseLine,
  glow,
  lerp,
  line,
  Particles,
  pattern,
  polyline,
  rect,
  rng,
  shade,
  span,
  wash,
  type Canvas,
  type G,
  type Rng,
} from '../../pixel'
import { drawSprite, spriteSize } from '../../sprites'
import { screenFlash, screenShake, skippingNow, within, type Cue, type Timeline } from '../../timeline'
import { drawRays } from '../legend'
import { AFTER_REVEAL, burstRing, dGradient, inOrder, tri, type Cinema, type CinemaParams } from './kit'

type Pt = [number, number]
type Aura = readonly [string, string, string, string]

/** The tower's frame on any screen: its foot, its top, its radius; the legend's feet before it. */
function frame(p: CinemaParams) {
  const w = p.w ?? 240
  const h = p.h ?? 160
  const m = Math.min(w, h)
  const foot = Math.round(h * 0.82)
  const top = Math.round(h * 0.24)
  const tr = Math.round(Math.max(18, Math.min(w * 0.19, m * 0.18)))
  return {
    w,
    h,
    m,
    cx: Math.round(w / 2),
    foot,
    top,
    tr,
    feet: Math.round(h * 0.63),
    sz: spriteSize(p.mon),
    many: p.short ? 0.4 : 1,
    quiet: (f: () => void) => () => void (!skippingNow() && f()),
  }
}
type Frame = ReturnType<typeof frame>

const TURNS = 4
/** The tower's radius at row y: a little narrower towards its top. */
const radiusAt = (F: Frame, y: number) => F.tr * lerp(0.82, 1, (y - F.top) / (F.foot - F.top))

/** A point on the dragon's ridge, s 0 (its foot) to 1 (the top), and whether it faces us. */
function ridge(F: Frame, s: number): { x: number; y: number; front: boolean } {
  const a = s * TURNS * Math.PI * 2
  const y = lerp(F.foot - 6, F.top + 8, s)
  return { x: F.cx + Math.sin(a) * radiusAt(F, y), y: y + Math.cos(a) * 3, front: Math.cos(a) > 0 }
}

interface TowerPal {
  sky: readonly string[]
  peaks: readonly [string, string, string]
  stone: readonly [string, string, string, string]
  snow: readonly [string, string]
  pine: readonly [string, string]
}

/**
 * Dragonspiral Tower at night, in two layers (so a sky can change behind it): the sky and its stars; then snowy
 * peaks, the tower's round body and its ridge, the pines, the snow.
 */
function tower(F: Frame, pal: TowerPal, r: Rng): { sky: Canvas; land: Canvas } {
  const { w, h, cx, foot, top } = F
  const sky = dGradient(w, foot, pal.sky)
  for (let i = 0; i < Math.round(w / 3); i++)
    rect(sky.g, r.range(0, w), r.range(0, foot * 0.6), 1, 1, r() < 0.2 ? '#ffffff' : '#6a7aa8')
  const cv = canvas(w, h)
  const g = cv.g
  // Peaks, snow on their tops.
  for (const [base, amp, f, c] of [
    [foot - 26, 34, 37, pal.peaks[0]],
    [foot - 8, 18, 19, pal.peaks[1]],
  ] as const)
    for (let x = 0; x < w; x++) {
      const y = Math.round(base - Math.abs(Math.sin(x / f + base)) * amp - Math.abs(Math.sin(x / 9)) * 3)
      rect(g, x, y, 1, foot - y, c)
      rect(g, x, y, 1, 2, pal.peaks[2])
    }
  // The tower's body: a column lit from the left, in dithered steps, the stone in courses.
  const body = shade(F.tr * 2 + 2, foot - top, (x, y) => {
    const rr = radiusAt(F, y + top)
    const dx = x - F.tr - 0.5
    if (Math.abs(dx) > rr) return null
    const k = dx / rr
    const v = 1.7 - k * 1.5 - (y % 9 === 0 ? 0.8 : 0) - (Math.abs(k) > 0.9 ? 0.6 : 0)
    return pal.stone[Math.max(0, Math.min(3, Math.floor(v + bayer(x, y) - 0.5)))]!
  })
  g.drawImage(body, cx - F.tr - 1, top)
  // Its ridge: the dragon's back winding round, lit along its top; windows between its turns.
  for (let i = 0; i <= 600; i++) {
    const a = ridge(F, i / 600)
    if (!a.front) continue
    rect(g, a.x - 1, a.y, 3, 3, pal.stone[3])
    rect(g, a.x - 1, a.y, 3, 1, pal.stone[0])
  }
  for (let i = 0; i < TURNS * 2; i++) {
    const a = ridge(F, (i + 0.5) / (TURNS * 2))
    if (a.front) rect(g, a.x - 1, a.y - 9, 2, 4, '#05060a')
  }
  // The broken top: stepped teeth of wall, two broken pillars.
  const rt = radiusAt(F, top)
  for (let x = -rt; x < rt; x += 4) {
    const ht = 2 + ((x * 7 + 99) % 5)
    rect(g, cx + x, top - ht, 3, ht, x < 0 ? pal.stone[1] : pal.stone[2])
  }
  for (const dx of [-0.6, 0.55]) {
    const x = Math.round(cx + dx * rt)
    rect(g, x - 2, top - 16, 4, 16, dx < 0 ? pal.stone[1] : pal.stone[2])
    rect(g, x - 2, top - 16, 1, 16, pal.stone[0])
  }
  // The ground: snow, pines either side of the tower.
  g.drawImage(dGradient(w, h - foot, [pal.snow[0], pal.snow[1]]), 0, foot)
  rect(g, 0, foot, w, 1, '#ffffff')
  for (let i = 0; i < Math.round(w / 9); i++) {
    const x = r.range(0, w)
    if (Math.abs(x - cx) < F.tr + 8) continue
    const ht = r.int(12, 26)
    const y = foot + r.int(-2, 6)
    for (let k = 0; k < 3; k++) {
      const yy = y - ht + k * (ht / 3)
      const ww = 3 + k * 3
      tri(g, x - ww, yy + ht / 3 + 2, x + ww, yy + ht / 3 + 2, x, yy, pal.pine[0])
      line(g, x - ww + 1, yy + ht / 3 + 1, x, yy + 1, pal.pine[1])
    }
  }
  return { sky, land: cv }
}

/** The reveal's end: rays and rings in its colours, the legend hovering in full. */
function revealFx(
  g: G,
  rays: Canvas,
  mon: string,
  x: number,
  feet: number,
  t: number,
  R: number,
  A: Aura,
  big: number,
) {
  const k = span(t, R, R + 0.5) * lerp(0.75, 0.3, span(t, R + 0.4, R + 1.4))
  drawRays(rays, { x, y: feet - 30 }, t, A[3], k)
  g.drawImage(rays, 0, 0)
  const bob = Math.round(Math.sin((t - R) * 2) * 2)
  drawSprite(g, mon, x, feet + bob, {
    flash: Math.max(0, 1 - span(t, R + 0.05, R + 0.45)),
    outline: t < R + 1.6 ? (Math.floor(t * 8) % 2 ? A[1] : A[2]) : undefined,
  })
  ;[A[0], A[1], A[2]].forEach((c, i) =>
    burstRing(g, x, feet - 30, span(t, R + i * 0.12, R + i * 0.12 + 0.6), big, 3, c),
  )
}

function revealBurst(fx: Particles, r: Rng, x: number, y: number, n: number, A: Aura) {
  for (let k = 0; k < n; k++) {
    const a = r() * Math.PI * 2
    const v = r.range(50, 180)
    fx.add({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      drag: 2.5,
      life: r.range(0.5, 1),
      size: r.int(1, 2),
      shape: r() < 0.5 ? 'star' : 'sq',
      colors: [...A],
    })
  }
}

// ================================================================================================= Reshiram

const RE_AURA: Aura = ['#ffffff', '#fff4d8', '#ffb050', '#c8d8f0']
const RE_EMBER = 0.85
const RE_SPIN = 1.35
const RE_HEAT = 2.4
const RE_BALL = 3.45
const RE_DOME = 4.05
const RE_REVEAL = 4.7

type RES = {
  r: Rng
  fx: Particles
  snow: Particles
  bg: { sky: Canvas; land: Canvas }
  dawn: Canvas
  earth: Canvas
  rays: Canvas
  rot: number
  shakes: [number, number, number][]
}

export const reshiramCinema: Cinema = {
  reveal: RE_REVEAL,
  dur: RE_REVEAL + AFTER_REVEAL,
  make(p: CinemaParams): Timeline<RES> {
    const F = frame(p)
    const { w, h, cx, m, foot, top, tr, feet, sz, many, quiet } = F
    const R = RE_REVEAL
    // The turbine: a ring of light lying over the tower's top.
    const ty = top - 10
    const trx = Math.round(tr * 1.5)
    const try_ = Math.round(trx * 0.3)
    const spin = (t: number) => span(t, RE_SPIN, RE_BALL)
    const ballR = (t: number) => Math.round(lerp(4, m * 0.2, ease.outC(span(t, RE_BALL, RE_DOME))))
    return {
      id: 'cinema-reshiram',
      dur: R + AFTER_REVEAL,
      setup() {
        const r = rng(643)
        const pal: TowerPal = {
          sky: ['#04081a', '#0a1430', '#142450', '#22386a'],
          peaks: ['#2a3a5a', '#1a2840', '#c8d8f0'],
          stone: ['#7a88a8', '#4a5672', '#2a3248', '#141a28'],
          snow: ['#c8d8f0', '#7a8ab0'],
          pine: ['#0c1a1e', '#2a4a50'],
        }
        // The thaw's ground: wet dark earth, the first green.
        const earth = canvas(w, h - foot)
        earth.g.drawImage(dGradient(w, h - foot, ['#4a5a3a', '#2a3a24', '#1a2416']), 0, 0)
        for (let i = 0; i < w; i++) rect(earth.g, r.range(0, w), r.range(0, h - foot), 1, 1, '#6a8a4a')
        return {
          r,
          fx: new Particles(),
          snow: new Particles(),
          bg: tower(F, pal, r),
          dawn: dGradient(w, foot, ['#fffbe8', '#fff0c0', '#ffd090', '#f0a070']),
          earth,
          rays: canvas(w, h),
          rot: 0,
          shakes: p.short
            ? []
            : [
                [RE_HEAT, 1.0, 1],
                [RE_BALL, 0.6, 2],
                [RE_DOME, 0.6, 5],
                [R, 0.5, 3],
              ],
        }
      },
      step(s, t, dt) {
        const r = s.r
        s.fx.update(dt)
        s.snow.update(dt)
        const sp = spin(t)
        s.rot += dt * (0.8 + sp * sp * 26)
        // Snow: falling, then drawn into the turbine's whirl; once the heat comes it falls no more.
        if (t < RE_HEAT + 0.4 && r() < (1.4 - span(t, RE_HEAT - 0.4, RE_HEAT + 0.4)) * many)
          s.snow.add({
            x: r.range(-10, w + 10),
            y: -4,
            vx: r.range(-6, 6),
            vy: r.range(14, 26),
            life: 12,
            size: r() < 0.3 ? 2 : 1,
            shape: 'flake',
            colors: ['#ffffff', '#e0ecff'],
          })
        if (sp > 0.15)
          for (const f of s.snow.list) {
            if (f.home) continue
            if (r() < sp * 0.08) f.home = { x: cx, y: ty, k: 120 + sp * 400 }
          }
        // The flakes that reach the heat go up as steam.
        if (t > RE_HEAT && r() < 0.6 * many)
          s.fx.add({
            x: cx + r.range(-trx, trx),
            y: ty + r.range(-4, 6),
            vx: r.range(-10, 10),
            vy: -r.range(10, 30),
            life: 1,
            size: 1,
            size1: 3,
            shape: 'smoke',
            density: 0.5,
            colors: ['#ffffff', '#e8eef8'],
          })
        // White fire round the turbine's rim as it spins up.
        if (sp > 0.4 && t < R && r() < (sp - 0.3) * 2 * many)
          for (let i = 0; i < 2; i++) {
            const a = r() * Math.PI * 2
            s.fx.add({
              x: cx + Math.cos(a) * trx,
              y: ty + Math.sin(a) * try_,
              vx: r.range(-8, 8),
              vy: -r.range(20, 50),
              life: 0.45,
              size: 2,
              size1: 0,
              shape: 'sq',
              colors: ['#ffffff', '#fff4d8', '#ffd080', '#ff9a40'],
            })
          }
        if (within(t, RE_DOME, RE_DOME + dt))
          for (let i = 0; i < 70 * many; i++) {
            const a = r() * Math.PI * 2
            const v = r.range(80, 220)
            s.fx.add({
              x: cx,
              y: ty,
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v,
              drag: 1.6,
              life: r.range(0.6, 1.2),
              size: r.int(2, 3),
              size1: 0,
              shape: 'sq',
              colors: ['#ffffff', '#fff4d8', '#c8e0ff', '#ffb050'],
            })
          }
        if (within(t, R, R + dt)) revealBurst(s.fx, r, cx, feet - 30, 50 * many, RE_AURA)
        // White flames trailing off it after.
        if (t > R && r() < 0.5 * many)
          s.fx.add({
            x: cx + r.range(-sz.w * 0.5, sz.w * 0.5),
            y: feet - r.range(sz.h * 0.2, sz.h),
            vx: r.range(-6, 6),
            vy: -r.range(15, 35),
            life: 0.6,
            size: 2,
            size1: 0,
            shape: 'sq',
            colors: ['#ffffff', '#fff4d8', '#ffd080', '#c8d8f0'],
          })
      },
      draw(g, s, t) {
        const sh = screenShake(t, s.shakes)
        g.fillStyle = '#04081a'
        g.fillRect(0, 0, w, h)
        g.save()
        g.translate(sh.x, sh.y)
        g.drawImage(s.bg.sky, 0, 0)
        // The night burning away from the fire outward: a white-gold sky in a growing circle, its edge aflame.
        const burn = ease.inQ(span(t, RE_HEAT, RE_DOME + 0.1))
        if (burn > 0) {
          const BR = burn * Math.hypot(w, foot) * 1.05
          for (let y = 0; y < foot; y++) {
            const dy = y - ty
            if (Math.abs(dy) >= BR) continue
            const hw = Math.round(Math.sqrt(BR * BR - dy * dy))
            const a = Math.max(0, cx - hw)
            const b = Math.min(w, cx + hw)
            if (b > a) g.drawImage(s.dawn, a, y, b - a, 1, a, y, b - a, 1)
            if (burn < 1) {
              rect(g, cx - hw - 2, y, 3, 1, (y >> 1) % 2 ? '#ff9a40' : '#ffd080')
              rect(g, cx + hw - 1, y, 3, 1, (y >> 1) % 2 ? '#ff9a40' : '#ffd080')
            }
          }
        }
        g.drawImage(s.bg.land, 0, 0)
        // The snow melting back from the tower's foot.
        const melt = ease.outC(span(t, RE_HEAT + 0.2, R))
        if (melt > 0) {
          // A half-ellipse round the tower's foot, lying on the ground.
          const mr = melt * w * 0.75
          const my = melt * (h - foot) * 1.4
          for (let y = foot + 1; y < h; y++) {
            const k = (y - foot) / Math.max(1, my)
            if (k >= 1) continue
            const hw = Math.round(mr * Math.sqrt(1 - k * k))
            const a = Math.max(0, cx - hw)
            const b = Math.min(w, cx + hw)
            if (b > a) g.drawImage(s.earth, a, y - foot, b - a, 1, a, y, b - a, 1)
            if (hw > 0 && hw < w) {
              rect(g, cx - hw - 1, y, 2, 1, '#e0ecff')
              rect(g, cx + hw - 1, y, 2, 1, '#e0ecff')
            }
          }
        }
        // The tower lit from above once the fire is up.
        const lit = span(t, RE_BALL - 0.4, RE_BALL + 0.3) * (1 - span(t, R + 0.5, R + 1.5) * 0.6)
        if (lit > 0) {
          const gr = Math.round(m * 0.45)
          g.drawImage(glow(gr, '#fff0c0', 1.3, 0.5 * lit), cx - gr, ty - gr)
        }
        // The ember on the tower's top, its light growing.
        const ek = span(t, RE_EMBER, RE_EMBER + 0.6)
        if (ek > 0 && t < RE_DOME) {
          const er = Math.round(lerp(3, 12, ek) + Math.sin(t * 13) * 1.5)
          g.drawImage(glow(er * 2, '#ffe8c0', 1.3, 0.7), cx - er * 2, ty - er * 2)
          ellipse(g, cx, ty, Math.max(1, Math.round(er * 0.3)), Math.max(1, Math.round(er * 0.4)), '#ffffff')
        }
        // The turbine: its back half, the fireball, its front half; spokes turning faster and faster.
        const sp = spin(t)
        if (sp > 0 && t < RE_DOME + 0.1) {
          turbine(g, cx, ty, trx, try_, s.rot, sp, false)
          const br = t > RE_BALL ? ballR(t) : 0
          if (br > 0) fireball(g, cx, ty, br, t)
          turbine(g, cx, ty, trx, try_, s.rot, sp, true)
        }
        // The dome of white flame bursting out.
        const dq = span(t, RE_DOME, RE_DOME + 0.55)
        if (dq > 0 && dq < 1) {
          const dr = Math.round(lerp(m * 0.2, Math.max(w, h) * 0.9, ease.outC(dq)))
          const rr = dr - (dr % 3)
          g.drawImage(
            glow(Math.max(4, Math.round(rr * 0.5)), '#fff4d8', 1.1, 0.6 * (1 - dq)),
            cx - Math.round(rr * 0.5),
            ty - Math.round(rr * 0.5),
          )
          burstRing(g, cx, ty, dq, Math.max(w, h) * 0.9, 6, '#ffffff')
          burstRing(g, cx, ty, Math.max(0, dq - 0.08), Math.max(w, h) * 0.85, 4, '#ffd080')
        }
        s.snow.draw(g)
        // Out of the flame it comes down, white-hot, its shape coming through the white as it nears.
        if (t >= RE_DOME && t < R) {
          const q = ease.outC(span(t, RE_DOME, R))
          drawSprite(g, p.mon, cx, Math.round(lerp(ty + sz.h * 0.4, feet, q)), {
            flash: lerp(1, 0.55, q),
            outline: Math.floor(t * 16) % 2 ? '#ffb050' : '#ff9a40',
          })
        }
        if (t >= R) revealFx(g, s.rays, p.mon, cx, feet, t, R, RE_AURA, Math.max(w, h) * 0.75)
        s.fx.draw(g)
        g.restore()
        // The cold dark at the start.
        if (t < RE_HEAT) wash(g, '#02040c', 0.3 * (1 - span(t, RE_EMBER, RE_HEAT)), 8)
        if (within(t, RE_DOME, RE_DOME + 0.25))
          screenFlash(g, '#fffbe8', 0.75 * (1 - span(t, RE_DOME, RE_DOME + 0.25)))
        if (within(t, R, R + 0.35)) screenFlash(g, '#ffffff', 0.85 * (1 - span(t, R, R + 0.35)))
        if (t < 0.4) wash(g, '#000000', 1 - span(t, 0, 0.4), 8)
      },
      cues: () =>
        inOrder([
          [0.1, quiet(() => hiss(2.2, { freq: 3000, q: 3, vol: 0.015 }))],
          [RE_EMBER, quiet(() => tone(880, 1.0, { type: 'sine', vol: 0.03 }))],
          [RE_SPIN, quiet(() => tone(140, 2.1, { type: 'sawtooth', vol: 0.025, slide: 1100 }))],
          [RE_SPIN + 0.4, quiet(() => hiss(1.8, { freq: 600, q: 4, slide: 2400, vol: 0.04 }))],
          [RE_HEAT, quiet(() => hiss(1.2, { freq: 400, slide: -200, vol: 0.05 }))],
          [
            RE_BALL,
            quiet(() => (fxSound('fire.inhale'), tone(220, 0.6, { type: 'square', vol: 0.02, slide: 440 }))),
          ],
          [3.75, quiet(() => fxSound('legend.heart'))],
          [RE_DOME, quiet(() => (fxSound('fire.stream'), hiss(0.9, { freq: 900, slide: -600, vol: 0.12 })))],
          [R, (hud) => (quiet(() => fxSound('legend.roar'))(), hud.beat?.('roar'))],
        ] satisfies Cue<RES>[]),
    }
  },
}

/** The turbine: a ring in perspective, its back or front half, and its blades turning. */
function turbine(
  g: G,
  x: number,
  y: number,
  rx: number,
  ry: number,
  rot: number,
  sp: number,
  front: boolean,
) {
  const from = front ? 0 : Math.PI
  const to = front ? Math.PI : Math.PI * 2
  const c1 = sp > 0.6 ? '#ffffff' : '#fff0c8'
  const c2 = sp > 0.6 ? '#ffd080' : '#c8a060'
  ellipseLine(g, x, y, rx, ry, c2, from, to)
  ellipseLine(g, x, y - 1, rx, ry, c1, from, to)
  if (sp > 0.5) ellipseLine(g, x, y + 1, rx + 1, ry, '#ff9a40', from, to)
  // Six blades; at speed they smear into a disc of light.
  const n = 6
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2
    if (Math.sin(a) > 0 !== front) continue
    const ex = x + Math.cos(a) * rx * 0.92
    const ey = y + Math.sin(a) * ry * 0.92
    line(g, x, y, ex, ey, sp > 0.5 ? '#fff4d8' : '#c8b088')
    if (sp > 0.7) {
      const b = a - 0.25
      line(g, x, y, x + Math.cos(b) * rx * 0.9, y + Math.sin(b) * ry * 0.9, '#ffd080')
    }
  }
  if (sp > 0.8 && front)
    ellipse(g, x, y, Math.round(rx * 0.95), Math.round(ry * 0.9), pattern(g, '#fff4d8', 5))
}

/** A sphere of white fire: dithered halo, an orange rim, a pale-blue body, a white heart, flames licking off it. */
function fireball(g: G, x: number, y: number, r: number, t: number) {
  const R = r - (r % 2)
  g.drawImage(glow(R * 2, '#ffd890', 1.2, 0.6), x - R * 2, y - R * 2)
  ellipse(g, x, y, R + 1, R + 1, '#ffb050')
  ellipse(g, x, y, R, R, '#e0ecff')
  ellipse(g, x - 1, y - 1, Math.round(R * 0.7), Math.round(R * 0.7), '#ffffff')
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + t * 3
    const L = R * (0.35 + 0.25 * Math.sin(t * 17 + i * 2))
    tri(
      g,
      x + Math.cos(a - 0.2) * R,
      y + Math.sin(a - 0.2) * R,
      x + Math.cos(a + 0.2) * R,
      y + Math.sin(a + 0.2) * R,
      x + Math.cos(a) * (R + L),
      y + Math.sin(a) * (R + L),
      i % 2 ? '#ffffff' : '#c8e0ff',
    )
  }
}

// ================================================================================================= Zekrom

const ZE_AURA: Aura = ['#ffffff', '#a8e0ff', '#2a8aff', '#0a1430']
const ZE_CLIMB = 0.8
const ZE_GEN = 2.15
const ZE_BLACK = [2.95, 3.32, 3.68] as const
const ZE_SPHERE = 3.8
const ZE_BURST = 4.35
const ZE_REVEAL = 4.6

type ZES = {
  r: Rng
  fx: Particles
  bg: { sky: Canvas; land: Canvas }
  rays: Canvas
  rot: number
  clouds: { a: number; r: number; y: number; s: number }[]
  blacks: Pt[][]
  arcs: Pt[][]
  arcAt: number
  shakes: [number, number, number][]
}

/** Black lightning: a halo of blue, a body of darkness, a thin dark-blue core. */
function blackBolt(g: G, pts: Pt[], wd: number) {
  polyline(g, pts, '#2a8aff', wd + 4)
  polyline(g, pts, '#a8e0ff', wd + 2)
  polyline(g, pts, '#020308', wd)
  polyline(g, pts, '#0a1a4a', 1)
}

/** An ordinary blue arc: cyan body, white core. */
function arc(g: G, pts: Pt[]) {
  polyline(g, pts, '#2a8aff', 2)
  polyline(g, pts, '#e0f4ff')
}

export const zekromCinema: Cinema = {
  reveal: ZE_REVEAL,
  dur: ZE_REVEAL + AFTER_REVEAL,
  make(p: CinemaParams): Timeline<ZES> {
    const F = frame(p)
    const { w, h, cx, m, top, tr, feet, sz, many, quiet } = F
    const R = ZE_REVEAL
    const ty = top - 10
    const grx = Math.round(tr * 1.35)
    const gry = Math.round(grx * 0.3)
    const sy = feet - Math.round(Math.max(28, sz.h * 0.5))
    const sphereR = Math.round(Math.max(30, Math.max(sz.w, sz.h) * 0.62))
    /** How far up the ridge the current has climbed. */
    const climb = (t: number) => ease.inQ(span(t, ZE_CLIMB, ZE_GEN))
    return {
      id: 'cinema-zekrom',
      dur: R + AFTER_REVEAL,
      setup() {
        const r = rng(644)
        const pal: TowerPal = {
          sky: ['#020308', '#05081a', '#0a1028', '#101a38'],
          peaks: ['#0e1428', '#080c1a', '#3a4a6a'],
          stone: ['#4a5470', '#2a3248', '#161c2c', '#0a0e18'],
          snow: ['#3a4a6a', '#1a2238'],
          pine: ['#04060c', '#1a2438'],
        }
        return {
          r,
          fx: new Particles(),
          bg: tower(F, pal, r),
          rays: canvas(w, h),
          rot: 0,
          // Two rings of storm cloud round the crown, the outer one wider and higher: a slow vortex.
          clouds: Array.from({ length: 28 }, (_, i) => ({
            a: (i / 14) * Math.PI * 2 + r.range(-0.15, 0.15),
            r: i < 14 ? r.range(1.2, 1.7) : r.range(2.2, 3.2),
            y: i < 14 ? r.range(-4, 6) : r.range(-22, -8),
            s: r.range(0.8, 1.3),
          })),
          blacks: ZE_BLACK.map((_, i) =>
            bolt(r, cx + (i - 1) * w * 0.3 + r.range(-10, 10), -4, cx + r.range(-4, 4), ty, 0.3, 5),
          ),
          arcs: [],
          arcAt: -1,
          shakes: p.short
            ? []
            : [
                ...ZE_BLACK.map((b, i) => [b, 0.3, 2 + i] as [number, number, number]),
                [ZE_BURST, 0.5, 5],
                [R, 0.5, 3],
              ],
        }
      },
      step(s, t, dt) {
        const r = s.r
        s.fx.update(dt)
        const gen = span(t, ZE_GEN, ZE_GEN + 0.8)
        s.rot += dt * (1 + gen * gen * 22)
        // The climbing current's head: sparks off it.
        const c = climb(t)
        if (c > 0 && c < 1) {
          const a = ridge(F, c)
          for (let i = 0; i < 2; i++)
            s.fx.add({
              x: a.x,
              y: a.y,
              vx: r.range(-30, 30),
              vy: r.range(-30, 10),
              ay: 60,
              life: 0.3,
              size: 1,
              shape: 'px',
              colors: ['#ffffff', '#a8e0ff', '#2a8aff'],
            })
        }
        // Static: sparks drifting upward everywhere once the generator runs.
        if (gen > 0 && t < R + 1 && r() < (0.3 + gen) * many)
          s.fx.add({
            x: r.range(0, w),
            y: r.range(h * 0.3, h),
            vy: -r.range(10, 30),
            life: r.range(1, 2),
            size: 1,
            shape: r() < 0.3 ? 'plus' : 'px',
            colors: ['#a8e0ff', '#2a8aff', '#0a3a8a'],
          })
        // The arcs, re-forked every few frames: from the generator to the clouds, then over the sphere.
        if (Math.floor(t * 15) !== s.arcAt) {
          s.arcAt = Math.floor(t * 15)
          s.arcs = []
          if (gen > 0 && t < ZE_SPHERE)
            for (let i = 0; i < 2; i++) {
              const a = r() * Math.PI * 2
              s.arcs.push(
                bolt(
                  r,
                  cx + Math.cos(a) * grx,
                  ty + Math.sin(a) * gry,
                  cx + r.range(-w * 0.5, w * 0.5),
                  r.range(0, h * 0.12),
                  0.35,
                  4,
                ),
              )
            }
          if (t > ZE_SPHERE && t < ZE_BURST)
            for (let i = 0; i < 3; i++) {
              const a = r() * Math.PI * 2
              const b = a + r.range(1, 2.5)
              s.arcs.push(
                bolt(
                  r,
                  cx + Math.cos(a) * sphereR,
                  sy + Math.sin(a) * sphereR,
                  cx + Math.cos(b) * sphereR,
                  sy + Math.sin(b) * sphereR,
                  0.3,
                  4,
                ),
              )
            }
        }
        // Each black strike: dark sparks off the top.
        ZE_BLACK.forEach((b) => {
          if (within(t, b, b + dt))
            for (let i = 0; i < 20 * many; i++)
              s.fx.add({
                x: cx,
                y: ty,
                vx: r.range(-90, 90),
                vy: r.range(-60, 40),
                drag: 2,
                life: r.range(0.3, 0.6),
                size: r.int(1, 2),
                shape: 'sq',
                colors: ['#a8e0ff', '#020308', '#2a8aff'],
              })
        })
        // Current pulled into the sphere.
        if (t > ZE_SPHERE && t < ZE_BURST && r() < 0.9 * many)
          s.fx.add({
            x: cx + r.range(-w * 0.5, w * 0.5),
            y: r.range(0, h),
            home: { x: cx, y: sy, k: 900 },
            life: 0.6,
            size: 1,
            shape: 'plus',
            colors: ['#ffffff', '#a8e0ff'],
          })
        if (within(t, R, R + dt)) revealBurst(s.fx, r, cx, feet - 30, 50 * many, ZE_AURA)
        if (t > R && r() < 0.2)
          s.fx.add({
            x: cx + r.range(-sz.w * 0.5, sz.w * 0.5),
            y: feet - r.range(0, sz.h),
            vx: r.range(-40, 40),
            life: 0.12,
            size: 1,
            shape: 'streak',
            trail: 0.06,
            colors: ['#ffffff', '#a8e0ff'],
          })
      },
      draw(g, s, t) {
        const sh = screenShake(t, s.shakes)
        g.fillStyle = '#020308'
        g.fillRect(0, 0, w, h)
        g.save()
        g.translate(sh.x, sh.y)
        g.drawImage(s.bg.sky, 0, 0)
        g.drawImage(s.bg.land, 0, 0)
        // The clouds coiling round the crown: the back half here, the front half after the generator.
        const coil = (front: boolean) => {
          for (const c of s.clouds) {
            // The outer ring turns slower, as a vortex does.
            const a = c.a + (t * 0.5) / c.r
            if (Math.sin(a) > 0 !== front) continue
            const x = cx + Math.cos(a) * tr * 1.6 * c.r
            const y = ty - 4 + c.y + Math.sin(a) * 5 * c.r
            const rr = Math.round(m * 0.12 * c.s)
            const lit = span(t, ZE_GEN, ZE_GEN + 0.5) * (Math.floor(t * 12 + c.a * 5) % 4 === 0 ? 1 : 0.4)
            // Three puffs, rim-lit along their tops (the generator's light from below once it runs).
            const rim = lit > 0.6 ? '#3a6ac8' : '#1a2238'
            const body = lit > 0.6 ? '#101c40' : '#080b16'
            const ps: [number, number, number, number][] = [
              [x - rr * 0.45, y, rr * 0.6, rr * 0.3],
              [x + rr * 0.4, y + 1, rr * 0.55, rr * 0.28],
              [x, y - rr * 0.15, rr * 0.55, rr * 0.32],
            ]
            for (const [px, py, rx, ry] of ps) ellipse(g, px, py - 1, Math.round(rx), Math.round(ry), rim)
            for (const [px, py, rx, ry] of ps) ellipse(g, px, py + 1, Math.round(rx), Math.round(ry), body)
          }
        }
        coil(false)
        // The current climbing the dragon's ridge, turn by turn; the lit part stays lit, flickering.
        const c = climb(t)
        if (c > 0) {
          const n = Math.round(600 * c)
          for (let i = 0; i <= n; i += 1) {
            const a = ridge(F, i / 600)
            if (!a.front) continue
            const hot = n - i < 40
            const flick = Math.floor(t * 20 + i * 0.1) % 7 === 0
            rect(g, a.x - 1, a.y, 3, 1, hot ? '#ffffff' : flick ? '#a8e0ff' : '#2a8aff')
          }
          if (c < 1) {
            const a = ridge(F, c)
            g.drawImage(glow(6, '#a8e0ff', 1.2, 0.9), Math.round(a.x - 6), Math.round(a.y - 6))
          }
        }
        coil(true)
        // The generator: a ring of blue light turning over the crown, its spokes blurring.
        const gen = span(t, ZE_GEN, ZE_GEN + 0.8)
        if (gen > 0) {
          const gr = Math.round(m * 0.3 * gen)
          g.drawImage(glow(Math.max(2, gr), '#1a4aa8', 1.4, 0.5), cx - gr, ty - gr)
          for (let i = 0; i < 8; i++) {
            const a = s.rot + (i / 8) * Math.PI * 2
            line(
              g,
              cx,
              ty,
              cx + Math.cos(a) * grx * gen,
              ty + Math.sin(a) * gry * gen,
              i % 2 ? '#2a8aff' : '#a8e0ff',
            )
          }
          ellipseLine(g, cx, ty, Math.round(grx * gen), Math.round(gry * gen), '#a8e0ff')
          ellipseLine(g, cx, ty + 1, Math.round(grx * gen) + 1, Math.round(gry * gen), '#2a8aff')
          if (gen > 0.6) ellipse(g, cx, ty, 3, 2, '#ffffff')
        }
        for (const pts of s.arcs) arc(g, pts)
        // Black lightning: three strikes on the crown.
        ZE_BLACK.forEach((b, i) => {
          if (within(t, b, b + 0.14)) blackBolt(g, s.blacks[i]!, 3)
        })
        // The sphere of plasma before the tower, a dark shape coiled in it.
        if (t >= ZE_SPHERE && t < ZE_BURST + 0.05) {
          const q = ease.outBack(span(t, ZE_SPHERE, ZE_SPHERE + 0.3))
          const shrink = ease.inQ(span(t, ZE_BURST - 0.15, ZE_BURST))
          const rr = Math.max(2, Math.round(sphereR * q * (1 - shrink * 0.5)))
          g.drawImage(glow(rr + 10, '#1a4aa8', 1.3, 0.7), cx - rr - 10, sy - rr - 10)
          ellipse(g, cx, sy, rr, rr, pattern(g, '#0a2a6a', 12))
          drawSprite(g, p.mon, cx, Math.round(sy + sz.h * 0.5 * 0.8), {
            sil: '#020308',
            outline: Math.floor(t * 20) % 2 ? '#2a8aff' : '#a8e0ff',
            sx: 0.8,
            sy: 0.8,
          })
          ellipseLine(g, cx, sy, rr, rr, '#a8e0ff')
          ellipseLine(g, cx, sy, rr - 1, rr - 1, '#2a8aff')
          ellipseLine(g, cx, sy, rr + 1, rr + 1, pattern(g, '#ffffff', 8) as string)
        }
        burstRing(g, cx, sy, span(t, ZE_BURST, ZE_BURST + 0.45), Math.max(w, h) * 0.8, 4, '#a8e0ff')
        if (t >= ZE_BURST && t < R) drawSprite(g, p.mon, cx, feet, { sil: '#020308', outline: '#ffffff' })
        if (t >= R) {
          // Its dark ring first: the reveal of ideals is a black burst edged in blue.
          burstRing(g, cx, feet - 30, span(t, R, R + 0.5), Math.max(w, h) * 0.8, 6, '#020308')
          revealFx(g, s.rays, p.mon, cx, feet, t, R, ZE_AURA, Math.max(w, h) * 0.75)
        }
        s.fx.draw(g)
        g.restore()
        // The black strikes darken the whole screen for an instant (a flash of dark, at the same spacing as light).
        ZE_BLACK.forEach((b) => {
          if (within(t, b, b + 0.08)) screenFlash(g, '#000000', 0.5)
        })
        if (within(t, R, R + 0.35)) screenFlash(g, '#ffffff', 0.8 * (1 - span(t, R, R + 0.35)))
        if (t < 0.4) wash(g, '#000000', 1 - span(t, 0, 0.4), 8)
      },
      cues: () =>
        inOrder([
          [0.1, quiet(() => tone(49, 2.4, { type: 'sine', vol: 0.06 }))],
          [
            ZE_CLIMB,
            quiet(
              () => (fxSound('thunder.charge'), tone(196, 1.4, { type: 'square', vol: 0.015, slide: 400 })),
            ),
          ],
          [ZE_GEN, quiet(() => tone(110, 1.8, { type: 'sawtooth', vol: 0.03, slide: 330 }))],
          [ZE_GEN + 0.2, quiet(() => hiss(1.6, { freq: 4000, q: 1, vol: 0.02 }))],
          ...ZE_BLACK.map(
            (b, i) =>
              [
                b,
                quiet(() => {
                  fxSound('thunder.strike')
                  tone(65 - i * 6, 0.5, { type: 'sawtooth', vol: 0.06, slide: -20 })
                }),
              ] as const,
          ),
          [
            ZE_SPHERE,
            quiet(() => (fxSound('thunder.charge'), hiss(0.6, { freq: 1500, slide: 2500, vol: 0.05 }))),
          ],
          [4.05, quiet(() => fxSound('legend.heart'))],
          [
            ZE_BURST,
            quiet(() => (fxSound('thunder.strike'), hiss(0.7, { freq: 200, type: 'lowpass', vol: 0.14 }))),
          ],
          [R, (hud) => (quiet(() => fxSound('legend.roar'))(), hud.beat?.('roar'))],
        ] satisfies Cue<ZES>[]),
    }
  },
}
