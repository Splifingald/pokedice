/**
 * Showdown sprites: one source, Pokémon Showdown, for every Pokémon and trainer picture (docs/13-SHOWDOWN-SPRITES.md).
 *
 * `pnpm showdown-sprites [pokemon] [icons] [cries] [trainers]` (all four when none is named). Every download is cached
 * under scripts/.cache/showdown, misses included, so a re-run is offline.
 *
 * - `pokemon`: per species and form, the pixel-art animated GIF of each view (`gen5ani`, `gen5ani-back`, `-shiny`,
 *   `-back-shiny`: Black/White's animated sprites, and the community's in that style after #649), or Showdown's static
 *   pixel-art set (`gen5…`) where no animation is drawn yet. Never `ani`: those are 3D renders, not pixel art. The
 *   GIFs are *not* copied into the repo (about 175 MB): the game loads them from Showdown's CDN, so they never count against
 *   our host's requests. What is written is src/data/showdown-sprites.json: per dex the Showdown id, which views exist
 *   and in which kind (so the game never asks for a file that isn't there), and the canvas plus the box every frame's
 *   opaque pixels fit in (so the battle scene can stand each one on its platform).
 * - `icons`: Showdown's menu icon sheet (pokemonicons-sheet.png, 40×30 icons, 390 KB) copied as it is to
 *   src/assets/pokemon-icons.png — one request for every icon in the game, cached for a year by its hashed name — and
 *   each dex's cell in it, by Showdown's own rule.
 * - `cries`: which of Showdown's cries (`audio/cries/<id>.mp3`) exist, checked with a HEAD request each. The game
 *   plays them from Showdown's CDN, nothing is copied. A form without a cry of its own gets its base species' as `c`
 *   in src/data/showdown-sprites.json, so the game never asks for a cry that isn't there.
 * - `trainers`: downloads Showdown's 80×80 trainer sprite for every Kanto–Unova class and character (TRAINERS below;
 *   Kalos onward came from Showdown already, see region-trainers.ts) over the files in public/, then packs every
 *   sprite the game refers to into one sheet per region (src/assets/trainers/<region>.png) and writes their cells to
 *   src/data/trainer-atlas.json. Again one request per region instead of one per trainer.
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import pokemon from '../src/data/pokemon.json' with { type: 'json' }
import trainers from '../src/data/trainers.json' with { type: 'json' }
import { AVATAR_GROUPS } from '../src/lib/avatars.ts'
import {
  ANI_DIRS,
  GEN5_DIRS,
  ICON_COLS,
  ICON_H,
  ICON_W,
  SHOWDOWN_CRIES,
  SHOWDOWN_SPRITES,
  SHOWDOWN_VIEWS,
  TRAINER_CELL,
  TRAINER_COLS,
  TRAINER_PITCH,
  type ShowdownBox,
  type ShowdownEntry,
} from '../src/lib/showdown.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = path.join(ROOT, 'scripts', '.cache', 'showdown')
const SPRITES_JSON = path.join(ROOT, 'src/data/showdown-sprites.json')
const ATLAS_JSON = path.join(ROOT, 'src/data/trainer-atlas.json')
const POKEDEX_URL = 'https://play.pokemonshowdown.com/data/pokedex.json'
const DEXDATA_URL = 'https://play.pokemonshowdown.com/js/battle-dex-data.js'
const POKEAPI_CSV = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon.csv'

// ---------------------------------------------------------------------------------------------------------------------
// Downloads

/** GET `url`, or read it back from `file`. A 404 is cached too (as `<file>.404`) and comes back as null. */
async function fetchCached(url: string, file: string): Promise<Buffer | null> {
  if (existsSync(file)) return readFile(file)
  if (existsSync(`${file}.404`)) return null
  await mkdir(path.dirname(file), { recursive: true })
  let lastErr: unknown
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url)
      if (res.status === 404) {
        await writeFile(`${file}.404`, '')
        return null
      }
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
      const buf = Buffer.from(await res.arrayBuffer())
      await writeFile(file, buf)
      return buf
    } catch (err) {
      lastErr = err
      await new Promise((r) => setTimeout(r, 300 * 2 ** attempt))
    }
  }
  throw lastErr
}

/** Whether `url` exists (a HEAD request), or the answer cached in `file` (`<file>.ok` or `<file>.404`). */
async function existsCached(url: string, file: string): Promise<boolean> {
  if (existsSync(`${file}.ok`)) return true
  if (existsSync(`${file}.404`)) return false
  await mkdir(path.dirname(file), { recursive: true })
  let lastErr: unknown
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url, { method: 'HEAD' })
      if (res.status === 404) {
        await writeFile(`${file}.404`, '')
        return false
      }
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
      await writeFile(`${file}.ok`, '')
      return true
    } catch (err) {
      lastErr = err
      await new Promise((r) => setTimeout(r, 300 * 2 ** attempt))
    }
  }
  throw lastErr
}

