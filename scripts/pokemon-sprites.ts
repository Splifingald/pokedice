/**
 * Pokémon sprites — the same 6 PNGs per Pokémon, from either of two sources.
 *
 * `pnpm pokemon-sprites --fetch` (all 386, the current source) pulls the real game assets from the pret/pokeemerald
 * decomp and writes them into graphics/pokemon. Per species the decomp holds `front.png` and `back.png` as 64×64
 * indexed PNGs plus `normal.pal` / `shiny.pal`, so a shiny is a palette swap rather than a second image, and
 * `icon.png` as a 32×64 pair of box-icon frames. Responses are cached under scripts/.cache, so re-runs are offline.
 *
 * `pnpm pokemon-sprites [outDir] [sheet]` is the older path: cuts graphics/pokemon/pokemon.png (MishaK9's
 * FireRed/LeafGreen sheet), 151 only. Kept because it still works, but the decomp covers all three regions.
 * Sheet layout: 1px black grid lines, 64×64 cells on a 65px pitch from (11, 11). 15 Pokémon per row, each a block of
 * 2 cells wide × (34px header + 2 cells): header = name label + two 32×32 mini frames, then front | front shiny over
 * back | back shiny. Each cell has a flat background colour, which becomes transparent.
 *
 * `pnpm pokemon-sprites --platinum` cuts Gen 4 (#387–493) out of graphics/pokemon/platinum.png, the Platinum sheet.
 * That sheet is 3241×3511 with no alpha, so the backdrop is a flat colour (light blue, or green where the art is
 * unchanged from Diamond/Pearl) and `clearBackground()` takes it. Geometry, measured off the file: 80×80 cells on an
 * 81px column pitch from x=1 (40 columns), and 18 block rows on a 195px pitch from y=34, each a 34px label band over
 * two cell rows. A species owns 4 columns × 2 rows — front, front, back, back across, normal over shiny down — and
 * its two 32×32 Box-icon frames sit in the band, right-aligned to the end of those four columns. Gendered pairs and
 * form variants take slots of their own, so PLATINUM_SLOTS below maps each dex number to the first slot of its block
 * — male, Plant Cloak, West Sea, Land Forme, Altered Forme, plain Rotom, plain Arceus — and to how many slots the
 * whole block spans, which is what the Box icons are right-aligned to.
 *
 * `pnpm pokemon-sprites --unova` cuts Gen 5 (#494–649) out of the four B2W2 sheets in graphics/pokemon
 * (b2w2-front.png, b2w2-back.png, b2w2-front-shiny.png, b2w2-back-shiny.png — The Spriters Resource, lossless). All four
 * share one layout, measured off the files: 96×96 cells, 8 columns, a 103px row pitch (a 7px label strip under each
 * cell), each cell on a flat colour. Forms and genders take slots of their own, so UNOVA_SLOTS lists the sheet's labels
 * in order and picks one per dex. The sheets carry no Box icons, so the menu icon is the front sprite for now (see
 * `unovaMinis`).
 *
 * `pnpm pokemon-sprites --fetch-bw [from] [to] [outDir]` (default 650 1025) downloads Gen 6–9 from PokeAPI's top-level
 * sprites/pokemon folder: Black/White-style art for the whole dex, which for #650+ is the Smogon Sprite Project's work
 * (see docs/10-GEN6-9-SPRITES.md for sources and credit). Per dex: `{dex}.png`, `back/`, `shiny/` and `back/shiny/`,
 * 96×96 with a real alpha channel, so no backdrop to clear. Each goes through `fitCanvas()` like Gen 4 and 5, and the
 * menu icons come from the front (`unovaMinis`). English names come from PokeAPI's species CSVs, since
 * src/data/pokemon.json stops at 649. Everything is cached under scripts/.cache/pokeapi.
 *
 * `pnpm pokemon-sprites --publish [srcDir]` copies those files (default graphics/pokemon) into public/pokemon with short
 * names (001_front.png, 001_back_shiny.png, 001_mini.png — both Box-icon frames in one strip, see `miniStrip`…) and
 * writes src/data/sprite-metrics.json: the transparent
 * rows under each front / back sprite, so the battle scene can stand every Pokémon on its platform.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
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

/**
 * File-safe English name: Nidoran♀ → Nidoran-F, Farfetch’d → Farfetchd, Mr. Mime → Mr-Mime, Type: Null → Type-Null,
 * Flabébé → Flabebe.
 */
