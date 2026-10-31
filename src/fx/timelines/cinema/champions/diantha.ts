// Diantha's entrance (docs/54), on the battle stage: the premiere of her new film in Lumiose City. The camera starts
// up in the night sky on Prism Tower, its lights glittering gold all over it, and tilts down past the theatre's
// copper dome and gilded statues to its great arched doorway at the top of a flight of steps, a red carpet running
// down them between the velvet ropes and the press. The bulbs round the arch run on, the doors swing open on the
// foyer's light and her silhouette stands in it; she comes down the steps in that light while the cameras pop all
// along the ropes. At the foot of the steps Gardevoir appears beside her; her Key Stone flashes, a double helix of
// rainbow light runs from it to Gardevoir, a sphere of light closes round it and bursts: Mega Gardevoir spreads its
// gown under the Mega Evolution's emblem. Every camera goes off at once and the spots find her: the reveal.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  bayer,
  cached,
  canvas,
  clamp,
  ease,
  ellipse,
  glow,
  lerp,
  line,
  mix,
  pattern,
  rect,
  rng,
  shade,
  softEllipse,
  span,
  type Canvas,
  type G,
  type Rng,
} from '../../../pixel'
import { drawSprite, silhouette, spriteFrame, spriteKey, spriteSize } from '../../../sprites'
import { H, screenFlash, screenShake, W, within } from '../../../timeline'
import { championCinema, type ChampionState } from '../champion'
import {
  burstRing,
  dGradient,
  dissolve,
  drawShards,
  makeShard,
  pulse,
  stepShards,
  tri,
  type Shard,
} from '../kit'

const REVEAL = 4.75
/** How far the camera tilts down (px, at the theatre's depth): the sky and the tower's top first. */
const UP = 96
/** The far city's share of the tilt, and the sky's: farther things move less. */
const UPF = 67
const UPS = 34
const T_TILT0 = 0.1
const T_TILT1 = 1.3
const T_BULBS = 0.78
const T_DOORS = 1.1
const T_WALK = 1.42
const T_DOWN = 2.72
const T_GARD = 2.42
const T_KEY = 2.86
const T_LINK = 2.98
const T_SPHERE = 3.22
const T_MEGA = 3.76
const T_FRENZY = 4.1

/** Prism Tower on the final view: its x, its mast's tip and its foot (behind the roofs), the top deck's height (0..1). */
const TOWER = { x: 54, top: -64, base: 96, deck: 0.82 }
/** The steps' top (the doors' sill) on the final view; their foot is where she stands. */
const SILL = 52
/** Gardevoir's place: on the plaza at the foot of the steps, at her right hand (screen left). */
const GDX = -66
const GDY = 5
/** The sphere round Gardevoir: its radius and how high its heart is over its feet. */
const SPHERE_R = 42
const SPHERE_Y = 40
const GARD = spriteKey(282, false)
const MEGA = spriteKey(10051, false)

const STONE = ['#f2e2bc', '#d8c296', '#b49e78', '#8c785e', '#62524c', '#3e3240', '#261e30'] as const
const GOLD = ['#fff6c8', '#ffd84a', '#e0a628', '#a8701a', '#5e3a14'] as const
const CARPET = ['#f0505a', '#c8202e', '#901426', '#560a1a'] as const
const COPPER = ['#7ac8a8', '#4a9a86', '#2e6c62', '#1c443e'] as const
const BOW = ['#ff7aa8', '#ffb048', '#ffe85a', '#7ae08a', '#5ab4ff', '#a882ff'] as const
const NIGHT = '#120a1e'

/** A stepped alpha: eighths, never a smooth fade. */
const q8 = (v: number) => Math.round(clamp(v) * 8) / 8

/** Where the camera is: 0 looking up at the sky, 1 on the steps. */
const camAt = (t: number) => ease.ioS(span(t, T_TILT0, T_TILT1))
/** How far down the steps she is (0 in the doorway, 1 at their foot), and the perspective of it. */
const walkAt = (t: number) => ease.ioS(span(t, T_WALK, T_DOWN)) ** 1.15
/** The steps' half-width at row y (they open out toward the camera), and the carpet's. */
const stairHw = (y: number, foot: number) => lerp(22, 50, clamp((y - SILL) / (foot - SILL)))
const carpetHw = (y: number, foot: number) =>
  y <= foot ? lerp(7, 15, clamp((y - SILL) / (foot - SILL))) : lerp(15, 28, clamp((y - foot) / (H - foot)))

/** Fill a box with stone: b0 and b1 how dark at its top and bottom (0 the lightest, 1 the darkest), dithered between. */
function stoneBox(
  g: G,
  x: number,
  y: number,
  w: number,
  h: number,
  b0: number,
  b1: number,
  pal: readonly string[] = STONE,
) {
  for (let yy = 0; yy < h; yy++) {
    const b = lerp(b0, b1, h > 1 ? yy / (h - 1) : 0) * (pal.length - 1)
    for (let xx = 0; xx < w; xx++) {
      const i = clamp(Math.floor(b + bayer(x + xx, y + yy)), 0, pal.length - 1)
      rect(g, x + xx, y + yy, 1, 1, pal[i]!)
    }
  }
}

/** A column, lit from the lamps below-left: its lit edge, its body, its shaded side; a gilt capital and a base. */
function column(g: G, x: number, y0: number, y1: number, w = 4, gilt = true) {
  stoneBox(g, x, y0, w, y1 - y0, 0.45, 0.25)
  rect(g, x, y0, 1, y1 - y0, STONE[1])
  rect(g, x + w - 1, y0, 1, y1 - y0, STONE[4])
  rect(g, x - 1, y0, w + 2, 2, gilt ? GOLD[2] : STONE[2])
  rect(g, x - 1, y0, w + 2, 1, gilt ? GOLD[1] : STONE[1])
  rect(g, x - 1, y1 - 2, w + 2, 2, STONE[3])
  rect(g, x - 1, y1 - 2, w + 2, 1, STONE[2])
}

/** An arched opening: dark glass lit warm from the foyer, gilt mullions and a fanlight, a moulding round it. */
function archWindow(g: G, cx: number, bottom: number, hw: number, top: number, lit: number) {
  const rr = hw
  const spring = top + rr
  for (let y = top; y < bottom; y++) {
    const dy = y < spring ? spring - y : 0
    const w = y < spring ? Math.round(Math.sqrt(Math.max(0, rr * rr - dy * dy))) : hw
    for (let x = -w; x <= w; x++) {
      // The foyer's light: brightest low and in the middle.
      const k = lit * clamp((y - top) / (bottom - top)) * (1 - Math.abs(x) / (hw + 2)) * 1.4
      const c =
        k > 0.75 + bayer(cx + x, y) * 0.2
          ? '#ffd27a'
          : k > 0.35 + bayer(cx + x, y) * 0.3
            ? '#c8763a'
            : k > 0.12
              ? '#5a2a3a'
              : '#22162e'
      rect(g, cx + x, y, 1, 1, c)
    }
  }
  // Mullions: a centre bar, a transom at the springing, rays in the fanlight.
  rect(g, cx, spring, 1, bottom - spring, GOLD[3])
  rect(g, cx - hw, spring, hw * 2 + 1, 1, GOLD[3])
  for (const a of [-0.9, -0.45, 0, 0.45, 0.9])
    line(
      g,
      cx,
      spring,
      cx + Math.round(Math.sin(a) * (rr - 1)),
      spring - Math.round(Math.cos(a) * (rr - 1)),
      GOLD[3],
    )
  // The moulding.
  for (let a = 0; a <= Math.PI; a += 0.04) {
    const x = Math.round(cx - Math.cos(a) * (rr + 1))
    const y = Math.round(spring - Math.sin(a) * (rr + 1))
    rect(g, x, y, 1, 1, a < Math.PI / 2 ? STONE[1] : STONE[3])
    rect(
      g,
      Math.round(cx - Math.cos(a) * (rr + 2)),
      Math.round(spring - Math.sin(a) * (rr + 2)),
      1,
      1,
      STONE[4],
    )
  }
  rect(g, cx - hw - 1, spring, 1, bottom - spring, STONE[1])
  rect(g, cx + hw + 1, spring, 1, bottom - spring, STONE[4])
}

