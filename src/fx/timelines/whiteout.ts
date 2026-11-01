// Crown Shrine's whiteout (docs/61 §4.3, docs/15 §47) on the pixel engine, built like the nightmare's scenes
// (nightmare.ts): a storm-blue night, driving snow, the shrine's great pine (the crown tree) with snow on every tier and
// a golden crown at its top. The way in (the blizzard rolls in over the area, then eyes glow in the crown tree), the
// bonfire (a fire catching in the dark, the team sitting round it, snow falling: the cozy moment between waves), the
// end (the blizzard lifts, sunlight on the shrine) and the snowfall over the fights' stage. Abomasnow's entrance is a
// boss cinematic of its own (cinema/abomasnow.ts), drawn with the tree from here. Words come from the screen.
import { fxSound } from '@/audio/sfx'
import {
  bayer,
  cached,
  canvas,
  clamp,
  ditherFill,
  ease,
  glow,
  label,
  labelWidth,
  lerp,
  Particles,
  rect,
  rng,
  shade,
  softEllipse,
  span,
  type Canvas,
  type G,
  type Rng,
} from '../pixel'
import { background } from '../scenes'
import { drawSprite, spriteFrame, spriteSize } from '../sprites'
import { H, screenShake, skippingNow, W, type Cue, type Timeline } from '../timeline'
import { dissolve } from './cinema/kit'
import type { PortalLoop, SceneSize } from './portal'

/** The whiteout's palette: the storm's blues, the snow's whites, the pine's greens, the fire's ramp, the sun's golds. */
export const WO = {
  night: '#060b18',
  deep: '#0b1530',
  storm: '#16264a',
  slate: '#2a3d63',
  mist: '#587194',
  frost: '#a6c2db',
  snow: '#e6f1fa',
  white: '#ffffff',
  shade: '#8ea9c4',
  pine: '#163a2d',
  pineLit: '#2a5d45',
  pineDark: '#0a2219',
  bark: '#3a2a22',
  stone: '#6f7c8c',
  stoneDark: '#454f5c',
  gold: '#f2c24a',
  goldPale: '#ffeaa8',
  eye: '#ff3d2e',
  eyeGlow: '#ff9a6a',
  fireCore: '#fff6c8',
  fireHot: '#ffd34a',
  fire: '#ff8a2a',
  fireDeep: '#e2482a',
  ember: '#8a2618',
  warm: '#ffb060',
  log: '#4a2c1c',
  logLit: '#7a4a2a',
  dawnTop: '#5f9fd8',
  dawn: '#9fd0f2',
  dawnLow: '#e8f4fb',
  sun: '#fff2b0',
} as const

/** The fire's colours from its heart to its edge. */
const FIRE = [WO.fireCore, WO.fireHot, WO.fire, WO.fireDeep, WO.ember] as const

/** A sound, unless the scene is being skipped to its end (no pile of sounds then). */
const quiet = (name: Parameters<typeof fxSound>[0]) => !skippingNow() && fxSound(name)

// ---------------------------------------------------------------- the sky, the ground, the snow

/** The storm's sky: near-black blue at the top to the snow-laden slate at the horizon, dithered. Cached. */
export const stormSky = (w: number, h: number): Canvas =>
  cached(`wo-sky|${w}|${h}`, () => {
    const cols = [WO.night, WO.deep, WO.storm, WO.slate, WO.mist]
    return shade(w, h, (x, y) => {
      const t = Math.pow(clamp(y / Math.max(1, h - 1)), 1.2) * (cols.length - 1)
      const i = Math.floor(t)
      return t - i > bayer(x, y) ? cols[Math.min(cols.length - 1, i + 1)]! : cols[i]!
    })
  })

/** The clear sky after the blizzard: morning blue to pale snow-light. Cached. */
const dawnSky = (w: number, h: number): Canvas =>
  cached(`wo-dawn|${w}|${h}`, () => {
    const cols = [WO.dawnTop, WO.dawn, WO.dawnLow]
    return shade(w, h, (x, y) => {
      const t = clamp(y / Math.max(1, h - 1)) * (cols.length - 1)
      const i = Math.floor(t)
      return t - i > bayer(x, y) ? cols[Math.min(cols.length - 1, i + 1)]! : cols[i]!
    })
  })