export const fileName = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/♀/g, '-F')
    .replace(/♂/g, '-M')
    .replace(/['’.:]/g, '')
    .trim()
    .replace(/\s+/g, '-')

// Platinum sheet geometry (graphics/pokemon/platinum.png), measured off the file.
const PT_CELL = 80
const PT_X0 = 1
const PT_COL = 81
const PT_SLOT_COLS = 4
const PT_BLOCK_Y0 = 34
const PT_BLOCK_PITCH = 195
/** The Box icons are 32px on a 33px pitch, right-aligned to the last of the species' four columns. */
const PT_ICON_PITCH = MINI + 1

/**
 * Dex number → `[block row, slot]` of the **first** slot of that species' block on the Platinum sheet, read off the
 * dex numbers the sheet prints in its label bands. A species with gendered art or several forms owns more than one
 * slot; the first is always the one this game wants, because the sheet orders them male-then-female and
 * default-form-first.
 */
const PLATINUM_SLOTS: Record<number, [row: number, slot: number, slots: number]> = {
  387: [0, 0, 1], 388: [0, 1, 1], 389: [0, 2, 1], 390: [0, 3, 1],
  391: [0, 4, 1], 392: [0, 5, 1], 393: [0, 6, 1], 394: [0, 7, 1],
  395: [0, 8, 2], 396: [1, 0, 2], 397: [1, 2, 2], 398: [1, 4, 2],
  399: [1, 6, 2], 400: [1, 8, 2], 401: [2, 0, 2], 402: [2, 2, 2],
  403: [2, 4, 2], 404: [2, 6, 2], 405: [2, 8, 2], 406: [3, 0, 1],
  407: [3, 1, 2], 408: [3, 3, 1], 409: [3, 4, 1], 410: [3, 5, 1],
  411: [3, 6, 1], 412: [3, 7, 3], 413: [4, 0, 3], 414: [4, 3, 1],
  415: [4, 4, 2], 416: [4, 6, 1], 417: [4, 7, 3], 418: [5, 0, 2],
  419: [5, 2, 2], 420: [5, 4, 1], 421: [5, 5, 2], 422: [5, 7, 3],
  423: [6, 0, 2], 424: [6, 2, 2], 425: [6, 4, 1], 426: [6, 5, 1],
  427: [6, 6, 1], 428: [6, 7, 1], 429: [6, 8, 1], 430: [6, 9, 1],
  431: [7, 0, 1], 432: [7, 1, 1], 433: [7, 2, 1], 434: [7, 3, 1],
  435: [7, 4, 1], 436: [7, 5, 1], 437: [7, 6, 1], 438: [7, 7, 1],
  439: [7, 8, 1], 440: [7, 9, 1], 441: [8, 0, 1], 442: [8, 1, 1],
  443: [8, 2, 2], 444: [8, 4, 2], 445: [8, 6, 2], 446: [8, 8, 1],
  447: [8, 9, 1], 448: [9, 0, 1], 449: [9, 1, 2], 450: [9, 3, 2],
  451: [9, 5, 1], 452: [9, 6, 1], 453: [9, 7, 3], 454: [10, 0, 2],
  455: [10, 2, 1], 456: [10, 3, 2], 457: [10, 5, 2], 458: [10, 7, 1],
  459: [10, 8, 2], 460: [11, 0, 2], 461: [11, 2, 2], 462: [11, 4, 1],
  463: [11, 5, 1], 464: [11, 6, 2], 465: [11, 8, 2], 466: [12, 0, 1],
  467: [12, 1, 1], 468: [12, 2, 1], 469: [12, 3, 1], 470: [12, 4, 1],
  471: [12, 5, 1], 472: [12, 6, 1], 473: [12, 7, 2], 474: [12, 9, 1],
  475: [13, 0, 1], 476: [13, 1, 1], 477: [13, 2, 1], 478: [13, 3, 1],
  479: [13, 4, 6], 480: [14, 0, 1], 481: [14, 1, 1], 482: [14, 2, 1],
  483: [14, 3, 1], 484: [14, 4, 1], 485: [14, 5, 1], 486: [14, 6, 1],
  487: [14, 7, 2], 488: [14, 9, 1], 489: [15, 0, 1], 490: [15, 1, 1],
  491: [15, 2, 1], 492: [15, 3, 7], 493: [16, 0, 10],
}

/**
 * Fits an 80×80 Gen 4 cell into the 64×64 canvas every other sprite in this game uses: the art is trimmed to its
 * bounding box and put back centred and bottom-aligned. Nothing is lost by dropping the cell's own bottom padding,
 * because the battle scene stands every sprite on its lowest opaque row anyway (`cellBox` in BattleView adds the
 * gap back). Only art too big for the canvas is scaled, nearest neighbour, which keeps the pixels square.
 */
function fitCanvas(img: PNG, size = CELL): PNG {
  const out = new PNG({ width: size, height: size })
  out.data.fill(0)
  let x0 = img.width
  let y0 = img.height
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.data[(y * img.width + x) * 4 + 3] === 0) continue
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  if (x1 < 0) return out
  const w = x1 - x0 + 1
  const h = y1 - y0 + 1
  const scale = Math.min(1, size / w, size / h)
  const dw = Math.max(1, Math.round(w * scale))
  const dh = Math.max(1, Math.round(h * scale))
  const dx = Math.floor((size - dw) / 2)
  const dy = size - dh
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const sx = x0 + Math.min(w - 1, Math.floor(x / scale))
      const sy = y0 + Math.min(h - 1, Math.floor(y / scale))
      const s = (sy * img.width + sx) * 4
      const d = ((dy + y) * size + dx + x) * 4
      out.data[d] = img.data[s]!
      out.data[d + 1] = img.data[s + 1]!
      out.data[d + 2] = img.data[s + 2]!
      out.data[d + 3] = img.data[s + 3]!
    }
  }
  return out
}

