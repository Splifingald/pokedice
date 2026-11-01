// Mewtwo's raid entrance (docs/53): the lab. Black, then a glowing tank in the dark, Mewtwo floating in its liquid;
// the tubes flicker on and the camera tilts up the lab (pipes, consoles, a heart monitor bleeping, cables to the tank).
// The beeps quicken, its outline flares, the liquid turns violet, red beacons sweep, the glass cracks three times with
// the screen shaking harder each time, then bursts: shards and liquid everywhere, the lights blow. In the dark it rises,
// the falling shards held in the air by its mind; the reveal blasts them away. Then it hovers over the broken tank.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  bayer,
  bolt,
  canvas,
  ease,
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
import {
  AFTER_REVEAL,
  burstRing,
  dGradient,
  dissolve,
  drawShards,
  flickerOn,
  makeShard,
  pulse,
  stepShards,
  tri,
  type Cinema,
  type CinemaParams,
  type Shard,
  inOrder,
} from './kit'

const T_LIGHTS = 0.45
const T_WAKE = 2.75
const CRACKS = [3.05, 3.45, 3.8] as const
const T_BREAK = 4.1
const T_HOLD = 4.4
const REVEAL = 4.95
const DUR = REVEAL + AFTER_REVEAL
/** The heart monitor's beats: slow, then racing. */
const BEATS = [0.7, 1.45, 2.1, 2.6, 2.95, 3.2, 3.42, 3.6, 3.74, 3.86, 3.96, 4.04]
/** How far the camera starts below its rest, tilting up. */
const CAM = 28

const AURA = ['#ffffff', '#f0c8ff', '#c26bf0', '#5b2391'] as const
const GREEN = ['#a8ffe0', '#4fe0b8', '#22a891', '#0f6a63', '#083c3c'] as const
const VIOLET = ['#f4d8ff', '#d090ff', '#9a4ad8', '#5b2391', '#2a0c48'] as const
const METAL = { lit: '#9fb0b6', mid: '#5f7178', dark: '#323f45', ink: '#141b1e' }

type S = {
  r: Rng
  fx: Particles
  bub: Particles
  drip: Particles
  shards: Shard[]
  held: Shard[]
  bg: Canvas
  liquid: [Canvas, Canvas]
  rays: Canvas
  cracks: [number, number][][][]
  shakes: [number, number, number][]
  flood: number
}

