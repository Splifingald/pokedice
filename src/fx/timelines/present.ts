// The Gift card's present (docs/61 §4.0, §4.2) on the battle's stage, drawn with the game's pixel FX: no background of
// its own (the area's picture shows through the canvas, as Trick or Treat's), the present standing at the stage's
// centre. Every take holds its last frame (`hold`), the present breathing a pixel up and down unless `still`, so one
// canvas always shows it.
//
// - Appear: it drops in, lands with a squash and a puff of snow.
// - Grow (MAKE IT BIGGER, it holds): the anticipation (a crouch), two wobbles, two white silhouette frames, then it
//   swells to the next size in pixel steps with a gold ring and twinkles; the `grown` beat says when.
// - Break (it didn't hold): it strains, shakes harder and harder, the paper rips (tears appear), a 4-frame hit-stop,
//   then it bursts: paper scraps and ribbon fly, a dithered puff, a flash, and the wild Pokémon pops out of it, two
//   white frames as it lands (`broke`, then `out` for its cry).
// - Burst (a boss's present, the last tap): the same, bigger, in silver and gold, with a shiny's two rings of stars.
// - Open: the bow springs loose, the lid flies off in a burst of light, and what was inside rises out one by one (an
//   item as its picture, Pokédollars as coins), then `opened`.
//
// Short motion: each take shortened (no wobbles before a grow, a short strain before a break). Animations off: the
// stage jumps to the end with every cue fired (StageCanvas). Calm: no flash, no shake, no breathing.
import { fxSound } from '@/audio/sfx'
import {
  cached,
  canvas,
  ease,
  ellipse,
  glow,
  Particles,
  rect,
  ring,
  rng,
  softEllipse,
  span,
  text,
  textWidth,
  type Canvas,
  type G,
  type Rng,
} from '../pixel'
import { drawSprite, spriteFrame } from '../sprites'
import { screenFlash, screenShake, STEP, within, type Cue, type Timeline } from '../timeline'

/** Where the present stands on the 240 × 160 stage: its middle, and the ground under it. */
export const PRESENT_AT = { x: 120, y: 124 }

export type PresentLook = 'red' | 'silver'

/** One thing that comes out of an opened present: an item picture's key (`item|<url>`), or Pokédollars. */
export interface PresentContent {
  key: string
  kind: 'item' | 'gold'
}

export interface PresentParams {
  mode: 'appear' | 'idle' | 'grow' | 'break' | 'burst' | 'open'
  /** The level it is at (before a grow). */
  level: number
  /** A grow's new level. */
  to?: number
  look?: PresentLook
  /** Break / burst: the Pokémon that comes out (its sprite key, loaded), and whether it is shiny. */
  mon?: string
  shiny?: boolean
  /** Open: what rises out. */
  contents?: PresentContent[]
  short?: boolean
  /** No breathing at rest (calm). */
  still?: boolean
}

const INK = '#24304f'
const GOLD = '#ffbe2e'
const GOLD_L = '#ffe7a8'
const GOLD_D = '#e08e00'
const PAL: Record<
  PresentLook,
  { paper: string; dark: string; light: string; dot: string; scraps: string[] }
> = {
  red: {
    paper: '#e2364a',
    dark: '#a8213a',
    light: '#ff7a88',
    dot: '#ffd0d8',
    scraps: ['#e2364a', '#ff7a88', '#a8213a', GOLD, GOLD_L],
  },
  // Delibird's present (docs/61 §4.2): silver paper, a gold bow, a glow around it.
  silver: {
    paper: '#c9d3e0',
    dark: '#8593aa',
    light: '#f4f8fd',
    dot: '#ffffff',
    scraps: ['#c9d3e0', '#f4f8fd', '#8593aa', GOLD, GOLD_L],
  },
}
const SNOW = ['#ffffff', '#eaf3fa', '#cfe2f2']
const CONFETTI = ['#e2364a', '#ffbe2e', '#5b8def', '#34c97a', '#ff6f9c', '#ffffff']

/** The present's size at a level: a body and a lid a little wider, both growing in whole pixels. */
export function presentSize(level: number): { bw: number; bh: number; lw: number; lh: number; bow: number } {
  const l = Math.max(1, Math.min(7, Math.round(level)))
  const bw = 26 + 8 * (l - 1)
  const bh = 18 + 5 * (l - 1)
  return { bw, bh, lw: bw + 4, lh: 6 + (l >> 1), bow: 6 + l }
}