/** A gilded statue on the attic: a robed figure lifting a wreath, wings spread behind. Lit from below-left. */
function statue(g: G, cx: number, base: number, flip: boolean) {
  const s = flip ? -1 : 1
  // Wings: two swept triangles, the far one darker.
  tri(g, cx - s * 1, base - 14, cx - s * 9, base - 24, cx - s * 3, base - 8, GOLD[3])
  tri(g, cx + s * 1, base - 14, cx + s * 8, base - 22, cx + s * 4, base - 9, GOLD[2])
  for (let i = 0; i < 4; i++) rect(g, cx - s * (3 + i * 2), base - 16 - i * 2, 1, 3, GOLD[4])
  // The robe flaring to the plinth, the body, the head, the raised arm and its wreath.
  tri(g, cx - 4, base, cx + 4, base, cx, base - 15, GOLD[2])
  tri(g, cx - 4, base, cx, base, cx, base - 15, GOLD[1])
  rect(g, cx - 1, base - 18, 3, 4, GOLD[2])
  rect(g, cx - 1, base - 18, 1, 4, GOLD[1])
  ellipse(g, cx, base - 20, 1, 2, GOLD[1])
  line(g, cx + s * 1, base - 17, cx + s * 4, base - 24, GOLD[2], 1)
  ellipse(g, cx + s * 4, base - 26, 2, 2, GOLD[2])
  rect(g, cx + s * 4, base - 26, 1, 1, NIGHT)
  rect(g, cx - 5, base, 11, 3, STONE[3])
  rect(g, cx - 5, base, 11, 1, STONE[2])
}

/** Prism Tower: a lattice tower floodlit gold, splayed legs over an arch, two decks, the prism lantern on top. */
function prismTower(g: G, cx: number, top: number, base: number): [number, number][] {
  const h = base - top
  const P1 = 0.16
  const P2 = 0.38
  const P3 = TOWER.deck
  const hwAt = (u: number) => 1.2 + 27 * (1 - u) ** 2.6
  const pts: [number, number][] = []
  const archH = Math.round(h * P1 * 0.8)
  for (let y = top + 10; y <= base; y++) {
    const u = (base - y) / h
    const w = hwAt(u)
    const xl = Math.round(cx - w)
    const xr = Math.round(cx + w)
    const leg = Math.max(2, Math.round(w * (u < P2 ? 0.34 : 1)))
    for (let x = xl; x <= xr; x++) {
      const inLeg = x - xl < leg || xr - x < leg
      if (u < P2 && !inLeg) {
        // Between the legs: open, but for the arch's spandrel near the first deck.
        if (u >= P1) continue
        const ox = (x - cx) / Math.max(1, cx - (xl + leg))
        const archTop = base - Math.round(archH * Math.sqrt(Math.max(0, 1 - ox * ox)))
        if (y > archTop - 2) {
          if (y >= archTop - 1 && y <= archTop) rect(g, x, y, 1, 1, GOLD[1])
          continue
        }
      }
      const edge = x === xl || x === xr || (u < P2 && (x - xl === leg - 1 || xr - x === leg - 1))
      const lattice = ((x + y) & 3) === 0 || ((x - y) & 3) === 0
      // Brighter toward the floodlights at its foot, its left side catching more of them.
      const lit = 0.55 + 0.45 * (1 - u) + (x < cx ? 0.12 : -0.1)
      if (edge) rect(g, x, y, 1, 1, lit > 0.8 ? GOLD[0] : GOLD[1])
      else if (lattice) rect(g, x, y, 1, 1, lit > 0.75 ? GOLD[1] : GOLD[2])
      else if (bayer(x, y) < 0.3 * lit) rect(g, x, y, 1, 1, GOLD[3])
      if ((edge || lattice) && (x * 7 + y * 13) % 11 === 0) pts.push([x, y])
    }
  }
  // The decks: a gallery with a lit rail, wider than the tower there.
  for (const [u, extra] of [
    [P1, 5],
    [P2, 3],
    [P3, 2],
  ] as const) {
    const y = Math.round(base - u * h)
    const w = Math.round(hwAt(u)) + extra
    rect(g, cx - w, y - 1, w * 2 + 1, 3, GOLD[3])
    rect(g, cx - w, y - 1, w * 2 + 1, 1, GOLD[0])
    for (let x = -w; x <= w; x += 2) rect(g, cx + x, y + 1, 1, 1, GOLD[1])
    rect(g, cx - w, y - 3, 1, 2, GOLD[2])
    rect(g, cx + w, y - 3, 1, 2, GOLD[2])
  }
  // The prism: a faceted lantern, then the mast.
  const py = Math.round(base - P3 * h)
  for (let i = 0; i < 9; i++) {
    const hw = i < 5 ? 1 + i : 1 + (9 - i)
    rect(g, cx - hw, py - 2 - i, hw * 2 + 1, 1, i < 5 ? '#ffe6a0' : '#fff6d8')
    rect(g, cx - hw, py - 2 - i, 1, 1, '#ffffff')
    rect(g, cx + hw, py - 2 - i, 1, 1, GOLD[2])
  }
  rect(g, cx, top, 1, py - 11 - top, GOLD[1])
  rect(g, cx, top - 1, 1, 1, '#ffffff')
  return pts
}

/** Lumiose's rows: cream stone, iron balconies, zinc mansards with dormers and chimney pots; windows lit here and there. */
function skyline(g: G, r: Rng, o: number) {
  // A far row first, darker, with domes and spires.
  for (let x = -4; x < 116;) {
    const w = r.int(12, 22)
    const top = o + r.int(44, 56)
    rect(g, x, top, w, 120, '#24193a')
    rect(g, x, top, w, 1, '#3a2c52')
    if (r() < 0.3) ellipse(g, x + w / 2, top, Math.floor(w / 2) - 1, 4, '#24193a')
    if (r() < 0.25) rect(g, x + Math.floor(w / 2), top - 9, 1, 9, '#2e2246')
    for (let yy = top + 4; yy < o + 100; yy += 6)
      for (let xx = x + 2; xx < x + w - 2; xx += 4) if (r() < 0.22) rect(g, xx, yy, 1, 2, '#c88a4a')
    x += w
  }
  // The near row.
  for (let x = -6; x < 118;) {
    const w = r.int(18, 27)
    const roof = o + r.int(58, 68)
    const face = roof + 8
    // The mansard: slate, a lit ridge, dormers, chimneys.
    for (let y = roof; y < face; y++) {
      const ins = Math.round((face - y) * 0.5)
      rect(g, x + ins, y, w - ins * 2, 1, y === roof ? '#5a5a7a' : '#34304e')
    }
    for (let dx = 4; dx < w - 4; dx += 6) {
      rect(g, x + dx, roof + 2, 3, 5, '#2a2640')
      rect(g, x + dx + 1, roof + 3, 1, 3, r() < 0.5 ? '#ffcf6a' : '#1a1428')
      rect(g, x + dx, roof + 1, 3, 1, '#5a5a7a')
    }
    for (let c = 0; c < 2; c++) {
      const cx = x + r.int(3, w - 5)
      rect(g, cx, roof - 4, 3, 4, '#3a2c3e')
      rect(g, cx, roof - 5, 1, 1, '#6a3a3a')
      rect(g, cx + 2, roof - 5, 1, 1, '#6a3a3a')
    }
    // The stone face, lit warm from the street below.
    for (let y = face; y < o + 104; y++) {
      const k = (y - face) / (o + 104 - face)
      for (let xx = 0; xx < w; xx++) {
        const v = 0.25 + 0.5 * k + (xx < 2 ? 0.15 : 0)
        rect(
          g,
          x + xx,
          y,
          1,
          1,
          v > 0.62 + bayer(x + xx, y) * 0.2
            ? '#7a6670'
            : v > 0.4 + bayer(x + xx, y) * 0.2
              ? '#5a4a5e'
              : '#3e324a',
        )
      }
    }
    rect(g, x + w - 1, face, 1, o + 104 - face, '#241a30')
    let fl = 0
    for (let y = face + 2; y < o + 100; y += 9, fl++) {
      for (let xx = x + 3; xx < x + w - 3; xx += 5) {
        const on = r() < 0.42
        rect(g, xx, y, 3, 5, on ? '#ffcf6a' : '#1c1428')
        if (on) rect(g, xx, y + 3, 3, 2, '#e0904a')
        else rect(g, xx + 2, y, 1, 1, '#4a4a6e')
      }
      if (fl % 2 === 0) {
        rect(g, x + 1, y + 6, w - 2, 1, '#1a1222')
        for (let xx = x + 1; xx < x + w - 1; xx += 2) rect(g, xx, y + 5, 1, 1, '#2a2034')
      }
    }
    x += w + (r() < 0.3 ? 1 : 0)
  }
}

