// The race of time and space (docs/61 §4.4, docs/15 §48) on the pixel engine, built like the nightmare's scenes
// (nightmare.ts) and the legend's entrance (legend.ts): Spear Pillar's broken columns under a deep indigo sky, a clock
// face of time (Dialga's steel blue, gold hands) on one side and a rift of space (Palkia's pearl pink) torn open on the
// other. The intro (the area darkens, the clock appears and its hands race backwards, the rift tears open; it holds its
// end, the clock ticking), the win (the legend's silhouette rises between them, the reveal with its roar, then time and
// space settle: the hands stop at twelve, the rift seals), and the scene on a loop (the rules' banner, the way-in
// pop-up). Words come from the screen; sizes too: the full-screen scenes draw on a stage of the screen's shape.
import { fxSound } from '@/audio/sfx'
import {
  bayer,
  cached,
  canvas,
  clamp,
  disc,
  ease,
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
import { drawSprite, silhouette, spriteFrame } from '../sprites'
import { H, screenFlash, screenShake, W, type Cue, type Timeline } from '../timeline'
import { drawRays, gleam } from './legend'
import { burstRings, quiet, type PortalLoop, type SceneSize } from './portal'

/** The race's palette: the night over Spear Pillar, time's steel blues and gold, space's pearl pinks, the stone. */
export const TR = {
  night: '#05061a',
  deep: '#0b0f2e',
  dark: '#151c4a',
  mid: '#223070',
  dusk: '#3a3f8f',
  haze: '#6a62b8',
  stone: '#5b6378',
  stoneLit: '#8d97ae',
  stoneDark: '#323849',
  stoneDeep: '#1d2130',
  time: '#4a6bd8',
  timeLit: '#a8c8ff',
  timeDeep: '#22357a',
  steel: '#c9d6ea',
  gold: '#ffd65a',
  goldDeep: '#c2902a',
  space: '#e88ac0',
  spaceLit: '#ffd0ea',
  spaceDeep: '#8a3f8c',
  pearl: '#fff2fa',
  white: '#ffffff',
} as const

/** Which legend a scene is about: Dialga is time's (the Steel gate), Palkia space's (the Water gate). */
export type RaceSide = 'time' | 'space'

// ---------------------------------------------------------------- the place

/** The sky over the pillars: indigo at the top to the haze at the horizon, ordered-dithered. Cached. */
const raceSky = (w: number, h: number): Canvas =>
  cached(`tr-sky|${w}|${h}`, () => {
    const cols = [TR.night, TR.deep, TR.dark, TR.mid, TR.dusk, TR.haze]
    return shade(w, h, (x, y) => {
      const t = Math.pow(clamp(y / Math.max(1, h - 1)), 1.3) * (cols.length - 1)
      const i = Math.floor(t)
      return t - i > bayer(x, y) ? cols[Math.min(cols.length - 1, i + 1)]! : cols[i]!
    })
  })

/**
 * Spear Pillar's broken columns along the bottom: each a shaft lit on its left, fluted, with a capital, some snapped off
 * at the top; the ruined floor under them. Cached per size.
 */
const pillars = (w: number, h: number): Canvas =>
  cached(`tr-pillars|${w}|${h}`, () => {
    const c = canvas(w, h)
    const g = c.g
    const r = rng(w * 7 + h)
    const floor = Math.round(h * 0.86)
    rect(g, 0, floor, w, h - floor, TR.stoneDeep)
    rect(g, 0, floor, w, 1, TR.stoneLit)
    for (let x = 0; x < w; x += 6) rect(g, x + r.int(0, 3), floor + 3 + r.int(0, 4), 3, 1, TR.stoneDark)
    const n = Math.max(4, Math.round(w / 42))
    for (let i = 0; i < n; i++) {
      const cx = Math.round(((i + 0.5) / n) * w + r.range(-6, 6))
      const pw = Math.max(8, Math.round(w / 26))
      const tall = r.range(0.35, 0.62) * h
      const top = Math.round(floor - tall)
      const broken = r() < 0.45
      // The shaft: lit left edge, a flute line, its dark side.
      rect(g, cx - pw / 2, top, pw, floor - top, TR.stone)
      rect(g, cx - pw / 2, top, 1, floor - top, TR.stoneLit)
      rect(g, cx + pw / 2 - 2, top, 2, floor - top, TR.stoneDark)
      for (let f = 2; f < pw - 3; f += 3) rect(g, cx - pw / 2 + f, top + 4, 1, floor - top - 6, TR.stoneDark)
      if (broken) {
        // A jagged snapped top.
        for (let x = 0; x < pw; x++) {
          const cut = Math.round(Math.abs(Math.sin(x * 1.7 + i)) * 4)
          rect(g, cx - pw / 2 + x, top - 1, 1, cut + 1, TR.dark)
        }
      } else {
        rect(g, cx - pw / 2 - 2, top - 3, pw + 4, 3, TR.stoneLit)
        rect(g, cx - pw / 2 - 1, top, pw + 2, 1, TR.stoneDark)
      }
      rect(g, cx - pw / 2 - 2, floor - 2, pw + 4, 2, TR.stoneLit)
    }
    return c
  })

/** Where the clock and the rift hang over the pillars, and their size. */
export function raceSpots(w: number, h: number) {
  const R = Math.max(10, Math.round(Math.min(w * 0.17, h * 0.2)))
  return {
    R,
    clock: { x: Math.round(w * 0.3), y: Math.round(h * 0.32) },
    rift: { x: Math.round(w * 0.7), y: Math.round(h * 0.32) },
    mid: { x: Math.round(w / 2), y: Math.round(h * 0.62) },
  }
}

/**
 * The clock of time, radius R: a steel rim lit from the top, twelve ticks (the quarters longer), the face a dithered
 * blue, and two gold hands at `minute` and `hour` turns (0 = twelve o'clock). `a` fades it in (dithered).
 */
export function drawClock(g: G, x: number, y: number, R: number, minute: number, hour: number, a = 1) {
  if (a <= 0) return
  g.save()
  if (a < 1) g.globalAlpha = Math.round(a * 4) / 4
  g.drawImage(ring(R + 2, 2, TR.timeLit, 0.9), x - R - 3, y - R - 3)
  disc(g, x, y, R, TR.timeDeep)
  disc(g, x - 1, y - 1, R - 2, TR.time)
  g.drawImage(ring(R, 1, TR.steel), x - R - 1, y - R - 1)
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * Math.PI * 2 - Math.PI / 2
    const long = i % 3 === 0
    const r0 = R - (long ? 5 : 3)
    line(
      g,
      x + Math.cos(ang) * r0,
      y + Math.sin(ang) * r0,
      x + Math.cos(ang) * (R - 2),
      y + Math.sin(ang) * (R - 2),
      long ? TR.gold : TR.steel,
    )
  }
  const hand = (turns: number, len: number, c: string) => {
    const ang = turns * Math.PI * 2 - Math.PI / 2
    line(g, x, y, x + Math.cos(ang) * len, y + Math.sin(ang) * len, c, 2)
  }
  hand(hour, R * 0.5, TR.goldDeep)
  hand(minute, R * 0.78, TR.gold)
  rect(g, x - 1, y - 1, 3, 3, TR.white)
  g.restore()
}

