/**
 * Trainer class sprites, cut from graphics/trainers/trainers.png (64×64 cells, 8 columns; names in
 * "trainers order.csv"). `pnpm trainer-sprites` slices the sheet into public/trainers/classes/*.png, the two player
 * characters into public/characters/, and the throw animations into 5-frame strips.
 * `trainerSprite()` picks a trainer's sprite from its name; the seed and the one-off JSON update both use it.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CELL = 64

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/♂/g, '-m')
    .replace(/♀/g, '-f')
    .replace(/&/g, 'and')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

/** Class sprite path for a trainer, from its display name (and role for gym leaders / Elite Four / Champion). */
export function trainerSprite(name: string, role = 'trainer'): string {
  const file = (s: string) => `/trainers/classes/${s}.png`
  const first = name.split(' ').slice(-1)[0] ?? ''
  const female = /^(Mary|Naomi|Alexa|Sara|Nina|Nadia|Lena|Ivy|Claire|Rosa|Yuki|Mira)$/.test(first)
  const leaders: Record<string, string> = {
    Brock: 'champion-brock',
    Misty: 'champion-misty',
    'Lt. Surge': 'champion-lt-surge',
    Erika: 'champion-erika',
    Koga: 'champion-koga',
    Sabrina: 'champion-sabrina',
    Blaine: 'champion-blaine',
    Giovanni: 'champion-giovanni',
  }
  if (leaders[name]) return file(leaders[name])
  if (name.startsWith('Elite Four ')) return file(`elite-${slug(first)}`)
  if (name === 'Rival Blue') return file('blue-1')
  if (name === 'Champion Blue' || role === 'champion') return file('blue-3')
  if (name.startsWith('Rocket Boss')) return file('boss-giovanni')
  if (name.startsWith('Rocket')) return file('team-rocket-m')
  const classes: [prefix: string, sprite: string][] = [
    ['Bug Catcher', 'bug-catcher'],
    ['Super Nerd', 'super-nerd'],
    ['Bird Keeper', 'bird-keeper'],
    ['Black Belt', 'black-belt'],
    ['Pokémaniac', 'pokemaniac'],
    // No sheet sprite for these two: the closest look-alikes.
    ['Cue Ball', 'biker'],
    ['Gambler', 'gentleman'],
    ['Cooltrainer', female ? 'cooltrainer-f' : 'cooltrainer-m'],
    ['Ace Trainer', female ? 'cooltrainer-f' : 'cooltrainer-m'],
    ['Swimmer', 'swimmer-m'],
    ['Psychic', 'psychic-m'],
  ]
  for (const [prefix, sprite] of classes) if (name.startsWith(`${prefix} `)) return file(sprite)
  const word = slug(name.split(' ')[0] ?? '')
  const known = ['youngster', 'lass', 'sailor', 'camper', 'picnicker', 'hiker', 'rocker', 'burglar', 'engineer', 'fisherman', 'biker', 'beauty', 'channeler', 'juggler', 'tamer', 'scientist', 'gentleman']
  return known.includes(word) ? file(word) : '/trainers/default.png'
}

function cut(sheet: PNG, col: number, row: number): PNG {
  const out = new PNG({ width: CELL, height: CELL })
  PNG.bitblt(sheet, out, col * CELL, row * CELL, CELL, CELL, 0, 0)
  return out
}

function isEmpty(img: PNG): boolean {
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i]! > 0) return false
  return true
}

async function main() {
  const dir = path.join(ROOT, 'graphics/trainers')
  const sheet = PNG.sync.read(await readFile(path.join(dir, 'trainers.png')))
  const rows = (await readFile(path.join(dir, 'trainers order.csv'), 'utf8')).trim().split(/\r?\n/).map((l) => l.split(','))
  const classes = path.join(ROOT, 'public/trainers/classes')
  const chars = path.join(ROOT, 'public/characters')
  await mkdir(classes, { recursive: true })
  const seen = new Map<string, number>()
  let n = 0
  for (const [r, cols] of rows.entries()) {
    const throwRow = cols[0]?.includes('Throw Frame')
    if (throwRow) {
      // 5 frames side by side → one strip, stepped through with CSS.
      const who = slug(cols[0]!.split(' ')[0]!)
      const strip = new PNG({ width: CELL * 5, height: CELL })
      for (let c = 0; c < 5; c++) PNG.bitblt(sheet, strip, c * CELL, r * CELL, CELL, CELL, c * CELL, 0)
      await writeFile(path.join(chars, `${who}-throw.png`), PNG.sync.write(strip))
      continue
    }
    for (const [c, raw] of cols.entries()) {
      const name = raw.trim()
      const img = cut(sheet, c, r)
      if (!name || isEmpty(img)) continue
      const base = slug(name)
      const k = (seen.get(base) ?? 0) + 1
      seen.set(base, k)
      // Blue has three poses in a row: blue-1, blue-2, blue-3.
      const file = name === 'Blue' || k > 1 ? `${base}-${k}` : base
      if (r === 0) await writeFile(path.join(chars, `${base}.png`), PNG.sync.write(img))
      else await writeFile(path.join(classes, `${file}.png`), PNG.sync.write(img))
      n++
    }
    // Row 2 holds three Blue poses under one name.
    if (cols[0] === 'Blue') {
      for (let c = 1; c < 8; c++) {
        const img = cut(sheet, c, r)
        if (isEmpty(img)) continue
        await writeFile(path.join(classes, `blue-${c + 1}.png`), PNG.sync.write(img))
        n++
      }
    }
  }
  console.log(`${n} sprites written`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
