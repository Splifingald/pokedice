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
 *
 * `pnpm region-trainers --showdown [region…]` is separate: it only downloads. Generations 6–9 are 3D games with no
 * sheet to cut, so Kalos, Alola, Galar and Paldea come from Pokémon Showdown's BW-style trainer sprites (80×80, the
 * canvas the other regions use), fetched by id into graphics/trainers/showdown-<region>/ and cached under
 * scripts/.cache/showdown. SHOWDOWN below maps each to our sprite names. Nothing reaches public/ until a region plan
 * picks its cast. See docs/10-GEN6-9-SPRITES.md for the sources and the artists' credits.
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
  cynthia: 81,
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

export type ShowdownRegion = 'kalos' | 'alola' | 'galar' | 'paldea'
const SHOWDOWN_URL = 'https://play.pokemonshowdown.com/sprites/trainers'

/**
 * Generations 6–9: sprite name → Pokémon Showdown trainer id, per region, as UNOVA_SHOWDOWN is for Unova. The ids are
 * the OFFICIAL_AVATARS sets in smogon/pokemon-showdown server/chat-commands/avatars.tsx. Each region has its whole
 * named cast (leaders, Elite Four, champion, rivals, professors, villains and grunt pair) and then every class sprite
 * of its generation. Names follow the older regions: `elite-` and `champion-` prefixes, `-m` / `-f` where a class has
 * both, plain names for one-sex classes.
 */
