// A trade (docs/23 §2), the way the games play it, in three acts joined by their block wipe:
// 1. Sending: your Pokémon says goodbye on the link pad, is drawn into its ball, and the ball shoots up and away.
// 2. The link: your ball and the other trainer's come out of the gates at either end of a cable of light, braid along
//    it and cross in the middle with a flash, then go through the far gates.
// 3. Arriving: the other ball comes down a beam onto your pad, bounces, wobbles and opens on the newcomer.
// Beats for the host: 'sending', 'bye' (your Pokémon's cry), 'incoming', 'out' (the newcomer's cry), 'care'. Like the
// other moments it plays in full whatever the motion setting short; only "off" skips it.
import { fxSound } from '@/audio/sfx'
import {
  bayer,
  cached,
  clamp,
  ditherFill,
  ease,
  ellipse,
  ellipseLine,
  glow,
  lerp,
  line,
  Particles,
  px,
  rect,
  ring,
  rng,
  shade,
  softEllipse,
  span,
  wash,
  type Canvas,
  type G,
  type Rng,
} from '../pixel'
import { ball, type BallKind } from '../scenes'
import { drawSprite, spriteSize } from '../sprites'
import { H, screenFlash, screenShake, STEP, W, within, type Cue, type Timeline } from '../timeline'

export interface TradeParams {
  /** Front sprite keys: the Pokémon that leaves, and the one that arrives (its shiny one for a shiny). */
  give: string
  get: string
  giveBall: BallKind
  getBall: BallKind
  shiny?: boolean
}

interface TradeState {
  r: Rng
  /** Over everything. */
  fx: Particles
  /** Behind the Pokémon and the balls. */
  under: Particles
}

/** The link's light; your ball's (the recall's red) and theirs (a gift's gold); a shiny's. */
const LINK = ['#ffffff', '#c8f0ff', '#7cc8f0', '#3a7be0'] as const
const ROSE = ['#ffffff', '#ffd0d8', '#ff8aa0', '#e0405c'] as const
const GOLD = ['#ffffff', '#fff2b0', '#ffd23a', '#e89a10'] as const
const SHINY = ['#ffffff', '#fff6a8', '#ffe14d', '#f0a000'] as const
const NIGHT = '#0b1230'

/** The pad your Pokémon stands on (its feet), the horizon behind it, a ball's radius and where one rests. */
const PAD = { x: 120, y: 122 }
const HORIZON = 104
const R = 7
const REST = PAD.y - R - 1
/** The cable of light across act 2, and its two gates: yours on the left, theirs on the right. */
const TUBE_Y = 78
const GATE_L = 10
const GATE_R = W - 10
const SWAY = 6

// Act 1: sending.
const T_BYE = 0.3
const T_RECALL = 0.95
const T_IN = 1.55
const T_UP = 1.8
const T_GONE = 2.08
// The wipe into act 2 covers the screen at T_CUT1; act 2 runs until the wipe into act 3 covers it at T_CUT2.
const WIPE = 0.25
const T_CUT1 = 2.25
// Act 2: the link. The clock holds still for STOP at the crossing (the hit-stop).
const T_ENTER = 2.42
const T_CROSS = 3.42
const STOP = 0.08
const T_ARRIVE = T_ENTER + 2 * (T_CROSS - T_ENTER) + STOP
const T_CUT2 = T_ARRIVE + 0.1
// Act 3: arriving.
const T_BEAM = T_CUT2 + 0.12
const T_DOWN = T_BEAM + 0.24
const T_LAND = T_DOWN + 0.46
const T_OPEN = T_LAND + 0.62
const T_SHINY = T_OPEN + 0.28
const T_CARE = T_OPEN + 0.5
const DUR = T_CARE + 1.1

/** Whether this step went past T. */
const passed = (t: number, dt: number, T: number) => t >= T && t - dt < T

/** Ordered-dithered bands between a list of colours, t in 0..1. */
function bands(cols: readonly string[], t: number, x: number, y: number): string {
  const f = clamp(t) * (cols.length - 1)
  const i = Math.min(cols.length - 2, Math.floor(f))
  return f - i > bayer(x, y) ? cols[i + 1]! : cols[i]!
}

