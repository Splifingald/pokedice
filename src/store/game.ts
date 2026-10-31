// The one zustand store. Slices: content (GameData), save (persistent), run (transient), battle, ui.
import { create } from 'zustand'
import { BUNDLE, withStatics } from '@/config/bundle'
import {
  compileGameData,
  fitDayCare,
  isExtreme,
  migrateLeagueII,
  noShinies,
  raceData,
  runsWon,
  settleRuns,
  migrateRounds,
  monName,
  settleClears,
  payWheelPrize,
  reviveFossils,
  releaseDuplicates,
  releaseRaidLocks,
  releaseWorldHome,
  releaseWorldPending,
  settleKo,
  settleLook,
  stampExtremeUnlock,
  noteShinyDex,
  syncTalents,
  noteUnownDex,
  payUnownDex,
  syncPowers,
  syncEggClocks,
  syncHpScale,
  syncXpCurve,
  type AreaFoe,
  type BattleState,
  type BundleRaw,
  type CatchRoll,
  type CatchTarget,
  type Encounter,
  type ForceKind,
  type GameData,
  type HomerArrival,
  type LogEntry,
  type RunEvent,
  type SaveData,
  type TrickPlaced,
  type TrickState,
  type TrickStep,
} from '@/engine'
import { activeSlot, DEFAULT_SETTINGS, readSave, readSettings, scheduleWrite, writeSettings, type Settings } from '@/save/storage'
import { trustedNow } from './clock'
import { DEFAULT_LANG, setLangInternal, t, type Lang } from '@/i18n'
import { localizeGameData } from '@/i18n/data'
import { money } from '@/lib/format'
import { isAdminEmail } from '@/lib/supabase'
import { restoreSnapshot, snapshotOf } from './resume'

export type ToastTone = 'info' | 'good' | 'bad'
export interface Toast {
  id: number
  text: string
  tone: ToastTone
}

export type RunPhase = 'idle' | 'preview' | 'battle' | 'catch' | 'victory' | 'center' | 'casino' | 'trick' | 'wipe' | 'stalemate'

/** Trick or Treat under way (docs/29): the ghost and its gauge, the last Treat or Trick Ball to play, and the catch. */
export interface TrickRun {
  /** One per encounter: the screen starts afresh for each. */
  id: number
  state: TrickState
  /** The last Treat or Trick Ball, for the screen to play (null before the first). */
  last: TrickStep | null
  /** Caught: where it went (the save has it already). */
  caught: { placed: TrickPlaced; isNew: boolean; replacedLevel?: number; secrets: string[] } | null
}

/** The catch throw after a wild / legendary K.O. `result` is set once the die is thrown. */
export interface CatchState {
  /** A double battle's foe (its battle uid): which of the two waits for the ball (docs/33). */
  uid?: string
  dex: number
  level: number
  shiny?: boolean
  /** It carries its family's hidden talent (docs/51). */
  talent?: boolean
  /** + the catch die: False Swipe on the Pokémon that made the K.O. (docs/51). */
  bonus?: number
  kind: 'wild' | 'boss'
  target: CatchTarget
  /** Capture Luck kept it after a miss and this is the second throw: it won't stay again (docs/25). */
  retried?: boolean
  result: CatchThrow | null
}

