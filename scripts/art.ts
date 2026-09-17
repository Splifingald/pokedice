/**
 * pnpm art — publishes the area banner scenes (118×16 pixel strips from graphics/banners, picked per area in
 * scripts/content.ts) and draws the type-tinted trainer badges (gold-framed variants for gym leaders / Elite Four /
 * Champion). Output is committed to public/banners and public/trainers. Stale banners are removed.
 */
import { PNG } from 'pngjs'
import { copyFileSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { TYPE_COLORS } from '../src/theme/colors'
import { AREAS, BANNER_SCENES } from './content'

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
  const sourceDir = path.join(ROOT, 'graphics', 'banners')
  const keep = new Set(BANNER_SCENES.map((scene) => `${scene}.png`))
  for (const a of AREAS) if (!BANNER_SCENES.includes(a.banner.scene)) throw new Error(`${a.name}: unknown banner ${a.banner.scene}`)
  for (const f of keep) copyFileSync(path.join(sourceDir, f), path.join(bannerDir, f))
  for (const f of readdirSync(bannerDir)) if (f.endsWith('.png') && !keep.has(f)) unlinkSync(path.join(bannerDir, f))

  const trainerDir = path.join(ROOT, 'public', 'trainers')
  for (const [type, color] of Object.entries(TYPE_COLORS)) {
    if (type === 'base') continue
    trainerBadge(color).write(path.join(trainerDir, `${type}.png`), 4)
    trainerBadge(color, true).write(path.join(trainerDir, `leader-${type}.png`), 4)
  }
  trainerBadge('#6b6480').write(path.join(trainerDir, 'default.png'), 4)
  console.log(`✓ ${keep.size} banner scenes → public/banners, ${18 * 2 + 1} badges → public/trainers`)
}

main()