/** The whole present at a level (body, lid, ribbon, bow), `tears` rips in its paper (0–3): drawn once per look. */
function presentArt(look: PresentLook, level: number, tears: number, bow = true): Canvas {
  return cached(`present|${look}|${level}|${tears}|${bow}`, () => {
    const p = PAL[look]
    const { bw, bh, lw, lh, bow: bs } = presentSize(level)
    const top = bow ? bs + 2 : 0
    const c = canvas(lw + 2, top + lh + bh + 1)
    const g = c.g
    const bx = 1 + ((lw - bw) >> 1)
    const by = top + lh - 1
    // The body: ink edge, paper, shade at the bottom and the left's light.
    rect(g, bx, by, bw, bh, INK)
    rect(g, bx + 1, by, bw - 2, bh - 1, p.paper)
    rect(g, bx + 1, by + bh - 4, bw - 2, 3, p.dark)
    rect(g, bx + 2, by + 1, 2, bh - 6, p.light)
    // Its paper's dots, on a grid (the ribbon covers some).
    for (let y = by + 3; y < by + bh - 5; y += 5)
      for (let x = bx + 5 + ((y >> 1) % 2) * 2; x < bx + bw - 3; x += 6) rect(g, x, y, 1, 1, p.dot)
    // The ribbon down the middle and across.
    const rx = 1 + (lw >> 1) - 2
    const rw = level >= 4 ? 5 : 4
    rect(g, rx - 1, by, rw + 2, bh - 1, INK)
    rect(g, rx, by, rw, bh - 1, GOLD)
    rect(g, rx, by, 1, bh - 1, GOLD_L)
    rect(g, rx + rw - 1, by, 1, bh - 1, GOLD_D)
    const ry = by + (bh >> 1) - 2
    rect(g, bx + 1, ry - 1, bw - 2, 5, INK)
    rect(g, bx + 1, ry, bw - 2, 3, GOLD)
    rect(g, bx + 1, ry, bw - 2, 1, GOLD_L)
    // Rips in the paper: ink zigzags, wider with each one.
    const rips = [
      [bx + 4, by + 3],
      [bx + bw - 9, by + bh - 9],
      [bx + (bw >> 2), by + bh - 7],
    ] as const
    for (let i = 0; i < Math.min(3, tears); i++) {
      const [x0, y0] = rips[i]!
      for (let k = 0; k < 4; k++) {
        rect(g, x0 + k, y0 + (k % 2 ? 1 : 0), 1, 2, INK)
        rect(g, x0 + k, y0 + (k % 2 ? 3 : 2), 1, 1, '#fff6d8')
      }
    }
    // The lid: wider, its own ribbon.
    rect(g, 1, top, lw, lh, INK)
    rect(g, 2, top + 1, lw - 2, lh - 2, p.paper)
    rect(g, 2, top + lh - 3, lw - 2, 2, p.dark)
    rect(g, 3, top + 1, lw - 4, 1, p.light)
    rect(g, rx - 1, top, rw + 2, lh, INK)
    rect(g, rx, top + 1, rw, lh - 2, GOLD)
    rect(g, rx, top + 1, 1, lh - 2, GOLD_L)
    if (bow) {
      // Two loops and the knot, growing with the present.
      const cx = 1 + (lw >> 1)
      const r = bs
      ellipse(g, cx - r + 1, top - (r >> 1) + 1, r, (r >> 1) + 1, INK)
      ellipse(g, cx + r - 1, top - (r >> 1) + 1, r, (r >> 1) + 1, INK)
      ellipse(g, cx - r + 1, top - (r >> 1) + 1, r - 1, r >> 1, GOLD)
      ellipse(g, cx + r - 1, top - (r >> 1) + 1, r - 1, r >> 1, GOLD)
      ellipse(g, cx - r, top - (r >> 1), r >> 1, 1, GOLD_L)
      ellipse(g, cx + r - 2, top - (r >> 1), r >> 1, 1, GOLD_L)
      rect(g, cx - 3, top - 3, 6, 5, INK)
      rect(g, cx - 2, top - 2, 4, 4, GOLD_D)
      rect(g, cx - 2, top - 2, 2, 2, GOLD)
    }
    return c
  })
}

