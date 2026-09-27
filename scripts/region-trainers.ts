/**
 * pnpm region-trainers — the trainer sprites for Johto, Hoenn, Sinnoh and Unova.
 *
 * Hoenn comes from the pret/pokeemerald decomp, where every trainer pic is its own named 64×64 indexed PNG
 * (`graphics/trainers/front_pics/leader_roxanne.png`). Named files mean no guessing which cell is which leader.
 *
 * Johto comes from graphics/trainers/hgss.png, the HGSS trainer sheet: 80×80 cells on an 81px column pitch from x=1
 * and a 98px row pitch from y=18, the 18px bands being the section labels printed on the sheet. Those labels are what
 * makes the position map below trustworthy — each leader owns three consecutive cells (three battle poses), and the
 * first pose is the one used.
 *
 * Sinnoh comes from graphics/trainers/dppt.png, the DPPt trainer sheet. Same ripper and the same geometry as the
 * HGSS one down to the pixel — 973px wide, 80×80 cells on an 81px column pitch from x=1, a 98px row pitch from y=18 —
 * so it goes through the same cutter with the same constants. Rows 7–14 are the labelled bands (the eight leaders,
 * the Elite Four, Cynthia, Team Galactic, the Frontier Brains); rows 0–6 are the "other trainers" class blocks.
 *
 * Unova comes from graphics/trainers/b2w2.png, the B2W2 trainer sheet, which is built differently: no labels, 4 columns
 * × 41 rows of 256×128 blocks between 2px teal lines, and each block holds one trainer's loose animation parts plus the
 * assembled figure. The figure is the tallest shape in its block (the parts are all small), so that is what is cut —
 * see `unovaFigure`. B2W2 is not the game Unova is routed on, so the characters whose Black/White look is not on it
 * (Cheren, Elesa, the Plasma grunts) come from graphics/trainers/showdown-bw/, Pokémon Showdown's BW sprites.
 *
 * All four write into public/trainers/classes/<region>/, which is what `trainerSprite()` in trainer-sprites.ts
 * points at.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CACHE_DIR = path.join(ROOT, 'scripts', '.cache', 'trainers')
const DECOMP = 'https://raw.githubusercontent.com/pret/pokeemerald/master/graphics/trainers/front_pics'
const OUT = path.join(ROOT, 'public/trainers/classes')

// HGSS sheet geometry, measured off the sheet.
const HG_CELL = 80
const HG_X0 = 1
const HG_Y0 = 18
const HG_COL = 81
const HG_ROW = 98

/**
 * Johto: `[row, col]` on the HGSS sheet → sprite name. Rows 8–13 are the labelled leader/Elite Four bands, row 14 is
 * Team Rocket and Giovanni; rows 0–7 are the "other trainers" blocks the sheet groups the classes into.
 */
const JOHTO: Record<string, [row: number, col: number]> = {
  // Gym leaders (labelled bands, first pose of three)
  falkner: [8, 0],
  bugsy: [8, 3],
  whitney: [8, 6],
  morty: [8, 9],
  chuck: [9, 0],
  jasmine: [9, 3],
  pryce: [9, 6],
  clair: [9, 9],
  // Elite Four and Champion
  'elite-will': [10, 0],
  'elite-koga': [10, 3],
  'elite-bruno': [10, 6],
  'elite-karen': [10, 9],
  'champion-lance': [13, 0],
  red: [13, 3],
  // Rival and Team Rocket
  silver: [0, 2],
  'team-rocket-m': [14, 0],
  'team-rocket-f': [14, 1],
  'rocket-executive': [14, 3],
  'boss-giovanni': [14, 6],
  // Classes
  youngster: [0, 5],
  'bird-keeper': [0, 6],
  lass: [0, 7],
  twins: [0, 11],
  hiker: [1, 0],
  fisherman: [1, 2],
  cyclist: [1, 3],
  pokefan: [1, 6],
  picnicker: [1, 7],
  camper: [1, 9],
  schoolboy: [2, 3],
  schoolgirl: [2, 4],
  'kimono-girl': [2, 6],
  lady: [3, 0],
  gentleman: [3, 1],
  beauty: [3, 3],
  officer: [3, 5],
  scientist: [3, 8],
  'swimmer-m': [3, 9],
  'swimmer-f': [3, 11],
  'psychic-m': [4, 4],
  'psychic-f': [4, 5],
  guitarist: [4, 7],
  skier: [4, 10],
  'black-belt': [5, 0],
  'bug-catcher': [5, 2],
  firebreather: [5, 8],
  biker: [5, 9],
  sage: [6, 3],
  'super-nerd': [7, 2],
}

