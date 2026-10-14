/**
 * pnpm app-icons — the installed app's icons and the notifications' own pictures (docs/27), drawn from the game's
 * pixel maps at whole-pixel scales so they stay crisp: the favicon's ball for the app (Android, the iPhone's Home
 * Screen) and the Day Care's Egg for its notices. Writes public/icons/*.png; run again after changing a map.
 *
 *   icon-192.png, icon-512.png   the app icon: the ball on the morning sky, opaque (iOS fills transparency with black)
 *   icon-maskable-512.png        the same with room for Android's round mask (the ball inside its 80 % safe circle)
 *   apple-touch-icon.png         180 px, for the iPhone's Home Screen
 *   badge-96.png                 Android's status-bar icon: a white silhouette (only its alpha counts)
 *   egg-192.png                  a Day Care notice's icon
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'
import { EGG_COLORS, EGG_MAP } from '@/components/eggMap'

const OUT = path.join(import.meta.dirname, '..', 'public', 'icons')

/** The favicon (public/favicon.svg) as a 16×16 map: k outline, r red, c cream. */
export const BALL_MAP = [
  '................',
  '.kkkkkkkkkkkkkk.',
  '.krrrrrrrrrrrrk.',
  '.krrrrrrrrrrrrk.',
  '.krrrrrccrrrrrk.',
  '.krrrrrccrrrrrk.',
  '.krrrrrrrrrrrrk.',
  '.kkkkkkkkkkkkkk.',
  '.kkkkkkkkkkkkkk.',
  '.kcccccccccccck.',
  '.kcckkcccckkcck.',
  '.kcckkcccckkcck.',
  '.kcccccccccccck.',
  '.kcccccccccccck.',
  '.kkkkkkkkkkkkkk.',
  '................',
]
const BALL_COLORS: Record<string, string> = { k: '#2a2438', r: '#c2452d', c: '#f7f2e0' }
/** The morning sky (theme `parchment`) and the info tint (`sky`). */
const SKY = '#e9f0f8'
const TINT = '#e8f1ff'

const rgb = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]

/** A map drawn `unit` pixels a cell, centred on a `size` square, over `bg` (null = transparent). */
export function drawMap(
  map: readonly string[],
  colors: Record<string, string>,
  size: number,
  unit: number,
  bg: string | null,
): PNG {
  const png = new PNG({ width: size, height: size })
  const fill = bg ? rgb(bg) : null
  for (let i = 0; i < size * size; i++) {
    png.data[i * 4] = fill?.[0] ?? 0
    png.data[i * 4 + 1] = fill?.[1] ?? 0
    png.data[i * 4 + 2] = fill?.[2] ?? 0
    png.data[i * 4 + 3] = fill ? 255 : 0
  }
  const w = map[0]!.length
  const h = map.length
  const ox = Math.floor((size - w * unit) / 2)
  const oy = Math.floor((size - h * unit) / 2)
  map.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const c = colors[ch]
      if (!c) return
      const [r, g, b] = rgb(c)
      for (let dy = 0; dy < unit; dy++)
        for (let dx = 0; dx < unit; dx++) {
          const i = ((oy + y * unit + dy) * size + ox + x * unit + dx) * 4
          png.data[i] = r
          png.data[i + 1] = g
          png.data[i + 2] = b
          png.data[i + 3] = 255
        }
    }),
  )
  return png
}

/** The ball taking about `share` of the square, at a whole number of pixels a cell. */
const ball = (size: number, share: number, bg: string | null, colors = BALL_COLORS) =>
  drawMap(BALL_MAP, colors, size, Math.max(1, Math.floor((size * share) / 14)), bg)

function main() {
  mkdirSync(OUT, { recursive: true })
  const files: Record<string, PNG> = {
    'icon-192.png': ball(192, 0.66, SKY),
    'icon-512.png': ball(512, 0.66, SKY),
    // Android's mask keeps a circle 80 % wide: the ball's corners stay inside it at half the width.
    'icon-maskable-512.png': ball(512, 0.5, SKY),
    'apple-touch-icon.png': ball(180, 0.7, SKY),
    // The status bar reads alpha only: the ball's red and cream as one white shape, its outline and band cut out.
    'badge-96.png': drawMap(BALL_MAP, { r: '#ffffff', c: '#ffffff' }, 96, 6, null),
    'egg-192.png': drawMap(EGG_MAP, EGG_COLORS, 192, 10, TINT),
  }
  for (const [name, png] of Object.entries(files)) {
    writeFileSync(path.join(OUT, name), PNG.sync.write(png))
    console.log(`public/icons/${name}`)
  }
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) main()