/** Snowy ground from `y0` down: lit snow at its edge, bluer shade below, drifts. `night`: the dark's colours. */
function drawGround(g: G, w: number, h: number, y0: number, night = true) {
  const top = night ? WO.frost : WO.snow
  const low = night ? WO.slate : WO.shade
  for (let y = y0; y < h; y++) {
    const q = (y - y0) / Math.max(1, h - y0)
    for (let x = 0; x < w; x += 1) {
      const drift = Math.sin(x / 17 + y * 0.05) * 0.15
      rect(g, x, y, 1, 1, q + drift > bayer(x, y) * 0.9 ? low : top)
    }
  }
  rect(g, 0, y0, w, 1, night ? WO.snow : WO.white)
}

/** The ground as a cached canvas (it's drawn every frame). */
const groundOf = (w: number, h: number, y0: number, night = true): Canvas =>
  cached(`wo-ground|${w}|${h}|${y0}|${night}`, () => {
    const c = canvas(w, h)
    drawGround(c.g, w, h, y0, night)
    return c
  })

/** One snowflake: where it is, how fast it falls, how it sways, how big. */
export interface Flake {
  x: number
  y: number
  v: number
  ph: number
  s: 1 | 2
}

export function makeFlakes(r: Rng, w: number, h: number, n: number): Flake[] {
  return Array.from({ length: n }, () => ({
    x: r.range(0, w),
    y: r.range(0, h),
    v: r.range(14, 34),
    ph: r.range(0, 6.3),
    s: r() < 0.25 ? 2 : 1,
  }))
}

/**
 * Snow falling: `wind` pushes it sideways (art pixels a second, a blizzard 60–120), `speed` scales its fall. Off the
 * stage it comes back on the other side, or at the top.
 */
export function stepFlakes(fl: Flake[], w: number, h: number, dt: number, wind: number, speed = 1) {
  for (const f of fl) {
    f.y += f.v * speed * dt * (f.s === 2 ? 1.3 : 1)
    f.x += (wind * (f.s === 2 ? 1.2 : 0.8) + Math.sin(f.y / 9 + f.ph) * 6) * dt
    if (f.y > h) f.y -= h + 2
    if (f.x > w + 2) f.x -= w + 4
    if (f.x < -2) f.x += w + 4
  }
}

/** The flakes; `k` of them shown (a snowfall thinning out), the big ones whiter. */
export function drawFlakes(g: G, fl: readonly Flake[], k = 1) {
  const n = Math.round(fl.length * clamp(k))
  for (let i = 0; i < n; i++) {
    const f = fl[i]!
    const x = Math.round(f.x)
    const y = Math.round(f.y)
    if (f.s === 2) {
      rect(g, x, y, 2, 2, WO.snow)
      rect(g, x, y, 1, 1, WO.white)
    } else rect(g, x, y, 1, 1, i % 3 ? WO.frost : WO.white)
  }
}

/** The blizzard's streaks: short white dashes driven across the stage, `k` of them. */
function drawStreaks(g: G, w: number, h: number, t: number, k: number, seed = 3) {
  if (k <= 0) return
  const n = Math.round(((w * h) / 900) * k)
  for (let i = 0; i < n; i++) {
    const sp = 140 + ((i * 37) % 90)
    const len = 4 + ((i * 13) % 7)
    const y = Math.round(((i * 53 + seed * 17) % h) + Math.sin(t * 3 + i) * 2)
    const x = Math.round(((i * 97 + t * sp) % (w + len * 2)) - len)
    rect(g, x, y, len, 1, i % 2 ? WO.frost : WO.snow)
  }
}

// ---------------------------------------------------------------- the crown tree

export interface TreeLook {
  /** Sideways shake of its tiers (pixels at the top; its trunk stays put). */
  shake?: number
  /** Snow left on its branches, 1 full, 0 shaken off. */
  snow?: number
  /** Its eyes glowing in the dark, 0 none. */
  eyes?: number
  /** Night (the storm's colours) or day (lit by the sun). */
  day?: boolean
}

/**
 * The crown tree: a great pine of four tiers, a golden crown on its top, snow along every tier's lower edge and on its
 * slopes, a stone shrine at its foot. `x` its middle, `base` the ground line, `size` its height (art pixels). Its eyes,
 * two red points in its third tier, are what the blizzard hides (Abomasnow).
 */
