// Koraidon's raid entrance (docs/53): Area Zero in the far past. The Great Crater at dawn, its walls black against an
// amber sky, a jungle of tree ferns and rock spires, a pool in the red earth. An enormous ancient sun rises behind
// the crater's rim and swells, the light turning harsh (its Orichalcum Pulse): heat shimmer, embers. Footfalls shake
// the ground, the pool rippling with each; winged reptiles take flight. A shape climbs onto the tallest spire, small
// on the crater's far side, and roars, then leaps: over the top of its arc and down, black across the face of the sun,
// where it hangs a moment and bursts into a Collision Course, a comet of red fire coming on at the camera, straight
// into the red earth before it: the impact craters the ground, rocks and dust flying. The dust parts: it stands in its
// crater, just where the comet struck, the sun blazing behind it.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  canvas,
  ease,
  ellipse,
  ellipseLine,
  glow,
  pattern,
  lerp,
  line,
  rect,
  rng,
  span,
  wash,
  type Canvas,
  type G,
} from '../../pixel'
import { drawSprite } from '../../sprites'
import { screenFlash } from '../../timeline'
import { drawRays } from '../legend'
import { raidScene, ridge, type Ctx } from './gen9kit'
import { dGradient, dissolve, drawShards, makeShard, pulse, stepShards, wobble, type Shard } from './kit'

/** Its footfalls before it is seen. */
const STEPS = [0.85, 1.4, 1.9, 2.3] as const
const T_SUN = 0.2
const T_CREST = 2.5
const T_ROAR = 2.7
const T_LEAP = 2.95
const T_DIVE = 3.5
const T_IMPACT = 3.9
const REVEAL = 4.5
/** Its size on the far spire: it grows as its arc brings it across the crater, nearer the camera. */
const FAR = 0.45
/** How far along its arc it bursts into flame: falling across the sun's face. */
const IGNITE = 0.7

const AURA = ['#ffffff', '#ffd0a0', '#e0402a', '#5a0a10'] as const
const FIRE = ['#ffffff', '#fff3a0', '#ffbe2e', '#ff6a1e', '#c8281a', '#5a0a10'] as const

type X = {
  dawn: Canvas
  blaze: Canvas
  land: Canvas
  fern: Canvas
  dust: ReturnType<typeof makeDust>
  rocks: Shard[]
  birds: { x: number; y: number; v: number; ph: number }[]
}

/** Dust puffs: their own list, drawn over it after the impact. */
const makeDust = () =>
  [] as { x: number; y: number; vx: number; vy: number; r: number; age: number; life: number }[]

/** Where things are on this screen. */
function layout(c: Ctx) {
  const horizon = Math.round(c.h * 0.5)
  const R = Math.round(Math.min(c.m * 0.36, c.h * 0.3))
  // The spire far enough in for all of it to stand on its top, on screen.
  const crag = {
    x: Math.round(c.w - Math.max(18, c.w * 0.16, (c.sz.w * FAR) / 2 + 3)),
    top: Math.round(c.h * 0.3),
  }
  // The red earth reaches back past its feet, the jungle beyond: it lands and stands on the ground, its crater in it.
  return { horizon, R, crag, ground: Math.round(c.feet - Math.max(12, c.h * 0.06)) }
}