/** One throw's outcome, as the catch panel and the stage play it. */
export type CatchThrow = CatchRoll & {
  ballKey: string | null
  events: RunEvent[]
  pendingCatchId: string | null
  /** The ball fell short and this Bait (its key) could still make it: the player is asked first (docs/25). */
  baitOffer?: string | null
  /** The player's answer to the Bait offered: thrown (its die is `bait`) or kept. */
  baited?: 'used' | 'kept'
  /** It broke free but stayed on the spot (Capture Luck): one more throw (docs/25). */
  stays?: boolean
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
  /** After a wild double battle, the other one's throw, waiting for this one's to end (docs/33). */
  catchQueue?: CatchState[]
  /** After a wild double battle, the other catches waiting on "Add to team?", asked after pendingCatchId's (docs/33). */
  catchPending?: string[]
  /** Dev tools: force the next encounter type. */
  forceNext: ForceKind | null
  /** Pickup's find (docs/51): shown as a find of its own before the next card is dealt. */
  pickup?: Extract<Encounter, { kind: 'item' }> | null
  /** An Elite Rebattle gauntlet is being fought: its region and tier (the fights run on its League area). */
  rebattle?: { regionId: string; tier: number } | null
  /** The Pokémon Center's healing has played: back from Home, the Center opens on the team, not on the jingle again. */
  healShown?: boolean
  /** A wipe just ended a portal run (docs/28): how many portals it had closed, lost now (the wipe card says so). */
  portalLost?: number | null
  /**
   * The way in's pop-up has been opened (docs/28): back from the Team screen, it shows again at once over the breach's
   * end, with no breach and no tap to wait for.
   */
  portalPopup?: boolean
  /** A wipe just woke the player from the nightmare (docs/30): the rounds it had won, lost now (the wipe card says so). */
  nightmareLost?: number | null
  /**
   * The nightmare's way in has shown its pop-up (docs/30): back from the Team screen, it shows again at once over the
   * intro's end, with no intro and no tap to wait for (as the Distortion World's portalPopup).
   */
  nightmarePopup?: boolean
  /** Darkrai's strike has landed and its moment is still on the area's page (until CONTINUE: the next round). */
  nightmareStruck?: boolean
  /** Trick or Treat under way (docs/29). */
  trick?: TrickRun | null
  /** The fight is on the screen, the player's side not out yet: one tap on a Pokémon sends it (the rework). */
  pickLead?: boolean
  /**
   * A real player's fight just ended (docs/54): won (the victory card) or lost (the stalemate card, which a loss to
   * them is: no wipe). The result card's SEND FRIEND REQUEST is for `foe`.
   */
  duel?: { outcome: 'won' | 'lost'; foe: AreaFoe } | null
}

export interface BattleSlice {
  state: BattleState
  /** Cumulative log for this battle; the UI animates entries it hasn't played yet. */
  log: LogEntry[]
  /** Increments per battle so the UI can reset its animation cursor. */
  id: number
  /**
   * Picked up from the last visit (store/resume.ts): the screen opens on the fight as it stands, with no entrance and
   * no replay of the log so far.
   */
  resumed?: boolean
  /** The same fight with another lead picked before anything happened: the foe is out already, no entrance again. */
  sendLater?: boolean
}

/** The ways in: Supabase Auth providers the game offers (docs/17). */
export type AuthProvider = 'google' | 'discord'

export interface AuthState {
  status: 'unknown' | 'signed_out' | 'signed_in' | 'unavailable'
  userId: string | null
  email: string | null
  /** The provider's profile picture (Google or Discord), when it gives one. */
  avatarUrl?: string | null
  /** The provider this session signed in with. */
  provider?: AuthProvider | null
  /** Every provider linked to the account: either one signs in to the same save. */
  providers?: AuthProvider[]
}

export interface GameStore {
  data: GameData
  /** The English content `data` was localized from — kept so a language switch can redo it. */
  rawData: GameData
  contentSource: 'bundle' | 'remote'
  /**
   * The content in play is known to be the latest (the database answered the version check, or an admin applied
   * theirs): only then may the game act on what it doesn't hold — a small world gone from the admin's list (docs/21).
   */
  contentChecked: boolean
  /**
   * The content check has come back, whatever it said (newer content in, the same, no answer): until then the game runs
   * on the content bundled with the build, whose admin settings may be out of date (what a pop-up shows waits for it).
   */
  contentAsked: boolean
  save: SaveData | null
  corruptSaveArchived: boolean
  settings: Settings
  run: RunState
  battle: BattleSlice | null
  auth: AuthState
  toasts: Toast[]
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
  rebattle: null,
})