export const SHOWDOWN: Record<ShowdownRegion, Record<string, string>> = {
  kalos: {
    // Gym leaders
    viola: 'viola',
    grant: 'grant',
    korrina: 'korrina',
    ramos: 'ramos',
    clemont: 'clemont',
    valerie: 'valerie',
    olympia: 'olympia',
    wulfric: 'wulfric',
    // Elite Four and Champion
    'elite-malva': 'malva',
    'elite-siebold': 'siebold',
    'elite-wikstrom': 'wikstrom',
    'elite-drasna': 'drasna',
    'champion-diantha': 'diantha',
    // The players, the friends and the professor's lab
    calem: 'calem',
    serena: 'serena',
    shauna: 'shauna',
    tierno: 'tierno',
    trevor: 'trevor',
    sycamore: 'sycamore',
    dexio: 'dexio-gen6',
    sina: 'sina-gen6',
    // Team Flare (Aliana and Celosia have no sprite)
    lysandre: 'lysandre',
    xerosic: 'xerosic',
    bryony: 'bryony',
    mable: 'mable',
    'flare-grunt-m': 'flaregrunt',
    'flare-grunt-f': 'flaregruntf',
    // AZ, Emma, and the Battle Maison's Chatelaines
    az: 'az',
    emma: 'emma',
    essentia: 'essentia',
    nita: 'nita',
    evelyn: 'evelyn',
    dana: 'dana',
    morgan: 'morgan',
    // Classes: Gen 6 (-gen6, -gen6xy, -gen6oras) and the X/Y-only classes. Where X/Y and ORAS each have a sprite, the plain name is X/Y's and -oras is the other.
    'ace-trainer-f': 'acetrainerf-gen6xy',
    'ace-trainer-f-oras': 'acetrainerf-gen6',
    'ace-trainer-m': 'acetrainer-gen6xy',
    'ace-trainer-m-oras': 'acetrainer-gen6',
    'aroma-lady': 'aromalady-gen6',
    'artist-f': 'artistf-gen6',
    'artist-m': 'artist-gen6',
    backpacker: 'backpacker-gen6',
    'battle-girl': 'battlegirl-gen6xy',
    'battle-girl-oras': 'battlegirl-gen6',
    beauty: 'beauty-gen6xy',
    'beauty-oras': 'beauty-gen6',
    'bird-keeper': 'birdkeeper-gen6',
    'black-belt': 'blackbelt-gen6',
    'breeder-f': 'pokemonbreederf-gen6xy',
    'breeder-f-oras': 'pokemonbreederf-gen6',
    'breeder-m': 'pokemonbreeder-gen6xy',
    'breeder-m-oras': 'pokemonbreeder-gen6',
    'bug-catcher': 'bugcatcher-gen6',
    'bug-maniac': 'bugmaniac-gen6',
    butler: 'butler',
    cabbie: 'cabbie',
    'cafe-master': 'cafemaster',
    cameraman: 'cameraman-gen6',
    camper: 'camper-gen6',
    collector: 'collector-gen6',
    'dragon-tamer': 'dragontamer-gen6',
    'expert-f': 'expertf-gen6',
    'expert-m': 'expert-gen6',
    'fairy-tale-girl': 'fairytalegirl',
    fisherman: 'fisherman-gen6xy',
    'fisherman-oras': 'fisherman-gen6',
    'furisode-girl-black': 'furisodegirl-black',
    'furisode-girl-blue': 'furisodegirl-blue',
    'furisode-girl-pink': 'furisodegirl-pink',
    'furisode-girl-white': 'furisodegirl-white',
    garcon: 'garcon',
    gentleman: 'gentleman-gen6xy',
    'gentleman-oras': 'gentleman-gen6',
    guitarist: 'guitarist-gen6',
    'hex-maniac': 'hexmaniac-gen6',
    hiker: 'hiker-gen6',
    interviewers: 'interviewers-gen6',
    kindler: 'kindler-gen6',
    lady: 'lady-gen6',
    'lady-oras': 'lady-gen6oras',
    lass: 'lass-gen6',
    'lass-oras': 'lass-gen6oras',
    madame: 'madame-gen6',
    maid: 'maid-gen6',
    'ninja-boy': 'ninjaboy-gen6',
    'parasol-lady': 'parasollady-gen6',
    picnicker: 'picnicker-gen6',
    'pokefan-f': 'pokefanf-gen6xy',
    'pokefan-f-oras': 'pokefanf-gen6',
    'pokefan-m': 'pokefan-gen6xy',
    'pokefan-m-oras': 'pokefan-gen6',
    pokemaniac: 'pokemaniac-gen6',
    'preschooler-f': 'preschoolerf-gen6',
    'preschooler-m': 'preschooler-gen6',
    psychic: 'psychic-gen6',
    'punk-girl': 'punkgirl',
    'punk-guy': 'punkguy',
    'ranger-f': 'pokemonrangerf-gen6xy',
    'ranger-f-oras': 'pokemonrangerf-gen6',
    'ranger-m': 'pokemonranger-gen6xy',
    'ranger-m-oras': 'pokemonranger-gen6',
    reporter: 'reporter-gen6',
    'rich-boy': 'richboy-gen6xy',
    'rich-boy-oras': 'richboy-gen6',
    'rising-star-f': 'risingstarf-gen6',
    'rising-star-m': 'risingstar-gen6',
    'roller-skater-f': 'rollerskaterf',
    'roller-skater-m': 'rollerskater',
    'ruin-maniac': 'ruinmaniac-gen6',
    sailor: 'sailor-gen6',
    'school-kid-f': 'schoolkidf-gen6',
    'school-kid-m': 'schoolkid-gen6',
    'scientist-f': 'scientistf-gen6',
    'scientist-m': 'scientist-gen6',
    'sky-trainer-f': 'skytrainerf',
    'sky-trainer-m': 'skytrainer',
    'swimmer-f': 'swimmerf-gen6',
    'swimmer-f2': 'swimmerf2-gen6',
    'swimmer-m': 'swimmer-gen6',
    'triathlete-biker': 'triathletebiker-gen6',
    'triathlete-runner': 'triathleterunner-gen6',
    'triathlete-swimmer': 'triathleteswimmer-gen6',
    'tuber-f': 'tuberf-gen6',
    'tuber-m': 'tuber-gen6',
    twins: 'twins-gen6',
    'veteran-f': 'veteranf-gen6',
    'veteran-m': 'veteran-gen6',
    waitress: 'waitress-gen6',
    worker: 'worker-gen6',
    'worker-2': 'worker2-gen6',
    'young-couple': 'youngcouple-gen6',
    youngster: 'youngster-gen6xy',
    'youngster-oras': 'youngster-gen6',
  },
  alola: {
    // Captains
    ilima: 'ilima',
    lana: 'lana',
    kiawe: 'kiawe',
    mallow: 'mallow',
    sophocles: 'sophocles',
    acerola: 'acerola',
    mina: 'mina',
    // Kahunas (Hala, Olivia and Acerola are also Elite Four; Nanu replaces Acerola in USUM)
    hala: 'hala',
    olivia: 'olivia',
    nanu: 'nanu',
    hapu: 'hapu',
    // Elite Four and Champion
    'elite-molayne': 'molayne',
    'elite-kahili': 'kahili',
    'champion-kukui': 'kukui',
    // The players, the friends and the professors
    elio: 'elio',
    selene: 'selene',
    hau: 'hau',
    gladion: 'gladion',
    lillie: 'lillie',
    burnet: 'burnet',
    'samson-oak': 'samsonoak',
    // Team Skull and the Aether Foundation
    guzma: 'guzma',
    plumeria: 'plumeria',
    'skull-grunt-m': 'skullgrunt',
    'skull-grunt-f': 'skullgruntf',
    lusamine: 'lusamine',
    faba: 'faba',
    wicke: 'wicke',
    // Ultra Sun / Ultra Moon: the Ultra Recon Squad and Team Rainbow Rocket's grunts
    dulse: 'dulse',
    phyco: 'phyco',
    zossie: 'zossie',
    soliera: 'soliera',
    'rainbow-rocket-grunt-m': 'rainbowrocketgrunt',
    'rainbow-rocket-grunt-f': 'rainbowrocketgruntf',
    // Battle Tree, Battle Royal Dome and the Alola guests
    anabel: 'anabel-gen7',
    blue: 'blue-gen7',
    red: 'red-gen7',
    colress: 'colress-gen7',
    cynthia: 'cynthia-gen7',
    grimsley: 'grimsley-gen7',
    ryuki: 'ryuki',
    'the-royal': 'theroyal',
    // Classes: Gen 7 (-gen7) and the Sun/Moon-only classes.
    'ace-trainer-f': 'acetrainerf-gen7',
    'ace-trainer-m': 'acetrainer-gen7',
    'aether-employee-f': 'aetheremployeef',
    'aether-employee-m': 'aetheremployee',
    'aether-foundation-f': 'aetherfoundationf',
    'aether-foundation-m': 'aetherfoundation',
    beauty: 'beauty-gen7',
    bellhop: 'bellhop',
    'black-belt': 'blackbelt-gen7',
    'breeder-f': 'pokemonbreederf-gen7',
    'breeder-m': 'pokemonbreeder-gen7',
    collector: 'collector-gen7',
    cook: 'cook-gen7',
    dancer: 'dancer-gen7',
    firefighter: 'firefighter',
    fisherman: 'fisherman-gen7',
    gentleman: 'gentleman-gen7',
    golfer: 'golfer',
    hiker: 'hiker-gen7',
    janitor: 'janitor-gen7',
    lass: 'lass-gen7',
    madame: 'madame-gen7',
    'office-worker-f': 'officeworkerf',
    'office-worker-m': 'officeworker',
    'pokemon-center-lady': 'pokemoncenterlady',
    policeman: 'policeman-gen7',
    'preschooler-f': 'preschoolerf-gen7',
    'preschooler-m': 'preschooler-gen7',
    preschoolers: 'preschoolers',
    'punk-girl': 'punkgirl-gen7',
    'punk-guy': 'punkguy-gen7',
    'rising-star-f': 'risingstarf',
    'rising-star-m': 'risingstar',
    scientist: 'scientist-gen7',
    'sightseer-f': 'sightseerf',
    'sightseer-m': 'sightseer',
    surfer: 'surfer',
    'swimmer-f': 'swimmerf-gen7',
    'swimmer-f2': 'swimmerf2-gen7',
    'swimmer-m': 'swimmer-gen7',
    teacher: 'teacher-gen7',
    'trial-guide-f': 'trialguidef',
    'trial-guide-m': 'trialguide',
    'ultra-forest-kartenvoy': 'ultraforestkartenvoy',
    'veteran-f': 'veteranf-gen7',
    'veteran-m': 'veteran-gen7',
    worker: 'worker-gen7',
    'young-athlete-f': 'youngathletef',
    'young-athlete-m': 'youngathlete',
    youngster: 'youngster-gen7',
  },
  galar: {
    // Gym leaders (Bede and Marnie take over Ballonlea and Spikemuth after the story)
    milo: 'milo',
    nessa: 'nessa',
    kabu: 'kabu',
    bea: 'bea',
    allister: 'allister',
    opal: 'opal',
    gordie: 'gordie',
    melony: 'melony',
    piers: 'piers',
    raihan: 'raihan',
    'bede-leader': 'bede-leader',
    'marnie-leader': 'marnie-league',
    // Champion
    'champion-leon': 'leon',
    // The players, the rivals and the professors
    victor: 'victor',
    gloria: 'gloria',
    hop: 'hop',
    marnie: 'marnie',
    bede: 'bede',
    sonia: 'sonia',
    magnolia: 'magnolia',
    // Macro Cosmos, Team Yell, and the post-game brothers
    rose: 'rose',
    oleana: 'oleana',
    'yell-grunt-m': 'yellgrunt',
    'yell-grunt-f': 'yellgruntf',
    sordward: 'sordward',
    shielbert: 'shielbert',
    'ball-guy': 'ballguy',
    // The Isle of Armor and the Crown Tundra
    mustard: 'mustard',
    klara: 'klara',
    avery: 'avery',
    peony: 'peony',
    // Classes: Gen 8 (-gen8).
    artist: 'artist-gen8',
    backpacker: 'backpacker-gen8',
    beauty: 'beauty-gen8',
    'black-belt': 'blackbelt-gen8',
    'breeder-f': 'pokemonbreederf-gen8',
    'breeder-m': 'pokemonbreeder-gen8',
    cameraman: 'cameraman-gen8',
    'clerk-f': 'clerkf-gen8',
    'clerk-m': 'clerk-gen8',
    dancer: 'dancer-gen8',
    'doctor-f': 'doctorf-gen8',
    'doctor-m': 'doctor-gen8',
    fisher: 'fisher-gen8',
    gentleman: 'gentleman-gen8',
    hiker: 'hiker-gen8',
    lass: 'lass-gen8',
    madame: 'madame-gen8',
    model: 'model-gen8',
    musician: 'musician-gen8',
    'poke-kid-f': 'pokekidf-gen8',
    'poke-kid-m': 'pokekid-gen8',
    policeman: 'policeman-gen8',
    reporter: 'reporter-gen8',
    'school-kid-f': 'schoolkidf-gen8',
    'school-kid-m': 'schoolkid-gen8',
    'swimmer-f': 'swimmerf-gen8',
    'swimmer-m': 'swimmer-gen8',
    'worker-f': 'workerf-gen8',
    'worker-m': 'worker-gen8',
    youngster: 'youngster-gen8',
  },
  paldea: {
    // Gym leaders (Larry is also Elite Four)
    katy: 'katy',
    brassius: 'brassius',
    iono: 'iono',
    kofu: 'kofu',
    larry: 'larry',
    ryme: 'ryme',
    tulip: 'tulip',
    grusha: 'grusha',
    // Elite Four and Champion
    'elite-rika': 'rika',
    'elite-poppy': 'poppy',
    'elite-hassel': 'hassel',
    'champion-geeta': 'geeta',
    // The players, the friends and the academy (Scarlet's look first, Violet's as -violet)
    florian: 'florian-s',
    juliana: 'juliana-s',
    nemona: 'nemona-s',
    'nemona-violet': 'nemona-v',
    arven: 'arven-s',
    'arven-violet': 'arven-v',
    penny: 'penny',
    clavell: 'clavell-s',
    'clavell-violet': 'clive-v',
    jacq: 'jacq',
    sada: 'sada',
    turo: 'turo',
    // Team Star: the bosses and the grunts
    giacomo: 'giacomo',
    mela: 'mela',
    atticus: 'atticus',
    ortega: 'ortega',
    eri: 'eri',
    'star-grunt-m': 'stargrunt-s',
    'star-grunt-f': 'stargruntf-s',
    'star-grunt-m-violet': 'stargrunt-v',
    'star-grunt-f-violet': 'stargruntf-v',
    // The Teal Mask and the Indigo Disk: Kitakami, Blueberry Academy and its Elite Four
    kieran: 'kieran',
    carmine: 'carmine',
    perrin: 'perrin',
    'ogre-clan': 'ogreclan',
    drayton: 'drayton',
    lacey: 'lacey',
    crispin: 'crispin',
    amarys: 'amarys',
    briar: 'briar',
    // Classes: Gen 9 (-gen9).
    artist: 'artist-gen9',
    backpacker: 'backpacker-gen9',
    beauty: 'beauty-gen9',
    'black-belt': 'blackbelt-gen9',
    'bodybuilder-f': 'bodybuilderf-gen9',
    'bodybuilder-m': 'bodybuilder-gen9',
    cabbie: 'cabbie-gen9',
    cook: 'cook-gen9',
    'delinquent-f': 'delinquentf-gen9',
    'delinquent-f2': 'delinquentf2-gen9',
    'delinquent-m': 'delinquent-gen9',
    'dragon-tamer': 'dragontamer-gen9',
    hiker: 'hiker-gen9',
    janitor: 'janitor-gen9',
    musician: 'musician-gen9',
    'office-worker-f': 'officeworkerf-gen9',
    'office-worker-m': 'officeworker-gen9',
    pokemaniac: 'pokemaniac-gen9',
    scientist: 'scientist-gen9',
    waiter: 'waiter-gen9',
    waitress: 'waitress-gen9',
    worker: 'worker-gen9',
    youngster: 'youngster-gen9',
  },
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

/**
 * Downloads every id in SHOWDOWN[region] into graphics/trainers/showdown-<region>/<id>.png, as served (80×80, real
 * alpha), cached under scripts/.cache/showdown. Files are named by Showdown id, like graphics/trainers/showdown-bw, so
 * a region plan maps them to sprite names when it copies them into public/.
 */
async function fetchShowdown(region: ShowdownRegion): Promise<{ n: number; failed: string[] }> {
  const cache = path.join(ROOT, 'scripts', '.cache', 'showdown')
  const dir = path.join(ROOT, 'graphics/trainers', `showdown-${region}`)
  await mkdir(cache, { recursive: true })
  await mkdir(dir, { recursive: true })
  const failed: string[] = []
  let n = 0
  for (const [name, id] of Object.entries(SHOWDOWN[region])) {
    try {
      const buf = await fetchCached(`${SHOWDOWN_URL}/${id}.png`, path.join(cache, `${id}.png`))
      const img = PNG.sync.read(buf)
      if (img.width !== HG_CELL || img.height !== HG_CELL) throw new Error(`${img.width}×${img.height}, not 80×80`)
      if (isEmpty(img)) throw new Error('empty')
      await writeFile(path.join(dir, `${id}.png`), buf)
      n++
    } catch (err) {
      failed.push(`${region} ${name} (${id}): ${(err as Error).message}`)
    }
  }
  return { n, failed }
}

async function main() {
  if (process.argv[2] === '--showdown') {
    const asked = process.argv.slice(3) as ShowdownRegion[]
    const regions = asked.length ? asked : (Object.keys(SHOWDOWN) as ShowdownRegion[])
    const failed: string[] = []
    for (const region of regions) {
      if (!SHOWDOWN[region]) throw new Error(`unknown region ${region}: one of ${Object.keys(SHOWDOWN).join(', ')}`)
      const r = await fetchShowdown(region)
      console.log(`  ${region}: ${r.n} / ${Object.keys(SHOWDOWN[region]).length} → graphics/trainers/showdown-${region}`)
      failed.push(...r.failed)
    }
    if (failed.length) {
      console.error(`\n${failed.length} failed:`)
      for (const f of failed) console.error(`  ${f}`)
      process.exitCode = 1
    }
    return
  }
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
