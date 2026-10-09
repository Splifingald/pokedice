/**
 * pnpm unpixel <in> [out] — turns AI "pixel art" (e.g. a 2048×2048 Gemini image where every art pixel is a fuzzy
 * block of ~8–32 px) back into true pixel art at its native size (e.g. 256×256), KB instead of MB.
 *
 * Plain downscaling blurs because the fake pixels are neither aligned to any integer factor nor perfectly square. So:
 *   1. find the fake-pixel grid: the column/row edge profiles peak on cell borders; the cell size is what fits the
 *      gaps between borders, and each gap is split evenly into whole cells, which absorbs the AI's drift;
 *   2. read each cell from its middle (the borders are blurred) and keep its majority colour;
 *   3. merge the near-duplicate shades the AI leaves behind into one palette — of at most 256 colours when that
 *      takes little, so the PNG can be indexed (about a third of the size);
 *   4. optionally, clear a flat background around a sprite.
 *
 * <in> is a PNG or a folder of PNGs (convert JPG/WebP first); [out] defaults to <in>/out. Options:
 *   --px <n>      cell size in source pixels, when auto-detection guesses wrong (e.g. --px 32 for a 64×64 sprite)
 *   --size <WxH>  exactly this size, cropping or repeating the edge pixels — evens out the pixel or two by which
 *                 a batch differs (e.g. --size 400x400 for Gemini's 2048×2048 images, drawn on a ~400 px grid)
 *   --merge <n>   colour distance under which shades merge into one (default 16; 0 keeps every shade)
 *   --bg <mode>   keep (default) | auto | #rrggbb — make a flat background transparent: auto takes the border's
 *                 colour, only if (nearly) the whole border is that colour; for sprites, not scenes
 *   --preview <n> also write a ×n nearest-neighbour copy next to each output, to compare with the original
 * Display the result with `image-rendering: pixelated` (already the case for sprites in this app) — never resample it.
 */
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'
import { PNG } from 'pngjs'

export type Image = { width: number; height: number; data: Uint8Array }

/**
 * How much the image changes across each column border (axis x) or row border (axis y). Differences are summed over
 * runs of 4 pixels along the border before taking their size: a real border keeps its sign along a cell and adds
 * up, where noise partly cancels out. The profile is then smoothed, so a border the AI blurred over a few pixels
 * still peaks once, in its middle.
 */
function edgeProfile(img: Image, axis: 'x' | 'y'): Float64Array {
  const { width: w, height: h, data } = img
  const len = axis === 'x' ? w : h
  const raw = new Float64Array(len)
  const step = axis === 'x' ? 4 : w * 4
  const other = axis === 'x' ? h : w
  const run = 4
  for (let i = 1; i < len; i++) {
    let sum = 0
    for (let j0 = 0; j0 < other; j0 += run) {
      for (let c = 0; c < 4; c++) {
        let d = 0
        for (let j = j0; j < Math.min(other, j0 + run); j++) {
          const p = (axis === 'x' ? j * w + i : i * w + j) * 4 + c
          d += data[p]! - data[p - step]!
        }
        sum += Math.abs(d)
      }
    }
    raw[i] = sum / other
  }
  raw[0] = raw[1]!
  const prof = new Float64Array(len)
  const at = (i: number) => raw[Math.min(len - 1, Math.max(0, i))]!
  for (let i = 0; i < len; i++)
    prof[i] = (at(i - 2) + 2 * at(i - 1) + 3 * at(i) + 2 * at(i + 1) + at(i + 2)) / 9
  return prof
}

type Edge = { at: number; strength: number }

/**
 * The cell borders along one axis: peaks of the profile that clearly rise above the valleys beside them — by a tenth
 * of the profile's range, and well above its noise (in a flat, grainy area the smoothed noise forms bumps too).
 */
