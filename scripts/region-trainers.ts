/**
 * pnpm region-trainers — the trainer sprites for Johto and Hoenn.
 *
 * Hoenn comes from the pret/pokeemerald decomp, where every trainer pic is its own named 64×64 indexed PNG
 * (`graphics/trainers/front_pics/leader_roxanne.png`). Named files mean no guessing which cell is which leader.
 *
 * Johto comes from graphics/trainers/hgss.png, the HGSS trainer sheet: 80×80 cells on an 81px column pitch from x=1
 * and a 98px row pitch from y=18, the 18px bands being the section labels printed on the sheet. Those labels are what
 * makes the position map below trustworthy — each leader owns three consecutive cells (three battle poses), and the
 * first pose is the one used.
 *
 * Both write into public/trainers/classes/<region>/, which is what `trainerSprite()` in trainer-sprites.ts points at.
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

async function cutJohto(): Promise<number> {
  const sheet = PNG.sync.read(await readFile(path.join(ROOT, 'graphics/trainers/hgss.png')))
  const dir = path.join(OUT, 'johto')
  await mkdir(dir, { recursive: true })
  let n = 0
  const empty: string[] = []
  for (const [name, [row, col]] of Object.entries(JOHTO)) {
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
  if (empty.length) console.error(`  ! empty cells: ${empty.join(', ')}`)
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
  const johto = await cutJohto()
  const hoenn = await fetchHoenn()
  console.log(`✓ ${johto} Johto sprites (HGSS sheet) · ${hoenn} Hoenn sprites (pokeemerald) → public/trainers/classes`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
