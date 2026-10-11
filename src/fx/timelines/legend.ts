// A legendary encounter: two dark pulses, a shatter wipe, darkness and heartbeats, a silhouette rising in its aura,
// light rays and a gleam, the reveal with a roar and a quake, the name card, then your Pokémon is sent out. Mewtwo,
// Articuno, Zapdos and Moltres have their own aura and element; any other legend takes its type's colour.
import { fxSound } from '@/audio/sfx'
import type { PokeType } from '@/engine/types'
import { typeColor } from '@/theme/util'
import {
  bayer,
  canvas,
  clamp,
  ease,
  ellipseLine,
  glow,
  label,
  labelWidth,
  lerp,
  mix,
  Particles,
  rect,
  rgba,
  ring,
  span,
  wash,
  type Canvas,
  type G,
  type Rng,
} from '../pixel'
import { ball, type Point } from '../scenes'
import { drawSprite, silhouette } from '../sprites'
import {
  H,
  quad,
  screenFlash,
  screenShake,
  Stage,
  STEP,
  W,
  within,
  type Cue,
  type Fighters,
  type Timeline,
} from '../timeline'

type Element = 'psy' | 'snow' | 'spark' | 'ember'
export interface LegendLook {
  aura: readonly [string, string, string, string]
  fx: Element
  night: string
}

const PRESETS: Record<number, LegendLook> = {
  150: { aura: ['#ffffff', '#f0c8ff', '#c26bf0', '#5b2391'], fx: 'psy', night: '#12081f' },
  144: { aura: ['#ffffff', '#c8f4ff', '#5fc0e0', '#235f8c'], fx: 'snow', night: '#071425' },
  145: { aura: ['#ffffff', '#fff3a0', '#ffd23a', '#8a6a10'], fx: 'spark', night: '#100e22' },
  146: { aura: ['#ffffff', '#ffe08a', '#ff8a1e', '#9a2a16'], fx: 'ember', night: '#1c0806' },
}

/** A legend's aura: its own for the four presets, else built from its type's colour. */
export function legendLook(dex: number, type: PokeType): LegendLook {
  const preset = PRESETS[dex]
  if (preset) return preset
  const c = typeColor(type)
  const fx: Element =
    type === 'ice' ? 'snow' : type === 'electric' ? 'spark' : type === 'fire' ? 'ember' : 'psy'
  return {
    aura: ['#ffffff', mix(c, '#ffffff', 0.55), c, mix(c, '#05030a', 0.55)],
    fx,
    night: mix(c, '#05030a', 0.88),
  }
}

export interface LegendParams extends Fighters {
  look: LegendLook
  /** On the name card, in the player's language. */
  name: string
  level: string
  types: string
}

function emitElement(P: Particles, L: LegendLook, r: Rng) {
  const A = L.aura
  if (L.fx === 'snow')
    P.add({
      x: r.range(0, W + 40),
      y: -4,
      vx: -r.range(8, 16),
      vy: r.range(16, 30),
      life: 7,
      size: r.int(1, 3),
      shape: 'flake',
      colors: [A[0], A[1]],
    })
  else if (L.fx === 'ember')
    P.add({
      x: r.range(0, W),
      y: H + 2,
      vx: r.range(-6, 6),
      vy: -r.range(18, 36),
      ax: Math.sin(r() * 6) * 4,
      life: r.range(2.5, 4),
      size: 1,
      shape: 'sq',
      colors: [A[0], A[1], A[2], A[3]],
    })
  else if (L.fx === 'spark')
    P.add({
      x: r.range(0, W),
      y: r.range(0, H),
      life: r.range(0.1, 0.25),
      size: r.int(1, 2),
      shape: 'plus',
      colors: [A[0], A[1], A[2]],
    })
  else
    P.add({
      x: r.range(0, W),
      y: r.range(H * 0.3, H),
      vy: -r.range(6, 14),
      life: r.range(1.2, 2.2),
      size: r() < 0.75 ? 1 : 2,
      shape: 'star',
      colors: [A[3], A[2], A[1], A[2], A[3]],
    })
}

