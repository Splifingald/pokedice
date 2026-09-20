// The one zustand store. Slices: content (GameData), save (persistent), run (transient), battle, ui.
import { create } from 'zustand'
import { BUNDLE } from '@/config/bundle'
import {
  compileGameData,
  migrateRounds,
  reviveFossils,
  releaseDuplicates,
  syncHpScale,
  syncXpCurve,
  type BattleState,
  type BundleRaw,
  type CatchRoll,
  type CatchTarget,
  type Encounter,
  type ForceKind,
  type GameData,
  type LogEntry,
  type RunEvent,
  type SaveData,
} from '@/engine'
import { DEFAULT_SETTINGS, readSave, readSettings, scheduleWrite, writeSettings, type Settings } from '@/save/storage'
import { DEFAULT_LANG, setLangInternal, t, type Lang } from '@/i18n'
import { localizeGameData } from '@/i18n/data'

export type ToastTone = 'info' | 'good' | 'bad'
export interface Toast {
  id: number
  text: string
  tone: ToastTone
}

export type RunPhase = 'idle' | 'preview' | 'battle' | 'catch' | 'victory' | 'center' | 'casino' | 'wipe' | 'stalemate'

/** The catch throw after a wild / legendary K.O. `result` is set once the die is thrown. */
export interface CatchState {
  dex: number
  level: number
  shiny?: boolean
  kind: 'wild' | 'boss'
  target: CatchTarget
  result: (CatchRoll & { ballKey: string | null; events: RunEvent[]; pendingCatchId: string | null }) | null
}

export interface RunState {
  /** Area currently being explored; null when on the map. */
  areaId: string | null
  phase: RunPhase
  encounter: Encounter | null
  firstInArea: boolean
  /** Skips spent on the encounter currently being rolled (skipPolicy 'once'). */
  skipsUsed: number
  /** Trainer gauntlet progress. */
  trainer: { index: number; gold: number } | null
  /** Rewards from the last K.O., for the victory screen. */
  events: RunEvent[]
  /** A catch waiting on the "Add to team?" decision. */
  pendingCatchId: string | null
  catch: CatchState | null
  /** Dev tools: force the next encounter type. */
  forceNext: ForceKind | null
}

export interface BattleSlice {
  state: BattleState
  /** Cumulative log for this battle; the UI animates entries it hasn't played yet. */
  log: LogEntry[]
  /** Increments per battle so the UI can reset its animation cursor. */
  id: number
}

export interface AuthState {
  status: 'unknown' | 'signed_out' | 'signed_in' | 'unavailable'
  userId: string | null
  email: string | null
  /** Google profile picture, when the provider gives one. */
  avatarUrl?: string | null
}

export interface GameStore {
  data: GameData
  /** The English content `data` was localized from — kept so a language switch can redo it. */
  rawData: GameData
  contentSource: 'bundle' | 'remote'
  save: SaveData | null
  corruptSaveArchived: boolean
  settings: Settings
  run: RunState
  battle: BattleSlice | null
  auth: AuthState
  toasts: Toast[]
  /** The first cloud sync found two saves and the newer one has less progress: the player picks one. */
  syncConflict: SyncConflict | null
}

export interface SyncConflict {
  local: SaveData
  cloud: SaveData
}

export const initialRun = (): RunState => ({
  areaId: null,
  phase: 'idle',
  encounter: null,
  firstInArea: true,
  skipsUsed: 0,
  trainer: null,
  events: [],
  pendingCatchId: null,
  catch: null,
  forceNext: null,
})

/**
 * Every save that enters the store is brought up to date: HP to the current hpMultiplier (keeps every HP %), XP to the
 * current curve, and one copy per species in the Box (releaseDuplicates). `released` lists the copies let go.
 */
function settle(save: SaveData, data: GameData) {
  // Fossils due by now revive first, so they count as the species they are.
  const fossils = reviveFossils(migrateRounds(save, data), data, Date.now())
  const dup = releaseDuplicates(syncXpCurve(syncHpScale(fossils.save, data), data))
  return { ...dup, revived: fossils.revived }
}

function boot(): Pick<GameStore, 'data' | 'rawData' | 'save' | 'corruptSaveArchived' | 'settings'> {
  const rawData = compileGameData(BUNDLE)
  const { save, corrupt } = readSave()
  // A save carries the language it was last played in; a fresh browser falls back to readSettings' detection.
  const stored = readSettings()
  const settings = save?.settings ? { ...save.settings, lang: save.settings.lang ?? stored.lang } : stored
  setLangInternal(settings.lang ?? DEFAULT_LANG)
  const data = localizeGameData(rawData, settings.lang ?? DEFAULT_LANG)
  if (!save) return { data, rawData, save: null, corruptSaveArchived: corrupt, settings }
  // Settle the save (HP scale, XP curve, duplicates) before the first render.
  return { data, rawData, save: settle(save, data).save, corruptSaveArchived: corrupt, settings }
}