/** The lab's still parts, drawn once: wall, pipes, consoles, floor, cables, the tank's metal. */
function lab(w: number, h: number, L: Layout): Canvas {
  const H2 = h + CAM
  const cv = canvas(w, H2)
  const g = cv.g
  const { cx, floor, tank } = L
  // The wall: panels in two tones, seams, a rail.
  g.drawImage(dGradient(w, floor, ['#0a171c', '#0e2128', '#123039']), 0, 0)
  for (let x = (cx % 26) - 26; x < w; x += 26) {
    rect(g, x, 0, 1, floor, '#06100f')
    rect(g, x + 1, 0, 1, floor, '#1a3a44')
  }
  for (const y of [Math.round(floor * 0.32), Math.round(floor * 0.74)]) {
    rect(g, 0, y, w, 3, '#1b2c33')
    rect(g, 0, y, w, 1, '#2f4a54')
    rect(g, 0, y + 3, w, 1, '#050c0e')
    for (let x = 6; x < w; x += 13) rect(g, x, y + 1, 1, 1, '#4d6870')
  }
  // Warning stripes low on the wall, under the consoles.
  for (let x = 0; x < w; x++)
    for (let y = floor - 6; y < floor; y++) rect(g, x, y, 1, 1, ((x + y) >> 2) % 2 ? '#2a2410' : '#141006')
  // The pipes: two down the wall into the tank's top, one along the top.
  const pipe = (x: number, y0: number, y1: number, wd: number) => {
    rect(g, x, y0, wd, y1 - y0, METAL.mid)
    rect(g, x, y0, 1, y1 - y0, METAL.lit)
    rect(g, x + wd - 1, y0, 1, y1 - y0, METAL.ink)
    for (let y = y0 + 8; y < y1; y += 22) {
      rect(g, x - 1, y, wd + 2, 3, METAL.dark)
      rect(g, x - 1, y, wd + 2, 1, METAL.lit)
    }
  }
  rect(g, 0, 10, w, 5, METAL.mid)
  rect(g, 0, 10, w, 1, METAL.lit)
  rect(g, 0, 14, w, 1, METAL.ink)
  pipe(cx - Math.round(tank.w * 0.3) - 2, 15, tank.top - L.cap, 5)
  pipe(cx + Math.round(tank.w * 0.3) - 2, 15, tank.top - L.cap, 5)
  sideTanks(g, w, L)
  // Consoles each side of the tank (cropped on a narrow phone).
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? Math.round(tank.x0 - L.cap - 6 - L.console) : Math.round(tank.x1 + L.cap + 6)
    const top = floor - L.consoleH
    rect(g, x0, top, L.console, L.consoleH, '#1a252b')
    rect(g, x0, top, L.console, 2, '#33434a')
    rect(g, x0, top + 2, 1, L.consoleH - 2, '#2a383e')
    rect(g, x0 + L.console - 1, top, 1, L.consoleH, '#0b1114')
    // A slanted desk with keys.
    rect(g, x0 - 2, top + Math.round(L.consoleH * 0.55), L.console + 4, 3, '#2c3a40')
    for (let k = 0; k < L.console - 4; k += 3)
      rect(g, x0 + 2 + k, top + Math.round(L.consoleH * 0.55) + 1, 2, 1, '#55707a')
    // Its screen's bezel (the screen itself is live).
    rect(g, x0 + 3, top + 4, L.console - 6, Math.round(L.consoleH * 0.4), '#05090b')
    // A tall cabinet behind, its vents.
    const cab = side < 0 ? x0 - 18 : x0 + L.console + 4
    rect(g, cab, floor - L.consoleH - 26, 14, L.consoleH + 26, '#141e23')
    rect(g, cab, floor - L.consoleH - 26, 14, 1, '#2a3a40')
    for (let y = floor - L.consoleH - 20; y < floor - 6; y += 4) rect(g, cab + 3, y, 8, 1, '#0a1013')
  }
  // The floor: metal plates in perspective, lit at the front edge of the wall.
  g.drawImage(dGradient(w, H2 - floor, ['#18262b', '#0e171a', '#070c0e']), 0, floor)
  rect(g, 0, floor, w, 1, '#3a5058')
  for (let k = 1; k < 9; k++) {
    const y = Math.round(floor + (H2 - floor) * (k / 9) ** 1.5)
    rect(g, 0, y, w, 1, '#0b1316')
  }
  for (let k = -8; k <= 8; k++) line(g, cx + k * 9, floor, cx + k * 40, H2, '#0b1316')
  // Cables from the tank's foot to the consoles.
  for (const side of [-1, 1]) {
    const pts: [number, number][] = []
    for (let i = 0; i <= 16; i++) {
      const q = i / 16
      const x = lerp(cx + side * tank.w * 0.3, cx + side * (tank.w / 2 + L.cap + 6 + L.console * 0.5), q)
      const y = floor + 3 + Math.sin(q * Math.PI) * 9 + q * 2
      pts.push([x, y])
    }
    polyline(g, pts, '#05080a', 3)
    polyline(
      g,
      pts.map(([x, y]) => [x, y - 1] as [number, number]),
      '#20303a',
    )
  }
  // The tank's metal: its base on the floor and its cap, rivets and the base's light ring (lit live).
  const capAt = (y: number) => {
    rect(g, tank.x0 - L.cap, y, tank.w + L.cap * 2, L.cap, METAL.mid)
    rect(g, tank.x0 - L.cap, y, tank.w + L.cap * 2, 1, METAL.lit)
    rect(g, tank.x0 - L.cap, y + L.cap - 1, tank.w + L.cap * 2, 1, METAL.ink)
    rect(g, tank.x0 - L.cap, y, 2, L.cap, METAL.dark)
    rect(g, tank.x1 + L.cap - 2, y, 2, L.cap, METAL.dark)
    for (let x = tank.x0 - L.cap + 4; x < tank.x1 + L.cap - 3; x += 7) rect(g, x, y + 2, 1, 1, METAL.lit)
  }
  capAt(tank.top - L.cap)
  capAt(tank.bottom)
  rect(
    g,
    tank.x0 - L.cap - 3,
    tank.bottom + L.cap,
    tank.w + L.cap * 2 + 6,
    floor - tank.bottom - L.cap,
    METAL.dark,
  )
  rect(g, tank.x0 - L.cap - 3, tank.bottom + L.cap, tank.w + L.cap * 2 + 6, 1, METAL.mid)
  // The glass's round rims: the back of the top one, the front of the bottom one.
  ellipseLine(g, cx, tank.top, tank.w >> 1, 3, '#2a5a5a', Math.PI, Math.PI * 2)
  ellipseLine(g, cx, tank.bottom, tank.w >> 1, 3, '#5fa8a8', 0, Math.PI)
  return cv
}