/** Light wedges turning behind the legend, dithered. */
export function drawRays(cv: Canvas, c: Point, t: number, color: string, k: number) {
  const g = cv.g
  g.clearRect(0, 0, W, H)
  if (k <= 0) return
  const img = g.createImageData(W, H)
  const d = img.data
  const [r0, g0, b0] = rgba(color)
  const n = 9
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const dx = x - c.x
      const dy = y - c.y
      const a = Math.atan2(dy, dx) + t * 0.35
      const wedge = ((((a / (Math.PI * 2)) * n) % 1) + 1) % 1
      if (wedge > 0.42) continue
      const dd = Math.hypot(dx, dy)
      const v = k * clamp(1 - dd / 150) * (0.55 + 0.45 * Math.sin((wedge * Math.PI) / 0.42))
      if (v * 0.85 <= bayer(x, y)) continue
      const i = (y * W + x) * 4
      d[i] = r0
      d[i + 1] = g0
      d[i + 2] = b0
      d[i + 3] = 255
    }
  g.putImageData(img, 0, 0)
}

const gleamTmp = () => canvas(160, 160)
let gleamCanvas: Canvas | null = null

/** A white gleam band sweeping diagonally across a silhouette. */
export function gleam(g: G, key: string, at: Point, rise: number, p: number) {
  const sil = silhouette(key, '#ffffff')
  if (!sil) return
  const tmp = (gleamCanvas ??= gleamTmp())
  const w = sil.width
  const h = sil.height
  tmp.g.clearRect(0, 0, 160, 160)
  tmp.g.drawImage(sil, 0, 0)
  tmp.g.globalCompositeOperation = 'destination-in'
  tmp.g.fillStyle = '#fff'
  const x0 = lerp(-h, w + 4, p)
  tmp.g.beginPath()
  tmp.g.moveTo(x0, 0)
  tmp.g.lineTo(x0 + 4, 0)
  tmp.g.lineTo(x0 + 4 - h * 0.5, h)
  tmp.g.lineTo(x0 - h * 0.5, h)
  tmp.g.fill()
  tmp.g.globalCompositeOperation = 'source-over'
  g.drawImage(tmp, Math.round(at.x - w / 2), Math.round(at.y - h + rise))
}

/** Diamond shards closing in from the edges; their rims glow in the aura colour. */
export function shatter(g: G, p: number, A: readonly string[]) {
  const cell = 16
  for (let cy = 0; cy < H + cell; cy += cell)
    for (let cx = 0; cx < W + cell; cx += cell) {
      const ex = Math.abs(cx - W / 2) / (W / 2)
      const ey = Math.abs(cy - H / 2) / (H / 2)
      const edge = 1 - Math.min(1, Math.max(ex, ey))
      const q = clamp((p - edge * 0.62) / 0.38)
      if (q <= 0) continue
      const r = Math.round(ease.outQ(q) * cell)
      const col = q < 0.5 ? A[3]! : '#05030a'
      for (let dy = -r; dy <= r; dy++) {
        const hw = r - Math.abs(dy)
        rect(g, cx - hw, cy + dy, hw * 2 + 1, 1, col)
      }
    }
}

/** The name card: a slanted band sweeping in, the name at 2×, a glint across the letters, level and types. */
function banner(g: G, t: number, p: LegendParams, pin: number, pout: number) {
  const A = p.look.aura
  const x = Math.round(-W * (1 - ease.outExpo(pin)) + W * ease.inC(pout))
  const y0 = 96
  const h = 30
  for (let y = 0; y < h; y++) {
    const slant = Math.round((h - y) * 0.6)
    const col =
      y === 0 || y === h - 1
        ? A[1]
        : y < 3
          ? A[2]
          : bayer(y, y * 3) < y / h
            ? A[3]
            : mix(A[3], '#05030a', 0.35)
    rect(g, x + slant - 10, y0 + y, W + 20, 1, col)
  }
  const tx = x + 18
  const ty = y0 + 8
  const nameW = label(g, p.name, tx, ty, '#ffffff', '#05030a', 2)
  // Glint: a diagonal band redrawing the letters in the light colour.
  const gp = span(t, 3.95, 4.3)
  if (gp > 0 && gp < 1) {
    g.save()
    g.beginPath()
    const gx = tx + lerp(-20, nameW + 20, gp)
    g.moveTo(gx, ty - 2)
    g.lineTo(gx + 6, ty - 2)
    g.lineTo(gx - 2, ty + 16)
    g.lineTo(gx - 8, ty + 16)
    g.clip()
    label(g, p.name, tx, ty, A[1], null, 2)
    g.restore()
  }
  label(g, p.level, x + W - 18 - labelWidth(g, p.level), y0 + 7, A[1], '#05030a')
  label(g, p.types, x + W - 18 - labelWidth(g, p.types), y0 + 17, '#ffffff', '#05030a')
}

