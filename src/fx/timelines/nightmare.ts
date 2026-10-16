// Darkrai's nightmare (docs/30, docs/15 §29) on the pixel engine, built like the portal run's scenes (portal.ts) and the
// legend's entrance (legend.ts): a night of deep blues and purples under a huge pale full moon, black smoke creeping in
// from below and curling up the edges. The intro (the area sinks into night, the moon rises, Darkrai's silhouette
// passes across it), Darkrai's strike after a round (its shadow rises out of the smoke and fires a beam at each team
// member), the waking (its shadow in front of the moon, then shiny Darkrai revealed with a roar, the sky paling to dawn),
// the moon on a loop (the rules' banner, the way in's pop-up), and the shadow haunting a nightmare's foe in its fights.
// Words come from the screen; sizes too: the full-screen scenes draw on a stage of the screen's shape, the FX lab on the
// usual 240 × 160.
import { fxSound } from '@/audio/sfx'
import {
  bayer,
  bolt,
  cached,
  canvas,
  clamp,
  ease,
  glow,
  label,
  labelWidth,
  lerp,
  line,
  Particles,
  rect,
  ring,
  rng,
  shade,
  span,
  wash,
  type Canvas,
  type G,
  type Rng,
} from '../pixel'
import { background, type Point } from '../scenes'
import { drawSprite, spriteFrame } from '../sprites'
import {
  H,
  screenFlash,
  screenShake,
  W,
  within,
  type Cue,
  type MotionLevel,
  type Timeline,
} from '../timeline'
import { drawRays, gleam } from './legend'
import { burstRings, quiet, type PortalLoop, type SceneSize } from './portal'

/** The nightmare's palette: the night's blues and purples, the full moon's creams, Darkrai's black smoke, red and ice. */
export const NM = {
  night: '#03040c',
  deep: '#080b1f',
  dark: '#10163a',
  mid: '#1d2658',
  blue: '#2c3a80',
  dusk: '#3e3a8c',
  violet: '#5a3aa8',
  lilac: '#9c86e8',
  haze: '#c9c2f5',
  moon: '#f3efd6',
  moonLit: '#fffcea',
  moonShade: '#dcd5b2',
  moonDark: '#bdb490',
  crater: '#c9c09a',
  halo: '#8fa0d8',
  smoke: '#050409',
  smokeLit: '#181330',
  smokeEdge: '#2b2350',
  red: '#e0304a',
  blood: '#7a1426',
  cyan: '#5ad8ff',
  ice: '#c8f4ff',
  dawn: '#e9a2b8',
  dawnPale: '#ffd8c6',
} as const

/**
 * How the nightmare's lasting effects play (the moon's smoke drifting, a foe's haunting shadow, the raid's vignette and
 * its shadow over the page): unlike the Distortion World's glitches they follow the motion rules as every effect does (docs/15 §8), so a
 * calm OS stills them; the player's short setting lightens them; motion off stills them.
 */
export function nightmareLevel(level: MotionLevel, calm: boolean): MotionLevel {
  if (level === 'off' || calm) return 'off'
  return level
}

// ---------------------------------------------------------------- the night

/** The night sky: a vertical gradient from black-blue at the top to the horizon's dusk, ordered-dithered. Cached. */
export const nightSky = (w: number, h: number): Canvas =>
  cached(`nm-sky|${w}|${h}`, () => {
    const cols = [NM.night, NM.deep, NM.dark, NM.mid, NM.blue, NM.dusk]
    return shade(w, h, (x, y) => {
      const t = Math.pow(clamp(y / Math.max(1, h - 1)), 1.4) * (cols.length - 1)
      const i = Math.floor(t)
      return t - i > bayer(x, y) ? cols[Math.min(cols.length - 1, i + 1)]! : cols[i]!
    })
  })

export interface Star {
  x: number
  y: number
  ph: number
  big: boolean
}

export function makeStars(r: Rng, w: number, h: number): Star[] {
  return Array.from({ length: Math.max(8, Math.round((w * h) / 260)) }, () => ({
    x: r.int(0, w - 1),
    y: r.int(0, Math.round(h * 0.7)),
    ph: r.int(0, 5),
    big: r() < 0.12,
  }))
}

/** The stars, each twinkling in three steps on its own beat (still: all lit, the big ones crossed). */
export function drawStars(g: G, stars: readonly Star[], t: number, still = false) {
  for (const s of stars) {
    const f = still ? 0 : (Math.floor(t * 2.5) + s.ph) % 6
    if (f === 5) continue
    const c = f === 2 ? NM.haze : NM.lilac
    rect(g, s.x, s.y, 1, 1, f === 0 && s.big ? '#ffffff' : c)
    if (s.big && f < 2) {
      rect(g, s.x - 1, s.y, 3, 1, c)
      rect(g, s.x, s.y - 1, 1, 3, c)
    }
  }
}

/**
 * The full moon, radius R: a disc lit from the top left in four creams (dithered between them), seas and craters in
 * its shade, each crater's lip catching the light. Cached per size.
 */
