/**
 * Egg groups, fixed genders and legendaries, from Pokémon Showdown (docs/15-DAYCARE-BREEDING.md, Phase 1).
 *
 * `pnpm egg-groups` reads Showdown's pokedex.json (cached under scripts/.cache/showdown, shared with
 * `pnpm showdown-sprites`, so a re-run is offline) and writes src/data/egg-groups.json: per dex in pokemon.json,
 *
 * - `g`: Showdown's `eggGroups` as they are ("Water 1", "Human-Like", "Undiscovered"…);
 * - `s`: Showdown's `gender`, only when the species' is fixed: "M", "F" or "N" (genderless);
 * - `l: 1`: legendaries and mythicals (`tags` holds Sub-Legendary, Restricted Legendary or Mythical).
 *
 * They are canon, not something the admin edits, so they ship as static data like showdown-sprites.json. A form takes
 * its base species' entry: forms share their base's groups in every case Pokédice has.
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pokemon from '../src/data/pokemon.json' with { type: 'json' }

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = path.join(ROOT, 'scripts', '.cache', 'showdown', 'pokedex.json')
const OUT = path.join(ROOT, 'src/data/egg-groups.json')
const POKEDEX_URL = 'https://play.pokemonshowdown.com/data/pokedex.json'
const LEGEND_TAGS = new Set(['Sub-Legendary', 'Restricted Legendary', 'Mythical'])

interface ShowdownSpecies {
  num: number
  name: string
  forme?: string
  eggGroups?: string[]
  gender?: 'M' | 'F' | 'N'
  tags?: string[]
}

interface Species {
  dex: number
  name: string
  form?: { of: number }
}

export interface EggEntry {
  g: string[]
  s?: 'M' | 'F' | 'N'
  l?: 1
}

async function pokedex(): Promise<Record<string, ShowdownSpecies>> {
  if (!existsSync(CACHE)) {
    await mkdir(path.dirname(CACHE), { recursive: true })
    const res = await fetch(POKEDEX_URL)
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${POKEDEX_URL}`)
    await writeFile(CACHE, Buffer.from(await res.arrayBuffer()))
  }
  return JSON.parse(await readFile(CACHE, 'utf8')) as Record<string, ShowdownSpecies>
}

const SPECIES = pokemon as unknown as Species[]
const BY_DEX = new Map(SPECIES.map((s) => [s.dex, s]))

/** The National Dex number a form hangs off (a form of a form walks back twice). */
function rootDex(dex: number): number {
  let d = dex
  while (d > 1025) {
    const of = BY_DEX.get(d)?.form?.of
    if (!of) throw new Error(`#${d} is past the National Dex and has no form.of`)
    d = of
  }
  return d
}

async function main() {
  const dex = await pokedex()
  // The base species of each number: the entry without a forme.
  const base = new Map<number, ShowdownSpecies>()
  for (const s of Object.values(dex)) if (s.num > 0 && !s.forme && !base.has(s.num)) base.set(s.num, s)

  const out: Record<number, EggEntry> = {}
  const missing: string[] = []
  for (const s of [...SPECIES].sort((a, b) => a.dex - b.dex)) {
    const b = base.get(rootDex(s.dex))
    if (!b?.eggGroups?.length) {
      missing.push(`${s.dex} ${s.name}`)
      continue
    }
    const e: EggEntry = { g: b.eggGroups }
    if (b.gender) e.s = b.gender
    if (b.tags?.some((t) => LEGEND_TAGS.has(t))) e.l = 1
    out[s.dex] = e
  }
  if (missing.length) throw new Error(`No Showdown Egg groups for: ${missing.join(', ')}`)

  // One entry per line: small diffs when Showdown changes one species.
  const lines = Object.entries(out).map(([k, v]) => `  "${k}": ${JSON.stringify(v)}`)
  await writeFile(OUT, `{\n${lines.join(',\n')}\n}\n`)
  const legends = new Set(SPECIES.filter((s) => s.dex <= 1025 && out[s.dex]?.l).map((s) => s.dex))
  console.log(`egg-groups.json: ${lines.length} entries, ${legends.size} legendary or mythical species`)
}

await main()
