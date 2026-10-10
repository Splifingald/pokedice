// Picking a partner (a new game, a new region): in the professor's lab, three Poké Balls drop from above onto the
// table; tap one and the Pokémon inside comes out; say yes and the other two fly home while it celebrates. The scene is
// driven from taps by the screen (StarterScene), and scripted for /kitchen-sink/fx (starterTimeline). Ported from the
// Visual Lab's anims.js.
import { fxSound } from '@/audio/sfx'
import {
  bayer,
  cached,
  canvas,
  ditherFill,
  ease,
  ellipse,
  glow,
  icon,
  label,
  labelWidth,
  lerp,
  Particles,
  px,
  rect,
  ring,
  rng,
  softEllipse,
  span,
  wash,
  type Canvas,
  type G,
  type Rng,
} from '../pixel'
import { ball } from '../scenes'
import { drawSprite, type SpriteLook } from '../sprites'
import { H, shakeAt, W, type Timeline } from '../timeline'

/** The lab's colours: its back wall, the lower wall, the floor's two tiles. */
export interface LabColors {
  wall: string
  low: string
  floorA: string
  floorB: string
}

const LABS: Record<string, LabColors> = {
  kanto: { wall: '#f3ecda', low: '#e6dcc4', floorA: '#f4f1ea', floorB: '#e8e2d4' },
  johto: { wall: '#e2f0ea', low: '#cfe3da', floorA: '#eef4f2', floorB: '#e0eae6' },
  hoenn: { wall: '#e4ecf8', low: '#d2deef', floorA: '#f0f4fa', floorB: '#e2e9f4' },
  sinnoh: { wall: '#ece6f6', low: '#ddd4ee', floorA: '#f4f1f9', floorB: '#e8e2f1' },
}
/** A region's lab: its own colours, or Johto's mint. */
export const labColors = (region: string): LabColors => LABS[region] ?? LABS.johto!

/** The three balls' resting places on the table, in stage pixels. */
export const STARTER_SLOTS = [60, 120, 180] as const

/**
 * The professor's lab: a bright back wall with a window, shelves and machines at the edges, a tiled floor, and the
 * long white table across the front where the three balls land on their cradles. The same picture for every region,
 * in the region's wall colour.
 */