export const moonSprite = (R: number): Canvas =>
  cached(`nm-moon|${R}`, () => {
    const r = rng(R * 31 + 7)
    const S = R * 2 + 1
    const craters = Array.from({ length: Math.max(3, Math.round(R / 3)) }, () => ({
      x: r.range(-0.6, 0.6) * R,
      y: r.range(-0.6, 0.6) * R,
      rr: r.range(0.06, 0.16) * R,
    }))
    const seas = Array.from({ length: 3 }, () => ({
      x: r.range(-0.45, 0.35) * R,
      y: r.range(-0.35, 0.45) * R,
      rr: r.range(0.22, 0.38) * R,
    }))
    const ramp = [NM.moonDark, NM.moonShade, NM.moon, NM.moonLit] as const
    return shade(S, S, (x, y) => {
      const dx = x - R
      const dy = y - R
      const d = Math.hypot(dx, dy) / (R + 0.5)
      if (d > 1) return null
      // Light from the top left: brighter there, a soft limb darkening at the edge.
      let v = 0.62 - (dx + dy) / (R * 3.2) - Math.pow(d, 6) * 0.45
      for (const s of seas) if (Math.hypot(dx - s.x, dy - s.y) < s.rr) v -= 0.18
      for (const c of craters) {
        const cd = Math.hypot(dx - c.x, dy - c.y)
        if (cd < c.rr) v -= 0.22
        else if (cd < c.rr + 1 && dx - c.x + dy - c.y > 0) v += 0.18
      }
      const k = clamp(v) * (ramp.length - 1)
      const i = Math.floor(k)
      return k - i > bayer(x, y) ? ramp[Math.min(ramp.length - 1, i + 1)]! : ramp[i]!
    })
  })

/** The moon at (cx, cy) with its dithered halo (`haloK` its strength, 0 none). */
export function drawMoon(g: G, cx: number, cy: number, R: number, haloK = 0.75) {
  if (haloK > 0) {
    // Two layers, so the halo thins out round rather than stopping at a hard edge: a wide faint one, a close one.
    const gr = Math.round(R * 1.5)
    g.drawImage(glow(gr, NM.halo, 2.4, haloK * 0.8), Math.round(cx - gr), Math.round(cy - gr))
    const gi = Math.round(R * 1.18)
    g.drawImage(glow(gi, NM.haze, 1.6, haloK * 0.6), Math.round(cx - gi), Math.round(cy - gi))
  }
  g.drawImage(moonSprite(R), Math.round(cx - R), Math.round(cy - R))
}

/** Where the moon stands on a stage of w × h, and how big it is: huge, upper middle. */
export const moonSpot = (w: number, h: number) => ({
  c: { x: Math.round(w / 2), y: Math.round(h * 0.36) },
  R: Math.max(12, Math.round(Math.min(w * 0.36, h * 0.24))),
})

// ---------------------------------------------------------------- the smoke

/**
 * Black smoke banked along the bottom, `k` of its full height (a fifth of the stage), rolling in two slow waves: solid
 * black, a dithered lilac-grey crest catching the moon. `still`: one frame.
 */
export function smokeBank(g: G, w: number, h: number, t: number, k: number, still = false) {
  if (k <= 0) return
  const tt = still ? 0 : t
  for (let x = 0; x < w; x++) {
    const wave = 0.6 + 0.25 * Math.sin(x / 17 + tt * 0.6) + 0.15 * Math.sin(x / 7 - tt * 1.3)
    const top = Math.round(h - h * 0.2 * k * wave)
    rect(g, x, top + 2, 1, h - top, NM.smoke)
    if (bayer(x, top) < 0.6) rect(g, x, top, 1, 1, NM.smokeEdge)
    rect(g, x, top + 1, 1, 1, bayer(x, top + 1) < 0.5 ? NM.smokeLit : NM.smoke)
  }
}

/**
 * Smoke tendrils curling up from the bottom and the sides: black, wavering, a lilac tip; `k` how far they reach. Drawn
 * in steps (the wave moves 8 times a second), never a smooth glide.
 */
export function smokeTendrils(g: G, w: number, h: number, t: number, k: number, n = 6) {
  if (k <= 0) return
  const tt = Math.floor(t * 8) / 8
  for (let i = 0; i < n; i++) {
    const left = i % 2 === 0
    const x0 = left ? lerp(-4, w * 0.3, (i / n) * 0.9) : lerp(w + 4, w * 0.7, (i / n) * 0.9)
    const len = h * (0.35 + (i % 3) * 0.12) * k
    const pts: [number, number][] = []
    const m = 14
    for (let j = 0; j <= m; j++) {
      const q = j / m
      const curl = Math.sin(tt * 2.2 + i * 1.9 + q * 5) * 10 * q
      pts.push([x0 + (left ? 1 : -1) * (q * q * w * 0.12) + curl, h + 2 - len * q])
    }
    for (let j = 1; j <= m; j++) {
      const wd = Math.max(1, Math.round(5 * (1 - j / m)) + 1)
      line(g, pts[j - 1]![0], pts[j - 1]![1], pts[j]![0], pts[j]![1], j > m - 2 ? NM.lilac : NM.smoke, wd)
    }
  }
}

/** Feed smoke puffs drifting up from the bottom (`rate`: chance a step). */
export function feedSmoke(P: Particles, r: Rng, w: number, h: number, rate = 0.25) {
  if (r() < rate)
    P.add({
      x: r.range(0, w),
      y: h + 4,
      vx: r.range(-4, 4),
      vy: -r.range(6, 14),
      life: r.range(2.4, 4),
      size: r.int(3, 6),
      shape: 'smoke',
      colors: [NM.smoke, NM.smoke, NM.smokeLit, NM.smokeEdge],
      light: NM.smokeLit,
    })
}

// ---------------------------------------------------------------- shared pieces

/** Letterbox bars. */
function bars(g: G, w: number, h: number, n: number) {
  if (n <= 0) return
  rect(g, 0, 0, w, n, NM.night)
  rect(g, 0, h - n, w, n, NM.night)
}

/** The area as the night finds it: its picture covering the stage, or the Daybreak field. */
function pictureOf(w: number, h: number, picture: string | null | undefined): Canvas {
  const c = canvas(w, h)
  const f = picture ? spriteFrame(picture) : undefined
  if (f) {
    const k = Math.max(w / f.width, h / f.height)
    const dw = Math.round(f.width * k)
    const dh = Math.round(f.height * k)
    c.g.drawImage(f, Math.round((w - dw) / 2), Math.round((h - dh) / 2), dw, dh)
  } else c.g.drawImage(background(w, h).cv, 0, 0)
  return c
}

