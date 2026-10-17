/**
 * `pnpm underground-sprites`: the Underground's treasures (docs/31) as Pokémon Platinum draws them in its mining wall,
 * packed into one sheet, src/assets/underground.png, with its index in src/data/underground-atlas.json.
 *
 * - Spheres, small and large, and the fossils of Generations 1–4: pret/pokeplatinum's mining objects
 *   (res/graphics/mining/objects), at the commit pinned below. Index 0 of each palette is the game's transparency.
 * - Plates: Platinum's one plate drawing (plate.png) under each type's palette (`<name>_plate.pal`, entries 3–6 are the
 *   type's colour ramp). Fairy came after Platinum: the Pixie Plate gets a pink ramp of its own.
 * - Fossils of Generation 5 on, which Platinum never had: their official item sprites (PokeAPI; Galar's fossils from
 *   pokesprite as their two halves side by side), as the Poké Mart shows them.
 *
 * Every picture is cropped to what it draws (no transparent margin), so the game can make it fill the tiles it takes.
 * Downloads are cached under scripts/.cache/underground.
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = path.join(ROOT, 'scripts', '.cache', 'underground')
const SHEET = path.join(ROOT, 'src/assets/underground.png')
const INDEX = path.join(ROOT, 'src/data/underground-atlas.json')
const PLATINUM =
  'https://raw.githubusercontent.com/pret/pokeplatinum/1dc13dcea40c04ab53f1f607de46023dc409ef20/res/graphics/mining/objects'
const POKEAPI = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items'
const POKESPRITE = 'https://raw.githubusercontent.com/msikma/pokesprite/master/items/fossil'

type Rgb = [number, number, number]
interface Pic {
  w: number
  h: number
  /** RGBA, row by row. */
  px: Buffer
}

