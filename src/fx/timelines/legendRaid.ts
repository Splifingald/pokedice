// A legendary's raid entrance (docs/39 §5, the raid overhaul): its own place, drawn on the pixel engine like Giratina's
// Distortion World entrance (portalRaid.ts) and Darkrai's (nightmareRaid.ts), and timed the same way so the raid intro's
// words land on it: the place, its weather, an omen of its own (ice spreading, bells ringing, a quake, a whirlpool…),
// two heartbeats, the legend's silhouette coming down, rising or taking shape, rays and a gleam; the reveal on the raid
// intro's white-out (RAID_ENTRANCE_REVEAL), then it hovers there. Every scene is data (legendRaidScenes.ts).
import {
  bayer,
  bolt,
  cached,
  canvas,
  ease,
  glow,
  lerp,
  line,
  mix,
  Particles,
  polyline,
  rect,
  ring,
  rng,
  span,
  wash,
  type Canvas,
  type G,
  type Rng,
} from '../pixel'
import { drawSprite, spriteFrame } from '../sprites'
import { screenFlash, screenShake, W, H, within, type Cue, type Timeline } from '../timeline'
import { quiet } from './portal'
import { drawRays, gleam } from './legend'
import { RAID_ENTRANCE_DUR, RAID_ENTRANCE_REVEAL } from './portalRaid'
import type { LegendRaidScene } from './legendRaidScenes'

export interface LegendRaidParams {
  scene: LegendRaidScene
  /** The raid Pokémon's front sprite key. */
  mon: string
  w?: number
  h?: number
  /** Fewer particles and no shake (the "short" motion level). */
  short?: boolean
}

type State = {
  r: Rng
  fx: Particles
  amb: Particles
  rays: Canvas
  bolts: [number, number][][]
  cracks: [number, number][][]
  dots: { x: number; y: number; at: number }[]
  shakes: [number, number, number][]
}

/** The place: its sky in dithered steps, then its ground (or water) band, drawn once per size. */
function backdrop(scene: LegendRaidScene, w: number, h: number): Canvas {
  const cv = canvas(w, h)
  const g = cv.g
  const horizon = Math.round(h * 0.68)
  for (let y = 0; y < horizon; y++)
    for (let x = 0; x < w; x++) {
      const k = y / horizon
      // Four steps between the two colours, the step chosen by the ordered dither: a pixel sky, no gradient.
      const steps = 4
      const lv = Math.min(steps, Math.floor(k * steps + bayer(x, y)))
      rect(g, x, y, 1, 1, mix(scene.sky[0], scene.sky[1], lv / steps))
    }
  rect(g, 0, horizon, w, h - horizon, scene.ground)
  rect(g, 0, horizon, w, 1, mix(scene.ground, '#ffffff', 0.25))
  for (let y = horizon + 2; y < h; y += 3)
    for (let x = (y * 7) % 11; x < w; x += 11) rect(g, x, y, 2, 1, mix(scene.ground, '#000000', 0.18))
  return cv
}

/** Its weather, a few particles a step, all through the entrance. */
/** How thick each weather falls: slow, long-lived flakes and feathers far fewer than rain. */
const WEATHER_RATE: Record<LegendRaidScene['weather'], number> = {
  none: 0,
  snow: 0.3,
  rain: 1,
  embers: 0.5,
  ash: 0.4,
  leaves: 0.12,
  petals: 0.15,
  sparks: 0.5,
  stars: 0.25,
  dust: 0.4,
  motes: 0.35,
  bubbles: 0.3,
  feathers: 0.06,
}