/**
 * The name card: a slanted band sweeping in (the night's blues, a moon-cream rim on top and Darkrai's red under), the
 * title at 2× when it fits, a glint across it, small lines on the right.
 */
export function nightCard(
  g: G,
  w: number,
  y0: number,
  pin: number,
  title: string,
  subs: readonly string[],
  glint: number,
) {
  const subW = Math.max(0, ...subs.map((s) => labelWidth(g, s)))
  const s = labelWidth(g, title, 2) + 40 + subW <= w ? 2 : 1
  const showSubs = labelWidth(g, title, s) + 40 + subW <= w
  const h = s === 2 ? 30 : 22
  const x = Math.round(-w * (1 - ease.outExpo(pin)))
  for (let y = 0; y < h; y++) {
    const slant = Math.round((h - y) * 0.6)
    const col =
      y === 0 ? NM.moon : y === h - 1 ? NM.red : y < 3 ? NM.blue : bayer(y, y * 3) < y / h ? NM.dark : NM.deep
    rect(g, x + slant - 10, y0 + y, w + 20, 1, col)
  }
  const tx = x + 14
  const ty = y0 + 8
  const nameW = label(g, title, tx, ty, '#ffffff', NM.night, s)
  if (glint > 0 && glint < 1) {
    g.save()
    g.beginPath()
    const gx = tx + lerp(-20, nameW + 20, glint)
    g.moveTo(gx, ty - 2)
    g.lineTo(gx + 6, ty - 2)
    g.lineTo(gx - 2, ty + 16)
    g.lineTo(gx - 8, ty + 16)
    g.clip()
    label(g, title, tx, ty, NM.ice, null, s)
    g.restore()
  }
  if (showSubs)
    subs.slice(0, s === 2 ? 2 : 1).forEach((sub, i) => {
      label(g, sub, x + w - 12 - labelWidth(g, sub), y0 + 7 + i * 10, i ? '#ffffff' : NM.ice, NM.night)
    })
}

/** Darkrai as a shadow: its silhouette in smoke-black, an outline flickering ice-blue and violet (its eye in the dark). */
export function drawShadow(
  g: G,
  key: string,
  x: number,
  y: number,
  t: number,
  alpha = 1,
  flip = false,
  k = 1,
) {
  drawSprite(g, key, x, y, {
    sil: NM.smoke,
    outline: Math.floor(t * 10) % 4 === 0 ? NM.cyan : NM.violet,
    // Stepped, never a smooth fade (docs/15 §8).
    alpha: Math.round(alpha * 4) / 4,
    flip,
    sx: k,
    sy: k,
  })
}

/** Dark heartbeats: a blood-red glow throbbing behind `c`. */
function heartbeat(g: G, c: Point, R: number, t: number, beats: readonly number[]) {
  for (const hb of beats) {
    const q = span(t, hb, hb + 0.35)
    if (q > 0 && q < 1) {
      // Out from the rim in steps, thinning as it goes.
      const rr = Math.round(R * (1.04 + 0.3 * ease.outC(q)))
      g.drawImage(ring(rr, 4, NM.blood, 1 - q), c.x - rr - 1, c.y - rr - 1)
      g.drawImage(ring(rr - 3, 2, NM.red, (1 - q) * 0.6), c.x - rr + 2, c.y - rr + 2)
    }
  }
}

// ---------------------------------------------------------------- the intro

export interface IntroParams extends SceneSize {
  /** On the name card (the nightmare's name, in the player's language). */
  title: string
  /** Darkrai's front sprite key: only its silhouette shows. */
  mon: string
  /** The area's picture as a canvas sprite key (loadItemSprite), sinking into the night; null: the drawn field. */
  picture?: string | null
  short?: boolean
}

type IntroState = {
  r: Rng
  pic: Canvas
  /** The picture's pixels (null when a canvas can't give them back), and the frame it dissolves into. */
  picData: ImageData | null
  fade: Canvas
  stars: Star[]
  fx: Particles
  amb: Particles
  shakes: [number, number, number][]
}

/**
 * The way in, once the nightmare begins: the area darkens in two heartbeats and sinks into the night (dithered away), the
 * stars come out, the huge full moon rises, black smoke creeps up from below, then Darkrai's silhouette passes across
 * the moon from left to right, slowing in front of it (a breath, a heartbeat: `beat('line')`, the screen's words), its
 * smoke trailing; the name card. It then holds its end (`hold`: the moon, the stars, the smoke drifting) until the page
 * takes it away. `short`: the same in half the time.
 */