export function drawCrownTree(g: G, x: number, base: number, size: number, o: TreeLook = {}) {
  const tiers = 4
  const trunkH = Math.max(3, Math.round(size * 0.1))
  const top = base - size
  const tierH = Math.round((size - trunkH) / tiers) + 3
  const lit = o.day ? '#3f7a59' : WO.pineLit
  const mid = o.day ? '#24533e' : WO.pine
  const dark = WO.pineDark
  rect(
    g,
    x - Math.max(1, Math.round(size * 0.04)),
    base - trunkH,
    Math.max(3, Math.round(size * 0.08)),
    trunkH,
    WO.bark,
  )
  for (let i = tiers - 1; i >= 0; i--) {
    const y0 = top + Math.round((i * (size - trunkH - tierH + 3)) / (tiers - 1 || 1))
    const half = Math.round(size * (0.12 + 0.1 * i))
    // The higher a tier, the further it swings.
    const sway = Math.round((o.shake ?? 0) * (1 - i / tiers))
    for (let r = 0; r < tierH; r++) {
      const hw = Math.max(1, Math.round(((r + 1) / tierH) * half))
      const y = y0 + r
      for (let dx = -hw; dx <= hw; dx++) {
        const side = dx / hw
        const c = side < -0.35 ? lit : side > 0.4 ? dark : bayer(dx + x, y) < 0.5 ? mid : side < 0 ? lit : mid
        rect(g, x + dx + sway, y, 1, 1, c)
      }
    }
    // Snow along its lower edge and up its lit slope: as much as is left on it.
    const snow = clamp(o.snow ?? 1)
    if (snow > 0) {
      const yb = y0 + tierH - 1
      for (let dx = -half; dx <= half; dx++) {
        if (bayer(dx + 7 * i, i) > snow) continue
        const bump = (dx + i) % 5 === 0 ? 1 : 0
        rect(g, x + dx + sway, yb - bump, 1, 1 + bump, (dx & 3) === 0 ? WO.frost : WO.snow)
      }
      for (let r = 2; r < tierH - 1; r += 2) {
        const hw = Math.round(((r + 1) / tierH) * half)
        if (bayer(r, i * 3) <= snow) rect(g, x - hw + sway, y0 + r, 2, 1, WO.snow)
      }
    }
    // The eyes, in the third tier from the top.
    if (i === 2 && (o.eyes ?? 0) > 0) {
      const e = clamp(o.eyes ?? 0)
      const ey = y0 + Math.round(tierH * 0.55)
      const gap = Math.max(3, Math.round(size * 0.05))
      const gr = Math.max(3, Math.round(4 + 4 * e))
      for (const ex of [x - gap + sway, x + gap + sway]) {
        g.drawImage(glow(gr, WO.eyeGlow, 1.4, 0.55 * e), ex - gr, ey - gr)
        rect(g, ex - 1, ey, 2, 1, e > 0.5 ? WO.eye : WO.ember)
        if (e > 0.8) rect(g, ex - 1, ey, 1, 1, WO.goldPale)
      }
    }
  }
  // The crown on its top: a gold band with three points.
  const cy = top - 2
  const sway = Math.round(o.shake ?? 0)
  rect(g, x - 3 + sway, cy, 7, 2, WO.gold)
  for (const dx of [-3, 0, 3]) rect(g, x + dx + sway, cy - 2, 1, 2, WO.gold)
  rect(g, x + sway, cy - 3, 1, 1, WO.goldPale)
  rect(g, x - 2 + sway, cy, 1, 1, WO.goldPale)
  // The shrine at its foot: a stone lantern on each side.
  for (const sx of [-1, 1]) {
    const lx = x + sx * Math.round(size * 0.42)
    const lh = Math.max(5, Math.round(size * 0.12))
    rect(g, lx - 1, base - lh, 3, lh, WO.stone)
    rect(g, lx - 2, base - lh - 1, 5, 2, WO.stoneDark)
    rect(g, lx - 2, base - lh - 2, 5, 1, WO.snow)
    rect(g, lx, base - lh + 2, 1, 1, o.day ? WO.stoneDark : WO.goldPale)
  }
}