/**
 * The rift of space, `open` 0..1: a jagged vertical tear, the void inside, its lips in pearl and pink pulsing, dithered
 * light spilling round it. `t` makes its edge shimmer.
 */
export function drawRift(g: G, x: number, y: number, R: number, open: number, t: number) {
  if (open <= 0) return
  const hh = Math.round(R * 1.4 * open)
  const glowR = Math.round(R * (0.6 + 0.6 * open))
  g.drawImage(ring(glowR, glowR, TR.spaceDeep, 0.5), x - glowR - 1, y - glowR - 1)
  for (let dy = -hh; dy <= hh; dy++) {
    const k = 1 - Math.abs(dy) / Math.max(1, hh)
    const jag = Math.round(Math.sin(dy * 0.9 + Math.floor(t * 8)) * 1.5 * k)
    const half = Math.max(0, Math.round(R * 0.32 * k * open))
    const x0 = x + jag - half
    rect(g, x0 - 2, y + dy, 2, 1, (dy + Math.floor(t * 10)) % 4 === 0 ? TR.pearl : TR.space)
    rect(g, x0, y + dy, half * 2, 1, (x0 + dy) % 5 === 0 ? TR.spaceDeep : TR.night)
    rect(g, x0 + half * 2, y + dy, 2, 1, TR.spaceLit)
  }
}

/** The motes drawn into the rift: pearl and pink specks spiralling to its middle. */
function feedRift(P: Particles, r: Rng, c: { x: number; y: number }, R: number, rate: number) {
  if (r() > rate) return
  const ang = r.range(0, Math.PI * 2)
  const d = R * r.range(1.2, 2)
  P.add({
    x: c.x + Math.cos(ang) * d,
    y: c.y + Math.sin(ang) * d,
    life: r.range(0.8, 1.4),
    size: r.int(1, 2),
    shape: 'sq',
    colors: [TR.spaceLit, TR.space, TR.spaceDeep],
    home: { x: c.x, y: c.y, k: 40 },
    drag: 1.5,
  })
}

