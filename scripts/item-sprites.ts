/**
 * `pnpm item-sprites`: packs every item picture (src/data/items.json's `spriteUrl`, PokeAPI's 30×30 item sprites)
 * into one sheet, src/assets/item-icons.png, with its index in src/data/item-atlas.json. The Poké Mart then costs one
 * request for its whole shelf instead of one per item, and the sheet is cached for a year by its hashed name.
 *
 * The index is keyed by the picture's URL, not the item: an item the admin adds or edits later keeps working through
 * its own URL (ItemSprite falls back to it) until this script is run again. Downloads are cached under
 * scripts/.cache/items, so a re-run only fetches what's new.
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import items from '../src/data/items.json' with { type: 'json' }

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = path.join(ROOT, 'scripts', '.cache', 'items')
const SHEET = path.join(ROOT, 'src/assets/item-icons.png')
const INDEX = path.join(ROOT, 'src/data/item-atlas.json')
/** Sheet width in cells: 10 keeps the sheet roughly square for the ~70 items the game has. */
const COLS = 10

async function fetchCached(url: string): Promise<Buffer> {
  const file = path.join(CACHE, path.basename(new URL(url).pathname))
  if (existsSync(file)) return readFile(file)
  await mkdir(CACHE, { recursive: true })
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
      const buf = Buffer.from(await res.arrayBuffer())
      await writeFile(file, buf)
      return buf
    } catch (err) {
      if (attempt >= 4) throw err
      await new Promise((r) => setTimeout(r, 2 ** attempt * 1000))
    }
  }
}

async function main() {
  const urls = [
    ...new Set(
      (items as { spriteUrl?: string | null }[]).map((i) => i.spriteUrl).filter((u): u is string => !!u),
    ),
  ]
  const pngs = await Promise.all(urls.map(async (u) => PNG.sync.read(await fetchCached(u))))
  // Every cell is as big as the largest picture; smaller ones sit centred, so a list lines up whatever the source.
  const cell = Math.max(...pngs.map((p) => Math.max(p.width, p.height)))
  const rows = Math.ceil(urls.length / COLS)
  const sheet = new PNG({ width: COLS * cell, height: rows * cell })
  const index: Record<string, number> = {}
  pngs.forEach((p, n) => {
    const ox = (n % COLS) * cell + Math.floor((cell - p.width) / 2)
    const oy = Math.floor(n / COLS) * cell + Math.floor((cell - p.height) / 2)
    PNG.bitblt(p, sheet, 0, 0, p.width, p.height, ox, oy)
    index[urls[n]!] = n
  })
  await writeFile(SHEET, PNG.sync.write(sheet, { colorType: 6 }))
  await writeFile(INDEX, `${JSON.stringify({ cell, cols: COLS, rows, index }, null, 2)}\n`)
  console.log(
    `Items: ${urls.length} pictures, ${cell}px cells → src/assets/item-icons.png (${sheet.width}×${sheet.height})`,
  )
}

await main()