/** The crater, its jungle and its earth, drawn once: far walls, spires, tree ferns, the pool. */
function landscape(c: Ctx): Canvas {
  const { w, h } = c
  const L = layout(c)
  const cv = canvas(w, h)
  const g = cv.g
  // The crater's far wall, then its nearer slopes, black against the light.
  ridge(g, w, L.horizon + 4, c.h * 0.07, '#3a1418', 11, h, 0.5)
  ridge(g, w, L.horizon + 14, c.h * 0.05, '#2a0c12', 12, h, 0.35)
  // Rock spires, the tallest the one it will crest: tapering, lit on the sun's side.
  // `flat` broadens the top into a ledge (the one it stands on).
  const spire = (x: number, top: number, base: number, wd: number, lit: number, flat = 0) => {
    for (let y = top; y < base; y++) {
      const k = (y - top) / (base - top)
      const hw = Math.round(wd * (0.35 + 0.65 * k) + flat * (1 - k) + Math.sin(y / 3) * 0.6)
      rect(g, x - hw, y, hw * 2, 1, '#1e0a0c')
      rect(g, x - hw * lit, y, 1, 1, '#7a3018')
      if (y % 7 === 0) rect(g, x - hw + 1, y, hw * 2 - 2, 1, '#14060a')
    }
    rect(g, x - Math.round(wd * 0.4 + flat), top - 1, Math.round(wd * 0.8 + flat * 2), 2, '#7a3018')
  }
  spire(L.crag.x, L.crag.top, L.ground + 6, Math.max(9, Math.round(c.w * 0.05)), -1, 3)
  spire(Math.round(c.w * 0.1), Math.round(c.h * 0.4), L.ground + 6, 6, 1)
  if (c.w > 200) {
    spire(Math.round(c.w * 0.3), Math.round(c.h * 0.44), L.ground, 5, 1)
    spire(Math.round(c.w * 0.66), Math.round(c.h * 0.42), L.ground, 6, -1)
  }
  // The jungle's line: tree ferns on tall trunks, their crowns dark against the sky.
  const r = rng(1007)
  for (let x = -6; x < w + 6; x += r.range(9, 17)) {
    const top = Math.round(L.horizon + 6 + r.range(-6, 10))
    treeFern(g, x, top, L.ground, r.range(6, 11))
  }
  // The red earth, its pool, its stones.
  g.drawImage(dGradient(w, h - L.ground, ['#4a1a10', '#2e0e0a', '#1a0606']), 0, L.ground)
  rect(g, 0, L.ground, w, 1, '#8a3a1a')
  for (let i = 0; i < w / 4; i++) {
    const x = r.range(0, w)
    const y = r.range(L.ground + 3, h)
    rect(g, x, y, r.int(2, 4), 1, y % 3 ? '#5a2214' : '#14040a')
  }
  const pool = { x: Math.round(c.w * 0.26), y: Math.round(L.ground + (h - L.ground) * 0.45) }
  ellipse(g, pool.x, pool.y, Math.round(c.w * 0.16), 4, '#14060a')
  ellipse(g, pool.x, pool.y, Math.round(c.w * 0.16) - 1, 3, '#a8401e')
  rect(g, pool.x - Math.round(c.w * 0.08), pool.y - 1, Math.round(c.w * 0.1), 1, '#ffb04a')
  return cv
}

/** A tree fern: a scaly trunk and a crown of drooping fronds. */
function treeFern(g: G, x: number, top: number, ground: number, s: number) {
  rect(g, x - 1, top, 3, ground - top, '#1a080a')
  for (let y = top + 2; y < ground; y += 3) rect(g, x - 1, y, 3, 1, '#2a0e0e')
  for (let i = 0; i < 7; i++) {
    const a = Math.PI + (i / 6) * Math.PI
    let px = x
    let py = top
    for (let k = 1; k <= s; k++) {
      // Out along the frond, then drooping.
      const nx = x + Math.cos(a) * k * 1.3
      const ny = top + Math.sin(a) * k * 0.8 + (k * k) / (s * 0.9)
      line(g, px, py, nx, ny, '#140608')
      if (k % 2 === 0) rect(g, nx, ny + 1, 1, 2, '#140608')
      px = nx
      py = ny
    }
  }
  rect(g, x - 1, top - 1, 3, 2, '#3a1a10')
}