/** The tree's height that fits a stage: tall, but under the sky's top and the words at the bottom. */
export const treeSize = (h: number) => Math.max(40, Math.round(h * 0.55))

/** A title band (the way in's and the end's names): the storm's blue, a snow-white rim on top and gold under. */
export function snowCard(g: G, w: number, y0: number, pin: number, title: string) {
  const s = labelWidth(g, title, 2) + 40 <= w ? 2 : 1
  const h = s === 2 ? 30 : 22
  const x = Math.round(-w * (1 - ease.outExpo(clamp(pin))))
  for (let y = 0; y < h; y++) {
    const slant = Math.round((h - y) * 0.6)
    const col =
      y === 0
        ? WO.snow
        : y === h - 1
          ? WO.gold
          : y < 3
            ? WO.slate
            : bayer(y, y * 3) < y / h
              ? WO.storm
              : WO.deep
    rect(g, x + slant - 10, y0 + y, w + 20, 1, col)
  }
  label(g, title, x + 14, y0 + 8, '#ffffff', WO.night, s)
}

/** The area as the blizzard finds it: its picture covering the stage, or the Daybreak field. */
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

/** The storm scene: its sky, the crown tree on its ground. Drawn into `c`. */
function drawShrine(c: Canvas, w: number, hv: number, look: TreeLook, day = false) {
  const g = c.g
  const groundY = Math.round(hv * 0.78)
  g.drawImage(day ? dawnSky(w, c.height) : stormSky(w, c.height), 0, 0)
  // Far pines on the horizon.
  for (let x = 0; x < w; x += 6) {
    const ph = 4 + ((x * 7) % 9)
    for (let r = 0; r < ph; r++)
      rect(
        g,
        x + 3 - Math.round(r / 3),
        groundY - r,
        1 + Math.round((r / 3) * 2),
        1,
        day ? '#5d8aa8' : WO.storm,
      )
  }
  g.drawImage(groundOf(w, c.height, groundY, !day), 0, 0)
  drawCrownTree(g, Math.round(w / 2), groundY + 2, Math.min(treeSize(hv), Math.round(w * 0.9)), {
    ...look,
    day,
  })
}

// ---------------------------------------------------------------- the way in

export interface WayInParams extends SceneSize {
  /** On the name card (the whiteout's name, in the player's language). */
  title: string
  /** The area's picture as a canvas sprite key (loadItemSprite), lost in the blizzard; null: the drawn field. */
  picture?: string | null
  short?: boolean
}

type WayInState = {
  r: Rng
  pic: Canvas
  scene: Canvas
  flakes: Flake[]
  wind: Particles
  shakes: [number, number, number][]
}

/**
 * The way in, as the whiteout begins: the blizzard rolls in over the area from the left (a white wall of snow, its
 * front dithered, streaks driven ahead of it) until there is nothing but white; then the white thins and the shrine
 * shows in the storm, the crown tree under its snow; two red eyes glow in its branches (a blink, then held:
 * `beat('line')`, the screen's words); the name card. It then holds its end (the snow driving, the eyes glowing) until
 * the page takes it away. `short`: the same in half the time.
 */
