/**
 * pnpm art — draws one 1024×256 banner per area (by biome, see scripts/content.ts) and the type-tinted trainer
 * badges (gold-framed variants for gym leaders / Elite Four / Champion). Original pixel art in the GBC palette;
 * output is committed to public/banners and public/trainers. Stale banners are removed.
 */
import { PNG } from 'pngjs'
import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { TYPE_COLORS } from '../src/theme/colors'
import { createRng, type Rng } from '../src/engine/rng'
import { AREAS, type Biome } from './content'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

type RGB = [number, number, number]
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
const shade = (h: string, f: number): string => {
  const [r, g, b] = hex(h)
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v * f)))
      .toString(16)
      .padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

class Canvas {
  px: Uint8Array
  constructor(
    public w: number,
    public h: number,
  ) {
    this.px = new Uint8Array(w * h * 4)
  }
  set(x: number, y: number, color: string) {
    x = Math.round(x)
    y = Math.round(y)
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return
    const [r, g, b] = hex(color)
    const i = (y * this.w + x) * 4
    this.px[i] = r
    this.px[i + 1] = g
    this.px[i + 2] = b
    this.px[i + 3] = 255
  }
  rect(x: number, y: number, w: number, h: number, color: string) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, color)
  }
  /** Vertical banded gradient with a checkerboard dither at every band boundary. */
  bands(y0: number, y1: number, colors: string[]) {
    const n = colors.length
    const bandH = (y1 - y0) / n
    for (let y = y0; y < y1; y++) {
      const band = Math.min(n - 1, Math.floor((y - y0) / bandH))
      const intoBand = y - y0 - band * bandH
      for (let x = 0; x < this.w; x++) {
        let c = colors[band]!
        if (band > 0 && intoBand < 2 && (x + y) % 2 === 0) c = colors[band - 1]!
        this.set(x, y, c)
      }
    }
  }
  disc(cx: number, cy: number, r: number, color: string) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) this.set(cx + x, cy + y, color)
  }
  ridge(heightAt: (x: number) => number, color: string, maxY = this.h, highlight?: string) {
    for (let x = 0; x < this.w; x++) {
      const top = Math.round(heightAt(x))
      for (let y = top; y < maxY; y++) this.set(x, y, color)
      if (highlight) this.set(x, top, highlight)
    }
  }
  tri(cx: number, top: number, bottom: number, halfW: number, color: string) {
    for (let y = top; y < bottom; y++) {
      const half = Math.round(((y - top) / Math.max(1, bottom - top)) * halfW)
      for (let x = -half; x <= half; x++) this.set(cx + x, y, color)
    }
  }
  write(file: string, scale: number) {
    const png = new PNG({ width: this.w * scale, height: this.h * scale })
    for (let y = 0; y < this.h * scale; y++) {
      for (let x = 0; x < this.w * scale; x++) {
        const s = (Math.floor(y / scale) * this.w + Math.floor(x / scale)) * 4
        const d = (y * this.w * scale + x) * 4
        png.data[d] = this.px[s]!
        png.data[d + 1] = this.px[s + 1]!
        png.data[d + 2] = this.px[s + 2]!
        png.data[d + 3] = this.px[s + 3]!
      }
    }
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, PNG.sync.write(png))
  }
}

const W = 256
const H = 64
const SCALE = 4
const peak = (x: number, cx: number, h: number, w: number) => Math.max(0, h - Math.abs(x - cx) * (h / w))

// ---------------------------------------------------------------- shared props

function pine(c: Canvas, cx: number, baseY: number, height: number, color: string, light: string) {
  c.rect(cx - 1, baseY - 3, 2, 3, '#3a2c20')
  const top = baseY - height
  const tierH = Math.max(3, Math.floor(height / 4))
  for (let y = top; y < baseY - 2; y++) {
    const t = (y - top) / height
    const tier = ((y - top) % tierH) / tierH
    const half = Math.max(1, Math.round((t * 0.55 + tier * 0.25) * height * 0.45))
    for (let x = -half; x <= half; x++) c.set(cx + x, y, x < -half / 3 && (x + y) % 2 === 0 ? light : color)
  }
}

function palm(c: Canvas, x: number, baseY: number, h: number) {
  for (let y = 0; y < h; y++) c.set(x + Math.round(Math.sin(y / 6) * 2), baseY - y, y % 3 ? '#8a5a3a' : '#5f3a24')
  const tx = x + Math.round(Math.sin(h / 6) * 2)
  const ty = baseY - h
  for (const [dx, dy] of [
    [-1, 0],
    [1, 0],
    [-1, 1],
    [1, 1],
  ] as const)
    for (let k = 1; k < 9; k++) c.set(tx + dx * k, ty + dy * Math.round(k * 0.4) + (k > 5 ? 1 : 0), k % 2 ? '#3f7a3a' : '#5d9c42')
}