/** The six sprites of one Gen 4 species, cut from its block on the Platinum sheet. */
function platinumSprites(sheet: PNG, row: number, slot: number, slots: number): Record<string, PNG> {
  const x = PT_X0 + PT_COL * PT_SLOT_COLS * slot
  const y = PT_BLOCK_Y0 + PT_BLOCK_PITCH * row
  // col 0/1 are the front's two animation frames, col 2/3 the back's; the second cell row is the shiny palette.
  const cell = (col: number, shiny: 0 | 1) =>
    fitCanvas(clearBackground(crop(sheet, x + col * PT_COL, y + shiny * PT_COL, PT_CELL, PT_CELL)))
  // The icons sit at the end of the species' whole block, which is wider than one slot where the sheet carries both
  // sexes or several forms. `slots` is an upper bound — a block that is the last of its row looks like it runs to the
  // row's end when it does not — so the widest span that actually holds an icon is the right one.
  const iconsAt = (span: number) => {
    const end = PT_X0 + PT_COL * PT_SLOT_COLS * (slot + span) - 1
    return [0, 1].map((frame) =>
      clearBackground(crop(sheet, end - MINI - (1 - frame) * PT_ICON_PITCH, PT_BLOCK_PITCH * row + 1, MINI, MINI)),
    )
  }
  let icons = iconsAt(slots)
  for (let span = slots - 1; span >= 1 && icons.some(isEmpty); span--) icons = iconsAt(span)
  return {
    front: cell(0, 0),
    front_shiny: cell(0, 1),
    back: cell(2, 0),
    back_shiny: cell(2, 1),
    miniature_1: icons[0]!,
    miniature_2: icons[1]!,
  }
}