/**
 * Every save that enters the store is brought up to date: HP to the current hpMultiplier (keeps every HP %), XP to the
 * current curve, and one copy per species in the Box (releaseDuplicates). `released` lists the copies let go.
 */
/** An id for a Pokémon joining a Box here (store/run.ts's newId, which can't be imported from this file). */
const raidId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`

/** The main save, read once while the Extreme save is played (switching saves reloads the page). */
let mainSave: SaveData | null | undefined
const mainForLooks = (): SaveData | null => (mainSave === undefined ? (mainSave = readSave('main').save) : mainSave)

function settle(save: SaveData, data: GameData) {
  // Fossils due by now revive first, so they count as the species they are. A save standing in Victory Road II or
  // League II (gone, the Elite Rebattle replaced them) goes back to its League first.
  // An area that waited only on a boss that is now a progression raid (docs/24) is completed.
  const fossils = reviveFossils(settleClears(migrateRounds(migrateLeagueII(inSlot(save)), data), data), data, Date.now())
  // More Day Care residents than slots (the Day Cares became one): the extra ones go home before duplicates are seen.
  // Then the Egg clocks follow who is there: one starts when a pair forms, and resets when its last pair leaves.
  const fitted = syncEggClocks(fitDayCare(fossils.save, data, Date.now()), data, Date.now())
  // Raid catches locked until their area was completed: one completed since joins its region's Box.
  const raids = releaseRaidLocks(fitted, data, Date.now(), raidId)
  // A small world's shiny mythical waiting for its home region (docs/21): that region started since, it joins its Box.
  const worlds = releaseWorldPending(raids.save, data, Date.now(), raidId)
  // A closed world's Pokémon waiting in their home region (docs/26 §1): those whose region now has one at their level
  // arrive in its Box.
  const home = releaseWorldHome(worlds.save, data)
  const dup = releaseDuplicates(syncXpCurve(syncHpScale(home.save, data), data))
  // Extreme mode (docs/22): the main save beat the league that opens it (noted once, so it stays open); an Extreme
  // save's K.O. clocks, on the real time.
  // Its runs (docs/48): a League just won stops its timer; a region from before the runs gets one.
  // No shiny Pokémon in Extreme (docs/48), whatever brought one.
  const ko = settleKo(
    settleRuns(noShinies(stampExtremeUnlock(dup.save, data, Date.now())), data, trustedNow()),
    data,
    trustedNow(),
  )
  // Trainer looks (docs/31): while the switch is on, a look not unlocked comes off. The Extreme save wears the looks
  // the main save has earned.
  const progress = isExtreme(ko.save) ? (mainForLooks() ?? ko.save) : ko.save
  // The battle powers (docs/35): a badge's Mega Gem handed over (one won now, or before the gem rules were on), and the
  // badges that open each power noted for Versus.
  const powers = syncPowers(settleLook(ko.save, progress, data), data)
  // The shiny Pokédex (docs/39): every shiny held is noted under its region, kept when it leaves.
  // Hidden talents (docs/51): a Pokémon that came with its talent unlocks its family; every one of an unlocked family
  // carries it.
  const shinyDex = noteShinyDex(syncTalents(powers.save, data))
  // The Unown Pokédex (docs/41): the letters held noted (a save from before it, a trade), and its prize once complete
  // (a page finished while the switch was off is paid the day it opens).
  const unown = payUnownDex(noteUnownDex(shinyDex), data)
  return {
    ...dup,
    save: unown.save,
    won: runsWon(save, unown.save),
    unownPaid: unown.paid,
    gemsGiven: powers.given,
    revived: fossils.revived,
    raidsReleased: raids.released,
    worldsReleased: worlds.released,
    homeArrived: home.arrived,
    back: ko.back,
  }
}

/**
 * A save is the one of the slot this page plays (docs/22): an import, a backup or a cloud copy on the Extreme slot is
 * the Extreme save, and the other way round, so it's always written and pushed where it belongs.
 */
function inSlot(save: SaveData): SaveData {
  if (activeSlot() === 'extreme') return save.mode === 'extreme' ? save : { ...save, mode: 'extreme' }
  if (save.mode == null) return save
  const { mode: _m, ...main } = save
  return main
}

function boot(): Pick<GameStore, 'data' | 'rawData' | 'save' | 'corruptSaveArchived' | 'settings' | 'run' | 'battle'> {
  const rawData = compileGameData(BUNDLE)
  const { save, corrupt } = readSave()
  // A save carries the language it was last played in; a fresh browser falls back to readSettings' detection.
  const stored = readSettings()
  const settings = save?.settings ? { ...save.settings, lang: save.settings.lang ?? stored.lang } : stored
  setLangInternal(settings.lang ?? DEFAULT_LANG)
  // The Extreme save's page is a race (docs/48): its online features off from the first render.
  const localized = localizeGameData(rawData, settings.lang ?? DEFAULT_LANG)
  const data = activeSlot() === 'extreme' ? raceData(localized) : localized
  if (!save) return { data, rawData, save: null, corruptSaveArchived: corrupt, settings, run: initialRun(), battle: null }
  // Settle the save (HP scale, XP curve, duplicates) before the first render. A Fortune Wheel prize still waiting (the
  // page closed while the wheel turned) is paid now.
  const settled = settle(payWheelPrize(withoutResume(save), data, Date.now(), raidId), data).save
  // Back into the encounter the page was left in, at the point it was left (store/resume.ts).
  const resumed = restoreSnapshot(save.resume, settled, data, initialRun())
  return {
    data,
    rawData,
    save: settled,
    corruptSaveArchived: corrupt,
    settings,
    run: resumed?.run ?? initialRun(),
    battle: resumed?.battle ?? null,
  }
}

/** The encounter under way travels with the stored save only (onDisk), never in the save in play or the cloud's. */
function withoutResume(save: SaveData): SaveData {
  if (!('resume' in save)) return save
  const { resume: _r, ...rest } = save
  return rest
}

/** The save as this device stores it: with the encounter under way, if any, to play on from at the next load. */
function onDisk(save: SaveData | null): SaveData | null {
  if (!save) return null
  const { run, battle } = useGame.getState()
  const resume = snapshotOf(run, battle)
  return resume ? { ...save, resume } : save
}

export const useGame = create<GameStore>()(() => ({
  ...boot(),
  contentSource: 'bundle',
  contentChecked: false,
  contentAsked: false,
  auth: { status: 'unknown', userId: null, email: null },
  toasts: [],
}))

/**
 * Who's playing goes into the game data: an event the admin switched on "for the admin" (to try it in production
 * first) shows only while the admin is signed in. Kept up to date as the sign-in and the content change.
 */
function withViewer(data: GameData, auth: AuthState): GameData {
  const admin = auth.status === 'signed_in' && isAdminEmail(auth.email)
  const viewed = !!data.viewer?.admin === admin ? data : { ...data, viewer: { ...data.viewer, admin } }
  // The Extreme save's page is a race (docs/48): new content or a new language gets its online features off again.
  return activeSlot() === 'extreme' ? raceData(viewed) : viewed
}
// The encounter moves on (a roll, a K.O., the rewards) without the save always changing: stored with it each time, so
// a reload finds it as it stood (onDisk). The write is the save's own debounced one, flushed when the page goes.
useGame.subscribe((s, prev) => {
  if ((s.run !== prev.run || s.battle !== prev.battle) && s.save) scheduleWrite(onDisk(s.save))
})
useGame.subscribe((s, prev) => {
  if (s.auth === prev.auth && s.data === prev.data) return
  const data = withViewer(s.data, s.auth)
  if (data !== s.data) useGame.setState({ data })
})

// ---------------------------------------------------------------- core actions

/**
 * How long a toast stays (docs/15 §7): long enough to read it, 4 s at least, then 70 ms a character over a 1.2 s
 * start; `ms` from a caller only makes it longer. An error stays until the player closes it (null): a toast is often
 * the only word on why something didn't happen.
 */
export function toastMs(text: string, tone: ToastTone = 'info', ms?: number): number | null {
  if (tone === 'bad') return null
  return Math.max(4000, 1200 + 70 * [...text].length, ms ?? 0)
}

let toastSeq = 0
/** Each toast's countdown: what's left, and the timer running it (none while it's held). */
const toastClocks = new Map<number, { left: number; since: number; timer: ReturnType<typeof setTimeout> | null }>()

export function pushToast(text: string, tone: ToastTone = 'info', ms?: number) {
  const id = ++toastSeq
  useGame.setState((s) => {
    const toasts = [...s.toasts, { id, text, tone }]
    // Four at most: the oldest goes, and its countdown with it.
    for (const old of toasts.slice(0, -4)) stopToastClock(old.id)
    return { toasts: toasts.slice(-4) }
  })
  const left = toastMs(text, tone, ms)
  if (left == null) return
  toastClocks.set(id, { left, since: Date.now(), timer: setTimeout(() => dismissToast(id), left) })
}

function stopToastClock(id: number) {
  const clock = toastClocks.get(id)
  if (clock?.timer) clearTimeout(clock.timer)
  toastClocks.delete(id)
}

/** A finger on it, the pointer over it or the focus in it: its countdown waits, and goes on from there once let go. */
export function holdToast(id: number, held: boolean) {
  const clock = toastClocks.get(id)
  if (!clock) return
  if (held && clock.timer) {
    clearTimeout(clock.timer)
    clock.timer = null
    clock.left = Math.max(0, clock.left - (Date.now() - clock.since))
  } else if (!held && !clock.timer) {
    clock.since = Date.now()
    clock.timer = setTimeout(() => dismissToast(id), clock.left)
  }
}

export function dismissToast(id: number) {
  stopToastClock(id)
  useGame.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}

type SaveListener = (save: SaveData | null, prev: SaveData | null) => void
const saveListeners = new Set<SaveListener>()
/** Cloud sync subscribes here so it only sees real player mutations, not cloud pulls. */
export function onSaveCommitted(fn: SaveListener) {
  saveListeners.add(fn)
  return () => saveListeners.delete(fn)
}

/**
 * Every save mutation goes through here: stamps updatedAt, persists (debounced), notifies sync. `auto`: a change the
 * game made on its own (a clock, the offline pay, gifts arriving), not the player — it leaves `playedAt` where it was.
 */
export function commitSave(next: SaveData | null, opts: { silent?: boolean; keepTimestamp?: boolean; auto?: boolean } = {}) {
  const { settings, data, save: prev } = useGame.getState()
  // Whatever arrives here (cloud pull, import, new game) is settled: HP scale, XP curve, one copy per species.
  // A stored copy read back (another tab's) may carry its encounter under way: that one is the other page's, not this one's.
  const settled = next ? settle(withoutResume(next), data) : null
  const scaled = settled?.save ?? null
  const now = Date.now()
  // A save from before playedAt, changed on its own: last played no later than its stamp so far.
  const playedAt = opts.keepTimestamp ? scaled?.playedAt : opts.auto ? (scaled?.playedAt ?? scaled?.updatedAt) : now
  const stamped = scaled
    ? {
        ...scaled,
        settings,
        updatedAt: opts.keepTimestamp ? scaled.updatedAt : now,
        ...(playedAt != null ? { playedAt } : {}),
      }
    : null
  useGame.setState({ save: stamped })
  scheduleWrite(onDisk(stamped))
  if (!opts.silent) for (const fn of saveListeners) fn(stamped, prev)
  for (const p of settled?.revived ?? [])
    pushToast(
      t(p.shiny ? 'ui.toast.revivedFossilShiny' : 'ui.toast.revivedFossil', {
        name: data.species[p.dex]?.name ?? `#${p.dex}`,
      }),
      'good',
      4500,
    )
  for (const g of settled?.gemsGiven ?? [])
    pushToast(t('ui.powers.gemGiven', { leader: g.leader, gem: g.gem.name }), 'good', 5000)
  for (const region of settled?.won ?? [])
    pushToast(t('ui.xrun.wonToast', { region: data.regions.find((r) => r.id === region)?.name ?? region }), 'good', 6000)
  if (settled?.unownPaid) pushToast(t('ui.unown.paidToast', { amount: money(settled.unownPaid) }), 'good', 5000)
  for (const id of settled?.back ?? []) {
    const inst = stamped?.box.find((p) => p.id === id)
    if (inst) pushToast(t('ui.extreme.backToast', { name: data.species[inst.dex]?.name ?? '' }), 'good', 4000)
  }
  for (const p of settled?.released ?? [])
    pushToast(t('ui.toast.releasedWeaker', { name: data.species[p.dex]?.name ?? `#${p.dex}`, level: p.level }), 'info', 4000)
  for (const p of settled?.worldsReleased ?? [])
    pushToast(
      t('ui.world.toastHome', {
        name: data.species[p.dex]?.name ?? `#${p.dex}`,
        region: data.regions.find((r) => r.id === p.region)?.name ?? p.region,
      }),
      'good',
      5000,
    )
  // A closed world's Pokémon unlocked in their region: one toast each, or one per region when several came at once.
  const arrivedIn = new Map<string, HomerArrival[]>()
  for (const a of settled?.homeArrived ?? []) arrivedIn.set(a.region, [...(arrivedIn.get(a.region) ?? []), a])
  for (const [region, list] of arrivedIn) {
    const regionName = data.regions.find((r) => r.id === region)?.name ?? region
    const one = list[0]!
    pushToast(
      list.length === 1
        ? t('ui.world.homeArrived', { name: monName(one.inst, data), level: one.inst.level, region: regionName })
        : t('ui.world.homeArrivedMany', { count: list.length, region: regionName }),
      'good',
      5000,
    )
  }
  for (const p of settled?.raidsReleased ?? [])
    pushToast(
      t('ui.raid.toastUnlocked', {
        name: data.species[p.dex]?.name ?? `#${p.dex}`,
        region: data.regions.find((r) => r.id === p.region)?.name ?? p.region,
      }),
      'good',
      5000,
    )
}