/** The whole place: the sky, the stars of the void, the pillars. Over the area's picture fading out when `pic` < 1. */
function drawPlace(g: G, w: number, h: number, t: number, still = false) {
  g.drawImage(raceSky(w, h), 0, 0)
  const r = rng(483)
  for (let i = 0; i < Math.round((w * h) / 300); i++) {
    const sx = r.int(0, w - 1)
    const sy = r.int(0, Math.round(h * 0.6))
    const on = still || (Math.floor(t * 2) + i) % 5 !== 0
    if (on) rect(g, sx, sy, 1, 1, i % 7 === 0 ? TR.spaceLit : TR.timeLit)
  }
  g.drawImage(pillars(w, h), 0, 0)
}

/** The area's picture, cover-fitted, for the scene's first beats. */
function pictureCanvas(w: number, h: number, picture: string | null | undefined): Canvas | null {
  const f = picture ? spriteFrame(picture) : undefined
  if (!f) return null
  const c = canvas(w, h)
  const k = Math.max(w / f.width, h / f.height)
  const dw = Math.round(f.width * k)
  const dh = Math.round(f.height * k)
  c.g.drawImage(f, Math.round((w - dw) / 2), Math.round((h - dh) / 2), dw, dh)
  return c
}

/** Letterbox bars, `bh` art pixels each, for the moment a scene's line is read. */
function bars(g: G, w: number, h: number, bh: number) {
  if (bh <= 0) return
  rect(g, 0, 0, w, bh, TR.night)
  rect(g, 0, h - bh, w, bh, TR.night)
}

// ---------------------------------------------------------------- the intro

export interface RaceIntroParams extends SceneSize {
  /** The area's picture (a loaded picture key), seen before the night falls. */
  picture?: string | null
  short?: boolean
}

interface IntroState {
  r: Rng
  pic: Canvas | null
  fx: Particles
  shakes: [number, number, number][]
}

/**
 * The way in (docs/61 §4.4): the area darkens into Spear Pillar's night, the clock of time appears and its hands race
 * backwards, the rift of space tears open across from it with a flash and a quake; then it holds its end (the clock
 * ticking, the rift shimmering) until the player taps. 3.4 s (short: half).
 */
export function raceIntroTimeline(p: RaceIntroParams = {}): Timeline<IntroState> {
  const w = p.w ?? W
  const h = p.h ?? H
  const k = p.short ? 0.5 : 1
  const { R, clock, rift } = raceSpots(w, h - (p.inset ?? 0))
  const T_DARK = 0.6 * k
  const T_CLOCK = 0.5 * k
  const T_SPIN = 1.6 * k
  const T_RIFT = 1.5 * k
  const T_TEAR = 2.4 * k
  const T_LINE = 2.6 * k
  const dur = 3.4 * k
  return {
    id: 'race-intro',
    hold: true,
    dur,
    setup: () => ({
      r: rng(484),
      pic: pictureCanvas(w, h, p.picture),
      fx: new Particles(),
      shakes: [[T_TEAR, 0.5, 2]],
    }),
    step(s, t, dt) {
      s.fx.update(dt)
      if (t > T_RIFT) feedRift(s.fx, s.r, rift, R, t > T_TEAR ? 0.7 : 0.4)
    },
    draw(g, s, t) {
      const sh = screenShake(t, s.shakes)
      g.save()
      g.translate(sh.x, sh.y)
      drawPlace(g, w, h, t)
      // The area, darkening into the night, dithered away.
      const gone = span(t, 0, T_DARK)
      if (s.pic && gone < 1) {
        g.save()
        g.globalAlpha = Math.round((1 - gone) * 4) / 4
        g.drawImage(s.pic, 0, 0)
        g.restore()
        wash(g, TR.night, gone * 0.6, 6)
      }
      // The clock: fading in, its hands racing backwards, slowing to the hour; then it ticks.
      const inA = ease.outC(span(t, T_CLOCK, T_CLOCK + 0.5 * k))
      const spin = ease.outC(span(t, T_CLOCK, T_SPIN))
      const tick = t > T_SPIN ? Math.floor((t - T_SPIN) * 1) / 60 : 0
      drawClock(g, clock.x, clock.y, R, -spin * 6 + tick, -spin * 0.5, inA)
      // The rift: a seam, then torn open with a flash.
      const open =
        t < T_TEAR
          ? 0.2 * ease.outC(span(t, T_RIFT, T_TEAR))
          : 0.2 + 0.8 * ease.outBack(span(t, T_TEAR, T_TEAR + 0.4 * k))
      drawRift(g, rift.x, rift.y, R, open, t)
      s.fx.draw(g)
      g.restore()
      if (t >= T_TEAR && t < T_TEAR + 0.12) screenFlash(g, TR.pearl, 0.6)
      bars(g, w, h, Math.round(Math.min(14, h * 0.07) * ease.outC(span(t, T_LINE - 0.1, T_LINE + 0.1))))
    },
    cues: () =>
      [
        [T_CLOCK, () => quiet('race.tick')],
        [T_RIFT, () => quiet('race.rift')],
        [T_LINE, (hud) => hud.beat?.('line')],
      ] as Cue<IntroState>[],
  }
}