export const useGame = create<GameStore>()(() => ({
  ...boot(),
  contentSource: 'bundle',
  run: initialRun(),
  battle: null,
  auth: { status: 'unknown', userId: null, email: null },
  toasts: [],
  syncConflict: null,
}))

// ---------------------------------------------------------------- core actions

let toastSeq = 0
export function pushToast(text: string, tone: ToastTone = 'info', ms = 3200) {
  const id = ++toastSeq
  useGame.setState((s) => ({ toasts: [...s.toasts, { id, text, tone }].slice(-4) }))
  setTimeout(() => dismissToast(id), ms)
}

export function dismissToast(id: number) {
  useGame.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}

type SaveListener = (save: SaveData | null, prev: SaveData | null) => void
const saveListeners = new Set<SaveListener>()
/** Cloud sync subscribes here so it only sees real player mutations, not cloud pulls. */
export function onSaveCommitted(fn: SaveListener) {
  saveListeners.add(fn)
  return () => saveListeners.delete(fn)
}

/** Every save mutation goes through here: stamps updatedAt, persists (debounced), notifies sync. */
export function commitSave(next: SaveData | null, opts: { silent?: boolean; keepTimestamp?: boolean } = {}) {
  const { settings, data, save: prev } = useGame.getState()
  // Whatever arrives here (cloud pull, import, new game) is settled: HP scale, XP curve, one copy per species.
  const settled = next ? settle(next, data) : null
  const scaled = settled?.save ?? null
  const stamped = scaled ? { ...scaled, settings, updatedAt: opts.keepTimestamp ? scaled.updatedAt : Date.now() } : null
  useGame.setState({ save: stamped })
  scheduleWrite(stamped)
  if (!opts.silent) for (const fn of saveListeners) fn(stamped, prev)
  for (const p of settled?.revived ?? [])
    pushToast(t('ui.toast.revivedFossil', { name: data.species[p.dex]?.name ?? `#${p.dex}` }), 'good', 4500)
  for (const p of settled?.released ?? [])
    pushToast(t('ui.toast.releasedWeaker', { name: data.species[p.dex]?.name ?? `#${p.dex}`, level: p.level }), 'info', 4000)
}

export function mutateSave(fn: (s: SaveData) => SaveData | null | undefined): boolean {
  const cur = useGame.getState().save
  if (!cur) return false
  const next = fn(cur)
  if (!next) return false
  commitSave(next)
  return true
}

export function setSettings(patch: Partial<Settings>) {
  const prev = useGame.getState().settings
  const settings = { ...prev, ...patch }
  useGame.setState({ settings })
  if (settings.lang !== prev.lang) setLanguage(settings.lang ?? DEFAULT_LANG)
  writeSettings(settings)
  const save = useGame.getState().save
  if (save) commitSave({ ...save, settings })
}

export function resetSettings() {
  // The language is the player's, not part of the game settings a reset is for.
  setSettings({ ...DEFAULT_SETTINGS, lang: useGame.getState().settings.lang })
}

/** Re-translates the compiled content in place — every `species.name`, area, item and trainer at once. */
function setLanguage(lang: Lang) {
  setLangInternal(lang)
  useGame.setState((s) => ({ data: localizeGameData(s.rawData, lang) }))
}

/** Hot-swap content (bundle → Supabase, or an admin publish). */
export function setContent(raw: BundleRaw, source: 'bundle' | 'remote') {
  const rawData = compileGameData(raw)
  const data = localizeGameData(rawData, useGame.getState().settings.lang ?? DEFAULT_LANG)
  useGame.setState((s) => {
    // A new hpMultiplier keeps every HP % (syncHpScale); an admin may also have removed the area the player was in.
    const save = s.save ? settle(s.save, data).save : null
    const areaOk = !save || data.areas.some((a) => a.id === save.currentAreaId)
    return {
      data,
      rawData,
      contentSource: source,
      save: areaOk || !save ? save : { ...save, currentAreaId: data.areas[0]?.id ?? '' },
      run: s.run.areaId && !data.areas.some((a) => a.id === s.run.areaId) ? initialRun() : s.run,
    }
  })
}

/** A fossil in the Box may be due: settle the save (reviveFossils) — only when one is, to keep saves quiet. */
export function tickFossils(now = Date.now()) {
  const { save } = useGame.getState()
  if (save?.box.some((p) => p.revivesAt != null && p.revivesAt <= now)) commitSave(save, { keepTimestamp: false })
}