async function mustFetch(url: string, file: string): Promise<Buffer> {
  const buf = await fetchCached(url, file)
  if (!buf) throw new Error(`404 for ${url}`)
  return buf
}

/** Runs `fn` over `items`, `limit` at a time. */
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i]!)
      }
    }),
  )
  return out
}

const toID = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

// ---------------------------------------------------------------------------------------------------------------------
// Images

/** The box [x0, y0, x1, y1] of the opaque pixels a frame painter reports, grown as frames come in. */
class OpaqueBox {
  x0 = Infinity
  y0 = Infinity
  x1 = -1
  y1 = -1
  add(x: number, y: number) {
    if (x < this.x0) this.x0 = x
    if (y < this.y0) this.y0 = y
    if (x > this.x1) this.x1 = x
    if (y > this.y1) this.y1 = y
  }
  toBox(w: number, h: number): ShowdownBox {
    if (this.x1 < 0 || (this.x0 === 0 && this.y0 === 0 && this.x1 === w - 1 && this.y1 === h - 1))
      return [w, h]
    return [w, h, this.x0, this.y0, this.x1, this.y1]
  }
}

/** GIF LZW: the colour indices of one frame. */
function lzwDecode(minCodeSize: number, data: Uint8Array, pixels: number): Uint8Array {
  const out = new Uint8Array(pixels)
  const clear = 1 << minCodeSize
  const eoi = clear + 1
  const prefix = new Int16Array(4096)
  const suffix = new Uint8Array(4096)
  const length = new Uint16Array(4096)
  for (let i = 0; i < clear; i++) {
    prefix[i] = -1
    suffix[i] = i
    length[i] = 1
  }
  let codeSize = minCodeSize + 1
  let next = eoi + 1
  let prev = -1
  let op = 0
  let bits = 0
  let nbits = 0
  let pos = 0
  /** Writes the string of `code` and returns its first index. */
  const emit = (code: number) => {
    const len = length[code]!
    let c = code
    for (let i = len - 1; i >= 0; i--) {
      if (op + i < pixels) out[op + i] = suffix[c]!
      if (i > 0) c = prefix[c]!
    }
    op += len
    return suffix[c]!
  }
  for (;;) {
    while (nbits < codeSize && pos < data.length) {
      bits |= data[pos++]! << nbits
      nbits += 8
    }
    if (nbits < codeSize) break
    const code = bits & ((1 << codeSize) - 1)
    bits >>>= codeSize
    nbits -= codeSize
    if (code === clear) {
      codeSize = minCodeSize + 1
      next = eoi + 1
      prev = -1
      continue
    }
    if (code === eoi || op >= pixels) break
    if (prev === -1) {
      emit(code)
      prev = code
      continue
    }
    let first: number
    if (code < next) {
      first = emit(code)
    } else {
      // Not in the table yet: the previous string plus its own first index.
      first = emit(prev)
      if (op < pixels) out[op] = first
      op++
    }
    if (next < 4096) {
      prefix[next] = prev
      suffix[next] = first
      length[next] = length[prev]! + 1
      next++
      if (next === 1 << codeSize && codeSize < 12) codeSize++
    }
    prev = code
  }
  return out
}

/** A GIF's canvas and the box of every pixel any of its frames paints opaque. */
function gifBox(buf: Buffer): ShowdownBox {
  if (buf.toString('latin1', 0, 3) !== 'GIF') throw new Error('not a GIF')
  const w = buf.readUInt16LE(6)
  const h = buf.readUInt16LE(8)
  const packed = buf[10]!
  let p = 13
  if (packed & 0x80) p += 3 * (1 << ((packed & 7) + 1))
  const box = new OpaqueBox()
  let transparent = -1
  const subBlocks = () => {
    const parts: Buffer[] = []
    for (let n = buf[p++]!; n > 0; n = buf[p++]!) {
      parts.push(buf.subarray(p, p + n))
      p += n
    }
    return Buffer.concat(parts)
  }
  while (p < buf.length) {
    const block = buf[p++]
    if (block === 0x3b) break
    if (block === 0x21) {
      const label = buf[p++]
      const body = subBlocks()
      if (label === 0xf9) transparent = body[0]! & 1 ? body[3]! : -1
    } else if (block === 0x2c) {
      const left = buf.readUInt16LE(p)
      const top = buf.readUInt16LE(p + 2)
      const fw = buf.readUInt16LE(p + 4)
      const fh = buf.readUInt16LE(p + 6)
      const fpacked = buf[p + 8]!
      p += 9
      if (fpacked & 0x80) p += 3 * (1 << ((fpacked & 7) + 1))
      const minCode = buf[p++]!
      const indices = lzwDecode(minCode, subBlocks(), fw * fh)
      const interlaced = (fpacked & 0x40) !== 0
      const rows = interlaced ? interlaceRows(fh) : null
      for (let y = 0; y < fh; y++) {
        const row = rows ? rows[y]! : y
        for (let x = 0; x < fw; x++) {
          if (indices[y * fw + x] !== transparent) box.add(left + x, top + row)
        }
      }
      transparent = -1
    } else {
      throw new Error(`bad GIF block 0x${block?.toString(16)}`)
    }
  }
  return box.toBox(w, h)
}