/** Older tanks along the wall on a wide screen: dim, their liquid murky, nothing alive in them. */
function sideTanks(g: G, w: number, L: Layout) {
  const tw = Math.round(L.tank.w * 0.55)
  const bottom = L.floor - 4 - L.cap
  const top = bottom - Math.round((L.tank.bottom - L.tank.top) * 0.8)
  for (const side of [-1, 1])
    for (let k = 0; k < 3; k++) {
      const x = Math.round(L.cx + side * (L.tank.w / 2 + L.console + 34 + tw / 2 + k * (tw + 30)) - tw / 2)
      if (x + tw < -4 || x > w + 4) continue
      g.drawImage(dGradient(tw, bottom - top, ['#12403a', '#0a2a28', '#061816']), x, top)
      rect(g, x + 2, top + 2, 1, bottom - top - 4, '#2a6a60')
      rect(g, x + tw - 3, top + 4, 1, bottom - top - 8, '#1a4a44')
      for (let i = 0; i < 5; i++)
        rect(
          g,
          x + 4 + ((i * 13 + k * 7) % (tw - 8)),
          top + 8 + ((i * 29) % (bottom - top - 12)),
          1,
          1,
          '#3a8a7a',
        )
      for (const y of [top - L.cap + 2, bottom]) {
        rect(g, x - 3, y, tw + 6, L.cap - 2, METAL.dark)
        rect(g, x - 3, y, tw + 6, 1, METAL.mid)
      }
      rect(g, x - 4, bottom + L.cap - 2, tw + 8, L.floor - bottom - L.cap + 2, '#11181b')
      rect(g, x + (tw >> 1) - 1, 15, 3, top - L.cap - 13, METAL.dark)
    }
}

/** A railing in the foreground, dark against the lab: the room has depth. */
function railing(g: G, w: number, h: number, L: Layout) {
  const y = Math.round(L.floor + (h - L.floor) * 0.62)
  rect(g, 0, y, w, 3, '#05090b')
  rect(g, 0, y, w, 1, '#2a3a40')
  rect(g, 0, y + 9, w, 2, '#05090b')
  for (let x = (L.cx % 34) - 34; x < w; x += 34) {
    rect(g, x, y, 3, h - y + 4, '#05090b')
    rect(g, x, y, 1, h - y + 4, '#1c2a30')
  }
}

interface Layout {
  cx: number
  floor: number
  cap: number
  console: number
  consoleH: number
  tank: { x0: number; x1: number; w: number; top: number; bottom: number }
  /** Mewtwo's feet: floating in the tank, then free. */
  inside: number
  free: number
}

function layout(w: number, h: number, mon: string): Layout {
  const s = spriteSize(mon)
  const cx = Math.round(w / 2)
  const floor = Math.round(h * 0.75)
  const cap = 7
  const tw = Math.max(44, Math.min(w - 26, s.w + 12))
  // Tall: the glass reaches well over its head, a column more than a box.
  const inner = Math.min(s.h + 44, floor - cap * 2 - 30)
  const bottom = floor - 4 - cap
  const top = bottom - inner
  return {
    cx,
    floor,
    cap,
    console: Math.max(22, Math.round(Math.min(40, w * 0.12))),
    consoleH: Math.round(Math.min(46, h * 0.16)),
    tank: { x0: cx - (tw >> 1), x1: cx - (tw >> 1) + tw, w: tw, top, bottom },
    inside: bottom - 12,
    free: bottom - 20,
  }
}

/**
 * The liquid, still: lit at the top, deep at the bottom, and darker towards both edges, so the glass reads round (a
 * column, not a box). Ordered steps, a lit meniscus.
 */
const liquid = (w: number, h: number, ramp: readonly string[]) =>
  shade(w, h, (x, y) => {
    if (y === 0) return ramp[0]!
    const e = Math.abs(x + 0.5 - w / 2) / (w / 2)
    const k = 1 + (y / h) * 2.2 + (e > 0.94 ? 1.6 : e > 0.78 ? 0.8 : e < 0.2 ? -0.3 : 0)
    return ramp[Math.max(1, Math.min(ramp.length - 1, Math.floor(k + bayer(x, y) - 0.5)))]!
  })

/** Three cracks spreading on the glass, from the point Mewtwo's mind first strikes. */
function crackSet(r: Rng, L: Layout): [number, number][][][] {
  const { tank } = L
  const origins: [number, number][] = [
    [tank.x0 + tank.w * 0.3, tank.top + (tank.bottom - tank.top) * 0.42],
    [tank.x0 + tank.w * 0.68, tank.top + (tank.bottom - tank.top) * 0.62],
    [tank.x0 + tank.w * 0.5, tank.top + (tank.bottom - tank.top) * 0.25],
  ]
  return origins.map(([ox, oy], k) =>
    Array.from({ length: 5 + k * 2 }, (_, i) => {
      const a = (i / (5 + k * 2)) * Math.PI * 2 + r() * 0.5
      const len = (tank.w * 0.32 + r() * tank.w * 0.3) * (1 + k * 0.35)
      return bolt(r, ox, oy, ox + Math.cos(a) * len, oy + Math.sin(a) * len * 1.2, 0.35, 3).map(
        ([x, y]) =>
          [
            Math.max(tank.x0 + 1, Math.min(tank.x1 - 2, x)),
            Math.max(tank.top + 1, Math.min(tank.bottom - 1, y)),
          ] as [number, number],
      )
    }),
  )
}

