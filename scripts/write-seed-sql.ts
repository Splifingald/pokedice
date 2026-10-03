/**
 * pnpm seed-sql — regenerates supabase/seed.sql from the committed bundle in src/data.
 *
 * `pnpm seed` would do this too, but it also *rebuilds* the bundle from PokeAPI and would throw away the content the
 * bundle has grown since (evolution stones, fossils, item evolutions, every region). This writes the SQL and nothing
 * else, so the file always matches what the game actually ships.
 *
 * It also writes supabase/seed-parts/seed-NN.sql: the same SQL cut into parts small enough to paste into the Supabase
 * SQL editor one after the other (see `splitSeedSql`).
 */
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BUNDLE } from '../src/config/bundle'
import { buildSql, regionsPrelude, splitSeedSql } from './seed'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function main() {
  const sql = buildSql(BUNDLE as Parameters<typeof buildSql>[0], await regionsPrelude())
  const file = path.join(ROOT, 'supabase', 'seed.sql')
  await writeFile(file, sql)
  const partsDir = path.join(ROOT, 'supabase', 'seed-parts')
  await rm(partsDir, { recursive: true, force: true })
  await mkdir(partsDir, { recursive: true })
  const parts = splitSeedSql(sql)
  await Promise.all(
    parts.map((part, i) => writeFile(path.join(partsDir, `seed-${String(i + 1).padStart(2, '0')}.sql`), part)),
  )
  console.log(
    `✓ supabase/seed.sql — ${BUNDLE.regions?.length ?? 0} regions · ${BUNDLE.areas.length} areas · ` +
      `${BUNDLE.trainers.length} trainers · ${BUNDLE.pokemon.length} pokemon · ${BUNDLE.items.length} items`,
  )
  console.log(`✓ supabase/seed-parts — ${parts.length} parts of at most 200 KB, to paste in order`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
