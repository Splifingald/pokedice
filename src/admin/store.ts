// Admin working copy. Edits stay local until "Save changes"; RLS enforces who may write.
import { useMemo } from 'react'
import { create } from 'zustand'
import { BUNDLE } from '@/config/bundle'
import { bundleToRows, PRIMARY_KEYS, rowsToBundle, TABLES, type Row, type TableName, type TableRows } from '@/config/mapping'
import { fetchAllRows } from '@/config/remote'
import { compileGameData, type GameData } from '@/engine'
import type { BundleRaw } from '@/engine/types'
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase'
import { pushToast, setContent } from '@/store/game'
import { downloadText } from './csv'
import { checkRemote, type RemoteCheck } from './remoteCheck'
import { validateRow } from './schemas'

export const rowKey = (t: TableName, r: Row) => PRIMARY_KEYS[t].map((k) => String(r[k] ?? '')).join('|')
const clone = <T,>(x: T): T => structuredClone(x)

export interface AdminState {
  /** 'offline' = no Supabase configured (local dev): edits apply to this session and can be exported. */
  mode: 'remote' | 'offline'
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  rows: TableRows
  base: TableRows
  /** Snapshot of the state before the last save, for one-step undo. */
  undo: TableRows | null
  saving: boolean
}

const initialRows = bundleToRows(BUNDLE)

export const useAdmin = create<AdminState>(() => ({
  mode: isSupabaseConfigured ? 'remote' : 'offline',
  status: 'idle',
  error: null,
  rows: clone(initialRows),
  base: clone(initialRows),
  undo: null,
  saving: false,
}))

const set = useAdmin.setState
const get = useAdmin.getState

export async function loadAdmin(force = false) {
  const s = get()
  if (s.mode === 'offline') {
    set({ status: 'ready' })
    return
  }
  if (s.status === 'loading' || (s.status === 'ready' && !force)) return
  set({ status: 'loading', error: null })
  try {
    const client = await getSupabase()
    if (!client) throw new Error('Supabase client unavailable')
    // Round-trip through the bundle shape to normalise numeric strings and key order.
    const rows = bundleToRows(rowsToBundle(await fetchAllRows(client)))
    set({ status: 'ready', rows: clone(rows), base: clone(rows), undo: null })
    if (!rows.pokemon.length) pushToast('The pokemon table is empty — run supabase/seed.sql first', 'bad', 6000)
  } catch (err) {
    set({ status: 'error', error: err instanceof Error ? err.message : String(err) })
  }
}

export function setTable(t: TableName, rows: Row[]) {
  set((s) => ({ rows: { ...s.rows, [t]: rows } }))
}

export function updateRow(t: TableName, key: string, patch: Row) {
  setTable(
    t,
    get().rows[t].map((r) => (rowKey(t, r) === key ? { ...r, ...patch } : r)),
  )
}

export function addRows(t: TableName, rows: Row[]) {
  setTable(t, [...get().rows[t], ...rows])
}

export function removeRows(t: TableName, keys: string[]) {
  const ks = new Set(keys)
  setTable(
    t,
    get().rows[t].filter((r) => !ks.has(rowKey(t, r))),
  )
}

/** Merge by primary key (CSV import): existing rows replaced, new ones appended. */
export function upsertRows(t: TableName, incoming: Row[]) {
  const map = new Map(get().rows[t].map((r) => [rowKey(t, r), r]))
  for (const r of incoming) map.set(rowKey(t, r), { ...map.get(rowKey(t, r)), ...r })
  setTable(t, [...map.values()])
}

export function discard(t?: TableName) {
  const base = get().base
  set((s) => ({ rows: t ? { ...s.rows, [t]: clone(base[t]) } : clone(base) }))
}

export interface TableDiff {
  upserts: Row[]
  deletes: Row[]
  /** rowKey → changed columns */
  changed: Map<string, Set<string>>
  added: Set<string>
}

export function diffTable(t: TableName, rows: Row[], base: Row[]): TableDiff {
  const baseMap = new Map(base.map((r) => [rowKey(t, r), r]))
  const present = new Set<string>()
  const upserts: Row[] = []
  const changed = new Map<string, Set<string>>()
  const added = new Set<string>()
  for (const r of rows) {
    const k = rowKey(t, r)
    present.add(k)
    const b = baseMap.get(k)
    if (!b) {
      upserts.push(r)
      added.add(k)
      continue
    }
    const cols = new Set<string>()
    for (const c of new Set([...Object.keys(r), ...Object.keys(b)]))
      if (JSON.stringify(r[c]) !== JSON.stringify(b[c])) cols.add(c)
    if (cols.size) {
      upserts.push(r)
      changed.set(k, cols)
    }
  }
  return { upserts, deletes: base.filter((r) => !present.has(rowKey(t, r))), changed, added }
}

export function useTableDiff(t: TableName): TableDiff {
  const rows = useAdmin((s) => s.rows[t])
  const base = useAdmin((s) => s.base[t])
  return useMemo(() => diffTable(t, rows, base), [t, rows, base])
}

export function rowErrors(t: TableName, rows: Row[]): Map<string, Record<string, string>> {
  const out = new Map<string, Record<string, string>>()
  for (const r of rows) {
    const e = validateRow(t, r)
    if (Object.keys(e).length) out.set(rowKey(t, r), e)
  }
  return out
}