/** A star field: small pixels, a few with arms. */
function stars(g: G, r: Rng, n: number, top: number, bottom: number) {
  for (let i = 0; i < n; i++)
    px(
      g,
      r.int(2, W - 3),
      Math.floor(top + Math.pow(r(), 1.5) * (bottom - top)),
      r() < 0.35 ? LINK[1] : '#ffffff',
    )
  for (let i = 0; i < 5; i++) {
    const x = r.int(12, W - 12)
    const y = r.int(top + 4, top + (bottom - top) * 0.6)
    rect(g, x - 1, y, 3, 1, LINK[2])
    rect(g, x, y - 1, 1, 3, LINK[2])
    px(g, x, y, '#ffffff')
  }
}

/** Acts 1 and 3: a night sky, the floor's markings, and the link pad. */
function roomBg(): Canvas {
  return cached('trade|room', () => {
    const r = rng(29)
    const c = shade(W, H, (x, y) =>
      y < HORIZON
        ? bands(['#0b1230', '#111b44', '#1b2b63', '#2a4187', '#4261ae'], y / HORIZON, x, y)
        : bands(['#3a56a4', '#28407f', '#1c2d62', '#131f4a'], (y - HORIZON) / (H - HORIZON), x, y),
    )
    const g = c.g
    stars(g, r, 44, 2, HORIZON - 18)
    g.drawImage(glow(90, '#5f8fe0', 1.8, 0.3), PAD.x - 90, HORIZON - 90)
    rect(g, 0, HORIZON, W, 1, '#6f93dc')
    // The floor's markings, in perspective.
    ellipseLine(g, PAD.x, PAD.y + 5, 112, 24, '#33509c')
    ellipseLine(g, PAD.x, PAD.y + 5, 84, 17, '#3a5aa8')
    for (const d of [-1, 1]) line(g, PAD.x + d * 60, HORIZON + 2, PAD.x + d * 150, H, '#2b4589')
    // The pad: a dark side, the top, a lit middle and a rim of light along its far edge.
    ellipse(g, PAD.x, PAD.y + 5, 50, 12, '#0f1840')
    ellipse(g, PAD.x, PAD.y + 3, 50, 12, '#1f3272')
    ellipse(g, PAD.x, PAD.y, 50, 12, '#3b5aab')
    ellipse(g, PAD.x, PAD.y, 44, 10, '#4a6cc0')
    softEllipse(g, PAD.x, PAD.y, 38, 8, '#86acef', 0.65, 1)
    ellipseLine(g, PAD.x, PAD.y, 50, 12, '#a8c6ff', Math.PI, Math.PI * 2)
    ellipseLine(g, PAD.x, PAD.y + 3, 50, 12, '#0b1230', 0, Math.PI)
    return c
  })
}

/** The ring on the pad, lit while a ball works on it (k 0..1). */
function padRing(g: G, cols: readonly string[], k: number) {
  if (k <= 0) return
  softEllipse(g, PAD.x, PAD.y, 40, 9, cols[2]!, 0.55 * k, 1)
  ellipseLine(g, PAD.x, PAD.y, 32, 7, k > 0.5 ? cols[0]! : cols[1]!)
  if (k > 0.3) ellipseLine(g, PAD.x, PAD.y, 44, 10, cols[2]!)
}

/** Act 2's ground: a deep blue band around the cable, stars above and below. */
function linkBg(): Canvas {
  return cached('trade|link', () => {
    const r = rng(41)
    const c = shade(W, H, (x, y) =>
      bands(['#080d22', '#0e163a', '#16245a', '#20357a'], 1 - Math.abs(y - TUBE_Y) / (TUBE_Y + 4), x, y),
    )
    stars(c.g, r, 34, 2, TUBE_Y - 26)
    stars(c.g, r, 26, TUBE_Y + 26, H - 2)
    return c
  })
}