function borders(prof: Float64Array): Edge[] {
  const len = prof.length
  const sorted = [...prof].sort((a, b) => a - b)
  const steps = prof
    .slice(1)
    .map((v, i) => Math.abs(v - prof[i]!))
    .sort((a, b) => a - b)
  const noise = steps[Math.floor(steps.length / 2)]! * 1.4826
  const min = Math.max((sorted[Math.floor(len * 0.98)]! - sorted[Math.floor(len * 0.1)]!) * 0.1, noise * 6)
  const out: Edge[] = []
  for (let i = 1; i < len - 1; i++) {
    const v = prof[i]!
    if (v <= prof[i - 1]! || v < prof[i + 1]!) continue
    let valley = v
    for (let j = Math.max(0, i - 6); j <= Math.min(len - 1, i + 6); j++) valley = Math.min(valley, prof[j]!)
    if (v - valley > min) out.push({ at: i, strength: v - valley })
  }
  return out
}

/** Keeps the strongest borders at least `gap` apart (two peaks closer than that are one blurred border), by position. */
function spaced(edges: Edge[], gap: number): Edge[] {
  const kept: Edge[] = []
  for (const e of [...edges].sort((a, b) => b.strength - a.strength))
    if (kept.every((k) => Math.abs(k.at - e.at) >= gap)) kept.push(e)
  return kept.sort((a, b) => a.at - b.at)
}

/**
 * The fake-pixel size, shared by both axes, from the gaps between consecutive borders: each gap spans a whole number
 * of cells, so the cell size is the one that leaves the gaps closest to whole multiples of it. Measured in cells,
 * the AI's jitter looks twice as large to half the true size, so the true size wins; on a perfectly clean grid half
 * the size fits as well, so of the near-best sizes the largest is taken. A gap counts as much as its weaker border
 * is strong, so the faint peaks of noise or texture inside a cell weigh little.
 */
export function detectCellSize(img: Image): number {
  const gaps: { g: number; w: number }[] = []
  for (const axis of ['x', 'y'] as const) {
    const at = spaced(borders(edgeProfile(img, axis)), 3)
    for (let i = 1; i < at.length; i++)
      gaps.push({ g: at[i]!.at - at[i - 1]!.at, w: Math.min(at[i]!.strength, at[i - 1]!.strength) })
  }
  if (gaps.length < 8) throw new Error('no pixel grid found — pass --px <cell size>')
  const cells = (g: number, t: number) => Math.max(1, Math.round(g / t))
  const total = gaps.reduce((a, { w }) => a + w, 0)
  const miss = (t: number) => gaps.reduce((a, { g, w }) => a + w * (g / t - cells(g, t)) ** 2, 0) / total
  const tried: { t: number; m: number }[] = []
  for (let t = 4; t <= Math.min(img.width, img.height) / 8; t *= 1.005) tried.push({ t, m: miss(t) })
  const least = Math.min(...tried.map((c) => c.m))
  let t = tried.filter((c) => c.m <= least * 1.25 + 0.002).at(-1)!.t
  // Refine to the mean cell size over the gaps that fit it.
  for (let i = 0; i < 3; i++) {
    const fit = gaps.filter(({ g }) => Math.abs(g / t - cells(g, t)) < 0.25)
    t = fit.reduce((a, { g, w }) => a + g * w, 0) / fit.reduce((a, { g, w }) => a + cells(g, t) * w, 0)
  }
  return t
}

/**
 * The borders that make the most consistent grid of cell size `t`: a chain chosen to keep as much border strength as
 * possible while every gap stays close to a whole number of cells. A stray peak half a cell from the grid would cost
 * more than it brings, so it is left out, while a faint border right on the grid is kept.
 */
function alignBorders(edges: Edge[], t: number): Edge[] {
  const strengths = edges.map((e) => e.strength).sort((a, b) => a - b)
  const weight = 16 * strengths[Math.floor(strengths.length / 2)]!
  const cost = (g: number) => weight * (g / t - Math.max(1, Math.round(g / t))) ** 2
  const score = edges.map((e) => e.strength)
  const prev = edges.map(() => -1)
  for (let i = 0; i < edges.length; i++) {
    for (let j = i - 1; j >= 0 && edges[i]!.at - edges[j]!.at <= 40 * t; j--) {
      const s = score[j]! - cost(edges[i]!.at - edges[j]!.at) + edges[i]!.strength
      if (s > score[i]!) [score[i], prev[i]] = [s, j]
    }
  }
  const chain: Edge[] = []
  for (let i = score.indexOf(Math.max(...score)); i >= 0; i = prev[i]!) chain.unshift(edges[i]!)
  return chain
}