export function nightmareIntroTimeline(p: IntroParams): Timeline<IntroState> {
  const w = p.w ?? W
  const h = p.h ?? H
  const k = p.short ? 0.5 : 1
  const hv = h - (p.inset ?? 0)
  const { c, R } = moonSpot(w, hv)
  const T_NIGHT = 0.45 * k
  const T_MOON = 0.9 * k
  const T_SMOKE = 1.1 * k
  const T_PASS = 2.0 * k
  const T_PASS_END = 3.4 * k
  const T_LINE = (T_PASS + T_PASS_END) / 2
  const T_CARD = 3.5 * k
  return {
    id: 'nightmare-intro',
    hold: true,
    dur: p.short ? 2.3 : 4.4,
    setup() {
      const r = rng(491)
      const pic = pictureOf(w, h, p.picture)
      let picData: ImageData | null = null
      try {
        picData = pic.g.getImageData(0, 0, w, h)
      } catch {
        picData = null
      }
      return {
        r,
        pic,
        picData,
        fade: canvas(w, h),
        stars: makeStars(r, w, h),
        fx: new Particles(),
        amb: new Particles(),
        shakes: [[T_LINE, 0.5, 1]],
      }
    },
    step(s, t, dt) {
      s.fx.update(dt)
      s.amb.update(dt)
      if (t > T_SMOKE) feedSmoke(s.amb, s.r, w, h, 0.3)
      // Its smoke trails behind it as it passes.
      if (t > T_PASS && t < T_PASS_END && s.r() < 0.7) {
        const x = passX(t)
        const fh = spriteFrame(p.mon)?.height ?? 64
        s.fx.add({
          x: x - 10 + s.r.range(-6, 6),
          y: c.y + s.r.range(-fh * 0.3, fh * 0.3),
          vx: -s.r.range(10, 24),
          vy: s.r.range(-4, 4),
          life: s.r.range(0.6, 1.2),
          size: s.r.int(2, 4),
          shape: 'smoke',
          colors: [NM.smoke, NM.smokeLit, NM.smokeEdge],
          light: NM.smokeLit,
        })
      }
    },
    draw(g, s, t) {
      const sh = screenShake(t, s.shakes)
      g.fillStyle = NM.night
      g.fillRect(0, 0, w, h)
      g.save()
      g.translate(sh.x, sh.y)
      g.drawImage(nightSky(w, h), 0, 0)
      drawStars(g, s.stars, t)
      // The moon rising from below the horizon to its place.
      const rise = ease.outC(span(t, T_MOON, T_MOON + 1.0 * k))
      const my = Math.round(lerp(hv + R + 4, c.y, rise))
      if (rise > 0) drawMoon(g, c.x, my, R, 0.75 * rise)
      // The area, sinking into the night: two dark pulses over it, then dithered away from the top down.
      const gone = span(t, T_NIGHT, T_NIGHT + 0.9 * k)
      if (gone < 1) {
        // Each pixel goes when the night's front passes it, the front an ordered dither, so the edge is a fade of
        // pixels rather than a line.
        const fg = s.fade.g
        if (s.picData && gone > 0) {
          const out = fg.createImageData(w, h)
          const src = s.picData.data
          const dst = out.data
          for (let y = 0; y < h; y++)
            for (let x = 0; x < w; x++) {
              if (bayer(x, y) * 0.35 + y / h <= gone * 1.35) continue
              const i = (y * w + x) * 4
              dst[i] = src[i]!
              dst[i + 1] = src[i + 1]!
              dst[i + 2] = src[i + 2]!
              dst[i + 3] = 255
            }
          fg.putImageData(out, 0, 0)
        } else {
          fg.clearRect(0, 0, w, h)
          fg.drawImage(s.pic, 0, 0)
        }
        const dark = Math.max(
          0.6 * Math.sin(Math.PI * span(t, 0.02, 0.22 * k + 0.02)),
          0.6 * Math.sin(Math.PI * span(t, 0.22 * k, 0.42 * k)),
          0.7 * gone,
        )
        // Darkened on its own pixels only: the night around it stays as it is.
        if (dark > 0) {
          fg.save()
          fg.globalCompositeOperation = 'source-atop'
          wash(fg, NM.deep, dark, 8)
          fg.restore()
        }
        g.drawImage(s.fade, 0, 0)
      }
      // Darkrai's shadow passing across the moon, slower in front of it.
      if (t >= T_PASS && t < T_PASS_END) {
        const fh = spriteFrame(p.mon)?.height ?? 64
        const bob = Math.floor(t * 3) % 2
        drawShadow(g, p.mon, Math.round(passX(t)), Math.round(c.y + fh * 0.45) + bob, t, 1, true)
      }
      s.fx.draw(g)
      heartbeat(g, c, R, t, [T_LINE - 0.15, T_LINE + 0.15])
      smokeTendrils(g, w, h, t, ease.outC(span(t, T_SMOKE, T_SMOKE + 1.2 * k)))
      s.amb.draw(g)
      smokeBank(g, w, h, t, ease.outC(span(t, T_SMOKE, T_SMOKE + 1.0 * k)))
      g.restore()
      bars(g, w, h, Math.round(Math.min(16, h * 0.08) * ease.outC(span(t, T_CARD - 0.15, T_CARD + 0.1))))
      if (t >= T_CARD)
        nightCard(
          g,
          w,
          Math.round(hv * 0.68),
          span(t, T_CARD, T_CARD + 0.3),
          p.title,
          [],
          span(t, T_CARD + 0.45, T_CARD + 0.8),
        )
    },
    // Skipped (motion off, back to the page), it lands on its end without its sounds piling up.
    cues: () =>
      [
        [0.02, () => quiet('legend.heart')],
        [0.22 * k + 0.02, () => quiet('legend.heart')],
        [T_NIGHT, () => quiet('nightmare.fall')],
        [T_PASS, () => quiet('nightmare.breath')],
        [T_LINE, (hud) => hud.beat?.('line')],
        [T_CARD, (hud) => hud.beat?.('card')],
      ] satisfies Cue<IntroState>[],
  }

  /** Where the shadow is at t: in from the left, slowing in front of the moon, out to the right. */
  function passX(t: number) {
    const fw = spriteFrame(p.mon)?.width ?? 64
    const q = span(t, T_PASS, T_PASS_END)
    // Slow in the middle: an ease that lingers around one half.
    const e = q < 0.5 ? 0.5 * Math.pow(q * 2, 0.55) : 1 - 0.5 * Math.pow((1 - q) * 2, 0.55)
    return lerp(-fw, w + fw, e)
  }
}

