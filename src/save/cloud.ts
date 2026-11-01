// Cloud backup of the same save blob. Never blocks the UI. The save with more progress wins, automatically (see
// decideSync). Progress is measured across every region a save holds, not just the one it was last played in.
import type { SupabaseClient } from '@supabase/supabase-js'
import { liveBlock, regionOf, worldRegionOf } from '@/engine/regions'
import { missesTrades } from '@/engine/trade'
import type { RegionSave, SaveData, SaveMode } from '@/engine/types'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/supabase'
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

/** Another device (or the admin) wrote the cloud copy since this device last matched it: nothing was written. */
export class SaveConflictError extends Error {
  constructor() {
    super('save_conflict')
  }
}

const iso = (ms: number) => new Date(ms).toISOString()

/**
 * Writes the save to its own realm's row — only if the row is still the copy this device last matched: stamped `base`,
 * or no row at all when `base` is null. Otherwise nothing is written and SaveConflictError is thrown, for the caller to
 * compare again. A plain upsert let a device left open on an old save write it over what another device had played
 * since (a small world nearly finished on a phone, undone by a PC tab's offline pay, 2026-10-22). Resolves to the
 * row's stamp afterwards.
 */
export async function pushCloudSave(
  client: SupabaseClient,
  userId: string,
  save: SaveData,
  base: number | null,
): Promise<number> {
  const extreme = save.mode === 'extreme'
  if (extreme && noRealm) throw new NoRealmError()
  const realm: SaveMode = extreme ? 'extreme' : 'main'
  const at = iso(save.updatedAt)
  const write = (withRealm: boolean) => {
    if (base == null) {
      // The main row is written as before (its realm is the column's default), so an older database takes it too.
      const row: Record<string, unknown> = { user_id: userId, data: save, updated_at: at }
      if (extreme) row.realm = 'extreme'
      return client.from('saves').insert(row).select('updated_at')
    }
    const q = client.from('saves').update({ data: save, updated_at: at }).eq('user_id', userId)
    // The row's stamp has microseconds, the device's copy of it milliseconds: anything within that millisecond.
    return (withRealm ? q.eq('realm', realm) : q)
      .gte('updated_at', iso(base))
      .lt('updated_at', iso(base + 1))
      .select('updated_at')
  }
  let res = await write(!noRealm)
  if (res.error && missingColumn(res.error)) {
    noRealm = true
    if (extreme) throw new NoRealmError()
    res = await write(false)
  }
  // A row this device didn't know of: another device's first upload.
  if (res.error?.code === '23505') throw new SaveConflictError()
  if (res.error) throw res.error
  if (base == null || res.data?.length) return save.updatedAt
  // No row updated: someone else's stamp is on it now, or it already held this very save (0037 drops that write).
  const now = await cloudSaveAt(client, userId, realm)
  if (now != null && now === base) return now
  throw new SaveConflictError()
}

/**
 * Browsers finish a request a closing page started (`keepalive`) only up to 64 KiB of body, all such requests together:
 * a typical save (~50 kB) fits, a big one doesn't.
 */
export const KEEPALIVE_MAX_BYTES = 60_000

/**
 * The page is going away (hidden, closed): the save goes up in one request started right now, which the browser
 * finishes even once the page is gone (keepalive). Through supabase-js it never left: the client reads its session
 * asynchronously before sending, and a closing page doesn't wait. Written only over the copy stamped `base`, like
 * pushCloudSave; no answer is read, nobody is left to read it. False when it can't go this way (too big for keepalive,
 * no row known): the caller pushes as usual instead.
 */