/** The image row each stored row of an interlaced GIF frame lands on. */
function interlaceRows(h: number): number[] {
  const rows: number[] = []
  for (const [start, step] of [
    [0, 8],
    [4, 8],
    [2, 4],
    [1, 2],
  ] as const)
    for (let y = start; y < h; y += step) rows.push(y)
  return rows
}

function pngBox(buf: Buffer): ShowdownBox {
  const img = PNG.sync.read(buf)
  const box = new OpaqueBox()
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++) if (img.data[(y * img.width + x) * 4 + 3]! > 0) box.add(x, y)
  return box.toBox(img.width, img.height)
}

/** Copies `src` into `dst` at (dx, dy), alpha included. */
function blit(src: PNG, sx: number, sy: number, w: number, h: number, dst: PNG, dx: number, dy: number) {
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const si = ((sy + y) * src.width + sx + x) * 4
      const di = ((dy + y) * dst.width + dx + x) * 4
      if (sx + x >= src.width || sy + y >= src.height) continue
      src.data.copy(dst.data, di, si, si + 4)
    }
}

// ---------------------------------------------------------------------------------------------------------------------
// Pokémon: dex → Showdown id

interface Species {
  dex: number
  name: string
  type1: string
  form?: { of: number }
}
const SPECIES = pokemon as unknown as Species[]
const BY_DEX = new Map(SPECIES.map((s) => [s.dex, s]))

/** Forms whose PokeAPI name doesn't spell Showdown's: the default variant PokeAPI names and Showdown leaves out. */
const FORM_IDS: Record<number, string> = {
  10136: 'minior', // Red Core: Showdown's plain Minior
  10177: 'darmanitan-galar',
  10219: 'toxtricity-gmax',
  10226: 'urshifu-gmax',
  10250: 'tauros-paldeacombat',
  10251: 'tauros-paldeablaze',
  10252: 'tauros-paldeaaqua',
  10273: 'ogerpon-wellspring',
  10274: 'ogerpon-hearthflame',
  10275: 'ogerpon-cornerstone',
  10314: 'meowstic-mega',
}

interface ShowdownSpecies {
  num: number
  name: string
  baseSpecies?: string
  forme?: string
}

/** Showdown's sprite id for a species entry: the base name as an id, then `-` and the forme as an id. */
const spriteId = (s: ShowdownSpecies) => toID(s.baseSpecies ?? s.name) + (s.forme ? `-${toID(s.forme)}` : '')

/** The National Dex number a form hangs off (a form of a form, like Galarian Zen Darmanitan, walks back twice). */
function rootDex(dex: number): number {
  let d = dex
  while (d > 1025) d = BY_DEX.get(d)!.form!.of
  return d
}

async function showdownIds(): Promise<Map<number, string>> {
  const dex = JSON.parse(
    (await mustFetch(POKEDEX_URL, path.join(CACHE, 'pokedex.json'))).toString('utf8'),
  ) as Record<string, ShowdownSpecies>
  const csv = (await mustFetch(POKEAPI_CSV, path.join(CACHE, 'pokeapi-pokemon.csv'))).toString('utf8')
  const pokeapi = new Map(
    csv
      .trim()
      .split('\n')
      .slice(1)
      .map((l) => l.split(','))
      .map(([id, name]) => [Number(id), name!]),
  )
  const byNum = new Map<number, ShowdownSpecies[]>()
  for (const s of Object.values(dex)) if (s.num > 0) byNum.set(s.num, [...(byNum.get(s.num) ?? []), s])

  const ids = new Map<number, string>()
  const missing: string[] = []
  for (const s of SPECIES) {
    const root = rootDex(s.dex)
    let id: string | undefined
    if (s.dex <= 1025) {
      const base = byNum.get(s.dex)?.find((x) => !x.forme)
      id = base && spriteId(base)
    } else if (FORM_IDS[s.dex]) {
      id = FORM_IDS[s.dex]
    } else if (root === 493 || root === 773) {
      // Arceus's plates and Silvally's memories: our own ids (20001+), one per type.
      id = `${root === 493 ? 'arceus' : 'silvally'}-${s.type1}`
    } else {
      const name = pokeapi.get(s.dex)
      const match = name && byNum.get(root)?.find((x) => toID(x.name) === toID(name))
      id = match ? spriteId(match) : undefined
    }
    if (id) ids.set(s.dex, id)
    else missing.push(`${s.dex} ${s.name}`)
  }
  if (missing.length) throw new Error(`No Showdown id for: ${missing.join(', ')}`)
  return ids
}