export function labBackground(L: LabColors): Canvas {
  return cached(`lab-bg|${L.wall}`, () => {
    const r = rng(L.wall.length * 31 + L.wall.charCodeAt(1))
    const c = canvas(W, H)
    const g = c.g
    // Ceiling with two light panels, the wall, a rail, the lower wall.
    rect(g, 0, 0, W, 11, '#cdd7e6')
    for (const x of [36, 146]) {
      rect(g, x, 3, 58, 5, '#ffffff')
      rect(g, x, 8, 58, 1, '#e8eef7')
    }
    rect(g, 0, 11, W, 1, '#b6c3d9')
    rect(g, 0, 12, W, 62, L.wall)
    ditherFill(g, 0, 12, W, 8, '#24304f', 0.06)
    rect(g, 0, 74, W, 2, '#b6c3d9')
    rect(g, 0, 76, W, 18, L.low)
    rect(g, 0, 93, W, 1, '#b6c3d9')
    // The window: morning sky, a cloud, the frame and its cross.
    const wx = 72
    const wy = 20
    const ww = 62
    const wh = 44
    rect(g, wx - 3, wy - 3, ww + 6, wh + 6, '#9aa8c0')
    for (let y = 0; y < wh; y++)
      for (let x = 0; x < ww; x++)
        px(g, wx + x, wy + y, y / wh > bayer(x, y) * 0.9 + 0.1 ? '#d8ecff' : '#a9d3ff')
    ellipse(g, wx + 20, wy + 14, 9, 3, '#ffffff')
    ellipse(g, wx + 44, wy + 26, 7, 2, '#f4f9ff')
    rect(g, wx + ww / 2 - 1, wy, 2, wh, '#9aa8c0')
    rect(g, wx, wy + wh / 2 - 1, ww, 2, '#9aa8c0')
    rect(g, wx - 5, wy + wh + 3, ww + 10, 3, '#b6c3d9')
    // Bookshelves at the left edge.
    rect(g, 3, 16, 44, 78, '#7a5032')
    rect(g, 5, 18, 40, 74, '#a0704a')
    const SPINES = ['#f2553f', '#5b8def', '#34c97a', '#ffbe2e', '#a77bff', '#ff8fb0', '#4ac7d7', '#e8e0c8']
    for (const sy of [34, 52, 70, 90]) {
      rect(g, 5, sy, 40, 2, '#7a5032')
      let x = 6
      while (x < 43) {
        const w = r.int(2, 3)
        const h = r.int(10, 14)
        if (r() < 0.12) {
          x += 3
          continue
        }
        rect(g, x, sy - h, w, h, SPINES[r.int(0, SPINES.length - 1)]!)
        rect(g, x, sy - h, w, 1, '#ffffff55')
        x += w
      }
    }
    // Research machines at the right edge: a tall cabinet with lights, a desk computer.
    rect(g, 196, 18, 40, 76, '#8e9ab0')
    rect(g, 198, 20, 36, 72, '#b8c2d4')
    for (let k = 0; k < 5; k++) {
      rect(g, 202, 26 + k * 13, 28, 9, '#9aa6bc')
      for (let q = 0; q < 4; q++)
        px(g, 205 + q * 6, 30 + k * 13, ['#34c97a', '#ffbe2e', '#f2553f', '#5b8def'][(k + q) % 4]!)
    }
    rect(g, 150, 56, 40, 4, '#9aa8c0')
    rect(g, 156, 30, 30, 22, '#5a6680')
    rect(g, 158, 32, 26, 18, '#24304f')
    for (let k = 0; k < 4; k++) rect(g, 161, 35 + k * 4, 8 + ((k * 7) % 12), 1, '#7cf07a')
    rect(g, 168, 52, 6, 4, '#5a6680')
    rect(g, 152, 60, 36, 34, '#c8d2e2')
    rect(g, 152, 60, 36, 2, '#e8eef7')
    // Potted plants in the corners of the floor.
    for (const [x, k] of [
      [52, 1],
      [190, -1],
    ] as const) {
      rect(g, x - 5, 84, 10, 10, '#c8784a')
      rect(g, x - 5, 84, 10, 2, '#e09a68')
      ellipse(g, x, 78, 8, 7, '#3f8a46')
      ellipse(g, x - 3 * k, 74, 5, 5, '#5fb45a')
      px(g, x + 2 * k, 72, '#8fd68a')
    }
    // The tiled floor.
    for (let y = 94; y < H; y++)
      for (let x = 0; x < W; x++) {
        const row = Math.floor((y - 94) / 9)
        const col = Math.floor((x + row * 8) / 16)
        const grout = (y - 94) % 9 === 8 || (x + row * 8) % 16 === 15
        px(g, x, y, grout ? '#c8d2e2' : (row + col) % 2 ? L.floorA : L.floorB)
      }
    // The window's light on the floor, a dithered band slanting down to the right.
    for (let y = 94; y < 128; y++) ditherFill(g, wx + (y - 94) * 0.9, y, ww + 10, 1, '#ffffff', 0.2)
    // The table: its shadow on the floor, legs, the white top seen from a little above, its front edge.
    ditherFill(g, 18, 134, 204, 26, '#24304f', 0.12)
    for (const x of [22, 70, 168, 216]) {
      rect(g, x, 134, 4, 26, '#9aa6bc')
      rect(g, x, 134, 1, 26, '#c8d2e2')
    }
    rect(g, 12, 111, 216, 1, '#b6c3d9')
    rect(g, 12, 112, 216, 17, '#fbfdff')
    rect(g, 12, 112, 216, 1, '#ffffff')
    ditherFill(g, 12, 121, 216, 8, '#dfe7f2', 0.5)
    rect(g, 10, 129, 220, 6, '#b6c3d9')
    rect(g, 10, 129, 220, 1, '#dfe7f2')
    rect(g, 10, 134, 220, 1, '#8592ad')
    // Three cradles, gold-rimmed, where the balls come to rest.
    for (const x of STARTER_SLOTS) {
      ellipse(g, x, 127, 12, 3, '#e8b44a')
      ellipse(g, x, 127, 10, 2, '#ffe7a8')
    }
    // A few things on the table ends: papers, a beaker.
    rect(g, 22, 116, 14, 8, '#ffffff')
    rect(g, 24, 115, 14, 8, '#f4f7fb')
    rect(g, 26, 117, 9, 1, '#b6c3d9')
    rect(g, 26, 119, 7, 1, '#b6c3d9')
    rect(g, 210, 108, 7, 12, '#c8e8f8')
    rect(g, 210, 114, 7, 6, '#7cc4f0')
    rect(g, 209, 107, 9, 1, '#9aa8c0')
    return c
  })
}