function emitWeather(P: Particles, scene: LegendRaidScene, r: Rng, w: number, h: number, rate: number) {
  if (r() > rate * WEATHER_RATE[scene.weather]) return
  const c = scene.wColors
  switch (scene.weather) {
    case 'snow':
      return P.add({
        x: r.range(0, w + 30),
        y: -4,
        vx: -r.range(6, 14),
        vy: r.range(14, 28),
        life: 8,
        size: r.int(1, 3),
        shape: 'flake',
        colors: c,
      })
    case 'rain':
      return P.add({
        x: r.range(0, w + 40),
        y: -6,
        vx: -30,
        vy: r.range(150, 210),
        life: 2,
        size: 1,
        shape: 'streak',
        colors: c,
      })
    case 'embers':
    case 'ash':
      return P.add({
        x: r.range(0, w),
        y: h + 2,
        vx: r.range(-6, 6),
        vy: -r.range(14, 32),
        life: r.range(2.5, 4),
        size: 1,
        shape: 'sq',
        colors: c,
      })
    case 'leaves':
    case 'petals':
      return P.add({
        x: r.range(-10, w),
        y: -4,
        vx: r.range(6, 18),
        vy: r.range(10, 22),
        life: 8,
        size: 2,
        shape: 'leaf',
        spin: r.range(-4, 4),
        colors: c,
      })
    case 'sparks':
      return P.add({
        x: r.range(0, w),
        y: r.range(0, h * 0.7),
        vx: r.range(-30, 30),
        vy: r.range(-30, 30),
        drag: 3,
        life: 0.4,
        size: 1,
        shape: 'plus',
        colors: c,
      })
    case 'stars':
      return P.add({
        x: r.range(0, w),
        y: r.range(0, h * 0.6),
        life: r.range(0.8, 1.6),
        size: r.int(1, 2),
        shape: 'star',
        colors: c,
      })
    case 'dust':
    case 'motes':
      return P.add({
        x: r.range(0, w),
        y: r.range(h * 0.2, h),
        vx: r.range(-4, 4),
        vy: -r.range(2, 8),
        life: r.range(2, 4),
        size: 1,
        shape: 'px',
        colors: c,
      })
    case 'bubbles':
      return P.add({
        x: r.range(0, w),
        y: h + 2,
        vy: -r.range(12, 26),
        life: r.range(3, 5),
        size: r.int(1, 3),
        shape: 'bubble',
        colors: c,
      })
    case 'feathers':
      return P.add({
        x: r.range(0, w),
        y: -4,
        vx: r.range(-8, 8),
        vy: r.range(8, 16),
        life: 9,
        size: 2,
        shape: 'oval',
        spin: r.range(-2, 2),
        colors: c,
      })
  }
}

