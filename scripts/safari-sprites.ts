/**
 * `tsx scripts/safari-sprites.ts`: the Safari's two pictures (docs/61 §4), from the game's own item sprites in the item
 * atlas (src/assets/item-icons.png), as Trick or Treat's were (scripts/trick-or-treat-sprites.ts):
 * - public/items/safari-bait.png: the Razz Berry, as it is (the Bait item's own picture);
 * - public/items/safari-ball.png: the Poké Ball, its top a camouflage green, its bottom a pale tan, its button tan.
 * Both 30 × 30. The outline and the dark band stay as they were.
 */
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import atlas from '../src/data/item-atlas.json' with { type: 'json' }

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ITEM = (key: string) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${key}.png`
const SIZE = 30

type RGB = [number, number, number]

/** The 30 × 30 picture of an item from the atlas (each sits centred in its cell). */
function crop(sheet: PNG, key: string): PNG {
  const n = (atlas.index as Record<string, number>)[ITEM(key)]
  if (n == null) throw new Error(`${key} is not in the item atlas: run pnpm item-sprites`)
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

/** Every pixel through `f` (transparent ones left alone). */
function recolour(png: PNG, f: (rgb: RGB, x: number, y: number) => RGB): PNG {
  for (let y = 0; y < png.height; y++)
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4
      if (png.data[i + 3] === 0) continue
      const [r, g, b] = f([png.data[i]!, png.data[i + 1]!, png.data[i + 2]!], x, y)
      png.data[i] = r
      png.data[i + 1] = g
      png.data[i + 2] = b
    }
  return png
}

/** The outline (a near-black grey) stays as drawn. */
const isOutline = ([r, g, b]: RGB) => Math.max(r, g, b) < 60

/** The camouflage: a leaf green at the colour's own lightness, darker in irregular blotches. */
const blotch = (x: number, y: number) => ((x * 7 + y * 13 + ((x * y) % 5)) % 11) < 3
const toGreen = (rgb: RGB, x: number, y: number): RGB =>
  isOutline(rgb) ? rgb : hsl(105, 0.5, Math.min(0.82, lightness(rgb) * (blotch(x, y) ? 0.5 : 0.72) + 0.06))
/** The bottom half: a pale tan, as the Safari Ball's. */
const toTan = (rgb: RGB): RGB => (isOutline(rgb) ? rgb : hsl(40, 0.45, Math.min(0.9, lightness(rgb) * 0.82 + 0.1)))
const toTanButton = (rgb: RGB): RGB => hsl(36, 0.6, 0.45 + (lightness(rgb) - 0.5) * 0.3)

async function main() {
  const sheet = PNG.sync.read(await readFile(path.join(ROOT, 'src/assets/item-icons.png')))
  const bait = crop(sheet, 'razz-berry')
  const ball = crop(sheet, 'poke-ball')
  // As the Trick Ball: the centre button is the 3 × 3 light square in the band (rows 17–19, columns 11–13); the top
  // half is everything above the band.
  const isButton = (x: number, y: number) => x >= 11 && x <= 13 && y >= 17 && y <= 19
  const isBand = (rgb: RGB) => !isOutline(rgb) && lightness(rgb) < 0.32 && Math.abs(rgb[0] - rgb[2]) < 20
  recolour(ball, (rgb, x, y) =>
    isOutline(rgb) || isBand(rgb) ? rgb : isButton(x, y) ? toTanButton(rgb) : y < 17 ? toGreen(rgb, x, y) : toTan(rgb),
  )
  await writeFile(path.join(ROOT, 'public/items/safari-bait.png'), PNG.sync.write(bait, { colorType: 6 }))
  await writeFile(path.join(ROOT, 'public/items/safari-ball.png'), PNG.sync.write(ball, { colorType: 6 }))
  console.log('✓ public/items/safari-bait.png, public/items/safari-ball.png')
}

await main()