async function buildPokemon(entries: Record<string, ShowdownEntry>) {
  const ids = await showdownIds()
  const sameBox = (a?: ShowdownBox, b?: ShowdownBox) =>
    !!a && !!b && a.length === b.length && a.every((n, i) => n === b[i])
  const counts = { a: 0, g: 0, '-': 0 }
  const results = await pool([...ids], 16, async ([dex, id]) => {
    const kinds: string[] = []
    const boxes: (ShowdownBox | undefined)[] = []
    for (const view of SHOWDOWN_VIEWS) {
      const gif = await fetchCached(
        `${SHOWDOWN_SPRITES}/${ANI_DIRS[view]}/${id}.gif`,
        path.join(CACHE, ANI_DIRS[view], `${id}.gif`),
      )
      if (gif) {
        kinds.push('a')
        boxes.push(gifBox(gif))
        continue
      }
      const png = await fetchCached(
        `${SHOWDOWN_SPRITES}/${GEN5_DIRS[view]}/${id}.png`,
        path.join(CACHE, GEN5_DIRS[view], `${id}.png`),
      )
      kinds.push(png ? 'g' : '-')
      boxes.push(png ? pngBox(png) : undefined)
    }
    return { dex, id, kinds, boxes }
  })
  for (const { dex, id, kinds, boxes } of results) {
    for (const k of kinds) counts[k as keyof typeof counts]++
    const [f, b, fs, bs] = boxes
    entries[dex] = {
      id,
      v: kinds.join(''),
      i: entries[dex]?.i ?? 0,
      // The cries step owns `c`; it re-checks it whenever it runs (after this step when both do).
      ...(entries[dex]?.c !== undefined && entries[dex]?.id === id && { c: entries[dex]!.c }),
      ...(f && { f }),
      ...(b && { b }),
      ...(fs && !sameBox(fs, f) && { fs }),
      ...(bs && !sameBox(bs, b) && { bs }),
    }
  }
  console.log(
    `Pokémon: ${results.length} entries, views ${counts.a} animated, ${counts.g} static, ${counts['-']} missing`,
  )
  for (const r of results)
    if (r.kinds.includes('-')) console.log(`  no Showdown sprite: #${r.dex} ${r.id} ${r.kinds.join('')}`)
}

// ---------------------------------------------------------------------------------------------------------------------
// Cries

async function buildCries(entries: Record<string, ShowdownEntry>) {
  const has = (id: string) =>
    existsCached(`${SHOWDOWN_CRIES}/${id}.mp3`, path.join(CACHE, 'cries', `${id}.mp3`))
  const list = Object.values(entries)
  const own = await pool(list, 16, (e) => has(e.id))
  const counts = { own: 0, base: 0, none: 0 }
  for (const [n, e] of list.entries()) {
    delete e.c
    if (own[n]) {
      counts.own++
      continue
    }
    // Showdown's ids are the base species' id, then `-` and the forme: a form without a cry sounds like its species.
    const base = e.id.split('-')[0]!
    if (base !== e.id && (await has(base))) {
      e.c = base
      counts.base++
    } else {
      e.c = ''
      counts.none++
      console.log(`  no Showdown cry: ${e.id}`)
    }
  }
  console.log(
    `Cries: ${counts.own} of their own, ${counts.base} forms with their species' cry, ${counts.none} none`,
  )
}

// ---------------------------------------------------------------------------------------------------------------------
// Icons