// ---------------------------------------------------------------- the strike after a round

export interface StrikeParams extends SceneSize {
  /** Darkrai's front sprite key (a shadow here). */
  mon: string
  /** The team's back sprite keys, left to right. */
  team: readonly string[]
  short?: boolean
}

type StrikeState = {
  r: Rng
  stars: Star[]
  fx: Particles
  amb: Particles
  bolts: [number, number][][]
  shakes: [number, number, number][]
}

/** Where each team member stands on the strike's stage, and how big it's drawn (smaller past three). */
export function strikeSlots(n: number, w: number, h: number): { x: number; y: number; k: number }[] {
  const k = n > 3 ? 0.6 : 0.8
  return Array.from({ length: n }, (_, i) => ({ x: Math.round(((i + 0.5) / n) * w), y: h - 2, k }))
}

/** When the beams land, in seconds: the screen applies Darkrai's strike then (`hud.contact`). */
export const strikeHitAt = (short = false) => (short ? 0.4 : 1.0)

/**
 * Darkrai's strike after a round: the moon behind, the team standing at the bottom; Darkrai's shadow rises out of the
 * smoke over them, gathers the dark in its hands (its eye flickering), then fires a jagged beam at each one at once: a
 * hit-stop, each one's two white frames and a shake (`hud.contact`: the screen takes the HP then), dark bursts; the
 * shadow sinks back into the smoke. 2 s; `short`: straight to the beams, 1 s.
 */
export function nightmareStrikeTimeline(p: StrikeParams): Timeline<StrikeState> {
  const w = p.w ?? W
  const h = p.h ?? 120
  const short = !!p.short
  const T_RISE = short ? 0 : 0.05
  const T_CHARGE = short ? 0.1 : 0.45
  const T_HIT = strikeHitAt(short)
  const T_SINK = T_HIT + (short ? 0.3 : 0.5)
  const DUR = short ? 1.0 : 2.0
  const moon = { x: Math.round(w * 0.78), y: Math.round(h * 0.28), R: Math.round(Math.min(w, h) * 0.2) }
  const slots = strikeSlots(p.team.length, w, h)
  // Darkrai over the team, three quarters of its size so it fits over them on the 2:1 stage.
  const DK = 0.75
  const dk = { x: Math.round(w * 0.5), y: Math.round(h * 0.5) }
  const hand = () => ({ x: dk.x, y: dk.y - Math.round((spriteFrame(p.mon)?.height ?? 64) * 0.55 * DK) })
  return {
    id: 'nightmare-strike',
    dur: DUR,
    setup() {
      const r = rng(4912)
      return {
        r,
        stars: makeStars(r, w, h),
        fx: new Particles(),
        amb: new Particles(),
        bolts: [],
        // The hit-stop's shake waits for the stop to end.
        shakes: [[T_HIT + 0.07, 0.5, 2]],
      }
    },
    step(s, t, dt) {
      const hd = hand()
      // The beams are made the moment they land, before the hit-stop holds the world still.
      if (t >= T_HIT && t - dt < T_HIT) {
        s.bolts = slots.map((sl) =>
          bolt(s.r, hd.x, hd.y, sl.x, sl.y - 28 * sl.k, 0.25, 6).map(
            ([x, y]) => [Math.round(x), Math.round(y)] as [number, number],
          ),
        )
        for (const sl of slots)
          for (let i = 0; i < 14; i++) {
            const a = s.r() * Math.PI * 2
            const v = s.r.range(30, 80)
            s.fx.add({
              x: sl.x,
              y: sl.y - 26 * sl.k,
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v - 10,
              drag: 3,
              life: s.r.range(0.35, 0.6),
              size: s.r.int(1, 2),
              shape: s.r() < 0.5 ? 'sq' : 'star',
              colors: [NM.haze, NM.lilac, NM.violet, NM.smoke],
            })
          }
      }
      // A 4-frame hit-stop on contact: the world holds still.
      if (within(t, T_HIT, T_HIT + 4 / 60)) return
      s.fx.update(dt)
      s.amb.update(dt)
      feedSmoke(s.amb, s.r, w, h, 0.35)
      if (t > T_CHARGE && t < T_HIT && s.r() < 0.8) {
        const a = s.r() * Math.PI * 2
        const d = s.r.range(18, 34)
        s.fx.add({
          x: hd.x + Math.cos(a) * d,
          y: hd.y + Math.sin(a) * d,
          home: { x: hd.x, y: hd.y, k: 160 },
          drag: 1,
          life: 0.45,
          size: s.r.int(1, 2),
          shape: 'sq',
          colors: [NM.lilac, NM.violet, NM.smokeEdge, NM.smoke],
        })
      }
    },
    draw(g, s, t) {
      const sh = screenShake(t, s.shakes)
      g.fillStyle = NM.night
      g.fillRect(0, 0, w, h)
      g.save()
      g.translate(sh.x, sh.y)
      g.drawImage(nightSky(w, h), 0, 0)
      drawStars(g, s.stars, t)
      drawMoon(g, moon.x, moon.y, moon.R, 0.6)
      // Darkrai's shadow: rising out of the smoke, then sinking back into it.
      const fh = spriteFrame(p.mon)?.height ?? 64
      const up = ease.outC(span(t, T_RISE, T_CHARGE)) * (1 - ease.inC(span(t, T_SINK, DUR - 0.05)))
      if (up > 0.02) {
        const y = Math.round(dk.y + (1 - up) * fh * DK * 0.9)
        g.save()
        g.beginPath()
        g.rect(0, 0, w, h - 6)
        g.clip()
        drawShadow(g, p.mon, dk.x, y, t, up, false, DK)
        g.restore()
        if (t > T_CHARGE && t < T_HIT) {
          const gr = Math.round(6 + 10 * span(t, T_CHARGE, T_HIT))
          const hd = hand()
          g.drawImage(glow(gr, NM.violet, 1.4, 0.8), hd.x - gr, hd.y - gr)
        }
      }
      // The beams: a dark violet bolt with a lilac core, as long as they last.
      if (t >= T_HIT && t < T_HIT + 0.3)
        for (const pts of s.bolts) {
          for (let i = 1; i < pts.length; i++)
            line(g, pts[i - 1]![0], pts[i - 1]![1], pts[i]![0], pts[i]![1], NM.violet, 4)
          for (let i = 1; i < pts.length; i++)
            line(
              g,
              pts[i - 1]![0],
              pts[i - 1]![1],
              pts[i]![0],
              pts[i]![1],
              Math.floor(t * 30) % 2 ? NM.haze : NM.lilac,
              2,
            )
        }
      // The team at the bottom: two white frames when the beams land, then a shake.
      slots.forEach((sl, i) => {
        const key = p.team[i]
        if (!key) return
        const hit = t >= T_HIT && t < T_HIT + 2 / 60 + 4 / 60
        const jolt =
          t > T_HIT && t < T_HIT + 0.4
            ? (Math.floor(t * 30) % 2 ? 1 : -1) * Math.round(2 * (1 - span(t, T_HIT, T_HIT + 0.4)))
            : 0
        drawSprite(g, key, sl.x + jolt, sl.y, { sx: sl.k, sy: sl.k, flash: hit ? 1 : 0 })
      })
      s.fx.draw(g)
      s.amb.draw(g)
      smokeBank(g, w, h, t, 0.45)
      g.restore()
      if (within(t, T_HIT, T_HIT + 0.2)) screenFlash(g, NM.lilac, 0.35 * (1 - span(t, T_HIT, T_HIT + 0.2)))
    },
    cues: () =>
      [
        ...(short ? [] : ([[T_CHARGE, () => quiet('nightmare.charge')]] satisfies Cue<StrikeState>[])),
        [T_HIT, (hud) => (quiet('nightmare.beam'), hud.contact?.())],
        [T_HIT + 0.08, () => quiet('impact.hit')],
      ] satisfies Cue<StrikeState>[],
  }
}

