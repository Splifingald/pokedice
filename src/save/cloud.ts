// Cloud backup of the same save blob. Never blocks the UI. The newest `updatedAt` wins — unless it has less progress
// than the other save, and then the player chooses (see decideSync). Progress is measured across every region a save
// holds, not just the one it was last played in.
import type { SupabaseClient } from '@supabase/supabase-js'
import { liveBlock } from '@/engine/regions'
import type { RegionSave, SaveData, SaveMode } from '@/engine/types'
import { parseSave } from './schema'

/** The database has no `realm` column yet (0039 not run): only the main save syncs, as before Extreme mode. */
let noRealm = false

/** Postgres' "no such column" (a filter on it) and PostgREST's (a write to it). */
const missingColumn = (e: { code?: string } | null) => e?.code === '42703' || e?.code === 'PGRST204'

/** An Extreme save can't sync until the database has its realm (0039). */
export class NoRealmError extends Error {
  constructor() {
    super('extreme_realm_missing')
  }
}

/**
 * The cloud copy of one of the player's two saves (docs/20). The main one is read the old way on a database without
 * realms, so the game keeps syncing while 0039 waits to be run.
 */
export async function pullCloudSave(client: SupabaseClient, userId: string, realm: SaveMode = 'main'): Promise<SaveData | null> {
  const read = (withRealm: boolean) => {
    const q = client.from('saves').select('data').eq('user_id', userId)
    return (withRealm ? q.eq('realm', realm) : q).maybeSingle()
  }
  if (noRealm && realm === 'extreme') throw new NoRealmError()
  let res = await read(!noRealm)
  if (res.error && missingColumn(res.error)) {
    noRealm = true
    if (realm === 'extreme') throw new NoRealmError()
    res = await read(false)
  }
  if (res.error) throw res.error
  if (!res.data) return null
  const parsed = parseSave((res.data as { data: unknown }).data)
  return parsed.ok ? parsed.save : null
}

/** Writes the save to its own realm's row: the main save as it always was, the Extreme one beside it. */
export async function pushCloudSave(client: SupabaseClient, userId: string, save: SaveData): Promise<void> {
  const extreme = save.mode === 'extreme'
  if (extreme && noRealm) throw new NoRealmError()
  // The main row is written as before (its realm is the column's default), so an older database takes it too.
  const row: Record<string, unknown> = { user_id: userId, data: save, updated_at: new Date(save.updatedAt).toISOString() }
  if (extreme) row.realm = 'extreme'
  const { error } = await client.from('saves').upsert(row)
  if (error && extreme && missingColumn(error)) {
    noRealm = true
    throw new NoRealmError()
  }
  if (error) throw error
}

export type SyncWinner = 'local' | 'cloud' | 'none'

export function pickNewest(local: SaveData | null, cloud: SaveData | null): { winner: SyncWinner; save: SaveData | null } {
  if (!local && !cloud) return { winner: 'none', save: null }
  if (!cloud) return { winner: 'local', save: local }
  if (!local) return { winner: 'cloud', save: cloud }
  return cloud.updatedAt > local.updatedAt ? { winner: 'cloud', save: cloud } : { winner: 'local', save: local }
}

let pushTimer: ReturnType<typeof setTimeout> | null = null
let pending: (() => Promise<void>) | null = null
/** Pushes run one after another, so an older save can never land after a newer one. */
let pushing: Promise<void> = Promise.resolve()

/**
 * Push after any save mutation, once `delay` is up, carrying the latest save — not a debounce, which non-stop play
 * would keep putting off. The game passes the time left until `cloudSyncMinutes` after the last sync (src/store/sync.ts);
 * closing the page pushes right away (flushPush). The local save is always current.
 */
export function schedulePush(run: () => Promise<void>, delay = 30_000) {
  pending = run
  if (!pushTimer) pushTimer = setTimeout(flushPush, delay)
}

/** Push the waiting save now, if there is one. */
export function flushPush() {
  const run = pending
  cancelPush()
  if (!run) return
  pushing = pushing.then(run).catch((err) => console.warn('[cloud] push failed', err))
}

/** Sends the waiting save now; resolves once every push has landed or failed (a push never rejects). */
export function pushesSettled(): Promise<void> {
  flushPush()
  return pushing
}