function cloud(c: Canvas, x: number, y: number, s: number, light = '#f7f2e0', dark = '#d9eaef') {
  c.disc(x, y + 1, s, dark)
  c.disc(x + s, y - 1, s + 1, light)
  c.disc(x + s * 2 + 1, y + 1, s, light)
  c.rect(x - s, y + 1, s * 4 + 2, s, light)
  c.rect(x - s, y + s, s * 4 + 2, 1, dark)
}

function stars(c: Canvas, rng: Rng, n: number, maxY: number) {
  for (let i = 0; i < n; i++) {
    const x = rng.int(0, c.w - 1)
    const y = rng.int(0, maxY)
    c.set(x, y, rng.next() < 0.2 ? '#e8c44a' : '#f7f2e0')
    if (rng.next() < 0.12) {
      c.set(x + 1, y, '#8a82a0')
      c.set(x - 1, y, '#8a82a0')
      c.set(x, y + 1, '#8a82a0')
      c.set(x, y - 1, '#8a82a0')
    }
  }
}

function waves(c: Canvas, rng: Rng, y0: number, n: number, colors: string[]) {
  for (let i = 0; i < n; i++) c.rect(rng.int(0, W), rng.int(y0 + 1, H - 1), rng.int(2, 6), 1, colors[i % colors.length]!)
}

// ---------------------------------------------------------------- scenes

type MeadowVariant = 'meadow' | 'spring' | 'autumn' | 'dusk' | 'coast'
const MEADOW: Record<
  MeadowVariant,
  { sky: string[]; far: string[]; mid: string[]; near: string[]; tuft: string; flowers: string[]; cloud: boolean }
> = {
  meadow: { sky: ['#7fc4df', '#94cfe5', '#abdaea', '#c6e7ef'], far: ['#9cc87a', '#b8dc98'], mid: ['#68a941', '#8cc06a'], near: ['#4a8a34', '#5d9c42'], tuft: '#2f6a28', flowers: ['#e8c44a', '#f7f2e0'], cloud: true },
  spring: { sky: ['#8fd0e8', '#a8dcee', '#c2e8f2', '#dff2f5'], far: ['#b0d890', '#c8e8a8'], mid: ['#7cc05a', '#98d078'], near: ['#5aa048', '#6cb058'], tuft: '#3a7a30', flowers: ['#d685ad', '#f7f2e0', '#e8c44a'], cloud: true },
  autumn: { sky: ['#9fc8dc', '#b8d6e0', '#d8e2d8', '#ecdcc0'], far: ['#d8a860', '#e8c080'], mid: ['#c07a3a', '#d8904a'], near: ['#8a5a30', '#a06a3a'], tuft: '#5f3a24', flowers: ['#e8b44a', '#c2452d'], cloud: true },
  dusk: { sky: ['#3e2a52', '#6b3a6b', '#b04a52', '#e8905a'], far: ['#6a5a7a', '#7a6a8a'], mid: ['#4a6a3a', '#5a7a44'], near: ['#34502a', '#3e5c30'], tuft: '#1f3020', flowers: ['#e8c44a'], cloud: false },
  coast: { sky: ['#7fc4df', '#94cfe5', '#abdaea', '#c6e7ef'], far: ['#9cc87a', '#b8dc98'], mid: ['#68a941', '#8cc06a'], near: ['#4a8a34', '#5d9c42'], tuft: '#2f6a28', flowers: ['#f7f2e0'], cloud: true },
}