async function buildIcons(entries: Record<string, ShowdownEntry>) {
  const buf = await mustFetch(
    `${SHOWDOWN_SPRITES}/pokemonicons-sheet.png`,
    path.join(CACHE, 'pokemonicons-sheet.png'),
  )
  const sheet = PNG.sync.read(buf)
  const js = (await mustFetch(DEXDATA_URL, path.join(CACHE, 'battle-dex-data.js'))).toString('utf8')
  const start = js.indexOf('BattlePokemonIconIndexes={')
  const body = js.slice(start, js.indexOf('};', start))
  const indexes = new Map<string, number>()
  for (const m of body.matchAll(/([a-z0-9]+):(\d+)(?:\+(\d+))?/g))
    indexes.set(m[1]!, Number(m[2]) + Number(m[3] ?? 0))

  // Showdown's own rule (Dex.getPokemonIconNum): the forme's own icon, else the species'.
  const nums = new Map<number, number>()
  for (const s of SPECIES) {
    const id = entries[s.dex]?.id
    if (!id) throw new Error(`#${s.dex}: run the pokemon step first`)
    nums.set(s.dex, indexes.get(id.replace(/-/g, '')) ?? rootDex(s.dex))
  }
  for (const s of SPECIES) entries[s.dex]!.i = nums.get(s.dex)!
  const rows = Math.ceil(sheet.height / ICON_H)
  if (sheet.width !== ICON_COLS * ICON_W || Math.max(...nums.values()) >= rows * ICON_COLS)
    throw new Error('Unexpected icon sheet layout')
  await mkdir(path.join(ROOT, 'src/assets'), { recursive: true })
  await writeFile(path.join(ROOT, 'src/assets/pokemon-icons.png'), buf)
  console.log(
    `Icons: ${new Set(nums.values()).size} icons for ${SPECIES.length} entries → src/assets/pokemon-icons.png`,
  )
}

// ---------------------------------------------------------------------------------------------------------------------
// Trainers

/**
 * Our sprite (its file under public/) → Showdown trainer id. Showdown's unsuffixed sprite is the default; a region's
 * own era stands in where Showdown has nothing unsuffixed (Kanto's `-gen3` FireRed/LeafGreen classes, Hoenn's `-gen6`
 * Omega Ruby/Alpha Sapphire cast) or where the character looked different then (Caitlin in Sinnoh). The player
 * characters keep FireRed/LeafGreen's Red and Leaf, the pair their throw strips (/characters/<c>-throw.png) are drawn
 * from.
 */
const TRAINERS: Record<
  'characters' | 'kanto' | 'johto' | 'hoenn' | 'sinnoh' | 'unova',
  Record<string, string>