/** The far layer: Prism Tower over the rows of the city. Returns its glitter points. */
function farLayer(r: Rng): { cv: Canvas; pts: [number, number][] } {
  const cv = canvas(W, H + UPF)
  const g = cv.g
  // Its glow on the haze round it.
  g.drawImage(glow(40, '#3a2448', 1.2, 0.8), TOWER.x - 40, UPF)
  const pts = prismTower(g, TOWER.x, UPF + TOWER.top, UPF + TOWER.base)
  skyline(g, r, UPF)
  return { cv, pts }
}

/** The sky: deep violet to the city's pink glow, a few stars where the glow doesn't reach. */
function skyLayer(): Canvas {
  const cv = canvas(W, H + UPS)
  const g = cv.g
  g.drawImage(dGradient(W, H + UPS, ['#05041a', '#0c0a2c', '#181238', '#2a1a4a', '#46285a', '#6a3a62']), 0, 0)
  const r = rng(7061)
  for (let i = 0; i < 34; i++) rect(g, r.range(0, W), r.range(0, 80), 1, 1, r() < 0.2 ? '#c8c8ff' : '#6a6a9a')
  return cv
}

interface Hall {
  cv: Canvas
  /** The steps in the doorway's light, in a cone narrowing up to the doors (dissolved in as they open). */
  lit: Canvas
  bulbs: [number, number][]
  marquee: [number, number][]
}

const LIT_STONE = ['#fffaf0', '#fff0c8', '#f4d8a4', '#e0bc84', '#c09868', '#8a6a50', '#5a4044'] as const
const LIT_CARPET = ['#ff9a8a', '#f4504e', '#c42a36', '#801a2a'] as const

/** The steps: risers facing us, treads catching the light, the carpet down them held by gilt stair-rods. */
function steps(g: G, fx: number, foot: number, o: number, st: readonly string[], cp: readonly string[]) {
  let y = o + SILL
  let n = 0
  while (y < o + foot) {
    const k = (y - o - SILL) / (foot - SILL)
    const step = Math.max(2, Math.round(lerp(2.4, 4.6, k)))
    const hw = Math.round(stairHw(y - o, foot))
    rect(g, fx - hw, y, hw * 2 + 1, 1, st[1]!)
    stoneBox(g, fx - hw, y + 1, hw * 2 + 1, step - 1, 0.42 - k * 0.1, 0.62 - k * 0.1, st)
    rect(g, fx - hw, y + 1, hw * 2 + 1, 1, st[5]!)
    const cw = Math.round(carpetHw(y - o, foot))
    rect(g, fx - cw, y + 1, cw * 2 + 1, step - 1, cp[1]!)
    rect(g, fx - cw, y + step - 1, cw * 2 + 1, 1, cp[2]!)
    rect(g, fx - cw, y + 1, 1, step - 1, cp[2]!)
    rect(g, fx + cw, y + 1, 1, step - 1, cp[3]!)
    rect(g, fx - cw, y, cw * 2 + 1, 1, n % 2 ? cp[0]! : mix(cp[0]!, '#ffffff', 0.25))
    rect(g, fx - cw - 1, y + step - 1, cw * 2 + 3, 1, GOLD[2])
    y += step
    n++
  }
}

/** The lit steps, cut to the doorway's cone of light: dense near the doors and on its axis, thinning out. */
function litSteps(fx: number, foot: number): Canvas {
  const cv = canvas(W, H + UP)
  steps(cv.g, fx, foot, UP, LIT_STONE, LIT_CARPET)
  const mask = shade(W, H + UP, (x, y) => {
    const v = y - UP
    if (v < SILL || v > foot) return null
    const q = (v - SILL) / (foot - SILL)
    const hw = lerp(15, 44, q)
    const d = Math.abs(x - fx) / hw
    if (d >= 1) return null
    return (1 - d) ** 0.6 * (1 - 0.45 * q) * 1.5 > bayer(x, y) ? '#000000' : null
  })
  cv.g.globalCompositeOperation = 'destination-in'
  cv.g.drawImage(mask, 0, 0)
  cv.g.globalCompositeOperation = 'source-over'
  return cv
}