async function fetchCached(url: string): Promise<Buffer> {
  const file = path.join(CACHE, url.replace(/^https:\/\/raw\.githubusercontent\.com\//, '').replace(/\//g, '_'))
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

/** A PNG's own palette (its PLTE chunk), for an indexed picture. */
function plte(buf: Buffer): Rgb[] {
  let at = 8
  while (at < buf.length) {
    const len = buf.readUInt32BE(at)
    const type = buf.toString('ascii', at + 4, at + 8)
    if (type === 'PLTE') {
      const out: Rgb[] = []
      for (let i = 0; i < len; i += 3) out.push([buf[at + 8 + i]!, buf[at + 9 + i]!, buf[at + 10 + i]!])
      return out
    }
    at += 12 + len
  }
  return []
}

/** A JASC-PAL file's colours. */
const jasc = (text: string): Rgb[] =>
  text
    .split(/\r?\n/)
    .slice(3)
    .filter((l) => l.trim())
    .map((l) => l.trim().split(/\s+/).slice(0, 3).map(Number) as Rgb)

const key = (c: Rgb | number[]) => `${c[0]},${c[1]},${c[2]}`

/**
 * One of Platinum's mining objects: its palette's first colour made transparent, and, given another palette, every
 * pixel recoloured to the same entry of it (a plate's type).
 */
async function platinum(file: string, recolour?: Rgb[]): Promise<Pic> {
  const buf = await fetchCached(`${PLATINUM}/${file}`)
  const own = plte(buf)
  const index = new Map<string, number>()
  own.forEach((c, i) => {
    if (!index.has(key(c))) index.set(key(c), i)
  })
  const png = PNG.sync.read(buf)
  const px = Buffer.from(png.data)
  for (let i = 0; i < px.length; i += 4) {
    const n = index.get(key([px[i]!, px[i + 1]!, px[i + 2]!]))
    if (n === 0 || px[i + 3] === 0) {
      px[i + 3] = 0
      continue
    }
    if (recolour && n != null && recolour[n]) [px[i], px[i + 1], px[i + 2]] = recolour[n]!
  }
  return { w: png.width, h: png.height, px }
}

/** An item sprite with real transparency (PokeAPI, pokesprite). */
async function sprite(url: string): Promise<Pic> {
  const png = PNG.sync.read(await fetchCached(url))
  return { w: png.width, h: png.height, px: Buffer.from(png.data) }
}

/** Cropped to what it draws. */
function crop(p: Pic): Pic {
  let x0 = p.w
  let y0 = p.h
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++)
      if (p.px[(y * p.w + x) * 4 + 3]! > 0) {
        x0 = Math.min(x0, x)
        y0 = Math.min(y0, y)
        x1 = Math.max(x1, x)
        y1 = Math.max(y1, y)
      }
  if (x1 < 0) return p
  const w = x1 - x0 + 1
  const h = y1 - y0 + 1
  const px = Buffer.alloc(w * h * 4)
  for (let y = 0; y < h; y++) p.px.copy(px, y * w * 4, ((y + y0) * p.w + x0) * 4, ((y + y0) * p.w + x0 + w) * 4)
  return { w, h, px }
}

/** Two pictures side by side, bottoms aligned, a pixel apart (Galar's fossil halves). */
function pair(a: Pic, b: Pic): Pic {
  const w = a.w + 1 + b.w
  const h = Math.max(a.h, b.h)
  const px = Buffer.alloc(w * h * 4)
  const put = (p: Pic, ox: number) => {
    for (let y = 0; y < p.h; y++) p.px.copy(px, ((y + h - p.h) * w + ox) * 4, y * p.w * 4, (y + 1) * p.w * 4)
  }
  put(a, 0)
  put(b, a.w + 1)
  return { w, h, px }
}

const PLATES: Record<string, string> = {
  fire: 'flame',
  water: 'splash',
  grass: 'meadow',
  electric: 'zap',
  ice: 'icicle',
  fighting: 'fist',
  poison: 'toxic',
  ground: 'earth',
  flying: 'sky',
  psychic: 'mind',
  bug: 'insect',
  rock: 'stone',
  ghost: 'spooky',
  dragon: 'draco',
  dark: 'dread',
  steel: 'iron',
}
/** The Pixie Plate's ramp, in the plates' own steps from dark to light (Fairy's pink). */
const PIXIE: Rgb[] = [
  [205, 98, 156],
  [238, 131, 189],
  [255, 164, 213],
  [255, 197, 230],
]

const PLATINUM_FOSSILS: Record<string, string> = {
  'helix-fossil': 'helix_fossil.png',
  'dome-fossil': 'dome_fossil.png',
  'old-amber': 'old_amber.png',
  'root-fossil': 'root_fossil.png',
  'claw-fossil': 'claw_fossil.png',
  'skull-fossil': 'skull_fossil.png',
  'armor-fossil': 'armor_fossil.png',
}

async function pictures(): Promise<Record<string, Pic>> {
  const out: Record<string, Pic> = {}
  for (const colour of ['red', 'blue', 'green', 'pale', 'prism'])
    for (const [size, file] of [
      ['s', 'small'],
      ['l', 'large'],
    ] as const)
      out[`sphere.${colour}.${size}`] = crop(await platinum(`${file}_${colour}_sphere.png`))
  for (const [type, name] of Object.entries(PLATES))
    out[`plate.${type}`] = crop(await platinum('plate.png', jasc((await fetchCached(`${PLATINUM}/${name}_plate.pal`)).toString())))
  const flame = jasc((await fetchCached(`${PLATINUM}/flame_plate.pal`)).toString())
  out['plate.fairy'] = crop(await platinum('plate.png', [...flame.slice(0, 3), ...PIXIE, ...flame.slice(7)]))
  for (const [item, file] of Object.entries(PLATINUM_FOSSILS)) out[`fossil.${item}`] = crop(await platinum(file))
  for (const item of ['cover-fossil', 'plume-fossil', 'jaw-fossil', 'sail-fossil'])
    out[`fossil.${item}`] = crop(await sprite(`${POKEAPI}/${item}.png`))
  for (const [a, b] of [
    ['bird', 'drake'],
    ['bird', 'dino'],
    ['fish', 'drake'],
    ['fish', 'dino'],
  ])
    out[`fossil.${a}-and-${b}-fossils`] = pair(
      crop(await sprite(`${POKESPRITE}/${a}.png`)),
      crop(await sprite(`${POKESPRITE}/${b}.png`)),
    )
  return out
}

/** Shelf packing, tallest first, rows of at most 256 px. */
function pack(pics: Record<string, Pic>): { sheet: PNG; index: Record<string, [number, number, number, number]> } {
  const MAX = 256
  const order = Object.keys(pics).sort((a, b) => pics[b]!.h - pics[a]!.h || a.localeCompare(b))
  const index: Record<string, [number, number, number, number]> = {}
  let x = 0
  let y = 0
  let row = 0
  let width = 0
  for (const k of order) {
    const p = pics[k]!
    if (x + p.w > MAX) {
      x = 0
      y += row + 1
      row = 0
    }
    index[k] = [x, y, p.w, p.h]
    x += p.w + 1
    row = Math.max(row, p.h)
    width = Math.max(width, x)
  }
  const sheet = new PNG({ width, height: y + row })
  sheet.data.fill(0)
  for (const k of order) {
    const p = pics[k]!
    const [ox, oy] = index[k]!
    for (let r = 0; r < p.h; r++) p.px.copy(sheet.data, ((oy + r) * width + ox) * 4, r * p.w * 4, (r + 1) * p.w * 4)
  }
  return { sheet, index: Object.fromEntries(Object.keys(index).sort().map((k) => [k, index[k]!])) }
}

const { sheet, index } = pack(await pictures())
await writeFile(SHEET, PNG.sync.write(sheet))
await writeFile(INDEX, `${JSON.stringify({ size: [sheet.width, sheet.height], sprites: index }, null, 2)}\n`)
console.log(`✓ ${path.relative(ROOT, SHEET)} — ${Object.keys(index).length} pictures, ${sheet.width}×${sheet.height}`)