export function sendSaveOnLeave(userId: string, token: string, save: SaveData, base: number | null): boolean {
  if (base == null || !SUPABASE_URL || typeof fetch !== 'function') return false
  const body = JSON.stringify({ data: save, updated_at: iso(save.updatedAt) })
  if (new Blob([body]).size > KEEPALIVE_MAX_BYTES) return false
  const realm: SaveMode = save.mode === 'extreme' ? 'extreme' : 'main'
  const filter = [
    `user_id=eq.${encodeURIComponent(userId)}`,
    ...(noRealm ? [] : [`realm=eq.${realm}`]),
    `updated_at=gte.${encodeURIComponent(iso(base))}`,
    `updated_at=lt.${encodeURIComponent(iso(base + 1))}`,
  ].join('&')
  fetch(`${SUPABASE_URL}/rest/v1/saves?${filter}`, {
    method: 'PATCH',
    keepalive: true,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body,
  }).catch(() => {})
  return true
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
 * sees only wherever the player happens to be standing. A small world's block is counted apart (`openWorld`).
 */
const regionBlocks = (s: SaveData): RegionSave[] => {
  const world = worldRegionOf(s)
  return [
    ...(regionOf(s) === world ? [] : [liveBlock(s)]),
    ...Object.entries(s.parked ?? {}).flatMap(([id, b]) => (b && id !== world ? [b] : [])),
  ]
}

/** The small world the save holds open, and its block (live when the player is inside, else parked). */
function openWorld(s: SaveData): { id: string; block: RegionSave } | null {
  const w = s.events?.world
  if (!w || w.closed) return null
  const block = regionOf(s) === w.regionId ? liveBlock(s) : s.parked?.[w.regionId]
  return block ? { id: w.id, block } : null
}

/** The save is done with world `id`: closed at its end, finished early, or its closing pop-up already shown. */
const pastWorld = (s: SaveData, id: string): boolean => {
  const e = s.events
  return (e?.world?.id === id && !!e.world.closed) || !!e?.worldDone?.includes(id) || !!e?.worldBye?.includes(id)
}

/**
 * How far a save got across every region it holds: its areas (cleared, then gym battles won), then its Pokédex. And,
 * apart, the small world it holds open: areas done (a portal run or a nightmare won counts, as for finishing it) and
 * its own Pokédex.
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
  const open = openWorld(s)
  const world = open && {
    id: open.id,
    cleared: Object.values(open.block.areaProgress).filter((p) => p.cleared || p.portal?.won || p.nightmare?.won || p.tracks?.won)
      .length,
    gyms: Object.values(open.block.areaProgress).reduce((n, p) => n + (p.gymsDefeated?.length ?? 0), 0),
    species: new Set(open.block.pokedex).size,
  }
  return { regions: regionBlocks(s).length, cleared, gyms, species: species.size, world }
}

/**
 * The progress `s` brings against `other`. Its open small world adds to it — a fresh start of its own, so its species
 * add up too — unless `other` is already done with that world: the copy holding it open is then the older one, and the
 * world's Pokémon have gone home in the other.
 */
function progressTuple(s: SaveData, other: SaveData): number[] {
  const t = progressTotals(s)
  const w = t.world && !pastWorld(other, t.world.id) ? t.world : null
  return [t.cleared + (w?.cleared ?? 0), t.gyms + (w?.gyms ?? 0), t.species + (w?.species ?? 0)]
}

/**
 * > 0 when `a` got further than `b`, < 0 when it's behind, 0 when they're level. Level, the copy done with a small
 * world is ahead of one still holding it open: a world only ever goes from open to closed.
 */
export function compareProgress(a: SaveData, b: SaveData): number {
  const x = progressTuple(a, b)
  const y = progressTuple(b, a)
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i]! - y[i]!
  const wa = openWorld(a)
  const wb = openWorld(b)
  if (wa && pastWorld(b, wa.id)) return -1
  if (wb && pastWorld(a, wb.id)) return 1
  return 0
}

export type SyncDecision = 'none' | 'local' | 'cloud'

/** When the player last played the save themselves (`playedAt`); a save from before it, its last change. */
export const playedOf = (s: SaveData): number => s.playedAt ?? s.updatedAt

/**
 * Written by a page from 2026-10-22 on: every commit since stamps `playedAt`. A page left open from before then, resumed
 * on a phone or a PC, reads a save through its own old schema and writes it back without `playedAt` — and without every
 * other part it never knew (raids won, rebattles, small worlds, General upgrades: 46 players, 25–29 Oct 2026).
 */
export const writtenSincePlayedAt = (s: SaveData): boolean => s.playedAt != null

/**
 * The sync, with no question asked: the save further along in its areas wins, then the one with the bigger Pokédex
 * (`compareProgress`). A stamp is easy to move, progress isn't, so progress decides first. Level on both, the one
 * played last: ₽, levels, rematches and upgrades don't count as progress, and keeping this device's own on a tie let
 * an idle device's older save undo all of them on another (players lost their General upgrades and the ₽ spent on
 * them that way, 2026-10-16). Played, not changed: a stale device's own clocks (its offline pay at load) stamp its
 * save "now" before the sync compares, and used to win it the tie that way (2026-10-22). Before that, a copy an old
 * page wrote loses to one this game wrote, however recent its stamp: it is the same save with parts missing.
 */
export function decideSync(local: SaveData | null, cloud: SaveData | null): SyncDecision {
  if (!local && !cloud) return 'none'
  if (!cloud) return 'local'
  if (!local) return 'cloud'
  // An admin edit (e.g. a Pokémon taken away) is applied as is, whatever the progress.
  if (cloud.updatedAt > local.updatedAt && (cloud.adminEditAt ?? 0) > local.updatedAt) return 'cloud'
  const ahead = compareProgress(local, cloud)
  if (ahead !== 0) return ahead > 0 ? 'local' : 'cloud'
  const localKnown = writtenSincePlayedAt(local)
  if (localKnown !== writtenSincePlayedAt(cloud)) return localKnown ? 'local' : 'cloud'
  // Level, but one copy never saw a trade the other did: keeping it would bring back the Pokémon traded away while the
  // other trainer keeps it too (docs/23).
  if (missesTrades(local, cloud)) return 'cloud'
  if (missesTrades(cloud, local)) return 'local'
  return playedOf(cloud) > playedOf(local) ? 'cloud' : 'local'
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
  const strip = ({ playedAt: _, ...s }: SaveData) => canonical({ ...s, updatedAt: 0, lastRegenTick: 0, settings: null })
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
export function pushKey({ playedAt: _, ...s }: SaveData): string {
  // playedAt left out rather than zeroed: a save from before it keeps the key the device already holds.
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