// ---------------------------------------------------------------- the win

export interface RaceWinParams extends SceneSize {
  /** The legend's sprite key (shiny, front). */
  mon: string
  side: RaceSide
  /** Its name for the card, and the card's small lines (SHINY, its raid level). */
  name: string
  subs?: readonly string[]
  short?: boolean
}

interface WinState {
  r: Rng
  fx: Particles
  shakes: [number, number, number][]
  rays: Canvas
}

/**
 * The last fight won in time (docs/61 §4.4): the clock and the rift over the pillars; dark pulses; the legend's
 * silhouette rising between them in its colour; the reveal (a flash, rings, its roar and a quake) and the shiny gleam;
 * then time and space settle: the hands turn to twelve and stop, the rift seals to a line and is gone, a soft light; the
 * name card. 5 s (short: half). `beat`: 'roar' at the reveal, 'card' with the card.
 */
export function raceWinTimeline(p: RaceWinParams): Timeline<WinState> {
  const w = p.w ?? W
  const h = p.h ?? H
  const k = p.short ? 0.5 : 1
  const { R, clock, rift, mid } = raceSpots(w, h - (p.inset ?? 0))
  const own = p.side === 'time' ? TR.time : TR.space
  const ownLit = p.side === 'time' ? TR.timeLit : TR.spaceLit
  const T_RISE = 0.7 * k
  const T_REVEAL = 2.2 * k
  const T_SETTLE = 2.9 * k
  const T_SEALED = 3.9 * k
  const T_CARD = 4.1 * k
  const dur = 5 * k
  return {
    id: 'race-win',
    dur,
    setup: () => ({
      r: rng(483),
      fx: new Particles(),
      shakes: [[T_REVEAL, 0.6, 3]],
      rays: canvas(w, h),
    }),
    step(s, t, dt) {
      s.fx.update(dt)
      if (t < T_SETTLE) feedRift(s.fx, s.r, rift, R, 0.5)
      // Sparkles round the legend once it is out.
      if (t > T_REVEAL && t < T_CARD && s.r() < 0.4)
        s.fx.add({
          x: mid.x + s.r.range(-30, 30),
          y: mid.y - s.r.range(0, 60),
          vy: -s.r.range(6, 14),
          life: s.r.range(0.4, 0.8),
          size: 1,
          shape: 'star',
          colors: [TR.white, ownLit, own],
        })
    },
    draw(g, s, t) {
      const sh = screenShake(t, s.shakes)
      g.save()
      g.translate(sh.x, sh.y)
      drawPlace(g, w, h, t)
      // Time and space settle: the hands turn back to twelve and stop; the rift seals.
      const settle = ease.ioS(span(t, T_SETTLE, T_SEALED))
      const tick = Math.floor(t) / 60
      drawClock(
        g,
        clock.x,
        clock.y,
        R,
        lerp(tick + 0.3, 1, settle),
        lerp(0.4, 1, settle),
        1 - span(t, T_SEALED, T_CARD) * 0.75,
      )
      drawRift(g, rift.x, rift.y, R, 1 - settle, t)
      // Dark pulses before the legend comes.
      const pulse = Math.max(
        0,
        Math.sin(Math.PI * span(t, 0.1 * k, 0.5 * k)),
        Math.sin(Math.PI * span(t, 0.5 * k, 0.9 * k)),
      )
      if (pulse > 0 && t < T_REVEAL) wash(g, TR.night, pulse * 0.45, 6)
      // Its silhouette rising between them, then the legend itself.
      const rise = ease.outC(span(t, T_RISE, T_REVEAL))
      const y = Math.round(lerp(h + 40, mid.y + 30, rise))
      if (t >= T_REVEAL) {
        drawRays(s.rays, { x: mid.x, y: mid.y }, t, ownLit, 1 - span(t, T_REVEAL, T_CARD))
        g.drawImage(s.rays, 0, 0)
        drawSprite(g, p.mon, mid.x, y, { flash: 1 - span(t, T_REVEAL, T_REVEAL + 0.25) })
        const gl = span(t, T_REVEAL + 0.5 * k, T_REVEAL + 1.0 * k)
        if (gl > 0 && gl < 1) gleam(g, p.mon, { x: mid.x, y }, 0, gl)
      } else if (rise > 0) {
        const sil = silhouette(p.mon, TR.night)
        if (sil) {
          g.drawImage(sil, Math.round(mid.x - sil.width / 2), y - sil.height)
          const rim = silhouette(p.mon, own)
          if (rim && Math.floor(t * 4) % 2 === 0)
            g.drawImage(rim, Math.round(mid.x - rim.width / 2), y - rim.height - 1)
        }
      }
      if (t >= T_REVEAL)
        burstRings(g, mid, t, T_REVEAL, Math.round(Math.min(w, h) * 0.45), [
          [0, ownLit],
          [0.12, TR.white],
          [0.24, own],
        ])
      s.fx.draw(g)
      g.restore()
      if (t >= T_REVEAL && t < T_REVEAL + 0.12) screenFlash(g, TR.white, 0.75)
      // The settled light: a soft wash of the legend's colour as the rift closes.
      if (t >= T_SEALED - 0.2 && t < T_SEALED + 0.1) screenFlash(g, ownLit, 0.3)
      if (t >= T_CARD)
        raceCard(
          g,
          w,
          Math.round(h * 0.08),
          ease.outExpo(span(t, T_CARD, T_CARD + 0.4)),
          p.name,
          p.subs ?? [],
          own,
        )
    },
    cues: () =>
      [
        [0.1 * k, () => quiet('legend.pulse')],
        [T_RISE, () => quiet('legend.heart')],
        [
          T_REVEAL,
          (hud) => {
            quiet('legend.roar')
            hud.beat?.('roar')
          },
        ],
        [T_SETTLE, () => quiet('race.settle')],
        [T_CARD, (hud) => hud.beat?.('card')],
      ] as Cue<WinState>[],
  }
}

