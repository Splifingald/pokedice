/**
 * Pokémon sprites, cut from graphics/pokemon/pokemon.png (MishaK9's FireRed/LeafGreen sheet).
 * `pnpm pokemon-sprites [outDir] [sheet]` writes 6 transparent PNGs per Pokémon into outDir
 * (default graphics/pokemon/sprites): 001_Bulbasaur_front.png, _back, _front_shiny, _back_shiny, _miniature_1, _miniature_2.
 *
 * `pnpm pokemon-sprites --publish [srcDir]` copies those files (default graphics/pokemon) into public/pokemon with short
 * names (001_front.png, 001_back_shiny.png, 001_mini_1.png…) and writes src/data/sprite-metrics.json: the transparent
 * rows under each front / back sprite, so the battle scene can stand every Pokémon on its platform.
 *
 * Sheet layout: 1px black grid lines, 64×64 cells on a 65px pitch from (11, 11). 15 Pokémon per row, each a block of
 * 2 cells wide × (34px header + 2 cells): header = name label + two 32×32 mini frames, then front | front shiny over
 * back | back shiny. Each cell has a flat background colour, which becomes transparent.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import pokemon from '../src/data/pokemon.json' with { type: 'json' }

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ORIGIN = 11
const CELL = 64
const PITCH = CELL + 1
const HEADER = 34
const ROW = HEADER + 1 + 2 * PITCH
const MINI = 32
const PER_ROW = 15
const FRAME = 0x9898b8 // the sheet's lavender backdrop, peeking into a few 1px-off boxes

/** The last sheet row after Mew: extra sprites outside the 151 (block index → dex + name). */
const EXTRAS: [block: number, dex: number, name: string][] = [
  [1, 216, 'Teddiursa'],
  [2, 386, 'Deoxys-Attack'],
  [3, 386, 'Deoxys-Defense'],
]

/** File-safe English name: Nidoran♀ → Nidoran-F, Farfetch’d → Farfetchd, Mr. Mime → Mr-Mime. */
const fileName = (s: string) =>
  s
    .replace(/♀/g, '-F')
    .replace(/♂/g, '-M')
    .replace(/['’.]/g, '')
    .trim()
    .replace(/\s+/g, '-')

function crop(sheet: PNG, x: number, y: number, w: number, h: number): PNG {
  const out = new PNG({ width: w, height: h })
  PNG.bitblt(sheet, out, x, y, w, h, 0, 0)
  return out
}

/** Clears the background: every pixel of the cell's border colour that is reachable from the edge (4-connected). */
function clearBackground(img: PNG): PNG {
  const { width: w, height: h, data } = img
  const rgb = (i: number) => (data[i * 4]! << 16) | (data[i * 4 + 1]! << 8) | data[i * 4 + 2]!
  const stack: number[] = []
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x)
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1)
  // Backdrop = most common border colour (a few boxes are 1px off, so a corner pixel can be the sheet's frame).
  const counts = new Map<number, number>()
  for (const i of stack) counts.set(rgb(i), (counts.get(rgb(i)) ?? 0) + 1)
  const bg = [...counts].sort((a, b) => b[1] - a[1])[0]![0]
  const seen = new Uint8Array(w * h)
  while (stack.length) {
    const i = stack.pop()!
    if (seen[i] || (rgb(i) !== bg && rgb(i) !== FRAME)) continue
    seen[i] = 1
    data[i * 4 + 3] = 0
    const x = i % w
    if (x > 0) stack.push(i - 1)
    if (x < w - 1) stack.push(i + 1)
    if (i >= w) stack.push(i - w)
    if (i < w * (h - 1)) stack.push(i + w)
  }
  // Holes inside the sprite (between legs, inside rings) keep the background colour but aren't edge-connected;
  // Gen 3 sheets never use the backdrop colour inside a sprite, so clear those too.
  for (let i = 0; i < w * h; i++) if (rgb(i) === bg) data[i * 4 + 3] = 0
  return img
}

