// Kyogre's raid entrance (docs/53): the deep sea, then the primordial sea above it. The abyss: blue-black water, light
// slanting down from far above, marine snow drifting, the Seafloor Cavern's rocks below. A pulse from the deep pushes
// the snow away, and far below an α of light burns (the mark of Alpha), flaring at each heartbeat as it comes up; then
// a colossal shadow rises past you, its outline blazing, a torrent of bubbles with it. You follow it up and break the
// surface into a storm: black clouds, rain pouring down, lightning. The rain doesn't stop and the sea rises with it,
// the horizon climbing, the swells growing; in front a wall of water heaves up, the α glowing through it, and on the
// reveal Kyogre bursts out of the wave.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  bolt,
  canvas,
  ease,
  ellipse,
  glow,
  lerp,
  Particles,
  pattern,
  polyline,
  rect,
  rng,
  span,
  wash,
  type Canvas,
  type G,
  type Rng,
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

/** The deep's heartbeats: a pulse of pressure each, the α flaring. */
const BEATS = [0.75, 1.3, 1.75, 2.05] as const
const T_PASS = 1.9
const T_UP = 2.55
const T_BREACH = 3.0
const T_WALL = 3.9
const BOLTS = [3.4, 4.05] as const
const REVEAL = 4.8
const DUR = REVEAL + AFTER_REVEAL

const AURA = ['#ffffff', '#c8e0ff', '#3a7af0', '#10306a'] as const
const GLYPH = ['#ffffff', '#ff9a8a', '#ff4a3a', '#8a1a1a'] as const

type S = {
  r: Rng
  snow: Particles
  bub: Particles
  rain: Particles
  fx: Particles
  deep: Canvas
  sky: Canvas
  sea: Canvas
  rays: Canvas
  bolts: [number, number][][]
  shakes: [number, number, number][]
}

/** The mark of Alpha: an α (its round bowl, the stroke down its right side flicking out at the foot), as strokes. */
function alpha(r: number): [number, number][][] {
  const bowl: [number, number][] = []
  for (let i = 0; i <= 40; i++) {
    const a = lerp(-0.15, -1.85, i / 40) * Math.PI
    bowl.push([-0.15 * r + Math.cos(a) * 0.6 * r, Math.sin(a) * 0.62 * r])
  }
  const stroke: [number, number][] = [
    [0.62, -0.88],
    [0.48, -0.45],
    [0.42, 0],
    [0.46, 0.42],
    [0.6, 0.7],
    [0.82, 0.84],
    [0.98, 0.78],
  ].map(([x, y]) => [x! * r, y! * r])
  return [bowl, stroke]
}

function drawGlyph(g: G, x: number, y: number, r: number, k: number) {
  if (k <= 0 || r < 2) return
  const strokes = alpha(r).map((st) =>
    st.map(([a, b]) => [Math.round(x + a), Math.round(y + b)] as [number, number]),
  )
  const gr = Math.round(r * 1.6)
  shine(g, x, y, gr, GLYPH[3], 1.2, 0.6 * k)
  for (const pts of strokes) polyline(g, pts, k > 0.6 ? GLYPH[2] : GLYPH[3], r > 14 ? 3 : 2)
  for (const pts of strokes) polyline(g, pts, k > 0.8 ? GLYPH[0] : GLYPH[1])
}