export const mewtwoCinema: Cinema = {
  reveal: REVEAL,
  dur: DUR,
  make(p: CinemaParams): Timeline<S> {
    const w = p.w ?? 240
    const h = p.h ?? 160
    const L = layout(w, h, p.mon)
    const { tank, cx } = L
    const quiet = (f: () => void) => () => void (!skippingNow() && f())
    const many = p.short ? 0.4 : 1
    return {
      id: 'cinema-mewtwo',
      dur: DUR,
      setup() {
        const r = rng(150)
        return {
          r,
          fx: new Particles(),
          bub: new Particles(),
          drip: new Particles(),
          shards: [],
          held: [],
          bg: lab(w, h, L),
          liquid: [
            liquid(tank.w, tank.bottom - tank.top, GREEN),
            liquid(tank.w, tank.bottom - tank.top, VIOLET),
          ],
          rays: canvas(w, h),
          cracks: crackSet(r, L),
          flood: 0,
          shakes: p.short
            ? []
            : [
                [CRACKS[0], 0.25, 1],
                [CRACKS[1], 0.3, 2],
                [CRACKS[2], 0.35, 3],
                [T_BREAK, 0.7, 5],
                [REVEAL, 0.7, 3],
              ],
        }
      },
      step(s, t, dt) {
        const r = s.r
        s.fx.update(dt)
        s.bub.update(dt)
        s.drip.update(dt)
        // Bubbles in the tank, boiling as it wakes.
        const boil = t < T_WAKE ? 0.25 : t < T_BREAK ? lerp(0.4, 1.4, span(t, T_WAKE, T_BREAK)) : 0
        if (r() < boil * many)
          s.bub.add({
            x: r.range(tank.x0 + 3, tank.x1 - 3),
            y: tank.bottom - 2,
            vy: -r.range(14, 30) * (1 + boil),
            vx: r.range(-3, 3),
            life: 3,
            size: r.int(1, 2),
            shape: 'bubble',
            colors: ['#d8fff4', '#a8ffe0'],
          })
        if (t >= T_BREAK && t - dt < T_BREAK) {
          // The glass bursts: shards out, the liquid with them.
          for (let i = 0; i < 70 * many + 20; i++) {
            const x = r.range(tank.x0, tank.x1)
            const y = r.range(tank.top, tank.bottom)
            const sh = makeShard(r, x, y, r.range(90, 190), r() < 0.5 ? '#bfeff0' : '#7fc8d0', '#ffffff')
            sh.vx += (x - cx) * 2.2
            s.shards.push(sh)
          }
          for (let i = 0; i < 90 * many; i++) {
            const a = -Math.PI / 2 + r.range(-1.5, 1.5)
            const v = r.range(50, 160)
            s.fx.add({
              x: r.range(tank.x0, tank.x1),
              y: r.range(tank.top + 10, tank.bottom),
              vx: Math.cos(a) * v * 1.4,
              vy: Math.sin(a) * v,
              ay: 320,
              life: r.range(0.6, 1.2),
              size: r.int(1, 2),
              shape: r() < 0.6 ? 'drop' : 'sq',
              colors: ['#e8d0ff', '#c890ff', '#9a4ad8'],
            })
          }
          // The tubes overhead blow: sparks rain down.
          for (let i = 0; i < 40 * many; i++)
            s.fx.add({
              x: r.range(0, w),
              y: r.range(0, 8),
              vx: r.range(-30, 30),
              vy: r.range(0, 40),
              ay: 200,
              life: r.range(0.5, 1),
              size: 1,
              shape: 'px',
              colors: ['#ffffff', '#fff3a0', '#ffbe2e'],
            })
        }
        // In the dark, its mind takes the falling shards and holds them.
        if (t >= T_HOLD && t - dt < T_HOLD) {
          const keep = s.shards.filter((x) => !x.down && x.y < L.floor - 4).slice(0, 26)
          s.held = keep
          s.shards = s.shards.filter((x) => !keep.includes(x))
          for (const k of s.held) k.life = 99
        }
        stepShards(s.shards, dt, { floor: L.floor + 2 })
        if (t < REVEAL) stepShards(s.held, dt, { g: 0, drag: 7 })
        else {
          if (t - dt < REVEAL)
            for (const k of s.held) {
              // Blasted away by the reveal.
              const a = Math.atan2(k.y - (L.free - 30), k.x - cx)
              k.vx = Math.cos(a) * 260
              k.vy = Math.sin(a) * 260
              k.life = k.age + 1.2
            }
          stepShards(s.held, dt, { g: 0 })
        }
        if (t > T_BREAK) s.flood = Math.min(1, s.flood + dt * 1.6)
        // Afterwards: drips from the broken rim, psychic motes, sparks from a severed cable.
        if (t > T_BREAK + 0.3 && r() < 0.25)
          s.drip.add({
            x: r.range(tank.x0 + 2, tank.x1 - 2),
            y: tank.bottom - 1,
            vy: 10,
            ay: 240,
            life: 0.5,
            size: 1,
            shape: 'drop',
            colors: ['#c890ff'],
          })
        if (t > REVEAL && r() < 0.6 * many)
          s.fx.add({
            x: cx + r.range(-tank.w * 0.6, tank.w * 0.6),
            y: L.free + r.range(-50, 4),
            vy: -r.range(6, 18),
            life: r.range(0.8, 1.6),
            size: r.int(1, 2),
            shape: r() < 0.5 ? 'star' : 'px',
            colors: [AURA[1], AURA[2], AURA[3]],
          })
        if (t > T_BREAK + 0.4 && r() < 0.05)
          for (let i = 0; i < 6; i++)
            s.fx.add({
              x: Math.round(tank.x0 - L.cap - 8),
              y: L.floor + 4,
              vx: r.range(-40, 10),
              vy: -r.range(20, 60),
              ay: 220,
              life: 0.4,
              size: 1,
              shape: 'px',
              colors: ['#ffffff', '#8af0ff', '#3ac8ff'],
            })
        if (t >= REVEAL && t - dt < REVEAL)
          for (let k = 0; k < 50 * many; k++) {
            const a = r() * Math.PI * 2
            const v = r.range(50, 170)
            s.fx.add({
              x: cx,
              y: L.free - 30,
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v,
              drag: 2.5,
              life: r.range(0.5, 1),
              size: r.int(1, 2),
              shape: r() < 0.5 ? 'star' : 'sq',
              colors: [...AURA],
            })
          }
      },
      draw(g, s, t) {
        const sh = screenShake(t, s.shakes)
        const cam = Math.round(CAM * (1 - ease.ioS(span(t, 0.6, 2.7))))
        g.fillStyle = '#020405'
        g.fillRect(0, 0, w, h)
        g.save()
        g.translate(sh.x, sh.y - cam)
        g.drawImage(s.bg, 0, 0)
        // How lit the lab is: tubes stutter on, stay on, die with the glass.
        const lit =
          t < T_BREAK
            ? Math.max(...[0, 1, 2, 3].map((i) => flickerOn(t, T_LIGHTS + i * 0.16, i * 4)))
            : t < T_BREAK + 0.12
              ? 1
              : 0
        drawScreens(g, t, L, w)
        // The dark: deep before the tubes, a little left with them on, near-black once they blow, its own light
        // lifting it a little once it is out.
        wash(
          g,
          '#010203',
          lit
            ? t > T_WAKE
              ? 0.32
              : 0.18
            : t < T_BREAK
              ? 0.82
              : lerp(0.8, 0.6, span(t, REVEAL, REVEAL + 0.6)),
          10,
        )
        if (lit) drawTubes(g, w, t)
        // Red beacons sweeping once it wakes.
        if (t > T_WAKE) drawBeacons(g, t, w, L)
        // The tank's own light on the wall and floor.
        const violet = span(t, T_WAKE, T_WAKE + 0.5)
        const gl = Math.round(tank.w * 0.85)
        if (t < T_BREAK)
          g.drawImage(
            glow(gl, violet > 0.5 ? '#6a2aa8' : '#1f8a78', 1.2, 0.55 + 0.25 * violet),
            cx - gl,
            Math.round((tank.top + tank.bottom) / 2) - gl,
          )
        if (t < T_BREAK) drawTank(g, s, t, L, p.mon, violet)
        else drawBroken(g, s, t, L)
        // Mewtwo free: rising in the dark, held shards round it, then the reveal.
        if (t >= T_BREAK) {
          const q = ease.outC(span(t, T_BREAK + 0.1, REVEAL - 0.1))
          const feet = Math.round(lerp(L.inside, L.free, q))
          if (t < REVEAL) {
            const ar = Math.round(Math.min(w, h) * 0.32)
            g.drawImage(glow(ar, AURA[3], 1.3, 0.5 + 0.2 * pulse(t, 4.45, 4.8)), cx - ar, feet - 30 - ar)
            drawShards(g, s.held, AURA[2])
            drawSprite(g, p.mon, cx, feet, {
              sil: '#0c0614',
              outline: Math.floor(t * 14) % 3 === 0 ? AURA[1] : AURA[2],
              wave: { amp: 1, len: 10, phase: t * 30 },
            })
          } else {
            const k = span(t, REVEAL, REVEAL + 0.5) * lerp(0.75, 0.32, span(t, REVEAL + 0.4, REVEAL + 1.4))
            drawRays(s.rays, { x: cx, y: feet - 30 }, t, AURA[3], k)
            g.drawImage(s.rays, 0, 0)
            const ar = Math.round(Math.min(w, h) * 0.3)
            g.drawImage(glow(ar, AURA[3], 1.4, 0.45), cx - ar, feet - 30 - ar)
            drawShards(g, s.held)
            const bob = Math.round(Math.sin((t - REVEAL) * 2.2) * 1.5)
            drawSprite(g, p.mon, cx, feet - 1 + bob, {
              flash: Math.max(0, 1 - span(t, REVEAL + 0.05, REVEAL + 0.45)),
              outline: Math.floor(t * 8) % 2 ? AURA[1] : AURA[2],
            })
          }
          for (const [d, c] of [
            [0, AURA[0]],
            [0.12, AURA[1]],
            [0.24, AURA[2]],
          ] as const)
            burstRing(g, cx, feet - 30, span(t, REVEAL + d, REVEAL + d + 0.6), Math.max(w, h) * 0.7, 3, c)
          // The mind's pulse while it holds them.
          burstRing(g, cx, feet - 30, span(t, 4.45, 4.9), Math.min(w, h) * 0.5, 2, AURA[2])
        }
        drawShards(g, s.shards)
        s.drip.draw(g)
        s.fx.draw(g)
        railing(g, w, h + CAM, L)
        g.restore()
        if (within(t, T_BREAK, T_BREAK + 0.2))
          screenFlash(g, '#e8fff8', 0.7 * (1 - span(t, T_BREAK, T_BREAK + 0.2)))
        if (within(t, REVEAL, REVEAL + 0.35))
          screenFlash(g, '#ffffff', 0.9 * (1 - span(t, REVEAL, REVEAL + 0.35)))
        // Black at the very start, the tank's glow coming up out of it.
        if (t < 0.4) wash(g, '#000000', 1 - span(t, 0, 0.4), 8)
      },
      cues: () =>
        inOrder([
          [0.1, quiet(() => tone(55, 1.8, { type: 'sine', vol: 0.05 }))],
          ...[0, 1, 2, 3].map(
            (i) => [T_LIGHTS + i * 0.16, quiet(() => hiss(0.05, { freq: 3000, vol: 0.05 }))] as const,
          ),
          [T_LIGHTS + 0.1, quiet(() => tone(120, 2.4, { type: 'sawtooth', vol: 0.012 }))],
          ...BEATS.map((b, i) => [b, quiet(() => tone(1175, 0.07, { vol: 0.03 + i * 0.002 }))] as const),
          [T_WAKE, quiet(() => fxSound('psychic.focus'))],
          [T_WAKE + 0.05, quiet(() => tone(440, 0.5, { type: 'square', vol: 0.025, slide: -110 }))],
          [T_WAKE + 0.55, quiet(() => tone(440, 0.5, { type: 'square', vol: 0.025, slide: -110 }))],
          ...CRACKS.map(
            (c, i) =>
              [
                c,
                quiet(() => {
                  hiss(0.12, { freq: 5200 - i * 600, vol: 0.06 + i * 0.02 })
                  tone(1900 - i * 300, 0.05, { type: 'square', vol: 0.03 })
                }),
              ] as const,
          ),
          [
            T_BREAK,
            quiet(() => {
              hiss(0.9, { freq: 4500, slide: -3800, vol: 0.12 })
              hiss(0.7, { freq: 300, type: 'lowpass', vol: 0.12 })
              tone(70, 0.6, { type: 'sawtooth', vol: 0.06, slide: -30 })
              for (let i = 0; i < 6; i++) tone(2200 + i * 330, 0.06, { vol: 0.02, at: 0.12 + i * 0.07 })
            }),
          ],
          [T_HOLD, quiet(() => fxSound('psychic.focus'))],
          [4.45, quiet(() => fxSound('legend.heart'))],
          [REVEAL, (hud) => (quiet(() => fxSound('legend.roar'))(), hud.beat?.('roar'))],
        ] satisfies Cue<S>[]),
    }
  },
}

