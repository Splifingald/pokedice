/**
 * pnpm png — recompresses every PNG under public/ losslessly (oxipng), in place. Run it after any script that writes
 * images (pnpm pokemon-sprites, trainer-sprites, region-trainers, art): pngjs writes them uncompressed-ish, and oxipng
 * takes the shipped set from 7.7 MB to 2.1 MB with identical pixels. A file is only rewritten when the result is
 * smaller AND decodes to the same pixels, so running it twice changes nothing.
 *
 * Players fetch fewer bytes per sprite; Netlify bills bandwidth (docs/11-SCALING-COST-PLAN.md §5.1).
 */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import optimise, { init } from '@jsquash/oxipng/optimise.js'
import { PNG } from 'pngjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC = path.join(ROOT, 'public')

async function pngsUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map((e) => (e.isDirectory() ? pngsUnder(path.join(dir, e.name)) : e.name.endsWith('.png') ? [path.join(dir, e.name)] : [])),
  )
  return nested.flat()
}

const samePixels = (a: Buffer, b: Buffer) => {
  const x = PNG.sync.read(a)
  const y = PNG.sync.read(b)
  return x.width === y.width && x.height === y.height && x.data.equals(y.data)
}

async function main() {
  // The wasm build's loader expects a browser; in Node it takes the compiled module directly.
  const wasm = await readFile(createRequire(import.meta.url).resolve('@jsquash/oxipng/codec/pkg/squoosh_oxipng_bg.wasm'))
  await init(await WebAssembly.compile(wasm))
  const files = await pngsUnder(PUBLIC)
  let before = 0
  let after = 0
  let rewritten = 0
  for (const file of files) {
    const original = await readFile(file)
    before += original.length
    const smaller = Buffer.from(await optimise(original.buffer.slice(original.byteOffset, original.byteOffset + original.length), { level: 4 }))
    if (smaller.length < original.length && samePixels(original, smaller)) {
      await writeFile(file, smaller)
      after += smaller.length
      rewritten++
    } else after += original.length
  }
  const kb = (n: number) => `${Math.round(n / 1024)} KB`
  console.log(`✓ ${files.length} PNGs · ${rewritten} rewritten · ${kb(before)} → ${kb(after)}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
