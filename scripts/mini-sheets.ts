/**
 * pnpm mini-sheets — packs the Box icons (public/pokemon/NNN_mini.png, both frames side by side) into a few sheets of
 * MINI_PER icons each: public/pokemon/minis-<k>.png, plus src/components/mini-sheets.json for MiniSprite.
 *
 * A screen listing Pokémon (Box, Pokédex, leaderboard, Versus) then costs one request per sheet instead of one per
 * icon: Netlify bills every request (docs/11-SCALING-COST-PLAN.md §5.3). Run after pnpm pokemon-sprites, then pnpm png.
 * Species after the last sheet keep their own file (MiniSprite falls back to it).
 */
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIR = path.join(ROOT, 'public', 'pokemon')
/** Icons per sheet: a generation and a bit, so a Kanto player downloads one sheet. */
const MINI_PER = 160
/** Sheet width in pixels; icons fill it left to right in rows (shelves). */
const SHEET_W = 1024
/** Transparent pixels between icons: scaled by a non-integer factor, an icon must not pick up its neighbour's edge. */
const PAD = 2

const file = (dex: number) => path.join(DIR, `${String(dex).padStart(3, '0')}_mini.png`)

/** Where an icon sits: sheet, x, y, and its frame height (both frames side by side: width = 2 × height). */
type MiniCell = [sheet: number, x: number, y: number, h: number]

async function main() {
  // Every icon from #1 up, stopping at the first gap: MiniSprite treats the sheets as covering 1..max.
  let max = 0
  while (existsSync(file(max + 1))) max++
  if (max === 0) throw new Error('no public/pokemon/NNN_mini.png found')
  const icons: MiniCell[] = []
  const sheets = Math.ceil(max / MINI_PER)
  for (let k = 0; k < sheets; k++) {
    const first = k * MINI_PER + 1
    const count = Math.min(MINI_PER, max - first + 1)
    // Icons keep their own size (Gen 5's run from 30 to 65 px high): resampling pixel art would blur it.
    const pngs: PNG[] = []
    for (let i = 0; i < count; i++) {
      const icon = PNG.sync.read(await readFile(file(first + i)))
      if (icon.width !== icon.height * 2) throw new Error(`${path.basename(file(first + i))} is ${icon.width}×${icon.height}, not two square frames`)
      pngs.push(icon)
    }
    // Shelf packing in dex order.
    const placed: { x: number; y: number }[] = []
    let x = 0
    let y = 0
    let shelf = 0
    for (const icon of pngs) {
      if (x + icon.width > SHEET_W) {
        x = 0
        y += shelf + PAD
        shelf = 0
      }
      placed.push({ x, y })
      x += icon.width + PAD
      shelf = Math.max(shelf, icon.height)
    }
    const sheet = new PNG({ width: SHEET_W, height: y + shelf })
    pngs.forEach((icon, i) => {
      PNG.bitblt(icon, sheet, 0, 0, icon.width, icon.height, placed[i]!.x, placed[i]!.y)
      icons.push([k, placed[i]!.x, placed[i]!.y, icon.height])
    })
    await writeFile(path.join(DIR, `minis-${k}.png`), PNG.sync.write(sheet))
  }
  const meta = { width: SHEET_W, heights: [] as number[], icons }
  for (let k = 0; k < sheets; k++)
    meta.heights.push(Math.max(...icons.filter((c) => c[0] === k).map((c) => c[2] + c[3])))
  await writeFile(path.join(ROOT, 'src', 'components', 'mini-sheets.json'), `${JSON.stringify(meta)}\n`)
  console.log(`✓ ${max} Box icons → ${sheets} sheets (public/pokemon/minis-*.png). Now run pnpm png.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