/** The cable of light: a dithered body, two walls, ribs, and each side's light running its own way along it. */
function cable(g: G, t: number) {
  ditherFill(g, 0, TUBE_Y - 16, W, 32, LINK[3], 0.22)
  ditherFill(g, 0, TUBE_Y - 12, W, 24, LINK[3], 0.4)
  ditherFill(g, 0, TUBE_Y - 5, W, 10, LINK[2], 0.3)
  rect(g, 0, TUBE_Y - 14, W, 1, LINK[1])
  rect(g, 0, TUBE_Y + 13, W, 1, LINK[1])
  rect(g, 0, TUBE_Y - 15, W, 1, LINK[3])
  rect(g, 0, TUBE_Y + 14, W, 1, LINK[3])
  for (let x = 6; x < W; x += 14) {
    rect(g, x, TUBE_Y - 13, 1, 2, LINK[2])
    rect(g, x, TUBE_Y + 11, 1, 2, LINK[2])
  }
  // Yours runs right along the top wall, theirs left along the bottom one.
  for (let i = 0; i < 9; i++) {
    const x = Math.round(((t * 120 + i * 30) % (W + 30)) - 15)
    rect(g, x, TUBE_Y - 14, 6, 1, ROSE[1])
    rect(g, x + 2, TUBE_Y - 14, 2, 1, '#ffffff')
    rect(g, W - x - 6, TUBE_Y + 13, 6, 1, GOLD[1])
    rect(g, W - x - 4, TUBE_Y + 13, 2, 1, '#ffffff')
  }
}

/** A gate at one end of the cable: an upright oval of light that flares as a ball goes through. */
function gate(g: G, x: number, cols: readonly string[], t: number, flare: number) {
  const pulse = 0.5 + 0.5 * Math.sin(t * 6)
  g.drawImage(glow(22, cols[2]!, 1.6, 0.45 + 0.15 * pulse + 0.4 * flare), x - 22, TUBE_Y - 22)
  ellipse(g, x, TUBE_Y, 6, 20, cols[3]!)
  ellipse(g, x, TUBE_Y, 4, 17, cols[2]!)
  ellipse(g, x, TUBE_Y, 2, 14, flare > 0.3 ? cols[0]! : cols[1]!)
  if (flare > 0) ellipseLine(g, x, TUBE_Y, Math.round(6 + 6 * flare), Math.round(20 + 8 * flare), cols[0]!)
}

/** A column of light from the sky down to `bottom`, with pulses running down it. */
function beam(g: G, bottom: number, k: number, pulses: number[]) {
  if (k <= 0 || bottom <= 0) return
  const x = PAD.x
  ditherFill(g, x - 12, 0, 24, bottom, LINK[3], 0.3 * k)
  ditherFill(g, x - 7, 0, 14, bottom, LINK[2], 0.55 * k)
  rect(g, x - 2, 0, 4, bottom, k > 0.5 ? LINK[1] : LINK[2])
  if (k > 0.35) rect(g, x - 1, 0, 2, bottom, LINK[0])
  for (const py of pulses)
    if (py > -8 && py < bottom + 8) {
      rect(g, x - 4, Math.max(0, py - 5), 8, Math.min(10, bottom - py + 5), LINK[1])
      rect(g, x - 2, Math.max(0, py - 8), 4, Math.min(16, bottom - py + 8), LINK[0])
    }
}

/** A four-point glint with short diagonals: the flash where the two balls cross. */
function glint(g: G, x: number, y: number, s: number, color: string) {
  if (s < 1) return
  rect(g, x - s, y, 2 * s + 1, 1, color)
  rect(g, x, y - s, 1, 2 * s + 1, color)
  const h = s >> 2
  if (h > 0) {
    rect(g, x - h, y - 1, 2 * h + 1, 3, color)
    rect(g, x - 1, y - h, 3, 2 * h + 1, color)
    const d = Math.round(s * 0.35)
    line(g, x - d, y - d, x + d, y + d, color)
    line(g, x - d, y + d, x + d, y - d, color)
  }
}

/** The games' block wipe: squares grow along the diagonal until they cover the screen, then shrink the same way. */
function wipe(g: G, t: number) {
  const k = within(t, T_CUT1 - WIPE, T_CUT1 + WIPE)
    ? (t - T_CUT1 + WIPE) / WIPE
    : within(t, T_CUT2 - WIPE, T_CUT2 + WIPE)
      ? (t - T_CUT2 + WIPE) / WIPE
      : 0
  if (k <= 0) return
  const S = 10
  const cols = Math.ceil(W / S)
  const rows = Math.ceil(H / S)
  g.fillStyle = NIGHT
  for (let by = 0; by < rows; by++)
    for (let bx = 0; bx < cols; bx++) {
      const order = (bx + by) / (cols + rows - 2)
      const p = clamp((k < 1 ? k : k - 1) * 2 - order)
      const size = Math.round((k < 1 ? p : 1 - p) * S)
      if (size <= 0) continue
      const o = (S - size) >> 1
      g.fillRect(bx * S + o, by * S + o, size, size)
    }
}

