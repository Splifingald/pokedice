/**
 * pnpm remove-league-ii — one-off (docs/19 §5.4): Victory Road II and League II, the endgame lap the Elite Rebattle
 * replaces, leave the game. Removes those 14 areas from src/data/areas.json, and from trainers.json the trainers no
 * other area (and no rebattle lineup) uses; writes supabase/migrations/0036_remove_league_ii.sql, the same deletions
 * for the live database (seed.sql only upserts, so it can't remove rows). Saves are moved by `migrateLeagueII`.
 * Run it after `pnpm rebattle-teams` (Kanto's rival Champions are rebuilt there). Safe to run again: nothing left to
 * remove is a no-op.
 */
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Area, Trainer } from '../src/engine'
import { LEAGUE_II } from '../src/engine/rebattle'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA = path.join(ROOT, 'src', 'data')
const readJson = async <T>(f: string): Promise<T> => JSON.parse(await readFile(path.join(DATA, f), 'utf8')) as T
const writeJson = (f: string, v: unknown) => writeFile(path.join(DATA, f), `${JSON.stringify(v, null, 1)}\n`)

/** The trainers an area fights: its gyms and its trainer pool. */
const trainersOf = (a: Area) => [...a.gyms, ...a.trainerPool.map((t) => t.trainerId)]

async function main() {
  const areas = await readJson<Area[]>('areas.json')
  const trainers = await readJson<Trainer[]>('trainers.json')
  const config = await readJson<{ rebattleLineups?: Record<string, Record<string, string[]>> }>('config.json')
  const lineups = config.rebattleLineups ?? {}
  const ids = new Set(Object.keys(LEAGUE_II))
  const removed = areas.filter((a) => ids.has(a.id))
  // Already done: keep the SQL file as it was written the first time.
  if (!removed.length) return console.log('✓ nothing to remove (already done)')
  const kept = areas.filter((a) => !ids.has(a.id))
  const stillUsed = new Set([...kept.flatMap(trainersOf), ...Object.values(lineups).flatMap((l) => Object.values(l).flat())])
  const gone = [...new Set(removed.flatMap(trainersOf))].filter((id) => !stillUsed.has(id))
  const goneSet = new Set(gone)
  await writeJson('areas.json', kept)
  await writeJson('trainers.json', trainers.filter((t) => !goneSet.has(t.id)))

  const list = (xs: string[]) => xs.map((x) => `  '${x}'`).join(',\n')
  const sql = `-- Victory Road II and League II leave the game (docs/19-SPECIAL-EVENTS-BUILD.md §5.4): the Elite Rebattle
-- replaces that endgame lap. seed.sql only upserts, so the rows it no longer has are deleted here. Run once after the
-- new seed.sql; safe to run again. Their wild, trainer and loot pools go with the areas (on delete cascade). Saves
-- standing in one of these areas go back to their region's League when they next load (engine migrateLeagueII).

delete from areas where id in (
${list([...ids])}
);

-- The trainers only those areas used (League II's Elite Four and Champions, Victory Road II's trainers).
delete from trainers where id in (
${list(gone.length ? gone : ['00000000-0000-0000-0000-000000000000'])}
);
`
  await writeFile(path.join(ROOT, 'supabase', 'migrations', '0036_remove_league_ii.sql'), sql)
  console.log(`✓ removed ${removed.length} areas and ${gone.length} trainers; wrote supabase/migrations/0036_remove_league_ii.sql`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