/** Its omen, between the opening and the reveal: `q` 0→1 as it builds, `t` the entrance's time. */
function drawOmen(g: G, s: State, scene: LegendRaidScene, t: number, q: number, w: number, h: number) {
  const C = scene.oColors
  const cx = Math.round(w / 2)
  const cy = Math.round(h * 0.45)
  switch (scene.omen) {
    case 'freeze': {
      // Frost creeping in from the edges, dithered.
      const T = Math.round(q * Math.min(w, h) * 0.16)
      for (let y = 0; y < h; y += 2)
        for (let x = 0; x < w; x += 2) {
          const d = Math.min(x, y, w - x, h - y)
          if (d < T && bayer(x >> 1, y >> 1) < 1 - d / T) rect(g, x, y, 2, 2, d < T * 0.4 ? C[0]! : C[1]!)
        }
      return
    }
    case 'storm': {
      // Lightning: a bolt every so often, the sky lit for a frame.
      const k = Math.floor(t * 3)
      const b = s.bolts[k % s.bolts.length]!
      if ((t * 3) % 1 < 0.18 && q > 0) {
        wash(g, C[1] ?? '#ffffff', 0.25, 4)
        polyline(g, b, C[0]!, 2)
      }
      return
    }
    case 'quake': {
      const n = Math.max(1, Math.floor(q * 10))
      for (const pts of s.cracks) {
        const m = Math.min(pts.length, n)
        for (let i = 1; i < m; i++) line(g, pts[i - 1]![0], pts[i - 1]![1], pts[i]![0], pts[i]![1], C[0]!, 2)
      }
      if (q > 0.3)
        g.drawImage(
          glow(Math.round(20 + q * 30), C[1]!, 1.4, 0.5 * q),
          cx - Math.round(20 + q * 30),
          Math.round(h * 0.68) - Math.round(20 + q * 30),
        )
      return
    }
    case 'whirl':
    case 'orbit': {
      // A ring of colours turning round the middle: a whirlpool's spray, or Arceus's plates.
      const n = scene.omen === 'orbit' ? C.length : 18
      const R = Math.round(
        Math.min(w, h) * (scene.omen === 'orbit' ? 0.34 : 0.3) * (scene.omen === 'whirl' ? 1 - q * 0.5 : 1),
      )
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + t * (scene.omen === 'whirl' ? 3 : 0.8)
        const x = Math.round(cx + Math.cos(a) * R)
        const y = Math.round(cy + Math.sin(a) * R * 0.45)
        const big = scene.omen === 'orbit'
        if (big) rect(g, x - 3, y - 4, 7, 9, '#24304f')
        rect(g, x - (big ? 2 : 1), y - (big ? 3 : 1), big ? 5 : 2, big ? 7 : 2, C[i % C.length]!)
      }
      return
    }
    case 'bells': {
      // Rings, one after another, from the middle: bells chiming, a gong.
      for (let k = 0; k < 5; k++) {
        const p = span(t, 0.5 + k * 0.28, 0.5 + k * 0.28 + 0.6)
        if (p > 0 && p < 1) {
          const rr = Math.round(6 + p * Math.max(w, h) * 0.45)
          g.drawImage(ring(rr, 2, C[k % C.length]!, 1 - p), cx - rr - 1, cy - rr - 1)
        }
      }
      return
    }
    case 'braille': {
      // Dots on the walls lighting one by one.
      for (const d of s.dots)
        if (t > d.at) rect(g, d.x, d.y, 2, 2, Math.floor(t * 6 + d.x) % 4 ? C[0]! : C[1]!)
      return
    }
    case 'shimmer': {
      // A see-through ripple crossing the screen.
      const x0 = Math.round(lerp(-30, w + 30, q))
      for (let y = 0; y < h; y += 2) {
        const dx = Math.round(Math.sin(y / 6 + t * 8) * 3)
        rect(g, x0 + dx, y, 2, 1, C[0]!)
        rect(g, x0 + dx - 12, y, 1, 1, C[1] ?? C[0]!)
      }
      return
    }
    case 'fog': {
      for (let k = 0; k < 4; k++) {
        const y = Math.round(h * (0.35 + k * 0.12))
        const x = Math.round(((t * (10 + k * 4) + k * 60) % (w + 80)) - 80)
        g.globalAlpha = 0.35 * (1 - q * 0.6)
        rect(g, x, y, 80, 6, C[k % C.length]!)
        rect(g, x + 10, y - 3, 50, 3, C[k % C.length]!)
        g.globalAlpha = 1
      }
      return
    }
    case 'drain':
      // The colours drain away towards grey.
      wash(g, C[0] ?? '#3a3a3a', 0.55 * q, 6)
      return
    case 'pillar': {
      // A column of light (or fire) rising from the ground at the middle.
      const top = Math.round(lerp(h * 0.68, -4, ease.outC(q)))
      const half = Math.round(4 + q * 6)
      for (let y = top; y < h * 0.68; y++) {
        const wob = Math.round(Math.sin(y / 5 + t * 12))
        rect(g, cx - half + wob, y, half * 2, 1, (y + Math.floor(t * 20)) % 4 ? C[0]! : C[1]!)
      }
      return
    }
    case 'cells':
    case 'prism':
    case 'meteors':
      // Their particles carry them (step()).
      return
    case 'grid': {
      // A neon grid drawing itself across the floor.
      const horizon = Math.round(h * 0.68)
      const n = Math.floor(q * 12)
      for (let i = 0; i <= n; i++) {
        const x = Math.round(lerp(-w, w * 2, i / 12))
        line(g, cx, horizon, x, h, C[0]!)
      }
      for (let k = 1; k <= Math.floor(q * 6); k++) {
        const y = Math.round(horizon + (h - horizon) * (k / 6) ** 1.6)
        line(g, 0, y, w, y, C[1] ?? C[0]!)
      }
      return
    }
    case 'slashes': {
      // Three blade slashes crossing the screen, one after another.
      for (let k = 0; k < 3; k++) {
        const p = span(t, 0.6 + k * 0.35, 0.8 + k * 0.35)
        if (p <= 0 || p >= 1.6) continue
        const y0 = Math.round(h * (0.25 + k * 0.18))
        const L = Math.round(w * 1.2 * Math.min(1, p))
        line(g, -10, y0 + 40, -10 + L, y0 + 40 - Math.round(L * 0.6), C[k % C.length]!, 2)
      }
      return
    }
    case 'rift': {
      // A tear opening down the middle.
      const hh = Math.round(h * 0.3 * ease.outC(q))
      const ww = Math.max(1, Math.round(10 * q))
      g.drawImage(glow(hh + 4, C[1] ?? C[0]!, 1.6, 0.6 * q), cx - hh - 4, cy - hh - 4)
      rect(g, cx - (ww >> 1), cy - hh, ww, hh * 2, C[0]!)
      rect(g, cx, cy - hh, 1, hh * 2, '#ffffff')
      return
    }
    case 'bloom': {
      // Light blooming out of the ground: rays of its colour fanning up.
      for (let k = 0; k < 9; k++) {
        const a = Math.PI + (k / 8) * Math.PI
        const L = Math.round(q * h * 0.5)
        line(
          g,
          cx,
          Math.round(h * 0.68),
          cx + Math.round(Math.cos(a) * L),
          Math.round(h * 0.68) + Math.round(Math.sin(a) * L),
          C[k % C.length]!,
        )
      }
      return
    }
    case 'chains': {
      // Red chains strung across, snapping one by one.
      for (let k = 0; k < 3; k++) {
        const snap = 0.7 + k * 0.4
        const y = Math.round(h * (0.3 + k * 0.15))
        const gap = t > snap ? Math.round((t - snap) * 60) : 0
        for (let x = 0; x < w; x += 6)
          if (Math.abs(x - w / 2) > gap) rect(g, x, y + ((x / 6) % 2), 4, 2, C[0]!)
      }
      return
    }
  }
}