const isEmpty = (img: PNG) => img.data.every((v, i) => i % 4 !== 3 || v === 0)

function spritesOf(sheet: PNG, index: number): Record<string, PNG> {
  const bx = ORIGIN + ((index % PER_ROW) * 2) * PITCH
  const by = ORIGIN + Math.floor(index / PER_ROW) * ROW
  const cell = (c: number, r: number) => clearBackground(crop(sheet, bx + c * PITCH, by + HEADER + 1 + r * PITCH, CELL, CELL))
  // Mini frames sit in the right header half, from 2px left of its cell, 1px below the block top.
  const mini = (k: number) => clearBackground(crop(sheet, bx + PITCH - 2 + k * (MINI + 1), by + 1, MINI, MINI))
  return {
    front: cell(0, 0),
    front_shiny: cell(1, 0),
    back: cell(0, 1),
    back_shiny: cell(1, 1),
    miniature_1: mini(0),
    miniature_2: mini(1),
  }
}

/** Empty (fully transparent) rows at the bottom of a sprite. */
function bottomGap(img: PNG): number {
  for (let y = img.height - 1; y >= 0; y--)
    for (let x = 0; x < img.width; x++) if (img.data[(y * img.width + x) * 4 + 3]! > 0) return img.height - 1 - y
  return 0
}

async function publish(srcDir: string) {
  const outDir = path.join(ROOT, 'public/pokemon')
  await mkdir(outDir, { recursive: true })
  const metrics: Record<number, { front: number; back: number }> = {}
  let n = 0
  for (const p of pokemon) {
    const prefix = `${String(p.dex).padStart(3, '0')}_${fileName(p.name)}`
    const short = String(p.dex).padStart(3, '0')
    const kinds: [from: string, to: string][] = [
      ['front', 'front'],
      ['front_shiny', 'front_shiny'],
      ['back', 'back'],
      ['back_shiny', 'back_shiny'],
      ['miniature_1', 'mini_1'],
      ['miniature_2', 'mini_2'],
    ]
    const m = { front: 0, back: 0 }
    for (const [from, to] of kinds) {
      const buf = await readFile(path.join(srcDir, `${prefix}_${from}.png`))
      if (from === 'front' || from === 'back') m[from] = bottomGap(PNG.sync.read(buf))
      await writeFile(path.join(outDir, `${short}_${to}.png`), buf)
      n++
    }
    metrics[p.dex] = m
  }
  await writeFile(path.join(ROOT, 'src/data/sprite-metrics.json'), JSON.stringify(metrics) + '\n')
  console.log(`${n} sprites copied to ${outDir}; metrics in src/data/sprite-metrics.json`)
}

async function main() {
  if (process.argv[2] === '--publish') return publish(path.resolve(process.argv[3] ?? path.join(ROOT, 'graphics/pokemon')))
  const outDir = path.resolve(process.argv[2] ?? path.join(ROOT, 'graphics/pokemon/sprites'))
  const sheetPath = path.resolve(process.argv[3] ?? path.join(ROOT, 'graphics/pokemon/pokemon.png'))
  const sheet = PNG.sync.read(await readFile(sheetPath))
  await mkdir(outDir, { recursive: true })
  const jobs: [index: number, dex: number, name: string][] = [
    ...pokemon.map((p) => [p.dex - 1, p.dex, p.name] as [number, number, string]),
    ...EXTRAS.map(([block, dex, name]) => [150 + block, dex, name] as [number, number, string]),
  ]
  let n = 0
  for (const [index, dex, name] of jobs) {
    const prefix = `${String(dex).padStart(3, '0')}_${fileName(name)}`
    for (const [kind, img] of Object.entries(spritesOf(sheet, index))) {
      if (isEmpty(img)) {
        console.warn(`empty: ${prefix}_${kind}`)
        continue
      }
      await writeFile(path.join(outDir, `${prefix}_${kind}.png`), PNG.sync.write(img))
      n++
    }
  }
  console.log(`${n} sprites written to ${outDir}`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
