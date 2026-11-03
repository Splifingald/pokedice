/**
 * `tsx scripts/raid-ball-sprite.ts`: the Raid Ball's picture (docs/44), public/items/raid-ball.png, recoloured from the
 * Ultra Ball in the item atlas (src/assets/item-icons.png): its blue-grey top turned gold, its yellow bars raid pink.
 * The first Raid Ball was a pink top on a white bottom, which read as a Poké Ball at a reward's size; a gold ball with
 * bars is told apart at a glance, and gold and pink are its throw's trail. 30 × 30, PokeAPI's item size.
 */
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import atlas from '../src/data/item-atlas.json' with { type: 'json' }

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ULTRA = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/ultra-ball.png'
const SIZE = 30

type RGB = [number, number, number]

/** The Ultra Ball's 30 × 30 picture from the atlas (it sits centred in its cell). */
function crop(sheet: PNG): PNG {
  const n = (atlas.index as Record<string, number>)[ULTRA]
  if (n == null) throw new Error('the Ultra Ball is not in the item atlas: run pnpm item-sprites')
  const pad = Math.floor((atlas.cell - SIZE) / 2)
  const out = new PNG({ width: SIZE, height: SIZE })
  PNG.bitblt(
    sheet,
    out,
    (n % atlas.cols) * atlas.cell + pad,
    Math.floor(n / atlas.cols) * atlas.cell + pad,
    SIZE,
    SIZE,
    0,
    0,
  )
  return out
}

const lightness = ([r, g, b]: RGB) => (Math.max(r, g, b) + Math.min(r, g, b)) / 510

function hsl(h: number, s: number, l: number): RGB {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x]
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}

/** The outline (a near-black grey) stays as drawn. */
const isOutline = ([r, g, b]: RGB) => Math.max(r, g, b) < 60
/** The dark band round the middle stays as drawn. */
const isBand = (rgb: RGB) => !isOutline(rgb) && lightness(rgb) < 0.32 && Math.abs(rgb[0] - rgb[2]) < 20
/** The Ultra Ball's yellow bars. */
const isBar = ([r, , b]: RGB) => r > 200 && b < 100
const isWhite = ([r, g, b]: RGB) => r === 255 && g === 255 && b === 255
/** The centre button and its ring: columns 11–13, rows 17–19 of the 30 × 30 picture. */
const isButton = (x: number, y: number) => x >= 11 && x <= 13 && y >= 17 && y <= 19
/** Rows 18 and below are the bottom half (under the band), its white and lavender kept; above, the top's blue-grey. */
const BOTTOM_FROM = 18

/** Gold at the grey's own lightness: the top's shading reads the same. */
const toGold = (rgb: RGB): RGB => hsl(44, 0.95, Math.min(0.82, lightness(rgb) * 0.95 + 0.05))
/** The raid pink of the throw's trail (src/fx/scenes.ts), darker where the yellow was dark. */
const toPink = (rgb: RGB): RGB => hsl(330, 0.85, Math.min(0.8, lightness(rgb) * 0.8 + 0.05))

async function main() {
  const sheet = PNG.sync.read(await readFile(path.join(ROOT, 'src/assets/item-icons.png')))
  const ball = crop(sheet)
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4
      if (ball.data[i + 3] === 0) continue
      const rgb: RGB = [ball.data[i]!, ball.data[i + 1]!, ball.data[i + 2]!]
      if (y >= BOTTOM_FROM || isButton(x, y) || isOutline(rgb) || isBand(rgb) || isWhite(rgb)) continue
      const [r, g, b] = isBar(rgb) ? toPink(rgb) : toGold(rgb)
      ball.data[i] = r
      ball.data[i + 1] = g
      ball.data[i + 2] = b
    }
  await writeFile(path.join(ROOT, 'public/items/raid-ball.png'), PNG.sync.write(ball, { colorType: 6 }))
  console.log('✓ public/items/raid-ball.png')
}

await main()