function meadow(variant: MeadowVariant, seed: number) {
  const p = MEADOW[variant]
  const c = new Canvas(W, H)
  const rng = createRng(seed)
  c.bands(0, 40, p.sky)
  if (variant === 'dusk') {
    c.disc(200, 36, 9, '#f0b060')
    stars(c, rng, 18, 16)
  }
  if (p.cloud) for (let i = 0; i < 3; i++) cloud(c, rng.int(10, 230), rng.int(5, 16), rng.int(2, 4))
  const ph = rng.next() * 6
  c.ridge((x) => 30 + Math.sin(x * 0.03 + ph) * 4 + Math.sin(x * 0.11) * 1.5, p.far[0]!, H, p.far[1])
  c.ridge((x) => 38 + Math.sin(x * 0.045 + 2 + ph) * 4, p.mid[0]!, H, p.mid[1])
  if (variant === 'coast') {
    // the right third is beach and sea
    for (let x = 160; x < W; x++) for (let y = 36; y < H; y++) c.set(x, y, y < 38 + (x - 160) * 0.02 ? '#e2cf8e' : '#547acc')
    waves(c, rng, 38, 60, ['#9fb8e8', '#c6e7ef'])
    c.ridge((x) => (x < 170 ? 47 + Math.sin(x * 0.02 + 1) * 2 : H), p.near[0]!, H, p.near[1])
  } else c.ridge((x) => 47 + Math.sin(x * 0.02 + 1 + ph) * 2, p.near[0]!, H, p.near[1])
  // winding dirt path
  const px = rng.int(110, 190)
  for (let y = 40; y < H; y++) {
    const t = (y - 40) / (H - 40)
    const cx = px + Math.sin(t * 3.2) * 18 - t * 30
    const half = 2 + t * 12
    for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) c.set(x, y, (x + y) % 5 === 0 ? '#9b892e' : '#c0a256')
  }
  if (variant === 'meadow' || variant === 'autumn') {
    for (let x = 12; x < 100; x += 8) c.rect(x, 43, 2, 6, '#8a5a3a')
    c.rect(12, 44, 90, 1, '#a8744a')
    c.rect(12, 47, 90, 1, '#a8744a')
  }
  c.rect(214, 40, 2, 9, '#5f3a24')
  c.rect(208, 36, 14, 6, '#a8744a')
  c.rect(210, 38, 10, 1, '#5f3a24')
  for (let i = 0; i < 180; i++) {
    const x = rng.int(0, W - 1)
    const y = rng.int(44, H - 1)
    if (variant === 'coast' && x > 165) continue
    const r = rng.next()
    if (r < 0.7) {
      c.set(x, y, p.tuft)
      c.set(x + 1, y - 1, p.tuft)
    } else c.set(x, y, p.flowers[Math.floor(r * 10) % p.flowers.length]!)
  }
  return c
}

function forest(seed: number) {
  const c = new Canvas(W, H)
  const rng = createRng(seed)
  c.bands(0, H, ['#bfe0a0', '#9fd08a', '#6fae5a', '#3f7a3a'])
  for (let x = -4; x < W + 8; x += 9) pine(c, x + rng.int(-2, 2), 42, rng.int(22, 30), '#5d9c52', '#7ab86a')
  for (let x = 0; x < W + 8; x += 13) pine(c, x + rng.int(-3, 3), 52, rng.int(30, 40), '#3f7a3a', '#5d9c52')
  c.rect(0, 52, W, 12, '#3a2c20')
  for (let x = 0; x < W; x++) if (x % 3 === 0) c.set(x, 52, '#5a4a30')
  for (let x = 6; x < W + 20; x += 34) pine(c, x + rng.int(-4, 4), H + 2, rng.int(48, 60), '#1f3a24', '#2f5a30')
  for (let s = 0; s < 4; s++) {
    const x0 = 40 + s * 58
    for (let y = 0; y < 52; y++)
      for (let k = 0; k < 6; k++) if ((y + k) % 3 === 0 && rng.next() < 0.35) c.set(x0 + k + y * 0.4, y, '#e8f0c0')
  }
  for (let i = 0; i < 30; i++) c.set(rng.int(0, W), rng.int(10, 50), '#e8e070')
  return c
}

function mountain(seed: number) {
  const c = new Canvas(W, H)
  const rng = createRng(seed)
  c.bands(0, H, ['#140f1e', '#1f1a2e', '#2a2438', '#3e3552'])
  stars(c, rng, 90, 34)
  c.disc(206, 15, 10, '#f7f2e0')
  c.disc(210, 12, 2, '#d8d0b8')
  c.disc(202, 19, 3, '#d8d0b8')
  c.ridge((x) => H - Math.max(peak(x, 40, 34, 50), peak(x, 120, 42, 60), peak(x, 230, 30, 45), 10), '#4a4460')
  c.ridge((x) => H - Math.max(peak(x, 80, 30, 55), peak(x, 170, 36, 60), 6) + (x % 7 === 0 ? 1 : 0), '#6b6480', H, '#8a82a0')
  for (let y = 0; y < 16; y++) {
    const half = Math.round(Math.sqrt(Math.max(0, 1 - ((y - 16) / 16) ** 2)) * 13)
    for (let x = -half; x <= half; x++) c.set(170 + x, H - 16 + y, '#140f1e')
  }
  for (let i = 0; i < 12; i++) c.disc(rng.int(0, W), H - 1, rng.int(2, 4), '#3e3552')
  for (let i = 0; i < 8; i++) c.set(rng.int(20, 240), rng.int(40, 60), '#c6e7ef')
  return c
}