// B2W2 sheet geometry (graphics/pokemon/b2w2-*.png), measured off the files.
const BW_CELL = 96
const BW_ROW = 103
const BW_COLS = 8

/**
 * The sheets' labels in order, one per slot: a plain dex number, or the dex with its form / gender suffix. Every
 * species not listed with a suffix owns exactly one slot. Picked per dex: the first slot, except where the male art
 * comes second (Unfezant, Frillish, Jellicent).
 */
const UNOVA_FORMS: Record<number, { slots: number; pick: number }> = {
  521: { slots: 2, pick: 1 }, // F, M
  550: { slots: 2, pick: 0 }, // Red-Striped, Blue-Striped
  555: { slots: 2, pick: 0 }, // Standard, Zen
  585: { slots: 4, pick: 0 }, // Spring…Winter
  586: { slots: 4, pick: 0 },
  592: { slots: 2, pick: 1 }, // F, M
  593: { slots: 2, pick: 1 },
  641: { slots: 2, pick: 0 }, // Incarnate, Therian
  642: { slots: 2, pick: 0 },
  645: { slots: 2, pick: 0 },
  646: { slots: 3, pick: 0 }, // Kyurem, White, Black
  647: { slots: 2, pick: 0 }, // Ordinary, Resolute
  648: { slots: 2, pick: 0 }, // Aria, Pirouette
  649: { slots: 4, pick: 0 }, // plain, then the four Drives
}

/** Dex → slot index on the B2W2 sheets. */
export function unovaSlots(): Map<number, number> {
  const out = new Map<number, number>()
  let slot = 0
  for (let dex = 494; dex <= 649; dex++) {
    const form = UNOVA_FORMS[dex]
    out.set(dex, slot + (form?.pick ?? 0))
    slot += form?.slots ?? 1
  }
  return out
}

/**
 * Menu icons from the front sprite, since the sheets have none: the art trimmed to a square around it (so it fills
 * a 32px menu slot rather than shrinking into a corner of a 64px canvas), bottom-aligned; the second frame is the same
 * art one pixel higher, which keeps the hop every other Pokémon's icon has.
 */
function unovaMinis(front: PNG): [PNG, PNG] {
  let x0 = front.width
  let y0 = front.height
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < front.height; y++)
    for (let x = 0; x < front.width; x++) {
      if (front.data[(y * front.width + x) * 4 + 3] === 0) continue
      x0 = Math.min(x0, x)
      x1 = Math.max(x1, x)
      y0 = Math.min(y0, y)
      y1 = Math.max(y1, y)
    }
  const w = x1 - x0 + 1
  const h = y1 - y0 + 1
  const size = Math.max(w, h + 1)
  const frame = (lift: number) => {
    const out = new PNG({ width: size, height: size })
    out.data.fill(0)
    PNG.bitblt(front, out, x0, y0, w, h, Math.floor((size - w) / 2), size - h - lift)
    return out
  }
  return [frame(0), frame(1)]
}