export function whiteoutIntroTimeline(p: WayInParams): Timeline<WayInState> {
  const w = p.w ?? W
  const h = p.h ?? H
  const k = p.short ? 0.5 : 1
  const hv = h - (p.inset ?? 0)
  const T_WALL = 0.25 * k
  const T_WHITE = 1.4 * k
  const T_CLEAR = 2.3 * k
  const T_EYES = 2.6 * k
  const T_LINE = 2.95 * k
  const T_CARD = 3.4 * k
  return {
    id: 'whiteout-intro',
    hold: true,
    dur: p.short ? 2.1 : 4.2,
    setup() {
      const r = rng(460)
      const scene = canvas(w, h)
      return {
        r,
        pic: pictureOf(w, h, p.picture),
        scene,
        flakes: makeFlakes(r, w, h, Math.round((w * h) / 160)),
        wind: new Particles(),
        shakes: [[T_LINE, 0.4, 1]],
      }
    },
    step(s, t, dt) {
      const gust = t < T_CLEAR ? 120 : 80
      stepFlakes(s.flakes, w, h, dt, gust, 1.4)
      s.wind.update(dt)
    },
    draw(g, s, t) {
      const sh = screenShake(t, s.shakes)
      const eyes =
        t < T_EYES
          ? 0
          : t < T_EYES + 0.12
            ? 1
            : t < T_EYES + 0.22
              ? 0
              : Math.min(1, span(t, T_EYES + 0.22, T_LINE))
      // The shrine in its storm, under everything (it's there when the white thins).
      drawShrine(s.scene, w, hv, { eyes: eyes * (0.85 + 0.15 * Math.sin(t * 4)) })
      g.save()
      g.translate(sh.x, sh.y)
      if (t < T_WHITE) g.drawImage(s.pic, 0, 0)
      else g.drawImage(s.scene, 0, 0)
      // The wall of snow: its front crosses from the left, dithered, the white solid behind it.
      const front = ease.ioS(span(t, T_WALL, T_WHITE))
      const fx = Math.round(lerp(-w * 0.3, w * 1.3, front))
      const thin = 1 - ease.outC(span(t, T_WHITE, T_CLEAR))
      if (t >= T_WALL) {
        if (t < T_WHITE) {
          rect(g, 0, 0, Math.max(0, fx - 24), h, WO.white)
          for (let x = Math.max(0, fx - 24); x < Math.min(w, fx + 24); x++)
            ditherFill(g, x, 0, 1, h, WO.white, 1 - (x - fx + 24) / 48)
        } else if (thin > 0) ditherFill(g, 0, 0, w, h, WO.white, thin)
      }
      drawFlakes(g, s.flakes, t < T_WALL ? span(t, 0, T_WALL) : 1)
      drawStreaks(g, w, h, t, t < T_WHITE ? span(t, 0, T_WHITE) : 0.8)
      g.restore()
      if (t >= T_CARD) snowCard(g, w, Math.round(hv * 0.08) + 4, span(t, T_CARD, T_CARD + 0.3), p.title)
    },
    cues: () =>
      [
        [T_WALL, () => quiet('whiteout.wind')],
        [T_EYES, () => quiet('whiteout.eyes')],
        [T_LINE, (hud) => hud.beat?.('line')],
        [T_CARD, (hud) => hud.beat?.('card')],
      ] satisfies Cue<WayInState>[],
  }
}

// ---------------------------------------------------------------- the bonfire

export interface BonfireParams {
  /** The team's front sprite keys (spriteKey(dex, false, shiny)), in team order: they sit round the fire. */
  team: readonly string[]
  w?: number
  h?: number
  short?: boolean
}

type BonfireState = {
  r: Rng
  flakes: Flake[]
  embers: Particles
  sky: Canvas
}

/** Where each team member sits: an arc behind and beside the fire, the middle ones further back (smaller). */
export function campSlots(
  n: number,
  w: number,
  h: number,
): { x: number; y: number; k: number; flip: boolean }[] {
  const cx = w / 2
  const fy = h - 20
  return Array.from({ length: n }, (_, i) => {
    // From the left of the fire round its back to its right, evenly; one alone sits at its left.
    const q = n === 1 ? 0.15 : i / (n - 1)
    const a = Math.PI * (0.92 - 0.84 * q)
    const back = Math.sin(a)
    return {
      x: Math.round(cx + Math.cos(a) * w * 0.33),
      y: Math.round(fy - back * 14),
      k: 0.55 - back * 0.1,
      // Front sprites look left: those on the fire's left turn to face it.
      flip: Math.cos(a) < 0,
    }
  })
}