/** Ferns in the foreground corners: the camera is in the jungle, looking out at the crater. */
function ferns(c: Ctx): Canvas {
  const cv = canvas(c.w, c.h)
  const g = cv.g
  const frond = (x: number, y: number, a: number, len: number) => {
    for (let k = 0; k < len; k++) {
      const q = k / len
      const fx = x + Math.cos(a + q * 0.9) * k
      const fy = y + Math.sin(a + q * 0.9) * k
      rect(g, fx, fy, 2, 2, '#0a0404')
      const leaf = Math.round((1 - q) * 5) + 1
      rect(g, fx - leaf, fy + 1, leaf, 1, '#0a0404')
      rect(g, fx + 1, fy - leaf + 1, 1, leaf, '#0a0404')
      if (k % 3 === 0) rect(g, fx, fy - 1, 1, 1, '#4a1a10')
    }
  }
  for (const [x, a] of [
    [-4, -0.9],
    [-2, -0.5],
    [2, -1.3],
  ] as const)
    frond(x, c.h + 2, a, Math.round(c.h * 0.26))
  for (const [x, a] of [
    [c.w + 4, -2.2],
    [c.w + 2, -2.6],
    [c.w - 2, -1.9],
  ] as const)
    frond(x, c.h + 2, a, Math.round(c.h * 0.22))
  return cv
}

/** A winged reptile, a few pixels: a long head, two angled wings flapping. */
function drawBird(g: G, x: number, y: number, ph: number) {
  const up = Math.sin(ph) > 0
  rect(g, x - 1, y, 4, 1, '#14060a')
  rect(g, x - 3, y + 1, 2, 1, '#14060a')
  line(g, x, y, x - 5, y + (up ? -3 : 2), '#14060a')
  line(g, x + 2, y, x + 7, y + (up ? -3 : 2), '#14060a')
}

/**
 * Where its feet are from the leap to the impact: one arc from the spire's top to the spot it will stand on, up off
 * the summit, over and down across the sun's face, where it slows to hang a moment as it ignites, then the comet the
 * rest of the way. All of it leftward, the way it faces, so the comet that lands is the shape that stands up.
 */
function flight(c: Ctx, t: number) {
  const L = layout(c)
  const k = span(t, T_LEAP, T_DIVE)
  const q = span(t, T_DIVE, T_IMPACT)
  const u = t < T_DIVE ? IGNITE * (0.8 * ease.outQ(k) + 0.2 * k) : lerp(IGNITE, 1, q * (0.2 + 0.8 * q))
  const hop = Math.round(c.h * 0.1)
  const x = lerp(L.crag.x, c.cx, u)
  const y = L.crag.top + (c.feet - L.crag.top) * u * u - hop * 4 * u * (1 - u)
  const s = lerp(FAR, 1, u * u * u)
  // How squarely its body is on the sun's face: the rays flare then.
  const sun = { x: c.cx, y: L.horizon - Math.round(L.R * 0.55) }
  const over = Math.max(0, 1 - Math.hypot(x - sun.x, y - (c.sz.h * s) / 2 - sun.y) / L.R)
  return { x, y, s, over }
}