/** Cuts #494–649 from the four B2W2 sheets into `outDir`, named like the decomp path's files. */
async function cutUnova(outDir: string) {
  const sheet = async (name: string) => PNG.sync.read(await readFile(path.join(ROOT, `graphics/pokemon/b2w2-${name}.png`)))
  const sheets = {
    front: await sheet('front'),
    front_shiny: await sheet('front-shiny'),
    back: await sheet('back'),
    back_shiny: await sheet('back-shiny'),
  }
  await mkdir(outDir, { recursive: true })
  const byDex = new Map(pokemon.map((p) => [p.dex, p.name]))
  const failed: string[] = []
  let n = 0
  for (const [dex, slot] of unovaSlots()) {
    const name = byDex.get(dex)
    if (!name) {
      failed.push(`${dex}: not in src/data/pokemon.json — run pnpm seed-regions first`)
      continue
    }
    const x = (slot % BW_COLS) * BW_CELL
    const y = Math.floor(slot / BW_COLS) * BW_ROW
    const cut: Record<string, PNG> = {}
    for (const [kind, img] of Object.entries(sheets)) cut[kind] = fitCanvas(clearBackground(crop(img, x, y, BW_CELL, BW_CELL)))
    const [mini1, mini2] = unovaMinis(cut.front!)
    cut.miniature_1 = mini1
    cut.miniature_2 = mini2
    const prefix = `${String(dex).padStart(3, '0')}_${fileName(name)}`
    for (const [kind, img] of Object.entries(cut)) {
      if (isEmpty(img)) {
        failed.push(`${dex} ${name} ${kind}: empty cell at slot ${slot}`)
        continue
      }
      await writeFile(path.join(outDir, `${prefix}_${kind}.png`), PNG.sync.write(img))
      n++
    }
  }
  console.log(`${n} Gen 5 sprites written to ${outDir}`)
  if (failed.length) {
    console.error(`
${failed.length} failures:`)
    for (const f of failed) console.error(`  ${f}`)
    process.exitCode = 1
  }
}

/** Cuts every species PLATINUM_SLOTS knows about into `outDir`, named like the decomp path's files. */
async function cutPlatinum(outDir: string) {
  const sheet = PNG.sync.read(await readFile(path.join(ROOT, 'graphics/pokemon/platinum.png')))
  await mkdir(outDir, { recursive: true })
  const byDex = new Map(pokemon.map((p) => [p.dex, p.name]))
  const failed: string[] = []
  let n = 0
  for (const [key, [row, slot, slots]] of Object.entries(PLATINUM_SLOTS)) {
    const dex = Number(key)
    const name = byDex.get(dex)
    if (!name) {
      failed.push(`${dex}: not in src/data/pokemon.json — run pnpm seed-regions first`)
      continue
    }
    const prefix = `${String(dex).padStart(3, '0')}_${fileName(name)}`
    for (const [kind, img] of Object.entries(platinumSprites(sheet, row, slot, slots))) {
      if (isEmpty(img)) {
        failed.push(`${dex} ${name} ${kind}: empty cell at [${row},${slot}]`)
        continue
      }
      await writeFile(path.join(outDir, `${prefix}_${kind}.png`), PNG.sync.write(img))
      n++
    }
  }
  console.log(`${n} Gen 4 sprites written to ${outDir}`)
  if (failed.length) {
    console.error(`\n${failed.length} failures:`)
    for (const f of failed) console.error(`  ${f}`)
    process.exitCode = 1
  }
}

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

// ---------------------------------------------------------------- the decomp source (--fetch)

const DECOMP = 'https://raw.githubusercontent.com/pret/pokeemerald/master/graphics/pokemon'
const CACHE_DIR = path.join(ROOT, 'scripts', '.cache', 'decomp')

/**
 * The decomp's folder for a species: its English name, lowercased, with anything that isn't a letter or digit turned
 * into an underscore (`Nidoran♀` → `nidoran_f`, `Mr. Mime` → `mr_mime`, `Ho-Oh` → `ho_oh`, `Farfetch'd` →
 * `farfetchd`). Unown is the one species kept in per-letter folders.
 */
