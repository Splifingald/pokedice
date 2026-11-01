// Tracks in the Snow (docs/61 §4.1, docs/15 §46) on the pixel engine, built like the nightmare's scenes
// (nightmare.ts): a winter night in a glade of snowy bushes under a pale full moon. The way in (the moon rises, a
// reindeer's silhouette leaps across it into the bushes), the snow falling on the glade when the taps run out (an
// overlay over the bushes, the prints gone under it), the outro (the bushes settle, fresh snow covers the prints) and
// the glade on a loop (the rules' banner). Words come from the screen; sizes too (full-screen scenes draw on a stage of
// the screen's shape, the FX lab on the usual 240 × 160).
import {
  bayer,
  cached,
  canvas,
  clamp,
  ease,
  ellipse,
  label,
  labelWidth,
  lerp,
  Particles,
  rect,
  rng,
  shade,
  span,
  wash,
  type Canvas,
  type G,
  type Rng,
} from '../pixel'
import { drawSprite, spriteFrame } from '../sprites'
import { H, W, type Timeline } from '../timeline'
import { drawMoon, drawStars, makeStars, moonSpot, type Star } from './nightmare'
import { quiet, type PortalLoop, type SceneSize } from './portal'

/** The glade's palette: the winter night's blues, the moon's creams, the snow's whites and the bushes' pine greens. */
export const TS = {
  night: '#050a1a',
  deep: '#0b1530',
  dark: '#14224a',
  mid: '#1f3366',
  blue: '#2e4a8a',
  dusk: '#3d5c9e',
  snow: '#f4f8ff',
  snowLit: '#ffffff',
  snowShade: '#c4d2ee',
  snowDeep: '#8ea2d2',
  snowDark: '#5c6fa6',
  pine: '#1d4a3c',
  pineDark: '#0f2c26',
  pineLit: '#2f6c52',
  moon: '#f3efd6',
  ice: '#c8f4ff',
  gold: '#ffd23a',
  coat: '#7a4a28',
} as const

/** The winter sky: black-blue at the top to the horizon's dusk, ordered-dithered. Cached. */
const winterSky = (w: number, h: number): Canvas =>
  cached(`ts-sky|${w}|${h}`, () => {
    const cols = [TS.night, TS.deep, TS.dark, TS.mid, TS.blue, TS.dusk]
    return shade(w, h, (x, y) => {
      const t = Math.pow(clamp(y / Math.max(1, h - 1)), 1.3) * (cols.length - 1)
      const i = Math.floor(t)
      return t - i > bayer(x, y) ? cols[Math.min(cols.length - 1, i + 1)]! : cols[i]!
    })
  })

/** The snowy ground from `y0` down: moonlit at the top, blue in the hollows, dithered. Cached. */
const snowGround = (w: number, h: number, y0: number): Canvas =>
  cached(`ts-ground|${w}|${h}|${y0}`, () => {
    const cols = [TS.snow, TS.snowShade, TS.snowDeep, TS.snowDark]
    return shade(w, h - y0, (x, y) => {
      const wave = Math.sin(x / 23) * 2 + Math.sin(x / 9 + 1) * 1
      const t = clamp((y + wave) / Math.max(1, h - y0)) * (cols.length - 1)
      const i = Math.floor(t)
      return t - i > bayer(x, y) ? cols[Math.min(cols.length - 1, i + 1)]! : cols[i]!
    })
  })

/**
 * A snowy bush, `r` art pixels round, standing on (x, y): a mound of pine greens in three lumps with a cap of snow on
 * each, lit from the moon. `shake`: its rustle (−1..1, pixels sideways at the top). Cached per size and shake.
 */