/** The consoles' live screens: a heart monitor racing, then dead; status bars. */
function drawScreens(g: G, t: number, L: Layout, w: number) {
  const { tank, floor } = L
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? Math.round(tank.x0 - L.cap - 6 - L.console) : Math.round(tank.x1 + L.cap + 6)
    const top = floor - L.consoleH + 5
    const sw = L.console - 8
    const shh = Math.round(L.consoleH * 0.4) - 2
    if (x0 + sw < 0 || x0 > w) continue
    const dead = t > T_BREAK + 0.1
    rect(g, x0 + 4, top, sw, shh, dead ? '#020403' : t > T_WAKE ? '#1a0606' : '#03140a')
    if (dead) {
      // A dying screen, a line rolling over it now and then.
      if (Math.floor(t * 5 + side) % 7 === 0)
        rect(g, x0 + 4, top + ((Math.floor(t * 40) % shh) | 0), sw, 1, '#2a3a30')
      continue
    }
    const col = t > T_WAKE ? '#ff5a4a' : '#5cff8a'
    if (side < 0) {
      // The heart monitor: a trace scrolling left, a spike on every beat.
      const mid = top + Math.round(shh * 0.6)
      let py = mid
      for (let x = 0; x < sw; x++) {
        const at = t - (sw - x) * 0.02
        let y = mid
        for (const b of BEATS) {
          const e = at - b
          if (e >= 0 && e < 0.08) y = mid - Math.round(Math.sin((e / 0.08) * Math.PI * 2) * shh * 0.45)
        }
        line(g, x0 + 4 + x - 1, py, x0 + 4 + x, y, col)
        py = y
      }
    } else {
      // Readouts: bars climbing as it wakes.
      for (let k = 0; k < 4; k++) {
        const v = 0.3 + 0.2 * Math.sin(t * (1.3 + k) + k) + (t > T_WAKE ? span(t, T_WAKE, T_BREAK) * 0.6 : 0)
        rect(
          g,
          x0 + 5,
          top + 1 + k * 3,
          Math.max(1, Math.round((sw - 2) * Math.min(1, v))),
          2,
          k === 3 ? '#ffd23a' : col,
        )
      }
    }
    // Two lamps on the desk.
    rect(g, x0 + 3, floor - 8, 2, 1, Math.floor(t * 4 + side) % 2 ? '#3aff6a' : '#0a3a1a')
    rect(g, x0 + L.console - 6, floor - 8, 2, 1, t > T_WAKE && Math.floor(t * 6) % 2 ? '#ff3a3a' : '#3a0a0a')
  }
}