type Ball = { x: number; y: number; kind: BallKind; open: number; a: number; fast?: number }

/** Draws a ball; on the move, two ghosts behind it (dx, dy: one step back along its path). */
function drawBall(g: G, b: Ball, glowCol: string) {
  const im = ball(b.kind, b.a, { R, open: b.open })
  if (b.fast) {
    const prev = g.globalAlpha
    for (const [k, a] of [
      [2, 0.3],
      [1, 0.55],
    ] as const) {
      g.globalAlpha = a
      g.drawImage(im, Math.round(b.x - im.width / 2 - k * b.fast), Math.round(b.y - im.height / 2))
    }
    g.globalAlpha = prev
  }
  if (b.open > 0)
    g.drawImage(glow(14, glowCol, 1.5, 0.7 * b.open), Math.round(b.x) - 14, Math.round(b.y) - 14)
  g.drawImage(im, Math.round(b.x - im.width / 2), Math.round(b.y - im.height / 2))
}

/** Act 2's clock, held still for the hit-stop at the crossing. */
const linkClock = (t: number) => (t < T_CROSS ? t : t < T_CROSS + STOP ? T_CROSS : t - STOP)
/** How far along the cable both balls are (0 at their own gate, 1 at the far one); they cross at 0.5. */
const along = (t: number) => span(linkClock(t), T_ENTER, T_ARRIVE - STOP)

/** Both balls in act 2: yours from the left gate, theirs from the right, braiding and crossing in the middle. */
function linkBalls(p: TradeParams, t: number): { mine: Ball | null; theirs: Ball | null } {
  const u = along(t)
  if (t < T_ENTER || u >= 1) return { mine: null, theirs: null }
  const sway = Math.round(SWAY * Math.sin(2 * Math.PI * u))
  const fast = u > 0.04 && u < 0.96 && !within(t, T_CROSS, T_CROSS + STOP) ? 5 : 0
  return {
    mine: { x: lerp(GATE_L, GATE_R, u), y: TUBE_Y - sway, kind: p.giveBall, open: 0, a: u * 16, fast },
    theirs: {
      x: lerp(GATE_R, GATE_L, u),
      y: TUBE_Y + sway,
      kind: p.getBall,
      open: 0,
      a: -u * 16,
      fast: -fast,
    },
  }
}