export const koraidonCinema = raidScene<X>({
  id: 'cinema-koraidon',
  reveal: REVEAL,
  seed: 1007,
  aura: AURA,
  flash: '#fff0d0',
  feet: 0.65,
  rays: '#ffbe2e',
  setup(c, r) {
    const L = layout(c)
    return {
      dawn: dGradient(c.w, L.horizon + 20, ['#1a0812', '#3a0e1a', '#7a2a1e', '#c8602a', '#ffa848']),
      blaze: dGradient(c.w, L.horizon + 20, ['#4a120e', '#a02a14', '#e0602a', '#ffa83a', '#ffe08a']),
      land: landscape(c),
      fern: ferns(c),
      dust: makeDust(),
      rocks: [],
      birds: Array.from({ length: 6 }, () => ({
        x: r.range(c.w * 0.2, c.w * 0.8),
        y: r.range(L.horizon - 2, L.horizon + 12),
        v: r.range(30, 55),
        ph: r() * 6,
      })),
    }
  },
  step(c, s, t, dt) {
    const r = s.r
    const L = layout(c)
    stepShards(s.rocks, dt, { floor: c.feet + 12 })
    for (const d of s.dust) {
      d.age += dt
      d.x += d.vx * dt
      d.y += d.vy * dt
      d.vx *= 1 - 1.6 * dt
      d.vy *= 1 - 1.6 * dt
      d.r += dt * 6
    }
    for (let i = s.dust.length - 1; i >= 0; i--) if (s.dust[i]!.age > s.dust[i]!.life) s.dust.splice(i, 1)
    // Embers in the hot air, more as the sun swells.
    const heat = span(t, 1, 3)
    if (r() < (0.15 + heat * 0.5) * c.many)
      s.fx.add({
        x: r.range(0, c.w),
        y: c.h + 2,
        vx: r.range(-6, 6),
        vy: -r.range(14, 30),
        life: r.range(2, 4),
        size: 1,
        shape: 'px',
        colors: ['#ffe08a', '#ffbe2e', '#ff6a1e', '#7a2a10'],
      })
    // The footfalls: dust off the ground, the reptiles away at the first.
    for (const at of STEPS)
      if (t >= at && t - dt < at)
        for (let i = 0; i < 10 * c.many; i++)
          s.fx.add({
            x: r.range(0, c.w),
            y: L.ground + r.range(0, 8),
            vx: r.range(-8, 8),
            vy: -r.range(10, 30),
            ay: 60,
            life: 0.6,
            size: 1,
            shape: 'px',
            colors: ['#8a3a1a', '#5a2214'],
          })
    // The reptiles flee the footfalls, up and away.
    if (t > STEPS[0])
      for (const b of s.birds) {
        b.x -= b.v * dt * 0.4
        b.y -= b.v * dt * 0.5
        b.ph += dt * 14
      }
    // The fire it trails as it comes down.
    if (t > T_DIVE && t < T_IMPACT) {
      const f = flight(c, t)
      // Streaming back along its path.
      const b = flight(c, t - 0.03)
      const len = Math.hypot(f.x - b.x, f.y - b.y) || 1
      for (let i = 0; i < 4; i++) {
        const v = r.range(50, 100)
        s.fx.add({
          x: f.x + r.range(-6, 6) * f.s,
          y: f.y - c.sz.h * f.s * 0.5 + r.range(-8, 8) * f.s,
          vx: ((b.x - f.x) / len) * v + r.range(-20, 20),
          vy: ((b.y - f.y) / len) * v + r.range(-20, 20),
          drag: 3,
          life: r.range(0.3, 0.6),
          size: 3,
          size1: 0,
          shape: 'sq',
          colors: [...FIRE],
        })
      }
    }
    // The impact: rocks, a ring of dust, sparks.
    if (t >= T_IMPACT && t - dt < T_IMPACT) {
      for (let i = 0; i < 40 * c.many + 10; i++) {
        const sh = makeShard(
          r,
          c.cx + r.range(-14, 14),
          c.feet,
          r.range(120, 230),
          r() < 0.5 ? '#5a2214' : '#3a140e',
          '#c8602a',
          1.1,
        )
        sh.vx *= 1.6
        s.rocks.push(sh)
      }
      for (let i = 0; i < 26; i++) {
        const a = r.range(Math.PI, Math.PI * 2)
        const v = r.range(40, 110)
        s.dust.push({
          x: c.cx + Math.cos(a) * 8,
          y: c.feet - 2,
          vx: Math.cos(a) * v * 1.6,
          vy: Math.sin(a) * v * 0.5,
          r: r.range(5, 10),
          age: 0,
          life: r.range(0.7, 1.1),
        })
      }
      for (let i = 0; i < 50 * c.many; i++) {
        const a = r.range(Math.PI * 1.05, Math.PI * 1.95)
        const v = r.range(80, 200)
        s.fx.add({
          x: c.cx,
          y: c.feet,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          ay: 240,
          life: r.range(0.5, 1),
          size: 1,
          shape: 'streak',
          trail: 0.03,
          colors: [...FIRE],
        })
      }
    }
  },
  back(g, c, s, t) {
    const L = layout(c)
    // The sky: dawn, turning to a blaze as the sun swells.
    g.drawImage(s.dawn, 0, 0)
    dissolve(g, s.blaze, ease.ioS(span(t, 1.2, 2.6)))
    // The ancient sun: rising, then swelling, its heat rippling the air before it.
    const rise = ease.outC(span(t, T_SUN, 2.2))
    const R = Math.round(L.R * lerp(0.8, 1, span(t, 1.6, 2.8)))
    const sx = c.cx
    const sy = Math.round(lerp(L.horizon + R * 0.9, L.horizon - R * 0.55, rise))
    const hot = span(t, 1.4, 2.8)
    // The rays flare as it crosses the sun's face.
    const cross = t > T_LEAP && t < T_IMPACT ? flight(c, t).over : 0
    // Until the reveal: then its own rays take over (one pass of them a frame is enough).
    if (t > 1.6 && t < REVEAL) {
      drawRays(s.rays, { x: sx, y: sy }, t * 0.4, '#ffd06a', (0.35 + 0.4 * cross) * hot)
      g.drawImage(s.rays, 0, 0)
    }
    const gr = Math.round(R * 1.6)
    g.drawImage(glow(gr, '#ff8a2a', 1.2, 0.55), sx - gr, sy - gr)
    ellipse(g, sx, sy, R, R, '#ffbe4a')
    ellipse(g, sx, sy, R - 2, R - 2, '#ffe08a')
    ellipse(g, sx, sy, Math.round(R * 0.82), Math.round(R * 0.82), hot > 0.5 ? '#ffffff' : '#fff3c0')
    // Sunspots: an old, enormous star.
    rect(g, sx - Math.round(R * 0.4), sy + Math.round(R * 0.2), 3, 2, '#ffbe4a')
    rect(g, sx + Math.round(R * 0.3), sy - Math.round(R * 0.35), 2, 2, '#ffd06a')
    // The land over it, its lower rows shimmering with heat once the sun is hot.
    if (hot > 0.2 && !c.short) {
      wobble(g, s.land, c.w, 0, L.horizon + 24, t, hot)
      g.drawImage(
        s.land,
        0,
        L.horizon + 24,
        c.w,
        c.h - L.horizon - 24,
        0,
        L.horizon + 24,
        c.w,
        c.h - L.horizon - 24,
      )
    } else g.drawImage(s.land, 0, 0)
    // The pool, rippling with each footfall.
    const px = Math.round(c.w * 0.26)
    const py = Math.round(L.ground + (c.h - L.ground) * 0.45)
    for (const at of STEPS) {
      const q = span(t, at, at + 0.8)
      if (q > 0 && q < 1)
        ellipseLine(g, px, py, Math.round(2 + q * c.w * 0.14), Math.round(1 + q * 3), '#ffd06a')
    }
    for (const b of s.birds) if (t > STEPS[0] && b.y > -6) drawBird(g, Math.round(b.x), Math.round(b.y), b.ph)
    // Its crater after the impact: a scorched bowl, its rim lit.
    if (t >= T_IMPACT) {
      const q = ease.outC(span(t, T_IMPACT, T_IMPACT + 0.25))
      const rx = Math.round(c.m * 0.3 * q)
      ellipse(g, c.cx, c.feet + 2, rx, Math.max(1, Math.round(rx * 0.2)), '#14040a')
      ellipseLine(g, c.cx, c.feet + 2, rx, Math.max(1, Math.round(rx * 0.2)), '#e0602a', Math.PI, Math.PI * 2)
      ellipseLine(g, c.cx, c.feet + 3, rx + 2, Math.max(1, Math.round(rx * 0.2)), '#5a2214', 0, Math.PI)
      // Its glow, cooling.
      const gl = Math.round((1 - span(t, T_IMPACT, REVEAL + 1.5)) * 4) / 4
      const gr = (rx >> 2) * 4 + 6
      if (gl > 0) g.drawImage(glow(gr, '#ff6a1e', 1.4, 0.5 * gl), c.cx - gr, c.feet + 2 - gr)
    }
  },
  before(g, c, _s, t) {
    const L = layout(c)
    // On top of the far spire, a shape against the sky, climbing up from behind its summit (none of it below the top);
    // then leaping, black across the sun's face.
    if (t >= T_CREST && t < T_LEAP) {
      const up = ease.outBack(span(t, T_CREST, T_CREST + 0.3))
      const roar = within(t, T_ROAR, T_ROAR + 0.3)
      g.save()
      g.beginPath()
      g.rect(0, 0, c.w, L.crag.top)
      g.clip()
      drawSprite(g, c.mon, L.crag.x, L.crag.top + Math.round((1 - up) * c.sz.h * FAR), {
        sx: FAR,
        sy: FAR,
        sil: '#14040a',
        outline: roar && Math.floor(t * 20) % 2 ? '#ffe08a' : '#c8401e',
        dx: roar ? Math.round(Math.sin(t * 90)) : 0,
      })
      g.restore()
    }
    if (t >= T_LEAP && t < T_IMPACT) {
      const f = flight(c, t)
      const diving = t > T_DIVE
      if (diving) {
        // Collision Course: a comet of red fire, its afterimages burning behind it, the air ahead lit white.
        const k = span(t, T_DIVE, T_IMPACT)
        const gr = (Math.round(16 + 22 * k) >> 1) * 2
        const my = Math.round(f.y - c.sz.h * f.s * 0.5)
        g.drawImage(glow(gr, '#ff6a1e', 1.1, 0.85), Math.round(f.x) - gr, my - gr)
        const trail = ['#ffbe2e', '#ff6a1e', '#c8281a', '#7a1410'] as const
        for (let i = trail.length; i >= 1; i--) {
          const b = flight(c, Math.max(T_DIVE, t - i * 0.035))
          drawSprite(g, c.mon, Math.round(b.x), Math.round(b.y), { sx: b.s, sy: b.s, sil: trail[i - 1]! })
        }
        const ax = c.cx - f.x
        const ay = c.feet - f.y
        const a = Math.atan2(ay, ax)
        for (let i = 0; i < 3; i++) {
          const rr = Math.round((14 + i * 5) * f.s)
          const ox = f.x + Math.cos(a) * rr * 0.5
          const oy = my + Math.sin(a) * rr * 0.5
          ellipseLine(g, ox, oy, rr, rr, i ? '#ffbe2e' : '#ffffff', a - 1.1 + i * 0.15, a + 1.1 - i * 0.15)
        }
      }
      drawSprite(g, c.mon, Math.round(f.x), Math.round(f.y), {
        sx: f.s,
        sy: f.s,
        sil: diving ? '#5a0a10' : '#14040a',
        outline: diving ? (Math.floor(t * 20) % 2 ? '#ffffff' : '#ffbe2e') : '#ffbe4a',
      })
    }
    // In the dust after the impact: its shape where the comet struck, its outline glowing, rising from a crouch.
    if (t >= T_IMPACT) {
      const up = ease.outQ(span(t, T_IMPACT, T_IMPACT + 0.35))
      drawSprite(g, c.mon, c.cx, c.feet, {
        sy: lerp(0.8, 1, up),
        sx: lerp(1.15, 1, up),
        sil: '#2a0a0c',
        outline: Math.floor(t * 14) % 2 ? AURA[2] : '#ffbe2e',
      })
    }
  },
  front(g, c, s, t) {
    const L = layout(c)
    drawShards(g, s.rocks, '#14040a')
    // The dust wall: puffs lit on top by the sun, thinning out before the reveal.
    for (const d of s.dust) {
      const k = d.age / d.life
      const rr = Math.round(d.r)
      const ry = Math.round(rr * 0.7)
      // Solid while thick, lit on top by the sun, then breaking into dither as it thins.
      const thin = k < 0.55 ? 16 : (1 - k) * 34
      ellipse(g, d.x, d.y, rr, ry, pattern(g, '#4a2014', thin))
      ellipse(g, d.x - 1, d.y - 2, Math.max(1, rr - 2), Math.max(1, ry - 2), pattern(g, '#8a4424', thin))
      if (k < 0.5) rect(g, d.x - Math.round(rr * 0.4), d.y - ry, Math.round(rr * 0.6), 1, '#c8703a')
    }
    // Shockwaves along the ground from the impact.
    for (const d of [0, 0.15]) {
      const q = span(t, T_IMPACT + d, T_IMPACT + d + 0.6)
      if (q > 0 && q < 1) {
        const rx = Math.round(lerp(8, c.w * 0.75, ease.outC(q)))
        // Flattening as they spread, to keep to the earth (not over the jungle beyond it).
        const ry = Math.max(2, Math.min(Math.round(rx * 0.16), c.feet + 2 - L.ground))
        ellipseLine(g, c.cx, c.feet + 2, rx, ry, d ? '#ff6a1e' : '#fff3a0')
      }
    }
    g.drawImage(s.fern, 0, 0)
    // The sun's blaze washing the frame warm at its height, the dark of dawn before it.
    if (t < 1.2) wash(g, '#0a0204', 0.4 * (1 - span(t, 0.2, 1.2)), 8)
    const blaze = pulse(t, T_IMPACT - 0.05, T_IMPACT + 0.35)
    if (blaze > 0) screenFlash(g, '#ff8a2a', 0.25 * blaze)
  },
  shakes: () => [
    ...STEPS.map((at, i) => [at, 0.18, 1 + (i >> 1)] as [number, number, number]),
    [T_ROAR, 0.35, 1],
    [T_IMPACT, 0.6, 6],
  ],
  sounds: () => [
    [0.1, () => tone(65, 2.4, { type: 'sine', vol: 0.05, slide: 30 })],
    ...STEPS.map(
      (at, i) =>
        [
          at,
          () => (
            tone(50 + i * 4, 0.35, { type: 'sine', vol: 0.12 }),
            hiss(0.25, { freq: 200, type: 'lowpass', vol: 0.08 })
          ),
        ] as const,
    ),
    [
      STEPS[0] + 0.1,
      () =>
        [1800, 2100, 1700].forEach((f, i) =>
          tone(f, 0.08, { type: 'square', vol: 0.015, at: i * 0.09, slide: -300 }),
        ),
    ],
    [1.6, () => hiss(2.2, { freq: 500, slide: 1200, vol: 0.03 })],
    [
      T_ROAR,
      () => (
        tone(180, 0.6, { type: 'sawtooth', vol: 0.06, slide: -90 }),
        tone(240, 0.5, { type: 'square', vol: 0.03, slide: -120 })
      ),
    ],
    [T_LEAP, () => hiss(0.5, { freq: 900, slide: 1500, vol: 0.05 })],
    [T_DIVE, () => fxSound('fire.stream')],
    [
      T_IMPACT,
      () => (
        fxSound('impact.hit'),
        hiss(0.9, { freq: 160, type: 'lowpass', vol: 0.16 }),
        tone(45, 0.7, { type: 'sine', vol: 0.12 })
      ),
    ],
    [T_IMPACT + 0.3, () => fxSound('legend.heart')],
  ],
})

const within = (t: number, a: number, b: number) => t >= a && t < b
