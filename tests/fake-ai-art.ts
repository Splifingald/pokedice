import type { Image } from '../scripts/unpixel'

/** Seeded RNG, so a failure reproduces. */
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1

/**
 * What an image model makes of `src`: blown up to `cell` px per pixel on an opaque white background, with cells of
 * uneven, drifting size, a per-cell colour wobble, pixel noise, and edges blurred over `blur` px each side.
 */
export function fakeAiArt(src: Image, cell: number, seed = 1, blur = 2): Image {
  const r = rng(seed)
  const bounds = (n: number) => {
    const out = [0]
    let drift = 0
    for (let k = 1; k < n; k++) {
      drift = Math.max(-0.2, Math.min(0.2, drift + r() * 0.08)) // the grid wanders by up to 20 % of a cell
      out.push(Math.round((k + drift) * cell))
    }
    out.push(Math.round(n * cell))
    return out
  }
  const xs = bounds(src.width)
  const ys = bounds(src.height)
  const w = xs[xs.length - 1]!
  const h = ys[ys.length - 1]!
  const sharp = new Float64Array(w * h * 3)
  for (let j = 0; j < src.height; j++) {
    for (let i = 0; i < src.width; i++) {
      const s = (j * src.width + i) * 4
      const a = src.data[s + 3]! / 255
      const c = [0, 1, 2].map((k) => src.data[s + k]! * a + 255 * (1 - a) + (a ? r() * 8 : 0))
      for (let y = ys[j]!; y < ys[j + 1]!; y++)
        for (let x = xs[i]!; x < xs[i + 1]!; x++) sharp.set(c, (y * w + x) * 3)
    }
  }
  // A box blur softens every edge, then noise on top.
  const out: Image = { width: w, height: h, data: new Uint8Array(w * h * 4) }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let k = 0; k < 3; k++) {
        let sum = 0
        let n = 0
        for (let dy = -blur; dy <= blur; dy++) {
          for (let dx = -blur; dx <= blur; dx++) {
            const yy = y + dy
            const xx = x + dx
            if (yy < 0 || xx < 0 || yy >= h || xx >= w) continue
            sum += sharp[(yy * w + xx) * 3 + k]!
            n++
          }
        }
        out.data[(y * w + x) * 4 + k] = Math.max(0, Math.min(255, Math.round(sum / n + r() * 10)))
      }
      out.data[(y * w + x) * 4 + 3] = 255
    }
  }
  return out
}