/**
 * Cut lines along one axis: the aligned borders, with each gap between two of them split evenly into whole cells —
 * so the AI's drift never adds up. The axis gets its own mean cell size from the span of its borders (the AI's
 * pixels are not always square); before the first border and after the last, cells of that size are counted out,
 * and a remainder under half a cell is the image cropping a cell and is dropped.
 */
export function cutLines(img: Image, axis: 'x' | 'y', cell: number): number[] {
  const len = axis === 'x' ? img.width : img.height
  const edges = spaced(borders(edgeProfile(img, axis)), 3)
  let t = cell
  let at: number[] = []
  for (let pass = 0; pass < 3 && edges.length; pass++) {
    at = alignBorders(edges, t).map((e) => e.at)
    let n = 0
    for (let i = 1; i < at.length; i++) n += Math.max(1, Math.round((at[i]! - at[i - 1]!) / t))
    // Weighed against the shared size as if it were 8 cells' worth of evidence, so a few borders cannot skew it.
    t = (at[at.length - 1]! - at[0]! + 8 * cell) / (n + 8)
  }
  if (!at.length) {
    const n = Math.max(1, Math.round(len / t))
    return Array.from({ length: n + 1 }, (_, i) => Math.round((i * len) / n))
  }
  const lines: number[] = []
  const first = at[0]!
  const n = Math.floor(first / t)
  if (first - n * t >= t * 0.5) lines.push(0)
  for (let j = n; j >= 1; j--) lines.push(Math.round(first - j * t))
  for (let i = 1; i < at.length; i++) {
    const k = Math.max(1, Math.round((at[i]! - at[i - 1]!) / t))
    for (let j = 0; j < k; j++) lines.push(Math.round(at[i - 1]! + ((at[i]! - at[i - 1]!) * j) / k))
  }
  const last = at[at.length - 1]!
  const m = Math.floor((len - last) / t)
  for (let j = 0; j <= m; j++) lines.push(Math.round(last + j * t))
  if (len - (last + m * t) >= t * 0.5) lines.push(len)
  return lines
}

/** The majority colour of a cell's middle (its outer quarter on each side is the AI's blur and is ignored). */
function cellColour(
  img: Image,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
): [number, number, number, number] {
  const mx = Math.floor((x1 - x0) / 4)
  const my = Math.floor((y1 - y0) / 4)
  const buckets = new Map<number, { n: number; r: number; g: number; b: number; a: number }>()
  for (let y = y0 + my; y < y1 - my; y++) {
    for (let x = x0 + mx; x < x1 - mx; x++) {
      const i = (y * img.width + x) * 4
      const [r, g, b, a] = [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!, img.data[i + 3]!]
      const key = a < 128 ? -1 : ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
      const s = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0, a: 0 }
      s.n++
      s.r += r
      s.g += g
      s.b += b
      s.a += a
      buckets.set(key, s)
    }
  }
  let win = { n: 0, r: 0, g: 0, b: 0, a: 0 }
  for (const s of buckets.values()) if (s.n > win.n) win = s
  if (!win.n) return [0, 0, 0, 0]
  const avg = (v: number) => Math.round(v / win.n)
  return win.a / win.n < 128 ? [0, 0, 0, 0] : [avg(win.r), avg(win.g), avg(win.b), 255]
}

/** Samples one colour per grid cell. */
export function sampleGrid(img: Image, xs: number[], ys: number[]): Image {
  const out: Image = {
    width: xs.length - 1,
    height: ys.length - 1,
    data: new Uint8Array((xs.length - 1) * (ys.length - 1) * 4),
  }
  for (let j = 0; j < out.height; j++) {
    for (let i = 0; i < out.width; i++)
      out.data.set(cellColour(img, xs[i]!, xs[i + 1]!, ys[j]!, ys[j + 1]!), (j * out.width + i) * 4)
  }
  return out
}

const dist = (a: ArrayLike<number>, b: ArrayLike<number>) =>
  Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!)

/**
 * Folds near-identical shades into the most common one among them, so the AI's noise does not become new colours.
 * Returns the number of colours left.
 */
