// localStorage is always written. Everything is wrapped: storage can be full, disabled or throw in private modes.
import type { SaveData } from '@/engine/types'
import { isLang, type Lang } from '@/i18n/langs'
import { detectLang } from '@/i18n'
import { parseSave } from './schema'

export const SAVE_KEY = 'pokedice.save'
export const CORRUPT_KEY = 'pokedice.save.corrupt'
export const SETTINGS_KEY = 'pokedice.settings'
export const BACKUPS_KEY = 'pokedice.save.backups'

/** How much the game animates: every timeline in full, or its short version (lib/motion.ts). */
export type AnimationLevel = 'full' | 'short'
/** Light (Daybreak), dark (Dusk), or whatever the device is set to (src/theme/theme.ts). */
export type ThemeSetting = 'light' | 'dark' | 'auto'

export interface Settings {
  /**
   * Sound before `sound` covered the cries: the 8-bit effects only, off by default. Kept in step with `sound` for a
   * tab still running an older build; nothing reads it any more (`soundOn`).
   */
  sfx: boolean
  /** Sound: the 8-bit effects and the Pokémon cries. Unset = on, so it is on for saves from before it too. */
  sound?: boolean
  /** No animations at all: every timeline jumps to its end. An admin-only switch. */
  reducedMotion: boolean
  /** Full or short animations, the player's choice. Unset = full. */
  animations?: AnimationLevel
  /** Multi EXP — on by default. */
  multiExp: boolean
  /** Auto-mode: fights in cleared areas play themselves — off by default. */
  autoMode?: boolean
  /** Type hints: matchups on a Pokémon's sheet, and on tapping one in battle — off by default. */
  typeHints?: boolean
  /** UI language. Unset on an older save: the browser's language decides, English if we don't speak it. */
  lang?: Lang
  /** Light, dark or the device's. Unset = light. */
  theme?: ThemeSetting
}
export const DEFAULT_SETTINGS: Settings = { sfx: true, sound: true, reducedMotion: false, multiExp: true }

/** Whether the game makes any sound: one switch for the effects and the cries. */
export const soundOn = (s: Pick<Settings, 'sound'>) => s.sound !== false

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
      sfx: soundOn(s),
      sound: soundOn(s),
      reducedMotion: !!s.reducedMotion,
      animations: s.animations === 'short' ? 'short' : 'full',
      multiExp: s.multiExp !== false,
      autoMode: !!s.autoMode,
      typeHints: !!s.typeHints,
      lang: isLang(s.lang) ? s.lang : detectLang(),
      theme: s.theme === 'dark' || s.theme === 'auto' ? s.theme : 'light',
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
