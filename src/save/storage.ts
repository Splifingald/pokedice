// localStorage is always written. Everything is wrapped: storage can be full, disabled or throw in private modes.
import type { SaveData } from '@/engine/types'
import { isLang, type Lang } from '@/i18n/langs'
import { detectLang } from '@/i18n'
import { parseSave } from './schema'

export const SAVE_KEY = 'pokedice.save'
export const CORRUPT_KEY = 'pokedice.save.corrupt'
export const SETTINGS_KEY = 'pokedice.settings'
export const BACKUPS_KEY = 'pokedice.save.backups'

export interface Settings {
  sfx: boolean
  reducedMotion: boolean
  /** Multi EXP — on by default. */
  multiExp: boolean
  /** Auto-mode: fights in cleared areas play themselves — off by default. */
  autoMode?: boolean
  /** Type hints: matchups on a Pokémon's sheet, and on tapping one in battle — off by default. */
  typeHints?: boolean
  /** UI language. Unset on an older save: the browser's language decides, English if we don't speak it. */
  lang?: Lang
}
export const DEFAULT_SETTINGS: Settings = { sfx: false, reducedMotion: false, multiExp: true }

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export interface ReadResult {
  save: SaveData | null
  /** A save existed but failed validation — it was archived under CORRUPT_KEY. */
  corrupt: boolean
}

export function readSave(): ReadResult {
  const ls = storage()
  const raw = ls?.getItem(SAVE_KEY)
  if (!ls || !raw) return { save: null, corrupt: false }
  try {
    const res = parseSave(JSON.parse(raw))
    if (res.ok) return { save: res.save, corrupt: false }
    console.warn('[save] invalid save, archiving:', res.error)
  } catch (err) {
    console.warn('[save] unreadable save, archiving:', err)
  }
  try {
    ls.setItem(CORRUPT_KEY, raw)
    ls.removeItem(SAVE_KEY)
  } catch {
    /* ignore */
  }
  return { save: null, corrupt: true }
}

export function writeSave(save: SaveData | null) {
  const ls = storage()
  if (!ls) return
  try {
    if (save) ls.setItem(SAVE_KEY, JSON.stringify(save))
    else ls.removeItem(SAVE_KEY)
  } catch (err) {
    console.warn('[save] write failed', err)
  }
}

let pending: SaveData | null | undefined
let timer: ReturnType<typeof setTimeout> | null = null

/** Debounced write (500 ms). */
export function scheduleWrite(save: SaveData | null, delay = 500) {
  pending = save
  if (timer) clearTimeout(timer)
  timer = setTimeout(flushWrite, delay)
}

export function flushWrite() {
  if (timer) clearTimeout(timer)
  timer = null
  if (pending !== undefined) writeSave(pending)
  pending = undefined
}

export function readSettings(): Settings {
  try {
    const raw = storage()?.getItem(SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS, lang: detectLang() }
    const s = JSON.parse(raw) as Partial<Settings>
    return {
      sfx: !!s.sfx,
      reducedMotion: !!s.reducedMotion,
      multiExp: s.multiExp !== false,
      autoMode: !!s.autoMode,
      lang: isLang(s.lang) ? s.lang : detectLang(),
    }
  } catch {
    return { ...DEFAULT_SETTINGS, lang: detectLang() }
  }
}

export function writeSettings(s: Settings) {
  try {
    storage()?.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

export interface SaveBackup {
  at: number
  reason: string
  save: SaveData
}

/** Saves replaced by a sync or a restore on this device, newest first (the last 5) — a wrong choice can be undone. */
export function readBackups(): SaveBackup[] {
  try {
    const raw = storage()?.getItem(BACKUPS_KEY)
    const list = raw ? (JSON.parse(raw) as { at: number; reason: string; save: unknown }[]) : []
    return list.flatMap((b) => {
      const res = parseSave(b.save)
      return res.ok ? [{ at: b.at, reason: b.reason, save: res.save }] : []
    })
  } catch {
    return []
  }
}

export function backupSave(save: SaveData, reason: string) {
  try {
    const list = [{ at: Date.now(), reason, save }, ...readBackups()].slice(0, 5)
    storage()?.setItem(BACKUPS_KEY, JSON.stringify(list))
  } catch (err) {
    console.warn('[save] backup failed', err)
  }
}