// ---------------------------------------------------------------- the waking

export interface WakeParams extends SceneSize {
  /** Shiny Darkrai's front sprite key. */
  mon: string
  /** On the name card: its name, and small lines (SHINY, its raid level). */
  name: string
  subs?: readonly string[]
  short?: boolean
}

type WakeState = {
  r: Rng
  stars: Star[]
  fx: Particles
  amb: Particles
  rays: Canvas
  shakes: [number, number, number][]
}

/**
 * The last round won, the nightmare over: the full moon in two dark pulses, Darkrai's shadow drifting in front of it and
 * stopping there, its eye flickering, two heartbeats, the smoke curling in around it, cold rays turning behind, a gleam;
 * the reveal (a flash, rings, the roar: `beat('roar')`, the screen plays its cry, a quake, a burst of smoke and ice), shiny
 * Darkrai in its colours, the shiny sparkle; the smoke sinks and the sky pales to dawn, the player waking up; the name
 * card (`beat('card')`: the screen shows its words). `short`: no pulses, half the time.
 */
export function nightmareWakeTimeline(p: WakeParams): Timeline<WakeState> {
  const w = p.w ?? W
  const h = p.h ?? H
  const short = !!p.short
  const hv = h - (p.inset ?? 0)
  const { c, R } = moonSpot(w, hv)
  const T_DRIFT = short ? 0.1 : 0.8
  const T_STOP = short ? 0.8 : 2.4
  const T_RAYS = short ? 0.7 : 2.4
  const T_REVEAL = short ? 1.1 : 3.1
  const T_SHINY = T_REVEAL + 0.3
  const T_DAWN = T_REVEAL + (short ? 0.5 : 0.9)
  const T_CARD = T_REVEAL + (short ? 0.7 : 1.2)
  const DUR = T_CARD + (short ? 1.3 : 2.0)
  const feet = { x: c.x, y: Math.round(c.y + R * 0.95) }
  const AURA = [NM.ice, NM.cyan, NM.violet, NM.red] as const
  return {
    id: 'nightmare-wake',
    dur: DUR,
    setup() {
      const r = rng(4913)
      return {
        r,
        stars: makeStars(r, w, h),
        fx: new Particles(),
        amb: new Particles(),
        rays: canvas(w, h),
        shakes: [[T_REVEAL, 0.9, 3]],
      }
    },
    step(s, t, dt) {
      s.fx.update(dt)
      s.amb.update(dt)
      const r = s.r
      if (t < T_DAWN) feedSmoke(s.amb, r, w, h, 0.35)
      if (t >= T_REVEAL && t - dt < T_REVEAL)
        for (let k = 0; k < 48; k++) {
          const a = r() * Math.PI * 2
          const v = r.range(40, 150)
          s.fx.add({
            x: feet.x,
            y: feet.y - 32,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v,
            drag: 2.5,
            life: r.range(0.5, 0.9),
            size: r.int(1, 3),
            shape: r() < 0.4 ? 'smoke' : r() < 0.5 ? 'star' : 'sq',
            colors: r() < 0.5 ? [NM.smoke, NM.smokeLit, NM.smokeEdge] : [NM.ice, NM.cyan, NM.violet],
            light: NM.smokeLit,
          })
        }
      for (const [t0, rr] of [
        [T_SHINY, 22],
        [T_SHINY + 0.25, 34],
      ] as const)
        if (t >= t0 && t - dt < t0)
          for (let k = 0; k < 12; k++) {
            const a = (k / 12) * Math.PI * 2
            s.fx.add({
              x: feet.x + Math.cos(a) * rr * 0.4,
              y: feet.y - 34 + Math.sin(a) * rr * 0.4,
              vx: Math.cos(a) * rr * 2.2,
              vy: Math.sin(a) * rr * 2.2,
              drag: 3,
              life: 0.55,
              size: 2,
              shape: 'star',
              colors: ['#ffffff', '#fff6a8', '#ffe14d'],
            })
          }
    },
    draw(g, s, t) {
      const sh = screenShake(t, s.shakes)
      g.fillStyle = NM.night
      g.fillRect(0, 0, w, h)
      g.save()
      g.translate(sh.x, sh.y)
      g.drawImage(nightSky(w, h), 0, 0)
      // Dawn: the sky pales from the horizon once the player wakes.
      const dawn = span(t, T_DAWN, T_DAWN + 1.2)
      if (dawn > 0)
        for (let y = Math.round(h * 0.45); y < h; y++) {
          const q = ((y - h * 0.45) / (h * 0.55)) * dawn
          for (let x = 0; x < w; x++)
            if (bayer(x, y) < q * 0.8) rect(g, x, y, 1, 1, q > 0.6 ? NM.dawnPale : NM.dawn)
        }
      drawStars(g, s.stars, t)
      drawMoon(g, c.x, c.y, R, t > T_REVEAL ? lerp(0.75, 1, span(t, T_REVEAL, T_REVEAL + 0.5)) : 0.75)
      let dark = short
        ? 0
        : Math.max(0.6 * Math.sin(Math.PI * span(t, 0.1, 0.35)), 0.6 * Math.sin(Math.PI * span(t, 0.45, 0.7)))
      if (t >= T_STOP && t < T_REVEAL) dark = 0.35
      if (dark > 0) wash(g, NM.night, dark, 8)
      if (t > T_RAYS) {
        drawRays(
          s.rays,
          { x: feet.x, y: feet.y - 32 },
          t,
          t > T_REVEAL ? NM.halo : NM.cyan,
          span(t, T_RAYS, T_RAYS + 0.5) * (t > T_REVEAL + 0.4 ? 0.5 : 1),
        )
        g.drawImage(s.rays, 0, 0)
      }
      heartbeat(g, c, R, t, short ? [] : [1.6, 1.9])
      if (t >= T_DRIFT) {
        const fw = spriteFrame(p.mon)?.width ?? 64
        if (t < T_REVEAL) {
          // Its shadow drifting in from the left, stopping in front of the moon.
          const q = ease.outC(span(t, T_DRIFT, T_STOP))
          const x = Math.round(lerp(-fw, feet.x, q))
          const bob = Math.floor(t * 2.5) % 2
          drawShadow(g, p.mon, x, feet.y - bob, t)
          const gp = span(t, T_RAYS + 0.25, T_RAYS + 0.6)
          if (gp > 0 && gp < 1) gleam(g, p.mon, { x, y: feet.y - bob }, 0, gp)
        } else {
          const bob = Math.floor((t - T_REVEAL) * 1.6) % 2
          drawSprite(g, p.mon, feet.x, feet.y - bob, {
            flash: Math.max(0, 1 - span(t, T_REVEAL + 0.05, T_REVEAL + 0.4)),
            outline: Math.floor(t * 8) % 2 ? AURA[1] : AURA[2],
          })
        }
      }
      // The smoke curling in around it until the reveal blows it away.
      const curl = span(t, T_DRIFT + 0.6, T_STOP + 0.3) * (1 - span(t, T_REVEAL - 0.05, T_REVEAL + 0.25))
      smokeTendrils(g, w, h, t, curl * 1.2, 8)
      burstRings(g, { x: feet.x, y: feet.y - 32 }, t, T_REVEAL, Math.round(Math.max(w, h) * 0.6), [
        [0, NM.ice],
        [0.14, NM.cyan],
        [0.28, NM.violet],
      ])
      for (const d of [0.05, 0.2, 0.35]) {
        const q = span(t, T_REVEAL + d, T_REVEAL + d + 0.45)
        if (q > 0 && q < 1) {
          const rr = Math.round(10 + 40 * q)
          g.drawImage(ring(rr, 2, '#ffffff', 1 - q), feet.x - rr - 1, feet.y - 34 - rr - 1)
        }
      }
      s.fx.draw(g)
      s.amb.draw(g)
      smokeBank(g, w, h, t, 1 - 0.75 * span(t, T_DAWN, T_DAWN + 1))
      g.restore()
      if (within(t, T_REVEAL, T_REVEAL + 0.3))
        screenFlash(g, '#ffffff', 0.8 * (1 - span(t, T_REVEAL, T_REVEAL + 0.3)))
      bars(g, w, h, Math.round(Math.min(16, h * 0.08) * ease.outC(span(t, T_CARD - 0.15, T_CARD + 0.1))))
      if (t >= T_CARD)
        nightCard(
          g,
          w,
          Math.min(hv - 46, feet.y + 4),
          span(t, T_CARD, T_CARD + 0.28),
          p.name,
          p.subs ?? [],
          span(t, T_CARD + 0.4, T_CARD + 0.75),
        )
    },
    cues: () =>
      [
        ...(short
          ? []
          : ([
              [0.1, () => fxSound('legend.pulse')],
              [0.45, () => fxSound('legend.pulse')],
              [T_DRIFT + 0.2, () => fxSound('nightmare.breath')],
              [1.6, () => fxSound('legend.heart')],
              [1.9, () => fxSound('legend.heart')],
            ] satisfies Cue<WakeState>[])),
        [T_REVEAL, (hud) => (fxSound('legend.roar'), hud.beat?.('roar'))],
        [T_SHINY, () => fxSound('hatch.shiny', 0)],
        [T_SHINY + 0.12, () => fxSound('hatch.shiny', 1)],
        [T_DAWN, () => fxSound('nightmare.wake')],
        [T_CARD, (hud) => hud.beat?.('card')],
      ] satisfies Cue<WakeState>[],
  }
}