export function bushSprite(r: number, shake = 0): Canvas {
  const s = Math.round(shake)
  return cached(`ts-bush|${r}|${s}`, () => {
    const w = r * 3 + 4
    const h = r * 2 + 3
    const c = canvas(w, h)
    const g = c.g
    const cx = Math.round(w / 2)
    const lumps: [number, number, number][] = [
      [cx - r, h - r, r],
      [cx + r, h - r, r],
      [cx, h - Math.round(r * 1.35), Math.round(r * 1.1)],
    ]
    for (const [x, y, rr] of lumps) ellipse(g, x + (y < h - r ? s : 0), y, rr, rr, TS.pineDark)
    for (const [x, y, rr] of lumps) ellipse(g, x + (y < h - r ? s : 0) - 1, y - 1, rr - 1, rr - 1, TS.pine)
    for (const [x, y, rr] of lumps) {
      const sx = x + (y < h - r ? s : 0)
      // Its snow cap: the top third of each lump, a lit rim and a shade under it.
      ellipse(
        g,
        sx,
        y - Math.round(rr * 0.55),
        Math.round(rr * 0.85),
        Math.max(1, Math.round(rr * 0.45)),
        TS.snowShade,
      )
      ellipse(
        g,
        sx - 1,
        y - Math.round(rr * 0.65),
        Math.round(rr * 0.7),
        Math.max(1, Math.round(rr * 0.35)),
        TS.snow,
      )
      rect(g, sx - Math.round(rr * 0.3), y - rr, Math.max(1, Math.round(rr * 0.4)), 1, TS.snowLit)
    }
    // A few needles poking through the snow.
    for (let i = 0; i < r; i++) rect(g, cx - r + ((i * 7) % (r * 2)), h - 2 - ((i * 5) % r), 1, 1, TS.pineLit)
    return c
  })
}

/**
 * A bush searched, `r` round, the same box as `bushSprite`: its two side lumps pushed apart, their snow shaken off,
 * and the trampled hollow between them (where the prints and what it held show). Cached per size.
 */
export function openBushSprite(r: number): Canvas {
  return cached(`ts-bush-open|${r}`, () => {
    const w = r * 3 + 4
    const h = r * 2 + 3
    const c = canvas(w, h)
    const g = c.g
    const cx = Math.round(w / 2)
    // The hollow: trampled snow, bluer, dithered.
    ellipse(g, cx, h - Math.round(r * 0.5), Math.round(r * 1.1), Math.round(r * 0.45), TS.snowDeep)
    ellipse(g, cx, h - Math.round(r * 0.55), Math.round(r * 0.9), Math.round(r * 0.3), TS.snowShade)
    for (const side of [-1, 1]) {
      const x = cx + side * Math.round(r * 1.25)
      const y = h - r + 1
      ellipse(g, x, y, r - 1, r - 1, TS.pineDark)
      ellipse(g, x - side, y - 1, r - 2, r - 2, TS.pine)
      // A little snow left on top.
      rect(g, x - Math.round(r * 0.3), y - r + 2, Math.max(1, Math.round(r * 0.5)), 1, TS.snowShade)
    }
    return c
  })
}

/** A row of bushes across the stage at `y` (their feet), `n` of them `r` round, the `wobble` one rustling. */
function bushRow(g: G, w: number, y: number, r: number, n: number, seed: number, rustle = -1, t = 0) {
  const step = w / n
  for (let i = 0; i < n; i++) {
    const x = Math.round(step * (i + 0.5) + Math.sin(i * 2.3 + seed) * step * 0.18)
    const shake = i === rustle ? Math.sin(t * 40) * 2 : 0
    const im = bushSprite(r, shake)
    g.drawImage(im, Math.round(x - im.width / 2), y - im.height)
  }
}

/** Snowflakes on a stage: `rate` new ones a step, falling and drifting in steps. */
function feedSnow(P: Particles, r: Rng, w: number, rate: number, heavy = false) {
  const n = Math.floor(rate) + (r() < rate % 1 ? 1 : 0)
  for (let i = 0; i < n; i++)
    P.add({
      x: r.range(-10, w + 10),
      y: -3,
      vx: r.range(-6, 4),
      vy: r.range(heavy ? 26 : 12, heavy ? 44 : 24),
      life: heavy ? 3 : 6,
      size: r() < (heavy ? 0.35 : 0.15) ? 2 : 1,
      shape: 'flake',
      colors: [TS.snowLit, TS.snow, TS.snowShade],
    })
}

/** The moon's card: a band sweeping in, the night's blue with the moon's cream on top and ice under, the title. */
function gladeCard(g: G, w: number, y0: number, pin: number, title: string) {
  const s = labelWidth(g, title, 2) + 40 <= w ? 2 : 1
  const h = s === 2 ? 30 : 22
  const x = Math.round(-w * (1 - ease.outExpo(pin)))
  for (let y = 0; y < h; y++) {
    const slant = Math.round((h - y) * 0.6)
    const col =
      y === 0 ? TS.moon : y === h - 1 ? TS.ice : y < 3 ? TS.blue : bayer(y, y * 3) < y / h ? TS.dark : TS.deep
    rect(g, x + slant - 10, y0 + y, w + 20, 1, col)
  }
  label(g, title, x + 14, y0 + 8, '#ffffff', TS.night, s)
}