> = {
  characters: {
    red: 'red-gen3',
    green: 'leaf-gen3',
    'prof-oak': 'oak',
  },
  kanto: {
    'aroma-lady': 'aromalady',
    beauty: 'beauty',
    biker: 'biker',
    'bird-keeper': 'birdkeeper',
    'black-belt': 'blackbelt',
    'blue-1': 'blue-gen3',
    'blue-2': 'blue-gen3two',
    'blue-3': 'blue-gen3champion',
    'boss-giovanni': 'giovanni',
    'bug-catcher': 'bugcatcher',
    burglar: 'burglar',
    camper: 'camper',
    'champion-blaine': 'blaine',
    'champion-brock': 'brock',
    'champion-erika': 'erika',
    'champion-giovanni': 'giovanni',
    'champion-koga': 'koga',
    'champion-lt-surge': 'ltsurge',
    'champion-misty': 'misty',
    'champion-sabrina': 'sabrina',
    channeler: 'channeler-gen3',
    'cool-couple': 'acetrainercouple',
    'cooltrainer-f': 'acetrainerf',
    'cooltrainer-m': 'acetrainer',
    'crush-kin': 'crushkin-gen3',
    'elite-agatha': 'agatha-gen3',
    'elite-bruno': 'bruno',
    'elite-lance': 'lance',
    'elite-lorelei': 'lorelei-gen3',
    engineer: 'engineer-gen3',
    fisherman: 'fisherman',
    gentleman: 'gentleman',
    hiker: 'hiker',
    juggler: 'juggler',
    karateka: 'battlegirl',
    lady: 'lady',
    lass: 'lass',
    'little-swimmer': 'tuber',
    painter: 'painter-gen3',
    picnicker: 'picnicker',
    pokemaniac: 'pokemaniac',
    'pokemon-breeder': 'pokemonbreeder',
    'psychic-f': 'psychicf',
    'psychic-m': 'psychic',
    'ranger-f': 'pokemonrangerf',
    'ranger-m': 'pokemonranger',
    rocker: 'rocker-gen3',
    'ruin-maniac': 'ruinmaniac',
    sailor: 'sailor',
    scientist: 'scientist',
    'sis-and-bro': 'sisandbro',
    'super-nerd': 'supernerd',
    'swimmer-f': 'swimmerf',
    'swimmer-m': 'swimmer',
    swimmers: 'sisandbro-gen3',
    tamer: 'tamer-gen3',
    'team-rocket-f': 'rocketgruntf',
    'team-rocket-m': 'rocketgrunt',
    twins: 'twins',
    youngster: 'youngster',
  },
  johto: {
    beauty: 'beauty',
    biker: 'biker',
    'bird-keeper': 'birdkeeper',
    'black-belt': 'blackbelt',
    'boss-giovanni': 'giovanni',
    'bug-catcher': 'bugcatcher',
    bugsy: 'bugsy',
    camper: 'camper',
    'champion-lance': 'lance',
    chuck: 'chuck',
    clair: 'clair',
    cyclist: 'cyclist',
    'elite-bruno': 'bruno',
    'elite-karen': 'karen',
    'elite-koga': 'koga',
    'elite-will': 'will',
    falkner: 'falkner',
    firebreather: 'firebreather',
    fisherman: 'fisherman',
    gentleman: 'gentleman',
    guitarist: 'guitarist',
    hiker: 'hiker',
    jasmine: 'jasmine',
    'kimono-girl': 'kimonogirl',
    lady: 'lady',
    lass: 'lass',
    morty: 'morty',
    officer: 'policeman',
    picnicker: 'picnicker',
    pokefan: 'pokefan',
    pryce: 'pryce',
    'psychic-f': 'psychicf',
    'psychic-m': 'psychic',
    red: 'red',
    'rocket-executive': 'archer',
    sage: 'sage',
    schoolboy: 'schoolboy',
    schoolgirl: 'schoolgirl',
    scientist: 'scientist',
    silver: 'silver',
    skier: 'skier',
    'super-nerd': 'supernerd',
    'swimmer-f': 'swimmerf',
    'swimmer-m': 'swimmer',
    'team-rocket-f': 'rocketgruntf',
    'team-rocket-m': 'rocketgrunt',
    twins: 'twins',
    whitney: 'whitney',
    youngster: 'youngster',
  },
  hoenn: {
    'aqua-grunt-m': 'aquagrunt',
    'aqua-leader-archie': 'archie-gen6',
    'aroma-lady': 'aromalady',
    'battle-girl': 'battlegirl',
    beauty: 'beauty',
    'bird-keeper': 'birdkeeper',
    'black-belt': 'blackbelt',
    brawly: 'brawly',
    'bug-catcher': 'bugcatcher',
    camper: 'camper',
    'champion-wallace': 'wallace',
    collector: 'collector',
    'dragon-tamer': 'dragontamer',
    'elite-drake': 'drake-gen3',
    'elite-glacia': 'glacia',
    'elite-phoebe': 'phoebe-gen6',
    'elite-sidney': 'sidney',
    fisherman: 'fisherman',
    flannery: 'flannery',
    gentleman: 'gentleman',
    guitarist: 'guitarist',
    'hex-maniac': 'hexmaniac-gen6',
    hiker: 'hiker',
    juan: 'juan',
    kindler: 'kindler-gen6',
    lady: 'lady',
    lass: 'lass',
    'magma-grunt-m': 'magmagrunt',
    'magma-leader-maxie': 'maxie-gen6',
    'ninja-boy': 'ninjaboy',
    norman: 'norman',
    'parasol-lady': 'parasollady',
    picnicker: 'picnicker',
    pokemaniac: 'pokemaniac',
    'psychic-f': 'psychicf',
    'psychic-m': 'psychic',
    'rich-boy': 'richboy',
    roxanne: 'roxanne',
    sailor: 'sailor',
    steven: 'steven',
    'swimmer-f': 'swimmerf',
    'swimmer-m': 'swimmer',
    'tate-and-liza': 'tateandliza-gen6',
    triathlete: 'triathletebiker-gen6',
    'tuber-m': 'tuber',
    wally: 'wally',
    wattson: 'wattson',
    winona: 'winona',
    youngster: 'youngster',
  },
  sinnoh: {
    'ace-trainer-f': 'acetrainerf',
    'ace-trainer-m': 'acetrainer',
    argenta: 'argenta',
    'aroma-lady': 'aromalady',
    artist: 'artist',
    barry: 'barry',
    'battle-girl': 'battlegirl',
    beauty: 'beauty',
    'black-belt': 'blackbelt',
    'breeder-f': 'pokemonbreederf',
    'breeder-m': 'pokemonbreeder',
    buck: 'buck',
    'bug-catcher': 'bugcatcher',
    byron: 'byron',
    caitlin: 'caitlin-gen4',
    candice: 'candice',
    'champion-cynthia': 'cynthia',
    cheryl: 'cheryl',
    clown: 'clown',
    cowgirl: 'cowgirl',
    'crasher-wake': 'crasherwake',
    'cyclist-f': 'cyclistf',
    'cyclist-m': 'cyclist',
    cyrus: 'cyrus',
    dahlia: 'dahlia',
    darach: 'darach',
    dawn: 'dawn',
    'elite-aaron': 'aaron',
    'elite-bertha': 'bertha',
    'elite-flint': 'flint',
    'elite-lucian': 'lucian',
    fantina: 'fantina',
    fisherman: 'fisherman',
    'galactic-grunt-f': 'galacticgruntf',
    'galactic-grunt-m': 'galacticgrunt',
    gardenia: 'gardenia',
    gentleman: 'gentleman',
    guitarist: 'guitarist',
    hiker: 'hiker',
    idol: 'idol',
    jogger: 'jogger',
    jupiter: 'jupiter',
    lady: 'lady',
    lass: 'lass',
    lucas: 'lucas',
    maid: 'maid',
    marley: 'marley',
    mars: 'mars',
    maylene: 'maylene',
    mira: 'mira',
    palmer: 'palmer',
    'parasol-lady': 'parasollady',
    'pokefan-f': 'pokefanf',
    'pokefan-m': 'pokefan',
    policeman: 'policeman',
    'psychic-f': 'psychicf',
    'psychic-m': 'psychic',
    'ranger-f': 'pokemonrangerf',
    'ranger-m': 'pokemonranger',
    reporter: 'reporter',
    riley: 'riley',
    roark: 'roark',
    roughneck: 'roughneck',
    'ruin-maniac': 'ruinmaniac',
    sailor: 'sailor',
    saturn: 'saturn',
    'school-kid-f': 'schoolkidf',
    'school-kid-m': 'schoolkid',
    scientist: 'scientist',
    'skier-f': 'skierf',
    'skier-m': 'skier',
    socialite: 'lady-gen4',
    'swimmer-f': 'swimmerf',
    'swimmer-m': 'swimmer',
    thorton: 'thorton',
    'tuber-f': 'tuberf',
    'tuber-m': 'tuber',
    twins: 'twins',
    'veteran-m': 'veteran',
    volkner: 'volkner',
    waiter: 'waiter',
    worker: 'worker',
    'young-couple': 'youngcouple',
    youngster: 'youngster',
  },
  unova: {
    'ace-trainer-f': 'acetrainerf',
    'ace-trainer-m': 'acetrainer',
    alder: 'alder',
    artist: 'artist',
    backers: 'backers',
    'backpacker-f': 'backpackerf',
    'backpacker-m': 'backpacker',
    baker: 'baker',
    'battle-girl': 'battlegirl',
    bianca: 'bianca',
    biker: 'biker',
    'black-belt': 'blackbelt',
    'breeder-m': 'pokemonbreeder',
    brycen: 'brycen',
    burgh: 'burgh',
    cheren: 'cheren',
    chili: 'chili',
    cilan: 'cilan',
    clay: 'clay',
    clerk: 'clerk',
    cress: 'cress',
    'cyclist-f': 'cyclistf',
    'cyclist-m': 'cyclist',
    cynthia: 'cynthia',
    dancer: 'dancer',
    doctor: 'doctor',
    drayden: 'drayden',
    elesa: 'elesa',
    'elite-caitlin': 'caitlin',
    'elite-grimsley': 'grimsley',
    'elite-marshal': 'marshal',
    'elite-shauntal': 'shauntal',
    fisherman: 'fisherman',
    gentleman: 'gentleman',
    ghetsis: 'ghetsis',
    harlequin: 'harlequin',
    hiker: 'hiker',
    hoopster: 'hoopster',
    infielder: 'infielder',
    janitor: 'janitor',
    lady: 'lady',
    lass: 'lass',
    lenora: 'lenora',
    linebacker: 'linebacker',
    maid: 'maid',
    musician: 'musician',
    n: 'n',
    nurse: 'nurse',
    'nursery-aide': 'nurseryaide',
    'parasol-lady': 'parasollady',
    pilot: 'pilot',
    'plasma-grunt-f': 'plasmagruntf',
    'plasma-grunt-m': 'plasmagrunt',
    'pokefan-f': 'pokefanf',
    'pokefan-m': 'pokefan',
    policeman: 'policeman',
    preschooler: 'preschooler',
    'psychic-f': 'psychicf',
    'psychic-m': 'psychic',
    'ranger-f': 'pokemonrangerf',
    'ranger-m': 'pokemonranger',
    roughneck: 'roughneck',
    'school-kid-f': 'schoolkidf',
    'school-kid-m': 'schoolkid',
    'scientist-f': 'scientistf',
    'scientist-m': 'scientist',
    skyla: 'skyla',
    smasher: 'smasher',
    socialite: 'lady-gen4',
    striker: 'striker',
    'swimmer-f': 'swimmerf',
    twins: 'twins',
    veteran: 'veteran',
    waiter: 'waiter',
    waitress: 'waitress',
    worker: 'worker',
    youngster: 'youngster',
    zinzolin: 'zinzolin',
  },
}

