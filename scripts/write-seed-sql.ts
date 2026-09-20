/**
 * pnpm seed-sql — regenerates supabase/seed.sql from the committed bundle in src/data.
 *
 * `pnpm seed` would do this too, but it also *rebuilds* the bundle from PokeAPI and would throw away the content the
 * bundle has grown since (evolution stones, fossils, item evolutions, every region). This writes the SQL and nothing
 * else, so the file always matches what the game actually ships.
 */
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BUNDLE } from '../src/config/bundle'
import { buildSql } from './seed'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function main() {
  const sql = buildSql(BUNDLE as Parameters<typeof buildSql>[0])
  const file = path.join(ROOT, 'supabase', 'seed.sql')
  await writeFile(file, sql)
  console.log(
    `✓ supabase/seed.sql — ${BUNDLE.regions?.length ?? 0} regions · ${BUNDLE.areas.length} areas · ` +
      `${BUNDLE.trainers.length} trainers · ${BUNDLE.pokemon.length} pokemon · ${BUNDLE.items.length} items`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