export function tradeTimeline(p: TradeParams): Timeline<TradeState> {
  const shiny = !!p.shiny
  const BURST = shiny ? SHINY : GOLD
  // The recall ball hovers just over the Pokémon's head, whatever its size.
  const BALL_Y = Math.max(26, PAD.y - Math.min(78, spriteSize(p.give).h) - 10)
  const SHAKES = [[T_CROSS, 0.3, 2]] as const

  /** Act 1's ball: it appears over your Pokémon, takes it in, dips, then shoots up. */
  const sendBall = (t: number): Ball | null => {
    if (t < T_RECALL - 0.12 || t >= T_GONE) return null
    if (t < T_IN) {
      const open = t < T_IN - 0.1 ? span(t, T_RECALL - 0.12, T_RECALL) : 1 - span(t, T_IN - 0.1, T_IN)
      return { x: PAD.x, y: BALL_Y + Math.round(Math.sin(t * 9)), kind: p.giveBall, open, a: 0 }
    }
    if (t < T_UP) {
      const wob = within(t, T_IN + 0.05, T_IN + 0.2)
        ? 0.35 * Math.sin(span(t, T_IN + 0.05, T_IN + 0.2) * Math.PI * 2)
        : 0
      const dip = within(t, T_UP - 0.14, T_UP)
        ? Math.round(3 * Math.sin(Math.PI * span(t, T_UP - 0.14, T_UP)))
        : 0
      return { x: PAD.x, y: BALL_Y + dip, kind: p.giveBall, open: 0, a: wob }
    }
    const k = ease.inQ(span(t, T_UP, T_GONE))
    return { x: PAD.x, y: lerp(BALL_Y, -16, k), kind: p.giveBall, open: 0, a: k * 9 }
  }

  /** Act 3's ball: down the beam, a bounce, two wobbles, then it opens. */
  const arriveBall = (t: number): Ball | null => {
    if (t < T_DOWN || t >= T_OPEN + 0.16) return null
    if (t < T_LAND) {
      const k = ease.outQ(span(t, T_DOWN, T_LAND))
      return { x: PAD.x, y: lerp(-16, REST, k), kind: p.getBall, open: 0, a: (1 - k) * 7 }
    }
    const b = t - T_LAND
    const y = b < 0.16 ? REST - Math.round(5 * Math.sin(Math.PI * (b / 0.16))) : REST
    const wob = within(t, T_LAND + 0.18, T_OPEN - 0.04)
      ? 0.45 * Math.sin(span(t, T_LAND + 0.18, T_OPEN - 0.04) * Math.PI * 4)
      : 0
    if (t < T_OPEN) return { x: PAD.x, y, kind: p.getBall, open: 0, a: wob }
    return { x: PAD.x, y, kind: p.getBall, open: span(t, T_OPEN, T_OPEN + 0.12), a: 0 }
  }

  /** Motes rising off the pad: the room hums while the link is on. */
  const motes = (s: TradeState, cols: readonly string[]) => {
    const r = s.r
    if (r() < 0.14)
      s.under.add({
        x: PAD.x + r.range(-42, 42),
        y: PAD.y + r.range(-6, 4),
        vy: -r.range(8, 18),
        life: r.range(0.8, 1.4),
        size: 1,
        shape: r() < 0.2 ? 'star' : 'px',
        colors: [cols[0]!, cols[1]!, cols[2]!],
      })
  }

  /** A ring of sparks from a point. */
  const burst = (s: TradeState, x: number, y: number, n: number, cols: readonly string[], speed: number) => {
    const r = s.r
    for (let k = 0; k < n; k++) {
      const a = r() * Math.PI * 2
      const sp = r.range(speed * 0.35, speed)
      s.fx.add({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp * 0.8,
        drag: 2.6,
        life: r.range(0.5, 0.95),
        size: r.int(1, 2),
        shape: k % 3 ? 'star' : 'sq',
        colors: cols,
      })
    }
  }

  // ---------------------------------------------------------------- the three acts, stepped
  const stepSend = (s: TradeState, t: number, dt: number) => {
    const r = s.r
    motes(s, LINK)
    const b = sendBall(t)
    // Drawn into the ball: red streaks from the Pokémon's outline.
    if (within(t, T_RECALL + 0.1, T_IN - 0.08) && b) {
      const m = spriteSize(p.give)
      for (let i = 0; i < 3; i++)
        s.fx.add({
          x: PAD.x + r.range(-m.w / 2, m.w / 2) * 0.7,
          y: PAD.y - r.range(0, m.h * 0.8),
          home: { x: b.x, y: b.y, k: 1500 },
          life: 0.35,
          size: 1,
          shape: 'streak',
          trail: 0.02,
          colors: ['#ffffff', ROSE[1], ROSE[3]],
        })
    }
    if (passed(t, dt, T_IN) && b) burst(s, b.x, b.y, 10, ROSE, 50)
    // Shooting up: light falls off the ball.
    if (b && t >= T_UP)
      for (let i = 0; i < 2; i++)
        s.under.add({
          x: b.x + r.range(-3, 3),
          y: b.y + R,
          vy: r.range(10, 40),
          life: 0.4,
          size: 2,
          size1: 0,
          shape: 'sq',
          colors: ROSE,
        })
  }

  const stepLink = (s: TradeState, t: number, dt: number) => {
    const r = s.r
    const { mine, theirs } = linkBalls(p, t)
    // Each ball sheds its own light along the cable.
    for (const [b, cols, dir] of [
      [mine, ROSE, 1],
      [theirs, GOLD, -1],
    ] as const)
      if (b && b.fast)
        for (let i = 0; i < 2; i++)
          s.under.add({
            x: b.x - dir * r.range(4, 8),
            y: b.y + r.range(-3, 3),
            vx: -dir * r.range(10, 30),
            vy: r.range(-6, 6),
            drag: 2,
            life: r.range(0.35, 0.6),
            size: 3,
            size1: 0,
            shape: 'sq',
            colors: cols,
          })
    if (passed(t, dt, T_ENTER)) {
      burst(s, GATE_L, TUBE_Y, 10, ROSE, 45)
      burst(s, GATE_R, TUBE_Y, 10, GOLD, 45)
    }
    // The crossing: both lights at once, and a few stars of the link's own.
    if (passed(t, dt, T_CROSS)) {
      burst(s, PAD.x, TUBE_Y, 22, ROSE, 130)
      burst(s, PAD.x, TUBE_Y, 22, GOLD, 130)
      burst(s, PAD.x, TUBE_Y, 12, LINK, 90)
    }
    if (passed(t, dt, T_ARRIVE - 0.02)) {
      burst(s, GATE_R, TUBE_Y, 8, ROSE, 40)
      burst(s, GATE_L, TUBE_Y, 8, GOLD, 40)
    }
    if (r() < 0.25)
      s.under.add({
        x: r.range(0, W),
        y: TUBE_Y + r.range(-10, 10),
        vx: r() < 0.5 ? -20 : 20,
        life: 0.7,
        size: 1,
        shape: 'px',
        colors: [LINK[0], LINK[1]],
      })
  }

  const stepArrive = (s: TradeState, t: number, dt: number) => {
    const r = s.r
    motes(s, t < T_OPEN ? LINK : BURST)
    const b = arriveBall(t)
    if (b && t < T_LAND)
      for (let i = 0; i < 2; i++)
        s.under.add({
          x: b.x + r.range(-3, 3),
          y: b.y - R,
          vy: -r.range(10, 40),
          life: 0.35,
          size: 2,
          size1: 0,
          shape: 'sq',
          colors: GOLD,
        })
    if (passed(t, dt, T_LAND))
      for (const d of [-1, 1])
        for (let i = 0; i < 4; i++)
          s.under.add({
            x: PAD.x + d * r.range(3, 6),
            y: PAD.y,
            vx: d * r.range(15, 40),
            vy: -r.range(4, 14),
            drag: 3,
            life: 0.45,
            size: 1,
            size1: 3,
            shape: 'smoke',
            colors: ['#a8c0e8', '#7a94c8'],
            density: 1,
          })
    if (passed(t, dt, T_OPEN)) burst(s, PAD.x, REST - 6, 34, BURST, 115)
    if (shiny && (passed(t, dt, T_SHINY) || passed(t, dt, T_SHINY + 0.22))) {
      const big = t > T_SHINY + 0.1
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2
        s.fx.add({
          x: PAD.x + Math.cos(a) * 6,
          y: PAD.y - 32 + Math.sin(a) * 6,
          vx: Math.cos(a) * (big ? 70 : 45),
          vy: Math.sin(a) * (big ? 55 : 35),
          drag: 2.2,
          life: 0.7,
          size: big ? 2 : 1,
          shape: 'star',
          colors: SHINY,
        })
      }
    }
    // Afterwards, sparkles keep twinkling around the newcomer.
    if (t > T_OPEN + 0.5 && r() < 0.12) {
      const a = r() * Math.PI * 2
      s.fx.add({
        x: PAD.x + Math.cos(a) * r.range(28, 54),
        y: PAD.y - 36 + Math.sin(a) * r.range(16, 36),
        life: 0.6,
        shape: 'star',
        size: 1,
        colors: shiny ? ['#ffffff', SHINY[2]] : [GOLD[0], GOLD[1]],
      })
    }
  }

  // ---------------------------------------------------------------- the three acts, drawn
  const drawSend = (g: G, s: TradeState, t: number) => {
    g.drawImage(roomBg(), 0, 0)
    padRing(g, ROSE, span(t, T_RECALL, T_RECALL + 0.2) * (1 - span(t, T_IN, T_IN + 0.45)))
    s.under.draw(g)
    // Yours: a goodbye hop, then red and drawn up into the ball.
    if (t < T_IN) {
      const q = span(t, T_RECALL + 0.15, T_IN - 0.05)
      const hop = within(t, T_BYE, T_BYE + 0.28)
        ? Math.round(Math.sin(Math.PI * span(t, T_BYE, T_BYE + 0.28)) * 7)
        : 0
      const sc = 1 - ease.inQ(q)
      if (sc > 0.02)
        drawSprite(g, p.give, PAD.x, Math.round(lerp(PAD.y, BALL_Y + 4, ease.inQ(q))) - hop, {
          sx: sc,
          sy: sc,
          tint: { color: ROSE[3], a: 0.85 * span(t, T_RECALL, T_RECALL + 0.25) },
        })
    }
    const b = sendBall(t)
    if (b) drawBall(g, b, ROSE[2])
    // Its ghosts trail below it on the way up.
    if (b && t >= T_UP) {
      const im = ball(b.kind, b.a, { R })
      const prev = g.globalAlpha
      g.globalAlpha = 0.4
      g.drawImage(im, Math.round(b.x - im.width / 2), Math.round(b.y + 9 - im.height / 2))
      g.globalAlpha = prev
    }
  }

  const drawLink = (g: G, s: TradeState, t: number) => {
    g.drawImage(linkBg(), 0, 0)
    cable(g, t)
    const u = along(t)
    const flareIn = 1 - span(t, T_ENTER, T_ENTER + 0.3)
    const flareOut = span(t, T_ARRIVE - 0.12, T_ARRIVE)
    gate(g, GATE_L, ROSE, t, Math.max(t >= T_ENTER ? flareIn : 0, flareOut))
    gate(g, GATE_R, GOLD, t, Math.max(t >= T_ENTER ? flareIn : 0, flareOut))
    s.under.draw(g)
    const { mine, theirs } = linkBalls(p, t)
    // Near the crossing each ball glows; the one in front swaps as they pass.
    const near = 1 - clamp(Math.abs(u - 0.5) / 0.12)
    if (near > 0) g.drawImage(glow(20, LINK[1], 1.5, 0.6 * near), PAD.x - 20, TUBE_Y - 20)
    const order = u < 0.5 ? ([theirs, mine] as const) : ([mine, theirs] as const)
    for (const b of order) if (b) drawBall(g, b, b === mine ? ROSE[2] : GOLD[2])
    // The flash where they cross: a glint that fades as a ring opens.
    const q = span(t, T_CROSS + STOP, T_CROSS + 0.45)
    const size = Math.round(44 * ease.outC(span(t, T_CROSS, T_CROSS + 0.05)) * (1 - q))
    if (t >= T_CROSS) {
      glint(g, PAD.x, TUBE_Y, size, '#ffffff')
      if (size > 8) glint(g, PAD.x, TUBE_Y, size >> 1, GOLD[1])
      if (q > 0 && q < 1) {
        const Rr = Math.round(8 + 60 * ease.outC(q))
        g.drawImage(ring(Rr, 3, '#ffffff', 1 - q), PAD.x - Rr - 1, TUBE_Y - Rr - 1)
        const R2 = Math.round(4 + 36 * ease.outC(q))
        g.drawImage(ring(R2, 2, GOLD[2], 1 - q), PAD.x - R2 - 1, TUBE_Y - R2 - 1)
      }
    }
  }

  const drawArrive = (g: G, s: TradeState, t: number) => {
    g.drawImage(roomBg(), 0, 0)
    // The beam: down from the sky onto the pad, held while the ball travels, gone once the newcomer is out.
    const bottom = Math.round(lerp(0, PAD.y, ease.outC(span(t, T_BEAM, T_BEAM + 0.22))))
    const k = t < T_OPEN + 0.1 ? 1 : 1 - span(t, T_OPEN + 0.1, T_CARE + 0.3)
    const pulses: number[] = []
    if (within(t, T_BEAM + 0.1, T_DOWN + 0.1))
      for (let i = 0; i < 3; i++) pulses.push(((t - T_BEAM) * 300 + i * 44) % (PAD.y + 30))
    if (k > 0) g.drawImage(glow(28, LINK[2], 1.4, 0.5 * k), PAD.x - 28, PAD.y - 28)
    beam(g, bottom, k, pulses)
    padRing(g, BURST, span(t, T_LAND, T_LAND + 0.1) * (1 - span(t, T_OPEN + 0.3, T_CARE + 0.6)))
    s.under.draw(g)
    // The ball goes behind the newcomer as it opens; on the way down its ghost trails above it.
    const b = arriveBall(t)
    if (b) drawBall(g, b, '#ffffff')
    if (b && t < T_LAND) {
      const im = ball(b.kind, b.a, { R })
      const prev = g.globalAlpha
      g.globalAlpha = 0.4
      g.drawImage(im, Math.round(b.x - im.width / 2), Math.round(b.y - 9 - im.height / 2))
      g.globalAlpha = prev
    }
    // Theirs: out of the ball from white, a quick grow, then a hop.
    if (t >= T_OPEN) {
      const grow = ease.outBack(span(t, T_OPEN, T_OPEN + 0.22), 2)
      const hop = within(t, T_OPEN + 0.55, T_OPEN + 0.85)
        ? Math.round(Math.sin(Math.PI * span(t, T_OPEN + 0.55, T_OPEN + 0.85)) * 7)
        : 0
      // Two white frames, then the colours.
      const white = t < T_OPEN + 2 * STEP ? 1 : 1 - span(t, T_OPEN + 0.1, T_OPEN + 0.42)
      const sc = 0.3 + 0.7 * grow
      drawSprite(g, p.get, PAD.x, PAD.y - hop, { sx: sc, sy: sc, flash: white })
      const q = span(t, T_OPEN, T_OPEN + 0.5)
      if (q > 0 && q < 1) {
        const Rr = Math.round(8 + 50 * ease.outC(q))
        g.drawImage(ring(Rr, 3, shiny ? SHINY[2] : GOLD[1], 1 - q), PAD.x - Rr - 1, PAD.y - 26 - Rr - 1)
      }
    }
  }

  return {
    id: 'trade',
    dur: DUR,
    setup: () => ({ r: rng(53), fx: new Particles(), under: new Particles() }),
    step(s, t, dt) {
      s.fx.update(dt)
      s.under.update(dt)
      // A cut leaves nothing of the act before behind.
      if (passed(t, dt, T_CUT1) || passed(t, dt, T_CUT2)) {
        s.fx.clear()
        s.under.clear()
      }
      if (t < T_CUT1) stepSend(s, t, dt)
      else if (t < T_CUT2) stepLink(s, t, dt)
      else stepArrive(s, t, dt)
    },
    draw(g, s, t) {
      const sh = screenShake(t, SHAKES)
      g.save()
      g.translate(sh.x, sh.y)
      if (t < T_CUT1) drawSend(g, s, t)
      else if (t < T_CUT2) drawLink(g, s, t)
      else drawArrive(g, s, t)
      s.fx.draw(g)
      g.restore()
      if (within(t, T_CROSS, T_CROSS + 0.22))
        screenFlash(g, LINK[1], 0.5 * (1 - span(t, T_CROSS, T_CROSS + 0.22)))
      wipe(g, t)
      if (t < 0.35) wash(g, NIGHT, 1 - span(t, 0, 0.35))
    },
    cues: () => {
      const c: Cue<TradeState>[] = [
        [0.12, (hud) => hud.beat?.('sending')],
        [T_BYE, (hud) => hud.beat?.('bye')],
        [T_RECALL, () => fxSound('trade.recall')],
        [T_IN, () => fxSound('trade.shut')],
        [T_UP, () => fxSound('trade.up')],
        [T_CUT1 - WIPE, () => fxSound('trade.wipe')],
        [T_ENTER, () => fxSound('trade.link')],
        [T_CROSS, () => fxSound('trade.cross')],
        [T_CROSS + 0.25, (hud) => hud.beat?.('incoming')],
        [T_CUT2 - WIPE, () => fxSound('trade.wipe')],
        [T_DOWN, () => fxSound('trade.down')],
        [T_LAND, () => fxSound('trade.land')],
        [T_OPEN, () => fxSound('trade.open')],
        [T_OPEN + 0.2, (hud) => hud.beat?.('out')],
        [T_CARE, (hud) => hud.beat?.('care')],
      ]
      if (shiny)
        c.push([T_SHINY, () => fxSound('trade.shiny', 0)], [T_SHINY + 0.09, () => fxSound('trade.shiny', 1)])
      for (let i = 0; i < 4; i++) c.push([T_CARE + 0.05 + i * 0.12, () => fxSound('trade.jingle', i)])
      return c.sort((a, b) => a[0] - b[0])
    },
  }
}