function bars(g: G, w: number, h: number, n: number) {
  if (n <= 0) return
  rect(g, 0, 0, w, n, TS.night)
  rect(g, 0, h - n, w, n, TS.night)
}

// ---------------------------------------------------------------- the way in

export interface TracksIntroParams extends SceneSize {
  /** On the card (the feature's name, in the player's language). */
  title: string
  /** Stantler's front sprite key: only its silhouette shows, leaping. */
  mon: string
  short?: boolean
}

type IntroState = { r: Rng; stars: Star[]; snow: Particles; fx: Particles }

/** Where the glade's ground starts on a stage `h` high (the words' rows kept clear under it). */
const groundAt = (hv: number) => Math.round(hv * 0.72)

/**
 * The way in: the night comes out of the dark, the stars, the pale full moon rising behind the glade's bushes, snow
 * drifting down; then a reindeer's silhouette (Stantler's, an outline of moonlight) leaps from the left across the
 * moon and down into the bushes on the right, which shake and throw up snow (`beat('line')`: the screen's words); the
 * card. It then holds its end (the moon, the snow falling, the stars) until the page takes it away. `short`: half.
 */
export function tracksIntroTimeline(p: TracksIntroParams): Timeline<IntroState> {
  const w = p.w ?? W
  const h = p.h ?? H
  const k = p.short ? 0.5 : 1
  const hv = h - (p.inset ?? 0)
  const { c, R } = moonSpot(w, Math.round(hv * 0.8))
  const gy = groundAt(hv)
  const T_MOON = 0.3 * k
  const T_LEAP = 1.6 * k
  const T_LAND = 2.6 * k
  const T_CARD = 3.0 * k
  const landX = Math.round(w * 0.74)
  // The leap's arc: from off the left edge, over the moon, down into the bush at landX.
  const arc = (t: number) => {
    const q = span(t, T_LEAP, T_LAND)
    const x = lerp(-30, landX, q)
    const top = c.y + Math.round(R * 0.2)
    const y = lerp(gy, top, Math.sin(Math.PI * Math.min(1, q * 1.05)))
    return { x, y: q >= 1 ? gy + 4 : y, q }
  }
  return {
    id: 'tracks-intro',
    hold: true,
    dur: p.short ? 1.9 : 3.7,
    setup() {
      const r = rng(234)
      return { r, stars: makeStars(r, w, Math.round(hv * 0.7)), snow: new Particles(), fx: new Particles() }
    },
    step(s, t, dt) {
      s.snow.update(dt)
      s.fx.update(dt)
      feedSnow(s.snow, s.r, w, p.short ? 0.25 : 0.5)
      // The bush it lands in throws up its snow.
      if (t >= T_LAND && t < T_LAND + 1 / 60)
        for (let i = 0; i < (p.short ? 14 : 30); i++)
          s.fx.add({
            x: landX + s.r.range(-10, 10),
            y: gy - 6,
            vx: s.r.range(-40, 40),
            vy: -s.r.range(30, 80),
            ay: 140,
            life: s.r.range(0.5, 1),
            size: s.r.int(1, 2),
            shape: 'flake',
            colors: [TS.snowLit, TS.snow, TS.snowShade],
          })
    },
    draw(g, s, t) {
      g.drawImage(winterSky(w, h), 0, 0)
      drawStars(g, s.stars, t)
      const rise = ease.outC(span(t, T_MOON, T_MOON + 1.1 * k))
      if (rise > 0) drawMoon(g, c.x, Math.round(lerp(gy + R + 4, c.y, rise)), R, 0.6 * rise)
      // The far bushes, then the ground, then the near row.
      bushRow(g, w, gy + 2, Math.max(4, Math.round(w / 40)), Math.max(5, Math.round(w / 28)), 1)
      g.drawImage(snowGround(w, h, gy), 0, gy)
      // The reindeer's silhouette, mid-leap, lit by the moon at its edge.
      const a = arc(t)
      if (a.q > 0 && a.q < 1)
        drawSprite(g, p.mon, Math.round(a.x), Math.round(a.y), {
          sil: TS.night,
          outline: TS.moon,
          flip: true,
        })
      const near = Math.max(6, Math.round(w / 22))
      const n = Math.max(4, Math.round(w / 48))
      const rustle = t >= T_LAND && t < T_LAND + 0.6 ? Math.round((landX / w) * n - 0.5) : -1
      bushRow(g, w, Math.round(gy + (hv - gy) * 0.6), near, n, 7, rustle, t)
      s.fx.draw(g)
      s.snow.draw(g)
      if (t < 0.4) wash(g, '#000000', 1 - span(t, 0, 0.4), 8)
      bars(g, w, h, Math.round(Math.min(16, h * 0.08) * ease.outC(span(t, T_CARD - 0.15, T_CARD + 0.1))))
      if (t >= T_CARD) gladeCard(g, w, Math.round(hv * 0.1), span(t, T_CARD, T_CARD + 0.3), p.title)
    },
    cues: () => [
      [0.02, () => quiet('tracks.wind')],
      [T_LEAP, () => quiet('tracks.leap')],
      [T_LAND, (hud) => (quiet('tracks.rustle'), hud.beat?.('line'))],
      [T_CARD, (hud) => hud.beat?.('card')],
    ],
  }
}