/** Ceiling tubes and their light falling down the wall. */
function drawTubes(g: G, w: number, t: number) {
  for (let x = 14; x < w; x += 44) {
    const on = Math.max(0, Math.min(1, flickerOn(t, T_LIGHTS + ((x / 44) | 0) * 0.16, (x / 44) | 0)))
    if (!on) continue
    rect(g, x, 3, 26, 3, '#ffffff')
    rect(g, x - 1, 2, 28, 1, '#8a9aa2')
    g.drawImage(glow(26, '#bfe8e8', 1.6, 0.35), x - 13, -10)
  }
}

/** The alarm's red beacons, either side, their light sweeping. */
function drawBeacons(g: G, t: number, w: number, L: Layout) {
  const y = Math.round(L.floor * 0.24)
  for (const x of [Math.round(w * 0.12), Math.round(w * 0.88)]) {
    // Each lamp turns its own way, so their beams never meet in the middle.
    const a = (x < w / 2 ? 1 : -1) * t * 5 + (x < w / 2 ? 0 : Math.PI)
    const k = 0.5 + 0.5 * Math.cos(a)
    rect(g, x - 3, y - 2, 6, 4, k > 0.5 ? '#ff4a3a' : '#8a1a14')
    rect(g, x - 4, y + 2, 8, 2, '#2a3238')
    if (k > 0.3) g.drawImage(glow(30, '#c4382a', 1.4, 0.45 * k), x - 30, y - 30)
    // The swept beam: a dithered wedge of red light turning round the lamp.
    const dir = Math.sin(a)
    // Short and sparse: a sweep of light on the wall, not an arrow across the screen.
    const len = Math.min(30, w * 0.18)
    const ex = x + dir * len
    const spread = 3 + Math.abs(Math.cos(a)) * 6
    if (Math.abs(dir) > 0.25)
      tri(g, x, y, ex, y - spread, ex, y + spread, pattern(g, '#ff4a3a', 1 + 2 * Math.abs(dir)))
  }
}