export function mutateSave(fn: (s: SaveData) => SaveData | null | undefined, opts: { auto?: boolean } = {}): boolean {
  const cur = useGame.getState().save
  if (!cur) return false
  const next = fn(cur)
  if (!next) return false
  commitSave(next, opts)
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
  const rawData = compileGameData(withStatics(raw))
  const data = localizeGameData(rawData, useGame.getState().settings.lang ?? DEFAULT_LANG)
  useGame.setState((s) => {
    // A new hpMultiplier keeps every HP % (syncHpScale); an admin may also have removed the area the player was in.
    const save = s.save ? settle(s.save, data).save : null
    const areaOk = !save || data.areas.some((a) => a.id === save.currentAreaId)
    return {
      data,
      rawData,
      contentSource: source,
      // The database's content (or the admin's, applied from Admin) is the latest there is.
      contentChecked: s.contentChecked || source === 'remote',
      save: areaOk || !save ? save : { ...save, currentAreaId: data.areas[0]?.id ?? '' },
      run: s.run.areaId && !data.areas.some((a) => a.id === s.run.areaId) ? initialRun() : s.run,
    }
  })
}

/** A fossil in the Box may be due: settle the save (reviveFossils) — only when one is, to keep saves quiet. */
export function tickFossils(now = Date.now()) {
  const { save } = useGame.getState()
  if (save?.box.some((p) => p.revivesAt != null && p.revivesAt <= now)) commitSave(save, { auto: true })
}