/** Forget the waiting push: the caller is pushing the latest save itself. */
export function cancelPush() {
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = null
  pending = null
}

/**
 * Every region the save holds: the live one, lifted out of the top level, and each parked block. Regions are
 * separate runs, so anything that measures a whole save has to walk all of them — reading `save.areaProgress` alone
 * sees only wherever the player happens to be standing.
 */
const regionBlocks = (s: SaveData): RegionSave[] => [liveBlock(s), ...Object.values(s.parked ?? {}).filter((b): b is RegionSave => !!b)]

/**
 * How far a save got across every region it holds, compared in order: areas cleared, gym battles won, species
 * caught, total levels.
 *
 * Areas, gyms and levels add up, because clearing Johto is work done on top of Kanto, not instead of it. Species are
 * the union: the regions' Pokédexes overlap — Johto's routes are full of Gen 1 — and catching the same Pikachu twice
 * is not twice the progress. The other three axes already carry the extra region's weight.
 *
 * Before this walked the parked blocks, a save deep into Johto compared as if Kanto had never happened: a freshly
 * started Johto, with one starter and no areas, lost to a stale device sitting in a finished Kanto.
 */
export function progressTotals(s: SaveData) {
  const species = new Set<number>()
  let cleared = 0
  let gyms = 0
  let levels = 0
  for (const block of regionBlocks(s)) {
    for (const p of Object.values(block.areaProgress)) {
      if (p.cleared) cleared++
      gyms += p.gymsDefeated?.length ?? 0
    }
    for (const dex of block.pokedex) species.add(dex)
    for (const p of block.box) levels += p.level
  }
  // One Day Care for every region: its residents count once, whichever region they came from.
  for (const r of s.dayCare?.residents ?? []) levels += r.inst.level
  return { regions: regionBlocks(s).length, cleared, gyms, species: species.size, levels }
}

function progressTuple(s: SaveData): number[] {
  const t = progressTotals(s)
  return [t.cleared, t.gyms, t.species, t.levels]
}

/** > 0 when `a` got further than `b`, < 0 when it's behind, 0 when they're level. */
export function compareProgress(a: SaveData, b: SaveData): number {
  const x = progressTuple(a)
  const y = progressTuple(b)
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i]! - y[i]!
  return 0
}

export type SyncDecision = 'none' | 'local' | 'cloud' | 'ask'

/**
 * The first sync after signing in. The newest save wins — unless it has less progress than the other one (a stale
 * device was opened and touched): then the player is asked, instead of silently overwriting real progress.
 */
export function decideSync(local: SaveData | null, cloud: SaveData | null): SyncDecision {
  if (!local && !cloud) return 'none'
  if (!cloud) return 'local'
  if (!local) return 'cloud'
  const cloudNewer = cloud.updatedAt > local.updatedAt
  // An admin edit (e.g. a Pokémon taken away) is applied as is, without asking.
  if (cloudNewer && (cloud.adminEditAt ?? 0) > local.updatedAt) return 'cloud'
  const newer = cloudNewer ? cloud : local
  const older = cloudNewer ? local : cloud
  if (compareProgress(older, newer) > 0) return 'ask'
  return cloudNewer ? 'cloud' : 'local'
}

/**
 * JSON with every object's keys sorted. The cloud copy comes back from Postgres (jsonb) with its keys reordered, so
 * plain JSON.stringify would call a save that only went to the cloud and back a different save — and push it again.
 */
const canonical = (v: unknown) =>
  JSON.stringify(v, (_k, x: unknown) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, (x as Record<string, unknown>)[k]]))
      : x,
  )

/** Same game state, ignoring bookkeeping (timestamps, settings; `lastRegenTick` from saves made before regen was removed). */
export function sameSave(a: SaveData, b: SaveData): boolean {
  const strip = (s: SaveData) => canonical({ ...s, updatedAt: 0, lastRegenTick: 0, settings: null })
  return strip(a) === strip(b)
}

/**
 * The save as far as a push is concerned: everything but its timestamps. Settings count, so a change made only there
 * still reaches the cloud. Two saves with the same key, and the second push would change nothing.
 */
export function pushKey(s: SaveData): string {
  return canonical({ ...s, updatedAt: 0, lastRegenTick: 0 })
}