/** The tank whole: liquid (green, turning violet), bubbles, Mewtwo floating, the glass's shine and its cracks. */
function drawTank(g: G, s: S, t: number, L: Layout, mon: string, violet: number) {
  const { tank } = L
  const ih = tank.bottom - tank.top
  g.save()
  g.beginPath()
  g.rect(tank.x0, tank.top, tank.w, ih)
  g.clip()
  g.drawImage(s.liquid[0], tank.x0, tank.top)
  if (violet > 0) dissolve(g, s.liquid[1], violet, tank.x0, tank.top)
  // Light rolling down through the liquid.
  for (let k = 0; k < 3; k++) {
    const y = tank.top + ((t * 14 + k * 37) % (ih + 20)) - 10
    rect(g, tank.x0, Math.round(y), tank.w, 1, violet > 0.5 ? '#c890ff' : '#7af0c8')
  }
  s.bub.draw(g)
  const bob = Math.round(Math.sin(t * 1.6) * 2)
  const wake = t > T_WAKE
  drawSprite(g, mon, L.cx, L.inside + bob, {
    tint: {
      color: violet > 0.5 ? '#2a0c48' : '#083c3c',
      a: wake ? lerp(0.75, 0.45, span(t, T_WAKE, T_BREAK)) : 0.82,
    },
    outline: wake ? (Math.floor(t * 12) % 3 ? AURA[2] : AURA[1]) : undefined,
    wave: { amp: 1, len: 11, phase: t * 12 },
  })
  g.restore()
  // Glass: dark rims, two shines.
  rect(g, tank.x0, tank.top, 1, ih, '#0a2a2a')
  rect(g, tank.x1 - 1, tank.top, 1, ih, '#0a2a2a')
  rect(g, tank.x0 + 3, tank.top + 2, 2, ih - 4, '#e8fffa')
  rect(g, tank.x0 + 7, tank.top + 2, 1, ih - 4, '#bff0e8')
  rect(g, tank.x1 - 6, tank.top + 4, 1, ih - 8, '#bff0e8')
  // The base's ring of lights.
  for (let x = tank.x0 - L.cap + 3; x < tank.x1 + L.cap - 2; x += 4)
    rect(
      g,
      x,
      tank.bottom + 3,
      2,
      1,
      Math.floor(t * 8 + x / 4) % 4 ? (violet > 0.5 ? '#d090ff' : '#4dfff0') : '#1a3a3a',
    )
  // The cracks, each spreading as it lands.
  CRACKS.forEach((c, i) => {
    const q = span(t, c, c + 0.12)
    if (q <= 0) return
    for (const pts of s.cracks[i]!) {
      const n = Math.max(2, Math.round(pts.length * q))
      polyline(g, pts.slice(0, n), '#ffffff')
      polyline(
        g,
        pts.slice(0, n).map(([x, y]) => [x + 1, y + 1] as [number, number]),
        '#3a8a8a',
      )
    }
  })
}