type CaveVariant = 'cave' | 'dirtcave' | 'crystal' | 'ice'
const CAVE: Record<CaveVariant, { bg: string[]; rock: string; rockHi: string; floor: string; glint: string[] }> = {
  cave: { bg: ['#140f1e', '#1f1a2a', '#2a2438'], rock: '#4a4460', rockHi: '#6b6480', floor: '#3e3552', glint: ['#9c9caf'] },
  dirtcave: { bg: ['#1e140c', '#2e2014', '#3e2c1c'], rock: '#5f4a3c', rockHi: '#8a6a50', floor: '#4a3626', glint: ['#c0a256'] },
  crystal: { bg: ['#0c1428', '#142040', '#1c2c58'], rock: '#2a3a6a', rockHi: '#4a5a9a', floor: '#223260', glint: ['#80b8e6', '#c6e7ef', '#d685ad'] },
  ice: { bg: ['#1c3448', '#2a4c64', '#3a6480'], rock: '#80b8b6', rockHi: '#c6e7ef', floor: '#547acc', glint: ['#f7f2e0', '#c6e7ef'] },
}

function cave(variant: CaveVariant, seed: number) {
  const p = CAVE[variant]
  const c = new Canvas(W, H)
  const rng = createRng(seed)
  c.bands(0, H, p.bg)
  // back wall boulders
  for (let i = 0; i < 26; i++) c.disc(rng.int(0, W), rng.int(14, 44), rng.int(4, 9), shade(p.rock, 0.7))
  // stalactites
  for (let x = 0; x < W; x += rng.int(5, 11)) {
    const len = rng.int(5, variant === 'ice' ? 18 : 14)
    for (let y = 0; y < len; y++) {
      const half = Math.round((1 - y / len) * 3)
      for (let k = -half; k <= half; k++) c.set(x + k, y, k === -half ? p.rockHi : p.rock)
    }
  }
  // floor & stalagmites
  c.ridge((x) => 50 + Math.sin(x * 0.07 + seed) * 3, p.floor, H, p.rockHi)
  for (let i = 0; i < 9; i++) {
    const x = rng.int(0, W)
    c.tri(x, rng.int(34, 44), 52, rng.int(3, 5), p.rock)
  }
  if (variant === 'dirtcave')
    for (let i = 0; i < 7; i++) {
      const x = rng.int(10, 246)
      c.disc(x, 57, 4, '#140c08')
      c.rect(x - 2, 52, 4, 3, '#8a5a3a') // a Diglett peeking out
      c.set(x - 1, 53, '#140c08')
      c.set(x + 1, 53, '#140c08')
      c.set(x, 54, '#d685ad')
    }
  if (variant === 'crystal')
    for (let i = 0; i < 14; i++) {
      const x = rng.int(0, W)
      const y = rng.int(40, 58)
      c.tri(x, y - rng.int(6, 12), y, 2, p.glint[i % p.glint.length]!)
    }
  if (variant === 'ice') {
    c.bands(56, H, ['#547acc', '#3f5fa8'])
    waves(c, rng, 56, 40, ['#c6e7ef'])
  }
  for (let i = 0; i < 40; i++) c.set(rng.int(0, W), rng.int(8, 48), p.glint[i % p.glint.length]!)
  return c
}

