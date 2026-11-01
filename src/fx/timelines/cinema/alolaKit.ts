// What Alola's cinematics (docs/53: the Tapus, Cosmog, Solgaleo, Lunala, Necrozma, the Ultra Beasts) share beyond
// the kit: palms and jungle drawn once, a starry sky, the reveal's light (rays and rings in the legend's colours), and
// a hash for per-tile variety that doesn't spend the scene's random stream.
import { canvas, ellipse, lerp, line, rect, span, type Canvas, type G, type Rng } from '../../pixel'
import { drawRays } from '../legend'
import { burstRing } from './kit'

/** A stable 0..1 from two integers: tiles, stars and rocks vary without drawing from the scene's rng. */
export const hash2 = (i: number, j: number) => {
  let x = (i * 374761393 + j * 668265263) | 0
  x = (x ^ (x >>> 13)) * 1274126177
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296
}

/**
 * A palm against the sky: a curved trunk, its rings, and fronds drooping from the crown. One colour (a silhouette)
 * with a lit edge, so it reads on any sky.
 */
export function palm(
  g: G,
  x: number,
  base: number,
  ph: number,
  lean: number,
  dark: string,
  edge: string,
  trunk = dark,
) {
  const top = { x: x + lean, y: base - ph }
  let px = x
  let py = base
  for (let i = 1; i <= 10; i++) {
    const q = i / 10
    // The trunk bends more near its top.
    const nx = x + lean * q * q
    const ny = base - ph * q
    line(g, px, py, nx, ny, trunk, q < 0.5 ? 3 : 2)
    if (i % 2 === 0) rect(g, nx - 1, ny, 3, 1, edge)
    px = nx
    py = ny
  }
  // A big palm (one near the viewer) gets fuller fronds.
  const fw = Math.max(1, Math.round(ph / 45))
  for (let k = 0; k < 7; k++) {
    const a = -Math.PI / 2 + (k - 3) * 0.55 + (lean > 0 ? 0.15 : -0.15)
    const len = ph * (0.42 + (k % 2) * 0.12)
    let fx = top.x
    let fy = top.y
    for (let s = 1; s <= 8; s++) {
      const q = s / 8
      const nx = top.x + Math.cos(a) * len * q
      const ny = top.y + Math.sin(a) * len * q * 0.5 + len * q * q * 0.55
      line(g, fx, fy, nx, ny, dark, (s < 4 ? 2 : 1) * fw)
      // Leaflets hanging under the frond.
      if (s > 2 && (s % 2 || fw > 1))
        line(g, nx, ny, nx + (nx > top.x ? fw : -fw), ny + 3 * fw, dark, fw > 1 ? 2 : 1)
      if (fw > 1 && s > 1) rect(g, nx, ny - 1, 2, 1, edge)
      fx = nx
      fy = ny
    }
    rect(g, fx, fy, 1, 1, edge)
  }
  ellipse(g, top.x, top.y + 1, 2, 2, trunk === dark ? dark : '#5a3a1a')
}

/** Broad jungle leaves in a clump: dark ovals, their lit tips. */
export function bush(g: G, x: number, base: number, size: number, dark: string, mid: string, r: Rng) {
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + r.range(-1.3, 1.3)
    const d = r.range(0.2, 0.8) * size
    const ex = x + Math.cos(a) * d
    const ey = base + Math.sin(a) * d * 0.6
    const rr = Math.round(size * r.range(0.35, 0.55))
    ellipse(g, ex, ey, rr, Math.max(2, Math.round(rr * 0.6)), i % 2 ? dark : mid)
  }
}

/** A starfield on a canvas: specks, a few brighter ones with a cross. */
export function stars(g: G, r: Rng, w: number, h: number, n: number, dim: string, bright: string) {
  for (let i = 0; i < n; i++) {
    const x = Math.round(r.range(0, w))
    const y = Math.round(r.range(0, h))
    if (r() < 0.12) {
      rect(g, x - 1, y, 3, 1, dim)
      rect(g, x, y - 1, 1, 3, dim)
      rect(g, x, y, 1, 1, bright)
    } else rect(g, x, y, 1, 1, r() < 0.3 ? bright : dim)
  }
}

/** A canvas the size of the screen, for the reveal's rays. */
export const raysCanvas = (w: number, h: number): Canvas => canvas(w, h)

/**
 * The reveal's light, the same beat in every Alolan scene: rays turning behind it (strong, then settling) and three
 * rings going out in its colours. `at` is its body's centre.
 */
export function revealLight(
  g: G,
  rays: Canvas,
  t: number,
  reveal: number,
  at: { x: number; y: number },
  aura: readonly string[],
  big: number,
  strength = 0.7,
  /** The rays' colour: the aura's deepest by night, a light one on a bright sky. */
  rayColor = aura[3]!,
) {
  if (t >= reveal) {
    const k = span(t, reveal, reveal + 0.4) * lerp(strength, 0.28, span(t, reveal + 0.4, reveal + 1.4))
    drawRays(rays, at, t, rayColor, k)
    g.drawImage(rays, 0, 0)
  }
  for (const [d, c] of [
    [0, aura[0]!],
    [0.12, aura[1]!],
    [0.24, aura[2]!],
  ] as const)
    burstRing(g, at.x, at.y, span(t, reveal + d, reveal + d + 0.6), big, 3, c)
}