/** The fire at (x, y) (its base), `k` 0..1 how big it has grown, at time t: tongues of flame and its glowing logs. */
export function drawFire(g: G, x: number, y: number, k: number, t: number) {
  // The logs, crossed.
  for (let i = 0; i < 10; i++) {
    rect(g, x - 9 + i, y - 1 + Math.round(i * 0.3), 3, 2, i % 3 ? WO.log : WO.logLit)
    rect(g, x + 8 - i, y - 1 + Math.round(i * 0.3), 3, 2, i % 2 ? WO.log : WO.logLit)
  }
  if (k <= 0) return
  const fh = Math.round(22 * k)
  const fw = 9 * k
  for (let r = 0; r < fh; r++) {
    const q = r / Math.max(1, fh)
    const flick = 1 + 0.25 * Math.sin(t * 13 + r * 0.8) + 0.15 * Math.sin(t * 21 - r * 0.5)
    const hw = Math.max(0, Math.round(fw * Math.pow(1 - q, 0.75) * flick))
    const sway = Math.round(Math.sin(t * 5 + r * 0.25) * q * 3)
    const yy = y - 2 - r
    for (let dx = -hw; dx <= hw; dx++) {
      const edge = Math.abs(dx) / Math.max(1, hw)
      const heat = clamp(1 - edge * 0.8 - q * 0.9 + (bayer(dx + x, yy) - 0.5) * 0.3)
      const c = FIRE[Math.min(FIRE.length - 1, Math.floor((1 - heat) * FIRE.length))]!
      rect(g, x + dx + sway, yy, 1, 1, c)
    }
  }
  // A tongue licking higher now and then.
  const lick = Math.round(4 + 4 * Math.max(0, Math.sin(t * 3.1)))
  for (let r = 0; r < lick; r++)
    rect(g, x + Math.round(Math.sin(t * 7 + r) * 2), y - 2 - fh - r, 1, 1, r < 2 ? WO.fire : WO.fireDeep)
}

/**
 * The bonfire, the cozy moment between waves: the dark, snow falling softly, far pines; a fire catching on its logs
 * (sparks, then flames growing), its glow spreading over the snow; the team sitting round it, lit warm on their
 * fire-side; embers rising. When the fire has caught (`hud.heal`, `beat('warm')`) the screen has the engine give the
 * heal. It then holds, the fire burning on, until the page takes it away. `short`: it catches at once.
 */
export function bonfireTimeline(p: BonfireParams): Timeline<BonfireState> {
  const w = p.w ?? 240
  const h = p.h ?? 120
  const T_SPARK = p.short ? 0.05 : 0.2
  const T_CATCH = p.short ? 0.35 : 0.9
  const cx = Math.round(w / 2)
  const fy = h - 20
  const slots = campSlots(p.team.length, w, h)
  return {
    id: 'whiteout-bonfire',
    hold: true,
    dur: T_CATCH + 0.4,
    setup() {
      const r = rng(37)
      const sky = canvas(w, h)
      const sg = sky.g
      sg.drawImage(stormSky(w, h), 0, 0)
      ditherFill(sg, 0, 0, w, h, WO.night, 0.55)
      for (let i = 0; i < 26; i++)
        rect(
          sg,
          Math.round(r.range(0, w)),
          Math.round(r.range(0, h * 0.45)),
          1,
          1,
          i % 4 ? WO.mist : WO.frost,
        )
      for (let x = 0; x < w; x += 7) {
        const ph = 8 + ((x * 11) % 12)
        for (let rr = 0; rr < ph; rr++)
          rect(sg, x + 3 - Math.round(rr / 3), fy - 12 - rr, 1 + Math.round((rr / 3) * 2), 1, WO.deep)
      }
      sg.drawImage(groundOf(w, h, fy - 12, true), 0, 0)
      ditherFill(sg, 0, fy - 12, w, h, WO.deep, 0.45)
      return { r, flakes: makeFlakes(r, w, h, Math.round((w * h) / 260)), embers: new Particles(), sky }
    },
    step(s, t, dt) {
      stepFlakes(s.flakes, w, h, dt, 8, 0.6)
      s.embers.update(dt)
      const lit = span(t, T_SPARK, T_CATCH)
      if (lit > 0 && s.r() < 0.35 + 0.4 * lit)
        s.embers.add({
          x: cx + s.r.range(-5, 5),
          y: fy - 6,
          vx: s.r.range(-6, 6),
          vy: -s.r.range(18, 36),
          ay: 4,
          life: s.r.range(0.6, 1.4),
          size: 1,
          shape: 'px',
          colors: [WO.fireCore, WO.fireHot, WO.fire, WO.fireDeep],
        })
    },
    draw(g, s, t) {
      const grow = ease.outBack(span(t, T_SPARK, T_CATCH), 1.4)
      const flick = 0.85 + 0.1 * Math.sin(t * 9) + 0.05 * Math.sin(t * 23)
      g.drawImage(s.sky, 0, 0)
      // The glow on the snow round the fire.
      if (grow > 0) {
        softEllipse(g, cx, fy, Math.round(70 * grow), Math.round(14 * grow), WO.warm, 0.5 * flick)
        softEllipse(g, cx, fy, Math.round(36 * grow), Math.round(7 * grow), WO.fireHot, 0.45 * flick)
        const gr = Math.round(46 * grow)
        if (gr > 2) g.drawImage(glow(gr, WO.fire, 1.6, 0.35 * flick), cx - gr, fy - 12 - gr)
      }
      // The ones at the back first, so the nearer ones sit in front of them.
      const order = slots.map((sl, i) => ({ sl, key: p.team[i]! })).sort((a, b) => a.sl.y - b.sl.y)
      for (const { sl, key } of order) {
        const sz = spriteSize(key)
        softEllipse(g, sl.x, sl.y, Math.round(sz.w * sl.k * 0.4), 2, WO.night, 0.55)
        drawSprite(g, key, sl.x, sl.y, {
          sx: sl.k,
          sy: sl.k,
          flip: sl.flip,
          // Lit warm on the side facing the fire once it has caught; cold blue before.
          tint: grow > 0.3 ? { color: WO.warm, a: 0.18 * flick } : { color: WO.storm, a: 0.35 },
        })
      }
      drawFire(g, cx, fy, grow, t)
      // The spark before it catches.
      if (t >= T_SPARK && t < T_CATCH && Math.floor(t * 20) % 2) rect(g, cx, fy - 4, 1, 1, WO.fireCore)
      s.embers.draw(g)
      drawFlakes(g, s.flakes)
    },
    cues: () =>
      [
        [T_SPARK, () => quiet('whiteout.fire')],
        [T_CATCH, (hud) => (hud.heal?.(), hud.beat?.('warm'))],
      ] satisfies Cue<BonfireState>[],
  }
}