export function mergeShades(img: Image, threshold: number): number {
  const counts = new Map<number, number>()
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] === 0) continue
    const key = (img.data[i]! << 16) | (img.data[i + 1]! << 8) | img.data[i + 2]!
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const rgb = (k: number) => [k >> 16, (k >> 8) & 255, k & 255]
  const palette: number[][] = []
  const map = new Map<number, number[]>()
  for (const [key] of [...counts].sort((a, b) => b[1] - a[1])) {
    const c = rgb(key)
    const near = palette.find((p) => dist(p, c) <= threshold)
    if (near) map.set(key, near)
    else {
      palette.push(c)
      map.set(key, c)
    }
  }
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] === 0) continue
    img.data.set(map.get((img.data[i]! << 16) | (img.data[i + 1]! << 8) | img.data[i + 2]!)!, i)
  }
  return palette.length
}

/**
 * Makes the background transparent by flood-filling from the edges. `auto` uses the border's dominant colour, but
 * only when at least 85 % of the border is that colour — a full scene (banner, battle background) is left alone.
 */
export function clearBackground(img: Image, mode: string, tolerance = 40): boolean {
  const { width: w, height: h, data } = img
  const border: number[] = []
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x)
  for (let y = 1; y < h - 1; y++) border.push(y * w, y * w + w - 1)
  let bg: number[]
  if (mode.startsWith('#')) bg = [1, 3, 5].map((o) => parseInt(mode.slice(o, o + 2), 16))
  else {
    let best: number[] = []
    let bestN = 0
    for (const p of border) {
      const c = [data[p * 4]!, data[p * 4 + 1]!, data[p * 4 + 2]!]
      const n = border.filter(
        (q) => data[q * 4 + 3] && dist(c, data.subarray(q * 4, q * 4 + 3)) <= tolerance,
      ).length
      if (n > bestN) [best, bestN] = [c, n]
      if (bestN > border.length * 0.5) break
    }
    if (bestN < border.length * 0.85) return false
    bg = best
  }
  const seen = new Uint8Array(w * h)
  const stack = border.filter(
    (p) => data[p * 4 + 3] && dist(bg, data.subarray(p * 4, p * 4 + 3)) <= tolerance,
  )
  for (const p of stack) seen[p] = 1
  while (stack.length) {
    const p = stack.pop()!
    data.fill(0, p * 4, p * 4 + 4)
    const x = p % w
    for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
      if (
        q < 0 ||
        q >= w * h ||
        seen[q] ||
        !data[q * 4 + 3] ||
        dist(bg, data.subarray(q * 4, q * 4 + 3)) > tolerance
      )
        continue
      seen[q] = 1
      stack.push(q)
    }
  }
  return true
}

export type Options = { px?: number; merge: number; bg: string; size?: [number, number] }

/**
 * Brings the image to exactly `w`×`h`, centred: extra rows or columns are cropped, missing ones repeat the edge. Meant
 * for the pixel or two by which a batch's grids differ (an art pixel cut at the image's edge), not for resizing.
 */
export function fitTo(img: Image, w: number, h: number): Image {
  const out: Image = { width: w, height: h, data: new Uint8Array(w * h * 4) }
  const dx = Math.floor((img.width - w) / 2)
  const dy = Math.floor((img.height - h) / 2)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = Math.min(img.width - 1, Math.max(0, x + dx))
      const sy = Math.min(img.height - 1, Math.max(0, y + dy))
      out.data.set(
        img.data.subarray((sy * img.width + sx) * 4, (sy * img.width + sx) * 4 + 4),
        (y * w + x) * 4,
      )
    }
  }
  return out
}

export function unpixel(
  img: Image,
  opts: Options,
): { out: Image; cell: number; colours: number; cleared: boolean } {
  const cell = opts.px ?? detectCellSize(img)
  const grid = sampleGrid(img, cutLines(img, 'x', cell), cutLines(img, 'y', cell))
  const out = opts.size ? fitTo(grid, ...opts.size) : grid
  const cleared = opts.bg !== 'keep' && clearBackground(out, opts.bg)
  let colours = mergeShades(out, opts.merge)
  // 256 colours fit an indexed PNG, a third the size of a full-colour one: fold the closest shades a bit further.
  for (let t = opts.merge + 4; opts.merge > 0 && colours > 256 && t <= 48; t += 4)
    colours = mergeShades(out, t)
  return { out, cell, colours, cleared }
}

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'latin1')
  out.set(data, 8)
  let c = 0xffffffff
  for (const b of out.subarray(4, 8 + data.length)) c = CRC[(c ^ b) & 255]! ^ (c >>> 8)
  out.writeUInt32BE((c ^ 0xffffffff) >>> 0, 8 + data.length)
  return out
}