/** After the burst: jagged glass left in the frames, the liquid flooding the floor. */
function drawBroken(g: G, s: S, t: number, L: Layout) {
  const { tank, floor, cx } = L
  // Teeth of glass in the base and hanging from the cap.
  // Teeth of uneven width and height, a few tall ones, from a fixed sequence (the same break every take).
  for (let x = tank.x0, i = 0; x < tank.x1; i++) {
    const tw = 4 + ((i * 7) % 5)
    const hb = [3, 9, 5, 14, 4, 7, 2, 11, 6][i % 9]!
    const tip = x + ((i * 3) % tw)
    tri(
      g,
      x,
      tank.bottom,
      Math.min(tank.x1, x + tw),
      tank.bottom,
      tip,
      tank.bottom - hb,
      i % 3 ? '#7fc8d0' : '#5fa8b0',
    )
    rect(g, tip, tank.bottom - hb + 1, 1, 1, '#ffffff')
    if (i % 2 === 0) {
      const ht = [2, 6, 3, 8, 2][i % 5]!
      tri(g, x, tank.top, Math.min(tank.x1, x + tw), tank.top, tip, tank.top + ht, '#4a8a92')
    }
    x += tw
  }
  // The liquid slumping out of the frame as the glass goes, then spreading.
  const q = span(t, T_BREAK, T_BREAK + 0.3)
  if (q < 1) {
    // Column by column, its top a wave falling: a body of water, not a box.
    const ih = tank.bottom - tank.top
    const lw = Math.round(tank.w * (1 + q * 0.7))
    const x0 = cx - (lw >> 1)
    for (let x = 0; x < lw; x++) {
      const e = Math.abs(x - lw / 2) / (lw / 2)
      const lh = Math.round(ih * (1 - q) ** 2 * (1 - e * e * 0.7) + Math.sin(x / 4 + t * 30) * 3 * (1 - q))
      if (lh <= 0) continue
      const sx = Math.min(tank.w - 1, Math.round((x / lw) * tank.w))
      g.drawImage(s.liquid[1], sx, ih - lh, 1, lh, x0 + x, tank.bottom - lh, 1, lh)
      rect(g, x0 + x, tank.bottom - lh, 1, 1, VIOLET[0])
    }
  }
  // A violet pool spreading out from the tank's foot, light rolling on it.
  const half = Math.round(lerp(tank.w * 0.5, tank.w * 1.6, ease.outC(s.flood)))
  for (let y = floor + 1; y < floor + 12; y++) {
    const k = 1 - (y - floor) / 12
    const hw = Math.round(half * Math.sqrt(k))
    rect(g, cx - hw, y, hw * 2, 1, y % 2 ? '#3a1a5a' : '#4a2470')
  }
  const off = Math.round((t * 20) % 12)
  for (let x = cx - half + off; x < cx + half; x += 12) rect(g, x, floor + 3, 4, 1, '#9a6ad8')
}