/** The theatre (its whole front, dome to steps), the plaza and the carpet, at the theatre's depth. */
function hallLayer(fx: number, foot: number): Hall {
  const cv = canvas(W, H + UP)
  const g = cv.g
  const o = UP
  const X0 = fx - 69
  // The dome, its drum and lantern: copper lit from below, gilt ribs.
  const dy = o - 66
  for (let y = -20; y <= 0; y++) {
    const w = Math.round(28 * Math.sqrt(1 - (y * y) / 441))
    for (let x = -w; x <= w; x++) {
      const v = 0.5 + 0.5 * ((y + 20) / 20) - (x / 28) * 0.35
      const i = clamp(Math.floor((1 - v) * 3.4 + bayer(fx + x, dy + y)), 0, 3)
      rect(g, fx + x, dy + y, 1, 1, COPPER[i]!)
    }
  }
  for (const a of [-0.75, -0.4, 0, 0.4, 0.75]) {
    for (let y = -20; y <= 0; y++) {
      const w = 28 * Math.sqrt(1 - (y * y) / 441)
      rect(g, Math.round(fx + a * w), dy + y, 1, 1, a < 0.2 ? GOLD[2] : GOLD[3])
    }
  }
  rect(g, fx - 3, dy - 27, 7, 7, COPPER[2])
  rect(g, fx - 3, dy - 27, 2, 7, COPPER[1])
  rect(g, fx - 4, dy - 28, 9, 1, GOLD[1])
  rect(g, fx, dy - 33, 1, 5, GOLD[1])
  ellipse(g, fx, dy - 34, 1, 1, GOLD[0])
  rect(g, fx - 30, dy, 61, 3, STONE[4])
  rect(g, fx - 30, dy, 61, 1, STONE[2])
  // The mansard roof across the front, round dormers in it.
  for (let y = o - 63; y < o - 53; y++) {
    const ins = Math.round((o - 53 - y) * 0.6)
    for (let x = X0 + ins; x < W; x++) {
      const i = clamp(Math.floor(((o - 53 - y) / 10) * 2.2 + bayer(x, y) + 0.4), 0, 3)
      rect(g, x, y, 1, 1, COPPER[i]!)
    }
  }
  for (let x = X0 + 10; x < W - 4; x += 16) {
    if (Math.abs(x - fx) < 30) continue
    ellipse(g, x, o - 58, 3, 3, STONE[2])
    ellipse(g, x, o - 58, 2, 2, '#2a1c30')
    rect(g, x - 1, o - 58, 2, 2, '#ffcf6a')
  }
  // The attic: relief panels with gilt garlands; the cornice under it.
  stoneBox(g, X0, o - 53, W - X0, 10, 0.55, 0.4)
  for (let x = X0 + 4; x < W - 10; x += 22) {
    rect(g, x, o - 51, 16, 6, STONE[4])
    rect(g, x + 1, o - 50, 14, 4, STONE[3])
    for (let k = 0; k < 14; k += 1)
      rect(g, x + 1 + k, o - 49 + Math.round(Math.sin((k / 13) * Math.PI) * 2), 1, 1, GOLD[2])
  }
  rect(g, X0 - 2, o - 43, W - X0 + 2, 3, STONE[1])
  rect(g, X0 - 2, o - 40, W - X0 + 2, 1, STONE[5])
  for (let x = X0; x < W; x += 3) rect(g, x, o - 41, 1, 1, STONE[4])
  statue(g, X0 + 6, o - 53, false)
  statue(g, W - 6, o - 53, true)
  // The loggia: paired columns, deep openings lit inside, round windows over them.
  stoneBox(g, X0, o - 40, W - X0, 32, 0.6, 0.35)
  const bays = [X0 + 14, X0 + 38, fx, fx + 34, fx + 58]
  for (const bx of bays) {
    archWindow(g, bx, o - 12, 6, o - 32, 0.75)
    ellipse(g, bx, o - 36, 2, 2, '#2a1c30')
    rect(g, bx, o - 36, 1, 1, GOLD[2])
  }
  for (let i = 0; i < bays.length - 1; i++) {
    const mx = Math.round((bays[i]! + bays[i + 1]!) / 2)
    column(g, mx - 4, o - 38, o - 10, 3)
    column(g, mx + 2, o - 38, o - 10, 3)
  }
  // The entablature: the marquee's band of bulbs, a gilt frieze.
  rect(g, X0 - 2, o - 9, W - X0 + 2, 9, STONE[5])
  rect(g, X0 - 2, o - 9, W - X0 + 2, 1, STONE[2])
  rect(g, X0 - 2, o - 2, W - X0 + 2, 2, GOLD[3])
  rect(g, X0 - 2, o - 2, W - X0 + 2, 1, GOLD[2])
  const marquee: [number, number][] = []
  for (let x = X0 + 1; x < W; x += 4) marquee.push([x, o - 6])
  // The ground storey: floodlit stone, the flanking arches, the great doorway.
  stoneBox(g, X0, o, W - X0, SILL, 0.5, 0.05)
  const side = [fx - 48, fx + 48]
  for (const ax of side) archWindow(g, ax, o + SILL, 8, o + 18, 1)
  for (const cx of [X0 + 3, fx - 32, fx - 25, fx + 22, fx + 29, W - 6]) column(g, cx, o + 2, o + SILL, 4)
  // The doorway: its gilt moulding and keystone; the doors themselves are drawn as they open.
  const dr = 15
  const spring = o + 19
  for (let a = 0; a <= Math.PI; a += 0.02) {
    for (const [rr, c] of [
      [dr + 1, GOLD[1]],
      [dr + 2, GOLD[2]],
      [dr + 3, STONE[5]],
    ] as const)
      rect(g, Math.round(fx - Math.cos(a) * rr), Math.round(spring - Math.sin(a) * rr), 1, 1, c)
  }
  rect(g, fx - dr - 1, spring, 1, o + SILL - spring, GOLD[1])
  rect(g, fx - dr - 2, spring, 1, o + SILL - spring, GOLD[2])
  rect(g, fx + dr + 1, spring, 1, o + SILL - spring, GOLD[2])
  rect(g, fx + dr + 2, spring, 1, o + SILL - spring, GOLD[3])
  tri(g, fx - 4, spring - dr - 4, fx + 4, spring - dr - 4, fx, spring - dr + 3, GOLD[1])
  rect(g, fx - 1, spring - dr - 3, 3, 2, GOLD[0])
  const bulbs: [number, number][] = []
  for (let y = o + SILL - 2; y > spring; y -= 4) bulbs.push([fx - dr - 5, y])
  for (let a = 0; a <= Math.PI + 1e-6; a += Math.PI / 12)
    bulbs.push([Math.round(fx - Math.cos(a) * (dr + 5)), Math.round(spring - Math.sin(a) * (dr + 5))])
  for (let y = spring + 4; y < o + SILL; y += 4) bulbs.push([fx + dr + 5, y])
  // The podium either side of the steps: rusticated blocks.
  for (let y = o + SILL; y < o + foot + 2; y++) {
    const hw = stairHw(y - o, foot)
    for (let x = X0; x < W; x++) {
      if (Math.abs(x - fx) <= hw + 3) continue
      const row = Math.floor((y - o - SILL) / 6)
      const joint = (y - o - SILL) % 6 === 5 || (x + row * 9) % 18 === 0
      const v = 0.3 + 0.4 * ((y - o - SILL) / (foot - SILL)) + (x < fx ? 0.1 : 0)
      rect(g, x, y, 1, 1, joint ? STONE[6] : v > 0.55 + bayer(x, y) * 0.25 ? STONE[3] : STONE[4])
    }
  }
  // The plaza: paving going off into the dark, lamplight pooled on it.
  for (let y = o + foot - 1; y < o + H; y++) {
    const k = (y - o - foot) / (H - foot)
    for (let x = 0; x < W; x++) {
      const near = 1 - Math.min(Math.abs(x - (fx - 56)), Math.abs(x - (fx + 56))) / 50
      const v = 0.18 + 0.2 * k + 0.35 * clamp(near) * (1 - k * 0.6)
      rect(
        g,
        x,
        y,
        1,
        1,
        v > 0.45 + bayer(x, y) * 0.2 ? '#5a4248' : v > 0.25 + bayer(x, y) * 0.15 ? '#3a2a3a' : '#22182c',
      )
    }
    if ((y - o - foot) % Math.max(2, Math.round(2 + k * 6)) === 0) rect(g, 0, y, W, 1, '#1a1222')
  }
  steps(g, fx, foot, o, STONE, CARPET)
  for (const sd of [-1, 1]) {
    for (let yy = o + SILL - 6; yy < o + foot + 2; yy++) {
      const hw = Math.round(stairHw(yy - o + 6, foot)) + 2
      const x = fx + sd * hw
      const w = 4
      rect(g, sd < 0 ? x - w + 1 : x, yy, w, 1, (yy - o) % 3 ? STONE[3] : STONE[2])
      if ((yy - o) % 3 === 0) rect(g, sd < 0 ? x - w + 1 : x, yy, 1, 1, STONE[5])
      rect(g, sd < 0 ? x - w : x + w, yy - 1, 1, 1, sd < 0 ? STONE[1] : STONE[4])
    }
  }
  // The carpet down the plaza toward us, its edges darker.
  for (let yy = o + foot; yy < o + H; yy++) {
    const cw = Math.round(carpetHw(yy - o, foot))
    rect(g, fx - cw, yy, cw * 2 + 1, 1, CARPET[1])
    rect(g, fx - cw, yy, 2, 1, CARPET[2])
    rect(g, fx + cw - 1, yy, 2, 1, CARPET[3])
    if ((yy * 7) % 5 === 0) rect(g, fx - cw + 3 + ((yy * 13) % (cw * 2 - 4)), yy, 1, 1, CARPET[0])
  }
  // Lamp posts at the foot of the steps: three globes on a fluted iron post.
  for (const lx of [fx - 56, fx + 56]) {
    const b = o + foot + 3
    rect(g, lx - 4, b - 5, 9, 5, STONE[3])
    rect(g, lx - 4, b - 5, 9, 1, STONE[1])
    rect(g, lx - 1, b - 30, 3, 25, '#1e1a2a')
    rect(g, lx - 1, b - 30, 1, 25, '#4a4a5e')
    rect(g, lx - 6, b - 31, 13, 1, '#2a2638')
    for (const gx of [-6, 0, 6]) {
      const gy = b - (gx ? 34 : 38)
      g.drawImage(glow(8, '#5a3a3a', 1.2, 0.8), lx + gx - 8, gy - 8)
      ellipse(g, lx + gx, gy, 2, 2, '#ffe6a8')
      rect(g, lx + gx - 1, gy - 1, 1, 1, '#ffffff')
    }
  }
  return { cv, lit: litSteps(fx, foot), bulbs, marquee }
}

