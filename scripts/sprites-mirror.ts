/**
 * Our own copy of Showdown's files (docs/45-SPRITE-MIRROR.md): every sprite and cry the game asks for, at Showdown's
 * own paths, in `sprites-mirror/`, ready for `wrangler pages deploy`. The game reads them from there when the build
 * sets VITE_SPRITES_HOST.
 *
 * `pnpm sprites-mirror` (about 6,000 files, 250 MB; downloads land in scripts/.cache/showdown, shared with
 * `pnpm showdown-sprites`, so a re-run only fetches what is new). `--dry` only counts them.
 */
import { existsSync, readdirSync } from 'node:fs'
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import showdown from '../src/data/showdown-sprites.json' with { type: 'json' }
import { UNOWN_LETTERS } from '../src/engine/unownDex.ts'
import {
  ANI_DIRS,
  cryId,
  GEN5_DIRS,
  SHOWDOWN_HOST,
  SHOWDOWN_VIEWS,
  unownShowdownId,
  type ShowdownEntry,
} from '../src/lib/showdown.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = path.join(ROOT, 'scripts', '.cache', 'showdown')
export const OUT = path.join(ROOT, 'sprites-mirror')
/**
 * Our own sprites, drawn for the game (an outfit Showdown doesn't have: Santa Pikachu), at the paths Showdown would
 * use, so the game asks the copy for them like any other. Showdown has none of them: they exist only in the copy.
 */
export const CUSTOM = path.join(ROOT, 'sprites-custom')
/** Downloads at a time: quick, and gentle on Showdown. */
const PARALLEL = 6

/** One file of the copy: its path under Showdown's host (and the copy's), and where the cache keeps it. */
export interface MirrorFile {
  path: string
  cache: string
}

/** Every file the game can ask Showdown for: each view of each entry it has, the Unown letters, the cries. */
export function mirrorFiles(): MirrorFile[] {
  const entries = Object.values(showdown as unknown as Record<string, ShowdownEntry>)
  const files = new Map<string, MirrorFile>()
  const add = (p: string, cache: string) => files.set(p, { path: p, cache: path.join(CACHE, cache) })
  for (const e of entries) {
    SHOWDOWN_VIEWS.forEach((view, v) => {
      const kind = e.v[v]
      if (kind === 'a') add(`sprites/${ANI_DIRS[view]}/${e.id}.gif`, `${ANI_DIRS[view]}/${e.id}.gif`)
      if (kind === 'g') add(`sprites/${GEN5_DIRS[view]}/${e.id}.png`, `${GEN5_DIRS[view]}/${e.id}.png`)
    })
    const cry = cryId(e)
    if (cry) add(`audio/cries/${cry}.mp3`, `cries/${cry}.mp3`)
  }
  for (const l of UNOWN_LETTERS)
    add(`sprites/gen5ani/${unownShowdownId(l)}.gif`, `gen5ani/${unownShowdownId(l)}.gif`)
  for (const f of customFiles()) files.set(f.path, f)
  return [...files.values()]
}

/** Every file under sprites-custom/, at its own path: already on disk, so nothing is fetched for it. */
export function customFiles(dir = CUSTOM): MirrorFile[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && !e.name.startsWith('.'))
    .map((e) => {
      const cache = path.join(e.parentPath, e.name)
      return { path: path.relative(dir, cache).split(path.sep).join('/'), cache }
    })
    .sort((a, b) => a.path.localeCompare(b.path))
}

/** The copy's own rules (Cloudflare Pages `_headers`): a month in the browser's cache, readable from any page. */
const HEADERS = `/*
  Cache-Control: public, max-age=2592000, stale-while-revalidate=604800
  Access-Control-Allow-Origin: *
`

const INDEX = `<!doctype html>
<meta charset="utf-8">
<title>Pokédice sprites</title>
<p>A copy of the Pokémon Showdown sprites and cries used by Pokédice, a personal, non-commercial fan game.
Pokémon © Nintendo / Creatures / GAME FREAK. Sprites from Pokémon Showdown and the Smogon Sprite Project; the
outfits Showdown doesn't have (Santa Pikachu) are Pokédice's own edits of them.</p>
`

async function fetchCached(url: string, file: string): Promise<void> {
  if (existsSync(file)) return
  await mkdir(path.dirname(file), { recursive: true })
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
      await writeFile(file, Buffer.from(await res.arrayBuffer()))
      return
    } catch (err) {
      if (attempt >= 4) throw err
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt))
    }
  }
}

/**
 * Fill `out` with `files` (from the cache, fetching what it lacks from Showdown; our own sprites are already on disk),
 * plus `_headers` and a front page.
 */
export async function buildMirror(files: MirrorFile[], out = OUT) {
  await rm(out, { recursive: true, force: true })
  let next = 0
  let done = 0
  const worker = async () => {
    while (next < files.length) {
      const f = files[next++]!
      await fetchCached(`${SHOWDOWN_HOST}/${f.path}`, f.cache)
      await mkdir(path.dirname(path.join(out, f.path)), { recursive: true })
      await copyFile(f.cache, path.join(out, f.path))
      if (++done % 500 === 0) console.log(`  ${done} / ${files.length}`)
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker))
  await writeFile(path.join(out, '_headers'), HEADERS)
  await writeFile(path.join(out, 'index.html'), INDEX)
}

async function main() {
  const files = mirrorFiles()
  const sprites = files.filter((f) => f.path.startsWith('sprites/')).length
  const custom = customFiles().length
  console.log(
    `${files.length} files: ${sprites} sprites (${custom} of them our own), ${files.length - sprites} cries`,
  )
  if (process.argv.includes('--dry')) return
  await buildMirror(files)
  console.log(
    `Done: ${path.relative(ROOT, OUT)}/ is ready for \`wrangler pages deploy\` (docs/45-SPRITE-MIRROR.md).`,
  )
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain)
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
