/**
 * pnpm tsx scripts/castform-forms.ts — Castform's three weather forms (docs/62 §3, the user's ask of 2026-11-01), written
 * into the bundle and safe to run again: its Sunny (Fire), Rainy (Water) and Snowy (Ice) Forms as battle forms
 * (`trigger: 'weather'`), their names (Castform's own, in every language), their egg groups (Castform's), and their
 * offline sprites from PokeAPI (96×96, kept uncut like every form's) with their metrics. The Showdown sprites the game
 * shows come from `pnpm showdown-sprites pokemon icons cries --only 10013,10014,10015`; then `pnpm seed-sql`.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import type { PokeType, Species, Weather } from '../src/engine/types'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA = path.join(ROOT, 'src', 'data')
const SHEET = path.join(ROOT, 'src', 'i18n', 'strings.csv')
const SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon'
const CACHE = path.join(ROOT, 'scripts', '.cache', 'pokeapi')
const CASTFORM = 351

/** The three forms: PokeAPI's ids, the type each takes and the weather that brings it. */
export const CASTFORM_FORMS: { id: number; key: string; type: PokeType; weather: Weather[] }[] = [
  { id: 10013, key: 'castform-sunny', type: 'fire', weather: ['sun'] },
  { id: 10014, key: 'castform-rainy', type: 'water', weather: ['rain', 'thunderstorm'] },
  { id: 10015, key: 'castform-snowy', type: 'ice', weather: ['snow'] },
]

const VIEWS: [kind: string, dir: string][] = [
  ['front', ''],
  ['back', 'back/'],
  ['front_shiny', 'shiny/'],
  ['back_shiny', 'back/shiny/'],
]

async function fetchCached(url: string, file: string): Promise<Buffer> {
  if (existsSync(file)) return readFile(file)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, buf)
  return buf
}

/** [x0, y0, x1, y1] of the opaque pixels, both ends included (as scripts/pokemon-sprites.ts records them). */
function artBox(img: PNG): [number, number, number, number] {
  let [x0, y0, x1, y1] = [img.width, img.height, -1, -1]
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++) {
      if (img.data[(y * img.width + x) * 4 + 3] === 0) continue
      x0 = Math.min(x0, x)
      x1 = Math.max(x1, x)
      y0 = Math.min(y0, y)
      y1 = Math.max(y1, y)
    }
  return x1 < 0 ? [0, 0, img.width - 1, img.height - 1] : [x0, y0, x1, y1]
}

/** Empty rows under the art. */
function bottomGap(img: PNG): number {
  for (let y = img.height - 1; y >= 0; y--)
    for (let x = 0; x < img.width; x++) if (img.data[(y * img.width + x) * 4 + 3]! > 0) return img.height - 1 - y
  return 0
}

async function main() {
  // The species rows, after Castform's own place among the forms (by id).
  const pokemon = JSON.parse(await readFile(path.join(DATA, 'pokemon.json'), 'utf8')) as Species[]
  const base = pokemon.find((p) => p.dex === CASTFORM)!
  const rows = pokemon.filter((p) => !CASTFORM_FORMS.some((f) => f.id === p.dex))
  for (const f of CASTFORM_FORMS) {
    const row: Species = {
      dex: f.id,
      name: base.name,
      type1: f.type,
      type2: null,
      baseHp: base.baseHp,
      maxHp: base.maxHp,
      speed: base.speed,
      spriteUrl: `/pokemon/${f.id}_front.png`,
      dice: base.dice.map((d) => ({ ...d, type: d.type === 'normal' ? f.type : d.type })),
      rerolls: base.rerolls,
      catchValue: base.catchValue,
      evolutions: [],
      milestones: [],
      notes: `${f.key} · in ${f.weather.join(' or ')}, its Normal dice become ${f.type} dice`,
      form: { of: CASTFORM, kind: 'battle', trigger: 'weather', weather: f.weather },
    }
    const at = rows.findIndex((p) => p.dex > f.id)
    rows.splice(at < 0 ? rows.length : at, 0, row)
  }
  await writeFile(path.join(DATA, 'pokemon.json'), JSON.stringify(rows, null, 1) + '\n')

  // Egg groups: Castform's.
  const eggs = JSON.parse(await readFile(path.join(DATA, 'egg-groups.json'), 'utf8')) as Record<string, unknown>
  for (const f of CASTFORM_FORMS) eggs[f.id] = eggs[CASTFORM]
  const sorted = Object.entries(eggs).sort(([a], [b]) => Number(a) - Number(b))
  await writeFile(
    path.join(DATA, 'egg-groups.json'),
    `{\n${sorted.map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n')}\n}\n`,
  )

  // Names: Castform's own, every language (a form's name is its species', as Wishiwashi's School is).
  const text = await readFile(SHEET, 'utf8')
  const lines = text.split('\n')
  const own = lines.find((l) => l.startsWith(`pokemon.${CASTFORM},`))!
  const kept = lines.filter((l) => !CASTFORM_FORMS.some((f) => l.startsWith(`pokemon.${f.id},`)))
  const at = kept.findIndex((l) => l.startsWith('pokemon.10017,'))
  kept.splice(at < 0 ? kept.length : at, 0, ...CASTFORM_FORMS.map((f) => own.replace(`pokemon.${CASTFORM},`, `pokemon.${f.id},`)))
  await writeFile(SHEET, kept.join('\n'))

  // Offline sprites and their metrics.
  const metricsFile = path.join(DATA, 'sprite-metrics.json')
  const metrics = JSON.parse(await readFile(metricsFile, 'utf8')) as Record<string, Record<string, unknown>>
  for (const f of CASTFORM_FORMS) {
    const m: Record<string, unknown> = { front: 0, back: 0 }
    for (const [kind, dir] of VIEWS) {
      const buf = await fetchCached(`${SPRITES}/${dir}${f.id}.png`, path.join(CACHE, `${kind}_${f.id}.png`))
      const img = PNG.sync.read(buf)
      if (kind === 'front' || kind === 'back') {
        m[kind] = bottomGap(img)
        m.size = img.width
        m[`${kind}Box`] = artBox(img)
      }
      await writeFile(path.join(ROOT, 'public', 'pokemon', `${f.id}_${kind}.png`), PNG.sync.write(img))
    }
    metrics[f.id] = { front: m.front, back: m.back, size: m.size, frontBox: m.frontBox, backBox: m.backBox }
  }
  const ordered = Object.fromEntries(Object.entries(metrics).sort(([a], [b]) => Number(a) - Number(b)))
  await writeFile(metricsFile, JSON.stringify(ordered) + '\n')
  console.log('✓ Castform’s Sunny, Rainy and Snowy Forms are in the bundle')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