/** The press behind the ropes: heads and shoulders, lit from above by the spots and along the carpet's side. */
function crowdLayer(fx: number, foot: number, r: Rng): { cv: Canvas; cams: [number, number][] } {
  const CY = 100
  const cv = canvas(W, H - CY)
  const g = cv.g
  const cams: [number, number][] = []
  const person = (x: number, y: number, s: number, depth: number, cam: boolean) => {
    const toward = x < fx ? 1 : -1
    // Farther rows a little lighter: the haze of the plaza's light between them and us.
    const coat = mix(r.pick(['#2a1e3c', '#30203a', '#22203a']), '#0e0816', depth)
    const skin = mix('#4a3446', '#1c1020', depth)
    const top = mix('#7a6a8a', '#4a3e5a', depth)
    const rim = mix('#c87a6a', '#a8504a', depth)
    const hr = Math.round(3 * s)
    const vr = Math.round(4 * s)
    const sw = Math.round(7 * s)
    const sy = y + Math.round(7 * s)
    ellipse(g, x, sy, sw, Math.round(5 * s), coat)
    for (let k = -sw + 2; k <= sw - 2; k++) if ((k + x) % 3) rect(g, x + k, sy - Math.round(5 * s), 1, 1, top)
    ellipse(g, x, y, hr, vr, skin)
    // Hair or a hat on top, the light on it; the carpet's red light down the near side.
    if (r() < 0.2) {
      rect(g, x - hr - 1, y - vr + 1, hr * 2 + 3, 1, '#0a0610')
      rect(g, x - hr, y - vr - Math.round(3 * s), hr * 2 + 1, Math.round(3 * s) + 1, '#0a0610')
      rect(g, x - hr, y - vr - Math.round(3 * s), hr * 2 + 1, 1, top)
    } else {
      ellipse(g, x, y - Math.round(s), hr, Math.max(1, vr - 1), mix(coat, '#000000', 0.3))
      rect(g, x - 1, y - vr, 3, 1, top)
    }
    for (let k = -vr + 2; k <= vr - 1; k++) rect(g, x + toward * hr, y + k, 1, 1, rim)
    for (let k = 0; k < Math.round(4 * s); k++)
      rect(g, x + toward * (sw - 1), sy - Math.round(2 * s) + k, 1, 1, rim)
    if (cam) {
      // An arm up, a camera on it facing the carpet, its flash unit on top.
      const cx = x + toward * Math.round(5 * s)
      const cy = y - Math.round(9 * s)
      line(g, x + toward * Math.round(5 * s), sy - Math.round(3 * s), cx, cy + 2, coat, 2)
      rect(g, cx - 3, cy - 2, 7, 5, '#0a0610')
      rect(g, cx - 3, cy - 2, 7, 1, '#5a5a70')
      rect(g, cx + (toward > 0 ? 2 : -3), cy - 1, 2, 3, '#3a4a6a')
      rect(g, cx + (toward > 0 ? 3 : -3), cy - 1, 1, 1, '#a8c0e0')
      rect(g, cx - 1, cy - 4, 3, 2, '#2a2a3a')
      rect(g, cx - 1, cy - 4, 3, 1, '#d8d8e8')
      cams.push([cx, cy - 3 + CY])
    }
  }
  // Three rows each side of the carpet, the back one smallest, the front one cut by the frame.
  for (const [y, s, step, depth] of [
    [24, 0.8, 11, 0.25],
    [38, 1.05, 13, 0.6],
    [54, 1.35, 16, 1],
  ] as const) {
    const edge = carpetHw(CY + y, foot) + 8 + s * 4
    for (let x = 4 + r.range(-3, 3); x < fx - edge; x += step + r.range(-2, 2))
      person(Math.round(x), y + r.int(-2, 1), s, depth, r() < 0.4)
    for (let x = fx + edge + r.range(0, 4); x < W + 6; x += step + r.range(-2, 2))
      person(Math.round(x), y + r.int(-2, 1), s, depth, r() < 0.4)
  }
  // The velvet ropes along the carpet: brass posts, red rope sagging between them.
  for (const sd of [-1, 1]) {
    const posts = [10, 24, 46].map((y) => {
      const hgt = Math.round(lerp(8, 15, y / 40))
      const x = Math.round(fx + sd * (carpetHw(CY + y, foot) + 3))
      return [x, y, hgt] as const
    })
    for (let i = 0; i < posts.length - 1; i++) {
      const [x0, y0, h0] = posts[i]!
      const [x1, y1, h1] = posts[i + 1]!
      for (let k = 0; k <= 20; k++) {
        const q = k / 20
        const x = Math.round(lerp(x0, x1, q))
        const y = Math.round(lerp(y0 - h0 + 2, y1 - h1 + 2, q) + Math.sin(q * Math.PI) * 4)
        rect(g, x, y, 1, 2, '#9a1428')
        rect(g, x, y, 1, 1, '#e04a5a')
      }
    }
    for (const [x, y, hgt] of posts) {
      rect(g, x - 2, y, 5, 2, GOLD[3])
      rect(g, x, y - hgt, 1, hgt, GOLD[2])
      rect(g, x - 1, y - hgt - 2, 3, 3, GOLD[1])
      rect(g, x - 1, y - hgt - 2, 1, 1, GOLD[0])
    }
  }
  return { cv, cams }
}

/** A follow-spot from above the frame to a point on the ground: a narrow dithered cone and its pool. */
function spot(g: G, x0: number, y0: number, x1: number, y1: number, w: number, k: number) {
  if (k <= 0) return
  const halo = pattern(g, '#e8e0ff', 3 * k)
  const core = pattern(g, '#fff6e8', 6 * k)
  for (let y = Math.round(y0); y <= y1; y++) {
    const q = (y - y0) / (y1 - y0)
    const cx = lerp(x0, x1, q)
    const hw = lerp(2, w, q)
    g.fillStyle = halo
    g.fillRect(Math.round(cx - hw), y, Math.round(hw * 2) + 1, 1)
    g.fillStyle = core
    g.fillRect(Math.round(cx - hw * 0.5), y, Math.round(hw) + 1, 1)
  }
  softEllipse(g, x1, y1, Math.round(w * 1.1), Math.max(2, Math.round(w * 0.3)), '#fff0dc', 0.55 * k, 0.8)
}

/** The rainbow sphere round Gardevoir: a white heart, a ring of colours turning at its rim. Cached by size and turn. */
const sphere = (r: number, ph: number) =>
  cached(`dia-sphere|${r}|${ph}`, () =>
    shade(2 * r + 1, 2 * r + 1, (x, y) => {
      const dx = x - r
      const dy = y - r
      const d = Math.hypot(dx, dy) / (r + 0.5)
      if (d >= 1) return null
      const b = bayer(x, y)
      if (d < 0.55) return d < 0.4 || b > (d - 0.4) / 0.15 ? '#ffffff' : '#ffe6f4'
      if (d < 0.74) return b > (d - 0.55) / 0.19 ? '#ffe6f4' : '#ffc8e8'
      // The rim: the colours round it, swirling (the angle shifts with the distance), dithered into each other.
      const a = (Math.atan2(dy, dx) / (Math.PI * 2) + 1 + ph / 6 + d * 0.35) % 1
      const f = a * BOW.length
      const i = Math.floor(f)
      const c = f - i > b ? BOW[(i + 1) % BOW.length]! : BOW[i]!
      return d > 0.93 && b > 0.5 ? null : c
    }),
  )

/** The Mega Evolution's emblem: a drop of light with a double helix wound inside it, its colours top to bottom. */
function megaEmblem(g: G, cx: number, cy: number, s: number) {
  if (s <= 0.05) return
  const col = (v: number) => BOW[clamp(Math.floor(v * BOW.length), 0, BOW.length - 1)]!
  const R = 7 * s
  const th = Math.max(1, Math.round(s * 0.7))
  // The drop: a circle with a point on top.
  const m = Math.round(64 * s)
  for (let i = 0; i < m; i++) {
    const a = (i / m) * Math.PI * 2
    const pinch = Math.max(0, -Math.sin(a)) ** 6
    const rr = R * (1 + pinch * 0.75)
    const x = Math.round(cx + Math.cos(a) * R * (1 - pinch * 0.85))
    const y = Math.round(cy + Math.sin(a) * rr)
    rect(g, x - th + 1, y - th + 1, th * 2, th * 2, col((y - (cy - R * 1.75)) / (R * 2.75)))
  }
  // Two strands crossing inside it.
  const n = Math.round(20 * s)
  for (let i = 0; i <= n; i++) {
    const q = i / n
    const y = cy - R * 0.9 + q * R * 1.6
    const w = Math.sin(q * Math.PI * 2) * R * 0.45
    rect(g, Math.round(cx + w), Math.round(y), th, th, '#ffffff')
    rect(g, Math.round(cx - w), Math.round(y), th, th, col(q))
  }
}

type X = {
  buf: Canvas
  sky: Canvas
  far: Canvas
  hall: Canvas
  lit: Canvas
  crowd: Canvas
  bulbs: [number, number][]
  marquee: [number, number][]
  cams: [number, number][]
  pops: [number, number, number, number][]
  glitter: [number, number][]
  cracks: [number, number][][]
  shards: Shard[]
  /** The follow-spots once they have met on her. */
  spotsMet?: Canvas
}

/** The follow-spots: where each hangs above the frame and how far off her it starts (px, from her x). */
const SPOTS = [
  [-170, -90],
  [-70, -50],
  [50, 60],
  [120, 80],
] as const

const POP_RATE = (t: number) =>
  t < 1.35 ? 0 : t < T_SPHERE ? 7 : t < T_FRENZY ? 9 : t < REVEAL ? 90 : t < REVEAL + 1 ? 14 : 6