/** A PNG of the image: indexed (one byte a pixel plus a palette) when it has 256 colours or fewer, else RGBA. */
export function encodePng(img: Image): Buffer {
  const index = new Map<number, number>()
  const rows = Buffer.alloc((img.width + 1) * img.height) // each row starts with filter byte 0
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4
      const key = img.data[i + 3] ? Buffer.from(img.data.subarray(i, i + 4)).readUInt32BE(0) : 0
      let n = index.get(key)
      if (n === undefined) {
        if (index.size === 256) {
          const png = new PNG({ width: img.width, height: img.height })
          png.data.set(img.data)
          return PNG.sync.write(png, { colorType: 6 })
        }
        index.set(key, (n = index.size))
      }
      rows[y * (img.width + 1) + 1 + x] = n
    }
  }
  const keys = [...index.keys()]
  const header = Buffer.alloc(13)
  header.writeUInt32BE(img.width, 0)
  header.writeUInt32BE(img.height, 4)
  header.set([8, 3, 0, 0, 0], 8) // 8-bit, indexed colour
  const alpha = keys.map((k) => k & 255)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('PLTE', Buffer.from(keys.flatMap((k) => [k >>> 24, (k >>> 16) & 255, (k >>> 8) & 255]))),
    ...(alpha.some((a) => a < 255) ? [chunk('tRNS', Buffer.from(alpha))] : []),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function writePng(file: string, img: Image, scale = 1) {
  const big: Image = { width: img.width * scale, height: img.height * scale, data: new Uint8Array(0) }
  big.data = new Uint8Array(big.width * big.height * 4)
  for (let y = 0; y < big.height; y++) {
    for (let x = 0; x < big.width; x++) {
      const s = (Math.floor(y / scale) * img.width + Math.floor(x / scale)) * 4
      big.data.set(img.data.subarray(s, s + 4), (y * big.width + x) * 4)
    }
  }
  writeFileSync(file, encodePng(big))
}

function main() {
  const args = process.argv.slice(2)
  const flag = (name: string) => {
    const i = args.indexOf(`--${name}`)
    return i < 0 ? undefined : args.splice(i, 2)[1]
  }
  const px = flag('px')
  const size = flag('size')?.split('x').map(Number)
  const opts: Options = {
    px: px ? Number(px) : undefined,
    merge: Number(flag('merge') ?? 16),
    bg: flag('bg') ?? 'keep',
    size: size?.length === 2 && size.every((n) => n > 0) ? [size[0]!, size[1]!] : undefined,
  }
  const preview = Number(flag('preview') ?? 0)
  const [input, output] = args
  if (!input) {
    console.error(
      'usage: pnpm unpixel <image.png | folder> [out folder] [--px n] [--size WxH] [--merge n] [--bg auto|keep|#rrggbb] [--preview n]',
    )
    process.exit(1)
  }
  const isDir = statSync(input).isDirectory()
  const files = isDir
    ? readdirSync(input)
        .filter((f) => /\.png$/i.test(f))
        .map((f) => path.join(input, f))
    : [input]
  const outDir = output ?? path.join(isDir ? input : path.dirname(input), 'out')
  mkdirSync(outDir, { recursive: true })
  for (const file of files) {
    const src = PNG.sync.read(readFileSync(file))
    const { out, cell, colours, cleared } = unpixel(
      { width: src.width, height: src.height, data: src.data },
      opts,
    )
    const dest = path.join(outDir, path.basename(file))
    writePng(dest, out)
    if (preview > 1) writePng(dest.replace(/\.png$/i, `@${preview}x.png`), out, preview)
    const kb = (n: number) => `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`
    console.log(
      `${path.basename(file)}: ${src.width}×${src.height} → ${out.width}×${out.height} (cell ${cell.toFixed(2)} px, ${colours} colours${cleared ? ', background cleared' : ''}) ` +
        `${kb(statSync(file).size)} → ${kb(statSync(dest).size)}`,
    )
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
