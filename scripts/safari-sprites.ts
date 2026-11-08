/**
 * `tsx scripts/safari-sprites.ts`: the Safari's two pictures (docs/61 §4), both 30 × 30, the frame of Trick or
 * Treat's ball (scripts/trick-or-treat-sprites.ts):
 * - public/items/safari-bait.png: the Razz Berry from the item atlas (src/assets/item-icons.png), as it is (the Bait
 *   item's own picture);
 * - public/items/safari-ball.png: the games' own Safari Ball, PokeAPI's item sprite as it is (the user, 2026-11-08: it
 *   was a Poké Ball recoloured green). Its band sits on the ball's row 11, as the Trick Ball's, so the catch timeline
 *   splits it there too (loadSafariBall, src/fx/scenes.ts).
 */
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import atlas from '../src/data/item-atlas.json' with { type: 'json' }

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ITEM = (key: string) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${key}.png`
const SIZE = 30

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

/** An item's own sprite from PokeAPI (the Safari Ball isn't sold, so it isn't in the atlas). */
async function fetchItem(key: string): Promise<PNG> {
  const res = await fetch(ITEM(key))
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${ITEM(key)}`)
  const png = PNG.sync.read(Buffer.from(await res.arrayBuffer()))
  if (png.width !== SIZE || png.height !== SIZE) throw new Error(`${key} is ${png.width} × ${png.height}, not 30 × 30`)
  return png
}

async function main() {
  const sheet = PNG.sync.read(await readFile(path.join(ROOT, 'src/assets/item-icons.png')))
  const bait = crop(sheet, 'razz-berry')
  const ball = await fetchItem('safari-ball')
  await writeFile(path.join(ROOT, 'public/items/safari-bait.png'), PNG.sync.write(bait, { colorType: 6 }))
  await writeFile(path.join(ROOT, 'public/items/safari-ball.png'), PNG.sync.write(ball, { colorType: 6 }))
  console.log('✓ public/items/safari-bait.png, public/items/safari-ball.png')
}

await main()