export const dianthaChampion = championCinema<X>({
  id: 'diantha',
  reveal: REVEAL,
  seed: 6061,
  aura: ['#ffffff', '#ffd6f0', '#d88ad8', '#4a2a6a'],
  flash: '#fff4fa',
  sample: {
    trainer: '/trainers/classes/kalos/champion-diantha.png',
    name: 'Champion Diantha',
    lead: 697,
    ace: 706,
    team: 3,
  },
  extras: [282, 10051],
  setup(st, r) {
    const F = st.L.foe
    const foot = F.y + 2
    const hall = hallLayer(F.x, foot)
    const far = farLayer(rng(6062))
    const crowd = crowdLayer(F.x, foot, rng(6063))
    // The cameras' flashes, all decided now: a few as she comes down, a storm of them before the reveal.
    const pops: [number, number, number, number][] = []
    const pr = rng(6064)
    for (let t = 0; t < REVEAL + 2.4; t += 1 / 60) {
      if (pr() >= POP_RATE(t) / 60) continue
      const near = pr() < 0.6 && crowd.cams.length
      const [x, y] = near ? pr.pick(crowd.cams) : [pr.range(0, W), pr.range(116, 136)]
      if (!near && Math.abs(x - F.x) < 30) continue
      pops.push([t, Math.round(x), Math.round(y), y > 132 ? 3 : y > 116 ? 2 : 1])
    }
    st.screenShakes.push([T_MEGA, 0.35, 2])
    const C = { x: F.x + GDX, y: F.y + GDY - SPHERE_Y }
    return {
      buf: canvas(W, H),
      sky: skyLayer(),
      far: far.cv,
      hall: hall.cv,
      lit: hall.lit,
      crowd: crowd.cv,
      bulbs: hall.bulbs,
      marquee: hall.marquee,
      cams: crowd.cams,
      pops,
      glitter: far.pts.filter(() => r() < 0.5),
      cracks: Array.from({ length: 7 }, (_, i) => {
        const a = (i / 7) * Math.PI * 2 + r.range(-0.2, 0.2)
        const pts: [number, number][] = [[C.x, C.y]]
        let x = C.x
        let y = C.y
        for (let k = 0; k < 5; k++) {
          x += Math.cos(a + r.range(-0.5, 0.5)) * 6
          y += Math.sin(a + r.range(-0.5, 0.5)) * 6
          pts.push([Math.round(x), Math.round(y)])
        }
        return pts
      }),
      shards: [],
    }
  },
  step(s, t, dt) {
    const r = s.r
    const F = s.L.foe
    const G = { x: F.x + GDX, y: F.y + GDY }
    // No floor: they fall away behind the press.
    stepShards(s.shards, dt, { g: 160, drag: 0.6 })
    // Gardevoir comes: a column of psychic sparkles where it will stand.
    if (within(t, T_GARD - 0.12, T_GARD + 0.2) && r() < 0.8)
      s.fx.add({
        x: G.x + r.range(-10, 10),
        y: G.y - r.range(0, 60),
        vy: -r.range(10, 40),
        life: 0.5,
        size: r.int(1, 2),
        shape: 'star',
        colors: ['#ffffff', '#ffd6f0', '#d88ad8'],
      })
    // The burst: shards of the sphere in its colours, a spray of light.
    if (within(t, T_MEGA, T_MEGA + dt)) {
      for (let i = 0; i < 34; i++) {
        const c = BOW[i % BOW.length]!
        s.shards.push(
          makeShard(r, G.x + r.range(-14, 14), G.y - SPHERE_Y + r.range(-14, 14), 170, c, '#ffffff', 0.5),
        )
      }
      for (let i = 0; i < 40; i++) {
        const a = r() * Math.PI * 2
        const v = r.range(50, 160)
        s.fx.add({
          x: G.x,
          y: G.y - SPHERE_Y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v * 0.8,
          drag: 3,
          life: r.range(0.5, 1),
          size: r.int(1, 3),
          shape: r() < 0.5 ? 'star' : 'plus',
          colors: ['#ffffff', BOW[i % BOW.length]!],
        })
      }
    }
    // Mega Gardevoir's gown sheds glitter as it settles (all of it gone before the scene gives way to the battle).
    if (t > T_MEGA + 0.1 && t < REVEAL + 0.5 && r() < 0.35)
      s.fx.add({
        x: G.x + r.range(-26, 26),
        y: G.y - r.range(4, 50),
        vy: r.range(6, 16),
        life: r.range(0.6, 1.1),
        size: 1,
        shape: r() < 0.3 ? 'star' : 'px',
        colors: ['#ffffff', '#ffd6f0', '#d88ad8'],
      })
  },
  back(g, s, t, k) {
    if (k <= 0) return
    const b = s.buf.g
    const F = s.L.foe
    const foot = F.y + 2
    const c = camAt(t)
    // Each layer's offset: rows (v + its share of the tilt) end on the view's row v; farther layers move less.
    const dSky = -Math.round(UPS * c)
    const dFar = -Math.round(UPF * c)
    const dHall = -Math.round(UP * c)
    b.drawImage(s.sky, 0, dSky)
    b.drawImage(s.far, 0, dFar)
    // Prism Tower's glitter: its lights twinkle at the start, and in a storm at the climax.
    const gl = pulse(t, 0, 1.5) + span(t, T_FRENZY - 0.1, REVEAL - 0.1) * 0.8
    if (gl > 0)
      for (let i = 0; i < s.glitter.length; i++) {
        const [x, y] = s.glitter[i]!
        const ph = Math.floor(t * 14 + i * 7.3) % 9
        if ((i * 0.37) % 1 > gl || ph > 1) continue
        const yy = y + dFar
        rect(b, x, yy, 1, 1, '#ffffff')
        if (ph === 0) {
          rect(b, x - 1, yy, 3, 1, '#fff6c8')
          rect(b, x, yy - 1, 1, 3, '#fff6c8')
        }
      }
    // The tower's beacon turning over the city.
    {
      const bx = TOWER.x
      const by = UPF + TOWER.base - Math.round(TOWER.deck * (TOWER.base - TOWER.top)) - 6 + dFar
      const a = t * 2.2
      const len = Math.round(Math.cos(a) * 60)
      if (Math.abs(len) > 3) {
        const dir = Math.sign(len)
        for (let i = 2; i < Math.abs(len); i++) {
          const hw = Math.round(i * 0.12)
          b.fillStyle = pattern(b, '#fff2c0', 6 * (1 - i / Math.abs(len)))
          b.fillRect(bx + dir * i, by - hw, 1, hw * 2 + 1)
        }
      }
      b.drawImage(glow(5, '#ffffff', 1.5, 1), bx - 5, by - 5)
    }
    b.drawImage(s.hall, 0, dHall)
    // The bulbs: the marquee's band chasing, the arch's running on one by one, then chasing too.
    const on = span(t, T_BULBS, T_BULBS + 0.4)
    const chase = Math.floor(t * 12)
    s.bulbs.forEach(([x, y], i) => {
      const lit = i / s.bulbs.length < on
      const bright = lit && (i + chase) % 3 !== 0
      rect(b, x, y + dHall, 2, 2, lit ? (bright ? GOLD[1] : GOLD[2]) : GOLD[4])
      if (bright) rect(b, x, y + dHall, 1, 1, GOLD[0])
    })
    s.marquee.forEach(([x, y], i) => {
      const bright = t > T_BULBS && (i + chase) % 4 < 2
      rect(b, x, y + dHall, 2, 2, bright ? GOLD[1] : GOLD[3])
      if (bright) rect(b, x, y + dHall, 1, 1, GOLD[0])
    })
    drawDoors(b, F.x, dHall, t)
    // The foyer's light falling down the steps once the doors are open.
    dissolve(b, s.lit, span(t, T_DOORS + 0.05, T_DOORS + 0.4), 0, dHall)
    // At the climax the follow-spots swing in from all round and meet on her.
    if (t > T_FRENZY - 0.15) {
      const q = ease.outC(span(t, T_FRENZY - 0.15, REVEAL - 0.12))
      const d = q8(span(t, T_FRENZY - 0.15, T_FRENZY + 0.15))
      // Once they have met they hold still: drawn once, then reused.
      const met = q >= 1 && d >= 1
      if (!met || !s.spotsMet) {
        const c2 = met ? (s.spotsMet = canvas(W, H)).g : b
        for (const [sx, from] of SPOTS) spot(c2, F.x + sx, -12, F.x + Math.round(from * (1 - q)), foot, 15, d)
      }
      if (met) b.drawImage(s.spotsMet!, 0, 0)
    }
    drawMega(b, s, t)
    // The press, coming up into the frame as the camera comes down.
    b.drawImage(s.crowd, 0, 100 + Math.round(UP * 1.3 * (1 - c)))
    drawPops(b, s, t)
    const sh = screenShake(t, s.screenShakes)
    if (sh.x || sh.y) rect(g, 0, 0, W, H, NIGHT)
    dissolve(g, s.buf, k, sh.x, sh.y)
  },
  before(g, s, t) {
    if (t < T_DOORS + 0.14) return
    const F = s.L.foe
    const foot = F.y + 2
    const sh = screenShake(t, s.screenShakes)
    const z = walkAt(t)
    const sc = lerp(0.5, 1, z)
    // A step down at each stair: a little dip in her walk, and her shoulders swaying.
    const stride = Math.sin(span(t, T_WALK, T_DOWN) * Math.PI * 7)
    const bob = z > 0 && z < 1 ? Math.round(Math.abs(stride)) : 0
    const x = F.x + Math.round(stride * (1 - z) * 0.6) + sh.x
    const y = Math.round(lerp(SILL, foot, z)) - bob + sh.y
    // Black against the foyer's light at first, lit more and more as she comes down into the spots.
    const dark = 1 - 0.8 * span(z, 0.08, 0.6) - 0.1 * span(t, T_FRENZY, REVEAL - 0.2)
    const popLit = t > T_FRENZY ? s.pops.filter(([pt]) => within(t, pt, pt + 0.05)).length : 0
    figure(g, s.p.trainer, x, y, sc, dark, z < 0.25 ? '#fff0d0' : null, popLit > 1 ? 0.35 : 0)
    // Her Key Stone: a spark at her throat, then the light that answers Gardevoir's.
    const ks =
      pulse(t, T_KEY - 0.05, T_KEY + 0.5) +
      0.6 * span(t, T_LINK, T_SPHERE) * (1 - span(t, T_MEGA, T_MEGA + 0.3))
    if (ks > 0) {
      const kp = keyStone(s)
      const r = Math.round(2 + ks * 4)
      g.drawImage(glow(10, '#ffd6f0', 1.6, q8(ks)), kp.x - 10, kp.y - 10)
      rect(g, kp.x - r, kp.y, r * 2 + 1, 1, '#ffffff')
      rect(g, kp.x, kp.y - r, 1, r * 2 + 1, '#ffffff')
      rect(g, kp.x - 1, kp.y - 1, 3, 3, '#ffe0f4')
    }
  },
  front(g, _s, t) {
    if (within(t, T_MEGA, T_MEGA + 0.1)) screenFlash(g, '#fff0fa', 0.6)
  },
  sounds: [
    [
      0.05,
      () => (
        hiss(1.4, { freq: 500, type: 'lowpass', vol: 0.03 }),
        tone(98, 1.6, { type: 'sine', vol: 0.04 })
      ),
    ],
    // The tilt: a harp running down.
    [
      0.25,
      () => {
        for (let i = 0; i < 8; i++)
          tone([2093, 1760, 1568, 1319, 1175, 988, 880, 784][i]!, 0.35, {
            type: 'triangle',
            vol: 0.025,
            at: i * 0.08,
          })
      },
    ],
    [
      T_BULBS,
      () => {
        for (let i = 0; i < 6; i++) tone(1400 + i * 120, 0.03, { type: 'square', vol: 0.015, at: i * 0.06 })
      },
    ],
    [
      T_DOORS,
      () => (
        tone(70, 0.4, { type: 'sine', vol: 0.08, slide: -20 }),
        tone(523, 0.9, { type: 'triangle', vol: 0.03, at: 0.08 }),
        tone(659, 0.9, { type: 'triangle', vol: 0.025, at: 0.12 }),
        tone(784, 0.9, { type: 'triangle', vol: 0.025, at: 0.16 })
      ),
    ],
    [T_WALK + 0.1, () => hiss(2.6, { freq: 900, q: 0.5, vol: 0.025 })],
    [T_WALK + 0.2, () => shutters(5, 0.25)],
    [T_WALK + 0.8, () => shutters(4, 0.2)],
    [T_GARD - 0.1, () => tone(500, 0.35, { type: 'sine', vol: 0.05, slide: 1300 })],
    [
      T_KEY,
      () => (
        tone(2093, 0.45, { type: 'triangle', vol: 0.04 }),
        tone(2637, 0.4, { type: 'triangle', vol: 0.03, at: 0.06 })
      ),
    ],
    [T_LINK, () => (fxSound('psychic.focus'), tone(330, 0.5, { type: 'triangle', vol: 0.04, slide: 330 }))],
    [T_SPHERE, () => (fxSound('evolve.white'), tone(220, 0.55, { type: 'sine', vol: 0.06, slide: 440 }))],
    [T_SPHERE + 0.25, () => fxSound('evolve.swap', 2)],
    [T_SPHERE + 0.4, () => fxSound('evolve.swap', 5)],
    [T_MEGA, () => (fxSound('evolve.burst'), fxSound('legend.shatter'))],
    [
      T_MEGA + 0.08,
      () => {
        for (const [f, at] of [
          [784, 0],
          [988, 0.05],
          [1175, 0.1],
          [1568, 0.15],
        ] as const)
          tone(f, 0.7, { type: 'triangle', vol: 0.03, at })
      },
    ],
    [T_FRENZY, () => (shutters(14, 0.6), hiss(1.4, { freq: 1100, q: 0.4, vol: 0.05 }))],
    [
      REVEAL,
      () => {
        for (const [f, at] of [
          [523, 0],
          [659, 0],
          [784, 0],
          [1047, 0.12],
        ] as const)
          tone(f, 0.9, { type: 'square', vol: 0.025, at })
      },
    ],
  ],
})