/** A small down arrow over the ball in focus. */
const CURSOR = ['kkkkkkk', 'kwwwwwk', '.kwwwk.', '..kwk..', '...k...']

interface Slot {
  x: number
  y: number
  /** When it starts to fall. */
  t0: number
  openAt: number | null
  closeAt: number | null
}

export interface StarterSceneOptions {
  /** The lab's colours (`labColors(region)`). */
  lab: LabColors
  /** The three sprite keys (front views), in slot order. */
  mons: readonly string[]
  /** The ribbon: "WELCOME TO" and the region's name, in the player's language. Null: no ribbon. */
  ribbon: { welcome: string; region: string } | null
  /** Animations off: the balls are already on the table. */
  instant?: boolean
}

/**
 * The scene itself: where the balls are, what is open, what was chosen. The screen calls `openBall`, `closeBall` and
 * `choose` from taps, `step` and `draw` every frame, and reads `landed` to know when the balls can be tapped.
 */
export class StarterScene {
  readonly slots: Slot[]
  readonly landed: number
  focus = -1
  open = -1
  chosen = -1
  chosenAt: number | null = null
  private readonly r: Rng
  private readonly fx = new Particles()
  private readonly bg: Canvas
  private readonly cursor: Canvas
  private readonly shakes: [number, number, number][] = []
  private readonly done = new Set<string>()

  constructor(private readonly o: StarterSceneOptions) {
    this.r = rng(83)
    this.bg = labBackground(o.lab)
    this.cursor = icon(CURSOR, { k: '#24304f', w: '#ffffff' }, 1)
    this.slots = STARTER_SLOTS.map((x, i) => ({ x, y: 120, t0: 0.8 + i * 0.32, openAt: null, closeAt: null }))
    this.landed = o.instant ? 0 : this.slots[2]!.t0 + 0.55 + 0.45
  }

  /** A tap during the drop: the screen jumps its clock to `landed`; the landings' dust is skipped. */
  land() {
    for (const k of ['drop', 'l0', 'l1', 'l2', 'b0', 'b1', 'b2']) this.done.add(k)
  }

  /** Ball i's position and spin at time t: the fall, two bounces, then an idle wobble now and then. */
  private ball(i: number, t: number): { x: number; y: number; a: number; on: boolean; falling?: number } {
    const s = this.slots[i]!
    if (this.o.instant) return { x: s.x, y: s.y, a: this.wobble(i, t), on: true }
    const tl = s.t0 + 0.55
    if (t < s.t0) return { x: s.x, y: -30, a: 0, on: false }
    if (t < tl) {
      const p = ease.inQ(span(t, s.t0, tl))
      return {
        x: s.x + Math.round((1 - p) * (i - 1) * 10),
        y: Math.round(lerp(-16, s.y, p)),
        a: t * 14,
        on: true,
        falling: p,
      }
    }
    const b1 = span(t, tl, tl + 0.26)
    const b2 = span(t, tl + 0.26, tl + 0.4)
    const y =
      b1 < 1
        ? s.y - Math.round(Math.sin(Math.PI * b1) * 9)
        : b2 < 1
          ? s.y - Math.round(Math.sin(Math.PI * b2) * 3)
          : s.y
    return { x: s.x, y, a: b2 < 1 ? (1 - b1) * 0.6 : this.wobble(i, t), on: true }
  }