/** The present's picture at a level, for a page outside the stage (the rules' banner, the preview card, the gauge). */
export const presentPicture = (look: PresentLook, level: number): Canvas => presentArt(look, level, 0)

/** Pokédollars: three gold coins stacked a little askew, drawn once. */
function coinsArt(): Canvas {
  return cached('present|coins', () => {
    const c = canvas(22, 18)
    const g = c.g
    const coin = (x: number, y: number) => {
      ellipse(g, x, y + 1, 9, 4, INK)
      ellipse(g, x, y + 1, 8, 3, GOLD_D)
      ellipse(g, x, y - 1, 9, 4, INK)
      ellipse(g, x, y - 1, 8, 3, GOLD)
      ellipse(g, x - 2, y - 2, 3, 1, GOLD_L)
    }
    coin(11, 13)
    coin(10, 9)
    coin(12, 5)
    return c
  })
}

/** The present at (x, ground), scaled and tilted about its base. */
function drawPresent(
  g: G,
  look: PresentLook,
  level: number,
  o: {
    sx?: number
    sy?: number
    ang?: number
    dy?: number
    dx?: number
    tears?: number
    flash?: boolean
    bow?: boolean
  } = {},
) {
  const art = presentArt(look, level, o.tears ?? 0, o.bow ?? true)
  g.save()
  g.translate(Math.round(PRESENT_AT.x + (o.dx ?? 0)), Math.round(PRESENT_AT.y + (o.dy ?? 0)))
  if (o.ang) g.rotate((o.ang * Math.PI) / 180)
  g.scale(o.sx ?? 1, o.sy ?? 1)
  if (o.flash) {
    // Two white silhouette frames (never an opacity blink): the art's shape, filled white.
    const c = cached(`present|white|${look}|${level}|${o.tears ?? 0}|${o.bow ?? true}`, () => {
      const w = canvas(art.width, art.height)
      w.g.drawImage(art, 0, 0)
      w.g.globalCompositeOperation = 'source-in'
      w.g.fillStyle = '#ffffff'
      w.g.fillRect(0, 0, art.width, art.height)
      return w
    })
    g.drawImage(c, -(art.width >> 1), -art.height + 1)
  } else g.drawImage(art, -(art.width >> 1), -art.height + 1)
  g.restore()
}

/** Its shadow on the ground, as wide as it is. */
function drawShadow(g: G, level: number, k = 1) {
  const { lw } = presentSize(level)
  softEllipse(g, PRESENT_AT.x, PRESENT_AT.y + 1, Math.round(((lw >> 1) + 2) * k), 3, '#00000055', 0.6)
}

/** A boss's present glows: a dithered light behind it, its pulse in steps. */
function drawGlow(g: G, level: number, t: number, k = 1) {
  const { lw, bh } = presentSize(level)
  const R = Math.round((lw * 0.7 + 8 + (Math.floor(t * 4) % 2) * 2) * k)
  g.drawImage(glow(R, '#fff2b8', 1.3, 0.7), PRESENT_AT.x - R, Math.round(PRESENT_AT.y - bh / 2 - 6 - R))
}

interface PresentState {
  r: Rng
  fx: Particles
}

/** Its breathing at rest: a pixel up every other beat. */
const breathe = (t: number, still?: boolean) => (still ? 0 : Math.floor(t * 1.6) % 2 ? -1 : 0)