/** A burst of camera shutters: n clicks over `span` seconds. */
function shutters(n: number, sp: number) {
  for (let i = 0; i < n; i++)
    hiss(0.03, { freq: 5000, q: 2, vol: 0.05, at: (i / n) * sp + ((i * 37) % 7) * 0.006 })
}

/** Her Key Stone (the pendant at her throat) on the stage. */
function keyStone(s: ChampionState<X>) {
  const z = spriteSize(s.p.trainer)
  return { x: s.L.foe.x - Math.round(z.w * 0.25), y: s.L.foe.y + 2 - Math.round(z.h * 0.71) }
}

/** The champion's picture at a scale, darkened toward a silhouette, with an optional rim of light round her. */
function figure(
  g: G,
  key: string,
  x: number,
  y: number,
  sc: number,
  dark: number,
  rim: string | null,
  flash = 0,
) {
  const f = spriteFrame(key)
  if (!f) return
  const w = Math.max(1, Math.round(f.width * sc))
  const h = Math.max(1, Math.round(f.height * sc))
  const dx = Math.round(x - w / 2)
  const dy = Math.round(y - h)
  if (rim) {
    const rs = silhouette(key, rim)!
    for (const [ox, oy] of [
      [1, 0],
      [-1, 0],
      [0, -1],
    ] as const)
      g.drawImage(rs, dx + ox, dy + oy, w, h)
  }
  g.drawImage(f, dx, dy, w, h)
  const a = q8(dark)
  if (a > 0) {
    g.globalAlpha = a
    g.drawImage(silhouette(key, '#140c22')!, dx, dy, w, h)
    g.globalAlpha = 1
  }
  if (flash > 0) {
    g.globalAlpha = q8(flash)
    g.drawImage(silhouette(key, '#ffffff')!, dx, dy, w, h)
    g.globalAlpha = 1
  }
}

/** The great doors: shut, then swinging in on the foyer's light. */
function drawDoors(b: G, fx: number, dy: number, t: number) {
  const top = SILL - 48 + dy + UP
  const bottom = SILL + dy + UP
  const spring = top + 15
  const open = ease.outC(span(t, T_DOORS, T_DOORS + 0.4))
  for (let y = top; y < bottom; y++) {
    const ddy = y < spring ? spring - y : 0
    const w = y < spring ? Math.round(Math.sqrt(Math.max(0, 225 - ddy * ddy))) : 15
    for (let x = -w; x <= w; x++) {
      // The foyer: a white heart of light, gold toward the frame.
      const d = Math.hypot(x / 15, (y - bottom + 18) / 30)
      const c =
        d < 0.45 + bayer(fx + x, y) * 0.15
          ? '#fffaf0'
          : d < 0.8 + bayer(fx + x, y) * 0.2
            ? '#ffe2a0'
            : '#e8a858'
      rect(b, fx + x, y, 1, 1, open > 0 ? c : '#2a1622')
    }
  }
  // The two leaves, narrowing as they swing in.
  const lw = Math.max(1, Math.round(15 * (1 - open * 0.85)))
  for (const sd of [-1, 1]) {
    const x0 = sd < 0 ? fx - 15 : fx + 16 - lw
    rect(b, x0, spring, lw, bottom - spring, '#3a1a26')
    rect(b, x0, spring, lw, 1, GOLD[3])
    if (lw > 4) {
      rect(b, x0 + 2, spring + 3, lw - 4, 14, '#4a2a3a')
      rect(b, x0 + 2, spring + 20, lw - 4, 12, '#4a2a3a')
      rect(b, x0 + 2, spring + 3, lw - 4, 1, GOLD[3])
      rect(b, x0 + 2, spring + 20, lw - 4, 1, GOLD[3])
      rect(b, sd < 0 ? x0 + lw - 2 : x0 + 1, spring + 18, 1, 3, GOLD[1])
    }
    rect(b, sd < 0 ? x0 + lw - 1 : x0, spring, 1, bottom - spring, open > 0 ? '#1a0a12' : '#5a3a3a')
  }
  if (open <= 0) {
    // Shut: the fanlight glows faintly and a line of light shows under the doors.
    for (let y = top; y < spring; y++) {
      const ddy = spring - y
      const w = Math.round(Math.sqrt(Math.max(0, 225 - ddy * ddy)))
      b.fillStyle = pattern(b, '#e8a858', 6)
      b.fillRect(fx - w, y, w * 2 + 1, 1)
    }
    rect(b, fx - 14, bottom - 1, 29, 1, '#ffd88a')
  }
}

