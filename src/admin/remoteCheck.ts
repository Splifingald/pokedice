// Dev-only "Pull Supabase → local files": decides whether the live rows look complete enough to replace src/data/*.json.
import { bundleToRows, isPlayableBundle, rowsToBundle, TABLES, type Row, type TableName, type TableRows } from '@/config/mapping'
import { compileGameData } from '@/engine'
import type { BundleRaw } from '@/engine/types'

export interface RemoteCheck {
  /** Reasons the pull is refused — each one means the local files would lose data. */
  blockers: string[]
  /** Differences worth a look that may well be intentional (rows deleted in admin). */
  warnings: string[]
  counts: { table: TableName; local: number; remote: number }[]
  bundle: BundleRaw | null
}

const columnsOf = (rows: Row[]) => {
  const cols = new Set<string>()
  for (const r of rows) for (const [k, v] of Object.entries(r)) if (v !== undefined) cols.add(k)
  return cols
}

const list = (xs: (string | number)[], max = 8) => xs.slice(0, max).join(', ') + (xs.length > max ? ` … (+${xs.length - max})` : '')

/** `remote` is the raw result of fetchAllRows: a table that failed to load arrives empty, a missing column arrives absent. */
export function checkRemote(remote: TableRows, local: BundleRaw): RemoteCheck {
  const localRows = bundleToRows(local)
  const blockers: string[] = []
  const warnings: string[] = []
  const counts = TABLES.map((table) => ({ table, local: localRows[table].length, remote: remote[table].length }))

  for (const { table, local: l, remote: r } of counts) {
    if (l > 0 && r === 0) {
      blockers.push(`Table "${table}" is empty or unreadable on Supabase (local has ${l} rows). Run the missing migration or supabase/seed.sql first.`)
      continue
    }
    if (r < l) warnings.push(`"${table}" has ${l - r} fewer rows on Supabase (${r} vs ${l} locally).`)
    // Supabase returns every column (null included), so an absent key means the column itself doesn't exist.
    if (!r) continue
    const have = new Set(remote[table].flatMap((row) => Object.keys(row)))
    const missing = [...columnsOf(localRows[table])].filter((c) => !have.has(c))
    if (missing.length)
      blockers.push(`Table "${table}" has no column ${list(missing)} on Supabase — a migration hasn't been run there, so those values would be dropped.`)
  }

  const remoteDex = new Set(remote.pokemon.map((p) => Number(p.dex)))
  const lostDex = local.pokemon.map((p) => p.dex).filter((d) => !remoteDex.has(d))
  if (remote.pokemon.length && lostDex.length) blockers.push(`Pokémon missing on Supabase: #${list(lostDex)}.`)

  const remoteKeys = new Set(remote.game_config.map((c) => String(c.key)))
  const lostKeys = Object.keys(local.config).filter((k) => !remoteKeys.has(k))
  if (remote.game_config.length && lostKeys.length)
    blockers.push(`Config keys missing on Supabase: ${list(lostKeys)}. Add them in Config (or run supabase/seed.sql) first.`)

  let bundle: BundleRaw | null = null
  try {
    bundle = rowsToBundle(remote)
    const emptied = local.areas
      .filter((a) => a.wildPool.length > 0)
      .filter((a) => bundle!.areas.some((b) => b.id === a.id && b.wildPool.length === 0))
      .map((a) => a.name)
    if (emptied.length) warnings.push(`These areas have no wild Pokémon on Supabase: ${list(emptied)}.`)
    if (!isPlayableBundle(bundle)) blockers.push('The Supabase content is not playable (no Pokémon, areas, dice types or wild pools).')
    else compileGameData(bundle)
  } catch (err) {
    blockers.push(`The Supabase content doesn't compile: ${err instanceof Error ? err.message : String(err)}`)
  }

  return { blockers, warnings, counts, bundle: blockers.length ? null : bundle }
}