export function useDirtyTables(): TableName[] {
  const rows = useAdmin((s) => s.rows)
  const base = useAdmin((s) => s.base)
  return useMemo(
    () =>
      TABLES.filter((t) => {
        const d = diffTable(t, rows[t], base[t])
        return d.upserts.length > 0 || d.deletes.length > 0
      }),
    [rows, base],
  )
}

// FK-safe order: parents before children for upserts, the reverse for deletes.
const ORDER: TableName[] = [
  'dice_types',
  'type_chart',
  'pokemon',
  'trainers',
  'areas',
  // After areas: a region names the area its league is fought in.
  'regions',
  'area_wild_pool',
  'area_trainer_pool',
  'area_loot_pool',
  'combo_upgrades',
  'die_upgrades',
  'items',
  'game_config',
]

export async function saveAll(opts: { silent?: boolean } = {}): Promise<boolean> {
  const s = get()
  const diffs = Object.fromEntries(TABLES.map((t) => [t, diffTable(t, s.rows[t], s.base[t])])) as Record<TableName, TableDiff>
  const dirty = TABLES.filter((t) => diffs[t].upserts.length || diffs[t].deletes.length)
  if (!dirty.length) {
    if (!opts.silent) pushToast('Nothing to save')
    return true
  }
  for (const t of dirty) {
    const errs = rowErrors(t, diffs[t].upserts)
    if (errs.size) {
      pushToast(`${errs.size} invalid row(s) in ${t} — fix the red cells first`, 'bad', 5000)
      return false
    }
  }
  set({ saving: true })
  try {
    if (s.mode === 'remote') {
      const client = await getSupabase()
      if (!client) throw new Error('Supabase unavailable')
      for (const t of [...ORDER].reverse()) {
        for (const r of diffs[t].deletes) {
          const match = Object.fromEntries(PRIMARY_KEYS[t].map((k) => [k, r[k]]))
          const { error } = await client.from(t).delete().match(match)
          if (error) throw new Error(`${t}: ${error.message}`)
        }
      }
      for (const t of ORDER) {
        if (!diffs[t].upserts.length) continue
        const { error } = await client.from(t).upsert(diffs[t].upserts)
        if (error) throw new Error(`${t}: ${error.message}`)
      }
    }
    set({ undo: clone(s.base), base: clone(s.rows), saving: false })
    applyToGame()
    if (!opts.silent)
      pushToast(s.mode === 'remote' ? `Saved ${dirty.length} table(s) to Supabase` : 'Saved (offline: this session only)', 'good')
    return true
  } catch (err) {
    set({ saving: false })
    const msg = err instanceof Error ? err.message : String(err)
    pushToast(`Save failed — ${msg}${/row-level security/i.test(msg) ? ' (are you signed in as the admin?)' : ''}`, 'bad', 7000)
    return false
  }
}

export async function undoLastSave() {
  const u = get().undo
  if (!u) return
  set({ rows: clone(u) })
  const ok = await saveAll({ silent: true })
  if (ok) {
    set({ undo: null })
    pushToast('Last save undone', 'good')
  }
}

/** Bumps game_config.configVersion — what makes every client hot-swap on its next load. */
export async function publish() {
  const cfg = get().rows.game_config
  const cur = Number(cfg.find((r) => r.key === 'configVersion')?.value ?? 0)
  const next = (Number.isFinite(cur) ? cur : 0) + 1
  setTable(
    'game_config',
    cfg.some((r) => r.key === 'configVersion')
      ? cfg.map((r) => (r.key === 'configVersion' ? { ...r, value: next } : r))
      : [...cfg, { key: 'configVersion', value: next }],
  )
  const ok = await saveAll({ silent: true })
  if (ok) pushToast(`Published — content version ${next}. Players get it on their next load.`, 'good', 5000)
}

export function applyToGame() {
  try {
    setContent(rowsToBundle(get().base), get().mode === 'remote' ? 'remote' : 'bundle')
  } catch (err) {
    console.warn('[admin] could not apply content to the game', err)
  }
}

export function exportBundle() {
  downloadText('pokedice-bundle.json', JSON.stringify(rowsToBundle(get().base), null, 1), 'application/json')
  pushToast('Bundle downloaded — run `pnpm import-bundle <file>` and commit', 'info', 5000)
}

/** Dev only: reads Supabase fresh (ignores the working copy) and checks it can safely replace src/data/*.json. */
export async function checkRemoteForPull(): Promise<RemoteCheck> {
  const client = await getSupabase()
  if (!client) throw new Error('Supabase client unavailable')
  return checkRemote(await fetchAllRows(client), BUNDLE)
}

/** Dev only: the Vite dev server writes the bundle to src/data/*.json + supabase/seed.sql, then HMR reloads it. */
export async function writeLocalBundle(bundle: BundleRaw) {
  const res = await fetch('/__dev/write-bundle', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(bundle),
  })
  if (!res.ok) throw new Error((await res.text()) || `Dev server answered ${res.status}`)
}

/** The working copy compiled for previews and the simulator (null while it doesn't compile). */
export function useAdminData(): GameData | null {
  const rows = useAdmin((s) => s.rows)
  return useMemo(() => {
    try {
      return compileGameData(rowsToBundle(rows))
    } catch {
      return null
    }
  }, [rows])
}

export const newUuid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : '00000000-0000-4000-8000-' + Math.floor(Math.random() * 1e12).toString(16).padStart(12, '0')