/** The raid entrance for a legend (the overhaul's raids): the place, its weather and omen, the reveal, the hover. */
export function legendRaidEntranceTimeline(p: LegendRaidParams): Timeline<State> {
  const scene = p.scene
  const w = p.w ?? W
  const h = p.h ?? H
  const horizon = Math.round(h * 0.68)
  const T_OMEN = 0.3
  const T_SIL = 1.6
  const T_RAYS = 2.15
  const T_REVEAL = RAID_ENTRANCE_REVEAL
  const feet = { x: Math.round(w / 2), y: Math.round(h * (scene.enter === 'descend' ? 0.6 : 0.66)) }
  const A = scene.aura
  const rate = p.short ? 0.35 : 0.8
  return {
    id: `legend-raid-entrance-${scene.omen}`,
    dur: RAID_ENTRANCE_DUR,
    setup() {
      const r = rng(scene.seed ?? 7)
      const bolts = Array.from({ length: 4 }, (_, i) =>
        bolt(r, Math.round(w * (0.2 + i * 0.2)), -2, Math.round(w * (0.3 + i * 0.12)), horizon, 0.35, 4),
      )
      const cracks = Array.from({ length: 6 }, (_, i) => {
        const a = Math.PI + (i / 5) * Math.PI
        return bolt(
          r,
          w / 2,
          horizon + 6,
          w / 2 + Math.cos(a) * w * 0.6,
          horizon + 6 + Math.abs(Math.sin(a)) * (h - horizon),
          0.3,
          3,
        )
      })
      const dots: State['dots'] = []
      for (let k = 0; k < 28; k++)
        dots.push({
          x: Math.round(r.range(6, w - 8)),
          y: Math.round(r.range(8, horizon - 10)),
          at: 0.4 + (k / 28) * 1.4,
        })
      return {
        r,
        fx: new Particles(),
        amb: new Particles(),
        rays: canvas(w, h),
        bolts,
        cracks,
        dots,
        shakes: p.short
          ? []
          : [
              ...(scene.omen === 'quake' ? ([[0.8, 1.2, 2]] as [number, number, number][]) : []),
              [T_REVEAL, 0.8, 3],
            ],
      }
    },
    step(s, t, dt) {
      s.fx.update(dt)
      s.amb.update(dt)
      const r = s.r
      emitWeather(s.amb, scene, r, w, h, rate)
      const building = t > T_OMEN && t < T_REVEAL
      // The particle omens: cells gathering, light converging, meteors streaking.
      if (building && scene.omen === 'cells' && r() < rate)
        s.amb.add({
          x: r() < 0.5 ? -2 : w + 2,
          y: r.range(0, h),
          life: 1.6,
          size: 2,
          shape: 'sq',
          home: { x: feet.x, y: feet.y - 30, k: 60 },
          drag: 1.5,
          colors: scene.oColors,
        })
      if (building && scene.omen === 'prism' && r() < rate)
        s.amb.add({
          x: r.range(0, w),
          y: -2,
          life: 1.2,
          size: 1,
          shape: 'streak',
          home: { x: feet.x, y: feet.y - 30, k: 120 },
          colors: scene.oColors,
        })
      if (scene.omen === 'meteors' && r() < rate * 0.4)
        s.amb.add({
          x: r.range(0, w * 1.4),
          y: -4,
          vx: -90,
          vy: 70,
          life: 1.6,
          size: 1,
          shape: 'streak',
          colors: scene.oColors,
        })
      if (t >= T_REVEAL && t - dt < T_REVEAL)
        for (let k = 0; k < (p.short ? 20 : 44); k++) {
          const a = r() * Math.PI * 2
          const v = r.range(40, 150)
          s.fx.add({
            x: feet.x,
            y: feet.y - 30,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v,
            drag: 2.5,
            life: r.range(0.5, 0.9),
            size: r.int(1, 2),
            shape: r() < 0.5 ? 'star' : 'sq',
            colors: A,
          })
        }
    },
    draw(g, s, t) {
      const sh = screenShake(t, s.shakes)
      g.fillStyle = scene.sky[0]
      g.fillRect(0, 0, w, h)
      g.save()
      g.translate(sh.x, sh.y)
      g.drawImage(
        cached(`legend-raid-bg:${scene.sky.join()}:${scene.ground}:${w}x${h}`, () => backdrop(scene, w, h)),
        0,
        0,
      )
      // Water: light lines rolling on it.
      if (scene.water)
        for (let y = horizon + 3; y < h; y += 5) {
          const off = Math.round((t * 12 + y * 3) % 16)
          for (let x = -16 + off; x < w; x += 16) rect(g, x, y, 6, 1, mix(scene.ground, '#ffffff', 0.35))
        }
      // Two dark pulses, the dark held while it comes, lifting with the reveal.
      let dark = Math.max(
        0.7 * Math.sin(Math.PI * span(t, 0, 0.3)),
        0.7 * Math.sin(Math.PI * span(t, 0.35, 0.65)),
      )
      if (t >= 0.3 && t < T_REVEAL) dark = Math.max(dark, lerp(0.7, 0.4, span(t, 0.3, 1)))
      if (t >= T_REVEAL) dark = lerp(0.4, 0.08, span(t, T_REVEAL, T_REVEAL + 0.6))
      if (dark > 0) wash(g, scene.night, dark, 8)
      s.amb.draw(g)
      const omenQ = span(t, T_OMEN, T_REVEAL - 0.2)
      if (t > T_OMEN && (t < T_REVEAL + 0.15 || scene.omen === 'orbit' || scene.omen === 'grid'))
        drawOmen(g, s, scene, t, t < T_REVEAL ? omenQ : 1, w, h)
      if (t > T_RAYS) {
        // Softer than Giratina's: the place stays readable behind them, and they fade once it's out.
        const k =
          span(t, T_RAYS, T_RAYS + 0.5) *
          (t > T_REVEAL ? lerp(0.5, 0.18, span(t, T_REVEAL, T_REVEAL + 1)) : 0.55)
        drawRays(s.rays, { x: feet.x, y: feet.y - 30 }, t, A[2], k)
        g.drawImage(s.rays, 0, 0)
      }
      for (const hb of [1.45, 1.75]) {
        const q = span(t, hb, hb + 0.3)
        if (q > 0 && q < 1) {
          const gr = Math.round(Math.min(w, h) * 0.3)
          g.drawImage(glow(gr, A[3], 1.3, 0.6 * Math.sin(Math.PI * q)), feet.x - gr, feet.y - 30 - gr)
        }
      }
      if (t >= T_SIL) {
        const fh = spriteFrame(p.mon)?.height ?? 64
        if (t < T_REVEAL) {
          const q = ease.outC(span(t, T_SIL, T_REVEAL - 0.15))
          const outline = Math.floor(t * 12) % 3 === 0 ? A[0] : A[2]
          if (scene.enter === 'descend') {
            // Coming down out of the sky.
            const drop = Math.round((1 - q) * (feet.y + 10))
            drawSprite(g, p.mon, feet.x, feet.y - drop, { sil: scene.night, outline })
            const gp = span(t, T_RAYS + 0.25, T_RAYS + 0.55)
            if (gp > 0 && gp < 1) gleam(g, p.mon, feet, -drop, gp)
          } else if (scene.enter === 'rise') {
            // Rising out of the ground or the water: what is under the line doesn't show.
            const lift = Math.round((1 - q) * fh)
            g.save()
            g.beginPath()
            g.rect(-10, -10, w + 20, horizon + 10)
            g.clip()
            drawSprite(g, p.mon, feet.x, feet.y + lift, { sil: scene.night, outline })
            g.restore()
            const gp = span(t, T_RAYS + 0.25, T_RAYS + 0.55)
            if (gp > 0 && gp < 1) gleam(g, p.mon, feet, lift, gp)
          } else if (Math.floor(t * 16) % 4 < 1 + Math.floor(q * 3)) {
            // Taking shape where it stands: its outline flickering in, more and more often.
            drawSprite(g, p.mon, feet.x, feet.y, { sil: scene.night, outline })
          }
        } else {
          const bob = Math.floor((t - T_REVEAL) * 1.6) % 2
          const flash = 1 - span(t, T_REVEAL + 0.05, T_REVEAL + 0.4)
          drawSprite(g, p.mon, feet.x, feet.y - bob, {
            flash: Math.max(0, flash),
            outline: Math.floor(t * 8) % 2 ? A[1] : A[2],
          })
        }
      }
      for (const [d, c] of [
        [0, A[0]],
        [0.14, A[1]],
        [0.28, A[2]],
      ] as const) {
        const q = span(t, T_REVEAL + d, T_REVEAL + d + 0.5)
        if (q > 0 && q < 1) {
          const rr = Math.round(8 + q * Math.max(w, h) * 0.6)
          g.drawImage(ring(rr, 2, c, 1 - q), feet.x - rr - 1, feet.y - 30 - rr - 1)
        }
      }
      s.fx.draw(g)
      g.restore()
      if (within(t, T_REVEAL, T_REVEAL + 0.3))
        screenFlash(g, '#ffffff', 0.85 * (1 - span(t, T_REVEAL, T_REVEAL + 0.3)))
    },
    cues: () =>
      [
        [0.02, () => quiet('legend.pulse')],
        [0.36, () => quiet('legend.pulse')],
        [1.45, () => quiet('legend.heart')],
        [1.75, () => quiet('legend.heart')],
        [T_REVEAL, (hud) => (quiet('legend.roar'), hud.beat?.('roar'))],
      ] satisfies Cue<State>[],
  }
}