function bridge(variant: 'bridge' | 'cycling', seed: number) {
  const c = new Canvas(W, H)
  const rng = createRng(seed)
  if (variant === 'bridge') {
    c.bands(0, 40, ['#5a3a6b', '#8b3a5a', '#c2452d', '#ca6e29', '#e8b44a'])
    c.disc(64, 40, 12, '#f7e08a')
  } else {
    c.bands(0, 40, ['#6fb8da', '#8ccbe0', '#abdaea'])
    cloud(c, 40, 10, 3)
    cloud(c, 170, 6, 4)
  }
  c.bands(40, H, ['#3f5fa8', '#547acc', '#3f5fa8'])
  waves(c, rng, 40, 110, variant === 'bridge' ? ['#e8c44a', '#9fb8e8'] : ['#9fb8e8', '#c6e7ef'])
  const deck = variant === 'bridge' ? '#8a5a3a' : '#9c9caf'
  const dark = variant === 'bridge' ? '#5f3a24' : '#6b6480'
  for (let x = 8; x < W; x += 48) c.rect(x, 46, 6, H - 46, variant === 'bridge' ? '#5f4a3c' : '#7a7a90')
  c.rect(0, 43, W, 4, deck)
  for (let x = 0; x < W; x += 4) c.set(x, 44, dark)
  c.rect(0, 47, W, 1, '#2a2438')
  c.rect(0, 35, W, 1, dark)
  c.rect(0, 38, W, 1, dark)
  for (let x = 2; x < W; x += 12) c.rect(x, 34, 2, 9, dark)
  if (variant === 'cycling') {
    for (let x = 0; x < W; x += 8) c.rect(x, 45, 4, 1, '#f7f2e0') // lane markings
    for (let i = 0; i < 3; i++) {
      const x = 40 + i * 80
      c.disc(x, 41, 2, '#2a2438')
      c.disc(x + 7, 41, 2, '#2a2438')
      c.rect(x, 38, 8, 1, '#c2452d')
    }
  } else
    for (let x = 20; x < W; x += 37) {
      c.rect(x, 41, 3, 2, '#e8b44a')
      c.set(x, 41, '#fbeeb0')
    }
  return c
}

function sea(seed: number, withIsland = true) {
  const c = new Canvas(W, H)
  const rng = createRng(seed)
  c.bands(0, 34, ['#6fb8da', '#8ccbe0', '#abdaea', '#c6e7ef'])
  c.disc(214, 14, 7, '#fbeeb0')
  cloud(c, 30, 12, 3)
  cloud(c, 120, 8, 3)
  c.bands(34, H, ['#6f94dc', '#547acc', '#3f5fa8', '#34508c'])
  waves(c, rng, 34, 160, ['#9fb8e8', '#c6e7ef', '#f7f2e0'])
  if (withIsland) {
    c.ridge((x) => 34 - Math.max(peak(x, 70, 8, 30), peak(x, 190, 5, 20)), '#68a941', 35, '#8cc06a')
    for (const x of [58, 196]) c.rect(x - 8, 33, 16, 2, '#e2cf8e')
  }
  for (let i = 0; i < 5; i++) {
    const x = rng.int(10, 246)
    const y = rng.int(42, 60)
    c.disc(x, y, 2, '#6b6480')
    c.set(x - 1, y - 2, '#9c9caf')
  }
  return c
}

function tower(seed: number) {
  const c = new Canvas(W, H)
  const rng = createRng(seed)
  c.bands(0, H, ['#1a1030', '#2a1a48', '#3e2a5a', '#4a3a64'])
  stars(c, rng, 40, 30)
  c.disc(46, 14, 7, '#e8e0f8')
  c.disc(49, 12, 7, '#2a1a48') // crescent
  // the tower
  const cx = 150
  for (let tier = 0; tier < 6; tier++) {
    const y = 58 - tier * 9
    const half = 18 - tier * 2
    c.rect(cx - half, y - 8, half * 2, 8, tier % 2 ? '#5a4a73' : '#4a3a64')
    c.rect(cx - half - 2, y - 9, half * 2 + 4, 2, '#2a2438')
    for (let wx = cx - half + 4; wx < cx + half - 3; wx += 6) c.rect(wx, y - 6, 2, 3, rng.next() < 0.5 ? '#e8c44a' : '#1a1030')
  }
  c.tri(cx, 0, 6, 5, '#2a2438')
  // graves and ghostly wisps
  for (let x = 10; x < W; x += 22) if (Math.abs(x - cx) > 26) {
    c.rect(x, 54, 5, 7, '#6b6480')
    c.rect(x + 1, 53, 3, 1, '#6b6480')
    c.rect(x + 2, 56, 1, 3, '#3e3552')
  }
  c.rect(0, 61, W, 3, '#2a2438')
  for (let i = 0; i < 6; i++) {
    const x = rng.int(0, W)
    const y = rng.int(20, 48)
    c.disc(x, y, 3, '#8b3589')
    c.disc(x, y, 2, '#b67193')
    c.set(x - 1, y - 1, '#f7f2e0')
    c.set(x + 1, y - 1, '#f7f2e0')
  }
  return c
}