// ---------------------------------------------------------------- the moon, looping

/**
 * The full moon on a loop (the rules' banner, the way in's pop-up, the raid's page): the night, the stars twinkling, the
 * moon, the smoke banked below and drifting up. Nothing crosses it (the user, 2026-10-16: no shadow passing). `still`:
 * one frame, held.
 */
export function moonLoop(w: number, h: number, { still = false }: { still?: boolean } = {}): PortalLoop {
  const r = rng(w * 29 + h)
  const stars = makeStars(r, w, h)
  const R = Math.max(8, Math.round(Math.min(w * 0.22, h * 0.34)))
  const c = { x: Math.round(w * 0.62), y: Math.round(h * 0.42) }
  const amb = new Particles()
  if (!still)
    for (let i = 0; i < 120; i++) {
      feedSmoke(amb, r, w, h, 0.3)
      amb.update(1 / 30)
    }
  return {
    step(_t, dt) {
      if (still) return
      feedSmoke(amb, r, w, h, 0.25)
      amb.update(dt)
    },
    draw(g, t) {
      g.drawImage(nightSky(w, h), 0, 0)
      drawStars(g, stars, t, still)
      drawMoon(g, c.x, c.y, R, 0.7)
      amb.draw(g)
      smokeBank(g, w, h, t, 0.8, still)
    },
  }
}