  private wobble(i: number, t: number) {
    if (this.open === i || this.chosen >= 0) return 0
    const p = (t + i * 0.7) % 2.6
    return p < 0.5 ? Math.sin((p / 0.5) * Math.PI * 2) * 0.22 : 0
  }

  openBall(i: number, t: number) {
    if (this.open >= 0) this.closeBall(this.open, t)
    this.open = i
    Object.assign(this.slots[i]!, { openAt: t, closeAt: null })
    fxSound('starter.open')
  }

  closeBall(i: number, t: number) {
    this.slots[i]!.closeAt = t
    if (this.open === i) this.open = -1
  }

  choose(i: number, t: number) {
    this.chosen = i
    this.chosenAt = t
    ;[0, 1, 2, 3].forEach((n) => setTimeout(() => fxSound('starter.fanfare', n), n * 110))
  }

  step(t: number, dt: number) {
    this.fx.update(dt)
    const r = this.r
    // The whistle of the first ball falling, once.
    if (!this.o.instant && t >= this.slots[0]!.t0 && !this.done.has('drop')) {
      this.done.add('drop')
      fxSound('starter.drop')
    }
    // Dust where a ball lands, once per bounce.
    this.slots.forEach((s, i) => {
      if (this.o.instant) return
      for (const [k, at, n] of [
        [`l${i}`, s.t0 + 0.55, 10],
        [`b${i}`, s.t0 + 0.55 + 0.26, 4],
      ] as const)
        if (t >= at && !this.done.has(k)) {
          this.done.add(k)
          if (k[0] === 'l') {
            this.shakes.push([at, 0.16, 1])
            fxSound('starter.land')
          }
          for (let q = 0; q < n; q++)
            this.fx.add({
              x: s.x + r.range(-6, 6),
              y: s.y + 5,
              vx: r.range(-30, 30),
              vy: r.range(-22, -4),
              ay: 40,
              drag: 2,
              life: r.range(0.3, 0.5),
              size: r.int(1, 2),
              shape: 'sq',
              colors: ['#ffffff', '#e8f0d8', '#c8d8b0'],
            })
        }
    })
    // A burst of light when a ball opens.
    this.slots.forEach((s, i) => {
      const k = `o${i}:${s.openAt}`
      if (s.openAt != null && t >= s.openAt && !this.done.has(k)) {
        this.done.add(k)
        for (let q = 0; q < 22; q++) {
          const a = r() * Math.PI * 2
          const sp = r.range(30, 90)
          this.fx.add({
            x: s.x,
            y: s.y - 8,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp - 10,
            drag: 3,
            life: r.range(0.35, 0.6),
            size: r.int(1, 2),
            shape: q % 3 ? 'sq' : 'star',
            colors: ['#ffffff', '#fff6b8', '#ffd0d0'],
          })
        }
      }
    })
    // The choice: stars in every colour, then hearts floating up for a while.
    if (this.chosenAt != null) {
      const c = this.slots[this.chosen]!
      if (!this.done.has('yes')) {
        this.done.add('yes')
        for (let q = 0; q < 40; q++) {
          const a = r() * Math.PI * 2
          const sp = r.range(40, 130)
          this.fx.add({
            x: c.x,
            y: c.y - 24,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp - 30,
            ay: 120,
            drag: 1.5,
            life: r.range(0.7, 1.2),
            size: r.int(1, 2),
            shape: q % 2 ? 'star' : 'sq',
            colors: ['#ffffff', ['#ff6b8f', '#ffd23a', '#7cf07a', '#4ad7ff', '#a77bff'][q % 5]!],
          })
        }
      }
      if (t > this.chosenAt + 0.3 && r() < 0.06)
        this.fx.add({
          x: c.x + r.range(-12, 12),
          y: c.y - 30,
          vy: -18,
          life: 1.1,
          shape: 'heart',
          size: 1,
          colors: ['#ff6b8f', '#ff9ab5'],
        })
    }
  }