/** Gardevoir's arrival and its Mega Evolution: the helix, the sphere, the burst, Mega Gardevoir and its emblem. */
function drawMega(b: G, s: ChampionState<X>, t: number) {
  if (t < T_GARD - 0.12) return
  const F = s.L.foe
  const G = { x: F.x + GDX, y: F.y + GDY }
  const C = { x: G.x, y: G.y - SPHERE_Y }
  // Its psychic light behind it.
  const aura = span(t, T_GARD, T_GARD + 0.3)
  if (aura > 0) b.drawImage(glow(26, '#7a4a9a', 1.6, q8(0.5 * aura)), G.x - 26, G.y - 60)
  // Teleporting in: a seam of light opening into the shape, wavering, then still.
  if (t < T_GARD + 0.06) {
    const q = span(t, T_GARD - 0.12, T_GARD + 0.06)
    const w = Math.round(q * 6)
    rect(b, G.x - w, G.y - 64, w * 2 + 1, 64, '#ffd6f0')
    rect(b, G.x - Math.max(0, w - 2), G.y - 64, Math.max(1, w * 2 - 3), 64, '#ffffff')
    return
  }
  const sph = span(t, T_SPHERE, T_SPHERE + 0.3)
  if (t < T_MEGA) {
    const morph = span(t, T_SPHERE + 0.15, T_MEGA - 0.05)
    if (sph > 0) {
      // The sphere: grows out of its Mega Stone with a bounce and swallows it, then beats twice.
      const beat = pulse(t, T_SPHERE + 0.3, T_SPHERE + 0.42) + pulse(t, T_SPHERE + 0.44, T_SPHERE + 0.56)
      const R = Math.max(2, Math.round((SPHERE_R * ease.outBack(sph) + beat * 3) / 2) * 2)
      const ph = Math.floor(t * 10) % 6
      const sx = Math.round(lerp(G.x + 6, C.x, ease.outC(sph)))
      const sy = Math.round(lerp(G.y - 42, C.y, ease.outC(sph)))
      if (R < 30) drawSprite(b, GARD, G.x, G.y, { flash: q8(R / 30) })
      b.drawImage(glow(R + 10, '#a882ff', 1.4, 0.6), sx - R - 10, sy - R - 10)
      b.drawImage(sphere(R, ph), sx - R, sy - R)
      if (R >= 30) {
        // Inside it the shape flickers between Gardevoir and its Mega form, faster and faster.
        const fast = Math.floor(morph * morph * 14) % 2 === 1
        const key = fast ? MEGA : GARD
        const fh = spriteSize(key).h * 0.8
        drawSprite(b, key, C.x, Math.round(C.y + fh / 2), { sil: '#ff9ad8', sx: 0.8, sy: 0.8 })
      }
      // The cracks as it is about to burst.
      const cr = span(t, T_MEGA - 0.18, T_MEGA)
      if (cr > 0)
        for (const c of s.cracks) {
          const n = Math.max(2, Math.round(c.length * cr))
          for (let i = 1; i < n; i++) line(b, c[i - 1]![0], c[i - 1]![1], c[i]![0], c[i]![1], '#ffffff', 1)
        }
    } else {
      const wob = 1 - span(t, T_GARD + 0.06, T_GARD + 0.35)
      drawSprite(b, GARD, G.x, G.y, {
        wave: wob > 0 ? { amp: Math.round(wob * 4), len: 8, phase: t * 40 } : undefined,
        tint: wob > 0 ? { color: '#ffe0f4', a: q8(wob) } : { color: '#140c22', a: q8(0.25) },
      })
    }
    // The helix from her Key Stone to its Mega Stone, drawn out from her, then flowing into the sphere.
    const link = span(t, T_LINK, T_LINK + 0.3) * (1 - span(t, T_SPHERE + 0.1, T_SPHERE + 0.35))
    if (link > 0)
      helix(b, keyStone(s), { x: G.x + 6, y: G.y - 42 }, t, link, span(t, T_SPHERE + 0.1, T_SPHERE + 0.35))
    return
  }
  // Mega Gardevoir: out of the light, its gown spread; its emblem over it, rising and going.
  const out = span(t, T_MEGA, T_MEGA + 0.4)
  b.drawImage(glow(34, '#5a2a6a', 1.3, 0.75), G.x - 34, G.y - 72)
  drawSprite(b, MEGA, G.x, G.y, {
    sx: 1 + 0.12 * (1 - ease.outBack(out, 2)),
    sy: 1 - 0.08 * (1 - ease.outBack(out, 2)),
    flash: 1 - out,
    outline: t < REVEAL ? (Math.floor(t * 10) % 2 ? '#ffd6f0' : '#d88ad8') : undefined,
  })
  drawShards(b, s.shards)
  // The emblem flashes up where the sphere was, over it, then flickers out.
  const em = span(t, T_MEGA, T_MEGA + 0.6)
  if (em > 0 && em < 1) {
    const sc = 2.2 * ease.outBack(span(em, 0, 0.3), 2.4)
    if (em < 0.7 || Math.floor(t * 30) % 2) megaEmblem(b, C.x, C.y - Math.round(em * 6), sc)
  }
  ;['#ffffff', '#ff9ad8', '#a882ff'].forEach((c, i) =>
    burstRing(b, C.x, C.y, span(t, T_MEGA + i * 0.08, T_MEGA + 0.5 + i * 0.08), 90 + i * 20, 2, c),
  )
}

/** Two strands wound round the line from a to b, coloured along it; `k` how far out from a, `fade` thinning it. */
function helix(
  b: G,
  a: { x: number; y: number },
  e: { x: number; y: number },
  t: number,
  k: number,
  fade: number,
) {
  const n = 72
  // It bows up between them, so it reads as a bridge of light rather than a line.
  const cx = (a.x + e.x) / 2
  const cy = Math.min(a.y, e.y) - 22
  const reach = ease.outC(Math.min(1, k * 1.4))
  for (let i = 0; i <= n; i++) {
    const q = i / n
    if (q > reach) break
    if (fade > 0 && q < fade) continue
    const env = Math.sin(q * Math.PI) * 8 + 1
    const ph = q * Math.PI * 6 - t * 14
    const bx = (1 - q) * (1 - q) * a.x + 2 * (1 - q) * q * cx + q * q * e.x
    const by = (1 - q) * (1 - q) * a.y + 2 * (1 - q) * q * cy + q * q * e.y
    const tx = 2 * (1 - q) * (cx - a.x) + 2 * q * (e.x - cx)
    const ty = 2 * (1 - q) * (cy - a.y) + 2 * q * (e.y - cy)
    const tl = Math.hypot(tx, ty) || 1
    const nx = -ty / tl
    const ny = tx / tl
    if (i % 8 === 4) b.drawImage(glow(6, '#ffd6f0', 1.6, 0.5), Math.round(bx) - 6, Math.round(by) - 6)
    const c = BOW[Math.floor(q * BOW.length * 2 + t * 6) % BOW.length]!
    for (const off of [0, Math.PI]) {
      const v = Math.sin(ph + off)
      const front = Math.cos(ph + off) > 0
      const x = Math.round(bx + nx * v * env)
      const y = Math.round(by + ny * v * env)
      rect(b, x, y, front ? 2 : 1, front ? 2 : 1, front ? c : '#ffffff')
    }
    if (i % 6 === 0) rect(b, Math.round(bx), Math.round(by), 1, 1, '#ffffff')
  }
}

/** The cameras going off: a white star and its halo for two frames, a pale blue afterglow. */
function drawPops(b: G, s: ChampionState<X>, t: number) {
  for (const [pt, x, y, sz] of s.pops) {
    const e = t - pt
    if (e < 0 || e > 0.1) continue
    if (e < 0.035) {
      const r = 5 + sz * 2
      b.drawImage(glow(r, '#ffffff', 1.6, 0.9), x - r, y - r)
      rect(b, x - sz * 3, y, sz * 6 + 1, 1, '#ffffff')
      rect(b, x, y - sz * 3, 1, sz * 6 + 1, '#ffffff')
      rect(b, x - 1, y - 1, 3, 3, '#ffffff')
    } else if (e < 0.07) {
      rect(b, x - sz * 2, y, sz * 4 + 1, 1, '#e0e8ff')
      rect(b, x, y - sz * 2, 1, sz * 4 + 1, '#e0e8ff')
      rect(b, x, y, 1, 1, '#ffffff')
    } else rect(b, x, y, 1, 1, '#a8b8e8')
  }
}