export const kyogreCinema: Cinema = {
  reveal: REVEAL,
  dur: DUR,
  make(p: CinemaParams): Timeline<S> {
    const w = p.w ?? 240
    const h = p.h ?? 160
    const cx = Math.round(w / 2)
    const m = Math.min(w, h)
    const feet = Math.round(h * 0.62)
    const sz = spriteSize(p.mon)
    const mid = feet - Math.round(sz.h / 2)
    const many = p.short ? 0.4 : 1
    const quiet = (f: () => void) => () => void (!skippingNow() && f())
    /** Where the sea's surface is on the screen: above it while we are under, coming down as we rise, then rising. */
    const surface = (t: number) =>
      t < T_UP
        ? -20
        : t < T_BREACH
          ? Math.round(lerp(-20, h * 0.56, ease.ioS(span(t, T_UP, T_BREACH))))
          : Math.round(lerp(h * 0.56, h * 0.4, ease.ioQ(span(t, T_BREACH, REVEAL))))
    /** The wall of water heaving up in front, 0..1, and gone on the reveal. */
    const wall = (t: number) =>
      t < REVEAL ? ease.outQ(span(t, T_WALL, REVEAL)) : 1 - ease.outC(span(t, REVEAL, REVEAL + 0.5))
    return {
      id: 'cinema-kyogre',
      dur: DUR,
      setup() {
        const r = rng(382)
        // The deep: blue-black, the cavern's rocks black at the bottom.
        const deep = canvas(w, h)
        deep.g.drawImage(dGradient(w, h, ['#08244a', '#051634', '#030c22', '#01050f'], 4), 0, 0)
        for (let i = 0; i < 9; i++) {
          const x = r.range(-10, w + 10)
          const top = h - r.range(h * 0.06, h * 0.2)
          const half = r.range(10, 26)
          tri(
            deep.g,
            x - half,
            h + 2,
            x + half,
            h + 2,
            x + r.range(-6, 6),
            top,
            i % 2 ? '#020814' : '#010409',
          )
        }
        // The storm sky.
        const sky = canvas(w, h)
        sky.g.drawImage(dGradient(w, h, ['#020308', '#070c18', '#0e1a2e', '#1a2c44'], 4), 0, 0)
        for (let i = 0; i < 30; i++) {
          const x = r.range(-20, w + 20)
          const y = r.range(0, h * 0.45)
          const rx = r.range(16, 40)
          ellipse(sky.g, x, y, rx, r.range(4, 9), i % 3 ? '#0a1222' : '#121e34')
          rect(sky.g, x - rx * 0.5, y + 4, rx, 1, '#1e2e48')
        }
        // The sea seen from above, deep blue to near black.
        const sea = canvas(w, h)
        sea.g.drawImage(dGradient(w, h, ['#1a3a6a', '#0e2650', '#081a3a', '#040e24'], 4), 0, 0)
        return {
          r,
          snow: new Particles(),
          bub: new Particles(),
          rain: new Particles(),
          fx: new Particles(),
          deep,
          sky,
          sea,
          rays: canvas(w, h),
          bolts: BOLTS.map((_, i) => bolt(r, w * (i ? 0.78 : 0.2), 0, w * (i ? 0.7 : 0.3), h * 0.42, 0.3, 5)),
          shakes: p.short
            ? []
            : [
                [T_PASS, 0.6, 2],
                [T_BREACH, 0.3, 2],
                [T_WALL, 0.9, 2],
                [REVEAL, 0.7, 4],
              ],
        }
      },
      step(s, t, dt) {
        const r = s.r
        s.snow.update(dt)
        s.bub.update(dt)
        s.rain.update(dt)
        s.fx.update(dt)
        const sy = surface(t)
        // Marine snow, drifting down; each heartbeat pushes it away from the deep's centre.
        if (t < T_BREACH && r() < 0.6 * many)
          s.snow.add({
            x: r.range(0, w),
            y: r.range(-4, h),
            vx: r.range(-2, 2),
            vy: r.range(3, 9),
            life: 3,
            size: 1,
            shape: 'px',
            colors: ['#3a6aa8', '#2a4a78', '#1a3058'],
          })
        for (const b of BEATS)
          if (within(t, b, b + dt))
            for (const k of s.snow.list) {
              const dx = k.x - cx
              const dy = k.y - h * 1.1
              const d = Math.hypot(dx, dy) || 1
              k.vx += (dx / d) * 30
              k.vy += (dy / d) * 30
            }
        // The colossus passing: a torrent of bubbles off it.
        if (within(t, T_PASS - 0.2, T_UP + 0.3))
          for (let i = 0; i < 5 * many; i++)
            s.bub.add({
              x: cx + r.range(-w * 0.45, w * 0.45),
              y: h + 4,
              vx: r.range(-6, 6),
              vy: -r.range(120, 260),
              life: 1.6,
              size: r.int(1, 3),
              shape: 'bubble',
              colors: ['#c8e8ff', '#8ab8e8'],
            })
        // Breaking the surface: spray flung up at the line.
        if (within(t, T_BREACH - 0.1, T_BREACH - 0.1 + dt))
          for (let i = 0; i < 60 * many; i++)
            s.fx.add({
              x: r.range(0, w),
              y: sy,
              vx: r.range(-40, 40),
              vy: -r.range(40, 160),
              ay: 280,
              life: r.range(0.5, 1.1),
              size: r.int(1, 2),
              shape: r() < 0.5 ? 'drop' : 'sq',
              colors: ['#ffffff', '#c8e0ff', '#5a8ac8'],
            })
        // Above: the rain, harder and harder, splashing on the rising sea.
        if (t > T_UP) {
          const n = (t < T_BREACH ? 2 : 4 + span(t, T_BREACH, REVEAL) * 4) * many
          for (let i = 0; i < n; i++)
            s.rain.add({
              x: r.range(-20, w + 40),
              y: -6,
              vx: -50,
              vy: r.range(300, 380),
              life: 1.2,
              size: 1,
              shape: 'streak',
              trail: 0.035,
              colors: ['#8aa8d8', '#c8d8f0'],
            })
          for (const k of s.rain.list)
            if (k.y > sy + 2 && t > T_BREACH) {
              k.life = 0
              if (r() < 0.25)
                s.fx.add({
                  x: k.x,
                  y: k.y,
                  vy: -20,
                  ay: 160,
                  life: 0.15,
                  size: 1,
                  shape: 'px',
                  colors: ['#c8e0ff'],
                })
            }
        }
        // The wall's crest throwing spray.
        if (t > T_WALL && t < REVEAL && r() < 0.8 * many) {
          const k = wall(t)
          const x = cx + r.range(-w * 0.3, w * 0.3)
          s.fx.add({
            x,
            y: crest(x, sy, k, t),
            vx: r.range(-30, 30),
            vy: -r.range(20, 60),
            ay: 160,
            life: 0.6,
            size: 1,
            shape: 'drop',
            colors: ['#ffffff', '#c8e0ff'],
          })
        }
        if (within(t, REVEAL, REVEAL + dt)) {
          for (let i = 0; i < 160 * many; i++) {
            const a = -Math.PI / 2 + r.range(-1.3, 1.3)
            const v = r.range(80, 300)
            s.fx.add({
              x: cx + r.range(-sz.w * 0.6, sz.w * 0.6),
              y: feet - r.range(0, sz.h),
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v,
              ay: 300,
              life: r.range(0.8, 1.6),
              size: r.int(1, 2),
              shape: r() < 0.5 ? 'drop' : 'sq',
              colors: ['#ffffff', '#c8e0ff', '#5a8ac8', '#1a3a6a'],
            })
          }
          for (let k = 0; k < 40 * many; k++) {
            const a = r() * Math.PI * 2
            const v = r.range(60, 170)
            s.fx.add({
              x: cx,
              y: mid,
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v,
              drag: 2.5,
              life: r.range(0.5, 1),
              size: r.int(1, 2),
              shape: 'star',
              colors: [...AURA],
            })
          }
        }
      },
      draw(g, s, t) {
        const sh = screenShake(t, s.shakes)
        g.fillStyle = '#01050f'
        g.fillRect(0, 0, w, h)
        g.save()
        g.translate(sh.x, sh.y)
        const sy = surface(t)
        // ---------------- under the water (all of the screen, then what's below the surface line)
        if (t < T_BREACH + 0.35) {
          g.save()
          g.beginPath()
          g.rect(0, Math.max(0, sy), w, h)
          g.clip()
          // The deep, the cavern's rocks sinking away below as we rise.
          const lift = Math.round(lerp(0, h * 0.3, ease.inQ(span(t, 0.5, T_BREACH))))
          g.drawImage(s.deep, 0, 0, w, h - 1, 0, 0, w, h - 1)
          g.drawImage(
            s.deep,
            0,
            Math.round(h * 0.75),
            w,
            h * 0.25,
            0,
            Math.round(h * 0.75) + lift,
            w,
            h * 0.25,
          )
          // Light from far above in long shafts, swaying, fading as they go down.
          for (let i = 0; i < 4; i++) {
            const x = w * (0.12 + i * 0.26) + Math.sin(t * 0.7 + i) * 6
            const k = 0.5 + 0.5 * Math.sin(t * 1.3 + i * 2)
            tri(
              g,
              x - 4,
              Math.max(0, sy),
              x + 5,
              Math.max(0, sy),
              x - h * 0.12,
              h * 0.75,
              pattern(g, '#1a4a8a', 2 + k * 2),
            )
            tri(
              g,
              x - 2,
              Math.max(0, sy),
              x + 2,
              Math.max(0, sy),
              x - h * 0.06,
              h * 0.4,
              pattern(g, '#3a6aa8', 2 + k * 2),
            )
          }
          s.snow.draw(g)
          // The α, deep down, rising: flaring with each beat.
          const rise = span(t, 0.6, T_PASS)
          const gy = lerp(h * 1.05, h * 0.62, ease.inQ(rise))
          const gr = lerp(m * 0.08, m * 0.22, ease.inQ(rise))
          const beat = Math.max(0, ...BEATS.map((b) => 1 - span(t, b, b + 0.35) + (t < b ? -1 : 0)))
          if (t > 0.6 && t < T_PASS + 0.25) drawGlyph(g, cx, gy, gr, Math.min(1, 0.45 + beat))
          for (const b of BEATS)
            burstRing(g, cx, h * 1.05, span(t, b, b + 0.9), Math.max(w, h) * 0.9, 2, '#2a5aa8')
          // The colossus rising past, filling the screen, its outline blazing.
          if (within(t, T_PASS, T_UP + 0.4)) {
            const q = span(t, T_PASS, T_UP + 0.4)
            const sc = Math.min(3, (m * 1.1) / sz.w)
            const y = lerp(h + sz.h * sc, -sz.h * 0.2, ease.ioQ(q))
            drawSprite(g, p.mon, cx, y, {
              sil: '#020a1a',
              outline: Math.floor(t * 16) % 2 ? GLYPH[2] : '#3a7af0',
              sx: sc,
              sy: sc,
            })
            drawGlyph(g, cx, y - sz.h * sc * 0.5, m * 0.16, 1)
          }
          s.bub.draw(g)
          g.restore()
        }
        // ---------------- above the water
        if (sy > 0) {
          g.save()
          g.beginPath()
          g.rect(0, 0, w, sy)
          g.clip()
          g.drawImage(s.sky, 0, sy - Math.round(h * 0.56))
          for (const [i, at] of BOLTS.entries())
            if (within(t, at, at + 0.12)) {
              polyline(
                g,
                s.bolts[i]!.map(([x, y]) => [x + 1, y] as [number, number]),
                '#5a7ad8',
                3,
              )
              polyline(g, s.bolts[i]!, '#ffffff', 1)
            }
          g.restore()
        }
        // The sea from above (once we're out), swelling more and more.
        if (t >= T_BREACH - 0.05) {
          const k = span(t, T_BREACH - 0.05, T_BREACH + 0.35)
          const top = Math.max(0, sy)
          const seaCv = s.sea
          g.save()
          g.beginPath()
          g.rect(0, top, w, h - top)
          g.clip()
          dissolve(g, seaCv, k, 0, top - Math.round(h * 0.05))
          const swell = 1 + span(t, T_BREACH, REVEAL) * 4
          for (let row = 0; row < 12; row++) {
            const y = top + 2 + Math.round((row / 12) ** 1.4 * (h - top))
            const len = 5 + row * 2
            for (let x = ((row * 23 + Math.round(t * 30)) % (len * 2)) - len * 2; x < w; x += len * 2) {
              const yy = y + Math.round(Math.sin(x / 13 + t * 3 + row) * swell * (0.4 + row / 12))
              rect(g, x, yy, len, 1, row % 3 ? '#2a5a98' : '#5a8ac8')
              if (row > 5 && (x + row) % 5 === 0) rect(g, x + 2, yy - 1, len >> 1, 1, '#c8e0ff')
            }
          }
          g.restore()
        }
        // The surface line itself: lit and broken, rolling.
        if (sy > -4 && sy < h) {
          for (let x = 0; x < w; x += 2) {
            const yy = sy + Math.round(Math.sin(x / 7 + t * 6) * 2)
            rect(g, x, yy, 2, 1, (x >> 1) % 3 ? '#c8e0ff' : '#ffffff')
            if (t < T_BREACH) rect(g, x, yy + 1, 2, 1, '#5a8ac8')
          }
        }
        // The sea rising into a wall behind where it will be, the α glowing through its face, its crest curling and
        // foaming; on the reveal it bursts.
        const wk = wall(t)
        if (wk > 0) {
          for (let x = 0; x < w; x++) {
            const top = crest(x, sy, wk, t)
            if (top >= sy) continue
            const hh = sy - top
            // The face: deep at the foot, lighter and clearer towards the thin top where the light comes through.
            rect(g, x, top, 1, hh + 2, '#0a2048')
            rect(g, x, top + 2, 1, Math.round(hh * 0.45), '#14366a')
            rect(g, x, top + 2, 1, Math.round(hh * 0.18), '#2a5a98')
            if ((x * 7 + Math.floor(t * 24)) % 11 === 0)
              rect(g, x, top + 5, 1, Math.max(0, hh - 6), '#1e4a84')
          }
          if (t < REVEAL) {
            // Its shape in the wall, dark, coming forward; the α burning brighter.
            const q = span(t, T_WALL, REVEAL)
            const sc = lerp(0.6, 0.95, q)
            const y = Math.round(lerp(sy - 4, feet - 6, ease.inQ(q)))
            g.save()
            g.beginPath()
            g.rect(0, 0, w, sy + 2)
            g.clip()
            drawSprite(g, p.mon, cx, y, {
              sil: '#061632',
              outline: q > 0.6 ? '#3a7af0' : '#14366a',
              sx: sc,
              sy: sc,
            })
            g.restore()
            const gr = Math.round(m * 0.18 * q) + 4
            shine(g, cx, y - Math.round(sz.h * sc * 0.5), gr, GLYPH[3], 1.2, 0.5 * q)
            drawGlyph(g, cx, y - Math.round(sz.h * sc * 0.5), m * lerp(0.07, 0.12, q), 0.4 + 0.6 * q)
          }
          // The crest: a lip curling forward, foam riding it, spray torn off its top.
          for (let x = 0; x < w; x++) {
            const top = crest(x, sy, wk, t)
            if (top >= sy - 1) continue
            const lip = Math.round(2 + 3 * wk * (0.6 + 0.4 * Math.sin(x / 9 + t * 4)))
            rect(g, x, top - 1, 1, lip, (x + Math.floor(t * 30)) % 5 ? '#c8e0ff' : '#ffffff')
            if ((x + Math.floor(t * 12)) % 7 < 2) rect(g, x, top + lip - 1, 1, 2, '#8ab8e8')
          }
        }
        if (t >= REVEAL) {
          const k = span(t, REVEAL, REVEAL + 0.4) * lerp(0.6, 0.25, span(t, REVEAL + 0.4, REVEAL + 1.4))
          drawRays(s.rays, { x: cx, y: mid }, t, AURA[2], k)
          g.drawImage(s.rays, 0, 0)
          drawSprite(g, p.mon, cx, feet + Math.round(Math.sin((t - REVEAL) * 1.8) * 1.5), {
            flash: Math.max(0, 1 - span(t, REVEAL + 0.05, REVEAL + 0.45)),
            outline: Math.floor(t * 8) % 2 ? AURA[1] : AURA[2],
          })
          // The sea pouring off it, and foam round it on the water.
          for (let i = 0; i < 5; i++) {
            const x = cx + Math.round((i - 2) * sz.w * 0.22)
            const len = Math.round((sz.h * 0.4 + (i % 2) * 6) * (1 - span(t, REVEAL + 0.8, REVEAL + 2.5)))
            if (len > 0)
              for (let y = 0; y < len; y += 3)
                rect(g, x + ((y >> 2) % 2), feet - sz.h * 0.5 + y + ((t * 60) % 3), 1, 2, '#c8e0ff')
          }
          ellipse(g, cx, feet + 1, Math.round(sz.w * 0.6), 3, '#5a8ac8')
          for (let x = cx - Math.round(sz.w * 0.6); x < cx + sz.w * 0.6; x += 3)
            rect(g, x, feet + Math.round(Math.sin(x + t * 8) * 1.5), 2, 1, '#ffffff')
        }
        for (const [d, c] of [
          [0, AURA[0]],
          [0.1, AURA[1]],
          [0.22, AURA[2]],
        ] as const)
          burstRing(g, cx, mid, span(t, REVEAL + d, REVEAL + d + 0.6), Math.max(w, h) * 0.75, 3, c)
        s.fx.draw(g)
        if (t > T_UP) s.rain.draw(g)
        g.restore()
        // As the colossus passes it blots out the light.
        if (within(t, T_PASS, T_UP + 0.3))
          wash(g, '#000000', 0.45 * Math.sin(Math.PI * span(t, T_PASS, T_UP + 0.3)), 8)
        for (const at of BOLTS) if (within(t, at, at + 0.1)) screenFlash(g, '#c8d8ff', 0.35)
        if (within(t, T_BREACH - 0.05, T_BREACH + 0.1)) screenFlash(g, '#e0ecff', 0.3)
        if (within(t, REVEAL, REVEAL + 0.35))
          screenFlash(g, '#ffffff', 0.9 * (1 - span(t, REVEAL, REVEAL + 0.35)))
        if (t < 0.5) wash(g, '#000000', 1 - span(t, 0, 0.5), 8)
      },
      cues: () =>
        inOrder([
          [0.05, quiet(() => tone(41, 2.5, { type: 'sine', vol: 0.08 }))],
          [0.1, quiet(() => hiss(2.4, { freq: 160, type: 'lowpass', vol: 0.05 }))],
          ...BEATS.map(
            (b, i) =>
              [
                b,
                quiet(
                  () => (
                    fxSound('legend.heart'),
                    tone(55 + i * 4, 0.5, { type: 'sine', vol: 0.06, slide: -10 })
                  ),
                ),
              ] as const,
          ),
          [
            T_PASS,
            quiet(
              () => (
                hiss(1.2, { freq: 400, slide: 1600, vol: 0.08 }),
                tone(70, 1.1, { type: 'sawtooth', vol: 0.04, slide: 40 })
              ),
            ),
          ],
          [T_UP, quiet(() => hiss(0.5, { freq: 800, slide: 2500, vol: 0.06 }))],
          [
            T_BREACH,
            quiet(() => (fxSound('water.jet'), hiss(3, { freq: 2600, type: 'highpass', vol: 0.05 }))),
          ],
          [T_BREACH + 0.1, quiet(() => hiss(2.6, { freq: 300, type: 'lowpass', vol: 0.07 }))],
          ...BOLTS.map((b) => [b, quiet(() => fxSound('thunder.strike'))] as const),
          [
            T_WALL,
            quiet(
              () => (
                hiss(1, { freq: 200, slide: 600, type: 'lowpass', vol: 0.12 }),
                tone(49, 0.9, { type: 'sawtooth', vol: 0.05, slide: 30 })
              ),
            ),
          ],
          [REVEAL - 0.3, quiet(() => fxSound('legend.heart'))],
          [
            REVEAL,
            (hud) => (quiet(() => (fxSound('legend.roar'), fxSound('water.jet')))(), hud.beat?.('roar')),
          ],
        ] satisfies Cue<S>[]),
    }
    /** The wall's crest at x: a hump of water over the centre, as tall as `k` says. */
    function crest(x: number, sy: number, k: number, t0: number) {
      // Across the whole sea, highest behind it, rolling.
      const d = (x - cx) / (w * 0.45)
      const H = Math.min(h * 0.3, sz.h + h * 0.1)
      return Math.round(sy - H * k * (0.55 + 0.45 * Math.exp(-d * d)) - Math.sin(x / 11 + t0 * 3) * 3 * k)
    }
  },
}

/**
 * A dithered glow centred on (x, y), its radius and strength in steps: `glow` caches a canvas per radius and
 * strength, so a light that grows or fades reuses a handful of them instead of making one a frame.
 */
function shine(g: G, x: number, y: number, r: number, c: string, power: number, max: number) {
  const k = Math.round(Math.min(1, max) * 8) / 8
  if (k <= 0 || r < 1) return
  const rr = r > 12 ? Math.round(r / 4) * 4 : Math.round(r)
  g.drawImage(glow(rr, c, power, k), Math.round(x) - rr, Math.round(y) - rr)
}