function city(variant: 'city' | 'plateau', seed: number) {
  const c = new Canvas(W, H)
  const rng = createRng(seed)
  if (variant === 'city') {
    c.bands(0, H, ['#6fb8da', '#94cfe5', '#c6e7ef', '#e8e0c8'])
    for (let x = 0; x < W; ) {
      const w = rng.int(12, 24)
      const h = rng.int(14, 34)
      const col = rng.next() < 0.5 ? '#9c9caf' : '#8a82a0'
      c.rect(x, H - h, w - 2, h, col)
      for (let wy = H - h + 3; wy < H - 3; wy += 5) for (let wx = x + 2; wx < x + w - 4; wx += 4) c.rect(wx, wy, 2, 2, '#c6e7ef')
      x += w
    }
    // Silph tower
    c.rect(112, 4, 32, 60, '#6b6480')
    c.rect(110, 2, 36, 3, '#2a2438')
    for (let wy = 8; wy < 60; wy += 5) for (let wx = 116; wx < 140; wx += 5) c.rect(wx, wy, 3, 2, wy < 20 ? '#e8c44a' : '#c6e7ef')
    c.rect(120, 10, 16, 8, '#c2452d')
    c.rect(124, 12, 8, 1, '#f7f2e0')
    c.rect(124, 14, 8, 1, '#f7f2e0')
    c.rect(124, 16, 8, 1, '#f7f2e0')
  } else {
    c.bands(0, 44, ['#3e2a52', '#8b3a5a', '#c2452d', '#e8b44a'])
    stars(c, rng, 20, 12)
    c.ridge((x) => 44 - Math.max(peak(x, 40, 20, 50), peak(x, 220, 24, 50)), '#4a4460', H)
    c.ridge((x) => 48 - Math.max(peak(x, 128, 10, 120), 0), '#6b6480', H, '#8a82a0')
    // the League building
    c.rect(96, 22, 64, 26, '#e8e0c8')
    c.tri(128, 8, 22, 36, '#c2452d')
    c.rect(92, 21, 72, 2, '#2a2438')
    c.rect(122, 34, 12, 14, '#2a2438')
    for (let wx = 102; wx < 156; wx += 8) if (wx < 118 || wx > 136) c.rect(wx, 28, 4, 5, '#e8c44a')
    c.disc(128, 15, 3, '#e8b44a')
    for (const fx of [84, 172]) {
      c.rect(fx, 20, 1, 28, '#2a2438')
      c.rect(fx + 1, 20, 6, 4, fx < 128 ? '#547acc' : '#c2452d')
    }
  }
  return c
}

function plant(seed: number) {
  const c = new Canvas(W, H)
  const rng = createRng(seed)
  c.bands(0, H, ['#1e1a2a', '#2e2a3e', '#3e3a52', '#4a4a5a'])
  for (let i = 0; i < 4; i++) cloud(c, rng.int(0, 230), rng.int(2, 14), rng.int(4, 6), '#5a5670', '#3e3a52')
  c.rect(40, 26, 150, 38, '#6b6480')
  for (let x = 44; x < 186; x += 10) c.rect(x, 32, 6, 8, rng.next() < 0.6 ? '#e8c44a' : '#2a2438')
  c.rect(40, 24, 150, 3, '#2a2438')
  for (const [x, h] of [
    [60, 18],
    [90, 24],
    [150, 20],
  ] as const) {
    c.rect(x, 24 - h, 8, h, '#8a82a0')
    c.rect(x - 1, 24 - h, 10, 2, '#c2452d')
  }
  // lightning
  for (const lx of [22, 214]) {
    let x = lx
    for (let y = 0; y < 30; y++) {
      c.set(x, y, '#fbeeb0')
      c.set(x + 1, y, '#e8c44a')
      if (y % 5 === 4) x += rng.next() < 0.5 ? -2 : 2
    }
  }
  for (let x = 0; x < W; x += 64) {
    c.rect(x + 10, 30, 2, 34, '#5f4a3c')
    c.rect(x + 4, 32, 14, 1, '#5f4a3c')
  }
  c.rect(0, 62, W, 2, '#2a2438')
  return c
}

function mansion(seed: number) {
  const c = new Canvas(W, H)
  const rng = createRng(seed)
  c.bands(0, H, ['#2a1a2e', '#5a2a3a', '#8b3a3a', '#c2452d'])
  // volcano
  c.ridge((x) => H - peak(x, 200, 44, 70), '#4a3a3a', H)
  c.rect(194, 18, 12, 4, '#e8b44a')
  for (let i = 0; i < 20; i++) c.disc(200 + rng.int(-10, 10), rng.int(0, 16), rng.int(2, 4), i % 2 ? '#6b6480' : '#4a4460')
  // ruined mansion
  c.rect(30, 26, 110, 38, '#8a82a0')
  c.tri(85, 8, 26, 58, '#5a4f73')
  for (let x = 38; x < 132; x += 14) c.rect(x, 34, 6, 10, rng.next() < 0.4 ? '#e8b44a' : '#2a2438')
  for (let i = 0; i < 40; i++) c.set(rng.int(30, 140), rng.int(10, 40), '#2a2438') // broken roof
  c.rect(78, 48, 14, 16, '#2a2438')
  c.rect(0, 60, W, 4, '#3a2c20')
  for (let i = 0; i < 16; i++) c.set(rng.int(0, W), rng.int(20, 60), '#e8b44a') // embers
  return c
}