// ---------------------------------------------------------------- the end

export interface OutroParams extends SceneSize {
  /** On the name card. */
  title: string
  /** The caught boss's front sprite key (shiny Abomasnow), standing by its tree in the sun. */
  mon: string
  short?: boolean
}

type OutroState = { r: Rng; flakes: Flake[]; scene: Canvas; day: Canvas; fx: Particles }

/**
 * The end, once the boss is caught: the shrine still in the storm; the wind falls away, the snow thins and slows and
 * stops; the sky clears from the top into morning blue (dithered); sunlight breaks over the shrine in long gold rays,
 * the snow on the crown tree glinting; the caught boss stands by it, a sparkle; the name card. It then holds (the rays
 * turning slowly, a glint now and then). `short`: in half the time.
 */
export function whiteoutOutroTimeline(p: OutroParams): Timeline<OutroState> {
  const w = p.w ?? W
  const h = p.h ?? H
  const k = p.short ? 0.5 : 1
  const hv = h - (p.inset ?? 0)
  const T_LIFT = 0.5 * k
  const T_CLEAR = 1.9 * k
  const T_SUN = 2.0 * k
  const T_MON = 2.5 * k
  const T_CARD = 3.1 * k
  const groundY = Math.round(hv * 0.78)
  return {
    id: 'whiteout-outro',
    hold: true,
    dur: p.short ? 1.9 : 3.8,
    setup() {
      const r = rng(4600)
      const scene = canvas(w, h)
      drawShrine(scene, w, hv, {})
      const day = canvas(w, h)
      drawShrine(day, w, hv, {}, true)
      return { r, flakes: makeFlakes(r, w, h, Math.round((w * h) / 160)), scene, day, fx: new Particles() }
    },
    step(s, t, dt) {
      const calmK = 1 - span(t, T_LIFT, T_CLEAR)
      stepFlakes(s.flakes, w, h, dt, 120 * calmK + 6, 0.4 + calmK)
      s.fx.update(dt)
      if (t > T_SUN && s.r() < 0.25) {
        const size = Math.min(treeSize(hv), Math.round(w * 0.9))
        s.fx.add({
          x: w / 2 + s.r.range(-size * 0.4, size * 0.4),
          y: groundY - s.r.range(4, size * 0.9),
          life: 0.5,
          size: 1,
          shape: 'plus',
          colors: [WO.white, WO.goldPale, WO.gold],
        })
      }
    },
    draw(g, s, t) {
      g.drawImage(s.scene, 0, 0)
      // The sky clearing: the day dithered in over the storm.
      dissolve(g, s.day, ease.ioS(span(t, T_LIFT, T_CLEAR)))
      // Sunlight: long gold rays from the top right, over the shrine.
      const sun = span(t, T_SUN, T_SUN + 0.8 * k)
      if (sun > 0) {
        const sx = Math.round(w * 0.86)
        const sy = -Math.round(h * 0.08)
        g.drawImage(
          glow(Math.round(w * 0.3), WO.sun, 1.5, 0.45 * sun),
          sx - Math.round(w * 0.3),
          sy - Math.round(w * 0.3),
        )
        for (let i = 0; i < 5; i++) {
          const a = Math.PI * (0.55 + i * 0.07) + Math.sin(t * 0.4 + i) * 0.01
          const len = h * 1.3
          for (let d = 0; d < len; d += 2) {
            const x = Math.round(sx + Math.cos(a) * d)
            const y = Math.round(sy + Math.sin(a) * d)
            if (bayer(x, y) < 0.35 * sun * (1 - d / len)) rect(g, x - 2, y, 5, 2, WO.goldPale)
          }
        }
      }
      // The caught one, by its tree, in the sun.
      if (t >= T_MON) {
        const q = ease.outBack(span(t, T_MON, T_MON + 0.4), 1.6)
        const size = Math.min(treeSize(hv), Math.round(w * 0.9))
        drawSprite(g, p.mon, Math.round(w / 2 + size * 0.42), groundY + 2, {
          sx: q,
          sy: q,
          flash: 1 - span(t, T_MON, T_MON + 0.35),
        })
      }
      s.fx.draw(g)
      drawFlakes(g, s.flakes, 1 - span(t, T_LIFT, T_CLEAR))
      drawStreaks(g, w, h, t, 0.8 * (1 - span(t, T_LIFT, T_LIFT + 0.6 * k)))
      if (t >= T_CARD) snowCard(g, w, Math.round(hv * 0.08) + 4, span(t, T_CARD, T_CARD + 0.3), p.title)
    },
    cues: () =>
      [
        [T_LIFT, () => quiet('whiteout.lift')],
        [T_MON, (hud) => (quiet('hatch.shiny'), hud.beat?.('mon'))],
        [T_CARD, (hud) => hud.beat?.('card')],
      ] satisfies Cue<OutroState>[],
  }
}