/**
 * Sinnoh: `[row, col]` on the DPPt sheet → sprite name. Rows 7–14 are the labelled bands, where a named character
 * owns three consecutive cells (three battle poses) and the first is the one taken. Rows 0–6 are the class blocks;
 * only the cells identified with confidence are mapped, because `content-sinnoh.ts` decides which classes exist and
 * an unmapped one would just fall back to the shared default.
 */
const SINNOH: Record<string, [row: number, col: number]> = {
  // The player characters and the rival
  lucas: [0, 0],
  dawn: [0, 1],
  barry: [0, 2],
  // Gym leaders (labelled bands, first pose of three)
  roark: [7, 0],
  gardenia: [7, 3],
  maylene: [7, 6],
  'crasher-wake': [7, 9],
  fantina: [8, 0],
  byron: [8, 3],
  candice: [8, 6],
  volkner: [8, 9],
  // Elite Four and Champion
  'elite-aaron': [9, 0],
  'elite-bertha': [9, 3],
  'elite-flint': [9, 6],
  'elite-lucian': [9, 9],
  'champion-cynthia': [11, 0],
  // Team Galactic
  'galactic-grunt-m': [10, 0],
  'galactic-grunt-f': [10, 1],
  mars: [10, 2],
  jupiter: [10, 3],
  saturn: [10, 4],
  cyrus: [10, 5],
  // The companions of the Underground and Iron Island, and the Frontier Brains
  cheryl: [11, 3],
  riley: [11, 6],
  marley: [11, 9],
  buck: [12, 0],
  mira: [12, 3],
  palmer: [13, 0],
  argenta: [13, 3],
  thorton: [13, 6],
  dahlia: [13, 9],
  caitlin: [14, 0],
  darach: [14, 3],
  // Classes
  youngster: [0, 5],
  lass: [0, 6],
  'bug-catcher': [0, 9],
  twins: [0, 11],
  hiker: [1, 0],
  'battle-girl': [1, 1],
  fisherman: [1, 2],
  'cyclist-m': [1, 3],
  'cyclist-f': [1, 4],
  'black-belt': [1, 5],
  'breeder-m': [1, 6],
  'breeder-f': [1, 7],
  cowgirl: [1, 9],
  jogger: [1, 10],
  'pokefan-m': [1, 11],
  'pokefan-f': [2, 0],
  'young-couple': [2, 2],
  'ace-trainer-m': [2, 3],
  'ace-trainer-f': [2, 4],
  idol: [2, 5],
  socialite: [2, 6],
  'veteran-m': [2, 8],
  'ranger-f': [2, 9],
  scientist: [2, 11],
  'parasol-lady': [3, 0],
  gentleman: [3, 1],
  beauty: [3, 3],
  policeman: [3, 5],
  'ranger-m': [3, 6],
  'swimmer-m': [3, 9],
  'swimmer-f': [3, 11],
  'tuber-f': [4, 0],
  'tuber-m': [4, 1],
  sailor: [4, 2],
  'ruin-maniac': [4, 3],
  'psychic-m': [4, 4],
  'psychic-f': [4, 5],
  artist: [4, 6],
  guitarist: [4, 7],
  'skier-m': [4, 10],
  'skier-f': [4, 11],
  roughneck: [5, 0],
  clown: [5, 1],
  worker: [5, 2],
  'school-kid-m': [5, 3],
  'school-kid-f': [5, 4],
  'aroma-lady': [5, 7],
  waiter: [5, 8],
  reporter: [6, 2],
  lady: [6, 3],
  maid: [6, 4],
}