  draw(g: G, t: number) {
    const sh = shakeAt(t, this.shakes)
    g.save()
    g.translate(sh.x, sh.y)
    g.drawImage(this.bg, 0, 0)
    // The region's name, in on a ribbon, then away as the balls fall.
    const rib = this.o.ribbon
    if (rib && !this.o.instant) {
      const pin = ease.outBack(span(t, 0.15, 0.55), 1.6)
      const pout = ease.inQ(span(t, 1.9, 2.3))
      const y = Math.round(-26 + 40 * pin - 46 * pout)
      if (pout < 1) {
        const w = Math.max(labelWidth(g, rib.region, 2), labelWidth(g, rib.welcome)) + 24
        rect(g, 120 - w / 2, y - 3, w, 29, '#24304f')
        rect(g, 120 - w / 2 + 2, y - 1, w - 4, 25, '#fbfdff')
        rect(g, 120 - w / 2 + 2, y + 20, w - 4, 4, '#ffe7a8')
        label(g, rib.welcome, 120 - labelWidth(g, rib.welcome) / 2, y + 1, '#5c6a8a')
        label(g, rib.region, 120 - labelWidth(g, rib.region, 2) / 2, y + 9, '#f2553f', null, 2)
      }
    }
    this.slots.forEach((s, i) => {
      const b = this.ball(i, t)
      if (!b.on) return
      // A shadow that firms up as the ball comes down.
      const k = b.falling ?? 1
      softEllipse(g, s.x, s.y + 6, Math.round(3 + 5 * k), 2, '#24304f', 0.25 + 0.3 * k, 0.8)
      // The Pokémon, when its ball is open (or was chosen).
      const out = this.monOut(i, t)
      if (out) {
        const hop =
          this.chosen === i
            ? Math.round(
                Math.abs(Math.sin(span(t, this.chosenAt! + 0.1, this.chosenAt! + 0.9) * Math.PI * 2)) * 6,
              )
            : 0
        drawSprite(g, this.o.mons[i]!, s.x, s.y + 6 - hop, out)
      }
      // Gone: the other two fly back up once the choice is made.
      let by = b.y
      let ba = b.a
      if (this.chosen >= 0 && this.chosen !== i) {
        const p = span(t, this.chosenAt! + 0.5, this.chosenAt! + 1.2)
        if (p >= 1) return
        by = Math.round(b.y - ease.inQ(p) * 150)
        ba = p * 12
        if (p > 0) g.drawImage(glow(8, '#ffffff', 1.5, 0.5 * (1 - p)), s.x - 8, by - 8)
      }
      const open = this.lid(i, t)
      const dim = (this.open >= 0 && this.open !== i) || (this.chosen >= 0 && this.chosen !== i) ? 0.5 : 0
      const focus = this.focus === i && this.open < 0 && this.chosen < 0 && t >= this.landed
      if (focus) g.drawImage(glow(13, '#fff6b8', 1.4, 0.6 + 0.2 * Math.sin(t * 8)), s.x - 13, by - 13)
      if (b.falling != null && b.falling < 0.95) {
        // Two ghosts above it while it falls.
        for (const [dy, d] of [
          [-10, 0.75],
          [-20, 0.9],
        ] as const) {
          const gb = ball('poke', ba - 0.4, { R: 6, dim: d })
          g.globalAlpha = 0.35
          g.drawImage(gb, Math.round(b.x - (gb.width - 1) / 2), Math.round(by + dy - (gb.height - 1) / 2))
          g.globalAlpha = 1
        }
      }
      // An open ball rolls aside, smaller, so its Pokémon stands clear of it; it rolls back when it goes in.
      const ak = this.aside(i, t)
      const bc = ball('poke', ba + ak * 0.6, {
        R: 7 - Math.round(2 * ak),
        open,
        dim,
        button: focus && Math.floor(t * 4) % 2 ? '#ffe14d' : '#ffffff',
      })
      g.drawImage(
        bc,
        Math.round(b.x + 20 * ak - (bc.width - 1) / 2),
        Math.round(by + 7 * ak - (bc.height - 1) / 2),
      )
      if (focus) g.drawImage(this.cursor, s.x - 3, by - 22 - Math.round(Math.abs(Math.sin(t * 5)) * 3))
    })
    // The light of an opening: a ring and a glow.
    this.slots.forEach((s) => {
      if (s.openAt == null) return
      const p = span(t, s.openAt, s.openAt + 0.45)
      if (p > 0 && p < 1) {
        const R = Math.round(6 + 26 * ease.outC(p))
        g.drawImage(ring(R, 2, '#ffffff', 1 - p), s.x - R - 1, s.y - 10 - R - 1)
      }
    })
    this.fx.draw(g)
    g.restore()
  }