// ---------------------------------------------------------------- the snow falling on the glade

export interface SnowfallParams extends SceneSize {
  short?: boolean
}

type SnowState = { r: Rng; snow: Particles }

/** When the snowfall has covered the glade (the screen swaps in the fresh one under it). */
export const snowfallCoverAt = (short = false) => (short ? 0.45 : 0.9)

/**
 * The snow falling on the glade, an overlay over the bushes (transparent elsewhere): flakes thicken into a flurry,
 * a dithered white veil covers the glade at its height (`beat('covered')`: the prints are gone, the bushes refilled
 * under it), then thins out as the last flakes settle. `short`: half.
 */
export function tracksSnowfallTimeline(p: SnowfallParams = {}): Timeline<SnowState> {
  const w = p.w ?? W
  const cover = snowfallCoverAt(p.short)
  const dur = cover * 2
  return {
    id: 'tracks-snowfall',
    dur,
    setup: () => ({ r: rng(77), snow: new Particles() }),
    step(s, t, dt) {
      s.snow.update(dt)
      if (t < cover * 1.4) feedSnow(s.snow, s.r, w, lerp(1, p.short ? 3 : 6, span(t, 0, cover)), true)
    },
    draw(g, s, t) {
      const veil = Math.sin(Math.PI * span(t, cover * 0.4, dur))
      if (veil > 0) wash(g, TS.snow, 0.85 * veil, 8)
      s.snow.draw(g)
    },
    cues: () => [
      [0.02, () => quiet('tracks.snow')],
      [cover, (hud) => hud.beat?.('covered')],
    ],
  }
}

// ---------------------------------------------------------------- the outro

export interface OutroParams extends SceneSize {
  /** The shiny Stantler's front sprite key, standing in the glade. */
  mon: string
  title: string
  short?: boolean
}

type OutroState = { r: Rng; stars: Star[]; snow: Particles }

/**
 * The glade won: the moon over the glade, the shiny Stantler standing among the bushes, which give a last rustle and
 * settle; fresh snow falls and covers the prints (a row of hoofprints in the snow, fading under it); the card
 * (`beat('card')`). It holds its end (the snow falling) until the page takes it away. `short`: half.
 */
