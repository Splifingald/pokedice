/**
 * pnpm pull-remote          — compare src/data/*.json with what is live on Supabase. Writes nothing.
 * pnpm pull-remote --write  — and, if the live copy is complete, overwrite src/data/*.json + supabase/seed.sql.
 *
 * The command-line twin of Admin → "Pull from Supabase": the same `fetchAllRows`, the same `checkRemote` refusal
 * rules and the same `writeBundleFiles`, so both paths can never disagree about what a safe pull is. The point of
 * having it here too is that admin tuning lands on Supabase first — the committed bundle is a snapshot of it, and
 * this says in one command how far behind that snapshot has fallen.
 *
 * Credentials come from .env.local (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) or from the environment. Reading
 * content needs no sign-in: the game itself fetches it anonymously.
 */
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { checkRemote } from '../src/admin/remoteCheck'
import { BUNDLE } from '../src/config/bundle'
import { fetchAllRows } from '../src/config/remote'
import { writeBundleFiles } from './import-bundle'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Minimal .env reader: `KEY=value`, `#` comments, optional surrounding quotes. No dependency for four lines. */
async function envFile(file: string): Promise<Record<string, string>> {
  if (!existsSync(file)) return {}
  const out: Record<string, string> = {}
  for (const line of (await readFile(file, 'utf8')).split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i.exec(line)
    if (!m || line.trimStart().startsWith('#')) continue
    out[m[1]!] = m[2]!.trim().replace(/^["']|["']$/g, '')
  }
  return out
}

async function main() {
  const write = process.argv.includes('--write')
  const env = { ...(await envFile(path.join(ROOT, '.env.local'))), ...process.env }
  const url = env.VITE_SUPABASE_URL?.trim()
  const key = env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!url || !key) {
    console.error(
      'No Supabase credentials. Put VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local (copy .env.example),\n' +
        'or pass them in the environment. They are the public anon values — the same pair the deployed site ships.',
    )
    process.exit(1)
  }

  console.log(`Reading ${url} …`)
  const client = createClient(url, key, { auth: { persistSession: false } })
  const remote = await fetchAllRows(client)
  const check = checkRemote(remote, BUNDLE)

  const drift = check.counts.filter((c) => c.local !== c.remote)
  console.log(`\n${'Table'.padEnd(20)}${'local'.padStart(8)}${'Supabase'.padStart(10)}`)
  for (const c of check.counts) {
    const mark = c.local === c.remote ? '' : '   ←  differs'
    console.log(`${c.table.padEnd(20)}${String(c.local).padStart(8)}${String(c.remote).padStart(10)}${mark}`)
  }

  for (const w of check.warnings) console.log(`\n!  ${w}`)
  if (check.blockers.length) {
    console.error('\nRefused — pulling would lose data:')
    for (const b of check.blockers) console.error(`  · ${b}`)
    process.exit(1)
  }

  if (!drift.length) {
    console.log('\n✓ Every table matches. The committed bundle is up to date with Supabase.')
    return
  }
  console.log(`\n${drift.length} table(s) differ in row count. Row contents may differ in tables that match, too.`)
  if (!write) {
    console.log('Run `pnpm pull-remote --write` to overwrite src/data/*.json and supabase/seed.sql, then `git diff`.')
    return
  }
  await writeBundleFiles(check.bundle!)
  console.log('✓ src/data/*.json and supabase/seed.sql now match Supabase. Review with `git diff`, then run `pnpm test`.')
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