/** Hoenn: sprite name → the decomp's file name under front_pics. */
const HOENN: Record<string, string> = {
  // Gym leaders
  roxanne: 'leader_roxanne',
  brawly: 'leader_brawly',
  wattson: 'leader_wattson',
  flannery: 'leader_flannery',
  norman: 'leader_norman',
  winona: 'leader_winona',
  'tate-and-liza': 'leader_tate_and_liza',
  juan: 'leader_juan',
  // Elite Four and Champion
  'elite-sidney': 'elite_four_sidney',
  'elite-phoebe': 'elite_four_phoebe',
  'elite-glacia': 'elite_four_glacia',
  'elite-drake': 'elite_four_drake',
  'champion-wallace': 'champion_wallace',
  steven: 'steven',
  wally: 'wally',
  // Villainous teams
  'magma-leader-maxie': 'magma_leader_maxie',
  'aqua-leader-archie': 'aqua_leader_archie',
  'magma-grunt-m': 'magma_grunt_m',
  'aqua-grunt-m': 'aqua_grunt_m',
  // Classes
  hiker: 'hiker',
  lass: 'lass',
  youngster: 'youngster',
  'bug-catcher': 'bug_catcher',
  fisherman: 'fisherman',
  'swimmer-m': 'swimmer_m',
  'swimmer-f': 'swimmer_f',
  sailor: 'sailor',
  'black-belt': 'black_belt',
  'psychic-m': 'psychic_m',
  'psychic-f': 'psychic_f',
  gentleman: 'gentleman',
  beauty: 'beauty',
  lady: 'lady',
  'rich-boy': 'rich_boy',
  camper: 'camper',
  picnicker: 'picnicker',
  'hex-maniac': 'hex_maniac',
  'dragon-tamer': 'dragon_tamer',
  'bird-keeper': 'bird_keeper',
  'ninja-boy': 'ninja_boy',
  'battle-girl': 'battle_girl',
  'parasol-lady': 'parasol_lady',
  kindler: 'kindler',
  'aroma-lady': 'aroma_lady',
  pokemaniac: 'pokemaniac',
  collector: 'collector',
  guitarist: 'guitarist',
  triathlete: 'cycling_triathlete_m',
  'tuber-m': 'tuber_m',
}