/** The name card: a band sweeping in (the night, the legend's colour as its rims), the name at 2× when it fits. */
function raceCard(
  g: G,
  w: number,
  y0: number,
  pin: number,
  title: string,
  subs: readonly string[],
  own: string,
) {
  const subW = Math.max(0, ...subs.map((s) => labelWidth(g, s)))
  const s = labelWidth(g, title, 2) + 40 + subW <= w ? 2 : 1
  const showSubs = labelWidth(g, title, s) + 40 + subW <= w
  const bh = s === 2 ? 30 : 22
  const x = Math.round(-w * (1 - pin))
  for (let y = 0; y < bh; y++) {
    const col = y === 0 || y === bh - 1 ? TR.gold : y < 3 ? own : bayer(y, y * 3) < y / bh ? TR.dark : TR.deep
    rect(g, x + Math.round((bh - y) * 0.6) - 10, y0 + y, w + 20, 1, col)
  }
  label(g, title, x + 14, y0 + 8, TR.white, TR.night, s)
  if (showSubs)
    subs.slice(0, 2).forEach((sub, i) => {
      label(g, sub, x + w - 12 - labelWidth(g, sub), y0 + 7 + i * 10, i ? TR.white : TR.gold, TR.night)
    })
}

// ---------------------------------------------------------------- on a loop

/**
 * The scene on a loop (the rules' banner, the way-in pop-up on its own): the pillars, the clock ticking once a second,
 * the rift shimmering with motes drawn in. `still`: one frame, held (motion off).
 */
export function raceLoop(w: number, h: number, { still = false }: { still?: boolean } = {}): PortalLoop {
  const r = rng(w * 13 + h)
  const { R, clock, rift } = raceSpots(w, h)
  const amb = new Particles()
  if (!still)
    for (let i = 0; i < 90; i++) {
      feedRift(amb, r, rift, R, 0.5)
      amb.update(1 / 30)
    }
  return {
    step(_t, dt) {
      if (still) return
      feedRift(amb, r, rift, R, 0.45)
      amb.update(dt)
    },
    draw(g, t) {
      drawPlace(g, w, h, t, still)
      const tick = still ? 0.1 : Math.floor(t) / 60
      drawClock(g, clock.x, clock.y, R, tick, 0.35)
      drawRift(g, rift.x, rift.y, R, 1, still ? 0 : t)
      amb.draw(g)
    },
  }
}

/** The tick the clock makes on screen each second (docs/15 §48): louder in its last 30 seconds. */
export const playRaceTick = (last: boolean) => fxSound('race.tick', last ? 1 : 0)
