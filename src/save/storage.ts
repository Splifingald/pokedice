// localStorage is always written. Everything is wrapped: storage can be full, disabled or throw in private modes.
import type { SaveData, SaveMode } from '@/engine/types'
import { isLang, type Lang } from '@/i18n/langs'
import { detectLang } from '@/i18n'
import { parseSave } from './schema'

export const SAVE_KEY = 'pokedice.save'
export const CORRUPT_KEY = 'pokedice.save.corrupt'
export const SETTINGS_KEY = 'pokedice.settings'
export const BACKUPS_KEY = 'pokedice.save.backups'
/** Which of the two saves this device plays (docs/22): 'main' (absent) or 'extreme'. */
export const SLOT_KEY = 'pokedice.slot'

/** The main save keeps the keys it always had; the Extreme save has its own beside them. */
const KEYS: Record<SaveMode, { save: string; corrupt: string; backups: string; cloud: string }> = {
  main: { save: SAVE_KEY, corrupt: CORRUPT_KEY, backups: BACKUPS_KEY, cloud: 'pokedice.save.cloud' },
  extreme: {
    save: 'pokedice.save.extreme',
    corrupt: 'pokedice.save.extreme.corrupt',
    backups: 'pokedice.save.extreme.backups',
    cloud: 'pokedice.save.extreme.cloud',
  },
}

/** The save this device plays, as stored. Read once per page: switching reloads the page. */
export function readSlot(): SaveMode {
  try {
    return storage()?.getItem(SLOT_KEY) === 'extreme' ? 'extreme' : 'main'
  } catch {
    return 'main'
  }
}

let slot: SaveMode = readSlot()

/** The save this page plays. */
export const activeSlot = (): SaveMode => slot

/** Where that save is kept on the device. */
export const saveKeyOf = (which: SaveMode = slot): string => KEYS[which].save

/** Play the other save from the next page load on. Any write still waiting for this one goes out first. */
export function writeSlot(next: SaveMode) {
  flushWrite()
  try {
    if (next === 'extreme') storage()?.setItem(SLOT_KEY, 'extreme')
    else storage()?.removeItem(SLOT_KEY)
  } catch {
    /* ignore */
  }
  slot = next
}

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

export function readSave(which: SaveMode = slot): ReadResult {
  const ls = storage()
  const { save: SAVE_KEY, corrupt: CORRUPT_KEY } = KEYS[which]
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

/** Where a save goes: an Extreme save to the Extreme key, any other to the main one; nothing (a delete), the slot's. */
const keyOf = (save: SaveData | null, fallback: SaveMode): SaveMode =>
  save ? (save.mode === 'extreme' ? 'extreme' : 'main') : fallback

export function writeSave(save: SaveData | null, which: SaveMode = keyOf(save, slot)) {
  const ls = storage()
  if (!ls) return
  const key = KEYS[which].save
  try {
    if (save) ls.setItem(key, JSON.stringify(save))
    else ls.removeItem(key)
  } catch (err) {
    console.warn('[save] write failed', err)
  }
}

/** The write waiting, with its key fixed when it was asked for (a slot switch can't send it to the other save). */
let pending: { save: SaveData | null; which: SaveMode } | undefined
let timer: ReturnType<typeof setTimeout> | null = null

/** Debounced write (500 ms). */
export function scheduleWrite(save: SaveData | null, delay = 500) {
  pending = { save, which: keyOf(save, slot) }
  if (timer) clearTimeout(timer)
  timer = setTimeout(flushWrite, delay)
}

export function flushWrite() {
  if (timer) clearTimeout(timer)
  timer = null
  if (pending !== undefined) writeSave(pending.save, pending.which)
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

/**
 * Saves replaced by a sync or a restore on this device, newest first (the last 5) — a wrong choice can be undone.
 * Each save keeps its own: an Extreme backup is never offered to the main save, nor the other way round.
 */
export function readBackups(which: SaveMode = slot): SaveBackup[] {
  try {
    const raw = storage()?.getItem(KEYS[which].backups)
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
  const which: SaveMode = save.mode === 'extreme' ? 'extreme' : 'main'
  try {
    const list = [{ at: Date.now(), reason, save }, ...readBackups(which)].slice(0, 5)
    storage()?.setItem(KEYS[which].backups, JSON.stringify(list))
  } catch (err) {
    console.warn('[save] backup failed', err)
  }
}

/**
 * What this device knows of a save's cloud copy, kept across reloads (src/store/sync.ts): the copy as the device last
 * matched it — its `updated_at` and its pushKey — and when the device last uploaded it.
 */
export interface CloudMark {
  user: string
  /** The row's `updated_at`, in ms; null when it isn't known. */
  at: number | null
  /** pushKey of what the row holds. */
  key: string
  /** When this device last uploaded the save; 0 for never. */
  pushedAt: number
}

export function readCloudMark(which: SaveMode = slot): CloudMark | null {
  try {
    const raw = storage()?.getItem(KEYS[which].cloud)
    const m = raw ? (JSON.parse(raw) as Partial<CloudMark>) : null
    if (!m || typeof m.user !== 'string' || typeof m.key !== 'string') return null
    return {
      user: m.user,
      at: typeof m.at === 'number' ? m.at : null,
      key: m.key,
      pushedAt: typeof m.pushedAt === 'number' ? m.pushedAt : 0,
    }
  } catch {
    return null
  }
}

export function writeCloudMark(which: SaveMode, mark: CloudMark) {
  try {
    storage()?.setItem(KEYS[which].cloud, JSON.stringify(mark))
  } catch {
    /* the next load just reads the cloud copy again */
  }
}

/**
 * What a "delete all my data" leaves on the device: the player's settings (language, theme, sound) and what belongs to
 * the device or the deployment, not to the player (the analytics device id and its daily ping, the sign-in options).
 */
const DEVICE_KEYS = new Set([
  SETTINGS_KEY,
  'pokedice.theme',
  'pokedice.analytics.device',
  'pokedice.analytics.pinged',
  'pokedice.authProviders',
  // The dev server's config override (src/config/bundle.ts): the developer's, not the player's.
  'pokedice.devConfig',
])

/**
 * One save gone from this device: the save, its backups, its archived corrupt copy and what the device knew of its
 * cloud copy (Delete my Extreme save).
 */
export function wipeSlot(which: SaveMode) {
  if (which === slot) {
    if (timer) clearTimeout(timer)
    timer = null
    pending = undefined
  }
  const ls = storage()
  if (!ls) return
  try {
    for (const key of Object.values(KEYS[which])) ls.removeItem(key)
  } catch (err) {
    console.warn('[save] wipe failed', err)
  }
}

/**
 * Every other key the game keeps here: the save and its backups, the archived corrupt one, Pokédex "seen" marks, tips
 * already shown, the friend ID and friend notices. Matched by prefix, so a key added later goes too.
 */
export function wipePlayerData() {
  // A save write still waiting would put the save straight back.
  if (timer) clearTimeout(timer)
  timer = null
  pending = undefined
  const ls = storage()
  if (!ls) return
  try {
    const keys = Array.from({ length: ls.length }, (_, i) => ls.key(i)).filter(
      (k): k is string => !!k && k.startsWith('pokedice.') && !DEVICE_KEYS.has(k),
    )
    for (const k of keys) ls.removeItem(k)
  } catch (err) {
    console.warn('[save] wipe failed', err)
  }
}