export function tracksOutroTimeline(p: OutroParams): Timeline<OutroState> {
  const w = p.w ?? W
  const h = p.h ?? H
  const k = p.short ? 0.5 : 1
  const hv = h - (p.inset ?? 0)
  const { c, R } = moonSpot(w, Math.round(hv * 0.8))
  const gy = groundAt(hv)
  const T_SETTLE = 0.6 * k
  const T_COVER = 1.4 * k
  const T_CARD = 2.6 * k
  const prints = Array.from({ length: 7 }, (_, i) => ({
    x: Math.round(w * 0.12 + i * w * 0.1),
    y: Math.round(gy + (hv - gy) * (0.25 + (i % 2) * 0.12)),
  }))
  return {
    id: 'tracks-outro',
    hold: true,
    dur: p.short ? 1.6 : 3.2,
    setup() {
      const r = rng(4234)
      return { r, stars: makeStars(r, w, Math.round(hv * 0.7)), snow: new Particles() }
    },
    step(s, t, dt) {
      s.snow.update(dt)
      feedSnow(s.snow, s.r, w, t > T_COVER - 0.4 * k && t < T_COVER + 0.6 * k ? 2 : 0.4)
    },
    draw(g, s, t) {
      g.drawImage(winterSky(w, h), 0, 0)
      drawStars(g, s.stars, t)
      drawMoon(g, c.x, c.y, R, 0.6)
      bushRow(g, w, gy + 2, Math.max(4, Math.round(w / 40)), Math.max(5, Math.round(w / 28)), 1)
      g.drawImage(snowGround(w, h, gy), 0, gy)
      // The hoofprints across the snow, pale blue pairs, covered by the fresh snow.
      const left = 1 - span(t, T_COVER - 0.3 * k, T_COVER + 0.5 * k)
      if (left > 0)
        for (const pr of prints) {
          const col = left > 0.5 ? TS.snowDark : TS.snowDeep
          if (bayer(pr.x, pr.y) < left) {
            rect(g, pr.x, pr.y, 2, 3, col)
            rect(g, pr.x + 3, pr.y, 2, 3, col)
          }
        }
      const fh = spriteFrame(p.mon)?.height ?? 48
      drawSprite(g, p.mon, Math.round(w * 0.5), Math.round(gy + Math.min(fh * 0.4, (hv - gy) * 0.4)))
      const near = Math.max(6, Math.round(w / 22))
      const n = Math.max(4, Math.round(w / 48))
      // The last rustle, on every near bush once, then still.
      const rustle = t >= T_SETTLE && t < T_SETTLE + 0.5 * k ? Math.floor((t - T_SETTLE) * 10) % n : -1
      bushRow(g, w, Math.round(gy + (hv - gy) * 0.75), near, n, 7, rustle, t)
      s.snow.draw(g)
      if (t < 0.3) wash(g, '#ffffff', 1 - span(t, 0, 0.3), 8)
      bars(g, w, h, Math.round(Math.min(16, h * 0.08) * ease.outC(span(t, T_CARD - 0.15, T_CARD + 0.1))))
      if (t >= T_CARD) gladeCard(g, w, Math.round(hv * 0.1), span(t, T_CARD, T_CARD + 0.3), p.title)
    },
    cues: () => [
      [T_SETTLE, () => quiet('tracks.rustle')],
      [T_COVER - 0.3 * k, () => quiet('tracks.snow')],
      [T_CARD, (hud) => (quiet('tracks.found'), hud.beat?.('card'))],
    ],
  }
}

// ---------------------------------------------------------------- the glade on a loop

/**
 * The glade under the moon on a loop (the rules' banner, the way in's pop-up): the moon, the stars twinkling, a row of
 * bushes, snow drifting down. `still`: one frame (motion off or a calm OS).
 */
export function gladeLoop(w: number, h: number, { still = false }: { still?: boolean } = {}): PortalLoop {
  const r = rng(91)
  const stars = makeStars(r, w, Math.round(h * 0.6))
  const snow = new Particles()
  const { c, R } = moonSpot(w, Math.round(h * 0.75))
  const gy = Math.round(h * 0.7)
  // Warmed up, so the snow is already falling on the first frame.
  if (!still)
    for (let i = 0; i < 180; i++) {
      feedSnow(snow, r, w, 0.3)
      snow.update(1 / 30)
    }
  return {
    step(_t, dt) {
      if (still) return
      feedSnow(snow, r, w, 0.3)
      snow.update(dt)
    },
    draw(g: G, t: number) {
      g.drawImage(winterSky(w, h), 0, 0)
      drawStars(g, stars, t, still)
      drawMoon(g, c.x, c.y, R, 0.6)
      g.drawImage(snowGround(w, h, gy), 0, gy)
      bushRow(g, w, h - 2, Math.max(5, Math.round(w / 26)), Math.max(4, Math.round(w / 40)), 3)
      snow.draw(g)
    },
  }
}