/** The present's take for the mode asked (see the head of this file). */
export function presentTimeline(p: PresentParams): Timeline<PresentState> {
  const look: PresentLook = p.look ?? 'red'
  const short = !!p.short
  const level = Math.max(1, p.level)
  const to = Math.max(level, p.to ?? level)
  const boss = look === 'silver'
  // Times, by mode.
  const T_LAND = 0.45
  const G_CROUCH = short ? 0 : 0.42
  const G_SWELL = G_CROUCH + (short ? 0.02 : 0.16)
  const G_DONE = G_SWELL + 0.36
  const WOBBLES = short ? [] : [0.08, 0.24]
  // Break / burst: a longer strain for the boss (it grows, shakes, then goes).
  const B_STRAIN = short ? 0.15 : boss ? 1.1 : 0.75
  const B_RIPS = [B_STRAIN * 0.35, B_STRAIN * 0.65, B_STRAIN * 0.9]
  const B_POP = B_STRAIN + 4 * STEP
  const B_OUT = B_POP + 0.32
  const B_DONE = B_OUT + 0.5
  // Open.
  const O_UNTIE = short ? 0.05 : 0.3
  const O_POP = O_UNTIE + (short ? 0.12 : 0.35)
  const contents = (p.contents ?? []).slice(0, 4)
  const O_OUT = contents.map((_, i) => O_POP + 0.3 + i * 0.3)
  const O_DONE = (O_OUT[O_OUT.length - 1] ?? O_POP) + 0.5
  const dur =
    p.mode === 'appear'
      ? T_LAND + 0.25
      : p.mode === 'idle'
        ? 0.05
        : p.mode === 'grow'
          ? G_DONE + 0.1
          : p.mode === 'open'
            ? O_DONE
            : B_DONE

  // Where the things out of an opened present land: a row over it.
  const slots = contents.map((_, i) => {
    const n = contents.length
    const spread = n <= 1 ? 0 : Math.min(150, 44 * (n - 1))
    return { x: Math.round(PRESENT_AT.x - spread / 2 + (n <= 1 ? 0 : (spread * i) / (n - 1))), y: 74 }
  })

  const burstOf = (s: PresentState, n: number, colors: string[], y: number, speed: number) => {
    for (let k = 0; k < n; k++) {
      const a = -Math.PI * s.r.range(0.05, 0.95)
      const sp = s.r.range(speed * 0.5, speed)
      s.fx.add({
        x: PRESENT_AT.x + s.r.range(-10, 10),
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        ay: 200,
        drag: 0.6,
        life: s.r.range(0.8, 1.3),
        size: s.r.int(2, 3),
        shape: 'sq',
        colors: [colors[k % colors.length]!],
      })
    }
  }

  return {
    id: `present-${p.mode}`,
    dur,
    hold: true,
    setup: () => ({ r: rng(61 + level * 7), fx: new Particles() }),
    step(s, t, dt) {
      s.fx.update(dt)
      const r = s.r
      const at = (t0: number) => t >= t0 && t - dt < t0
      const { bh, lw } = presentSize(p.mode === 'grow' ? to : level)
      // A boss's present sparkles now and then while it waits.
      if (boss && p.mode !== 'burst' && r() < 0.08)
        s.fx.add({
          x: PRESENT_AT.x + r.range(-lw * 0.7, lw * 0.7),
          y: PRESENT_AT.y - r.range(4, bh + 14),
          vy: -6,
          life: 0.7,
          shape: 'star',
          size: 1,
          colors: ['#ffffff', GOLD_L, GOLD],
        })
      if (p.mode === 'appear' && at(T_LAND))
        for (let k = 0; k < 10; k++)
          s.fx.add({
            x: PRESENT_AT.x + r.range(-lw / 2, lw / 2),
            y: PRESENT_AT.y - 1,
            vx: r.range(-40, 40),
            vy: -r.range(8, 26),
            ay: 60,
            life: 0.45,
            size: 2,
            shape: 'sq',
            colors: SNOW,
          })
      if (p.mode === 'grow' && at(G_SWELL)) {
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2
          s.fx.add({
            x: PRESENT_AT.x,
            y: PRESENT_AT.y - bh / 2,
            vx: Math.cos(a) * 60,
            vy: Math.sin(a) * 48,
            drag: 3,
            life: 0.5,
            shape: 'star',
            size: 1,
            colors: ['#ffffff', GOLD_L, GOLD],
          })
        }
        for (let k = 0; k < 6; k++)
          s.fx.add({
            x: PRESENT_AT.x + r.range(-lw / 2, lw / 2),
            y: PRESENT_AT.y - r.range(0, bh),
            vy: -r.range(20, 40),
            life: r.range(0.5, 0.8),
            delay: r.range(0, 0.15),
            shape: 'plus',
            size: 1,
            colors: [GOLD_L, GOLD],
          })
      }
      if (p.mode === 'break' || p.mode === 'burst') {
        // Bits of paper fly off at each rip.
        for (const tr of B_RIPS)
          if (at(tr))
            for (let k = 0; k < 4; k++)
              s.fx.add({
                x: PRESENT_AT.x + r.range(-lw / 2, lw / 2),
                y: PRESENT_AT.y - r.range(2, bh),
                vx: r.range(-30, 30),
                vy: -r.range(20, 50),
                ay: 160,
                life: 0.5,
                size: 1,
                shape: 'sq',
                colors: PAL[look].scraps,
              })
        if (at(B_POP)) {
          burstOf(s, boss ? 46 : 30, PAL[look].scraps, PRESENT_AT.y - bh / 2, boss ? 190 : 150)
          if (boss) burstOf(s, 20, CONFETTI, PRESENT_AT.y - bh / 2, 170)
          // The puff: dithered smoke, white then the paper's shade.
          for (let k = 0; k < 14; k++)
            s.fx.add({
              x: PRESENT_AT.x + r.range(-lw / 2, lw / 2),
              y: PRESENT_AT.y - r.range(0, bh),
              vx: r.range(-30, 30),
              vy: -r.range(10, 30),
              drag: 1.5,
              life: r.range(0.5, 0.8),
              size: 2,
              size1: 6,
              shape: 'smoke',
              colors: ['#ffffff', '#eaf3fa', '#cfe2f2'],
              density: 0.8,
            })
        }
        // A shiny's two rings of stars as it comes out.
        if (p.shiny && at(B_OUT))
          for (const R of [14, 24])
            for (let k = 0; k < 10; k++) {
              const a = (k / 10) * Math.PI * 2
              s.fx.add({
                x: PRESENT_AT.x,
                y: PRESENT_AT.y - 24,
                vx: Math.cos(a) * R * 2.2,
                vy: Math.sin(a) * R * 2.2,
                drag: 3,
                life: 0.55,
                delay: R === 24 ? 0.22 : 0,
                size: 2,
                shape: 'star',
                colors: ['#ffffff', '#fff6a8', '#ffe14d'],
              })
            }
      }
      if (p.mode === 'open') {
        if (at(O_UNTIE))
          for (let k = 0; k < 12; k++) {
            const a = -Math.PI * r.range(0.1, 0.9)
            const sp = r.range(50, 100)
            s.fx.add({
              x: PRESENT_AT.x + r.range(-4, 4),
              y: PRESENT_AT.y - presentSize(level).bh - presentSize(level).lh - 4,
              vx: Math.cos(a) * sp,
              vy: Math.sin(a) * sp,
              ay: 220,
              life: r.range(0.5, 0.8),
              size: r.int(1, 2),
              shape: 'sq',
              colors: [GOLD_L, GOLD, GOLD_D],
            })
          }
        if (at(O_POP)) burstOf(s, 26, CONFETTI, PRESENT_AT.y - presentSize(level).bh, 150)
        slots.forEach((pl, i) => {
          if (at(O_OUT[i]! + 0.3))
            for (let k = 0; k < 8; k++) {
              const a = (k / 8) * Math.PI * 2
              s.fx.add({
                x: pl.x,
                y: pl.y - 10,
                vx: Math.cos(a) * 44,
                vy: Math.sin(a) * 44,
                drag: 3.2,
                life: 0.45,
                size: 1,
                shape: 'star',
                colors: ['#ffffff', GOLD_L],
              })
            }
        })
      }
    },
    draw(g, s, t) {
      const rest = breathe(Math.max(0, t - dur), p.still)
      if (p.mode === 'appear' || p.mode === 'idle') {
        const fall = p.mode === 'appear' ? span(t, 0, T_LAND) : 1
        const drop = fall < 1 ? Math.round(-140 * (1 - ease.inC(fall))) : 0
        let sx = 1
        let sy = 1
        if (p.mode === 'appear' && within(t, T_LAND, T_LAND + 0.14)) {
          const q = Math.sin(Math.PI * span(t, T_LAND, T_LAND + 0.14))
          sx = 1 + 0.12 * q
          sy = 1 - 0.14 * q
        }
        // A boss's glow lights up once it has landed.
        if (boss && fall >= 1) drawGlow(g, level, t)
        drawShadow(g, level, fall)
        drawPresent(g, look, level, { sx, sy, dy: drop + (t >= dur ? rest : 0) })
        s.fx.draw(g)
        return
      }
      if (p.mode === 'grow') {
        // The crouch, the wobbles, the swell in three pixel steps from the old size to the new.
        let lv = level
        let sx = 1
        let sy = 1
        let ang = 0
        if (!short && within(t, 0, 0.1)) {
          const q = ease.outQ(span(t, 0, 0.1))
          sx = 1 + 0.08 * q
          sy = 1 - 0.1 * q
        }
        for (const w of WOBBLES)
          if (within(t, w, w + 0.14)) ang = Math.sin(span(t, w, w + 0.14) * Math.PI * 2) * 7
        const flash = within(t, G_SWELL - 2 * STEP, G_SWELL)
        if (t >= G_SWELL) {
          lv = to
          const q = span(t, G_SWELL, G_SWELL + 0.18)
          // Overshoot a little, settle back, in three steps.
          const k = q < 0.34 ? 1.12 : q < 0.67 ? 0.96 : 1
          sx = k
          sy = k
        }
        if (boss) drawGlow(g, lv, t)
        drawShadow(g, lv)
        drawPresent(g, look, lv, { sx, sy, ang, flash, dy: t >= dur ? rest : 0 })
        // A gold ring bursting out as it swells.
        const fq = span(t, G_SWELL, G_SWELL + 0.4)
        if (fq > 0 && fq < 1) {
          const R = Math.round(10 + 34 * ease.outC(fq))
          const cy = PRESENT_AT.y - presentSize(lv).bh / 2
          g.drawImage(ring(R, 2, GOLD_L, 1 - fq), PRESENT_AT.x - R - 1, Math.round(cy - R - 1))
        }
        s.fx.draw(g)
        if (within(t, G_SWELL, G_SWELL + 2 * STEP)) screenFlash(g, '#fff2b8', 0.2)
        return
      }
      if (p.mode === 'open') {
        const { bh, lh } = presentSize(level)
        const bodyTop = PRESENT_AT.y - bh
        drawShadow(g, level)
        if (t < O_POP) {
          // The bow springs loose; the lid sits loose, light leaking under it.
          const untied = t >= O_UNTIE
          const lift =
            untied && within(t, O_UNTIE, O_UNTIE + 0.2)
              ? Math.round(Math.sin(Math.PI * span(t, O_UNTIE, O_UNTIE + 0.2)) * 3)
              : 0
          drawPresent(g, look, level, { bow: !untied, dy: -lift })
          if (untied && Math.floor(t * 12) % 2) rect(g, PRESENT_AT.x - 10, bodyTop - 1, 20, 1, '#fff2b8')
        } else {
          // Open: the light from inside, the body, the lid flying away.
          g.drawImage(glow(36, '#fff2b8', 1.4, 0.5), PRESENT_AT.x - 36, bodyTop - 30)
          const body = presentArt(look, level, 0, false)
          // The body alone: the art without its lid (cut below the lid's height).
          const cut = body.height - bh - 1
          g.drawImage(
            body,
            0,
            cut,
            body.width,
            bh + 1,
            PRESENT_AT.x - (body.width >> 1),
            bodyTop,
            body.width,
            bh + 1,
          )
          rect(g, PRESENT_AT.x - (body.width >> 1) + 2, bodyTop, body.width - 4, 2, '#3a1420')
          const lt = t - O_POP
          if (lt < 0.8) {
            g.save()
            g.translate(PRESENT_AT.x + 60 * lt, bodyTop - lh - 4 - 300 * lt + 220 * lt * lt)
            g.rotate(lt * 7)
            g.drawImage(body, 0, 0, body.width, lh + 1, -(body.width >> 1), -(lh >> 1), body.width, lh + 1)
            g.restore()
            const q = span(t, O_POP, O_POP + 0.5)
            const R = Math.round(8 + 60 * ease.outC(q))
            if (q < 1) g.drawImage(ring(R, 3, '#ffffff', 1 - q), PRESENT_AT.x - R - 1, bodyTop - 6 - R - 1)
          }
          slots.forEach((pl, i) => {
            const t0 = O_OUT[i]!
            if (t < t0) return
            const u = ease.outBack(span(t, t0, t0 + 0.4), 1.6)
            const x = Math.round(PRESENT_AT.x + (pl.x - PRESENT_AT.x) * u)
            const y = Math.round(bodyTop + (pl.y - bodyTop) * u)
            const bob = t > O_DONE ? breathe(t - O_DONE + i * 0.3, p.still) : 0
            const c = contents[i]!
            if (c.kind === 'gold') {
              const coins = coinsArt()
              g.drawImage(
                coins,
                x - coins.width,
                y + bob - coins.height * 2,
                coins.width * 2,
                coins.height * 2,
              )
            } else if (spriteFrame(c.key))
              drawSprite(g, c.key, x, y + bob, { sx: 2, sy: 2, flash: 1 - span(t, t0 + 0.05, t0 + 0.4) })
            else g.drawImage(glow(10, GOLD_L, 1.4, 0.9), x - 10, y - 20 + bob)
          })
          // More than four things: the last slot says how many in all.
          const more = (p.contents?.length ?? 0) - contents.length
          if (more > 0 && t >= O_DONE - 0.3) {
            const label = `+${more}`
            text(g, label, PRESENT_AT.x + 64 - Math.round(textWidth(label, 2) / 2), 40, '#ffffff', INK, 2)
          }
        }
        s.fx.draw(g)
        if (within(t, O_POP, O_POP + 0.3)) screenFlash(g, '#ffffff', 0.7 * (1 - span(t, O_POP, O_POP + 0.3)))
        return
      }
      // Break / burst.
      const sh = screenShake(t, [[B_POP, 0.3, boss ? 3 : 2]])
      g.save()
      g.translate(sh.x, sh.y)
      if (t < B_POP) {
        // The strain: it shakes, harder and harder, swells a little, and rips.
        const q = span(t, 0, B_STRAIN)
        const amp = Math.round(1 + q * (boss ? 4 : 3))
        const dx = Math.floor(t * 30) % 2 ? amp : -amp
        const tears = B_RIPS.filter((x) => t >= x).length
        const k = 1 + 0.06 * Math.floor(q * 3)
        if (boss) drawGlow(g, level, t, 1 + q * 0.4)
        drawShadow(g, level)
        // The hit-stop: the last four frames hold, white.
        drawPresent(g, look, level, { dx, sx: k, sy: k, tears, flash: t >= B_STRAIN })
      } else {
        // Burst: the Pokémon pops out, two white frames as it lands, then it stands there.
        const u = ease.outBack(span(t, B_POP + 0.1, B_OUT), 1.8)
        if (t >= B_POP + 0.1 && p.mon && spriteFrame(p.mon)) {
          const k = Math.max(0.05, u)
          const flash = t < B_OUT + 2 * STEP ? 1 - span(t, B_OUT - 0.05, B_OUT + 2 * STEP) : 0
          softEllipse(g, PRESENT_AT.x, PRESENT_AT.y + 1, 16, 4, '#00000055', 0.6)
          drawSprite(g, p.mon, PRESENT_AT.x, PRESENT_AT.y + (t > dur ? rest : 0), { sx: k, sy: k, flash })
        }
        const q = span(t, B_POP, B_POP + 0.5)
        if (q < 1) {
          const R = Math.round(10 + (boss ? 90 : 60) * ease.outC(q))
          g.drawImage(
            ring(R, 3, boss ? GOLD_L : '#ffffff', 1 - q),
            PRESENT_AT.x - R - 1,
            PRESENT_AT.y - 20 - R - 1,
          )
        }
      }
      s.fx.draw(g)
      g.restore()
      if (within(t, B_POP, B_POP + 0.3))
        screenFlash(g, boss ? '#fff2b8' : '#ffffff', 0.85 * (1 - span(t, B_POP, B_POP + 0.3)))
    },
    cues: () => {
      const c: Cue<PresentState>[] = []
      if (p.mode === 'appear') c.push([T_LAND, () => fxSound('present.land')])
      if (p.mode === 'grow') {
        for (const w of WOBBLES) c.push([w, () => fxSound('present.wobble')])
        c.push([G_SWELL, (hud) => (fxSound('present.grow', to), hud.beat?.('grown'))])
      }
      if (p.mode === 'break' || p.mode === 'burst') {
        c.push([0, () => fxSound('present.strain')])
        for (const tr of B_RIPS) c.push([tr, () => fxSound('present.rip')])
        c.push([B_POP, (hud) => (fxSound(boss ? 'present.burst' : 'present.break'), hud.beat?.('broke'))])
        c.push([B_OUT, (hud) => hud.beat?.('out')])
      }
      if (p.mode === 'open') {
        c.push([O_UNTIE, () => fxSound('present.untie')])
        c.push([O_POP, () => fxSound('present.open')])
        O_OUT.forEach((t0, i) => c.push([t0, () => fxSound('present.item', i)]))
        c.push([O_DONE - 0.1, (hud) => hud.beat?.('opened')])
      }
      return c.sort((a, b) => a[0] - b[0])
    },
  }
}