export function decompDir(name: string): string {
  return name
    .replace(/♀/g, ' f')
    .replace(/♂/g, ' m')
    .replace(/['’.]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

export interface DecompPaths {
  front: string
  back: string
  normal: string
  shiny: string
  icon: string
}

/**
 * Where each of a species' five files lives. Nearly always side by side in one folder, but the two species with
 * alternate forms split them: Unown keeps a folder per letter with the palettes one level up, and Castform keeps its
 * artwork under the weather form it is in while the icon stays at the top.
 */
export function decompPaths(name: string): DecompPaths {
  const d = decompDir(name)
  const all = (dir: string): DecompPaths => ({
    front: `${dir}/front.png`,
    back: `${dir}/back.png`,
    normal: `${dir}/normal.pal`,
    shiny: `${dir}/shiny.pal`,
    icon: `${dir}/icon.png`,
  })
  if (name === 'Unown') return { ...all('unown/a'), normal: 'unown/normal.pal', shiny: 'unown/shiny.pal' }
  if (name === 'Castform') return { ...all('castform/normal'), icon: 'castform/icon.png' }
  return all(d)
}

const fetchFile = (rel: string) => fetchCached(`${DECOMP}/${rel}`, path.join(CACHE_DIR, rel.replace(/\//g, '_')))

/** GET `url`, or read it back from `file` if an earlier run already saved it there. Retries with backoff. */
async function fetchCached(url: string, file: string): Promise<Buffer> {
  if (existsSync(file)) return readFile(file)
  let lastErr: unknown
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url)
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

type Rgb = [number, number, number]

/** JASC-PAL: a 3-line header ("JASC-PAL", "0100", count) then one "r g b" per colour. */
function parsePal(text: string): Rgb[] {
  const lines = text.split(/\r?\n/)
  const n = Number(lines[2])
  return Array.from({ length: n }, (_, i) => lines[3 + i]!.trim().split(/\s+/).map(Number) as Rgb)
}

const key = ([r, g, b]: Rgb) => (r << 16) | (g << 8) | b

/**
 * Re-colours an indexed sprite. The decomp's PNG carries the normal palette, so each pixel is matched back to its
 * index in `from` and re-emitted from `to` — which is exactly how the game makes a shiny. Index 0 is the backdrop
 * and becomes transparent. A colour that isn't in the palette (there shouldn't be any) is left as it is.
 */
function recolour(buf: Buffer, from: Rgb[], to: Rgb[]): PNG {
  const read = PNG.sync.read(buf)
  // A few species (Blaziken, Swampert, Rayquaza, Deoxys…) ship front.png as a vertical strip of animation frames.
  // The first frame is the sprite the game shows at rest; the rest are the idle animation, which this game has not.
  const img = read.height > CELL ? crop(read, 0, 0, CELL, CELL) : read
  // Lowest index wins: several palettes repeat a colour, and the repeat must not shadow index 0 — which is the
  // backdrop, and the only thing telling us which pixels are background at all.
  const index = new Map<number, number>()
  from.forEach((c, i) => {
    if (!index.has(key(c))) index.set(key(c), i)
  })
  const backdrop = key(from[0]!)
  const { data } = img
  for (let i = 0; i < data.length; i += 4) {
    const colour = (data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!
    if (colour === backdrop) {
      data[i + 3] = 0
      continue
    }
    const idx = index.get(colour)
    if (idx === undefined) continue
    const [r, g, b] = to[idx] ?? from[idx]!
    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
    data[i + 3] = 255
  }
  return img
}

/** One frame of a 32×64 box icon, with the icon palette's index 0 (its own backdrop colour) cleared. */
function iconFrame(buf: Buffer, frame: 0 | 1): PNG {
  const src = PNG.sync.read(buf)
  const out = new PNG({ width: MINI, height: MINI })
  PNG.bitblt(src, out, 0, frame * MINI, MINI, MINI, 0, 0)
  const bg = (out.data[0]! << 16) | (out.data[1]! << 8) | out.data[2]!
  for (let i = 0; i < out.data.length; i += 4) {
    if (((out.data[i]! << 16) | (out.data[i + 1]! << 8) | out.data[i + 2]!) === bg) out.data[i + 3] = 0
  }
  return out
}

async function fetchAll(outDir: string) {
  await mkdir(CACHE_DIR, { recursive: true })
  await mkdir(outDir, { recursive: true })
  const failed: string[] = []
  let n = 0
  for (const p of pokemon) {
    const paths = decompPaths(p.name)
    try {
      const [front, back, normal, shiny, icon] = await Promise.all([
        fetchFile(paths.front),
        fetchFile(paths.back),
        fetchFile(paths.normal),
        fetchFile(paths.shiny),
        fetchFile(paths.icon),
      ])
      const pal = parsePal(normal.toString('utf8'))
      const shinyPal = parsePal(shiny.toString('utf8'))
      const sprites: Record<string, PNG> = {
        front: recolour(front, pal, pal),
        front_shiny: recolour(front, pal, shinyPal),
        back: recolour(back, pal, pal),
        back_shiny: recolour(back, pal, shinyPal),
        miniature_1: iconFrame(icon, 0),
        miniature_2: iconFrame(icon, 1),
      }
      const prefix = `${String(p.dex).padStart(3, '0')}_${fileName(p.name)}`
      for (const [kind, img] of Object.entries(sprites)) {
        if (isEmpty(img)) {
          failed.push(`${p.dex} ${p.name} ${kind}: empty`)
          continue
        }
        await writeFile(path.join(outDir, `${prefix}_${kind}.png`), PNG.sync.write(img))
        n++
      }
    } catch (err) {
      failed.push(`${p.dex} ${p.name} (${paths.front}): ${(err as Error).message}`)
    }
    if (p.dex % 50 === 0) console.log(`  … ${p.dex}/${pokemon.length}`)
  }
  console.log(`${n} sprites written to ${outDir}`)
  if (failed.length) {
    console.error(`\n${failed.length} failures:`)
    for (const f of failed) console.error(`  ${f}`)
    process.exitCode = 1
  }
}

// ---------------------------------------------------------------- the Black/White-style source (--fetch-bw)

const POKEAPI_SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon'
const POKEAPI_CSV = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv'
const BW_CACHE_DIR = path.join(ROOT, 'scripts', '.cache', 'pokeapi')
const ENGLISH = 9

/** The four views and where PokeAPI keeps each, relative to sprites/pokemon. */
const BW_VIEWS: [kind: string, dir: string][] = [
  ['front', ''],
  ['back', 'back/'],
  ['front_shiny', 'shiny/'],
  ['back_shiny', 'back/shiny/'],
]

/** A plain CSV reader: enough for PokeAPI's files, which quote a field only when it holds a comma. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue
    const row: string[] = []
    let field = ''
    let quoted = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]!
      if (quoted) {
        if (c === '"' && line[i + 1] === '"') field += line[++i]
        else if (c === '"') quoted = false
        else field += c
      } else if (c === '"') quoted = true
      else if (c === ',') {
        row.push(field)
        field = ''
      } else field += c
    }
    row.push(field)
    rows.push(row)
  }
  return rows
}

/** Dex → English name for every species PokeAPI knows, from pokemon_species.csv and pokemon_species_names.csv. */
async function speciesNames(): Promise<Map<number, string>> {
  const csv = async (name: string) =>
    parseCsv((await fetchCached(`${POKEAPI_CSV}/${name}`, path.join(BW_CACHE_DIR, name))).toString('utf8')).slice(1)
  const names = new Map<number, string>()
  for (const [id, lang, name] of await csv('pokemon_species_names.csv'))
    if (Number(lang) === ENGLISH) names.set(Number(id), name!)
  const out = new Map<number, string>()
  // pokemon_species.csv is the list of what exists; the names file only labels it.
  for (const [id, identifier] of await csv('pokemon_species.csv')) out.set(Number(id), names.get(Number(id)) ?? identifier!)
  return out
}

/** Downloads #from–to in the four views, fits them to 64×64 and writes the six files per species into `outDir`. */
async function fetchBw(from: number, to: number, outDir: string) {
  await mkdir(BW_CACHE_DIR, { recursive: true })
  await mkdir(outDir, { recursive: true })
  const names = await speciesNames()
  const failed: string[] = []
  let n = 0
  let species = 0
  for (let dex = from; dex <= to; dex++) {
    const name = names.get(dex)
    if (!name) {
      failed.push(`${dex}: not in PokeAPI's pokemon_species.csv`)
      continue
    }
    const sprites: Record<string, PNG> = {}
    try {
      for (const [kind, dir] of BW_VIEWS) {
        const buf = await fetchCached(
          `${POKEAPI_SPRITES}/${dir}${dex}.png`,
          path.join(BW_CACHE_DIR, `${kind}_${dex}.png`),
        )
        sprites[kind] = fitCanvas(PNG.sync.read(buf))
      }
    } catch (err) {
      failed.push(`${dex} ${name}: ${(err as Error).message}`)
      continue
    }
    const [mini1, mini2] = unovaMinis(sprites.front!)
    sprites.miniature_1 = mini1
    sprites.miniature_2 = mini2
    const prefix = `${String(dex).padStart(3, '0')}_${fileName(name)}`
    for (const [kind, img] of Object.entries(sprites)) {
      if (isEmpty(img)) {
        failed.push(`${dex} ${name} ${kind}: empty`)
        continue
      }
      await writeFile(path.join(outDir, `${prefix}_${kind}.png`), PNG.sync.write(img))
      n++
    }
    species++
    if (dex % 50 === 0) console.log(`  … ${dex}/${to}`)
  }
  console.log(`${n} sprites for ${species} species (#${from}–${to}) written to ${outDir}`)
  if (failed.length) {
    console.error(`\n${failed.length} failures:`)
    for (const f of failed) console.error(`  ${f}`)
    process.exitCode = 1
  }
}

/**
 * The two Box-icon frames side by side in one PNG (frame 1 left), so a menu icon costs one request instead of two.
 * Frames are square — 32×32, or Unova's N×N — and the strip is 2N×N.
 */
export function miniStrip(a: PNG, b: PNG): PNG {
  const size = Math.max(a.width, a.height, b.width, b.height)
  const out = new PNG({ width: size * 2, height: size })
  out.data.fill(0)
  PNG.bitblt(a, out, 0, 0, a.width, a.height, 0, size - a.height)
  PNG.bitblt(b, out, 0, 0, b.width, b.height, size, size - b.height)
  return out
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
    ]
    const m = { front: 0, back: 0 }
    for (const [from, to] of kinds) {
      const buf = await readFile(path.join(srcDir, `${prefix}_${from}.png`))
      if (from === 'front' || from === 'back') m[from] = bottomGap(PNG.sync.read(buf))
      await writeFile(path.join(outDir, `${short}_${to}.png`), buf)
      n++
    }
    const frame = async (k: number) => PNG.sync.read(await readFile(path.join(srcDir, `${prefix}_miniature_${k}.png`)))
    await writeFile(path.join(outDir, `${short}_mini.png`), PNG.sync.write(miniStrip(await frame(1), await frame(2))))
    n++
    metrics[p.dex] = m
  }
  await writeFile(path.join(ROOT, 'src/data/sprite-metrics.json'), JSON.stringify(metrics) + '\n')
  console.log(`${n} sprites copied to ${outDir}; metrics in src/data/sprite-metrics.json`)
}

async function main() {
  if (process.argv[2] === '--fetch') return fetchAll(path.resolve(process.argv[3] ?? path.join(ROOT, 'graphics/pokemon')))
  if (process.argv[2] === '--platinum')
    return cutPlatinum(path.resolve(process.argv[3] ?? path.join(ROOT, 'graphics/pokemon')))
  if (process.argv[2] === '--unova') return cutUnova(path.resolve(process.argv[3] ?? path.join(ROOT, 'graphics/pokemon')))
  if (process.argv[2] === '--fetch-bw')
    return fetchBw(
      Number(process.argv[3] ?? 650),
      Number(process.argv[4] ?? 1025),
      path.resolve(process.argv[5] ?? path.join(ROOT, 'graphics/pokemon')),
    )
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