// ---------------------------------------------------------------- loops

/**
 * The shrine in its storm on a loop (the rules' banner, the way in's pop-up): the crown tree under its snow, the eyes
 * glowing faintly, snow driving across. `still`: one frame, held.
 */
export function shrineLoop(w: number, h: number, { still = false }: { still?: boolean } = {}): PortalLoop {
  const r = rng(w * 31 + h)
  const flakes = makeFlakes(r, w, h, Math.round((w * h) / 180))
  const scene = canvas(w, h)
  return {
    step(_t, dt) {
      if (!still) stepFlakes(flakes, w, h, dt, 90, 1.2)
    },
    draw(g, t) {
      drawShrine(scene, w, h, { eyes: 0.6 + (still ? 0 : 0.2 * Math.sin(t * 2)) })
      g.drawImage(scene, 0, 0)
      drawFlakes(g, flakes)
      if (!still) drawStreaks(g, w, h, t, 0.5)
    },
  }
}

/**
 * Snow over a fight's stage in the blizzard (docs/15 §47): flakes driven sideways and a few streaks, on a clear canvas
 * over the stage (no taps). `level` 'short' half of them; 'off' one still frame.
 */
export function snowStageLoop(
  w: number,
  h: number,
  { level = 'full' }: { level?: 'full' | 'short' | 'off' } = {},
): PortalLoop {
  const r = rng(w * 13 + h)
  const flakes = makeFlakes(r, w, h, Math.round(((w * h) / 140) * (level === 'short' ? 0.5 : 1)))
  return {
    step(_t, dt) {
      if (level !== 'off') stepFlakes(flakes, w, h, dt, 70, 1.3)
    },
    draw(g, t) {
      g.clearRect(0, 0, w, h)
      drawFlakes(g, flakes)
      if (level === 'full') drawStreaks(g, w, h, t, 0.35)
    },
  }
}