type S = Stage & { C: Point; mouth: Point; amb: Particles; rays: Canvas }

export function legendTimeline(p: LegendParams): Timeline<S> {
  const L = p.look
  const T_WIPE = 0.75
  const T_DARK = 1.35
  const T_SIL = 2.0
  const T_RAYS = 2.55
  const T_REVEAL = 3.2
  const T_BANNER = 3.55
  const T_OUT = 4.75
  const T_HUD = 5.25
  const T_SEND = 5.9
  const T_POP = 6.25
  return {
    id: 'legend',
    dur: 7.9,
    setup() {
      const st = new Stage({ ...p, by: 'own' }, 83)
      st.screenShakes.push([T_REVEAL, 0.8, 3])
      return Object.assign(st, {
        C: st.tgtAt(0.5, 0.5),
        mouth: st.tgtAt(0.25, 0.3),
        amb: new Particles(),
        rays: canvas(W, H),
      })
    },
    step(s, t, dt) {
      s.step(t, dt)
      s.amb.update(dt)
      const r = s.r
      if (t > T_DARK - 0.3) {
        const n = t > T_REVEAL ? 2 : 1
        for (let i = 0; i < n; i++) if (r() < (L.fx === 'snow' ? 0.5 : 0.22)) emitElement(s.amb, L, r)
      }
      if (t >= T_REVEAL && t < T_REVEAL + STEP * 1.5)
        for (let k = 0; k < 40; k++) {
          const a = r() * Math.PI * 2
          const sp = r.range(40, 140)
          s.fx.add({
            x: s.C.x,
            y: s.C.y,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp,
            drag: 2.5,
            life: r.range(0.5, 0.9),
            size: r.int(1, 2),
            shape: L.fx === 'snow' ? 'flake' : L.fx === 'psy' ? 'star' : 'sq',
            colors: L.aura.slice(0, 3),
          })
        }
      if (t >= T_POP && t < T_POP + STEP * 1.5)
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
      const A = L.aura
      // Darkness: two pulses, full black after the shatter, then a slow, partial return.
      let dark = Math.max(
        0.75 * Math.sin(Math.PI * span(t, 0.1, 0.35)),
        0.75 * Math.sin(Math.PI * span(t, 0.42, 0.67)),
      )
      if (t >= T_DARK && t < T_SIL) dark = 1
      if (t >= T_SIL) dark = lerp(1, 0.68, span(t, T_SIL, T_SIL + 0.6))
      if (t >= T_REVEAL) dark = lerp(0.68, 0.4, span(t, T_REVEAL, T_REVEAL + 0.5))
      if (t >= T_OUT) dark = lerp(0.4, 0.22, span(t, T_OUT, T_OUT + 0.6))
      const sh = screenShake(t, s.screenShakes)
      if (sh.x || sh.y) g.drawImage(s.bg.cv, 0, 0)
      g.save()
      g.translate(sh.x, sh.y)
      g.drawImage(s.bg.cv, 0, 0)
      s.bg.dyn(g, t)
      if (dark > 0) wash(g, L.night, dark, 16)
      // Everything that carries light sits above the darkness: rays, the legendary, the aura, the particles.
      if (t > T_RAYS) {
        drawRays(
          s.rays,
          s.C,
          t,
          A[t > T_REVEAL ? 3 : 2],
          span(t, T_RAYS, T_RAYS + 0.5) * (t > T_OUT ? 0.4 : t > T_REVEAL + 0.4 ? 0.6 : 1),
        )
        g.drawImage(s.rays, 0, 0)
      }
      if (t >= T_SIL) {
        if (t < T_REVEAL) {
          const rise = Math.round(6 * (1 - ease.outC(span(t, T_SIL, T_SIL + 0.8))))
          drawSprite(g, s.foe, s.L.foe.x, s.L.foe.y + rise, {
            sil: '#06040c',
            outline: Math.floor(t * 12) % 3 === 0 ? A[1] : A[2],
          })
          const gp = span(t, T_RAYS + 0.2, T_RAYS + 0.55)
          if (gp > 0 && gp < 1) gleam(g, s.foe, s.L.foe, rise, gp)
        } else
          drawSprite(g, s.foe, s.L.foe.x, s.L.foe.y, {
            flash: 1 - span(t, T_REVEAL + 0.05, T_REVEAL + 0.4),
            outline: Math.floor(t * 8) % 2 ? A[2] : A[3],
          })
      }
      if (t >= T_SEND && t < T_POP) {
        const q = span(t, T_SEND, T_POP)
        const b = quad(
          { x: -8, y: H + 8 },
          { x: s.L.own.x - 10, y: H * 0.35 },
          { x: s.L.own.x, y: s.L.own.y - 50 },
          ease.outQ(q),
        )
        const im = ball('poke', -q * 12)
        g.drawImage(im, Math.round(b.x - im.width / 2), Math.round(b.y - im.height / 2))
      }
      if (t >= T_POP) {
        const k = ease.outBack(span(t, T_POP, T_POP + 0.22), 2.2)
        s.drawAttacker(g, { sx: k, sy: k, flash: 1 - span(t, T_POP + 0.1, T_POP + 0.45) })
      }
      for (const d of [0, 0.14]) {
        const q = span(t, T_REVEAL + d, T_REVEAL + d + 0.6)
        if (q > 0 && q < 1) {
          const R = Math.min(130, Math.round(8 + 120 * ease.outC(q)))
          g.drawImage(ring(R, 3, A[1], 1 - q), Math.round(s.C.x - R - 1), Math.round(s.C.y - R - 1))
        }
      }
      for (const d of [0.05, 0.2, 0.35]) {
        const q = span(t, T_REVEAL + d, T_REVEAL + d + 0.45)
        if (q > 0 && q < 1)
          ellipseLine(
            g,
            s.mouth.x,
            s.mouth.y,
            Math.round(6 + 26 * q),
            Math.round(5 + 20 * q),
            A[0],
            Math.PI * 0.72,
            Math.PI * 1.28,
          )
      }
      s.fx.draw(g)
      s.amb.draw(g)
      g.restore()
      if (within(t, T_WIPE, T_DARK)) shatter(g, span(t, T_WIPE, T_DARK), A)
      if (t >= T_DARK && t < T_SIL)
        for (const hb of [1.55, 1.85]) {
          // Heartbeats: a glow where it waits.
          const q = span(t, hb, hb + 0.3)
          if (q > 0 && q < 1)
            g.drawImage(
              glow(30, A[3], 1.3, 0.7 * Math.sin(Math.PI * q)),
              Math.round(s.C.x - 30),
              Math.round(s.C.y - 30),
            )
        }
      if (within(t, T_REVEAL, T_REVEAL + 0.3))
        screenFlash(g, '#ffffff', 0.8 * (1 - span(t, T_REVEAL, T_REVEAL + 0.3)))
      const bars = Math.round(
        16 * (ease.outC(span(t, T_BANNER - 0.15, T_BANNER + 0.1)) - ease.inC(span(t, T_OUT, T_OUT + 0.4))),
      )
      if (bars > 0) {
        rect(g, 0, 0, W, bars, '#05030a')
        rect(g, 0, H - bars, W, bars, '#05030a')
      }
      if (within(t, T_BANNER, T_OUT + 0.3))
        banner(g, t, p, span(t, T_BANNER, T_BANNER + 0.28), span(t, T_OUT - 0.05, T_OUT + 0.25))
    },
    cues: () =>
      [
        [0.1, () => fxSound('legend.pulse')],
        [0.42, () => fxSound('legend.pulse')],
        [T_WIPE, () => fxSound('legend.shatter')],
        [1.55, () => fxSound('legend.heart')],
        [1.85, () => fxSound('legend.heart')],
        [T_REVEAL, () => fxSound('legend.roar')],
        [T_HUD, (hud) => (hud.show?.('foe', true), hud.beat?.('appeared'))],
        [T_SEND, (hud) => hud.beat?.('sendOut')],
        [T_POP, (hud) => (hud.show?.('own', true), fxSound('ball.pop'))],
      ] satisfies Cue<S>[],
  }
}