function safari(seed: number) {
  const c = new Canvas(W, H)
  const rng = createRng(seed)
  c.bands(0, 38, ['#e8905a', '#e8b44a', '#f0d080', '#f7e8b0'])
  c.disc(60, 30, 10, '#fbeeb0')
  c.ridge((x) => 36 + Math.sin(x * 0.03) * 3, '#c0a256', H, '#d8c078')
  c.rect(150, 44, 70, 8, '#547acc') // watering hole
  c.rect(152, 44, 66, 1, '#9fb8e8')
  for (const tx of [30, 110, 236]) {
    c.rect(tx, 26, 2, 16, '#5f3a24')
    c.rect(tx - 12, 22, 26, 4, '#4a6a2a')
    c.rect(tx - 9, 20, 20, 2, '#5a7a34')
  }
  for (let i = 0; i < 260; i++) {
    const x = rng.int(0, W)
    const y = rng.int(40, H - 1)
    if (x > 148 && x < 222 && y > 43 && y < 53) continue
    c.set(x, y, rng.next() < 0.5 ? '#9b892e' : '#e8c44a')
    c.set(x, y - 1, '#9b892e')
  }
  for (let i = 0; i < 6; i++) c.disc(rng.int(0, W), rng.int(54, 62), rng.int(2, 3), '#8a82a0')
  return c
}

function victory(seed: number) {
  const c = new Canvas(W, H)
  const rng = createRng(seed)
  c.bands(0, H, ['#0e0a16', '#1a1426', '#2a2438', '#3e3552'])
  for (let x = 0; x < W; x += rng.int(5, 10)) {
    const len = rng.int(4, 14)
    for (let y = 0; y < len; y++) {
      const half = Math.round((1 - y / len) * 3)
      for (let k = -half; k <= half; k++) c.set(x + k, y, k === -half ? '#5a4f73' : '#3e3552')
    }
  }
  c.ridge((x) => (x < 70 ? 14 + x * 0.3 + Math.sin(x * 0.4) * 2 : H), '#5a4f73', H, '#7a6f93')
  c.ridge((x) => (x > 190 ? 14 + (W - x) * 0.3 + Math.sin(x * 0.5) * 2 : H), '#5a4f73', H, '#7a6f93')
  for (let y = 28; y < H; y++) {
    const half = 4 + ((y - 28) / (H - 28)) * 28
    for (let x = Math.round(128 - half); x <= Math.round(128 + half); x++)
      c.set(x, y, (Math.floor(x / 4) + Math.floor(y / 3)) % 2 === 0 ? '#9c9caf' : '#8a8aa0')
  }
  c.rect(120, 16, 16, 12, '#140f1e')
  c.rect(118, 14, 20, 2, '#9c9caf')
  for (const [tx, ty] of [
    [88, 40],
    [168, 40],
    [100, 30],
    [156, 30],
  ] as const) {
    c.rect(tx, ty, 2, 8, '#5f4a3c')
    c.rect(tx - 1, ty - 3, 4, 3, '#c2452d')
    c.rect(tx, ty - 5, 2, 3, '#e8b44a')
  }
  return c
}

function island(seed: number) {
  const c = new Canvas(W, H)
  const rng = createRng(seed)
  c.bands(0, 36, ['#8fc8e8', '#b8dcee', '#f0c8d8', '#fbe0c0'])
  cloud(c, 40, 10, 3, '#fbeeee', '#f0c8d8')
  cloud(c, 190, 14, 3, '#fbeeee', '#f0c8d8')
  c.bands(36, H, ['#6fb8da', '#547acc', '#3f5fa8'])
  waves(c, rng, 36, 120, ['#c6e7ef', '#f7f2e0'])
  c.ridge((x) => 38 - Math.max(peak(x, 128, 10, 60), 0), '#e2cf8e', 44)
  c.ridge((x) => 36 - Math.max(peak(x, 128, 9, 40), 0), '#68a941', 39, '#8cc06a')
  palm(c, 100, 36, 18)
  palm(c, 150, 35, 22)
  // a pink glint where Mew waits
  c.disc(128, 22, 2, '#d685ad')
  c.set(127, 21, '#f7f2e0')
  return c
}