async function fetchFile(rel: string): Promise<Buffer> {
  const file = path.join(CACHE_DIR, rel.replace(/\//g, '_'))
  if (existsSync(file)) return readFile(file)
  let lastErr: unknown
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(`${DECOMP}/${rel}`)
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${rel}`)
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

/**
 * Clears a flat backdrop: every pixel of the given colour goes transparent. Both sources use one flat colour behind
 * the trainer (the decomp its palette's index 0, the sheet its blue or green band colour) and never inside one.
 */
function clearBackdrop(img: PNG, backdrop: number): PNG {
  const { data } = img
  for (let i = 0; i < data.length; i += 4) {
    if (((data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!) === backdrop) data[i + 3] = 0
  }
  return img
}

const colourAt = (img: PNG, x: number, y: number) => {
  const i = (y * img.width + x) * 4
  return (img.data[i]! << 16) | (img.data[i + 1]! << 8) | img.data[i + 2]!
}

const isEmpty = (img: PNG) => {
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i]! > 0) return false
  return true
}

/**
 * Cuts a position map out of one of the two sheets. They share their geometry exactly, so the only thing that
 * differs between Johto and Sinnoh here is which file and which map.
 */
async function cutSheet(sheetFile: string, region: string, map: Record<string, [number, number]>): Promise<number> {
  const sheet = PNG.sync.read(await readFile(path.join(ROOT, 'graphics/trainers', sheetFile)))
  const dir = path.join(OUT, region)
  await mkdir(dir, { recursive: true })
  let n = 0
  const empty: string[] = []
  for (const [name, [row, col]] of Object.entries(map)) {
    const out = new PNG({ width: HG_CELL, height: HG_CELL })
    PNG.bitblt(sheet, out, HG_X0 + col * HG_COL, HG_Y0 + row * HG_ROW, HG_CELL, HG_CELL, 0, 0)
    // The backdrop is whatever colour the cell's corner is — blue on most bands, green on the Platinum-shared ones.
    clearBackdrop(out, colourAt(out, 0, 0))
    if (isEmpty(out)) {
      empty.push(`${name} [${row},${col}]`)
      continue
    }
    await writeFile(path.join(dir, `${name}.png`), PNG.sync.write(out))
    n++
  }
  if (empty.length) console.error(`  ! ${region}: empty cells: ${empty.join(', ')}`)
  return n
}

// B2W2 sheet geometry, measured off the sheet: 2px teal grid lines, 256×128 blocks, 4 per row.
const BW_BLOCK_W = 256
const BW_BLOCK_H = 128
const BW_PITCH_X = 258
const BW_PITCH_Y = 130
const BW_COLS = 4

/**
 * Unova: sprite name → block index on the B2W2 sheet (row-major, 4 per row), identified by eye against a contact sheet
 * of every block's figure. `pair` keeps the two tallest figures side by side (Twins, Backers); `left` takes the
 * leftmost of several full poses instead of the tallest.
 */
const UNOVA: Record<string, number | [block: number, opts: { pair?: boolean; left?: boolean }]> = {
  // The Striaton brothers, the leaders, the Elite Four and Alder
  chili: 10,
  cilan: 11,
  cress: 12,
  lenora: 19,
  burgh: 84,
  clay: 88,
  skyla: 85,
  brycen: 47,
  drayden: 89,
  'elite-shauntal': 68,
  'elite-marshal': 69,
  'elite-grimsley': 70,
  'elite-caitlin': 71,
  alder: 78,
  // The story
  bianca: 33,
  n: 34,
  ghetsis: [145, { left: true }],
  zinzolin: 142,
  // Classes
  youngster: 2,
  lass: 3,
  'school-kid-m': [4, { left: true }],
  'school-kid-f': 5,
  smasher: 6,
  linebacker: 7,
  waiter: 8,
  waitress: 9,
  preschooler: [15, { left: true }],
  twins: [16, { pair: true }],
  'ranger-m': 20,
  'ranger-f': 21,
  'backpacker-m': 23,
  'backpacker-f': 24,
  fisherman: 25,
  musician: 26,
  dancer: 27,
  harlequin: 28,
  artist: 29,
  baker: 30,
  'psychic-m': 31,
  'psychic-f': 32,
  'breeder-m': 35,
  lady: 36,
  pilot: 37,
  worker: 38,
  hoopster: 39,
  'scientist-f': 40,
  'nursery-aide': 41,
  'ace-trainer-f': 42,
  'ace-trainer-m': 43,
  'black-belt': 44,
  'scientist-m': 45,
  striker: 46,
  roughneck: 48,
  janitor: 49,
  'pokefan-m': 50,
  'pokefan-f': 51,
  doctor: 52,
  nurse: 53,
  'battle-girl': 55,
  'parasol-lady': 56,
  clerk: 57,
  backers: [59, { pair: true }],
  socialite: 62,
  biker: 63,
  infielder: 64,
  hiker: 65,
  veteran: 67,
  'swimmer-f': 74,
  policeman: 75,
  maid: 76,
  'cyclist-m': 79,
  'cyclist-f': 80,
  gentleman: 97,
}

/** Characters whose Black/White sprite is not on the B2W2 sheet: sprite name → file in graphics/trainers/showdown-bw. */
const UNOVA_SHOWDOWN: Record<string, string> = {
  cheren: 'cheren',
  elesa: 'elesa',
  'plasma-grunt-m': 'plasmagrunt-gen5bw',
  'plasma-grunt-f': 'plasmagruntf-gen5bw',
}

interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

/**
 * The assembled figure of one block: the tallest 8-connected shape (or the two tallest, for a pair), plus any small
 * shape inside its own box (a held Poké Ball, a detached prop). Only those pixels are kept, so the loose parts around
 * the figure never bleed into the crop.
 */
function unovaFigure(sheet: PNG, block: number, opts: { pair?: boolean; left?: boolean } = {}): PNG {
  const w = BW_BLOCK_W
  const h = BW_BLOCK_H
  const img = new PNG({ width: w, height: h })
  PNG.bitblt(sheet, img, 2 + (block % BW_COLS) * BW_PITCH_X, 2 + Math.floor(block / BW_COLS) * BW_PITCH_Y, w, h, 0, 0)
  const counts = new Map<number, number>()
  for (let x = 0; x < w; x++)
    for (const y of [0, h - 1]) counts.set(colourAt(img, x, y), (counts.get(colourAt(img, x, y)) ?? 0) + 1)
  const bg = [...counts].sort((a, b) => b[1] - a[1])[0]![0]

  const label = new Int32Array(w * h).fill(-1)
  const boxes: Box[] = []
  for (let start = 0; start < w * h; start++) {
    if (label[start] !== -1 || colourAt(img, start % w, Math.floor(start / w)) === bg) continue
    const id = boxes.length
    const box = { x0: w, y0: h, x1: -1, y1: -1 }
    const stack = [start]
    label[start] = id
    while (stack.length) {
      const i = stack.pop()!
      const x = i % w
      const y = Math.floor(i / w)
      box.x0 = Math.min(box.x0, x)
      box.x1 = Math.max(box.x1, x)
      box.y0 = Math.min(box.y0, y)
      box.y1 = Math.max(box.y1, y)
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          const j = ny * w + nx
          if (label[j] === -1 && colourAt(img, nx, ny) !== bg) {
            label[j] = id
            stack.push(j)
          }
        }
    }
    boxes.push(box)
  }
  const height = (b: Box) => b.y1 - b.y0 + 1
  const tallest = Math.max(...boxes.map(height))
  const tall = boxes.map((b, id) => ({ b, id })).filter(({ b }) => height(b) >= 0.85 * tallest)
  tall.sort((a, b) => (opts.left ? a.b.x0 - b.b.x0 : height(b.b) - height(a.b) || b.b.x0 - a.b.x0))
  const figures = tall.slice(0, opts.pair ? 2 : 1)
  const keep = new Set(figures.map((f) => f.id))
  boxes.forEach((b, id) => {
    for (const { b: f } of figures) if (b.x0 >= f.x0 - 4 && b.x1 <= f.x1 + 4 && b.y0 >= f.y0 - 4 && b.y1 <= f.y1 + 4) keep.add(id)
  })
  const kept = [...keep].map((id) => boxes[id]!)
  const x0 = Math.min(...kept.map((b) => b.x0))
  const y0 = Math.min(...kept.map((b) => b.y0))
  const cw = Math.max(...kept.map((b) => b.x1)) - x0 + 1
  const ch = Math.max(...kept.map((b) => b.y1)) - y0 + 1
  // Onto the 80×80 canvas the other regions' trainers use: centred, feet on the bottom, scaled down only if too big.
  const scale = Math.min(1, HG_CELL / cw, HG_CELL / ch)
  const dw = Math.round(cw * scale)
  const dh = Math.round(ch * scale)
  const ox = Math.floor((HG_CELL - dw) / 2)
  const oy = HG_CELL - dh
  const out = new PNG({ width: HG_CELL, height: HG_CELL })
  out.data.fill(0)
  for (let y = 0; y < dh; y++)
    for (let x = 0; x < dw; x++) {
      const sx = x0 + Math.min(cw - 1, Math.floor(x / scale))
      const sy = y0 + Math.min(ch - 1, Math.floor(y / scale))
      if (!keep.has(label[sy * w + sx]!)) continue
      const s = (sy * w + sx) * 4
      const d = ((oy + y) * HG_CELL + ox + x) * 4
      out.data[d] = img.data[s]!
      out.data[d + 1] = img.data[s + 1]!
      out.data[d + 2] = img.data[s + 2]!
      out.data[d + 3] = 255
    }
  return out
}

async function cutUnova(): Promise<number> {
  const sheet = PNG.sync.read(await readFile(path.join(ROOT, 'graphics/trainers/b2w2.png')))
  const dir = path.join(OUT, 'unova')
  await mkdir(dir, { recursive: true })
  let n = 0
  for (const [name, spec] of Object.entries(UNOVA)) {
    const [block, opts] = typeof spec === 'number' ? [spec, {}] : spec
    const img = unovaFigure(sheet, block, opts)
    if (isEmpty(img)) throw new Error(`unova: ${name} (block ${block}) is empty`)
    await writeFile(path.join(dir, `${name}.png`), PNG.sync.write(img))
    n++
  }
  for (const [name, file] of Object.entries(UNOVA_SHOWDOWN)) {
    await writeFile(path.join(dir, `${name}.png`), await readFile(path.join(ROOT, 'graphics/trainers/showdown-bw', `${file}.png`)))
    n++
  }
  return n
}

async function fetchHoenn(): Promise<number> {
  await mkdir(CACHE_DIR, { recursive: true })
  const dir = path.join(OUT, 'hoenn')
  await mkdir(dir, { recursive: true })
  let n = 0
  const failed: string[] = []
  for (const [name, file] of Object.entries(HOENN)) {
    try {
      const img = PNG.sync.read(await fetchFile(`${file}.png`))
      clearBackdrop(img, colourAt(img, 0, 0))
      if (isEmpty(img)) throw new Error('empty')
      await writeFile(path.join(dir, `${name}.png`), PNG.sync.write(img))
      n++
    } catch (err) {
      failed.push(`${name} (${file}): ${(err as Error).message}`)
    }
  }
  if (failed.length) {
    console.error(`  ! ${failed.length} failed:`)
    for (const f of failed) console.error(`    ${f}`)
    process.exitCode = 1
  }
  return n
}

async function main() {
  const johto = await cutSheet('hgss.png', 'johto', JOHTO)
  const hoenn = await fetchHoenn()
  const sinnoh = await cutSheet('dppt.png', 'sinnoh', SINNOH)
  const unova = await cutUnova()
  console.log(
    `✓ ${johto} Johto sprites (HGSS sheet) · ${hoenn} Hoenn sprites (pokeemerald) · ` +
      `${sinnoh} Sinnoh sprites (DPPt sheet) · ${unova} Unova sprites (B2W2 sheet) → public/trainers/classes`,
  )
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