  /** How the Pokémon of ball i looks now, or null: popping out in white, standing, or being called back in red. */
  private monOut(i: number, t: number): SpriteLook | null {
    const s = this.slots[i]!
    if (this.chosen === i) return {}
    if (s.openAt == null || t < s.openAt + 0.08) return null
    if (s.closeAt != null && t >= s.closeAt) {
      const p = span(t, s.closeAt, s.closeAt + 0.3)
      if (p >= 1) return null
      return { sil: '#ff5f6f', sx: 1 - p * 0.9, sy: 1 - p * 0.9 }
    }
    const p = span(t, s.openAt + 0.08, s.openAt + 0.4)
    const k = ease.outBack(p, 1.8)
    return { sx: k, sy: k, flash: 1 - span(t, s.openAt + 0.2, s.openAt + 0.55) }
  }

  /** 0 where the ball landed, 1 rolled aside while its Pokémon is out. */
  private aside(i: number, t: number) {
    const s = this.slots[i]!
    if (this.chosen === i) return 1
    if (s.openAt == null || t < s.openAt) return 0
    if (s.closeAt != null && t >= s.closeAt) return 1 - ease.ioQ(span(t, s.closeAt, s.closeAt + 0.25))
    return ease.ioQ(span(t, s.openAt + 0.05, s.openAt + 0.35))
  }

  /** The lid: swings open with the Pokémon, shuts when it goes back in. */
  private lid(i: number, t: number) {
    const s = this.slots[i]!
    if (s.openAt == null || t < s.openAt) return 0
    if (this.chosen === i) return 1
    if (s.closeAt != null && t >= s.closeAt) return 1 - span(t, s.closeAt + 0.2, s.closeAt + 0.35)
    return span(t, s.openAt, s.openAt + 0.15)
  }
}

/**
 * The scene scripted for /kitchen-sink/fx: the drop, a look along the balls, the one picked opened, yes. Beats:
 * 'choose' (the balls can be tapped), 'ask', 'yes', 'partner'.
 */
export function starterTimeline(p: StarterSceneOptions & { pick: number }): Timeline<StarterScene> {
  const T_CHOOSE = 2.45
  const T_TAP = 3.6 + p.pick * 0.35
  const T_ASK = T_TAP + 0.6
  const T_YES = T_ASK + 1.9
  const T_DONE = T_YES + 0.5
  return {
    id: 'starter',
    dur: T_YES + 3.4,
    setup: () => new StarterScene(p),
    step(s, t, dt) {
      // The script a player would follow: look at the balls left to right, open the one picked, say yes.
      if (t >= T_CHOOSE && t < T_TAP) s.focus = Math.min(p.pick, Math.floor((t - T_CHOOSE) / 0.35))
      if (t >= T_TAP && s.open < 0 && s.chosen < 0) s.openBall(p.pick, T_TAP)
      if (t >= T_YES && s.chosen < 0) s.choose(p.pick, T_YES)
      s.step(t, dt)
    },
    draw(g, s, t) {
      s.draw(g, t)
      if (t < 0.4) wash(g, '#ffffff', 1 - span(t, 0, 0.4))
    },
    cues: () => [
      [T_CHOOSE, (hud) => hud.beat?.('choose')],
      [T_ASK, (hud) => hud.beat?.('ask')],
      [T_YES, (hud) => hud.beat?.('yes')],
      [T_DONE, (hud) => hud.beat?.('partner')],
    ],
  }
}
