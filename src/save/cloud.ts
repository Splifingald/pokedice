// Cloud backup of the same save blob. Never blocks the UI. The save with more progress wins, automatically (see
// decideSync). Progress is measured across every region a save holds, not just the one it was last played in.
import type { SupabaseClient } from '@supabase/supabase-js'
import { liveBlock, regionOf, worldRegionOf } from '@/engine/regions'
import { missesTrades } from '@/engine/trade'
import type { RegionSave, SaveData, SaveMode } from '@/engine/types'
import { parseSave } from './schema'
import type { CloudMark } from './storage'

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
 * The player's row for one of their two saves (docs/22), or null. The main one is read the old way on a database
 * without realms, so the game keeps syncing while 0039 waits to be run.
 */
async function readRow(client: SupabaseClient, userId: string, realm: SaveMode, columns: string) {
  const read = (withRealm: boolean) => {
    const q = client.from('saves').select(columns).eq('user_id', userId)
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
  return res.data as Record<string, unknown> | null
}

/** A row's `updated_at` in ms. Postgres timestamps carry microseconds, which not every browser parses: keep ms. */
function stampOf(at: unknown): number | null {
  const ms = typeof at === 'string' ? Date.parse(at.replace(/(\.\d{3})\d+/, '$1')) : NaN
  return Number.isFinite(ms) ? ms : null
}

/** The cloud copy of a save and its row's `updated_at` (null without a row). `save` is null when it can't be read. */
export interface CloudCopy {
  save: SaveData | null
  at: number | null
}

export async function pullCloudSave(client: SupabaseClient, userId: string, realm: SaveMode = 'main'): Promise<CloudCopy> {
  const row = await readRow(client, userId, realm, 'data, updated_at')
  if (!row) return { save: null, at: null }
  const parsed = parseSave(row.data)
  return { save: parsed.ok ? parsed.save : null, at: stampOf(row.updated_at) }
}

/** Only the cloud copy's `updated_at` (null without a row): a few bytes, where the save itself is 30–400 kB. */
export async function cloudSaveAt(client: SupabaseClient, userId: string, realm: SaveMode = 'main'): Promise<number | null> {
  const row = await readRow(client, userId, realm, 'updated_at')
  return row ? stampOf(row.updated_at) : null
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
 * sees only wherever the player happens to be standing. A small world's block isn't progress (it closes with the
 * world), so it's left out.
 */
const regionBlocks = (s: SaveData): RegionSave[] => {
  const world = worldRegionOf(s)
  return [
    ...(regionOf(s) === world ? [] : [liveBlock(s)]),
    ...Object.entries(s.parked ?? {}).flatMap(([id, b]) => (b && id !== world ? [b] : [])),
  ]
}

/**
 * How far a save got across every region it holds: its areas (cleared, then gym battles won), then its Pokédex.
 *
 * Areas and gyms add up, because clearing Johto is work done on top of Kanto, not instead of it. Species are the
 * union: the regions' Pokédexes overlap — Johto's routes are full of Gen 1 — and catching the same Pikachu twice is
 * not twice the progress. The area axes already carry the extra region's weight.
 *
 * Before this walked the parked blocks, a save deep into Johto compared as if Kanto had never happened: a freshly
 * started Johto, with one starter and no areas, lost to a stale device sitting in a finished Kanto.
 */
export function progressTotals(s: SaveData) {
  const species = new Set<number>()
  let cleared = 0
  let gyms = 0
  for (const block of regionBlocks(s)) {
    for (const p of Object.values(block.areaProgress)) {
      if (p.cleared) cleared++
      gyms += p.gymsDefeated?.length ?? 0
    }
    for (const dex of block.pokedex) species.add(dex)
  }
  return { regions: regionBlocks(s).length, cleared, gyms, species: species.size }
}

function progressTuple(s: SaveData): number[] {
  const t = progressTotals(s)
  return [t.cleared, t.gyms, t.species]
}

/** > 0 when `a` got further than `b`, < 0 when it's behind, 0 when they're level. */
export function compareProgress(a: SaveData, b: SaveData): number {
  const x = progressTuple(a)
  const y = progressTuple(b)
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i]! - y[i]!
  return 0
}

export type SyncDecision = 'none' | 'local' | 'cloud'

/**
 * The sync, with no question asked: the save further along in its areas wins, then the one with the bigger Pokédex
 * (`compareProgress`). A stamp is easy to move, progress isn't, so progress decides first. Level on both, the one
 * played last: ₽, levels, rematches and upgrades don't count as progress, and keeping this device's own on a tie let
 * an idle device's older save undo all of them on another (players lost their General upgrades and the ₽ spent on
 * them that way, 2026-10-16).
 */
export function decideSync(local: SaveData | null, cloud: SaveData | null): SyncDecision {
  if (!local && !cloud) return 'none'
  if (!cloud) return 'local'
  if (!local) return 'cloud'
  // An admin edit (e.g. a Pokémon taken away) is applied as is, whatever the progress.
  if (cloud.updatedAt > local.updatedAt && (cloud.adminEditAt ?? 0) > local.updatedAt) return 'cloud'
  const ahead = compareProgress(local, cloud)
  if (ahead !== 0) return ahead > 0 ? 'local' : 'cloud'
  // Level, but one copy never saw a trade the other did: keeping it would bring back the Pokémon traded away while the
  // other trainer keeps it too (docs/23).
  if (missesTrades(local, cloud)) return 'cloud'
  if (missesTrades(cloud, local)) return 'local'
  return cloud.updatedAt > local.updatedAt ? 'cloud' : 'local'
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

/** A 64-bit fingerprint of a string (cyrb53, in hex): short enough to keep on the device in place of a whole save. */
export function fingerprint(s: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0')
}

/**
 * The save as far as a push is concerned: a fingerprint of everything but its timestamps. Settings count, so a change
 * made only there still reaches the cloud. Two saves with the same key, and the second push would change nothing.
 */
export function pushKey(s: SaveData): string {
  return fingerprint(canonical({ ...s, updatedAt: 0, lastRegenTick: 0 }))
}

/**
 * Automatic uploads from one device are at least this far apart, reloads included. A save is 30–400 kB and each upload
 * rebuilds the player's card on the database (~230 ms there): on 2026-10-11 a few players reloading the game every few
 * seconds uploaded on every load and took the database down. What waits stays in the local save and goes up at the next
 * load or sync after the gap.
 */
export const PUSH_GAP_MS = 2 * 60_000

/** The database refused an upload: this player uploaded too often (migration 0040's budget; HTTP 429). */
export const isRateLimited = (e: unknown) => (e as { code?: string } | null)?.code === 'PT429'

/** How long before this device may upload `user`'s save again on its own (SYNC ONLINE doesn't wait). */
export function pushGapLeft(mark: CloudMark | null, user: string, now = Date.now()): number {
  if (!mark || mark.user !== user) return 0
  return Math.max(0, Math.min(PUSH_GAP_MS, mark.pushedAt + PUSH_GAP_MS - now))
}

/**
 * The cloud copy is still the one this device last matched: same player, same row stamp. Every write to a save sets its
 * stamp (the game's and the admin's alike), so the copy holds what `mark.key` says and needn't be downloaded again.
 */
export function cloudUnchanged(mark: CloudMark | null, user: string, at: number | null): mark is CloudMark {
  return !!mark && mark.user === user && at != null && mark.at === at
}