// ---------------------------------------------------------------- a haunted foe

/**
 * The haunted foe's rim on its own sprite (CSS filters: zero-blur drop shadows, so it follows every frame of the
 * animated sprite and never covers it): the smoke's black an art pixel all round, then a faint violet edge above and to
 * the sides. `deep`: the black rises a pixel higher (its breath). `px`: CSS pixels per art pixel.
 */
export function hauntCss(px: number, deep = false): string {
  const p = Math.max(1, Math.round(px))
  // NM.smoke and NM.violet, see-through.
  const dark = 'rgb(5 4 9 / 0.85)'
  const edge = 'rgb(90 58 168 / 0.55)'
  return [
    `drop-shadow(${p}px 0 0 ${dark})`,
    `drop-shadow(${-p}px 0 0 ${dark})`,
    `drop-shadow(0 ${p}px 0 ${dark})`,
    `drop-shadow(0 ${-p}px 0 ${dark})`,
    ...(deep ? [`drop-shadow(0 ${-p}px 0 rgb(5 4 9 / 0.6))`] : []),
    `drop-shadow(${p}px 0 0 ${edge})`,
    `drop-shadow(${-p}px 0 0 ${edge})`,
    `drop-shadow(0 ${-p}px 0 ${edge})`,
  ].join(' ')
}

/**
 * The shadow haunting a nightmare's foe (the user, 2026-10-16: "a dark haunted shadow effect on opponent pokemon"),
 * drawn behind its sprite on a canvas of its own (`w` × `h` art pixels, the foe's feet at `at`, its frame `fw` × `fh`):
 * a dark pool dithered under its feet and black smoke drifting slowly up from its flanks, its puffs lit a dim violet. Behind
 * the sprite only, so the foe stays whole and readable. `still` (motion off, a calm OS): the pool and the wisps of one
 * moment, held; `short`: half the smoke.
 */
export function hauntLoop(
  w: number,
  h: number,
  at: Point,
  fw: number,
  fh: number,
  { still = false, short = false }: { still?: boolean; short?: boolean } = {},
): PortalLoop {
  const r = rng(Math.round(at.x * 31 + at.y + fw))
  const amb = new Particles()
  // Puffs per second.
  const rate = short ? 3 : 6
  // From its flanks, not its middle: a puff behind the body would never show.
  const emit = () => {
    const side = r() < 0.5 ? -1 : 1
    amb.add({
      x: at.x + side * r.range(fw * 0.3, fw * 0.6),
      y: at.y - r.range(0, fh * 0.8),
      vx: side * r.range(1, 4),
      vy: -r.range(6, 12),
      life: r.range(2, 3.2),
      size: r.int(3, 5),
      shape: 'smoke',
      colors: [NM.smoke, NM.smoke, NM.smokeLit, NM.smokeEdge],
      // Its top lit a dim violet: dark smoke, a faint edge.
      light: NM.smokeEdge,
    })
  }
  // Warmed up, so it opens mid-drift (and the still frame has its wisps).
  for (let i = 0; i < 150; i++) {
    if (r() < rate / 60) emit()
    amb.update(1 / 60)
  }
  const rx = Math.max(6, Math.round(fw * 0.45))
  const ry = Math.max(2, Math.round(rx * 0.2))
  return {
    step(_t, dt) {
      if (still) return
      if (r() < rate * dt) emit()
      amb.update(dt)
    },
    draw(g) {
      g.clearRect(0, 0, w, h)
      // The pool: densest at its middle, an ordered dither out to its rim.
      for (let y = -ry; y <= ry; y++)
        for (let x = -rx; x <= rx; x++) {
          const d = (x / rx) ** 2 + (y / ry) ** 2
          if (d < 1 && bayer(at.x + x, at.y + y) < (1 - d) * 0.9)
            rect(g, at.x + x, at.y + y - 1, 1, 1, d < 0.35 ? NM.smoke : NM.smokeLit)
        }
      amb.draw(g)
    },
  }
}