const PUBLIC = path.join(ROOT, 'public')
const fileFor = (region: keyof typeof TRAINERS, name: string) =>
  region === 'characters'
    ? path.join(PUBLIC, 'characters', `${name}.png`)
    : region === 'kanto'
      ? path.join(PUBLIC, 'trainers/classes', `${name}.png`)
      : path.join(PUBLIC, 'trainers/classes', region, `${name}.png`)

async function buildTrainers() {
  const jobs = Object.entries(TRAINERS).flatMap(([region, table]) =>
    Object.entries(table).map(([name, id]) => ({ file: fileFor(region as keyof typeof TRAINERS, name), id })),
  )
  await pool(jobs, 16, async ({ file, id }) => {
    const buf = await mustFetch(
      `${SHOWDOWN_SPRITES}/trainers/${id}.png`,
      path.join(CACHE, 'trainers', `${id}.png`),
    )
    const img = PNG.sync.read(buf)
    if (img.width !== TRAINER_CELL || img.height !== TRAINER_CELL)
      throw new Error(`${id}: ${img.width}×${img.height}`)
    await writeFile(file, PNG.sync.write(img, { colorType: 6 }))
  })
  console.log(`Trainers: ${jobs.length} sprites from Showdown written over public/`)

  // Every sprite the game names: trainers, social looks, the two characters and Professor Oak.
  const urls = new Set<string>(['/characters/red.png', '/characters/green.png', '/characters/prof-oak.png'])
  for (const t of trainers as { spriteUrl: string | null }[]) if (t.spriteUrl) urls.add(t.spriteUrl)
  for (const g of AVATAR_GROUPS) for (const a of g.avatars) urls.add(a.src)
  const regionOf = (url: string) => url.match(/^\/trainers\/classes\/([a-z]+)\//)?.[1] ?? 'kanto'
  const byRegion = new Map<string, string[]>()
  for (const url of [...urls].sort())
    byRegion.set(regionOf(url), [...(byRegion.get(regionOf(url)) ?? []), url])

  const atlas: { sheets: Record<string, number>; cells: Record<string, [sheet: string, cell: number]> } = {
    sheets: {},
    cells: {},
  }
  await mkdir(path.join(ROOT, 'src/assets/trainers'), { recursive: true })
  for (const [region, list] of byRegion) {
    const rows = Math.ceil(list.length / TRAINER_COLS)
    const out = new PNG({ width: TRAINER_COLS * TRAINER_PITCH, height: rows * TRAINER_PITCH })
    for (const [i, url] of list.entries()) {
      const img = PNG.sync.read(await readFile(path.join(PUBLIC, url)))
      // Every sprite is Showdown's 80×80 now; a smaller one would sit on the cell's floor.
      const dx = Math.floor((TRAINER_CELL - img.width) / 2)
      const dy = TRAINER_CELL - img.height
      const x = (i % TRAINER_COLS) * TRAINER_PITCH
      const y = Math.floor(i / TRAINER_COLS) * TRAINER_PITCH
      blit(
        img,
        0,
        0,
        Math.min(img.width, TRAINER_CELL),
        Math.min(img.height, TRAINER_CELL),
        out,
        x + Math.max(0, dx),
        y + Math.max(0, dy),
      )
      atlas.cells[url] = [region, i]
    }
    atlas.sheets[region] = rows
    await writeFile(
      path.join(ROOT, 'src/assets/trainers', `${region}.png`),
      PNG.sync.write(out, { colorType: 6 }),
    )
    console.log(`  ${region}: ${list.length} sprites → src/assets/trainers/${region}.png`)
  }
  await writeFile(ATLAS_JSON, `${JSON.stringify(atlas)}\n`)
}

// ---------------------------------------------------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2)
  const steps = args.length ? args : ['pokemon', 'icons', 'cries', 'trainers']
  for (const s of steps)
    if (!['pokemon', 'icons', 'cries', 'trainers'].includes(s)) throw new Error(`Unknown step: ${s}`)
  const entries: Record<string, ShowdownEntry> = existsSync(SPRITES_JSON)
    ? JSON.parse(await readFile(SPRITES_JSON, 'utf8'))
    : {}
  if (steps.includes('pokemon')) await buildPokemon(entries)
  if (steps.includes('icons')) await buildIcons(entries)
  if (steps.includes('cries')) await buildCries(entries)
  if (steps.some((s) => s !== 'trainers')) {
    const sorted = Object.fromEntries(Object.entries(entries).sort(([a], [b]) => Number(a) - Number(b)))
    await writeFile(SPRITES_JSON, `${JSON.stringify(sorted)}\n`)
  }
  if (steps.includes('trainers')) {
    await buildTrainers()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