const SCENES: Record<Biome, (seed: number) => Canvas> = {
  meadow: (s) => meadow('meadow', s),
  spring: (s) => meadow('spring', s),
  autumn: (s) => meadow('autumn', s),
  dusk: (s) => meadow('dusk', s),
  coast: (s) => meadow('coast', s),
  forest,
  mountain,
  cave: (s) => cave('cave', s),
  dirtcave: (s) => cave('dirtcave', s),
  crystal: (s) => cave('crystal', s),
  ice: (s) => cave('ice', s),
  bridge: (s) => bridge('bridge', s),
  cycling: (s) => bridge('cycling', s),
  sea: (s) => sea(s),
  tower,
  city: (s) => city('city', s),
  plateau: (s) => city('plateau', s),
  plant,
  mansion,
  safari,
  victory,
  island,
}

// ---------------------------------------------------------------- trainer badges

function trainerBadge(color: string, leader = false) {
  const S = 24
  const c = new Canvas(S, S)
  const cx = 11.5
  const cy = 11.5
  const light = shade(color, 1.25)
  const dark = shade(color, 0.72)
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const d = Math.hypot(x - cx, y - cy)
      if (d <= 11.6) c.set(x, y, '#2a2438')
      if (leader && d <= 10.8 && d > 9.6) c.set(x, y, (x + y) % 3 ? '#e8b44a' : '#fbeeb0')
      if (d <= (leader ? 9.6 : 10.4)) c.set(x, y, y < 10 && x < 12 && (x + y) % 2 === 0 ? light : color)
      if (d <= 10.4 && d > 9.2 && y > 12 && !leader) c.set(x, y, dark)
    }
  const ink = '#2a2438'
  const face = shade(color, 0.42)
  const r = leader ? 9.6 : 10.4
  const inside = (x: number, y: number) => Math.hypot(x - cx, y - cy) <= r
  const put = (x: number, y: number, col = ink) => inside(x, y) && c.set(x, y, col)
  for (const [y, x0, x1] of [
    [8, 9, 14],
    [9, 8, 15],
    [10, 8, 15],
    [11, 8, 15],
    [12, 9, 14],
    [13, 10, 13],
  ] as [number, number, number][])
    for (let x = x0; x <= x1; x++) put(x, y, face)
  for (const [y, x0, x1] of [
    [3, 10, 13],
    [4, 9, 14],
    [5, 8, 15],
    [6, 8, 15],
  ] as [number, number, number][])
    for (let x = x0; x <= x1; x++) put(x, y)
  for (let x = 5; x <= 15; x++) put(x, 7)
  c.set(11, 4, '#f7f2e0')
  c.set(12, 4, light)
  for (let y = 15; y <= 23; y++) {
    const half = Math.min(8, 4 + (y - 15))
    for (let x = 12 - half; x <= 11 + half; x++) put(x, y)
  }
  put(11, 15, light)
  put(12, 15, light)
  if (leader) {
    // a little gold crown on the cap
    for (const [x, y] of [
      [10, 2],
      [12, 1],
      [14, 2],
      [10, 3],
      [11, 3],
      [12, 3],
      [13, 3],
      [14, 3],
    ] as const)
      c.set(x, y, '#e8b44a')
  }
  return c
}

function main() {
  const bannerDir = path.join(ROOT, 'public', 'banners')
  const keep = new Set<string>()
  AREAS.forEach((a, i) => {
    const file = `${a.key}.png`
    keep.add(file)
    SCENES[a.biome](1000 + i * 17).write(path.join(bannerDir, file), SCALE)
  })
  for (const f of readdirSync(bannerDir)) if (f.endsWith('.png') && !keep.has(f)) unlinkSync(path.join(bannerDir, f))

  const trainerDir = path.join(ROOT, 'public', 'trainers')
  for (const [type, color] of Object.entries(TYPE_COLORS)) {
    if (type === 'base') continue
    trainerBadge(color).write(path.join(trainerDir, `${type}.png`), 4)
    trainerBadge(color, true).write(path.join(trainerDir, `leader-${type}.png`), 4)
  }
  trainerBadge('#6b6480').write(path.join(trainerDir, 'default.png'), 4)
  console.log(`✓ ${AREAS.length} banners → public/banners, ${18 * 2 + 1} badges → public/trainers`)
}

main()
